import { Plus } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { addTrackToCollection, isTrackCollected } from "../lib/collections";
import type { Track } from "../lib/spotify";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "./ui/dialog";
import { InteractiveSleeve } from "./InteractiveSleeve";

interface Props {
  track: Track | null;
  children: ReactNode;
}

export function TrackDetailsDialog({ track, children }: Props) {
  const [added, setAdded] = useState(() => track ? isTrackCollected(track) : false);

  useEffect(() => {
    setAdded(track ? isTrackCollected(track) : false);
  }, [track]);

  function addTrack() {
    if (!track) return;
    addTrackToCollection(track);
    setAdded(true);
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
          <Button onClick={addTrack} disabled={!track || added}>
            {!added && <Plus size={16} />}{added ? "Added to My Collection" : "Add to collection"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
