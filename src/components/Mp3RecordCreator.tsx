import { useState, useRef } from "react";
import { ArrowLeft, CheckCircle2, ImagePlus, Plus, Trash2, Disc3 } from "lucide-react";
import { Button } from "./ui/button";
import { saveAudioTrack, saveArtworkBlob, resizeImageToDataUrl } from "../lib/mp3Storage";
import { getCollections, type Collection } from "../lib/collections";
import type { Track } from "../lib/player";

interface Props {
  onBack: () => void;
  onResolve: (record: Collection) => void;
}

interface TempTrack {
  id: string;
  name: string;
  durationMs: number | null;
  blob: Blob;
}

export function Mp3RecordCreator({ onBack, onResolve }: Props) {
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [year, setYear] = useState(new Date().getFullYear().toString());
  const [artworkBlob, setArtworkBlob] = useState<Blob | null>(null);
  const [artworkUrl, setArtworkUrl] = useState<string | null>(null);
  const [tracks, setTracks] = useState<TempTrack[]>([]);
  const [side, setSide] = useState<"info" | "side-a" | "side-b">("info");
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const artworkInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);

  const sideACount = Math.ceil(tracks.length / 2);
  const sideA = tracks.slice(0, sideACount);
  const sideB = tracks.slice(sideACount);

  const totalDurationMs = tracks.reduce((acc, t) => acc + (t.durationMs || 0), 0);
  const totalMins = Math.floor(totalDurationMs / 60000);

  function handleArtworkChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (artworkUrl) URL.revokeObjectURL(artworkUrl);
    const url = URL.createObjectURL(file);
    setArtworkBlob(file);
    setArtworkUrl(url);
  }

  async function handleAudioFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    const newTracks: TempTrack[] = [];

    for (const file of files) {
      let name = file.name.replace(/\.[^/.]+$/, "");
      name = name.replace(/^(\d{1,3}[.\s-_]+)+/, "");
      name = name.trim() || file.name;

      let durationMs: number | null = null;
      try {
        const objectUrl = URL.createObjectURL(file);
        const tempAudio = new Audio(objectUrl);
        await new Promise((resolve) => {
          tempAudio.onloadedmetadata = () => {
            durationMs = Math.round(tempAudio.duration * 1000);
            URL.revokeObjectURL(objectUrl);
            resolve(null);
          };
          tempAudio.onerror = () => {
            URL.revokeObjectURL(objectUrl);
            resolve(null);
          };
        });
      } catch (err) {
        console.warn("Could not extract duration:", err);
      }

      newTracks.push({
        id: `trk-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name,
        durationMs,
        blob: file,
      });
    }

    setTracks((prev) => [...prev, ...newTracks]);
    if (audioInputRef.current) audioInputRef.current.value = "";
  }

  function handleRemoveTrack(id: string) {
    setTracks((prev) => prev.filter((t) => t.id !== id));
  }

  function handleTrackNameChange(id: string, newName: string) {
    setTracks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, name: newName } : t))
    );
  }

  async function handleResolve() {
    setErrorMessage(null);
    if (!title.trim()) {
      setErrorMessage("Please enter an album title.");
      return;
    }
    if (!tracks.length) {
      setErrorMessage("Please add at least one MP3 track.");
      return;
    }

    setIsSaving(true);
    try {
      const albumId = `rec-mp3-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      let finalArtworkUrl: string | null = null;

      if (artworkBlob) {
        const artId = `art-${albumId}`;
        await saveArtworkBlob(artId, artworkBlob);
        finalArtworkUrl = await resizeImageToDataUrl(artworkBlob, 600);
      }

      const collectionTracks: Track[] = [];
      for (let i = 0; i < tracks.length; i++) {
        const trk = tracks[i];
        const audioId = `mp3-${albumId}-${i}`;
        await saveAudioTrack(audioId, trk.blob);

        collectionTracks.push({
          name: trk.name,
          artist: artist.trim() || "Unknown Artist",
          imageUrl: finalArtworkUrl,
          uri: `mp3:${audioId}`,
          audioId,
          durationMs: trk.durationMs,
        });
      }

      const newRecord: Collection = {
        id: albumId,
        name: title.trim(),
        type: "record",
        format: "mp3",
        artist: artist.trim() || "Unknown Artist",
        artistImageUrl: null,
        year: year ? parseInt(year, 10) : null,
        tracks: collectionTracks,
        originalTracks: [...collectionTracks],
        updatedAt: new Date().toISOString(),
      };

      const collections = getCollections();
      collections.push(newRecord);
      localStorage.setItem("listening-room-collections", JSON.stringify(collections));
      window.dispatchEvent(new CustomEvent("collections:changed", { detail: collections }));

      onResolve(newRecord);
    } catch (err: any) {
      console.error("Failed to resolve MP3 album:", err);
      setErrorMessage("Failed to save MP3 album: " + (err.message || String(err)));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className={`record-presentation state-${side} mp3-creator-view`}>
      <button className="record-presentation-back" onClick={onBack}>
        <ArrowLeft /> Back to Room
      </button>

      <div className="record-presentation-content">
        <div className="record-presentation-left" style={{ overflowY: "auto", maxHeight: "80vh", paddingRight: "12px" }}>
          <div className="record-info-header fade-in">
            <span style={{ fontSize: "11px", letterSpacing: "1.5px", textTransform: "uppercase", color: "var(--primary, #00d26a)", fontWeight: 600 }}>
              MP3 Album Sandbox
            </span>
            <input
              type="text"
              className="mp3-input-title"
              placeholder="Album Title..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              style={{
                width: "100%",
                background: "transparent",
                border: "none",
                borderBottom: "1px solid #333",
                fontSize: "26px",
                fontWeight: 700,
                color: "#fff",
                marginTop: "6px",
                marginBottom: "8px",
                outline: "none",
              }}
            />
            <div style={{ display: "flex", gap: "10px", marginTop: "4px" }}>
              <input
                type="text"
                className="mp3-input-artist"
                placeholder="Artist Name..."
                value={artist}
                onChange={(e) => setArtist(e.target.value)}
                style={{
                  flex: 2,
                  background: "transparent",
                  border: "none",
                  borderBottom: "1px solid #333",
                  fontSize: "16px",
                  color: "#aaa",
                  outline: "none",
                }}
              />
              <input
                type="number"
                placeholder="Year"
                value={year}
                onChange={(e) => setYear(e.target.value)}
                style={{
                  flex: 1,
                  background: "transparent",
                  border: "none",
                  borderBottom: "1px solid #333",
                  fontSize: "16px",
                  color: "#888",
                  outline: "none",
                }}
              />
            </div>

            <div className="record-meta" style={{ marginTop: "12px" }}>
              <span>{tracks.length} Tracks</span>
              <span>{totalMins} min</span>
              <span style={{ background: "#222", padding: "2px 6px", borderRadius: "4px", fontSize: "11px", color: "#4ade80" }}>
                Side A: {sideA.length} | Side B: {sideB.length}
              </span>
            </div>
          </div>

          <div className="record-tracks-panel fade-in" style={{ marginTop: "20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
              <h3 style={{ margin: 0, fontSize: "16px", color: "#ddd" }}>Tracklist</h3>
              <Button
                variant="outline"
                size="sm"
                onClick={() => audioInputRef.current?.click()}
                style={{ display: "flex", alignItems: "center", gap: "6px" }}
              >
                <Plus size={15} />
                + Add Tracks (MP3)
              </Button>
              <input
                type="file"
                ref={audioInputRef}
                accept="audio/mp3,audio/*"
                multiple
                style={{ display: "none" }}
                onChange={handleAudioFiles}
              />
            </div>

            {tracks.length === 0 ? (
              <div
                style={{
                  border: "2px dashed #333",
                  borderRadius: "8px",
                  padding: "30px 20px",
                  textAlign: "center",
                  color: "#777",
                  cursor: "pointer",
                  marginTop: "10px",
                }}
                onClick={() => audioInputRef.current?.click()}
              >
                <Disc3 size={32} style={{ margin: "0 auto 10px auto", opacity: 0.5 }} />
                <p style={{ margin: 0, fontSize: "14px" }}>Click to select one or multiple MP3 files</p>
                <span style={{ fontSize: "12px", color: "#555" }}>Tracks will be automatically divided into Side A and Side B</span>
              </div>
            ) : (
              <ul className="record-tracklist" style={{ maxHeight: "300px", overflowY: "auto" }}>
                {tracks.map((track, i) => (
                  <li key={track.id} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "6px 8px" }}>
                    <span className="track-number" style={{ minWidth: "24px", color: i < sideACount ? "var(--primary, #00d26a)" : "#888" }}>
                      {i + 1}.
                    </span>
                    <input
                      type="text"
                      value={track.name}
                      onChange={(e) => handleTrackNameChange(track.id, e.target.value)}
                      style={{
                        flex: 1,
                        background: "transparent",
                        border: "none",
                        borderBottom: "1px dashed #444",
                        color: "#eee",
                        fontSize: "14px",
                        outline: "none",
                        padding: "2px 0",
                      }}
                    />
                    <span className="track-duration" style={{ fontSize: "12px", color: "#777", minWidth: "45px", textAlign: "right" }}>
                      {track.durationMs
                        ? `${Math.floor(track.durationMs / 60000)}:${String(Math.floor((track.durationMs % 60000) / 1000)).padStart(2, "0")}`
                        : "--:--"}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemoveTrack(track.id)}
                      style={{ background: "transparent", border: "none", color: "#ff5555", cursor: "pointer", padding: "4px" }}
                      title="Remove track"
                    >
                      <Trash2 size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {errorMessage && (
              <div style={{ color: "#ff5555", fontSize: "13px", marginTop: "12px" }}>
                {errorMessage}
              </div>
            )}

            <div style={{ display: "flex", gap: "10px", marginTop: "24px" }}>
              <Button
                onClick={handleResolve}
                disabled={isSaving || tracks.length === 0}
                style={{ flex: 2, background: "var(--primary, #00d26a)", color: "#000", fontWeight: 600 }}
              >
                <CheckCircle2 size={18} style={{ marginRight: "8px" }} />
                {isSaving ? "Resolving Album..." : "Resolve Album"}
              </Button>
              <Button variant="outline" onClick={onBack} disabled={isSaving} style={{ flex: 1 }}>
                Cancel
              </Button>
            </div>
          </div>
        </div>

        <div className="record-presentation-right">
          <div className="record-stage">
            <div
              className="record-sleeve-container"
              onClick={() => artworkInputRef.current?.click()}
              style={{ cursor: "pointer", position: "relative" }}
              title="Click to choose album artwork"
            >
              <div
                className="record-sleeve-oversize"
                style={{
                  width: "100%",
                  height: "100%",
                  background: artworkUrl
                    ? `url(${artworkUrl}) center/cover no-repeat`
                    : "linear-gradient(135deg, #222, #111)",
                  borderRadius: "6px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "0 20px 40px rgba(0,0,0,0.6)",
                  border: "1px solid #333",
                }}
              >
                {!artworkUrl && (
                  <div style={{ textAlign: "center", color: "#888", padding: "20px" }}>
                    <ImagePlus size={44} style={{ margin: "0 auto 10px auto", opacity: 0.6 }} />
                    <p style={{ margin: 0, fontSize: "14px", fontWeight: 600, color: "#aaa" }}>Upload Artwork</p>
                    <small style={{ fontSize: "11px", color: "#666" }}>Click anywhere on the sleeve</small>
                  </div>
                )}
              </div>
              <input
                type="file"
                ref={artworkInputRef}
                accept="image/*"
                style={{ display: "none" }}
                onChange={handleArtworkChange}
              />
            </div>

            <div
              className={`record-vinyl-container is-out`}
              onClick={() => {
                setSide(side === "side-a" ? "side-b" : "side-a");
              }}
              style={{ cursor: "pointer" }}
              title="Click disc to flip sides"
            >
              <div className={`record-vinyl-disc ${side === "side-b" ? "is-flipped" : ""}`}>
                <div className="record-vinyl-grooves record-vinyl-grooves-a"></div>
                <div className="record-vinyl-grooves record-vinyl-grooves-b"></div>
                <div
                  className="record-vinyl-label record-vinyl-label-a"
                  style={artworkUrl ? { backgroundImage: `url(${artworkUrl})` } : {}}
                >
                  <div className="record-vinyl-label-text">
                    <small>Side A</small>
                    <ul>
                      {sideA.slice(0, 5).map((t) => (
                        <li key={t.id}>{t.name}</li>
                      ))}
                    </ul>
                  </div>
                </div>
                <div
                  className="record-vinyl-label record-vinyl-label-b"
                  style={artworkUrl ? { backgroundImage: `url(${artworkUrl})` } : {}}
                >
                  <div className="record-vinyl-label-text">
                    <small>Side B</small>
                    <ul>
                      {sideB.slice(0, 5).map((t) => (
                        <li key={t.id}>{t.name}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
