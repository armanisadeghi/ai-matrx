import type { KindStreamEvent } from "@/features/content-ir/core/kind-parser";

export type ValidationStatus = "idle" | "valid" | "partial" | "failed";

export type ValidatedObjectEntry = {
  kind: string;
  path: Array<string | number>;
  pathLabel: string;
  value: Record<string, unknown>;
};

export type RawFallbackEntry = {
  path: Array<string | number>;
  pathLabel: string;
  reason: string;
  value: unknown;
};

export type SchemaNoticeEntry = {
  kind: string;
  path: Array<string | number>;
  pathLabel: string;
  field: string;
};

export type ValidationReport = {
  status: ValidationStatus;
  validatedObjects: ValidatedObjectEntry[];
  rawFallbacks: RawFallbackEntry[];
  optionalMissing: SchemaNoticeEntry[];
  extraFields: SchemaNoticeEntry[];
  completeKind: string | null;
  completeValue: unknown;
  eventCount: number;
  hasStreamError: boolean;
  streamError: string | null;
};

export function eventPathKey(path: Array<string | number>): string {
  return path.map((segment) => String(segment)).join(".");
}

export function pathLabel(path: Array<string | number>): string {
  if (path.length === 0) return "root";

  const parts: string[] = [];
  for (const segment of path) {
    if (typeof segment === "number") {
      parts[parts.length - 1] += `[${segment}]`;
    } else {
      parts.push(String(segment));
    }
  }
  return parts.join(".");
}

export function buildValidationReport(
  events: KindStreamEvent[],
): ValidationReport {
  const hasStreamError = events.some((event) => event.type === "error");
  const streamError =
    events.find((event) => event.type === "error")?.reason ?? null;
  const isComplete = events.some((event) => event.type === "complete");
  const completeEvent = events.find((event) => event.type === "complete");

  const validatedObjects = events
    .filter((event) => event.type === "object_complete")
    .map((event) => ({
      kind: event.kind,
      path: event.path,
      pathLabel: pathLabel(event.path),
      value: event.value,
    }));

  const rawFallbacks = events
    .filter((event) => event.type === "raw_object")
    .map((event) => ({
      path: event.path,
      pathLabel: pathLabel(event.path),
      reason: event.reason,
      value: event.value,
    }));

  const optionalMissing = events
    .filter((event) => event.type === "optional_field_missing")
    .map((event) => ({
      kind: event.kind,
      path: event.path,
      pathLabel: pathLabel(event.path),
      field: event.field,
    }));

  const extraFields = events
    .filter((event) => event.type === "extra_field")
    .map((event) => ({
      kind: event.kind,
      path: event.path,
      pathLabel: pathLabel(event.path),
      field: event.field,
    }));

  let status: ValidationStatus = "idle";
  if (hasStreamError) {
    status = "failed";
  } else if (isComplete) {
    status = rawFallbacks.length === 0 ? "valid" : "partial";
  }

  return {
    status,
    validatedObjects,
    rawFallbacks,
    optionalMissing,
    extraFields,
    completeKind: completeEvent?.kind ?? null,
    completeValue: completeEvent?.value ?? null,
    eventCount: events.length,
    hasStreamError,
    streamError,
  };
}
