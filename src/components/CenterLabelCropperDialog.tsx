import { useState, useEffect, useRef, type MouseEvent as ReactMouseEvent, type ChangeEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "./ui/dialog";
import { Button } from "./ui/button";
import {
  Upload,
  Link as LinkIcon,
  Disc3,
  ZoomIn,
  RotateCcw,
  Check,
  Loader2,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  AlignCenter,
  Sparkles,
} from "lucide-react";
import { getVinylColorStyle } from "../lib/vinylColors";

export interface CenterLabelCropperDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  albumName?: string;
  sideTitle?: string;
  vinylColor?: string | null;
  initialImageUrl?: string | null;
  initialPositionX?: number;
  initialPositionY?: number;
  initialZoom?: number;
  onApply: (
    blob: Blob,
    framing: { positionX: number; positionY: number; zoom: number }
  ) => void;
}

export function CenterLabelCropperDialog({
  open,
  onOpenChange,
  albumName = "Album",
  sideTitle,
  vinylColor = null,
  initialImageUrl = null,
  initialPositionX = 50,
  initialPositionY = 50,
  initialZoom = 100,
  onApply,
}: CenterLabelCropperDialogProps) {
  const [sourceImageUrl, setSourceImageUrl] = useState<string | null>(initialImageUrl);
  const [urlInput, setUrlInput] = useState("");
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const [posX, setPosX] = useState(initialPositionX);
  const [posY, setPosY] = useState(initialPositionY);
  const [zoom, setZoom] = useState(initialZoom);
  const [isDragging, setIsDragging] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<{ x: number; y: number; startPosX: number; startPosY: number } | null>(null);
  const imageElementRef = useRef<HTMLImageElement | null>(null);

  // Sync state when dialog opens
  useEffect(() => {
    if (open) {
      setSourceImageUrl(initialImageUrl);
      setPosX(initialPositionX ?? 50);
      setPosY(initialPositionY ?? 50);
      setZoom(initialZoom ?? 100);
      setDownloadError(null);
      setUrlInput("");
    }
  }, [open, initialImageUrl, initialPositionX, initialPositionY, initialZoom]);

  // Handle local file upload
  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/") && !file.name.toLowerCase().endsWith(".gif")) {
      setDownloadError("Please select a valid image file (PNG, JPG, WEBP, AVIF, GIF).");
      return;
    }

    setDownloadError(null);
    const objectUrl = URL.createObjectURL(file);
    setSourceImageUrl(objectUrl);
    setPosX(50);
    setPosY(50);
    setZoom(100);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  // Handle URL download via Tauri reqwest backend
  async function handleDownloadUrl() {
    const trimmed = urlInput.trim();
    if (!trimmed) return;

    setIsDownloading(true);
    setDownloadError(null);

    try {
      // First try native backend for 100% CORS-free download
      const dataUrl = await invoke<string>("download_image", { url: trimmed });
      setSourceImageUrl(dataUrl);
      setPosX(50);
      setPosY(50);
      setZoom(100);
      setUrlInput("");
    } catch (err: any) {
      console.warn("Native download failed, trying web fallback:", err);
      // Fallback: try direct image loading in case running outside Tauri
      try {
        const testImg = new Image();
        testImg.crossOrigin = "anonymous";
        await new Promise((resolve, reject) => {
          testImg.onload = resolve;
          testImg.onerror = reject;
          testImg.src = trimmed;
        });
        setSourceImageUrl(trimmed);
        setPosX(50);
        setPosY(50);
        setZoom(100);
        setUrlInput("");
      } catch {
        setDownloadError("Failed to download image. Please check the URL or try uploading the image file directly.");
      }
    } finally {
      setIsDownloading(false);
    }
  }

  // Drag-to-pan handlers
  function handleMouseDown(e: ReactMouseEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      startPosX: posX,
      startPosY: posY,
    };
  }

  useEffect(() => {
    function handleMouseMove(e: MouseEvent) {
      if (!dragStartRef.current || !viewportRef.current) return;
      const rect = viewportRef.current.getBoundingClientRect();
      const deltaX = e.clientX - dragStartRef.current.x;
      const deltaY = e.clientY - dragStartRef.current.y;

      const scale = zoom / 100;
      const maxDelta = 50 * scale;

      const newPosX = Math.max(0, Math.min(100, dragStartRef.current.startPosX - (deltaX / rect.width) * maxDelta));
      const newPosY = Math.max(0, Math.min(100, dragStartRef.current.startPosY - (deltaY / rect.height) * maxDelta));

      setPosX(Math.round(newPosX));
      setPosY(Math.round(newPosY));
    }

    function handleMouseUp() {
      setIsDragging(false);
      dragStartRef.current = null;
    }

    if (isDragging) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    }
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, zoom]);

  // Export high-resolution 512x512 circular PNG blob
  async function handleApply() {
    if (!sourceImageUrl) {
      setDownloadError("Please select or paste an image first.");
      return;
    }

    setIsExporting(true);

    try {
      const img = new Image();
      img.crossOrigin = "anonymous";

      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("Failed to load source image into canvas"));
        img.src = sourceImageUrl;
      });

      const canvas = document.createElement("canvas");
      canvas.width = 512;
      canvas.height = 512;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Could not get 2D rendering context");

      // 1. Clip into a smooth circle
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.beginPath();
      ctx.arc(256, 256, 256, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();

      // 2. Compute aspect cover dimensions
      const nw = img.naturalWidth || 512;
      const nh = img.naturalHeight || 512;
      const scaleMultiplier = zoom / 100;

      // Base cover scaling to fill 512x512
      const baseScale = Math.max(512 / nw, 512 / nh);
      const drawWidth = nw * baseScale * scaleMultiplier;
      const drawHeight = nh * baseScale * scaleMultiplier;

      // Offset based on posX (0-100) and posY (0-100)
      // When posX = 50%, center is aligned.
      const overflowX = drawWidth - 512;
      const overflowY = drawHeight - 512;
      const drawX = -overflowX * (posX / 100);
      const drawY = -overflowY * (posY / 100);

      ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);

      // 3. Export as PNG Blob
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((b) => {
          if (b) resolve(b);
          else reject(new Error("Canvas toBlob failed"));
        }, "image/png");
      });

      onApply(blob, { positionX: posX, positionY: posY, zoom });
      onOpenChange(false);
    } catch (err: any) {
      console.error("Failed to crop center label:", err);
      setDownloadError(err?.message || "Failed to render circular crop.");
    } finally {
      setIsExporting(false);
    }
  }

  const vinylStyle = getVinylColorStyle(vinylColor);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="center-label-cropper-dialog"
        style={{
          maxWidth: "760px",
          maxHeight: "90vh",
          overflowY: "auto",
          padding: "24px 28px",
          background: "#141416",
          border: "1px solid rgba(255,255,255,0.12)",
          color: "#eee",
        }}
      >
        <DialogTitle style={{ fontSize: "20px", display: "flex", alignItems: "center", gap: "10px" }}>
          <Disc3 size={22} style={{ color: "var(--primary, #00d26a)" }} />
          Vinyl Center Label Media & Circular Crop{sideTitle ? ` — ${sideTitle}` : ""}
        </DialogTitle>
        <DialogDescription style={{ color: "#888", marginTop: "-4px", marginBottom: "18px", fontSize: "13px" }}>
          Upload an image or paste a link to design a custom circular center label{sideTitle ? ` for ${sideTitle}` : ""} of <strong>{albumName}</strong>.
          Pan, zoom, and align the artwork to fit the vinyl record realistically.
        </DialogDescription>

        {/* Media Insertion Bar */}
        <div
          style={{
            background: "rgba(255,255,255,0.03)",
            padding: "14px 16px",
            borderRadius: "8px",
            border: "1px solid rgba(255,255,255,0.08)",
            display: "flex",
            flexDirection: "column",
            gap: "12px",
            marginBottom: "18px",
          }}
        >
          <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
            {/* Upload File Button */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="image/*,.png,.jpg,.jpeg,.webp,.avif,.gif"
              style={{ display: "none" }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              style={{ display: "flex", alignItems: "center", gap: "6px", height: "34px", background: "rgba(255,255,255,0.06)" }}
            >
              <Upload size={14} />
              Upload Image File
            </Button>

            <span style={{ color: "#666", fontSize: "12px" }}>or</span>

            {/* Paste Link Input */}
            <div style={{ display: "flex", flex: 1, minWidth: "260px", gap: "6px" }}>
              <div style={{ position: "relative", flex: 1 }}>
                <LinkIcon
                  size={14}
                  style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "#666" }}
                />
                <input
                  type="url"
                  placeholder="Paste web image link (PNG, JPG, Imgur, etc.)..."
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleDownloadUrl()}
                  style={{
                    width: "100%",
                    height: "34px",
                    paddingLeft: "32px",
                    paddingRight: "10px",
                    borderRadius: "6px",
                    background: "rgba(0,0,0,0.4)",
                    border: "1px solid rgba(255,255,255,0.15)",
                    color: "#fff",
                    fontSize: "12px",
                    outline: "none",
                  }}
                />
              </div>
              <Button
                type="button"
                size="sm"
                onClick={handleDownloadUrl}
                disabled={!urlInput.trim() || isDownloading}
                style={{ height: "34px", fontSize: "12px" }}
              >
                {isDownloading ? (
                  <>
                    <Loader2 size={13} className="animate-spin" style={{ marginRight: "4px" }} />
                    Fetching...
                  </>
                ) : (
                  "Load Link"
                )}
              </Button>
            </div>
          </div>

          {downloadError && (
            <div style={{ color: "#f87171", fontSize: "12px", marginTop: "2px" }}>
              {downloadError}
            </div>
          )}
        </div>

        {/* Cropper Work Area */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 220px", gap: "24px", alignItems: "start" }}>
          {/* Left: Interactive Viewport & Pan/Zoom Controls */}
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            {/* Viewport Frame */}
            <div
              style={{
                position: "relative",
                width: "100%",
                aspectRatio: "1 / 1",
                maxHeight: "340px",
                background: "#0a0a0c",
                borderRadius: "10px",
                overflow: "hidden",
                border: "1px solid rgba(255,255,255,0.1)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                userSelect: "none",
                cursor: sourceImageUrl ? (isDragging ? "grabbing" : "grab") : "default",
              }}
              ref={viewportRef}
              onMouseDown={sourceImageUrl ? handleMouseDown : undefined}
            >
              {sourceImageUrl ? (
                <>
                  {/* The Image inside */}
                  <img
                    ref={imageElementRef}
                    src={sourceImageUrl}
                    alt="Center Label"
                    draggable={false}
                    style={{
                      position: "absolute",
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      objectPosition: `${posX}% ${posY}%`,
                      transform: `scale(${zoom / 100})`,
                      transformOrigin: `${posX}% ${posY}%`,
                      transition: isDragging ? "none" : "transform 0.1s ease-out",
                      pointerEvents: "none",
                    }}
                  />

                  {/* Darkened Outer Vignette Mask (Masks out square to show clear circle) */}
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      pointerEvents: "none",
                      boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.72)",
                      borderRadius: "50%",
                      border: "2px solid rgba(255, 255, 255, 0.4)",
                    }}
                  />

                  {/* Subtle Circular Vinyl Inner Rim Ring */}
                  <div
                    style={{
                      position: "absolute",
                      inset: "1px",
                      pointerEvents: "none",
                      borderRadius: "50%",
                      border: "1px dashed rgba(255, 255, 255, 0.2)",
                    }}
                  />

                  {/* Center Spindle Peg Guide */}
                  <div
                    style={{
                      position: "absolute",
                      left: "50%",
                      top: "50%",
                      transform: "translate(-50%, -50%)",
                      width: "28px",
                      height: "28px",
                      borderRadius: "50%",
                      background: "radial-gradient(circle, #050505 0 35%, #2a2a2a 45%, #d1d5db 70%, #1f2937 100%)",
                      boxShadow: "0 0 0 1px rgba(255,255,255,0.4), 0 2px 6px rgba(0,0,0,0.8)",
                      pointerEvents: "none",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      zIndex: 10,
                    }}
                    title="Center Spindle Hole"
                  >
                    <div
                      style={{
                        width: "8px",
                        height: "8px",
                        borderRadius: "50%",
                        background: "#000",
                        boxShadow: "inset 0 1px 2px rgba(0,0,0,0.9)",
                      }}
                    />
                  </div>

                  {/* Drag prompt badge */}
                  <div
                    style={{
                      position: "absolute",
                      bottom: "10px",
                      left: "50%",
                      transform: "translateX(-50%)",
                      background: "rgba(0,0,0,0.65)",
                      backdropFilter: "blur(4px)",
                      padding: "3px 10px",
                      borderRadius: "12px",
                      fontSize: "11px",
                      color: "#bbb",
                      pointerEvents: "none",
                    }}
                  >
                    Drag to pan • Circle is vinyl label
                  </div>
                </>
              ) : (
                <div style={{ textAlign: "center", color: "#666", padding: "20px" }}>
                  <Disc3 size={42} style={{ margin: "0 auto 10px", opacity: 0.3 }} />
                  <p style={{ margin: 0, fontSize: "13px" }}>Upload an image file or load a link above</p>
                </div>
              )}
            </div>

            {/* Zoom Slider and Controls */}
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginTop: "2px" }}>
              <span style={{ fontSize: "12px", color: "#888", display: "flex", alignItems: "center", gap: "4px" }}>
                <ZoomIn size={14} /> Zoom
              </span>
              <input
                type="range"
                min="100"
                max="300"
                step="5"
                value={zoom}
                disabled={!sourceImageUrl}
                onChange={(e) => setZoom(Number(e.target.value))}
                style={{ flex: 1, accentColor: "var(--primary, #00d26a)", cursor: "pointer" }}
              />
              <span style={{ fontSize: "12px", color: "#aaa", minWidth: "38px", textAlign: "right" }}>
                {zoom}%
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={!sourceImageUrl}
                onClick={() => {
                  setPosX(50);
                  setPosY(50);
                  setZoom(100);
                }}
                style={{ height: "26px", fontSize: "11px", padding: "0 8px" }}
                title="Reset Pan & Zoom"
              >
                <RotateCcw size={12} style={{ marginRight: "4px" }} />
                Reset
              </Button>
            </div>

            {/* Alignment Presets */}
            <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
              <span style={{ fontSize: "11px", color: "#666", marginRight: "4px" }}>Align:</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!sourceImageUrl}
                onClick={() => { setPosX(50); setPosY(50); }}
                style={{ height: "24px", fontSize: "11px", padding: "0 8px" }}
              >
                <AlignCenter size={11} style={{ marginRight: "3px" }} /> Center
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!sourceImageUrl}
                onClick={() => { setPosX(50); setPosY(0); }}
                style={{ height: "24px", fontSize: "11px", padding: "0 8px" }}
              >
                <ArrowUp size={11} style={{ marginRight: "3px" }} /> Top
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!sourceImageUrl}
                onClick={() => { setPosX(50); setPosY(100); }}
                style={{ height: "24px", fontSize: "11px", padding: "0 8px" }}
              >
                <ArrowDown size={11} style={{ marginRight: "3px" }} /> Bottom
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!sourceImageUrl}
                onClick={() => { setPosX(0); setPosY(50); }}
                style={{ height: "24px", fontSize: "11px", padding: "0 8px" }}
              >
                <ArrowLeft size={11} style={{ marginRight: "3px" }} /> Left
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!sourceImageUrl}
                onClick={() => { setPosX(100); setPosY(50); }}
                style={{ height: "24px", fontSize: "11px", padding: "0 8px" }}
              >
                <ArrowRight size={11} style={{ marginRight: "3px" }} /> Right
              </Button>
            </div>
          </div>

          {/* Right: Live Realistic Vinyl Preview */}
          <div
            style={{
              background: "rgba(255,255,255,0.02)",
              padding: "16px",
              borderRadius: "8px",
              border: "1px solid rgba(255,255,255,0.08)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "12px",
            }}
          >
            <div style={{ fontSize: "12px", fontWeight: 600, color: "#ccc", display: "flex", alignItems: "center", gap: "6px" }}>
              <Sparkles size={13} style={{ color: "var(--primary, #00d26a)" }} />
              Live Vinyl Preview
            </div>

            {/* Realistic Vinyl Model */}
            <div
              style={{
                width: "170px",
                height: "170px",
                borderRadius: "50%",
                position: "relative",
                boxShadow: "0 10px 25px rgba(0,0,0,0.8), 0 0 1px rgba(255,255,255,0.2)",
                background:
                  vinylColor && (vinylStyle as any)["--vinyl-bg"]
                    ? (vinylStyle as any)["--vinyl-bg"]
                    : "radial-gradient(circle, #171717 0 2.7%, #090909 3.2% 20%, #171717 20.4% 20.8%, #080808 21.2% 100%)",
                ...vinylStyle,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
              }}
            >
              {/* Conic Light Reflection Sheen */}
              <div
                style={{
                  position: "absolute",
                  inset: "3%",
                  borderRadius: "50%",
                  background:
                    "conic-gradient(from 30deg, transparent, rgba(255,255,255,0.18) 15%, transparent 25%, transparent 48%, rgba(255,255,255,0.14) 58%, transparent 68%)",
                  pointerEvents: "none",
                  zIndex: 2,
                }}
              />

              {/* Micro Grooves */}
              <div
                style={{
                  position: "absolute",
                  inset: "5%",
                  borderRadius: "50%",
                  background: "repeating-radial-gradient(circle, transparent 0 2px, rgba(255,255,255,0.07) 2.5px 3px)",
                  pointerEvents: "none",
                  zIndex: 1,
                }}
              />

              {/* Center Label Area (34% diameter) */}
              <div
                style={{
                  width: "35%",
                  height: "35%",
                  borderRadius: "50%",
                  overflow: "hidden",
                  position: "relative",
                  zIndex: 3,
                  boxShadow: "0 0 0 1px rgba(0,0,0,0.5), inset 0 0 4px rgba(0,0,0,0.4)",
                  background: "#1c1c1e",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {sourceImageUrl ? (
                  <img
                    src={sourceImageUrl}
                    alt=""
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      objectPosition: `${posX}% ${posY}%`,
                      transform: `scale(${zoom / 100})`,
                      transformOrigin: `${posX}% ${posY}%`,
                    }}
                  />
                ) : (
                  <Disc3 size={20} color="#555" />
                )}
              </div>

              {/* Center Spindle Hole */}
              <div
                style={{
                  position: "absolute",
                  width: "8px",
                  height: "8px",
                  borderRadius: "50%",
                  background: "#d8d8d3",
                  boxShadow: "0 0 0 1.5px #111, inset 0 1px 2px #000",
                  zIndex: 4,
                }}
              />
            </div>

            <p style={{ margin: 0, fontSize: "11px", color: "#777", textAlign: "center", lineHeight: "1.3" }}>
              Appears on turntable platter, midnight vinyl, DJ setup & 3D inspection views.
            </p>
          </div>
        </div>

        {/* Footer Actions */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "22px" }}>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={isExporting}
            style={{ color: "#aaa" }}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleApply}
            disabled={!sourceImageUrl || isExporting}
            style={{
              background: "var(--primary, #00d26a)",
              color: "#000",
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            {isExporting ? (
              <>
                <Loader2 size={15} className="animate-spin" />
                Applying...
              </>
            ) : (
              <>
                <Check size={15} />
                Apply Center Label
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
