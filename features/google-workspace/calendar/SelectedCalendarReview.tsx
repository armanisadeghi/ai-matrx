"use client";

import { useState } from "react";
import { CalendarSearch, ExternalLink, RefreshCw, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { GoogleAccountSelect } from "@/features/google-workspace/GoogleAccountSelect";
import { OrganizationContextNotice } from "@/features/organizations/components/OrganizationRequiredNotice";
import { useOrganizationRequired } from "@/features/organizations/useOrganizationRequired";
import { useGoogleConnectionInventory } from "@/features/marketing/google/hooks";
import { googleConnectionLabel } from "@/features/marketing/google/presentation";
import { useOpenGoogleConnectWindow } from "@/features/overlays/openers/googleConnectWindow";
import { extractErrorMessage } from "@/utils/errors";
import { BackendApiError } from "@/lib/api/errors";
import type { GoogleConnectionHealth } from "@/features/marketing/google/types";
import {
  discoverSelectedCalendars,
  readSelectedCalendarEvents,
  type SelectedCalendar,
  type SelectedEvent,
  type SelectedEventWindow,
} from "./selectedCalendarService";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

export interface SelectedCalendarProblem {
  message: string;
  offerReconnect: boolean;
}

/** A reconnect can repair only a known Google authorization or connection failure. */
export function selectedCalendarProblem(
  error: unknown,
  connectionHealth: GoogleConnectionHealth | undefined,
): SelectedCalendarProblem {
  if (connectionHealth === "needs_reauth" || connectionHealth === "revoked") {
    return {
      message: "This Google account needs reconnecting before its calendar can be reviewed.",
      offerReconnect: true,
    };
  }
  if (
    error instanceof BackendApiError &&
    error.code === "google_calendar_connection_unavailable"
  ) {
    return {
      message: error.userMessage,
      offerReconnect: true,
    };
  }
  return { message: extractErrorMessage(error), offerReconnect: false };
}

function dateTime(value: string | null, timeZone: string | null): string {
  if (!value) return "Time not provided";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Time not provided";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
    ...(timeZone ? { timeZone } : {}),
  }).format(date);
}

function attendeeText(event: SelectedEvent): string {
  const names = event.attendees
    .map((value) => {
      const email = value.email;
      return `${email} (${value.rsvp})`;
    })
    .filter(Boolean);
  return names.length ? names.join(", ") : "No attendees listed";
}

export function SelectedCalendarEventRow({ event }: { event: SelectedEvent }) {
  if (!event.detail_visible) {
    return (
      <li
        className="rounded-md border border-border bg-muted/30 p-3"
        data-selected-calendar-busy
      >
        <p className="font-medium text-foreground">Busy</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {dateTime(event.starts_at, event.time_zone)}
          {event.ends_at
            ? ` – ${dateTime(event.ends_at, event.time_zone)}`
            : ""}
        </p>
      </li>
    );
  }
  return (
    <li
      className="rounded-md border border-border p-3"
      data-selected-calendar-event
    >
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-medium text-foreground">{event.title}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {dateTime(event.starts_at, event.time_zone)}
            {event.ends_at
              ? ` – ${dateTime(event.ends_at, event.time_zone)}`
              : ""}
            {event.time_zone ? ` · ${event.time_zone}` : ""}
          </p>
        </div>
        {event.meeting_url ? (
          <a
            className="inline-flex min-h-9 items-center gap-1 text-sm text-primary underline-offset-4 hover:underline"
            href={event.meeting_url}
            target="_blank"
            rel="noreferrer"
          >
            Meeting <ExternalLink className="h-3.5 w-3.5" />
          </a>
        ) : null}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Organizer: {event.organizer_email ?? "Not listed"}
      </p>
      <p className="mt-1 flex gap-1.5 text-xs text-muted-foreground">
        <Users className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        {attendeeText(event)}
      </p>
    </li>
  );
}

function ReviewResult({ result }: { result: SelectedEventWindow }) {
  return (
    <div className="space-y-3" data-selected-calendar-result>
      <div className="rounded-md border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
        <p className="font-medium text-foreground">{result.calendar.summary}</p>
        <p className="mt-1">
          {dateTime(result.window_start, result.calendar.time_zone)} –{" "}
          {dateTime(result.window_end, result.calendar.time_zone)}
        </p>
        <p className="mt-1">
          Calendar time zone: {result.calendar.time_zone ?? "Not provided"}
        </p>
      </div>
      {result.truncated ? (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-foreground">
          This bounded window reached Google’s event limit. Refine the review
          before drawing conclusions.
        </p>
      ) : null}
      {result.events.length ? (
        <ul className="space-y-2">
          {result.events.map((event, index) => (
            <SelectedCalendarEventRow
              key={event.id ?? `${event.title}-${index}`}
              event={event}
            />
          ))}
        </ul>
      ) : (
        <p className="rounded-md border border-border p-3 text-sm text-muted-foreground">
          No events were returned for this selected calendar window.
        </p>
      )}
    </div>
  );
}

/** Internal-only preparation view. Server authorization remains the enforcement boundary. */
export function SelectedCalendarReview() {
  const { organizationId, organizationState } = useOrganizationRequired();
  const inventory = useGoogleConnectionInventory();
  const openGoogleConnect = useOpenGoogleConnectWindow();
  const [connectionId, setConnectionId] = useState("");
  const [calendars, setCalendars] = useState<SelectedCalendar[]>([]);
  const [calendarId, setCalendarId] = useState("");
  const [result, setResult] = useState<SelectedEventWindow | null>(null);
  const [busy, setBusy] = useState<"discover" | "read" | null>(null);
  const [problem, setProblem] = useState<SelectedCalendarProblem | null>(null);
  const connections = inventory.data?.connections ?? [];
  const selectedConnection =
    connections.find((connection) => connection.id === connectionId) ?? null;

  function chooseConnection(id: string) {
    setConnectionId(id);
    setCalendars([]);
    setCalendarId("");
    setResult(null);
    setProblem(null);
  }

  async function discover() {
    if (!organizationId || !connectionId) return;
    setBusy("discover");
    setProblem(null);
    setCalendars([]);
    setCalendarId("");
    setResult(null);
    try {
      setCalendars(
        await discoverSelectedCalendars({ organizationId, connectionId }),
      );
    } catch (error: unknown) {
      setProblem(selectedCalendarProblem(error, selectedConnection?.health));
    } finally {
      setBusy(null);
    }
  }

  async function readEvents() {
    if (!organizationId || !connectionId || !calendarId) return;
    setBusy("read");
    setProblem(null);
    setResult(null);
    try {
      setResult(
        await readSelectedCalendarEvents({
          organizationId,
          connectionId,
          calendarId,
        }),
      );
    } catch (error: unknown) {
      setProblem(selectedCalendarProblem(error, selectedConnection?.health));
    } finally {
      setBusy(null);
    }
  }

  if (organizationState !== "ready") {
    return (
      <OrganizationContextNotice
        compact
        state={organizationState}
        what="Selected calendar review"
      />
    );
  }
  if (inventory.isLoading)
    return (
      <p className="p-4 text-sm text-muted-foreground">
        Loading connected Google accounts…
      </p>
    );
  if (inventory.isError)
    return (
      <p className="m-3 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-foreground">
        Connected Google accounts could not be loaded. Try again from the Google
        connection screen.
        <ErrorAlchemyMenu />
      </p>
    );

  return (
    <section
      className="min-h-0 space-y-4 overflow-y-auto p-4"
      data-selected-calendar-review
    >
      <div>
        <div className="flex items-center gap-2">
          <CalendarSearch className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">
            Selected calendar review
          </h3>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Internal source preparation only. Nothing is saved or changed in
          Google, and this does not prepare a meeting.
        </p>
      </div>
      {connections.length ? (
        <GoogleAccountSelect
          connections={connections}
          connectionId={connectionId}
          onConnectionChange={chooseConnection}
          label="Google account to review"
          disabled={busy !== null}
          requireExplicitSelection
        />
      ) : (
        <p className="rounded-md border border-border p-3 text-sm text-muted-foreground">
          Connect a Google account before reviewing a selected calendar.
        </p>
      )}
      {selectedConnection ? (
        <p className="text-xs text-muted-foreground">
          Source account:{" "}
          <span className="font-medium text-foreground">
            {googleConnectionLabel(selectedConnection)}
          </span>
        </p>
      ) : null}
      <Button
        type="button"
        onClick={() => void discover()}
        disabled={!connectionId || busy !== null}
        className="min-h-11"
      >
        <RefreshCw
          className={`mr-1.5 h-4 w-4 ${busy === "discover" ? "animate-spin" : ""}`}
        />
        {busy === "discover" ? "Discovering calendars…" : "Discover calendars"}
      </Button>
      {calendars.length ? (
        <div className="grid gap-2">
          <label
            className="text-xs font-medium text-muted-foreground"
            htmlFor="selected-calendar"
          >
            Calendar to review
          </label>
          <Select
            value={calendarId || undefined}
            onValueChange={(id) => {
              setCalendarId(id);
              setResult(null);
            }}
            disabled={busy !== null}
          >
            <SelectTrigger id="selected-calendar" className="min-h-11">
              <SelectValue placeholder="Choose a calendar" />
            </SelectTrigger>
            <SelectContent>
              {calendars.map((calendar) => (
                <SelectItem key={calendar.id} value={calendar.id}>
                  {calendar.summary}
                  {calendar.primary ? " (primary)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}
      {connectionId && calendars.length === 0 && busy !== "discover" ? (
        <p className="text-xs text-muted-foreground">
          Choose this account and discover calendars before selecting one.
        </p>
      ) : null}
      {calendarId ? (
        <Button
          type="button"
          onClick={() => void readEvents()}
          disabled={busy !== null}
          className="min-h-11"
        >
          <CalendarSearch className="mr-1.5 h-4 w-4" />
          {busy === "read"
            ? "Reading selected calendar…"
            : "Read selected events"}
        </Button>
      ) : null}
      {problem ? (
        <div
          className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-foreground"
          data-selected-calendar-problem
        >
          <p>{problem.message}</p>
          {problem.offerReconnect && selectedConnection ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() =>
                openGoogleConnect({
                  reason:
                    "to restore Google Calendar access for this selected-calendar review",
                  initialConnectionId: selectedConnection.id,
                })
              }
            >
              Reconnect Google
            </Button>
          ) : null}
          <ErrorAlchemyMenu error={problem.message} />
        </div>
      ) : null}
      {result ? <ReviewResult result={result} /> : null}
    </section>
  );
}
