"use client";

// app/(core)/podcast/studio/run-f/_components/useBoothReplay.ts
//
// Drives the production-booth demo: replays the mock event sequence over ~45s,
// folding each event into BoothState via the pure reducer. Self-contained — no
// backend, no streaming. Also tracks elapsed seconds for the booth's clock and
// exposes a restart for the "Run again" affordance.

import { useCallback, useEffect, useRef, useState } from "react";
import { MOCK_EVENTS } from "../_mock/mockEvents";
import {
  INITIAL_BOOTH_STATE,
  reduce,
  type BoothState,
} from "./boothState";

export function useBoothReplay() {
  const [state, setState] = useState<BoothState>(INITIAL_BOOTH_STATE);
  const [elapsed, setElapsed] = useState(0);
  const [nonce, setNonce] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const restart = useCallback(() => {
    setState(INITIAL_BOOTH_STATE);
    setElapsed(0);
    setNonce((n) => n + 1);
  }, []);

  useEffect(() => {
    // `restart` already resets state synchronously before bumping `nonce`, and
    // the first mount starts from INITIAL_BOOTH_STATE — so the effect only
    // schedules the replay (it synchronizes with the timer "external system").
    timers.current.forEach(clearTimeout);
    timers.current = [];

    // Schedule each event at its cumulative offset.
    let cumulative = 0;
    let finished = false;
    for (const { delay, event } of MOCK_EVENTS) {
      cumulative += delay;
      timers.current.push(
        setTimeout(() => {
          setState((s) => reduce(s, event));
          if (event.type === "podcast_complete") finished = true;
        }, cumulative),
      );
    }

    // Elapsed clock — ticks each second until the run completes.
    const clock = setInterval(() => {
      if (finished) {
        clearInterval(clock);
        return;
      }
      setElapsed((e) => e + 1);
    }, 1000);
    timers.current.push(clock as unknown as ReturnType<typeof setTimeout>);

    return () => {
      timers.current.forEach(clearTimeout);
      clearInterval(clock);
      timers.current = [];
    };
  }, [nonce]);

  return { state, elapsed, restart };
}
