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

import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { callApi } from "@/lib/api/call-api";

import { applyAnnouncement, parseRunListRows, type RunListRow } from "./runs";
import { useRunAnnouncements } from "./useRunAnnouncements";

/**
 * One page, bounded. These lists are a screen a person reads, not an export;
 * the server caps `/runs` at 500 and this asks for a page well inside it.
 */
const PAGE_SIZE = 100;

export interface RunsListState {
  rows: RunListRow[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export interface UseRunsListOptions {
  /** Omit for the global list; pass a workflow id for that workflow's history. */
  definitionId?: string;
}

export function useRunsList({ definitionId }: UseRunsListOptions = {}): RunsListState {
  const dispatch = useAppDispatch();
  // The hydration race — see useWaitingRuns / useResultSchema.
  const organizationId = useAppSelector(selectOrganizationId);
  const [rows, setRows] = useState<RunListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generation, setGeneration] = useState(0);

  const refresh = useCallback(() => setGeneration((n) => n + 1), []);

  useEffect(() => {
    if (!organizationId) return undefined;
    let live = true;
    void (async () => {
      const result = definitionId
        ? await dispatch(
            callApi({
              path: "/workflows/{definition_id}/runs",
              method: "GET",
              pathParams: { definition_id: definitionId },
              queryParams: { limit: PAGE_SIZE },
            }),
          )
        : await dispatch(
            callApi({
              path: "/runs",
              method: "GET",
              // Child runs are listed too: a fan-out item that failed is a run
              // somebody has to be able to find, and hiding it here would make
              // this list quietly incomplete.
              queryParams: { limit: PAGE_SIZE, include_children: true },
            }),
          );
      if (!live) return;
      if (result.error) {
        setError(result.error.message || "Could not load runs.");
      } else {
        setError(null);
        setRows(parseRunListRows(result.data));
      }
      setLoading(false);
    })();
    return () => {
      live = false;
    };
  }, [dispatch, organizationId, definitionId, generation]);

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
