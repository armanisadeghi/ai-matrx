import type {
  CalendarCreateIntent,
  CalendarCreateRequest,
  CalendarCreateResult,
} from "./calendarCreateService";
import type { CalendarEventSourceResult } from "./calendarEventSourceService";

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
  | "source_verified"
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
  source: CalendarEventSourceResult | null;
  problem: string | null;
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
const EMAIL = /^[^@\s]+@[^@\s]+$/;
const PHASES: CalendarCreatePhase[] = [
  "preview_unavailable", "reviewed_unattempted", "attempting",
  "retryable_same_intent", "uncertain", "reconciliation_required", "consumed",
  "source_verified",
];

export function validateCalendarCreateRequest(value: unknown): CalendarCreateRequest | null {
  if (!record(value)) return null;
  const allowed = new Set([
    "connection_id", "calendar_id", "event_id", "summary", "starts_at", "ends_at",
    "description", "attendees", "send_updates", "organization_id",
  ]);
  if (Object.keys(value).some((key) => !allowed.has(key))) return null;
  if (
    !nonempty(value.connection_id) || value.connection_id.length > 128 ||
    !nonempty(value.calendar_id) || value.calendar_id.length > 1024 ||
    !nonempty(value.organization_id) || value.organization_id.length > 128 ||
    !nonempty(value.summary) || !value.summary.trim() || value.summary.length > 1024 ||
    !nonempty(value.event_id) || !EVENT_ID.test(value.event_id) ||
    !nonempty(value.starts_at) || !AWARE_DATE_TIME.test(value.starts_at) ||
    !nonempty(value.ends_at) || !AWARE_DATE_TIME.test(value.ends_at) ||
    !["all", "externalOnly", "none"].includes(String(value.send_updates)) ||
    !(value.description === null || value.description === undefined || typeof value.description === "string") ||
    !Array.isArray(value.attendees) || value.attendees.length > 100 ||
    (typeof value.description === "string" && value.description.length > 8192) ||
    !Number.isFinite(Date.parse(value.starts_at)) || !Number.isFinite(Date.parse(value.ends_at))
  ) return null;
  const attendees: { email: string; display_name?: string | null }[] = [];
  for (const attendee of value.attendees) {
    if (!record(attendee) || !nonempty(attendee.email) || attendee.email.length > 320 || !EMAIL.test(attendee.email)) return null;
    if (!(attendee.display_name === null || attendee.display_name === undefined || typeof attendee.display_name === "string")) return null;
    if (typeof attendee.display_name === "string" && attendee.display_name.length > 200) return null;
    attendees.push({
      email: attendee.email,
      ...(typeof attendee.display_name === "string" || attendee.display_name === null
        ? { display_name: attendee.display_name }
        : {}),
    });
  }
  const normalizedEmails = attendees.map((attendee) => attendee.email.trim().toLowerCase());
  if (new Set(normalizedEmails).size !== normalizedEmails.length) return null;
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

function sameInstant(left: unknown, right: string): boolean {
  return typeof left === "string" && Number.isFinite(Date.parse(left)) && Date.parse(left) === Date.parse(right);
}

function normalizedAttendees(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const rows: string[] = [];
  for (const item of value) {
    if (!record(item) || !nonempty(item.email)) return null;
    rows.push(`${item.email.trim().toLowerCase()}|${typeof item.display_name === "string" ? item.display_name : ""}`);
  }
  return rows.sort();
}

function sameAttendees(left: unknown, right: unknown): boolean {
  const a = normalizedAttendees(left);
  const b = normalizedAttendees(right);
  return a !== null && b !== null && JSON.stringify(a) === JSON.stringify(b);
}

export function calendarCreateIntentMatchesRequest(
  value: unknown,
  request: CalendarCreateRequest,
  identity: { accountLabel: string; calendarSummary: string },
): value is CalendarCreateIntent {
  if (!record(value) || !nonempty(value.intent_id) || !nonempty(value.expires_at) || !record(value.preview)) return false;
  const preview = value.preview;
  return !(
    preview.calendar_id !== request.calendar_id || preview.event_id !== request.event_id ||
    preview.summary !== request.summary || !sameInstant(preview.starts_at, request.starts_at) ||
    !sameInstant(preview.ends_at, request.ends_at) || preview.send_updates !== request.send_updates ||
    preview.description !== request.description || preview.account_email !== identity.accountLabel ||
    preview.calendar_summary !== identity.calendarSummary || !sameAttendees(preview.attendees, request.attendees) ||
    !nonempty(preview.guest_notification_behavior) || !nonempty(preview.undo_notice) ||
    !["owner", "writer", "writerWithoutPrivateAccess"].includes(String(preview.access_role)) ||
    !Number.isFinite(Date.parse(value.expires_at))
  );
}

export function calendarCreateResultMatches(
  saved: CalendarCreateRecoveryRecord,
  result: unknown,
): boolean {
  const reviewed = saved.intent;
  if (!reviewed || !record(result) || result.intent_id !== reviewed.intent_id || !record(result.result)) return false;
  const actual = result.result;
  const expected = reviewed.preview;
  return actual.calendar_id === expected.calendar_id && actual.event_id === expected.event_id &&
    actual.account_email === expected.account_email && actual.calendar_summary === expected.calendar_summary &&
    actual.access_role === expected.access_role && actual.summary === expected.summary &&
    actual.description === expected.description && sameInstant(actual.starts_at, expected.starts_at) &&
    sameInstant(actual.ends_at, expected.ends_at) && sameAttendees(actual.attendees, expected.attendees) &&
    actual.send_updates === expected.send_updates &&
    actual.guest_notification_behavior === expected.guest_notification_behavior &&
    actual.undo_notice === expected.undo_notice && actual.provider_event_id === expected.event_id;
}

function sourceTime(value: unknown): string | null {
  if (!record(value) || typeof value.dateTime !== "string") return null;
  return Number.isFinite(Date.parse(value.dateTime)) ? value.dateTime : null;
}

function actionEligibility(value: unknown): boolean {
  if (!record(value) || typeof value.available !== "boolean") return false;
  return value.available
    ? value.unavailable_reason === null || value.unavailable_reason === undefined
    : nonempty(value.unavailable_reason);
}

export function calendarEventSourceMatchesRecovery(
  saved: CalendarCreateRecoveryRecord,
  value: unknown,
): value is CalendarEventSourceResult {
  if (!saved.intent || !record(value)) return false;
  const start = sourceTime(value.starts_at);
  const end = sourceTime(value.ends_at);
  return value.account_email === saved.intent.preview.account_email &&
    value.calendar_id === saved.request.calendar_id &&
    nonempty(value.calendar_summary) &&
    ["owner", "writer", "writerWithoutPrivateAccess", "reader", "freeBusyReader"].includes(String(value.access_role)) &&
    value.selected_event_id === saved.request.event_id &&
    value.target_event_id === saved.request.event_id &&
    nonempty(value.target_etag) && value.target_etag.trim().length > 0 &&
    value.occurrence === "single" &&
    value.redacted === false &&
    value.event_summary === saved.request.summary &&
    start !== null && end !== null &&
    sameInstant(start, saved.request.starts_at) && sameInstant(end, saved.request.ends_at) &&
    Date.parse(end) > Date.parse(start) &&
    (value.recurrence === undefined || (Array.isArray(value.recurrence) && value.recurrence.every((item) => typeof item === "string"))) &&
    (value.original_start_time === undefined || value.original_start_time === null || record(value.original_start_time)) &&
    (value.organizer_email === undefined || value.organizer_email === null || typeof value.organizer_email === "string") &&
    (value.organizer_self === undefined || value.organizer_self === null || typeof value.organizer_self === "boolean") &&
    (value.self_response_status === undefined || value.self_response_status === null || ["accepted", "declined", "needsAction", "tentative"].includes(String(value.self_response_status))) &&
    actionEligibility(value.move) && actionEligibility(value.cancel) && actionEligibility(value.rsvp);
}

export function settleCalendarCreateFromSource(
  saved: CalendarCreateRecoveryRecord,
  source: unknown,
): CalendarCreateRecoveryRecord | null {
  if (!["uncertain", "reconciliation_required"].includes(saved.phase) ||
    !calendarEventSourceMatchesRecovery(saved, source)) return null;
  return { ...saved, source, problem: null, phase: "source_verified" };
}

function calendarCreateResultShape(value: unknown): value is CalendarCreateResult {
  if (!record(value) || !nonempty(value.intent_id) || !record(value.result)) return false;
  const result = value.result;
  return (result.account_email === null || typeof result.account_email === "string") &&
    nonempty(result.calendar_id) && nonempty(result.calendar_summary) &&
    ["owner", "writer", "writerWithoutPrivateAccess"].includes(String(result.access_role)) &&
    nonempty(result.event_id) && nonempty(result.summary) &&
    (result.description === null || result.description === undefined || typeof result.description === "string") &&
    typeof result.starts_at === "string" && Number.isFinite(Date.parse(result.starts_at)) &&
    typeof result.ends_at === "string" && Number.isFinite(Date.parse(result.ends_at)) &&
    normalizedAttendees(result.attendees) !== null &&
    ["all", "externalOnly", "none"].includes(String(result.send_updates)) &&
    nonempty(result.guest_notification_behavior) && nonempty(result.undo_notice) &&
    nonempty(result.provider_event_id) &&
    (result.provider_etag === null || result.provider_etag === undefined || typeof result.provider_etag === "string") &&
    (result.reconciled_after_uncertain_insert === undefined || typeof result.reconciled_after_uncertain_insert === "boolean");
}

function validRecoveryRecord(saved: CalendarCreateRecoveryRecord): boolean {
  const request = validateCalendarCreateRequest(saved.request);
  if (!request || !nonempty(saved.actor_id) || !nonempty(saved.account_label) ||
    !nonempty(saved.calendar_summary) || !nonempty(saved.time_zone) || !PHASES.includes(saved.phase) ||
    !(saved.problem === null || (nonempty(saved.problem) && saved.problem.length <= 500))) return false;
  const identity = { accountLabel: saved.account_label, calendarSummary: saved.calendar_summary };
  const intentValid = saved.intent !== null &&
    calendarCreateIntentMatchesRequest(saved.intent, request, identity);
  const resultValid = saved.result !== null && calendarCreateResultShape(saved.result);
  const sourceValid = saved.source !== null && calendarEventSourceMatchesRecovery(saved, saved.source);
  switch (saved.phase) {
    case "preview_unavailable":
      return saved.intent === null && saved.result === null && saved.source === null && nonempty(saved.problem);
    case "reviewed_unattempted":
    case "attempting":
    case "retryable_same_intent":
      return intentValid && saved.result === null && saved.source === null && saved.problem === null;
    case "uncertain":
      return intentValid && saved.result === null && saved.source === null && nonempty(saved.problem);
    case "reconciliation_required":
      return intentValid && resultValid && saved.source === null && !calendarCreateResultMatches(saved, saved.result) && nonempty(saved.problem);
    case "source_verified":
      return intentValid && sourceValid &&
        (saved.result === null || (resultValid && !calendarCreateResultMatches(saved, saved.result))) &&
        saved.problem === null;
    case "consumed":
      return intentValid && resultValid && saved.source === null && calendarCreateResultMatches(saved, saved.result) && saved.problem === null;
  }
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
  const identity = { accountLabel: value.account_label, calendarSummary: value.calendar_summary };
  const intent = value.intent === null ? null : calendarCreateIntentMatchesRequest(value.intent, request, identity) ? value.intent : null;
  if (value.intent !== null && !intent) return { record: null, warning: "An invalid calendar recovery record was ignored." };
  const result = value.result === null ? null : calendarCreateResultShape(value.result) ? value.result : null;
  if (value.result !== null && !result) return { record: null, warning: "An invalid calendar recovery record was ignored." };
  const base: CalendarCreateRecoveryRecord = {
    version: 1,
    actor_id: actorId,
    account_label: value.account_label,
    calendar_summary: value.calendar_summary,
    time_zone: value.time_zone,
    request,
    intent,
    result,
    source: null,
    problem: value.problem === null || typeof value.problem === "string" ? value.problem : null,
    phase: value.phase as CalendarCreatePhase,
  };
  const source = value.source === undefined || value.source === null
    ? null
    : calendarEventSourceMatchesRecovery(base, value.source) ? value.source : null;
  if (value.source !== undefined && value.source !== null && source === null) {
    return { record: null, warning: "An invalid calendar recovery record was ignored." };
  }
  const saved: CalendarCreateRecoveryRecord = { ...base, source };
  if (!validRecoveryRecord(saved)) return { record: null, warning: "An invalid calendar recovery record was ignored." };
  if (saved.phase !== "attempting") return { record: saved, warning: null };
  const uncertain = {
    ...saved,
    phase: "uncertain" as const,
    problem: "This event create may have reached Google before the page reloaded.",
  };
  writeCalendarCreateRecovery(storage, uncertain);
  return { record: uncertain, warning: "This event create may have reached Google before the page reloaded." };
}

export function writeCalendarCreateRecovery(storage: StorageDoor, saved: CalendarCreateRecoveryRecord): boolean {
  if (!validRecoveryRecord(saved)) return false;
  const raw = JSON.stringify(saved);
  try {
    storage.setItem(CALENDAR_CREATE_RECOVERY_KEY, raw);
    return storage.getItem(CALENDAR_CREATE_RECOVERY_KEY) === raw;
  } catch { return false; }
}

export function clearCalendarCreateRecovery(storage: StorageDoor): boolean {
  try {
    storage.removeItem(CALENDAR_CREATE_RECOVERY_KEY);
    return storage.getItem(CALENDAR_CREATE_RECOVERY_KEY) === null;
  } catch { return false; }
}

export function sameCalendarCreateScope(saved: CalendarCreateRecoveryRecord, scope: {
  actorId: string; organizationId: string; connectionId: string; calendarId: string;
}): boolean {
  return saved.actor_id === scope.actorId && saved.request.organization_id === scope.organizationId &&
    saved.request.connection_id === scope.connectionId && saved.request.calendar_id === scope.calendarId;
}
