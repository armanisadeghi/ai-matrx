"use client";

import { useEffect, useState } from "react";

import { POLL_DELAYS_MS, resolveCreatedProject } from "./resolveCreatedProject";
import type {
  CreateProjectWithTasksItem,
  ResolveStatus,
  ResolvedCreatedProject,
} from "./types";

export function useResolveCreatedProject(
  item: CreateProjectWithTasksItem | null,
): { status: ResolveStatus; data: ResolvedCreatedProject | null } {
  const [status, setStatus] = useState<ResolveStatus>("idle");
  const [data, setData] = useState<ResolvedCreatedProject | null>(null);

  const lookupKey = item
    ? `${item.slug ?? ""}:${item.name}:${item.tasks?.length ?? 0}`
    : null;

  useEffect(() => {
    if (!item || !lookupKey) {
      setStatus("idle");
      setData(null);
      return undefined;
    }

    setStatus("polling");
    setData(null);

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
          setStatus("resolved");
          setData(result);
          return;
        }
      } catch {
        // Keep polling until the schedule is exhausted.
      }

      if (attemptIndex === POLL_DELAYS_MS.length - 1 && !resolved) {
        setStatus("exhausted");
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

  return { status, data };
}
