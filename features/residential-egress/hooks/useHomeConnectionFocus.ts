/**
 * features/residential-egress/hooks/useHomeConnectionFocus.ts
 *
 * `?computer=<id>` — bringing ONE computer into view on the devices list.
 *
 * WHY THIS EXISTS: the helper's tray menu has an item that means "take me to
 * this computer" and it opens the devices list with the computer's id in the
 * query. Nothing read it, so the link landed on a list of several cards with
 * no indication of which one the person had just clicked — a door that opens
 * onto the right room and points at nothing.
 *
 * THE FOCUS RUNS ONCE PER ID, AND ONLY WHEN THE ROW IS ON SCREEN. Rows arrive
 * asynchronously (a table read, then a realtime re-read), so the effect is
 * allowed to find nothing and try again on the next render; once it has
 * scrolled to an id it never scrolls again for that id, so a realtime
 * heartbeat cannot yank the page back under someone who has since scrolled
 * away.
 *
 * A requested computer that is NOT in the list is not silently ignored — the
 * caller is told (`requested` plus its own knowledge of the rows), because a
 * link that lands on a page with nothing to show must say so.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

import { HOME_CONNECTION_FOCUS_PARAM } from "../types";

/** How long the ring stays up. Long enough to find, short enough not to nag. */
const HIGHLIGHT_MS = 2600;

export interface HomeConnectionFocus {
  /** The id the URL asked for, or null. */
  requested: string | null;
  /** The id currently wearing the ring, or null. */
  highlighted: string | null;
  /** `ref={focus.register(id)}` on whatever element should scroll into view. */
  register: (deviceId: string) => (node: HTMLElement | null) => void;
}

export function useHomeConnectionFocus(
  /**
   * Anything that changes when the rows change (an id list, a count). The
   * effect re-runs on it, which is how a focus request placed before the read
   * finished gets its second chance.
   */
  rowsKey: string,
  /**
   * 🚨 TRUE ONLY WHEN EVERY LIST ON THE PAGE HAS FINISHED LOADING. This page
   * is fed by TWO reads, and the home connections answer first: scrolling the
   * moment the row exists put the ring on a row that was still at the top of a
   * half-built page (so the scroll was a no-op), and the device cards then
   * loaded ABOVE it and pushed it out of sight. Measured on the preview host,
   * 2026-09-18. A scroll is only meaningful once the layout it scrolls through
   * is real.
   */
  ready: boolean,
): HomeConnectionFocus {
  const searchParams = useSearchParams();
  const raw = searchParams.get(HOME_CONNECTION_FOCUS_PARAM);
  const requested = raw && raw.trim() ? raw.trim() : null;

  const nodes = useRef(new Map<string, HTMLElement>());
  const settledFor = useRef<string | null>(null);
  const [highlighted, setHighlighted] = useState<string | null>(null);

  const register = useCallback(
    (deviceId: string) => (node: HTMLElement | null) => {
      if (node) nodes.current.set(deviceId, node);
      else nodes.current.delete(deviceId);
    },
    [],
  );

  useEffect(() => {
    if (!ready || !requested || settledFor.current === requested) return undefined;
    const node = nodes.current.get(requested);
    if (!node) return undefined;
    settledFor.current = requested;
    // INSTANT, not smooth. A deep link is a destination, not a tour: the
    // person clicked "take me to this computer" and the ring — not the
    // travelling — is what tells them which one it is. Smooth also proved
    // unreliable here: the animation is deferred while the tab is in the
    // background, so the row that was supposed to be centred sat off-screen
    // for seconds (measured on the preview host, 2026-09-18).
    node.scrollIntoView({ block: "center" });
    setHighlighted(requested);
    const timer = setTimeout(() => setHighlighted(null), HIGHLIGHT_MS);
    return () => clearTimeout(timer);
  }, [requested, rowsKey, ready]);

  return { requested, highlighted, register };
}
