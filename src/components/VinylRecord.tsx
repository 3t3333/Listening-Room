import { Disc3 } from "lucide-react";
import type { Track } from "../lib/player";
import { getVinylColorStyle } from "../lib/vinylColors";

export function VinylRecord({
  track,
  isPlaying,
  vinylColor,
}: {
  track: Track | null;
  isPlaying: boolean;
  vinylColor?: string | null;
}) {
  return (
    <div className={`front-vinyl ${isPlaying ? "is-playing" : ""}`} style={getVinylColorStyle(vinylColor)}>
      <div className="front-vinyl-grooves" />
      <div className="front-vinyl-label">
        {track?.imageUrl ? <img src={track.imageUrl} alt="" /> : <Disc3 />}
      </div>
      <i />
    </div>
  );
}
