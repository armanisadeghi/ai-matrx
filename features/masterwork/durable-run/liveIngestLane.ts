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
import { useCallback, useEffect, useState } from "react";

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
export interface LiveIngestProbe {
  /** The lane with a run still in flight, or null. */
  lane: IngestLane | null;
  /**
   * Has the probe actually READ storage yet? On the very first paint it has
   * not — effects have not run — and `lane` is null for that reason, not
   * because nothing is running. Anything that DECIDES on the lane must wait for
   * this, or it decides against a value that means "not asked yet" (Bugbot,
   * 2026-09-13: the dialog mounted on `ingest` on first paint, rejoined
   * whatever was on that pointer, and latched `source` over a newer case).
   */
  probed: boolean;
}

export function useLiveIngestLane(rulebookId: string | null): LiveIngestProbe {
  const [probe, setProbe] = useState<LiveIngestProbe>({
    lane: null,
    probed: false,
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    const read = () =>
      setProbe({ lane: findLiveIngestLane(rulebookId), probed: true });
    read();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "hidden") return;
      read();
    }, PROBE_INTERVAL_MS);
    // Another tab launching or finishing a run for this Rulebook writes the
    // same pointer; `storage` is that news arriving for free.
    window.addEventListener("storage", read);
    window.addEventListener("focus", read);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("storage", read);
      window.removeEventListener("focus", read);
    };
  }, [rulebookId]);
  return probe;
}

/**
 * THE INGEST DIALOG SESSION — one lane, owned from open to close.
 *
 * ## The defect this closes (Bugbot HIGH, 2026-09-13)
 *
 * The lane was re-derived on every render from three sources at once (an
 * explicit request, the `?ingest=` param, and the probe above). The dialog
 * mounts on ONE durable-run surface chosen by that lane, so the lane is not a
 * preference — it is the identity of what is on screen, and it was allowed to
 * change UNDERNEATH an open dialog. After a refresh rejoined a case
 * distillation, the probe held `timeline` only until the run settled; a beat
 * later it reported nothing, the dialog remounted onto an empty source form,
 * and the finished summary the person was reading was gone. The mirror defect:
 * an explicitly requested lane was never cleared, so one click on "From a
 * source" outranked the probe for the rest of the session and a case started in
 * another tab was never rejoined.
 *
 * ## The rule
 *
 * Resolve the lane ONCE, at open time, and latch it for the life of that open
 * dialog. Closing clears the latch, so the next open resolves from scratch.
 * While closed the dialog still follows the probe — that is how a run started
 * before a refresh is picked back up — and while open the probe is ignored.
 * `lane`, `open` and `timelineOpen` all read the one latched value, so the
 * remount key, the dialog's `initialLane` and the agent surface scope cannot
 * disagree about what is on screen.
 */
export interface IngestDialogSession {
  /** The lane this open session was opened on; null when the dialog is closed. */
  session: IngestLane | null;
  /** The lane on screen: latched while open, the probe's answer while closed. */
  lane: IngestLane | null;
  open: boolean;
  /**
   * Has the live-run probe answered once? The dialog must not MOUNT before it
   * has: the surface a mount watches is chosen by the lane, so mounting
   * against "not asked yet" watches the ingest pointer and can rejoin — and
   * then latch — the wrong run.
   */
  ready: boolean;
  /** `workspace_state.timeline_open` — true only for a timeline session. */
  timelineOpen: boolean;
  /** An explicit door: open on THIS lane, whatever the probe is holding. */
  openOn: (lane: IngestLane) => void;
  /** The dialog opening itself (a rejoin) or closing; closing clears the latch. */
  setOpen: (next: boolean) => void;
}

export function useIngestDialogSession(
  rulebookId: string | null,
): IngestDialogSession {
  const probe = useLiveIngestLane(rulebookId);
  const [session, setSession] = useState<IngestLane | null>(null);
  const lane = session ?? probe.lane;
  const openOn = useCallback((next: IngestLane) => setSession(next), []);
  /**
   * 🚨 THE OPEN PATH RESOLVES FROM THE LIVE POINTERS, AT THIS INSTANT, AND
   * NEVER OVERWRITES A SESSION (Bugbot HIGH, 2026-09-13).
   *
   * This used to latch `lane ?? DEFAULT_INGEST_LANE` off the render closure.
   * Both halves were wrong. The closure's `lane` is whatever the last render
   * saw — on the first paint, before any effect has run, that is `null`, which
   * means "not asked yet" and was read as "nothing is running", so a rejoin
   * latched `source` while a case was in flight. And a plain `setOpen(true)`
   * arriving in the same tick as an explicit `openOn("timeline")` (a
   * `?ingest=timeline` deep link, and the dialog rejoining itself) overwrote
   * the lane the person actually asked for, because it stamped its own answer
   * instead of deferring to the session that already existed.
   *
   * So: a functional update reads the CURRENT session — already set means
   * nothing to decide — and otherwise `findLiveIngestLane` reads storage right
   * now rather than trusting a snapshot.
   */
  const setOpen = useCallback(
    (next: boolean) => {
      if (!next) {
        setSession(null);
        return;
      }
      setSession(
        (current) =>
          current ?? findLiveIngestLane(rulebookId) ?? DEFAULT_INGEST_LANE,
      );
    },
    [rulebookId],
  );
  return {
    session,
    lane,
    open: session !== null,
    ready: probe.probed,
    timelineOpen: session === "timeline",
    openOn,
    setOpen,
  };
}
