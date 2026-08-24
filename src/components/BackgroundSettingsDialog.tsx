import { ImagePlus, Palette, SlidersHorizontal, Trash2 } from "lucide-react";
import { useRef, useState, type ChangeEvent, type ReactNode } from "react";
import type { CustomBackgroundState } from "../hooks/useCustomBackground";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "./ui/dialog";

export function BackgroundSettingsDialog({ background, children }: { background: CustomBackgroundState; children: ReactNode }) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setSaving(true);
    setError(null);
    try {
      await background.setImage(file);
    } catch (reason) {
      setError(String(reason));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    setSaving(true);
    setError(null);
    try {
      await background.removeImage();
    } catch (reason) {
      setError(String(reason));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="settings-dialog">
        <DialogDescription className="visually-hidden">Customize the Listening Room background</DialogDescription>
        <aside className="settings-sidebar">
          <DialogTitle>Settings</DialogTitle>
          <button className="settings-tab active"><SlidersHorizontal size={15} />Background</button>
        </aside>
        <section className="settings-panel">
          <header><span>Appearance</span><h2>Custom background</h2><p>Use your own image behind both listening-room themes.</p></header>

          <div className={`background-preview ${background.imageUrl ? "has-image" : ""}`}>
            {background.imageUrl ? <img src={background.imageUrl} alt="Custom background preview" /> : <ImagePlus />}
            <span>{background.loading ? "Loading background..." : background.fileName ?? "No custom image selected"}</span>
          </div>

          <input ref={input} className="visually-hidden" type="file" accept="image/*" onChange={upload} />
          <div className="background-file-actions">
            <Button onClick={() => input.current?.click()} disabled={saving || background.loading}><ImagePlus size={15} />{background.imageUrl ? "Replace image" : "Choose image"}</Button>
            {background.imageUrl && <Button variant="ghost" className="background-remove" onClick={() => void remove()} disabled={saving}><Trash2 size={15} />Remove</Button>}
          </div>

          <label className="background-opacity">
            <span><strong>Background opacity</strong><output>{Math.round(background.opacity * 100)}%</output></span>
            <input type="range" min="0" max="100" value={Math.round(background.opacity * 100)} onChange={(event) => background.setOpacity(Number(event.target.value) / 100)} />
          </label>

          <button
            className="adaptive-color-setting"
            role="switch"
            aria-checked={background.adaptColors}
            onClick={() => background.setAdaptColors(!background.adaptColors)}
            disabled={!background.imageUrl}
          >
            <Palette size={18} />
            <span><strong>Adapt colors to background</strong><small>Use the background's dominant and accent colors for ambient light and the visualizer.</small></span>
            <i />
          </button>
          {error && <small className="settings-error">{error}</small>}
        </section>
      </DialogContent>
    </Dialog>
  );
}
