"use client";

/**
 * WHICH LANE OF THE "ADD RULES FROM A SOURCE" DIALOG IS ALREADY RUNNING.
 *
 * ## The defect this closes (Bugbot HIGH, 2026-09-13, follow-up to 64c163d6)
 *
 * That commit gave the timeline lane its own durable-run surface, so a case
 * distillation stopped sharing the paste/upload lane's pointer. But only ONE
 * `IngestSourceDialog` is mounted on the Rulebook page, and its surface follows
 * the lane the URL or the in-page picker currently names. So after a refresh
 * that names no lane — the ordinary case: the person reloads `/masterwork/[id]`
 * while a case is being distilled — the dialog mounted on `ingest`, watched the
 * ingest pointer, found nothing, and said nothing. The timeline run was still
 * going on the server, invisible, and the Start button was live again: the
 * Expert could pay for the same distillation twice. Splitting the pointers
 * without teaching the page to look at BOTH of them just moved the hiding place.
 *
 * ## The rule
 *
 * A page that owns several run surfaces rejoins whichever one is LIVE, not the
 * one its current state happens to name. The lane the URL or the picker asks
 * for still wins when there is one — an explicit request is never overridden;
 * this only answers "and if nobody asked?".
 */

import { peekDurableRun } from "@/lib/durable-run/useDurableRun";
import { useEffect, useState } from "react";

import type { IngestLane } from "../browse/approachLane";
import {
  MASTERWORK_RUN_WIRE,
  type MasterworkRunSurface,
} from "./useMasterworkRun";

/**
 * The surfaces `IngestSourceDialog` can mount on, and the lane each one is
 * entered by. `source` stands for the whole `ingest` surface: paste, exemplar
 * and upload are one pointer on purpose (one dialog, one running state), so
 * rejoining any of them lands on the dialog's own default lane.
 */
const LANE_BY_SURFACE: Record<"ingest" | "timeline", IngestLane> = {
  ingest: "source",
  timeline: "timeline",
};

/** The surface a lane of this dialog launches on — the dialog's own rule. */
export function surfaceForIngestLane(
  lane: IngestLane | null,
): Extract<MasterworkRunSurface, "ingest" | "timeline"> {
  return lane === "timeline" ? "timeline" : "ingest";
}

/**
 * The lane of this Rulebook that has a run still in flight, or null. When both
 * pointers are live (two tabs, two lanes) the most recently started one wins —
 * it is the one the person is most likely looking for.
 */
export function findLiveIngestLane(
  rulebookId: string | null,
): IngestLane | null {
  if (!rulebookId) return null;
  let best: { lane: IngestLane; startedAt: number } | null = null;
  for (const surface of ["ingest", "timeline"] as const) {
    const pointer = peekDurableRun(
      MASTERWORK_RUN_WIRE,
      `${surface}:${rulebookId}`,
    );
    if (!pointer?.live) continue;
    if (!best || pointer.startedAt > best.startedAt) {
      best = { lane: LANE_BY_SURFACE[surface], startedAt: pointer.startedAt };
    }
  }
  return best?.lane ?? null;
}

/**
 * The same answer for a component. Read in an effect, never during render:
 * `localStorage` does not exist on the server and reading it while rendering
 * would differ between SSR and hydration.
 */
export function useLiveIngestLane(
  rulebookId: string | null,
): IngestLane | null {
  const [lane, setLane] = useState<IngestLane | null>(null);
  useEffect(() => {
    setLane(findLiveIngestLane(rulebookId));
  }, [rulebookId]);
  return lane;
}
