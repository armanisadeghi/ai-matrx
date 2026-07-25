"use client";

import { useEffect, useState } from "react";

import { POLL_DELAYS_MS, resolveCreatedProject } from "./resolveCreatedProject";
import type {
  CreateProjectWithTasksItem,
  ResolveStatus,
  ResolvedCreatedProject,
} from "./types";

interface ResolveState {
  key: string | null;
  status: ResolveStatus;
  data: ResolvedCreatedProject | null;
}

export function useResolveCreatedProject(
  item: CreateProjectWithTasksItem | null,
): { status: ResolveStatus; data: ResolvedCreatedProject | null } {
  const lookupKey = item
    ? `${item.slug ?? ""}:${item.name}:${item.tasks?.length ?? 0}`
    : null;

  // Item identity change → reset via adjust-state-during-render (react.dev
  // pattern); the effect below only schedules timers — no sync setState.
  const [state, setState] = useState<ResolveState>({
    key: lookupKey,
    status: lookupKey ? "polling" : "idle",
    data: null,
  });
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
        const result = await resolveCreatedProject(item);
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
  }, [item, lookupKey]);

  return { status: state.status, data: state.data };
}
