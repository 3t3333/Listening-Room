import { useState, useEffect, useRef, type ChangeEvent } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { SlidersHorizontal, ImagePlus, Trash2, Palette, Disc3, Check, Crop, ListMusic, Loader2 } from "lucide-react";
import type { Collection, CollectionCustomization } from "../lib/collections";
import { updateCollectionCustomization } from "../lib/collections";
import { saveAlbumBackground, deleteAlbumBackground, getAlbumBackgroundUrl } from "../lib/mp3Storage";
import { VINYL_COLOR_PRESETS, getVinylColorStyle } from "../lib/vinylColors";
import { BackgroundFramingDialog } from "./BackgroundFramingDialog";
import { Mp3TracklistEditorDialog } from "./Mp3TracklistEditorDialog";
import {
  isVideoMedia,
  registerMediaBlob,
  validateVideoDuration,
  scanVideoPalette,
  type LiveWallpaperColorScanMode,
  type AmbientColorScheduleEntry,
} from "../lib/liveWallpaper";
import type { ArtworkPalette } from "../hooks/useArtworkColor";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  record: Collection;
  onSaved?: (updatedRecord: Collection) => void;
}

const EQUALIZER_PRESETS = [
  { name: "Neon Green", color: "#00d26a" },
  { name: "Cyan Pulse", color: "#06b6d4" },
  { name: "Warm Amber", color: "#f59e0b" },
  { name: "Electric Violet", color: "#8b5cf6" },
  { name: "Hot Coral", color: "#f43f5e" },
  { name: "Clean White", color: "#ffffff" },
];

export function AdvancedAlbumDialog({ open, onOpenChange, record, onSaved }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const initialCustomization = record.customization || {};

  const [hasBg, setHasBg] = useState(!!initialCustomization.hasCustomBackground);
  const [bgBlob, setBgBlob] = useState<Blob | null>(null);
  const [bgPreviewUrl, setBgPreviewUrl] = useState<string | null>(null);
  const [bgOpacity, setBgOpacity] = useState(initialCustomization.backgroundOpacity ?? 0.45);
  const [bgPositionX, setBgPositionX] = useState(initialCustomization.backgroundPositionX ?? 50);
  const [bgPositionY, setBgPositionY] = useState(initialCustomization.backgroundPositionY ?? 50);
  const [bgFit, setBgFit] = useState<"cover" | "contain">(initialCustomization.backgroundFit || "cover");
  const [bgZoom, setBgZoom] = useState(initialCustomization.backgroundZoom ?? 100);
  const [bgMediaType, setBgMediaType] = useState<"image" | "video">(initialCustomization.backgroundMediaType || "image");
  const [bgScanMode, setBgScanMode] = useState<LiveWallpaperColorScanMode>(initialCustomization.backgroundColorScanMode || "si5");
  const [bgPalette, setBgPalette] = useState<ArtworkPalette | undefined>(initialCustomization.backgroundPalette);
  const [bgSchedule, setBgSchedule] = useState<AmbientColorScheduleEntry[] | undefined>(initialCustomization.backgroundSchedule);
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState<number | null>(null);
  const [framingOpen, setFramingOpen] = useState(false);
  const [isRemovingBg, setIsRemovingBg] = useState(false);

  const [eqMode, setEqMode] = useState<"adapt" | "custom">(initialCustomization.equalizerColorMode || "adapt");
  const [eqColor, setEqColor] = useState(initialCustomization.equalizerCustomColor || "#00d26a");

  const [vinylColor, setVinylColor] = useState<string | null>(initialCustomization.vinylColor || null);
  const [isSaving, setIsSaving] = useState(false);
  const [tracklistEditorOpen, setTracklistEditorOpen] = useState(false);
  const [currentRecord, setCurrentRecord] = useState<Collection>(record);

  useEffect(() => {
    if (open) {
      setCurrentRecord(record);
      const cust = record.customization || {};
      setHasBg(!!cust.hasCustomBackground);
      setBgOpacity(cust.backgroundOpacity ?? 0.45);
      setBgPositionX(cust.backgroundPositionX ?? 50);
      setBgPositionY(cust.backgroundPositionY ?? 50);
      setBgFit(cust.backgroundFit || "cover");
      setBgZoom(cust.backgroundZoom ?? 100);
      setEqMode(cust.equalizerColorMode || "adapt");
      setEqColor(cust.equalizerCustomColor || "#00d26a");
      setVinylColor(cust.vinylColor || null);
      setBgBlob(null);
      setIsRemovingBg(false);

      if (cust.hasCustomBackground) {
        getAlbumBackgroundUrl(record.id).then((url) => {
          setBgPreviewUrl(url);
        });
      } else {
        setBgPreviewUrl(null);
      }
    }
  }, [open, record.id]);

  async function handleFileSelect(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const isVideo = isVideoMedia(file.name, file.type);
    const isImage = file.type.startsWith("image/") || file.name.toLowerCase().endsWith(".gif");

    if (!isVideo && !isImage) {
      alert("Please choose a valid image (PNG, JPG, WEBP, GIF) or video (MP4, WebM, MOV) for the custom album background.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    let scannedPalette: ArtworkPalette | undefined = undefined;
    let scannedSchedule: AmbientColorScheduleEntry[] | undefined = undefined;

    if (isVideo) {
      setIsScanning(true);
      setScanProgress(0);
      try {
        await validateVideoDuration(file, 60);
        const result = await scanVideoPalette(file, bgScanMode, (pct) => setScanProgress(pct));
        scannedPalette = result.palette;
        scannedSchedule = result.schedule;
        setBgMediaType("video");
        setBgPalette(scannedPalette);
        setBgSchedule(scannedSchedule);
      } catch (err: any) {
        if (err?.message !== "Video upload cancelled by user.") {
          alert(err?.message || "Failed to process video wallpaper.");
        }
        if (fileInputRef.current) fileInputRef.current.value = "";
        setIsScanning(false);
        setScanProgress(null);
        return;
      } finally {
        setIsScanning(false);
        setScanProgress(null);
      }
    } else {
      setBgMediaType("image");
      setBgPalette(undefined);
      setBgSchedule(undefined);
    }

    setBgBlob(file);
    setHasBg(true);
    setIsRemovingBg(false);
    const objectUrl = URL.createObjectURL(file);
    registerMediaBlob(objectUrl, file.type);
    setBgPreviewUrl(objectUrl);
  }

  function handleRemoveBg() {
    setBgBlob(null);
    setHasBg(false);
    setIsRemovingBg(true);
    setBgPreviewUrl(null);
    setBgPalette(undefined);
    setBgSchedule(undefined);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleSave() {
    setIsSaving(true);
    try {
      if (bgBlob) {
        await saveAlbumBackground(record.id, bgBlob);
      } else if (isRemovingBg) {
        await deleteAlbumBackground(record.id);
      }

      const newCustomization: CollectionCustomization = {
        hasCustomBackground: hasBg,
        backgroundOpacity: bgOpacity,
        backgroundPositionX: bgPositionX,
        backgroundPositionY: bgPositionY,
        backgroundFit: bgFit,
        backgroundZoom: bgZoom,
        backgroundMediaType: bgMediaType,
        backgroundColorScanMode: bgScanMode,
        backgroundPalette: bgPalette,
        backgroundSchedule: bgSchedule,
        equalizerColorMode: eqMode,
        equalizerCustomColor: eqMode === "custom" ? eqColor : null,
        vinylColor: vinylColor,
      };

      updateCollectionCustomization(record.id, newCustomization);
      const updatedRecord: Collection = {
        ...record,
        customization: newCustomization,
        updatedAt: new Date().toISOString(),
      };

      onSaved?.(updatedRecord);
      onOpenChange(false);
    } catch (err: any) {
      console.error("Failed to save album customization:", err);
      alert("Failed to save customizations: " + (err?.message || String(err)));
    } finally {
      setIsSaving(false);
    }
  }

  const coverTrack = record.tracks?.[0];
  const vinylStyle = getVinylColorStyle(vinylColor);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="advanced-album-dialog" style={{ maxWidth: '680px', maxHeight: '88vh', overflowY: 'auto', padding: '28px' }}>
        <DialogTitle style={{ fontSize: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <SlidersHorizontal size={22} style={{ color: 'var(--primary, #00d26a)' }} />
          Advanced Album Settings
        </DialogTitle>
        <DialogDescription style={{ color: '#888', marginTop: '-6px', marginBottom: '20px', fontSize: '13px' }}>
          Customize the dedicated background, visualizer color, and vinyl pressing color for <strong>{record.name}</strong>.
        </DialogDescription>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '26px' }}>
          
          {/* 1. Custom Background Section */}
          <div className="advanced-section" style={{ background: 'rgba(255,255,255,0.03)', padding: '18px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ImagePlus size={18} style={{ color: '#c29665' }} />
                <h3 style={{ margin: 0, fontSize: '15px', color: '#f1eee7' }}>Album Custom Background</h3>
              </div>
              {hasBg && (
                <Button variant="ghost" size="sm" onClick={handleRemoveBg} style={{ color: '#ff5555', height: '28px', fontSize: '12px' }}>
                  <Trash2 size={13} style={{ marginRight: '5px' }} />
                  Remove
                </Button>
              )}
            </div>
            <p style={{ margin: '0 0 14px 0', fontSize: '12px', color: '#888', lineHeight: '1.4' }}>
              Displays automatically whenever any track from this album is playing, fading smoothly over ~600ms. Supports PNG, JPG, WEBP, and AVIF.
            </p>

            <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
              <div 
                style={{ 
                  width: '120px', 
                  height: '80px', 
                  borderRadius: '6px', 
                  background: '#121212', 
                  border: '1px dashed rgba(255,255,255,0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                  position: 'relative',
                  flexShrink: 0
                }}
              >
                {bgPreviewUrl ? (
                  isVideoMedia(bgPreviewUrl) ? (
                    <video 
                      src={bgPreviewUrl} 
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
                        width: '100%', 
                        height: '100%', 
                        objectFit: bgFit || 'cover', 
                        objectPosition: `${bgPositionX}% ${bgPositionY}%`,
                        transform: bgZoom > 100 ? `scale(${bgZoom / 100})` : undefined,
                        transformOrigin: `${bgPositionX}% ${bgPositionY}%`,
                        opacity: bgOpacity 
                      }} 
                    />
                  ) : (
                    <img 
                      src={bgPreviewUrl} 
                      alt="Preview" 
                      style={{ 
                        width: '100%', 
                        height: '100%', 
                        objectFit: bgFit || 'cover', 
                        objectPosition: `${bgPositionX}% ${bgPositionY}%`,
                        transform: bgZoom > 100 ? `scale(${bgZoom / 100})` : undefined,
                        transformOrigin: `${bgPositionX}% ${bgPositionY}%`,
                        opacity: bgOpacity 
                      }} 
                    />
                  )
                ) : (
                  <span style={{ fontSize: '11px', color: '#666', textAlign: 'center', padding: '6px' }}>
                    {isScanning ? `Scanning (${scanProgress ?? 0}%)...` : "No Media"}
                  </span>
                )}
              </div>

              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <input 
                  ref={fileInputRef} 
                  type="file" 
                  accept="image/*,video/mp4,video/webm,video/quicktime,video/x-m4v,.gif,.mp4,.webm,.mov,.m4v" 
                  style={{ display: 'none' }} 
                  onChange={handleFileSelect} 
                />
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={isScanning} style={{ width: 'fit-content' }}>
                    {isScanning ? <Loader2 size={14} className="animate-spin" style={{ marginRight: '6px' }} /> : <ImagePlus size={14} style={{ marginRight: '6px' }} />}
                    {isScanning ? `Scanning (${scanProgress ?? 0}%)...` : hasBg ? "Change Media" : "Upload Media (Photo/Video)"}
                  </Button>
                  {hasBg && (
                    <Button variant="outline" size="sm" onClick={() => setFramingOpen(true)} disabled={isScanning} style={{ width: 'fit-content' }}>
                      <Crop size={14} style={{ marginRight: '6px' }} />
                      Crop & Framing
                    </Button>
                  )}
                </div>

                {hasBg && (
                  <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#aaa' }}>
                      <span>Background Opacity</span>
                      <output>{Math.round(bgOpacity * 100)}%</output>
                    </div>
                    <input 
                      type="range" 
                      min="0" 
                      max="100" 
                      value={Math.round(bgOpacity * 100)} 
                      onChange={(e) => setBgOpacity(Number(e.target.value) / 100)}
                      style={{ accentColor: 'var(--primary, #00d26a)', cursor: 'pointer' }}
                    />
                  </label>
                )}
              </div>
            </div>

            {/* Quick Framing & What Fits In Shortcut */}
            {hasBg && (
              <div style={{ marginTop: '14px', padding: '12px 14px', background: 'rgba(0,0,0,0.25)', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#eee' }}>
                    <Crop size={13} style={{ color: 'var(--primary, #00d26a)' }} />
                    <strong>Vertical Framing / What Fits In</strong>
                  </div>
                  <span style={{ fontSize: '11px', color: '#aaa' }}>
                    {bgPositionY === 0 ? "Top (Faces / Headroom)" : bgPositionY === 50 ? "Center" : bgPositionY === 100 ? "Bottom" : `${bgPositionY}%`}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '11px', color: '#888' }}>Top</span>
                  <input 
                    type="range" 
                    min="0" 
                    max="100" 
                    value={bgPositionY} 
                    onChange={(e) => setBgPositionY(Number(e.target.value))}
                    style={{ flex: 1, accentColor: 'var(--primary, #00d26a)', cursor: 'pointer' }}
                  />
                  <span style={{ fontSize: '11px', color: '#888' }}>Bottom</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
                  <span style={{ fontSize: '11px', color: '#777' }}>
                    Fit: <span style={{ color: '#aaa', textTransform: 'capitalize' }}>{bgFit}</span> {bgZoom > 100 && `• Zoom: ${bgZoom}%`}
                  </span>
                  <Button variant="ghost" size="sm" onClick={() => setFramingOpen(true)} style={{ height: '22px', fontSize: '11px', color: 'var(--primary, #00d26a)', padding: '0 6px' }}>
                    Interactive Screen Cropper →
                  </Button>
                </div>
              </div>
            )}

            {/* Video Wallpaper Ambient Color Mode */}
            {hasBg && isVideoMedia(bgPreviewUrl) && (
              <div style={{ marginTop: '14px', padding: '12px 14px', background: 'rgba(0,0,0,0.25)', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#eee' }}>Ambient Lighting Color Scan</span>
                  <span style={{ fontSize: '11px', color: 'var(--primary, #00d26a)', fontWeight: 600 }}>
                    {bgScanMode === "si5" ? "si5 (5ths Scan)" : bgScanMode === "first-frame" ? "First Frame" : "Dynamic Timed"}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => setBgScanMode("si5")}
                    style={{
                      flex: 1,
                      padding: '6px 8px',
                      fontSize: '11px',
                      borderRadius: '4px',
                      border: bgScanMode === "si5" ? '1px solid var(--primary, #00d26a)' : '1px solid rgba(255,255,255,0.1)',
                      background: bgScanMode === "si5" ? 'rgba(0, 210, 106, 0.15)' : 'transparent',
                      color: bgScanMode === "si5" ? '#fff' : '#aaa',
                      cursor: 'pointer',
                      fontWeight: bgScanMode === "si5" ? 600 : 400
                    }}
                  >
                    si5 (Default)
                  </button>
                  <button
                    type="button"
                    onClick={() => setBgScanMode("first-frame")}
                    style={{
                      flex: 1,
                      padding: '6px 8px',
                      fontSize: '11px',
                      borderRadius: '4px',
                      border: bgScanMode === "first-frame" ? '1px solid var(--primary, #00d26a)' : '1px solid rgba(255,255,255,0.1)',
                      background: bgScanMode === "first-frame" ? 'rgba(0, 210, 106, 0.15)' : 'transparent',
                      color: bgScanMode === "first-frame" ? '#fff' : '#aaa',
                      cursor: 'pointer',
                      fontWeight: bgScanMode === "first-frame" ? 600 : 400
                    }}
                  >
                    First Frame
                  </button>
                  <button
                    type="button"
                    onClick={() => setBgScanMode("dynamic")}
                    style={{
                      flex: 1,
                      padding: '6px 8px',
                      fontSize: '11px',
                      borderRadius: '4px',
                      border: bgScanMode === "dynamic" ? '1px solid var(--primary, #00d26a)' : '1px solid rgba(255,255,255,0.1)',
                      background: bgScanMode === "dynamic" ? 'rgba(0, 210, 106, 0.15)' : 'transparent',
                      color: bgScanMode === "dynamic" ? '#fff' : '#aaa',
                      cursor: 'pointer',
                      fontWeight: bgScanMode === "dynamic" ? 600 : 400
                    }}
                  >
                    Dynamic Timed
                  </button>
                </div>
              </div>
            )}

            <BackgroundFramingDialog
              open={framingOpen}
              onOpenChange={setFramingOpen}
              imageUrl={bgPreviewUrl}
              initialPositionX={bgPositionX}
              initialPositionY={bgPositionY}
              initialFit={bgFit}
              initialZoom={bgZoom}
              onSave={(framing) => {
                setBgPositionX(framing.positionX);
                setBgPositionY(framing.positionY);
                setBgFit(framing.fit);
                setBgZoom(framing.zoom);
              }}
              title={`${record.name || "Album"} Background Framing & Crop`}
              description="Adjust what part of your photo fits your screen when this album plays. Ideal for portrait photos to showcase faces and headroom."
            />
          </div>

          {/* 2. Equalizer / Visualizer Color */}
          <div className="advanced-section" style={{ background: 'rgba(255,255,255,0.03)', padding: '18px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <Palette size={18} style={{ color: '#00d26a' }} />
              <h3 style={{ margin: 0, fontSize: '15px', color: '#f1eee7' }}>Equalizer Color</h3>
            </div>
            <p style={{ margin: '0 0 14px 0', fontSize: '12px', color: '#888' }}>
              Select how the block audio visualizer colors appear when tracks from this record are active.
            </p>

            <div style={{ display: 'flex', gap: '16px', marginBottom: '14px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px' }}>
                <input 
                  type="radio" 
                  name="eqMode" 
                  checked={eqMode === "adapt"} 
                  onChange={() => setEqMode("adapt")}
                  style={{ accentColor: 'var(--primary, #00d26a)' }} 
                />
                Match Artwork / Background (Adaptive)
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px' }}>
                <input 
                  type="radio" 
                  name="eqMode" 
                  checked={eqMode === "custom"} 
                  onChange={() => setEqMode("custom")}
                  style={{ accentColor: 'var(--primary, #00d26a)' }} 
                />
                Custom Equalizer Color
              </label>
            </div>

            {eqMode === "custom" && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginTop: '10px' }}>
                {EQUALIZER_PRESETS.map((preset) => (
                  <button
                    key={preset.color}
                    type="button"
                    title={preset.name}
                    onClick={() => setEqColor(preset.color)}
                    style={{
                      width: '28px',
                      height: '28px',
                      borderRadius: '50%',
                      background: preset.color,
                      border: eqColor === preset.color ? '2px solid #fff' : '1px solid rgba(255,255,255,0.2)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxShadow: eqColor === preset.color ? `0 0 10px ${preset.color}` : 'none',
                    }}
                  >
                    {eqColor === preset.color && <Check size={14} color={preset.color === "#ffffff" ? "#000" : "#fff"} />}
                  </button>
                ))}

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: '6px' }}>
                  <input 
                    type="color" 
                    value={eqColor} 
                    onChange={(e) => setEqColor(e.target.value)} 
                    style={{ width: '30px', height: '30px', padding: 0, border: 'none', borderRadius: '4px', cursor: 'pointer', background: 'transparent' }} 
                  />
                  <span style={{ fontSize: '12px', fontFamily: 'monospace', color: '#aaa' }}>{eqColor.toUpperCase()}</span>
                </div>
              </div>
            )}
          </div>

          {/* 3. Vinyl Disc Pressing Color */}
          <div className="advanced-section" style={{ background: 'rgba(255,255,255,0.03)', padding: '18px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <Disc3 size={18} style={{ color: '#e63946' }} />
              <h3 style={{ margin: 0, fontSize: '15px', color: '#f1eee7' }}>Vinyl Record Pressing Color</h3>
            </div>
            <p style={{ margin: '0 0 14px 0', fontSize: '12px', color: '#888' }}>
              Choose a custom pressing vinyl color for this album. Appears on the turntable, flying animations, and inspection views.
            </p>

            <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
              {/* Mini Vinyl Preview */}
              <div 
                style={{ 
                  width: '90px', 
                  height: '90px', 
                  borderRadius: '50%', 
                  position: 'relative', 
                  flexShrink: 0,
                  boxShadow: '0 8px 20px rgba(0,0,0,0.6)',
                  background: vinylColor && (vinylStyle as any)["--vinyl-bg"] 
                    ? (vinylStyle as any)["--vinyl-bg"]
                    : 'radial-gradient(circle, #171717 0 2.7%, #090909 3.2% 20%, #171717 20.4% 20.8%, #080808 21.2% 100%)',
                  ...vinylStyle,
                }}
              >
                {/* Conic Sheen */}
                <div 
                  style={{ 
                    position: 'absolute', 
                    inset: '4%', 
                    borderRadius: '50%', 
                    background: 'conic-gradient(from 30deg, transparent, rgba(255,255,255,0.18) 15%, transparent 25%, transparent 48%, rgba(255,255,255,0.14) 58%, transparent 68%)',
                    pointerEvents: 'none',
                    zIndex: 2,
                  }} 
                />
                {/* Micro Grooves */}
                <div 
                  style={{
                    position: 'absolute',
                    inset: '6%',
                    borderRadius: '50%',
                    background: 'repeating-radial-gradient(circle, transparent 0 2px, rgba(255,255,255,0.08) 2.5px 3px)',
                    pointerEvents: 'none',
                    zIndex: 1,
                  }} 
                />
                {/* Center Label */}
                <div 
                  style={{
                    position: 'absolute',
                    width: '32%',
                    height: '32%',
                    left: '34%',
                    top: '34%',
                    borderRadius: '50%',
                    overflow: 'hidden',
                    background: '#222',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 3,
                  }}
                >
                  {coverTrack?.imageUrl ? (
                    <img src={coverTrack.imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <Disc3 size={14} color="#666" />
                  )}
                </div>
                {/* Center Spindle Grommet */}
                <div style={{ position: 'absolute', width: '6px', height: '6px', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', borderRadius: '50%', background: '#d8d8d3', boxShadow: '0 0 0 1.5px #111', zIndex: 4 }} />
              </div>

              {/* Color Presets */}
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '10px' }}>
                  {VINYL_COLOR_PRESETS.map((preset) => {
                    const isSelected = (!vinylColor && preset.color === "#121212") || vinylColor?.toLowerCase() === preset.color.toLowerCase();
                    return (
                      <button
                        key={preset.color}
                        type="button"
                        title={preset.name}
                        onClick={() => setVinylColor(preset.color === "#121212" ? null : preset.color)}
                        style={{
                          width: '26px',
                          height: '26px',
                          borderRadius: '50%',
                          background: preset.color,
                          border: isSelected ? '2px solid #fff' : '1px solid rgba(255,255,255,0.2)',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          boxShadow: isSelected ? `0 0 8px ${preset.color}` : 'none',
                        }}
                      >
                        {isSelected && <Check size={13} color={preset.color === "#e2e8f0" ? "#000" : "#fff"} />}
                      </button>
                    );
                  })}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#bbb', cursor: 'pointer' }}>
                    <input 
                      type="color" 
                      value={vinylColor || "#121212"} 
                      onChange={(e) => setVinylColor(e.target.value)}
                      style={{ width: '26px', height: '26px', padding: 0, border: 'none', borderRadius: '4px', cursor: 'pointer', background: 'transparent' }} 
                    />
                    <span>Custom Hex: <code style={{ color: '#fff' }}>{vinylColor ? vinylColor.toUpperCase() : "Default Black"}</code></span>
                  </label>
                  {vinylColor && (
                    <Button variant="ghost" size="sm" onClick={() => setVinylColor(null)} style={{ height: '24px', fontSize: '11px', color: '#888' }}>
                      Reset to Black
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* 4. Tracklist & Vinyl Sides (MP3 Albums) */}
          {record.format === "mp3" && (
            <div className="advanced-section" style={{ background: 'rgba(255,255,255,0.03)', padding: '18px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <ListMusic size={18} style={{ color: '#00d26a' }} />
                  <div>
                    <h3 style={{ margin: 0, fontSize: '15px', color: '#f1eee7' }}>Tracklist & Vinyl Sides</h3>
                    <p style={{ margin: '3px 0 0 0', fontSize: '12px', color: '#888' }}>
                      Reorder tracks, swap Side A and Side B, or reset to original import order.
                    </p>
                  </div>
                </div>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setTracklistEditorOpen(true)}
                  style={{ gap: '6px', fontSize: '12px' }}
                >
                  <SlidersHorizontal size={14} />
                  Edit Tracklist
                </Button>
              </div>
            </div>
          )}

        </div>

        {tracklistEditorOpen && (
          <Mp3TracklistEditorDialog
            open={tracklistEditorOpen}
            onOpenChange={setTracklistEditorOpen}
            record={currentRecord}
            onSaved={(updatedTracks) => {
              setCurrentRecord((prev) => ({ ...prev, tracks: updatedTracks }));
              if (onSaved) {
                onSaved({ ...currentRecord, tracks: updatedTracks });
              }
            }}
          />
        )}

        {/* Footer actions */}
        <div style={{ display: 'flex', gap: '12px', marginTop: '24px', justifyContent: 'flex-end' }}>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving} style={{ minWidth: '130px' }}>
            {isSaving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
