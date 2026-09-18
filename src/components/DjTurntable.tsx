import { Disc3 } from "lucide-react";
import type { Track } from "../lib/player";
import { getVinylColorStyle } from "../lib/vinylColors";
import type { DjTurntableTheme, TonearmStyle } from "../hooks/useDjSettings";

export function DjTurntable({
  track,
  isActive,
  isAppPlaying,
  align,
  theme,
  isDark,
  onCycleTheme,
  onToggleDark,
  vinylColor,
  tonearmStyle = "technics-classic",
}: {
  track: Track | null;
  isActive: boolean;
  isAppPlaying: boolean;
  align: "left" | "right";
  theme?: DjTurntableTheme;
  isDark?: boolean;
  onCycleTheme?: () => void;
  onToggleDark?: () => void;
  vinylColor?: string | null;
  tonearmStyle?: TonearmStyle;
}) {
  const effectiveTheme: DjTurntableTheme = theme || (isDark ? "dark" : "light");
  const handleToggle = onCycleTheme || onToggleDark;

  return (
    <div 
      id={`turntable-platter-${align}`} 
      className={`turntable turntable-${align} theme-${effectiveTheme} ${effectiveTheme === "dark" || effectiveTheme === "glass-smoked" ? "is-dark" : ""}`} 
      onClick={handleToggle} 
      title="Click to cycle theme (Silver / Black / Clear Glass / Smoked Glass)"
      style={{ cursor: 'pointer' }}
    >
      <div className="turntable-chassis">
        {/* Platter & Vinyl */}
        <div className="turntable-platter-area">
          <div className="platter-base" />
          <div className="strobe-dots" />
          <div className="slipmat" />
          
          {track && (
            <div className={`vinyl-record ${isAppPlaying ? "spinning" : ""}`} style={getVinylColorStyle(vinylColor)}>
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
          <div className="tonearm-rest-post">
            <div className="tonearm-rest-clip" />
          </div>
          <div className="tonearm-cue-lever" />
          {/* The pivoting tonearm */}
          <div className={`tonearm-arm ${isActive ? "dropped" : "rested"} tonearm-${tonearmStyle}`}>
            <svg viewBox="0 0 90 220" className="tonearm-svg" preserveAspectRatio="xMidYMid meet">
              <defs>
                <filter id={`armShadow-${align}`} x="-30%" y="-30%" width="160%" height="160%">
                  <feDropShadow dx="2" dy="3.5" stdDeviation="2.5" floodColor="rgba(0,0,0,0.45)" />
                </filter>

                {/* Silver Theme Gradients */}
                <linearGradient id={`tubeGrad-light-${align}`} x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#71717a" />
                  <stop offset="25%" stopColor="#e4e4e7" />
                  <stop offset="50%" stopColor="#ffffff" />
                  <stop offset="75%" stopColor="#d4d4d8" />
                  <stop offset="100%" stopColor="#52525b" />
                </linearGradient>
                <linearGradient id={`cwGrad-light-${align}`} x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#3f3f46" />
                  <stop offset="25%" stopColor="#71717a" />
                  <stop offset="50%" stopColor="#e4e4e7" />
                  <stop offset="75%" stopColor="#a1a1aa" />
                  <stop offset="100%" stopColor="#27272a" />
                </linearGradient>

                {/* Dark Theme Gradients */}
                <linearGradient id={`tubeGrad-dark-${align}`} x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#18181b" />
                  <stop offset="30%" stopColor="#3f3f46" />
                  <stop offset="50%" stopColor="#71717a" />
                  <stop offset="70%" stopColor="#3f3f46" />
                  <stop offset="100%" stopColor="#09090b" />
                </linearGradient>
                <linearGradient id={`cwGrad-dark-${align}`} x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#18181b" />
                  <stop offset="30%" stopColor="#27272a" />
                  <stop offset="50%" stopColor="#52525b" />
                  <stop offset="70%" stopColor="#3f3f46" />
                  <stop offset="100%" stopColor="#09090b" />
                </linearGradient>

                {/* Clear Glass Theme Gradients */}
                <linearGradient id={`tubeGrad-glass-clear-${align}`} x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#94a3b8" />
                  <stop offset="25%" stopColor="#e2e8f0" />
                  <stop offset="50%" stopColor="#ffffff" />
                  <stop offset="75%" stopColor="#f8fafc" />
                  <stop offset="100%" stopColor="#64748b" />
                </linearGradient>
                <linearGradient id={`cwGrad-glass-clear-${align}`} x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#475569" />
                  <stop offset="30%" stopColor="#94a3b8" />
                  <stop offset="50%" stopColor="#f1f5f9" />
                  <stop offset="70%" stopColor="#cbd5e1" />
                  <stop offset="100%" stopColor="#334155" />
                </linearGradient>

                {/* Smoked Glass Theme Gradients */}
                <linearGradient id={`tubeGrad-glass-smoked-${align}`} x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#27272a" />
                  <stop offset="30%" stopColor="#52525b" />
                  <stop offset="50%" stopColor="#a1a1aa" />
                  <stop offset="70%" stopColor="#71717a" />
                  <stop offset="100%" stopColor="#18181b" />
                </linearGradient>
                <linearGradient id={`cwGrad-glass-smoked-${align}`} x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#1c1917" />
                  <stop offset="30%" stopColor="#292524" />
                  <stop offset="50%" stopColor="#57534e" />
                  <stop offset="70%" stopColor="#44403c" />
                  <stop offset="100%" stopColor="#0c0a09" />
                </linearGradient>

                {/* Cartridge Gradient */}
                <linearGradient id={`cartGrad-${align}`} x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#18181b" />
                  <stop offset="35%" stopColor="#27272a" />
                  <stop offset="65%" stopColor="#3f3f46" />
                  <stop offset="100%" stopColor="#09090b" />
                </linearGradient>

                {/* Gimbal Pivot Gradient */}
                <radialGradient id={`pivotGrad-${align}`} cx="38%" cy="38%" r="62%">
                  <stop offset="0%" stopColor="#ffffff" />
                  <stop offset="40%" stopColor="#d4d4d8" />
                  <stop offset="75%" stopColor="#71717a" />
                  <stop offset="100%" stopColor="#27272a" />
                </radialGradient>
              </defs>

              <g filter={`url(#armShadow-${align})`}>
                {/* 1. Rear Shaft & Counterweight */}
                <line 
                  x1="50" y1="36" x2="50" y2="8" 
                  stroke={`url(#tubeGrad-${effectiveTheme}-${align})`} 
                  strokeWidth="4.6" 
                  strokeLinecap="round" 
                />
                <circle cx="50" cy="8" r="2.4" fill="#71717a" />
                
                {/* Main Counterweight Cylinder */}
                <rect 
                  x="37" y="11" width="26" height="17" rx="2" 
                  fill={`url(#cwGrad-${effectiveTheme}-${align})`} 
                  stroke="#18181b" strokeWidth="0.8" 
                />
                {/* Weight Dial Ring */}
                <rect 
                  x="39.5" y="23.5" width="21" height="5" rx="1" 
                  fill="#111827" stroke="#374151" strokeWidth="0.5" 
                />
                {/* Scale Ticks */}
                <line x1="43" y1="24.5" x2="43" y2="28" stroke="#ffffff" strokeWidth="0.6" opacity="0.8" />
                <line x1="46.5" y1="24.5" x2="46.5" y2="28" stroke="#ffffff" strokeWidth="0.6" opacity="0.8" />
                <line x1="50" y1="24" x2="50" y2="28.5" stroke="#ef4444" strokeWidth="0.8" />
                <line x1="53.5" y1="24.5" x2="53.5" y2="28" stroke="#ffffff" strokeWidth="0.6" opacity="0.8" />
                <line x1="57" y1="24.5" x2="57" y2="28" stroke="#ffffff" strokeWidth="0.6" opacity="0.8" />

                {/* 2. Tonearm Tube (Thicker 4.6px gauge) */}
                {tonearmStyle === "straight-battle" ? (
                  <>
                    {/* Zero-Skip Straight Battle Tonearm Tube */}
                    <path 
                      d="M 50,36 L 34.5,193" 
                      fill="none" 
                      stroke={`url(#tubeGrad-${effectiveTheme}-${align})`} 
                      strokeWidth="4.6" 
                      strokeLinecap="round" 
                    />
                    {/* Specular Highlight along Tube */}
                    <path 
                      d="M 50,36 L 34.5,193" 
                      fill="none" 
                      stroke="#ffffff" 
                      strokeWidth="1.4" 
                      opacity="0.65" 
                      strokeLinecap="round" 
                    />
                  </>
                ) : (
                  <>
                    {/* Classic S-Shaped Tonearm Tube */}
                    <path 
                      d="M 50,36 C 50,68 64,96 61,128 C 58,158 38,172 34.5,193" 
                      fill="none" 
                      stroke={`url(#tubeGrad-${effectiveTheme}-${align})`} 
                      strokeWidth="4.6" 
                      strokeLinecap="round" 
                    />
                    {/* Specular Highlight along Tube */}
                    <path 
                      d="M 50,36 C 50,68 64,96 61,128 C 58,158 38,172 34.5,193" 
                      fill="none" 
                      stroke="#ffffff" 
                      strokeWidth="1.4" 
                      opacity="0.65" 
                      strokeLinecap="round" 
                    />
                  </>
                )}

                {/* 3 & 4. Headshell & Cartridge / Needle Assembly (Variant Styles) */}
                {tonearmStyle === "concorde-club" ? (
                  /* --- VARIANT 2: Ortofon Concorde Club Aerodynamic Needle --- */
                  <>
                    <rect 
                      x="-4.2" y="-2" width="8.4" height="4" rx="1" 
                      fill={`url(#cwGrad-${effectiveTheme}-${align})`} 
                      stroke="#18181b" strokeWidth="0.6" 
                      transform="translate(34.5, 193) rotate(22)" 
                    />
                    <g transform="translate(34.5, 193) rotate(22)">
                      {/* Aerodynamic jet taper body */}
                      <path 
                        d="M -3.6,2 L 3.6,2 C 3.4,10 2.6,19 1.5,25 L 0.8,29.5 L -0.8,29.5 L -1.5,25 C -2.6,19 -3.4,10 -3.6,2 Z" 
                        fill={`url(#cartGrad-${align})`} 
                        stroke="#09090b" strokeWidth="0.6" 
                      />
                      {/* Chrome Spine Highlight */}
                      <line x1="0" y1="3" x2="0" y2="24" stroke="#ffffff" strokeWidth="0.8" opacity="0.65" />

                      {/* Club Stylus Nose Cone (Bright Amber / Yellow-Orange) */}
                      <path 
                        d="M -1.6,23.5 L 1.6,23.5 L 1.1,29.5 L -1.1,29.5 Z" 
                        fill="#f59e0b" 
                        stroke="#d97706" strokeWidth="0.5" 
                      />
                      <line x1="0" y1="24" x2="0" y2="29" stroke="#ffffff" strokeWidth="0.7" />

                      {/* Cantilever */}
                      <line x1="0" y1="29.5" x2="0" y2="35" stroke="#ffffff" strokeWidth="1.3" strokeLinecap="round" />
                      
                      {/* Diamond Stylus Tip with neon glow */}
                      <circle cx="0" cy="35" r="1.3" fill="#ffffff" />
                      <circle cx="0" cy="35" r="2.8" fill="#f59e0b" opacity="0.45" />

                      {/* Concorde Ring-style Wire Finger Lift */}
                      <path 
                        d="M 1.2,7 C 5.5,6 12.5,10 11.5,17 C 10.8,21.5 7.5,22.5 5,20.5" 
                        fill="none" 
                        stroke={`url(#tubeGrad-${effectiveTheme}-${align})`} 
                        strokeWidth="1.3" 
                        strokeLinecap="round" 
                      />
                    </g>
                  </>
                ) : tonearmStyle === "audiophile-wedge" ? (
                  /* --- VARIANT 3: Audiophile Faceted Prism (Ortofon 2M / VM95 Style) --- */
                  <>
                    <rect 
                      x="-4.2" y="-2.5" width="8.4" height="5" rx="1" 
                      fill={`url(#cwGrad-${effectiveTheme}-${align})`} 
                      stroke="#18181b" strokeWidth="0.6" 
                      transform="translate(34.5, 193) rotate(-9.5)" 
                    />
                    <g transform="translate(34.5, 193) rotate(22)">
                      {/* Minimalist Top Mount Plate */}
                      <path 
                        d="M -3.8,1 L 3.8,1 L 3.5,11 L -3.5,11 Z" 
                        fill="#18181b" 
                        stroke="#52525b" strokeWidth="0.6" 
                      />
                      <circle cx="0" cy="6" r="1.1" fill="#71717a" />

                      {/* Faceted Body */}
                      <path 
                        d="M -4.2,10 L 4.2,10 L 3,21 L 0,25.5 L -3,21 Z" 
                        fill={`url(#cartGrad-${align})`} 
                        stroke="#09090b" strokeWidth="0.6" 
                      />
                      {/* Facet Lines */}
                      <line x1="-4.2" y1="10" x2="0" y2="25.5" stroke="#ffffff" strokeWidth="0.5" opacity="0.35" />
                      <line x1="4.2" y1="10" x2="0" y2="25.5" stroke="#ffffff" strokeWidth="0.5" opacity="0.35" />
                      <line x1="0" y1="10" x2="0" y2="25.5" stroke="#ffffff" strokeWidth="0.8" opacity="0.65" />

                      {/* Ruby Red Stylus Block */}
                      <polygon points="-2.2,20.5 2.2,20.5 1.4,26.5 -1.4,26.5" fill="#dc2626" stroke="#991b1b" strokeWidth="0.5" />
                      <line x1="0" y1="20.5" x2="0" y2="26" stroke="#fca5a5" strokeWidth="0.6" />

                      {/* Cantilever */}
                      <line x1="0" y1="26" x2="0" y2="33" stroke="#f1f5f9" strokeWidth="1.1" strokeLinecap="round" />
                      
                      {/* Diamond Stylus Tip with Ruby Aura */}
                      <circle cx="0" cy="33" r="1.3" fill="#ffffff" />
                      <circle cx="0" cy="33" r="2.5" fill="#ef4444" opacity="0.4" />

                      {/* Precision Machined Square-Angle Cue Finger Lift */}
                      <path 
                        d="M 3.5,4 L 10.5,4 C 12.5,4 13,7.5 11,9.5 L 7.5,9.5" 
                        fill="none" 
                        stroke={`url(#tubeGrad-${effectiveTheme}-${align})`} 
                        strokeWidth="1.3" 
                        strokeLinecap="round" 
                      />
                    </g>
                  </>
                ) : tonearmStyle === "straight-battle" ? (
                  /* --- VARIANT 4: Straight Battle Scratch Arm & Heavy-Duty Bullet Needle --- */
                  <>
                    <rect 
                      x="-4.6" y="-3" width="9.2" height="6" rx="1" 
                      fill="#27272a" 
                      stroke="#09090b" strokeWidth="0.8" 
                      transform="translate(34.5, 193) rotate(22)" 
                    />
                    <g transform="translate(34.5, 193) rotate(22)">
                      {/* Rugged Battle Headshell / Block */}
                      <path 
                        d="M -4.2,2 L 4.2,2 L 3.8,17 L 2.2,23.5 L -2.2,23.5 L -3.8,17 Z" 
                        fill="#18181b" 
                        stroke="#3f3f46" strokeWidth="0.7" 
                      />
                      {/* Industrial Grip Grooves */}
                      <line x1="-3" y1="6" x2="3" y2="6" stroke="#52525b" strokeWidth="0.7" />
                      <line x1="-3" y1="9.5" x2="3" y2="9.5" stroke="#52525b" strokeWidth="0.7" />
                      <line x1="-3" y1="13" x2="3" y2="13" stroke="#52525b" strokeWidth="0.7" />

                      {/* High-Vis Fluorescent Green Tracking Nose */}
                      <rect x="-2" y="22" width="4" height="4.5" rx="0.6" fill="#10b981" stroke="#059669" strokeWidth="0.5" />
                      <line x1="0" y1="22.5" x2="0" y2="26" stroke="#ffffff" strokeWidth="0.8" />

                      {/* Heavy-Duty Cantilever */}
                      <line x1="0" y1="25.5" x2="0" y2="33" stroke="#e4e4e7" strokeWidth="1.5" strokeLinecap="round" />
                      
                      {/* Diamond Stylus Tip with Emerald Glow */}
                      <circle cx="0" cy="33" r="1.4" fill="#ffffff" />
                      <circle cx="0" cy="33" r="2.8" fill="#10b981" opacity="0.45" />

                      {/* Rugged Squared-Off Battle Finger Lift */}
                      <path 
                        d="M 4,4 L 10.5,4 L 11.5,13 L 7.5,14" 
                        fill="none" 
                        stroke={`url(#tubeGrad-${effectiveTheme}-${align})`} 
                        strokeWidth="1.5" 
                        strokeLinecap="round" 
                        strokeLinejoin="round" 
                      />
                    </g>
                  </>
                ) : (
                  /* --- VARIANT 1: Technics Classic SME Headshell & Shure M44-7 Cartridge --- */
                  <>
                    <rect 
                      x="-4.5" y="-2.5" width="9" height="5" rx="1" 
                      fill={`url(#cwGrad-${effectiveTheme}-${align})`} 
                      stroke="#18181b" strokeWidth="0.6" 
                      transform="translate(34.5, 193) rotate(-9.5)" 
                    />
                    <g transform="translate(34.5, 193) rotate(22)">
                      {/* Classic SME Perforated Headshell Body */}
                      <path 
                        d="M -4.5,1 L 4.5,1 L 4.2,16 L 3.5,18 L -3.5,18 L -4.2,16 Z" 
                        fill="#18181b" 
                        stroke="#3f3f46" strokeWidth="0.6" 
                      />
                      {/* Two Cartridge Mounting Screws */}
                      <circle cx="-2.2" cy="7" r="1.1" fill="#d4d4d8" stroke="#18181b" strokeWidth="0.4" />
                      <circle cx="2.2" cy="7" r="1.1" fill="#d4d4d8" stroke="#18181b" strokeWidth="0.4" />
                      <line x1="-2.2" y1="6.3" x2="-2.2" y2="7.7" stroke="#3f3f46" strokeWidth="0.4" />
                      <line x1="2.2" y1="6.3" x2="2.2" y2="7.7" stroke="#3f3f46" strokeWidth="0.4" />
                      {/* Weight Relief Cutout Slots */}
                      <rect x="-2.6" y="11" width="1.6" height="4.5" rx="0.5" fill="#09090b" />
                      <rect x="1.0" y="11" width="1.6" height="4.5" rx="0.5" fill="#09090b" />

                      {/* Cartridge Body Beneath Headshell */}
                      <path 
                        d="M -3.5,16 L 3.5,16 L 3,24 L -3,24 Z" 
                        fill={`url(#cartGrad-${align})`} 
                        stroke="#09090b" strokeWidth="0.5" 
                      />
                      
                      {/* High-visibility Stylus Nose Block */}
                      <rect x="-2.4" y="23.5" width="4.8" height="4.5" rx="0.7" fill="#f4f4f5" stroke="#71717a" strokeWidth="0.5" />
                      <line x1="0" y1="24" x2="0" y2="27.5" stroke="#ef4444" strokeWidth="0.8" />

                      {/* Cantilever (Needle Shaft) */}
                      <line x1="0" y1="27.5" x2="0" y2="33.5" stroke="#e4e4e7" strokeWidth="1.2" strokeLinecap="round" />
                      
                      {/* Diamond Stylus Tip */}
                      <circle cx="0" cy="33.5" r="1.3" fill="#ffffff" />
                      <circle cx="0" cy="33.5" r="2.4" fill="#ffffff" opacity="0.35" />

                      {/* SME Arched Finger Lift Hook */}
                      <path 
                        d="M 3.8,5 C 7.5,5 12,8 11.5,15 C 11,19 8.5,20.5 6,20" 
                        fill="none" 
                        stroke={`url(#tubeGrad-${effectiveTheme}-${align})`} 
                        strokeWidth="1.3" 
                        strokeLinecap="round" 
                      />
                    </g>
                  </>
                )}

                {/* 5. Gimbal & Bearing Housing (Top Layer at Pivot 50, 36) */}
                <circle 
                  cx="50" cy="36" r="13.5" 
                  fill={`url(#cwGrad-${effectiveTheme}-${align})`} 
                  stroke="#18181b" strokeWidth="0.8" 
                />
                <circle cx="50" cy="36" r="9.5" fill="#18181b" stroke="#52525b" strokeWidth="0.6" />
                <circle cx="50" cy="36" r="5.5" fill={`url(#pivotGrad-${align})`} stroke="#27272a" strokeWidth="0.5" />
                <circle cx="50" cy="36" r="1.6" fill="#09090b" />
              </g>
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}
