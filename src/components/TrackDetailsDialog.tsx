import { type ReactNode } from "react";
import type { Track } from "../lib/player";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "./ui/dialog";
import { InteractiveSleeve } from "./InteractiveSleeve";
import { AddToCollectionPicker } from "./AddToCollectionPicker";
import { Button } from "./ui/button";
import { setCustomArtwork } from "../lib/customArtwork";
import { ImagePlus, RefreshCcw } from "lucide-react";

interface Props {
  track: Track | null;
  children: ReactNode;
}

export function TrackDetailsDialog({ track, children }: Props) {
  function handleChangeArtwork() {
    if (!track) return;
    const original = track.originalImageUrl ?? track.imageUrl;
    if (!original) {
      alert("This track has no original artwork to override.");
      return;
    }
    const isCustomized = track.originalImageUrl !== undefined && track.originalImageUrl !== track.imageUrl;
    
    if (isCustomized) {
      const reset = confirm("This track currently has custom artwork. Do you want to reset it to the original?");
      if (reset) {
        setCustomArtwork(original, null);
        return;
      }
    }

    const url = prompt("Enter a new image URL for this album (leave blank to cancel):");
    if (url) {
      setCustomArtwork(original, url);
    }
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button className="artwork-trigger" disabled={!track} aria-label={track ? `Open ${track.name}` : "No track playing"}>
          {children}
        </button>
      </DialogTrigger>
      <DialogContent className="track-detail-dialog">
        <DialogDescription className="visually-hidden">Current track artwork and collection controls</DialogDescription>
        <div className="track-artwork-stage">
          <InteractiveSleeve track={track} />
        </div>
        <div className="track-detail-copy">
          <DialogTitle>{track?.name ?? "Nothing playing"}</DialogTitle>
          <p>{track?.artist}</p>
          <div className="track-detail-actions" style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px' }}>
            {track && <AddToCollectionPicker track={track} />}
            <Button variant="outline" onClick={handleChangeArtwork} disabled={!track} style={{ justifyContent: 'center' }}>
              {track && track.originalImageUrl !== undefined && track.originalImageUrl !== track.imageUrl ? <RefreshCcw size={16} /> : <ImagePlus size={16} />} 
              {track && track.originalImageUrl !== undefined && track.originalImageUrl !== track.imageUrl ? "Reset Artwork" : "Change Artwork"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
