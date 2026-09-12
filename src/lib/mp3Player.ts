import type { Track } from "./player";
import { getAudioTrackUrl } from "./mp3Storage";

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

  constructor() {
    this.audio = new Audio();
    const savedVolume = parseFloat(localStorage.getItem("mp3-volume") || "0.75");
    this.audio.volume = isNaN(savedVolume) ? 0.75 : Math.max(0, Math.min(1, savedVolume));
    this.setupListeners();
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

    this.audio.addEventListener("error", (e) => {
      console.error("MP3 audio playback error:", e);
      this.isPlayingState = false;
      this.emitState();
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

    const audioId = (track as any).audioId || track.uri?.replace("mp3:", "") || "";
    const url = await getAudioTrackUrl(audioId);

    if (!url) {
      console.warn("Audio URL not found for track:", track);
      throw new Error(`Audio file not found for "${track.name}". Please re-import or re-create this album.`);
    }

    if (this.activeUrl && this.activeUrl !== url) {
      URL.revokeObjectURL(this.activeUrl);
    }
    this.activeUrl = url;

    this.audio.src = url;
    this.audio.load();
    try {
      await this.audio.play();
    } catch (err: any) {
      console.error("Audio playback error:", err);
      throw new Error(`Could not play audio track: ${err?.message || err}`);
    }
  }

  public pause(): void {
    this.audio.pause();
  }

  public resume(): void {
    if (this.audio.src) {
      this.audio.play().catch(console.error);
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
      this.stop();
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

  public seek(seconds: number): void {
    this.audio.currentTime = seconds;
  }
}

export const mp3Player = new Mp3PlayerService();
