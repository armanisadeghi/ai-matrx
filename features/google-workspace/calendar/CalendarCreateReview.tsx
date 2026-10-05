"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalLink } from "lucide-react";
import { Input } from "@ai-matrx/design-system/controls";
import { Button } from "@/components/ui/button";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { BackendApiError, getUserMessage } from "@/lib/api/errors";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import {
  confirmCalendarCreate,
  previewCalendarCreate,
  type CalendarCreateIntent,
  type CalendarCreateRequest,
  type CalendarCreateResult,
} from "./calendarCreateService";
import {
  readCalendarEventSource,
  type CalendarEventSourceRequest,
  type CalendarEventSourceResult,
} from "./calendarEventSourceService";
import {
  calendarEventSourceMatchesRecovery,
  calendarCreateResultMatches,
  calendarCreateIntentMatchesRequest,
  clearCalendarCreateRecovery,
  readCalendarCreateRecovery,
  sameCalendarCreateScope,
  settleCalendarCreateFromSource,
  writeCalendarCreateRecovery,
  type CalendarCreateRecoveryRecord,
  type StorageDoor,
} from "./calendarCreateRecovery";
import type { SelectedCalendar } from "./selectedCalendarService";
import { googleCalendarHref } from "./record";
import { createResultLocalRefresh } from "./calendarLocalRefresh";
import { CalendarSavedCopyStatus } from "./CalendarSavedCopyStatus";

export interface CalendarCreateTransport {
  preview(request: CalendarCreateRequest): Promise<CalendarCreateIntent>;
  confirm(input: { intentId: string; organizationId: string }): Promise<CalendarCreateResult>;
  readSource(input: {
    organizationId: string;
    request: CalendarEventSourceRequest;
  }): Promise<CalendarEventSourceResult>;
}

const defaultTransport: CalendarCreateTransport = {
  preview: previewCalendarCreate,
  confirm: confirmCalendarCreate,
  readSource: readCalendarEventSource,
};

const browserSessionStorageDoor: StorageDoor = {
  getItem(key) { return window.sessionStorage.getItem(key); },
  setItem(key, value) { window.sessionStorage.setItem(key, value); },
  removeItem(key) { window.sessionStorage.removeItem(key); },
};

function createEventId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let bits = 0;
  let value = 0;
  let result = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      result += "0123456789abcdefghijklmnopqrstuv"[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) result += "0123456789abcdefghijklmnopqrstuv"[(value << (5 - bits)) & 31];
  return result;
}

function parseAttendees(value: string): { email: string }[] {
  return value.split(",").map((email) => email.trim()).filter(Boolean).map((email) => ({ email }));
}

function validTimeZone(value: string): boolean {
  try { new Intl.DateTimeFormat("en-US", { timeZone: value }).format(); return true; }
  catch { return false; }
}

function expired(intent: CalendarCreateIntent | null): boolean {
  return !intent || Date.parse(intent.expires_at) <= Date.now();
}

function sourceUrl(saved: CalendarCreateRecoveryRecord): string | null {
  return googleCalendarHref({
    external_id: saved.request.event_id,
    calendar_id: saved.request.calendar_id,
  }, saved.intent?.preview.account_email ?? null);
}

function verifiedSourceView(saved: CalendarCreateRecoveryRecord | null): {
  title: string;
  startsAt: string;
  endsAt: string;
  eventId: string;
  href: string;
} | null {
  if (saved?.phase !== "source_verified" || !saved.source ||
    typeof saved.source.event_summary !== "string" ||
    typeof saved.source.starts_at?.dateTime !== "string" ||
    typeof saved.source.ends_at?.dateTime !== "string" ||
    typeof saved.source.target_event_id !== "string") return null;
  const href = googleCalendarHref({
    external_id: saved.source.target_event_id,
    calendar_id: saved.source.calendar_id,
  }, saved.source.account_email);
  if (!href) return null;
  return {
    title: saved.source.event_summary,
    startsAt: saved.source.starts_at.dateTime,
    endsAt: saved.source.ends_at.dateTime,
    eventId: saved.source.target_event_id,
    href,
  };
}

interface SourceDifference {
  label: string;
  expected: string;
  returned: string;
}

function sourceDifferenceRows(
  saved: CalendarCreateRecoveryRecord,
  source: CalendarEventSourceResult,
): SourceDifference[] {
  const unavailable = source.redacted === true ? "Redacted by Google" : "Unavailable in source response";
  const returnedStart = typeof source.starts_at?.dateTime === "string" ? source.starts_at.dateTime : unavailable;
  const returnedEnd = typeof source.ends_at?.dateTime === "string" ? source.ends_at.dateTime : unavailable;
  const candidates: SourceDifference[] = [
    { label: "Google account", expected: saved.intent?.preview.account_email ?? saved.account_label, returned: source.account_email },
    { label: "Calendar ID", expected: saved.request.calendar_id, returned: source.calendar_id },
    { label: "Selected event ID", expected: saved.request.event_id, returned: source.selected_event_id },
    { label: "Target event ID", expected: saved.request.event_id, returned: source.target_event_id ?? unavailable },
    { label: "Occurrence", expected: "single", returned: source.occurrence },
    { label: "Provider version", expected: "A current provider version", returned: source.target_etag?.trim() || unavailable },
    { label: "Visibility", expected: "Readable source", returned: source.redacted === false ? "Readable source" : "Redacted by Google" },
    { label: "Title", expected: saved.request.summary, returned: source.event_summary ?? unavailable },
    { label: "Start", expected: saved.request.starts_at, returned: returnedStart },
    { label: "End", expected: saved.request.ends_at, returned: returnedEnd },
  ];
  return candidates.filter((row) => {
    if (row.label === "Provider version") return !source.target_etag?.trim();
    if ((row.label === "Start" || row.label === "End") && row.returned !== unavailable) {
      return !Number.isFinite(Date.parse(row.returned)) ||
        Date.parse(row.returned) !== Date.parse(row.expected);
    }
    return row.expected !== row.returned;
  });
}

function confirmUnavailable(error: unknown): boolean {
  return error instanceof BackendApiError && error.code === "calendar_create_unavailable";
}

function previewExpired(error: unknown): boolean {
  return error instanceof BackendApiError && error.code === "calendar_create_preview_expired";
}

export function CalendarCreateReview({
  actorId,
  organizationId,
  connectionId,
  accountLabel,
  calendar,
  transport = defaultTransport,
  storage,
  confirmAction = confirm,
}: {
  actorId: string;
  organizationId: string;
  connectionId: string;
  accountLabel: string;
  calendar: SelectedCalendar;
  transport?: CalendarCreateTransport;
  storage?: StorageDoor;
  confirmAction?: typeof confirm;
}) {
  const storageDoor = storage ?? browserSessionStorageDoor;
  const [saved, setSaved] = useState<CalendarCreateRecoveryRecord | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [summary, setSummary] = useState("");
  const [description, setDescription] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [timeZone, setTimeZone] = useState("");
  const [attendees, setAttendees] = useState("");
  const [sendUpdates, setSendUpdates] = useState<"" | CalendarCreateRequest["send_updates"]>("");
  const [stableEventId, setStableEventId] = useState<string | null>(null);
  const [busy, setBusy] = useState<"preview" | "confirm" | "source" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sourceMismatch, setSourceMismatch] = useState<CalendarEventSourceResult | null>(null);
  const epoch = useRef(0);
  const busyRef = useRef(false);

  useEffect(() => () => { epoch.current += 1; busyRef.current = false; }, []);
  useEffect(() => {
    const restored = readCalendarCreateRecovery(storageDoor, actorId);
    // Session storage is an external browser system and cannot be read during SSR.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSaved(restored.record);
    setWarning(restored.warning);
  }, [actorId, storageDoor]);
  useEffect(() => {
    epoch.current += 1;
    busyRef.current = false;
  }, [actorId, organizationId, connectionId, accountLabel, calendar.id]);

  const scopeMatches = saved ? sameCalendarCreateScope(saved, {
    actorId, organizationId, connectionId, calendarId: calendar.id,
  }) : false;
  const canCreateHere = ["owner", "writer", "writerWithoutPrivateAccess"].includes(calendar.access_role);
  const originalSourceHref = saved ? sourceUrl(saved) : null;
  const verifiedSource = verifiedSourceView(saved);
  const sourceDifferences = saved && sourceMismatch && scopeMatches
    ? sourceDifferenceRows(saved, sourceMismatch)
    : [];

  async function review(requestOverride?: CalendarCreateRequest) {
    if (busyRef.current || !canCreateHere) return;
    if (!requestOverride && (!summary.trim() || !startsAt || !endsAt || !timeZone || !sendUpdates)) {
      setError("Add a title, start, end, time zone, and guest notification choice.");
      return;
    }
    if (!requestOverride && (!validTimeZone(timeZone) || Date.parse(endsAt) <= Date.parse(startsAt))) {
      setError("Use a valid time zone and an end after the start.");
      return;
    }
    const request: CalendarCreateRequest = requestOverride ?? {
      organization_id: organizationId,
      connection_id: connectionId,
      calendar_id: calendar.id,
      event_id: stableEventId ?? createEventId(),
      summary: summary.trim(),
      description: description.trim() || null,
      starts_at: startsAt,
      ends_at: endsAt,
      attendees: parseAttendees(attendees),
      send_updates: sendUpdates || "none",
    };
    const pending: CalendarCreateRecoveryRecord = {
      version: 1, actor_id: actorId, account_label: accountLabel,
      calendar_summary: calendar.summary, time_zone: requestOverride ? saved?.time_zone ?? timeZone : timeZone,
      request, intent: null, result: null, source: null,
      problem: "Event review has not completed.",
      phase: "preview_unavailable",
    };
    if (!writeCalendarCreateRecovery(storageDoor, pending)) {
      setError("This tab could not save recovery. Nothing was sent.");
      return;
    }
    setSaved(pending);
    setBusy("preview"); busyRef.current = true; setError(null); setWarning(null);
    const callEpoch = ++epoch.current;
    try {
      const intent = await transport.preview(request);
      if (callEpoch !== epoch.current) return;
      if (!calendarCreateIntentMatchesRequest(intent, request, {
        accountLabel: pending.account_label,
        calendarSummary: pending.calendar_summary,
      })) {
        const held = {
          ...pending,
          problem: "Google returned an event review that does not match these details.",
        };
        writeCalendarCreateRecovery(storageDoor, held);
        setSaved(held);
        setError(held.problem);
        return;
      }
      const reviewed = { ...pending, intent, problem: null, phase: "reviewed_unattempted" as const };
      if (!writeCalendarCreateRecovery(storageDoor, reviewed)) {
        setSaved(pending);
        setError("The review could not be saved. The event cannot be confirmed.");
        return;
      }
      setSaved(reviewed);
    } catch (cause) {
      if (callEpoch !== epoch.current) return;
      const problem = getUserMessage(cause);
      const failed = { ...pending, problem };
      if (!writeCalendarCreateRecovery(storageDoor, failed)) {
        setWarning("The review failure could not be saved in this tab. Do not create this event.");
      }
      setSaved(failed);
      setError(problem);
    } finally {
      if (callEpoch === epoch.current) { setBusy(null); busyRef.current = false; }
    }
  }

  async function send() {
    if (!saved?.intent || !scopeMatches || busyRef.current) return;
    if (!["reviewed_unattempted", "retryable_same_intent"].includes(saved.phase)) return;
    if (expired(saved.intent)) {
      requireFreshReview("This event review expired. Review it again before creating.");
      return;
    }
    const approvalEpoch = epoch.current;
    const serverPreview = saved.intent.preview;
    const approved = await confirmAction({
      title: "Create this Google Calendar event?",
      description: `${serverPreview.account_email} · ${serverPreview.calendar_summary} · ${serverPreview.starts_at} · ${serverPreview.attendees.length} guests · ${serverPreview.send_updates}`,
      confirmLabel: "Create event",
    });
    if (!approved || busyRef.current || approvalEpoch !== epoch.current) return;
    if (expired(saved.intent)) {
      requireFreshReview("This event review expired while confirmation was open. Review it again.");
      return;
    }
    const attempting = { ...saved, problem: null, phase: "attempting" as const };
    if (!writeCalendarCreateRecovery(storageDoor, attempting)) {
      setError("This tab could not save the attempt. Nothing was sent.");
      return;
    }
    setSaved(attempting); setBusy("confirm"); busyRef.current = true; setError(null);
    const callEpoch = ++epoch.current;
    try {
      const result = await transport.confirm({ intentId: saved.intent.intent_id, organizationId: saved.request.organization_id });
      if (callEpoch !== epoch.current) return;
      const settled = {
        ...attempting,
        result,
        problem: calendarCreateResultMatches(attempting, result)
          ? null
          : "Google returned a different event after confirmation. Check the original source.",
        phase: calendarCreateResultMatches(attempting, result) ? "consumed" as const : "reconciliation_required" as const,
      };
      if (!writeCalendarCreateRecovery(storageDoor, settled)) {
        setWarning("The result could not be saved in this tab. Do not create the event again.");
        setSaved(settled);
        return;
      }
      setSaved(settled);
      if (settled.phase === "reconciliation_required") setError("Google returned a different event. Check the original source before doing anything else.");
    } catch (cause) {
      if (callEpoch !== epoch.current) return;
      if (previewExpired(cause)) {
        requireFreshReview("This event review expired before Google accepted it. Review it again.", attempting);
        setError(getUserMessage(cause));
        return;
      }
      const problem = getUserMessage(cause);
      let failed = {
        ...attempting,
        problem: confirmUnavailable(cause) ? null : problem,
        phase: confirmUnavailable(cause) ? "retryable_same_intent" as const : "uncertain" as const,
      };
      if (!writeCalendarCreateRecovery(storageDoor, failed)) {
        failed = { ...attempting, problem: "The confirmation outcome could not be saved.", phase: "uncertain" as const };
        setWarning("The confirmation failure could not be saved in this tab. Do not retry it.");
      }
      setSaved(failed);
      setError(problem);
    } finally {
      if (callEpoch === epoch.current) { setBusy(null); busyRef.current = false; }
    }
  }

  async function checkOriginalSource() {
    if (!saved || !scopeMatches || busyRef.current ||
      !["uncertain", "reconciliation_required"].includes(saved.phase)) return;
    const held = saved;
    setBusy("source"); busyRef.current = true; setError(null); setWarning(null); setSourceMismatch(null);
    const callEpoch = ++epoch.current;
    try {
      const source = await transport.readSource({
        organizationId: held.request.organization_id,
        request: {
          connection_id: held.request.connection_id,
          calendar_id: held.request.calendar_id,
          selected_event_id: held.request.event_id,
          occurrence: "single",
        },
      });
      if (callEpoch !== epoch.current) return;
      const verified = settleCalendarCreateFromSource(held, source);
      if (!verified) {
        const problem = calendarEventSourceMatchesRecovery(held, source)
          ? "This saved action cannot be settled from its current state."
          : "Google returned source details that do not match the reviewed event.";
        const mismatched = { ...held, problem };
        if (!writeCalendarCreateRecovery(storageDoor, mismatched)) {
          setWarning("The source mismatch could not be saved. Keep this event held.");
        } else {
          setSaved(mismatched);
        }
        setSourceMismatch(source);
        setError(problem);
        return;
      }
      if (!writeCalendarCreateRecovery(storageDoor, verified)) {
        setWarning("The source proof could not be saved. Keep this event held.");
        setError("Google returned a matching source, but this tab could not save the proof.");
        return;
      }
      setSourceMismatch(null);
      setSaved(verified);
    } catch (cause) {
      if (callEpoch !== epoch.current) return;
      const problem = getUserMessage(cause);
      setSourceMismatch(null);
      const failed = { ...held, problem };
      if (!writeCalendarCreateRecovery(storageDoor, failed)) {
        setWarning("The source check failure could not be saved. Keep this event held.");
      } else {
        setSaved(failed);
      }
      setError(problem);
    } finally {
      if (callEpoch === epoch.current) { setBusy(null); busyRef.current = false; }
    }
  }

  function requireFreshReview(
    problem: string,
    current: CalendarCreateRecoveryRecord | null = saved,
  ) {
    if (!current) return;
    const fresh: CalendarCreateRecoveryRecord = {
      ...current,
      intent: null,
      result: null,
      source: null,
      problem,
      phase: "preview_unavailable",
    };
    if (!writeCalendarCreateRecovery(storageDoor, fresh)) {
      setError("This tab could not save the expired review. Nothing was sent.");
      return;
    }
    setSaved(fresh);
    setError(problem);
  }

  function editEvent() {
    if (!saved || saved.phase !== "preview_unavailable" || !scopeMatches) return;
    setSummary(saved.request.summary);
    setDescription(saved.request.description ?? "");
    setStartsAt(saved.request.starts_at);
    setEndsAt(saved.request.ends_at);
    setTimeZone(saved.time_zone);
    setAttendees(saved.request.attendees?.map((guest) => guest.email).join(", ") ?? "");
    setSendUpdates(saved.request.send_updates);
    setStableEventId(saved.request.event_id);
    setSaved(null);
    setError(null);
  }

  function startAnother() {
    if (!saved || !["consumed", "source_verified"].includes(saved.phase)) return;
    if (!clearCalendarCreateRecovery(storageDoor)) {
      setError("This tab could not clear the completed event.");
      return;
    }
    setSaved(null); setError(null); setWarning(null);
    setSummary(""); setDescription(""); setStartsAt(""); setEndsAt(""); setTimeZone(""); setAttendees(""); setSendUpdates(""); setStableEventId(null);
  }

  return (
    <section className="space-y-3 rounded-md border border-border p-3" aria-label="Create Google Calendar event">
      <div>
        <p className="type-title">Create an event</p>
        <p className="type-secondary text-muted-foreground">{accountLabel} · {calendar.summary}</p>
      </div>
      {warning ? <p className="type-secondary text-warning">{warning}</p> : null}
      {error ? <p role="alert" className="type-secondary text-destructive">{error}<ErrorAlchemyMenu error={error} /></p> : null}
      {!canCreateHere ? <p className="type-secondary text-muted-foreground">Choose a calendar that allows event changes.</p> : null}
      {saved ? (
        <div className="space-y-2 type-secondary" data-calendar-create-recovery>
          <p className="font-medium text-foreground">{saved.request.summary}</p>
          <p>{saved.request.starts_at} – {saved.request.ends_at}</p>
          <p>{saved.time_zone} · Notifications: {saved.request.send_updates}</p>
          <p>Account: {saved.account_label}</p>
          <p>Calendar: {saved.calendar_summary}</p>
          <label className="grid gap-1 text-xs font-medium text-muted-foreground">
            Event ID
            <Input mono readOnly value={saved.request.event_id} />
          </label>
          {!scopeMatches ? <p className="text-warning">This saved action belongs to its original account, organization, and calendar.</p> : null}
          {saved.intent ? <p>Review expires: {saved.intent.expires_at}</p> : null}
          {saved.intent ? (
            <div className="space-y-1 rounded-md border border-border bg-muted/20 p-2">
              <p>Google account: {saved.intent.preview.account_email}</p>
              <p>Calendar access: {saved.intent.preview.access_role}</p>
              <p>Guests: {saved.intent.preview.attendees.map((guest) => guest.email).join(", ") || "None"}</p>
              <p>{saved.intent.preview.guest_notification_behavior}</p>
              <p>{saved.intent.preview.undo_notice}</p>
            </div>
          ) : null}
          {saved.phase === "reviewed_unattempted" && expired(saved.intent) ? (
            <Button type="button" variant="outline" onClick={() => void review(saved.request)} disabled={!scopeMatches || busy !== null}>Review again</Button>
          ) : null}
          {saved.phase === "preview_unavailable" ? (
            <div className="flex flex-wrap gap-2">
              <p className="w-full text-destructive">{saved.problem}<ErrorAlchemyMenu error={saved.problem ?? undefined} /></p>
              <Button type="button" variant="outline" onClick={editEvent} disabled={!scopeMatches || busy !== null}>Edit event</Button>
              <Button type="button" variant="outline" onClick={() => void review(saved.request)} disabled={!scopeMatches || busy !== null}>{busy === "preview" ? "Reviewing…" : "Review again"}</Button>
            </div>
          ) : null}
          {(saved.phase === "reviewed_unattempted" || saved.phase === "retryable_same_intent") && !expired(saved.intent) ? (
            <Button variant="primary" type="button" onClick={() => void send()} disabled={!scopeMatches || busy !== null}>{busy === "confirm" ? "Creating…" : saved.phase === "retryable_same_intent" ? "Retry same confirmation" : "Confirm create"}</Button>
          ) : null}
          {saved.phase === "retryable_same_intent" && expired(saved.intent) ? (
            <Button type="button" variant="outline" onClick={() => requireFreshReview("This event review expired. Review it again before creating.")}>Prepare fresh review</Button>
          ) : null}
          {["attempting", "uncertain", "reconciliation_required"].includes(saved.phase) ? (
            <div className="space-y-2 rounded-md border border-warning/40 bg-warning/10 p-2">
              {saved.problem ? <p>{saved.problem}<ErrorAlchemyMenu error={saved.problem} /></p> : null}
              {sourceMismatch && scopeMatches ? (
                <div className="space-y-1 rounded-md border border-warning/40 bg-background/70 p-2" aria-label="Source differences">
                  <p className="font-medium text-foreground">Returned source differences</p>
                  {sourceDifferences.length > 0 ? sourceDifferences.map((difference) => (
                    <div key={difference.label} className="grid gap-1 sm:grid-cols-[8rem_1fr]">
                      <span className="font-medium text-muted-foreground">{difference.label}</span>
                      <span className="break-all">Original: {difference.expected}<br />Returned: {difference.returned}</span>
                    </div>
                  )) : <p>The returned source could not be validated.</p>}
                </div>
              ) : null}
              <p>This event may already exist. Check the original Google source before continuing.</p>
              <p>Review {saved.request.summary} at {saved.request.starts_at} in {saved.account_label} · {saved.calendar_summary}.</p>
              {originalSourceHref ? <a className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline" href={originalSourceHref} target="_blank" rel="noreferrer">Open original event in Google Calendar <ExternalLink className="h-3.5 w-3.5" /></a> : null}
              {["uncertain", "reconciliation_required"].includes(saved.phase) ? (
                <Button type="button" variant="outline" onClick={() => void checkOriginalSource()} disabled={!scopeMatches || busy !== null}>{busy === "source" ? "Checking…" : "Check original source"}</Button>
              ) : null}
            </div>
          ) : null}
          {saved.phase === "source_verified" && verifiedSource ? (
            <div className="space-y-2 rounded-md border border-success/40 bg-success/10 p-2">
              <p className="font-medium text-foreground">Matching Google source verified</p>
              <p>{verifiedSource.title}</p>
              <p>{verifiedSource.startsAt} – {verifiedSource.endsAt}</p>
              <label className="grid gap-1 text-xs font-medium text-muted-foreground">
                Current Google event ID
                <Input mono readOnly value={verifiedSource.eventId} />
              </label>
              <p>This source read confirms the matching event. It does not verify the create response, guests, body, or notifications.</p>
              <a
                className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
                href={verifiedSource.href}
                target="_blank"
                rel="noreferrer"
              >
                Open verified event in Google Calendar <ExternalLink className="h-3.5 w-3.5" />
              </a>
              <Button type="button" variant="outline" onClick={startAnother}>Create another event</Button>
            </div>
          ) : null}
          {saved.phase === "consumed" ? (
            <div className="space-y-2">
              <p className="font-medium text-foreground">Event created in Google Calendar.</p>
              <CalendarSavedCopyStatus view={createResultLocalRefresh(saved.result)} />
              <label className="grid gap-1 text-xs font-medium text-muted-foreground">
                Google event ID
                <Input mono readOnly value={saved.result?.result.provider_event_id ?? ""} />
              </label>
              {saved.result ? (
                <a
                  className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
                  href={googleCalendarHref({
                    external_id: saved.result.result.provider_event_id,
                    calendar_id: saved.result.result.calendar_id,
                  }, saved.result.result.account_email) ?? undefined}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open event in Google Calendar <ExternalLink className="h-3.5 w-3.5" />
                </a>
              ) : null}
              <Button type="button" variant="outline" onClick={startAnother}>Create another event</Button>
            </div>
          ) : null}
        </div>
      ) : canCreateHere ? (
        <div className="grid gap-2">
          <Input aria-label="Event title" placeholder="Event title" value={summary} onChange={(event) => setSummary(event.target.value)} />
          <Input aria-label="Description" placeholder="Description (optional)" value={description} onChange={(event) => setDescription(event.target.value)} />
          <Input aria-label="Start time" placeholder="2026-10-05T09:00:00-07:00" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} />
          <Input aria-label="End time" placeholder="2026-10-05T10:00:00-07:00" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} />
          <Input aria-label="Time zone" placeholder="America/Los_Angeles" value={timeZone} onChange={(event) => setTimeZone(event.target.value)} />
          <Input aria-label="Guests" placeholder="Guest emails, separated by commas" value={attendees} onChange={(event) => setAttendees(event.target.value)} />
          <label className="grid gap-1 text-xs font-medium text-muted-foreground">
            Guest notifications
            <select className="min-h-11 rounded-md border border-input bg-background px-3 text-sm text-foreground" value={sendUpdates} onChange={(event) => setSendUpdates(event.target.value as typeof sendUpdates)}>
              <option value="">Choose notification behavior</option>
              <option value="all">Notify all guests</option>
              <option value="externalOnly">Notify external guests</option>
              <option value="none">Send no updates</option>
            </select>
          </label>
          <Button variant="primary" type="button" onClick={() => void review()} disabled={busy !== null}>{busy === "preview" ? "Reviewing…" : "Review event"}</Button>
        </div>
      ) : null}
    </section>
  );
}
