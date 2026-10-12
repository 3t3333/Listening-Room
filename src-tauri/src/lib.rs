mod audio;
pub mod diagnostics;
#[cfg(feature = "legacy-web-api")]
mod legacy_web_api;
mod models;
mod player;

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("error")).init();

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
            set_volume,
            get_audio_outputs,
            set_audio_output,
            diagnostics::submit_diagnostic_report,
            diagnostics::test_diagnostic_webhook,
            diagnostics::get_system_diagnostics,
            diagnostics::save_diagnostics_url,
            diagnostics::trigger_test_crash
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Listening Room");
}


