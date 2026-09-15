import type { SandboxOperationKind, SandboxOperationReceipt } from "@/lib/durable-run/sandbox-operation-receipt";

export type DurableLifecycleState = "pending" | "success" | "failure" | "attention" | "unknown" | "refused";
export interface DurableLifecycleIdentity {
  row_id: string;
  sandbox_id: string;
  operation_id: string;
  kind: SandboxOperationKind;
}
export interface DurableLifecycleResult { state: DurableLifecycleState; message: string; }

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" ? value as Record<string, unknown> : null;
}
function matches(value: Record<string, unknown> | null, expected: DurableLifecycleIdentity): boolean {
  return value?.row_id === expected.row_id && value.sandbox_id === expected.sandbox_id && value.operation_id === expected.operation_id && value.kind === expected.kind;
}

/** Durable contract classifier. Kept separate from the legacy classifier until every caller is migrated. */
export async function classifyDurableSandboxLifecycleResponse(
  response: { ok: boolean; status: number; json(): Promise<unknown> },
  expected: DurableLifecycleIdentity,
  hadAcceptedReceipt: boolean,
): Promise<DurableLifecycleResult> {
  let payload: Record<string, unknown> | null = null;
  try { payload = record(await response.json()); } catch { return { state: "unknown", message: "Could not confirm this sandbox operation; check status." }; }
  if (!matches(payload, expected)) return { state: "unknown", message: "Could not confirm this sandbox operation; check status." };
  const message = typeof payload.error === "string" ? payload.error : "Sandbox operation status changed.";
  const status = payload.status;
  if (response.status === 202 && (status === "accepted" || status === "running")) return { state: "pending", message };
  if (response.status === 200 && status === "succeeded") return { state: "success", message };
  if (response.status === 200 && status === "failed") return { state: "failure", message };
  if (response.status === 200 && status === "recovery_required") return { state: "attention", message };
  if (response.status === 409 && !hadAcceptedReceipt) return { state: "refused", message };
  return { state: "unknown", message: "Could not confirm this sandbox operation; check status." };
}

export interface SandboxLifecycleOperationAdapter {
  admit(receipt: SandboxOperationReceipt): Promise<Response>;
  status(receipt: SandboxOperationReceipt): Promise<Response>;
  recover(receipt: SandboxOperationReceipt): Promise<Response>;
}

/** URL ownership stays with the route layer; this inactive bridge accepts explicit paths and never touches legacy traffic. */
export function createSandboxLifecycleOperationAdapter(fetcher: typeof fetch, paths: { admission: (receipt: SandboxOperationReceipt) => string; status: (receipt: SandboxOperationReceipt) => string; recovery: (receipt: SandboxOperationReceipt) => string; }): SandboxLifecycleOperationAdapter {
  const body = (receipt: SandboxOperationReceipt) => JSON.stringify({ row_id: receipt.row_id, operation_id: receipt.operation_id, kind: receipt.kind });
  return {
    admit: (receipt) => fetcher(paths.admission(receipt), { method: "POST", headers: { "Content-Type": "application/json" }, body: body(receipt) }),
    status: (receipt) => fetcher(paths.status(receipt), { method: "GET" }),
    recover: (receipt) => fetcher(paths.recovery(receipt), { method: "POST", headers: { "Content-Type": "application/json" }, body: body(receipt) }),
  };
}
