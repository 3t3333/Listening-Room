import { useState, useEffect, type CSSProperties } from "react";
import { player, type Track } from "../lib/player";
import { DjTurntable } from "../components/DjTurntable";
import { CustomBackground } from "../components/CustomBackground";
import { PlayerControls } from "../components/PlayerControls";
import { ScrollingTitle } from "../components/ScrollingTitle";
import { BlockVisualizer } from "../components/BlockVisualizer";
import { useArtworkPalette } from "../hooks/useArtworkColor";
import type { ThemeProps } from "./types";
import { useDjSettings } from "../hooks/useDjSettings";

export function DjSetupTheme({ playback, background, onToggle, onPrevious, onNext }: ThemeProps) {
  const [settings, setSettings] = useDjSettings();
  const [activeSide, setActiveSide] = useState<"left" | "right">("left");
  const [deckTracks, setDeckTracks] = useState<{ left: Track | null; right: Track | null }>({
    left: null,
    right: null,
  });
  const [nextUniqueSleeve, setNextUniqueSleeve] = useState<string | null>(null);

  useEffect(() => {
    const currentTrack = playback.current;
    const nextTrack = playback.next;

    setDeckTracks((prev) => {
      const isSameAlbum = currentTrack?.imageUrl && nextTrack?.imageUrl && currentTrack.imageUrl === nextTrack.imageUrl;
      
      if (!prev.left && !prev.right) {
        return { left: currentTrack, right: settings.optimizeSingleAlbum && isSameAlbum ? null : nextTrack };
      }
      if (activeSide === "left" && prev.left?.uri === currentTrack?.uri) {
        return { ...prev, right: settings.optimizeSingleAlbum && isSameAlbum ? null : nextTrack };
      }
      if (activeSide === "right" && prev.right?.uri === currentTrack?.uri) {
        return { ...prev, left: settings.optimizeSingleAlbum && isSameAlbum ? null : nextTrack };
      }
      if (activeSide === "left" && prev.right?.uri === currentTrack?.uri) {
        setActiveSide("right");
        return { left: settings.optimizeSingleAlbum && isSameAlbum ? null : nextTrack, right: currentTrack };
      }
      if (activeSide === "right" && prev.left?.uri === currentTrack?.uri) {
        setActiveSide("left");
        return { left: currentTrack, right: settings.optimizeSingleAlbum && isSameAlbum ? null : nextTrack };
      }
      if (activeSide === "left") {
        setActiveSide("right");
        return { left: settings.optimizeSingleAlbum && isSameAlbum ? null : nextTrack, right: currentTrack };
      } else {
        setActiveSide("left");
        return { left: currentTrack, right: settings.optimizeSingleAlbum && isSameAlbum ? null : nextTrack };
      }
    });

    if (currentTrack?.imageUrl) {
      let mounted = true;
      player.queue().then((tracks) => {
        if (!mounted) return;
        const unique = tracks.find(t => t.imageUrl && t.imageUrl !== currentTrack.imageUrl);
        setNextUniqueSleeve(unique?.imageUrl ?? null);
      }).catch(console.error);
      return () => { mounted = false; };
    }
  }, [playback.current?.uri, playback.next?.uri]);

  const artworkPalette = useArtworkPalette(playback.current?.imageUrl);
  const palette = background.adaptColors && background.imageUrl ? background.palette : artworkPalette;
  const { primary: [red, green, blue], accent: [accentRed, accentGreen, accentBlue] } = palette;
  const style = {
    "--ambient-rgb": `${red}, ${green}, ${blue}`,
    "--visualizer-rgb": `${accentRed}, ${accentGreen}, ${accentBlue}`,
  } as CSSProperties;

  const currentSleeveNode = playback.current?.imageUrl && (
    <div className="dj-stand-sleeve">
      <img src={playback.current.imageUrl} alt="" />
      <div className="sleeve-glare" />
    </div>
  );
  const nextSleeveNode = nextUniqueSleeve && (
    <div className="dj-stand-sleeve">
      <img src={nextUniqueSleeve} alt="" />
      <div className="sleeve-glare" />
    </div>
  );

  const activeLayoutClass = settings.optimizeSingleAlbum && (!deckTracks.left || !deckTracks.right) && settings.singleAlbumLayout !== "dual" 
    ? `layout-${settings.singleAlbumLayout}` 
    : "";

  const isVerticalVisualizer = activeLayoutClass !== "layout-single-bottom" && activeLayoutClass !== "layout-single-top";
  const hideVisualizer = activeLayoutClass === "layout-single-only";

  return (
    <div className="dj-setup-container" style={style}>
      <CustomBackground imageUrl={background.imageUrl} opacity={background.opacity} />

      <div className="dj-top-meta">
        <ScrollingTitle>{playback.current?.name ?? "Nothing playing"}</ScrollingTitle>
        <p>{playback.current?.artist ?? "Choose a record from your library"}</p>
      </div>

      <div className="dj-rig-wrapper">
        <div className={`dj-long-stand ${activeLayoutClass} ${!settings.showSleeveStand ? 'hide-stand' : ''}`}>
          {activeSide === "left" ? (
            <>
              {currentSleeveNode}
              {nextSleeveNode}
            </>
          ) : (
            <>
              {nextSleeveNode}
              {currentSleeveNode}
            </>
          )}
        </div>

        <div className={`dj-desk ${activeLayoutClass}`}>
          {(!settings.optimizeSingleAlbum || settings.singleAlbumLayout === "dual" || deckTracks.left || (!deckTracks.left && !deckTracks.right && activeSide === "left")) && (
            <DjTurntable 
              track={deckTracks.left} 
              isActive={activeSide === "left" && playback.isPlaying} 
              isAppPlaying={playback.isPlaying}
              align="left" 
              isDark={settings.isDark}
              onToggleDark={() => setSettings({ ...settings, isDark: !settings.isDark })}
            />
          )}

          {!hideVisualizer && (
            <div className={`dj-center-console ${isVerticalVisualizer ? '' : 'horizontal'}`}>
              <BlockVisualizer vertical={isVerticalVisualizer} />
            </div>
          )}
          
          {(!settings.optimizeSingleAlbum || settings.singleAlbumLayout === "dual" || deckTracks.right || (!deckTracks.left && !deckTracks.right && activeSide === "right")) && (
            <DjTurntable 
              track={deckTracks.right} 
              isActive={activeSide === "right" && playback.isPlaying} 
              isAppPlaying={playback.isPlaying}
              align="right"
              isDark={settings.isDark}
              onToggleDark={() => setSettings({ ...settings, isDark: !settings.isDark })}
            />
          )}
        </div>
      </div>
      
      <div className="dj-bottom-controls">
        <PlayerControls compact playback={playback} onToggle={onToggle} onPrevious={onPrevious} onNext={onNext} />
      </div>
    </div>
  );
}
