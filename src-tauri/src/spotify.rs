use std::{
    path::PathBuf,
    sync::Arc,
    sync::atomic::{AtomicBool, Ordering},
    time::{Duration, Instant},
};

use futures::StreamExt;
use rspotify::{
    AuthCodeSpotify, ClientError, ClientResult, Config, Credentials, OAuth,
    model::{DisallowKey, EpisodeId, PlayableId, PlayableItem, PlaylistId, RepeatState, TrackId},
    prelude::*,
    scopes,
};
use serde_json::Value;
use tokio::sync::{Mutex, RwLock};

use crate::models::{PlaybackState, Playlist, Track};

pub struct SpotifyService {
    client: RwLock<Option<Arc<AuthCodeSpotify>>>,
    cache_path: PathBuf,
    auth_lock: Mutex<()>,
    restore_attempted: AtomicBool,
    queue_cache: RwLock<QueueCache>,
    playback_cache: RwLock<Option<PlaybackState>>,
}

#[derive(Default)]
struct QueueCache {
    fetched_at: Option<Instant>,
    next: Option<Track>,
}

impl SpotifyService {
    pub fn new(cache_path: PathBuf) -> Self {
        Self {
            client: RwLock::new(None),
            cache_path,
            auth_lock: Mutex::new(()),
            restore_attempted: AtomicBool::new(false),
            queue_cache: RwLock::new(QueueCache::default()),
            playback_cache: RwLock::new(None),
        }
    }

    pub async fn connect(&self) -> Result<(), String> {
        let _auth_guard = self.auth_lock.lock().await;
        let spotify = self.spotify_client()?;
        let url = spotify
            .get_authorize_url(false)
            .map_err(|error| error.to_string())?;
        spotify
            .prompt_for_token(&url)
            .await
            .map_err(|error| error.to_string())?;
        *self.client.write().await = Some(Arc::new(spotify));
        self.restore_attempted.store(true, Ordering::Release);
        Ok(())
    }

    fn spotify_client(&self) -> Result<AuthCodeSpotify, String> {
        dotenvy::dotenv().ok();
        let credentials = Credentials::from_env()
            .ok_or_else(|| "Spotify credentials are missing from .env".to_owned())?;
        let oauth = OAuth::from_env(scopes!(
            "user-read-currently-playing",
            "user-modify-playback-state",
            "user-read-playback-state",
            "playlist-read-private",
            "playlist-read-collaborative"
        ))
        .ok_or_else(|| "RSPOTIFY_REDIRECT_URI is missing from .env".to_owned())?;
        let config = Config {
            cache_path: self.cache_path.clone(),
            token_cached: true,
            token_refreshing: true,
            ..Config::default()
        };
        Ok(AuthCodeSpotify::with_config(credentials, oauth, config))
    }

    async fn restore_cached_client(&self) {
        if self.restore_attempted.load(Ordering::Acquire) {
            return;
        }
        let _auth_guard = self.auth_lock.lock().await;
        if self.restore_attempted.swap(true, Ordering::AcqRel) || self.client.read().await.is_some()
        {
            return;
        }
        let Ok(spotify) = self.spotify_client() else {
            return;
        };
        let Ok(Some(token)) = spotify.read_token_cache(true).await else {
            return;
        };
        *spotify.token.lock().await.unwrap() = Some(token);
        *self.client.write().await = Some(Arc::new(spotify));
    }

    async fn client(&self) -> Result<Arc<AuthCodeSpotify>, String> {
        self.client
            .read()
            .await
            .clone()
            .ok_or_else(|| "Connect Spotify first".to_owned())
    }

    pub async fn playback(&self) -> Result<PlaybackState, String> {
        self.restore_cached_client().await;
        let Ok(spotify) = self.client().await else {
            return Ok(PlaybackState::default());
        };
        let playback = spotify_result(
            spotify.current_playback(None, None::<Vec<_>>).await,
            "Read playback",
        )
        .await?;
        let next = self.next_track(&spotify).await;

        let Some(playback) = playback else {
            let mut cached = self.playback_cache.read().await.clone().unwrap_or_default();
            cached.connected = true;
            cached.is_playing = false;
            cached.can_play = cached.current.is_some();
            cached.can_pause = false;
            if next.is_some() {
                cached.next = next;
            }
            return Ok(cached);
        };
        let disallows = &playback.actions.disallows;

        let state = PlaybackState {
            connected: true,
            is_playing: playback.is_playing,
            current: playback.item.as_ref().and_then(track_from_item),
            next,
            device_name: Some(playback.device.name),
            can_play: !disallows.contains(&DisallowKey::Resuming),
            can_pause: !disallows.contains(&DisallowKey::Pausing),
            can_skip_next: !disallows.contains(&DisallowKey::SkippingNext),
            can_skip_previous: !disallows.contains(&DisallowKey::SkippingPrev),
        };
        *self.playback_cache.write().await = Some(state.clone());
        Ok(state)
    }

    async fn next_track(&self, spotify: &AuthCodeSpotify) -> Option<Track> {
        {
            let cache = self.queue_cache.read().await;
            if cache
                .fetched_at
                .is_some_and(|fetched_at| fetched_at.elapsed() < Duration::from_secs(30))
            {
                return cache.next.clone();
            }
        }

        let next = match spotify.current_user_queue().await {
            Ok(queue) => queue.queue.first().and_then(track_from_item),
            Err(_) => {
                let mut cache = self.queue_cache.write().await;
                cache.fetched_at = Some(Instant::now());
                return cache.next.clone();
            }
        };
        let mut cache = self.queue_cache.write().await;
        cache.fetched_at = Some(Instant::now());
        cache.next.clone_from(&next);
        next
    }

    pub async fn queue(&self) -> Result<Vec<Track>, String> {
        let queue = spotify_result(
            self.client().await?.current_user_queue().await,
            "Load playback queue",
        )
        .await?;
        Ok(queue.queue.iter().filter_map(track_from_item).collect())
    }

    pub async fn playlists(&self) -> Result<Vec<Playlist>, String> {
        let spotify = self.client().await?;
        let mut stream = spotify.current_user_playlists();
        let mut playlists = Vec::new();
        while let Some(result) = stream.next().await {
            let item = spotify_result(result, "Load playlists").await?;
            playlists.push(Playlist {
                id: item.id.to_string(),
                name: item.name,
                image_url: item.images.first().map(|image| image.url.clone()),
            });
        }
        Ok(playlists)
    }

    pub async fn playlist_tracks(&self, id: &str) -> Result<Vec<Track>, String> {
        let spotify = self.client().await?;
        let playlist_id = PlaylistId::from_id(id)
            .or_else(|_| PlaylistId::from_uri(id))
            .map_err(|error| error.to_string())?;
        let mut stream = spotify.playlist_items(playlist_id, None, None);
        let mut tracks = Vec::new();
        while let Some(result) = stream.next().await {
            let item = spotify_result(result, "Load playlist tracks").await?;
            if let Some(playable) = item.item
                && let Some(track) = track_from_item(&playable)
            {
                tracks.push(track);
            }
            if tracks.len() == 50 {
                break;
            }
        }
        Ok(tracks)
    }

    pub async fn play(&self) -> Result<(), String> {
        spotify_result(
            self.client().await?.resume_playback(None, None).await,
            "Resume playback",
        )
        .await
    }

    pub async fn pause(&self) -> Result<(), String> {
        spotify_result(
            self.client().await?.pause_playback(None).await,
            "Pause playback",
        )
        .await
    }

    pub async fn next(&self) -> Result<(), String> {
        spotify_result(
            self.client().await?.next_track(None).await,
            "Skip to next track",
        )
        .await
    }

    pub async fn previous(&self) -> Result<(), String> {
        spotify_result(
            self.client().await?.previous_track(None).await,
            "Return to previous track",
        )
        .await
    }

    pub async fn play_uri(&self, uri: &str) -> Result<(), String> {
        self.play_collection(&[uri.to_owned()], uri).await
    }

    pub async fn play_collection(&self, uris: &[String], start_uri: &str) -> Result<(), String> {
        let ordered = collection_playback_order(uris, start_uri)?;
        let playable = ordered
            .iter()
            .map(|uri| playable_from_uri(uri))
            .collect::<Result<Vec<_>, _>>()?;
        let spotify = self.client().await?;
        spotify_result(
            spotify
                .start_uris_playback(playable, None, None, None)
                .await,
            "Play selected collection",
        )
        .await?;
        spotify_result(
            spotify.repeat(RepeatState::Context, None).await,
            "Loop collection",
        )
        .await
    }

    pub async fn queue_uri(&self, uri: &str) -> Result<(), String> {
        let playable = playable_from_uri(uri)?;
        spotify_result(
            self.client().await?.add_item_to_queue(playable, None).await,
            "Add track to queue",
        )
        .await?;
        self.queue_cache.write().await.fetched_at = None;
        Ok(())
    }
}

fn collection_playback_order(uris: &[String], start_uri: &str) -> Result<Vec<String>, String> {
    let start = uris
        .iter()
        .position(|uri| uri == start_uri)
        .ok_or_else(|| "The selected track is not in this collection".to_owned())?;
    Ok(uris[start..]
        .iter()
        .chain(&uris[..start])
        .take(100)
        .cloned()
        .collect())
}

fn playable_from_uri(uri: &str) -> Result<PlayableId<'_>, String> {
    if uri.starts_with("spotify:track:") {
        TrackId::from_uri(uri)
            .map(PlayableId::Track)
            .map_err(|error| error.to_string())
    } else if uri.starts_with("spotify:episode:") {
        EpisodeId::from_uri(uri)
            .map(PlayableId::Episode)
            .map_err(|error| error.to_string())
    } else {
        Err("Unsupported Spotify URI".to_owned())
    }
}

fn track_from_item(item: &PlayableItem) -> Option<Track> {
    match item {
        PlayableItem::Track(track) => Some(Track {
            name: track.name.clone(),
            artist: track
                .artists
                .iter()
                .map(|artist| artist.name.as_str())
                .collect::<Vec<_>>()
                .join(", "),
            image_url: track.album.images.first().map(|image| image.url.clone()),
            uri: track.id.as_ref().map(|id| id.uri()),
            duration_ms: u64::try_from(track.duration.num_milliseconds()).ok(),
        }),
        PlayableItem::Episode(episode) => Some(Track {
            name: episode.name.clone(),
            artist: episode.show.name.clone(),
            image_url: episode.images.first().map(|image| image.url.clone()),
            uri: Some(episode.id.uri()),
            duration_ms: u64::try_from(episode.duration.num_milliseconds()).ok(),
        }),
        PlayableItem::Unknown(value) => track_from_unknown(value),
    }
}

fn track_from_unknown(value: &Value) -> Option<Track> {
    let name = value.get("name")?.as_str()?.to_owned();
    let artist = value
        .get("artists")
        .and_then(Value::as_array)
        .map(|artists| {
            artists
                .iter()
                .filter_map(|artist| artist.get("name")?.as_str())
                .collect::<Vec<_>>()
                .join(", ")
        })
        .or_else(|| {
            value
                .get("show")
                .and_then(|show| show.get("name"))
                .and_then(Value::as_str)
                .map(str::to_owned)
        })
        .unwrap_or_default();
    let images = value
        .get("album")
        .and_then(|album| album.get("images"))
        .or_else(|| value.get("images"));
    let image_url = images
        .and_then(Value::as_array)
        .and_then(|images| images.first())
        .and_then(|image| image.get("url"))
        .and_then(Value::as_str)
        .map(str::to_owned);
    let uri = value
        .get("uri")
        .and_then(Value::as_str)
        .map(str::to_owned)
        .or_else(|| {
            let id = value.get("id")?.as_str()?;
            let kind = value.get("type").and_then(Value::as_str).unwrap_or("track");
            Some(format!("spotify:{kind}:{id}"))
        });
    let duration_ms = value.get("duration_ms").and_then(Value::as_u64);

    Some(Track {
        name,
        artist,
        image_url,
        uri,
        duration_ms,
    })
}

async fn spotify_result<T>(result: ClientResult<T>, action: &str) -> Result<T, String> {
    match result {
        Ok(value) => Ok(value),
        Err(ClientError::Http(error)) => match *error {
            rspotify::http::HttpError::StatusCode(response) => {
                let status = response.status();
                let retry_after = response
                    .headers()
                    .get("retry-after")
                    .and_then(|value| value.to_str().ok())
                    .and_then(|value| value.parse::<u64>().ok());
                let detail = response.text().await.unwrap_or_default();
                let detail = serde_json::from_str::<Value>(&detail)
                    .ok()
                    .and_then(|value| {
                        value
                            .pointer("/error/message")
                            .or_else(|| value.get("error_description"))
                            .and_then(Value::as_str)
                            .map(str::to_owned)
                    })
                    .filter(|message| !message.is_empty());
                let message = detail.map_or_else(String::new, |message| format!(": {message}"));
                let retry = retry_after
                    .map_or_else(String::new, |seconds| format!(" Retry after {seconds}s."));
                Err(format!("{action} failed ({status}){message}{retry}"))
            }
            error => Err(format!("{action} failed: {error}")),
        },
        Err(error) => Err(format!("{action} failed: {error}")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn track_from_unknown_should_preserve_spotify_track_fields() {
        let item = PlayableItem::Unknown(serde_json::json!({
            "id": "abc123",
            "type": "track",
            "name": "Night Drive",
            "artists": [{ "name": "Room Service" }],
            "album": { "images": [{ "url": "https://example.com/cover.jpg" }] }
        }));

        let track = track_from_item(&item).expect("track should parse");

        assert_eq!(track.name, "Night Drive");
        assert_eq!(track.artist, "Room Service");
        assert_eq!(track.uri.as_deref(), Some("spotify:track:abc123"));
    }

    #[test]
    fn playable_from_uri_should_reject_non_playable_contexts() {
        assert_eq!(
            playable_from_uri("spotify:playlist:abc").unwrap_err(),
            "Unsupported Spotify URI"
        );
    }

    #[test]
    fn collection_playback_should_continue_after_selected_track_and_wrap() {
        let uris = ["first", "second", "third"].map(str::to_owned);

        assert_eq!(
            collection_playback_order(&uris, "second").unwrap(),
            ["second", "third", "first"]
        );
    }
}
