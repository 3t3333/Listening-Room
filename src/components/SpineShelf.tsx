import { useEffect, useState, useRef } from "react";
import { getCollections, type Collection } from "../lib/collections";
import { Disc3 } from "lucide-react";
import type { DjTurntableTheme } from "../hooks/useDjSettings";

export function SpineShelf({ 
  theme = "dark", 
  onInspect 
}: { 
  theme?: DjTurntableTheme; 
  onInspect: (record: Collection, rect: DOMRect) => void; 
}) {
  const [collections, setCollections] = useState<Collection[]>([]);

  useEffect(() => {
    function refreshShelf() {
      setCollections(getCollections().filter(c => c.type === "record"));
    }
    refreshShelf();
    window.addEventListener("collections:changed", refreshShelf);
    return () => window.removeEventListener("collections:changed", refreshShelf);
  }, []);

  // Organize records into shelves (up to 36 per shelf bar)
  const SHELF_CAPACITY = 36;
  const shelves: Collection[][] = [];
  for (let i = 0; i < collections.length; i += SHELF_CAPACITY) {
    shelves.push(collections.slice(i, i + SHELF_CAPACITY));
  }
  if (shelves.length === 0) {
    shelves.push([]);
  }

  return (
    <div className={`spine-shelf-container dj-theme-${theme}`}>
      {shelves.map((shelfRecords, idx) => (
        <div key={idx} className={`spine-shelf-bar dj-theme-${theme}`}>
          {shelfRecords.map(col => (
            <SpineRecord key={col.id} collection={col} onInspect={onInspect} />
          ))}
        </div>
      ))}
    </div>
  );
}

function SpineRecord({ collection, onInspect }: { collection: Collection, onInspect: (record: Collection, rect: DOMRect) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const track = collection.tracks?.[0];
  if (!track) return null;

  return (
    <div 
      className="spine-record-wrapper" 
      ref={ref}
      onClick={() => {
        if (ref.current) {
          onInspect(collection, ref.current.getBoundingClientRect());
        }
      }}
    >
      <div 
        className="spine-record-card"
        style={track.imageUrl ? ({ '--album-art': `url("${track.imageUrl.replace(/"/g, '\\"')}")` } as React.CSSProperties) : undefined}
      >
        <span className="spine-record-depth" />
        <span className="spine-record-edge spine-edge-top" />
        <span className="spine-record-edge spine-edge-left" />
        <span className="spine-record-edge spine-edge-right" />
        <span className="spine-record-edge spine-edge-bottom" />
        {track.imageUrl ? <img src={track.imageUrl} alt="" decoding="async" draggable={false} /> : <div className="spine-no-art"><Disc3 /></div>}
        <span className="spine-record-plastic" />
        <span className="spine-record-shine" />
      </div>
      <div className="spine-record-tooltip">
         {track.imageUrl && <img src={track.imageUrl} alt="" className="spine-tooltip-art" />}
         <div className="spine-record-tooltip-text">
           <strong>{collection.name}</strong>
           <small>{collection.artist}</small>
         </div>
      </div>
    </div>
  );
}
