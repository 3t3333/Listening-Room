import { ImagePlus, Palette, RefreshCw, SlidersHorizontal, Speaker, Trash2, Disc3 } from "lucide-react";
import { useRef, useState, type ChangeEvent, type ReactNode } from "react";
import type { CustomBackgroundState } from "../hooks/useCustomBackground";
import { player, type AudioOutputState } from "../lib/player";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "./ui/dialog";
import { useDjSettings } from "../hooks/useDjSettings";

export function BackgroundSettingsDialog({ background, children }: { background: CustomBackgroundState; children: ReactNode }) {
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"background" | "audio" | "playback">("background");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [audio, setAudio] = useState<AudioOutputState | null>(null);
  const [audioLoading, setAudioLoading] = useState(false);
  const [djSettings, setDjSettings] = useDjSettings();

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
            <button type="button" className={`settings-tab ${tab === "playback" ? "active" : ""}`} onClick={() => setTab("playback")}><Disc3 size={15} />DJ Setup</button>
          </div>
        </aside>
        
        {tab === "background" && (
          <section className="settings-panel">
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
          </section>
        )}

        {tab === "audio" && (
          <section className="settings-panel audio-settings-panel">
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
          </section>
        )}

        {tab === "playback" && (
          <section className="settings-panel">
            <header><span>Features</span><h2>Album Playback</h2><p>Configure the layout of the DJ desk when listening to a single album.</p></header>
            
            <label className="dj-settings-toggle" style={{display: 'flex', alignItems: 'center', gap: '12px', fontSize: '16px', cursor: 'pointer', paddingBottom: '20px', borderBottom: '1px solid #333', marginBottom: '20px'}}>
              <input 
                type="checkbox" 
                checked={djSettings.optimizeSingleAlbum} 
                onChange={e => setDjSettings({ ...djSettings, optimizeSingleAlbum: e.target.checked })}
                style={{width: '20px', height: '20px', accentColor: 'var(--primary)'}}
              />
              <span>Single turntable for album playback when one album is queued</span>
            </label>

            <label className="dj-settings-toggle" style={{display: 'flex', alignItems: 'center', gap: '12px', fontSize: '16px', cursor: 'pointer', paddingBottom: '20px', borderBottom: '1px solid #333', marginBottom: '20px'}}>
              <input 
                type="checkbox" 
                checked={djSettings.showSleeveStand} 
                onChange={e => setDjSettings({ ...djSettings, showSleeveStand: e.target.checked })}
                style={{width: '20px', height: '20px', accentColor: 'var(--primary)'}}
              />
              <span>Show metallic stand under record sleeves</span>
            </label>

            {djSettings.optimizeSingleAlbum && (
              <div className="dj-settings-layouts">
                <h3 style={{margin: '0 0 15px 0', fontSize: '18px', color: '#aaa'}}>Visual Layout</h3>
                <div className="dj-layout-options">
                  
                  <label className={`dj-layout-option ${djSettings.singleAlbumLayout === 'dual' ? 'active' : ''}`}>
                    <input 
                      type="radio" 
                      name="singleAlbumLayout"
                      value="dual"
                      checked={djSettings.singleAlbumLayout === 'dual'}
                      onChange={() => setDjSettings({ ...djSettings, singleAlbumLayout: 'dual' })}
                    />
                    <div className="dj-layout-preview">
                      <div className="layout-circle"></div>
                      <div className="layout-rect"></div>
                      <div className="layout-circle"></div>
                    </div>
                    <span>Dual Turntable<br/><small>(Empty 2nd Deck)</small></span>
                  </label>

                  <label className={`dj-layout-option ${djSettings.singleAlbumLayout === 'single-left' ? 'active' : ''}`}>
                    <input 
                      type="radio" 
                      name="singleAlbumLayout"
                      value="single-left"
                      checked={djSettings.singleAlbumLayout === 'single-left'}
                      onChange={() => setDjSettings({ ...djSettings, singleAlbumLayout: 'single-left' })}
                    />
                    <div className="dj-layout-preview">
                      <div className="layout-rect"></div>
                      <div className="layout-circle"></div>
                    </div>
                    <span>Single Deck<br/><small>(Left Visualizer)</small></span>
                  </label>

                  <label className={`dj-layout-option ${djSettings.singleAlbumLayout === 'single-right' ? 'active' : ''}`}>
                    <input 
                      type="radio" 
                      name="singleAlbumLayout"
                      value="single-right"
                      checked={djSettings.singleAlbumLayout === 'single-right'}
                      onChange={() => setDjSettings({ ...djSettings, singleAlbumLayout: 'single-right' })}
                    />
                    <div className="dj-layout-preview">
                      <div className="layout-circle"></div>
                      <div className="layout-rect"></div>
                    </div>
                    <span>Single Deck<br/><small>(Right Visualizer)</small></span>
                  </label>

                  <label className={`dj-layout-option ${djSettings.singleAlbumLayout === 'single-top' ? 'active' : ''}`}>
                    <input 
                      type="radio" 
                      name="singleAlbumLayout"
                      value="single-top"
                      checked={djSettings.singleAlbumLayout === 'single-top'}
                      onChange={() => setDjSettings({ ...djSettings, singleAlbumLayout: 'single-top' })}
                    />
                    <div className="dj-layout-preview layout-bottom-preview">
                      <div className="layout-rect"></div>
                      <div className="layout-circle"></div>
                    </div>
                    <span>Single Deck<br/><small>(Top Visualizer)</small></span>
                  </label>

                  <label className={`dj-layout-option ${djSettings.singleAlbumLayout === 'single-bottom' ? 'active' : ''}`}>
                    <input 
                      type="radio" 
                      name="singleAlbumLayout"
                      value="single-bottom"
                      checked={djSettings.singleAlbumLayout === 'single-bottom'}
                      onChange={() => setDjSettings({ ...djSettings, singleAlbumLayout: 'single-bottom' })}
                    />
                    <div className="dj-layout-preview layout-bottom-preview">
                      <div className="layout-circle"></div>
                      <div className="layout-rect"></div>
                    </div>
                    <span>Single Deck<br/><small>(Bottom Visualizer)</small></span>
                  </label>

                  <label className={`dj-layout-option ${djSettings.singleAlbumLayout === 'single-only' ? 'active' : ''}`}>
                    <input 
                      type="radio" 
                      name="singleAlbumLayout"
                      value="single-only"
                      checked={djSettings.singleAlbumLayout === 'single-only'}
                      onChange={() => setDjSettings({ ...djSettings, singleAlbumLayout: 'single-only' })}
                    />
                    <div className="dj-layout-preview">
                      <div className="layout-circle"></div>
                    </div>
                    <span>Single Deck<br/><small>(No Visualizer)</small></span>
                  </label>

                </div>
              </div>
            )}
          </section>
        )}
      </DialogContent>
    </Dialog>
  );
}
