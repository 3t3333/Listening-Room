mod audio;
mod models;
mod spotify;

use models::{PlaybackState, Playlist, Track};
use spotify::SpotifyService;
use tauri::{Manager, State};

#[tauri::command]
async fn connect_spotify(service: State<'_, SpotifyService>) -> Result<(), String> {
    service.connect().await
}

#[tauri::command]
async fn get_playback_state(service: State<'_, SpotifyService>) -> Result<PlaybackState, String> {
    service.playback().await
}

#[tauri::command]
async fn get_playlists(service: State<'_, SpotifyService>) -> Result<Vec<Playlist>, String> {
    service.playlists().await
}

#[tauri::command]
async fn get_playlist_tracks(
    id: String,
    service: State<'_, SpotifyService>,
) -> Result<Vec<Track>, String> {
    service.playlist_tracks(&id).await
}

#[tauri::command]
async fn get_queue(service: State<'_, SpotifyService>) -> Result<Vec<Track>, String> {
    service.queue().await
}

#[tauri::command]
async fn play(service: State<'_, SpotifyService>) -> Result<(), String> {
    service.play().await
}

#[tauri::command]
async fn pause(service: State<'_, SpotifyService>) -> Result<(), String> {
    service.pause().await
}

#[tauri::command]
async fn next(service: State<'_, SpotifyService>) -> Result<(), String> {
    service.next().await
}

#[tauri::command]
async fn previous(service: State<'_, SpotifyService>) -> Result<(), String> {
    service.previous().await
}

#[tauri::command]
async fn play_uri(uri: String, service: State<'_, SpotifyService>) -> Result<(), String> {
    service.play_uri(&uri).await
}

#[tauri::command]
async fn play_collection(
    uris: Vec<String>,
    start_uri: String,
    service: State<'_, SpotifyService>,
) -> Result<(), String> {
    service.play_collection(&uris, &start_uri).await
}

#[tauri::command]
async fn queue_uri(uri: String, service: State<'_, SpotifyService>) -> Result<(), String> {
    service.queue_uri(&uri).await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&app_data_dir)?;
            app.manage(SpotifyService::new(app_data_dir.join("spotify-token.json")));
            #[cfg(windows)]
            audio::start(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            connect_spotify,
            get_playback_state,
            get_playlists,
            get_playlist_tracks,
            get_queue,
            play,
            pause,
            next,
            previous,
            play_uri,
            play_collection,
            queue_uri
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Listening Room");
}
