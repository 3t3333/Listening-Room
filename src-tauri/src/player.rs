use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
    sync::Arc,
    time::Duration,
};

use cpal::traits::{DeviceTrait, HostTrait};
use futures::{StreamExt, stream};
use librespot::{
    connect::{
        ConnectConfig, LoadContextOptions, LoadRequest, LoadRequestOptions, Options, QueueSnapshot,
        Spirc,
    },
    core::{
        SpotifyUri,
        authentication::Credentials,
        cache::Cache,
        config::{DeviceType, SessionConfig},
        error::ErrorKind,
        session::Session,
    },
    metadata::audio::{AudioItem, UniqueFields},
    playback::{
        audio_backend,
        config::{AudioFormat, Bitrate, PlayerConfig},
        mixer::{self, MixerConfig},
        player::{Player, PlayerEvent},
    },
};
use serde::Serialize;
use tokio::sync::{RwLock, mpsc, oneshot, watch};
use uuid::Uuid;

use crate::models::{PlaybackState, PlayerStatus, Track};

const DEVICE_NAME: &str = "Listening Room Player";
const METADATA_CACHE_LIMIT: usize = 240;
const AUDIO_OUTPUT_FILE: &str = "audio-output";

type CommandReply = oneshot::Sender<Result<(), String>>;

pub struct PlayerService {
    app_data_dir: PathBuf,
    commands: mpsc::UnboundedSender<DaemonCommand>,
    playback: watch::Receiver<PlaybackState>,
    queue: watch::Receiver<QueueSnapshot>,
    session: Arc<RwLock<Option<Session>>>,
    metadata: Arc<RwLock<HashMap<String, Track>>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioOutputState {
    devices: Vec<String>,
    default_output: Option<String>,
    selected: Option<String>,
}

enum DaemonCommand {
    Authenticate(CommandReply),
    Play(CommandReply),
    Pause(CommandReply),
    Next(CommandReply),
    Previous(CommandReply),
    SetVolume(u8, CommandReply),
    SetAudioOutput(Option<String>, CommandReply),
    Load(Vec<String>, CommandReply),
    Queue(String, CommandReply),
    ResolvedNext(u64, u64, Track),
    Restart(CommandReply),
    Shutdown,
}

impl PlayerService {
    pub fn new(app_data_dir: PathBuf) -> Self {
        let (commands, command_rx) = mpsc::unbounded_channel();
        let (playback_tx, playback) = watch::channel(PlaybackState::default());
        let (queue_tx, queue) = watch::channel(QueueSnapshot::default());
        let session = Arc::new(RwLock::new(None));
        let metadata = Arc::new(RwLock::new(HashMap::new()));

        tauri::async_runtime::spawn(run_daemon(
            app_data_dir.clone(),
            command_rx,
            commands.clone(),
            playback_tx,
            queue_tx,
            Arc::clone(&session),
            Arc::clone(&metadata),
        ));

        Self {
            app_data_dir,
            commands,
            playback,
            queue,
            session,
            metadata,
        }
    }

    pub async fn connect(&self) -> Result<(), String> {
        self.request(DaemonCommand::Authenticate).await
    }

    pub fn playback(&self) -> PlaybackState {
        self.playback.borrow().clone()
    }

    pub fn subscribe(&self) -> watch::Receiver<PlaybackState> {
        self.playback.clone()
    }

    pub async fn queue(&self) -> Result<Vec<Track>, String> {
        let snapshot = self.queue.borrow().clone();
        if !snapshot.active {
            return Err("Select Listening Room as the active Spotify device first".to_owned());
        }
        let session = self
            .session
            .read()
            .await
            .clone()
            .ok_or_else(|| "Connect Spotify first".to_owned())?;
        let uris = snapshot
            .upcoming
            .iter()
            .map(|track| track.uri.clone())
            .collect::<Vec<_>>();
        let metadata = Arc::clone(&self.metadata);
        Ok(stream::iter(uris)
            .map(|uri| {
                let session = session.clone();
                let metadata = Arc::clone(&metadata);
                async move { resolve_track(&session, &metadata, &uri).await }
            })
            .buffered(8)
            .collect()
            .await)
    }

    pub async fn play(&self) -> Result<(), String> {
        self.request(DaemonCommand::Play).await
    }

    pub async fn pause(&self) -> Result<(), String> {
        self.request(DaemonCommand::Pause).await
    }

    pub async fn next(&self) -> Result<(), String> {
        self.request(DaemonCommand::Next).await
    }

    pub async fn previous(&self) -> Result<(), String> {
        self.request(DaemonCommand::Previous).await
    }

    pub async fn set_volume(&self, volume: u8) -> Result<(), String> {
        if volume > 100 {
            return Err("Volume must be between 0 and 100".to_owned());
        }
        self.request_with(|reply| DaemonCommand::SetVolume(volume, reply))
            .await
    }

    pub fn audio_outputs(&self) -> Result<AudioOutputState, String> {
        let (devices, default_output) = enumerate_audio_outputs()?;
        Ok(AudioOutputState {
            devices,
            default_output,
            selected: load_audio_output(&self.app_data_dir)?,
        })
    }

    pub async fn set_audio_output(&self, output: Option<String>) -> Result<(), String> {
        self.request_with(|reply| DaemonCommand::SetAudioOutput(output, reply))
            .await
    }

    pub async fn play_collection(&self, uris: &[String], start_uri: &str) -> Result<(), String> {
        let ordered = collection_playback_order(uris, start_uri)?;
        self.request_with(|reply| DaemonCommand::Load(ordered, reply))
            .await
    }

    pub async fn queue_uri(&self, uri: &str) -> Result<(), String> {
        validate_playable_uri(uri)?;
        self.request_with(|reply| DaemonCommand::Queue(uri.to_owned(), reply))
            .await
    }

    pub async fn fetch_album(&self, uri: &str) -> Result<crate::models::AlbumImport, String> {
        use librespot::metadata::{Album, Artist, Metadata};
        use librespot::core::SpotifyUri;
        use librespot::metadata::audio::AudioItem;

        let session_lock = self.session.read().await;
        let session = session_lock.as_ref().ok_or_else(|| "Not connected to Spotify".to_owned())?;

        let spotify_uri = SpotifyUri::from_uri(uri).map_err(|_| "Invalid Spotify URI".to_owned())?;
        let album = Album::get(session, &spotify_uri).await.map_err(|e| e.to_string())?;

        let year = Some(album.date.0.year() as i32);
        
        let mut artist_name = "Unknown Artist".to_string();
        let mut artist_image_url = None;
        if let Some(artist_stub) = album.artists.first() {
            artist_name = artist_stub.name.clone();
            
            let artist_uri = SpotifyUri::from_uri(&artist_stub.id.to_uri().unwrap()).unwrap();
            if let Ok(artist) = Artist::get(session, &artist_uri).await {
                if let Some(portrait) = artist.portraits.first() {
                    artist_image_url = Some(format!("https://i.scdn.co/image/{}", portrait.id));
                }
            }
        }

        let mut tracks = Vec::new();
        let album_cover = album.covers.first().map(|c| format!("https://i.scdn.co/image/{}", c.id));

        for track_id in album.tracks() {
            let track_uri = track_id.to_uri().unwrap();
            let spotify_uri = SpotifyUri::from_uri(&track_uri).unwrap();
            if let Ok(item) = AudioItem::get_file(session, spotify_uri).await {
                let t = Track {
                    name: item.name.clone(),
                    artist: artist_name.clone(),
                    image_url: item.covers.first().map(|cover| cover.url.clone()).or_else(|| album_cover.clone()),
                    uri: Some(item.uri.clone()),
                    duration_ms: Some(u64::from(item.duration_ms)),
                    ..Default::default()
                };
                tracks.push(t);
            }
        }

        Ok(crate::models::AlbumImport {
            name: album.name.clone(),
            artist: artist_name,
            artist_image_url,
            year,
            tracks,
        })
    }

    pub async fn restart(&self) -> Result<(), String> {
        self.request_with(|reply| DaemonCommand::Restart(reply)).await
    }

    pub fn shutdown(&self) {
        let _ = self.commands.send(DaemonCommand::Shutdown);
    }

    async fn request(
        &self,
        command: impl FnOnce(CommandReply) -> DaemonCommand,
    ) -> Result<(), String> {
        self.request_with(command).await
    }

    async fn request_with(
        &self,
        command: impl FnOnce(CommandReply) -> DaemonCommand,
    ) -> Result<(), String> {
        let (reply, response) = oneshot::channel();
        self.commands
            .send(command(reply))
            .map_err(|_| "The player service is not running".to_owned())?;
        response
            .await
            .map_err(|_| "The player service stopped unexpectedly".to_owned())?
    }
}

impl Drop for PlayerService {
    fn drop(&mut self) {
        self.shutdown();
    }
}

async fn run_daemon(
    app_data_dir: PathBuf,
    mut commands: mpsc::UnboundedReceiver<DaemonCommand>,
    command_tx: mpsc::UnboundedSender<DaemonCommand>,
    playback_tx: watch::Sender<PlaybackState>,
    queue_tx: watch::Sender<QueueSnapshot>,
    shared_session: Arc<RwLock<Option<Session>>>,
    metadata: Arc<RwLock<HashMap<String, Track>>>,
) {
    let cache = match create_cache(&app_data_dir) {
        Ok(cache) => cache,
        Err(error) => {
            set_error(&playback_tx, error);
            return;
        }
    };
    let device_id = match load_device_id(&app_data_dir) {
        Ok(device_id) => device_id,
        Err(error) => {
            set_error(&playback_tx, error);
            return;
        }
    };
    let session_config = SessionConfig {
        device_id,
        ..Default::default()
    };
    let mut credentials = cache.credentials();
    let mut audio_output = match load_audio_output(&app_data_dir) {
        Ok(output) => output,
        Err(error) => {
            set_error(&playback_tx, error);
            return;
        }
    };
    let mut session_generation = 0_u64;

    loop {
        if credentials.is_none() {
            playback_tx.send_modify(|state| {
                state.status = PlayerStatus::AuthenticationRequired;
                state.connected = false;
                state.active = false;
            });
            match commands.recv().await {
                Some(DaemonCommand::Authenticate(reply)) => {
                    playback_tx.send_modify(|state| {
                        state.status = PlayerStatus::Connecting;
                        state.error = None;
                    });
                    match authenticate(
                        session_config.device_id.clone(),
                        session_config.client_id.clone(),
                        &mut commands,
                    )
                    .await
                    {
                        AuthenticationExit::Authenticated(next) => {
                            credentials = Some(next);
                            let _ = reply.send(Ok(()));
                        }
                        AuthenticationExit::Failed(error) => {
                            set_error(&playback_tx, error.clone());
                            let _ = reply.send(Err(error));
                        }
                        AuthenticationExit::Shutdown => {
                            let _ = reply.send(Err("The player is shutting down".to_owned()));
                            return;
                        }
                    }
                }
                Some(DaemonCommand::SetAudioOutput(output, reply)) => {
                    let result = change_audio_output(&app_data_dir, &mut audio_output, output);
                    let _ = reply.send(result.map(|_| ()));
                }
                Some(DaemonCommand::Shutdown) | None => return,
                Some(command) => reject_command(command, "Connect Spotify first"),
            }
            continue;
        }

        playback_tx.send_modify(|state| {
            state.status = PlayerStatus::Connecting;
            state.error = None;
        });
        let Some(active_credentials) = credentials.take() else {
            continue;
        };
        let restart_credentials = active_credentials.clone();
        session_generation = session_generation.wrapping_add(1);
        let result = run_session(
            session_generation,
            &session_config,
            &cache,
            active_credentials,
            &mut commands,
            &command_tx,
            &playback_tx,
            &queue_tx,
            &shared_session,
            &metadata,
            &app_data_dir,
            &mut audio_output,
        )
        .await;
        *shared_session.write().await = None;
        let restart_immediately = result == SessionExit::AudioOutputChanged || result == SessionExit::Restart;

        match result {
            SessionExit::Shutdown => return,
            SessionExit::AuthenticationFailed(error) => {
                if let Err(clear_error) = clear_cached_credentials(&app_data_dir) {
                    log::warn!("failed to clear rejected Spotify credentials: {clear_error}");
                }
                credentials = None;
                playback_tx.send_modify(|state| {
                    state.status = PlayerStatus::AuthenticationRequired;
                    state.connected = false;
                    state.active = false;
                    state.error = Some(error.clone());
                });
                continue;
            }
            SessionExit::Ended | SessionExit::AudioOutputChanged | SessionExit::Restart => {}
        }
        playback_tx.send_modify(|state| {
            state.status = PlayerStatus::Reconnecting;
            state.connected = false;
            state.active = false;
            state.is_playing = false;
            state.current = None;
            state.next = None;
            state.device_name = Some(DEVICE_NAME.to_owned());
            state.volume_percent = None;
            state.can_play = false;
            state.can_pause = false;
            state.can_skip_next = false;
            state.can_skip_previous = false;
        });
        queue_tx.send_replace(QueueSnapshot::default());
        if restart_immediately {
            credentials = Some(restart_credentials);
            continue;
        }
        let reconnect_delay = tokio::time::sleep(Duration::from_secs(3));
        tokio::pin!(reconnect_delay);
        loop {
            tokio::select! {
                _ = &mut reconnect_delay => break,
                command = commands.recv() => match command {
                    Some(DaemonCommand::Shutdown) | None => return,
                    Some(command) => reject_command(command, "The Spotify player is reconnecting"),
                },
            }
        }
        credentials = cache.credentials();
    }
}

#[derive(PartialEq, Eq)]
enum SessionExit {
    Ended,
    AuthenticationFailed(String),
    AudioOutputChanged,
    Restart,
    Shutdown,
}

#[allow(clippy::too_many_arguments)]
async fn run_session(
    session_generation: u64,
    session_config: &SessionConfig,
    cache: &Cache,
    credentials: Credentials,
    commands: &mut mpsc::UnboundedReceiver<DaemonCommand>,
    command_tx: &mpsc::UnboundedSender<DaemonCommand>,
    playback_tx: &watch::Sender<PlaybackState>,
    queue_tx: &watch::Sender<QueueSnapshot>,
    shared_session: &Arc<RwLock<Option<Session>>>,
    metadata: &Arc<RwLock<HashMap<String, Track>>>,
    app_data_dir: &Path,
    audio_output: &mut Option<String>,
) -> SessionExit {
    let player_config = PlayerConfig {
        bitrate: Bitrate::Bitrate160,
        position_update_interval: Some(Duration::from_secs(1)),
        ..Default::default()
    };
    let connect_config = ConnectConfig {
        name: DEVICE_NAME.to_owned(),
        device_type: DeviceType::Computer,
        initial_volume: cache.volume().unwrap_or_else(|| percent_to_librespot(65)),
        ..Default::default()
    };
    let session = Session::new(session_config.clone(), Some(cache.clone()));
    let Some(mixer_builder) = mixer::find(None) else {
        set_error(playback_tx, "No librespot mixer is available".to_owned());
        return SessionExit::Ended;
    };
    let Ok(mixer) = mixer_builder(MixerConfig::default()) else {
        set_error(
            playback_tx,
            "Could not initialize the librespot mixer".to_owned(),
        );
        return SessionExit::Ended;
    };
    let Some(sink_builder) = audio_backend::find(None) else {
        set_error(
            playback_tx,
            "No supported audio output backend is available".to_owned(),
        );
        return SessionExit::Ended;
    };
    let audio_format = AudioFormat::default();
    let sink_device = available_audio_output(audio_output.as_deref());
    let player = Player::new(
        player_config,
        session.clone(),
        mixer.get_soft_volume(),
        move || sink_builder(sink_device.clone(), audio_format),
    );
    let mut player_events = player.get_player_event_channel();
    let (spirc, spirc_task, mut queue_events) = match Spirc::new_with_queue_events(
        connect_config,
        session.clone(),
        credentials,
        player,
        mixer,
    )
    .await
    {
        Ok(runtime) => runtime,
        Err(error) => {
            let message = format!("Could not connect the Spotify player: {error}");
            set_error(playback_tx, message.clone());
            return if error.kind == ErrorKind::PermissionDenied {
                SessionExit::AuthenticationFailed(message)
            } else {
                SessionExit::Ended
            };
        }
    };
    *shared_session.write().await = Some(session.clone());
    playback_tx.send_modify(|state| {
        state.status = PlayerStatus::Ready;
        state.connected = true;
        state.active = false;
        state.device_name = Some(DEVICE_NAME.to_owned());
        state.is_playing = false;
        state.current = None;
        state.next = None;
        state.can_play = false;
        state.can_pause = false;
        state.can_skip_next = false;
        state.can_skip_previous = false;
        state.error = None;
    });

    tokio::pin!(spirc_task);
    loop {
        tokio::select! {
            command = commands.recv() => match command {
                Some(DaemonCommand::Restart(reply)) => {
                    let _ = reply.send(Ok(()));
                    let _ = spirc.shutdown();
                    let _ = tokio::time::timeout(Duration::from_secs(5), &mut spirc_task).await;
                    return SessionExit::Restart;
                }
                Some(DaemonCommand::Shutdown) | None => {
                    let _ = spirc.shutdown();
                    let _ = tokio::time::timeout(Duration::from_secs(5), &mut spirc_task).await;
                    return SessionExit::Shutdown;
                }
                Some(DaemonCommand::SetAudioOutput(output, reply)) => {
                    match change_audio_output(app_data_dir, audio_output, output) {
                        Ok(false) => {
                            let _ = reply.send(Ok(()));
                        }
                        Ok(true) => {
                            let _ = reply.send(Ok(()));
                            let _ = spirc.shutdown();
                            let _ = tokio::time::timeout(Duration::from_secs(5), &mut spirc_task).await;
                            return SessionExit::AudioOutputChanged;
                        }
                        Err(error) => {
                            let _ = reply.send(Err(error));
                        }
                    }
                }
                Some(command) => handle_command(command, session_generation, &spirc, playback_tx, queue_tx),
            },
            event = player_events.recv() => if let Some(event) = event {
                reduce_player_event(playback_tx, queue_tx, event);
            },
            changed = queue_events.changed() => if changed.is_ok() {
                let snapshot = queue_events.borrow_and_update().clone();
                queue_tx.send_replace(snapshot.clone());
                playback_tx.send_modify(|state| {
                    state.active = snapshot.active;
                    state.can_play = snapshot.active && !state.is_playing && state.current.is_some();
                    state.can_pause = snapshot.active && state.is_playing;
                    state.can_skip_next = snapshot.active && !snapshot.upcoming.is_empty();
                    state.can_skip_previous = snapshot.active && state.current.is_some();
                    if !snapshot.active {
                        state.is_playing = false;
                        state.current = None;
                        state.next = None;
                    }
                });
                if let Some(uri) = snapshot.upcoming.first().map(|track| track.uri.clone()) {
                    let session = session.clone();
                    let metadata = Arc::clone(metadata);
                    let command_tx = command_tx.clone();
                    tauri::async_runtime::spawn(async move {
                        let track = resolve_track(&session, &metadata, &uri).await;
                        let _ = command_tx.send(DaemonCommand::ResolvedNext(session_generation, snapshot.sequence, track));
                    });
                } else {
                    playback_tx.send_modify(|state| state.next = None);
                }
            },
            _ = &mut spirc_task => return SessionExit::Ended,
        }
    }
}

fn handle_command(
    command: DaemonCommand,
    session_generation: u64,
    spirc: &Spirc,
    playback_tx: &watch::Sender<PlaybackState>,
    queue_tx: &watch::Sender<QueueSnapshot>,
) {
    match command {
        DaemonCommand::Authenticate(reply) => {
            let _ = reply.send(Ok(()));
        }
        DaemonCommand::Play(reply) => respond_if_active(reply, queue_tx, || spirc.play()),
        DaemonCommand::Pause(reply) => respond_if_active(reply, queue_tx, || spirc.pause()),
        DaemonCommand::Next(reply) => respond_if_active(reply, queue_tx, || spirc.next()),
        DaemonCommand::Previous(reply) => respond_if_active(reply, queue_tx, || spirc.prev()),
        DaemonCommand::SetVolume(volume, reply) => respond_if_active(reply, queue_tx, || {
            spirc.set_volume(percent_to_librespot(volume))
        }),
        DaemonCommand::SetAudioOutput(_, reply) => {
            let _ = reply.send(Err("The audio output could not be changed".to_owned()));
        }
        DaemonCommand::Load(uris, reply) => {
            let options = LoadRequestOptions {
                start_playing: true,
                context_options: Some(LoadContextOptions::Options(Options {
                    repeat: false,
                    ..Default::default()
                })),
                ..Default::default()
            };
            let result = spirc
                .activate()
                .and_then(|()| spirc.load(LoadRequest::from_tracks(uris, options)));
            respond(reply, result);
        }
        DaemonCommand::Queue(uri, reply) => {
            respond_if_active(reply, queue_tx, || spirc.add_to_queue(uri))
        }
        DaemonCommand::ResolvedNext(generation, sequence, track) => {
            if generation == session_generation && queue_tx.borrow().sequence == sequence {
                playback_tx.send_modify(|state| state.next = Some(track));
            }
        }
        DaemonCommand::Shutdown | DaemonCommand::Restart(_) => {}
    }
}

fn respond(reply: CommandReply, result: Result<(), librespot::core::Error>) {
    let _ = reply.send(result.map_err(|error| error.to_string()));
}

fn respond_if_active(
    reply: CommandReply,
    queue_tx: &watch::Sender<QueueSnapshot>,
    action: impl FnOnce() -> Result<(), librespot::core::Error>,
) {
    if !queue_tx.borrow().active {
        let _ = reply.send(Err(
            "Select Listening Room as the active Spotify device first".to_owned(),
        ));
        return;
    }
    respond(reply, action());
}

fn reduce_player_event(
    playback_tx: &watch::Sender<PlaybackState>,
    queue_tx: &watch::Sender<QueueSnapshot>,
    event: PlayerEvent,
) {
    let active = queue_tx.borrow().active;
    playback_tx.send_modify(|state| match event {
        PlayerEvent::TrackChanged { audio_item } => {
            state.current = Some(track_from_audio_item(&audio_item));
            state.error = None;
            state.can_skip_previous = active;
        }
        PlayerEvent::Playing { .. } => {
            state.is_playing = true;
            state.can_play = false;
            state.can_pause = active;
        }
        PlayerEvent::Paused { .. } | PlayerEvent::Stopped { .. } => {
            state.is_playing = false;
            state.can_play = active && state.current.is_some();
            state.can_pause = false;
            if matches!(event, PlayerEvent::Stopped { .. }) && queue_tx.borrow().upcoming.is_empty() {
                state.current = None;
            }
        }
        PlayerEvent::VolumeChanged { volume } => {
            state.volume_percent = Some(librespot_to_percent(volume));
        }
        PlayerEvent::SessionConnected { .. } => {
            state.connected = true;
            state.active = true;
            state.status = PlayerStatus::Ready;
            state.can_play = !state.is_playing && state.current.is_some();
            state.can_pause = state.is_playing;
        }
        PlayerEvent::SessionDisconnected { .. } => {
            state.connected = true;
            state.active = false;
            state.status = PlayerStatus::Ready;
            state.is_playing = false;
            state.current = None;
            state.next = None;
            state.can_play = false;
            state.can_pause = false;
            state.can_skip_next = false;
            state.can_skip_previous = false;
        }
        PlayerEvent::Unavailable { track_id, .. } => {
            state.error = Some(format!("Track unavailable: {track_id}"));
        }
        _ => {}
    });
}

fn track_from_audio_item(item: &AudioItem) -> Track {
    let artist = match &item.unique_fields {
        UniqueFields::Track { artists, .. } => artists
            .iter()
            .map(|artist| artist.name.as_str())
            .collect::<Vec<_>>()
            .join(", "),
        UniqueFields::Episode { show_name, .. } => show_name.clone(),
        UniqueFields::Local { artists, .. } => artists.clone().unwrap_or_default(),
    };
    Track {
        name: item.name.clone(),
        artist,
        image_url: item.covers.first().map(|cover| cover.url.clone()),
        uri: Some(item.uri.clone()),
        duration_ms: Some(u64::from(item.duration_ms)),
    }
}

async fn resolve_track(
    session: &Session,
    metadata: &RwLock<HashMap<String, Track>>,
    uri: &str,
) -> Track {
    if let Some(track) = metadata.read().await.get(uri).cloned() {
        return track;
    }
    let Ok(spotify_uri) = SpotifyUri::from_uri(uri) else {
        return unresolved_track(uri);
    };
    let Ok(item) = AudioItem::get_file(session, spotify_uri).await else {
        return unresolved_track(uri);
    };
    let track = track_from_audio_item(&item);
    let mut cache = metadata.write().await;
    if cache.len() >= METADATA_CACHE_LIMIT
        && let Some(oldest) = cache.keys().next().cloned()
    {
        cache.remove(&oldest);
    }
    cache.insert(uri.to_owned(), track.clone());
    track
}

fn unresolved_track(uri: &str) -> Track {
    Track {
        name: "Spotify item unavailable".to_owned(),
        artist: "Metadata could not be loaded".to_owned(),
        uri: Some(uri.to_owned()),
        ..Default::default()
    }
}

enum AuthenticationExit {
    Authenticated(Credentials),
    Failed(String),
    Shutdown,
}

async fn authenticate(
    device_id: String,
    client_id: String,
    commands: &mut mpsc::UnboundedReceiver<DaemonCommand>,
) -> AuthenticationExit {
    let mut discovery = match librespot::discovery::Discovery::builder(device_id, client_id)
        .name(DEVICE_NAME)
        .device_type(DeviceType::Computer)
        .launch()
    {
        Ok(d) => d,
        Err(e) => return AuthenticationExit::Failed(e.to_string()),
    };

    loop {
        tokio::select! {
            credentials = discovery.next() => {
                if let Some(credentials) = credentials {
                    return AuthenticationExit::Authenticated(credentials);
                }
            }
            command = commands.recv() => match command {
                Some(DaemonCommand::Shutdown) | None => return AuthenticationExit::Shutdown,
                Some(command) => reject_command(command, "The Spotify player is waiting for connection"),
            }
        }
    }
}

fn clear_cached_credentials(app_data_dir: &Path) -> Result<(), String> {
    match fs::remove_file(app_data_dir.join("credentials.json")) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}

fn create_cache(app_data_dir: &Path) -> Result<Cache, String> {
    // Preserve the credential location used by the original headless player.
    let credentials = app_data_dir.to_path_buf();
    let volume = app_data_dir.join("librespot").join("volume");
    let audio = app_data_dir.join("librespot").join("audio");
    fs::create_dir_all(&credentials).map_err(|error| error.to_string())?;
    fs::create_dir_all(&volume).map_err(|error| error.to_string())?;
    fs::create_dir_all(&audio).map_err(|error| error.to_string())?;
    Cache::new(Some(credentials), Some(volume), Some(audio), None)
        .map_err(|error| error.to_string())
}

fn load_device_id(app_data_dir: &Path) -> Result<String, String> {
    let path = app_data_dir.join("librespot-device-id");
    if let Ok(id) = fs::read_to_string(&path)
        && !id.trim().is_empty()
    {
        return Ok(id.trim().to_owned());
    }
    let id = Uuid::new_v4().simple().to_string();
    fs::write(path, &id).map_err(|error| error.to_string())?;
    Ok(id)
}

fn enumerate_audio_outputs() -> Result<(Vec<String>, Option<String>), String> {
    let host = cpal::default_host();
    let default_output = host
        .default_output_device()
        .and_then(|device| device.name().ok());
    let mut devices = host
        .output_devices()
        .map_err(|error| format!("Could not list audio outputs: {error}"))?
        .filter_map(|device| device.name().ok())
        .collect::<Vec<_>>();
    devices.sort_unstable();
    devices.dedup();
    Ok((devices, default_output))
}

fn load_audio_output(app_data_dir: &Path) -> Result<Option<String>, String> {
    match fs::read_to_string(app_data_dir.join(AUDIO_OUTPUT_FILE)) {
        Ok(output) if !output.is_empty() => Ok(Some(output)),
        Ok(_) => Ok(None),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(format!("Could not read the audio output setting: {error}")),
    }
}

fn change_audio_output(
    app_data_dir: &Path,
    current: &mut Option<String>,
    output: Option<String>,
) -> Result<bool, String> {
    let (devices, _) = enumerate_audio_outputs()?;
    validate_audio_output(output.as_deref(), &devices)?;
    if *current == output {
        return Ok(false);
    }
    let path = app_data_dir.join(AUDIO_OUTPUT_FILE);
    if let Some(output) = output.as_deref() {
        fs::write(path, output)
            .map_err(|error| format!("Could not save the audio output setting: {error}"))?;
    } else {
        match fs::remove_file(path) {
            Ok(()) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => {
                return Err(format!("Could not reset the audio output setting: {error}"));
            }
        }
    }
    *current = output;
    Ok(true)
}

fn validate_audio_output(output: Option<&str>, devices: &[String]) -> Result<(), String> {
    match output {
        None => Ok(()),
        Some(output) if devices.iter().any(|device| device == output) => Ok(()),
        Some(output) => Err(format!("Audio output is not available: {output}")),
    }
}

fn available_audio_output(output: Option<&str>) -> Option<String> {
    let output = output?;
    match enumerate_audio_outputs() {
        Ok((devices, _)) if devices.iter().any(|device| device == output) => {
            Some(output.to_owned())
        }
        Ok(_) => {
            log::warn!("saved audio output is unavailable, using the system default: {output}");
            None
        }
        Err(error) => {
            log::warn!(
                "could not validate the saved audio output, using the system default: {error}"
            );
            None
        }
    }
}

fn reject_command(command: DaemonCommand, message: &str) {
    let reply = match command {
        DaemonCommand::Authenticate(reply)
        | DaemonCommand::Play(reply)
        | DaemonCommand::Pause(reply)
        | DaemonCommand::Next(reply)
        | DaemonCommand::Previous(reply)
        | DaemonCommand::SetVolume(_, reply)
        | DaemonCommand::SetAudioOutput(_, reply)
        | DaemonCommand::Load(_, reply)
        | DaemonCommand::Queue(_, reply)
        | DaemonCommand::Restart(reply) => Some(reply),
        DaemonCommand::ResolvedNext(..) | DaemonCommand::Shutdown => None,
    };
    if let Some(reply) = reply {
        let _ = reply.send(Err(message.to_owned()));
    }
}

fn set_error(playback_tx: &watch::Sender<PlaybackState>, error: String) {
    playback_tx.send_modify(|state| {
        state.status = PlayerStatus::Error;
        state.connected = false;
        state.active = false;
        state.error = Some(error);
    });
}

fn collection_playback_order(uris: &[String], start_uri: &str) -> Result<Vec<String>, String> {
    let start = uris
        .iter()
        .position(|uri| uri == start_uri)
        .ok_or_else(|| "The selected track is not in this collection".to_owned())?;
    uris[start..]
        .iter()
        .chain(&uris[..start])
        .take(100)
        .map(|uri| {
            validate_playable_uri(uri)?;
            Ok(uri.clone())
        })
        .collect()
}

fn validate_playable_uri(uri: &str) -> Result<(), String> {
    match SpotifyUri::from_uri(uri) {
        Ok(parsed @ (SpotifyUri::Track { .. } | SpotifyUri::Episode { .. }))
            if parsed.to_uri().is_ok_and(|canonical| canonical == uri) =>
        {
            Ok(())
        }
        _ => Err("Unsupported or malformed Spotify URI".to_owned()),
    }
}

fn percent_to_librespot(volume: u8) -> u16 {
    ((u32::from(volume) * u32::from(u16::MAX) + 50) / 100) as u16
}

fn librespot_to_percent(volume: u16) -> u8 {
    ((u32::from(volume) * 100 + u32::from(u16::MAX) / 2) / u32::from(u16::MAX)) as u8
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn collection_playback_should_continue_after_selected_track_and_wrap() {
        let uris = [
            "spotify:track:4uLU6hMCjMI75M1A2tKUQC",
            "spotify:track:2takcwOaAZWiXQijPHIx7B",
            "spotify:track:7ouMYWpwJ422jRcDASZB7P",
        ]
        .map(str::to_owned);

        assert_eq!(
            collection_playback_order(&uris, "spotify:track:2takcwOaAZWiXQijPHIx7B").unwrap(),
            [
                "spotify:track:2takcwOaAZWiXQijPHIx7B",
                "spotify:track:7ouMYWpwJ422jRcDASZB7P",
                "spotify:track:4uLU6hMCjMI75M1A2tKUQC"
            ]
        );
    }

    #[test]
    fn playable_uri_should_reject_malformed_track_id() {
        assert_eq!(
            validate_playable_uri("spotify:track:not-a-track").unwrap_err(),
            "Unsupported or malformed Spotify URI"
        );
    }

    #[test]
    fn audio_output_should_accept_an_available_device() {
        let devices = vec!["USB headphones".to_owned()];

        assert_eq!(
            validate_audio_output(Some("USB headphones"), &devices),
            Ok(())
        );
    }

    #[test]
    fn audio_output_should_reject_an_unavailable_device() {
        let error = validate_audio_output(Some("Missing speakers"), &[]).unwrap_err();

        assert_eq!(error, "Audio output is not available: Missing speakers");
    }

    #[test]
    fn playable_uri_should_reject_trailing_components() {
        assert!(validate_playable_uri("spotify:track:4uLU6hMCjMI75M1A2tKUQC:garbage").is_err());
    }

    #[test]
    fn volume_conversion_should_preserve_percent_boundaries() {
        assert_eq!(librespot_to_percent(percent_to_librespot(0)), 0);
        assert_eq!(librespot_to_percent(percent_to_librespot(65)), 65);
        assert_eq!(librespot_to_percent(percent_to_librespot(100)), 100);
    }
}
