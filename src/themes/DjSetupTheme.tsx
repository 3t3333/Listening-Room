import { useState, useEffect, useRef, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { player, type Track } from "../lib/player";
import { DjTurntable } from "../components/DjTurntable";
import { CustomBackground } from "../components/CustomBackground";
import { PlayerControls } from "../components/PlayerControls";
import { ScrollingTitle } from "../components/ScrollingTitle";
import { BlockVisualizer } from "../components/BlockVisualizer";
import { useArtworkPalette } from "../hooks/useArtworkColor";
import type { ThemeProps } from "./types";
import { useDjSettings } from "../hooks/useDjSettings";
import { SpineShelf } from "../components/SpineShelf";
import { InlineRecordViewer } from "../components/InlineRecordViewer";

export function DjSetupTheme({ playback, background, albumQueue, onToggle, onPrevious, onNext, onPlayTrack, onQueueTrack, onQueueAlbum }: ThemeProps) {
  const [settings, setSettings] = useDjSettings();
  const [activeSide, setActiveSide] = useState<"left" | "right">("left");
  const [deckTracks, setDeckTracks] = useState<{ left: Track | null; right: Track | null }>({
    left: null,
    right: null,
  });
  const [nextUniqueTrack, setNextUniqueTrack] = useState<Track | null>(null);

  useEffect(() => {
    const currentTrack = playback.current;
    const nextTrack = playback.next;

    setDeckTracks((prev) => {
      const isSameAlbum = currentTrack?.imageUrl && nextTrack?.imageUrl && currentTrack.imageUrl === nextTrack.imageUrl;
      
      let newLeft = prev.left;
      let newRight = prev.right;
      let newActiveSide = activeSide;

      if (!prev.left && !prev.right) {
        newLeft = currentTrack;
        newRight = settings.optimizeSingleAlbum && isSameAlbum ? null : nextTrack;
      }
      else if (activeSide === "left" && prev.left?.uri === currentTrack?.uri) {
        newLeft = currentTrack;
        newRight = settings.optimizeSingleAlbum && isSameAlbum ? null : nextTrack;
      }
      else if (activeSide === "right" && prev.right?.uri === currentTrack?.uri) {
        newLeft = settings.optimizeSingleAlbum && isSameAlbum ? null : nextTrack;
        newRight = currentTrack;
      }
      else if (activeSide === "left" && prev.right?.uri === currentTrack?.uri) {
        newActiveSide = "right";
        newLeft = settings.optimizeSingleAlbum && isSameAlbum ? null : nextTrack;
        newRight = currentTrack;
      }
      else if (activeSide === "right" && prev.left?.uri === currentTrack?.uri) {
        newActiveSide = "left";
        newLeft = currentTrack;
        newRight = settings.optimizeSingleAlbum && isSameAlbum ? null : nextTrack;
      }
      else if (activeSide === "left" && prev.left?.imageUrl && prev.left.imageUrl === currentTrack?.imageUrl) {
        newLeft = currentTrack;
        newRight = settings.optimizeSingleAlbum && isSameAlbum ? null : nextTrack;
      }
      else if (activeSide === "right" && prev.right?.imageUrl && prev.right.imageUrl === currentTrack?.imageUrl) {
        newLeft = settings.optimizeSingleAlbum && isSameAlbum ? null : nextTrack;
        newRight = currentTrack;
      }
      else if (activeSide === "left" && prev.right?.imageUrl && prev.right.imageUrl === currentTrack?.imageUrl) {
        newActiveSide = "right";
        newLeft = settings.optimizeSingleAlbum && isSameAlbum ? null : nextTrack;
        newRight = currentTrack;
      }
      else if (activeSide === "right" && prev.left?.imageUrl && prev.left.imageUrl === currentTrack?.imageUrl) {
        newActiveSide = "left";
        newLeft = currentTrack;
        newRight = settings.optimizeSingleAlbum && isSameAlbum ? null : nextTrack;
      }
      else if (activeSide === "left") {
        newActiveSide = "right";
        newLeft = settings.optimizeSingleAlbum && isSameAlbum ? null : nextTrack;
        newRight = currentTrack;
      } else {
        newActiveSide = "left";
        newLeft = currentTrack;
        newRight = settings.optimizeSingleAlbum && isSameAlbum ? null : nextTrack;
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
  }, [playback.current?.uri, playback.next?.uri, nextUniqueTrack?.uri, settings.optimizeSingleAlbum, albumQueue]);

  const artworkPalette = useArtworkPalette(playback.current?.imageUrl);
  const palette = background.adaptColors && background.imageUrl ? background.palette : artworkPalette;
  const { primary: [red, green, blue], accent: [accentRed, accentGreen, accentBlue] } = palette;
  const style = {
    "--ambient-rgb": `${red}, ${green}, ${blue}`,
    "--visualizer-rgb": `${accentRed}, ${accentGreen}, ${accentBlue}`,
  } as CSSProperties;

  const [animatedTrack, setAnimatedTrack] = useState<Track | null>(null);
  const [animatedSide, setAnimatedSide] = useState<"left" | "right" | null>(null);

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
          if (onPlayTrack) onPlayTrack(track, record.tracks || []);
        } else {
          if (onQueueAlbum) onQueueAlbum(record.tracks || []);
        }
        setFlyingRecord(null);
      }, 1500);
    } else {
      if (isPlay) {
        if (onPlayTrack) onPlayTrack(track, record.tracks || []);
      } else {
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
    flyRecordToTurntable(record.tracks?.[0], record, false);
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
        setFlyingRecord(null);
      }, 1500);
    } else {
      setAnimatedTrack(track);
      setAnimatedSide(targetSide);
      setInspectingCollection(null);
      pageContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  return (
    <div ref={pageContainerRef} className="dj-page-container" style={{ width: '100%', height: '100%', overflowY: 'auto', position: 'relative' }}>
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
            {(!settings.optimizeSingleAlbum || settings.singleAlbumLayout === "dual" || deckTracks.left || animatedSide === "left" || (!deckTracks.left && !deckTracks.right && activeSide === "left")) && (
              <DjTurntable 
                track={deckTracks.left || (animatedSide === "left" ? animatedTrack : null)} 
                isActive={(activeSide === "left" && playback.isPlaying) || (animatedSide === "left" && !!animatedTrack)} 
                isAppPlaying={playback.isPlaying || (animatedSide === "left" && !!animatedTrack)}
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
            
            {(!settings.optimizeSingleAlbum || settings.singleAlbumLayout === "dual" || deckTracks.right || animatedSide === "right" || (!deckTracks.left && !deckTracks.right && activeSide === "right")) && (
              <DjTurntable 
                track={deckTracks.right || (animatedSide === "right" ? animatedTrack : null)} 
                isActive={(activeSide === "right" && playback.isPlaying) || (animatedSide === "right" && !!animatedTrack)} 
                isAppPlaying={playback.isPlaying || (animatedSide === "right" && !!animatedTrack)}
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
      
      <SpineShelf onInspect={(col, rect) => setInspectingCollection({ collection: col, rect })} />
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
          <div className="record-vinyl-disc" style={{ transform: 'rotateX(55deg)', animation: 'fly-spin 1.5s linear forwards' }}>
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
