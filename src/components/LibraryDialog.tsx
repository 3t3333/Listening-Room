import { Disc3, LoaderCircle, Play } from "lucide-react";
import { useRef, useState } from "react";
import type { Playlist, Track } from "../lib/player";
import { legacyWebApi } from "../lib/legacyWebApi";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "./ui/dialog";

interface Props {
  playlists: Playlist[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}

export function LibraryDialog({ playlists, loading: playlistsLoading, error, onRetry }: Props) {
  const [selected, setSelected] = useState<Playlist | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(false);
  const trackCache = useRef(new Map<string, Track[]>());

  async function openPlaylist(playlist: Playlist) {
    setSelected(playlist);
    const cached = trackCache.current.get(playlist.id);
    if (cached) {
      setLoading(false);
      setTracks(cached);
      return;
    }
    setLoading(true);
    try {
      const loaded = await legacyWebApi.playlistTracks(playlist.id);
      trackCache.current.set(playlist.id, loaded);
      setTracks(loaded);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog>
      <DialogTrigger asChild><Button variant="outline">Browse records</Button></DialogTrigger>
      <DialogContent>
        <div className="library-heading">
          <div><DialogTitle>{selected?.name ?? "Your record shelf"}</DialogTitle><DialogDescription>Select a sleeve to explore its tracks.</DialogDescription></div>
          {selected
            ? <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>All shelves</Button>
            : playlists.length > 0 && <Button variant="ghost" size="sm" onClick={onRetry}>Refresh</Button>}
        </div>
        {selected ? (
          <div className="track-list">
            {loading ? <LoaderCircle className="spinner" /> : tracks.map((track, index) => (
              <button className="track-row" key={`${track.name}-${index}`} onClick={() => track.uri && legacyWebApi.playUri(track.uri)}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                {track.imageUrl ? <img src={track.imageUrl} alt="" /> : <Disc3 />}
                <span className="track-copy"><strong>{track.name}</strong><small>{track.artist}</small></span>
                <Play size={16} />
              </button>
            ))}
          </div>
        ) : playlistsLoading ? (
          <div className="library-empty"><LoaderCircle className="spinner" /><span>Loading your records...</span></div>
        ) : error ? (
          <div className="library-empty"><p>Spotify could not load your shelves.</p><Button onClick={onRetry}>Try again</Button></div>
        ) : playlists.length === 0 ? (
          <div className="library-empty"><p>No playlists found.</p><Button onClick={onRetry} variant="outline">Refresh</Button></div>
        ) : (
          <div className="shelf-grid">
            {playlists.map((playlist) => (
              <button className="sleeve" key={playlist.id} onClick={() => openPlaylist(playlist)}>
                <span className="sleeve-edge" />
                {playlist.imageUrl ? <img src={playlist.imageUrl} alt="" /> : <Disc3 />}
                <strong>{playlist.name}</strong>
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
