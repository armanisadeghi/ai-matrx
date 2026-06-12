"use client";

// app/(core)/podcast/studio/run-e/_components/useMockRun.ts
//
// Drives the demo run page (variation E): plays MOCK_EVENTS through the REAL
// reduce() so the presentation binds to a genuine PodcastRunState. Exposes
// startedAt + a replay() control. No backend — pure timers.

import { useCallback, useEffect, useRef, useState } from "react";
import { reduce } from "@/features/podcasts/generator/reduce";
import {
  INITIAL_RUN_STATE,
  type PodcastRunState,
} from "@/features/podcasts/generator/types";
import { MOCK_EVENTS } from "../_mock/mockEvents";

const RUNNING_INITIAL: PodcastRunState = {
  ...INITIAL_RUN_STATE,
  status: "running",
  podcastType: "educational",
};

export function useMockRun() {
  const [state, setState] = useState<PodcastRunState>(RUNNING_INITIAL);
  // Lazy init: stamp the start time once at mount (not inside an effect, which
  // would trigger a synchronous cascading render).
  const [startedAt, setStartedAt] = useState<number>(() => Date.now());
  const [nonce, setNonce] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const replay = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setState(RUNNING_INITIAL);
    setStartedAt(Date.now());
    setNonce((n) => n + 1);
  }, []);

  useEffect(() => {
    let cumulative = 0;
    const scheduled: ReturnType<typeof setTimeout>[] = [];
    for (const { delay, event } of MOCK_EVENTS) {
      cumulative += delay;
      const t = setTimeout(() => {
        setState((prev) => reduce(prev, event));
      }, cumulative);
      scheduled.push(t);
    }
    timers.current = scheduled;
    return () => {
      scheduled.forEach(clearTimeout);
    };
  }, [nonce]);

  return { state, startedAt, replay };
}
