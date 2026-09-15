import type { SandboxOperationKind, SandboxOperationReceipt } from "@/lib/durable-run/sandbox-operation-receipt";

export type DurableLifecycleState = "pending" | "success" | "failure" | "attention" | "unknown" | "refused";
export interface DurableLifecycleIdentity {
  row_id: string;
  sandbox_id: string;
  operation_id: string;
  kind: SandboxOperationKind;
}
export interface DurableLifecycleResult { state: DurableLifecycleState; message: string; sandbox_id?: string; }

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" ? value as Record<string, unknown> : null;
}
function sameUuid(left: unknown, right: string): boolean {
  return typeof left === "string" && left.replaceAll("-", "").toLowerCase() === right.replaceAll("-", "").toLowerCase() && /^[0-9a-f]{32}$/.test(left.replaceAll("-", "").toLowerCase());
}
function matches(value: Record<string, unknown> | null, expected: DurableLifecycleIdentity): boolean {
  return sameUuid(value?.row_id, expected.row_id) &&
    (expected.sandbox_id === "" || value?.sandbox_id === expected.sandbox_id) &&
    sameUuid(value?.operation_id, expected.operation_id) && value?.kind === expected.kind;
}

/** Durable contract classifier. Kept separate from the legacy classifier until every caller is migrated. */
export async function classifyDurableSandboxLifecycleResponse(
  response: { ok: boolean; status: number; json(): Promise<unknown> },
  expected: DurableLifecycleIdentity,
  hadAcceptedReceipt: boolean,
): Promise<DurableLifecycleResult> {
  let payload: Record<string, unknown> | null = null;
  try { payload = record(await response.json()); } catch { return { state: "unknown", message: "Could not confirm this sandbox operation; check status." }; }
  if (response.status === 409 && !hadAcceptedReceipt) return { state: "refused", message: "Sandbox lifecycle operation was refused." };
  if (!matches(payload, expected)) return { state: "unknown", message: "Could not confirm this sandbox operation; check status." };
  if (!payload) return { state: "unknown", message: "Could not confirm this sandbox operation; check status." };
  const message = typeof payload.error === "string" ? payload.error : "Sandbox operation status changed.";
  const state = payload.state;
  const sandbox_id = typeof payload.sandbox_id === "string" ? payload.sandbox_id : undefined;
  if (!sandbox_id) return { state: "unknown", message: "Could not confirm this sandbox operation; check status." };
  if ((response.status === 200 || response.status === 202) && (state === "accepted" || state === "running")) return { state: "pending", message, sandbox_id };
  if (response.status === 200 && state === "succeeded") return { state: "success", message, sandbox_id };
  if (response.status === 200 && state === "failed") return { state: "failure", message, sandbox_id };
  if (response.status === 200 && state === "recovery_required") return { state: "attention", message, sandbox_id };
  return { state: "unknown", message: "Could not confirm this sandbox operation; check status." };
}

export interface SandboxLifecycleOperationAdapter {
  admit(receipt: SandboxOperationReceipt, signal?: AbortSignal): Promise<Response>;
  status(receipt: SandboxOperationReceipt, signal?: AbortSignal): Promise<Response>;
  recover(receipt: SandboxOperationReceipt, signal?: AbortSignal): Promise<Response>;
}

/** URL ownership stays with the route layer; this inactive bridge accepts explicit paths and never touches legacy traffic. */
export function createSandboxLifecycleOperationAdapter(fetcher: typeof fetch, paths: { admission: (receipt: SandboxOperationReceipt) => string; status: (receipt: SandboxOperationReceipt) => string; recovery: (receipt: SandboxOperationReceipt) => string; }): SandboxLifecycleOperationAdapter {
  const body = (receipt: SandboxOperationReceipt) => JSON.stringify({ row_id: receipt.row_id, operation_id: receipt.operation_id, kind: receipt.kind });
  return {
    admit: (receipt, signal) => fetcher(paths.admission(receipt), { method: "POST", headers: { "Content-Type": "application/json" }, body: body(receipt), signal }),
    status: (receipt, signal) => fetcher(`${paths.status(receipt)}?kind=${receipt.kind}`, { method: "GET", signal }),
    recover: (receipt, signal) => fetcher(`${paths.recovery(receipt)}?kind=${receipt.kind}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: body(receipt), signal }),
  };
}
