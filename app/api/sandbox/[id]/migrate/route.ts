/**
 * POST /api/sandbox/[id]/migrate
 *
 * Owner-gated proxy for the orchestrator's zero-drift migration. It keeps the
 * sandbox identity and persistent workspace; reset is intentionally a separate
 * recovery action and is never used to claim an image update.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  lookupSandboxAndOrchestrator,
  orchestratorJsonHeaders,
} from "@/lib/sandbox/orchestrator-routing";

const CANONICAL_OPERATION_ID = /^[0-9a-f]{32}$/;
const MIGRATION_OUTCOMES = new Set([
  "in_progress",
  "recovering",
  "migrated",
  "rolled_back",
  "recovery_required",
  "idle",
]);

type MigrationStatus = {
  sandbox_id: string;
  operation_id: string | null;
  outcome:
    | "in_progress"
    | "recovering"
    | "migrated"
    | "rolled_back"
    | "recovery_required"
    | "idle";
  execution_state: string;
  phase: string;
  reason?: string;
};

function operationIdForRequest(request: NextRequest): string | null {
  const supplied = request.nextUrl.searchParams.get("operation_id");
  if (supplied === null) return crypto.randomUUID().replaceAll("-", "");
  return CANONICAL_OPERATION_ID.test(supplied) ? supplied : null;
}

function parseExactMigrationStatus(
  payload: unknown,
  sandboxId: string,
  operationId: string,
): MigrationStatus | null {
  if (typeof payload !== "object" || payload === null) return null;
  const value = payload as Record<string, unknown>;
  if (
    value.sandbox_id !== sandboxId ||
    value.operation_id !== operationId ||
    !MIGRATION_OUTCOMES.has(String(value.outcome)) ||
    typeof value.execution_state !== "string" ||
    typeof value.phase !== "string" ||
    (value.reason !== undefined && typeof value.reason !== "string")
  ) {
    return null;
  }
  return value as MigrationStatus;
}

type ExactStatusResult =
  | { status: MigrationStatus; mismatch: false }
  | { status: null; mismatch: boolean };

async function exactMigrationStatus(
  lookup: {
    sandboxId: string;
    orchestrator: { url: string; apiKey: string; tier: "ec2" | "hosted" };
  },
  operationId: string,
): Promise<ExactStatusResult> {
  const statusUrl = new URL(
    `/sandboxes/${lookup.sandboxId}/migration`,
    lookup.orchestrator.url,
  );
  statusUrl.searchParams.set("operation_id", operationId);
  try {
    const response = await fetch(statusUrl.toString(), {
      method: "GET",
      headers: orchestratorJsonHeaders(lookup.orchestrator),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return { status: null, mismatch: false };
    const payload = await response.json().catch(() => null);
    const status = parseExactMigrationStatus(
      payload,
      lookup.sandboxId,
      operationId,
    );
    if (status) return { status, mismatch: false };
    const value =
      typeof payload === "object" && payload !== null
        ? (payload as Record<string, unknown>)
        : null;
    return {
      status: null,
      mismatch:
        value?.sandbox_id !== undefined || value?.operation_id !== undefined,
    };
  } catch {
    return { status: null, mismatch: false };
  }
}

function browserMigrationStatus(
  status: MigrationStatus,
  sandboxRowId: string,
): MigrationStatus {
  return { ...status, sandbox_id: sandboxRowId };
}

function timeoutStatusResponse(status: MigrationStatus, sandboxRowId: string) {
  const projected = browserMigrationStatus(status, sandboxRowId);
  if (status.outcome === "in_progress" || status.outcome === "recovering") {
    return NextResponse.json(projected, { status: 202 });
  }
  if (status.outcome === "migrated") {
    return NextResponse.json(projected, { status: 200 });
  }
  if (
    status.outcome === "rolled_back" ||
    status.outcome === "recovery_required"
  ) {
    return NextResponse.json(projected, { status: 409 });
  }
  return null;
}

type BusyDeferredMigration = {
  status: "busy_deferred";
  sandbox_id: string;
  operation_id: string;
  reason: string;
};

function isBusyDeferredPayload(payload: unknown): boolean {
  return (
    typeof payload === "object" &&
    payload !== null &&
    "detail" in payload &&
    typeof payload.detail === "object" &&
    payload.detail !== null &&
    "status" in payload.detail &&
    payload.detail.status === "busy_deferred"
  );
}

function busyDeferredMigration(
  payload: unknown,
  upstreamSandboxId: string,
  browserSandboxId: string,
  operationId: string,
): BusyDeferredMigration | null {
  if (
    typeof payload !== "object" ||
    payload === null ||
    !("detail" in payload)
  ) {
    return null;
  }
  const detail = payload.detail;
  if (
    typeof detail !== "object" ||
    detail === null ||
    !("status" in detail) ||
    !("sandbox_id" in detail) ||
    !("operation_id" in detail) ||
    !("reason" in detail) ||
    detail.status !== "busy_deferred" ||
    detail.sandbox_id !== upstreamSandboxId ||
    detail.operation_id !== operationId ||
    !CANONICAL_OPERATION_ID.test(String(detail.operation_id)) ||
    typeof detail.reason !== "string"
  ) {
    return null;
  }
  return {
    status: "busy_deferred",
    sandbox_id: browserSandboxId,
    operation_id: operationId,
    reason: detail.reason,
  };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const lookup = await lookupSandboxAndOrchestrator(id);
  if (lookup.ok === false) {
    return NextResponse.json(
      { error: lookup.error },
      { status: lookup.status },
    );
  }

  const operationId = operationIdForRequest(request);
  if (!operationId) {
    return NextResponse.json(
      {
        error:
          "operation_id must be a canonical 32-character lowercase hexadecimal value",
      },
      { status: 422 },
    );
  }

  let response: Response;
  const interruptAttachedSessions =
    request.nextUrl.searchParams.get("interrupt_attached_sessions") === "true";
  const migrationUrl = new URL(
    `/sandboxes/${lookup.sandboxId}/migrate`,
    lookup.orchestrator.url,
  );
  if (interruptAttachedSessions) {
    migrationUrl.searchParams.set("interrupt_attached_sessions", "true");
  }
  migrationUrl.searchParams.set("operation_id", operationId);
  try {
    response = await fetch(migrationUrl.toString(), {
      method: "POST",
      headers: orchestratorJsonHeaders(lookup.orchestrator),
      // Migration drains and replaces a live container, then waits for its
      // readiness checks. The orchestrator itself budgets up to 90 seconds
      // for verification, so this proxy must not report a false failure first.
      signal: AbortSignal.timeout(180_000),
    });
  } catch (error) {
    const exact = await exactMigrationStatus(lookup, operationId);
    if (exact.status) {
      const recovered = timeoutStatusResponse(exact.status, id);
      if (recovered) return recovered;
    }
    return NextResponse.json(
      {
        error:
          "Sandbox update outcome is unknown. The update was not retried; reconnect to this operation before taking another action.",
        status: "outcome_unknown",
        operation_id: operationId,
      },
      { status: 502 },
    );
  }

  const payloadText = await response.text();
  let payload: unknown = { body: payloadText };
  try {
    payload = JSON.parse(payloadText) as unknown;
  } catch {
    // Preserve the upstream non-JSON body for the caller's error detail.
  }
  if (response.status === 404 || response.status === 405) {
    return NextResponse.json(
      {
        error:
          "This sandbox manager does not support in-place image updates yet.",
      },
      { status: 501 },
    );
  }
  const busyDeferred =
    response.status === 409
      ? busyDeferredMigration(payload, lookup.sandboxId, id, operationId)
      : null;
  if (busyDeferred) {
    return NextResponse.json(
      {
        error: `Sandbox update deferred: ${busyDeferred.reason}. No update was made.`,
        status: busyDeferred.status,
        details: busyDeferred,
      },
      { status: 409 },
    );
  }
  if (response.status === 409 && isBusyDeferredPayload(payload)) {
    return NextResponse.json(
      {
        error:
          "Sandbox update outcome is unknown because the deferred response did not match this operation.",
        status: "outcome_unknown",
        operation_id: operationId,
      },
      { status: 502 },
    );
  }
  if (!response.ok) {
    if (response.status >= 500) {
      const exact = await exactMigrationStatus(lookup, operationId);
      if (exact.status) {
        const recovered = timeoutStatusResponse(exact.status, id);
        if (recovered) return recovered;
      }
      if (exact.mismatch) {
        return NextResponse.json(
          {
            error:
              "Sandbox update outcome is unknown because the status response did not match this operation.",
            status: "outcome_unknown",
            operation_id: operationId,
          },
          { status: 502 },
        );
      }
    }
    return NextResponse.json(
      {
        error: "Sandbox image update failed",
        upstream_status: response.status,
        details: payload,
      },
      { status: response.status >= 500 ? 502 : response.status },
    );
  }
  const protocolFailure =
    typeof payload !== "object" ||
    payload === null ||
    ("body" in payload && typeof payload.body === "string");
  if (protocolFailure) {
    const exact = await exactMigrationStatus(lookup, operationId);
    if (exact.status) {
      const recovered = timeoutStatusResponse(exact.status, id);
      if (recovered) return recovered;
    }
    if (exact.mismatch) {
      return NextResponse.json(
        {
          error:
            "Sandbox update outcome is unknown because the status response did not match this operation.",
          status: "outcome_unknown",
          operation_id: operationId,
        },
        { status: 502 },
      );
    }
  }
  if (
    typeof payload !== "object" ||
    payload === null ||
    !(
      "sandbox_id" in payload &&
      typeof payload.sandbox_id === "string" &&
      payload.sandbox_id === lookup.sandboxId
    )
  ) {
    return NextResponse.json(
      {
        error:
          "Sandbox manager returned an update result for a different sandbox.",
      },
      { status: 502 },
    );
  }
  const exactStatus = parseExactMigrationStatus(
    payload,
    lookup.sandboxId,
    operationId,
  );
  if (!exactStatus) {
    return NextResponse.json(
      {
        error:
          "Sandbox manager returned an update result that cannot be matched to this operation.",
        status: "outcome_unknown",
        operation_id: operationId,
      },
      { status: 502 },
    );
  }
  const mappedStatus = timeoutStatusResponse(exactStatus, id);
  return (
    mappedStatus ??
    NextResponse.json(
      {
        error:
          "Sandbox update outcome is unknown because no matching active operation was found.",
        status: "outcome_unknown",
        operation_id: operationId,
      },
      { status: 502 },
    )
  );
}
