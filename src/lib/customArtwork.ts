import { type Track } from "./player";

const storageKey = "custom-artwork-mappings";

export function getCustomArtworkMap(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(storageKey) || "{}");
  } catch {
    return {};
  }
}

export function setCustomArtwork(originalUrl: string, customUrl: string | null) {
  const map = getCustomArtworkMap();
  if (customUrl) {
    map[originalUrl] = customUrl;
  } else {
    delete map[originalUrl];
  }
  localStorage.setItem(storageKey, JSON.stringify(map));
  window.dispatchEvent(new CustomEvent("artwork:changed"));
}

export function resolveArtwork(originalUrl: string | null): string | null {
  if (!originalUrl) return null;
  const map = getCustomArtworkMap();
  return map[originalUrl] || originalUrl;
}

export function mapTrackArtwork(track: Track | null): Track | null {
  if (!track) return null;
  const original = track.originalImageUrl !== undefined ? track.originalImageUrl : track.imageUrl;
  let mapped = resolveArtwork(original);
  
  // If no custom artwork was found via the direct image URL,
  // let's check if the track exists in any of the user's collections,
  // and see if THAT collection's stored image URL has a custom mapping.
  // This solves mismatches where the backend playback URL differs from the imported URL.
  if (mapped === original && track.uri) {
    try {
      const collectionsJson = localStorage.getItem("listening-room-collections");
      if (collectionsJson) {
        const collections = JSON.parse(collectionsJson);
        for (const coll of collections) {
          const found = coll.tracks?.find((t: any) => t.uri === track.uri);
          if (found && found.imageUrl) {
             const collMapped = resolveArtwork(found.imageUrl);
             if (collMapped !== found.imageUrl) {
               mapped = collMapped;
               break;
             }
          }
        }
      }
    } catch {
      // ignore parse errors
    }
  }

  return { ...track, imageUrl: mapped, originalImageUrl: original };
}

export function unmapTrackArtwork(track: Track): Track {
  if (track.originalImageUrl !== undefined) {
    return { ...track, imageUrl: track.originalImageUrl };
  }
  return track;
}
