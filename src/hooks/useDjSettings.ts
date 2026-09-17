import { useState, useEffect } from "react";

export type DjTurntableTheme = "light" | "dark" | "glass-clear" | "glass-smoked";
export type TonearmStyle = "technics-classic" | "concorde-club" | "audiophile-wedge" | "straight-battle";
export type VinylDiscStyle = "realistic" | "classic";

export interface DjSettings {
  optimizeSingleAlbum: boolean;
  singleAlbumLayout: "dual" | "single-right" | "single-bottom" | "single-left" | "single-top" | "single-only";
  isDark: boolean;
  turntableTheme: DjTurntableTheme;
  tonearmStyle: TonearmStyle;
  vinylDiscStyle: VinylDiscStyle;
  showSleeveStand: boolean;
  queueAlbumsSequentially: boolean;
  loopAlbumQueue: boolean;
  enableAdvancedAlbumEditing: boolean;
  enableGlassyShelf: boolean;
  verticalRotationMode: "auto" | "rotate-right" | "rotate-left" | "disabled";
}

const defaultSettings: DjSettings = {
  optimizeSingleAlbum: true,
  singleAlbumLayout: "dual",
  isDark: false,
  turntableTheme: "light",
  tonearmStyle: "technics-classic",
  vinylDiscStyle: "realistic",
  showSleeveStand: true,
  queueAlbumsSequentially: true,
  loopAlbumQueue: false,
  enableAdvancedAlbumEditing: false,
  enableGlassyShelf: true,
  verticalRotationMode: "auto",
};

export function useDjSettings() {
  const [settings, setSettingsState] = useState<DjSettings>(() => {
    try {
      const stored = localStorage.getItem("dj-settings");
      if (stored) {
        const parsed = JSON.parse(stored);
        const resolvedTheme: DjTurntableTheme = parsed.turntableTheme || (parsed.isDark ? "dark" : "light");
        const resolvedTonearm: TonearmStyle = parsed.tonearmStyle || "technics-classic";
        const resolvedVinylDisc: VinylDiscStyle = parsed.vinylDiscStyle || "realistic";
        return {
          ...defaultSettings,
          ...parsed,
          turntableTheme: resolvedTheme,
          tonearmStyle: resolvedTonearm,
          vinylDiscStyle: resolvedVinylDisc,
          isDark: resolvedTheme === "dark" || resolvedTheme === "glass-smoked",
        };
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
