import { Pause, Play, SkipBack, SkipForward, Volume1, Volume2, VolumeX } from "lucide-react";
import { useEffect, useState, type CSSProperties } from "react";
import { type PlaybackState, player } from "../lib/player";
import { mp3Player } from "../lib/mp3Player";
import { Button } from "./ui/button";

interface Props {
  playback: PlaybackState;
  onToggle: () => void;
  onPrevious: () => void;
  onNext: () => void;
  compact?: boolean;
}

export function PlayerControls({ playback, onToggle, onPrevious, onNext, compact }: Props) {
  const initialVolume = playback.volumePercent ?? 65;
  const [volume, setVolume] = useState(initialVolume);
  const [submittedVolume, setSubmittedVolume] = useState(initialVolume);
  const isMp3 = Boolean(playback.current?.audioId || playback.current?.uri?.startsWith("mp3:"));

  useEffect(() => {
    if (playback.volumePercent === null) return;
    setVolume(playback.volumePercent);
    setSubmittedVolume(playback.volumePercent);
  }, [playback.volumePercent]);

  useEffect(() => {
    if (!playback.active && !isMp3) return;
    const timer = window.setTimeout(() => {
      if (submittedVolume !== volume) {
        setSubmittedVolume(volume);
        if (isMp3) {
          mp3Player.setVolume(volume / 100);
        } else {
          player.setVolume(volume).catch(console.error);
        }
      }
    }, 100);
    return () => window.clearTimeout(timer);
  }, [playback.active, isMp3, volume, submittedVolume]);

  const VolumeIcon = volume === 0 ? VolumeX : volume < 50 ? Volume1 : Volume2;
  const volumeStyle = { "--volume-fill": `${volume}%` } as CSSProperties;

  const isVolumeActive = playback.active || isMp3;

  return (
    <div className={`player-controls-container ${compact ? "is-compact" : ""}`}>
      <div className={`player-controls ${compact ? "is-compact" : ""}`}>
        <Button aria-label="Previous track" variant="ghost" size="icon" disabled={!playback.canSkipPrevious} onClick={onPrevious}><SkipBack /></Button>
        <Button className="primary-control" aria-label={playback.isPlaying ? "Pause" : "Play"} size="icon" disabled={playback.isPlaying ? !playback.canPause : !playback.canPlay} onClick={onToggle}>
          {playback.isPlaying ? <Pause fill="currentColor" /> : <Play fill="currentColor" />}
        </Button>
        <Button aria-label="Next track" variant="ghost" size="icon" disabled={!playback.canSkipNext} onClick={onNext}><SkipForward /></Button>
      </div>

      <div className="volume-control">
        <button className="volume-trigger" type="button" disabled={!isVolumeActive} aria-label={`Volume ${volume}%`} title={`Volume ${volume}%`}>
          <VolumeIcon />
        </button>
        <div className="volume-panel" style={volumeStyle}>
          <input
            type="range"
            min="0"
            max="100"
            step="1"
            value={volume}
            disabled={!isVolumeActive}
            onChange={(event) => setVolume(Number(event.target.value))}
            aria-label="Playback volume"
            aria-valuetext={`${volume}%`}
          />
          <output aria-live="off">{volume}</output>
        </div>
      </div>
    </div>
  );
}
