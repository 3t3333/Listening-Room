use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager,
};

pub fn setup_tray(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let now_playing_item = MenuItemBuilder::with_id("now_playing", "Listening Room - Idle")
        .enabled(false)
        .build(app)?;

    let play_pause_item = MenuItemBuilder::with_id("play_pause", "Play / Pause").build(app)?;
    let next_item = MenuItemBuilder::with_id("next", "Next Track").build(app)?;
    let prev_item = MenuItemBuilder::with_id("prev", "Previous Track").build(app)?;

    let toggle_desktop_item = MenuItemBuilder::with_id("toggle_desktop", "Toggle Desktop Wallpaper").build(app)?;
    let show_hide_item = MenuItemBuilder::with_id("show_hide", "Show Window").build(app)?;
    let quit_item = MenuItemBuilder::with_id("quit", "Quit Listening Room").build(app)?;

    let menu = MenuBuilder::new(app)
        .item(&now_playing_item)
        .separator()
        .item(&play_pause_item)
        .item(&next_item)
        .item(&prev_item)
        .separator()
        .item(&toggle_desktop_item)
        .item(&show_hide_item)
        .separator()
        .item(&quit_item)
        .build()?;

    // Use default window icon for tray
    let icon = app.default_window_icon().cloned().ok_or("Failed to get app icon")?;

    let tray = TrayIconBuilder::new()
        .icon(icon)
        .tooltip("Listening Room")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(move |app, event| {
            let id = event.id().as_ref();
            match id {
                "play_pause" => {
                    let _ = app.emit("tray-play-pause", ());
                }
                "next" => {
                    let _ = app.emit("tray-next", ());
                }
                "prev" => {
                    let _ = app.emit("tray-prev", ());
                }
                "toggle_desktop" => {
                    let _ = app.emit("tray-toggle-desktop", ());
                }
                "show_hide" => {
                    if let Some(window) = app.get_webview_window("main") {
                        if window.is_visible().unwrap_or(false) {
                            let _ = window.hide();
                        } else {
                            let _ = window.show();
                            let _ = window.unminimize();
                            let _ = window.set_focus();
                        }
                    }
                }
                "quit" => {
                    std::process::exit(0);
                }
                _ => {}
            }
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(window) = app.get_webview_window("main") {
                    if window.is_visible().unwrap_or(false) {
                        let _ = window.set_focus();
                    } else {
                        let _ = window.show();
                        let _ = window.unminimize();
                        let _ = window.set_focus();
                    }
                }
            }
        })
        .build(app)?;

    // Store tray reference in app state if needed
    app.manage(tray);

    Ok(())
}
