"use client";

// useDiscoverRotation — picks which slice of the Discover pool to show so the
// user sees something different over time, plus a manual "show more" cycle.
//
// Variation comes from three SSR-safe sources, summed:
//   • dayIndex   — rotates the starting window once per day (computed in a
//                  useState initializer so server + hydration agree; the only
//                  mismatch risk is the sub-ms day boundary, negligible).
//   • mountSeed  — a module-scoped cursor that advances on each mount, so a
//                  second in-session visit to /dashboard shows a fresh window.
//                  Read in a useState initializer → first page load is 0 on
//                  both server and client, so initial HTML matches.
//   • bump       — user clicks of "Show more".
// The window wraps around the pool, so cycling always lands on real items.

import { useState } from "react";

// Survives client-side navigations within a session; resets on hard reload.
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
  const [dayIndex] = useState(() => Math.floor(Date.now() / 86_400_000));
  const [mountSeed] = useState(() => {
    const s = mountCursor;
    mountCursor += 1;
    return s;
  });
  const [bump, setBump] = useState(0);

  const start = (dayIndex + mountSeed + bump) * windowSize;

  return {
    items: windowSlice(pool, start, windowSize),
    showMore: () => setBump((b) => b + 1),
  };
}
