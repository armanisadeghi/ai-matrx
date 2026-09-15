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
import { selectCloudBrowserRunLive } from "../redux/cloudBrowserSlice";
import {
  useOfferCloudBrowserCanvas,
  useOpenCloudBrowserCanvas,
} from "../hooks/useOpenCloudBrowserCanvas";
import { keepLiveSourceReachable } from "@/features/canvas/liveSourceReachability";

export function CloudBrowserHandoffCanvasOpener({
  conversationId,
}: {
  /** The chat this watcher lives in — carried into the canvas so taking control
   *  can steer the running agent (`useCloudBrowserTakeover`). */
  conversationId?: string;
} = {}): null {
  const handoff = useAppSelector(selectHandoff);
  const run = useAppSelector(selectRun);
  const runIsLive = useAppSelector(selectCloudBrowserRunLive);
  const openCanvas = useOpenCloudBrowserCanvas();
  const offerCanvas = useOfferCloudBrowserCanvas();
  const openedFor = useRef<string | null>(null);

  useEffect(() => {
    const pendingHandoff =
      handoff && handoff.state === "requested" ? handoff : null;
    const wantsScreen =
      !!pendingHandoff && openedFor.current !== pendingHandoff.id;

    // A live browser session is a LIVE SOURCE: nothing in the database can
    // rebuild its pane, so while the run exists this surface keeps a door to
    // it in the canvas switcher. Without that, a reload mid-run leaves the
    // running browser reachable only by starting another one — the same class
    // that stranded the Sandbox pane on 2026-09-15.
    // A requested handoff is itself proof the session is live, so a slice that
    // has the handoff but not yet the run row can still open the pane — this
    // must never become a new way for the agent-initiated open to go missing.
    const sourceExists = runIsLive || !!pendingHandoff;
    const action = keepLiveSourceReachable(
      wantsScreen ? "open" : "none",
      sourceExists,
    );
    if (action === "none") return;

    const opts = {
      initialProfileId: run?.profileId ?? undefined,
      runId: run?.id ?? undefined,
      conversationId,
    };
    if (action === "open" && pendingHandoff) {
      openedFor.current = pendingHandoff.id;
      openCanvas(opts);
      return;
    }
    offerCanvas(opts);
  }, [
    handoff,
    runIsLive,
    run?.id,
    run?.profileId,
    openCanvas,
    offerCanvas,
    conversationId,
  ]);

  return null;
}

export default CloudBrowserHandoffCanvasOpener;
