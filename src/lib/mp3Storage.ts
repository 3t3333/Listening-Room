const databaseName = "listening-room-assets";
export const DB_VERSION = 2;
export const BACKGROUNDS_STORE = "backgrounds";
export const AUDIO_STORE = "mp3-audio";
export const ARTWORK_STORE = "mp3-artwork";

let dbInstance: IDBDatabase | null = null;
let dbOpenPromise: Promise<IDBDatabase> | null = null;

export function openDatabase(): Promise<IDBDatabase> {
  if (dbInstance) {
    return Promise.resolve(dbInstance);
  }
  if (dbOpenPromise) {
    return dbOpenPromise;
  }

  dbOpenPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(BACKGROUNDS_STORE)) {
        db.createObjectStore(BACKGROUNDS_STORE);
      }
      if (!db.objectStoreNames.contains(AUDIO_STORE)) {
        db.createObjectStore(AUDIO_STORE);
      }
      if (!db.objectStoreNames.contains(ARTWORK_STORE)) {
        db.createObjectStore(ARTWORK_STORE);
      }
    };
    request.onsuccess = () => {
      dbInstance = request.result;
      dbInstance.onversionchange = () => {
        dbInstance?.close();
        dbInstance = null;
        dbOpenPromise = null;
      };
      dbInstance.onclose = () => {
        dbInstance = null;
        dbOpenPromise = null;
      };
      resolve(dbInstance);
    };
    request.onerror = () => {
      dbOpenPromise = null;
      reject(request.error ?? new Error("Failed to open IndexedDB"));
    };
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

export async function getAudioTrackUrl(id: string): Promise<string | null> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(AUDIO_STORE, "readonly");
    const store = tx.objectStore(AUDIO_STORE);
    const req = store.get(id);
    req.onsuccess = () => {
      const blob = req.result as Blob | undefined;
      if (blob) {
        resolve(URL.createObjectURL(blob));
      } else {
        resolve(null);
      }
    };
    req.onerror = () => reject(req.error);
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteAudioTrack(id: string): Promise<void> {
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

export async function getArtworkUrl(id: string): Promise<string | null> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ARTWORK_STORE, "readonly");
    const store = tx.objectStore(ARTWORK_STORE);
    const req = store.get(id);
    req.onsuccess = () => {
      const blob = req.result as Blob | undefined;
      if (blob) {
        resolve(URL.createObjectURL(blob));
      } else {
        resolve(null);
      }
    };
    req.onerror = () => reject(req.error);
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
    if (audioEntries.length > 0) {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(AUDIO_STORE, "readwrite");
        const store = tx.objectStore(AUDIO_STORE);
        for (const [id, base64] of audioEntries) {
          try {
            const blob = base64ToBlob(base64);
            store.put(blob, id);
          } catch (err) {
            console.warn(`Failed to decode and store audio track ${id}:`, err);
          }
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    }
  }

  if (assets.artwork && typeof assets.artwork === "object") {
    const artworkEntries = Object.entries(assets.artwork).filter(([_, b64]) => typeof b64 === "string" && b64.length > 0);
    if (artworkEntries.length > 0) {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(ARTWORK_STORE, "readwrite");
        const store = tx.objectStore(ARTWORK_STORE);
        for (const [id, base64] of artworkEntries) {
          try {
            const blob = base64ToBlob(base64);
            store.put(blob, id);
          } catch (err) {
            console.warn(`Failed to decode and store artwork ${id}:`, err);
          }
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    }
  }
}

