import type {
  CalendarCreateIntent,
  CalendarCreateRequest,
  CalendarCreateResult,
} from "./calendarCreateService";

export interface StorageDoor {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type CalendarCreatePhase =
  | "preview_unavailable"
  | "reviewed_unattempted"
  | "attempting"
  | "retryable_same_intent"
  | "uncertain"
  | "reconciliation_required"
  | "consumed";

export interface CalendarCreateRecoveryRecord {
  version: 1;
  actor_id: string;
  account_label: string;
  calendar_summary: string;
  time_zone: string;
  request: CalendarCreateRequest;
  intent: CalendarCreateIntent | null;
  result: CalendarCreateResult | null;
  phase: CalendarCreatePhase;
}

export const CALENDAR_CREATE_RECOVERY_KEY = "matrx.google-calendar.create-recovery.v1";

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonempty(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

const EVENT_ID = /^[0-9a-v]{5,1024}$/;
const AWARE_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/;
const PHASES: CalendarCreatePhase[] = [
  "preview_unavailable", "reviewed_unattempted", "attempting",
  "retryable_same_intent", "uncertain", "reconciliation_required", "consumed",
];

export function validateCalendarCreateRequest(value: unknown): CalendarCreateRequest | null {
  if (!record(value)) return null;
  const allowed = new Set([
    "connection_id", "calendar_id", "event_id", "summary", "starts_at", "ends_at",
    "description", "attendees", "send_updates", "organization_id",
  ]);
  if (Object.keys(value).some((key) => !allowed.has(key))) return null;
  if (
    !nonempty(value.connection_id) || !nonempty(value.calendar_id) ||
    !nonempty(value.organization_id) || !nonempty(value.summary) || value.summary.length > 1024 ||
    !nonempty(value.event_id) || !EVENT_ID.test(value.event_id) ||
    !nonempty(value.starts_at) || !AWARE_DATE_TIME.test(value.starts_at) ||
    !nonempty(value.ends_at) || !AWARE_DATE_TIME.test(value.ends_at) ||
    !["all", "externalOnly", "none"].includes(String(value.send_updates)) ||
    !(value.description === null || value.description === undefined || typeof value.description === "string") ||
    !Array.isArray(value.attendees)
  ) return null;
  const attendees: { email: string; display_name?: string | null }[] = [];
  for (const attendee of value.attendees) {
    if (!record(attendee) || !nonempty(attendee.email)) return null;
    if (!(attendee.display_name === null || attendee.display_name === undefined || typeof attendee.display_name === "string")) return null;
    attendees.push({
      email: attendee.email,
      ...(typeof attendee.display_name === "string" || attendee.display_name === null
        ? { display_name: attendee.display_name }
        : {}),
    });
  }
  if (Date.parse(value.ends_at) <= Date.parse(value.starts_at)) return null;
  return {
    connection_id: value.connection_id,
    calendar_id: value.calendar_id,
    event_id: value.event_id,
    summary: value.summary.trim(),
    starts_at: value.starts_at,
    ends_at: value.ends_at,
    description: typeof value.description === "string" ? value.description.trim() || null : null,
    attendees,
    send_updates: value.send_updates as CalendarCreateRequest["send_updates"],
    organization_id: value.organization_id,
  };
}

function validIntent(value: unknown, request: CalendarCreateRequest): CalendarCreateIntent | null {
  if (!record(value) || !nonempty(value.intent_id) || !nonempty(value.expires_at) || !record(value.preview)) return null;
  const preview = value.preview;
  if (
    preview.calendar_id !== request.calendar_id || preview.event_id !== request.event_id ||
    preview.summary !== request.summary || preview.starts_at !== request.starts_at ||
    preview.ends_at !== request.ends_at || preview.send_updates !== request.send_updates ||
    !nonempty(preview.calendar_summary) ||
    !["owner", "writer", "writerWithoutPrivateAccess"].includes(String(preview.access_role)) ||
    !Array.isArray(preview.attendees)
  ) return null;
  return value as CalendarCreateIntent;
}

export function calendarCreateResultMatches(
  saved: CalendarCreateRecoveryRecord,
  result: CalendarCreateResult,
): boolean {
  const reviewed = saved.intent;
  if (!reviewed || result.intent_id !== reviewed.intent_id) return false;
  const actual = result.result;
  const expected = reviewed.preview;
  return actual.calendar_id === expected.calendar_id && actual.event_id === expected.event_id &&
    actual.summary === expected.summary && actual.starts_at === expected.starts_at &&
    actual.ends_at === expected.ends_at && actual.send_updates === expected.send_updates;
}

export function readCalendarCreateRecovery(
  storage: StorageDoor,
  actorId: string,
): { record: CalendarCreateRecoveryRecord | null; warning: string | null } {
  let raw: string | null;
  try { raw = storage.getItem(CALENDAR_CREATE_RECOVERY_KEY); }
  catch { return { record: null, warning: "Calendar recovery is unavailable in this tab." }; }
  if (!raw) return { record: null, warning: null };
  let value: unknown;
  try { value = JSON.parse(raw); }
  catch { return { record: null, warning: "An invalid calendar recovery record was ignored." }; }
  if (!record(value) || value.version !== 1 || !nonempty(value.actor_id)) {
    return { record: null, warning: "An invalid calendar recovery record was ignored." };
  }
  if (value.actor_id !== actorId) {
    return { record: null, warning: "Calendar recovery for another signed-in person was ignored." };
  }
  const request = validateCalendarCreateRequest(value.request);
  if (!request || !nonempty(value.account_label) || !nonempty(value.calendar_summary) ||
    !nonempty(value.time_zone) || !PHASES.includes(value.phase as CalendarCreatePhase)) {
    return { record: null, warning: "An invalid calendar recovery record was ignored." };
  }
  const intent = value.intent === null ? null : validIntent(value.intent, request);
  if (value.intent !== null && !intent) return { record: null, warning: "An invalid calendar recovery record was ignored." };
  const saved: CalendarCreateRecoveryRecord = {
    version: 1,
    actor_id: actorId,
    account_label: value.account_label,
    calendar_summary: value.calendar_summary,
    time_zone: value.time_zone,
    request,
    intent,
    result: record(value.result) ? value.result as CalendarCreateResult : null,
    phase: value.phase as CalendarCreatePhase,
  };
  if (saved.phase !== "attempting") return { record: saved, warning: null };
  const uncertain = { ...saved, phase: "uncertain" as const };
  writeCalendarCreateRecovery(storage, uncertain);
  return { record: uncertain, warning: "This event create may have reached Google before the page reloaded." };
}

export function writeCalendarCreateRecovery(storage: StorageDoor, saved: CalendarCreateRecoveryRecord): boolean {
  if (!validateCalendarCreateRequest(saved.request) || !nonempty(saved.actor_id) || !PHASES.includes(saved.phase)) return false;
  const raw = JSON.stringify(saved);
  try {
    storage.setItem(CALENDAR_CREATE_RECOVERY_KEY, raw);
    return storage.getItem(CALENDAR_CREATE_RECOVERY_KEY) === raw;
  } catch { return false; }
}

export function sameCalendarCreateScope(saved: CalendarCreateRecoveryRecord, scope: {
  actorId: string; organizationId: string; connectionId: string; calendarId: string;
}): boolean {
  return saved.actor_id === scope.actorId && saved.request.organization_id === scope.organizationId &&
    saved.request.connection_id === scope.connectionId && saved.request.calendar_id === scope.calendarId;
}
