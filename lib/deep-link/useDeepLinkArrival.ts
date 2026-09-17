"use client";

// lib/deep-link/useDeepLinkArrival.ts
//
// A "COME BACK AND FINISH THIS" LINK OPENS EVERY TIME IT IS VISITED.
//
// ## The defect this closes (Masterwork cold walk 6, 2026-09-17, findings 4+5)
//
// Every deep link on the Masterwork Rulebook page was wired the same way:
//
//     const dripDeepLink = searchParams.get("drip") === "1";
//     const dripDeepLinkRef = useRef(false);
//     useEffect(() => {
//       if (!dripDeepLink || dripDeepLinkRef.current || !rulebook?.id) return;
//       dripDeepLinkRef.current = true;
//       setDripOpen(true);
//     }, [dripDeepLink, rulebook?.id, setDripOpen]);
//
// The ref latches ONCE PER MOUNT, and `/masterwork/[id]` is one component
// instance that does not remount across client-side navigation. So the second
// visit to the same link did nothing at all: the Expert followed
// `?drip=1` — the link the product itself sends her in a reminder — and landed
// on the plain Rulebook page with no dialog, no error and nothing on screen
// admitting anything had failed to open. The walk found it on the Daily Drip
// and on the Red-Pen lane, on one root cause, across seventeen identical
// latches.
//
// ## The rule
//
// A deep link is an ARRIVAL, not a lifetime flag. It fires when the URL starts
// asking for the surface, and it re-arms the moment the URL stops asking — so
// away-and-back opens it again, while a dialog the person closed with the
// param still in the URL stays closed until they actually leave and return.
//
// It never fires while `ready` is false (the record it needs has not loaded),
// and it fires exactly once for that arrival when `ready` turns true.

import { useEffect, useRef } from "react";

/**
 * Run `onArrive` once per arrival at a deep link.
 *
 * @param asking  is the URL asking for this surface right now (`?drip=1`)
 * @param ready   may we act yet — usually "the record has loaded". While this
 *                is false the arrival is HELD, never dropped: it fires as soon
 *                as it turns true.
 * @param onArrive what to open. Keep it stable (a setState setter is fine);
 *                 it is read through a ref, so an inline closure never
 *                 re-triggers the arrival.
 */
export function useDeepLinkArrival(
  asking: boolean,
  ready: boolean,
  onArrive: () => void,
): void {
  const handled = useRef(false);
  const latest = useRef(onArrive);
  latest.current = onArrive;

  useEffect(() => {
    // THE RE-ARM. The URL stopped asking, so the next time it asks is a new
    // arrival — this is the whole difference from the `useRef(false)` latch
    // this primitive replaces.
    if (!asking) {
      handled.current = false;
      return;
    }
    if (handled.current || !ready) return;
    handled.current = true;
    latest.current();
  }, [asking, ready]);
}
