import { useEffect, useState } from "react";
import { openDatabase, BACKGROUNDS_STORE } from "../lib/mp3Storage";

const settingsKey = "listening-room-background-settings";
const storeName = BACKGROUNDS_STORE;
const backgroundKey = "custom-background";

interface StoredBackground {
  blob: Blob;
  name: string;
}

interface BackgroundSettings {
  opacity: number;
  adaptColors: boolean;
}

export interface CustomBackgroundState extends BackgroundSettings {
  imageUrl: string | null;
  fileName: string | null;
  loading: boolean;
  setImage: (file: File) => Promise<void>;
  removeImage: () => Promise<void>;
  setOpacity: (opacity: number) => void;
  setAdaptColors: (adaptColors: boolean) => void;
}

const defaultSettings: BackgroundSettings = { opacity: 0.45, adaptColors: false };

export function useCustomBackground(): CustomBackgroundState {
  const [settings, setSettings] = useState(readSettings);
  const [image, setImageState] = useState<StoredBackground | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    readBackground()
      .then((stored) => {
        if (!cancelled) setImageState(stored);
      })
      .catch(() => {
        if (!cancelled) setImageState(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!image) {
      setImageUrl(null);
      return;
    }
    const next = URL.createObjectURL(image.blob);
    setImageUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [image]);

  async function setImage(file: File) {
    if (!file.type.startsWith("image/")) throw new Error("Choose an image file.");
    const next = { blob: file, name: file.name };
    await writeBackground(next);
    setImageState(next);
  }

  async function removeImage() {
    await deleteBackground();
    setImageState(null);
  }

  function updateSettings(next: BackgroundSettings) {
    setSettings(next);
    localStorage.setItem(settingsKey, JSON.stringify(next));
  }

  return {
    ...settings,
    imageUrl,
    fileName: image?.name ?? null,
    loading,
    setImage,
    removeImage,
    setOpacity: (opacity) => updateSettings({ ...settings, opacity: Math.max(0, Math.min(1, opacity)) }),
    setAdaptColors: (adaptColors) => updateSettings({ ...settings, adaptColors }),
  };
}

function readSettings(): BackgroundSettings {
  try {
    const stored = JSON.parse(localStorage.getItem(settingsKey) ?? "null") as Partial<BackgroundSettings> | null;
    return {
      opacity: typeof stored?.opacity === "number" ? Math.max(0, Math.min(1, stored.opacity)) : defaultSettings.opacity,
      adaptColors: typeof stored?.adaptColors === "boolean" ? stored.adaptColors : defaultSettings.adaptColors,
    };
  } catch {
    return defaultSettings;
  }
}

async function readBackground() {
  const database = await openDatabase();
  return request<StoredBackground | undefined>(database.transaction(storeName).objectStore(storeName).get(backgroundKey))
    .then((stored) => stored ?? null);
}

async function writeBackground(background: StoredBackground) {
  const database = await openDatabase();
  await request(database.transaction(storeName, "readwrite").objectStore(storeName).put(background, backgroundKey));
}

async function deleteBackground() {
  const database = await openDatabase();
  await request(database.transaction(storeName, "readwrite").objectStore(storeName).delete(backgroundKey));
}

function request<T = IDBValidKey>(operation: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    operation.onsuccess = () => resolve(operation.result);
    operation.onerror = () => reject(operation.error ?? new Error("Background storage failed."));
  });
}
