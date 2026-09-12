export interface SandboxMigrationFailure {
  kind: "busy_deferred" | "failure";
  message: string;
  code: string;
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
