"use client";

/**
 * Calendar Plane A — THE AGENDA. One component, three mounts (the home screen,
 * the Person record, a window panel), because a panel wraps the canonical
 * component and never a hand-rolled copy.
 *
 * Every row: the time, the title as a door onto the event Record, the meeting
 * link as a door, the attendees as RSVP dots, and each attendee who is a Person
 * here as a door that opens IN PLACE. Nothing here navigates away.
 *
 * Every absent state is an ANSWER, never a blank: no Google account → the ONE
 * connector prompt card (never a second card); connected but empty → it says so;
 * unreadable → it says what failed. A day with no events says "Nothing".
 */

import { useState } from "react";
import {
  CalendarDays,
  ExternalLink,
  MapPin,
  RefreshCw,
  StickyNote,
  Video,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@ai-matrx/design-system";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { ConnectorPromptHost } from "@/features/connectors/ConnectorPromptHost";
import { useOpenDetail } from "@/lib/detail/useOpenDetail";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { extractErrorMessage } from "@/utils/errors";

import {
  CALENDAR_EVENT_TYPE,
  attendeesOf,
  eventTimeText,
  googleCalendarHref,
  rsvpDotClass,
  rsvpLabel,
} from "./record";
import { createNoteAboutEvent } from "./service";
import { useAgenda, type AgendaValue } from "./useAgenda";
import type { AttendeePerson, CalendarEventRow } from "./types";

export interface AgendaPanelProps {
  /** The heading. Absent on a surface whose own chrome already names it. */
  title?: string;
  /** Only events with an attendee at one of these addresses ("with this person"). */
  partyEmailKeys?: readonly string[] | null;
  /** The panel is the chrome itself (a window body) — no card border of its own. */
  variant?: "card" | "bare";
  className?: string;
  /** Skip the refresh-on-open Google call. */
  refreshOnOpen?: boolean;
}

export function AgendaPanel({
  title = "Agenda",
  partyEmailKeys = null,
  variant = "card",
  className,
  refreshOnOpen,
}: AgendaPanelProps) {
  const agenda = useAgenda({ partyEmailKeys, refreshOnOpen });

  return (
    <section
      className={cn(
        variant === "card" && "rounded-md border border-border bg-card",
        "flex min-h-0 flex-col",
        className,
      )}
    >
      <header className="flex min-h-9 flex-wrap items-center gap-x-2 gap-y-1 border-b border-border px-2.5 py-1.5">
        <CalendarDays className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <h3 className="min-w-0 text-xs font-semibold uppercase tracking-wider text-foreground">
          {title}
        </h3>
        <span className="truncate text-xs text-muted-foreground">{agenda.freshness}</span>
        <div className="ml-auto flex items-center gap-1">
          {agenda.connectionId ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 gap-1 px-2 text-xs max-sm:min-h-11"
              onClick={() => void agenda.refresh()}
              disabled={agenda.isRefreshing}
            >
              <RefreshCw
                className={cn("h-3.5 w-3.5", agenda.isRefreshing && "animate-spin")}
              />
              {agenda.isRefreshing ? "Refreshing" : "Refresh"}
            </Button>
          ) : null}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-2.5">
        <AgendaBody agenda={agenda} />
      </div>
    </section>
  );
}

function AgendaBody({ agenda }: { agenda: AgendaValue }) {
  const hasEvents =
    agenda.groups.some((group) => group.events.length > 0) || agenda.undated.length > 0;

  return (
    <div className="space-y-3">
      {agenda.problems.map((problem) => (
        <p
          key={problem}
          className="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-xs text-foreground"
        >
          {problem}
        </p>
      ))}

      {/* The product's own truth, from the ONE reader every connector surface
          uses — never a second opinion about the same grant. */}
      {agenda.productHealth && agenda.productHealth.state !== "connected" ? (
        <p className="rounded border border-border bg-muted/40 px-2 py-1.5 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">
            Google Calendar — {agenda.productHealth.label}.
          </span>{" "}
          {agenda.productHealth.reason}
          {agenda.productHealth.remedy ? ` ${agenda.productHealth.remedy}` : ""}
        </p>
      ) : null}

      {agenda.usingDefaultKnobs ? (
        <p className="text-xs text-muted-foreground">
          Showing the next {agenda.days} days on this platform&apos;s default setting — no
          administrator has chosen a window for your organization yet.
        </p>
      ) : null}

      {/* No Google account at all: the ONE connector prompt card, which renders
          nothing once something is connected. Never a second card of our own. */}
      {agenda.noAccount ? <ConnectorPromptHost variant="bare" /> : null}

      {agenda.isLoading ? (
        <div className="space-y-2" aria-label="Reading your agenda">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : (
        <>
          {agenda.groups.map((group) => (
            <div key={group.key} className="space-y-1">
              <div className="flex items-baseline gap-2">
                <h4 className="text-xs font-semibold text-foreground">{group.label}</h4>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {group.events.length}
                </span>
              </div>
              {group.events.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nothing on your calendar.</p>
              ) : (
                <ul className="space-y-1">
                  {group.events.map((event) => (
                    <AgendaEventRow
                      key={event.id}
                      event={event}
                      people={agenda.peopleByEvent.get(event.id) ?? []}
                      timeZone={agenda.timeZone}
                      onChanged={agenda.reload}
                    />
                  ))}
                </ul>
              )}
            </div>
          ))}

          {agenda.undated.length > 0 ? (
            <div className="space-y-1">
              <h4 className="text-xs font-semibold text-foreground">
                Without a time from Google
              </h4>
              <ul className="space-y-1">
                {agenda.undated.map((event) => (
                  <AgendaEventRow
                    key={event.id}
                    event={event}
                    people={agenda.peopleByEvent.get(event.id) ?? []}
                    timeZone={agenda.timeZone}
                    onChanged={agenda.reload}
                  />
                ))}
              </ul>
            </div>
          ) : null}

          {!hasEvents && !agenda.noAccount && agenda.problems.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {agenda.connectionId
                ? `Your Google Calendar is connected and there is nothing on it in the next ${agenda.days} days.`
                : "No Google account here can show a calendar yet."}
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}

function AgendaEventRow({
  event,
  people,
  timeZone,
  onChanged,
}: {
  event: CalendarEventRow;
  people: AttendeePerson[];
  timeZone: string;
  onChanged: () => void;
}) {
  const openDetail = useOpenDetail(CALENDAR_EVENT_TYPE);
  const organizationId = useAppSelector(selectOrganizationId);
  const [savingNote, setSavingNote] = useState(false);
  const attendees = attendeesOf(event.attendees);
  const googleHref = googleCalendarHref(event);

  const createNote = async () => {
    if (!organizationId) {
      toast.error("Choose an organization before creating a note.");
      return;
    }
    setSavingNote(true);
    try {
      const result = await createNoteAboutEvent({
        event,
        organizationId,
        partyIds: people.map((person) => person.partyId),
      });
      // HONEST ABOUT WHAT LANDED: the note always exists here; a link that did
      // not land is named, never folded into a cheerful "Note created".
      if (result.failures.length === 0) {
        toast.success(
          people.length > 0
            ? `Note created, linked to this event and ${people.length === 1 ? "1 person" : `${people.length} people`}.`
            : "Note created and linked to this event.",
        );
      } else {
        toast.error(result.failures.join(" "));
      }
      onChanged();
    } catch (error: unknown) {
      toast.error(`The note could not be created: ${extractErrorMessage(error)}`);
    } finally {
      setSavingNote(false);
    }
  };

  return (
    <li className="rounded border border-border/60 bg-background px-2 py-1.5">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {eventTimeText(event, timeZone)}
        </span>
        {/* THE DOOR LAW: the event is a Record, so its name opens it — in place,
            through the ONE opener (window by default, per the person's setting). */}
        <EntityRef
          token={CALENDAR_EVENT_TYPE}
          id={event.id}
          name={event.title}
          showIcon={false}
          fill
          wrap
          labelClassName="text-sm font-medium text-foreground"
          onOpen={() => {
            void openDetail({ type: CALENDAR_EVENT_TYPE, id: event.id, seed: { name: event.title } });
          }}
        />
      </div>

      {event.location ? (
        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
          <MapPin className="h-3 w-3 shrink-0" />
          <span className="min-w-0 break-words">{event.location}</span>
        </p>
      ) : null}

      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
        {event.meeting_url ? (
          <a
            href={event.meeting_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline max-sm:min-h-11"
          >
            <Video className="h-3.5 w-3.5" />
            Join the meeting
          </a>
        ) : null}
        {googleHref ? (
          <a
            href={googleHref}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline max-sm:min-h-11"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Open in Google Calendar
          </a>
        ) : null}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-6 gap-1 px-1.5 text-xs max-sm:min-h-11"
          onClick={() => void createNote()}
          disabled={savingNote}
        >
          <StickyNote className="h-3.5 w-3.5" />
          {savingNote ? "Creating a note" : "Create a note"}
        </Button>
      </div>

      {attendees.length > 0 ? (
        <AttendeeLine attendees={attendees} people={people} />
      ) : null}
    </li>
  );
}

function AttendeeLine({
  attendees,
  people,
}: {
  attendees: ReturnType<typeof attendeesOf>;
  people: AttendeePerson[];
}) {
  const openDetail = useOpenDetail("party");
  // Matched by ADDRESS, which is the fact the service carries — never by name,
  // which two different people can share.
  const byEmail = new Map(
    people.filter((person) => person.email).map((person) => [person.email!, person]),
  );
  // A Person the server linked whose stored address is no longer on the event
  // still gets a door — the link is the fact — it is simply listed after the dots
  // instead of beside one.
  const unplaced = people.filter((person) => !person.email || !byEmail.has(person.email));

  return (
    <ul className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
      {attendees.map((attendee) => {
        const person = byEmail.get(attendee.email) ?? null;
        return (
          <li key={attendee.email} className="flex items-center gap-1">
            <span
              className={cn("h-1.5 w-1.5 shrink-0 rounded-full", rsvpDotClass(attendee.rsvp))}
              // The dot is never the only carrier of the state — colour alone is
              // not information a person can rely on.
              title={`${attendee.displayName ?? attendee.email}: ${rsvpLabel(attendee.rsvp)}`}
              aria-label={`${attendee.displayName ?? attendee.email}: ${rsvpLabel(attendee.rsvp)}`}
            />
            {person ? (
              <EntityRef
                token="party"
                id={person.partyId}
                name={person.displayName ?? attendee.email}
                showIcon={false}
                labelClassName="text-xs"
                onOpen={() => {
                  void openDetail({
                    type: "party",
                    id: person.partyId,
                    seed: { name: person.displayName },
                  });
                }}
              />
            ) : (
              <span className="text-xs text-muted-foreground">
                {attendee.displayName ?? attendee.email}
              </span>
            )}
          </li>
        );
      })}
      {unplaced.map((person) => (
        <li key={person.partyId} className="flex items-center gap-1">
          <EntityRef
            token="party"
            id={person.partyId}
            name={person.displayName ?? person.partyId}
            showIcon={false}
            labelClassName="text-xs"
            onOpen={() => {
              void openDetail({
                type: "party",
                id: person.partyId,
                seed: { name: person.displayName },
              });
            }}
          />
        </li>
      ))}
    </ul>
  );
}

export default AgendaPanel;
