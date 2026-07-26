"use client";

/**
 * Poll-until-resolved hooks for the plan directives (0s/2s/5s — the aidream
 * dispatcher applies after persist, before stream close, so the rows almost
 * always exist by the first poll). Third copy of the resolveCreatedProject
 * pattern; if a fourth appears, extract the shared scheduler first
 * (flagged in features/matrx-envelope/FEATURE.md).
 */
import { useEffect, useState } from "react";

import {
  POLL_DELAYS_MS,
  resolvePatchedNode,
  resolvePlanTree,
  type ResolvedPatchedNode,
} from "./resolvePlanTree";
import type {
  PlanNodePatchItem,
  PlanTreeDirectiveItem,
  ResolveStatus,
  ResolvedPlanTree,
} from "./types";

interface PolledState<TResult> {
  key: string | null;
  status: ResolveStatus;
  data: TResult | null;
}

function usePolledResolve<TItem, TResult>(
  item: TItem | null,
  lookupKey: string | null,
  resolve: (item: TItem) => Promise<TResult | null>,
): { status: ResolveStatus; data: TResult | null } {
  const [state, setState] = useState<PolledState<TResult>>({
    key: lookupKey,
    status: lookupKey ? "polling" : "idle",
    data: null,
  });

  // Item identity changed → reset synchronously during render (react.dev
  // adjust-state pattern); the effect below only schedules timers.
  if (state.key !== lookupKey) {
    setState({
      key: lookupKey,
      status: lookupKey ? "polling" : "idle",
      data: null,
    });
  }

  useEffect(() => {
    if (!item || !lookupKey) return undefined;

    let cancelled = false;
    let resolved = false;
    const timers: ReturnType<typeof setTimeout>[] = [];

    const poll = async (attemptIndex: number) => {
      if (cancelled || resolved) return;
      try {
        const result = await resolve(item);
        if (cancelled || resolved) return;
        if (result) {
          resolved = true;
          setState({ key: lookupKey, status: "resolved", data: result });
          return;
        }
      } catch {
        // Keep polling until the schedule is exhausted.
      }
      if (attemptIndex === POLL_DELAYS_MS.length - 1 && !resolved) {
        setState({ key: lookupKey, status: "exhausted", data: null });
      }
    };

    POLL_DELAYS_MS.forEach((delay, index) => {
      timers.push(setTimeout(() => void poll(index), delay));
    });
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [lookupKey]);

  return { status: state.status, data: state.data };
}

export function useResolvePlanTree(item: PlanTreeDirectiveItem | null): {
  status: ResolveStatus;
  data: ResolvedPlanTree | null;
} {
  // Key on BOTH addressing forms — a text-addressed item has no site_id, so
  // keying on site_id alone collided across sites in one envelope.
  const lookupKey = item
    ? `${item.site_id ?? item.site ?? ""}:${item.nodes.length}`
    : null;
  return usePolledResolve(item, lookupKey, resolvePlanTree);
}

export function useResolvePatchedNode(item: PlanNodePatchItem | null): {
  status: ResolveStatus;
  data: ResolvedPatchedNode | null;
} {
  const lookupKey = item
    ? `${item.node_id ?? ""}:${item.site_id ?? ""}:${item.route ?? ""}`
    : null;
  return usePolledResolve(item, lookupKey, resolvePatchedNode);
}
