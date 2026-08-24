import type { CSSProperties } from "react";
import type { AudioSpectrum } from "../hooks/useAudioSpectrum";

interface Props {
  spectrum: AudioSpectrum | null;
}

const emptyBands = Array<number>(12).fill(0);

export function AudioVisualizer({ spectrum }: Props) {
  const bands = spectrum?.active && spectrum.bands.length === 12 ? spectrum.bands : emptyBands;

  return (
    <div className="audio-visualizer is-live" aria-hidden="true">
      {bands.map((value, index) => (
        <i
          key={index}
          style={{
            "--bar-empty": `${(1 - Math.max(0, Math.min(1, value))) * 100}%`,
          } as CSSProperties}
        >
          <span />
        </i>
      ))}
    </div>
  );
}
