"use client";

// app/(core)/podcast/studio/run-a/_components/useMockRun.ts
//
// Drives the demo run page: plays MOCK_EVENTS through the REAL reduce() so the
// presentation binds to a genuine PodcastRunState. Exposes startedAt and a
// replay() control. No backend — pure timers.

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
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [nonce, setNonce] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const replay = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setState(RUNNING_INITIAL);
    setStartedAt(Date.now());
    setNonce((n) => n + 1);
  }, []);

  // Schedule the whole event script whenever a (re)play is triggered.
  useEffect(() => {
    setStartedAt((prev) => prev ?? Date.now());
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
    // nonce re-arms the schedule on replay.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nonce]);

  return { state, startedAt, replay };
}
