import type { ThemeId } from "../hooks/useTheme";

export function ThemeIndicator({ theme, onChange }: { theme: ThemeId; onChange: (theme: ThemeId) => void }) {
  return (
    <nav className="theme-indicator" aria-label="Player theme">
      <button className={theme === "warm" ? "active" : ""} onClick={() => onChange("warm")} aria-label="Warm room theme" />
      <button className={theme === "midnight" ? "active" : ""} onClick={() => onChange("midnight")} aria-label="Midnight mix theme" />
      <button className={theme === "archive" ? "active" : ""} onClick={() => onChange("archive")} aria-label="Collection archive theme" />
      <span>Use arrow keys</span>
    </nav>
  );
}
