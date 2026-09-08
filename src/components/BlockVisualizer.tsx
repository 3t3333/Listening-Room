import { useMemo, useState, type CSSProperties } from "react";
import { useAudioSpectrum } from "../hooks/useAudioSpectrum";

const emptyBands = Array<number>(12).fill(0);
const colorMotion = Array.from({ length: 40 * 40 }, (_, index) => {
  const seed = (index * 73 + 41) % 101;
  return {
    "--rgb-phase": `${(seed * 137.508) % 360}deg`,
    "--rgb-speed": `${(1.05 + (seed % 17) * 0.055).toFixed(2)}s`,
    "--rgb-delay": `${(-0.08 * (seed % 23)).toFixed(2)}s`,
  } as CSSProperties;
});

export function BlockVisualizer({ vertical }: { vertical?: boolean }) {
  const spectrum = useAudioSpectrum();
  const [colorCycle, setColorCycle] = useState(false);
  const bands = spectrum?.active && spectrum.bands.length === 12 ? spectrum.bands : emptyBands;
  
  const cols = vertical ? 9 : 28;
  const rows = vertical ? 24 : 7;

  const interpolated = useMemo(() => {
    return Array.from({ length: cols }).map((_, i) => {
      const position = (i / (cols - 1)) * (bands.length - 1);
      const index1 = Math.floor(position);
      const index2 = Math.min(index1 + 1, bands.length - 1);
      const fraction = position - index1;
      const val = bands[index1] * (1 - fraction) + bands[index2] * fraction;
      return Math.pow(Math.max(0, Math.min(1, val)), 0.82);
    });
  }, [bands, cols]);

  return (
    <button
      type="button"
      className={`block-visualizer ${colorCycle ? "is-color-cycle" : ""} ${vertical ? "is-vertical" : ""}`}
      aria-label={colorCycle ? "Use artwork visualizer colors" : "Use cycling RGB visualizer colors"}
      aria-pressed={colorCycle}
      onClick={() => setColorCycle((active) => !active)}
    >
      {Array.from({ length: rows }).map((_, r) => {
        const rowThreshold = (rows - r - 0.35) / rows;
        return (
          <div key={r} className="block-row">
            {interpolated.map((val, c) => {
              const isLit = val >= rowThreshold;
              return <span key={c} className={`block-cell ${isLit ? "lit" : ""}`} style={colorMotion[r * cols + c]} />;
            })}
          </div>
        );
      })}
    </button>
  );
}
