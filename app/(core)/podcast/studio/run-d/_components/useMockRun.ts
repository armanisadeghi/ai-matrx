"use client";

// app/(core)/podcast/studio/run-d/_components/useMockRun.ts
//
// Self-contained demo driver: replays MOCK_EVENTS through the REAL generator
// reducer so the run page binds to a genuine PodcastRunState. No backend, no
// [id] segment. The sequence runs once on mount (~45s) and can be replayed.
//
// Also tracks an `elapsedMs` clock and the most-recent event timestamps so the
// UI can show per-stage timing like a build log.

import { useCallback, useEffect, useRef, useState } from "react";
import { reduce } from "@/features/podcasts/generator/reduce";
import {
  INITIAL_RUN_STATE,
  type PodcastRunState,
} from "@/features/podcasts/generator/types";
import { MOCK_EVENTS } from "../_mock/mockEvents";

export interface MockRun {
  state: PodcastRunState;
  elapsedMs: number;
  startedAt: number;
  /** Wall-clock ms at which each stage key flipped to a terminal status. */
  stageDoneAt: Record<string, number>;
  /** Wall-clock ms at which each stage key first started. */
  stageStartedAt: Record<string, number>;
  replay: () => void;
}

export function useMockRun(): MockRun {
  const [state, setState] = useState<PodcastRunState>({
    ...INITIAL_RUN_STATE,
    status: "running",
  });
  const [elapsedMs, setElapsedMs] = useState(0);
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const [stageDoneAt, setStageDoneAt] = useState<Record<string, number>>({});
  const [stageStartedAt, setStageStartedAt] = useState<Record<string, number>>(
    {},
  );

  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);
  const nonce = useRef(0);

  const clearAll = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    if (tick.current) clearInterval(tick.current);
    tick.current = null;
  }, []);

  const start = useCallback(() => {
    clearAll();
    nonce.current += 1;
    const myNonce = nonce.current;
    const begin = Date.now();
    setStartedAt(begin);
    setElapsedMs(0);
    setStageDoneAt({});
    setStageStartedAt({});
    setState({ ...INITIAL_RUN_STATE, status: "running" });

    // Elapsed clock.
    tick.current = setInterval(() => {
      if (nonce.current !== myNonce) return;
      setElapsedMs(Date.now() - begin);
    }, 100);

    // Schedule each event at its cumulative offset.
    let offset = 0;
    for (const { delay, event } of MOCK_EVENTS) {
      offset += delay;
      const t = setTimeout(() => {
        if (nonce.current !== myNonce) return;
        const at = Date.now();
        setState((prev) => reduce(prev, event));
        if (event.type === "podcast_stage_started") {
          setStageStartedAt((m) => ({ ...m, [event.stage]: at }));
        }
        if (event.type === "podcast_stage" && event.success) {
          setStageDoneAt((m) => ({ ...m, [event.stage]: at }));
        }
        if (event.type === "podcast_asset") {
          const key = `${event.asset_kind}_${event.index}`;
          setStageDoneAt((m) => ({ ...m, [key]: at }));
        }
        if (event.type === "podcast_complete") {
          clearAll();
        }
      }, offset);
      timers.current.push(t);
    }
  }, [clearAll]);

  useEffect(() => {
    // Kick off on the next tick so the initial reset setState isn't called
    // synchronously inside the effect body (avoids the cascading-render lint).
    const kickoff = setTimeout(start, 0);
    return () => {
      clearTimeout(kickoff);
      clearAll();
    };
  }, [start, clearAll]);

  return {
    state,
    elapsedMs,
    startedAt,
    stageDoneAt,
    stageStartedAt,
    replay: start,
  };
}
