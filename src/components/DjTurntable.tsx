import { Disc3 } from "lucide-react";
import type { Track } from "../lib/player";

export function DjTurntable({
  track,
  isActive,
  isAppPlaying,
  align,
  isDark,
  onToggleDark,
}: {
  track: Track | null;
  isActive: boolean;
  isAppPlaying: boolean;
  align: "left" | "right";
  isDark?: boolean;
  onToggleDark?: () => void;
}) {
  return (
    <div id={`turntable-platter-${align}`} className={`turntable turntable-${align}} ${isDark ? "is-dark" : ""}`} onClick={onToggleDark} style={{ cursor: 'pointer' }}>
      <div className="turntable-chassis" onClick={(e) => e.stopPropagation()}>
        {/* Platter & Vinyl */}
        <div className="turntable-platter-area">
          <div className="platter-base" />
          <div className="strobe-dots" />
          <div className="slipmat" />
          
          {track && (
            <div className={`vinyl-record ${isAppPlaying ? "spinning" : ""}`}>
              <div className="vinyl-grooves" />
              <div className="vinyl-label">
                {track.imageUrl ? (
                  <img src={track.imageUrl} alt="Record Label" draggable={false} />
                ) : (
                  <div className="vinyl-label-placeholder"><Disc3 size={32} strokeWidth={1} /></div>
                )}
                <div className="spindle-hole" />
              </div>
              <div className="vinyl-shine" />
            </div>
          )}
          
          <div className="spindle" />
        </div>

        {/* Controls */}
        <div className="turntable-controls">
          <div className="power-dial">
            <div className={`power-strobe-light ${isActive ? "on" : ""}`} />
          </div>
          <div className="start-stop-button" />
          <div className="speed-buttons">
            <span /> <span />
          </div>
        </div>

        {/* Pitch Slider */}
        <div className="pitch-slider">
          <div className="pitch-track" />
          <div className="pitch-fader" />
        </div>

        {/* Tonearm Assembly */}
        <div className="tonearm-assembly">
          <div className="tonearm-base" />
          <div className="tonearm-counterweight" />
          {/* The pivoting tonearm */}
          <div className={`tonearm-arm ${isActive ? "dropped" : "rested"}`}>
            {/* The S-curve SVG approximation using CSS or inline SVG */}
            <svg viewBox="0 0 100 300" className="tonearm-svg" preserveAspectRatio="none">
              <path 
                d="M50,20 L50,260" 
                fill="none" 
                stroke="#c0c0c0" 
                strokeWidth="10" 
                strokeLinecap="round" 
              />
              {/* Headshell */}
              <rect x="40" y="260" width="20" height="35" fill="#222" rx="2" transform="rotate(-15, 50, 260)" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}
