"use client";

/**
 * features/hr/time/overtime/components/ApproachingWatchlist.tsx — SPEC-TIME §4.5 on route 31a.
 *
 * 🚨 EVERY ALERT CARRIES THE PRE-APPROVAL DOOR. *"An alert that only informs is half a feature."*
 * One tap raises the §4.4 request pre-filled with the threshold it is about to cross — which is the
 * whole point of showing somebody they are eight minutes from a threshold rather than telling them
 * afterwards.
 *
 * 🚨 WHAT AN ALERT NEVER DOES: it never blocks a punch, never forces a clock-out, never auto-denies,
 * and **never appears on the kiosk** — a shared tablet is not a personal notification surface, and
 * the employee's own channels carry it.
 *
 * 🚨 EVERY THRESHOLD ON SCREEN IS THE JURISDICTION ENGINE'S, RESOLVED SERVER-SIDE (E-55). This file
 * carries no default, no constant 40, and no daily/weekly assumption. **Daily is not optional**: in
 * California an 8-hour day triggers overtime regardless of the weekly total, so a watchlist that
 * shows only the weekly number is silently wrong for the jurisdiction that matters most.
 *
 * 🚨 EVERY FIGURE HERE IS A PROJECTION AND IS LABELLED ONE. E-55 is always `prospective` — it
 * projects, it never writes hours. The authoritative overtime answer is the closed workweek, and a
 * projection stored as evidence is how a wage claim gets an answer we cannot defend.
 *
 * NO CLIENT COMPUTES HOURS: `hours_worked_to_date`, `projected_week_hours` and every `at_hours`
 * arrive from the evaluator.
 */

import { BellRing, TrendingUp } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatHours } from "../../shared/format";
import type { OvertimeEvaluation } from "../api/overtimeReads";
import { graceSentence, thresholdAxisLabel } from "../overtimeVocabulary";

export interface ApproachingWatchlistProps {
  /** One evaluation per watched employment, with the person's name beside it. */
  entries: Array<{ employmentId: string; displayName: string; evaluation: OvertimeEvaluation }>;
  isLoading: boolean;
  /** Raises a request pre-filled with the threshold it is about to cross. */
  onRaiseRequest: (args: { employmentId: string; thresholdAxes: string[] }) => void;
}

export function ApproachingWatchlist({
  entries,
  isLoading,
  onRaiseRequest,
}: ApproachingWatchlistProps) {
  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="border-b border-border p-4">
        <h3 className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
          <TrendingUp className="h-4 w-4 text-muted-foreground" aria-hidden />
          Approaching overtime
        </h3>
        <p className="mt-1 max-w-2xl text-[12px] leading-relaxed text-muted-foreground">
          Live projections against this organization&apos;s resolved thresholds — weekly, daily,
          double time and the seventh consecutive day where they apply. These are projections, not
          paid hours: the figure that gets paid is calculated from the closed workweek.
        </p>
      </div>

      {isLoading ? (
        <div className="p-4 text-[12px] text-muted-foreground">Checking who is close…</div>
      ) : entries.length === 0 ? (
        <div className="p-4 text-[12px] text-muted-foreground">
          Nobody is close to an overtime threshold right now.
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {entries.map((entry) => {
            const ev = entry.evaluation;
            const crossed = ev.thresholds.filter((t) => t.crossed);
            const upcoming = ev.thresholds.filter((t) => !t.crossed);
            const axes = ev.thresholds.map((t) => t.key);

            return (
              <li key={entry.employmentId} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium text-foreground">{entry.displayName}</p>
                    <p className="mt-0.5 text-[12px] text-muted-foreground">
                      {formatHours(ev.hours_worked_to_date)} h worked this week
                      {typeof ev.hours_scheduled_remaining === "number"
                        ? ` · ${formatHours(ev.hours_scheduled_remaining)} h still scheduled`
                        : ""}
                      {" · "}
                      <span className="text-foreground">
                        projected {formatHours(ev.projected_week_hours)} h
                      </span>
                    </p>
                  </div>

                  {/* 🚨 The door. One tap, pre-filled with the threshold it is about to cross. */}
                  <Button
                    type="button"
                    size="sm"
                    className="min-h-[44px]"
                    onClick={() =>
                      onRaiseRequest({ employmentId: entry.employmentId, thresholdAxes: axes })
                    }
                  >
                    <BellRing className="mr-1.5 h-4 w-4" aria-hidden />
                    Raise a pre-approval
                  </Button>
                </div>

                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {crossed.map((t) => (
                    <li
                      key={`c-${t.key}`}
                      className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-800 dark:text-amber-300"
                    >
                      {thresholdAxisLabel(t.key)} crossed at {formatHours(t.at_hours)} h
                    </li>
                  ))}
                  {upcoming.map((t) => (
                    <li
                      key={`u-${t.key}`}
                      className="rounded-md border border-border bg-muted/50 px-2 py-0.5 text-[11px] text-muted-foreground"
                    >
                      {thresholdAxisLabel(t.key)} at {formatHours(t.at_hours)} h
                    </li>
                  ))}
                </ul>

                {/* Daily and double-time axes, which a weekly-only view would silently drop. */}
                {ev.daily ? (
                  <p className="mt-1.5 text-[11px] text-muted-foreground">
                    Today: {formatHours(ev.daily.hours_today)} h
                    {typeof ev.daily.daily_ot_at_hours === "number"
                      ? ` · daily overtime at ${formatHours(ev.daily.daily_ot_at_hours)} h`
                      : ""}
                    {typeof ev.daily.daily_dt_at_hours === "number"
                      ? ` · double time at ${formatHours(ev.daily.daily_dt_at_hours)} h`
                      : ""}
                  </p>
                ) : null}

                {/* Flags and incomplete facts are rendered, never swallowed (§1.3 rule 4). */}
                {ev.flags.length > 0 ? (
                  <ul className="mt-2 space-y-1">
                    {ev.flags.map((flag, i) => (
                      <li
                        key={`${flag.code}-${i}`}
                        className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-[11px] leading-relaxed text-amber-800 dark:text-amber-300"
                      >
                        {flag.message}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {ev.incomplete.length > 0 ? (
                  <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
                    Some facts are missing, so this projection is incomplete:{" "}
                    {ev.incomplete.map((f) => `${f.class} needs ${f.fact}`).join("; ")}.
                  </p>
                ) : null}

                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  {graceSentence(ev.grace_minutes)}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
