import { listen } from "@tauri-apps/api/event";
import { useEffect, useState } from "react";

export interface AudioSpectrum {
  bands: number[];
  active: boolean;
}

export function useAudioSpectrum() {
  const [spectrum, setSpectrum] = useState<AudioSpectrum | null>(null);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;

    listen<AudioSpectrum>("audio-spectrum", (event) => {
      if (!disposed) setSpectrum(event.payload);
    }).then((stopListening) => {
      if (disposed) stopListening();
      else unlisten = stopListening;
    });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  return spectrum;
}
