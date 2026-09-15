"use client";

import { useEffect, useRef } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import type { SandboxOperationReceipt } from "@/lib/durable-run/sandbox-operation-receipt";

/**
 * Refreshes one mounted canonical cache once for each current-actor terminal
 * success. Server truth remains in the cache's own read; this never writes a
 * stale lifecycle status into a row.
 */
export function useSandboxLifecycleTerminalInvalidation(
  refresh: (receipt: SandboxOperationReceipt) => void | Promise<void>,
  isCurrentScope: () => boolean = () => true,
): void {
  const lifecycle = useAppSelector((state) => state.sandboxLifecycle);
  const currentActorId = useAppSelector(selectUserId);
  const handled = useRef(new Set<string>());
  const namespace = `${lifecycle.actorId ?? "anonymous"}:${lifecycle.generation}`;

  useEffect(() => { handled.current.clear(); }, [namespace]);

  useEffect(() => {
    if (!lifecycle.actorId || lifecycle.actorId !== currentActorId || !isCurrentScope()) return;
    for (const view of lifecycle.views) {
      if (view.state !== "success" || handled.current.has(view.operation_id)) continue;
      const receipt = lifecycle.receipts.find((candidate) => candidate.operation_id === view.operation_id);
      if (!receipt) continue;
      handled.current.add(view.operation_id);
      // The callback owns its route/org/request fence; check again before the
      // cache read so a terminal receipt cannot revive an old surface.
      if (isCurrentScope()) void refresh(receipt);
    }
  }, [currentActorId, isCurrentScope, lifecycle.actorId, lifecycle.receipts, lifecycle.views, refresh]);
}
