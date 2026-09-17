import { Library } from "lucide-react";
import type { CSSProperties } from "react";
import { CustomBackground } from "../components/CustomBackground";
import { PlayerControls } from "../components/PlayerControls";
import { Turntable } from "../components/Turntable";
import { useArtworkColor } from "../hooks/useArtworkColor";
import type { ThemeProps } from "./types";

export function WarmRoomTheme({ playback, background, onToggle, onPrevious, onNext }: ThemeProps) {
  const track = playback.current;
  const artworkColor = useArtworkColor(track?.imageUrl);
  const [red, green, blue] = background.adaptColors && background.imageUrl ? background.palette.primary : artworkColor;
  const ambient = [
    Math.round(38 * 0.7 + red * 0.3),
    Math.round(39 * 0.7 + green * 0.3),
    Math.round(42 * 0.7 + blue * 0.3),
  ];
  const style = { "--ambient-rgb": ambient.join(", ") } as CSSProperties;

  return (
    <section className="theme-scene warm-room-theme" style={style}>
      <CustomBackground 
        imageUrl={background.imageUrl} 
        opacity={background.opacity} 
        positionX={background.positionX} 
        positionY={background.positionY} 
        fit={background.fit} 
        zoom={background.zoom} 
      />
      <div className="warm-title">
        <h1>{track?.name ?? "The room is quiet"}</h1>
        <p>{track?.artist ?? "Connect Spotify and put on a record."}</p>
      </div>

      <Turntable track={track} isPlaying={playback.isPlaying} />

      <aside className="warm-controls-panel">
        <div className="warm-track-copy">
          <strong>{track?.name ?? "Nothing queued"}</strong>
          <small>{track?.artist ?? "Select something from your shelf"}</small>
        </div>
        <PlayerControls playback={playback} onToggle={onToggle} onPrevious={onPrevious} onNext={onNext} />
      </aside>

      <aside className="warm-next">
        <div className="warm-next-art">{playback.next?.imageUrl ? <img src={playback.next.imageUrl} alt="" /> : <Library />}</div>
        <div><strong>{playback.next?.name ?? "Queue is empty"}</strong><small>{playback.next?.artist ?? ""}</small></div>
      </aside>
    </section>
  );
}
