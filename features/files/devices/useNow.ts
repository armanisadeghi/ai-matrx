/**
 * features/files/devices/useNow.ts
 *
 * A clock the render can read. Everything on this screen is relative to now —
 * "silent since", "synced 4m ago" — and `Date.now()` in a render body is an
 * impure read the React Compiler is right to refuse: the same props would
 * render differently on every pass, and the value would then freeze until
 * something else happened to re-render.
 *
 * So the time is state, ticked on an interval, and "4m ago" keeps counting
 * while somebody watches a device come back.
 */

"use client";

import { useEffect, useState } from "react";

/** One tick a minute is enough for every relative label this surface shows. */
const TICK_MS = 30_000;

export function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, []);
  return now;
}
