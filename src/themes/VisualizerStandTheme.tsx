import type { CSSProperties } from "react";
import { Disc3 } from "lucide-react";
import { CustomBackground } from "../components/CustomBackground";
import { PlayerControls } from "../components/PlayerControls";
import { ScrollingTitle } from "../components/ScrollingTitle";
import { TrackDetailsDialog } from "../components/TrackDetailsDialog";
import { BlockVisualizer } from "../components/BlockVisualizer";
import { useArtworkPalette } from "../hooks/useArtworkColor";
import type { ThemeProps } from "./types";

export function VisualizerStandTheme({ playback, background, onToggle, onPrevious, onNext }: ThemeProps) {
  const track = playback.current;
  const artworkPalette = useArtworkPalette(track?.imageUrl);
  const palette = background.adaptColors && background.imageUrl ? background.palette : artworkPalette;
  const { primary: [red, green, blue], accent: [accentRed, accentGreen, accentBlue] } = palette;
  const style = {
    "--ambient-rgb": `${red}, ${green}, ${blue}`,
    "--visualizer-rgb": `${accentRed}, ${accentGreen}, ${accentBlue}`,
  } as CSSProperties;

  return (
    <section className="theme-scene visualizer-stand-theme" style={style}>
      <CustomBackground 
        imageUrl={background.imageUrl} 
        opacity={background.opacity} 
        positionX={background.positionX} 
        positionY={background.positionY} 
        fit={background.fit} 
        zoom={background.zoom} 
      />
      <div className="visualizer-stand-ambient" />
      <div className="visualizer-stand-floor" />

      <div className="stand-container">
        <TrackDetailsDialog track={track}>
          <div className="stand-sleeve">
            {track?.imageUrl ? <img src={track.imageUrl} alt={`${track.name} cover`} /> : <div className="stand-sleeve-fallback"><Disc3 size={120} /></div>}
          </div>
        </TrackDetailsDialog>
        
        <div className="stand-chassis">
          <svg viewBox="0 0 1000 300" className="stand-svg" aria-hidden="true">
            <defs>
              <linearGradient id="stand-chassis" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#faf9f5" />
                <stop offset="0.18" stopColor="#deddd8" />
                <stop offset="0.72" stopColor="#b9b8b3" />
                <stop offset="1" stopColor="#8b8a86" />
              </linearGradient>
              <linearGradient id="stand-edge" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#777672" />
                <stop offset="1" stopColor="#343432" />
              </linearGradient>
              <radialGradient id="stand-knob" cx="34%" cy="28%" r="72%">
                <stop offset="0" stopColor="#f9f9f7" />
                <stop offset="0.42" stopColor="#c9c9c5" />
                <stop offset="0.78" stopColor="#858581" />
                <stop offset="1" stopColor="#4b4b49" />
              </radialGradient>
              <linearGradient id="stand-holder" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#f7f6f1" />
                <stop offset="0.35" stopColor="#aaa9a4" />
                <stop offset="1" stopColor="#5f5e5a" />
              </linearGradient>
              <filter id="stand-brush" x="-5%" y="-5%" width="110%" height="110%">
                <feTurbulence type="fractalNoise" baseFrequency="0.004 0.72" numOctaves="1" seed="8" result="grain" />
                <feColorMatrix in="grain" type="saturate" values="0" result="gray" />
                <feBlend in="SourceGraphic" in2="gray" mode="soft-light" />
              </filter>
            </defs>

            <path d="M18 267h964l-18 25H36z" fill="url(#stand-edge)" />
            <path d="M47 18h906l41 249H6z" fill="url(#stand-chassis)" stroke="#777671" strokeWidth="2" filter="url(#stand-brush)" />
            <path d="M48 19h904" fill="none" stroke="#fff" strokeOpacity=".9" strokeWidth="3" />
            <path d="M8 265h984" fill="none" stroke="#343432" strokeOpacity=".65" strokeWidth="3" />

            <rect x="202" y="49" width="750" height="178" rx="14" fill="#161716" stroke="#676763" strokeWidth="5" />
            <rect x="211" y="58" width="732" height="160" rx="9" fill="#030504" stroke="#050505" strokeWidth="3" />

            <g fill="#555551" stroke="#faf9f5" strokeOpacity=".55">
              <circle cx="40" cy="47" r="5" /><circle cx="960" cy="47" r="5" />
              <circle cx="29" cy="244" r="5" /><circle cx="971" cy="244" r="5" />
            </g>

            <g transform="translate(105 77)">
              <circle r="31" fill="#30302e" opacity=".8" />
              <circle r="26" fill="url(#stand-knob)" stroke="#555551" strokeWidth="2" />
              <circle r="19" fill="none" stroke="#fff" strokeOpacity=".22" />
              <line x1="0" y1="-10" x2="-12" y2="-21" stroke="#292927" strokeWidth="3" strokeLinecap="round" />
            </g>
            <g transform="translate(105 150)">
              <circle r="31" fill="#30302e" opacity=".8" />
              <circle r="26" fill="url(#stand-knob)" stroke="#555551" strokeWidth="2" />
              <circle r="19" fill="none" stroke="#fff" strokeOpacity=".22" />
              <line x1="0" y1="-10" x2="3" y2="-23" stroke="#292927" strokeWidth="3" strokeLinecap="round" />
            </g>
            <g transform="translate(105 223)">
              <circle r="31" fill="#30302e" opacity=".8" />
              <circle r="26" fill="url(#stand-knob)" stroke="#555551" strokeWidth="2" />
              <circle r="19" fill="none" stroke="#fff" strokeOpacity=".22" />
              <line x1="0" y1="-10" x2="14" y2="-20" stroke="#292927" strokeWidth="3" strokeLinecap="round" />
            </g>

            <circle cx="161" cy="77" r="5" fill="rgb(var(--visualizer-rgb))" />
            <circle cx="161" cy="77" r="10" fill="none" stroke="rgb(var(--visualizer-rgb))" strokeOpacity=".2" />

            <path d="M307 9v18M693 9v18" stroke="#777671" strokeWidth="8" strokeLinecap="round" />
            <rect x="286" y="5" width="428" height="14" rx="7" fill="url(#stand-holder)" stroke="#777671" />
            <path d="M304 9h392" stroke="#fff" strokeOpacity=".7" strokeWidth="2" strokeLinecap="round" />

            <path d="M75 291h110v7H69zM815 291h110l6 7H815z" fill="#252523" />
          </svg>

          <div className="stand-screen">
            <i className="stand-screen-glass" />
            <BlockVisualizer />
          </div>
        </div>
      </div>

      <div className="stand-meta">
        <div>
          <ScrollingTitle>{track?.name ?? "Nothing playing"}</ScrollingTitle>
          <p>{track?.artist ?? "Choose a record from your library"}</p>
        </div>
        <PlayerControls compact playback={playback} onToggle={onToggle} onPrevious={onPrevious} onNext={onNext} />
      </div>
    </section>
  );
}
