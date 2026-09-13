/**
 * GET /api/sandbox/[id]/migration
 *
 * Owner-gated reconnect path for a durable sandbox migration. The operation
 * identifier is intentionally exact: a previous terminal journal must never
 * become evidence that this caller's current action succeeded.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  lookupSandboxAndOrchestrator,
  orchestratorJsonHeaders,
} from "@/lib/sandbox/orchestrator-routing";

const CANONICAL_OPERATION_ID = /^[0-9a-f]{32}$/;
const OUTCOMES = new Set([
  "in_progress",
  "recovering",
  "migrated",
  "rolled_back",
  "recovery_required",
  "idle",
]);

function validStatus(
  value: unknown,
  sandboxId: string,
  operationId: string | null,
): boolean {
  if (typeof value !== "object" || value === null) return false;
  const status = value as Record<string, unknown>;
  return (
    status.sandbox_id === sandboxId &&
    (operationId === null || status.operation_id === operationId) &&
    (status.operation_id === null ||
      CANONICAL_OPERATION_ID.test(String(status.operation_id))) &&
    OUTCOMES.has(String(status.outcome)) &&
    typeof status.execution_state === "string" &&
    typeof status.phase === "string" &&
    (status.reason === undefined || typeof status.reason === "string")
  );
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const requestedOperationId = request.nextUrl.searchParams.get("operation_id");
  if (
    requestedOperationId !== null &&
    !CANONICAL_OPERATION_ID.test(requestedOperationId)
  ) {
    return NextResponse.json(
      {
        error:
          "operation_id must be a canonical 32-character lowercase hexadecimal value",
      },
      { status: 422 },
    );
  }
  const lookup = await lookupSandboxAndOrchestrator(id);
  if (lookup.ok === false) {
    return NextResponse.json(
      { error: lookup.error },
      { status: lookup.status },
    );
  }

  const url = new URL(
    `/sandboxes/${lookup.sandboxId}/migration`,
    lookup.orchestrator.url,
  );
  if (requestedOperationId)
    url.searchParams.set("operation_id", requestedOperationId);
  let response: Response;
  try {
    response = await fetch(url.toString(), {
      method: "GET",
      headers: orchestratorJsonHeaders(lookup.orchestrator),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    return NextResponse.json(
      {
        error:
          "Sandbox update outcome is unknown because its status could not be reached.",
        status: "outcome_unknown",
        ...(requestedOperationId ? { operation_id: requestedOperationId } : {}),
      },
      { status: 502 },
    );
  }
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    return NextResponse.json(
      {
        error: "Sandbox update status could not be read.",
        upstream_status: response.status,
        details: payload,
        ...(requestedOperationId ? { operation_id: requestedOperationId } : {}),
      },
      { status: response.status >= 500 ? 502 : response.status },
    );
  }
  if (!validStatus(payload, lookup.sandboxId, requestedOperationId)) {
    return NextResponse.json(
      {
        error:
          "Sandbox update outcome is unknown because the manager returned a mismatched status.",
        status: "outcome_unknown",
        ...(requestedOperationId ? { operation_id: requestedOperationId } : {}),
      },
      { status: 502 },
    );
  }
  return NextResponse.json({
    ...(payload as Record<string, unknown>),
    sandbox_id: id,
  });
}
