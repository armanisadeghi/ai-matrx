"use client";

/**
 * features/hr/time/shared/timing.tsx — the SPEC-TIME §9 and §10 renderers.
 *
 * These are the rules that decide what a number on the screen MEANS, and §9 opens by calling them
 * binding. All of them share one property: **the sentence is the server's, and this file prints
 * it.** Nothing here re-derives a DST transition, a crossing, or an elapsed figure — §9 rule 7 is
 * explicit that `crosses_midnight` and `dst_transition` are columns computed once at write and that
 * *"the renderer reads them; it never re-derives them from arithmetic."*
 */

import { CalendarClock, MoveRight, Scissors, SunMoon } from "lucide-react";

import { cn } from "@/lib/utils";

import type { TimesheetDay, WorkIntervalRow } from "../api/types";
import {
  formatLocalDate,
  formatRoundingDelta,
  formatStampedTime,
  formatStampedTimeWithZone,
  formatTimeInViewerZone,
  zoneDiffersFromViewer,
} from "./format";

/**
 * A stamped time, with the viewer's own zone reachable on hover (§9 rule 1).
 *
 * The `title` carries the viewer-local equivalent rather than a second visible column, because the
 * stamped time is the one that decides which day the work belongs to and a second time beside it
 * invites the reader to pick the wrong one.
 */
export function StampedTime({
  at,
  tz,
  className,
}: {
  at: string | null;
  tz: string;
  className?: string;
}) {
  if (!at) return <span className={cn("text-muted-foreground", className)}>—</span>;
  const differs = zoneDiffersFromViewer(tz);
  return (
    <span
      className={cn("tabular-nums", className)}
      title={
        differs
          ? `${formatTimeInViewerZone(at)} in your time zone — the time shown is where the work was recorded (${tz.replace(/_/g, " ")}).`
          : undefined
      }
    >
      {formatStampedTimeWithZone(at, tz)}
    </span>
  );
}

/**
 * 🚨 L3-50 — INLINE ROUNDING HONESTY. On the employee's own timesheet, on any day whose summed
 * `rounding_applied_minutes` is non-zero, the derivation is a **sentence in the flow of the page**,
 * not a hover and not an icon:
 *
 *   *"Recorded 7:58–4:03. Paid 8:00–4:00. +1 minute."*
 *
 * SPEC-TIME §10: *"An employee attesting to hours they cannot see the derivation of is attesting to
 * nothing."* `inline={false}` is the manager's rendering — same facts, less shouting — and is the
 * ONLY place the compact form is legitimate.
 */
export function RoundingSentence({
  intervals,
  minutes,
  inline = true,
  className,
}: {
  intervals: WorkIntervalRow[];
  /** The day's summed `roundingAppliedMinutes`, as the server summed it. */
  minutes: number;
  inline?: boolean;
  className?: string;
}) {
  if (minutes === 0) return null;
  const rounded = intervals.filter((iv) => iv.roundingAppliedMinutes !== 0);
  if (rounded.length === 0) return null;

  return (
    <p
      className={cn(
        "text-xs",
        inline
          ? "rounded-md border border-border bg-muted/50 px-2.5 py-2 text-foreground"
          : "text-muted-foreground",
        className,
      )}
    >
      {rounded.map((iv, index) => (
        <span key={iv.id} className="mr-2 inline-block">
          Recorded {formatStampedTime(iv.rawStartedAt ?? iv.startedAt ?? "", iv.tz)}–
          {formatStampedTime(iv.rawEndedAt ?? iv.endedAt ?? "", iv.tz)}. Paid{" "}
          {formatStampedTime(iv.startedAt ?? "", iv.tz)}–{formatStampedTime(iv.endedAt ?? "", iv.tz)}.{" "}
          <span className="font-medium">{formatRoundingDelta(iv.roundingAppliedMinutes)}</span>.
          {index < rounded.length - 1 ? "" : null}
        </span>
      ))}
    </p>
  );
}

/**
 * Everything §9 says a DAY owes its reader: the DST sentence, both midnight-crossing markers, and
 * the dual workday attribution.
 *
 * 🚨 The DST sentence is **`day.dst.sentence`, printed verbatim**. It names the zone, the instant
 * the clocks moved and the real length of the shift — three facts a browser cannot derive without
 * doing the arithmetic that §9 rule 2 forbids.
 *
 * 🚨 `continuedFromDate` prints the marker and **NOT the hours**. A week total that double-counts a
 * midnight crossing is the classic bug this rule exists to prevent.
 */
export function DayTimingNotes({
  day,
  className,
}: {
  day: TimesheetDay;
  className?: string;
}) {
  const notes: { key: string; icon: React.ReactNode; body: React.ReactNode }[] = [];

  if (day.dst.transition && day.dst.sentence) {
    notes.push({
      key: "dst",
      icon: <SunMoon className="h-3.5 w-3.5" aria-hidden />,
      body: day.dst.sentence,
    });
  }

  if (day.continuesIntoDate) {
    notes.push({
      key: "continues",
      icon: <MoveRight className="h-3.5 w-3.5" aria-hidden />,
      body: (
        <>
          This shift continues into{" "}
          <span className="font-medium">{formatLocalDate(day.continuesIntoDate, { weekday: true })}</span>
          . All of its hours are counted here, on the day it started.
        </>
      ),
    });
  }

  if (day.continuedFromDate) {
    notes.push({
      key: "continued",
      icon: <MoveRight className="h-3.5 w-3.5 rotate-180" aria-hidden />,
      body: (
        <>
          Continued from{" "}
          <span className="font-medium">{formatLocalDate(day.continuedFromDate, { weekday: true })}</span>
          . Those hours are counted on that day and are deliberately not repeated here.
        </>
      ),
    });
  }

  if (day.workdayAttribution) {
    notes.push({
      key: "workday",
      icon: <CalendarClock className="h-3.5 w-3.5" aria-hidden />,
      body: (
        <>
          Shown under{" "}
          <span className="font-medium">{formatLocalDate(day.localWorkDate, { weekday: true })}</span>
          , but daily overtime was evaluated over the workday beginning{" "}
          <span className="font-medium">{day.workdayAttribution.workdayStartLocal}</span> on{" "}
          <span className="font-medium">
            {formatLocalDate(day.workdayAttribution.evaluatedWorkdayDate, { weekday: true })}
          </span>
          .
        </>
      ),
    });
  }

  if (notes.length === 0) return null;

  return (
    <ul className={cn("space-y-1", className)}>
      {notes.map((note) => (
        <li
          key={note.key}
          className="flex items-start gap-2 rounded-md border border-border bg-muted/40 px-2.5 py-1.5 text-xs"
        >
          <span className="mt-0.5 shrink-0 text-muted-foreground">{note.icon}</span>
          <span>{note.body}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * 🚨 §9 rule 6 — the workweek boundary is a HARD VISUAL BREAK, and a shift spanning it renders in
 * both blocks with the split stated. Overtime is still computed on the whole week, never on either
 * fragment, and the sentence says so because a reader who sees half a shift will otherwise assume
 * half the overtime.
 */
export function WeekSplitNote({ className }: { className?: string }) {
  return (
    <p
      className={cn(
        "flex items-start gap-2 rounded-md border border-dashed border-border bg-muted/40 px-2.5 py-1.5 text-xs",
        className,
      )}
    >
      <Scissors className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <span>
        A shift crosses the start of this workweek, so its hours appear in both week blocks, split at
        the boundary. Overtime is still calculated on the whole week — never on either fragment.
      </span>
    </p>
  );
}
