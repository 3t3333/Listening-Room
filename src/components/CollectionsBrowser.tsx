import { ArrowLeft, Check, Disc3, FolderPlus, ListPlus, Play, Trash2 } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent, type WheelEvent } from "react";
import { addTrackToCollection, getCollections, isTrackInCollection, recentCollectionId, removeTrackFromCollection, type Collection } from "../lib/collections";
import type { Track } from "../lib/player";
import { InteractiveSleeve } from "./InteractiveSleeve";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "./ui/dialog";

const visibleSleeves = 9;
const wheelThreshold = 55;
const wheelQuietMs = 180;
const shuffleDurationMs = 560;

interface FocusedRecord {
  index: number;
  track: Track;
  source: { left: number; top: number; width: number; height: number };
}

interface ShufflingRecord {
  index: number;
  track: Track;
  direction: 1 | -1;
}

export function CollectionsBrowser({ onPlayTrack, onQueueTrack }: { onPlayTrack: (track: Track, collection?: Track[]) => Promise<void>; onQueueTrack: (track: Track) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [browserView, setBrowserView] = useState<"menu" | "collection">("menu");
  const [collections, setCollections] = useState<Collection[]>(getCollections);
  const [collectionId, setCollectionId] = useState<string | null>(collections[0]?.id ?? null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [hovered, setHovered] = useState<Track | null>(null);
  const [focusedRecord, setFocusedRecord] = useState<FocusedRecord | null>(null);
  const [shufflingRecord, setShufflingRecord] = useState<ShufflingRecord | null>(null);
  const [lifted, setLifted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const wheelAccumulator = useRef(0);
  const wheelGestureLocked = useRef(false);
  const wheelQuietTimer = useRef(0);
  const shuffleTimer = useRef(0);
  const focusCloseTimer = useRef(0);
  const focusTarget = useRef<HTMLDivElement>(null);
  const liftedSleeve = useRef<HTMLDivElement>(null);
  const panBounds = useRef<DOMRect | null>(null);
  const panFrame = useRef(0);

  const collection = collections.find((item) => item.id === collectionId) ?? collections[0];
  const tracks = collection?.tracks ?? [];
  const stack = buildStack(tracks, activeIndex);
  const focused = focusedRecord !== null;

  useEffect(() => {
    function refreshCollections() {
      const next = getCollections();
      setCollections(next);
      setCollectionId((current) => next.some((item) => item.id === current) ? current : next[0]?.id ?? null);
    }
    window.addEventListener("collections:changed", refreshCollections);
    return () => window.removeEventListener("collections:changed", refreshCollections);
  }, []);

  useEffect(() => () => {
    window.clearTimeout(wheelQuietTimer.current);
    window.clearTimeout(shuffleTimer.current);
    window.clearTimeout(focusCloseTimer.current);
    window.cancelAnimationFrame(panFrame.current);
  }, []);

  useLayoutEffect(() => {
    if (!focusedRecord || !focusTarget.current || !liftedSleeve.current) return;
    const content = focusTarget.current.closest(".collections-dialog")?.getBoundingClientRect();
    if (!content) return;
    const target = focusTarget.current.getBoundingClientRect();
    const sleeve = liftedSleeve.current;
    sleeve.style.setProperty("--lift-x", `${target.left - content.left - focusedRecord.source.left}px`);
    sleeve.style.setProperty("--lift-y", `${target.top - content.top - focusedRecord.source.top}px`);
    sleeve.style.setProperty("--lift-scale", String(target.width / focusedRecord.source.width));
    const frame = window.requestAnimationFrame(() => setLifted(true));
    return () => window.cancelAnimationFrame(frame);
  }, [focusedRecord]);

  function changeOpen(next: boolean) {
    setOpen(next);
    setFocusedRecord(null);
    setLifted(false);
    setHovered(null);
    setShufflingRecord(null);
    setError(null);
    setNotice(null);
    window.clearTimeout(shuffleTimer.current);
    resetWheel();
    if (next) {
      setBrowserView("menu");
      const latest = getCollections();
      setCollections(latest);
      const selected = latest.find((item) => item.id === collectionId) ?? latest[0];
      setCollectionId(selected?.id ?? null);
      setActiveIndex(Math.max(0, (selected?.tracks.length ?? 1) - 1));
    }
  }

  function selectCollection(id: string) {
    const selected = collections.find((item) => item.id === id);
    setCollectionId(id);
    setActiveIndex(Math.max(0, (selected?.tracks.length ?? 1) - 1));
    setFocusedRecord(null);
    setLifted(false);
    setShufflingRecord(null);
    window.clearTimeout(shuffleTimer.current);
    resetWheel();
    setBrowserView("collection");
    setNotice(null);
  }

  function browseWithWheel(event: WheelEvent) {
    event.preventDefault();
    if (focused || tracks.length < 2 || Math.abs(event.deltaX) > Math.abs(event.deltaY) || event.deltaY === 0) return;
    window.clearTimeout(wheelQuietTimer.current);
    wheelQuietTimer.current = window.setTimeout(() => {
      wheelAccumulator.current = 0;
      wheelGestureLocked.current = false;
    }, wheelQuietMs);
    if (shufflingRecord || wheelGestureLocked.current) return;

    const multiplier = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 300 : 1;
    wheelAccumulator.current += event.deltaY * multiplier;
    if (Math.abs(wheelAccumulator.current) < wheelThreshold) return;
    const direction = wheelAccumulator.current > 0 ? 1 : -1;
    const outgoing = tracks[activeIndex];
    if (!outgoing) return;
    wheelAccumulator.current = 0;
    wheelGestureLocked.current = true;
    event.currentTarget.querySelectorAll<HTMLElement>(".crate-sleeve").forEach(setSleeveAtRest);
    setShufflingRecord({ index: activeIndex, track: outgoing, direction });
    window.clearTimeout(shuffleTimer.current);
    shuffleTimer.current = window.setTimeout(() => setShufflingRecord(null), shuffleDurationMs);
    setHovered(null);
    setActiveIndex((current) => (current + direction + tracks.length) % tracks.length);
  }

  function resetWheel() {
    window.clearTimeout(wheelQuietTimer.current);
    wheelAccumulator.current = 0;
    wheelGestureLocked.current = false;
  }

  function panSleeve(event: PointerEvent<HTMLButtonElement>) {
    const sleeve = event.currentTarget;
    if (!sleeve.classList.contains("is-front")) return;
    const bounds = panBounds.current ?? sleeve.getBoundingClientRect();
    panBounds.current = bounds;
    const horizontal = clamp((event.clientX - bounds.left) / bounds.width);
    const vertical = clamp((event.clientY - bounds.top) / bounds.height);
    window.cancelAnimationFrame(panFrame.current);
    panFrame.current = window.requestAnimationFrame(() => {
      sleeve.style.setProperty("--tilt-x", `${(0.5 - vertical) * 28}deg`);
      sleeve.style.setProperty("--tilt-y", `${(horizontal - 0.5) * 28}deg`);
      sleeve.style.setProperty("--pan-x", `${(horizontal - 0.5) * 10}px`);
      sleeve.style.setProperty("--pan-y", `${(vertical - 0.5) * 10}px`);
      sleeve.style.setProperty("--shine-x", `${horizontal * 100}%`);
      sleeve.style.setProperty("--shine-y", `${vertical * 100}%`);
    });
  }

  function resetSleevePan(event: PointerEvent<HTMLButtonElement>) {
    const sleeve = event.currentTarget;
    window.cancelAnimationFrame(panFrame.current);
    panBounds.current = null;
    setSleeveAtRest(sleeve);
    setHovered(null);
  }

  function inspectTrack(event: MouseEvent<HTMLButtonElement>, index: number, track: Track) {
    const visual = event.currentTarget.classList.contains("is-front")
      ? event.currentTarget
      : event.currentTarget.querySelector<HTMLElement>(".crate-sleeve-pan") ?? event.currentTarget;
    const source = visual.getBoundingClientRect();
    const content = event.currentTarget.closest(".collections-dialog")?.getBoundingClientRect();
    if (!content) return;
    window.clearTimeout(focusCloseTimer.current);
    setLifted(false);
    setFocusedRecord({
      index,
      track,
      source: {
        left: source.left - content.left,
        top: source.top - content.top,
        width: source.width,
        height: source.height,
      },
    });
    setHovered(null);
    setNotice(null);
    resetWheel();
  }

  function closeFocus() {
    if (!focusedRecord) return;
    setLifted(false);
    window.clearTimeout(focusCloseTimer.current);
    focusCloseTimer.current = window.setTimeout(() => setFocusedRecord(null), 650);
  }

  async function playTrack(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    if (!focusedRecord?.track.uri) return;
    setError(null);
    try {
      await onPlayTrack(focusedRecord.track, tracks);
      setOpen(false);
    } catch (reason) {
      setError(String(reason));
    }
  }

  async function queueTrack(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    if (!focusedRecord?.track.uri) return;
    setError(null);
    try {
      await onQueueTrack(focusedRecord.track);
      setNotice("Added to the Spotify queue");
    } catch (reason) {
      setError(String(reason));
    }
  }

  function copyTrack(event: MouseEvent<HTMLButtonElement>, destination: Collection) {
    event.stopPropagation();
    if (!focusedRecord) return;
    const added = addTrackToCollection(focusedRecord.track, destination.id);
    setCollections(getCollections());
    setNotice(added ? `Added to ${destination.name}` : `Already in ${destination.name}`);
  }

  function deleteTrack(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    if (!focusedRecord || !collection) return;
    removeTrackFromCollection(focusedRecord.track, collection.id);
    const next = getCollections();
    const updated = next.find((item) => item.id === collection.id);
    setCollections(next);
    setActiveIndex((current) => Math.max(0, Math.min(current, (updated?.tracks.length ?? 1) - 1)));
    setFocusedRecord(null);
    setLifted(false);
  }

  const destinations = focusedRecord
    ? collections.filter((item) => item.id !== collection?.id && item.id !== recentCollectionId)
    : [];

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild><Button variant="outline">Browse</Button></DialogTrigger>
      <DialogContent
        className="collections-dialog"
        onEscapeKeyDown={(event) => {
          if (focused) {
            event.preventDefault();
            closeFocus();
          } else if (browserView === "collection") {
            event.preventDefault();
            setBrowserView("menu");
          }
        }}
      >
        <DialogDescription className="visually-hidden">Browse locally saved record collections</DialogDescription>
        <header className={`collections-header ${browserView === "menu" ? "is-menu" : ""}`}>
          <div>
            {browserView === "collection" && (
              <button className="collection-back" onClick={() => setBrowserView("menu")}><ArrowLeft size={13} />All collections</button>
            )}
            <span>{browserView === "menu" ? "Browse" : "Collection"}</span>
            <DialogTitle>{browserView === "menu" ? "Choose a collection" : collection?.name ?? "Your collection"}</DialogTitle>
          </div>
          <small>{browserView === "menu" ? `${collections.length} collections` : `${tracks.length} ${tracks.length === 1 ? "record" : "records"}`}</small>
        </header>

        {browserView === "menu" ? (
          <div className="collection-menu">
            {collections.map((item) => (
              <button className="collection-choice" key={item.id} onClick={() => selectCollection(item.id)}>
                <CollectionPreview collection={item} />
                <span className="collection-choice-copy">
                  <small>{item.id === recentCollectionId ? "Listening history" : "Personal archive"}</small>
                  <strong>{item.name}</strong>
                  <span>{item.tracks.length} {item.tracks.length === 1 ? "record" : "records"}</span>
                </span>
              </button>
            ))}
          </div>
        ) : tracks.length ? (
          <div className="crate-room" onWheelCapture={browseWithWheel}>
            <div className={`record-crate ${shufflingRecord ? "is-shuffling" : ""}`}>
              <div className="crate-stack">
                {stack.map(({ track, index }, slot) => {
                  const front = index === activeIndex;
                  const angle = front ? 0 : (slot % 2 === 0 ? -1.4 : 1.1);
                  return (
                    <button
                      className={`crate-sleeve ${front ? "is-front" : ""} ${focusedRecord?.index === index ? "is-selected" : ""} ${shufflingRecord?.index === index ? "is-shuffle-source" : ""}`}
                      style={{ "--slot": slot, "--angle": `${angle}deg` } as CSSProperties}
                      key={track.uri ?? `${track.name}-${index}`}
                      onPointerEnter={() => setHovered(track)}
                      onPointerMove={panSleeve}
                      onPointerLeave={resetSleevePan}
                      onPointerCancel={resetSleevePan}
                      onFocus={() => setHovered(track)}
                      onBlur={() => setHovered(null)}
                      onClick={(event) => inspectTrack(event, index, track)}
                      aria-label={`Inspect ${track.name}`}
                    >
                      <SleeveVisual track={track} />
                    </button>
                  );
                })}
                {shufflingRecord && (
                  <div
                    className={`crate-shuffle ${shufflingRecord.direction > 0 ? "to-right" : "to-left"}`}
                    style={{ "--slot": stack.length - 1 } as CSSProperties}
                    aria-hidden="true"
                  >
                    <SleeveVisual track={shufflingRecord.track} />
                  </div>
                )}
              </div>
            </div>

            {hovered && (
              <aside className="crate-tooltip">
                {hovered.imageUrl ? <img src={hovered.imageUrl} alt="" /> : <Disc3 />}
                <div><strong>{hovered.name}</strong><span>{hovered.artist}</span><small>{formatDuration(hovered.durationMs)}</small></div>
              </aside>
            )}
            <p className="crate-instructions">Scroll to browse · Select a cover to inspect it</p>
          </div>
        ) : (
          <div className="collections-empty">
            <Disc3 />
            <h3>Your collection is empty</h3>
            <p>Open the sleeve of a playing track and add it to your collection.</p>
          </div>
        )}

        {focusedRecord && (
          <div className={`collection-focus ${lifted ? "is-lifted" : ""}`} onClick={closeFocus}>
            <div className="collection-focus-layout">
              <div className="collection-focus-target" ref={focusTarget} aria-hidden="true" />
              <div className="collection-focus-copy">
                <h2>{focusedRecord.track.name}</h2>
                <p>{focusedRecord.track.artist}<span>{formatDuration(focusedRecord.track.durationMs)}</span></p>
                <div className="collection-focus-actions">
                  <Button onClick={playTrack} disabled={!focusedRecord.track.uri}><Play size={16} fill="currentColor" />Play</Button>
                  <Button variant="outline" onClick={queueTrack} disabled={!focusedRecord.track.uri}><ListPlus size={16} />Queue next</Button>
                  {destinations.map((destination) => {
                    const added = isTrackInCollection(focusedRecord.track, destination.id);
                    return (
                      <Button variant="outline" key={destination.id} onClick={(event) => copyTrack(event, destination)} disabled={added}>
                        {added ? <Check size={15} /> : <FolderPlus size={15} />}{added ? `In ${destination.name}` : `Add to ${destination.name}`}
                      </Button>
                    );
                  })}
                  <Button variant="ghost" className="collection-delete" onClick={deleteTrack}><Trash2 size={15} />Delete from collection</Button>
                </div>
                {notice && <small className="collection-action-notice">{notice}</small>}
                {error && <small className="collection-play-error">{error}</small>}
              </div>
            </div>
            <div
              className="collection-lifted-record"
              ref={liftedSleeve}
              onClick={(event) => event.stopPropagation()}
              style={{
                left: focusedRecord.source.left,
                top: focusedRecord.source.top,
                width: focusedRecord.source.width,
                height: focusedRecord.source.height,
              }}
            >
              <InteractiveSleeve track={focusedRecord.track} className="collection-focus-sleeve" />
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function buildStack(tracks: Track[], activeIndex: number) {
  const count = Math.min(visibleSleeves, tracks.length);
  return Array.from({ length: count }, (_, offset) => {
    const index = (activeIndex - count + 1 + offset + tracks.length) % tracks.length;
    return { track: tracks[index], index };
  });
}

function formatDuration(durationMs: number | null | undefined) {
  if (!durationMs) return "Length unavailable";
  const seconds = Math.round(durationMs / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function SleeveVisual({ track }: { track: Track }) {
  return (
    <span className="crate-sleeve-pan">
      <span className="crate-sleeve-back" />
      <span className="crate-sleeve-thickness crate-sleeve-thickness-top" />
      <span className="crate-sleeve-thickness crate-sleeve-thickness-left" />
      <span className="crate-sleeve-thickness crate-sleeve-thickness-right" />
      <span className="crate-sleeve-thickness crate-sleeve-thickness-bottom" />
      <span className="crate-sleeve-body">
        {track.imageUrl ? <img src={track.imageUrl} alt="" loading="lazy" decoding="async" /> : <Disc3 />}
        <span className="crate-sleeve-plastic" />
        <span className="crate-sleeve-film" />
      </span>
    </span>
  );
}

function CollectionPreview({ collection }: { collection: Collection }) {
  const previews = collection.tracks.slice(-3);
  return (
    <span className="collection-preview" aria-hidden="true">
      {previews.length ? previews.map((track, index) => (
        <span className="collection-preview-sleeve" style={{ "--preview": index } as CSSProperties} key={track.uri ?? `${track.name}-${index}`}>
          {track.imageUrl ? <img src={track.imageUrl} alt="" loading="lazy" decoding="async" /> : <Disc3 />}
          <i />
        </span>
      )) : (
        <span className="collection-preview-sleeve is-empty"><Disc3 /><i /></span>
      )}
    </span>
  );
}

function clamp(value: number) {
  return Math.max(0, Math.min(1, value));
}

function setSleeveAtRest(sleeve: HTMLElement) {
  sleeve.style.setProperty("--tilt-x", "0deg");
  sleeve.style.setProperty("--tilt-y", "0deg");
  sleeve.style.setProperty("--pan-x", "0px");
  sleeve.style.setProperty("--pan-y", "0px");
  sleeve.style.setProperty("--shine-x", "50%");
  sleeve.style.setProperty("--shine-y", "50%");
}
