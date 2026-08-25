import { FastAverageColor } from "fast-average-color";
import { useEffect, useState } from "react";

export type AmbientColor = [number, number, number];

export interface ArtworkPalette {
  primary: AmbientColor;
  accent: AmbientColor;
}

const fallback: ArtworkPalette = {
  primary: [64, 91, 120],
  accent: [232, 156, 94],
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
    extractor
      .getColorAsync(imageUrl, {
        algorithm: "dominant",
        crossOrigin: "anonymous",
        ignoredColor: [[0, 0, 0, 255, 20]],
      })
      .then(async (result) => {
        const primary = normalizeColor(result.value.slice(0, 3) as AmbientColor);
        const accent = await extractAccent(imageUrl, primary).catch(() => complementary(primary));
        const next = { primary, accent };
        cache.set(imageUrl, next);
        if (cache.size > cacheLimit) cache.delete(cache.keys().next().value!);
        if (!cancelled) setPalette(next);
      })
      .catch(() => {
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

async function extractAccent(imageUrl: string, primary: AmbientColor): Promise<AmbientColor> {
  const image = await loadImage(imageUrl);
  const canvas = document.createElement("canvas");
  canvas.width = 48;
  canvas.height = 48;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Canvas is unavailable");
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const buckets = new Map<number, { count: number; red: number; green: number; blue: number }>();

  for (let index = 0; index < pixels.length; index += 4) {
    const red = pixels[index];
    const green = pixels[index + 1];
    const blue = pixels[index + 2];
    if (pixels[index + 3] < 200) continue;
    const lightness = (Math.max(red, green, blue) + Math.min(red, green, blue)) / 510;
    if (lightness < 0.08 || lightness > 0.94) continue;
    const key = (red >> 5) << 10 | (green >> 5) << 5 | (blue >> 5);
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
        bucket.red / bucket.count,
        bucket.green / bucket.count,
        bucket.blue / bucket.count,
      ];
      const saturation = (Math.max(...color) - Math.min(...color)) / 255;
      return { color, score: bucket.count * (0.45 + saturation) };
    })
    .filter(({ color }) => colorDistance(color, primary) > 68)
    .sort((left, right) => right.score - left.score);

  return candidates[0] ? brighten(normalizeColor(candidates[0].color)) : complementary(primary);
}

function loadImage(source: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Artwork could not be sampled"));
    image.src = source;
  });
}

function colorDistance(left: AmbientColor, right: AmbientColor) {
  return Math.hypot(left[0] - right[0], left[1] - right[1], left[2] - right[2]);
}

function complementary([red, green, blue]: AmbientColor): AmbientColor {
  return brighten(normalizeColor([255 - red, 255 - green, 255 - blue]));
}

function brighten(color: AmbientColor): AmbientColor {
  return color.map((channel) => Math.round(Math.min(255, channel * 1.18 + 12))) as AmbientColor;
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
