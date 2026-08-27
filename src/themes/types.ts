import type { ArtworkPalette } from "../hooks/useArtworkColor";
import type { PlaybackState } from "../lib/player";

export interface BackgroundPresentation {
  imageUrl: string | null;
  opacity: number;
  adaptColors: boolean;
  palette: ArtworkPalette;
}

export interface ThemeProps {
  playback: PlaybackState;
  background: BackgroundPresentation;
  onToggle: () => void;
  onPrevious: () => void;
  onNext: () => void;
}
