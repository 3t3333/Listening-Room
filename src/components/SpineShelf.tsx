import { useEffect, useState, useRef } from "react";
import { getCollections, type Collection } from "../lib/collections";
import { Disc3 } from "lucide-react";

export function SpineShelf({ onInspect }: { onInspect: (record: Collection, rect: DOMRect) => void }) {
  const [collections, setCollections] = useState<Collection[]>([]);

  useEffect(() => {
    setCollections(getCollections().filter(c => c.type === "record"));
  }, []);

  return (
    <div className="spine-shelf-container">
      <div className="spine-shelf-bar">
        {collections.map(col => (
          <SpineRecord key={col.id} collection={col} onInspect={onInspect} />
        ))}
      </div>
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
      <div className="spine-record-card">
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
