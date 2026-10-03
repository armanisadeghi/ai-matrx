import type { components } from "@ai-matrx/agents/generated/api-types";

export type GoogleTaskCreateRequest =
  components["schemas"]["GoogleTaskCreateRequest"];

export type GoogleTaskCreatePhase =
  | "reviewed_unattempted"
  | "attempting"
  | "known_unsent"
  | "uncertain";

export interface GoogleTaskCreateRecoveryRecord {
  version: 1;
  actor_id: string;
  request: GoogleTaskCreateRequest;
  phase: GoogleTaskCreatePhase;
}

export interface StorageDoor {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const GOOGLE_TASK_CREATE_RECOVERY_KEY =
  "matrx.google-tasks.create-recovery.v1";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

export function normalizeGoogleTaskCreateRequest(input: {
  organizationId: string;
  connectionId: string;
  taskListId: string;
  callerStableKey: string;
  title: string;
  notes: string;
  dueDate: string;
}): GoogleTaskCreateRequest {
  return {
    organization_id: input.organizationId,
    connection_id: input.connectionId,
    task_list_id: input.taskListId,
    caller_stable_key: input.callerStableKey,
    title: input.title.trim(),
    notes: input.notes.trim() || null,
    due: input.dueDate
      ? `${input.dueDate}T00:00:00.000Z`
      : null,
  };
}

function parseRequest(value: unknown): GoogleTaskCreateRequest | null {
  if (!isRecord(value)) return null;
  if (
    !text(value.organization_id) ||
    !text(value.connection_id) ||
    !text(value.task_list_id) ||
    !text(value.caller_stable_key) ||
    !text(value.title) ||
    !(value.notes === null || value.notes === undefined || typeof value.notes === "string") ||
    !(value.due === null || value.due === undefined || typeof value.due === "string")
  ) return null;
  return {
    organization_id: value.organization_id,
    connection_id: value.connection_id,
    task_list_id: value.task_list_id,
    caller_stable_key: value.caller_stable_key,
    title: value.title,
    notes: value.notes ?? null,
    due: value.due ?? null,
  };
}

export function readGoogleTaskCreateRecovery(
  storage: StorageDoor,
  actorId: string,
): { record: GoogleTaskCreateRecoveryRecord | null; warning: string | null } {
  let raw: string | null;
  try {
    raw = storage.getItem(GOOGLE_TASK_CREATE_RECOVERY_KEY);
  } catch {
    return { record: null, warning: "Task recovery storage is unavailable in this tab." };
  }
  if (!raw) return { record: null, warning: null };
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { record: null, warning: "A malformed task recovery record was ignored." };
  }
  if (!isRecord(value) || value.version !== 1 || !text(value.actor_id)) {
    return { record: null, warning: "An invalid task recovery record was ignored." };
  }
  if (value.actor_id !== actorId) {
    return { record: null, warning: "A task recovery record for another signed-in person was ignored." };
  }
  const request = parseRequest(value.request);
  const phase = value.phase;
  if (!request || !["reviewed_unattempted", "attempting", "known_unsent", "uncertain"].includes(String(phase))) {
    return { record: null, warning: "An invalid task recovery record was ignored." };
  }
  const record: GoogleTaskCreateRecoveryRecord = {
    version: 1,
    actor_id: actorId,
    request,
    phase: phase as GoogleTaskCreatePhase,
  };
  if (record.phase === "attempting") {
    const uncertain = { ...record, phase: "uncertain" as const };
    try {
      storage.setItem(GOOGLE_TASK_CREATE_RECOVERY_KEY, JSON.stringify(uncertain));
    } catch {
      return {
        record: uncertain,
        warning: "This create may have been sent. Recovery storage could not save its uncertain state.",
      };
    }
    return {
      record: uncertain,
      warning: "This task create may have been sent before the page reloaded.",
    };
  }
  return { record, warning: null };
}

export function writeGoogleTaskCreateRecovery(
  storage: StorageDoor,
  record: GoogleTaskCreateRecoveryRecord,
): boolean {
  try {
    storage.setItem(GOOGLE_TASK_CREATE_RECOVERY_KEY, JSON.stringify(record));
    return storage.getItem(GOOGLE_TASK_CREATE_RECOVERY_KEY) === JSON.stringify(record);
  } catch {
    return false;
  }
}

export function clearGoogleTaskCreateRecovery(storage: StorageDoor): boolean {
  try {
    storage.removeItem(GOOGLE_TASK_CREATE_RECOVERY_KEY);
    return storage.getItem(GOOGLE_TASK_CREATE_RECOVERY_KEY) === null;
  } catch {
    return false;
  }
}

export function sameGoogleTaskCreateScope(
  record: GoogleTaskCreateRecoveryRecord,
  scope: { actorId: string; organizationId: string; connectionId: string; taskListId: string },
): boolean {
  return record.actor_id === scope.actorId &&
    record.request.organization_id === scope.organizationId &&
    record.request.connection_id === scope.connectionId &&
    record.request.task_list_id === scope.taskListId;
}
