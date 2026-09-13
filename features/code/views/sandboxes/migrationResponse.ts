export interface SandboxMigrationFailure {
  kind: "busy_deferred" | "failure";
  message: string;
  code: string;
}

export type SandboxMigrationOutcome =
  | "in_progress"
  | "recovering"
  | "migrated"
  | "rolled_back"
  | "recovery_required"
  | "idle";

export interface SandboxMigrationStatus {
  sandbox_id: string;
  operation_id: string | null;
  outcome: SandboxMigrationOutcome;
  execution_state: string;
  phase: string;
  reason?: string;
}

const CANONICAL_OPERATION_ID = /^[0-9a-f]{32}$/;

export function isCanonicalMigrationOperationId(
  value: unknown,
): value is string {
  return typeof value === "string" && CANONICAL_OPERATION_ID.test(value);
}

export function newMigrationOperationId(): string {
  return crypto.randomUUID().replaceAll("-", "");
}

export function isLiveMigrationOutcome(
  outcome: SandboxMigrationOutcome,
): boolean {
  return outcome === "in_progress" || outcome === "recovering";
}

/** The card uses both persisted state and an immediate ref to close double-click races. */
export function canStartSandboxMigration(
  activeOperationId: string | null,
  startInFlightOperationId: string | null,
): boolean {
  return activeOperationId === null && startInFlightOperationId === null;
}

function recordOf(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function migrationStatus(value: unknown): string | undefined {
  const record = recordOf(value);
  if (!record) return undefined;
  if (typeof record.status === "string") return record.status;
  const details = recordOf(record.details);
  if (!details) return undefined;
  if (typeof details.status === "string") return details.status;
  const nested = recordOf(details.detail);
  return typeof nested?.status === "string" ? nested.status : undefined;
}

export function sandboxMigrationMessage(
  value: unknown,
  fallback: string,
): string {
  const record = recordOf(value);
  if (!record) return fallback;
  const genericError =
    record.error === "Sandbox image update failed" ||
    record.error === "Sandbox image update failed.";
  if (typeof record.error === "string" && !genericError) return record.error;
  if (typeof record.detail === "string") return record.detail;
  const details = recordOf(record.details);
  if (!details) return fallback;
  if (typeof details.detail === "string") return details.detail;
  if (typeof details.reason === "string") return details.reason;
  const nested = recordOf(details.detail);
  if (typeof nested?.reason === "string") return nested.reason;
  if (typeof record.error === "string") return record.error;
  return fallback;
}

export function classifySandboxMigrationFailure(
  payload: unknown,
  httpStatus: number,
): SandboxMigrationFailure {
  const status = migrationStatus(payload);
  return {
    kind:
      httpStatus === 409 && status === "busy_deferred"
        ? "busy_deferred"
        : "failure",
    message: sandboxMigrationMessage(payload, "Sandbox image update failed."),
    code: status ?? `http_${httpStatus}`,
  };
}

/**
 * Accept only the narrow status projection published by the orchestrator.  In
 * particular, a response for another operation can never be used to claim the
 * caller's migration completed.
 */
export function parseSandboxMigrationStatus(
  value: unknown,
  expected: { sandboxId: string; operationId?: string },
): SandboxMigrationStatus | null {
  const record = recordOf(value);
  if (
    !record ||
    record.sandbox_id !== expected.sandboxId ||
    ![
      "in_progress",
      "recovering",
      "migrated",
      "rolled_back",
      "recovery_required",
      "idle",
    ].includes(String(record.outcome)) ||
    typeof record.execution_state !== "string" ||
    typeof record.phase !== "string" ||
    (record.reason !== undefined && typeof record.reason !== "string")
  ) {
    return null;
  }
  const operationId = record.operation_id;
  if (operationId !== null && !isCanonicalMigrationOperationId(operationId)) {
    return null;
  }
  if (
    expected.operationId !== undefined &&
    operationId !== expected.operationId
  ) {
    return null;
  }
  return {
    sandbox_id: expected.sandboxId,
    operation_id: operationId,
    outcome: record.outcome as SandboxMigrationOutcome,
    execution_state: record.execution_state,
    phase: record.phase,
    ...(typeof record.reason === "string" ? { reason: record.reason } : {}),
  };
}
