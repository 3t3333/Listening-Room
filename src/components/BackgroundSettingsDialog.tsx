import { ImagePlus, Palette, RefreshCw, SlidersHorizontal, Speaker, Trash2 } from "lucide-react";
import { useRef, useState, type ChangeEvent, type ReactNode } from "react";
import type { CustomBackgroundState } from "../hooks/useCustomBackground";
import { player, type AudioOutputState } from "../lib/player";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "./ui/dialog";

export function BackgroundSettingsDialog({ background, children }: { background: CustomBackgroundState; children: ReactNode }) {
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"background" | "audio">("background");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [audio, setAudio] = useState<AudioOutputState | null>(null);
  const [audioLoading, setAudioLoading] = useState(false);

  async function loadAudioOutputs() {
    setAudioLoading(true);
    setError(null);
    try {
      setAudio(await player.audioOutputs());
    } catch (reason) {
      setError(String(reason));
    } finally {
      setAudioLoading(false);
    }
  }

  function changeOpen(next: boolean) {
    setOpen(next);
    if (next) void loadAudioOutputs();
  }

  async function selectAudioOutput(event: ChangeEvent<HTMLSelectElement>) {
    const output = event.target.value || null;
    setAudioLoading(true);
    setError(null);
    try {
      await player.setAudioOutput(output);
      setAudio((current) => current ? { ...current, selected: output } : current);
    } catch (reason) {
      setError(String(reason));
    } finally {
      setAudioLoading(false);
    }
  }

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
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="settings-dialog">
        <DialogDescription className="visually-hidden">Customize Listening Room</DialogDescription>
        <aside className="settings-sidebar">
          <DialogTitle>Settings</DialogTitle>
          <div className="settings-tabs">
            <button type="button" className={`settings-tab ${tab === "background" ? "active" : ""}`} onClick={() => setTab("background")}><SlidersHorizontal size={15} />Background</button>
            <button type="button" className={`settings-tab ${tab === "audio" ? "active" : ""}`} onClick={() => setTab("audio")}><Speaker size={15} />Audio output</button>
          </div>
        </aside>
        {tab === "background" ? <section className="settings-panel">
          <header><span>Appearance</span><h2>Custom background</h2><p>Use your own image behind all listening-room themes.</p></header>

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
        </section> : <section className="settings-panel audio-settings-panel">
          <header><span>Playback</span><h2>Audio output</h2><p>Choose where Listening Room sends Spotify audio. Changing output briefly reconnects the Spotify Connect player.</p></header>

          <div className="audio-output-card">
            <Speaker size={22} />
            <label htmlFor="audio-output"><strong>Playback device</strong><small>The selection is restored on future launches.</small></label>
            <select id="audio-output" value={audio?.selected ?? ""} onChange={selectAudioOutput} disabled={audioLoading || !audio}>
              <option value="">System default{audio?.defaultOutput ? ` (${audio.defaultOutput})` : ""}</option>
              {audio?.selected && !audio.devices.includes(audio.selected) && <option value={audio.selected}>{audio.selected} (unavailable)</option>}
              {audio?.devices.map((device) => <option key={device} value={device}>{device}</option>)}
            </select>
          </div>

          <Button variant="ghost" className="audio-refresh" onClick={() => void loadAudioOutputs()} disabled={audioLoading}><RefreshCw size={14} />{audioLoading ? "Checking outputs..." : "Refresh outputs"}</Button>
          {error && <small className="settings-error">{error}</small>}
        </section>}
      </DialogContent>
    </Dialog>
  );
}
