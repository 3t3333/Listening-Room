import { invoke } from "@tauri-apps/api/core";
import type { Playlist, Track } from "./player";

// Compiled for legacy development builds only; the player release does not register these commands.
export const legacyWebApi = {
  playlists: () => invoke<Playlist[]>("get_playlists"),
  playlistTracks: (id: string) => invoke<Track[]>("get_playlist_tracks", { id }),
  playUri: (uri: string) => invoke<void>("play_uri", { uri }),
};
