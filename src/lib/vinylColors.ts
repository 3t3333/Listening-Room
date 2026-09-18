import type { CSSProperties } from "react";

export interface VinylColorPreset {
  name: string;
  color: string;
}

export const VINYL_COLOR_PRESETS: VinylColorPreset[] = [
  { name: "Classic Black", color: "#121212" },
  { name: "Ruby Red", color: "#b91c1c" },
  { name: "Royal Blue", color: "#1d4ed8" },
  { name: "Emerald Green", color: "#047857" },
  { name: "Amber Gold", color: "#d97706" },
  { name: "Marble White", color: "#e2e8f0" },
  { name: "Hot Pink", color: "#be185d" },
  { name: "Deep Purple", color: "#6b21a8" },
  { name: "Sunset Orange", color: "#ea580c" },
  { name: "Slate Grey", color: "#475569" },
];

export function adjustBrightness(hex: string, amount: number): string {
  const clean = hex.replace("#", "").trim();
  const num = parseInt(clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean, 16);
  if (isNaN(num)) return hex;
  let r = (num >> 16) + amount;
  let g = ((num >> 8) & 0x00ff) + amount;
  let b = (num & 0x0000ff) + amount;
  r = Math.min(255, Math.max(0, r));
  g = Math.min(255, Math.max(0, g));
  b = Math.min(255, Math.max(0, b));
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

export function isCustomVinylColor(vinylColor?: string | null): boolean {
  if (!vinylColor) return false;
  const c = vinylColor.trim().toLowerCase();
  return c !== "#121212" && c !== "#000000" && c !== "#111111";
}

export function getVinylColorStyle(vinylColor?: string | null): CSSProperties {
  if (!isCustomVinylColor(vinylColor)) {
    return {
      "--vinyl-color": "#121212",
      "--vinyl-color-light": "#171717",
      "--vinyl-color-dark": "#090909",
      "--vinyl-color-runout": "#111111",
      "--vinyl-bg": "radial-gradient(circle, #171717 0 2.7%, #090909 3.2% 20%, #171717 20.4% 20.8%, #080808 21.2% 100%)",
      background: "radial-gradient(circle, #171717 0 2.7%, #090909 3.2% 20%, #171717 20.4% 20.8%, #080808 21.2% 100%)",
    } as CSSProperties;
  }
  const cleanColor = vinylColor!.trim();
  const light = adjustBrightness(cleanColor, 35);
  const dark = adjustBrightness(cleanColor, -40);
  const runout = adjustBrightness(cleanColor, -20);
  return {
    "--vinyl-color": cleanColor,
    "--vinyl-color-light": light,
    "--vinyl-color-dark": dark,
    "--vinyl-color-runout": runout,
    "--vinyl-bg": `radial-gradient(circle, ${light} 0 2.7%, ${dark} 3.2% 20%, ${light} 20.4% 20.8%, ${cleanColor} 21.2% 100%)`,
    background: `radial-gradient(circle, ${light} 0%, ${cleanColor} 55%, ${dark} 100%)`,
  } as CSSProperties;
}
