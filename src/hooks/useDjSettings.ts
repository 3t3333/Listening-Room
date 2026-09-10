import { useState, useEffect } from "react";

export interface DjSettings {
  optimizeSingleAlbum: boolean;
  singleAlbumLayout: "dual" | "single-right" | "single-bottom" | "single-left" | "single-top" | "single-only";
  isDark: boolean;
  showSleeveStand: boolean;
  queueAlbumsSequentially: boolean;
  loopAlbumQueue: boolean;
}

const defaultSettings: DjSettings = {
  optimizeSingleAlbum: true,
  singleAlbumLayout: "dual",
  isDark: false,
  showSleeveStand: true,
  queueAlbumsSequentially: true,
  loopAlbumQueue: false,
};

export function useDjSettings() {
  const [settings, setSettingsState] = useState<DjSettings>(() => {
    try {
      const stored = localStorage.getItem("dj-settings");
      if (stored) {
        return { ...defaultSettings, ...JSON.parse(stored) };
      }
    } catch {
      // ignore
    }
    return defaultSettings;
  });

  useEffect(() => {
    function handleStorage(e: Event) {
      if (e instanceof CustomEvent && e.detail) {
        setSettingsState(e.detail);
      }
    }
    window.addEventListener("dj-settings-changed", handleStorage);
    return () => window.removeEventListener("dj-settings-changed", handleStorage);
  }, []);

  const setSettings = (newSettings: DjSettings) => {
    setSettingsState(newSettings);
    localStorage.setItem("dj-settings", JSON.stringify(newSettings));
    window.dispatchEvent(new CustomEvent("dj-settings-changed", { detail: newSettings }));
  };

  return [settings, setSettings] as const;
}
