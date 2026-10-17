import { Disc3 } from "lucide-react";
import type { Track } from "../lib/player";
import { getVinylColorStyle } from "../lib/vinylColors";

export function VinylRecord({
  track,
  isPlaying,
  vinylColor,
  centerLabelUrl,
}: {
  track: Track | null;
  isPlaying: boolean;
  vinylColor?: string | null;
  centerLabelUrl?: string | null;
}) {
  const displayArt = centerLabelUrl || track?.imageUrl;
  return (
    <div className={`front-vinyl ${isPlaying ? "is-playing" : ""}`} style={getVinylColorStyle(vinylColor)}>
      <div className="front-vinyl-grooves" />
      <div className="front-vinyl-label">
        {displayArt ? <img src={displayArt} alt="" /> : <Disc3 />}
      </div>
      <i />
    </div>
  );
}
