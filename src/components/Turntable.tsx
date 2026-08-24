import { Disc3 } from "lucide-react";
import type { Track } from "../lib/spotify";
import { TrackDetailsDialog } from "./TrackDetailsDialog";

interface Props {
  track: Track | null;
  isPlaying: boolean;
}

export function Turntable({ track, isPlaying }: Props) {
  return (
    <div className="scene" aria-label="Turntable scene">
      <div className="jacket-stand">
        <div className="jacket-shadow" />
        <TrackDetailsDialog track={track}>
          <div className="jacket">
            {track?.imageUrl ? <img src={track.imageUrl} alt={`${track.name} artwork`} /> : <Disc3 />}
            <div className="jacket-glare" />
          </div>
        </TrackDetailsDialog>
        <div className="stand-lip" />
      </div>

      <div className="deck-wrap">
        <div className="deck-back" />
        <div className="deck">
          <div className="deck-brand">ROOM / 01</div>
          <div className="platter-shadow" />
          <div className={`platter ${isPlaying ? "is-playing" : ""}`}>
            <div className="record-grooves" />
            <div className="record-label">
              {track?.imageUrl && <img src={track.imageUrl} alt="" />}
            </div>
            <span className="spindle" />
          </div>
          <div className={`tonearm ${isPlaying ? "is-playing" : ""}`}>
            <span className="counterweight" />
            <span className="arm-shaft" />
            <span className="cartridge" />
          </div>
          <div className="power-light" />
          <div className="speed-switch"><span>33</span><i /></div>
        </div>
        <div className="deck-front" />
      </div>
    </div>
  );
}
