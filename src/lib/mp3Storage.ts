const databaseName = "listening-room-assets";
export const DB_VERSION = 3;
export const BACKGROUNDS_STORE = "backgrounds";
export const AUDIO_STORE = "mp3-audio";
export const ARTWORK_STORE = "mp3-artwork";
export const ALBUM_BG_STORE = "album-backgrounds";

const REQUIRED_STORES = [BACKGROUNDS_STORE, AUDIO_STORE, ARTWORK_STORE, ALBUM_BG_STORE];

let dbInstance: IDBDatabase | null = null;
let dbOpenPromise: Promise<IDBDatabase> | null = null;

function attachDbListeners(db: IDBDatabase) {
  db.onversionchange = () => {
    dbInstance?.close();
    dbInstance = null;
    dbOpenPromise = null;
  };
  db.onclose = () => {
    dbInstance = null;
    dbOpenPromise = null;
  };
}

export function openDatabase(): Promise<IDBDatabase> {
  if (dbInstance) {
    return Promise.resolve(dbInstance);
  }
  if (dbOpenPromise) {
    return dbOpenPromise;
  }

  dbOpenPromise = (async () => {
    // 1. First attempt to open with whatever version already exists on disk
    const initialDb: IDBDatabase = await new Promise((resolve, reject) => {
      const request = indexedDB.open(databaseName);
      request.onupgradeneeded = () => {
        const db = request.result;
        for (const store of REQUIRED_STORES) {
          if (!db.objectStoreNames.contains(store)) {
            db.createObjectStore(store);
          }
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Failed to open IndexedDB"));
    });

    // Check if any required store is missing
    const missing = REQUIRED_STORES.some((store) => !initialDb.objectStoreNames.contains(store));
    if (!missing) {
      dbInstance = initialDb;
      attachDbListeners(dbInstance);
      return dbInstance;
    }

    // A store is missing - close and bump version by 1 to create it
    const nextVersion = (initialDb.version || 1) + 1;
    initialDb.close();

    const upgradedDb: IDBDatabase = await new Promise((resolve, reject) => {
      const request = indexedDB.open(databaseName, nextVersion);
      request.onupgradeneeded = () => {
        const db = request.result;
        for (const store of REQUIRED_STORES) {
          if (!db.objectStoreNames.contains(store)) {
            db.createObjectStore(store);
          }
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Failed to upgrade IndexedDB"));
      request.onblocked = () => {
        console.warn("IndexedDB upgrade blocked by another open connection");
      };
    });

    dbInstance = upgradedDb;
    attachDbListeners(dbInstance);
    return dbInstance;
  })().catch((err) => {
    dbOpenPromise = null;
    throw err;
  });

  return dbOpenPromise;
}

export async function saveAudioTrack(id: string, blob: Blob): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(AUDIO_STORE, "readwrite");
    const store = tx.objectStore(AUDIO_STORE);
    const req = store.put(blob, id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    tx.onerror = () => reject(tx.error);
  });
}

const audioUrlCache = new Map<string, string>();

export async function getAudioTrackUrl(id: string): Promise<string | null> {
  if (!id) return null;
  if (audioUrlCache.has(id)) {
    return audioUrlCache.get(id)!;
  }

  const clean = id.replace(/^mp3:/, "");
  const candidates = [
    id,
    clean,
    clean.startsWith("rec-") ? `mp3-${clean}` : null,
    clean.startsWith("mp3-") && !clean.startsWith("mp3-rec-") ? clean.replace(/^mp3-/, "mp3-rec-") : null,
    !clean.startsWith("mp3-") ? `mp3-${clean}` : null,
  ].filter((c): c is string => Boolean(c));

  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(AUDIO_STORE, "readonly");
    const store = tx.objectStore(AUDIO_STORE);

    function tryCandidate(index: number) {
      if (index >= candidates.length) {
        resolve(null);
        return;
      }
      const candidate = candidates[index];
      const req = store.get(candidate);
      req.onsuccess = () => {
        const result = req.result;
        if (result) {
          let url: string;
          if (result instanceof Blob) {
            url = URL.createObjectURL(result);
          } else if (result instanceof ArrayBuffer || ArrayBuffer.isView(result)) {
            url = URL.createObjectURL(new Blob([result as any], { type: "audio/mpeg" }));
          } else if (typeof result === "string" && result.startsWith("data:")) {
            url = URL.createObjectURL(base64ToBlob(result));
          } else if (typeof result === "string") {
            url = URL.createObjectURL(base64ToBlob(result));
          } else {
            url = URL.createObjectURL(new Blob([result as any], { type: "audio/mpeg" }));
          }
          audioUrlCache.set(id, url);
          if (candidate !== id) audioUrlCache.set(candidate, url);
          resolve(url);
        } else {
          tryCandidate(index + 1);
        }
      };
      req.onerror = () => reject(req.error);
    }

    tryCandidate(0);
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteAudioTrack(id: string): Promise<void> {
  const cached = audioUrlCache.get(id);
  if (cached) {
    URL.revokeObjectURL(cached);
    audioUrlCache.delete(id);
  }
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(AUDIO_STORE, "readwrite");
    const store = tx.objectStore(AUDIO_STORE);
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    tx.onerror = () => reject(tx.error);
  });
}

export async function saveArtworkBlob(id: string, blob: Blob): Promise<string> {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(ARTWORK_STORE, "readwrite");
    const store = tx.objectStore(ARTWORK_STORE);
    const req = store.put(blob, id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    tx.onerror = () => reject(tx.error);
  });
  return URL.createObjectURL(blob);
}

const artworkUrlCache = new Map<string, string>();

export async function getArtworkUrl(id: string): Promise<string | null> {
  if (!id) return null;
  if (artworkUrlCache.has(id)) {
    return artworkUrlCache.get(id)!;
  }

  const clean = id.replace(/^art-/, "");
  const candidates = [
    id,
    id.startsWith("art-") ? id : `art-${id}`,
    clean,
    `art-rec-mp3-${clean}`,
  ].filter((c): c is string => Boolean(c));

  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ARTWORK_STORE, "readonly");
    const store = tx.objectStore(ARTWORK_STORE);

    function tryCandidate(index: number) {
      if (index >= candidates.length) {
        resolve(null);
        return;
      }
      const candidate = candidates[index];
      const req = store.get(candidate);
      req.onsuccess = () => {
        const result = req.result;
        if (result) {
          let url: string;
          if (result instanceof Blob) {
            url = URL.createObjectURL(result);
          } else if (typeof result === "string" && result.startsWith("data:")) {
            url = result;
          } else if (typeof result === "string") {
            url = URL.createObjectURL(base64ToBlob(result));
          } else {
            url = URL.createObjectURL(new Blob([result as any], { type: "image/jpeg" }));
          }
          artworkUrlCache.set(id, url);
          if (candidate !== id) artworkUrlCache.set(candidate, url);
          resolve(url);
        } else {
          tryCandidate(index + 1);
        }
      };
      req.onerror = () => reject(req.error);
    }

    tryCandidate(0);
    tx.onerror = () => reject(tx.error);
  });
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("FileReader failed to convert Blob to Base64"));
      }
    };
    reader.onerror = () => reject(reader.error || new Error("Failed to read Blob"));
    reader.readAsDataURL(blob);
  });
}

/**
 * Decodes a base64 data URL into a binary Blob entirely in-memory.
 * Avoids fetch() to ensure compatibility with strict CSP and avoid Chromium data-URL length limits.
 */
export function base64ToBlob(dataUrl: string): Blob {
  const commaIdx = dataUrl.indexOf(",");
  const header = commaIdx !== -1 ? dataUrl.slice(0, commaIdx) : "";
  const b64Data = commaIdx !== -1 ? dataUrl.slice(commaIdx + 1) : dataUrl;

  const mimeMatch = header.match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : "audio/mpeg";

  const binaryString = atob(b64Data);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  return new Blob([bytes], { type: mime });
}

export function resizeImageToDataUrl(file: Blob, maxSize = 600): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let width = img.width;
      let height = img.height;
      if (width > height) {
        if (width > maxSize) {
          height = Math.round((height * maxSize) / width);
          width = maxSize;
        }
      } else {
        if (height > maxSize) {
          width = Math.round((width * maxSize) / height);
          height = maxSize;
        }
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(url);
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = reject;
    img.src = url;
  });
}

export async function exportMp3Assets(): Promise<{ audio: Record<string, string>; artwork: Record<string, string> }> {
  const db = await openDatabase();

  async function exportStore(storeName: string): Promise<Record<string, string>> {
    const entries: { id: string; blob: Blob }[] = await new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readonly");
      const store = tx.objectStore(storeName);
      const req = store.openCursor();
      const list: { id: string; blob: Blob }[] = [];

      req.onsuccess = (e) => {
        const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          if (cursor.value instanceof Blob) {
            list.push({ id: String(cursor.key), blob: cursor.value });
          }
          cursor.continue();
        } else {
          resolve(list);
        }
      };
      req.onerror = () => reject(req.error);
      tx.onerror = () => reject(tx.error);
    });

    const result: Record<string, string> = {};
    for (const item of entries) {
      try {
        result[item.id] = await blobToBase64(item.blob);
      } catch (err) {
        console.warn(`Failed to export asset ${item.id} from ${storeName}:`, err);
      }
    }
    return result;
  }

  const audio = await exportStore(AUDIO_STORE);
  const artwork = await exportStore(ARTWORK_STORE);
  return { audio, artwork };
}

export async function importMp3Assets(assets: { audio?: Record<string, string>; artwork?: Record<string, string> }): Promise<void> {
  if (!assets) return;
  const db = await openDatabase();

  if (assets.audio && typeof assets.audio === "object") {
    const audioEntries = Object.entries(assets.audio).filter(([_, b64]) => typeof b64 === "string" && b64.length > 0);
    const BATCH_SIZE = 4;
    for (let i = 0; i < audioEntries.length; i += BATCH_SIZE) {
      const batch = audioEntries.slice(i, i + BATCH_SIZE);
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(AUDIO_STORE, "readwrite");
        const store = tx.objectStore(AUDIO_STORE);
        for (const [id, base64] of batch) {
          try {
            const blob = base64ToBlob(base64);
            store.put(blob, id);
          } catch (err) {
            console.warn(`Failed to decode and store audio track ${id}:`, err);
          }
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(new Error(`Transaction aborted during audio import batch at ${i}`));
      });
    }
  }

  if (assets.artwork && typeof assets.artwork === "object") {
    const artworkEntries = Object.entries(assets.artwork).filter(([_, b64]) => typeof b64 === "string" && b64.length > 0);
    const BATCH_SIZE = 8;
    for (let i = 0; i < artworkEntries.length; i += BATCH_SIZE) {
      const batch = artworkEntries.slice(i, i + BATCH_SIZE);
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(ARTWORK_STORE, "readwrite");
        const store = tx.objectStore(ARTWORK_STORE);
        for (const [id, base64] of batch) {
          try {
            const blob = base64ToBlob(base64);
            store.put(blob, id);
          } catch (err) {
            console.warn(`Failed to decode and store artwork ${id}:`, err);
          }
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(new Error(`Transaction aborted during artwork import batch at ${i}`));
      });
    }
  }
}

export async function saveAlbumBackground(albumId: string, blob: Blob): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ALBUM_BG_STORE, "readwrite");
    const store = tx.objectStore(ALBUM_BG_STORE);
    const req = store.put(blob, `album-bg-${albumId}`);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    tx.onerror = () => reject(tx.error);
  });
}

export async function getAlbumBackgroundUrl(albumId: string): Promise<string | null> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ALBUM_BG_STORE, "readonly");
    const store = tx.objectStore(ALBUM_BG_STORE);
    const req = store.get(`album-bg-${albumId}`);
    req.onsuccess = () => {
      const blob = req.result as Blob | undefined;
      resolve(blob ? URL.createObjectURL(blob) : null);
    };
    req.onerror = () => reject(req.error);
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteAlbumBackground(albumId: string): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ALBUM_BG_STORE, "readwrite");
    const store = tx.objectStore(ALBUM_BG_STORE);
    const req = store.delete(`album-bg-${albumId}`);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    tx.onerror = () => reject(tx.error);
  });
}

export async function exportAlbumBackgrounds(): Promise<Record<string, string>> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ALBUM_BG_STORE, "readonly");
    const store = tx.objectStore(ALBUM_BG_STORE);
    const req = store.openCursor();
    const list: { id: string; blob: Blob }[] = [];

    req.onsuccess = (e) => {
      const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor) {
        if (cursor.value instanceof Blob) {
          list.push({ id: String(cursor.key), blob: cursor.value });
        }
        cursor.continue();
      } else {
        const result: Record<string, string> = {};
        Promise.all(
          list.map(async (item) => {
            try {
              result[item.id] = await blobToBase64(item.blob);
            } catch (err) {
              console.warn(`Failed to export album background ${item.id}:`, err);
            }
          })
        )
          .then(() => resolve(result))
          .catch(reject);
      }
    };
    req.onerror = () => reject(req.error);
    tx.onerror = () => reject(tx.error);
  });
}

export async function importAlbumBackgrounds(backgrounds: Record<string, string>): Promise<void> {
  if (!backgrounds || typeof backgrounds !== "object") return;
  const db = await openDatabase();
  const entries = Object.entries(backgrounds).filter(([_, b64]) => typeof b64 === "string" && b64.length > 0);
  if (entries.length === 0) return;

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(ALBUM_BG_STORE, "readwrite");
    const store = tx.objectStore(ALBUM_BG_STORE);
    for (const [id, base64] of entries) {
      try {
        const blob = base64ToBlob(base64);
        store.put(blob, id);
      } catch (err) {
        console.warn(`Failed to decode and store album background ${id}:`, err);
      }
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

