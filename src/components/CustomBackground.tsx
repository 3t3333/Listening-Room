import { useEffect, useRef, useState, type CSSProperties } from "react";

export function CustomBackground({
  imageUrl,
  opacity,
  positionX = 50,
  positionY = 50,
  fit = "cover",
  zoom = 100,
  className = "",
}: {
  imageUrl: string | null;
  opacity: number;
  positionX?: number;
  positionY?: number;
  fit?: "cover" | "contain";
  zoom?: number;
  className?: string;
}) {
  const [currentUrl, setCurrentUrl] = useState<string | null>(imageUrl);
  const [prevUrl, setPrevUrl] = useState<string | null>(null);
  const [prevOpacity, setPrevOpacity] = useState<number>(opacity);
  const [prevFraming, setPrevFraming] = useState({ positionX, positionY, fit, zoom });
  const [isCrossFading, setIsCrossFading] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (imageUrl !== currentUrl) {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      setPrevUrl(currentUrl);
      setPrevOpacity(opacity);
      setPrevFraming({ positionX, positionY, fit, zoom });
      setCurrentUrl(imageUrl);
      setIsCrossFading(true);

      timerRef.current = window.setTimeout(() => {
        setIsCrossFading(false);
        setPrevUrl(null);
      }, 650);
    }
  }, [imageUrl, currentUrl, opacity, positionX, positionY, fit, zoom]);

  if (!currentUrl && !prevUrl) return null;

  return (
    <div className={`custom-background-container ${className}`} aria-hidden="true">
      {/* Ambient blurred backdrop for contain mode to eliminate harsh black sidebars */}
      {fit === "contain" && currentUrl && (
        <img
          key={`ambient-${currentUrl}`}
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
          aria-hidden="true"
        />
      )}

      {prevUrl && (
        <img
          key={`prev-${prevUrl}`}
          className="custom-background crossfade-prev"
          src={prevUrl}
          alt=""
          style={{
            "--from-opacity": prevOpacity,
            objectFit: prevFraming.fit,
            objectPosition: `${prevFraming.positionX}% ${prevFraming.positionY}%`,
            transform: prevFraming.zoom > 100 ? `scale(${prevFraming.zoom / 100})` : undefined,
            transformOrigin: `${prevFraming.positionX}% ${prevFraming.positionY}%`,
            animation: "custom-bg-fade-out 0.6s ease-in-out forwards",
          } as CSSProperties}
          decoding="async"
          draggable={false}
        />
      )}
      {currentUrl && (
        <img
          key={`curr-${currentUrl}`}
          className="custom-background crossfade-curr"
          src={currentUrl}
          alt=""
          style={{
            "--to-opacity": opacity,
            opacity: opacity,
            objectFit: fit,
            objectPosition: `${positionX}% ${positionY}%`,
            transform: zoom > 100 ? `scale(${zoom / 100})` : undefined,
            transformOrigin: `${positionX}% ${positionY}%`,
            animation: isCrossFading ? "custom-bg-fade-in 0.6s ease-in-out forwards" : undefined,
          } as CSSProperties}
          decoding="async"
          draggable={false}
        />
      )}
    </div>
  );
}
