import { useState, useEffect, useRef, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Disc3 } from "lucide-react";
import { player, type Track } from "../lib/player";
import { DjTurntable } from "../components/DjTurntable";
import { CustomBackground } from "../components/CustomBackground";
import { PlayerControls } from "../components/PlayerControls";
import { ScrollingTitle } from "../components/ScrollingTitle";
import { BlockVisualizer } from "../components/BlockVisualizer";
import { useArtworkPalette } from "../hooks/useArtworkColor";
import type { ThemeProps } from "./types";
import { useDjSettings, type DjTurntableTheme } from "../hooks/useDjSettings";
import { SpineShelf } from "../components/SpineShelf";
import { InlineRecordViewer } from "../components/InlineRecordViewer";
import { useActiveCustomization, findMatchingCollection } from "../hooks/useActiveCustomization";
import { getVinylColorStyle } from "../lib/vinylColors";
import { getCollections, type Collection } from "../lib/collections";
import { useVerticalOrientation } from "../hooks/useVerticalOrientation";

export function DjSetupTheme({ playback, background, albumQueue, onToggle, onPrevious, onNext, onPlayTrack, onQueueTrack, onQueueAlbum }: ThemeProps) {
  const [settings, setSettings] = useDjSettings();
  const [activeSide, setActiveSide] = useState<"left" | "right">("left");
  const [themeToast, setThemeToast] = useState<string | null>(null);
  const themeToastTimer = useRef<number | null>(null);

  const currentTurntableTheme: DjTurntableTheme = settings.turntableTheme || (settings.isDark ? "dark" : "light");

  function cycleTurntableTheme() {
    const order: DjTurntableTheme[] = ["light", "dark", "glass-clear", "glass-smoked"];
    const nextIdx = (order.indexOf(currentTurntableTheme) + 1) % order.length;
    const nextTheme = order[nextIdx];
    const labels: Record<DjTurntableTheme, string> = {
      "light": "Classic Silver",
      "dark": "Matte Black",
      "glass-clear": "Clear Frosted Glass",
      "glass-smoked": "Smoked Obsidian Glass",
    };
    
    setSettings({
      ...settings,
      turntableTheme: nextTheme,
      isDark: nextTheme === "dark" || nextTheme === "glass-smoked",
    });

    if (themeToastTimer.current) window.clearTimeout(themeToastTimer.current);
    setThemeToast(labels[nextTheme]);
    themeToastTimer.current = window.setTimeout(() => {
      setThemeToast(null);
    }, 1800);
  }

function isSameTrack(a: Track | null | undefined, b: Track | null | undefined): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  if ((a as any).audioId && (b as any).audioId && (a as any).audioId === (b as any).audioId) return true;
  if (a.uri && b.uri && a.uri === b.uri) return true;
  return Boolean(a.name && b.name && a.name === b.name && a.artist === b.artist);
}

function isSameAlbum(a: Track | null | undefined, b: Track | null | undefined): boolean {
  if (!a || !b) return false;
  const aAudio = (a as any).audioId || (a.uri?.startsWith("mp3:") ? a.uri.slice(4) : null);
  const bAudio = (b as any).audioId || (b.uri?.startsWith("mp3:") ? b.uri.slice(4) : null);
  if (aAudio && bAudio) {
    const aAlbum = aAudio.replace(/-\d+$/, "");
    const bAlbum = bAudio.replace(/-\d+$/, "");
    return Boolean(aAlbum && aAlbum === bAlbum);
  }
  if (a.imageUrl && b.imageUrl && a.imageUrl === b.imageUrl) return true;
  return false;
}

  const [deckTracks, setDeckTracks] = useState<{ left: Track | null; right: Track | null }>({
    left: null,
    right: null,
  });
  const [nextUniqueTrack, setNextUniqueTrack] = useState<Track | null>(null);
  const [animatedTrack, setAnimatedTrack] = useState<Track | null>(null);
  const [animatedSide, setAnimatedSide] = useState<"left" | "right" | null>(null);
  const [animatedRecord, setAnimatedRecord] = useState<Collection | null>(null);

  useEffect(() => {
    const currentTrack = playback.current;
    const nextTrack = playback.next;

    setDeckTracks((prev) => {
      const isAlbumContinuation = isSameAlbum(currentTrack, nextTrack) || isSameAlbum(prev.left, currentTrack) || isSameAlbum(prev.right, currentTrack);
      
      let newLeft = prev.left;
      let newRight = prev.right;
      let newActiveSide = activeSide;

      if (!prev.left && !prev.right) {
        newLeft = currentTrack;
        newRight = settings.optimizeSingleAlbum && isAlbumContinuation ? null : nextTrack;
      }
      else if (activeSide === "left" && isSameTrack(prev.left, currentTrack)) {
        newLeft = currentTrack;
        newRight = settings.optimizeSingleAlbum && isAlbumContinuation ? null : nextTrack;
      }
      else if (activeSide === "right" && isSameTrack(prev.right, currentTrack)) {
        newLeft = settings.optimizeSingleAlbum && isAlbumContinuation ? null : nextTrack;
        newRight = currentTrack;
      }
      else if (activeSide === "left" && isSameTrack(prev.right, currentTrack)) {
        newActiveSide = "right";
        newLeft = settings.optimizeSingleAlbum && isAlbumContinuation ? null : nextTrack;
        newRight = currentTrack;
      }
      else if (activeSide === "right" && isSameTrack(prev.left, currentTrack)) {
        newActiveSide = "left";
        newLeft = currentTrack;
        newRight = settings.optimizeSingleAlbum && isAlbumContinuation ? null : nextTrack;
      }
      else if (activeSide === "left" && isSameAlbum(prev.left, currentTrack)) {
        newLeft = currentTrack;
        newRight = settings.optimizeSingleAlbum && isAlbumContinuation ? null : nextTrack;
      }
      else if (activeSide === "right" && isSameAlbum(prev.right, currentTrack)) {
        newLeft = settings.optimizeSingleAlbum && isAlbumContinuation ? null : nextTrack;
        newRight = currentTrack;
      }
      else if (activeSide === "left" && isSameAlbum(prev.right, currentTrack)) {
        newActiveSide = "right";
        newLeft = settings.optimizeSingleAlbum && isAlbumContinuation ? null : nextTrack;
        newRight = currentTrack;
      }
      else if (activeSide === "right" && isSameAlbum(prev.left, currentTrack)) {
        newActiveSide = "left";
        newLeft = currentTrack;
        newRight = settings.optimizeSingleAlbum && isAlbumContinuation ? null : nextTrack;
      }
      else if (activeSide === "left") {
        newActiveSide = "right";
        newLeft = settings.optimizeSingleAlbum && isAlbumContinuation ? null : nextTrack;
        newRight = currentTrack;
      } else {
        newActiveSide = "left";
        newLeft = currentTrack;
        newRight = settings.optimizeSingleAlbum && isAlbumContinuation ? null : nextTrack;
      }

      if (newActiveSide !== activeSide) setActiveSide(newActiveSide);

      // Override the empty deck with nextUniqueTrack if optimizeSingleAlbum is trying to hide it, 
      // but there is actually a different album queued!
      if (settings.optimizeSingleAlbum && nextUniqueTrack) {
         if (newActiveSide === "left" && !newRight) newRight = nextUniqueTrack;
         if (newActiveSide === "right" && !newLeft) newLeft = nextUniqueTrack;
      }

      return { left: newLeft, right: newRight };
    });

    if (currentTrack?.imageUrl) {
      let mounted = true;
      player.queue().then((tracks) => {
        if (!mounted) return;
        // Check albumQueue first!
        if (albumQueue && albumQueue.length > 0) {
          const uniqueFromAlbum = albumQueue.find(album => album.length > 0 && album[0].imageUrl !== currentTrack.imageUrl);
          if (uniqueFromAlbum) {
            setNextUniqueTrack(uniqueFromAlbum[0]);
            return;
          }
        }
        // Fallback to backend queue
        const unique = tracks.find(t => t.imageUrl && t.imageUrl !== currentTrack.imageUrl);
        setNextUniqueTrack(unique ?? null);
      }).catch(console.error);
      return () => { mounted = false; };
    }
  }, [
    playback.current?.uri,
    (playback.current as any)?.audioId,
    playback.current?.name,
    playback.next?.uri,
    (playback.next as any)?.audioId,
    playback.next?.name,
    playback.isPlaying,
    nextUniqueTrack?.uri,
    settings.optimizeSingleAlbum,
    albumQueue,
  ]);

  const customization = useActiveCustomization(playback.current, background);
  const artworkPalette = useArtworkPalette(playback.current?.imageUrl);
  const palette = background.adaptColors && (customization.effectiveImageUrl || background.imageUrl) ? background.palette : artworkPalette;
  const { primary: [red, green, blue], accent: [accentRed, accentGreen, accentBlue] } = palette;
  const visualizerRgb = customization.customVisualizerRgb || `${accentRed}, ${accentGreen}, ${accentBlue}`;
  const style = {
    "--ambient-rgb": `${red}, ${green}, ${blue}`,
    "--visualizer-rgb": visualizerRgb,
  } as CSSProperties;

  const currentSleeveNode = playback.current?.imageUrl && (
    <div className="dj-stand-sleeve">
      <img src={playback.current.imageUrl} alt="" />
      <div className="sleeve-glare" />
    </div>
  );
  const nextSleeveNode = nextUniqueTrack?.imageUrl ? (
    <div className="dj-stand-sleeve">
      <img src={nextUniqueTrack.imageUrl} alt="" />
      <div className="sleeve-glare" />
    </div>
  ) : animatedTrack?.imageUrl ? (
    <div className="dj-stand-sleeve">
      <img src={animatedTrack.imageUrl} alt="" />
      <div className="sleeve-glare" />
    </div>
  ) : null;

  const activeLayoutClass = settings.optimizeSingleAlbum && (!deckTracks.left || !deckTracks.right) && settings.singleAlbumLayout !== "dual" 
    ? `layout-${settings.singleAlbumLayout}` 
    : "";

  const isVerticalVisualizer = activeLayoutClass !== "layout-single-bottom" && activeLayoutClass !== "layout-single-top";
  const hideVisualizer = activeLayoutClass === "layout-single-only";

  const [inspectingCollection, setInspectingCollection] = useState<{ collection: import("../lib/collections").Collection, rect: DOMRect } | null>(null);
  const [flyingRecord, setFlyingRecord] = useState<{ record: import("../lib/collections").Collection, track: any, sourceRect: DOMRect, targetRect: DOMRect } | null>(null);
  const pageContainerRef = useRef<HTMLDivElement>(null);

  function flyRecordToTurntable(track: any, record: import("../lib/collections").Collection, isPlay: boolean) {
    const targetSide = (!deckTracks.left || (!deckTracks.left && !deckTracks.right && activeSide === "left")) ? 'left' : 'right';
    const targetEl = document.getElementById(`turntable-platter-${targetSide}`);
    const sourceEl = document.querySelector('.inline-vinyl .record-vinyl-disc');
    
    if (targetEl && sourceEl && pageContainerRef.current) {
      const sourceRect = sourceEl.getBoundingClientRect();
      const targetRect = targetEl.getBoundingClientRect();
      
      const containerRect = pageContainerRef.current.getBoundingClientRect();
      const absoluteSource = new DOMRect(sourceRect.left - containerRect.left, sourceRect.top - containerRect.top + pageContainerRef.current.scrollTop, sourceRect.width, sourceRect.height);
      const absoluteTarget = new DOMRect(targetRect.left - containerRect.left, targetRect.top - containerRect.top + pageContainerRef.current.scrollTop, targetRect.width, targetRect.height);
      
      setFlyingRecord({ record, track, sourceRect: absoluteSource, targetRect: absoluteTarget });
      setInspectingCollection(null);
      
      pageContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
      
      setTimeout(() => {
        if (isPlay) {
          setActiveSide(targetSide);
          setDeckTracks((prev) => ({ ...prev, [targetSide]: track }));
          if (animatedSide === targetSide || isPlay) {
            setAnimatedTrack(null);
            setAnimatedSide(null);
            setAnimatedRecord(null);
          }
          if (onPlayTrack) onPlayTrack(track, record.tracks || []);
        } else {
          setDeckTracks((prev) => ({ ...prev, [targetSide]: track }));
          if (onQueueAlbum) onQueueAlbum(record.tracks || []);
        }
        setFlyingRecord(null);
      }, 1500);
    } else {
      if (isPlay) {
        setActiveSide(targetSide);
        setDeckTracks((prev) => ({ ...prev, [targetSide]: track }));
        if (animatedSide === targetSide || isPlay) {
          setAnimatedTrack(null);
          setAnimatedSide(null);
          setAnimatedRecord(null);
        }
        if (onPlayTrack) onPlayTrack(track, record.tracks || []);
      } else {
        setDeckTracks((prev) => ({ ...prev, [targetSide]: track }));
        if (onQueueAlbum) onQueueAlbum(record.tracks || []);
      }
      setInspectingCollection(null);
      pageContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  function handlePlayFromInline(track: any, record: import("../lib/collections").Collection) {
    flyRecordToTurntable(track, record, true);
  }

  function handleQueueFromInline(record: import("../lib/collections").Collection) {
    const isPlaying = Boolean(playback.isPlaying || playback.current);
    flyRecordToTurntable(record.tracks?.[0], record, !isPlaying);
  }

  function handleAnimateFromInline(record: import("../lib/collections").Collection) {
    const hasEmptyDeck = !deckTracks.left || !deckTracks.right;
    const isQueueEmpty = (albumQueue?.length ?? 0) === 0;

    if (!hasEmptyDeck || !isQueueEmpty) {
      alert("Animate is only available when a turntable is empty and nothing else is queued.");
      return;
    }

    const targetSide = !deckTracks.left ? 'left' : 'right';
    const track = record.tracks?.[0];
    if (!track) return;

    const targetEl = document.getElementById(`turntable-platter-${targetSide}`);
    const sourceEl = document.querySelector('.inline-vinyl .record-vinyl-disc');
    
    if (targetEl && sourceEl && pageContainerRef.current) {
      const sourceRect = sourceEl.getBoundingClientRect();
      const targetRect = targetEl.getBoundingClientRect();
      
      const containerRect = pageContainerRef.current.getBoundingClientRect();
      const absoluteSource = new DOMRect(sourceRect.left - containerRect.left, sourceRect.top - containerRect.top + pageContainerRef.current.scrollTop, sourceRect.width, sourceRect.height);
      const absoluteTarget = new DOMRect(targetRect.left - containerRect.left, targetRect.top - containerRect.top + pageContainerRef.current.scrollTop, targetRect.width, targetRect.height);
      
      setFlyingRecord({ record, track, sourceRect: absoluteSource, targetRect: absoluteTarget });
      setInspectingCollection(null);
      pageContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
      
      setTimeout(() => {
        setAnimatedTrack(track);
        setAnimatedSide(targetSide);
        setAnimatedRecord(record);
        setDeckTracks((prev) => ({ ...prev, [targetSide]: track }));
        setFlyingRecord(null);
      }, 1500);
    } else {
      setAnimatedTrack(track);
      setAnimatedSide(targetSide);
      setAnimatedRecord(record);
      setDeckTracks((prev) => ({ ...prev, [targetSide]: track }));
      setInspectingCollection(null);
      pageContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  const [collections, setCollections] = useState<Collection[]>(() => getCollections());

  useEffect(() => {
    function handleCollectionsChanged() {
      setCollections(getCollections());
    }
    window.addEventListener("collections:changed", handleCollectionsChanged);
    return () => window.removeEventListener("collections:changed", handleCollectionsChanged);
  }, []);

  useEffect(() => {
    function resetParentScroll() {
      const themeTransition = pageContainerRef.current?.closest(".theme-transition") as HTMLElement | null;
      if (themeTransition && themeTransition.scrollTop !== 0) {
        themeTransition.scrollTop = 0;
      }
      const appShell = pageContainerRef.current?.closest(".app-shell") as HTMLElement | null;
      if (appShell && appShell.scrollTop !== 0) {
        appShell.scrollTop = 0;
      }
      if (window.scrollY !== 0) {
        window.scrollTo(0, 0);
      }
    }
    resetParentScroll();
    const timer = setTimeout(resetParentScroll, 100);
    return () => clearTimeout(timer);
  }, [inspectingCollection]);

  const leftTrack = animatedSide === "left" && animatedTrack ? animatedTrack : deckTracks.left;
  const rightTrack = animatedSide === "right" && animatedTrack ? animatedTrack : deckTracks.right;

  const leftVinylColor = (animatedSide === "left" && animatedRecord && isSameTrack(leftTrack, animatedTrack))
    ? (animatedRecord.customization?.vinylColor || null)
    : (leftTrack ? findMatchingCollection(leftTrack, collections)?.customization?.vinylColor || null : null);

  const rightVinylColor = (animatedSide === "right" && animatedRecord && isSameTrack(rightTrack, animatedTrack))
    ? (animatedRecord.customization?.vinylColor || null)
    : (rightTrack ? findMatchingCollection(rightTrack, collections)?.customization?.vinylColor || null : null);

  const verticalOrientation = useVerticalOrientation(settings);
  const isVerticalRig = verticalOrientation.isVertical && !activeLayoutClass;

  const createSleeveNode = (imageUrl?: string | null, title?: string | null) => (
    <div className="dj-stand-sleeve">
      {imageUrl ? (
        <img src={imageUrl} alt={title || "Album Jacket"} draggable={false} />
      ) : (
        <div className="dj-stand-sleeve-placeholder">
          <Disc3 size={42} strokeWidth={1} />
        </div>
      )}
      <div className="sleeve-glare" />
    </div>
  );

  const nextTrackImg = nextUniqueTrack?.imageUrl || playback.next?.imageUrl || null;
  const currentTrackImg = playback.current?.imageUrl || null;

  const leftDeckImage = (animatedSide === "left" && animatedTrack?.imageUrl) || deckTracks.left?.imageUrl || (activeSide === "left" ? currentTrackImg : nextTrackImg || currentTrackImg);
  const rightDeckImage = (animatedSide === "right" && animatedTrack?.imageUrl) || deckTracks.right?.imageUrl || (activeSide === "right" ? currentTrackImg : nextTrackImg || currentTrackImg);

  const leftVerticalSleeve = createSleeveNode(leftDeckImage, (animatedSide === "left" ? animatedTrack?.name : deckTracks.left?.name) || playback.current?.name);
  const rightVerticalSleeve = createSleeveNode(rightDeckImage, (animatedSide === "right" ? animatedTrack?.name : deckTracks.right?.name) || nextUniqueTrack?.name || playback.next?.name || playback.current?.name);

  const isLeftTrackActive = isSameTrack(deckTracks.left, playback.current);
  const isRightTrackActive = isSameTrack(deckTracks.right, playback.current);

  const isLeftActive = (playback.isPlaying && (
    isLeftTrackActive || (activeSide === "left" && !isRightTrackActive)
  )) || (animatedSide === "left" && !!animatedTrack);

  const isRightActive = (playback.isPlaying && (
    isRightTrackActive || (activeSide === "right" && !isLeftTrackActive)
  )) || (animatedSide === "right" && !!animatedTrack);

  const isLeftAppPlaying = isLeftActive || (playback.isPlaying && isLeftTrackActive);
  const isRightAppPlaying = isRightActive || (playback.isPlaying && isRightTrackActive);

  const leftTurntableBattle = (
    <div className="turntable-battle-wrapper is-battle">
      <DjTurntable 
        track={deckTracks.left || (animatedSide === "left" ? animatedTrack : null)} 
        isActive={isLeftActive} 
        isAppPlaying={isLeftAppPlaying}
        align="left" 
        theme={currentTurntableTheme}
        isDark={settings.isDark}
        tonearmStyle={settings.tonearmStyle || "technics-classic"}
        onCycleTheme={cycleTurntableTheme}
        onToggleDark={cycleTurntableTheme}
        vinylColor={leftVinylColor}
      />
    </div>
  );

  const rightTurntableBattle = (
    <div className="turntable-battle-wrapper is-battle">
      <DjTurntable 
        track={deckTracks.right || (animatedSide === "right" ? animatedTrack : null)} 
        isActive={isRightActive} 
        isAppPlaying={isRightAppPlaying}
        align="right" 
        theme={currentTurntableTheme}
        isDark={settings.isDark}
        tonearmStyle={settings.tonearmStyle || "technics-classic"}
        onCycleTheme={cycleTurntableTheme}
        onToggleDark={cycleTurntableTheme}
        vinylColor={rightVinylColor}
      />
    </div>
  );

  const renderVerticalDeck = (turntableNode: React.ReactNode, sleeveNode: React.ReactNode) => (
    <div className="vertical-deck-unit">
      <div className="vertical-sleeve-container">
        {sleeveNode}
        {settings.showSleeveStand && <div className={`dj-sleeve-stand-mini dj-theme-${currentTurntableTheme}`} />}
      </div>
      {turntableNode}
    </div>
  );

  return (
    <div 
      ref={pageContainerRef} 
      className={`dj-page-container ${settings.enableGlassyShelf !== false ? "with-glassy-shelf" : "no-glassy-shelf"} ${isVerticalRig ? "is-vertical-rig" : "is-horizontal-rig"}`} 
      style={{ width: '100%', height: '100%', overflowY: 'auto', position: 'relative' }}
    >
      <CustomBackground 
        imageUrl={customization.effectiveImageUrl} 
        opacity={customization.effectiveOpacity} 
        positionX={customization.effectivePositionX}
        positionY={customization.effectivePositionY}
        fit={customization.effectiveFit}
        zoom={customization.effectiveZoom}
        className="dj-page-background"
      />
      <div className={`dj-setup-container dj-theme-${currentTurntableTheme} ${isVerticalRig ? "is-vertical" : ""}`} style={style}>
        {themeToast && (
          <div className="dj-theme-toast">
            <span>Turntables: {themeToast}</span>
          </div>
        )}

        <div className="dj-top-meta">
          <ScrollingTitle>{playback.current?.name ?? "Nothing playing"}</ScrollingTitle>
          <p>{playback.current?.artist ?? "Choose a record from your library"}</p>
        </div>

        {isVerticalRig ? (
          <div className={`dj-rig-wrapper vertical-rig vertical-${verticalOrientation.direction} jackets-${verticalOrientation.jacketPlacement}`}>
            <div className={`dj-desk vertical-rig dj-theme-${currentTurntableTheme} ${activeLayoutClass}`}>
              {verticalOrientation.direction === "ccw" ? (
                <>
                  {renderVerticalDeck(rightTurntableBattle, rightVerticalSleeve)}
                  {!hideVisualizer && (
                    <div className="dj-center-console horizontal">
                      <BlockVisualizer vertical={false} />
                    </div>
                  )}
                  {renderVerticalDeck(leftTurntableBattle, leftVerticalSleeve)}
                </>
              ) : (
                <>
                  {renderVerticalDeck(leftTurntableBattle, leftVerticalSleeve)}
                  {!hideVisualizer && (
                    <div className="dj-center-console horizontal">
                      <BlockVisualizer vertical={false} />
                    </div>
                  )}
                  {renderVerticalDeck(rightTurntableBattle, rightVerticalSleeve)}
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="dj-rig-wrapper">
            <div className={`dj-long-stand dj-theme-${currentTurntableTheme} ${activeLayoutClass} ${!settings.showSleeveStand ? 'hide-stand' : ''}`}>
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

            <div className={`dj-desk dj-theme-${currentTurntableTheme} ${activeLayoutClass}`}>
              {(!settings.optimizeSingleAlbum || settings.singleAlbumLayout === "dual" || deckTracks.left || animatedSide === "left" || (!deckTracks.left && !deckTracks.right && activeSide === "left")) && (
                <DjTurntable 
                  track={deckTracks.left || (animatedSide === "left" ? animatedTrack : null)} 
                  isActive={isLeftActive} 
                  isAppPlaying={isLeftAppPlaying}
                  align="left" 
                  theme={currentTurntableTheme}
                  isDark={settings.isDark}
                  tonearmStyle={settings.tonearmStyle || "technics-classic"}
                  onCycleTheme={cycleTurntableTheme}
                  onToggleDark={cycleTurntableTheme}
                  vinylColor={leftVinylColor}
                />
              )}

              {!hideVisualizer && (
                <div className={`dj-center-console ${isVerticalVisualizer ? '' : 'horizontal'}`}>
                  <BlockVisualizer vertical={isVerticalVisualizer} />
                </div>
              )}
              
              {(!settings.optimizeSingleAlbum || settings.singleAlbumLayout === "dual" || deckTracks.right || animatedSide === "right" || (!deckTracks.left && !deckTracks.right && activeSide === "right")) && (
                <DjTurntable 
                  track={deckTracks.right || (animatedSide === "right" ? animatedTrack : null)} 
                  isActive={isRightActive} 
                  isAppPlaying={isRightAppPlaying}
                  align="right" 
                  theme={currentTurntableTheme}
                  isDark={settings.isDark}
                  tonearmStyle={settings.tonearmStyle || "technics-classic"}
                  onCycleTheme={cycleTurntableTheme}
                  onToggleDark={cycleTurntableTheme}
                  vinylColor={rightVinylColor}
                />
              )}
            </div>
          </div>
        )}
        
        <div className="dj-bottom-controls">
          <PlayerControls compact playback={playback} onToggle={onToggle} onPrevious={onPrevious} onNext={onNext} />
        </div>
      </div>
      
      <SpineShelf theme={currentTurntableTheme} onInspect={(col, rect) => setInspectingCollection({ collection: col, rect })} />
        {inspectingCollection && (
          <InlineRecordViewer 
            record={inspectingCollection.collection} 
            sourceRect={inspectingCollection.rect} 
            onClose={() => setInspectingCollection(null)} 
            onPlayTrack={handlePlayFromInline}
            onQueueTrack={onQueueTrack}
            onQueueAlbum={() => handleQueueFromInline(inspectingCollection.collection)}
            onAnimateRecord={handleAnimateFromInline}
          />
        )}
      {flyingRecord && createPortal(
        <div 
          className="flying-record-anim"
          style={{
            position: 'absolute',
            top: 0, left: 0,
            width: `${flyingRecord.sourceRect.width}px`,
            height: `${flyingRecord.sourceRect.height}px`,
            "--source-x": `${flyingRecord.sourceRect.left}px`,
            "--source-y": `${flyingRecord.sourceRect.top}px`,
            "--target-x": `${flyingRecord.targetRect.left + (flyingRecord.targetRect.width - flyingRecord.sourceRect.width) / 2}px`,
            "--target-y": `${flyingRecord.targetRect.top + (flyingRecord.targetRect.height - flyingRecord.sourceRect.height) / 2}px`,
            "--target-scale": `${flyingRecord.targetRect.width / flyingRecord.sourceRect.width}`,
            animation: 'fly-to-turntable 1.5s cubic-bezier(0.2, 0.8, 0.2, 1) forwards',
            zIndex: 9999,
            pointerEvents: 'none'
          } as CSSProperties}
        >
          <div 
            className="record-vinyl-disc" 
            style={{ 
              transform: 'rotateX(55deg)', 
              animation: 'fly-spin 1.5s linear forwards',
              ...getVinylColorStyle(flyingRecord.record.customization?.vinylColor) 
            }}
          >
            <div className="record-vinyl-grooves" />
            <div className="record-vinyl-label" style={flyingRecord.track.imageUrl ? { backgroundImage: `url(${flyingRecord.track.imageUrl})` } : {}}>
            </div>
          </div>
        </div>,
        pageContainerRef.current!
      )}
    </div>
  );
}
