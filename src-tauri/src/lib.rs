mod audio;
pub mod desktop_wallpaper;
pub mod diagnostics;
#[cfg(feature = "legacy-web-api")]
mod legacy_web_api;
mod models;
mod player;
pub mod tray;

use models::{PlaybackState, Track, AlbumImport};
use player::{AudioOutputState, PlayerService};
use tauri::{Emitter, Manager, State};

#[tauri::command]
async fn connect_spotify(service: State<'_, PlayerService>) -> Result<(), String> {
    service.connect().await
}

#[tauri::command]
async fn get_playback_state(service: State<'_, PlayerService>) -> Result<PlaybackState, String> {
    Ok(service.playback())
}

#[tauri::command]
async fn get_queue(service: State<'_, PlayerService>) -> Result<Vec<Track>, String> {
    service.queue().await
}

#[tauri::command]
async fn get_album_tracks(url: String, service: State<'_, PlayerService>) -> Result<AlbumImport, String> {
    service.fetch_album(&url).await
}

#[tauri::command]
async fn play(service: State<'_, PlayerService>) -> Result<(), String> {
    service.play().await
}

#[tauri::command]
async fn pause(service: State<'_, PlayerService>) -> Result<(), String> {
    service.pause().await
}

#[tauri::command]
async fn next(service: State<'_, PlayerService>) -> Result<(), String> {
    service.next().await
}

#[tauri::command]
async fn previous(service: State<'_, PlayerService>) -> Result<(), String> {
    service.previous().await
}

#[tauri::command]
async fn play_collection(
    uris: Vec<String>,
    start_uri: String,
    service: State<'_, PlayerService>,
) -> Result<(), String> {
    service.play_collection(&uris, &start_uri).await
}

#[tauri::command]
async fn queue_uri(uri: String, service: State<'_, PlayerService>) -> Result<(), String> {
    service.queue_uri(&uri).await
}

#[tauri::command]
async fn set_volume(volume: u8, service: State<'_, PlayerService>) -> Result<(), String> {
    service.set_volume(volume).await
}

#[tauri::command]
async fn get_audio_outputs(service: State<'_, PlayerService>) -> Result<AudioOutputState, String> {
    service.audio_outputs()
}

#[tauri::command]
async fn set_audio_output(
    output: Option<String>,
    service: State<'_, PlayerService>,
) -> Result<(), String> {
    service.set_audio_output(output).await
}

#[tauri::command]
async fn restart_daemon(service: State<'_, PlayerService>) -> Result<(), String> {
    service.restart().await
}

#[tauri::command]
async fn download_image(url: String) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;

    let response = client
        .get(&url)
        .header("User-Agent", "ListeningRoom/0.2.3")
        .send()
        .await
        .map_err(|e| format!("Failed to fetch image: {e}"))?;

    if !response.status().is_success() {
        return Err(format!("Server returned HTTP {}", response.status()));
    }

    let content_type = response
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("image/jpeg")
        .to_string();

    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("Failed to read image bytes: {e}"))?;

    use base64::engine::general_purpose::STANDARD;
    use base64::Engine;
    let b64 = STANDARD.encode(&bytes);

    Ok(format!("data:{};base64,{}", content_type, b64))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            } else if let Some((_, window)) = app.webview_windows().into_iter().next() {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_wallpaper::init())
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event
                && window.label() == "main"
            {
                std::process::exit(0);
            }
        })
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&app_data_dir)?;

            let service = PlayerService::new(app_data_dir);
            let mut playback = service.subscribe();
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                while playback.changed().await.is_ok() {
                    let state = playback.borrow_and_update().clone();
                    if let Err(error) = app_handle.emit("player-state-changed", state) {
                        log::warn!("failed to emit player state: {error}");
                    }
                }
            });
            app.manage(service);
            app.manage(desktop_wallpaper::DesktopWallpaperManager::new());
            if let Err(e) = tray::setup_tray(app.handle()) {
                log::warn!("failed to setup system tray: {e}");
            }
            audio::start(app.handle().clone());
            diagnostics::check_and_upload_pending_crash_reports();
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            connect_spotify,
            get_playback_state,
            get_queue,
            get_album_tracks,
            play,
            pause,
            next,
            previous,
            play_collection,
            queue_uri,
            restart_daemon,
            download_image,
            set_volume,
            get_audio_outputs,
            set_audio_output,
            diagnostics::submit_diagnostic_report,
            diagnostics::test_diagnostic_webhook,
            diagnostics::get_system_diagnostics,
            diagnostics::save_diagnostics_url,
            diagnostics::trigger_test_crash,
            desktop_wallpaper::get_available_monitors,
            desktop_wallpaper::get_desktop_mode_status,
            desktop_wallpaper::set_desktop_mode,
            desktop_wallpaper::reposition_desktop_mode,
            desktop_wallpaper::pin_desktop_bottom
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Listening Room");
}


