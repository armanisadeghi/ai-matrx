"use client";

import { useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectSelectedTaskId,
  setSelectedTaskId,
} from "@/features/tasks/redux/taskUiSlice";
import { useNavTree } from "@/features/agent-context/hooks/useNavTree";

/**
 * Bridges `?task=` ↔ Redux `selectedTaskId` so the editor column can survive
 * page reloads, cmd+click AND browser Back/Forward. Renders nothing.
 *
 * Also kicks off the shared `useNavTree()` hierarchy hydration so all three
 * columns (sidebar / list / editor) see project + scope data.
 */
export function TaskUrlSync() {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedTaskId = useAppSelector(selectSelectedTaskId);

  useNavTree();

  // ONE bidirectional bridge. A write-only mirror is why Back looked broken:
  // Back rewrote the URL, then this effect wrote the stale Redux value
  // straight back over it. `lastSyncedRef` records the value both sides last
  // agreed on, so whichever side moved is the side that wins.
  const lastSyncedRef = useRef<string | null>(searchParams.get("task"));

  useEffect(() => {
    const param = searchParams.get("task");

    // The URL moved (Back/Forward, a pasted link) — the URL is the truth.
    if (param !== lastSyncedRef.current) {
      lastSyncedRef.current = param;
      if (param !== selectedTaskId) dispatch(setSelectedTaskId(param));
      return;
    }

    // Redux moved (the user picked a task) — mirror it out. A selection is a
    // discrete step, so it PUSHES: Back deselects instead of leaving /tasks.
    if (selectedTaskId === param) return;
    lastSyncedRef.current = selectedTaskId;
    const params = new URLSearchParams(searchParams.toString());
    if (selectedTaskId) params.set("task", selectedTaskId);
    else params.delete("task");
    const qs = params.toString();
    router.push(qs ? `/tasks?${qs}` : "/tasks", { scroll: false });
  }, [selectedTaskId, searchParams, router, dispatch]);

  return null;
}
