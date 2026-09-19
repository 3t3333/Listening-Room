import { FastAverageColor } from "fast-average-color";
import type { AmbientColor, ArtworkPalette } from "../hooks/useArtworkColor";

export type LiveWallpaperColorScanMode = "si5" | "first-frame" | "dynamic";

export interface AmbientColorScheduleEntry {
  time: number; // in seconds
  primary: AmbientColor;
  accent: AmbientColor;
}

export interface LiveWallpaperScanResult {
  palette: ArtworkPalette;
  schedule?: AmbientColorScheduleEntry[];
  duration: number;
}

// Global cache for blob URLs so any component can instantly determine media type without async fetch
const blobMimeCache = new Map<string, string>();

export function registerMediaBlob(url: string, mimeType: string) {
  if (url) blobMimeCache.set(url, mimeType);
}

export function revokeMediaBlob(url: string) {
  if (url) {
    blobMimeCache.delete(url);
    try {
      URL.revokeObjectURL(url);
    } catch {
      // Ignore revoke errors
    }
  }
}

export function getMediaBlobMime(url: string | null | undefined): string | null {
  if (!url) return null;
  return blobMimeCache.get(url) ?? null;
}

/**
 * Checks if a given media URL, filename, or MIME type represents a video file
 * Supports MP4 (.mp4), WebM (.webm), QuickTime (.mov), and M4V (.m4v)
 */
export function isVideoMedia(url: string | null | undefined, explicitMime?: string | null): boolean {
  if (!url && !explicitMime) return false;
  if (explicitMime) {
    const cleanMime = explicitMime.toLowerCase();
    if (cleanMime.startsWith("video/")) return true;
  }
  if (!url) return false;

  const cached = blobMimeCache.get(url);
  if (cached?.toLowerCase().startsWith("video/")) return true;

  const cleanUrl = url.split("?")[0].toLowerCase();
  return (
    cleanUrl.endsWith(".mp4") ||
    cleanUrl.endsWith(".webm") ||
    cleanUrl.endsWith(".mov") ||
    cleanUrl.endsWith(".m4v") ||
    cleanUrl.endsWith(".ogg")
  );
}

export function formatVideoDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  if (mins > 0) {
    return `${mins}m ${secs}s`;
  }
  return `${secs}s`;
}

export function promptVideoDurationCutoff(duration: number): boolean {
  const formatted = formatVideoDuration(duration);
  return window.confirm(
    `The selected video is ${formatted} long. Live wallpapers are limited to 60 seconds.\n\nOnly the first 60 seconds of the video will be imported into the program and the rest will be cut off.\n\nIs that okay?`
  );
}

/**
 * Validates video file duration and dimensions.
 * If video exceeds maxSeconds (60s), prompts the user explaining that only the first
 * 60 seconds will be imported and the rest cut off.
 */
export function validateVideoDuration(
  file: File | Blob,
  maxSeconds: number = 60,
  options?: { promptIfLonger?: boolean }
): Promise<{ duration: number; width: number; height: number; wasTruncated: boolean }> {
  return new Promise((resolve, reject) => {
    const tempUrl = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;

    let cleanupDone = false;
    const cleanup = () => {
      if (cleanupDone) return;
      cleanupDone = true;
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(tempUrl);
    };

    video.onloadedmetadata = () => {
      const duration = video.duration;
      const width = video.videoWidth || 1920;
      const height = video.videoHeight || 1080;

      if (!isFinite(duration) || duration <= 0) {
        cleanup();
        reject(new Error("Unable to read video duration."));
        return;
      }

      if (duration > maxSeconds + 0.5) {
        const promptUser = options?.promptIfLonger ?? true;
        if (promptUser) {
          const accepted = promptVideoDurationCutoff(duration);
          if (!accepted) {
            cleanup();
            reject(new Error("Video upload cancelled by user."));
            return;
          }
          cleanup();
          resolve({
            duration: Math.min(duration, maxSeconds),
            width,
            height,
            wasTruncated: true,
          });
          return;
        } else {
          cleanup();
          reject(
            new Error(
              `Video wallpapers must be 60 seconds or shorter. This video is ${formatVideoDuration(
                duration
              )}.`
            )
          );
          return;
        }
      }

      cleanup();
      resolve({ duration, width, height, wasTruncated: false });
    };

    video.onerror = () => {
      cleanup();
      reject(new Error("Could not decode video file. Please ensure it is a valid MP4, WebM, or MOV video."));
    };

    video.src = tempUrl;
  });
}

const fac = new FastAverageColor();

/**
 * Converts RGB tuple to HSL
 */
function rgbToHsl([r, g, b]: AmbientColor): { h: number; s: number; l: number } {
  const normR = r / 255;
  const normG = g / 255;
  const normB = b / 255;

  const max = Math.max(normR, normG, normB);
  const min = Math.min(normR, normG, normB);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case normR:
        h = (normG - normB) / d + (normG < normB ? 6 : 0);
        break;
      case normG:
        h = (normB - normR) / d + 2;
        break;
      case normB:
        h = (normR - normG) / d + 4;
        break;
    }
    h /= 6;
  }

  return { h, s, l };
}

/**
 * Calculates score for "brightest and most saturated"
 * High saturation is strongly prioritized as requested:
 * "whichever is brightest and most saturated (or most saturated so if its less bright but more saturated then choose the most saturated)"
 */
function scoreColorVibrancy(color: AmbientColor): number {
  const { s, l } = rgbToHsl(color);
  // Heavy weight on saturation so saturated colors consistently beat washed-out bright grays/whites,
  // while between two saturated colors, the brighter one wins.
  return s * 2.0 + l * 0.5;
}

function complementary([r, g, b]: AmbientColor): AmbientColor {
  return [255 - r, 255 - g, 255 - b];
}

function normalizeColor([r, g, b]: AmbientColor): AmbientColor {
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
  if (luminance < 35) {
    const boost = 35 - luminance;
    return [
      Math.min(255, Math.round(r + boost * 1.3)),
      Math.min(255, Math.round(g + boost * 1.3)),
      Math.min(255, Math.round(b + boost * 1.3)),
    ];
  }
  return [r, g, b];
}

/**
 * Extracts palette from a single video frame at specified timestamp
 */
function captureFramePalette(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  timeSec: number
): Promise<{ primary: AmbientColor; accent: AmbientColor; vibrancyScore: number }> {
  return new Promise((resolve) => {
    const onSeeked = () => {
      video.removeEventListener("seeked", onSeeked);

      try {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const facResult = fac.getColor(canvas, {
          algorithm: "dominant",
          ignoredColor: [[0, 0, 0, 255, 15]],
        });

        const primary = normalizeColor(facResult.value.slice(0, 3) as AmbientColor);

        // Sample secondary quadrant for accent color
        const halfW = Math.floor(canvas.width / 2);
        const halfH = Math.floor(canvas.height / 2);
        const accentResult = fac.getColor(canvas, {
          algorithm: "dominant",
          left: halfW,
          top: 0,
          width: halfW,
          height: halfH,
          ignoredColor: [[0, 0, 0, 255, 15]],
        });

        let accent = normalizeColor(accentResult.value.slice(0, 3) as AmbientColor);
        if (accent[0] === primary[0] && accent[1] === primary[1] && accent[2] === primary[2]) {
          accent = complementary(primary);
        }

        const scorePrimary = scoreColorVibrancy(primary);
        const scoreAccent = scoreColorVibrancy(accent);
        const vibrancyScore = Math.max(scorePrimary, scoreAccent);

        resolve({ primary, accent, vibrancyScore });
      } catch {
        resolve({
          primary: [40, 60, 90],
          accent: [220, 140, 70],
          vibrancyScore: 0,
        });
      }
    };

    video.addEventListener("seeked", onSeeked, { once: true });
    video.currentTime = timeSec;
  });
}

/**
 * Scans video ambient colors upfront using one of the 3 modes:
 * - "si5" (Scanned from 5ths) - Default: 5 equidistant frames scored for maximum vibrancy/saturation
 * - "first-frame": instant frame scan at 0.1s
 * - "dynamic": creates a 5-second interval schedule for zero-CPU runtime transitions
 */
export async function scanVideoPalette(
  file: File | Blob,
  mode: LiveWallpaperColorScanMode = "si5",
  onProgress?: (percent: number) => void
): Promise<LiveWallpaperScanResult> {
  const tempUrl = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.preload = "auto";
  video.muted = true;
  video.playsInline = true;

  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 72;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  if (!ctx) {
    URL.revokeObjectURL(tempUrl);
    throw new Error("Canvas context initialization failed.");
  }

  const cleanup = () => {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(tempUrl);
  };

  try {
    // Wait for metadata
    const rawDuration = await new Promise<number>((resolve, reject) => {
      video.onloadedmetadata = () => resolve(video.duration);
      video.onerror = () => reject(new Error("Failed to load video for scanning."));
      video.src = tempUrl;
    });

    // If the video is longer than 60s, sample only within the first 60 seconds
    const duration = Math.min(rawDuration, 60);

    if (mode === "first-frame") {
      if (onProgress) onProgress(50);
      const sample = await captureFramePalette(video, canvas, ctx, Math.min(0.1, duration / 2));
      if (onProgress) onProgress(100);
      cleanup();
      return {
        palette: { primary: sample.primary, accent: sample.accent },
        duration,
      };
    }

    if (mode === "dynamic") {
      // Sample every 5 seconds
      const intervalSec = 5;
      const timestamps: number[] = [];
      for (let t = 0; t < duration; t += intervalSec) {
        timestamps.push(t);
      }
      if (timestamps.length === 0) timestamps.push(0);

      const schedule: AmbientColorScheduleEntry[] = [];
      let bestSample: { primary: AmbientColor; accent: AmbientColor; vibrancyScore: number } | null = null;

      for (let i = 0; i < timestamps.length; i++) {
        const time = timestamps[i];
        const sample = await captureFramePalette(video, canvas, ctx, time);
        schedule.push({
          time,
          primary: sample.primary,
          accent: sample.accent,
        });

        if (!bestSample || sample.vibrancyScore > bestSample.vibrancyScore) {
          bestSample = sample;
        }

        if (onProgress) {
          onProgress(Math.round(((i + 1) / timestamps.length) * 100));
        }
      }

      cleanup();
      return {
        palette: {
          primary: schedule[0]?.primary || [40, 60, 90],
          accent: schedule[0]?.accent || [220, 140, 70],
        },
        schedule,
        duration,
      };
    }

    // Default: si5 (Scanned from 5ths)
    // 5 frames across the video: 10%, 30%, 50%, 70%, 90%
    const fractions = [0.1, 0.3, 0.5, 0.7, 0.9];
    const candidateSamples: { primary: AmbientColor; accent: AmbientColor; vibrancyScore: number }[] = [];

    for (let i = 0; i < fractions.length; i++) {
      const time = Math.max(0, Math.min(duration - 0.05, duration * fractions[i]));
      const sample = await captureFramePalette(video, canvas, ctx, time);
      candidateSamples.push(sample);

      if (onProgress) {
        onProgress(Math.round(((i + 1) / fractions.length) * 100));
      }
    }

    // Pick whichever is brightest and most saturated
    candidateSamples.sort((a, b) => b.vibrancyScore - a.vibrancyScore);
    const best = candidateSamples[0];

    cleanup();
    return {
      palette: { primary: best.primary, accent: best.accent },
      duration,
    };
  } catch (err) {
    cleanup();
    throw err;
  }
}
