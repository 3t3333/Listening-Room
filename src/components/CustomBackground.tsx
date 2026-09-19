import { useEffect, useRef, useState, type CSSProperties } from "react";
import { isVideoMedia, type AmbientColorScheduleEntry } from "../lib/liveWallpaper";
import type { AmbientColor } from "../hooks/useArtworkColor";

export function CustomBackground({
  imageUrl,
  opacity,
  positionX = 50,
  positionY = 50,
  fit = "cover",
  zoom = 100,
  className = "",
  isPlaying = true,
  pauseVideoOnMusicPause = false,
  schedule,
  onDynamicColorChange,
}: {
  imageUrl: string | null;
  opacity: number;
  positionX?: number;
  positionY?: number;
  fit?: "cover" | "contain";
  zoom?: number;
  className?: string;
  isPlaying?: boolean;
  pauseVideoOnMusicPause?: boolean;
  schedule?: AmbientColorScheduleEntry[] | null;
  onDynamicColorChange?: (palette: { primary: AmbientColor; accent: AmbientColor }) => void;
}) {
  const [currentUrl, setCurrentUrl] = useState<string | null>(imageUrl);
  const [prevUrl, setPrevUrl] = useState<string | null>(null);
  const [prevOpacity, setPrevOpacity] = useState<number>(opacity);
  const [prevFraming, setPrevFraming] = useState({ positionX, positionY, fit, zoom });
  const [isCrossFading, setIsCrossFading] = useState(false);
  const timerRef = useRef<number | null>(null);

  const currentVideoRef = useRef<HTMLVideoElement>(null);
  const lastScheduleIndexRef = useRef<number>(-1);

  const isCurrentVideo = isVideoMedia(currentUrl);
  const isPrevVideo = isVideoMedia(prevUrl);

  useEffect(() => {
    if (imageUrl !== currentUrl) {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      setPrevUrl(currentUrl);
      setPrevOpacity(opacity);
      setPrevFraming({ positionX, positionY, fit, zoom });
      setCurrentUrl(imageUrl);
      setIsCrossFading(true);
      lastScheduleIndexRef.current = -1;

      timerRef.current = window.setTimeout(() => {
        setIsCrossFading(false);
        setPrevUrl(null);
      }, 650);
    }
  }, [imageUrl, currentUrl, opacity, positionX, positionY, fit, zoom]);

  // Resilient auto-resume handler for decoder buffer underruns, stall events, and loop points
  const handleAutoResume = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const video = e.currentTarget;
    const isHidden = document.hidden;
    const shouldPlay = !isHidden && opacity > 0 && (!pauseVideoOnMusicPause || isPlaying);
    if (shouldPlay && video.paused) {
      video.play().catch(() => {});
    }
  };

  const handleLoopEnd = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const video = e.currentTarget;
    video.currentTime = 0;
    const isHidden = document.hidden;
    const shouldPlay = !isHidden && opacity > 0 && (!pauseVideoOnMusicPause || isPlaying);
    if (shouldPlay) {
      video.play().catch(() => {});
    }
  };

  // Handle visibility changes (minimize, screen lock, switch apps) for extreme optimization
  useEffect(() => {
    function handleVisibilityChange() {
      const isHidden = document.hidden;
      const shouldPlay = !isHidden && opacity > 0 && (!pauseVideoOnMusicPause || isPlaying);
      const video = currentVideoRef.current;
      if (!video) return;

      if (shouldPlay) {
        if (video.paused) video.play().catch(() => {});
      } else {
        if (!video.paused) video.pause();
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [isPlaying, opacity, pauseVideoOnMusicPause]);

  // Sync video play/pause with music playback when pauseVideoOnMusicPause is enabled
  useEffect(() => {
    const isHidden = document.hidden;
    const shouldPlay = !isHidden && opacity > 0 && (!pauseVideoOnMusicPause || isPlaying);
    const video = currentVideoRef.current;
    if (!video) return;

    if (shouldPlay) {
      if (video.paused) video.play().catch(() => {});
    } else {
      if (!video.paused) video.pause();
    }
  }, [isPlaying, opacity, pauseVideoOnMusicPause, currentUrl]);

  // Watchdog: rescues 4K videos from GPU decoder pauses, loop hitches, or background throttling
  useEffect(() => {
    const isHidden = document.hidden;
    const shouldPlay = !isHidden && opacity > 0 && (!pauseVideoOnMusicPause || isPlaying);
    if (!shouldPlay) return;

    const interval = window.setInterval(() => {
      const video = currentVideoRef.current;
      if (video && video.paused) {
        video.play().catch(() => {});
      }
    }, 1500);

    return () => window.clearInterval(interval);
  }, [isPlaying, opacity, pauseVideoOnMusicPause, currentUrl]);

  // Dynamic timed ambient color driver: updates colors every 5 seconds as video plays
  function handleTimeUpdate() {
    const video = currentVideoRef.current;
    if (!video) return;

    // Enforce 60-second cutoff:
    // When video reaches or exceeds 60s, loop back to the beginning seamlessly
    if (video.currentTime >= 60) {
      video.currentTime = 0;
      video.play().catch(() => {});
      return;
    }

    if (!schedule || schedule.length === 0) return;
    const currentTime = video.currentTime;

    // Find the current schedule interval
    let activeIdx = 0;
    for (let i = schedule.length - 1; i >= 0; i--) {
      if (currentTime >= schedule[i].time) {
        activeIdx = i;
        break;
      }
    }

    if (activeIdx !== lastScheduleIndexRef.current) {
      lastScheduleIndexRef.current = activeIdx;
      const activeEntry = schedule[activeIdx];
      if (activeEntry) {
        if (onDynamicColorChange) {
          onDynamicColorChange({ primary: activeEntry.primary, accent: activeEntry.accent });
        }
        window.dispatchEvent(
          new CustomEvent("livewallpaper:dynamic-color", {
            detail: { primary: activeEntry.primary, accent: activeEntry.accent },
          })
        );
      }
    }
  }

  if (!currentUrl && !prevUrl) return null;

  const currentTransform = zoom > 100 ? `scale(${zoom / 100})` : undefined;
  const prevTransform = prevFraming.zoom > 100 ? `scale(${prevFraming.zoom / 100})` : undefined;

  return (
    <div className={`custom-background-container ${className}`} aria-hidden="true">
      {/* Ambient blurred backdrop for contain mode to eliminate harsh black sidebars */}
      {fit === "contain" && currentUrl && (
        isCurrentVideo ? (
          <div
            key={`ambient-glow-${currentUrl}`}
            className="custom-background-ambient"
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              background: "radial-gradient(ellipse at center, rgba(var(--ambient-rgb, 45, 55, 75), 0.7) 0%, rgba(10, 12, 16, 0.95) 75%)",
              opacity: opacity * 0.85,
              pointerEvents: "none",
              userSelect: "none",
            }}
          />
        ) : (
          <img
            key={`ambient-img-${currentUrl}`}
            className="custom-background-ambient"
            src={currentUrl}
            alt=""
            style={{
              position: "absolute",
              inset: "-10%",
              width: "120%",
              height: "120%",
              objectFit: "cover",
              objectPosition: `${positionX}% ${positionY}%`,
              filter: "blur(40px) brightness(0.65) saturate(1.2)",
              opacity: opacity * 0.75,
              pointerEvents: "none",
              userSelect: "none",
            }}
          />
        )
      )}

      {/* Outgoing Media (Cross-fade previous) */}
      {prevUrl && (
        isPrevVideo ? (
          <video
            key={`prev-video-${prevUrl}`}
            src={prevUrl}
            autoPlay
            loop
            muted
            playsInline
            preload="auto"
            disablePictureInPicture
            disableRemotePlayback
            onTimeUpdate={(e) => {
              if (e.currentTarget.currentTime >= 60) {
                e.currentTarget.currentTime = 0;
              }
            }}
            className="custom-background crossfade-prev"
            style={{
              "--from-opacity": prevOpacity,
              objectFit: prevFraming.fit,
              objectPosition: `${prevFraming.positionX}% ${prevFraming.positionY}%`,
              transform: prevTransform || "translate3d(0, 0, 0)",
              transformOrigin: `${prevFraming.positionX}% ${prevFraming.positionY}%`,
              animation: "custom-bg-fade-out 0.6s ease-in-out forwards",
              backfaceVisibility: "hidden",
              pointerEvents: "none",
              userSelect: "none",
            } as CSSProperties}
          />
        ) : (
          <img
            key={`prev-img-${prevUrl}`}
            className="custom-background crossfade-prev"
            src={prevUrl}
            alt=""
            style={{
              "--from-opacity": prevOpacity,
              objectFit: prevFraming.fit,
              objectPosition: `${prevFraming.positionX}% ${prevFraming.positionY}%`,
              transform: prevTransform,
              transformOrigin: `${prevFraming.positionX}% ${prevFraming.positionY}%`,
              animation: "custom-bg-fade-out 0.6s ease-in-out forwards",
            } as CSSProperties}
            decoding="async"
            draggable={false}
          />
        )
      )}

      {/* Incoming / Active Media */}
      {currentUrl && (
        isCurrentVideo ? (
          <video
            key={`curr-video-${currentUrl}`}
            ref={currentVideoRef}
            src={currentUrl}
            autoPlay
            loop
            muted
            playsInline
            preload="auto"
            disablePictureInPicture
            disableRemotePlayback
            onTimeUpdate={handleTimeUpdate}
            onPause={handleAutoResume}
            onWaiting={handleAutoResume}
            onStalled={handleAutoResume}
            onEnded={handleLoopEnd}
            className="custom-background crossfade-curr"
            style={{
              "--to-opacity": opacity,
              opacity: opacity,
              objectFit: fit,
              objectPosition: `${positionX}% ${positionY}%`,
              transform: currentTransform || "translate3d(0, 0, 0)",
              transformOrigin: `${positionX}% ${positionY}%`,
              animation: isCrossFading ? "custom-bg-fade-in 0.6s ease-in-out forwards" : undefined,
              backfaceVisibility: "hidden",
              pointerEvents: "none",
              userSelect: "none",
            } as CSSProperties}
          />
        ) : (
          <img
            key={`curr-img-${currentUrl}`}
            className="custom-background crossfade-curr"
            src={currentUrl}
            alt=""
            style={{
              "--to-opacity": opacity,
              opacity: opacity,
              objectFit: fit,
              objectPosition: `${positionX}% ${positionY}%`,
              transform: currentTransform,
              transformOrigin: `${positionX}% ${positionY}%`,
              animation: isCrossFading ? "custom-bg-fade-in 0.6s ease-in-out forwards" : undefined,
            } as CSSProperties}
            decoding="async"
            draggable={false}
          />
        )
      )}
    </div>
  );
}
