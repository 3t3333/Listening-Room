import { useState, useEffect, type DragEvent } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "./ui/dialog";
import { Button } from "./ui/button";
import { 
  GripVertical, 
  ArrowLeftRight, 
  ArrowUpDown, 
  RotateCcw, 
  Check, 
  ChevronUp, 
  ChevronDown, 
  Disc3, 
  RotateCw,
  Edit2,
  CheckSquare
} from "lucide-react";
import type { Track } from "../lib/player";
import type { Collection } from "../lib/collections";
import { updateCollectionTracks } from "../lib/collections";
import { mp3Player } from "../lib/mp3Player";

export interface Mp3TracklistEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  record: Collection;
  onSaved?: (updatedTracks: Track[]) => void;
}

export function Mp3TracklistEditorDialog({
  open,
  onOpenChange,
  record,
  onSaved,
}: Mp3TracklistEditorDialogProps) {
  const [draftTracks, setDraftTracks] = useState<Track[]>([]);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // In-line title editing state
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingTitle, setEditingTitle] = useState<string>("");

  useEffect(() => {
    if (open) {
      setDraftTracks(record.tracks ? [...record.tracks] : []);
      setEditingIndex(null);
      setEditingTitle("");
      setDraggedIndex(null);
      setDragOverIndex(null);
    }
  }, [open, record.tracks]);

  const sideACount = Math.ceil(draftTracks.length / 2);
  const sideA = draftTracks.slice(0, sideACount);
  const sideB = draftTracks.slice(sideACount);

  const originalAvailable = Boolean(
    record.originalTracks && record.originalTracks.length === draftTracks.length
  );

  const isModifiedFromOriginal = originalAvailable
    ? draftTracks.some((t, idx) => {
        const orig = record.originalTracks?.[idx];
        return (t as any).audioId !== (orig as any)?.audioId || t.name !== orig?.name;
      })
    : false;

  const isModifiedFromInitial = record.tracks
    ? draftTracks.some((t, idx) => {
        const initial = record.tracks[idx];
        return (t as any).audioId !== (initial as any)?.audioId || t.name !== initial?.name;
      })
    : false;

  function moveTrack(fromIndex: number, toIndex: number) {
    if (toIndex < 0 || toIndex >= draftTracks.length || fromIndex === toIndex) return;
    const next = [...draftTracks];
    const [item] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, item);
    setDraftTracks(next);
  }

  // Drag & drop handlers
  function handleDragStart(e: DragEvent<HTMLDivElement>, index: number) {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(index));
  }

  function handleDragOver(e: DragEvent<HTMLDivElement>, index: number) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverIndex !== index) {
      setDragOverIndex(index);
    }
  }

  function handleDrop(e: DragEvent<HTMLDivElement>, targetIndex: number) {
    e.preventDefault();
    if (draggedIndex !== null && draggedIndex !== targetIndex) {
      moveTrack(draggedIndex, targetIndex);
    }
    setDraggedIndex(null);
    setDragOverIndex(null);
  }

  function handleDragEnd() {
    setDraggedIndex(null);
    setDragOverIndex(null);
  }

  // Quick reverse / reorder actions
  function handleFlipSides() {
    if (draftTracks.length < 2) return;
    const mid = Math.ceil(draftTracks.length / 2);
    const a = draftTracks.slice(0, mid);
    const b = draftTracks.slice(mid);
    setDraftTracks([...b, ...a]);
  }

  function handleReverseAll() {
    if (draftTracks.length < 2) return;
    setDraftTracks([...draftTracks].reverse());
  }

  function handleReverseSideA() {
    if (sideA.length < 2) return;
    const reversedA = [...sideA].reverse();
    setDraftTracks([...reversedA, ...sideB]);
  }

  function handleReverseSideB() {
    if (sideB.length < 2) return;
    const reversedB = [...sideB].reverse();
    setDraftTracks([...sideA, ...reversedB]);
  }

  function handleResetToOriginal() {
    if (record.originalTracks && record.originalTracks.length > 0) {
      setDraftTracks([...record.originalTracks]);
    }
  }

  // Inline editing
  function startEditing(index: number, currentName: string) {
    setEditingIndex(index);
    setEditingTitle(currentName);
  }

  function saveEditing() {
    if (editingIndex !== null && editingTitle.trim()) {
      const next = [...draftTracks];
      next[editingIndex] = { ...next[editingIndex], name: editingTitle.trim() };
      setDraftTracks(next);
    }
    setEditingIndex(null);
    setEditingTitle("");
  }

  function cancelEditing() {
    setEditingIndex(null);
    setEditingTitle("");
  }

  function handleSave() {
    updateCollectionTracks(record.id, draftTracks);
    mp3Player.updateCollectionQueue(draftTracks);
    if (onSaved) onSaved(draftTracks);
    onOpenChange(false);
  }

  const formatDuration = (ms?: number | null) => {
    if (!ms) return "";
    const totalSecs = Math.floor(ms / 1000);
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${mins}:${String(secs).padStart(2, "0")}`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="mp3-tracklist-dialog-content">
        <div className="tracklist-dialog-header">
          <div className="tracklist-dialog-title-row">
            <div className="tracklist-dialog-art">
              {record.tracks?.[0]?.imageUrl ? (
                <img src={record.tracks[0].imageUrl} alt={record.name} />
              ) : (
                <Disc3 size={28} />
              )}
            </div>
            <div>
              <DialogTitle className="tracklist-dialog-title">
                Edit Tracklist & Vinyl Sides
              </DialogTitle>
              <DialogDescription className="tracklist-dialog-desc">
                Drag rows to reorder tracks, flip sides, reverse playback sequence, or restore the original import order.
              </DialogDescription>
            </div>
          </div>

          {/* Quick Action Toolbar */}
          <div className="tracklist-quick-actions">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleFlipSides}
              title="Swap Side A and Side B so Side B plays first on the vinyl disc"
              className="tracklist-action-pill"
            >
              <ArrowLeftRight size={14} style={{ marginRight: 6 }} />
              Flip Sides (A ⇄ B)
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleReverseAll}
              title="Reverse the entire album sequence from start to finish"
              className="tracklist-action-pill"
            >
              <ArrowUpDown size={14} style={{ marginRight: 6 }} />
              Reverse All
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleReverseSideA}
              title="Reverse only tracks on Side A"
              className="tracklist-action-pill"
              disabled={sideA.length < 2}
            >
              <RotateCcw size={14} style={{ marginRight: 6 }} />
              Reverse Side A
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleReverseSideB}
              title="Reverse only tracks on Side B"
              className="tracklist-action-pill"
              disabled={sideB.length < 2}
            >
              <RotateCw size={14} style={{ marginRight: 6 }} />
              Reverse Side B
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleResetToOriginal}
              title="Restore original track order from import"
              className="tracklist-action-pill reset-pill"
              disabled={!originalAvailable || !isModifiedFromOriginal}
            >
              <RotateCcw size={14} style={{ marginRight: 6 }} />
              Reset Original
            </Button>
          </div>
        </div>

        {/* Tracks List with Side A and Side B partitions */}
        <div className="tracklist-scroll-area">
          {/* Side A Header */}
          <div className="side-section-header side-a-header">
            <span className="side-badge">Side A</span>
            <span className="side-meta">{sideA.length} Tracks • First Half</span>
          </div>

          <div className="tracklist-draggable-list">
            {draftTracks.map((track, index) => {
              const isSideBStart = index === sideACount && sideB.length > 0;
              const isSideA = index < sideACount;
              const sideTrackNumber = isSideA ? index + 1 : index - sideACount + 1;
              const sideLetter = isSideA ? "A" : "B";
              const isBeingDragged = draggedIndex === index;
              const isDragOver = dragOverIndex === index && draggedIndex !== index;
              const isEditing = editingIndex === index;

              return (
                <div key={(track as any).audioId || track.uri || index} className="tracklist-item-wrapper">
                  {/* Side Divider Break if beginning Side B */}
                  {isSideBStart && (
                    <div className="side-section-divider">
                      <div className="divider-line" />
                      <div className="divider-badge">
                        <Disc3 size={15} style={{ marginRight: 6 }} />
                        <span>Side B ({sideB.length} Tracks • Flip Vinyl)</span>
                      </div>
                      <div className="divider-line" />
                    </div>
                  )}

                  <div
                    className={`tracklist-row ${isBeingDragged ? "is-dragging" : ""} ${
                      isDragOver ? "is-drag-over" : ""
                    }`}
                    draggable={!isEditing}
                    onDragStart={(e) => handleDragStart(e, index)}
                    onDragOver={(e) => handleDragOver(e, index)}
                    onDrop={(e) => handleDrop(e, index)}
                    onDragEnd={handleDragEnd}
                  >
                    <div className="tracklist-drag-handle" title="Drag to reorder">
                      <GripVertical size={16} />
                    </div>

                    <span className="tracklist-side-index">
                      {sideLetter}{sideTrackNumber}
                    </span>

                    <div className="tracklist-title-box">
                      {isEditing ? (
                        <div className="tracklist-edit-row">
                          <input
                            type="text"
                            value={editingTitle}
                            onChange={(e) => setEditingTitle(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") saveEditing();
                              if (e.key === "Escape") cancelEditing();
                            }}
                            autoFocus
                            className="tracklist-inline-input"
                          />
                          <button
                            type="button"
                            className="tracklist-save-btn"
                            onClick={saveEditing}
                            title="Save title"
                          >
                            <CheckSquare size={16} />
                          </button>
                        </div>
                      ) : (
                        <span
                          className="tracklist-name"
                          onDoubleClick={() => startEditing(index, track.name)}
                          title="Double-click to rename"
                        >
                          {track.name}
                        </span>
                      )}
                    </div>

                    <span className="tracklist-duration">
                      {formatDuration(track.durationMs)}
                    </span>

                    {/* Quick Move Buttons */}
                    <div className="tracklist-actions">
                      <button
                        type="button"
                        className="tracklist-icon-btn"
                        onClick={() => startEditing(index, track.name)}
                        title="Rename track"
                      >
                        <Edit2 size={13} />
                      </button>
                      <button
                        type="button"
                        className="tracklist-icon-btn"
                        onClick={() => moveTrack(index, index - 1)}
                        disabled={index === 0}
                        title="Move track up"
                      >
                        <ChevronUp size={15} />
                      </button>
                      <button
                        type="button"
                        className="tracklist-icon-btn"
                        onClick={() => moveTrack(index, index + 1)}
                        disabled={index === draftTracks.length - 1}
                        title="Move track down"
                      >
                        <ChevronDown size={15} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="tracklist-dialog-footer">
          <div className="tracklist-footer-stats">
            <span>{draftTracks.length} tracks</span>
            {isModifiedFromInitial && (
              <span className="unsaved-badge">• Unsaved Changes</span>
            )}
          </div>
          <div className="tracklist-footer-btns">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              className="tracklist-save-btn-primary"
            >
              <Check size={16} style={{ marginRight: 6 }} />
              Apply & Save
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
