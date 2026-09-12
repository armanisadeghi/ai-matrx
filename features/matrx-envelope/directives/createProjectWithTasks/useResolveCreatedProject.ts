"use client";

import { useCallback, useEffect, useState } from "react";

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
): {
  status: ResolveStatus;
  data: ResolvedCreatedProject | null;
  recheck: () => void;
} {
  const lookupKey = item
    ? `${item.slug ?? ""}:${item.name}:${item.tasks?.length ?? 0}`
    : null;

  // Item identity change → reset via adjust-state-during-render (react.dev
  // pattern); the effect below only schedules timers — no sync setState.
  // THE POLL CANNOT OUTWAIT A HUMAN (V-34, live 2026-09-12). Under the `ask`
  // policy the project is written when the user clicks Approve — which is very
  // often after this fixed schedule has run out, leaving the card saying
  // "Nothing has been created yet…" directly above the receipt that says it WAS
  // created: two sentences, one view, one of them false. No schedule can predict
  // a click, so the exhausted state gets a real control instead of a longer wait.
  const [attempt, setAttempt] = useState(0);
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
  }, [item, lookupKey, attempt]);

  const recheck = useCallback(() => {
    if (!lookupKey) return;
    setState({ key: lookupKey, status: "polling", data: null });
    setAttempt((n) => n + 1);
  }, [lookupKey]);

  return { status: state.status, data: state.data, recheck };
}
