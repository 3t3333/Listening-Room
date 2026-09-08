use serde::Serialize;

#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum PlayerStatus {
    #[default]
    AuthenticationRequired,
    Connecting,
    Ready,
    Reconnecting,
    Error,
}

#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Track {
    pub name: String,
    pub artist: String,
    pub image_url: Option<String>,
    pub uri: Option<String>,
    pub duration_ms: Option<u64>,
}

#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaybackState {
    pub status: PlayerStatus,
    pub connected: bool,
    pub active: bool,
    pub is_playing: bool,
    pub current: Option<Track>,
    pub next: Option<Track>,
    pub device_name: Option<String>,
    pub volume_percent: Option<u8>,
    pub can_play: bool,
    pub can_pause: bool,
    pub can_skip_next: bool,
    pub can_skip_previous: bool,
    pub error: Option<String>,
}

#[cfg(feature = "legacy-web-api")]
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Playlist {
    pub id: String,
    pub name: String,
    pub image_url: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AlbumImport {
    pub name: String,
    pub artist: String,
    pub artist_image_url: Option<String>,
    pub year: Option<i32>,
    pub tracks: Vec<Track>,
}
