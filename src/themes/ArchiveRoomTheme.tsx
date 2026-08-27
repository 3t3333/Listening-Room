import { ArrowLeft, Disc3, ListMusic, ListPlus, LoaderCircle, Play, RefreshCw } from "lucide-react";
import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import { CustomBackground } from "../components/CustomBackground";
import { InteractiveSleeve } from "../components/InteractiveSleeve";
import { PlayerControls } from "../components/PlayerControls";
import { Button } from "../components/ui/button";
import { getCollections, recentCollectionId, type Collection } from "../lib/collections";
import { player, type Track } from "../lib/player";
import type { ThemeProps } from "./types";

interface Props extends ThemeProps {
  onPlayTrack: (track: Track, collection?: Track[]) => Promise<void>;
  onQueueTrack: (track: Track) => Promise<void>;
}

interface FocusedRecord {
  track: Track;
  collection: Collection;
  source: { left: number; top: number; width: number; height: number };
}

export function ArchiveRoomTheme({ playback, background, onToggle, onPrevious, onNext, onPlayTrack, onQueueTrack }: Props) {
  const [collections, setCollections] = useState<Collection[]>(getCollections);
  const [collectionId, setCollectionId] = useState<string | null>(null);
  const [queueOpen, setQueueOpen] = useState(false);
  const [queueTracks, setQueueTracks] = useState<Track[]>([]);
  const [queueLoading, setQueueLoading] = useState(false);
  const [focusedRecord, setFocusedRecord] = useState<FocusedRecord | null>(null);
  const [lifted, setLifted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const themeRoot = useRef<HTMLElement>(null);
  const focusTarget = useRef<HTMLDivElement>(null);
  const liftedSleeve = useRef<HTMLDivElement>(null);
  const focusCloseTimer = useRef(0);
  const queueRequest = useRef(0);
  const collection = collections.find((item) => item.id === collectionId) ?? null;
  const { primary: [red, green, blue] } = background.palette;
  const style = { "--ambient-rgb": `${red}, ${green}, ${blue}` } as CSSProperties;

  useEffect(() => {
    function refreshCollections() {
      const next = getCollections();
      setCollections(next);
      setCollectionId((current) => current && next.some((item) => item.id === current) ? current : null);
    }
    window.addEventListener("collections:changed", refreshCollections);
    return () => window.removeEventListener("collections:changed", refreshCollections);
  }, []);

  useEffect(() => () => window.clearTimeout(focusCloseTimer.current), []);

  useEffect(() => {
    if (!queueOpen) return;
    const timer = window.setInterval(() => {
      void refreshQueue(false);
    }, 2000);
    return () => window.clearInterval(timer);
  }, [queueOpen]);

  useEffect(() => {
    if (!focusedRecord) return;
    function closeWithEscape(event: KeyboardEvent) {
      if (event.key === "Escape") closeFocus();
    }
    window.addEventListener("keydown", closeWithEscape);
    return () => window.removeEventListener("keydown", closeWithEscape);
  }, [focusedRecord]);

  useLayoutEffect(() => {
    if (!focusedRecord || !focusTarget.current || !liftedSleeve.current || !themeRoot.current) return;
    const root = themeRoot.current.getBoundingClientRect();
    const target = focusTarget.current.getBoundingClientRect();
    const sleeve = liftedSleeve.current;
    sleeve.style.setProperty("--lift-x", `${target.left - root.left - focusedRecord.source.left}px`);
    sleeve.style.setProperty("--lift-y", `${target.top - root.top - focusedRecord.source.top}px`);
    sleeve.style.setProperty("--lift-scale", String(target.width / focusedRecord.source.width));
    const frame = window.requestAnimationFrame(() => setLifted(true));
    return () => window.cancelAnimationFrame(frame);
  }, [focusedRecord]);

  async function playTrack(track: Track, source: Collection) {
    setError(null);
    try {
      await onPlayTrack(track, source.tracks);
    } catch (reason) {
      setError(String(reason));
    }
  }

  async function queueTrack(track: Track) {
    setError(null);
    setNotice(null);
    try {
      await onQueueTrack(track);
      setNotice("Queue request sent to Spotify");
    } catch (reason) {
      setError(String(reason));
    }
  }

  const inspectTrack = useCallback(function inspectTrack(event: MouseEvent<HTMLButtonElement>, track: Track, sourceCollection: Collection) {
    const visual = event.currentTarget.querySelector<HTMLElement>(".crate-sleeve-pan") ?? event.currentTarget;
    const root = themeRoot.current?.getBoundingClientRect();
    if (!root) return;
    const source = visual.getBoundingClientRect();
    window.clearTimeout(focusCloseTimer.current);
    setLifted(false);
    setNotice(null);
    setError(null);
    setFocusedRecord({
      track,
      collection: sourceCollection,
      source: { left: source.left - root.left, top: source.top - root.top, width: source.width, height: source.height },
    });
  }, []);
  const closeCollection = useCallback(() => setCollectionId(null), []);

  function closeFocus() {
    setLifted(false);
    window.clearTimeout(focusCloseTimer.current);
    focusCloseTimer.current = window.setTimeout(() => setFocusedRecord(null), 650);
  }

  async function loadQueue() {
    setQueueOpen(true);
    await refreshQueue(true);
  }

  async function refreshQueue(showLoading: boolean) {
    const request = ++queueRequest.current;
    if (showLoading) setQueueLoading(true);
    setError(null);
    try {
      const tracks = await player.queue();
      if (request === queueRequest.current) setQueueTracks(tracks);
    } catch (reason) {
      if (request === queueRequest.current) setError(String(reason));
    } finally {
      if (request === queueRequest.current) setQueueLoading(false);
    }
  }

  function closeQueue() {
    queueRequest.current++;
    setQueueLoading(false);
    setQueueOpen(false);
  }

  return (
    <section className="theme-scene archive-theme" style={style} ref={themeRoot}>
      <CustomBackground imageUrl={background.imageUrl} opacity={background.opacity} />
      <div className="archive-ambient" />
      <div className="archive-room">
        {queueOpen ? (
          <QueueShelves tracks={queueTracks} loading={queueLoading} onBack={closeQueue} onRefresh={() => void loadQueue()} onInspect={inspectTrack} />
        ) : collection ? (
          <CollectionShelves collection={collection} onBack={closeCollection} onInspect={inspectTrack} />
        ) : (
          <>
            <header className="archive-heading">
              <div><span>Listening archive</span><h1>Browse the room</h1></div>
              <p>Choose a collection to step into its shelves.</p>
            </header>
            <div className="archive-index">
              {collections.map((item) => <CollectionEntrance collection={item} onOpen={() => setCollectionId(item.id)} key={item.id} />)}
              <button className="archive-entrance archive-queue-entrance" onClick={() => void loadQueue()}>
                <span className="archive-entrance-label">Spotify playback</span>
                <strong>Next Queue</strong>
                <small>Everything currently lined up to play</small>
                <span className="archive-queue-mark" aria-hidden="true"><ListMusic /></span>
                <b>View queue <span>→</span></b>
              </button>
            </div>
          </>
        )}
      </div>

      <aside className="archive-now-playing">
        <span className="archive-now-art">{playback.current?.imageUrl ? <img src={playback.current.imageUrl} alt="" /> : <Disc3 />}</span>
        <div><small>Now playing</small><strong>{playback.current?.name ?? "Nothing playing"}</strong><span>{playback.current?.artist ?? "Choose a record"}</span></div>
        <PlayerControls compact playback={playback} onToggle={onToggle} onPrevious={onPrevious} onNext={onNext} />
      </aside>

      {focusedRecord && (
        <div className={`collection-focus archive-focus ${lifted ? "is-lifted" : ""}`} onClick={closeFocus} role="dialog" aria-modal="true" aria-label={`Inspect ${focusedRecord.track.name}`}>
          <div className="collection-focus-layout">
            <div className="collection-focus-target" ref={focusTarget} aria-hidden="true" />
            <div className="collection-focus-copy">
              <span className="archive-focus-kicker">{focusedRecord.collection.name}</span>
              <h2>{focusedRecord.track.name}</h2>
              <p>{focusedRecord.track.artist}</p>
              <div className="collection-focus-actions">
                <Button onClick={(event) => { event.stopPropagation(); void playTrack(focusedRecord.track, focusedRecord.collection); }} disabled={!focusedRecord.track.uri}><Play size={16} fill="currentColor" />Play from here</Button>
                <Button variant="outline" onClick={(event) => { event.stopPropagation(); void queueTrack(focusedRecord.track); }} disabled={!focusedRecord.track.uri}><ListPlus size={16} />Queue next</Button>
              </div>
              {notice && <small className="collection-action-notice">{notice}</small>}
              {error && <small className="collection-play-error">{error}</small>}
            </div>
          </div>
          <div className="collection-lifted-record" ref={liftedSleeve} onClick={(event) => event.stopPropagation()} style={{ left: focusedRecord.source.left, top: focusedRecord.source.top, width: focusedRecord.source.width, height: focusedRecord.source.height }}>
            <InteractiveSleeve track={focusedRecord.track} className="collection-focus-sleeve" />
          </div>
        </div>
      )}
      {!focusedRecord && error && <button className="archive-error" onClick={() => setError(null)}>{error}</button>}
    </section>
  );
}

function CollectionEntrance({ collection, onOpen }: { collection: Collection; onOpen: () => void }) {
  const previews = collection.tracks.slice(-5).reverse();
  return (
    <button className="archive-entrance" onClick={onOpen}>
      <span className="archive-entrance-label">{collection.id === recentCollectionId ? "Listening history" : "Personal archive"}</span>
      <strong>{collection.name}</strong>
      <small>{collection.tracks.length} {collection.tracks.length === 1 ? "record" : "records"}</small>
      <span className="archive-entrance-preview" aria-hidden="true">
        {previews.length ? previews.map((track, index) => (
          <span style={{ "--preview": index } as CSSProperties} key={track.uri ?? `${track.name}-${index}`}>
            {track.imageUrl ? <img src={track.imageUrl} alt="" loading="lazy" decoding="async" /> : <Disc3 />}
            <i />
          </span>
        )) : <span className="is-empty"><Disc3 /><i /></span>}
      </span>
      <b>Open collection <span>→</span></b>
    </button>
  );
}

const CollectionShelves = memo(function CollectionShelves({ collection, onBack, onInspect }: { collection: Collection; onBack: () => void; onInspect: (event: MouseEvent<HTMLButtonElement>, track: Track, collection: Collection) => void }) {
  return (
    <section className="archive-library">
      <header className="archive-library-header">
        <button onClick={onBack}><ArrowLeft />All collections</button>
        <span>{collection.id === recentCollectionId ? "Listening history" : "Personal archive"}</span>
        <h1>{collection.name}</h1>
        <p>{collection.tracks.length} {collection.tracks.length === 1 ? "record" : "records"} · Select a sleeve to inspect it</p>
      </header>
      {collection.tracks.length ? (
        <div className="archive-shelves">
          {collection.tracks.map((track, index) => (
            <button className="archive-shelf-record" onClick={(event) => onInspect(event, track, collection)} key={track.uri ?? `${track.name}-${index}`} aria-label={`Inspect ${track.name}`}>
              <ArchiveSleeveVisual track={track} />
              <span className="archive-record-tooltip"><strong>{track.name}</strong><small>{track.artist}</small><i>{formatDuration(track.durationMs)}</i></span>
            </button>
          ))}
        </div>
      ) : (
        <div className="archive-empty"><Disc3 /><span>No records on these shelves yet</span></div>
      )}
    </section>
  );
});

function QueueShelves({ tracks, loading, onBack, onRefresh, onInspect }: { tracks: Track[]; loading: boolean; onBack: () => void; onRefresh: () => void; onInspect: (event: MouseEvent<HTMLButtonElement>, track: Track, collection: Collection) => void }) {
  const queueCollection: Collection = { id: "spotify-queue", name: "Next Queue", tracks, updatedAt: "" };
  return (
    <section className="archive-library archive-queue-library">
      <header className="archive-library-header">
        <button onClick={onBack}><ArrowLeft />Browse the room</button>
        <span>Spotify playback</span>
        <h1>Next Queue</h1>
        <p>{tracks.length} {tracks.length === 1 ? "track" : "tracks"} currently lined up</p>
        <button className="archive-queue-refresh" onClick={onRefresh} disabled={loading}><RefreshCw />Refresh queue</button>
      </header>
      {loading ? (
        <div className="archive-queue-loading"><LoaderCircle /><span>Reading the Spotify queue</span></div>
      ) : tracks.length ? (
        <div className="archive-shelves">
          {tracks.map((track, index) => (
            <button className="archive-shelf-record" onClick={(event) => onInspect(event, track, queueCollection)} key={`${track.uri ?? track.name}-${index}`} aria-label={`Inspect ${track.name}`}>
              <span className="archive-queue-position">{String(index + 1).padStart(2, "0")}</span>
              <ArchiveSleeveVisual track={track} />
              <span className="archive-record-tooltip"><strong>{track.name}</strong><small>{track.artist}</small><i>{formatDuration(track.durationMs)}</i></span>
            </button>
          ))}
        </div>
      ) : (
        <div className="archive-empty"><ListMusic /><span>The Spotify queue is empty</span></div>
      )}
    </section>
  );
}

function ArchiveSleeveVisual({ track }: { track: Track }) {
  return (
    <span className="crate-sleeve-pan archive-sleeve-visual">
      <span className="archive-sleeve-body">
        {track.imageUrl ? <img src={track.imageUrl} alt="" loading="lazy" decoding="async" fetchPriority="low" /> : <Disc3 />}
        <i />
      </span>
    </span>
  );
}

function formatDuration(durationMs: number | null | undefined) {
  if (!durationMs) return "Length unavailable";
  const seconds = Math.round(durationMs / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
