import { useEffect, useState } from "react";

export type ThemeId = "warm" | "midnight" | "dj-setup" | "archive" | "visualizer-stand";

const storageKey = "listening-room-theme";
const themes: ThemeId[] = ["warm", "midnight", "visualizer-stand", "archive", "dj-setup"];

export function useTheme() {
  const [theme, setTheme] = useState<ThemeId>(() => {
    const saved = localStorage.getItem(storageKey);
    return themes.includes(saved as ThemeId) ? saved as ThemeId : "warm";
  });

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      const target = event.target as HTMLElement | null;
      const acceptsText = target?.matches("input, textarea, select, [contenteditable='true']");
      if (acceptsText || document.querySelector('[role="dialog"]')) return;

      event.preventDefault();
      setTheme((current) => {
        const offset = event.key === "ArrowLeft" ? -1 : 1;
        return themes[(themes.indexOf(current) + offset + themes.length) % themes.length];
      });
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    localStorage.setItem(storageKey, theme);
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  return { theme, setTheme };
}
