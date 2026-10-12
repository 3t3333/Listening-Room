#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs::OpenOptions;
use std::io::Write;
use std::path::PathBuf;

fn resolve_crash_log_path() -> PathBuf {
    #[cfg(windows)]
    {
        if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
            let dir = PathBuf::from(local_app_data).join("com.listeningroom.player").join("logs");
            let _ = std::fs::create_dir_all(&dir);
            return dir.join("crash.log");
        }
    }
    #[cfg(not(windows))]
    {
        if let Ok(home) = std::env::var("HOME") {
            let dir = PathBuf::from(home).join(".local").join("share").join("com.listeningroom.player").join("logs");
            let _ = std::fs::create_dir_all(&dir);
            return dir.join("crash.log");
        }
    }
    PathBuf::from("listening-room-crash.log")
}

#[cfg(windows)]
fn show_fatal_error_dialog(message: &str) {
    use std::os::windows::ffi::OsStrExt;
    let wide_msg: Vec<u16> = std::ffi::OsStr::new(message)
        .encode_wide()
        .chain(Some(0))
        .collect();
    let wide_title: Vec<u16> = std::ffi::OsStr::new("Listening Room - Fatal Error")
        .encode_wide()
        .chain(Some(0))
        .collect();
    unsafe {
        unsafe extern "system" {
            fn MessageBoxW(
                hwnd: *mut std::ffi::c_void,
                lp_text: *const u16,
                lp_caption: *const u16,
                u_type: u32,
            ) -> i32;
        }
        MessageBoxW(
            std::ptr::null_mut(),
            wide_msg.as_ptr(),
            wide_title.as_ptr(),
            0x00000010, // MB_ICONERROR | MB_OK
        );
    }
}

fn install_panic_hook() {
    let default_hook = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |panic_info| {
        let timestamp = {
            use std::time::{SystemTime, UNIX_EPOCH};
            let duration = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default();
            format!("Unix Epoch +{}s", duration.as_secs())
        };

        let payload = if let Some(s) = panic_info.payload().downcast_ref::<&str>() {
            s.to_string()
        } else if let Some(s) = panic_info.payload().downcast_ref::<String>() {
            s.clone()
        } else {
            "Unknown panic payload".to_string()
        };

        let location = if let Some(loc) = panic_info.location() {
            format!("{}:{}:{}", loc.file(), loc.line(), loc.column())
        } else {
            "unknown location".to_string()
        };

        let backtrace = std::backtrace::Backtrace::force_capture();
        let log_path = resolve_crash_log_path();

        let crash_report = format!(
            "====================================================================\n\
             Listening Room Crash Report - {}\n\
             Location: {}\n\
             Error: {}\n\
             Backtrace:\n{}\n\
             ====================================================================\n\n",
            timestamp, location, payload, backtrace
        );

        if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(&log_path) {
            let _ = file.write_all(crash_report.as_bytes());
        }

        // Transmit crash report immediately to Cloudflare Worker proxy in real-time
        if let Some(proxy_url) = listening_room_lib::diagnostics::resolve_proxy_url(None) {
            let is_test_crash = payload.to_lowercase().contains("test crash");
            let diag_payload = listening_room_lib::diagnostics::DiagnosticPayload {
                source: if is_test_crash { "test-crash".to_string() } else { "rust-panic".to_string() },
                version: env!("CARGO_PKG_VERSION").to_string(),
                platform: std::env::consts::OS.to_string(),
                arch: std::env::consts::ARCH.to_string(),
                os_version: Some(format!("{} ({})", std::env::consts::OS, std::env::consts::ARCH)),
                error_message: listening_room_lib::diagnostics::sanitize_text(&payload),
                error_location: Some(listening_room_lib::diagnostics::sanitize_text(&location)),
                stack_trace: Some(listening_room_lib::diagnostics::sanitize_text(&format!("{backtrace}"))),
                user_note: Some("Real-time fatal crash report dispatched immediately from panic hook.".to_string()),
                timestamp: timestamp.clone(),
            };

            if let Ok(client) = reqwest::blocking::Client::builder()
                .timeout(std::time::Duration::from_secs(4))
                .build()
            {
                let _ = client
                    .post(&proxy_url)
                    .header("Content-Type", "application/json")
                    .header("X-App-Version", env!("CARGO_PKG_VERSION"))
                    .header("X-Report-Source", if is_test_crash { "test-crash" } else { "rust-panic" })
                    .json(&diag_payload)
                    .send();
            }
        }

        #[cfg(windows)]
        {
            let user_message = format!(
                "Listening Room encountered an unexpected critical error and had to close.\n\n\
                 Error: {}\n\
                 Location: {}\n\n\
                 Crash details have been saved to:\n{}",
                payload,
                location,
                log_path.display()
            );
            show_fatal_error_dialog(&user_message);
        }

        default_hook(panic_info);
    }));
}

fn main() {
    install_panic_hook();

    #[cfg(target_os = "linux")]
    {
        // Suppress ALSA's C-library stderr noise when probing non-existent audio devices (pipewire, oss, jack)
        type AlsaErrorHandler = extern "C" fn(
            *const std::os::raw::c_char,
            std::os::raw::c_int,
            *const std::os::raw::c_char,
            std::os::raw::c_int,
            *const std::os::raw::c_char,
        );
        unsafe extern "C" {
            fn snd_lib_error_set_handler(handler: Option<AlsaErrorHandler>) -> std::os::raw::c_int;
        }
        unsafe {
            let _ = snd_lib_error_set_handler(None);
        }
    }

    listening_room_lib::run();
}


