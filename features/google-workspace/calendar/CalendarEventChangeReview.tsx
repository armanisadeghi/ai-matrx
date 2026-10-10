"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalLink } from "lucide-react";
import { Input } from "@ai-matrx/design-system/controls";

import { Button } from "@/components/ui/button";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import type { ConfirmOptions } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { extractErrorMessage } from "@/utils/errors";

import type { StorageDoor } from "./calendarCreateRecovery";
import {
  confirmCalendarCancel,
  confirmCalendarReschedule,
  confirmCalendarRsvp,
  previewCalendarCancel,
  previewCalendarReschedule,
  previewCalendarRsvp,
  type CalendarCancelPreview,
  type CalendarCancelRequest,
  type CalendarCancelResult,
  type CalendarReschedulePreview,
  type CalendarRescheduleRequest,
  type CalendarRescheduleResult,
  type CalendarRsvpPreview,
  type CalendarRsvpRequest,
  type CalendarRsvpResult,
} from "./calendarChangeService";
import {
  readCalendarEventSource,
  type CalendarEventSourceRequest,
  type CalendarEventSourceResult,
} from "./calendarEventSourceService";
import type { SelectedCalendar, SelectedEvent } from "./selectedCalendarService";
import { googleCalendarHref } from "./record";
import { changeResultLocalRefresh } from "./calendarLocalRefresh";
import { CalendarSavedCopyStatus } from "./CalendarSavedCopyStatus";
import {
  appendCalendarChangeAttempt,
  attemptIsHeld,
  calendarChangeActionMatchesSource,
  calendarChangeResultMatches,
  calendarChangeResultShape,
  canAppendCalendarChangeAttempt,
  readCalendarChangeCollection,
  reconcileCalendarChangeSource,
  replaceCalendarChangeAttempt,
  sourceIdentityMatchesAttempt,
  writeCalendarChangeCollection,
  type CalendarChangeAction,
  type CalendarChangeAttempt,
  type CalendarChangeCollection,
  type CalendarChangeScope,
} from "./calendarChangeRecovery";

export interface CalendarEventChangeTransport {
  readSource(input: {
    organizationId: string;
    request: CalendarEventSourceRequest;
  }): Promise<CalendarEventSourceResult>;
  previewReschedule(input: {
    organizationId: string;
    request: CalendarRescheduleRequest;
  }): Promise<CalendarReschedulePreview>;
  confirmReschedule(input: {
    organizationId: string;
    request: CalendarRescheduleRequest;
  }): Promise<CalendarRescheduleResult>;
  previewCancel(input: {
    organizationId: string;
    request: CalendarCancelRequest;
  }): Promise<CalendarCancelPreview>;
  confirmCancel(input: {
    organizationId: string;
    request: CalendarCancelRequest;
  }): Promise<CalendarCancelResult>;
  previewRsvp(input: {
    organizationId: string;
    request: CalendarRsvpRequest;
  }): Promise<CalendarRsvpPreview>;
  confirmRsvp(input: {
    organizationId: string;
    request: CalendarRsvpRequest;
  }): Promise<CalendarRsvpResult>;
}

export interface CalendarEventChangeReviewProps {
  actorId: string;
  organizationId: string;
  connectionId: string;
  accountLabel: string;
  calendar: SelectedCalendar;
  events?: SelectedEvent[];
  transport?: CalendarEventChangeTransport;
  storage?: StorageDoor;
  confirmAction?: (options: ConfirmOptions) => Promise<boolean>;
}

export const calendarEventChangeTransport: CalendarEventChangeTransport = {
  readSource: readCalendarEventSource,
  previewReschedule: previewCalendarReschedule,
  confirmReschedule: confirmCalendarReschedule,
  previewCancel: previewCalendarCancel,
  confirmCancel: confirmCalendarCancel,
  previewRsvp: previewCalendarRsvp,
  confirmRsvp: confirmCalendarRsvp,
};

const browserStorage: StorageDoor = {
  getItem: (key) => window.sessionStorage.getItem(key),
  setItem: (key, value) => window.sessionStorage.setItem(key, value),
  removeItem: (key) => window.sessionStorage.removeItem(key),
};

type ActionKind = CalendarChangeAction["kind"];
type Busy = "source" | "preview" | "confirm" | "reconcile" | "restore" | null;

function sourceTime(value: unknown): string {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return "Unavailable";
  const facts = value as Record<string, unknown>;
  if (typeof facts.dateTime === "string") return facts.dateTime;
  if (typeof facts.date === "string") return facts.date;
  return "Unavailable";
}

function sourceReady(
  source: CalendarEventSourceResult,
  props: CalendarEventChangeReviewProps,
  selectedEventId: string,
  occurrence: CalendarEventSourceRequest["occurrence"],
): string | null {
  if (source.account_email !== props.accountLabel || source.calendar_id !== props.calendar.id ||
    source.selected_event_id !== selectedEventId || source.occurrence !== occurrence) {
    return "Google returned a different account, calendar, event, or target.";
  }
  if (source.redacted) return "Google returned this event without details.";
  if (!source.target_event_id?.trim() || !source.target_etag?.trim()) {
    return "Google did not return a writable event target and version.";
  }
  return null;
}

function actionAvailable(source: CalendarEventSourceResult, kind: ActionKind): string | null {
  const eligibility = kind === "reschedule" ? source.move : kind === "cancel" ? source.cancel : source.rsvp;
  return eligibility.available ? null : eligibility.unavailable_reason || "This action is unavailable for the selected event.";
}

function attemptLabel(attempt: CalendarChangeAttempt): string {
  const verb = attempt.action.kind === "reschedule" ? "Move" : attempt.action.kind === "cancel" ? "Cancel" : "RSVP";
  return `${verb} · ${attempt.original_source.event_summary || attempt.target_event_id} · ${attempt.phase.replaceAll("_", " ")}`;
}

function resultSummary(attempt: CalendarChangeAttempt): string {
  if (attempt.phase === "reviewed_unattempted") return "Ready for confirmation. Nothing has been sent.";
  if (attempt.phase === "attempting") return "Confirmation started. Keep this action held until it settles.";
  if (attempt.phase === "source_requested") return "The current Google source matches the reviewed change. Notification delivery remains unverified.";
  if (attempt.phase === "source_unchanged") return "The current Google source still matches the original event.";
  if (attempt.phase === "source_divergent") return "The current Google source differs from both reviewed states.";
  if (attempt.phase === "succeeded") {
    if (attempt.action.kind === "cancel") {
      return `Google reported the organizer event ${attempt.action.result?.source_state ?? "changed"}.`;
    }
    return "Google returned a matching change result.";
  }
  return attempt.problem || "This action remains held until its source is checked.";
}

function ReturnedResultFacts({ attempt }: { attempt: CalendarChangeAttempt }) {
  const result = attempt.action.result;
  if (!result || calendarChangeResultMatches(attempt.action, result)) return null;
  return <div className="grid gap-1 rounded-md border border-warning/40 bg-warning/10 p-2">
    <p className="font-medium text-foreground">Returned result differs</p>
    <p>Reviewed account: {attempt.action.preview.account_email}</p>
    <p>Returned account: {result.account_email}</p>
    <label className="grid gap-1 font-medium text-muted-foreground">Reviewed event
      <Input mono readOnly value={attempt.action.preview.event_id} />
    </label>
    <label className="grid gap-1 font-medium text-muted-foreground">Returned event
      <Input mono readOnly value={result.event_id} />
    </label>
    <p>Reviewed version: {attempt.action.preview.etag}</p>
    <p>Returned version: {result.etag}</p>
  </div>;
}

function ReviewedChangeFacts({ attempt }: { attempt: CalendarChangeAttempt }) {
  const { action } = attempt;
  if (action.kind === "reschedule") {
    return <div className="grid gap-1 rounded-md border border-border bg-background/70 p-2">
      <p>Old time: {sourceTime(action.preview.old_start)} – {sourceTime(action.preview.old_end)}</p>
      <p>New time: {sourceTime(action.preview.new_start)} – {sourceTime(action.preview.new_end)}</p>
      <p>Guests: {action.preview.attendees.join(", ") || "None listed"}</p>
    </div>;
  }
  if (action.kind === "cancel") {
    return <div className="grid gap-1 rounded-md border border-border bg-background/70 p-2">
      <p>Event time: {sourceTime(action.preview.starts_at)} – {sourceTime(action.preview.ends_at)}</p>
      <p>Guests: {action.preview.attendees.join(", ") || "None listed"}</p>
    </div>;
  }
  return <div className="grid gap-1 rounded-md border border-border bg-background/70 p-2">
    <p>Organizer: {action.preview.organizer_email}</p>
    <p>Response: {action.preview.old_response_status} → {action.preview.new_response_status}</p>
  </div>;
}

function eventUrl(attempt: CalendarChangeAttempt): string | null {
  return googleCalendarHref({
    external_id: attempt.selected_event_id,
    calendar_id: attempt.calendar_id,
  }, attempt.original_source.account_email);
}

export function CalendarEventChangeReview(props: CalendarEventChangeReviewProps) {
  const { actorId, organizationId, connectionId, accountLabel, calendar, events = [],
    transport = calendarEventChangeTransport, storage = browserStorage, confirmAction = confirm } = props;
  const scope: CalendarChangeScope = { actorId, organizationId, connectionId, calendarId: calendar.id };
  const [collection, setCollection] = useState<CalendarChangeCollection>(() => ({
    version: 1, actor_id: actorId, organization_id: organizationId,
    connection_id: connectionId, calendar_id: calendar.id, attempts: [],
  }));
  const [activeAttemptId, setActiveAttemptId] = useState<string | null>(null);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [occurrence, setOccurrence] = useState<CalendarEventSourceRequest["occurrence"]>("single");
  const [source, setSource] = useState<CalendarEventSourceResult | null>(null);
  const [actionKind, setActionKind] = useState<ActionKind>("reschedule");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [sendUpdates, setSendUpdates] = useState<"" | CalendarRescheduleRequest["send_updates"]>("");
  const [responseStatus, setResponseStatus] = useState<"" | CalendarRsvpRequest["response_status"]>("");
  const [busy, setBusy] = useState<Busy>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const epoch = useRef(0);
  const busyRef = useRef(false);

  /* eslint-disable react-hooks/set-state-in-effect -- restore browser-owned recovery after hydration */
  useEffect(() => {
    epoch.current += 1;
    busyRef.current = false;
    const restored = readCalendarChangeCollection(storage, scope);
    const interrupted = restored.collection.attempts.map((attempt) => attempt.phase === "attempting" ? {
      ...attempt,
      phase: "uncertain" as const,
      problem: "This tab reloaded after confirmation started. Check the Google source before another action.",
    } : attempt);
    const next = { ...restored.collection, attempts: interrupted };
    if (interrupted.some((attempt, index) => attempt !== restored.collection.attempts[index]) &&
      !writeCalendarChangeCollection(storage, scope, next)) {
      setWarning("The interrupted action could not be saved. Keep it held in this tab.");
    } else {
      setWarning(restored.warning);
    }
    setCollection(next);
    const held = next.attempts.find(attemptIsHeld);
    setActiveAttemptId(held?.attempt_id ?? next.attempts.at(-1)?.attempt_id ?? null);
    setSource(null);
    setProblem(null);
    setNotice(null);
  }, [actorId, organizationId, connectionId, accountLabel, calendar.id, storage]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => () => { epoch.current += 1; busyRef.current = false; }, []);

  const activeAttempt = collection.attempts.find((attempt) => attempt.attempt_id === activeAttemptId) ?? null;

  function resetDraft(nextEventId = selectedEventId, nextOccurrence = occurrence) {
    epoch.current += 1;
    busyRef.current = false;
    setSelectedEventId(nextEventId);
    setOccurrence(nextOccurrence);
    setSource(null);
    setStartsAt("");
    setEndsAt("");
    setSendUpdates("");
    setResponseStatus("");
    setProblem(null);
    setNotice(null);
  }

  function saveCollection(next: CalendarChangeCollection, failure: string): boolean {
    if (!writeCalendarChangeCollection(storage, scope, next)) {
      setWarning(failure);
      return false;
    }
    setCollection(next);
    return true;
  }

  function invalidateUnattemptedReview() {
    if (!activeAttempt || activeAttempt.phase !== "reviewed_unattempted") return true;
    const next = { ...collection, attempts: collection.attempts.filter((attempt) => attempt.attempt_id !== activeAttempt.attempt_id) };
    if (!saveCollection(next, "The old review could not be cleared. Keep this action held.")) return false;
    setActiveAttemptId(null);
    return true;
  }

  async function readSource(selectedOverride?: string, occurrenceOverride?: CalendarEventSourceRequest["occurrence"], mode: Busy = "source") {
    const requestedId = (selectedOverride ?? selectedEventId).trim();
    const requestedOccurrence = occurrenceOverride ?? occurrence;
    if (!requestedId || busyRef.current) return null;
    setBusy(mode); busyRef.current = true; setProblem(null); setNotice(null); setWarning(null);
    const callEpoch = ++epoch.current;
    try {
      const value = await transport.readSource({ organizationId, request: {
        connection_id: connectionId, calendar_id: calendar.id,
        selected_event_id: requestedId, occurrence: requestedOccurrence,
      } });
      if (callEpoch !== epoch.current) return null;
      const sourceProblem = sourceReady(value, props, requestedId, requestedOccurrence);
      setSource(value);
      setProblem(sourceProblem);
      if (!sourceProblem) {
        setSelectedEventId(requestedId);
        setOccurrence(requestedOccurrence);
        setStartsAt(sourceTime(value.starts_at).includes("T") ? sourceTime(value.starts_at) : "");
        setEndsAt(sourceTime(value.ends_at).includes("T") ? sourceTime(value.ends_at) : "");
      }
      return sourceProblem ? null : value;
    } catch (error) {
      if (callEpoch === epoch.current) setProblem(extractErrorMessage(error));
      return null;
    } finally {
      if (callEpoch === epoch.current) { setBusy(null); busyRef.current = false; }
    }
  }

  function buildRequest(current: CalendarEventSourceResult): CalendarChangeAction["request"] | null {
    const targetEventId = current.target_event_id?.trim();
    const targetEtag = current.target_etag?.trim();
    if (!targetEventId || !targetEtag) {
      setProblem("Google did not return a writable event target and version.");
      return null;
    }
    const base = {
      connection_id: connectionId,
      calendar_id: calendar.id,
      event_id: targetEventId,
      occurrence,
      expected_etag: targetEtag,
      send_updates: sendUpdates || "none",
    };
    if (!sendUpdates) {
      setProblem("Choose guest notification behavior.");
      return null;
    }
    if (actionKind === "reschedule") {
      if (!startsAt || !endsAt || !Number.isFinite(Date.parse(startsAt)) || !Number.isFinite(Date.parse(endsAt)) || Date.parse(endsAt) <= Date.parse(startsAt)) {
        setProblem("Use aware start and end times with the end after the start.");
        return null;
      }
      if (!/(?:Z|[+-]\d{2}:\d{2})$/.test(startsAt) || !/(?:Z|[+-]\d{2}:\d{2})$/.test(endsAt)) {
        setProblem("Include a time zone offset in both times.");
        return null;
      }
      return { ...base, starts_at: startsAt, ends_at: endsAt };
    }
    if (actionKind === "rsvp") {
      if (!responseStatus) {
        setProblem("Choose this account’s response.");
        return null;
      }
      return { ...base, response_status: responseStatus };
    }
    return base;
  }

  async function review() {
    if (!source || busyRef.current || sourceReady(source, props, selectedEventId, occurrence)) return;
    const unavailable = actionAvailable(source, actionKind);
    if (unavailable) { setProblem(unavailable); return; }
    const request = buildRequest(source);
    if (!request) return;
    if (!invalidateUnattemptedReview()) return;
    setBusy("preview"); busyRef.current = true; setProblem(null); setNotice(null); setWarning(null);
    const callEpoch = ++epoch.current;
    try {
      let action: CalendarChangeAction;
      if (actionKind === "reschedule") {
        const preview = await transport.previewReschedule({ organizationId, request: request as CalendarRescheduleRequest });
        action = { kind: "reschedule", request: request as CalendarRescheduleRequest, preview, result: null };
      } else if (actionKind === "cancel") {
        const preview = await transport.previewCancel({ organizationId, request: request as CalendarCancelRequest });
        action = { kind: "cancel", request: request as CalendarCancelRequest, preview, result: null };
      } else {
        const preview = await transport.previewRsvp({ organizationId, request: request as CalendarRsvpRequest });
        action = { kind: "rsvp", request: request as CalendarRsvpRequest, preview, result: null };
      }
      if (callEpoch !== epoch.current) return;
      if (!calendarChangeActionMatchesSource(action, source)) {
        setProblem("Google returned a review that does not match this source and action. Nothing was sent.");
        return;
      }
      const attempt: CalendarChangeAttempt = {
        version: 1,
        attempt_id: crypto.randomUUID(),
        actor_id: actorId,
        organization_id: organizationId,
        connection_id: connectionId,
        account_label: accountLabel,
        calendar_id: calendar.id,
        calendar_summary: calendar.summary,
        selected_event_id: source.selected_event_id,
        target_event_id: action.request.event_id,
        occurrence: source.occurrence,
        original_source: source,
        action,
        phase: "reviewed_unattempted",
        problem: null,
        source_proof: null,
      };
      if (!canAppendCalendarChangeAttempt(collection, attempt)) {
        setProblem("A held action already exists for this event target. Open it before starting another.");
        return;
      }
      const next = appendCalendarChangeAttempt(collection, attempt);
      if (!next || !saveCollection(next, "The review could not be saved. Nothing can be confirmed.")) return;
      setActiveAttemptId(attempt.attempt_id);
    } catch (error) {
      if (callEpoch === epoch.current) setProblem(`${extractErrorMessage(error)} Nothing was sent.`);
    } finally {
      if (callEpoch === epoch.current) { setBusy(null); busyRef.current = false; }
    }
  }

  async function send(attempt: CalendarChangeAttempt) {
    if (busyRef.current || attempt.phase !== "reviewed_unattempted") return;
    const approved = await confirmAction({
      title: attempt.action.kind === "reschedule" ? "Move this Google Calendar event?" :
        attempt.action.kind === "cancel" ? "Cancel this organizer event?" : "Send this RSVP?",
      description: `${attempt.original_source.account_email} · ${attempt.calendar_summary} · ${attempt.action.preview.event_summary} · ${attempt.action.request.send_updates}`,
      confirmLabel: attempt.action.kind === "reschedule" ? "Move event" : attempt.action.kind === "cancel" ? "Cancel event" : "Send RSVP",
    });
    if (!approved || busyRef.current) return;
    const attempting: CalendarChangeAttempt = { ...attempt, phase: "attempting", problem: null };
    const withAttempting = replaceCalendarChangeAttempt(collection, attempting);
    if (!withAttempting || !saveCollection(withAttempting, "The attempt could not be saved. Nothing was sent.")) return;
    setBusy("confirm"); busyRef.current = true; setProblem(null); setNotice(null);
    const callEpoch = ++epoch.current;
    try {
      let result: CalendarChangeAction["result"];
      if (attempt.action.kind === "reschedule") result = await transport.confirmReschedule({ organizationId, request: attempt.action.request });
      else if (attempt.action.kind === "cancel") result = await transport.confirmCancel({ organizationId, request: attempt.action.request });
      else result = await transport.confirmRsvp({ organizationId, request: attempt.action.request });
      if (callEpoch !== epoch.current) return;
      if (!calendarChangeResultShape(attempt.action.kind, result)) {
        const message = "Google returned a result this review cannot validate. Check the source before another action.";
        const held: CalendarChangeAttempt = { ...attempting, phase: "uncertain", problem: message };
        const latest = replaceCalendarChangeAttempt(withAttempting, held);
        if (!latest || !saveCollection(latest, "The unvalidated result could not be saved. Do not repeat this action.")) return;
        setProblem(message);
        return;
      }
      const action = { ...attempt.action, result } as CalendarChangeAction;
      const matches = calendarChangeResultMatches(action, result);
      const settled: CalendarChangeAttempt = {
        ...attempting, action,
        phase: matches ? "succeeded" : "reconciliation_required",
        problem: matches ? null : "Google returned a result that does not match the reviewed action. Check the source.",
      };
      const latest = replaceCalendarChangeAttempt(withAttempting, settled);
      if (!latest || !saveCollection(latest, "The result could not be saved. Keep this action held.")) return;
    } catch (error) {
      if (callEpoch !== epoch.current) return;
      const held: CalendarChangeAttempt = { ...attempting, phase: "uncertain", problem: extractErrorMessage(error) };
      const latest = replaceCalendarChangeAttempt(withAttempting, held);
      if (!latest || !saveCollection(latest, "The uncertain outcome could not be saved. Do not repeat this action.")) return;
      setProblem("The outcome is uncertain. Check the Google source before another action.");
    } finally {
      if (callEpoch === epoch.current) { setBusy(null); busyRef.current = false; }
    }
  }

  async function reconcile(attempt: CalendarChangeAttempt) {
    if (busyRef.current || attempt.action.kind === "cancel") return;
    setBusy("reconcile"); busyRef.current = true; setProblem(null); setNotice(null); setWarning(null);
    const callEpoch = ++epoch.current;
    try {
      const value = await transport.readSource({ organizationId: attempt.organization_id, request: {
        connection_id: attempt.connection_id, calendar_id: attempt.calendar_id,
        selected_event_id: attempt.selected_event_id, occurrence: attempt.occurrence,
      } });
      if (callEpoch !== epoch.current) return;
      const outcome = reconcileCalendarChangeSource(attempt, value);
      if (!outcome || !sourceIdentityMatchesAttempt(attempt, value)) {
        setProblem("Google returned source details that cannot settle this held action.");
        return;
      }
      const settled: CalendarChangeAttempt = {
        ...attempt,
        action: attempt.action,
        source_proof: value,
        phase: outcome === "requested" ? "source_requested" : outcome === "unchanged" ? "source_unchanged" : "source_divergent",
        problem: outcome === "divergent" ? "The source differs from both reviewed states. Start from the current facts." : null,
      };
      const next = replaceCalendarChangeAttempt(collection, settled);
      if (!next || !saveCollection(next, "The source proof could not be saved. Keep this action held.")) return;
    } catch (error) {
      if (callEpoch === epoch.current) setProblem(`${extractErrorMessage(error)} The action remains held.`);
    } finally {
      if (callEpoch === epoch.current) { setBusy(null); busyRef.current = false; }
    }
  }

  function reviewCurrentSource(attempt: CalendarChangeAttempt) {
    if (!attempt.source_proof || !sourceIdentityMatchesAttempt(attempt, attempt.source_proof)) return;
    if (attempt.phase === "source_divergent") {
      const transitioned: CalendarChangeAttempt = { ...attempt, phase: "fresh_review_started", problem: null };
      const next = replaceCalendarChangeAttempt(collection, transitioned);
      if (!next || !saveCollection(next, "The fresh-review choice could not be saved. Keep this action held.")) return;
    }
    setActiveAttemptId(null);
    setSelectedEventId(attempt.selected_event_id);
    setOccurrence(attempt.occurrence);
    setSource(attempt.source_proof);
    setActionKind(attempt.action.kind);
    setStartsAt(sourceTime(attempt.source_proof.starts_at).includes("T") ? sourceTime(attempt.source_proof.starts_at) : "");
    setEndsAt(sourceTime(attempt.source_proof.ends_at).includes("T") ? sourceTime(attempt.source_proof.ends_at) : "");
    setSendUpdates("");
    setResponseStatus("");
    setProblem(null);
    setNotice(null);
  }

  async function prepareRestore(attempt: CalendarChangeAttempt) {
    if (attempt.action.kind === "cancel" || busyRef.current) return;
    const current = await readSource(attempt.selected_event_id, attempt.occurrence, "restore");
    if (!current || reconcileCalendarChangeSource(attempt, current) !== "requested") {
      setProblem("The current source no longer matches the completed change, so restoration is unavailable.");
      return;
    }
    setActiveAttemptId(null);
    setActionKind(attempt.action.kind);
    setSendUpdates("");
    if (attempt.action.kind === "reschedule") {
      setStartsAt(sourceTime(attempt.original_source.starts_at));
      setEndsAt(sourceTime(attempt.original_source.ends_at));
    } else {
      setResponseStatus(attempt.original_source.self_response_status ?? "");
    }
    setProblem(null);
    setNotice("Prior values loaded from the original source. Review them as a new action.");
  }

  const visibleEvents = events.filter((event): event is SelectedEvent & { id: string } => Boolean(event.id && event.detail_visible));
  const sourceActionProblem = source ? actionAvailable(source, actionKind) : null;
  const activeEventHref = activeAttempt ? eventUrl(activeAttempt) : null;

  return (
    <section className="space-y-3 rounded-md border border-border p-3" aria-label="Change Google Calendar event" data-calendar-event-change-review>
      <div>
        <p className="type-title">Change an existing event</p>
        <p className="type-secondary text-muted-foreground">{accountLabel} · {calendar.summary}</p>
      </div>
      {warning ? <p className="type-secondary text-warning">{warning}</p> : null}
      {notice ? <p role="status" className="rounded-md border border-success/40 bg-success/10 p-2 type-secondary text-foreground">{notice}</p> : null}
      {problem ? <p role="alert" className="type-secondary text-destructive">{problem} <ErrorAlchemyMenu error={problem} /></p> : null}
      {collection.attempts.length ? (
        <div className="grid gap-1">
          <label htmlFor="calendar-change-attempt" className="text-xs font-medium text-muted-foreground">Saved actions</label>
          <select id="calendar-change-attempt" className="min-h-11 rounded-md border border-input bg-background px-3 text-sm" value={activeAttemptId ?? ""} onChange={(event) => setActiveAttemptId(event.target.value || null)}>
            <option value="">Prepare another action</option>
            {collection.attempts.map((attempt) => <option key={attempt.attempt_id} value={attempt.attempt_id}>{attemptLabel(attempt)}</option>)}
          </select>
        </div>
      ) : null}
      {activeAttempt ? (
        <div className="space-y-2 rounded-md border border-border bg-muted/20 p-3 type-secondary" data-calendar-change-attempt>
          <p className="font-medium text-foreground">{attemptLabel(activeAttempt)}</p>
          <p>Account: {activeAttempt.original_source.account_email}</p>
          <p>Calendar: {activeAttempt.calendar_summary}</p>
          <p>Event: {activeAttempt.action.preview.event_summary}</p>
          <label className="grid gap-1 font-medium text-muted-foreground">Target event
            <Input mono readOnly value={activeAttempt.target_event_id} />
          </label>
          <p>Target scope: {activeAttempt.occurrence}</p>
          <p>Reviewed version: {activeAttempt.action.request.expected_etag}</p>
          <p>{resultSummary(activeAttempt)}</p>
          {activeAttempt.phase === "succeeded" ? <CalendarSavedCopyStatus view={changeResultLocalRefresh(activeAttempt.action.result)} /> : null}
          <ReviewedChangeFacts attempt={activeAttempt} />
          <ReturnedResultFacts attempt={activeAttempt} />
          <p>{activeAttempt.action.preview.guest_notification_behavior}</p>
          {"action_notice" in activeAttempt.action.preview ? <p>{activeAttempt.action.preview.action_notice}</p> : null}
          <p>{activeAttempt.action.preview.recovery_notice}</p>
          {activeEventHref ? <a className="inline-flex items-center gap-1 text-primary hover:underline" href={activeEventHref} target="_blank" rel="noreferrer">Open event in Google Calendar <ExternalLink className="h-3.5 w-3.5" /></a> : null}
          {activeAttempt.phase === "reviewed_unattempted" ? <div className="flex flex-wrap gap-2">
            <Button variant="primary" type="button" onClick={() => void send(activeAttempt)} disabled={busy !== null}>Confirm {activeAttempt.action.kind === "reschedule" ? "move" : activeAttempt.action.kind === "cancel" ? "cancellation" : "RSVP"}</Button>
            <Button type="button" variant="outline" onClick={() => { if (invalidateUnattemptedReview()) setActiveAttemptId(null); }} disabled={busy !== null}>Edit action</Button>
          </div> : null}
          {["uncertain", "reconciliation_required", "source_divergent"].includes(activeAttempt.phase) && activeAttempt.action.kind !== "cancel" ?
            <Button type="button" variant="outline" onClick={() => void reconcile(activeAttempt)} disabled={busy !== null}>{busy === "reconcile" ? "Checking…" : "Check current source"}</Button> : null}
          {activeAttempt.action.kind === "cancel" && ["uncertain", "reconciliation_required"].includes(activeAttempt.phase) ? <p>Cancellation cannot be settled from a missing event. Keep this action held.</p> : null}
          {activeAttempt.phase === "source_unchanged" || activeAttempt.phase === "source_divergent" ? <Button type="button" variant="outline" onClick={() => reviewCurrentSource(activeAttempt)}>Review current source</Button> : null}
          {["succeeded", "source_requested"].includes(activeAttempt.phase) && activeAttempt.action.kind !== "cancel" ? <Button type="button" variant="outline" onClick={() => void prepareRestore(activeAttempt)} disabled={busy !== null}>{activeAttempt.action.kind === "reschedule" ? "Prepare prior time" : "Prepare prior response"}</Button> : null}
        </div>
      ) : (
        <div className="space-y-3">
          {visibleEvents.length ? <label className="grid gap-1 text-xs font-medium text-muted-foreground">Listed event
            <select className="min-h-11 rounded-md border border-input bg-background px-3 text-sm" value={visibleEvents.some((event) => event.id === selectedEventId) ? selectedEventId : ""} onChange={(event) => resetDraft(event.target.value, occurrence)}>
              <option value="">Enter an event ID</option>
              {visibleEvents.map((event) => <option key={event.id} value={event.id}>{event.title}</option>)}
            </select>
          </label> : null}
          <Input aria-label="Google event ID" placeholder="Exact Google event ID" value={selectedEventId} onChange={(event) => resetDraft(event.target.value, occurrence)} />
          <label className="grid gap-1 text-xs font-medium text-muted-foreground">Change target
            <select className="min-h-11 rounded-md border border-input bg-background px-3 text-sm" value={occurrence} onChange={(event) => resetDraft(selectedEventId, event.target.value as typeof occurrence)}>
              <option value="single">Single event</option><option value="instance">This instance</option><option value="series">Entire series</option>
            </select>
          </label>
          <Button type="button" variant="outline" onClick={() => void readSource()} disabled={!selectedEventId.trim() || busy !== null}>{busy === "source" ? "Reading…" : "Read event source"}</Button>
          {source ? <div className="space-y-1 rounded-md border border-border bg-muted/20 p-2 type-secondary" data-calendar-change-source>
            <p className="font-medium text-foreground">{source.event_summary || "Google event"}</p>
            <p>{sourceTime(source.starts_at)} – {sourceTime(source.ends_at)}</p>
            <p>Selection: {source.occurrence}</p>
            <p>Organizer: {source.organizer_email || "Unavailable"}</p>
          </div> : null}
          {source && !sourceReady(source, props, selectedEventId, occurrence) ? <>
            <label className="grid gap-1 text-xs font-medium text-muted-foreground">Action
              <select className="min-h-11 rounded-md border border-input bg-background px-3 text-sm" value={actionKind} onChange={(event) => { setActionKind(event.target.value as ActionKind); setProblem(null); }}>
                <option value="reschedule">Move event</option><option value="cancel">Cancel organizer event</option><option value="rsvp">Update my RSVP</option>
              </select>
            </label>
            {sourceActionProblem ? <p className="type-secondary text-muted-foreground">{sourceActionProblem} <ErrorAlchemyMenu error={sourceActionProblem} /></p> : null}
            {actionKind === "reschedule" ? <div className="grid gap-2 sm:grid-cols-2"><Input aria-label="New start" placeholder="2026-10-08T09:00:00-07:00" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} /><Input aria-label="New end" placeholder="2026-10-08T10:00:00-07:00" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} /></div> : null}
            {actionKind === "rsvp" ? <label className="grid gap-1 text-xs font-medium text-muted-foreground">My response
              {/* read-gate-exempt: form control wording; nothing is read */}
              <select className="min-h-11 rounded-md border border-input bg-background px-3 text-sm" value={responseStatus} onChange={(event) => setResponseStatus(event.target.value as typeof responseStatus)}><option value="">Choose a response</option><option value="accepted">Accept</option><option value="declined">Decline</option><option value="tentative">Tentative</option><option value="needsAction">No response</option></select>
            </label> : null}
            <label className="grid gap-1 text-xs font-medium text-muted-foreground">Guest notifications
              <select className="min-h-11 rounded-md border border-input bg-background px-3 text-sm" value={sendUpdates} onChange={(event) => setSendUpdates(event.target.value as typeof sendUpdates)}><option value="">Choose notification behavior</option><option value="all">Notify all guests</option><option value="externalOnly">Notify external guests</option><option value="none">Send no updates</option></select>
            </label>
            <Button variant="primary" type="button" onClick={() => void review()} disabled={Boolean(sourceActionProblem) || busy !== null}>{busy === "preview" ? "Reviewing…" : actionKind === "reschedule" ? "Review move" : actionKind === "cancel" ? "Review cancellation" : "Review RSVP"}</Button>
          </> : null}
        </div>
      )}
    </section>
  );
}
