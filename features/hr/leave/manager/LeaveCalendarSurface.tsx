/**
 * features/hr/leave/manager/LeaveCalendarSurface.tsx — SPEC-LEAVE §10, UI-IA route 43.
 *
 * *"Who is out, and can we cover it?"*, in one look, for the person about to approve,
 * schedule, or plan.
 *
 * 🚨 THE DISCLOSURE LADDER IS ALREADY APPLIED SERVER-SIDE, AND THIS FILE ADDS NOTHING TO IT.
 * `hr.leave_calendar` decides each entry's rung and returns only what that rung permits:
 * `label` is already "Out" for a peer and "Out — <policy>" for a manager, `hours` is already
 * null below the manager rung, `existence_statement` is already the §9.6 sentence or null, and
 * `href` is already null on a peer's entry. So this component RENDERS WHAT IT IS GIVEN. It
 * never composes a label from a leave kind, never infers a rung, and never re-derives a door —
 * the one way a client can leak here is by trying to be helpful with a field the server
 * deliberately withheld.
 *
 * 🚨 EVERY ENTRY IS A DOOR EXCEPT A PEER'S "Out". That is not a rule this file implements; it
 * is a rule it OBEYS by rendering `href` when it arrives and plain text when it does not.
 *
 * 🚨 EMPTY IS A STATE, NOT A BLANK. `empty_statement` — "Nobody is scheduled to be out." — is
 * rendered as the server worded it.
 *
 * ── 🚨 WHAT IS NOT BUILT, AND WHY IT IS NOT FAKED ───────────────────────────
 *  1. **§10's overlap-warning band.** The amber band fires when more people are out on a day
 *     than `staffing_requirement` or a blackout's `max_concurrent_out` permits — and
 *     `hr_leave_calendar` returns NEITHER threshold (verified against the live function body,
 *     2026-08-27). A band drawn without one would be this screen inventing a staffing judgement
 *     nobody configured. What ships instead is the honest half: the number of people out on
 *     each day, which is the fact the band would have been derived from.
 *  2. **§10's team / leave-type / policy filters.** `hr.leave_calendar` DECLARES `p_filters`
 *     and its body reads nothing out of it, so sending a filter would return the whole month
 *     unfiltered under a chip claiming otherwise. The search below is stated as a search of
 *     what is on screen, because that is exactly what it is.
 *  3. **The published-shift overlay, the coverage strip, and the ICS export.** All three need
 *     data or a door this envelope does not carry.
 *  4. **Approver context** (opening the calendar pre-filtered to a requester's team with the
 *     request drawn in provisionally). It needs a way to overlay a request that has not been
 *     approved; the door returns approved absences only.
 */

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, ChevronLeft, ChevronRight, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import { HrPageState } from "@/features/hr/shared/HrStates";
import { useHrContext } from "@/features/hr/shared/useHrContext";
import type { HrDenied, HrFailed } from "@/features/hr/types";

import { fetchLeaveCalendar } from "./api/service";
import type { LeaveCalendar, LeaveCalendarEntry } from "./api/types";
import {
  addMonths,
  addDays,
  coversDay,
  monthGrid,
  monthLabel,
  parseIsoDay,
  startOfWeek,
  todayIso,
  weekGrid,
  weekLabel,
  WEEKDAY_LABELS,
} from "./calendar-grid";
import { hrPageRefusalProps } from "./refusal";
import { LeaveDeskShell } from "./LeaveDeskShell";
import { leaveCalendarHref } from "./routes";

type CalendarView = "month" | "week";

function isView(value: string | null): value is CalendarView {
  return value === "month" || value === "week";
}

function isIsoDay(value: string | null): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/**
 * One entry's band on one day.
 *
 * A partial day renders at half height with its hours — §10, and the reason a half-day never
 * reads as a whole one. A door is a `Link`; a peer's "Out" (no `href`) is a plain span, and the
 * two are visually different so nobody clicks at something that cannot open.
 */
function EntryBand({ entry }: { entry: LeaveCalendarEntry }) {
  const partial = entry.partialDay === true;
  const body = (
    <>
      <span className="truncate">{entry.employeeName ?? "Somebody"}</span>
      <span className="truncate text-[10px] opacity-80">{entry.label ?? "Out"}</span>
      {entry.hours !== null ? (
        <span className="shrink-0 tabular-nums text-[10px] opacity-80">{entry.hours} h</span>
      ) : null}
    </>
  );

  const className = cn(
    "flex w-full items-center gap-1 overflow-hidden rounded-sm px-1 text-[11px] leading-none",
    partial ? "h-3.5 bg-primary/15 text-foreground" : "h-6 bg-primary/25 text-foreground",
  );

  if (!entry.href) {
    return (
      <span className={className} title={entry.label ?? "Out"}>
        {body}
      </span>
    );
  }
  return (
    <Link
      href={entry.href}
      className={cn(className, "transition-colors hover:bg-primary/40")}
      title={entry.label ?? "Out"}
    >
      {body}
    </Link>
  );
}

function DayCell({
  day,
  entries,
  dimmed,
  isToday,
  tall,
}: {
  day: string;
  entries: LeaveCalendarEntry[];
  dimmed: boolean;
  isToday: boolean;
  tall: boolean;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-1 border border-border bg-card p-1.5",
        tall ? "min-h-40" : "min-h-24",
        dimmed && "bg-muted/30",
      )}
    >
      <div className="flex items-baseline justify-between gap-1">
        <span
          className={cn(
            "text-xs tabular-nums",
            isToday ? "font-semibold text-primary" : "text-muted-foreground",
          )}
        >
          {parseIsoDay(day).getUTCDate()}
        </span>
        {/*
          The FACT, not a judgement. §10's amber band needs a threshold this door does not
          return; the count is what the band would have been derived from.
        */}
        {entries.length > 0 ? (
          <span className="text-[10px] text-muted-foreground">
            {entries.length} out
          </span>
        ) : null}
      </div>
      <div className="flex min-w-0 flex-col gap-0.5">
        {entries.map((entry, index) => (
          <EntryBand key={`${entry.employmentId ?? "unknown"}-${index}`} entry={entry} />
        ))}
      </div>
    </div>
  );
}

export function LeaveCalendarSurface() {
  const { active, orgRef } = useHrContext();
  const router = useRouter();
  const params = useSearchParams();
  const organizationId = active?.organization_id ?? null;

  const viewParam = params?.get("view") ?? null;
  const view: CalendarView = isView(viewParam) ? viewParam : "month";
  const onParam = params?.get("on") ?? null;
  const anchor = isIsoDay(onParam) ? onParam : todayIso();

  const [calendar, setCalendar] = useState<LeaveCalendar | null>(null);
  const [error, setError] = useState<HrDenied | HrFailed | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [reloadToken, setReloadToken] = useState(0);

  const grid = useMemo(
    () => (view === "month" ? monthGrid(anchor) : weekGrid(anchor)),
    [view, anchor],
  );

  const load = useCallback(
    async (signal: AbortSignal) => {
      if (!organizationId) return;
      setLoading(true);
      const result = await fetchLeaveCalendar(
        { organizationId, from: grid.from, to: grid.to },
        { signal },
      );
      if (signal.aborted) return;
      if (result.ok) {
        setCalendar(result.data);
        setError(null);
      } else {
        setError(result);
      }
      setLoading(false);
    },
    [organizationId, grid.from, grid.to],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load, reloadToken]);

  const entries = useMemo(() => {
    const all = calendar?.entries ?? [];
    const needle = search.trim().toLowerCase();
    if (needle === "") return all;
    return all.filter((entry) => (entry.employeeName ?? "").toLowerCase().includes(needle));
  }, [calendar, search]);

  const byDay = useMemo(() => {
    const map = new Map<string, LeaveCalendarEntry[]>();
    for (const day of grid.days) map.set(day, []);
    for (const entry of entries) {
      for (const day of grid.days) {
        if (coversDay(day, entry.startsOn, entry.endsOn)) {
          map.get(day)?.push(entry);
        }
      }
    }
    return map;
  }, [entries, grid.days]);

  function goTo(nextAnchor: string, nextView: CalendarView = view) {
    router.replace(leaveCalendarHref(orgRef, { on: nextAnchor, view: nextView }));
  }

  const step = view === "month" ? 1 : 7;

  return (
    <LeaveDeskShell
      title="Time off"
      description="Decisions waiting on you, the balances behind them, and who is out."
    >
      <HrPageState
        loading={loading}
        {...hrPageRefusalProps(error)}
        operation="The who's-out calendar"
        onRetry={() => setReloadToken((n) => n + 1)}
        variant="cards"
      >
        <div className="flex h-full min-h-0 flex-col gap-3 p-4 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8 w-8 p-0"
                aria-label={view === "month" ? "Previous month" : "Previous week"}
                onClick={() =>
                  goTo(view === "month" ? addMonths(anchor, -1) : addDays(anchor, -step))
                }
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="min-w-44 text-center text-sm font-semibold text-foreground">
                {view === "month" ? monthLabel(anchor) : weekLabel(anchor)}
              </span>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8 w-8 p-0"
                aria-label={view === "month" ? "Next month" : "Next week"}
                onClick={() =>
                  goTo(view === "month" ? addMonths(anchor, 1) : addDays(anchor, step))
                }
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="ml-1 h-8"
                onClick={() => goTo(todayIso())}
              >
                Today
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Find a person on this screen"
                  className="h-8 w-56 pl-7"
                  aria-label="Find a person among the absences shown"
                />
              </div>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant={view === "month" ? "secondary" : "ghost"}
                  className="h-8"
                  onClick={() => goTo(anchor, "month")}
                >
                  Month
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={view === "week" ? "secondary" : "ghost"}
                  className="h-8"
                  onClick={() => goTo(startOfWeek(anchor), "week")}
                >
                  Week
                </Button>
              </div>
            </div>
          </div>

          {/*
            EMPTY IS A STATE. The server's own sentence, rendered where the grid would be — and
            only when the server actually said the range was empty, never when a client-side
            search happens to match nothing.
          */}
          {calendar?.emptyStatement && (calendar.entries.length ?? 0) === 0 ? (
            <div className="flex flex-1 items-center justify-center rounded-lg border border-border bg-card p-8">
              <div className="flex flex-col items-center gap-2 text-center">
                <CalendarDays className="h-6 w-6 text-muted-foreground" />
                <p className="text-sm text-foreground">{calendar.emptyStatement}</p>
                <p className="text-xs text-muted-foreground">
                  {view === "month" ? monthLabel(anchor) : weekLabel(anchor)}
                </p>
              </div>
            </div>
          ) : (
            <div className="min-h-0 flex-1 overflow-auto">
              <div className="grid grid-cols-7 gap-px">
                {WEEKDAY_LABELS.map((label) => (
                  <div
                    key={label}
                    className="bg-muted/40 px-1.5 py-1 text-[11px] font-medium text-muted-foreground"
                  >
                    {label}
                  </div>
                ))}
                {grid.days.map((day) => (
                  <DayCell
                    key={day}
                    day={day}
                    entries={byDay.get(day) ?? []}
                    dimmed={
                      grid.anchorMonth !== null &&
                      parseIsoDay(day).getUTCMonth() !== grid.anchorMonth
                    }
                    isToday={day === todayIso()}
                    tall={view === "week"}
                  />
                ))}
              </div>
            </div>
          )}

          {search.trim() !== "" ? (
            <p className="text-xs text-muted-foreground">
              Searching the absences already on this screen. It does not fetch anyone new.
            </p>
          ) : null}

          {/*
            §9.6 — the existence statements the server chose to send, said once rather than on
            every band. No category, no case door, no lock icon.
          */}
          {entries.some((entry) => entry.existenceStatement) ? (
            <p className="text-xs text-muted-foreground">
              {
                entries.find((entry) => entry.existenceStatement)?.existenceStatement
              }
            </p>
          ) : null}
        </div>
      </HrPageState>
    </LeaveDeskShell>
  );
}
