"use client";

/**
 * `useWaitingRuns` — the "waiting on you" inbox's data (census #38).
 *
 * `GET /runs/waiting` through the canonical typed `callApi`, plus the shared
 * run-announce channel so the list is live: a run that parks appears, a run
 * that gets answered leaves. The announce frames carry no snapshot of WHAT a
 * run is waiting for, so any announcement that could change the membership of
 * this list refetches the projection — the fetch is the truth, the frames are
 * the hint (`announce-channel.ts`).
 *
 * A failed read is a stated error, never an empty list: "nothing is waiting on
 * you" and "we could not check" are opposite answers, and showing the
 * reassuring one for the alarming one is the exact failure this inbox exists
 * to prevent.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { callApi } from "@/lib/api/call-api";

import { parseWaitingRuns, type WaitingRunRow } from "./waiting";
import { useRunAnnouncements } from "./useRunAnnouncements";

/** The two statuses this inbox is made of — see `waiting.ts`. */
const WAITING_STATUSES = new Set(["interrupted", "awaiting_input"]);

export interface WaitingRunsState {
  rows: WaitingRunRow[];
  loading: boolean;
  /** Set when the projection could not be read — never rendered as "all clear". */
  error: string | null;
  refresh: () => void;
}

export function useWaitingRuns(): WaitingRunsState {
  const dispatch = useAppDispatch();
  /**
   * THE HYDRATION RACE (the same one `useResultSchema` documents): every
   * backend transport calls `requireSelectedOrgId()`, which throws until
   * `appContext.organization_id` has hydrated. A fetch fired on mount alone is
   * refused on every cold load and never retried.
   */
  const organizationId = useAppSelector(selectOrganizationId);
  const [rows, setRows] = useState<WaitingRunRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generation, setGeneration] = useState(0);

  const refresh = useCallback(() => setGeneration((n) => n + 1), []);

  useEffect(() => {
    if (!organizationId) return undefined;
    let live = true;
    void (async () => {
      const result = await dispatch(callApi({ path: "/runs/waiting", method: "GET" }));
      if (!live) return;
      if (result.error) {
        setError(result.error.message || "Could not check what is waiting on you.");
      } else {
        setError(null);
        setRows(parseWaitingRuns(result.data));
      }
      setLoading(false);
    })();
    return () => {
      live = false;
    };
  }, [dispatch, organizationId, generation]);

  /**
   * Coalesced refetch. A single answered interrupt produces several
   * transitions in a second (`interrupted` → `running` → `completed`); firing
   * one projection read per frame would be three reads for one event.
   */
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleRefresh = useCallback(() => {
    if (timer.current !== null) return;
    timer.current = setTimeout(() => {
      timer.current = null;
      refresh();
    }, 400);
  }, [refresh]);

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  const known = useRef<Set<string>>(new Set());
  known.current = new Set(rows.map((row) => row.runId));

  useRunAnnouncements({
    onAnnounce: (event) => {
      // Refetch when a run ENTERS the waiting set, or when a run currently ON
      // the list moves at all (it may have just been answered and left). Every
      // other transition in the user's whole account is none of this list's
      // business — a busy account would otherwise refetch the inbox on every
      // node of every unrelated run.
      if (WAITING_STATUSES.has(event.status) || known.current.has(event.run_id)) {
        scheduleRefresh();
      }
    },
    // Every reconnect has a hole in it (the frames are ephemeral, with no
    // replay), so the snapshot is re-read on each open.
    onStatus: (status) => {
      if (status === "open") scheduleRefresh();
    },
  });

  return { rows, loading, error, refresh };
}
