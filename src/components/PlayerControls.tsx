import { Pause, Play, SkipBack, SkipForward } from "lucide-react";
import type { PlaybackState } from "../lib/spotify";
import { Button } from "./ui/button";

interface Props {
  playback: PlaybackState;
  onToggle: () => void;
  onPrevious: () => void;
  onNext: () => void;
  compact?: boolean;
}

export function PlayerControls({ playback, onToggle, onPrevious, onNext, compact }: Props) {
  return (
    <div className={`player-controls ${compact ? "is-compact" : ""}`}>
      <Button aria-label="Previous track" variant="ghost" size="icon" disabled={!playback.canSkipPrevious} onClick={onPrevious}><SkipBack /></Button>
      <Button className="primary-control" aria-label={playback.isPlaying ? "Pause" : "Play"} size="icon" disabled={playback.isPlaying ? !playback.canPause : !playback.canPlay} onClick={onToggle}>
        {playback.isPlaying ? <Pause fill="currentColor" /> : <Play fill="currentColor" />}
      </Button>
      <Button aria-label="Next track" variant="ghost" size="icon" disabled={!playback.canSkipNext} onClick={onNext}><SkipForward /></Button>
    </div>
  );
}
