import type { StorageDoor } from "./calendarCreateRecovery";
import type {
  CalendarCancelPreview,
  CalendarCancelRequest,
  CalendarCancelResult,
  CalendarReschedulePreview,
  CalendarRescheduleRequest,
  CalendarRescheduleResult,
  CalendarRsvpPreview,
  CalendarRsvpRequest,
  CalendarRsvpResult,
} from "./calendarChangeService";
import type { CalendarEventSourceResult } from "./calendarEventSourceService";

export type CalendarChangeAction =
  | { kind: "reschedule"; request: CalendarRescheduleRequest; preview: CalendarReschedulePreview; result: CalendarRescheduleResult | null }
  | { kind: "cancel"; request: CalendarCancelRequest; preview: CalendarCancelPreview; result: CalendarCancelResult | null }
  | { kind: "rsvp"; request: CalendarRsvpRequest; preview: CalendarRsvpPreview; result: CalendarRsvpResult | null };

export type CalendarChangePhase =
  | "reviewed_unattempted"
  | "attempting"
  | "uncertain"
  | "reconciliation_required"
  | "succeeded"
  | "source_requested"
  | "source_unchanged"
  | "source_divergent"
  | "fresh_review_started";

export interface CalendarChangeAttempt {
  version: 1;
  attempt_id: string;
  actor_id: string;
  organization_id: string;
  connection_id: string;
  account_label: string;
  calendar_id: string;
  calendar_summary: string;
  selected_event_id: string;
  target_event_id: string;
  occurrence: "instance" | "series" | "single";
  original_source: CalendarEventSourceResult;
  action: CalendarChangeAction;
  phase: CalendarChangePhase;
  problem: string | null;
  source_proof: CalendarEventSourceResult | null;
}

export interface CalendarChangeCollection {
  version: 1;
  actor_id: string;
  organization_id: string;
  connection_id: string;
  calendar_id: string;
  attempts: CalendarChangeAttempt[];
}

export interface CalendarChangeScope {
  actorId: string;
  organizationId: string;
  connectionId: string;
  calendarId: string;
}

export type CalendarSourceReconciliation = "requested" | "unchanged" | "divergent";

const PHASES = new Set<CalendarChangePhase>([
  "reviewed_unattempted", "attempting", "uncertain", "reconciliation_required",
  "succeeded", "source_requested", "source_unchanged", "source_divergent",
  "fresh_review_started",
]);
const OCCURRENCES = new Set(["instance", "series", "single"]);
const SEND_UPDATES = new Set(["all", "externalOnly", "none"]);
const RSVP = new Set(["accepted", "declined", "needsAction", "tentative"]);
const ACCESS_ROLES = new Set(["freeBusyReader", "owner", "reader", "writer", "writerWithoutPrivateAccess"]);
const AWARE_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonempty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function optionalString(value: unknown): boolean {
  return value === undefined || value === null || typeof value === "string";
}

function jsonMap(value: unknown): value is Record<string, unknown> {
  return record(value) && Object.values(value).every((entry) =>
    entry === null || ["string", "number", "boolean"].includes(typeof entry) ||
    Array.isArray(entry) || record(entry),
  );
}

function eligible(value: unknown): boolean {
  if (!record(value) || typeof value.available !== "boolean") return false;
  return value.available ? value.unavailable_reason == null : nonempty(value.unavailable_reason);
}

function validSource(value: unknown): value is CalendarEventSourceResult {
  return record(value) && nonempty(value.account_email) && nonempty(value.calendar_id) &&
    nonempty(value.calendar_summary) && ACCESS_ROLES.has(String(value.access_role)) && nonempty(value.selected_event_id) &&
    OCCURRENCES.has(String(value.occurrence)) && typeof value.redacted === "boolean" &&
    optionalString(value.target_event_id) && optionalString(value.target_etag) &&
    optionalString(value.event_summary) && optionalString(value.organizer_email) &&
    (value.organizer_self == null || typeof value.organizer_self === "boolean") &&
    (value.self_response_status == null || RSVP.has(String(value.self_response_status))) &&
    (value.starts_at == null || jsonMap(value.starts_at)) &&
    (value.ends_at == null || jsonMap(value.ends_at)) &&
    (value.original_start_time == null || jsonMap(value.original_start_time)) &&
    (value.recurrence === undefined || (Array.isArray(value.recurrence) && value.recurrence.every((item) => typeof item === "string"))) &&
    eligible(value.move) && eligible(value.cancel) && eligible(value.rsvp);
}

function validBaseRequest(value: unknown): value is CalendarRescheduleRequest | CalendarCancelRequest | CalendarRsvpRequest {
  return record(value) && nonempty(value.connection_id) && nonempty(value.calendar_id) &&
    nonempty(value.event_id) && OCCURRENCES.has(String(value.occurrence)) &&
    nonempty(value.expected_etag) && SEND_UPDATES.has(String(value.send_updates));
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  const allowedKeys = new Set(allowed);
  return Object.keys(value).every((key) => allowedKeys.has(key)) && allowed.every((key) => key in value);
}

function validRescheduleRequest(value: unknown): value is CalendarRescheduleRequest {
  return validBaseRequest(value) && nonempty(value.starts_at) && nonempty(value.ends_at) &&
    AWARE_DATE_TIME.test(value.starts_at) && AWARE_DATE_TIME.test(value.ends_at) &&
    Number.isFinite(Date.parse(value.starts_at)) && Number.isFinite(Date.parse(value.ends_at)) &&
    Date.parse(value.ends_at) > Date.parse(value.starts_at) && exactKeys(value, [
      "connection_id", "calendar_id", "event_id", "occurrence", "expected_etag", "starts_at", "ends_at", "send_updates",
    ]);
}

function validCancelRequest(value: unknown): value is CalendarCancelRequest {
  return validBaseRequest(value) && exactKeys(value, [
    "connection_id", "calendar_id", "event_id", "occurrence", "expected_etag", "send_updates",
  ]);
}

function validRsvpRequest(value: unknown): value is CalendarRsvpRequest {
  return validBaseRequest(value) && RSVP.has(String(value.response_status)) && exactKeys(value, [
    "connection_id", "calendar_id", "event_id", "occurrence", "expected_etag", "response_status", "send_updates",
  ]);
}

function sameInstant(left: unknown, right: unknown): boolean {
  return typeof left === "string" && typeof right === "string" &&
    Number.isFinite(Date.parse(left)) && Number.isFinite(Date.parse(right)) &&
    Date.parse(left) === Date.parse(right);
}

function timed(value: unknown): string | null {
  if (!record(value) || typeof value.dateTime !== "string") return null;
  return AWARE_DATE_TIME.test(value.dateTime) && Number.isFinite(Date.parse(value.dateTime)) ? value.dateTime : null;
}

function allDay(value: unknown): string | null {
  return record(value) && typeof value.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.date)
    ? value.date : null;
}

function sameSourceTimes(leftStart: unknown, leftEnd: unknown, rightStart: unknown, rightEnd: unknown): boolean {
  const leftTimedStart = timed(leftStart);
  const leftTimedEnd = timed(leftEnd);
  const rightTimedStart = timed(rightStart);
  const rightTimedEnd = timed(rightEnd);
  if (leftTimedStart && leftTimedEnd && rightTimedStart && rightTimedEnd) {
    return sameInstant(leftTimedStart, rightTimedStart) && sameInstant(leftTimedEnd, rightTimedEnd);
  }
  const leftDateStart = allDay(leftStart);
  const leftDateEnd = allDay(leftEnd);
  const rightDateStart = allDay(rightStart);
  const rightDateEnd = allDay(rightEnd);
  return Boolean(leftDateStart && leftDateEnd && rightDateStart && rightDateEnd &&
    leftDateStart === rightDateStart && leftDateEnd === rightDateEnd);
}

function sameStringArray(left: unknown, right: unknown): boolean {
  return Array.isArray(left) && Array.isArray(right) && left.length === right.length &&
    left.every((value, index) => typeof value === "string" && value === right[index]);
}

function previewIdentityMatches(
  request: CalendarRescheduleRequest | CalendarCancelRequest | CalendarRsvpRequest,
  preview: Record<string, unknown>,
  source: CalendarEventSourceResult,
): boolean {
  return preview.account_email === source.account_email && preview.calendar_id === request.calendar_id &&
    preview.calendar_summary === source.calendar_summary && preview.event_id === request.event_id &&
    preview.occurrence === request.occurrence && preview.etag === request.expected_etag &&
    preview.event_summary === source.event_summary && preview.send_updates === request.send_updates;
}

export function calendarChangeActionMatchesSource(value: unknown, source: CalendarEventSourceResult): value is CalendarChangeAction {
  if (!record(value) || !record(value.request) || !record(value.preview) || !(value.result === null || record(value.result))) return false;
  const { request, preview, result } = value;
  if (!previewIdentityMatches(request as CalendarRescheduleRequest, preview, source)) return false;
  if (value.kind === "reschedule") {
    if (!validRescheduleRequest(request) || !sameInstant((preview.new_start as Record<string, unknown> | undefined)?.dateTime, request.starts_at) ||
      !sameInstant((preview.new_end as Record<string, unknown> | undefined)?.dateTime, request.ends_at) ||
      !sameSourceTimes(preview.old_start, preview.old_end, source.starts_at, source.ends_at) ||
      !Array.isArray(preview.attendees) || !nonempty(preview.guest_notification_behavior) || !nonempty(preview.recovery_notice)) return false;
  } else if (value.kind === "cancel") {
    if (!validCancelRequest(request) || !sameSourceTimes(preview.starts_at, preview.ends_at, source.starts_at, source.ends_at) ||
      !Array.isArray(preview.attendees) || !nonempty(preview.guest_notification_behavior) ||
      !nonempty(preview.action_notice) || !nonempty(preview.recovery_notice)) return false;
  } else if (value.kind === "rsvp") {
    if (!validRsvpRequest(request) || preview.old_response_status !== source.self_response_status ||
      preview.new_response_status !== request.response_status || preview.organizer_email !== source.organizer_email ||
      !nonempty(preview.guest_notification_behavior) || !nonempty(preview.action_notice) || !nonempty(preview.recovery_notice)) return false;
  } else return false;
  return result === null || calendarChangeResultShape(value.kind, result);
}

export function calendarChangeResultShape(kind: CalendarChangeAction["kind"], value: unknown): boolean {
  if (!record(value) || !nonempty(value.account_email) || !nonempty(value.calendar_id) ||
    !nonempty(value.calendar_summary) || !["owner", "writer", "writerWithoutPrivateAccess"].includes(String(value.access_role)) ||
    !nonempty(value.event_id) || !OCCURRENCES.has(String(value.occurrence)) || !nonempty(value.event_summary) ||
    !nonempty(value.etag) || !SEND_UPDATES.has(String(value.send_updates)) || !nonempty(value.guest_notification_behavior) ||
    !(value.recovery_notice === undefined || nonempty(value.recovery_notice))) return false;
  if (kind === "reschedule") {
    return jsonMap(value.old_start) && jsonMap(value.old_end) && jsonMap(value.new_start) && jsonMap(value.new_end) &&
      Array.isArray(value.attendees) && value.attendees.every((item) => typeof item === "string") &&
      nonempty(value.provider_etag) && (value.reconciliation_pending === undefined || typeof value.reconciliation_pending === "boolean");
  }
  if (kind === "cancel") {
    return jsonMap(value.starts_at) && jsonMap(value.ends_at) &&
      Array.isArray(value.attendees) && value.attendees.every((item) => typeof item === "string") &&
      (value.action_notice === undefined || nonempty(value.action_notice)) && ["absent", "cancelled"].includes(String(value.source_state));
  }
  return nonempty(value.organizer_email) && RSVP.has(String(value.old_response_status)) && RSVP.has(String(value.new_response_status)) &&
    (value.action_notice === undefined || nonempty(value.action_notice)) && nonempty(value.provider_etag) &&
    (value.already_applied === undefined || typeof value.already_applied === "boolean");
}

function suppliedValueMatches(returned: unknown, reviewed: unknown): boolean {
  return returned === undefined || returned === reviewed;
}

export function calendarChangeResultMatches(action: CalendarChangeAction, value: unknown): boolean {
  if (!calendarChangeResultShape(action.kind, value) || !record(value) || !record(action.preview)) return false;
  const preview = action.preview as unknown as Record<string, unknown>;
  const shared = value.account_email === preview.account_email && value.calendar_id === preview.calendar_id &&
    value.calendar_summary === preview.calendar_summary && value.access_role === preview.access_role &&
    value.event_id === preview.event_id && value.occurrence === preview.occurrence &&
    value.event_summary === preview.event_summary && value.etag === preview.etag &&
    value.send_updates === preview.send_updates && value.guest_notification_behavior === preview.guest_notification_behavior;
  if (!shared) return false;
  if (action.kind === "reschedule") {
    return nonempty(value.provider_etag) && value.reconciliation_pending !== true &&
      sameSourceTimes(value.old_start, value.old_end, preview.old_start, preview.old_end) &&
      sameInstant((value.new_start as Record<string, unknown> | undefined)?.dateTime, action.request.starts_at) &&
      sameInstant((value.new_end as Record<string, unknown> | undefined)?.dateTime, action.request.ends_at) &&
      sameStringArray(value.attendees, preview.attendees) && suppliedValueMatches(value.recovery_notice, preview.recovery_notice);
  }
  if (action.kind === "cancel") {
    return ["absent", "cancelled"].includes(String(value.source_state)) &&
      sameSourceTimes(value.starts_at, value.ends_at, preview.starts_at, preview.ends_at) &&
      sameStringArray(value.attendees, preview.attendees) && suppliedValueMatches(value.action_notice, preview.action_notice) &&
      suppliedValueMatches(value.recovery_notice, preview.recovery_notice);
  }
  return value.organizer_email === preview.organizer_email &&
    value.old_response_status === preview.old_response_status && value.new_response_status === preview.new_response_status &&
    nonempty(value.provider_etag) && (value.already_applied === undefined || typeof value.already_applied === "boolean") &&
    suppliedValueMatches(value.action_notice, preview.action_notice) && suppliedValueMatches(value.recovery_notice, preview.recovery_notice);
}

export function sourceIdentityMatchesAttempt(attempt: CalendarChangeAttempt, value: unknown): value is CalendarEventSourceResult {
  return validSource(value) && value.redacted === false && nonempty(value.target_etag) &&
    value.account_email === attempt.original_source.account_email && value.calendar_id === attempt.calendar_id &&
    value.selected_event_id === attempt.selected_event_id && value.target_event_id === attempt.target_event_id &&
    value.occurrence === attempt.occurrence;
}

export function reconcileCalendarChangeSource(
  attempt: CalendarChangeAttempt,
  value: unknown,
): CalendarSourceReconciliation | null {
  if (!sourceIdentityMatchesAttempt(attempt, value) || attempt.action.kind === "cancel") return null;
  const original = attempt.original_source;
  if (attempt.action.kind === "reschedule") {
    const requested = timed(value.starts_at) && timed(value.ends_at) &&
      sameInstant(timed(value.starts_at), attempt.action.request.starts_at) &&
      sameInstant(timed(value.ends_at), attempt.action.request.ends_at);
    if (requested) return "requested";
    return sameSourceTimes(value.starts_at, value.ends_at, original.starts_at, original.ends_at)
      ? "unchanged" : "divergent";
  }
  const originalTimes = sameSourceTimes(value.starts_at, value.ends_at, original.starts_at, original.ends_at);
  if (originalTimes && value.self_response_status === attempt.action.request.response_status) return "requested";
  if (originalTimes && value.self_response_status === original.self_response_status) return "unchanged";
  return "divergent";
}

function validAttempt(value: unknown, scope: CalendarChangeScope): value is CalendarChangeAttempt {
  if (!record(value) || value.version !== 1 || !nonempty(value.attempt_id) || !validSource(value.original_source) ||
    !calendarChangeActionMatchesSource(value.action, value.original_source) || !PHASES.has(value.phase as CalendarChangePhase) ||
    !nonempty(value.actor_id) || !nonempty(value.organization_id) || !nonempty(value.connection_id) ||
    !nonempty(value.account_label) || !nonempty(value.calendar_id) || !nonempty(value.calendar_summary) ||
    !nonempty(value.selected_event_id) || !nonempty(value.target_event_id) || !OCCURRENCES.has(String(value.occurrence)) ||
    !(value.problem === null || (nonempty(value.problem) && value.problem.length <= 500)) ||
    !(value.source_proof === null || validSource(value.source_proof))) return false;
  if (value.actor_id !== scope.actorId || value.organization_id !== scope.organizationId ||
    value.connection_id !== scope.connectionId || value.calendar_id !== scope.calendarId ||
    value.account_label !== value.original_source.account_email || value.calendar_summary !== value.original_source.calendar_summary ||
    value.selected_event_id !== value.original_source.selected_event_id || value.target_event_id !== value.original_source.target_event_id ||
    value.occurrence !== value.original_source.occurrence) return false;
  const action = value.action as CalendarChangeAction;
  if (action.request.connection_id !== scope.connectionId || action.request.calendar_id !== scope.calendarId ||
    action.request.event_id !== value.target_event_id || action.request.occurrence !== value.occurrence ||
    action.request.expected_etag !== value.original_source.target_etag) return false;
  const hasResult = action.result !== null;
  const hasProof = value.source_proof !== null;
  if (hasProof && !sourceIdentityMatchesAttempt(value as unknown as CalendarChangeAttempt, value.source_proof)) return false;
  switch (value.phase) {
    case "reviewed_unattempted": return !hasResult && !hasProof && value.problem === null;
    case "attempting": return !hasResult && !hasProof && value.problem === null;
    case "uncertain": return !hasResult && !hasProof && nonempty(value.problem);
    case "reconciliation_required": return hasResult && !calendarChangeResultMatches(action, action.result) && !hasProof && nonempty(value.problem);
    case "succeeded": return hasResult && calendarChangeResultMatches(action, action.result) && !hasProof && value.problem === null;
    case "source_requested": return (!hasResult || !calendarChangeResultMatches(action, action.result)) && hasProof && reconcileCalendarChangeSource(value as unknown as CalendarChangeAttempt, value.source_proof) === "requested" && value.problem === null;
    case "source_unchanged": return (!hasResult || !calendarChangeResultMatches(action, action.result)) && hasProof && reconcileCalendarChangeSource(value as unknown as CalendarChangeAttempt, value.source_proof) === "unchanged" && value.problem === null;
    case "source_divergent": return (!hasResult || !calendarChangeResultMatches(action, action.result)) && hasProof && reconcileCalendarChangeSource(value as unknown as CalendarChangeAttempt, value.source_proof) === "divergent" && nonempty(value.problem);
    case "fresh_review_started": return (!hasResult || !calendarChangeResultMatches(action, action.result)) && hasProof && reconcileCalendarChangeSource(value as unknown as CalendarChangeAttempt, value.source_proof) === "divergent" && value.problem === null;
  }
}

export function calendarChangeStorageKey(scope: CalendarChangeScope): string {
  return `matrx.google-calendar.change-recovery.v1:${encodeURIComponent(scope.actorId)}:${encodeURIComponent(scope.organizationId)}:${encodeURIComponent(scope.connectionId)}:${encodeURIComponent(scope.calendarId)}`;
}

export function readCalendarChangeCollection(storage: StorageDoor, scope: CalendarChangeScope): {
  collection: CalendarChangeCollection;
  warning: string | null;
} {
  const empty: CalendarChangeCollection = {
    version: 1, actor_id: scope.actorId, organization_id: scope.organizationId,
    connection_id: scope.connectionId, calendar_id: scope.calendarId, attempts: [],
  };
  let raw: string | null;
  try { raw = storage.getItem(calendarChangeStorageKey(scope)); }
  catch { return { collection: empty, warning: "Calendar change recovery is unavailable in this tab." }; }
  if (!raw) return { collection: empty, warning: null };
  let value: unknown;
  try { value = JSON.parse(raw); }
  catch { return { collection: empty, warning: "An invalid calendar change recovery record was ignored." }; }
  if (!record(value) || value.version !== 1 || value.actor_id !== scope.actorId ||
    value.organization_id !== scope.organizationId || value.connection_id !== scope.connectionId ||
    value.calendar_id !== scope.calendarId || !Array.isArray(value.attempts) ||
    !value.attempts.every((attempt) => validAttempt(attempt, scope))) {
    return { collection: empty, warning: "An invalid calendar change recovery record was ignored." };
  }
  const attempts = value.attempts as CalendarChangeAttempt[];
  const ids = attempts.map((attempt) => attempt.attempt_id);
  if (new Set(ids).size !== ids.length) return { collection: empty, warning: "An invalid calendar change recovery record was ignored." };
  return { collection: { ...empty, attempts }, warning: null };
}

export function writeCalendarChangeCollection(
  storage: StorageDoor,
  scope: CalendarChangeScope,
  collection: CalendarChangeCollection,
): boolean {
  if (collection.actor_id !== scope.actorId || collection.organization_id !== scope.organizationId ||
    collection.connection_id !== scope.connectionId || collection.calendar_id !== scope.calendarId ||
    !collection.attempts.every((attempt) => validAttempt(attempt, scope))) return false;
  const raw = JSON.stringify(collection);
  try {
    storage.setItem(calendarChangeStorageKey(scope), raw);
    const readback = storage.getItem(calendarChangeStorageKey(scope));
    if (readback !== raw) return false;
    return readCalendarChangeCollection(storage, scope).warning === null;
  } catch { return false; }
}

export function targetOccurrenceKey(targetEventId: string, occurrence: CalendarChangeAttempt["occurrence"]): string {
  return `${targetEventId}\u0000${occurrence}`;
}

export function attemptIsHeld(attempt: CalendarChangeAttempt): boolean {
  return !["succeeded", "source_requested", "source_unchanged", "fresh_review_started"].includes(attempt.phase);
}

export function canAppendCalendarChangeAttempt(collection: CalendarChangeCollection, attempt: CalendarChangeAttempt): boolean {
  const key = targetOccurrenceKey(attempt.target_event_id, attempt.occurrence);
  return !collection.attempts.some((saved) =>
    targetOccurrenceKey(saved.target_event_id, saved.occurrence) === key && attemptIsHeld(saved),
  );
}

export function appendCalendarChangeAttempt(
  collection: CalendarChangeCollection,
  attempt: CalendarChangeAttempt,
): CalendarChangeCollection | null {
  return canAppendCalendarChangeAttempt(collection, attempt)
    ? { ...collection, attempts: [...collection.attempts, attempt] }
    : null;
}

export function replaceCalendarChangeAttempt(
  collection: CalendarChangeCollection,
  attempt: CalendarChangeAttempt,
): CalendarChangeCollection | null {
  const index = collection.attempts.findIndex((saved) => saved.attempt_id === attempt.attempt_id);
  if (index < 0) return null;
  const attempts = [...collection.attempts];
  attempts[index] = attempt;
  return { ...collection, attempts };
}
