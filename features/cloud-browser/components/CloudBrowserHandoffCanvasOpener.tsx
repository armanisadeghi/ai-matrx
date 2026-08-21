"use client";

/**
 * CloudBrowserHandoffCanvasOpener — the AGENT-INITIATED open.
 *
 * A headless watcher: when a run raises a human-handoff (`handoff.state ===
 * "requested"`), the Cloud Browser opens in the canvas so the person can step
 * in — no spinner, no waiting for the user to go find the panel. This is the
 * agent → surface half of the two triggers (the other is the composer's
 * "work in a cloud browser" pill). It uses the ONE canvas opener, so the agent
 * and the human land on the exact same surface.
 *
 * It opens once per handoff id (a returned/expired handoff never re-opens the
 * canvas behind the user). Mount it anywhere that lives for the length of a
 * chat; it renders nothing.
 *
 * The stream→slice seam is CLOSED (2026-08-21): `process-stream` reads a
 * `human_required` cloud-browser tool result and dispatches
 * `adoptCloudBrowserRunFromStream`, which hydrates the slice from the real
 * handoff row. So this fires even when the panel has never been opened — which
 * is the whole point of an agent-initiated open.
 */

import { useEffect, useRef } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectHandoff, selectRun } from "../redux/selectors";
import { useOpenCloudBrowserCanvas } from "../hooks/useOpenCloudBrowserCanvas";

export function CloudBrowserHandoffCanvasOpener({
  conversationId,
}: {
  /** The chat this watcher lives in — carried into the canvas so taking control
   *  can steer the running agent (`useCloudBrowserTakeover`). */
  conversationId?: string;
} = {}): null {
  const handoff = useAppSelector(selectHandoff);
  const run = useAppSelector(selectRun);
  const openCanvas = useOpenCloudBrowserCanvas();
  const openedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!handoff || handoff.state !== "requested") return;
    if (openedFor.current === handoff.id) return;
    openedFor.current = handoff.id;
    openCanvas({
      initialProfileId: run?.profileId ?? undefined,
      runId: run?.id ?? undefined,
      conversationId,
    });
  }, [handoff, run?.id, run?.profileId, openCanvas, conversationId]);

  return null;
}

export default CloudBrowserHandoffCanvasOpener;
