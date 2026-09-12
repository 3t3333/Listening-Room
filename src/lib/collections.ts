import type { Track } from "./player";
import { mapTrackArtwork, unmapTrackArtwork } from "./customArtwork";

export interface Collection {
  id: string;
  name: string;
  type?: "custom" | "record";
  format?: "spotify" | "mp3";
  artist?: string;
  artistImageUrl?: string | null;
  year?: number | null;
  tracks: Track[];
  updatedAt: string;
}

const storageKey = "listening-room-collections";
export const defaultCollectionId = "my-collection";
export const recentCollectionId = "recently-played";
const recentLimit = 10;

export function getCollections(): Collection[] {
  let collections: Collection[] = [];
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey) ?? "[]");
    if (Array.isArray(stored)) collections = stored;
  } catch { /* Use empty built-in collections when storage is malformed. */ }

  const now = new Date().toISOString();
  const mine = collections.find((item) => item.id === defaultCollectionId) ?? {
    id: defaultCollectionId,
    name: "My Collection",
    tracks: [],
    updatedAt: now,
  };
  const recent = collections.find((item) => item.id === recentCollectionId) ?? {
    id: recentCollectionId,
    name: "Recently Played",
    tracks: [],
    updatedAt: now,
  };
  return [mine, recent, ...collections.filter((item) => item.id !== defaultCollectionId && item.id !== recentCollectionId)].map(c => ({
    ...c,
    tracks: c.tracks.map(t => mapTrackArtwork(t) as Track)
  }));
}

export function addTrackToCollection(track: Track, collectionId = defaultCollectionId) {
  if (collectionId === recentCollectionId) return recordRecentlyPlayed(track);
  const collections = getCollections();
  let collection = collections.find((item) => item.id === collectionId);
  if (!collection) {
    collection = {
      id: collectionId,
      name: collectionId === defaultCollectionId ? "My Collection" : "Collection",
      tracks: [],
      updatedAt: new Date().toISOString(),
    };
    collections.push(collection);
  }

  const key = trackKey(track);
  const alreadyAdded = collection.tracks.some((item) => trackKey(item) === key);
  if (!alreadyAdded) collection.tracks.push(track);
  collection.updatedAt = new Date().toISOString();
  saveCollections(collections);
  return !alreadyAdded;
}

export function recordRecentlyPlayed(track: Track) {
  const collections = getCollections();
  const recent = collections.find((item) => item.id === recentCollectionId);
  if (!recent) return false;
  const key = trackKey(track);
  if (recent.tracks.at(-1) && trackKey(recent.tracks.at(-1)!) === key) return false;
  recent.tracks = [...recent.tracks.filter((item) => trackKey(item) !== key), track].slice(-recentLimit);
  recent.updatedAt = new Date().toISOString();
  saveCollections(collections);
  return true;
}

export function removeTrackFromCollection(track: Track, collectionId: string) {
  const collections = getCollections();
  const collection = collections.find((item) => item.id === collectionId);
  if (!collection) return false;
  const key = trackKey(track);
  const next = collection.tracks.filter((item) => trackKey(item) !== key);
  if (next.length === collection.tracks.length) return false;
  collection.tracks = next;
  collection.updatedAt = new Date().toISOString();
  saveCollections(collections);
  return true;
}

export function isTrackInCollection(track: Track, collectionId: string) {
  return getCollections()
    .find((collection) => collection.id === collectionId)
    ?.tracks.some((item) => trackKey(item) === trackKey(track)) ?? false;
}

export function isTrackCollected(track: Track) {
  const key = trackKey(track);
  return getCollections().some((collection) =>
    collection.id !== recentCollectionId && collection.tracks.some((item) => trackKey(item) === key),
  );
}

export function createCollection(name: string) {
  const collections = getCollections();
  const id = `col-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  collections.push({
    id,
    name,
    tracks: [],
    updatedAt: new Date().toISOString()
  });
  saveCollections(collections);
  return id;
}

export function importRecord(album: import("./player").AlbumImport) {
  const collections = getCollections();
  const id = `rec-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  collections.push({
    id,
    name: album.name,
    type: "record",
    artist: album.artist,
    artistImageUrl: album.artistImageUrl,
    year: album.year,
    tracks: album.tracks,
    updatedAt: new Date().toISOString()
  });
  saveCollections(collections);
  return id;
}

export function deleteCollection(collectionId: string) {
  if (collectionId === defaultCollectionId || collectionId === recentCollectionId) return false;
  const collections = getCollections().filter((c) => c.id !== collectionId);
  saveCollections(collections);
  window.dispatchEvent(new CustomEvent("collections:changed"));
  return true;
}

function trackKey(track: Track) {
  return track.uri ?? `${track.name}\u0000${track.artist}`;
}

function saveCollections(collections: Collection[]) {
  const safeCollections = collections.map(c => ({
    ...c,
    tracks: c.tracks.map(unmapTrackArtwork)
  }));
  localStorage.setItem(storageKey, JSON.stringify(safeCollections));
  window.dispatchEvent(new CustomEvent("collections:changed", { detail: safeCollections }));
}
