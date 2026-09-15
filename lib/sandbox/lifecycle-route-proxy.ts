import { NextResponse } from "next/server";
import { orchestratorJsonHeaders } from "@/lib/sandbox/orchestrator-routing";
import type { SandboxLifecycleTarget } from "@/lib/sandbox/lifecycle-target";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export type LifecycleKind = "stop" | "delete";

export function validLifecycleRequest(value: unknown): value is { operation_id: string; kind: LifecycleKind; graceful?: boolean } {
  return !!value && typeof value === "object" && UUID.test((value as { operation_id?: unknown }).operation_id as string) && ((value as { kind?: unknown }).kind === "stop" || (value as { kind?: unknown }).kind === "delete") && ((value as { graceful?: unknown }).graceful === undefined || typeof (value as { graceful?: unknown }).graceful === "boolean");
}

/** Proxies only the bounded receipt projection and rejects an upstream identity mismatch. */
export async function proxyLifecycleReceipt(target: SandboxLifecycleTarget, suffix: string, init: RequestInit, expected: { operation_id: string; kind?: LifecycleKind; graceful?: boolean }): Promise<NextResponse> {
  try {
    const response = await fetch(`${target.orchestrator.url}/sandboxes/${target.sandboxId}/lifecycle-operations${suffix}`, { ...init, headers: { ...orchestratorJsonHeaders(target.orchestrator), ...init.headers } });
    if (response.status === 409) return NextResponse.json({ error: "Sandbox lifecycle operation was refused" }, { status: 409 });
    const payload: unknown = await response.json();
    if (!payload || typeof payload !== "object") return NextResponse.json({ error: "Could not confirm sandbox lifecycle operation", status: "outcome_unknown" }, { status: 502 });
    const receipt = payload as Record<string, unknown>;
    if (!sameUuid(receipt.row_id, target.rowId) || receipt.sandbox_id !== target.sandboxId || !sameUuid(receipt.operation_id, expected.operation_id) || (expected.kind && receipt.kind !== expected.kind) || (expected.graceful !== undefined && receipt.graceful !== expected.graceful)) return NextResponse.json({ error: "Could not confirm sandbox lifecycle operation", status: "outcome_unknown" }, { status: 502 });
    return NextResponse.json(receipt, { status: response.status });
  } catch {
    return NextResponse.json({ error: "Could not confirm sandbox lifecycle operation", status: "outcome_unknown" }, { status: 502 });
  }
}
function sameUuid(left: unknown, right: string): boolean {
  return typeof left === "string" && left.replaceAll("-", "").toLowerCase() === right.replaceAll("-", "").toLowerCase() && /^[0-9a-f]{32}$/.test(left.replaceAll("-", "").toLowerCase());
}

/** Tombstones cannot start work, but an exact already-issued receipt may rejoin. */
export async function hasExactLifecycleReceipt(target: SandboxLifecycleTarget, operationId: string, kind: LifecycleKind): Promise<boolean> {
  return (await readExactLifecycleReceipt(target, operationId, kind)) !== null;
}

/** Reads the immutable receipt used to authorize recovery; malformed identity fails closed. */
export async function readExactLifecycleReceipt(target: SandboxLifecycleTarget, operationId: string, kind: LifecycleKind): Promise<{ graceful: boolean } | null> {
  try {
    const response = await fetch(`${target.orchestrator.url}/sandboxes/${target.sandboxId}/lifecycle-operations/${operationId}`, { headers: orchestratorJsonHeaders(target.orchestrator) });
    if (!response.ok) return false;
    const payload: unknown = await response.json();
    if (!payload || typeof payload !== "object") return false;
    const receipt = payload as Record<string, unknown>;
    if (!sameUuid(receipt.row_id, target.rowId) || receipt.sandbox_id !== target.sandboxId || !sameUuid(receipt.operation_id, operationId) || receipt.kind !== kind || typeof receipt.graceful !== "boolean") return null;
    return { graceful: receipt.graceful };
  } catch { return null; }
}
