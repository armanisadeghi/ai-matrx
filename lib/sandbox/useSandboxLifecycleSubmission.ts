"use client";

import { useRef } from "react";
import { toast } from "@/lib/toast";
import { useAppDispatch, useAppStore } from "@/lib/redux/hooks";
import { applyView, reserveTarget, upsertReceipt } from "@/lib/redux/slices/sandboxLifecycleSlice";
import type { SandboxOperationKind, SandboxOperationReceipt } from "@/lib/durable-run/sandbox-operation-receipt";
import { submitSandboxLifecycleOperation, type LifecycleControllerState } from "@/lib/sandbox/lifecycle-controller";
import { createSandboxLifecycleOperationAdapter } from "@/lib/sandbox/lifecycle-operation";

export type SandboxLifecycleSubmission = {
  rowId: string;
  sandboxId: string;
  kind: SandboxOperationKind;
  graceful?: boolean;
};

export type SandboxLifecycleSubmissionResult =
  | { admitted: true; receipt: SandboxOperationReceipt; outcome: LifecycleControllerState | null }
  | { admitted: false; reason: "not_ready" | "already_pending" };

/**
 * The only admission seam for destructive sandbox lifecycle work. It reserves
 * one target synchronously, persists its exact UUID before POST, and publishes
 * the in-memory receipt before any network outcome can arrive.
 */
export function useSandboxLifecycleSubmission(): {
  submit: (submission: SandboxLifecycleSubmission) => Promise<SandboxLifecycleSubmissionResult>;
} {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const submittingRows = useRef(new Set<string>());

  const submit = async ({ rowId, sandboxId, kind, graceful = true }: SandboxLifecycleSubmission): Promise<SandboxLifecycleSubmissionResult> => {
    const before = store.getState().sandboxLifecycle;
    if (!before.actorId || before.reservations.some((reservation) => reservation.row_id === rowId) || submittingRows.current.has(rowId)) return { admitted: false, reason: before.actorId ? "already_pending" : "not_ready" };
    const actorId = before.actorId;
    const generation = before.generation;
    const receipt: SandboxOperationReceipt = { schema_version: 1, row_id: rowId, operation_id: crypto.randomUUID(), kind, graceful, observation: "prepared" };
    submittingRows.current.add(rowId);
    dispatch(reserveTarget({ actorId, generation, reservation: receipt }));
    dispatch(upsertReceipt(receipt));
    const adapter = createSandboxLifecycleOperationAdapter(fetch, {
      admission: (item) => `/api/sandbox/${item.row_id}/lifecycle-operations`,
      status: (item) => `/api/sandbox/${item.row_id}/lifecycle-operations/${item.operation_id}`,
      recovery: (item) => `/api/sandbox/${item.row_id}/lifecycle-operations/${item.operation_id}/recover`,
    });
    try {
      const outcome = await submitSandboxLifecycleOperation({
        actorId,
        actorGeneration: generation,
        isCurrentActorGeneration: (candidate) => {
          const current = store.getState().sandboxLifecycle;
          return current.actorId === actorId && current.generation === candidate;
        },
        storage: window.localStorage,
        receipt,
        sandboxId,
        adapter,
      });
      if (outcome) {
        dispatch(upsertReceipt(outcome.receipt));
        dispatch(applyView({ actorId, generation, view: { operation_id: receipt.operation_id, state: outcome.state, message: outcome.refreshRecoveryAvailable ? outcome.message : `${outcome.message} Refresh recovery is unavailable in this browser.`, sandboxId, action: outcome.state === "attention" ? "recover" : outcome.state === "unknown" ? "retry" : outcome.state === "pending" ? "check" : null, dismissed: false } }));
        if (!outcome.refreshRecoveryAvailable) toast.warning("Sandbox operation was requested, but refresh recovery is unavailable in this browser.");
      }
      return { admitted: true, receipt, outcome };
    } finally {
      submittingRows.current.delete(rowId);
    }
  };

  return { submit };
}
