"use client";

/**
 * React Query bindings for the growth-loop run object.
 *
 * Live progress, not a spinner: an ACTIVE loop polls its state every few
 * seconds and its event ledger on a gap-free `after_seq` cursor, so a stage
 * that moves while the user is watching moves on screen. A loop that is
 * paused, completed or cancelled stops polling entirely — a settled run costs
 * nothing to look at.
 */

import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAppDispatch } from "@/lib/redux/hooks";
import {
  completeStage,
  controlLoop,
  enterStage,
  getLoopHistory,
  getLoopState,
  listSiteLoops,
  reconcileLoop,
  skipStage,
  startLoop,
  unblockStage,
  type LoopControlAction,
  type LoopEventView,
  type LoopStageId,
  type LoopStateView,
} from "./api";

export const growthLoopKeys = {
  all: ["growth-loop"] as const,
  site: (siteId: string) => ["growth-loop", "site", siteId] as const,
  run: (loopRunId: string) => ["growth-loop", "run", loopRunId] as const,
};

/** A loop still moving is worth re-reading; a settled one is not. */
export function isLoopLive(state: LoopStateView | undefined | null): boolean {
  return (
    state?.status === "active" ||
    state?.status === "blocked" ||
    state?.status === "paused"
  );
}

const LIVE_POLL_MS = 5_000;

/**
 * Every loop this site has run. The live one (there can only be one — the DB
 * enforces it with a partial unique index) is returned separately so callers
 * never have to re-derive that rule.
 */
export function useSiteLoops(siteId: string) {
  const query = useQuery({
    queryKey: growthLoopKeys.site(siteId),
    queryFn: ({ signal }) => listSiteLoops(siteId, signal),
    staleTime: 10_000,
    refetchInterval: (q) =>
      (q.state.data ?? []).some(isLoopLive) ? LIVE_POLL_MS : false,
  });

  const liveLoop = useMemo(
    () => (query.data ?? []).find(isLoopLive) ?? null,
    [query.data],
  );
  const pastLoops = useMemo(
    () => (query.data ?? []).filter((loop) => !isLoopLive(loop)),
    [query.data],
  );

  return { ...query, liveLoop, pastLoops };
}

export function useLoopState(loopRunId: string | null) {
  return useQuery({
    queryKey: growthLoopKeys.run(loopRunId ?? "none"),
    enabled: Boolean(loopRunId),
    queryFn: ({ signal }) => {
      if (!loopRunId)
        throw new Error("A loop id is required to load its state.");
      return getLoopState(loopRunId, signal);
    },
    refetchInterval: (q) => (isLoopLive(q.state.data) ? LIVE_POLL_MS : false),
  });
}

/**
 * The loop's own ledger, accumulated by delta. `after_seq` is assigned by a DB
 * trigger under the parent row lock, so it is gap-free and commit-ordered —
 * this poll can neither miss an event nor read one twice.
 */
export function useLoopHistory(loopRunId: string | null, live: boolean) {
  // The ledger carries the loop it belongs to, so switching loops can never
  // show the previous loop's events while the first delta is in flight — and
  // no state is written during render to achieve it.
  const [ledger, setLedger] = useState<{
    loopRunId: string | null;
    cursor: number;
    events: LoopEventView[];
  }>({ loopRunId: null, cursor: 0, events: [] });

  const query = useQuery({
    queryKey: [...growthLoopKeys.run(loopRunId ?? "none"), "history"] as const,
    enabled: Boolean(loopRunId),
    refetchInterval: live ? LIVE_POLL_MS : false,
    queryFn: async ({ signal }) => {
      if (!loopRunId) {
        throw new Error("A loop id is required to load its history.");
      }
      const id = loopRunId;
      const from = ledger.loopRunId === id ? ledger.cursor : 0;
      const page = await getLoopHistory(id, from, signal);
      setLedger((prev) => {
        const base = prev.loopRunId === id ? prev.events : [];
        return {
          loopRunId: id,
          cursor: page.next_after_seq,
          events: [...base, ...page.events],
        };
      });
      return page.next_after_seq;
    },
  });

  const events = ledger.loopRunId === loopRunId ? ledger.events : [];
  return { events, isLoading: query.isLoading, error: query.error };
}

/**
 * Every action a human can take on a loop, sharing one invalidation so the
 * stage rail and the ledger can never disagree after a click.
 */
export function useLoopActions(siteId: string) {
  const dispatch = useAppDispatch();
  const queryClient = useQueryClient();

  const refresh = useCallback(
    (loopRunId?: string) => {
      void queryClient.invalidateQueries({
        queryKey: growthLoopKeys.site(siteId),
      });
      if (loopRunId) {
        void queryClient.invalidateQueries({
          queryKey: growthLoopKeys.run(loopRunId),
        });
      }
    },
    [queryClient, siteId],
  );

  const start = useMutation({
    mutationFn: (input: { label?: string | null }) =>
      startLoop(dispatch, { siteId, label: input.label }),
    onSuccess: (state) => refresh(state.loop_run_id),
  });

  const open = useMutation({
    mutationFn: (input: { loopRunId: string; stage: LoopStageId }) =>
      enterStage(dispatch, input),
    onSuccess: (_stageRun, input) => refresh(input.loopRunId),
  });

  const complete = useMutation({
    mutationFn: (input: {
      loopRunId: string;
      stageRunId: string;
      nextStage?: LoopStageId | null;
    }) =>
      completeStage(dispatch, {
        stageRunId: input.stageRunId,
        nextStage: input.nextStage ?? null,
      }),
    onSuccess: (state) => refresh(state.loop_run_id),
  });

  const unblock = useMutation({
    mutationFn: (input: {
      loopRunId: string;
      stageRunId: string;
      reason?: string;
    }) =>
      unblockStage(dispatch, {
        stageRunId: input.stageRunId,
        reason: input.reason,
      }),
    onSuccess: (state) => refresh(state.loop_run_id),
  });

  const skip = useMutation({
    mutationFn: (input: {
      loopRunId: string;
      stageRunId: string;
      reason: string;
    }) =>
      skipStage(dispatch, {
        stageRunId: input.stageRunId,
        reason: input.reason,
      }),
    onSuccess: (state) => refresh(state.loop_run_id),
  });

  const control = useMutation({
    mutationFn: (input: { loopRunId: string; action: LoopControlAction }) =>
      controlLoop(dispatch, input),
    onSuccess: (state) => refresh(state.loop_run_id),
  });

  const reconcile = useMutation({
    mutationFn: (loopRunId: string) => reconcileLoop(dispatch, loopRunId),
    onSuccess: (state) => refresh(state.loop_run_id),
  });

  return { start, open, complete, unblock, skip, control, reconcile };
}
