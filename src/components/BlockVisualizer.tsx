import { useEffect, useRef, useState } from "react";
import { useAudioSpectrum } from "../hooks/useAudioSpectrum";

const emptyBands = Array<number>(12).fill(0);

export function BlockVisualizer({ vertical }: { vertical?: boolean }) {
  const spectrum = useAudioSpectrum();
  const [colorCycle, setColorCycle] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const bands = spectrum?.active && spectrum.bands.length === 12 ? spectrum.bands : emptyBands;
  const cols = vertical ? 9 : 28;
  const rows = vertical ? 24 : 7;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    // Handle high DPI
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.floor(rect.width * dpr);
    const height = Math.floor(rect.height * dpr);

    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    if (width === 0 || height === 0) return;

    ctx.clearRect(0, 0, width, height);

    // Compute interpolated bands
    const interpolated: number[] = [];
    for (let i = 0; i < cols; i++) {
      const position = (i / (cols - 1)) * (bands.length - 1);
      const index1 = Math.floor(position);
      const index2 = Math.min(index1 + 1, bands.length - 1);
      const fraction = position - index1;
      const val = bands[index1] * (1 - fraction) + bands[index2] * fraction;
      interpolated.push(Math.pow(Math.max(0, Math.min(1, val)), 0.82));
    }

    // Colors
    const computed = getComputedStyle(canvas);
    const rawRgb = computed.getPropertyValue("--visualizer-rgb").trim() || "245, 240, 230";
    const [r, g, b] = rawRgb.split(",").map((n) => parseInt(n.trim(), 10) || 240);

    const gapX = Math.max(1, 2 * dpr);
    const gapY = Math.max(1, 2 * dpr);
    const cellW = (width - gapX * (cols - 1)) / cols;
    const cellH = (height - gapY * (rows - 1)) / rows;
    const radius = Math.min(cellW, cellH) * 0.15;

    const now = performance.now() * 0.001;

    for (let row = 0; row < rows; row++) {
      const rowThreshold = (rows - row - 0.35) / rows;
      const y = row * (cellH + gapY);

      for (let col = 0; col < cols; col++) {
        const x = col * (cellW + gapX);
        const val = interpolated[col];
        const isLit = val >= rowThreshold;

        ctx.beginPath();
        if (typeof ctx.roundRect === "function") {
          ctx.roundRect(x, y, cellW, cellH, radius);
        } else {
          ctx.rect(x, y, cellW, cellH);
        }

        if (colorCycle) {
          const index = row * cols + col;
          const seed = (index * 73 + 41) % 101;
          const hue = ((seed * 137.508) + now * 60) % 360;
          if (isLit) {
            ctx.fillStyle = `hsl(${hue}, 100%, 65%)`;
            ctx.shadowColor = `hsl(${hue}, 100%, 60%)`;
            ctx.shadowBlur = 6 * dpr;
          } else {
            ctx.fillStyle = `hsla(${hue}, 100%, 60%, 0.08)`;
            ctx.shadowBlur = 0;
          }
        } else {
          if (isLit) {
            ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
            ctx.shadowColor = `rgba(${r}, ${g}, ${b}, 0.8)`;
            ctx.shadowBlur = 6 * dpr;
          } else {
            ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.045)`;
            ctx.shadowBlur = 0;
          }
        }

        ctx.fill();
      }
    }
  }, [bands, cols, rows, colorCycle]);

  return (
    <button
      type="button"
      className={`block-visualizer ${colorCycle ? "is-color-cycle" : ""} ${vertical ? "is-vertical" : ""}`}
      aria-label={colorCycle ? "Use artwork visualizer colors" : "Use cycling RGB visualizer colors"}
      aria-pressed={colorCycle}
      onClick={() => setColorCycle((active) => !active)}
      style={{ padding: 0, overflow: "hidden" }}
    >
      <canvas
        ref={canvasRef}
        style={{
          width: "100%",
          height: "100%",
          display: "block",
          pointerEvents: "none",
        }}
      />
    </button>
  );
}
