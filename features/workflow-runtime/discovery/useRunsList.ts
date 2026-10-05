"use client";

/**
 * `useRunsList` — the runs lists' data (census #39), global and per-workflow.
 *
 * Two endpoints, one hook, because they answer with the same row shape:
 * `GET /runs` for every run the caller can see, `GET /workflows/{id}/runs` for
 * one workflow's history. Which one is a `definitionId` away.
 *
 * Live without polling: a status transition on a row already listed is patched
 * IN PLACE from the announce frame (no refetch, no flicker, no scroll jump); a
 * run this list has never seen refetches, because an announcement carries no
 * timestamps and a new row cannot be invented from it.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { useAppDispatch } from "@/lib/redux/hooks";

import { fetchRuns } from "./fetchRuns";
import { applyAnnouncement, type RunListRow } from "./runs";
import { useRunAnnouncements } from "./useRunAnnouncements";

export interface RunsListState {
  rows: RunListRow[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export interface UseRunsListOptions {
  /** Omit for the global list; pass a workflow id for that workflow's history. */
  definitionId?: string;
  /** The on-page organization filter (global list only); null/omitted = All organizations. */
  organizationId?: string | null;
}

export function useRunsList({ definitionId, organizationId }: UseRunsListOptions = {}): RunsListState {
  const dispatch = useAppDispatch();
  // 🚨 A LIST IS DECIDED BY ACCESS, NEVER BY THE SELECTED ORGANIZATION
  // (common-docs/policies/access-ladder.md). `GET /runs` answers
  // the person's runs in EVERY organization with none selected (callApi sends
  // a read without one), so this list never waits for, gates on, or refetches
  // with the header's organization. Arman, 2026-09-25: "I can't find my
  // workflows because it's filtering by org."
  const [rows, setRows] = useState<RunListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generation, setGeneration] = useState(0);

  const refresh = useCallback(() => setGeneration((n) => n + 1), []);

  useEffect(() => {
    let live = true;
    void (async () => {
      const result = await fetchRuns(dispatch, definitionId, organizationId);
      if (!live) return;
      if (!result.ok) {
        setError(result.message);
      } else {
        setError(null);
        setRows(result.rows);
      }
      setLoading(false);
    })();
    return () => {
      live = false;
    };
  }, [dispatch, definitionId, organizationId, generation]);

  /** Coalesced refetch — a burst of transitions is one read, not one each. */
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

  // A per-workflow list ignores runs of every other workflow. The announce
  // frame names the workflow, so the filter costs nothing and saves a refetch
  // per unrelated run in a busy account.
  const scoped = definitionId ?? null;

  useRunAnnouncements({
    onAnnounce: (event) => {
      if (scoped !== null && event.workflow_id !== scoped) return;
      // A filtered list refetches on a run it has not seen (the server decides membership).
      setRows((current) => {
        const { rows: next, needsRefresh } = applyAnnouncement(current, event);
        if (needsRefresh) scheduleRefresh();
        return next;
      });
    },
    onStatus: (status) => {
      if (status === "open") scheduleRefresh();
    },
  });

  return { rows, loading, error, refresh };
}
