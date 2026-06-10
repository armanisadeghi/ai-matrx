"use client";

// app/(core)/podcast/studio/run-c/_components/useMockRun.ts
//
// Plays the mock timeline through the REAL reduce() so the run-c redesign binds
// to the genuine PodcastRunState contract — no rewritten state model. Each
// scheduled event is dispatched on its own timer; "Replay" clears state and
// reschedules from zero.

import { useCallback, useEffect, useRef, useState } from "react";
import { reduce } from "@/features/podcasts/generator/reduce";
import { INITIAL_RUN_STATE } from "@/features/podcasts/generator/types";
import type { PodcastRunState } from "@/features/podcasts/generator/types";
import { MOCK_TIMELINE } from "../_mock/script";

export interface MockRun {
  state: PodcastRunState;
  startedAt: number | null;
  /** True while the timeline is still playing. */
  playing: boolean;
  replay: () => void;
}

export function useMockRun(): MockRun {
  const [state, setState] = useState<PodcastRunState>({
    ...INITIAL_RUN_STATE,
    status: "running",
  });
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [playing, setPlaying] = useState(true);
  const [nonce, setNonce] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const replay = useCallback(() => {
    setNonce((n) => n + 1);
  }, []);

  useEffect(() => {
    // reset
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setState({ ...INITIAL_RUN_STATE, status: "running" });
    setStartedAt(Date.now());
    setPlaying(true);

    for (const scheduled of MOCK_TIMELINE) {
      const id = setTimeout(() => {
        setState((prev) => reduce(prev, scheduled.event));
        if (scheduled.event.type === "podcast_complete") setPlaying(false);
      }, scheduled.at);
      timers.current.push(id);
    }

    return () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };
  }, [nonce]);

  return { state, startedAt, playing, replay };
}
