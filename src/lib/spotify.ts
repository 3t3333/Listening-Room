import { invoke } from "@tauri-apps/api/core";

export interface Track {
  name: string;
  artist: string;
  imageUrl: string | null;
  uri: string | null;
  durationMs: number | null;
}

export interface PlaybackState {
  connected: boolean;
  isPlaying: boolean;
  current: Track | null;
  next: Track | null;
  deviceName: string | null;
  volumePercent: number | null;
  canPlay: boolean;
  canPause: boolean;
  canSkipNext: boolean;
  canSkipPrevious: boolean;
}

export interface Playlist {
  id: string;
  name: string;
  imageUrl: string | null;
}

export const spotify = {
  connect: () => invoke<void>("connect_spotify"),
  playback: () => invoke<PlaybackState>("get_playback_state"),
  playlists: () => invoke<Playlist[]>("get_playlists"),
  playlistTracks: (id: string) => invoke<Track[]>("get_playlist_tracks", { id }),
  queue: () => invoke<Track[]>("get_queue"),
  play: () => invoke<void>("play"),
  pause: () => invoke<void>("pause"),
  next: () => invoke<void>("next"),
  previous: () => invoke<void>("previous"),
  playUri: (uri: string) => invoke<void>("play_uri", { uri }),
  playCollection: (uris: string[], startUri: string) => invoke<void>("play_collection", { uris, startUri }),
  queueUri: (uri: string) => invoke<void>("queue_uri", { uri }),
  setVolume: (volume: number) => invoke<void>("set_volume", { volume }),
};
