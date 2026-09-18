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
import { Archive, Lock, Users } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { toast } from "@/lib/toast";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { useOpenDetail } from "@/lib/detail/useOpenDetail";
import { fetchDealsForParty } from "@/features/crm/deals/service";
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
  attendeesOf,
  rsvpDotClass,
  rsvpLabel,
  syncStatusOf,
} from "./record";
import { readAttendeePeople } from "./service";
import type { AttendeePerson, CalendarEventRow } from "./types";

/**
 * PLAN §4.6's edge: *"This attendee is a Person here; these are the three open
 * items on them"* — pure join work over data we already hold. The open items are
 * that Person's OPEN DEALS, read through crm's own `fetchDealsForParty`, which is
 * the only per-Person item lookup this platform has today; it is capped at 50
 * rows, so a count at the cap is shown as "50+" rather than as a number that
 * could be wrong.
 */
const DEALS_QUERY_CAP = 50;

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

  const byEmail = new Map(
    (people ?? []).filter((person) => person.email).map((person) => [person.email!, person]),
  );
  const unplaced = (people ?? []).filter(
    (person) => !person.email || !byEmail.has(person.email),
  );

  return (
    <div className="space-y-2">
      {problem ? <p className="text-xs text-muted-foreground">{problem}</p> : null}
      <ul className="space-y-1.5">
        {attendees.map((attendee) => {
          const person = byEmail.get(attendee.email) ?? null;
          return (
            <li key={attendee.email} className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span
                className={cn("h-2 w-2 shrink-0 rounded-full", rsvpDotClass(attendee.rsvp))}
                aria-label={rsvpLabel(attendee.rsvp)}
              />
              {person ? (
                <EntityRef
                  token="party"
                  id={person.partyId}
                  name={person.displayName ?? attendee.email}
                  showIcon={false}
                  labelClassName="text-sm"
                  onOpen={() => {
                    void openDetail({
                      type: "party",
                      id: person.partyId,
                      seed: { name: person.displayName },
                    });
                  }}
                />
              ) : (
                <span className="text-sm text-foreground">
                  {attendee.displayName ?? attendee.email}
                </span>
              )}
              <span className="text-xs text-muted-foreground">{attendee.email}</span>
              <span className="text-xs text-muted-foreground">{rsvpLabel(attendee.rsvp)}</span>
              {attendee.organizer ? (
                <span className="text-xs text-muted-foreground">Organizer</span>
              ) : null}
              {attendee.optional ? (
                <span className="text-xs text-muted-foreground">Optional</span>
              ) : null}
              {person ? <OpenItemsCount partyId={person.partyId} /> : null}
            </li>
          );
        })}
        {unplaced.map((person) => (
          <li key={person.partyId} className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Users className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <EntityRef
              token="party"
              id={person.partyId}
              name={person.displayName ?? person.partyId}
              showIcon={false}
              labelClassName="text-sm"
              onOpen={() => {
                void openDetail({
                  type: "party",
                  id: person.partyId,
                  seed: { name: person.displayName },
                });
              }}
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

/** "3 open deals" beside a Person — or nothing at all rather than a wrong zero. */
function OpenItemsCount({ partyId }: { partyId: string }) {
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const deals = await fetchDealsForParty(partyId);
        if (cancelled) return;
        const open = deals.filter((deal) => deal.status === "open").length;
        // A count that could be short is never printed as a plain number: the
        // read is capped at 50 rows, so at the cap it says "50+".
        const capped = deals.length >= DEALS_QUERY_CAP;
        if (open === 0) {
          setText(capped ? "No open deals in the most recent 50" : "No open deals");
          return;
        }
        setText(
          capped
            ? `${open}+ open deals`
            : open === 1
              ? "1 open deal"
              : `${open} open deals`,
        );
      } catch {
        // The count is context, not the subject: a failed count says it could not
        // be read rather than claiming zero.
        if (!cancelled) setText("Open deals could not be read");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [partyId]);

  if (!text) return null;
  return <span className="text-xs text-muted-foreground">{text}</span>;
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
        <span>
          {event.sync_status_reason?.trim() ||
            "Google Calendar would not give us this event the last time we asked, and did not say why."}
        </span>
      </p>
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
        <span>
          {event.sync_status_reason?.trim() ||
            "This event is AI Matrx data now and no longer refreshes from Google Calendar."}
        </span>
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
