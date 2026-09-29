"use client";

// features/meet/components/manage/MeetingsHome.tsx
//
// /meetings — Google Calendar's agenda + Zoom's Meetings page, in one list.
//
//   Upcoming   every occurrence (a series expanded by the database, moved and
//              cancelled ones marked), grouped by the day it falls on in the
//              VIEWER's zone, with the zone named; instant meetings happening
//              now at the top.
//   Past       meetings that ended, or one-offs whose time went by — each opens
//              its record.
//   Cancelled  cancelled meetings (the link still says so).
//   Archived   archived meetings, restorable.
//
// Tabs live in the shell header (RouteModeNav, `?tab=`); search and "whose
// meetings" share ONE toolbar row with the zone label. Every row: click opens the
// meeting's page; Join/Start is the row's button when it is on or about to be;
// everything else is in the row's "…" menu.

import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { useEffect, useState, useTransition } from "react";
import { useViewerTimeZone } from "@/hooks/useViewerTimeZone";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Archive,
  CalendarDays,
  CalendarPlus,
  Crown,
  ExternalLink,
  Film,
  History,
  MoreHorizontal,
  Repeat,
  Search,
  Video,
  XCircle,
} from "lucide-react";
import {
  useMeetHost,
  type MeetingRecord,
  type UpcomingOccurrence,
} from "@ai-matrx/meet/react";
import { TapTargetButton, TapTargetButtonSolid } from "@ai-matrx/tap-target";
import { Input } from "@ai-matrx/design-system";
import { Skeleton } from "@ai-matrx/design-system";
import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { RouteModeNav } from "@/features/shell/components/header/RouteModeNav";
import { IntelligenceIndicator } from "@/features/mandates/feature-intelligence/IntelligenceIndicator";
import { MEET_PLACES } from "@/features/meet/intelligence-places";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useOpenItemPresentation } from "@/features/item-presentation/useOpenItemPresentation";
import { useMeetPlanningKnobs } from "@/features/meet/hooks/useMeetPlanningKnobs";
import { useExternalEvents } from "@/features/meet/hooks/useExternalEvents";
import {
  PROVIDER_LABELS,
  agendaExternalEvents,
  noteTakerLine,
  prefillGuests,
  type ExternalEvent,
} from "@/features/meet/lib/external-events";
import { utcToZoned } from "@/features/meet/lib/zoned-time";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { ensureOrganizationContext } from "@/lib/organization/organization-gate";
import { toast } from "@/lib/toast";
import {
  isLiveInstant,
  isPast,
  useMeetingsDirectory,
} from "@/features/meet/hooks/useMeetingsDirectory";
import {
  errorSentence,
  useMeetingActions,
} from "@/features/meet/hooks/useMeetingActions";
import {
  groupByDay,
  isLive,
  matchesQuery,
  startsSoon,
  upcomingRows,
  type AgendaScope,
} from "@/features/meet/lib/agenda";
import { describeRecurrence } from "@/features/meet/lib/recurrence";
import {
  formatClock,
  formatLongDate,
  formatTimeRange,
  zoneAbbreviation,
  zoneLabel,
} from "@/features/meet/lib/zoned-time";
import { MeetingRowMenu } from "@/features/meet/components/manage/MeetingRowMenu";
import { RecordingsLibrary } from "@/features/meet/components/record/RecordingsLibrary";
import { MeetingContentSearch } from "@/features/meet/components/record/MeetingContentSearch";
import { MeetingFormDialog } from "@/features/meet/components/manage/MeetingFormDialog";
import { RsvpBadge } from "@/features/meet/components/manage/RsvpControl";
import {
  meetingHref,
  useMeetingActionHost,
} from "@/features/meet/components/manage/useMeetingActionHost";
import type {
  MeetingPrefill,
  OccurrenceRef,
} from "@/features/meet/components/manage/MeetingFormDialog";

/** One Upcoming row: an AI Matrx occurrence, or an event from the person's other calendar. */
type AgendaRow =
  | { kind: "meeting"; occurrenceStart: string; item: UpcomingOccurrence }
  | { kind: "external"; occurrenceStart: string; event: ExternalEvent };

const SOURCE_LABELS: Record<string, string> = {
  google: "Google Calendar",
  microsoft: "Outlook",
  outlook: "Outlook",
};

const MEETING_JOBS = MEET_PLACES.places.flatMap((place) => place.mandateKeys);

type Tab = "upcoming" | "past" | "recordings" | "cancelled" | "archived";
const TABS: { tab: Tab; name: string; icon: typeof CalendarDays }[] = [
  { tab: "upcoming", name: "Upcoming", icon: CalendarDays },
  { tab: "past", name: "Past", icon: History },
  { tab: "recordings", name: "Recordings", icon: Film },
  { tab: "cancelled", name: "Cancelled", icon: XCircle },
  { tab: "archived", name: "Archived", icon: Archive },
];

function tabOf(value: string | null): Tab {
  return TABS.some((t) => t.tab === value) ? (value as Tab) : "upcoming";
}

function roleWord(role: "host" | "cohost" | "invitee" | null | undefined) {
  if (role === "host") return null;
  if (role === "cohost") {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs text-primary">
        <Crown className="h-3 w-3" aria-hidden="true" /> Co-host
      </span>
    );
  }
  return null;
}

export function MeetingsHome() {
  const router = useRouter();
  const params = useSearchParams();
  const tab = tabOf(params.get("tab"));
  const host = useMeetHost();
  const directory = useMeetingsDirectory();
  const actions = useMeetingActions();
  const { run, dialogs } = useMeetingActionHost({
    onChanged: directory.reload,
  });
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<AgendaScope>("mine");
  const [creating, setCreating] = useState(false);
  const [prefill, setPrefill] = useState<MeetingPrefill | undefined>(undefined);
  const planning = useMeetPlanningKnobs(
    actions.organizationId,
    directory.userId,
  );
  const external = useExternalEvents(
    directory.userId,
    planning.loaded && planning.showExternalEvents,
  );
  const openItem = useOpenItemPresentation();
  const [starting, setStarting] = useState(false);
  // Hydration-safe (React #418): never read the browser zone during render.
  const zone = useViewerTimeZone();
  const [now, setNow] = useState(() => new Date());
  const [, startTransition] = useTransition();

  // "Live" and "starts soon" move with the clock.
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const meetingsById = new Map(
    directory.meetings.map((m) => [m.id as string, m]),
  );

  // Scheduling needs an organization (a meeting belongs to one). With none
  // chosen the organization picker opens, and the action continues once set.
  const [held, setHeld] = useState<"create" | "start" | null>(null);
  const createFromEvent = (event: ExternalEvent) => {
    const at = utcToZoned(event.occurrenceStart, zone);
    setPrefill({
      patch: {
        title: event.title,
        date: at.date,
        time: at.time,
        timeZone: zone,
        durationMinutes: event.durationMinutes,
        invitees: prefillGuests(event).map((g) => ({
          key: g.email,
          inviteeId: null,
          userId: null,
          email: g.email,
          displayName: g.name,
          cohost: false,
        })),
      },
    });
    void withOrganization("create", true);
  };
  const toggleExternal = async (show: boolean) => {
    try {
      const targetOrganizationId =
        actions.organizationId ?? (await ensureOrganizationContext());
      await planning.setShowExternalEvents(show, targetOrganizationId);
    } catch (thrown) {
      toast.error(errorSentence(thrown));
    }
  };

  const withOrganization = async (
    what: "create" | "start",
    keepPrefill = false,
  ) => {
    if (what === "create" && !keepPrefill) setPrefill(undefined);
    if (actions.ready) {
      if (what === "create") setCreating(true);
      else void startNow();
      return;
    }
    setHeld(what);
    try {
      await ensureOrganizationContext();
    } catch {
      setHeld(null);
    }
  };
  useEffect(() => {
    if (!actions.ready || held === null) return;
    setHeld(null);
    if (held === "create") setCreating(true);
    else void startNow();
  }, [actions.ready, held]);

  const startNow = async () => {
    if (starting) return;
    setStarting(true);
    try {
      const name = host?.identity.displayName?.trim();
      const meeting = await actions.startInstant(
        name ? `${name}'s meeting` : "Instant meeting",
      );
      window.location.assign(`/meet/${meeting.slug}`);
    } catch (thrown) {
      toast.error(errorSentence(thrown));
      setStarting(false);
    }
  };

  const header = (
    <RouteHeader
      left={
        <span className="flex min-w-0 items-center gap-1.5 px-1.5">
          <Video
            className="h-4 w-4 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          <span className="truncate text-sm font-medium text-foreground">
            Meetings
          </span>
          <IntelligenceIndicator
            feature="meet"
            mandateKeys={MEETING_JOBS}
            label="The AI jobs in every meeting (live notes, answers, the wrap-up)"
          />
        </span>
      }
      center={
        <RouteModeNav
          items={TABS.map((t) => ({
            name: t.name,
            href: `/meetings?tab=${t.tab}`,
            icon: t.icon,
          }))}
          activeHref={`/meetings?tab=${tab}`}
        />
      }
      right={
        directory.userId !== null ? (
          <>
            <TapTargetButton
              icon={<Video className="h-4 w-4" />}
              label="Start now"
              ariaLabel="Start an instant meeting now"
              onClick={() => void withOrganization("start")}
              disabled={starting}
            />
            <TapTargetButtonSolid
              icon={<CalendarPlus className="h-4 w-4" />}
              label="New meeting"
              ariaLabel="Schedule a new meeting"
              onClick={() => void withOrganization("create")}
            />
          </>
        ) : null
      }
    />
  );

  const openOccurrence = (item: UpcomingOccurrence) => {
    const ref: OccurrenceRef = {
      originalStart: item.originalStart,
      occurrenceStart: item.occurrenceStart,
      durationMinutes: item.durationMinutes,
    };
    startTransition(() =>
      router.push(meetingHref({ id: item.meetingId }, ref)),
    );
  };

  const upcoming = upcomingRows(directory.occurrences, { scope, query, now });
  const listedSlugs = new Set(directory.meetings.map((m) => m.slug));
  const externalRows =
    planning.loaded && planning.showExternalEvents && scope === "mine"
      ? agendaExternalEvents(external.events, { now, query, listedSlugs })
      : [];
  const agendaRows: AgendaRow[] = [
    ...upcoming.map((item) => ({
      kind: "meeting" as const,
      occurrenceStart: item.occurrenceStart,
      item,
    })),
    ...externalRows.map((event) => ({
      kind: "external" as const,
      occurrenceStart: event.occurrenceStart,
      event,
    })),
  ];
  const liveInstants = directory.meetings.filter(
    (m) =>
      isLiveInstant(m, now) &&
      matchesQuery(m.title, query) &&
      scopeAllows(directory.roles.get(m.id), scope),
  );
  const listed = directory.meetings.filter((m) => {
    if (
      !matchesQuery(m.title, query) ||
      !scopeAllows(directory.roles.get(m.id), scope)
    )
      return false;
    if (tab === "past") return isPast(m, now);
    if (tab === "cancelled") return !!m.cancelledAt && !m.deletedAt;
    if (tab === "archived") return !!m.deletedAt;
    return false;
  });

  return (
    <>
      {header}
      <div className="h-full overflow-y-auto bg-textured pt-[var(--shell-header-h)]">
        <div className="mx-auto max-w-4xl px-3 pb-10 sm:px-6">
          <div className="sticky top-0 z-10 -mx-3 flex flex-wrap items-center gap-2 bg-textured/95 px-3 py-2 backdrop-blur sm:-mx-6 sm:px-6">
            <div className="relative min-w-0 basis-full sm:max-w-xs sm:flex-1 sm:basis-auto">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search meetings"
                aria-label="Search meetings"
                className="h-8 pl-8"
              />
            </div>
            {tab !== "recordings" ? (
              <Select
                value={scope}
                onValueChange={(v) => setScope(v as AgendaScope)}
              >
                <SelectTrigger className="h-8 w-40" aria-label="Whose meetings">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mine">All my meetings</SelectItem>
                  <SelectItem value="hosting">Hosting</SelectItem>
                  <SelectItem value="invited">Invited to</SelectItem>
                </SelectContent>
              </Select>
            ) : null}
            {tab === "upcoming" && planning.loaded ? (
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Switch
                  checked={planning.showExternalEvents}
                  onCheckedChange={(v) => void toggleExternal(v)}
                  aria-label="Show calendar events"
                  className="scale-90"
                />
                Calendar events
              </label>
            ) : null}
            <span
              className="ml-auto text-xs text-muted-foreground"
              title={zone}
            >
              Times in {zoneLabel(zone)}
            </span>
          </div>

          {tab === "recordings" ? (
            <RecordingsLibrary query={query} />
          ) : directory.failure !== null ? (
            <div
              role="alert"
              className="mt-6 rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm"
            >
              <p className="font-medium">Your meetings could not be listed.</p>
              <p className="mt-1 text-muted-foreground">
                {directory.failure}
                <ErrorAlchemyMenu error={directory.failure} size="xs" />
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={directory.reload}
              >
                Try again
              </Button>
            </div>
          ) : tab === "upcoming" && planning.failure !== null ? (
            <div
              role="alert"
              className="mt-6 rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm"
            >
              <p className="font-medium">
                Your calendar settings could not be loaded.
              </p>
              <p className="mt-1 text-muted-foreground">
                {planning.failure}
                <ErrorAlchemyMenu error={planning.failure} size="xs" />
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={planning.retry}
              >
                Try again
              </Button>
            </div>
          ) : tab === "upcoming" && external.failure !== null ? (
            <div
              role="alert"
              className="mt-6 rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm"
            >
              <p className="font-medium">
                Your calendar events could not be listed.
              </p>
              <p className="mt-1 text-muted-foreground">
                {external.failure}
                <ErrorAlchemyMenu error={external.failure} size="xs" />
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={external.retry}
              >
                Try again
              </Button>
            </div>
          ) : directory.loading && directory.meetings.length === 0 ? (
            <div
              className="mt-4 space-y-2"
              aria-busy="true"
              aria-label="Loading your meetings"
            >
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : tab === "upcoming" ? (
            <UpcomingList
              days={groupByDay(agendaRows, zone, now)}
              onOpenEvent={(event) =>
                void openItem("calendar_event", event.id, { name: event.title })
              }
              onCreateFromEvent={createFromEvent}
              onHideEvents={() => void toggleExternal(false)}
              liveInstants={liveInstants}
              zone={zone}
              now={now}
              meetingsById={meetingsById}
              roles={directory.roles}
              onOpen={openOccurrence}
              onOpenMeeting={(m) =>
                startTransition(() => router.push(meetingHref(m)))
              }
              run={run}
              onCreate={() => void withOrganization("create")}
              searching={query.trim() !== "" || scope !== "mine"}
            />
          ) : query.trim() !== "" && listed.length === 0 ? (
            <p className="mt-6 text-center text-sm text-muted-foreground">
              No meeting titles here match “{query.trim()}”.
            </p>
          ) : (
            <MeetingList
              tab={tab}
              meetings={listed}
              zone={zone}
              roles={directory.roles}
              onOpen={(m) => startTransition(() => router.push(meetingHref(m)))}
              run={run}
            />
          )}
          {tab !== "recordings" ? <MeetingContentSearch query={query} /> : null}
        </div>
      </div>

      {creating ? (
        <MeetingFormDialog
          open
          onOpenChange={setCreating}
          mode={{ kind: "create", prefill }}
          onSaved={(meeting) => {
            directory.reload();
            startTransition(() => router.push(meetingHref(meeting)));
          }}
        />
      ) : null}
      {dialogs}
    </>
  );
}

function scopeAllows(
  role: "host" | "cohost" | "invitee" | undefined,
  scope: AgendaScope,
): boolean {
  if (role === undefined) return false;
  if (scope === "hosting") return role !== "invitee";
  if (scope === "invited") return role === "invitee";
  return true;
}

type Run = ReturnType<typeof useMeetingActionHost>["run"];

function UpcomingList({
  days,
  onOpenEvent,
  onCreateFromEvent,
  onHideEvents,
  liveInstants,
  zone,
  now,
  meetingsById,
  roles,
  onOpen,
  onOpenMeeting,
  run,
  onCreate,
  searching,
}: {
  days: ReturnType<typeof groupByDay<AgendaRow>>;
  onOpenEvent: (event: ExternalEvent) => void;
  onCreateFromEvent: (event: ExternalEvent) => void;
  onHideEvents: () => void;
  liveInstants: readonly MeetingRecord[];
  zone: string;
  now: Date;
  meetingsById: Map<string, MeetingRecord>;
  roles: ReadonlyMap<string, "host" | "cohost" | "invitee">;
  onOpen: (item: UpcomingOccurrence) => void;
  onOpenMeeting: (meeting: MeetingRecord) => void;
  run: Run;
  onCreate: () => void;
  searching: boolean;
}) {
  if (days.length === 0 && liveInstants.length === 0) {
    return (
      <div className="mt-16 flex flex-col items-center text-center">
        <CalendarDays
          className="h-8 w-8 text-muted-foreground"
          aria-hidden="true"
        />
        <p className="mt-3 text-sm font-medium">
          {searching
            ? "No upcoming meetings match."
            : "Nothing on your calendar."}
        </p>
        {searching ? null : (
          <>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              Schedule one and invite people, or start one now and send the
              link.
            </p>
            <Button className="mt-4 gap-1.5" onClick={onCreate}>
              <CalendarPlus className="h-4 w-4" aria-hidden="true" /> New
              meeting
            </Button>
          </>
        )}
      </div>
    );
  }
  return (
    <div className="mt-2 space-y-5">
      {liveInstants.length > 0 ? (
        <section aria-label="Happening now">
          <h2 className="px-1 pb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Happening now
          </h2>
          <ul className="overflow-hidden rounded-lg border border-border bg-card">
            {liveInstants.map((meeting) => (
              <li key={meeting.id}>
                <Row
                  onOpen={() => onOpenMeeting(meeting)}
                  time={
                    <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
                      Live
                    </span>
                  }
                  title={meeting.title}
                  meta={
                    meeting.startedAt
                      ? `Started ${formatClock(meeting.startedAt, zone)} ${zoneAbbreviation(meeting.startedAt, zone)}`
                      : "Instant meeting"
                  }
                  primary={{
                    label: roles.get(meeting.id) === "host" ? "Rejoin" : "Join",
                    onClick: () => void run("join", meeting),
                  }}
                  menu={
                    <MeetingRowMenu
                      meeting={meeting}
                      canManage={roles.get(meeting.id) !== "invitee"}
                      isHost={roles.get(meeting.id) === "host"}
                      isInvitee={roles.get(meeting.id) === "invitee"}
                      onAction={(a) => void run(a, meeting)}
                    />
                  }
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {days.map((day) => (
        <section key={day.key} aria-label={day.label}>
          <h2 className="flex items-baseline gap-2 px-1 pb-1.5">
            <span className="text-sm font-semibold">{day.label}</span>
            {day.label === "Today" || day.label === "Tomorrow" ? (
              <span className="text-xs text-muted-foreground">
                {formatLongDate(day.items[0]!.occurrenceStart, zone)}
              </span>
            ) : null}
          </h2>
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
            {day.items.map((row) => {
              if (row.kind === "external") {
                return (
                  <li key={`ext:${row.event.id}:${row.occurrenceStart}`}>
                    <ExternalEventRow
                      event={row.event}
                      zone={zone}
                      now={now}
                      onOpen={() => onOpenEvent(row.event)}
                      onCreate={() => onCreateFromEvent(row.event)}
                      onHide={onHideEvents}
                    />
                  </li>
                );
              }
              const item = row.item;
              const meeting = meetingsById.get(item.meetingId);
              const cancelledOne = item.state === "cancelled";
              const live = !cancelledOne && isLive(item, now);
              const soon = !cancelledOne && startsSoon(item, now);
              const ref: OccurrenceRef = {
                originalStart: item.originalStart,
                occurrenceStart: item.occurrenceStart,
                durationMinutes: item.durationMinutes,
              };
              const isHostish =
                item.myRole === "host" || item.myRole === "cohost";
              const metaParts: React.ReactNode[] = [];
              if (item.kind === "recurring" && meeting?.recurrenceRule) {
                metaParts.push(
                  <span key="r" className="inline-flex items-center gap-1">
                    <Repeat className="h-3 w-3" aria-hidden="true" />
                    {describeRecurrence(meeting.recurrenceRule)}
                  </span>,
                );
              }
              if (item.state === "moved")
                metaParts.push(
                  <span key="m" className="text-amber-600 dark:text-amber-400">
                    Moved
                  </span>,
                );
              if (cancelledOne)
                metaParts.push(
                  <span key="c" className="text-destructive">
                    Cancelled
                  </span>,
                );
              const role = roleWord(item.myRole);
              if (role) metaParts.push(<span key="role">{role}</span>);
              if (item.myRole === "invitee" && item.myRsvp)
                metaParts.push(<RsvpBadge key="rsvp" state={item.myRsvp} />);
              return (
                <li key={`${item.meetingId}:${item.originalStart}`}>
                  <Row
                    onOpen={() => onOpen(item)}
                    muted={cancelledOne}
                    time={
                      <span
                        className={cn(
                          "text-sm tabular-nums",
                          cancelledOne && "line-through",
                        )}
                      >
                        {formatTimeRange(
                          item.occurrenceStart,
                          item.durationMinutes,
                          zone,
                        )}
                      </span>
                    }
                    live={live}
                    title={item.title}
                    meta={metaParts.length > 0 ? metaParts : null}
                    primary={
                      live || soon
                        ? {
                            label: isHostish ? "Start" : "Join",
                            onClick: () => meeting && void run("join", meeting),
                          }
                        : null
                    }
                    menu={
                      meeting ? (
                        <MeetingRowMenu
                          meeting={meeting}
                          canManage={isHostish}
                          isHost={item.myRole === "host"}
                          isInvitee={item.myRole === "invitee"}
                          onAction={(a) => void run(a, meeting, ref)}
                        />
                      ) : null
                    }
                  />
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

function MeetingList({
  tab,
  meetings,
  zone,
  roles,
  onOpen,
  run,
}: {
  tab: Tab;
  meetings: readonly MeetingRecord[];
  zone: string;
  roles: ReadonlyMap<string, "host" | "cohost" | "invitee">;
  onOpen: (meeting: MeetingRecord) => void;
  run: Run;
}) {
  if (meetings.length === 0) {
    const words: Record<Tab, string> = {
      upcoming: "",
      recordings: "",
      past: "No past meetings yet. After a meeting ends, its summary, decisions and transcript live here.",
      cancelled: "No cancelled meetings.",
      archived:
        "Nothing archived. Archiving a meeting takes it off your lists without losing its record.",
    };
    return (
      <p className="mt-16 text-center text-sm text-muted-foreground">
        {words[tab]}
      </p>
    );
  }
  return (
    <ul className="mt-2 divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
      {meetings.map((meeting) => {
        const when = meeting.startedAt ?? meeting.scheduledFor;
        const role = roles.get(meeting.id);
        const metaParts: React.ReactNode[] = [];
        if (meeting.recurrenceRule) {
          metaParts.push(
            <span key="r" className="inline-flex items-center gap-1">
              <Repeat className="h-3 w-3" aria-hidden="true" />
              {describeRecurrence(meeting.recurrenceRule)}
            </span>,
          );
        }
        if (tab === "cancelled" && meeting.cancellationReason)
          metaParts.push(<span key="why">“{meeting.cancellationReason}”</span>);
        const roleNode = roleWord(role);
        if (roleNode) metaParts.push(<span key="role">{roleNode}</span>);
        if (role === "invitee") metaParts.push(<span key="inv">Invited</span>);
        return (
          <li key={meeting.id}>
            <Row
              onOpen={() => onOpen(meeting)}
              muted={tab !== "past"}
              time={
                when ? (
                  <span className="text-sm tabular-nums">
                    <span className="block text-xs text-muted-foreground">
                      {new Date(when).toLocaleDateString(undefined, {
                        timeZone: zone,
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </span>
                    {formatClock(when, zone)} {zoneAbbreviation(when, zone)}
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    No time set
                  </span>
                )
              }
              title={meeting.title}
              meta={metaParts.length > 0 ? metaParts : null}
              primary={
                tab === "past"
                  ? {
                      label: "Record",
                      onClick: () => void run("join", meeting),
                    }
                  : tab === "archived" && role !== "invitee"
                    ? {
                        label: "Restore",
                        onClick: () => void run("restore", meeting),
                      }
                    : null
              }
              menu={
                <MeetingRowMenu
                  meeting={meeting}
                  canManage={role === "host" || role === "cohost"}
                  isHost={role === "host"}
                  isInvitee={role === "invitee"}
                  onAction={(a) => void run(a, meeting)}
                />
              }
            />
          </li>
        );
      })}
    </ul>
  );
}

/**
 * An event from the person's synced calendar, beside their AI Matrx meetings —
 * marked with its calendar, never mistaken for one of ours. Clicking opens the
 * calendar event; the menu says honestly what the AI note-taker can do.
 */
function ExternalEventRow({
  event,
  zone,
  now,
  onOpen,
  onCreate,
  onHide,
}: {
  event: ExternalEvent;
  zone: string;
  now: Date;
  onOpen: () => void;
  onCreate: () => void;
  onHide: () => void;
}) {
  const live = isLive(event, now);
  const soon = startsSoon(event, now);
  const hosted = event.provider !== null && event.provider !== "ai_matrx";
  const limit =
    noteTakerLine(event) ??
    "No call link — open it in AI Matrx to add the AI note-taker.";
  const openLink = () => {
    if (event.link) window.open(event.link, "_blank", "noopener,noreferrer");
  };
  return (
    <Row
      onOpen={onOpen}
      live={live}
      time={
        <span className="text-sm tabular-nums text-muted-foreground">
          {formatTimeRange(event.occurrenceStart, event.durationMinutes, zone)}
        </span>
      }
      title={event.title}
      muted
      meta={[
        <span key="src" className="inline-flex items-center gap-1">
          <CalendarDays className="h-3 w-3" aria-hidden="true" />
          {SOURCE_LABELS[event.source] ?? "Calendar"}
        </span>,
        ...(hosted
          ? [
              <span key="call" className="inline-flex items-center gap-1">
                <Video className="h-3 w-3" aria-hidden="true" />
                {PROVIDER_LABELS[event.provider!]}
              </span>,
            ]
          : []),
      ]}
      primary={
        event.link && (live || soon)
          ? { label: "Join", onClick: openLink }
          : null
      }
      menu={
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              aria-label={`More actions for ${event.title}`}
              onClick={(e) => e.stopPropagation()}
            >
              <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-72">
            {limit ? (
              <DropdownMenuLabel className="text-xs font-normal leading-snug text-muted-foreground">
                {limit}
              </DropdownMenuLabel>
            ) : null}
            <DropdownMenuItem className="gap-2" onSelect={onCreate}>
              <Video className="h-4 w-4" aria-hidden="true" />
              {hosted ? "Move to AI Matrx" : "Open in AI Matrx"}
            </DropdownMenuItem>
            {event.link ? (
              <DropdownMenuItem className="gap-2" onSelect={openLink}>
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
                Open the call link
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem className="gap-2" onSelect={onOpen}>
              <CalendarDays className="h-4 w-4" aria-hidden="true" />
              Open the calendar event
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="gap-2" onSelect={onHide}>
              Hide calendar events here
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      }
    />
  );
}

function Row({
  onOpen,
  time,
  title,
  meta,
  primary,
  menu,
  muted,
  live,
}: {
  onOpen: () => void;
  time: React.ReactNode;
  title: string;
  meta: React.ReactNode;
  primary: { label: string; onClick: () => void } | null;
  menu: React.ReactNode;
  muted?: boolean;
  live?: boolean;
}) {
  return (
    <div
      role="link"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen();
      }}
      className="group flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-accent/50 focus-visible:bg-accent/50 focus-visible:outline-none"
    >
      <div className="w-28 shrink-0 sm:w-40">
        {live ? (
          <span className="mb-0.5 flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
            <span
              className="h-1.5 w-1.5 rounded-full bg-emerald-500"
              aria-hidden="true"
            />{" "}
            Now
          </span>
        ) : null}
        {time}
      </div>
      <div className="min-w-0 flex-1">
        <div
          className={cn(
            "truncate text-sm font-medium",
            muted && "text-muted-foreground",
          )}
        >
          {title}
        </div>
        {meta ? (
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs text-muted-foreground">
            {meta}
          </div>
        ) : null}
      </div>
      {primary ? (
        <Button
          type="button"
          size="sm"
          variant={live ? "default" : "outline"}
          className="h-8 shrink-0"
          onClick={(e) => {
            e.stopPropagation();
            primary.onClick();
          }}
        >
          {primary.label}
        </Button>
      ) : null}
      <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
        {menu}
      </div>
    </div>
  );
}
