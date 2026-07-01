"use client";

// useDiscoverRotation — picks which slice of the Discover pool to show so the
// user sees something different over time, plus a manual "show more" cycle.
//
// SSR-safety is the load-bearing constraint here. The FIRST render must be
// byte-identical on the server and during client hydration, otherwise React
// throws a hydration mismatch. So all per-visit variation is applied AFTER
// mount, in an effect, never during the initial render.
//
// Variation sources, summed into the window start:
//   • dayIndex   — rotates the starting window once per day. Applied only after
//                  mount so the SSR/hydration pair always agrees on day 0.
//   • mountSeed  — a module-scoped cursor that advances once per mount, so a
//                  second in-session visit to /dashboard shows a fresh window.
//                  Also applied only after mount (the module counter is mutated
//                  in an effect, never during render — server render must stay
//                  pure/deterministic across requests).
//   • bump       — user clicks of "Show more".
// The window wraps around the pool, so cycling always lands on real items.

import { useEffect, useState } from "react";

// Survives client-side navigations within a session; resets on hard reload.
// Only ever mutated on the client (inside an effect), so server renders stay
// deterministic and match hydration.
let mountCursor = 0;

function windowSlice<T>(pool: T[], start: number, size: number): T[] {
  const len = pool.length;
  if (len === 0) return [];
  const n = Math.min(size, len);
  const s = ((start % len) + len) % len;
  const out: T[] = [];
  for (let i = 0; i < n; i++) out.push(pool[(s + i) % len]);
  return out;
}

export interface DiscoverRotation<T> {
  items: T[];
  /** Advance to the next window. */
  showMore: () => void;
}

export function useDiscoverRotation<T>(
  pool: T[],
  windowSize: number,
): DiscoverRotation<T> {
  // Deterministic first render (server + hydration): window offset 0.
  const [offset, setOffset] = useState(0);
  const [bump, setBump] = useState(0);

  // After hydration, roll the window forward by the day index + this mount's
  // seed. Runs once per mount, on the client only, so it can never diverge from
  // the server-rendered HTML.
  useEffect(() => {
    const dayIndex = Math.floor(Date.now() / 86_400_000);
    const mountSeed = mountCursor;
    mountCursor += 1;
    setOffset(dayIndex + mountSeed);
  }, []);

  const start = (offset + bump) * windowSize;

  return {
    items: windowSlice(pool, start, windowSize),
    showMore: () => setBump((b) => b + 1),
  };
}
