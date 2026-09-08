import type { ThemeId } from "../hooks/useTheme";

export function ThemeIndicator({ theme, onChange }: { theme: ThemeId; onChange: (theme: ThemeId) => void }) {
  return (
    <nav className="theme-indicator" aria-label="Player theme">
      <button className={theme === "warm" ? "active" : ""} onClick={() => onChange("warm")} aria-label="Warm room theme" />
      <button className={theme === "midnight" ? "active" : ""} onClick={() => onChange("midnight")} aria-label="Midnight mix theme" />
      <button className={theme === "visualizer-stand" ? "active" : ""} onClick={() => onChange("visualizer-stand")} aria-label="Visualizer page 3" />
      <button className={theme === "archive" ? "active" : ""} onClick={() => onChange("archive")} aria-label="Archive Room theme" />
      <button className={theme === "dj-setup" ? "active" : ""} onClick={() => onChange("dj-setup")} aria-label="DJ Setup theme" />
      <span>Use arrow keys</span>
    </nav>
  );
}
