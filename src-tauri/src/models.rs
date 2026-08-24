use serde::Serialize;

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
    pub connected: bool,
    pub is_playing: bool,
    pub current: Option<Track>,
    pub next: Option<Track>,
    pub device_name: Option<String>,
    pub can_play: bool,
    pub can_pause: bool,
    pub can_skip_next: bool,
    pub can_skip_previous: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Playlist {
    pub id: String,
    pub name: String,
    pub image_url: Option<String>,
}
