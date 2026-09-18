import { useState, useEffect, useRef, type CSSProperties } from "react";
import { ArrowLeft, PlayCircle, ListPlus, Trash2, ImagePlus, RefreshCcw, Disc3, SlidersHorizontal } from "lucide-react";
import type { Collection } from "../lib/collections";
import { deleteCollection } from "../lib/collections";
import { InteractiveSleeve } from "./InteractiveSleeve";
import { setCustomArtwork } from "../lib/customArtwork";
import { Button } from "./ui/button";
import { mp3Player } from "../lib/mp3Player";
import { getVinylColorStyle } from "../lib/vinylColors";
import { Mp3TracklistEditorDialog } from "./Mp3TracklistEditorDialog";

interface Props {
  record: Collection;
  sourceRect: DOMRect | null;
  onClose: () => void;
  onPlayTrack: (track: any, record: Collection) => void;
  onQueueTrack?: (track: any) => Promise<void>;
  onQueueAlbum?: (tracks: any[]) => void;
  onAnimateRecord?: (record: Collection) => void;
}

export function InlineRecordViewer({ record, sourceRect, onClose, onPlayTrack, onQueueTrack, onQueueAlbum, onAnimateRecord }: Props) {
  const [currentRecord, setCurrentRecord] = useState<Collection>(record);
  const [tracklistEditorOpen, setTracklistEditorOpen] = useState(false);
  const [side, setSide] = useState<"info" | "side-a" | "side-b">("info");
  const [hasOpened, setHasOpened] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCurrentRecord(record);
  }, [record]);

  useEffect(() => {
    if (side !== "info") setHasOpened(true);
  }, [side]);
  
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const scrollParent = el.closest(".dj-page-container") as HTMLElement | null;
    if (scrollParent) {
      const parentRect = scrollParent.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      const targetScrollTop = scrollParent.scrollTop + (elRect.top - parentRect.top) - (parentRect.height - elRect.height) / 2;
      scrollParent.scrollTo({
        top: Math.max(0, targetScrollTop),
        behavior: 'smooth'
      });
    }
  }, [record.id]);
  
  const tracks = currentRecord.tracks || [];
  const sideACount = Math.ceil(tracks.length / 2);
  const sideA = tracks.slice(0, sideACount);
  const sideB = tracks.slice(sideACount);
  
  const currentTracks = side === "side-b" ? sideB : side === "side-a" ? sideA : [];
  const totalDuration = tracks.reduce((acc, t) => acc + (t.durationMs || 0), 0);
  const totalMins = Math.floor(totalDuration / 60000);
  
  const coverTrack = tracks[0] || null;

  function handleChangeArtwork() {
    const original = coverTrack?.originalImageUrl ?? coverTrack?.imageUrl;
    if (!original) {
      alert("This record has no original artwork to override.");
      return;
    }
    const isCustomized = coverTrack?.originalImageUrl !== undefined && coverTrack?.originalImageUrl !== coverTrack?.imageUrl;
    
    if (isCustomized) {
      if (confirm("This record currently has custom artwork. Do you want to reset it to the original?")) {
        setCustomArtwork(original, null);
      }
      return;
    }

    const url = prompt("Enter a new image URL for this album (leave blank to cancel):");
    if (url) {
      setCustomArtwork(original, url);
    }
  }

  function handleDeleteRecord() {
    if (confirm("Are you sure you want to remove this album from your library?")) {
      deleteCollection(record.id);
      onClose();
    }
  }

  async function handleQueueAlbum() {
    if (!tracks.length) return;
    if (onQueueAlbum) {
      onQueueAlbum(tracks);
      return;
    }
    if (!onQueueTrack) return;
    for (const track of tracks) {
      if (track.uri) {
        await onQueueTrack(track);
      }
    }
  }

  function handlePlay(track: any) {
    onPlayTrack(track, currentRecord);
  }

  return (
    <div ref={containerRef} className={`inline-record-viewer state-${side}`}>
      <div className="inline-record-content">
        <div className="inline-record-left">
          <div className="record-info-header fade-in">
            {record.artistImageUrl && <img src={record.artistImageUrl} className="record-artist-pic" alt={record.artist} />}
            <h1 className="record-title">{record.name}</h1>
            <h2 className="record-artist">{record.artist || "Unknown Artist"}</h2>
            <div className="record-meta">
              {record.year && <span>{record.year}</span>}
              <span>{tracks.length} Tracks</span>
              <span>{totalMins} min</span>
              {record.format === "mp3" && (
                <span style={{ color: "var(--primary, #00d26a)", fontWeight: 600 }}>MP3 Record</span>
              )}
            </div>
          </div>
          
          {side === "info" ? (
            <div className="record-info-panel fade-in">
              <p className="record-instruction">Click the sleeve to pull out the record.</p>
                <div style={{ display: 'flex', gap: '10px', marginTop: '20px', alignItems: 'center' }}>
                  <Button onClick={() => handlePlay(tracks[0])} style={{ flex: 1 }}>
                    <PlayCircle size={18} style={{ marginRight: '8px' }} />
                    Play Album
                  </Button>
                  {record.format === "mp3" ? (
                    <Button 
                      variant="outline" 
                      onClick={() => onAnimateRecord && onAnimateRecord(currentRecord)} 
                      style={{ flex: 1, borderColor: "var(--primary, #00d26a)", color: "var(--primary, #00d26a)" }}
                      title="Animate this record on an empty turntable"
                    >
                      <Disc3 size={18} style={{ marginRight: '8px' }} />
                      Animate
                    </Button>
                  ) : (
                    <Button variant="outline" onClick={handleQueueAlbum} style={{ flex: 1 }}>
                      <ListPlus size={18} style={{ marginRight: '8px' }} />
                      Queue Album
                    </Button>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '10px', marginTop: '10px', alignItems: 'center' }}>
                  <Button variant="outline" onClick={handleChangeArtwork} style={{ flex: 1 }}>
                     {coverTrack?.originalImageUrl !== undefined && coverTrack?.originalImageUrl !== coverTrack?.imageUrl ? <RefreshCcw size={16} /> : <ImagePlus size={16} />}
                     {coverTrack?.originalImageUrl !== undefined && coverTrack?.originalImageUrl !== coverTrack?.imageUrl ? "Reset Artwork" : "Change Artwork"}
                  </Button>
                  {currentRecord.format === "mp3" && (
                    <Button variant="outline" onClick={() => setTracklistEditorOpen(true)} style={{ flex: 1 }}>
                      <SlidersHorizontal size={15} style={{ marginRight: '6px' }} />
                      Edit Tracks
                    </Button>
                  )}
                  <Button variant="outline" onClick={handleDeleteRecord} style={{ color: '#ff5555', flex: 1 }}>
                    <Trash2 size={16} style={{ marginRight: '6px' }} />
                    Remove
                  </Button>
                </div>
            </div>
          ) : (
            <div className="record-tracks-panel fade-in">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <h3 style={{ margin: 0 }}>{side === "side-a" ? "Side A" : "Side B"}</h3>
                {currentRecord.format === "mp3" && (
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => setTracklistEditorOpen(true)}
                    style={{ fontSize: '11px', height: '26px', padding: '0 8px', gap: '5px' }}
                    title="Edit track order, flip sides, or reverse tracks"
                  >
                    <SlidersHorizontal size={12} />
                    Edit Tracks
                  </Button>
                )}
              </div>
              <ul className="record-tracklist">
                {currentTracks.map((track, i) => (
                  <li key={i} onClick={() => handlePlay(track)}>
                    <span className="track-number">{side === "side-b" ? sideACount + i + 1 : i + 1}.</span>
                    <span className="track-name">{track.name}</span>
                    <span className="track-duration">
                      {track.durationMs ? `${Math.floor(track.durationMs / 60000)}:${String(Math.floor((track.durationMs % 60000) / 1000)).padStart(2, '0')}` : ""}
                    </span>
                    {onQueueTrack && record.format !== "mp3" && (
                      <ListPlus 
                        className="track-queue-icon" 
                        size={18}
                        onClick={(e) => { e.stopPropagation(); onQueueTrack(track); }} 
                        style={{ marginRight: '8px' }}
                      />
                    )}
                    <PlayCircle className="track-play-icon" />
                  </li>
                ))}
              </ul>
              <p className="record-instruction">Click the record to flip sides, or the sleeve to put it back.</p>
            </div>
          )}
        </div>

        <div className="inline-record-right">
          <div className="record-stage">
             <div className="record-sleeve-container" onClick={() => setSide(side === "info" ? "side-a" : "info")}>
               <InteractiveSleeve track={coverTrack} className="record-sleeve-oversize" />
             </div>
             
             <div 
               className={`record-vinyl-container inline-vinyl ${side !== "info" ? "is-out" : (hasOpened ? "is-in" : "")}`}
               onClick={() => {
                 if (side !== "info") {
                   setSide(side === "side-a" ? "side-b" : "side-a");
                 }
               }}
             >
               <div 
                 className={`record-vinyl-disc ${side === "side-b" ? "is-flipped" : ""}`}
                 style={getVinylColorStyle(currentRecord.customization?.vinylColor)}
               >
                 <div className="record-vinyl-grooves record-vinyl-grooves-a"></div>
                 <div className="record-vinyl-grooves record-vinyl-grooves-b"></div>
                 <div 
                   className="record-vinyl-label record-vinyl-label-a" 
                   style={coverTrack?.imageUrl ? { backgroundImage: `url(${coverTrack.imageUrl})` } : {}}
                 >
                    <div className="record-vinyl-label-text">
                      <small>Side A</small>
                      <ul>{sideA.slice(0, 5).map(t => <li key={t.uri}>{t.name}</li>)}</ul>
                    </div>
                 </div>
                 <div 
                   className="record-vinyl-label record-vinyl-label-b" 
                   style={coverTrack?.imageUrl ? { backgroundImage: `url(${coverTrack.imageUrl})` } : {}}
                 >
                    <div className="record-vinyl-label-text">
                      <small>Side B</small>
                      <ul>{sideB.slice(0, 5).map(t => <li key={t.uri}>{t.name}</li>)}</ul>
                    </div>
                 </div>
               </div>
             </div>
          </div>
        </div>
        
        <button className="inline-close-btn" onClick={onClose}>
           Close Viewer
        </button>
      </div>

      {tracklistEditorOpen && (
        <Mp3TracklistEditorDialog
          open={tracklistEditorOpen}
          onOpenChange={setTracklistEditorOpen}
          record={currentRecord}
          onSaved={(updatedTracks) => {
            setCurrentRecord((prev) => ({ ...prev, tracks: updatedTracks }));
          }}
        />
      )}
    </div>
  );
}
