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
import { Lock, Users } from "lucide-react";

import { cn } from "@/lib/utils";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { useOpenDetail } from "@/lib/detail/useOpenDetail";
import { fetchDealsForParty } from "@/features/crm/deals/service";
import { extractErrorMessage } from "@/utils/errors";

import {
  CALENDAR_UNAVAILABLE_ACTIONS,
  attendeesOf,
  rsvpDotClass,
  rsvpLabel,
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
