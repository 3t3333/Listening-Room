import { Disc3 } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { BackgroundSettingsDialog } from "./components/BackgroundSettingsDialog";
import { CollectionsBrowser } from "./components/CollectionsBrowser";
import { ThemeIndicator } from "./components/ThemeIndicator";
import { Button } from "./components/ui/button";
import { useArtworkPalette } from "./hooks/useArtworkColor";
import { useCustomBackground } from "./hooks/useCustomBackground";
import { useTheme } from "./hooks/useTheme";
import { defaultCollectionId, getCollections, recordRecentlyPlayed } from "./lib/collections";
import { spotify, type PlaybackState, type Track } from "./lib/spotify";
import { MidnightMixTheme } from "./themes/MidnightMixTheme";
import { ArchiveRoomTheme } from "./themes/ArchiveRoomTheme";
import type { ThemeProps } from "./themes/types";
import { WarmRoomTheme } from "./themes/WarmRoomTheme";

const emptyPlayback: PlaybackState = {
  connected: false,
  isPlaying: false,
  current: null,
  next: null,
  deviceName: null,
  canPlay: false,
  canPause: false,
  canSkipNext: false,
  canSkipPrevious: false,
};

export function App() {
  const [playback, setPlayback] = useState(emptyPlayback);
  const [pendingTrack, setPendingTrack] = useState<Track | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showChrome, setShowChrome] = useState(true);
  const [pageZoom, setPageZoom] = useState(readPageZoom);
  const [zoomNotice, setZoomNotice] = useState<number | null>(null);
  const { theme, setTheme } = useTheme();
  const customBackground = useCustomBackground();
  const backgroundPalette = useArtworkPalette(customBackground.imageUrl);
  const refreshSequence = useRef(0);
  const appliedRefresh = useRef(0);
  const selectionSequence = useRef(0);
  const selectionTimer = useRef(0);
  const actionTimers = useRef<number[]>([]);
  const zoomNoticeTimer = useRef(0);
  const recentTrack = useRef<string | null>(null);

  async function refresh() {
    const sequence = ++refreshSequence.current;
    try {
      const next = await spotify.playback();
      if (sequence >= appliedRefresh.current) {
        appliedRefresh.current = sequence;
        const nextTrack = next.current ? trackKey(next.current) : null;
        if (next.current && nextTrack !== recentTrack.current) {
          recentTrack.current = nextTrack;
          recordRecentlyPlayed(next.current);
        }
        setPlayback((current) => playbackEqual(current, next) ? current : next);
        setPendingTrack((current) => current?.uri && current.uri === next.current?.uri ? null : current);
      }
      return 6000;
    } catch (reason) {
      const message = String(reason);
      setError(message);
      return getRetryDelay(message);
    }
  }

  useEffect(() => {
    let cancelled = false;
    let timer = 0;
    async function poll() {
      const delay = await refresh();
      if (!cancelled) timer = window.setTimeout(() => void poll(), delay);
    }
    void poll();
    return () => {
      cancelled = true;
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

  async function connect() {
    setConnecting(true);
    setError(null);
    try {
      await spotify.connect();
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
    actionTimers.current = [300, 1200].map((delay) => window.setTimeout(() => void refresh(), delay));
  }

  async function playCollectedTrack(track: Track, collection: Track[] = [track]) {
    if (!track.uri) throw new Error("This record does not have a Spotify URI.");
    const userTracks = getCollections().find((item) => item.id === defaultCollectionId)?.tracks ?? [];
    const trackInUserCollection = userTracks.some((item) => trackKey(item) === trackKey(track));
    const playbackTracks = trackInUserCollection ? userTracks : [track, ...userTracks.filter((item) => trackKey(item) !== trackKey(track))];
    const uris = (playbackTracks.length ? playbackTracks : collection).flatMap((item) => item.uri ? [item.uri] : []);
    const sequence = ++selectionSequence.current;
    window.clearTimeout(selectionTimer.current);
    setPendingTrack(track);
    try {
      await spotify.playCollection(uris, track.uri);
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

  const displayPlayback = pendingTrack ? { ...playback, current: pendingTrack } : playback;

  const themeProps: ThemeProps = {
    playback: displayPlayback,
    background: {
      imageUrl: customBackground.imageUrl,
      opacity: customBackground.opacity,
      adaptColors: customBackground.adaptColors,
      palette: backgroundPalette,
    },
    onToggle: () => void runPlaybackAction(playback.isPlaying ? spotify.pause : spotify.play, !playback.isPlaying),
    onPrevious: () => void runPlaybackAction(spotify.previous),
    onNext: () => void runPlaybackAction(spotify.next),
  };
  const shellStyle = pageZoom === 1 ? undefined : {
    width: `${100 / pageZoom}%`,
    height: `${100 / pageZoom}dvh`,
    transform: `scale(${pageZoom})`,
    transformOrigin: "top left",
  } as CSSProperties;

  return (
    <main className={`app-shell theme-${theme} ${showChrome ? "" : "chrome-hidden"}`} style={shellStyle}>
      <header className="topbar" aria-hidden={!showChrome}>
        <div className="wordmark">
          <BackgroundSettingsDialog background={customBackground}>
            <button className="wordmark-icon" aria-label="Open settings"><Disc3 size={20} /></button>
          </BackgroundSettingsDialog>
          <span>Listening Room</span>
        </div>
        <div className="topbar-actions">
          <span className={`status ${playback.connected ? "online" : ""}`}><i />{playback.deviceName ?? (playback.connected ? "Spotify connected" : "Offline")}</span>
          <CollectionsBrowser onPlayTrack={playCollectedTrack} onQueueTrack={(track) => track.uri ? spotify.queueUri(track.uri) : Promise.reject(new Error("This record does not have a Spotify URI."))} />
          {!playback.connected && <Button onClick={connect} disabled={connecting}>{connecting ? "Opening Spotify..." : "Connect Spotify"}</Button>}
        </div>
      </header>

      <div className="theme-transition" key={theme}>
        {theme === "warm" && <WarmRoomTheme {...themeProps} />}
        {theme === "midnight" && <MidnightMixTheme {...themeProps} />}
        {theme === "archive" && <ArchiveRoomTheme {...themeProps} onPlayTrack={playCollectedTrack} onQueueTrack={(track) => track.uri ? spotify.queueUri(track.uri) : Promise.reject(new Error("This record does not have a Spotify URI."))} />}
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
  return left.connected === right.connected
    && left.isPlaying === right.isPlaying
    && trackKey(left.current) === trackKey(right.current)
    && trackKey(left.next) === trackKey(right.next)
    && left.deviceName === right.deviceName
    && left.canPlay === right.canPlay
    && left.canPause === right.canPause
    && left.canSkipNext === right.canSkipNext
    && left.canSkipPrevious === right.canSkipPrevious;
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
