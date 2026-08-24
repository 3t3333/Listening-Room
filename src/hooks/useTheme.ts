import { useEffect, useState } from "react";

export type ThemeId = "warm" | "midnight";

const storageKey = "listening-room-theme";

export function useTheme() {
  const [theme, setTheme] = useState<ThemeId>(() => {
    const saved = localStorage.getItem(storageKey);
    return saved === "midnight" ? saved : "warm";
  });

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      const target = event.target as HTMLElement | null;
      const acceptsText = target?.matches("input, textarea, select, [contenteditable='true']");
      if (acceptsText || document.querySelector('[role="dialog"]')) return;

      event.preventDefault();
      setTheme(event.key === "ArrowLeft" ? "warm" : "midnight");
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
