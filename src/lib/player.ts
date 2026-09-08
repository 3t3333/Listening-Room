import { invoke } from "@tauri-apps/api/core";
import { mapTrackArtwork } from "./customArtwork";

export interface Track {
  name: string;
  artist: string;
  imageUrl: string | null;
  originalImageUrl?: string | null;
  uri: string | null;
  durationMs: number | null;
}

export interface PlaybackState {
  status: "authenticationRequired" | "connecting" | "ready" | "reconnecting" | "error";
  connected: boolean;
  active: boolean;
  isPlaying: boolean;
  current: Track | null;
  next: Track | null;
  deviceName: string | null;
  volumePercent: number | null;
  canPlay: boolean;
  canPause: boolean;
  canSkipNext: boolean;
  canSkipPrevious: boolean;
  error: string | null;
}

export interface Playlist {
  id: string;
  name: string;
  imageUrl: string | null;
}

export interface AlbumImport {
  name: string;
  artist: string;
  artistImageUrl: string | null;
  year: number | null;
  tracks: Track[];
}

export interface AudioOutputState {
  devices: string[];
  defaultOutput: string | null;
  selected: string | null;
}

export const player = {
  connect: () => invoke<void>("connect_spotify"),
  playback: () => invoke<PlaybackState>("get_playback_state"),
  queue: () => invoke<Track[]>("get_queue").then(tracks => tracks.map(t => mapTrackArtwork(t) as Track)),
  getAlbumTracks: (url: string) => invoke<AlbumImport>("get_album_tracks", { url }).then(album => ({
    ...album,
    tracks: album.tracks.map(t => mapTrackArtwork(t) as Track)
  })),
  play: () => invoke<void>("play"),
  pause: () => invoke<void>("pause"),
  next: () => invoke<void>("next"),
  previous: () => invoke<void>("previous"),
  playCollection: (uris: string[], startUri: string) => invoke<void>("play_collection", { uris, startUri }),
  queueUri: (uri: string) => invoke<void>("queue_uri", { uri }),
  setVolume: (volume: number) => invoke<void>("set_volume", { volume }),
  audioOutputs: () => invoke<AudioOutputState>("get_audio_outputs"),
  setAudioOutput: (output: string | null) => invoke<void>("set_audio_output", { output }),
};
