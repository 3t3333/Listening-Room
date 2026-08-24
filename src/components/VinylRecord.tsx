import { Disc3 } from "lucide-react";
import type { Track } from "../lib/spotify";

export function VinylRecord({ track, isPlaying }: { track: Track | null; isPlaying: boolean }) {
  return (
    <div className={`front-vinyl ${isPlaying ? "is-playing" : ""}`}>
      <div className="front-vinyl-grooves" />
      <div className="front-vinyl-label">
        {track?.imageUrl ? <img src={track.imageUrl} alt="" /> : <Disc3 />}
      </div>
      <i />
    </div>
  );
}
