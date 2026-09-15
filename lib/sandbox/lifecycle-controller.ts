import type { ReceiptStorage, SandboxOperationKind, SandboxOperationReceipt } from "@/lib/durable-run/sandbox-operation-receipt";
import { writeSandboxOperationReceipt } from "@/lib/durable-run/sandbox-operation-receipt";
import { classifyDurableSandboxLifecycleResponse, type DurableLifecycleIdentity, type DurableLifecycleResult, type SandboxLifecycleOperationAdapter } from "@/lib/sandbox/lifecycle-operation";

export type LifecycleControllerState = DurableLifecycleResult & { receipt: SandboxOperationReceipt; refreshRecoveryAvailable: boolean };

function unknown(receipt: SandboxOperationReceipt, refreshRecoveryAvailable: boolean): LifecycleControllerState {
  return { receipt, refreshRecoveryAvailable, state: "unknown", message: "Could not confirm this sandbox operation; check status." };
}

/** Inactive controller: callers must pass the canonical actor and generation they captured at the UI seam. */
export async function submitSandboxLifecycleOperation(args: {
  actorId: string;
  actorGeneration: number;
  isCurrentActorGeneration: (generation: number) => boolean;
  storage: ReceiptStorage;
  receipt: SandboxOperationReceipt;
  sandboxId: string;
  adapter: SandboxLifecycleOperationAdapter;
  onPersistenceUnavailable?: () => void;
}): Promise<LifecycleControllerState | null> {
  const { actorId, actorGeneration, isCurrentActorGeneration, storage, receipt, sandboxId, adapter, onPersistenceUnavailable } = args;
  let refreshRecoveryAvailable = writeSandboxOperationReceipt(storage, actorId, receipt);
  const dispatched = { ...receipt, observation: "dispatched" as const };
  refreshRecoveryAvailable = writeSandboxOperationReceipt(storage, actorId, dispatched) && refreshRecoveryAvailable;
  if (!refreshRecoveryAvailable) onPersistenceUnavailable?.();
  try {
    const response = await adapter.admit(dispatched);
    if (!isCurrentActorGeneration(actorGeneration)) return null;
    const identity: DurableLifecycleIdentity = { row_id: receipt.row_id, sandbox_id: sandboxId, operation_id: receipt.operation_id, kind: receipt.kind, graceful: receipt.graceful ?? true };
    const result = await classifyDurableSandboxLifecycleResponse(response, identity, receipt.observation === "accepted");
    const observed = result.state === "pending" ? { ...receipt, observation: "accepted" as const } : dispatched;
    if (result.state === "pending") refreshRecoveryAvailable = writeSandboxOperationReceipt(storage, actorId, observed) && refreshRecoveryAvailable;
    return { ...result, receipt: observed, refreshRecoveryAvailable };
  } catch {
    return isCurrentActorGeneration(actorGeneration) ? unknown(dispatched, refreshRecoveryAvailable) : null;
  }
}

/** User-triggered only: reuses precisely the receipt's UUID, row, and kind. */
export async function retryExactSandboxLifecycleOperation(args: Parameters<typeof submitSandboxLifecycleOperation>[0]): Promise<LifecycleControllerState | null> {
  // A repeated admission can race the original request, including after reload.
  // A 409 here is never proof that the original request was refused.
  const { actorId, actorGeneration, isCurrentActorGeneration, storage, receipt, sandboxId, adapter } = args;
  const dispatched = { ...receipt, observation: "dispatched" as const };
  const refreshRecoveryAvailable = writeSandboxOperationReceipt(storage, actorId, dispatched);
  try {
    const response = await adapter.admit(dispatched);
    if (!isCurrentActorGeneration(actorGeneration)) return null;
    const result = await classifyDurableSandboxLifecycleResponse(response, { row_id: receipt.row_id, sandbox_id: sandboxId, operation_id: receipt.operation_id, kind: receipt.kind, graceful: receipt.graceful ?? true }, true);
    return { ...result, receipt: dispatched, refreshRecoveryAvailable };
  } catch { return isCurrentActorGeneration(actorGeneration) ? unknown(dispatched, refreshRecoveryAvailable) : null; }
}
