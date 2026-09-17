import type { ArtworkPalette } from "../hooks/useArtworkColor";
import type { PlaybackState } from "../lib/player";

export interface BackgroundPresentation {
  imageUrl: string | null;
  opacity: number;
  adaptColors: boolean;
  palette: ArtworkPalette;
  positionX?: number;
  positionY?: number;
  fit?: "cover" | "contain";
  zoom?: number;
}

export interface ThemeProps {
  playback: PlaybackState;
  background: BackgroundPresentation;
  albumQueue: import("../lib/player").Track[][];
  onToggle: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onPlayTrack?: (track: any, tracks: any[]) => void;
  onQueueTrack?: (track: any) => Promise<void>;
  onQueueAlbum?: (tracks: any[]) => void;
}
