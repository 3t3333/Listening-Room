import { ImagePlus, Palette, RefreshCw, SlidersHorizontal, Speaker, Trash2, Disc3, Database, Download, Upload, Crop, Loader2 } from "lucide-react";
import { useRef, useState, type ChangeEvent, type ReactNode } from "react";
import type { CustomBackgroundState } from "../hooks/useCustomBackground";
import { player, type AudioOutputState } from "../lib/player";
import { mp3Player } from "../lib/mp3Player";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "./ui/dialog";
import { useDjSettings } from "../hooks/useDjSettings";
import { useMp3Settings } from "../hooks/useMp3Settings";
import { exportMp3Assets, importMp3Assets, exportAlbumBackgrounds, importAlbumBackgrounds, exportGlobalBackground, importGlobalBackground } from "../lib/mp3Storage";
import { BackgroundFramingDialog } from "./BackgroundFramingDialog";
import { isVideoMedia } from "../lib/liveWallpaper";

export function BackgroundSettingsDialog({ background, children }: { background: CustomBackgroundState; children: ReactNode }) {
  const input = useRef<HTMLInputElement>(null);
  const importInput = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"background" | "audio" | "playback" | "data">("background");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [scanProgress, setScanProgress] = useState<number | null>(null);
  const [audio, setAudio] = useState<AudioOutputState | null>(null);
  const [audioLoading, setAudioLoading] = useState(false);
  const [djSettings, setDjSettings] = useDjSettings();
  const [mp3Settings, setMp3Settings] = useMp3Settings();
  const [isExportingData, setIsExportingData] = useState(false);
  const [isImportingData, setIsImportingData] = useState(false);
  const [framingOpen, setFramingOpen] = useState(false);

  async function handleExportData() {
    setIsExportingData(true);
    try {
      const keys = [
        "listening-room-collections",
        "listening-room-artwork-cache",
        "listening-room-theme",
        "dj-settings",
        "listening-room-background-settings",
        "custom-artwork-mappings",   // album artwork overrides (custom image URLs)
        "mp3-settings"
      ];
      
      const data: Record<string, any> = {};
      for (const key of keys) {
        const value = localStorage.getItem(key);
        try {
          data[key] = value ? JSON.parse(value) : null;
        } catch {
          data[key] = value;
        }
      }

      // Package MP3 audio tracks and artwork from IndexedDB
      try {
        const mp3Assets = await exportMp3Assets();
        const audioCount = Object.keys(mp3Assets.audio).length;
        const artCount = Object.keys(mp3Assets.artwork).length;
        if (audioCount > 0 || artCount > 0) {
          data["mp3-assets"] = mp3Assets;
        }
      } catch (assetErr: any) {
        console.warn("Failed to package MP3 audio assets:", assetErr);
        alert("Warning: Some MP3 audio assets could not be packaged: " + (assetErr?.message || String(assetErr)));
      }

      // Package global custom background from IndexedDB
      try {
        const globalBg = await exportGlobalBackground();
        if (globalBg) {
          data["global-background"] = globalBg;
        }
      } catch (gBgErr: any) {
        console.warn("Failed to package global background:", gBgErr);
      }

      // Package album custom backgrounds from IndexedDB
      try {
        const albumBgs = await exportAlbumBackgrounds();
        if (Object.keys(albumBgs).length > 0) {
          data["album-backgrounds"] = albumBgs;
        }
      } catch (bgErr: any) {
        console.warn("Failed to package album backgrounds:", bgErr);
      }
      
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "listening-room-backup.json";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert("Failed to export backup: " + (err?.message || String(err)));
    } finally {
      setIsExportingData(false);
    }
  }

  function handleImportData(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsImportingData(true);
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const text = e.target?.result as string;
        const data = JSON.parse(text);

        // Restore MP3 audio tracks and artwork to IndexedDB if present
        if (data["mp3-assets"]) {
          await importMp3Assets(data["mp3-assets"]);
        }

        // Restore global background to IndexedDB if present
        if (data["global-background"]) {
          await importGlobalBackground(data["global-background"]);
        } else if (typeof data["custom-background"] === "string" && data["custom-background"].startsWith("data:")) {
          // Backward compatibility: restore legacy base64 background into IndexedDB
          await importGlobalBackground({ name: "custom-background", data: data["custom-background"] });
        }

        // Restore custom album backgrounds to IndexedDB if present
        if (data["album-backgrounds"]) {
          await importAlbumBackgrounds(data["album-backgrounds"]);
        }

        // Clean up listening-room-collections before writing to localStorage
        // Avoid storing multi-megabyte base64 strings in localStorage.
        // If an imported collection contains base64 image strings, convert them to lightweight
        // placeholder blob strings so collections.ts can self-heal them from IndexedDB on startup.
        if (data["listening-room-collections"]) {
          let cols = data["listening-room-collections"];
          if (typeof cols === "string") {
            try { cols = JSON.parse(cols); } catch { /* ignore */ }
          }
          if (Array.isArray(cols)) {
            for (const col of cols) {
              if (Array.isArray(col.tracks)) {
                for (const trk of col.tracks) {
                  if (typeof trk.imageUrl === "string" && trk.imageUrl.startsWith("data:")) {
                    trk.imageUrl = "blob:stale-artwork";
                  }
                  if (typeof trk.originalImageUrl === "string" && trk.originalImageUrl.startsWith("data:")) {
                    trk.originalImageUrl = "blob:stale-artwork";
                  }
                }
              }
            }
            data["listening-room-collections"] = cols;
          }
        }

        // Keys that are persisted in IndexedDB and must NEVER be written to localStorage
        const INDEXED_DB_ASSET_KEYS = new Set([
          "mp3-assets",
          "album-backgrounds",
          "global-background",
          "custom-background", // global background blob lives in IndexedDB, not localStorage
        ]);

        for (const [key, value] of Object.entries(data)) {
          if (INDEXED_DB_ASSET_KEYS.has(key)) continue;
          if (value === null) {
            localStorage.removeItem(key);
          } else {
            try {
              localStorage.setItem(key, typeof value === "string" ? value : JSON.stringify(value));
            } catch (storageErr) {
              console.warn(`Failed to restore key "${key}" to localStorage:`, storageErr);
            }
          }
        }

        // Clean up any legacy custom-background key from localStorage if present
        localStorage.removeItem("custom-background");

        alert("Data imported successfully! The application will now reload to apply the restored settings.");
        window.location.reload();
      } catch (err: any) {
        console.error("Import backup error:", err);
        alert("Failed to import backup file: " + (err?.message || String(err)));
      } finally {
        setIsImportingData(false);
      }
    };
    reader.onerror = () => {
      setIsImportingData(false);
      alert("Failed to read the backup file from disk.");
    };
    reader.readAsText(file);
  }

  async function loadAudioOutputs() {
    setAudioLoading(true);
    setError(null);
    try {
      const state = await player.audioOutputs();
      setAudio(state);
      void mp3Player.setAudioOutput(state.selected);
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
      await mp3Player.setAudioOutput(output);
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
    setScanProgress(0);
    try {
      await background.setImage(file, background.colorScanMode, (pct) => setScanProgress(pct));
    } catch (reason: any) {
      if (reason?.message === "Video upload cancelled by user.") {
        return;
      }
      setError(reason?.message || String(reason));
    } finally {
      setSaving(false);
      setScanProgress(null);
    }
  }

  async function remove() {
    setSaving(true);
    setError(null);
    try {
      await background.removeImage();
    } catch (reason: any) {
      setError(reason?.message || String(reason));
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
            <button type="button" className={`settings-tab ${tab === "data" ? "active" : ""}`} onClick={() => setTab("data")}><Database size={15} />Data & Backup</button>
          </div>
        </aside>
        
        {tab === "background" && (
          <section className="settings-panel">
            <header><span>Appearance</span><h2>Custom background</h2><p>Use your own image, GIF, or video (MP4, WebM, MOV) behind all listening-room themes.</p></header>

            <div className={`background-preview ${background.imageUrl ? "has-image" : ""}`}>
              {background.imageUrl ? (
                isVideoMedia(background.imageUrl) ? (
                  <video 
                    src={background.imageUrl} 
                    autoPlay
                    loop
                    muted
                    playsInline
                    disablePictureInPicture
                    disableRemotePlayback
                    onTimeUpdate={(e) => {
                      if (e.currentTarget.currentTime >= 60) {
                        e.currentTarget.currentTime = 0;
                      }
                    }}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: background.fit || "cover",
                      objectPosition: `${background.positionX ?? 50}% ${background.positionY ?? 50}%`,
                      transform: (background.zoom ?? 100) > 100 ? `scale(${(background.zoom ?? 100) / 100})` : undefined,
                      transformOrigin: `${background.positionX ?? 50}% ${background.positionY ?? 50}%`,
                    }}
                  />
                ) : (
                  <img 
                    src={background.imageUrl} 
                    alt="Custom background preview" 
                    style={{
                      objectFit: background.fit || "cover",
                      objectPosition: `${background.positionX ?? 50}% ${background.positionY ?? 50}%`,
                      transform: (background.zoom ?? 100) > 100 ? `scale(${(background.zoom ?? 100) / 100})` : undefined,
                      transformOrigin: `${background.positionX ?? 50}% ${background.positionY ?? 50}%`,
                    }}
                  />
                )
              ) : <ImagePlus />}
              <span>
                {saving && scanProgress !== null 
                  ? `Scanning ambient lighting colors (${scanProgress}%)...`
                  : background.loading 
                  ? "Loading background..." 
                  : background.fileName ?? "No custom media selected"}
              </span>
            </div>

            <input 
              ref={input} 
              className="visually-hidden" 
              type="file" 
              accept="image/*,video/mp4,video/webm,video/quicktime,video/x-m4v,.gif,.mp4,.webm,.mov,.m4v" 
              onChange={upload} 
            />
            <div className="background-file-actions">
              <Button onClick={() => input.current?.click()} disabled={saving || background.loading}>
                {saving ? <Loader2 size={15} className="animate-spin" /> : <ImagePlus size={15} />}
                {saving ? "Processing media..." : background.imageUrl ? "Replace media" : "Choose media"}
              </Button>
              {background.imageUrl && (
                <Button variant="outline" onClick={() => setFramingOpen(true)} disabled={saving || background.loading}>
                  <Crop size={15} style={{ marginRight: '6px' }} />
                  Crop & Framing
                </Button>
              )}
              {background.imageUrl && <Button variant="ghost" className="background-remove" onClick={() => void remove()} disabled={saving}><Trash2 size={15} />Remove</Button>}
            </div>

            {/* Quick Framing & Crop Shortcut */}
            {background.imageUrl && (
              <div style={{ marginTop: '20px', padding: '14px', background: 'rgba(255,255,255,0.03)', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.08)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#eee' }}>
                    <Crop size={14} style={{ color: 'var(--primary, #00d26a)' }} />
                    <strong>Vertical Framing / What Fits In</strong>
                  </div>
                  <span style={{ fontSize: '11px', color: '#aaa' }}>
                    {background.positionY === 0 ? "Top (Faces / Headroom)" : background.positionY === 50 ? "Center" : background.positionY === 100 ? "Bottom" : `${background.positionY}%`}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '11px', color: '#888' }}>Top</span>
                  <input 
                    type="range" 
                    min="0" 
                    max="100" 
                    value={background.positionY ?? 50} 
                    onChange={(e) => background.setPositionY(Number(e.target.value))}
                    style={{ flex: 1, accentColor: 'var(--primary, #00d26a)', cursor: 'pointer' }}
                  />
                  <span style={{ fontSize: '11px', color: '#888' }}>Bottom</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px' }}>
                  <span style={{ fontSize: '11px', color: '#777' }}>
                    Fit: <span style={{ color: '#aaa', textTransform: 'capitalize' }}>{background.fit || "cover"}</span> {(background.zoom ?? 100) > 100 && `• Zoom: ${background.zoom}%`}
                  </span>
                  <Button variant="ghost" size="sm" onClick={() => setFramingOpen(true)} style={{ height: '24px', fontSize: '11px', color: 'var(--primary, #00d26a)' }}>
                    Interactive Screen Cropper →
                  </Button>
                </div>
              </div>
            )}

            {/* Video Wallpaper Specific Settings */}
            {isVideoMedia(background.imageUrl) && (
              <div style={{ marginTop: '14px', padding: '14px', background: 'rgba(255,255,255,0.03)', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.08)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: '#eee' }}>Ambient Color Scan Mode</span>
                  <span style={{ fontSize: '11px', color: 'var(--primary, #00d26a)', fontWeight: 600 }}>
                    {background.colorScanMode === "si5" ? "si5 (5ths Scan)" : background.colorScanMode === "first-frame" ? "First Frame" : "Dynamic Timed"}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => background.setColorScanMode("si5")}
                    style={{
                      flex: 1,
                      padding: '7px 8px',
                      fontSize: '11px',
                      borderRadius: '4px',
                      border: background.colorScanMode === "si5" ? '1px solid var(--primary, #00d26a)' : '1px solid rgba(255,255,255,0.1)',
                      background: background.colorScanMode === "si5" ? 'rgba(0, 210, 106, 0.15)' : 'transparent',
                      color: background.colorScanMode === "si5" ? '#fff' : '#aaa',
                      cursor: 'pointer',
                      fontWeight: background.colorScanMode === "si5" ? 600 : 400
                    }}
                  >
                    si5 (Default)
                  </button>
                  <button
                    type="button"
                    onClick={() => background.setColorScanMode("first-frame")}
                    style={{
                      flex: 1,
                      padding: '7px 8px',
                      fontSize: '11px',
                      borderRadius: '4px',
                      border: background.colorScanMode === "first-frame" ? '1px solid var(--primary, #00d26a)' : '1px solid rgba(255,255,255,0.1)',
                      background: background.colorScanMode === "first-frame" ? 'rgba(0, 210, 106, 0.15)' : 'transparent',
                      color: background.colorScanMode === "first-frame" ? '#fff' : '#aaa',
                      cursor: 'pointer',
                      fontWeight: background.colorScanMode === "first-frame" ? 600 : 400
                    }}
                  >
                    First Frame
                  </button>
                  <button
                    type="button"
                    onClick={() => background.setColorScanMode("dynamic")}
                    style={{
                      flex: 1,
                      padding: '7px 8px',
                      fontSize: '11px',
                      borderRadius: '4px',
                      border: background.colorScanMode === "dynamic" ? '1px solid var(--primary, #00d26a)' : '1px solid rgba(255,255,255,0.1)',
                      background: background.colorScanMode === "dynamic" ? 'rgba(0, 210, 106, 0.15)' : 'transparent',
                      color: background.colorScanMode === "dynamic" ? '#fff' : '#aaa',
                      cursor: 'pointer',
                      fontWeight: background.colorScanMode === "dynamic" ? 600 : 400
                    }}
                  >
                    Dynamic Timed
                  </button>
                </div>
                <p style={{ margin: '8px 0 0', fontSize: '11px', color: '#888', lineHeight: 1.4 }}>
                  {background.colorScanMode === "si5"
                    ? "si5 analyzes 5 key moments to select the brightest and most saturated ambient lighting color."
                    : background.colorScanMode === "first-frame"
                    ? "Fast instant scan of the opening frame."
                    : "Pre-computes lighting changes every 5 seconds for smooth real-time color transitions as the video plays."}
                </p>
              </div>
            )}

            {isVideoMedia(background.imageUrl) && (
              <button
                type="button"
                className="adaptive-color-setting"
                role="switch"
                aria-checked={background.pauseVideoOnMusicPause}
                onClick={() => background.setPauseVideoOnMusicPause(!background.pauseVideoOnMusicPause)}
                style={{ marginTop: '12px' }}
              >
                <Disc3 size={18} />
                <span>
                  <strong>Pause video when music paused</strong>
                  <small>Automatically pause the live wallpaper when audio is paused, and resume playback when music plays.</small>
                </span>
                <i />
              </button>
            )}

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

            <BackgroundFramingDialog
              open={framingOpen}
              onOpenChange={setFramingOpen}
              imageUrl={background.imageUrl}
              initialPositionX={background.positionX}
              initialPositionY={background.positionY}
              initialFit={background.fit}
              initialZoom={background.zoom}
              onSave={(framing) => background.setFraming(framing)}
              title="Custom Wallpaper Framing & Crop"
              description="Adjust what part of your photo fits your screen. Ideal for portrait photos to showcase faces and headroom, or choosing between fill and ambient full-image."
            />
          </section>
        )}

        {tab === "audio" && (
          <section className="settings-panel audio-settings-panel">
            <header><span>Playback</span><h2>Audio output</h2><p>Choose where Listening Room sends Spotify and MP3 audio. Changing output briefly reconnects the Spotify Connect player.</p></header>

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
                checked={mp3Settings.enableMp3Support} 
                onChange={e => setMp3Settings({ ...mp3Settings, enableMp3Support: e.target.checked })}
                style={{width: '20px', height: '20px', accentColor: 'var(--primary)'}}
              />
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span>Enable MP3 Album Mode</span>
                <span style={{ fontSize: '12px', color: '#888' }}>Unlock local MP3 album creation in the Archive Room (Page 4) and custom record management.</span>
              </div>
            </label>

            <label className="dj-settings-toggle" style={{display: 'flex', alignItems: 'center', gap: '12px', fontSize: '16px', cursor: 'pointer', paddingBottom: '20px', borderBottom: '1px solid #333', marginBottom: '20px'}}>
              <input 
                type="checkbox" 
                checked={djSettings.enableAdvancedAlbumEditing} 
                onChange={e => setDjSettings({ ...djSettings, enableAdvancedAlbumEditing: e.target.checked })}
                style={{width: '20px', height: '20px', accentColor: 'var(--primary)'}}
              />
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span>Enable Advanced Album Editing</span>
                <span style={{ fontSize: '12px', color: '#888' }}>Unlock per-album custom backgrounds, vinyl pressing colors, and equalizer tuning in Page 4.</span>
              </div>
            </label>

            <label className="dj-settings-toggle" style={{display: 'flex', alignItems: 'center', gap: '12px', fontSize: '16px', cursor: 'pointer', paddingBottom: '20px', borderBottom: '1px solid #333', marginBottom: '20px'}}>
              <input 
                type="checkbox" 
                checked={djSettings.enableGlassyShelf ?? true} 
                onChange={e => setDjSettings({ ...djSettings, enableGlassyShelf: e.target.checked })}
                style={{width: '20px', height: '20px', accentColor: 'var(--primary)'}}
              />
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span>Glassy Shelf & Album View</span>
                <span style={{ fontSize: '12px', color: '#888' }}>Display custom backgrounds through the Page 5 shelf and album view with frosted blur and elevated brightness.</span>
              </div>
            </label>

            {/* Vinyl Record Appearance */}
            <div style={{ paddingBottom: '20px', borderBottom: '1px solid #333', marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <Disc3 size={18} style={{ color: 'var(--primary, #00d26a)' }} />
                <span style={{ fontSize: '16px', fontWeight: 500, color: '#f1eee7' }}>Vinyl Record Appearance</span>
              </div>
              <p style={{ margin: '0 0 14px 0', fontSize: '12px', color: '#888', lineHeight: '1.4' }}>
                Choose the visual rendering standard for vinyl record discs across the DJ turntable, album view, and player scenes.
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <button
                  type="button"
                  onClick={() => setDjSettings({ ...djSettings, vinylDiscStyle: "realistic" })}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '14px 12px',
                    borderRadius: '8px',
                    background: djSettings.vinylDiscStyle !== "classic" ? 'rgba(0, 210, 106, 0.12)' : 'rgba(255, 255, 255, 0.03)',
                    border: djSettings.vinylDiscStyle !== "classic" ? '2px solid var(--primary, #00d26a)' : '1px solid rgba(255, 255, 255, 0.1)',
                    cursor: 'pointer',
                    textAlign: 'center',
                    transition: 'all 0.18s ease',
                  }}
                >
                  <div 
                    style={{ 
                      width: '54px', 
                      height: '54px', 
                      borderRadius: '50%', 
                      background: 'radial-gradient(circle, #171717 0 2.7%, #090909 3.2% 20%, #171717 20.4% 20.8%, #080808 21.2% 100%)',
                      position: 'relative',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.6)',
                    }}
                  >
                    <div 
                      style={{ 
                        position: 'absolute', 
                        inset: '4%', 
                        borderRadius: '50%', 
                        background: 'conic-gradient(from 30deg, transparent, rgba(255,255,255,0.18) 15%, transparent 25%, transparent 48%, rgba(255,255,255,0.14) 58%, transparent 68%)',
                        pointerEvents: 'none',
                      }} 
                    />
                    <div 
                      style={{ 
                        position: 'absolute', 
                        inset: '6%', 
                        borderRadius: '50%', 
                        background: 'repeating-radial-gradient(circle, transparent 0 2px, rgba(255,255,255,0.08) 2.5px 3px)',
                        pointerEvents: 'none',
                      }} 
                    />
                    <div style={{ position: 'absolute', width: '32%', height: '32%', left: '34%', top: '34%', borderRadius: '50%', background: '#b91c1c' }} />
                    <div style={{ position: 'absolute', width: '5px', height: '5px', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', borderRadius: '50%', background: '#d8d8d3', boxShadow: '0 0 0 1.5px #111' }} />
                  </div>
                  <div>
                    <strong style={{ display: 'block', fontSize: '13px', color: djSettings.vinylDiscStyle !== "classic" ? '#fff' : '#ccc' }}>Realistic Sheen</strong>
                    <span style={{ fontSize: '11px', color: '#777' }}>Page 2 specular flares & micro-grooves</span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setDjSettings({ ...djSettings, vinylDiscStyle: "classic" })}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '14px 12px',
                    borderRadius: '8px',
                    background: djSettings.vinylDiscStyle === "classic" ? 'rgba(0, 210, 106, 0.12)' : 'rgba(255, 255, 255, 0.03)',
                    border: djSettings.vinylDiscStyle === "classic" ? '2px solid var(--primary, #00d26a)' : '1px solid rgba(255, 255, 255, 0.1)',
                    cursor: 'pointer',
                    textAlign: 'center',
                    transition: 'all 0.18s ease',
                  }}
                >
                  <div 
                    style={{ 
                      width: '54px', 
                      height: '54px', 
                      borderRadius: '50%', 
                      background: '#111',
                      position: 'relative',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.6)',
                    }}
                  >
                    <div 
                      style={{ 
                        position: 'absolute', 
                        inset: '3px', 
                        borderRadius: '50%', 
                        boxShadow: 'inset 0 0 0 2px #222, inset 0 0 0 5px #111, inset 0 0 0 7px #2a2a2a, inset 0 0 0 10px #111',
                        pointerEvents: 'none',
                      }} 
                    />
                    <div style={{ position: 'absolute', width: '32%', height: '32%', left: '34%', top: '34%', borderRadius: '50%', background: '#b91c1c' }} />
                    <div style={{ position: 'absolute', width: '4px', height: '4px', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', borderRadius: '50%', background: '#000' }} />
                  </div>
                  <div>
                    <strong style={{ display: 'block', fontSize: '13px', color: djSettings.vinylDiscStyle === "classic" ? '#fff' : '#ccc' }}>Classic Grooves</strong>
                    <span style={{ fontSize: '11px', color: '#777' }}>Concentric shadow rings & matte finish</span>
                  </div>
                </button>
              </div>
            </div>

            <label className="dj-settings-toggle" style={{display: 'flex', alignItems: 'center', gap: '12px', fontSize: '16px', cursor: 'pointer', paddingBottom: '20px', borderBottom: '1px solid #333', marginBottom: '20px'}}>
              <input 
                type="checkbox" 
                checked={djSettings.queueAlbumsSequentially} 
                onChange={e => setDjSettings({ ...djSettings, queueAlbumsSequentially: e.target.checked })}
                style={{width: '20px', height: '20px', accentColor: 'var(--primary)'}}
              />
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span>Queue albums sequentially</span>
                <span style={{ fontSize: '12px', color: '#888' }}>Play queued albums after the current album ends instead of immediately inserting their tracks.</span>
              </div>
            </label>

            <label className="dj-settings-toggle" style={{display: 'flex', alignItems: 'center', gap: '12px', fontSize: '16px', cursor: 'pointer', paddingBottom: '20px', borderBottom: '1px solid #333', marginBottom: '20px'}}>
              <input 
                type="checkbox" 
                checked={djSettings.loopAlbumQueue} 
                onChange={e => setDjSettings({ ...djSettings, loopAlbumQueue: e.target.checked })}
                style={{width: '20px', height: '20px', accentColor: 'var(--primary)'}}
              />
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span>Loop Album Queue</span>
                <span style={{ fontSize: '12px', color: '#888' }}>When an album finishes playing from the queue, move it back to the end instead of stopping.</span>
              </div>
            </label>
            
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

            <div className="dj-settings-layouts" style={{ marginTop: '25px', paddingTop: '20px', borderTop: '1px solid #333' }}>
              <h3 style={{ margin: '0 0 6px 0', fontSize: '18px', color: '#aaa' }}>Vertical & Snapped Window Layout</h3>
              <p style={{ margin: '0 0 15px 0', fontSize: '12px', color: '#888', lineHeight: '1.4' }}>
                When the window is narrow or snapped to screen edges, Battle Style rotates the turntables 90° with upright album jackets.
              </p>
              <div className="dj-layout-options" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
                <label className={`dj-layout-option ${djSettings.verticalRotationMode === 'auto' ? 'active' : ''}`}>
                  <input 
                    type="radio" 
                    name="verticalRotationMode"
                    value="auto"
                    checked={djSettings.verticalRotationMode === 'auto'}
                    onChange={() => setDjSettings({ ...djSettings, verticalRotationMode: 'auto' })}
                  />
                  <span>Auto (Adaptive Snap)</span>
                  <small>Rotates 90° matching left/right screen position</small>
                </label>

                <label className={`dj-layout-option ${djSettings.verticalRotationMode === 'rotate-right' ? 'active' : ''}`}>
                  <input 
                    type="radio" 
                    name="verticalRotationMode"
                    value="rotate-right"
                    checked={djSettings.verticalRotationMode === 'rotate-right'}
                    onChange={() => setDjSettings({ ...djSettings, verticalRotationMode: 'rotate-right' })}
                  />
                  <span>Rotate Right (90° CW)</span>
                  <small>Deck 1 on top, Deck 2 on bottom</small>
                </label>

                <label className={`dj-layout-option ${djSettings.verticalRotationMode === 'rotate-left' ? 'active' : ''}`}>
                  <input 
                    type="radio" 
                    name="verticalRotationMode"
                    value="rotate-left"
                    checked={djSettings.verticalRotationMode === 'rotate-left'}
                    onChange={() => setDjSettings({ ...djSettings, verticalRotationMode: 'rotate-left' })}
                  />
                  <span>Rotate Left (90° CCW)</span>
                  <small>Deck 2 on top, Deck 1 on bottom</small>
                </label>

                <label className={`dj-layout-option ${djSettings.verticalRotationMode === 'disabled' ? 'active' : ''}`}>
                  <input 
                    type="radio" 
                    name="verticalRotationMode"
                    value="disabled"
                    checked={djSettings.verticalRotationMode === 'disabled'}
                    onChange={() => setDjSettings({ ...djSettings, verticalRotationMode: 'disabled' })}
                  />
                  <span>Horizontal Only</span>
                  <small>Never rotate, keep standard horizontal rig</small>
                </label>
              </div>
            </div>

            <div className="dj-settings-layouts" style={{ marginTop: '25px', paddingTop: '20px', borderTop: '1px solid #333' }}>
              <h3 style={{ margin: '0 0 6px 0', fontSize: '18px', color: '#aaa' }}>Turntables & DJ Setup Theme</h3>
              <p style={{ margin: '0 0 15px 0', fontSize: '12px', color: '#888', lineHeight: '1.4' }}>
                Select a visual styling for both turntables and the DJ desk. You can also click either turntable to cycle anytime.
              </p>
              <div className="dj-layout-options" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
                <label className={`dj-layout-option ${(djSettings.turntableTheme || (djSettings.isDark ? 'dark' : 'light')) === 'light' ? 'active' : ''}`}>
                  <input 
                    type="radio" 
                    name="turntableTheme" 
                    value="light" 
                    checked={(djSettings.turntableTheme || (djSettings.isDark ? 'dark' : 'light')) === 'light'} 
                    onChange={() => setDjSettings({ ...djSettings, turntableTheme: 'light', isDark: false })} 
                  />
                  <span>Classic Silver</span>
                  <small>Brushed aluminum body with silver hardware</small>
                </label>

                <label className={`dj-layout-option ${(djSettings.turntableTheme || (djSettings.isDark ? 'dark' : 'light')) === 'dark' ? 'active' : ''}`}>
                  <input 
                    type="radio" 
                    name="turntableTheme" 
                    value="dark" 
                    checked={(djSettings.turntableTheme || (djSettings.isDark ? 'dark' : 'light')) === 'dark'} 
                    onChange={() => setDjSettings({ ...djSettings, turntableTheme: 'dark', isDark: true })} 
                  />
                  <span>Matte Black</span>
                  <small>Stealth dark chassis with high-contrast hardware</small>
                </label>

                <label className={`dj-layout-option ${(djSettings.turntableTheme || (djSettings.isDark ? 'dark' : 'light')) === 'glass-clear' ? 'active' : ''}`}>
                  <input 
                    type="radio" 
                    name="turntableTheme" 
                    value="glass-clear" 
                    checked={(djSettings.turntableTheme || (djSettings.isDark ? 'dark' : 'light')) === 'glass-clear'} 
                    onChange={() => setDjSettings({ ...djSettings, turntableTheme: 'glass-clear', isDark: false })} 
                  />
                  <span>Clear Frosted Glass</span>
                  <small>Translucent ice acrylic casing with glowing background</small>
                </label>

                <label className={`dj-layout-option ${(djSettings.turntableTheme || (djSettings.isDark ? 'dark' : 'light')) === 'glass-smoked' ? 'active' : ''}`}>
                  <input 
                    type="radio" 
                    name="turntableTheme" 
                    value="glass-smoked" 
                    checked={(djSettings.turntableTheme || (djSettings.isDark ? 'dark' : 'light')) === 'glass-smoked'} 
                    onChange={() => setDjSettings({ ...djSettings, turntableTheme: 'glass-smoked', isDark: true })} 
                  />
                  <span>Smoked Obsidian Glass</span>
                  <small>Deep tinted glass casing with subtle prism reflections</small>
                </label>
              </div>
            </div>

            <div className="dj-settings-layouts" style={{ marginTop: '25px', paddingTop: '20px', borderTop: '1px solid #333' }}>
              <h3 style={{ margin: '0 0 6px 0', fontSize: '18px', color: '#aaa' }}>Tonearm & Needle Style</h3>
              <p style={{ margin: '0 0 15px 0', fontSize: '12px', color: '#888', lineHeight: '1.4' }}>
                Select your preferred tonearm shape and cartridge needle styling.
              </p>
              <div className="dj-layout-options" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
                <label className={`dj-layout-option ${(djSettings.tonearmStyle || 'technics-classic') === 'technics-classic' ? 'active' : ''}`}>
                  <input 
                    type="radio" 
                    name="tonearmStyle" 
                    value="technics-classic" 
                    checked={(djSettings.tonearmStyle || 'technics-classic') === 'technics-classic'} 
                    onChange={() => setDjSettings({ ...djSettings, tonearmStyle: 'technics-classic' })} 
                  />
                  <span>Technics Classic</span>
                  <small>S-shaped arm with slotted SME headshell and Shure M44-7 needle</small>
                </label>

                <label className={`dj-layout-option ${djSettings.tonearmStyle === 'concorde-club' ? 'active' : ''}`}>
                  <input 
                    type="radio" 
                    name="tonearmStyle" 
                    value="concorde-club" 
                    checked={djSettings.tonearmStyle === 'concorde-club'} 
                    onChange={() => setDjSettings({ ...djSettings, tonearmStyle: 'concorde-club' })} 
                  />
                  <span>Concorde Club</span>
                  <small>S-shaped arm with aerodynamic Ortofon Concorde needle</small>
                </label>

                <label className={`dj-layout-option ${djSettings.tonearmStyle === 'audiophile-wedge' ? 'active' : ''}`}>
                  <input 
                    type="radio" 
                    name="tonearmStyle" 
                    value="audiophile-wedge" 
                    checked={djSettings.tonearmStyle === 'audiophile-wedge'} 
                    onChange={() => setDjSettings({ ...djSettings, tonearmStyle: 'audiophile-wedge' })} 
                  />
                  <span>Audiophile Wedge</span>
                  <small>S-shaped arm with faceted jewel cartridge and ruby stylus</small>
                </label>

                <label className={`dj-layout-option ${djSettings.tonearmStyle === 'straight-battle' ? 'active' : ''}`}>
                  <input 
                    type="radio" 
                    name="tonearmStyle" 
                    value="straight-battle" 
                    checked={djSettings.tonearmStyle === 'straight-battle'} 
                    onChange={() => setDjSettings({ ...djSettings, tonearmStyle: 'straight-battle' })} 
                  />
                  <span>Straight Battle Scratch</span>
                  <small>Zero-skip rigid straight arm with high-vis battle cartridge</small>
                </label>
              </div>
            </div>
          </section>
        )}

          {tab === "data" && (
            <section className="settings-panel">
              <header>
                <span>Backup</span>
                <h2>Data Management</h2>
                <p>Export your collections, custom artwork, and settings to a backup file, or import them into a new environment.</p>
              </header>

              <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                <Button onClick={handleExportData} disabled={isExportingData || isImportingData} style={{ flex: 1 }}>
                  <Download size={16} style={{ marginRight: '8px' }} />
                  {isExportingData ? "Packaging Backup..." : "Export Backup"}
                </Button>
                <Button variant="outline" disabled={isExportingData || isImportingData} onClick={() => importInput.current?.click()} style={{ flex: 1 }}>
                  <Upload size={16} style={{ marginRight: '8px' }} />
                  {isImportingData ? "Restoring Backup..." : "Import Backup"}
                </Button>
                <input ref={importInput} type="file" accept=".json" style={{ display: 'none' }} onChange={handleImportData} />
              </div>
              <p style={{ marginTop: '20px', color: '#888', fontSize: '13px', lineHeight: '1.5' }}>
                Note: This backup includes all your saved albums, custom artworks, MP3 audio files, and theme preferences. It does not include your Spotify credentials. When you import this file, the app will restore all audio and settings, then reload.
              </p>
            </section>
          )}
        </DialogContent>
    </Dialog>
  );
}
