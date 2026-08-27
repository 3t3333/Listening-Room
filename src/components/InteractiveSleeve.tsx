import { Disc3 } from "lucide-react";
import { useEffect, useRef, type PointerEvent } from "react";
import type { Track } from "../lib/player";
import { cn } from "../lib/utils";

export function InteractiveSleeve({ track, className }: { track: Track | null; className?: string }) {
  const bounds = useRef<DOMRect | null>(null);
  const frame = useRef(0);

  useEffect(() => () => window.cancelAnimationFrame(frame.current), []);

  function rememberBounds(event: PointerEvent<HTMLDivElement>) {
    bounds.current = event.currentTarget.getBoundingClientRect();
  }

  function tiltArtwork(event: PointerEvent<HTMLDivElement>) {
    const surface = event.currentTarget;
    if ((event.buttons & 2) !== 0) {
      resetArtwork(event);
      return;
    }
    const currentBounds = bounds.current ?? surface.getBoundingClientRect();
    const horizontal = clamp((event.clientX - currentBounds.left) / currentBounds.width);
    const vertical = clamp((event.clientY - currentBounds.top) / currentBounds.height);
    window.cancelAnimationFrame(frame.current);
    frame.current = window.requestAnimationFrame(() => {
      surface.style.setProperty("--tilt-x", `${(0.5 - vertical) * 42}deg`);
      surface.style.setProperty("--tilt-y", `${(horizontal - 0.5) * 42}deg`);
      surface.style.setProperty("--pan-x", "0px");
      surface.style.setProperty("--pan-y", "0px");
      surface.style.setProperty("--shine-x", `${horizontal * 100}%`);
      surface.style.setProperty("--shine-y", `${vertical * 100}%`);
    });
  }

  function resetArtwork(event: PointerEvent<HTMLDivElement>) {
    const surface = event.currentTarget;
    window.cancelAnimationFrame(frame.current);
    surface.style.setProperty("--tilt-x", "0deg");
    surface.style.setProperty("--tilt-y", "0deg");
    surface.style.setProperty("--pan-x", "0px");
    surface.style.setProperty("--pan-y", "0px");
    surface.style.setProperty("--shine-x", "50%");
    surface.style.setProperty("--shine-y", "50%");
    bounds.current = null;
  }

  return (
    <div className={cn("track-artwork-interaction", className)} onPointerEnter={rememberBounds} onPointerMove={tiltArtwork} onPointerLeave={resetArtwork} onPointerCancel={resetArtwork}>
      <div className="track-artwork-card">
        <span className="track-artwork-depth" />
        <span className="track-artwork-edge track-artwork-edge-top" />
        <span className="track-artwork-edge track-artwork-edge-left" />
        <span className="track-artwork-edge track-artwork-edge-right" />
        <span className="track-artwork-edge track-artwork-edge-bottom" />
        {track?.imageUrl ? <img src={track.imageUrl} alt={`${track.name} cover`} decoding="async" draggable={false} /> : <Disc3 />}
        <span className="track-artwork-plastic" />
        <span className="track-artwork-shine" />
      </div>
    </div>
  );
}

function clamp(value: number) {
  return Math.max(0, Math.min(1, value));
}
