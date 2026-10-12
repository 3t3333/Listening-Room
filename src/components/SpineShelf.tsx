import { useEffect, useState, useRef, useMemo } from "react";
import { getCollections, type Collection } from "../lib/collections";
import { Disc3, ArrowUpDown, ChevronDown, Check } from "lucide-react";
import type { DjTurntableTheme } from "../hooks/useDjSettings";

export type ShelfSortMode = "title-asc" | "title-desc" | "artist-asc" | "artist-desc" | "date-added";

interface SortOption {
  id: ShelfSortMode;
  label: string;
  shortLabel: string;
}

const SORT_OPTIONS: SortOption[] = [
  { id: "title-asc", label: "A-Z", shortLabel: "A-Z" },
  { id: "title-desc", label: "Z-A", shortLabel: "Z-A" },
  { id: "artist-asc", label: "By artist A-Z", shortLabel: "By artist A-Z" },
  { id: "artist-desc", label: "By artist Z-A", shortLabel: "By artist Z-A" },
  { id: "date-added", label: "Date added", shortLabel: "Date added" },
];

function sortCollections(items: Collection[], mode: ShelfSortMode): Collection[] {
  const sorted = [...items];
  switch (mode) {
    case "title-asc":
      return sorted.sort((a, b) =>
        (a.name || "").localeCompare(b.name || "", undefined, { sensitivity: "base", numeric: true })
      );
    case "title-desc":
      return sorted.sort((a, b) =>
        (b.name || "").localeCompare(a.name || "", undefined, { sensitivity: "base", numeric: true })
      );
    case "artist-asc":
      return sorted.sort((a, b) => {
        const cmp = (a.artist || "").localeCompare(b.artist || "", undefined, { sensitivity: "base", numeric: true });
        return cmp !== 0 ? cmp : (a.name || "").localeCompare(b.name || "", undefined, { sensitivity: "base", numeric: true });
      });
    case "artist-desc":
      return sorted.sort((a, b) => {
        const cmp = (b.artist || "").localeCompare(a.artist || "", undefined, { sensitivity: "base", numeric: true });
        return cmp !== 0 ? cmp : (b.name || "").localeCompare(a.name || "", undefined, { sensitivity: "base", numeric: true });
      });
    case "date-added":
      return sorted.sort((a, b) => {
        const timeA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
        const timeB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
        return timeB - timeA;
      });
    default:
      return sorted;
  }
}

export function SpineShelf({ 
  theme = "dark", 
  isDark,
  onInspect 
}: { 
  theme?: DjTurntableTheme; 
  isDark?: boolean;
  onInspect: (record: Collection, rect: DOMRect) => void; 
}) {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [sortMode, setSortMode] = useState<ShelfSortMode>(() => {
    try {
      const saved = localStorage.getItem("dj-shelf-sort-mode");
      if (saved && SORT_OPTIONS.some(o => o.id === saved)) {
        return saved as ShelfSortMode;
      }
    } catch {
      // ignore
    }
    return "title-asc";
  });
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const effectiveIsDark = isDark ?? (theme === "dark" || theme === "glass-smoked");

  useEffect(() => {
    function refreshShelf() {
      setCollections(getCollections().filter(c => c.type === "record"));
    }
    refreshShelf();
    window.addEventListener("collections:changed", refreshShelf);
    return () => window.removeEventListener("collections:changed", refreshShelf);
  }, []);

  useEffect(() => {
    if (!isMenuOpen) return;
    function handlePointerDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setIsMenuOpen(false);
      }
    }
    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isMenuOpen]);

  const sortedCollections = useMemo(() => {
    return sortCollections(collections, sortMode);
  }, [collections, sortMode]);

  // Organize records into shelves (up to 36 per shelf bar)
  const SHELF_CAPACITY = 36;
  const shelves: Collection[][] = [];
  for (let i = 0; i < sortedCollections.length; i += SHELF_CAPACITY) {
    shelves.push(sortedCollections.slice(i, i + SHELF_CAPACITY));
  }
  if (shelves.length === 0) {
    shelves.push([]);
  }

  const activeOption = SORT_OPTIONS.find(o => o.id === sortMode) || SORT_OPTIONS[0];

  return (
    <div className={`spine-shelf-container dj-theme-${theme}`}>
      <div className={`spine-shelf-toolbar ${isMenuOpen ? "is-menu-open" : ""}`}>
        <div className={`shelf-sort-container ${isMenuOpen ? "is-open" : ""}`} ref={menuRef}>
          <button
            type="button"
            className={`shelf-sort-btn ${effectiveIsDark ? "is-dark" : "is-light"} ${isMenuOpen ? "is-open" : ""}`}
            onClick={() => setIsMenuOpen(prev => !prev)}
            aria-expanded={isMenuOpen}
            aria-haspopup="true"
            title="Sort shelf records"
          >
            <ArrowUpDown size={12} className="shelf-sort-icon" />
            <span className="shelf-sort-label">Sort: {activeOption.shortLabel}</span>
            <ChevronDown size={11} className={`shelf-sort-arrow ${isMenuOpen ? "is-open" : ""}`} />
          </button>

          {isMenuOpen && (
            <div className={`shelf-sort-menu ${effectiveIsDark ? "is-dark" : "is-light"}`} role="menu">
              {SORT_OPTIONS.map((opt) => {
                const isSelected = opt.id === sortMode;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    role="menuitem"
                    className={`shelf-sort-item ${isSelected ? "is-selected" : ""}`}
                    onClick={() => {
                      setSortMode(opt.id);
                      try {
                        localStorage.setItem("dj-shelf-sort-mode", opt.id);
                      } catch {
                        // ignore
                      }
                      setIsMenuOpen(false);
                    }}
                  >
                    <span>{opt.label}</span>
                    {isSelected && <Check size={13} className="shelf-sort-check" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

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
  const [isHovered, setIsHovered] = useState(false);
  const track = collection.tracks?.[0];
  if (!track) return null;

  return (
    <div 
      className="spine-record-wrapper" 
      ref={ref}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
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
      {isHovered && (
        <div className="spine-record-tooltip is-visible">
           {track.imageUrl && <img src={track.imageUrl} alt="" className="spine-tooltip-art" decoding="async" draggable={false} />}
           <div className="spine-record-tooltip-text">
             <strong>{collection.name}</strong>
             <small>{collection.artist}</small>
           </div>
        </div>
      )}
    </div>
  );
}
