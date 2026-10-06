"use client";

// features/marketing/pr/useLandOnRecord.ts
//
// Bring the record a link opened (`?focus=`) into sight, on load and on reload — without ever
// fighting the person. The record may not exist on the first render (data still loading), and
// panels loading around it shift the layout, so landing is retried on the next renders; but only
// a few times and only in the first seconds. The earlier version retried on EVERY render until
// the record read as on screen, so a record it could not bring on screen was re-scrolled forever
// and the page moved under the pointer between press and release (walk 2026-10-05: real clicks
// did nothing). Guard: `__tests__/land-on-record.test.tsx`.

import { useEffect, useRef } from "react";

export const LAND_MAX_TRIES = 4;
export const LAND_WINDOW_MS = 4000;

export function useLandOnRecord(focusKey: string | null, findAnchor: () => Element | null): void {
  const landing = useRef<{ key: string; tries: number; since: number; done: boolean } | null>(null);
  useEffect(() => {
    if (!focusKey) return;
    if (landing.current?.key !== focusKey) {
      landing.current = { key: focusKey, tries: 0, since: Date.now(), done: false };
    }
    const state = landing.current;
    if (state.done) return;
    if (state.tries >= LAND_MAX_TRIES || Date.now() - state.since > LAND_WINDOW_MS) {
      state.done = true;
      return;
    }
    const anchor = findAnchor();
    if (!anchor) return; // not rendered yet; a later render tries again (within the budget)
    state.tries += 1;
    // Instant, never smooth: a smooth scroll is cancelled by the layout shifts around it.
    anchor.scrollIntoView({ block: "nearest" });
    const box = anchor.getBoundingClientRect();
    if (box.top < window.innerHeight && box.bottom > 0 && box.height > 0) state.done = true;
  });
}
