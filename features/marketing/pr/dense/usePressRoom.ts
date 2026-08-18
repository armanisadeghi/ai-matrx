"use client";

/**
 * Press Room state: the data query, the clock, and the stall watch.
 *
 * The clock is a real dependency here, not a detail. Every deadline on this
 * surface is rendered relative to "now", so "now" has to advance on its own —
 * a countdown that only updates when React happens to re-render is a countdown
 * that lies. It ticks once a minute (the finest granularity the UI shows) and
 * is passed down as a number so every derivation is pure and testable.
 */

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import type { PressRoomBundle } from "./fixtures";
import { loadPressRoom, type PressRoomScenario } from "./source";

/** Ticks every `intervalMs`, aligned so the first tick lands on the boundary. */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

/**
 * True once a fetch has been in flight longer than `afterMs`.
 *
 * Ground-rules §1: a read that goes quiet for 20 seconds must be visible as
 * "still working", not as a spinner the user starts to distrust.
 */
export function useStallWatch(active: boolean, afterMs = 8_000): boolean {
  const [stalled, setStalled] = useState(false);

  // The flag is only ever RAISED asynchronously (the timer) and only ever
  // LOWERED in cleanup — never synchronously in the effect body, which is a
  // cascading render. `active &&` is the second guard, so a read that ends
  // before cleanup runs cannot leave the notice on screen for a frame.
  useEffect(() => {
    if (!active) return;
    const id = window.setTimeout(() => setStalled(true), afterMs);
    return () => {
      window.clearTimeout(id);
      setStalled(false);
    };
  }, [active, afterMs]);

  return active && stalled;
}

export interface PressRoomQuery {
  data: PressRoomBundle | undefined;
  isPending: boolean;
  isFetching: boolean;
  error: unknown;
  refetch: () => void;
  /** the read is still running and has been for a while */
  stalled: boolean;
  /** ms timestamp of the last successful read, or null */
  updatedAt: number | null;
}

export function usePressRoom(scenario: PressRoomScenario): PressRoomQuery {
  const query = useQuery({
    queryKey: ["marketing", "pr", "press-room", scenario],
    queryFn: ({ signal }) => loadPressRoom(scenario, signal),
    staleTime: 60_000,
    retry: false,
  });

  const stalled = useStallWatch(query.isFetching);

  return {
    data: query.data,
    isPending: query.isPending,
    isFetching: query.isFetching,
    error: query.error,
    refetch: () => {
      void query.refetch();
    },
    stalled,
    updatedAt: query.dataUpdatedAt || null,
  };
}
