mod audio;
#[cfg(feature = "legacy-web-api")]
mod legacy_web_api;
mod models;
mod player;

use models::{PlaybackState, Track};
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("error")).init();

    tauri::Builder::default()
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
            #[cfg(windows)]
            audio::start(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            connect_spotify,
            get_playback_state,
            get_queue,
            play,
            pause,
            next,
            previous,
            play_collection,
            queue_uri,
            set_volume,
            get_audio_outputs,
            set_audio_output
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Listening Room");
}
