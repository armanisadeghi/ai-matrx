"use client";

/**
 * `useWaitingRuns` — the "waiting on you" inbox's data (census #38).
 *
 * `GET /runs/waiting` through the canonical typed `callApi`, plus the shared
 * run-announce channel so the list is live: a run that parks appears, a run
 * that gets answered leaves. The fetch is the truth and announce frames are
 * the hint that the projection should be refreshed.
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
      if (WAITING_STATUSES.has(event.status) || known.current.has(event.run_id)) {
        scheduleRefresh();
      }
    },
    onStatus: (status) => {
      if (status === "open") scheduleRefresh();
    },
  });

  return { rows, loading, error, refresh };
}
