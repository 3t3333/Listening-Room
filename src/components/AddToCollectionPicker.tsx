import { Check, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { addTrackToCollection, getCollections, isTrackInCollection } from "../lib/collections";
import type { Track } from "../lib/player";
import { Button } from "./ui/button";

interface Props {
  track: Track;
  onAdd?: () => void;
}

export function AddToCollectionPicker({ track, onAdd }: Props) {
  const [open, setOpen] = useState(false);
  const [collections, setCollections] = useState(getCollections);

  useEffect(() => {
    const handleCollectionsChanged = () => setCollections(getCollections());
    window.addEventListener("collections:changed", handleCollectionsChanged);
    return () => window.removeEventListener("collections:changed", handleCollectionsChanged);
  }, []);

  if (open) {
    const available = collections.filter(c => c.id !== "recently-played");
    
    return (
      <div className="collection-picker">
        <h4 className="collection-picker-title">Select Collection</h4>
        <div className="collection-picker-list">
          {available.map(c => {
            const added = isTrackInCollection(track, c.id);
            return (
              <button 
                key={c.id} 
                className="collection-picker-item" 
                onClick={(e) => { 
                  e.stopPropagation();
                  if (!added) {
                    addTrackToCollection(track, c.id); 
                    if (onAdd) onAdd();
                  }
                  setOpen(false); 
                }}
              >
                {c.name} {added && <Check size={14} />}
              </button>
            );
          })}
        </div>
        <Button variant="outline" onClick={(e) => { e.stopPropagation(); setOpen(false); }} className="collection-picker-cancel">
          Cancel
        </Button>
      </div>
    );
  }

  return (
    <Button onClick={(e) => { e.stopPropagation(); setOpen(true); }} disabled={!track}>
      <Plus size={16} /> Add to collection
    </Button>
  );
}
