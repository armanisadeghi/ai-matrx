"use client";

// run-b — the mock run player.
//
// Fires the scripted events on their offsets and folds each through the REAL
// reduce() from the generator feature, so the demo run page binds to exactly the
// same PodcastRunState a live run produces. Only the event source is mocked.
//
// Exposes a `replay()` so the ~45s animation can be re-watched on demand.

import { useCallback, useEffect, useRef, useState } from "react";
import { reduce } from "@/features/podcasts/generator/reduce";
import { INITIAL_RUN_STATE } from "@/features/podcasts/generator/types";
import type { PodcastRunState } from "@/features/podcasts/generator/types";
import { MOCK_SCRIPT } from "./script";

export interface MockRun {
  state: PodcastRunState;
  startedAt: number | null;
  streaming: boolean;
  replay: () => void;
}

export function useMockRun(): MockRun {
  const [state, setState] = useState<PodcastRunState>(() => ({
    ...INITIAL_RUN_STATE,
    status: "running",
  }));
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [streaming, setStreaming] = useState(true);
  const [runKey, setRunKey] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const replay = useCallback(() => setRunKey((k) => k + 1), []);

  useEffect(() => {
    // Reset to a fresh running state for each (re)play.
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setState({ ...INITIAL_RUN_STATE, status: "running" });
    setStartedAt(Date.now());
    setStreaming(true);

    for (const scripted of MOCK_SCRIPT) {
      const id = setTimeout(() => {
        setState((prev) => reduce(prev, scripted.event));
        if (scripted.event.type === "podcast_complete") setStreaming(false);
      }, scripted.at);
      timers.current.push(id);
    }

    return () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };
  }, [runKey]);

  return { state, startedAt, streaming, replay };
}
