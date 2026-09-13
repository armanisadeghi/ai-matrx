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

/**
 * The lane an explicit "add rules from a source" door opens on. Every door that
 * is not the rejoin path names a lane — that is what keeps a stale probe from
 * ever choosing the pipeline a person's click starts.
 */
export const DEFAULT_INGEST_LANE: IngestLane = "source";

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
 * How often the held answer is re-checked. A run settling is not an event this
 * module can hear — `useDurableRun` marks the pointer `settled` in the tab that
 * owns the run — so the probe re-reads instead. Two cheap `localStorage` reads
 * on a five-second beat, only while the tab is visible.
 */
const PROBE_INTERVAL_MS = 5_000;

/**
 * The same answer for a component, kept CURRENT.
 *
 * 🚨 A LIVE FACT, NEVER A MOUNT-TIME SNAPSHOT (Bugbot, 2026-09-13). The first
 * version read the pointers once, so a lane that was in flight at mount stayed
 * selected forever: after a refresh that rejoined a case distillation, the
 * Rulebook page went on treating `timeline` as the dialog's lane long after
 * that run had finished, and anything that opened the dialog without naming a
 * lane got the case pipeline. The answer now clears within one beat of the run
 * settling — and the page's explicit doors ("From a source", the assist
 * `open: "ingest"` chip, the Approach picker) name their own lane and outrank
 * this entirely, so the probe only ever answers "nobody asked, and something is
 * still running".
 *
 * Read in an effect, never during render: `localStorage` does not exist on the
 * server and reading it while rendering would differ between SSR and hydration.
 */
export function useLiveIngestLane(
  rulebookId: string | null,
): IngestLane | null {
  const [lane, setLane] = useState<IngestLane | null>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const probe = () => setLane(findLiveIngestLane(rulebookId));
    probe();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "hidden") return;
      probe();
    }, PROBE_INTERVAL_MS);
    // Another tab launching or finishing a run for this Rulebook writes the
    // same pointer; `storage` is that news arriving for free.
    window.addEventListener("storage", probe);
    window.addEventListener("focus", probe);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("storage", probe);
      window.removeEventListener("focus", probe);
    };
  }, [rulebookId]);
  return lane;
}
