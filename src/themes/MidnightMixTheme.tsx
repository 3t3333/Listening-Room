import type { CSSProperties } from "react";
import { Disc3 } from "lucide-react";
import { AudioVisualizer } from "../components/AudioVisualizer";
import { CustomBackground } from "../components/CustomBackground";
import { PlayerControls } from "../components/PlayerControls";
import { TrackDetailsDialog } from "../components/TrackDetailsDialog";
import { VinylRecord } from "../components/VinylRecord";
import { useArtworkPalette } from "../hooks/useArtworkColor";
import type { ThemeProps } from "./types";

export function MidnightMixTheme({ playback, background, onToggle, onPrevious, onNext }: ThemeProps) {
  const track = playback.current;
  const artworkPalette = useArtworkPalette(track?.imageUrl);
  const palette = background.adaptColors && background.imageUrl ? background.palette : artworkPalette;
  const { primary: [red, green, blue], accent: [accentRed, accentGreen, accentBlue] } = palette;
  const style = {
    "--ambient-rgb": `${red}, ${green}, ${blue}`,
    "--visualizer-rgb": `${accentRed}, ${accentGreen}, ${accentBlue}`,
  } as CSSProperties;

  return (
    <section className="theme-scene midnight-theme" style={style}>
      <CustomBackground imageUrl={background.imageUrl} opacity={background.opacity} />
      <div className="midnight-ambient" />
      <AudioVisualizer />

      <div className="midnight-stack">
        <TrackDetailsDialog track={track}>
          <div className="midnight-sleeve">
            <span className="midnight-sleeve-edge" />
            {track?.imageUrl ? <img src={track.imageUrl} alt={`${track.name} cover`} /> : <Disc3 />}
            <span className="midnight-sleeve-plastic" />
            <span className="midnight-sleeve-shine" />
          </div>
        </TrackDetailsDialog>
        <VinylRecord track={track} isPlaying={playback.isPlaying} />
      </div>

      <div className="midnight-meta">
        <div>
          <h1>{track?.name ?? "Nothing playing"}</h1>
          <p>{track?.artist ?? "Choose a record from your library"}</p>
        </div>
        <PlayerControls compact playback={playback} onToggle={onToggle} onPrevious={onPrevious} onNext={onNext} />
      </div>
    </section>
  );
}
