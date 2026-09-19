import { useEffect, useState } from "react";
import type { Track } from "../lib/player";
import { getCollections, defaultCollectionId, recentCollectionId, type Collection, type CollectionCustomization } from "../lib/collections";
import { getAlbumBackgroundUrl } from "../lib/mp3Storage";
import { isVideoMedia } from "../lib/liveWallpaper";

export interface ActiveCustomization {
  activeCollection: Collection | null;
  effectiveImageUrl: string | null;
  effectiveOpacity: number;
  effectivePositionX: number;
  effectivePositionY: number;
  effectiveFit: "cover" | "contain";
  effectiveZoom: number;
  effectivePalette?: { primary: [number, number, number]; accent: [number, number, number] } | null;
  effectiveSchedule?: import("../lib/liveWallpaper").AmbientColorScheduleEntry[] | null;
  effectiveMediaType?: "image" | "video";
  customVisualizerRgb: string | null;
  vinylColor: string | null;
}

function hexToRgbString(hex: string): string | null {
  const clean = hex.replace("#", "").trim();
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16);
    const g = parseInt(clean[1] + clean[1], 16);
    const b = parseInt(clean[2] + clean[2], 16);
    if (!isNaN(r) && !isNaN(g) && !isNaN(b)) return `${r}, ${g}, ${b}`;
  } else if (clean.length === 6) {
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    if (!isNaN(r) && !isNaN(g) && !isNaN(b)) return `${r}, ${g}, ${b}`;
  }
  return null;
}

export function findMatchingCollection(currentTrack: Track | null, collections: Collection[]): Collection | null {
  if (!currentTrack) return null;

  // Filter out system collections (recently-played, my-collection)
  const albumCollections = collections.filter(
    (c) => c.id !== recentCollectionId && c.id !== defaultCollectionId
  );

  const trackMatches = (t: Track) => {
    // 1. Exact audioId match for MP3 tracks
    if (t.audioId && currentTrack.audioId) {
      return t.audioId === currentTrack.audioId;
    }
    // 2. Exact URI match (Spotify or mp3 uri)
    if (t.uri && currentTrack.uri) {
      return t.uri === currentTrack.uri;
    }
    // If one has audioId/uri and the other has a different one, they are not the same track
    if ((t.audioId && currentTrack.audioId && t.audioId !== currentTrack.audioId) ||
        (t.uri && currentTrack.uri && t.uri !== currentTrack.uri)) {
      return false;
    }
    // 3. Exact track name and artist match
    if (
      t.name &&
      currentTrack.name &&
      t.artist &&
      currentTrack.artist &&
      t.name.trim().toLowerCase() === currentTrack.name.trim().toLowerCase() &&
      t.artist.trim().toLowerCase() === currentTrack.artist.trim().toLowerCase()
    ) {
      return true;
    }
    return false;
  };

  // 1. Prioritize record albums (the physical vinyl records in the user's shelf)
  const recordMatch = albumCollections.find(
    (col) => col.type === "record" && col.tracks?.some(trackMatches)
  );
  if (recordMatch) return recordMatch;

  // 2. Fallback: match any other candidate collection (playlists, custom sets)
  return albumCollections.find((col) => col.tracks?.some(trackMatches)) || null;
}

export function useActiveCustomization(
  currentTrack: Track | null,
  globalBackground: {
    imageUrl: string | null;
    opacity: number;
    positionX?: number;
    positionY?: number;
    fit?: "cover" | "contain";
    zoom?: number;
  }
): ActiveCustomization {
  const [collections, setCollections] = useState<Collection[]>(() => getCollections());
  const [albumBgUrl, setAlbumBgUrl] = useState<string | null>(null);

  useEffect(() => {
    function handleCollectionsChanged() {
      setCollections(getCollections());
    }
    window.addEventListener("collections:changed", handleCollectionsChanged);
    return () => window.removeEventListener("collections:changed", handleCollectionsChanged);
  }, []);

  const activeCollection = findMatchingCollection(currentTrack, collections);
  const customization: CollectionCustomization | undefined = activeCollection?.customization;

  useEffect(() => {
    let cancelled = false;

    if (activeCollection?.id && customization?.hasCustomBackground) {
      getAlbumBackgroundUrl(activeCollection.id).then((url) => {
        if (!cancelled) {
          setAlbumBgUrl((prev) => (prev === url ? prev : url));
        }
      });
    } else {
      setAlbumBgUrl((prev) => (prev === null ? prev : null));
    }
    return () => {
      cancelled = true;
    };
  }, [activeCollection?.id, customization?.hasCustomBackground]);

  const hasAlbumBg = !!(customization?.hasCustomBackground && albumBgUrl);
  const effectiveImageUrl = hasAlbumBg ? albumBgUrl : globalBackground.imageUrl;
  const effectiveOpacity = hasAlbumBg
    ? (customization?.backgroundOpacity ?? 0.45)
    : globalBackground.opacity;
  const effectivePositionX = hasAlbumBg
    ? (customization?.backgroundPositionX ?? 50)
    : (globalBackground.positionX ?? 50);
  const effectivePositionY = hasAlbumBg
    ? (customization?.backgroundPositionY ?? 50)
    : (globalBackground.positionY ?? 50);
  const effectiveFit = hasAlbumBg
    ? (customization?.backgroundFit ?? "cover")
    : (globalBackground.fit ?? "cover");
  const effectiveZoom = hasAlbumBg
    ? (customization?.backgroundZoom ?? 100)
    : (globalBackground.zoom ?? 100);

  const customVisualizerRgb =
    customization?.equalizerColorMode === "custom" && customization.equalizerCustomColor
      ? hexToRgbString(customization.equalizerCustomColor)
      : null;

  const vinylColor = customization?.vinylColor || null;

  const effectivePalette = hasAlbumBg
    ? (customization?.backgroundPalette || null)
    : (globalBackground as any)?.palette || null;

  const effectiveSchedule = hasAlbumBg
    ? (customization?.backgroundSchedule || null)
    : (globalBackground as any)?.schedule || null;

  const effectiveMediaType = hasAlbumBg
    ? (customization?.backgroundMediaType || (isVideoMedia(effectiveImageUrl) ? "video" : "image"))
    : (isVideoMedia(effectiveImageUrl) ? "video" : "image");

  return {
    activeCollection,
    effectiveImageUrl,
    effectiveOpacity,
    effectivePositionX,
    effectivePositionY,
    effectiveFit,
    effectiveZoom,
    effectivePalette,
    effectiveSchedule,
    effectiveMediaType,
    customVisualizerRgb,
    vinylColor,
  };
}
