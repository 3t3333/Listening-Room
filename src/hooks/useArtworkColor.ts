import { FastAverageColor } from "fast-average-color";
import { useEffect, useState } from "react";

export type AmbientColor = [number, number, number];

export interface ArtworkPalette {
  primary: AmbientColor;
  accent: AmbientColor;
}

const fallback: ArtworkPalette = {
  primary: [32, 42, 58],
  accent: [0, 210, 106],
};
const cache = new Map<string, ArtworkPalette>();
const cacheLimit = 120;
const extractor = new FastAverageColor();

export function useArtworkPalette(imageUrl: string | null | undefined) {
  const [palette, setPalette] = useState<ArtworkPalette>(fallback);

  useEffect(() => {
    if (!imageUrl) {
      setPalette(fallback);
      return;
    }
    const cached = cache.get(imageUrl);
    if (cached) {
      setPalette(cached);
      return;
    }

    let cancelled = false;
    const isDataOrBlob = imageUrl.startsWith("data:") || imageUrl.startsWith("blob:");

    extractor
      .getColorAsync(imageUrl, {
        algorithm: "dominant",
        ignoredColor: [[0, 0, 0, 255, 20]],
        ...(isDataOrBlob ? {} : { crossOrigin: "anonymous" }),
      })
      .then(async (result) => {
        const primary = normalizeColor(result.value.slice(0, 3) as AmbientColor);
        const accent = await extractAccent(imageUrl, primary).catch(() => complementary(primary));
        const next = { primary, accent };
        cache.set(imageUrl, next);
        if (cache.size > cacheLimit) cache.delete(cache.keys().next().value!);
        if (!cancelled) setPalette(next);
      })
      .catch(async () => {
        // Fallback: try direct image rendering onto canvas without strict FastAverageColor wrapper
        try {
          const directSample = await sampleImageDirectly(imageUrl);
          if (!cancelled && directSample) {
            cache.set(imageUrl, directSample);
            if (cache.size > cacheLimit) cache.delete(cache.keys().next().value!);
            setPalette(directSample);
            return;
          }
        } catch {
          // ignore and fallback
        }
        if (!cancelled) setPalette(fallback);
      });

    return () => {
      cancelled = true;
    };
  }, [imageUrl]);

  return palette;
}

export function useArtworkColor(imageUrl: string | null | undefined) {
  return useArtworkPalette(imageUrl).primary;
}

async function sampleImageDirectly(imageUrl: string): Promise<ArtworkPalette | null> {
  const image = await loadImage(imageUrl);
  const canvas = document.createElement("canvas");
  canvas.width = 48;
  canvas.height = 48;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;

  let rSum = 0, gSum = 0, bSum = 0, total = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] < 200) continue;
    rSum += pixels[i];
    gSum += pixels[i + 1];
    bSum += pixels[i + 2];
    total++;
  }
  if (total === 0) return null;
  const primary = normalizeColor([
    Math.round(rSum / total),
    Math.round(gSum / total),
    Math.round(bSum / total),
  ]);
  const accent = extractAccentFromPixels(pixels, primary);
  return { primary, accent };
}

async function extractAccent(imageUrl: string, primary: AmbientColor): Promise<AmbientColor> {
  const image = await loadImage(imageUrl);
  const canvas = document.createElement("canvas");
  canvas.width = 48;
  canvas.height = 48;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Canvas is unavailable");
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  return extractAccentFromPixels(pixels, primary);
}

function extractAccentFromPixels(pixels: Uint8ClampedArray, primary: AmbientColor): AmbientColor {
  const buckets = new Map<number, { count: number; red: number; green: number; blue: number }>();

  for (let index = 0; index < pixels.length; index += 4) {
    const red = pixels[index];
    const green = pixels[index + 1];
    const blue = pixels[index + 2];
    if (pixels[index + 3] < 200) continue;
    const lightness = (Math.max(red, green, blue) + Math.min(red, green, blue)) / 510;
    if (lightness < 0.08 || lightness > 0.94) continue;
    const key = ((red >> 5) << 10) | ((green >> 5) << 5) | (blue >> 5);
    const bucket = buckets.get(key) ?? { count: 0, red: 0, green: 0, blue: 0 };
    bucket.count += 1;
    bucket.red += red;
    bucket.green += green;
    bucket.blue += blue;
    buckets.set(key, bucket);
  }

  const candidates = [...buckets.values()]
    .map((bucket) => {
      const color: AmbientColor = [
        Math.round(bucket.red / bucket.count),
        Math.round(bucket.green / bucket.count),
        Math.round(bucket.blue / bucket.count),
      ];
      const { s, l } = rgbToHsl(color);
      const satScore = s >= 0.22 ? s * 3.8 : s * 0.4;
      const lightScore = 1 - Math.abs(l - 0.55);
      const freqScore = Math.min(Math.log2(bucket.count + 1), 6) * 0.35;
      const dist = colorDistance(color, primary);
      const contrastScore = dist > 60 ? 1.0 : dist > 30 ? 0.4 : -0.6;
      const score = satScore * 2.5 + lightScore * 1.5 + freqScore + contrastScore;
      return { color, s, l, count: bucket.count, score };
    })
    .filter((c) => c.count >= 2)
    .sort((left, right) => right.score - left.score);

  // If we have saturated candidates, pick the highest scoring vibrant color and boost it for visualizers
  const vibrant = candidates.find((c) => c.s >= 0.20) || candidates[0];
  if (vibrant && vibrant.s >= 0.18) {
    return vividAccent(vibrant.color);
  }

  // If album is grayscale/monochromatic, return crisp high-contrast accent instead of dull beige
  if (candidates.length > 0 && candidates[0]) {
    return monochromeAccent(primary);
  }

  return complementary(primary);
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    const isDataOrBlob = source.startsWith("data:") || source.startsWith("blob:");
    if (!isDataOrBlob) {
      image.crossOrigin = "anonymous";
    }
    image.onload = () => resolve(image);
    image.onerror = () => {
      // If anonymous CORS load fails on an external URL, retry once without crossOrigin
      if (!isDataOrBlob && image.crossOrigin === "anonymous") {
        const retryImage = new Image();
        retryImage.onload = () => resolve(retryImage);
        retryImage.onerror = () => reject(new Error("Artwork could not be sampled"));
        retryImage.src = source;
        return;
      }
      reject(new Error("Artwork could not be sampled"));
    };
    image.src = source;
  });
}

function colorDistance(left: AmbientColor, right: AmbientColor) {
  return Math.hypot(left[0] - right[0], left[1] - right[1], left[2] - right[2]);
}

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

function hslToRgb(h: number, s: number, l: number): AmbientColor {
  let r: number, g: number, b: number;
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

function vividAccent(color: AmbientColor): AmbientColor {
  const { h, s, l } = rgbToHsl(color);
  const targetS = Math.min(1, Math.max(s * 1.2, 0.65));
  const targetL = Math.min(0.72, Math.max(l, 0.46));
  return hslToRgb(h, targetS, targetL);
}

function monochromeAccent(primary: AmbientColor): AmbientColor {
  const { l } = rgbToHsl(primary);
  return l < 0.5 ? [225, 230, 242] : [35, 40, 50];
}

function complementary([red, green, blue]: AmbientColor): AmbientColor {
  const { h, s, l } = rgbToHsl([red, green, blue]);
  const compHue = (h + 0.5) % 1.0;
  const compSat = Math.max(s, 0.65);
  const compLight = Math.min(0.68, Math.max(l, 0.48));
  return hslToRgb(compHue, compSat, compLight);
}

function normalizeColor([red, green, blue]: AmbientColor): AmbientColor {
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const lightness = (max + min) / 510;
  const scale = lightness < 0.22 ? 1.65 : lightness > 0.78 ? 0.74 : 1;
  const average = (red + green + blue) / 3;
  return [red, green, blue].map((channel) => {
    const saturated = average + (channel - average) * 1.15;
    return Math.round(Math.max(0, Math.min(230, saturated * scale)));
  }) as AmbientColor;
}
