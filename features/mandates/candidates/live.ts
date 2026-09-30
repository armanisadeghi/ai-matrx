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
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      if (stopped) return;
      timer = setTimeout(tick, intervalMs);
    };
    const tick = async () => {
      if (stopped) return;
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        schedule();
        return;
      }
      try {
        await beatRef.current();
      } catch (error: unknown) {
        // The screen's own read reports its failure; the beat keeps going.
        console.warn("[mandate candidates] heartbeat read failed:", error);
      }
      schedule();
    };
    schedule();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [active, intervalMs]);
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

/** Newer answers from the heartbeat, keyed by mandate id. */
const liveCells = new Map<string, MandateCandidateCell | null>();
const cellListeners = new Set<() => void>();
let cellVersion = 0;

function publishCells(answer: Record<string, MandateCandidateCell | null>): void {
  for (const [id, cell] of Object.entries(answer)) liveCells.set(id, cell);
  cellVersion += 1;
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
    if (typeof document === "undefined" || document.visibilityState !== "hidden") {
      try {
        publishCells(await fetchCandidateCells([...watched.keys()]));
      } catch (error: unknown) {
        console.warn("[mandate candidates] list counts not refreshed:", error);
      }
    }
    scheduleCells();
  }, cellIntervalMs);
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
  const pollMs = useCandidatePollMs(listCell?.status === "collecting");
  useSyncExternalStore(subscribeCells, () => cellVersion, () => 0);
  // The list's own answer wins until the heartbeat has read something newer
  // than it: a fresh page read resets what this cell shows.
  const [baseline, setBaseline] = useState(listCell);
  const [seenAt, setSeenAt] = useState(cellVersion);
  if (baseline !== listCell) {
    setBaseline(listCell);
    setSeenAt(cellVersion);
  }
  const live = mandateId && cellVersion > seenAt && liveCells.has(mandateId) ? liveCells.get(mandateId) : listCell;
  const collecting = Boolean(mandateId) && live?.status === "collecting";
  useEffect(() => {
    if (!collecting || !mandateId) return;
    return watchCell(mandateId, pollMs);
  }, [collecting, mandateId, pollMs]);
  return live;
}
