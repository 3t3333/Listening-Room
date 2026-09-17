import { useEffect, useState } from "react";
import { openDatabase, BACKGROUNDS_STORE } from "../lib/mp3Storage";

const settingsKey = "listening-room-background-settings";
const storeName = BACKGROUNDS_STORE;
const backgroundKey = "custom-background";

interface StoredBackground {
  blob: Blob;
  name: string;
}

export type BackgroundFitMode = "cover" | "contain";

interface BackgroundSettings {
  opacity: number;
  adaptColors: boolean;
  positionX?: number; // 0 to 100, default 50
  positionY?: number; // 0 to 100, default 50
  fit?: BackgroundFitMode; // default "cover"
  zoom?: number; // 100 to 200, default 100
}

export interface CustomBackgroundState extends BackgroundSettings {
  imageUrl: string | null;
  fileName: string | null;
  loading: boolean;
  positionX: number;
  positionY: number;
  fit: BackgroundFitMode;
  zoom: number;
  setImage: (file: File) => Promise<void>;
  removeImage: () => Promise<void>;
  setOpacity: (opacity: number) => void;
  setAdaptColors: (adaptColors: boolean) => void;
  setPositionY: (y: number) => void;
  setFraming: (framing: { positionX?: number; positionY?: number; fit?: BackgroundFitMode; zoom?: number }) => void;
}

const defaultSettings: BackgroundSettings = {
  opacity: 0.45,
  adaptColors: false,
  positionX: 50,
  positionY: 50,
  fit: "cover",
  zoom: 100,
};

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

  const positionX = settings.positionX ?? defaultSettings.positionX!;
  const positionY = settings.positionY ?? defaultSettings.positionY!;
  const fit = settings.fit ?? defaultSettings.fit!;
  const zoom = settings.zoom ?? defaultSettings.zoom!;

  return {
    ...settings,
    positionX,
    positionY,
    fit,
    zoom,
    imageUrl,
    fileName: image?.name ?? null,
    loading,
    setImage,
    removeImage,
    setOpacity: (opacity) => updateSettings({ ...settings, opacity: Math.max(0, Math.min(1, opacity)) }),
    setAdaptColors: (adaptColors) => updateSettings({ ...settings, adaptColors }),
    setPositionY: (y) => updateSettings({ ...settings, positionY: Math.max(0, Math.min(100, y)) }),
    setFraming: (framing) => updateSettings({
      ...settings,
      positionX: framing.positionX !== undefined ? Math.max(0, Math.min(100, framing.positionX)) : positionX,
      positionY: framing.positionY !== undefined ? Math.max(0, Math.min(100, framing.positionY)) : positionY,
      fit: framing.fit ?? fit,
      zoom: framing.zoom !== undefined ? Math.max(100, Math.min(200, framing.zoom)) : zoom,
    }),
  };
}

function readSettings(): BackgroundSettings {
  try {
    const stored = JSON.parse(localStorage.getItem(settingsKey) ?? "null") as Partial<BackgroundSettings> | null;
    return {
      opacity: typeof stored?.opacity === "number" ? Math.max(0, Math.min(1, stored.opacity)) : defaultSettings.opacity,
      adaptColors: typeof stored?.adaptColors === "boolean" ? stored.adaptColors : defaultSettings.adaptColors,
      positionX: typeof stored?.positionX === "number" ? Math.max(0, Math.min(100, stored.positionX)) : defaultSettings.positionX,
      positionY: typeof stored?.positionY === "number" ? Math.max(0, Math.min(100, stored.positionY)) : defaultSettings.positionY,
      fit: stored?.fit === "contain" ? "contain" : "cover",
      zoom: typeof stored?.zoom === "number" ? Math.max(100, Math.min(200, stored.zoom)) : defaultSettings.zoom,
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
