import { useState, useEffect, useRef, type MouseEvent as ReactMouseEvent } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "./ui/dialog";
import { Button } from "./ui/button";
import { Crop, Move, ZoomIn, RotateCcw, Check, ArrowUp, ArrowDown, AlignCenter, Maximize2, Sparkles } from "lucide-react";
import { isVideoMedia } from "../lib/liveWallpaper";

export interface BackgroundFramingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  imageUrl: string | null;
  initialPositionX?: number;
  initialPositionY?: number;
  initialFit?: "cover" | "contain";
  initialZoom?: number;
  onSave: (framing: {
    positionX: number;
    positionY: number;
    fit: "cover" | "contain";
    zoom: number;
  }) => void;
  title?: string;
  description?: string;
}

export function BackgroundFramingDialog({
  open,
  onOpenChange,
  imageUrl,
  initialPositionX = 50,
  initialPositionY = 50,
  initialFit = "cover",
  initialZoom = 100,
  onSave,
  title = "Crop & Framing",
  description = "Choose what part of the photo fits the screen and adjust framing for portrait or landscape displays.",
}: BackgroundFramingDialogProps) {
  const [posX, setPosX] = useState(initialPositionX);
  const [posY, setPosY] = useState(initialPositionY);
  const [fit, setFit] = useState<"cover" | "contain">(initialFit);
  const [zoom, setZoom] = useState(initialZoom);
  const [isDragging, setIsDragging] = useState(false);
  const [imageRatio, setImageRatio] = useState<"portrait" | "landscape" | "square" | null>(null);

  const viewportRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<{ x: number; y: number; startPosX: number; startPosY: number } | null>(null);

  // Sync state whenever the dialog opens with initial values
  useEffect(() => {
    if (open) {
      setPosX(initialPositionX ?? 50);
      setPosY(initialPositionY ?? 50);
      setFit(initialFit ?? "cover");
      setZoom(initialZoom ?? 100);
    }
  }, [open, initialPositionX, initialPositionY, initialFit, initialZoom]);

  // Detect media aspect ratio when loaded
  useEffect(() => {
    if (!imageUrl) {
      setImageRatio(null);
      return;
    }
    const isVideo = isVideoMedia(imageUrl);
    if (isVideo) {
      const v = document.createElement("video");
      v.preload = "metadata";
      v.onloadedmetadata = () => {
        const ratio = (v.videoWidth || 16) / (v.videoHeight || 9);
        if (ratio < 0.85) setImageRatio("portrait");
        else if (ratio > 1.15) setImageRatio("landscape");
        else setImageRatio("square");
      };
      v.src = imageUrl;
    } else {
      const img = new Image();
      img.src = imageUrl;
      img.onload = () => {
        const ratio = img.naturalWidth / img.naturalHeight;
        if (ratio < 0.85) setImageRatio("portrait");
        else if (ratio > 1.15) setImageRatio("landscape");
        else setImageRatio("square");
      };
    }
  }, [imageUrl]);

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

      // Invert delta because dragging the photo down reveals the top (lowers positionY)
      const pctDeltaX = (deltaX / rect.width) * 100;
      const pctDeltaY = (deltaY / rect.height) * 100;

      const newX = Math.round(Math.max(0, Math.min(100, dragStartRef.current.startPosX - pctDeltaX)));
      const newY = Math.round(Math.max(0, Math.min(100, dragStartRef.current.startPosY - pctDeltaY)));

      setPosX(newX);
      setPosY(newY);
    }

    function handleMouseUp() {
      if (dragStartRef.current) {
        dragStartRef.current = null;
        setIsDragging(false);
      }
    }

    if (isDragging) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    }
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging]);

  function handleReset() {
    setPosX(50);
    setPosY(50);
    setFit("cover");
    setZoom(100);
  }

  function handleApply() {
    onSave({ positionX: posX, positionY: posY, fit, zoom });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="framing-dialog-content">
        <DialogTitle className="framing-dialog-title">
          <Crop size={20} style={{ color: "var(--primary, #00d26a)" }} />
          <span>{title}</span>
        </DialogTitle>
        <DialogDescription className="framing-dialog-desc">
          {description}
        </DialogDescription>

        <div className="framing-dialog-body">
          {/* Left Column: Interactive 16:9 Viewport Stage */}
          <div className="framing-stage-container">
            <div className="framing-viewport-header">
              <span className="framing-viewport-tag">
                <Maximize2 size={12} style={{ marginRight: '4px' }} />
                16:9 Desktop Display Preview
              </span>
              <span className="framing-drag-hint">
                <Move size={12} style={{ marginRight: '4px' }} />
                Click & drag inside to pan
              </span>
            </div>

            {/* 16:9 Screen Frame */}
            <div 
              ref={viewportRef}
              className={`framing-viewport ${isDragging ? "is-dragging" : ""}`}
              onMouseDown={handleMouseDown}
            >
              {/* Blurred backdrop for contain mode */}
              {fit === "contain" && imageUrl && (
                isVideoMedia(imageUrl) ? (
                  <video
                    src={imageUrl}
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
                    className="framing-viewport-ambient"
                    style={{
                      position: "absolute",
                      inset: "-15%",
                      width: "130%",
                      height: "130%",
                      objectFit: "cover",
                      objectPosition: `${posX}% ${posY}%`,
                      filter: "blur(32px) brightness(0.65) saturate(1.2)",
                      pointerEvents: "none",
                    }}
                  />
                ) : (
                  <img
                    src={imageUrl}
                    alt=""
                    className="framing-viewport-ambient"
                    style={{
                      position: "absolute",
                      inset: "-15%",
                      width: "130%",
                      height: "130%",
                      objectFit: "cover",
                      objectPosition: `${posX}% ${posY}%`,
                      filter: "blur(32px) brightness(0.65) saturate(1.2)",
                      pointerEvents: "none",
                    }}
                  />
                )
              )}

              {/* Main Photo or Video */}
              {imageUrl ? (
                isVideoMedia(imageUrl) ? (
                  <video
                    src={imageUrl}
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
                    className="framing-viewport-img"
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: fit,
                      objectPosition: `${posX}% ${posY}%`,
                      transform: zoom > 100 ? `scale(${zoom / 100})` : undefined,
                      transformOrigin: `${posX}% ${posY}%`,
                      userSelect: "none",
                      pointerEvents: "none",
                    }}
                  />
                ) : (
                  <img
                    src={imageUrl}
                    alt="Framing preview"
                    className="framing-viewport-img"
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: fit,
                      objectPosition: `${posX}% ${posY}%`,
                      transform: zoom > 100 ? `scale(${zoom / 100})` : undefined,
                      transformOrigin: `${posX}% ${posY}%`,
                      userSelect: "none",
                      pointerEvents: "none",
                    }}
                    draggable={false}
                  />
                )
              ) : (
                <div className="framing-empty-state">No image selected</div>
              )}

              {/* Rule of Thirds Guide Grid */}
              <div className="framing-grid-overlay">
                <div className="grid-line grid-line-h1" />
                <div className="grid-line grid-line-h2" />
                <div className="grid-line grid-line-v1" />
                <div className="grid-line grid-line-v2" />
              </div>

              {/* Center Focal Indicator Reticle */}
              <div 
                className="framing-reticle"
                style={{
                  left: `${posX}%`,
                  top: `${posY}%`,
                }}
              >
                <div className="reticle-dot" />
                <div className="reticle-ring" />
              </div>

              {/* Coordinates Badge */}
              <div className="framing-coords-badge">
                X: {posX}% &nbsp;|&nbsp; Y: {posY}% &nbsp;|&nbsp; {zoom}%
              </div>
            </div>

            {/* Image Aspect Detection Note */}
            {imageRatio && (
              <div className="framing-aspect-note">
                <Sparkles size={13} style={{ color: '#00d26a', flexShrink: 0 }} />
                <span>
                  {imageRatio === "portrait" && "Portrait photo detected: Use 'Top (Face)' preset or drag upward so faces and headroom aren't cut off."}
                  {imageRatio === "landscape" && "Landscape photo detected: Adjust horizontal or vertical framing to fit the visual center."}
                  {imageRatio === "square" && "Square album art detected: Choose between filling the screen or containing the entire cover."}
                </span>
              </div>
            )}
          </div>

          {/* Right Column: Controls & Presets */}
          <div className="framing-controls-sidebar">
            {/* 1. Fit Mode Toggle */}
            <div className="framing-control-group">
              <label className="framing-group-label">Display Fit Mode</label>
              <div className="framing-fit-toggle">
                <button
                  type="button"
                  className={`framing-fit-btn ${fit === "cover" ? "active" : ""}`}
                  onClick={() => setFit("cover")}
                >
                  <strong>Fill Screen (Cover)</strong>
                  <small>Crops edges to fill whole monitor</small>
                </button>
                <button
                  type="button"
                  className={`framing-fit-btn ${fit === "contain" ? "active" : ""}`}
                  onClick={() => setFit("contain")}
                >
                  <strong>Full Image (Contain)</strong>
                  <small>Entire photo with ambient glow</small>
                </button>
              </div>
            </div>

            {/* 2. Quick Portrait & Landscape Presets */}
            <div className="framing-control-group">
              <label className="framing-group-label">Quick Framing Presets</label>
              <div className="framing-presets-grid">
                <button
                  type="button"
                  className={`framing-preset-chip ${posY === 0 ? "active" : ""}`}
                  onClick={() => { setPosY(0); setPosX(50); }}
                  title="Focus on top of image (heads/faces)"
                >
                  <ArrowUp size={13} />
                  <span>Top (Face)</span>
                </button>
                <button
                  type="button"
                  className={`framing-preset-chip ${posY === 25 ? "active" : ""}`}
                  onClick={() => { setPosY(25); setPosX(50); }}
                  title="Upper third rule"
                >
                  <span>Upper ⅓</span>
                </button>
                <button
                  type="button"
                  className={`framing-preset-chip ${posY === 50 && posX === 50 ? "active" : ""}`}
                  onClick={() => { setPosY(50); setPosX(50); }}
                  title="Center alignment"
                >
                  <AlignCenter size={13} />
                  <span>Center</span>
                </button>
                <button
                  type="button"
                  className={`framing-preset-chip ${posY === 75 ? "active" : ""}`}
                  onClick={() => { setPosY(75); setPosX(50); }}
                  title="Lower third rule"
                >
                  <span>Lower ⅓</span>
                </button>
                <button
                  type="button"
                  className={`framing-preset-chip ${posY === 100 ? "active" : ""}`}
                  onClick={() => { setPosY(100); setPosX(50); }}
                  title="Bottom alignment"
                >
                  <ArrowDown size={13} />
                  <span>Bottom</span>
                </button>
              </div>
            </div>

            {/* 3. Precision Sliders */}
            <div className="framing-control-group">
              <label className="framing-group-label">
                <span>Vertical Framing (Y)</span>
                <span className="framing-val-readout">
                  {posY === 0 ? "Top (0%)" : posY === 50 ? "Center (50%)" : posY === 100 ? "Bottom (100%)" : `${posY}%`}
                </span>
              </label>
              <div className="framing-slider-track">
                <span className="slider-edge-label">Top</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={posY}
                  onChange={(e) => setPosY(Number(e.target.value))}
                  className="framing-range-slider"
                />
                <span className="slider-edge-label">Bottom</span>
              </div>
            </div>

            <div className="framing-control-group">
              <label className="framing-group-label">
                <span>Horizontal Framing (X)</span>
                <span className="framing-val-readout">
                  {posX === 0 ? "Left (0%)" : posX === 50 ? "Center (50%)" : posX === 100 ? "Right (100%)" : `${posX}%`}
                </span>
              </label>
              <div className="framing-slider-track">
                <span className="slider-edge-label">Left</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={posX}
                  onChange={(e) => setPosX(Number(e.target.value))}
                  className="framing-range-slider"
                />
                <span className="slider-edge-label">Right</span>
              </div>
            </div>

            <div className="framing-control-group">
              <label className="framing-group-label">
                <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <ZoomIn size={13} />
                  <span>Zoom / Scale</span>
                </span>
                <span className="framing-val-readout">{zoom}%</span>
              </label>
              <div className="framing-slider-track">
                <span className="slider-edge-label">100%</span>
                <input
                  type="range"
                  min="100"
                  max="200"
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                  className="framing-range-slider"
                />
                <span className="slider-edge-label">200%</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="framing-dialog-footer">
          <Button variant="ghost" size="sm" onClick={handleReset} style={{ color: "#aaa" }}>
            <RotateCcw size={14} style={{ marginRight: '6px' }} />
            Reset
          </Button>

          <div style={{ display: 'flex', gap: '10px' }}>
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleApply} style={{ background: "var(--primary, #00d26a)", color: "#000", fontWeight: 600 }}>
              <Check size={14} style={{ marginRight: '6px' }} />
              Apply Framing
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
