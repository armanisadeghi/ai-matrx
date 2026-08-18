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
 * NOTE (go-live seam): `handoff` is populated by `hydrateSnapshot`, which today
 * runs while a Cloud Browser hook is mounted. To fire BEFORE the panel is ever
 * opened, the chat stream's `human_required` tool event must dispatch the
 * handoff into `cloudBrowserSlice` — that stream→slice subscription is the
 * remaining connection (the scraper/tool rows are not live offline).
 */

import { useEffect, useRef } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectHandoff, selectRun } from "../redux/selectors";
import { useOpenCloudBrowserCanvas } from "../hooks/useOpenCloudBrowserCanvas";

export function CloudBrowserHandoffCanvasOpener(): null {
  const handoff = useAppSelector(selectHandoff);
  const run = useAppSelector(selectRun);
  const openCanvas = useOpenCloudBrowserCanvas();
  const openedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!handoff || handoff.state !== "requested") return;
    if (openedFor.current === handoff.id) return;
    openedFor.current = handoff.id;
    openCanvas({ initialProfileId: run?.profileId ?? undefined, runId: run?.id ?? undefined });
  }, [handoff, run?.id, run?.profileId, openCanvas]);

  return null;
}

export default CloudBrowserHandoffCanvasOpener;
