"use client";

// features/podcasts/generator/useVoices.ts
//
// Loads the live voice catalog (features/podcasts/generator/voiceCatalog.ts)
// once per page via a shared module cache, exposing loading/error state and a
// reload that busts the cache. The picker and the cast-building helpers both
// read from this.

import { useEffect, useState } from "react";
import { clearVoiceCache, fetchVoicesCached, type Voice } from "./voiceCatalog";

export interface UseVoices {
  voices: Voice[];
  loading: boolean;
  error: string | null;
  reload: () => void;
}

export function useVoices(): UseVoices {
  const [voices, setVoices] = useState<Voice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  // The effect only sets state from async callbacks (never synchronously in the
  // body) — `loading` starts true via the initializer, and `reload` does the
  // reset before bumping the nonce, so there are no cascading in-effect renders.
  useEffect(() => {
    let alive = true;
    fetchVoicesCached()
      .then((v) => {
        if (!alive) return;
        setVoices(v);
        setLoading(false);
      })
      .catch((e) => {
        if (!alive) return;
        setError(e instanceof Error ? e.message : "Failed to load voices");
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [nonce]);

  return {
    voices,
    loading,
    error,
    reload: () => {
      clearVoiceCache();
      setVoices([]);
      setError(null);
      setLoading(true);
      setNonce((n) => n + 1);
    },
  };
}
