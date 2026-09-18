"use client";

/**
 * Calendar Plane C — the two sections the Detail primitive's fixed ones cannot
 * carry: the ATTENDEES (RSVP state plus a door for every one who is a Person
 * here, with their open items) and WHAT THIS SURFACE CANNOT DO.
 *
 * The fixed sections — header, the Google health strip, fields, associations,
 * history — all come from the one registration and are not repeated here.
 */

import { useEffect, useState } from "react";
import { Archive, Lock, PlugZap, Users } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { toast } from "@/lib/toast";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { useOpenDetail } from "@/lib/detail/useOpenDetail";
import { useOpenGoogleConnectWindow } from "@/features/overlays/openers/googleConnectWindow";
import { extractErrorMessage } from "@/utils/errors";
// 🚨 REUSE, NEVER FORK: ONE generic server pair serves every synced record
// table (B-29). This is not a second implementation — it is the SAME two
// functions the Doc panel calls, with THIS table's own address.
import {
  archiveSyncedRecord,
  detachSyncedRecord,
} from "@/features/google-workspace/documents/service";

import {
  CALENDAR_EVENT_TABLE,
  CALENDAR_UNAVAILABLE_ACTIONS,
  DETACHED_EVENT_SENTENCE,
  UNAVAILABLE_EVENT_SENTENCE,
  attendeesOf,
  resolveAttendeePeople,
  rsvpDotClass,
  rsvpLabel,
  sharedAddressSentence,
  syncStatusOf,
} from "./record";
import { OpenItemsCount } from "./OpenItemsCount";
import { readAttendeePeople } from "./service";
import type { AttendeePerson, CalendarEventRow } from "./types";

/**
 * PLAN §4.6's edge: *"This attendee is a Person here; these are the three open
 * items on them"* — pure join work over data we already hold. The count itself is
 * `OpenItemsCount`, which lives in its own module because the AGENDA needs the
 * same sentence from the same source (N4).
 */

export function CalendarEventAttendeesSection({ event }: { event: CalendarEventRow }) {
  const openDetail = useOpenDetail("party");
  const attendees = attendeesOf(event.attendees);
  const [people, setPeople] = useState<AttendeePerson[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const byEvent = await readAttendeePeople([event]);
        if (!cancelled) setPeople(byEvent.get(event.id) ?? []);
      } catch (error: unknown) {
        // Never an empty list, which would read as "none of them are People".
        if (!cancelled) {
          setPeople([]);
          setProblem(
            `We could not check which attendees are People here: ${extractErrorMessage(error)}`,
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [event]);

  if (attendees.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Google did not list any attendees on this event.
      </p>
    );
  }

  // 🚨 N3 — ONE RESOLVER, ONE-TO-MANY, SHARED WITH THE AGENDA. The Map keyed on
  // the address that used to be here kept the LAST Person at a shared address and
  // computed the leftovers from the same key, so the other Person was dropped
  // from the screen entirely with nothing said about it.
  const index = resolveAttendeePeople(attendees, people ?? []);
  const open = (person: AttendeePerson) => {
    void openDetail({
      type: "party",
      id: person.partyId,
      seed: { name: person.displayName },
    });
  };

  return (
    <div className="space-y-2">
      {problem ? <p className="text-xs text-muted-foreground">{problem}</p> : null}
      <ul className="space-y-1.5">
        {index.matches.map(({ attendee, people: matched }) => (
          <li key={attendee.email} className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span
              className={cn("h-2 w-2 shrink-0 rounded-full", rsvpDotClass(attendee.rsvp))}
              aria-label={rsvpLabel(attendee.rsvp)}
            />
            {matched.length === 0 ? (
              <span className="text-sm text-foreground">
                {attendee.displayName ?? attendee.email}
              </span>
            ) : (
              matched.map((person) => (
                <span key={person.partyId} className="inline-flex items-center gap-2">
                  <EntityRef
                    token="party"
                    id={person.partyId}
                    name={person.displayName ?? attendee.email}
                    showIcon={false}
                    labelClassName="text-sm"
                    onOpen={() => open(person)}
                  />
                  <OpenItemsCount partyId={person.partyId} />
                </span>
              ))
            )}
            <span className="text-xs text-muted-foreground">{attendee.email}</span>
            <span className="text-xs text-muted-foreground">{rsvpLabel(attendee.rsvp)}</span>
            {attendee.organizer ? (
              <span className="text-xs text-muted-foreground">Organizer</span>
            ) : null}
            {attendee.optional ? (
              <span className="text-xs text-muted-foreground">Optional</span>
            ) : null}
            {matched.length > 1 ? (
              <span className="text-xs text-muted-foreground">
                {sharedAddressSentence(matched.length)}
              </span>
            ) : null}
          </li>
        ))}
        {index.unplaced.map((person) => (
          <li key={person.partyId} className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Users className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <EntityRef
              token="party"
              id={person.partyId}
              name={person.displayName ?? person.partyId}
              showIcon={false}
              labelClassName="text-sm"
              onOpen={() => open(person)}
            />
            <span className="text-xs text-muted-foreground">
              Linked to this event; none of their stored addresses is on it any more.
            </span>
            <OpenItemsCount partyId={person.partyId} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * 🚨 LAW 4 — ABSENT OR HONEST, NEVER A DEAD BUTTON. Google Calendar is read-only
 * for us (`calendar.events.owned` readonly), so the four things a person will
 * reach for are stated as sentences with the remedy, and rendered as text: there
 * is nothing here to press, which is the point. When Calendar write arrives these
 * become real controls behind the same knob shape as Sheets (PLAN §8).
 */
export function CalendarEventUnavailableSection() {
  return (
    <ul className="space-y-1.5">
      {CALENDAR_UNAVAILABLE_ACTIONS.map((row) => (
        <li key={row.action} className="flex gap-2">
          <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{row.action}</span> — {row.why}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * 🚨 A DESTRUCTIVE OR IRREVERSIBLE CLICK NAMES ITS CONSEQUENCE FIRST
 * (`common-docs/policies/destructive-and-expensive-actions.md`). Mirrors the
 * Doc record's `KeepAndArchiveActions` (`documents/GoogleDocumentPanel.tsx`) —
 * same server pair, same confirm-first shape, calendar's own words: what stops
 * refreshing, what stays, and that nothing in Google Calendar changes either
 * way.
 */
function CalendarEventKeepAndArchiveActions({
  event,
  onDetached,
  onArchived,
}: {
  event: CalendarEventRow;
  onDetached: (row: CalendarEventRow) => void;
  onArchived: (sentence: string) => void;
}) {
  const [running, setRunning] = useState<"keep" | "archive" | null>(null);
  const detached = syncStatusOf(event) === "detached";

  const keep = async () => {
    const ok = await confirm({
      title: "Keep as AI Matrx data",
      description:
        "This event stops refreshing from Google Calendar and keeps exactly what it has today — " +
        "its time, location, attendees and notes. Nothing changes in your Google Calendar, and " +
        "nothing here is deleted. It cannot be undone from this screen: to sync from Google " +
        "Calendar again you reconnect and let it refresh once more.",
      confirmLabel: "Keep as AI Matrx data",
    });
    if (!ok) return;
    setRunning("keep");
    try {
      const result = await detachSyncedRecord({
        table: CALENDAR_EVENT_TABLE,
        // THE RECORD'S OWN organization_id, never the active org.
        recordId: event.id,
        organizationId: event.organization_id,
      });
      toast.success(
        result.changed
          ? "Kept as AI Matrx data. This event no longer refreshes from Google Calendar."
          : "This event was already kept as AI Matrx data.",
      );
      onDetached({
        ...event,
        sync_status: result.sync_status ?? "detached",
        sync_status_reason: result.sync_status_reason,
      });
    } catch (error: unknown) {
      toast.error(extractErrorMessage(error));
    } finally {
      setRunning(null);
    }
  };

  const archive = async () => {
    const ok = await confirm({
      title: "Archive this event",
      description:
        "This event goes out of the way and stays recoverable from the archive — nothing here is " +
        "destroyed, and your event in Google Calendar is untouched. It will stop appearing in " +
        "your agenda and in this panel until it is restored.",
      confirmLabel: "Archive",
      variant: "destructive",
    });
    if (!ok) return;
    setRunning("archive");
    try {
      const result = await archiveSyncedRecord({
        table: CALENDAR_EVENT_TABLE,
        recordId: event.id,
        organizationId: event.organization_id,
      });
      toast.success(
        result.changed
          ? "Archived. It is recoverable from the archive."
          : "This event was already archived.",
      );
      onArchived(
        "Archived. It is out of the way and recoverable from the archive; your event in Google Calendar is untouched.",
      );
    } catch (error: unknown) {
      toast.error(extractErrorMessage(error));
    } finally {
      setRunning(null);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2" data-calendar-event-record-actions>
      {detached ? null : (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={running !== null}
          onClick={() => void keep()}
          data-calendar-event-keep
        >
          <Lock className="mr-1.5 h-3.5 w-3.5" />
          {running === "keep" ? "Keeping…" : "Keep as AI Matrx data"}
        </Button>
      )}
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={running !== null}
        onClick={() => void archive()}
        data-calendar-event-archive
      >
        <Archive className="mr-1.5 h-3.5 w-3.5" />
        {running === "archive" ? "Archiving…" : "Archive this event"}
      </Button>
    </div>
  );
}

/**
 * The two actions that are not server calls on this record.
 *
 * RECONNECT is real, and it opens IN PLACE: the Google connect window runs
 * incremental consent for exactly the missing scopes, which is the same door the
 * record's own health strip offers through the host's `reconnectSource`. It is
 * deliberately NOT an anchor to a settings page — nothing inside the Detail
 * primitive navigates away.
 *
 * 🚨 Cursor Bugbot (PR 228) — a person with more than one Google account was
 * sent to WHICHEVER grant the connect window opened first, not the one that
 * actually refreshes this meeting: this event names its own account
 * (`synced_via_connection_id`), the same field the Doc sibling's
 * `UnavailableActions` already reads (`documents/GoogleDocumentPanel.tsx`), and
 * that id — never a guess — is the one passed on as `initialConnectionId`. An
 * event whose row carries no connection id (never refreshed yet) opens the
 * connect window with none, exactly as before; there is no other id to offer.
 *
 * RE-PICKING is not real for a meeting and is not offered: an event is not a file
 * somebody chose in Google Picker (the whole calendar window is read through the
 * connected account), so there is nothing to choose again. A control that cannot
 * work is worse than none, so this is one honest line with the remedy that does
 * exist.
 */
function CalendarEventReconnectAction({ event }: { event: CalendarEventRow }) {
  const openGoogleConnect = useOpenGoogleConnectWindow();
  const connectionId = event.synced_via_connection_id;

  return (
    <div className="space-y-1.5">
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() =>
          openGoogleConnect({
            reason: "to keep this meeting refreshing from your Google calendar",
            initialConnectionId: connectionId ?? undefined,
          })
        }
        data-calendar-event-reconnect
      >
        <PlugZap className="mr-1.5 h-3.5 w-3.5" />
        Reconnect Google
      </Button>
      <p className="text-xs text-muted-foreground">
        There is nothing to pick again for a meeting — events are read from the whole calendar
        your connected Google account can see, not from a file you chose, so reconnecting that
        account and refreshing is the repair.
      </p>
    </div>
  );
}

function CalendarEventUnavailableNotice({
  event,
  onDetached,
  onArchived,
}: {
  event: CalendarEventRow;
  onDetached: (row: CalendarEventRow) => void;
  onArchived: (sentence: string) => void;
}) {
  return (
    <div
      className="space-y-3 rounded-md border border-destructive/40 bg-destructive/5 p-3"
      data-calendar-event-unavailable
    >
      <p className="flex items-start gap-2 text-sm text-foreground">
        <Lock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <span>{event.sync_status_reason?.trim() || UNAVAILABLE_EVENT_SENTENCE}</span>
      </p>
      {/* 🚨 N11 — ALL FOUR ACTIONS THE DOC SIBLING OFFERS ARE ANSWERED HERE.
          Reconnect is a real door and belongs to this refusal: the grant is what
          Google withheld. Re-picking is the one that means nothing for a meeting,
          so it is a sentence, not a control (law 4). */}
      <CalendarEventReconnectAction event={event} />
      <CalendarEventKeepAndArchiveActions event={event} onDetached={onDetached} onArchived={onArchived} />
    </div>
  );
}

/**
 * The TERMINAL state, and it is not a failure: the person chose it. There is
 * no Reconnect link here — reconnecting repairs nothing about a choice.
 */
function CalendarEventDetachedNotice({
  event,
  onDetached,
  onArchived,
}: {
  event: CalendarEventRow;
  onDetached: (row: CalendarEventRow) => void;
  onArchived: (sentence: string) => void;
}) {
  return (
    <div
      className="space-y-3 rounded-md border border-border bg-muted/40 p-3"
      data-calendar-event-detached
    >
      <p className="flex items-start gap-2 text-sm text-foreground">
        <Lock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <span>{event.sync_status_reason?.trim() || DETACHED_EVENT_SENTENCE}</span>
      </p>
      <CalendarEventKeepAndArchiveActions event={event} onDetached={onDetached} onArchived={onArchived} />
    </div>
  );
}

/**
 * The record-level notice for a calendar event Google is not answering for —
 * "Keep as AI Matrx data" and "Archive" (B-29's generic pair), each naming its
 * consequence before it runs. Absent entirely for an `available` event (law 4:
 * never an empty box), which is why this is its own conditional section rather
 * than always-rendered.
 */
export function CalendarEventAvailabilitySection({ event: initialEvent }: { event: CalendarEventRow }) {
  const [event, setEvent] = useState<CalendarEventRow>(initialEvent);
  const [archivedSentence, setArchivedSentence] = useState<string | null>(null);

  useEffect(() => {
    setEvent(initialEvent);
  }, [initialEvent]);

  if (archivedSentence) {
    return (
      <p className="text-sm text-muted-foreground" data-calendar-event-archived>
        {archivedSentence}
      </p>
    );
  }

  const status = syncStatusOf(event);
  if (status === "available") return null;

  return status === "detached" ? (
    <CalendarEventDetachedNotice event={event} onDetached={setEvent} onArchived={setArchivedSentence} />
  ) : (
    <CalendarEventUnavailableNotice event={event} onDetached={setEvent} onArchived={setArchivedSentence} />
  );
}
