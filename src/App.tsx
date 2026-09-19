import { Disc3 } from "lucide-react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { BackgroundSettingsDialog } from "./components/BackgroundSettingsDialog";
import { ThemeIndicator } from "./components/ThemeIndicator";
import { OnboardingDialog } from "./components/OnboardingDialog";
import { Button } from "./components/ui/button";
import { useArtworkPalette, type ArtworkPalette } from "./hooks/useArtworkColor";
import { useCustomBackground } from "./hooks/useCustomBackground";
import { useActiveCustomization } from "./hooks/useActiveCustomization";
import { useTheme } from "./hooks/useTheme";
import { useDjSettings } from "./hooks/useDjSettings";
import { defaultCollectionId, getCollections, recordRecentlyPlayed, initMp3Artwork } from "./lib/collections";
import { player, type PlaybackState, type Track } from "./lib/player";
import { mapTrackArtwork } from "./lib/customArtwork";
import { mp3Player, type Mp3PlaybackState } from "./lib/mp3Player";
import { MidnightMixTheme } from "./themes/MidnightMixTheme";
import { DjSetupTheme } from "./themes/DjSetupTheme";
import { ArchiveRoomTheme } from "./themes/ArchiveRoomTheme";
import { VisualizerStandTheme } from "./themes/VisualizerStandTheme";
import type { ThemeProps } from "./themes/types";
import { WarmRoomTheme } from "./themes/WarmRoomTheme";

const emptyPlayback: PlaybackState = {
  status: "authenticationRequired",
  connected: false,
  active: false,
  isPlaying: false,
  current: null,
  next: null,
  deviceName: null,
  volumePercent: null,
  canPlay: false,
  canPause: false,
  canSkipNext: false,
  canSkipPrevious: false,
  error: null,
};

function isSameTrack(a: Track | null | undefined, b: Track | null | undefined): boolean {
  if (!a || !b) return false;
  if (a.uri && b.uri && a.uri === b.uri) return true;
  if ((a as any).audioId && (b as any).audioId && (a as any).audioId === (b as any).audioId) return true;
  return a.name === b.name && a.artist === b.artist;
}

export function App() {
  const [playback, setPlayback] = useState(emptyPlayback);
  const [pendingTrack, setPendingTrack] = useState<Track | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showChrome, setShowChrome] = useState(true);
  const [pageZoom, setPageZoom] = useState(readPageZoom);
  const [zoomNotice, setZoomNotice] = useState<number | null>(null);
  const { theme, setTheme } = useTheme();
  const [djSettings] = useDjSettings();
  const [albumQueue, setAlbumQueue] = useState<Track[][]>([]);
  const customBackground = useCustomBackground();
  const [mp3State, setMp3State] = useState<Mp3PlaybackState>(() => mp3Player.getState());
  const refreshSequence = useRef(0);
  const appliedRefresh = useRef(0);
  const selectionSequence = useRef(0);
  const selectionTimer = useRef(0);
  const actionTimers = useRef<number[]>([]);
  const zoomNoticeTimer = useRef(0);
  const recentTrack = useRef<string | null>(null);
  const backendError = useRef<string | null>(null);
  const currentAlbumRef = useRef<Track[] | null>(null);
  const hasPlayedAlbumRef = useRef(false);
  const isTransitioningRef = useRef(false);
  const userPausedRef = useRef(false);
  const wasPlayingRef = useRef(false);

  const albumQueueRef = useRef(albumQueue);
  useEffect(() => {
    albumQueueRef.current = albumQueue;
  }, [albumQueue]);

  const djSettingsRef = useRef(djSettings);
  useEffect(() => {
    djSettingsRef.current = djSettings;
  }, [djSettings]);

  useEffect(() => {
    const style = djSettings.vinylDiscStyle || "realistic";
    document.documentElement.dataset.vinylDiscStyle = style;
    if (style === "classic") {
      document.documentElement.classList.add("vinyl-style-classic");
      document.documentElement.classList.remove("vinyl-style-realistic");
    } else {
      document.documentElement.classList.add("vinyl-style-realistic");
      document.documentElement.classList.remove("vinyl-style-classic");
    }
  }, [djSettings.vinylDiscStyle]);

  useEffect(() => {
    void initMp3Artwork();
  }, []);

  useEffect(() => {
    function handleMp3Changed(e: Event) {
      if (e instanceof CustomEvent && e.detail) {
        setMp3State(e.detail);
      }
    }
    async function handleMp3Requested() {
      if (playback.isPlaying) {
        try {
          await player.pause();
        } catch {
          // ignore
        }
      }
    }

    function handleMp3Error(e: Event) {
      if (e instanceof CustomEvent && e.detail) {
        setError(`Audio playback error (${e.detail.code || "UNKNOWN"}): ${e.detail.message || "Could not play audio track."}`);
      }
    }

    function handleMp3AlbumCompleted() {
      if (albumQueueRef.current.length > 0) {
        playNextQueuedAlbum();
      }
    }

    window.addEventListener("mp3:playback-changed", handleMp3Changed);
    window.addEventListener("mp3:playback-requested", handleMp3Requested);
    window.addEventListener("mp3:playback-error", handleMp3Error);
    window.addEventListener("mp3:album-completed", handleMp3AlbumCompleted);
    return () => {
      window.removeEventListener("mp3:playback-changed", handleMp3Changed);
      window.removeEventListener("mp3:playback-requested", handleMp3Requested);
      window.removeEventListener("mp3:playback-error", handleMp3Error);
      window.removeEventListener("mp3:album-completed", handleMp3AlbumCompleted);
    };
  }, [playback.isPlaying]);

  function handleQueueAlbum(tracks: Track[]) {
    if (djSettings.queueAlbumsSequentially) {
      const isPlaying = mp3State.current ? mp3State.isPlaying : playback.isPlaying;
      const hasCurrent = Boolean(mp3State.current || playback.current);
      if (!isPlaying && !hasCurrent) {
        void playCollectedTrack(tracks[0], tracks);
        return;
      }
      setAlbumQueue((q) => [...q, tracks]);
    } else {
      // Fallback to queueing all tracks
      (async () => {
        for (const track of tracks) {
          if (track.uri) {
            await player.queueUri(track.uri);
          }
        }
      })();
    }
  }

  function applyPlayback(rawNext: PlaybackState) {
    const next = { ...rawNext, current: mapTrackArtwork(rawNext.current), next: mapTrackArtwork(rawNext.next) };
    const nextTrack = next.current ? trackKey(next.current) : null;
    if (next.current && nextTrack !== recentTrack.current) {
      recentTrack.current = nextTrack;
      recordRecentlyPlayed(next.current);
    }
    if (next.error && next.error !== backendError.current) setError(next.error);
    backendError.current = next.error;
    setPlayback((current) => playbackEqual(current, next) ? current : next);
    setPendingTrack((current) => current?.uri && current.uri === next.current?.uri ? null : current);
  }

  async function refresh() {
    const sequence = ++refreshSequence.current;
    try {
      const next = await player.playback();
      if (sequence >= appliedRefresh.current) {
        appliedRefresh.current = sequence;
        applyPlayback(next);
      }
      return 15000;
    } catch (reason) {
      const message = String(reason);
      setError(message);
      return getRetryDelay(message);
    }
  }

  useEffect(() => {
    let cancelled = false;
    let timer = 0;
    let unlisten: UnlistenFn | undefined;
    async function poll() {
      const delay = await refresh();
      if (!cancelled) timer = window.setTimeout(() => void poll(), delay);
    }
    void listen<PlaybackState>("player-state-changed", ({ payload }) => {
      appliedRefresh.current = ++refreshSequence.current;
      applyPlayback(payload);
    }).then((stopListening) => {
      if (cancelled) stopListening();
      else unlisten = stopListening;
    });

    const handleArtworkChanged = () => {
      setPlayback(current => ({
        ...current,
        current: mapTrackArtwork(current.current),
        next: mapTrackArtwork(current.next),
      }));
    };
    window.addEventListener("artwork:changed", handleArtworkChanged);

    void mp3Player.syncAudioOutput();
    void poll();
    return () => {
      cancelled = true;
      unlisten?.();
      window.removeEventListener("artwork:changed", handleArtworkChanged);
      window.clearTimeout(timer);
      window.clearTimeout(selectionTimer.current);
      window.clearTimeout(zoomNoticeTimer.current);
      actionTimers.current.forEach(window.clearTimeout);
    };
  }, []);

  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key !== "Escape" || document.querySelector('[role="dialog"]')) return;
      setShowChrome((visible) => !visible);
    }
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, []);

  useEffect(() => {
    function handleZoom(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      const reset = event.key === "0" || event.code === "Numpad0";
      const increase = event.key === "+" || event.key === "=" || event.code === "NumpadAdd";
      const decrease = event.key === "-" || event.key === "_" || event.code === "NumpadSubtract";
      if (!reset && !increase && !decrease) return;
      event.preventDefault();
      const next = reset ? 1 : Math.max(0.6, Math.min(1.4, Math.round((pageZoom + (increase ? 0.1 : -0.1)) * 10) / 10));
      setPageZoom(next);
      localStorage.setItem("listening-room-page-zoom", String(next));
      setZoomNotice(Math.round(next * 100));
      window.clearTimeout(zoomNoticeTimer.current);
      zoomNoticeTimer.current = window.setTimeout(() => setZoomNotice(null), 900);
    }
    window.addEventListener("keydown", handleZoom);
    return () => window.removeEventListener("keydown", handleZoom);
  }, [pageZoom]);

  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [hasRequestedConnect, setHasRequestedConnect] = useState(false);

  useEffect(() => {
    if (playback.connected) {
      setOnboardingOpen(false);
      setHasRequestedConnect(false);
    }
  }, [playback.connected]);

  useEffect(() => {
    if (onboardingOpen && playback.status === "authenticationRequired") {
      setHasRequestedConnect(true);
      void connect();
    }
  }, [onboardingOpen, playback.status]);

  async function connect() {
    setConnecting(true);
    setError(null);
    try {
      await player.connect();
      await refresh();
    } catch (reason) {
      setError(String(reason));
    } finally {
      setConnecting(false);
    }
  }

  async function runPlaybackAction(action: () => Promise<void>, optimisticPlaying?: boolean) {
    setError(null);
    selectionSequence.current += 1;
    setPendingTrack(null);
    window.clearTimeout(selectionTimer.current);
    if (optimisticPlaying !== undefined) {
      setPlayback((current) => ({ ...current, isPlaying: optimisticPlaying }));
    }
    try {
      await action();
      scheduleActionRefreshes();
    } catch (reason) {
      setError(String(reason));
      await refresh();
    }
  }

  function scheduleActionRefreshes() {
    actionTimers.current.forEach(window.clearTimeout);
    actionTimers.current = [100, 500].map((delay) => window.setTimeout(() => void refresh(), delay));
  }

  async function playCollectedTrack(track: Track, collection: any = [track]) {
    const trackList: Track[] = Array.isArray(collection)
      ? collection
      : Array.isArray(collection?.tracks)
      ? collection.tracks
      : [track];

    currentAlbumRef.current = trackList;
    hasPlayedAlbumRef.current = true;
    userPausedRef.current = false;

    const isMp3 = Boolean(
      track.audioId ||
      track.uri?.startsWith("mp3:") ||
      (collection as any)?.format === "mp3"
    );

    if (isMp3) {
      setError(null);
      try {
        await mp3Player.play(track, trackList);
        recordRecentlyPlayed(track);
      } catch (err: any) {
        console.error("Failed to play MP3 track:", err);
        setError(err?.message || "Failed to play MP3 track");
      }
      return;
    }
    mp3Player.stop();
    if (!track.uri) throw new Error("This record does not have a Spotify URI.");
    const uris = trackList.flatMap((item) => item.uri ? [item.uri] : []);
    const sequence = ++selectionSequence.current;
    window.clearTimeout(selectionTimer.current);
    setPendingTrack(track);
    try {
      await player.playCollection(uris, track.uri);
      recordRecentlyPlayed(track);
      scheduleActionRefreshes();
      selectionTimer.current = window.setTimeout(() => {
        if (selectionSequence.current === sequence) setPendingTrack(null);
      }, 10000);
    } catch (reason) {
      if (selectionSequence.current === sequence) setPendingTrack(null);
      throw reason;
    }
  }

  const isAtEndOfCurrentAlbum = useCallback((currentTrack: Track | null): boolean => {
    const album = currentAlbumRef.current;
    if (!album || album.length === 0) return true;
    if (!currentTrack) return true;
    const lastTrack = album[album.length - 1];
    if (isSameTrack(currentTrack, lastTrack)) return true;
    if (
      currentTrack.name &&
      lastTrack.name &&
      currentTrack.name.toLowerCase().includes(lastTrack.name.toLowerCase()) &&
      currentTrack.artist &&
      lastTrack.artist &&
      currentTrack.artist.toLowerCase().includes(lastTrack.artist.toLowerCase())
    ) {
      return true;
    }
    const idx = album.findIndex((t) => isSameTrack(t, currentTrack));
    if (idx >= 0 && idx === album.length - 1) return true;
    return false;
  }, []);

  const playNextQueuedAlbum = useCallback(() => {
    if (isTransitioningRef.current) return;
    if (albumQueueRef.current.length === 0) return;

    isTransitioningRef.current = true;
    const nextAlbum = albumQueueRef.current[0];

    setAlbumQueue((q) => {
      const rest = q.slice(1);
      return djSettingsRef.current.loopAlbumQueue ? [...rest, nextAlbum] : rest;
    });

    if (nextAlbum && nextAlbum.length > 0) {
      playCollectedTrack(nextAlbum[0], nextAlbum)
        .catch(console.error)
        .finally(() => {
          setTimeout(() => {
            isTransitioningRef.current = false;
          }, 1500);
        });
    } else {
      isTransitioningRef.current = false;
    }
  }, []);

  const basePlayback = pendingTrack ? { ...playback, current: pendingTrack } : playback;
  const activePlayback: PlaybackState = mp3State.current
    ? {
        ...basePlayback,
        active: true,
        isPlaying: mp3State.isPlaying,
        current: mp3State.current,
        next: mp3State.collection.length > 0
          ? (() => {
              const idx = mp3State.collection.findIndex((t) => isSameTrack(t, mp3State.current));
              return idx >= 0 && idx < mp3State.collection.length - 1 ? mp3State.collection[idx + 1] : null;
            })()
          : basePlayback.next,
        volumePercent: Math.round(mp3State.volume * 100),
        canPlay: true,
        canPause: true,
        canSkipNext: true,
        canSkipPrevious: true,
      }
    : basePlayback;

  useEffect(() => {
    const isCurrentlyPlaying = activePlayback.isPlaying;
    const wasPlaying = wasPlayingRef.current;
    wasPlayingRef.current = isCurrentlyPlaying;

    if (albumQueue.length === 0 || !hasPlayedAlbumRef.current || isTransitioningRef.current) {
      return;
    }

    const isEndOfAlbum = !activePlayback.current || isAtEndOfCurrentAlbum(activePlayback.current);
    const finishedNaturally = wasPlaying && !isCurrentlyPlaying && !userPausedRef.current;
    const idleAtEnd = !isCurrentlyPlaying && isEndOfAlbum && !userPausedRef.current;

    if (finishedNaturally || idleAtEnd) {
      playNextQueuedAlbum();
    }
  }, [
    activePlayback.isPlaying,
    activePlayback.current,
    activePlayback.next,
    albumQueue.length,
    isAtEndOfCurrentAlbum,
    playNextQueuedAlbum,
  ]);

  const activeCustomization = useActiveCustomization(activePlayback.current, customBackground);
  const staticArtworkPalette = useArtworkPalette(
    activeCustomization.effectiveMediaType === "video" ? null : activeCustomization.effectiveImageUrl
  );
  const [dynamicPalette, setDynamicPalette] = useState<ArtworkPalette | null>(null);

  useEffect(() => {
    function handleDynamicColor(e: any) {
      if (e.detail?.primary && e.detail?.accent) {
        setDynamicPalette({ primary: e.detail.primary, accent: e.detail.accent });
      }
    }
    window.addEventListener("livewallpaper:dynamic-color", handleDynamicColor);
    return () => window.removeEventListener("livewallpaper:dynamic-color", handleDynamicColor);
  }, []);

  useEffect(() => {
    setDynamicPalette(null);
  }, [activeCustomization.effectiveImageUrl]);

  const backgroundPalette = dynamicPalette || activeCustomization.effectivePalette || staticArtworkPalette;

  const statusLabel = playback.status === "connecting"
    ? "Connecting to Spotify..."
    : playback.status === "reconnecting"
      ? "Reconnecting to Spotify..."
      : playback.deviceName ?? (playback.connected ? "Spotify connected" : "Offline");

  const themeProps: ThemeProps = {
    playback: activePlayback,
    albumQueue,
    customVisualizerRgb: activeCustomization.customVisualizerRgb,
    vinylColor: activeCustomization.vinylColor,
    background: {
      imageUrl: activeCustomization.effectiveImageUrl,
      opacity: activeCustomization.effectiveOpacity,
      adaptColors: customBackground.adaptColors,
      palette: backgroundPalette,
      positionX: activeCustomization.effectivePositionX,
      positionY: activeCustomization.effectivePositionY,
      fit: activeCustomization.effectiveFit,
      zoom: activeCustomization.effectiveZoom,
      pauseVideoOnMusicPause: customBackground.pauseVideoOnMusicPause,
      schedule: activeCustomization.effectiveSchedule,
      customVisualizerRgb: activeCustomization.customVisualizerRgb,
    },
    onToggle: () => {
      // 1. If currently playing MP3, toggle pause/play
      if (mp3State.current && mp3State.isPlaying) {
        userPausedRef.current = true;
        mp3Player.pause();
        return;
      }
      if (mp3State.current && !mp3State.isPlaying) {
        const isMp3TrackDone = mp3State.duration > 0 && mp3State.currentTime >= mp3State.duration - 0.5;
        if (albumQueue.length > 0 && isMp3TrackDone) {
          userPausedRef.current = false;
          playNextQueuedAlbum();
          return;
        }
        userPausedRef.current = false;
        mp3Player.resume();
        return;
      }

      // 2. If playback is paused / stopped and we have a queued album waiting, play it!
      if (!activePlayback.isPlaying && albumQueue.length > 0) {
        userPausedRef.current = false;
        playNextQueuedAlbum();
        return;
      }

      // 3. If playback is paused at the end of an album with no queue, restart it
      const isEnd = !activePlayback.current || (!activePlayback.next && isAtEndOfCurrentAlbum(activePlayback.current));
      if (!activePlayback.isPlaying && isEnd) {
        if (currentAlbumRef.current && currentAlbumRef.current.length > 0) {
          userPausedRef.current = false;
          void playCollectedTrack(currentAlbumRef.current[0], currentAlbumRef.current);
          return;
        }
      }

      // 4. Normal Spotify play/pause
      userPausedRef.current = playback.isPlaying;
      void runPlaybackAction(playback.isPlaying ? player.pause : player.play, !playback.isPlaying);
    },
    onPrevious: () => {
      userPausedRef.current = false;
      if (mp3State.current) {
        mp3Player.previous();
        return;
      }
      void runPlaybackAction(player.previous);
    },
    onNext: () => {
      userPausedRef.current = false;
      if (mp3State.current) {
        mp3Player.next();
        return;
      }
      if (!playback.next && albumQueue.length > 0) {
        playNextQueuedAlbum();
        return;
      }
      void runPlaybackAction(player.next);
    },
    onPlayTrack: playCollectedTrack,
    onQueueTrack: (track) => track.uri ? player.queueUri(track.uri) : Promise.reject(new Error("No URI")),
    onQueueAlbum: handleQueueAlbum
  };
  useEffect(() => {
    const style = djSettings.vinylDiscStyle || "realistic";
    document.documentElement.dataset.vinylDiscStyle = style;
    document.documentElement.classList.remove("vinyl-style-realistic", "vinyl-style-classic");
    document.documentElement.classList.add(`vinyl-style-${style}`);
  }, [djSettings.vinylDiscStyle]);

  const shellStyle = pageZoom === 1 ? undefined : {
    width: `${100 / pageZoom}%`,
    height: `${100 / pageZoom}dvh`,
    transform: `scale(${pageZoom})`,
    transformOrigin: "top left",
  } as CSSProperties;

  return (
    <main className={`app-shell theme-${theme} vinyl-style-${djSettings.vinylDiscStyle || "realistic"} ${showChrome ? "" : "chrome-hidden"}`} style={shellStyle}>
      <header className="topbar" aria-hidden={!showChrome}>
        <div className="wordmark">
          <BackgroundSettingsDialog background={customBackground}>
            <button className="wordmark-icon" aria-label="Open settings"><Disc3 size={20} /></button>
          </BackgroundSettingsDialog>
          <span>Listening Room</span>
        </div>
        <div className="topbar-actions">
          <span className={`status ${playback.connected ? "online" : ""}`} title={playback.error ?? undefined}><i />{statusLabel}</span>
          {!playback.connected && (
            <OnboardingDialog open={onboardingOpen} onOpenChange={setOnboardingOpen}>
              {playback.status === "authenticationRequired" || hasRequestedConnect ? (
                <Button disabled={connecting && playback.status === "authenticationRequired"}>
                  {connecting && playback.status === "authenticationRequired" ? "Starting..." : "Connect Spotify"}
                </Button>
              ) : (
                <div style={{ display: 'none' }} />
              )}
            </OnboardingDialog>
          )}
        </div>
      </header>

      <div className="theme-transition" key={theme}>
        {theme === "warm" && <WarmRoomTheme {...themeProps} />}
        {theme === "midnight" && <MidnightMixTheme {...themeProps} />}
        {theme === "archive" && <ArchiveRoomTheme {...themeProps} onPlayTrack={playCollectedTrack} onQueueTrack={(track) => track.uri ? player.queueUri(track.uri) : Promise.reject(new Error("This record does not have a Spotify URI."))} onQueueAlbum={handleQueueAlbum} />}
        {theme === "dj-setup" && <DjSetupTheme {...themeProps} />}
        {theme === "visualizer-stand" && <VisualizerStandTheme {...themeProps} />}
      </div>

      <ThemeIndicator theme={theme} onChange={setTheme} />
      {zoomNotice !== null && <output className="zoom-toast" aria-live="polite">{zoomNotice}%</output>}
      {error && <button className="error-toast" onClick={() => setError(null)}>{formatSpotifyError(error)}</button>}
    </main>
  );
}

function trackKey(track: Track | null) {
  return track?.uri ?? (track ? `${track.name}\u0000${track.artist}` : null);
}

function playbackEqual(left: PlaybackState, right: PlaybackState) {
  return left.status === right.status
    && left.connected === right.connected
    && left.active === right.active
    && left.isPlaying === right.isPlaying
    && trackKey(left.current) === trackKey(right.current)
    && trackKey(left.next) === trackKey(right.next)
    && left.deviceName === right.deviceName
    && left.volumePercent === right.volumePercent
    && left.canPlay === right.canPlay
    && left.canPause === right.canPause
    && left.canSkipNext === right.canSkipNext
    && left.canSkipPrevious === right.canSkipPrevious
    && left.error === right.error;
}

function readPageZoom() {
  const stored = Number(localStorage.getItem("listening-room-page-zoom"));
  return Number.isFinite(stored) && stored >= 0.6 && stored <= 1.4 ? stored : 1;
}

function getRetryDelay(message: string) {
  const retryAfter = message.match(/Retry after (\d+)s/i)?.[1];
  if (retryAfter) return Math.max(6000, Number(retryAfter) * 1000);
  return message.includes("429") ? 30000 : 12000;
}

function formatSpotifyError(message: string) {
  return message.replace(/Retry after (\d+)s\./i, (_, value: string) => {
    const seconds = Number(value);
    if (seconds >= 3600) return `Spotify has asked the app to wait about ${Math.ceil(seconds / 3600)} hours.`;
    if (seconds >= 60) return `Spotify has asked the app to wait about ${Math.ceil(seconds / 60)} minutes.`;
    return `Spotify has asked the app to wait ${seconds} seconds.`;
  });
}
