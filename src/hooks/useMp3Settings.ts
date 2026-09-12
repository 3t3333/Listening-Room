import { useState, useEffect } from "react";

export interface Mp3Settings {
  enableMp3Support: boolean;
}

const defaultSettings: Mp3Settings = {
  enableMp3Support: false,
};

const storageKey = "mp3-settings";

export function useMp3Settings() {
  const [settings, setSettingsState] = useState<Mp3Settings>(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        return { ...defaultSettings, ...JSON.parse(stored) };
      }
    } catch {
      // ignore parse errors
    }
    return defaultSettings;
  });

  useEffect(() => {
    function handleStorage(e: Event) {
      if (e instanceof CustomEvent && e.detail) {
        setSettingsState(e.detail);
      }
    }
    window.addEventListener("mp3-settings-changed", handleStorage);
    return () => window.removeEventListener("mp3-settings-changed", handleStorage);
  }, []);

  const setSettings = (newSettings: Mp3Settings) => {
    setSettingsState(newSettings);
    localStorage.setItem(storageKey, JSON.stringify(newSettings));
    window.dispatchEvent(new CustomEvent("mp3-settings-changed", { detail: newSettings }));
  };

  return [settings, setSettings] as const;
}
