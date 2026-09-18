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
  Lock,
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
import { OrganizationRequiredNotice } from "@/features/organizations/components/OrganizationRequiredNotice";
import { useOpenDetail } from "@/lib/detail/useOpenDetail";
import { awaitEffectiveOrganizationId } from "@/features/organizations/awaitWorkspace";
import { extractErrorMessage } from "@/utils/errors";

import {
  CALENDAR_EVENT_TYPE,
  attendeesOf,
  eventTimeText,
  frozenEventNotice,
  googleCalendarHref,
  resolveAttendeePeople,
  rsvpDotClass,
  rsvpLabel,
  sharedAddressSentence,
} from "./record";
import { OpenItemsCount } from "./OpenItemsCount";
import { createNoteAboutEvent } from "./service";
import { useAgenda, type AgendaValue } from "./useAgenda";
import type { AttendeePerson, CalendarEventRow } from "./types";

export interface AgendaPanelProps {
  /** The heading. Absent on a surface whose own chrome already names it. */
  title?: string;
  /** Only events with an attendee at one of these addresses ("with this person"). */
  partyEmailKeys?: readonly string[] | null;
  /**
   * Who the list is filtered TO, in the person's own words — used by the empty
   * sentences, which must never borrow the unfiltered ones (N5).
   */
  filterLabel?: string | null;
  /** The panel is the chrome itself (a window body) — no card border of its own. */
  variant?: "card" | "bare";
  className?: string;
  /** Skip the refresh-on-open Google call. */
  refreshOnOpen?: boolean;
}

export function AgendaPanel({
  title = "Agenda",
  partyEmailKeys = null,
  filterLabel = null,
  variant = "card",
  className,
  refreshOnOpen,
}: AgendaPanelProps) {
  const agenda = useAgenda({ partyEmailKeys, refreshOnOpen });
  // 🚨 N5 — A FILTERED LIST NEVER BORROWS THE UNFILTERED EMPTY SENTENCE. The body
  // is TOLD it is filtered; it cannot infer it, and inferring is exactly how
  // "Your Google Calendar is connected and there is nothing on it" ended up on a
  // Person card belonging to a person with a full calendar.
  const filter: AgendaFilter | null = partyEmailKeys
    ? { label: filterLabel?.trim() || "this person" }
    : null;

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
        <AgendaBody agenda={agenda} filter={filter} />
      </div>
    </section>
  );
}

/** What the list is narrowed to, when it is narrowed at all. */
interface AgendaFilter {
  /** The person's name, or "this person" when the caller could not name them. */
  label: string;
}

function AgendaBody({
  agenda,
  filter,
}: {
  agenda: AgendaValue;
  filter: AgendaFilter | null;
}) {
  const hasEvents =
    agenda.groups.some((group) => group.events.length > 0) || agenda.undated.length > 0;

  // THE HONEST TERMINAL STATE (law 4): with no organization selected,
  // `readAgendaEvents` / `refreshCalendarWindow` never ran (both fail closed on
  // `requireOrganizationContext`) — so this is checked BEFORE every other
  // branch below, which would otherwise read the empty/never-fetched state as
  // "your calendar is connected and there is nothing on it", a confident and
  // wrong claim for a person who has not picked an organization at all.
  if (agenda.organizationRequired) {
    return <OrganizationRequiredNotice compact what="Your agenda" />;
  }

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
                <p className="text-xs text-muted-foreground">
                  {filter ? `Nothing with ${filter.label}.` : "Nothing on your calendar."}
                </p>
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
              {!agenda.connectionId
                ? "No Google account here can show a calendar yet."
                : filter
                  ? `Nothing upcoming with ${filter.label} in the next ${agenda.days} days. Your calendar itself may be full — this list only shows what they are on.`
                  : `Your Google Calendar is connected and there is nothing on it in the next ${agenda.days} days.`}
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
  const openNote = useOpenDetail("note");
  const [savingNote, setSavingNote] = useState(false);
  /** The note this row just created, so it stays reachable after the toast (N10). */
  const [createdNoteId, setCreatedNoteId] = useState<string | null>(null);
  const attendees = attendeesOf(event.attendees);
  const googleHref = googleCalendarHref(event);
  // 🚨 N6 — a frozen row is MARKED. The same judgement and the same words the
  // record's own notice uses, from the one place both read (`frozenEventNotice`).
  const frozen = frozenEventNotice(event);

  const noteTitle = `Notes — ${event.title}`;
  const openCreatedNote = (noteId: string) => {
    void openNote({ type: "note", id: noteId, seed: { name: noteTitle } });
  };

  const createNote = async () => {
      // 🚨 A PRESS WAITS FOR THE ANSWER, IT NEVER REFUSES ON A RACE
      // (VERIFY-R7-FIX-WAVE NEW-1). `organization_id === null` is "boot has not
      // answered" as often as it is "you have none", and a press that reads the
      // value once refuses the first case with a sentence about the second. The
      // platform's bounded wait answers both honestly — and when it settles
      // with nothing, its own reason is the sentence, remedy included, never
      // "try again in a moment".
    const workspace = await awaitEffectiveOrganizationId();
    if (workspace.status !== "ready") {
      toast.error(workspace.reason);
      return;
    }
    setSavingNote(true);
    try {
      const result = await createNoteAboutEvent({
        event,
        organizationId: workspace.organizationId,
        partyIds: people.map((person) => person.partyId),
      });
      setCreatedNoteId(result.noteId);
      // 🚨 N10 — NO DEAD ENDS: the note it just created OPENS, from the toast and
      // from the row itself (the toast expires; the record does not).
      const door = {
        action: {
          label: "Open the note",
          onClick: () => openCreatedNote(result.noteId),
        },
      };
      // HONEST ABOUT WHAT LANDED: the note always exists here; a link that did
      // not land is named, never folded into a cheerful "Note created".
      if (result.failures.length === 0) {
        toast.success(
          people.length > 0
            ? `Note created, linked to this event and ${people.length === 1 ? "1 person" : `${people.length} people`}.`
            : "Note created and linked to this event.",
          door,
        );
      } else {
        toast.error(result.failures.join(" "), door);
      }
      onChanged();
    } catch (error: unknown) {
      toast.error(`The note could not be created: ${extractErrorMessage(error)}`);
    } finally {
      setSavingNote(false);
    }
  };

  return (
    <li
      className={cn(
        "rounded border px-2 py-1.5",
        frozen ? "border-dashed border-border bg-muted/40" : "border-border/60 bg-background",
      )}
      data-agenda-event={event.id}
      {...(frozen ? { "data-agenda-frozen": frozen.status } : {})}
    >
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

      {/* A frozen row says so IN THE LIST, not only on its record: the header
          above says "Refreshed … from Google", and a row that stopped refreshing
          sitting silently beside live ones is that sentence made false. */}
      {frozen ? (
        <p className="mt-0.5 flex items-start gap-1 text-xs text-muted-foreground">
          <Lock className="mt-0.5 h-3 w-3 shrink-0" />
          <span className="min-w-0 break-words">
            <span className="font-medium text-foreground">{frozen.label}</span> —{" "}
            {frozen.sentence}
          </span>
        </p>
      ) : null}

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
          data-agenda-create-note
        >
          <StickyNote className="h-3.5 w-3.5" />
          {savingNote ? "Creating a note" : createdNoteId ? "Create another note" : "Create a note"}
        </Button>
        {createdNoteId ? (
          <button
            type="button"
            onClick={() => openCreatedNote(createdNoteId)}
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline max-sm:min-h-11"
            data-agenda-note-door={createdNoteId}
          >
            <StickyNote className="h-3.5 w-3.5" />
            Open the note
          </button>
        ) : null}
      </div>

      {attendees.length > 0 ? (
        <AttendeeLine attendees={attendees} people={people} />
      ) : null}
    </li>
  );
}

function PersonDoor({
  person,
  fallbackLabel,
  onOpen,
}: {
  person: AttendeePerson;
  fallbackLabel: string;
  onOpen: (person: AttendeePerson) => void;
}) {
  return (
    <span className="inline-flex items-center gap-1">
      <EntityRef
        token="party"
        id={person.partyId}
        name={person.displayName ?? fallbackLabel}
        showIcon={false}
        labelClassName="text-xs"
        onOpen={() => onOpen(person)}
      />
      {/* 🚨 N4 — THE NAME AND THE COUNT, the same count the event's Detail shows,
          from the same component. A name alone is the reason for putting People
          on an agenda, removed. */}
      <OpenItemsCount partyId={person.partyId} />
    </span>
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
  // 🚨 N3 — ONE RESOLVER, ONE-TO-MANY. Two Persons at one address are two doors;
  // the Map-keyed-on-the-address version that used to live here (and in
  // `CalendarEventSections.tsx`) kept the last one and dropped the other with no
  // word on screen. The resolver is pure and shared, so neither surface can hold
  // a private opinion about who is on an event.
  const index = resolveAttendeePeople(attendees, people);
  const open = (person: AttendeePerson) => {
    void openDetail({
      type: "party",
      id: person.partyId,
      seed: { name: person.displayName },
    });
  };

  return (
    <ul className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
      {index.matches.map(({ attendee, people: matched }) => (
        <li key={attendee.email} className="flex flex-wrap items-center gap-1">
          <span
            className={cn("h-1.5 w-1.5 shrink-0 rounded-full", rsvpDotClass(attendee.rsvp))}
            // The dot is never the only carrier of the state — colour alone is
            // not information a person can rely on.
            title={`${attendee.displayName ?? attendee.email}: ${rsvpLabel(attendee.rsvp)}`}
            aria-label={`${attendee.displayName ?? attendee.email}: ${rsvpLabel(attendee.rsvp)}`}
          />
          {matched.length === 0 ? (
            <span className="text-xs text-muted-foreground">
              {attendee.displayName ?? attendee.email}
            </span>
          ) : (
            matched.map((person) => (
              <PersonDoor
                key={person.partyId}
                person={person}
                fallbackLabel={attendee.email}
                onOpen={open}
              />
            ))
          )}
          {/* Several People at one address is ordinary (a shared inbox, a role
              address, a duplicated contact) — and it is SAID, so a person is not
              left wondering why one address shows two names. */}
          {matched.length > 1 ? (
            <span className="text-xs text-muted-foreground">
              {sharedAddressSentence(matched.length)}
            </span>
          ) : null}
        </li>
      ))}
      {/* A Person the server linked whose stored address is no longer on the
          event still gets a door — the link is the fact — listed after the dots
          instead of beside one. */}
      {index.unplaced.map((person) => (
        <li key={person.partyId} className="flex items-center gap-1">
          <PersonDoor person={person} fallbackLabel={person.partyId} onOpen={open} />
        </li>
      ))}
    </ul>
  );
}

export default AgendaPanel;
