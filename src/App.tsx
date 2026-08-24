import { Disc3 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { BackgroundSettingsDialog } from "./components/BackgroundSettingsDialog";
import { CollectionsBrowser } from "./components/CollectionsBrowser";
import { ThemeIndicator } from "./components/ThemeIndicator";
import { Button } from "./components/ui/button";
import { useArtworkPalette } from "./hooks/useArtworkColor";
import { useCustomBackground } from "./hooks/useCustomBackground";
import { useTheme } from "./hooks/useTheme";
import { recordRecentlyPlayed } from "./lib/collections";
import { spotify, type PlaybackState, type Track } from "./lib/spotify";
import { MidnightMixTheme } from "./themes/MidnightMixTheme";
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
  const { theme, setTheme } = useTheme();
  const customBackground = useCustomBackground();
  const backgroundPalette = useArtworkPalette(customBackground.imageUrl);
  const refreshSequence = useRef(0);
  const appliedRefresh = useRef(0);
  const selectionSequence = useRef(0);
  const selectionTimer = useRef(0);
  const actionTimers = useRef<number[]>([]);

  async function refresh() {
    const sequence = ++refreshSequence.current;
    try {
      const next = await spotify.playback();
      if (sequence >= appliedRefresh.current) {
        appliedRefresh.current = sequence;
        if (next.current) recordRecentlyPlayed(next.current);
        setPlayback(next);
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

  async function playCollectedTrack(track: Track) {
    if (!track.uri) throw new Error("This record does not have a Spotify URI.");
    const sequence = ++selectionSequence.current;
    window.clearTimeout(selectionTimer.current);
    setPendingTrack(track);
    try {
      await spotify.playUri(track.uri);
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

  return (
    <main className={`app-shell theme-${theme} ${showChrome ? "" : "chrome-hidden"}`}>
      <header className="topbar" aria-hidden={!showChrome}>
        <div className="wordmark">
          <BackgroundSettingsDialog background={customBackground}>
            <button className="wordmark-icon" aria-label="Open settings"><Disc3 size={20} /></button>
          </BackgroundSettingsDialog>
          <span>Listening Room</span>
        </div>
        <div className="topbar-actions">
          <span className={`status ${playback.connected ? "online" : ""}`}><i />{playback.deviceName ?? (playback.connected ? "Spotify connected" : "Offline")}</span>
          <CollectionsBrowser onPlayTrack={playCollectedTrack} />
          {!playback.connected && <Button onClick={connect} disabled={connecting}>{connecting ? "Opening Spotify..." : "Connect Spotify"}</Button>}
        </div>
      </header>

      <div className="theme-transition" key={theme}>
        {theme === "warm" ? <WarmRoomTheme {...themeProps} /> : <MidnightMixTheme {...themeProps} />}
      </div>

      <ThemeIndicator theme={theme} onChange={setTheme} />
      {error && <button className="error-toast" onClick={() => setError(null)}>{formatSpotifyError(error)}</button>}
    </main>
  );
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
