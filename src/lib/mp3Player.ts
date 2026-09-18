import { player, type Track } from "./player";
import { getAudioTrackUrl } from "./mp3Storage";

function findSinkIdForDevice(devices: MediaDeviceInfo[], targetDeviceName: string | null): string {
  if (!targetDeviceName || !targetDeviceName.trim()) {
    return "";
  }

  const audioOutputs = devices.filter((d) => d.kind === "audiooutput");
  if (audioOutputs.length === 0) {
    return "";
  }

  const clean = (s: string) =>
    s
      .toLowerCase()
      .replace(/^(default|communications)\s*-\s*/i, "")
      .trim();

  const cleanTarget = clean(targetDeviceName);

  // 1. Exact match (case insensitive, ignoring "Default - " prefix)
  const exactMatches = audioOutputs.filter((d) => clean(d.label) === cleanTarget);
  const specificExact = exactMatches.find((d) => d.deviceId !== "default" && d.deviceId !== "");
  if (specificExact) {
    return specificExact.deviceId;
  }
  if (exactMatches.length > 0) {
    return exactMatches[0].deviceId;
  }

  // 2. Substring match
  const substringMatches = audioOutputs.filter((d) => {
    const l = clean(d.label);
    return l && cleanTarget && (l.includes(cleanTarget) || cleanTarget.includes(l));
  });
  const specificSub = substringMatches.find((d) => d.deviceId !== "default" && d.deviceId !== "");
  if (specificSub) {
    return specificSub.deviceId;
  }
  if (substringMatches.length > 0) {
    return substringMatches[0].deviceId;
  }

  // 3. Keyword/token overlap
  const targetWords = cleanTarget.split(/[\s(),\-_]+/).filter((w) => w.length >= 3);
  if (targetWords.length > 0) {
    let bestDevice: MediaDeviceInfo | null = null;
    let maxMatches = 0;
    for (const d of audioOutputs) {
      const l = clean(d.label);
      let count = 0;
      for (const w of targetWords) {
        if (l.includes(w)) count++;
      }
      if (count > maxMatches) {
        maxMatches = count;
        bestDevice = d;
      }
    }
    if (bestDevice && maxMatches >= Math.min(2, targetWords.length)) {
      return bestDevice.deviceId;
    }
  }

  return "";
}

export interface Mp3PlaybackState {
  current: Track | null;
  isPlaying: boolean;
  collection: Track[];
  currentTime: number;
  duration: number;
  volume: number;
}

class Mp3PlayerService {
  private audio: HTMLAudioElement;
  private currentTrack: Track | null = null;
  private currentCollection: Track[] = [];
  private activeUrl: string | null = null;
  private isPlayingState = false;
  private selectedOutputDevice: string | null = null;
  private currentSinkId: string = "";
  private pendingSinkPromise: Promise<void> | null = null;

  constructor() {
    this.audio = new Audio();
    const savedVolume = parseFloat(localStorage.getItem("mp3-volume") || "0.75");
    this.audio.volume = isNaN(savedVolume) ? 0.75 : Math.max(0, Math.min(1, savedVolume));
    this.selectedOutputDevice = localStorage.getItem("selected-audio-output") || null;
    this.setupListeners();
    this.setupDeviceListeners();
    void this.syncAudioOutput();
  }

  private setupDeviceListeners() {
    if (typeof navigator !== "undefined" && navigator.mediaDevices) {
      navigator.mediaDevices.addEventListener("devicechange", () => {
        void this.reapplyAudioOutput();
      });
    }
  }

  private async reapplyAudioOutput(): Promise<void> {
    if (this.selectedOutputDevice) {
      await this.setAudioOutput(this.selectedOutputDevice);
    }
  }

  public async syncAudioOutput(): Promise<void> {
    try {
      const state = await player.audioOutputs();
      await this.setAudioOutput(state.selected);
    } catch {
      if (this.selectedOutputDevice) {
        await this.setAudioOutput(this.selectedOutputDevice);
      }
    }
  }

  public async setAudioOutput(deviceName: string | null): Promise<void> {
    this.selectedOutputDevice = deviceName || null;
    if (deviceName) {
      localStorage.setItem("selected-audio-output", deviceName);
    } else {
      localStorage.removeItem("selected-audio-output");
    }

    if (typeof HTMLMediaElement === "undefined" || !("setSinkId" in HTMLMediaElement.prototype)) {
      return;
    }

    const task = (async () => {
      let sinkId = "";
      if (deviceName && typeof navigator !== "undefined" && navigator.mediaDevices?.enumerateDevices) {
        try {
          const devices = await navigator.mediaDevices.enumerateDevices();
          sinkId = findSinkIdForDevice(devices, deviceName);
        } catch (e) {
          console.warn("[mp3Player] Could not enumerate audio output devices:", e);
        }
      }

      try {
        await (this.audio as any).setSinkId(sinkId);
        this.currentSinkId = sinkId;
      } catch (err) {
        console.warn(`[mp3Player] Failed to set sinkId "${sinkId}" for device "${deviceName}":`, err);
        if (sinkId !== "") {
          try {
            await (this.audio as any).setSinkId("");
            this.currentSinkId = "";
          } catch {
            // ignore
          }
        }
      }
    })();

    this.pendingSinkPromise = task;
    await task;
  }

  private setupListeners() {
    this.audio.addEventListener("play", () => {
      this.isPlayingState = true;
      this.emitState();
    });

    this.audio.addEventListener("pause", () => {
      this.isPlayingState = false;
      this.emitState();
    });

    this.audio.addEventListener("timeupdate", () => {
      this.emitState();
    });

    this.audio.addEventListener("ended", () => {
      this.next();
    });

    this.audio.addEventListener("error", () => {
      const err = this.audio.error;
      const codeMap: Record<number, string> = {
        1: "MEDIA_ERR_ABORTED",
        2: "MEDIA_ERR_NETWORK",
        3: "MEDIA_ERR_DECODE",
        4: "MEDIA_ERR_SRC_NOT_SUPPORTED",
      };
      const codeName = err ? (codeMap[err.code] || `CODE_${err.code}`) : "UNKNOWN";
      console.error("MP3 audio playback error:", codeName, err?.message);
      this.isPlayingState = false;
      this.emitState();
      window.dispatchEvent(new CustomEvent("mp3:playback-error", { detail: { code: codeName, message: err?.message } }));
    });
  }

  private emitState() {
    const detail: Mp3PlaybackState = {
      current: this.currentTrack,
      isPlaying: this.isPlayingState,
      collection: this.currentCollection,
      currentTime: this.audio.currentTime || 0,
      duration: this.audio.duration || 0,
      volume: this.audio.volume,
    };
    window.dispatchEvent(new CustomEvent("mp3:playback-changed", { detail }));
  }

  public getState(): Mp3PlaybackState {
    return {
      current: this.currentTrack,
      isPlaying: this.isPlayingState,
      collection: this.currentCollection,
      currentTime: this.audio.currentTime || 0,
      duration: this.audio.duration || 0,
      volume: this.audio.volume,
    };
  }

  public setVolume(volume: number): void {
    const clamped = Math.max(0, Math.min(1, volume));
    this.audio.volume = clamped;
    this.audio.muted = false;
    localStorage.setItem("mp3-volume", String(clamped));
    this.emitState();
  }

  public getVolume(): number {
    return this.audio.volume;
  }

  public async play(track: Track, collection: Track[] = [track]): Promise<void> {
    window.dispatchEvent(new CustomEvent("mp3:playback-requested"));

    this.currentTrack = track;
    this.currentCollection = Array.isArray(collection) ? collection : [track];

    const rawId = (track as any).audioId || track.uri || "";
    const cleanId = rawId.replace(/^mp3:/, "");
    let url = await getAudioTrackUrl(cleanId);
    if (!url && rawId !== cleanId) {
      url = await getAudioTrackUrl(rawId);
    }

    if (!url) {
      console.warn("Audio URL not found for track:", track);
      throw new Error(`Audio file not found for "${track.name}". Please re-import or re-create this album.`);
    }

    this.activeUrl = url;
    if (this.audio.src !== url) {
      this.audio.src = url;
    }

    // Ensure not muted and has audible volume
    if (this.audio.volume === 0) {
      const savedVolume = parseFloat(localStorage.getItem("mp3-volume") || "0.75");
      this.audio.volume = isNaN(savedVolume) || savedVolume === 0 ? 0.75 : savedVolume;
    }
    this.audio.muted = false;

    // Ensure the audio output device sink is configured
    if (this.pendingSinkPromise) {
      try {
        await this.pendingSinkPromise;
      } catch {
        // ignore
      }
    }
    if (typeof HTMLMediaElement !== "undefined" && "setSinkId" in HTMLMediaElement.prototype) {
      const activeSink = (this.audio as any).sinkId;
      if (activeSink !== this.currentSinkId) {
        try {
          await (this.audio as any).setSinkId(this.currentSinkId);
        } catch (e) {
          console.warn("[mp3Player] setSinkId check failed:", e);
        }
      }
    }

    try {
      await this.audio.play();
    } catch (err: any) {
      if (err?.name === "AbortError") {
        // Interrupted by another track play request; harmless
        return;
      }
      console.error("Audio playback error:", err);
      throw new Error(`Could not play audio track: ${err?.message || err}`);
    }
  }

  public pause(): void {
    this.audio.pause();
  }

  public resume(): void {
    if (this.audio.src) {
      this.audio.play().catch((err) => {
        if (err?.name !== "AbortError") console.error("Resume error:", err);
      });
    }
  }

  public toggle(): void {
    if (this.isPlayingState) {
      this.pause();
    } else {
      this.resume();
    }
  }

  public stop(): void {
    this.audio.pause();
    this.audio.currentTime = 0;
    this.currentTrack = null;
    this.isPlayingState = false;
    this.emitState();
  }

  public next(): void {
    if (!this.currentTrack || !this.currentCollection.length) return;
    const currentIndex = this.currentCollection.findIndex(
      (t) => (t as any).audioId === (this.currentTrack as any)?.audioId || t.uri === this.currentTrack?.uri
    );
    if (currentIndex >= 0 && currentIndex < this.currentCollection.length - 1) {
      const nextTrack = this.currentCollection[currentIndex + 1];
      void this.play(nextTrack, this.currentCollection);
    } else {
      const completedCollection = [...this.currentCollection];
      this.stop();
      window.dispatchEvent(
        new CustomEvent("mp3:album-completed", {
          detail: { collection: completedCollection },
        })
      );
    }
  }

  public previous(): void {
    if (this.audio.currentTime > 3) {
      this.audio.currentTime = 0;
      return;
    }
    if (!this.currentTrack || !this.currentCollection.length) return;
    const currentIndex = this.currentCollection.findIndex(
      (t) => (t as any).audioId === (this.currentTrack as any)?.audioId || t.uri === this.currentTrack?.uri
    );
    if (currentIndex > 0) {
      const prevTrack = this.currentCollection[currentIndex - 1];
      void this.play(prevTrack, this.currentCollection);
    } else {
      this.audio.currentTime = 0;
    }
  }

  public updateCollectionQueue(updatedTracks: Track[]): void {
    if (!this.currentTrack || !this.currentCollection.length) return;
    const hasCurrent = updatedTracks.some(
      (t) => (t as any).audioId === (this.currentTrack as any)?.audioId || (t.uri && t.uri === this.currentTrack?.uri)
    );
    if (hasCurrent) {
      this.currentCollection = [...updatedTracks];
      this.emitState();
    }
  }

  public seek(seconds: number): void {
    this.audio.currentTime = seconds;
  }
}

export const mp3Player = new Mp3PlayerService();
