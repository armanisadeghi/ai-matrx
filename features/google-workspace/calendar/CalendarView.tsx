"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useOpenDetail } from "@/lib/detail/useOpenDetail";
import { ConnectorPromptHost } from "@/features/connectors/ConnectorPromptHost";
import { OrganizationContextNotice } from "@/features/organizations/components/OrganizationRequiredNotice";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

import {
  CALENDAR_EVENT_TYPE,
  addDaysToKey,
  dayKeyInZone,
  eventTimeText,
  frozenEventNotice,
  viewerTimeZone,
} from "./record";
import {
  calendarDayLabel,
  calendarDays,
  calendarSegments,
  dateForCalendarDay,
  positionTimedSegments,
  type CalendarViewMode,
} from "./calendarView";
import { useAgenda } from "./useAgenda";
import type { CalendarEventRow } from "./types";

const HOUR_HEIGHT = 48;

/** A read-only Day/Week calendar over the existing account-qualified event mirror. */
export function CalendarView() {
  const timeZone = viewerTimeZone();
  const [mode, setMode] = useState<CalendarViewMode>("week");
  const [startDay, setStartDay] = useState(() => dayKeyInZone(new Date(), timeZone));
  const count = mode === "day" ? 1 : 7;
  const agenda = useAgenda({
    refreshOnOpen: false,
    windowStart: dateForCalendarDay(startDay),
    windowDays: count,
  });
  const days = useMemo(() => calendarDays(startDay, count), [startDay, count]);
  const segments = useMemo(
    () => calendarSegments(agenda.events, days, agenda.timeZone),
    [agenda.events, days, agenda.timeZone],
  );
  const today = dayKeyInZone(new Date(), agenda.timeZone);
  const step = mode === "day" ? 1 : 7;

  if (agenda.organizationState === "required" || agenda.organizationState === "unavailable") {
    return <OrganizationContextNotice compact state={agenda.organizationState} what="Your calendar" />;
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col" data-calendar-view={mode}>
      <header className="flex flex-wrap items-center gap-2 border-b border-border px-2.5 py-2">
        <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-foreground">Calendar</h3>
          <p className="truncate text-xs text-muted-foreground">{agenda.freshness}</p>
        </div>
        <div className="flex items-center rounded-md border border-border p-0.5" aria-label="Calendar view">
          {(["day", "week"] as const).map((candidate) => (
            <Button
              key={candidate}
              type="button"
              size="sm"
              variant={mode === candidate ? "secondary" : "ghost"}
              className="h-7 px-2 text-xs capitalize max-sm:min-h-9"
              onClick={() => setMode(candidate)}
            >
              {candidate}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-0.5">
          <Button type="button" size="icon" variant="ghost" className="h-8 w-8" aria-label="Previous calendar period" onClick={() => setStartDay((day) => dateShift(day, -step))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button type="button" size="sm" variant="ghost" className="h-8 px-2 text-xs" onClick={() => setStartDay(today)}>Today</Button>
          <Button type="button" size="icon" variant="ghost" className="h-8 w-8" aria-label="Next calendar period" onClick={() => setStartDay((day) => dateShift(day, step))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-auto p-2.5">
        {agenda.problems.map((problem) => <p key={problem} className="mb-2 rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-xs text-foreground">{problem}<ErrorAlchemyMenu error={problem} /></p>)}
        {agenda.productHealth && agenda.productHealth.state !== "connected" ? <p className="mb-2 rounded border border-border bg-muted/40 px-2 py-1.5 text-xs text-muted-foreground"><span className="font-medium text-foreground">Google Calendar — {agenda.productHealth.label}.</span> {agenda.productHealth.reason}{agenda.productHealth.remedy ? ` ${agenda.productHealth.remedy}` : ""}</p> : null}
        {agenda.noAccount ? <ConnectorPromptHost variant="bare" /> : null}
        {agenda.isLoading ? <p className="text-sm text-muted-foreground">Reading your saved calendar…</p> : null}
        {/* read-gate-exempt: agenda.problems renders every mirror-read failure above; this copy only renders once it is empty. */}
        {!agenda.isLoading && !agenda.noAccount && segments.length === 0 && agenda.problems.length === 0 ? <p className="mb-2 text-sm text-muted-foreground">No saved events on these days.</p> : null}
        {!agenda.isLoading && !agenda.noAccount ? <CalendarGrid days={days} segments={segments} timeZone={agenda.timeZone} today={today} /> : null}
      </div>
    </section>
  );
}

function dateShift(day: string, by: number): string {
  return addDaysToKey(day, by);
}

function CalendarGrid({ days, segments, timeZone, today }: { days: string[]; segments: ReturnType<typeof calendarSegments>; timeZone: string; today: string }) {
  const openDetail = useOpenDetail(CALENDAR_EVENT_TYPE);
  const allDay = new Map(days.map((day) => [day, segments.filter((segment) => segment.day === day && segment.allDay)]));
  const timed = new Map(days.map((day) => [day, positionTimedSegments(segments.filter((segment) => segment.day === day && !segment.allDay))]));
  const open = (event: CalendarEventRow) => void openDetail({ type: CALENDAR_EVENT_TYPE, id: event.id, seed: { name: event.title } });
  return (
    <div className="min-w-[560px]" data-calendar-grid>
      <div className="grid" style={{ gridTemplateColumns: `48px repeat(${days.length}, minmax(0, 1fr))` }}>
        <div />
        {days.map((day) => <div key={day} className={cn("border-b border-l border-border px-1.5 py-1 text-center text-xs font-medium", day === today && "bg-primary/10 text-primary")}><span className="sm:hidden">{calendarDayLabel(day, true)}</span><span className="hidden sm:inline">{calendarDayLabel(day)}</span></div>)}
        <div className="border-b border-border px-1 text-xs text-muted-foreground">All-day</div>
        {days.map((day) => <div key={day} className="min-h-8 border-b border-l border-border p-0.5">{(allDay.get(day) ?? []).map((segment) => <CalendarEventButton key={`${segment.event.id}:${day}`} event={segment.event} compact onClick={() => open(segment.event)} />)}</div>)}
        <div className="relative h-[1152px] border-r border-border">{Array.from({ length: 24 }, (_, hour) => <span key={hour} className="absolute -top-2 right-1 text-[10px] text-muted-foreground" style={{ top: hour * HOUR_HEIGHT }}>{hour === 0 ? "12a" : hour < 12 ? `${hour}a` : hour === 12 ? "12p" : `${hour - 12}p`}</span>)}</div>
        {days.map((day) => <div key={day} className="relative h-[1152px] border-l border-border bg-[linear-gradient(to_bottom,transparent_47px,hsl(var(--border))_48px)] bg-[length:100%_48px]">{(timed.get(day) ?? []).map((segment) => <CalendarEventButton key={`${segment.event.id}:${day}`} event={segment.event} onClick={() => open(segment.event)} style={{ top: segment.startMinute / 60 * HOUR_HEIGHT + 1, height: Math.max(24, (segment.endMinute - segment.startMinute) / 60 * HOUR_HEIGHT - 2), left: `calc(${segment.lane / segment.lanes * 100}% + 2px)`, width: `calc(${100 / segment.lanes}% - 4px)` }} timeZone={timeZone} />)}</div>)}
      </div>
    </div>
  );
}

function CalendarEventButton({ event, onClick, compact = false, style, timeZone }: { event: CalendarEventRow; onClick: () => void; compact?: boolean; style?: CSSProperties; timeZone?: string }) {
  const frozen = frozenEventNotice(event);
  return <button type="button" onClick={onClick} style={style} className={cn("absolute overflow-hidden rounded border border-primary/30 bg-primary/10 px-1.5 py-1 text-left text-[11px] leading-tight text-foreground hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", compact && "relative mb-0.5 block w-full truncate py-0.5")} title={frozen?.sentence ?? event.title}><span className="block truncate font-medium">{event.title || "Untitled event"}</span>{!compact ? <span className="block truncate text-[10px] text-muted-foreground">{eventTimeText(event, timeZone)}</span> : null}</button>;
}
