import { useState, useEffect, useRef, type CSSProperties } from "react";
import { ArrowLeft, PlayCircle, ListPlus, Trash2, ImagePlus, RefreshCcw } from "lucide-react";
import type { Collection } from "../lib/collections";
import { deleteCollection } from "../lib/collections";
import { InteractiveSleeve } from "./InteractiveSleeve";
import { setCustomArtwork } from "../lib/customArtwork";
import { Button } from "./ui/button";

interface Props {
  record: Collection;
  sourceRect: DOMRect | null;
  onClose: () => void;
  onPlayTrack: (track: any, record: Collection) => void;
  onQueueTrack?: (track: any) => Promise<void>;
  onQueueAlbum?: (tracks: any[]) => void;
}

export function InlineRecordViewer({ record, sourceRect, onClose, onPlayTrack, onQueueTrack, onQueueAlbum }: Props) {
  const [side, setSide] = useState<"info" | "side-a" | "side-b">("info");
  const [hasOpened, setHasOpened] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (side !== "info") setHasOpened(true);
  }, [side]);
  
  useEffect(() => {
    containerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [record.id]);
  
  const tracks = record.tracks || [];
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
            </div>
          </div>
          
          {side === "info" ? (
            <div className="record-info-panel fade-in">
              <p className="record-instruction">Click the sleeve to pull out the record.</p>
                <div style={{ display: 'flex', gap: '10px', marginTop: '20px', alignItems: 'center' }}>
                  <Button onClick={() => onPlayTrack(tracks[0], record)} style={{ flex: 1 }}>
                    <PlayCircle size={18} style={{ marginRight: '8px' }} />
                    Play Album
                  </Button>
                  <Button variant="outline" onClick={handleQueueAlbum} style={{ flex: 1 }}>
                    <ListPlus size={18} style={{ marginRight: '8px' }} />
                    Queue Album
                  </Button>
                </div>
                <div style={{ display: 'flex', gap: '10px', marginTop: '10px', alignItems: 'center' }}>
                  <Button variant="outline" onClick={handleChangeArtwork} style={{ flex: 1 }}>
                     {coverTrack?.originalImageUrl !== undefined && coverTrack?.originalImageUrl !== coverTrack?.imageUrl ? <RefreshCcw size={16} /> : <ImagePlus size={16} />}
                     {coverTrack?.originalImageUrl !== undefined && coverTrack?.originalImageUrl !== coverTrack?.imageUrl ? "Reset Artwork" : "Change Artwork"}
                  </Button>
                  <Button variant="outline" onClick={handleDeleteRecord} style={{ color: '#ff5555', flex: 1 }}>
                    <Trash2 size={16} style={{ marginRight: '6px' }} />
                    Remove
                  </Button>
                </div>
            </div>
          ) : (
            <div className="record-tracks-panel fade-in">
              <h3>{side === "side-a" ? "Side A" : "Side B"}</h3>
              <ul className="record-tracklist">
                {currentTracks.map((track, i) => (
                  <li key={i} onClick={() => onPlayTrack(track, record)}>
                    <span className="track-number">{side === "side-b" ? sideACount + i + 1 : i + 1}.</span>
                    <span className="track-name">{track.name}</span>
                    <span className="track-duration">
                      {track.durationMs ? `${Math.floor(track.durationMs / 60000)}:${String(Math.floor((track.durationMs % 60000) / 1000)).padStart(2, '0')}` : ""}
                    </span>
                    {onQueueTrack && (
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
               <div className={`record-vinyl-disc ${side === "side-b" ? "is-flipped" : ""}`}>
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
    </div>
  );
}
