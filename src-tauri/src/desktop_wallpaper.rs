use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{AppHandle, Manager, WebviewWindow};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MonitorInfo {
    pub id: usize,
    pub name: String,
    pub width: u32,
    pub height: u32,
    pub x: i32,
    pub y: i32,
    pub scale_factor: f64,
    pub is_primary: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DesktopModeStatus {
    pub enabled: bool,
    pub mode: String, // "interactive" (HWND_BOTTOM) or "wallpaper" (WorkerW)
    pub monitor_id: Option<usize>,
}

#[derive(Debug, Clone, Default)]
struct SavedWindowState {
    is_saved: bool,
    x: i32,
    y: i32,
    width: u32,
    height: u32,
    #[cfg(target_os = "windows")]
    style: isize,
    #[cfg(target_os = "windows")]
    ex_style: isize,
}

pub struct DesktopWallpaperManager {
    status: Mutex<DesktopModeStatus>,
    saved_state: Mutex<SavedWindowState>,
}

impl DesktopWallpaperManager {
    pub fn new() -> Self {
        Self {
            status: Mutex::new(DesktopModeStatus {
                enabled: false,
                mode: "interactive".to_string(),
                monitor_id: None,
            }),
            saved_state: Mutex::new(SavedWindowState::default()),
        }
    }
}

#[tauri::command]
pub async fn get_available_monitors(app: AppHandle) -> Result<Vec<MonitorInfo>, String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "Main window not found".to_string())?;

    let monitors = window.available_monitors().map_err(|e| e.to_string())?;
    let primary = window.primary_monitor().ok().flatten();

    let list = monitors
        .into_iter()
        .enumerate()
        .map(|(idx, m)| {
            let is_primary = primary
                .as_ref()
                .map(|p| p.position() == m.position() && p.size() == m.size())
                .unwrap_or(idx == 0);

            MonitorInfo {
                id: idx,
                name: m.name().cloned().unwrap_or_else(|| format!("Display {}", idx + 1)),
                width: m.size().width,
                height: m.size().height,
                x: m.position().x,
                y: m.position().y,
                scale_factor: m.scale_factor(),
                is_primary,
            }
        })
        .collect();

    Ok(list)
}

#[tauri::command]
pub async fn get_desktop_mode_status(
    manager: tauri::State<'_, DesktopWallpaperManager>,
) -> Result<DesktopModeStatus, String> {
    let status = manager.status.lock().unwrap();
    Ok(status.clone())
}

#[cfg(target_os = "windows")]
mod windows_impl {
    use super::*;
    use windows_sys::Win32::Foundation::{HWND, LPARAM, LRESULT, WPARAM};
    use windows_sys::Win32::Graphics::Gdi::UpdateWindow;
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        CallWindowProcW, DefWindowProcW, GetWindowLongPtrW, SetParent, SetWindowLongPtrW,
        SetWindowPos, ShowWindow, GWLP_WNDPROC, GWL_EXSTYLE, GWL_STYLE, HWND_BOTTOM,
        HWND_NOTOPMOST, SC_MINIMIZE, SWP_FRAMECHANGED, SWP_HIDEWINDOW,
        SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, SWP_SHOWWINDOW, SW_SHOW,
        WINDOWPOS, WM_DISPLAYCHANGE, WM_SHOWWINDOW, WM_SYSCOMMAND, WM_WINDOWPOSCHANGING,
        WNDPROC, WS_CAPTION, WS_CHILD, WS_EX_APPWINDOW, WS_EX_TOOLWINDOW, WS_MAXIMIZEBOX,
        WS_MINIMIZEBOX, WS_POPUP, WS_SYSMENU, WS_THICKFRAME,
    };

    static PREV_WNDPROC: std::sync::atomic::AtomicIsize = std::sync::atomic::AtomicIsize::new(0);
    static ACTIVE_HWND: std::sync::atomic::AtomicIsize = std::sync::atomic::AtomicIsize::new(0);
    static TARGET_MONITOR_INDEX: std::sync::atomic::AtomicIsize = std::sync::atomic::AtomicIsize::new(-1);
    static IS_WALLPAPER_MODE: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

    /// Attaches the Win32 window message subclass for HWND_BOTTOM interactive mode
    pub unsafe fn hook_subclass(hwnd: HWND) {
        ACTIVE_HWND.store(hwnd as isize, std::sync::atomic::Ordering::SeqCst);
        let current_prev = PREV_WNDPROC.load(std::sync::atomic::Ordering::SeqCst);
        if current_prev == 0 {
            let prev = unsafe {
                SetWindowLongPtrW(
                    hwnd,
                    GWLP_WNDPROC,
                    desktop_subclass_proc as *const () as usize as isize,
                )
            };
            PREV_WNDPROC.store(prev, std::sync::atomic::Ordering::SeqCst);
            eprintln!("[DesktopWallpaper] Attached Win32 message subclass (prev wndproc: {:#x})", prev);
        }
    }

    /// Detaches the Win32 window message subclass and restores original wndproc
    pub unsafe fn unhook_subclass(hwnd: HWND) {
        let prev = PREV_WNDPROC.swap(0, std::sync::atomic::Ordering::SeqCst);
        if prev != 0 {
            unsafe {
                SetWindowLongPtrW(hwnd, GWLP_WNDPROC, prev);
            }
            eprintln!("[DesktopWallpaper] Detached Win32 message subclass (restored wndproc: {:#x})", prev);
        }
        ACTIVE_HWND.store(0, std::sync::atomic::Ordering::SeqCst);
    }

    /// Window subclass procedure that shields Listening Room from Win + D (Show Desktop)
    unsafe extern "system" fn desktop_subclass_proc(
        hwnd: HWND,
        msg: u32,
        wparam: WPARAM,
        lparam: LPARAM,
    ) -> LRESULT {
        let prev_proc = PREV_WNDPROC.load(std::sync::atomic::Ordering::SeqCst);
        let prev_wndproc: WNDPROC = if prev_proc != 0 {
            unsafe { std::mem::transmute(prev_proc as *const ()) }
        } else {
            None
        };

        match msg {
            WM_WINDOWPOSCHANGING => {
                // Explorer / Win+D attempts to apply SWP_HIDEWINDOW to all desktop windows,
                // or displace them off-screen to x = -32000.
                // We strip these flags and enforce HWND_BOTTOM to keep Listening Room pinned behind apps.
                if lparam != 0 {
                    unsafe {
                        let pos = &mut *(lparam as *mut WINDOWPOS);
                        pos.flags &= !SWP_HIDEWINDOW;
                        if pos.x == -32000 {
                            pos.flags |= SWP_NOMOVE | SWP_NOSIZE;
                        }
                        if !IS_WALLPAPER_MODE.load(std::sync::atomic::Ordering::Relaxed) {
                            pos.hwndInsertAfter = HWND_BOTTOM;
                        }
                    }
                }
            }
            WM_SHOWWINDOW => {
                // When wParam is 0 (FALSE), Windows or Explorer is asking the window to hide (e.g. Win + D).
                // Block this request to ensure Win + D never causes Listening Room to vanish.
                if wparam == 0 {
                    return 0;
                }
            }
            WM_SYSCOMMAND => {
                // Intercept and swallow minimize commands from keyboard or taskbar
                let cmd = (wparam & 0xFFF0) as u32;
                if cmd == SC_MINIMIZE {
                    return 0;
                }
            }
            WM_DISPLAYCHANGE => {
                // Monitor resolution changed! If target is primary monitor, immediately adapt bounds
                let new_w = (lparam & 0xFFFF) as i32;
                let new_h = ((lparam >> 16) & 0xFFFF) as i32;
                let mon_idx = TARGET_MONITOR_INDEX.load(std::sync::atomic::Ordering::Relaxed);
                if mon_idx == -1 && !IS_WALLPAPER_MODE.load(std::sync::atomic::Ordering::Relaxed) {
                    unsafe {
                        SetWindowPos(
                            hwnd,
                            HWND_BOTTOM,
                            0,
                            0,
                            new_w,
                            new_h,
                            SWP_NOACTIVATE | SWP_FRAMECHANGED | SWP_SHOWWINDOW,
                        );
                        ShowWindow(hwnd, SW_SHOW);
                        UpdateWindow(hwnd);
                    }
                }
            }
            _ => {}
        }

        unsafe {
            if let Some(prev) = prev_wndproc {
                CallWindowProcW(Some(prev), hwnd, msg, wparam, lparam)
            } else {
                DefWindowProcW(hwnd, msg, wparam, lparam)
            }
        }
    }

    pub fn enable_windows_desktop_mode(
        app: &AppHandle,
        window: &WebviewWindow,
        mode: &str,
        monitor_index: Option<usize>,
        saved_state: &mut SavedWindowState,
    ) -> Result<(), String> {
        let hwnd_raw = window.hwnd().map_err(|e| e.to_string())?;
        let hwnd = hwnd_raw.0 as HWND;

        // Save current window geometry and styles before altering
        if !saved_state.is_saved {
            if let Ok(pos) = window.outer_position() {
                saved_state.x = pos.x;
                saved_state.y = pos.y;
            }
            if let Ok(size) = window.outer_size() {
                saved_state.width = size.width;
                saved_state.height = size.height;
            }
            unsafe {
                saved_state.style = GetWindowLongPtrW(hwnd, GWL_STYLE);
                saved_state.ex_style = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
            }
            saved_state.is_saved = true;
        }

        // Determine target monitor bounds and display name
        let monitors = window.available_monitors().map_err(|e| e.to_string())?;
        let target_monitor = if let Some(idx) = monitor_index {
            monitors.get(idx).cloned()
        } else {
            window.primary_monitor().ok().flatten().or_else(|| monitors.first().cloned())
        };

        let (target_x, target_y, target_w, target_h, target_name) = if let Some(ref m) = target_monitor {
            (
                m.position().x,
                m.position().y,
                m.size().width as i32,
                m.size().height as i32,
                m.name().cloned(),
            )
        } else {
            (0, 0, 1920, 1080, None)
        };

        TARGET_MONITOR_INDEX.store(
            monitor_index.map(|i| i as isize).unwrap_or(-1),
            std::sync::atomic::Ordering::SeqCst,
        );

        // Crucial: Strip decorations, disable resize handles, set full monitor size via Tauri first
        let _ = window.set_decorations(false);
        let _ = window.set_resizable(false);
        let _ = window.set_position(tauri::Position::Physical(tauri::PhysicalPosition { x: target_x, y: target_y }));
        let _ = window.set_size(tauri::Size::Physical(tauri::PhysicalSize { width: target_w as u32, height: target_h as u32 }));
        let _ = window.set_skip_taskbar(true);

        if mode == "wallpaper" {
            // --- MODE 1: TRUE DESKTOP (WorkerW via tauri-plugin-wallpaper) ---
            unsafe {
                unhook_subclass(hwnd);
            }

            use tauri_plugin_wallpaper::{AttachRequest, WallpaperExt};
            let mut req = AttachRequest::new(window.label()).with_input_forwarding(true, true);
            if let Some(ref name) = target_name {
                req = req.with_monitor(name);
            }

            match app.wallpaper().attach(req) {
                Ok(_) => {
                    IS_WALLPAPER_MODE.store(true, std::sync::atomic::Ordering::SeqCst);
                    log::info!("[DesktopWallpaper] Successfully attached to WorkerW via tauri-plugin-wallpaper");
                }
                Err(e) => {
                    log::warn!("[DesktopWallpaper] WorkerW attach failed ({e}), falling back to Interactive HWND_BOTTOM mode");
                    IS_WALLPAPER_MODE.store(false, std::sync::atomic::Ordering::SeqCst);
                    unsafe {
                        enable_interactive_mode(hwnd, target_x, target_y, target_w, target_h)?;
                    }
                }
            }
        } else {
            // --- MODE 2: INTERACTIVE DESKTOP (HWND_BOTTOM + Subclassing) ---
            use tauri_plugin_wallpaper::{DetachRequest, WallpaperExt};
            let _ = app.wallpaper().detach(DetachRequest::new(window.label()));

            IS_WALLPAPER_MODE.store(false, std::sync::atomic::Ordering::SeqCst);
            unsafe {
                enable_interactive_mode(hwnd, target_x, target_y, target_w, target_h)?;
            }
        }

        let _ = window.show();
        Ok(())
    }

    pub unsafe fn enable_interactive_mode(
        hwnd: HWND,
        target_x: i32,
        target_y: i32,
        target_w: i32,
        target_h: i32,
    ) -> Result<(), String> {
        unsafe {
            // Ensure detached from any parent window
            SetParent(hwnd, std::ptr::null_mut());

            // Style as borderless popup
            let current_style = GetWindowLongPtrW(hwnd, GWL_STYLE);
            let new_style = (current_style
                & !(WS_CHILD | WS_CAPTION | WS_THICKFRAME | WS_MINIMIZEBOX | WS_MAXIMIZEBOX | WS_SYSMENU) as isize)
                | (WS_POPUP as isize);
            SetWindowLongPtrW(hwnd, GWL_STYLE, new_style);

            let current_ex = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
            let new_ex = (current_ex & !(WS_EX_APPWINDOW as isize)) | (WS_EX_TOOLWINDOW as isize);
            SetWindowLongPtrW(hwnd, GWL_EXSTYLE, new_ex);

            // Position at bottom of desktop stack covering 100% of the display
            SetWindowPos(
                hwnd,
                HWND_BOTTOM,
                target_x,
                target_y,
                target_w,
                target_h,
                SWP_NOACTIVATE | SWP_FRAMECHANGED | SWP_SHOWWINDOW,
            );

            // Subclass window to intercept WM_WINDOWPOSCHANGING / WM_SHOWWINDOW / WM_SYSCOMMAND
            hook_subclass(hwnd);
        }

        Ok(())
    }

    pub fn disable_windows_desktop_mode(
        app: &AppHandle,
        window: &WebviewWindow,
        saved_state: &mut SavedWindowState,
    ) -> Result<(), String> {
        let hwnd_raw = window.hwnd().map_err(|e| e.to_string())?;
        let hwnd = hwnd_raw.0 as HWND;

        unsafe {
            // 1. Remove Win32 subclass
            unhook_subclass(hwnd);
        }

        // 2. Detach from WorkerW via tauri-plugin-wallpaper
        use tauri_plugin_wallpaper::{DetachRequest, WallpaperExt};
        let _ = app.wallpaper().detach(DetachRequest::new(window.label()));

        unsafe {
            SetParent(hwnd, std::ptr::null_mut());
        }

        // 3. Restore decorations and resizability via Tauri API
        let _ = window.set_decorations(true);
        let _ = window.set_resizable(true);

        // 4. Restore original styles and position
        if saved_state.is_saved {
            let restore_x = saved_state.x;
            let restore_y = saved_state.y;
            let restore_w = saved_state.width;
            let restore_h = saved_state.height;

            let _ = window.set_position(tauri::Position::Physical(tauri::PhysicalPosition { x: restore_x, y: restore_y }));
            let _ = window.set_size(tauri::Size::Physical(tauri::PhysicalSize { width: restore_w, height: restore_h }));

            unsafe {
                SetWindowLongPtrW(hwnd, GWL_STYLE, saved_state.style);
                SetWindowLongPtrW(hwnd, GWL_EXSTYLE, saved_state.ex_style);
                SetWindowPos(
                    hwnd,
                    HWND_NOTOPMOST,
                    restore_x,
                    restore_y,
                    restore_w as i32,
                    restore_h as i32,
                    SWP_FRAMECHANGED | SWP_SHOWWINDOW,
                );
            }
            saved_state.is_saved = false;
        } else {
            let _ = window.set_position(tauri::Position::Physical(tauri::PhysicalPosition { x: 100, y: 100 }));
            let _ = window.set_size(tauri::Size::Physical(tauri::PhysicalSize { width: 1280, height: 820 }));
            unsafe {
                SetWindowPos(
                    hwnd,
                    HWND_NOTOPMOST,
                    100,
                    100,
                    1280,
                    820,
                    SWP_FRAMECHANGED | SWP_SHOWWINDOW,
                );
            }
        }

        let _ = window.set_skip_taskbar(false);
        let _ = window.show();
        let _ = window.set_focus();

        Ok(())
    }

    /// Dynamic repositioning on display or DPI change
    pub fn reposition_window(
        app: &AppHandle,
        window: &WebviewWindow,
        mode: &str,
        monitor_index: Option<usize>,
    ) -> Result<(), String> {
        let hwnd_raw = window.hwnd().map_err(|e| e.to_string())?;
        let hwnd = hwnd_raw.0 as HWND;

        let monitors = window.available_monitors().map_err(|e| e.to_string())?;
        let target_monitor = if let Some(idx) = monitor_index {
            monitors.get(idx).cloned()
        } else {
            window.primary_monitor().ok().flatten().or_else(|| monitors.first().cloned())
        };

        let (target_x, target_y, target_w, target_h, target_name) = if let Some(ref m) = target_monitor {
            (
                m.position().x,
                m.position().y,
                m.size().width as i32,
                m.size().height as i32,
                m.name().cloned(),
            )
        } else {
            (0, 0, 1920, 1080, None)
        };

        TARGET_MONITOR_INDEX.store(
            monitor_index.map(|i| i as isize).unwrap_or(-1),
            std::sync::atomic::Ordering::SeqCst,
        );

        let _ = window.set_decorations(false);
        let _ = window.set_resizable(false);
        let _ = window.set_position(tauri::Position::Physical(tauri::PhysicalPosition { x: target_x, y: target_y }));
        let _ = window.set_size(tauri::Size::Physical(tauri::PhysicalSize { width: target_w as u32, height: target_h as u32 }));

        if mode == "wallpaper" {
            use tauri_plugin_wallpaper::{AttachRequest, DetachRequest, WallpaperExt};
            let _ = app.wallpaper().detach(DetachRequest::new(window.label()));
            let mut req = AttachRequest::new(window.label()).with_input_forwarding(true, true);
            if let Some(ref name) = target_name {
                req = req.with_monitor(name);
            }
            let _ = app.wallpaper().attach(req);
        } else {
            unsafe {
                SetWindowPos(
                    hwnd,
                    HWND_BOTTOM,
                    target_x,
                    target_y,
                    target_w,
                    target_h,
                    SWP_NOACTIVATE | SWP_FRAMECHANGED | SWP_SHOWWINDOW,
                );
            }
        }

        Ok(())
    }

    /// Keep HWND_BOTTOM pinned periodically if in interactive mode
    pub fn ensure_hwnd_bottom(window: &WebviewWindow) {
        if !IS_WALLPAPER_MODE.load(std::sync::atomic::Ordering::Relaxed) {
            if let Ok(hwnd_raw) = window.hwnd() {
                let hwnd = hwnd_raw.0 as HWND;
                unsafe {
                    SetWindowPos(
                        hwnd,
                        HWND_BOTTOM,
                        0,
                        0,
                        0,
                        0,
                        SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
                    );
                }
            }
        }
    }
}

#[tauri::command]
pub async fn set_desktop_mode(
    app: AppHandle,
    manager: tauri::State<'_, DesktopWallpaperManager>,
    enabled: bool,
    mode: Option<String>,
    monitor_index: Option<usize>,
) -> Result<DesktopModeStatus, String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "Main window not found".to_string())?;

    let selected_mode = mode.unwrap_or_else(|| "interactive".to_string());

    #[cfg(target_os = "windows")]
    {
        let mut saved = manager.saved_state.lock().unwrap();
        if enabled {
            windows_impl::enable_windows_desktop_mode(
                &app,
                &window,
                &selected_mode,
                monitor_index,
                &mut *saved,
            )?;
        } else {
            windows_impl::disable_windows_desktop_mode(&app, &window, &mut *saved)?;
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        use tauri_plugin_wallpaper::{AttachRequest, DetachRequest, WallpaperExt};
        if enabled {
            let _ = window.set_decorations(false);
            let _ = window.set_fullscreen(true);
            let req = AttachRequest::new(window.label());
            let _ = app.wallpaper().attach(req);
        } else {
            let _ = app.wallpaper().detach(DetachRequest::new(window.label()));
            let _ = window.set_fullscreen(false);
            let _ = window.set_decorations(true);
        }
    }

    let mut status = manager.status.lock().unwrap();
    status.enabled = enabled;
    status.mode = selected_mode;
    status.monitor_id = monitor_index;

    Ok(status.clone())
}

#[tauri::command]
pub async fn reposition_desktop_mode(
    app: AppHandle,
    manager: tauri::State<'_, DesktopWallpaperManager>,
) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "Main window not found".to_string())?;

    let status = manager.status.lock().unwrap().clone();
    if !status.enabled {
        return Ok(());
    }

    #[cfg(target_os = "windows")]
    {
        windows_impl::reposition_window(&app, &window, &status.mode, status.monitor_id)?;
    }

    Ok(())
}

#[tauri::command]
pub async fn pin_desktop_bottom(app: AppHandle) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        if let Some(window) = app.get_webview_window("main") {
            windows_impl::ensure_hwnd_bottom(&window);
        }
    }
    Ok(())
}

