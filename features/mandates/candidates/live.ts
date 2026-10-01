"use client";

/**
 * Mandate Candidates — THE HEARTBEAT (verification V1 defect D3).
 *
 * Arman, 2026-09-28: "each one that comes in showing up as a count on the
 * mandate list and page". A count that only changes on a click or a reload
 * lies for minutes (V1 shot 05: a notice said "run 1 of 3 — failed" while the
 * tab still said "0 of 3 in"). Supabase Realtime Postgres Changes drop rows
 * while the socket claims to be connected (aidream memory
 * realtime-postgres-changes-drops-rows), so every screen that shows a
 * collecting candidate re-reads on a heartbeat WHILE work runs — and stops the
 * moment nothing is collecting.
 *
 *   useCandidatePollMs()        the interval — knob mandates.candidate_poll_seconds
 *                               (migrations/mnd_candidate_live_reads_2026_09_30.sql)
 *   useHeartbeat(active, beat)  one timer, paused while the tab is hidden, never
 *                               overlapping a read still in flight
 *   useLiveCandidateCell(...)   the list cell's live value: every cell on screen
 *                               shares ONE batched read (public.mnd_candidate_cells)
 */

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { supabase } from "@/utils/supabase/client";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/slices/userSlice";
import {
  ensureEffectiveKnob,
  peekEffectiveKnob,
  subscribeEffectiveKnob,
} from "@/lib/scoped-config/effectiveKnobs";
import type { MandateCandidateCell } from "@/features/mandates/admin-list/rpc";

export const CANDIDATE_POLL_KNOB = { feature: "mandates", key: "candidate_poll_seconds" } as const;

/**
 * The seeded default (10 s). Used only until the knob answers, or when it never
 * does — `useEffectiveKnob` names an unseeded knob loudly in the console.
 */
const SEEDED_POLL_SECONDS = 10;

/** Pure — a knob value → a safe interval in ms (the knob's own bounds 3–300 s). */
export function pollMsOf(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  const seconds = Number.isFinite(n) && n > 0 ? Math.min(Math.max(n, 3), 300) : SEEDED_POLL_SECONDS;
  return seconds * 1000;
}

/**
 * The heartbeat interval. The knob is read only when a screen actually has
 * something collecting (`enabled`), so a page with no live candidate never
 * asks for it.
 */
export function useCandidatePollMs(enabled = true): number {
  const userId = useAppSelector(selectUserId);
  const value = useSyncExternalStore(
    subscribeEffectiveKnob,
    // org-filter: platform-locked knob (overridable_by '{}'), no organization rung applies
    () => (enabled ? peekEffectiveKnob(null, userId, CANDIDATE_POLL_KNOB) : undefined),
    () => undefined,
  );
  useEffect(() => {
    if (!enabled || value !== undefined) return;
    void ensureEffectiveKnob(null, userId ?? null, CANDIDATE_POLL_KNOB).catch((error: unknown) => {
      console.error(
        "[mandate candidates] knob mandates.candidate_poll_seconds unread — refreshing every " +
          `${SEEDED_POLL_SECONDS} s (its seeded default). Seed the row to change it:`,
        error,
      );
    });
  }, [enabled, userId, value]);
  return pollMsOf(value);
}

/**
 * Calls `beat` every `intervalMs` while `active` and the page is visible.
 * `beat` returns a promise; the next beat waits for it, so a slow read (the
 * candidates door can take seconds on a cold stack) never stacks up.
 */
export function useHeartbeat(active: boolean, intervalMs: number, beat: () => Promise<unknown> | void): void {
  const beatRef = useRef(beat);
  useEffect(() => {
    beatRef.current = beat;
  }, [beat]);
  useEffect(() => {
    if (!active) return;
    let stopped = false;
    let inFlight = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      if (stopped) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(tick, intervalMs);
    };
    const tick = async () => {
      timer = null;
      if (stopped || inFlight) return;
      if (isHidden()) {
        schedule();
        return;
      }
      inFlight = true;
      try {
        await beatRef.current();
      } catch (error: unknown) {
        // The screen's own read reports its failure; the beat keeps going.
        console.warn("[mandate candidates] heartbeat read failed:", error);
      } finally {
        inFlight = false;
      }
      schedule();
    };
    // V2 N1: a page that comes back into view reads NOW. A hidden page skips
    // its beats (and the browser throttles its timers to about one a minute),
    // so without this a screen showed a stale "Collecting" card for up to a
    // minute after the person returned to it.
    const onVisible = () => {
      if (!isHidden() && !inFlight) void tick();
    };
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisible);
    schedule();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisible);
    };
  }, [active, intervalMs]);
}

function isHidden(): boolean {
  return typeof document !== "undefined" && document.visibilityState === "hidden";
}

// ── What keeps a screen re-reading (V2 N1) ───────────────────────────────────
// A candidate is terminal-for-now once it is ready, promoted, discarded or
// cancelled. Until then — even when every pair is in, because the judge's
// verdict and the server's recompute (status, recommendation, its reason) land
// after the last pair completes — every screen that shows it keeps re-reading.
// "All pairs in" is never the stop signal: it left a "2 of 2 in · Collecting"
// card with the previous recommendation on screen.

/** True while the candidate can still change by itself. */
export function candidateStillMoving(status: string | null | undefined): boolean {
  return status === "collecting";
}

/** True while one pair can still change by itself. */
export function pairStillMoving(status: string | null | undefined): boolean {
  return status === "queued" || status === "running";
}

// ── The list cells' shared live read ─────────────────────────────────────────

interface UntypedRpc {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

/** `{mandate_id: cell | null}` for up to 200 mandates — the admin list's own cell. */
export async function fetchCandidateCells(
  mandateIds: readonly string[],
): Promise<Record<string, MandateCandidateCell | null>> {
  if (mandateIds.length === 0) return {};
  const { data, error } = await (supabase as unknown as UntypedRpc).rpc("mnd_candidate_cells", {
    p_mandate_ids: mandateIds.slice(0, 200),
  });
  if (error) throw new Error(`Candidate counts: ${error.message}`);
  return (data ?? {}) as Record<string, MandateCandidateCell | null>;
}

/**
 * Newer answers from the heartbeat, keyed by mandate id. Each publish stores a
 * NEW entry object, so a cell's `useSyncExternalStore` snapshot changes exactly
 * when its own answer does (React Compiler memoizes render values on their
 * reactive inputs — a module variable read in render is not one, which is why
 * the cell read its entry through the store, not through a module counter).
 */
interface LiveCellEntry {
  version: number;
  cell: MandateCandidateCell | null;
}
const liveCells = new Map<string, LiveCellEntry>();
const cellListeners = new Set<() => void>();
let cellVersion = 0;

function publishCells(answer: Record<string, MandateCandidateCell | null>): void {
  cellVersion += 1;
  for (const [id, cell] of Object.entries(answer)) liveCells.set(id, { version: cellVersion, cell });
  for (const listener of cellListeners) listener();
}

function subscribeCells(listener: () => void): () => void {
  cellListeners.add(listener);
  return () => cellListeners.delete(listener);
}

/** Mandate ids whose cell is collecting, with how many cells on screen watch each. */
const watched = new Map<string, number>();
let cellTimer: ReturnType<typeof setTimeout> | null = null;
let cellIntervalMs = SEEDED_POLL_SECONDS * 1000;

function scheduleCells(): void {
  if (cellTimer || watched.size === 0) return;
  cellTimer = setTimeout(async () => {
    cellTimer = null;
    if (watched.size === 0) return;
    if (!isHidden()) await readCellsNow();
    scheduleCells();
  }, cellIntervalMs);
}

let cellReading = false;

async function readCellsNow(): Promise<void> {
  if (cellReading || watched.size === 0) return;
  cellReading = true;
  try {
    publishCells(await fetchCandidateCells([...watched.keys()]));
  } catch (error: unknown) {
    console.warn("[mandate candidates] list counts not refreshed:", error);
  } finally {
    cellReading = false;
  }
}

// The list cells' timer catches up the moment the page is seen again (V2 N1).
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (!isHidden() && watched.size > 0) void readCellsNow();
  });
}

function watchCell(mandateId: string, intervalMs: number): () => void {
  cellIntervalMs = intervalMs;
  watched.set(mandateId, (watched.get(mandateId) ?? 0) + 1);
  scheduleCells();
  return () => {
    const left = (watched.get(mandateId) ?? 1) - 1;
    if (left <= 0) watched.delete(mandateId);
    else watched.set(mandateId, left);
  };
}

/**
 * The cell as the list read answered it, replaced by any newer heartbeat
 * answer. Watched (and re-read) only while it is collecting.
 */
export function useLiveCandidateCell(
  mandateId: string | null,
  listCell: MandateCandidateCell | null | undefined,
): MandateCandidateCell | null | undefined {
  const pollMs = useCandidatePollMs(candidateStillMoving(listCell?.status));
  const entry = useSyncExternalStore(
    subscribeCells,
    () => (mandateId ? liveCells.get(mandateId) : undefined),
    () => undefined,
  );
  // The list's own answer wins until the heartbeat has read something newer
  // than it: a fresh page read resets what this cell shows.
  // Compared by VALUE: a list may hand a fresh row object on every render, and
  // an identity check would reset to the list's (older) answer every time.
  const listKey = listCell === undefined ? "unread" : JSON.stringify(listCell);
  const [baseline, setBaseline] = useState(listKey);
  const [seenAt, setSeenAt] = useState(cellVersion);
  if (baseline !== listKey) {
    setBaseline(listKey);
    setSeenAt(cellVersion);
  }
  const live = entry && entry.version > seenAt ? entry.cell : listCell;
  const collecting = Boolean(mandateId) && candidateStillMoving(live?.status);
  useEffect(() => {
    if (!collecting || !mandateId) return;
    return watchCell(mandateId, pollMs);
  }, [collecting, mandateId, pollMs]);
  return live;
}
