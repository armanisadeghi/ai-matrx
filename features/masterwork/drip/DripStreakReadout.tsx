"use client";

// features/masterwork/drip/DripStreakReadout.tsx
//
// STREAKS AND YIELD — what a minute a day has actually bought.
//
// ## 🚨 THE NUMBER THAT MATTERS IS `rules`, NOT `answered`
//
// Every habit product on earth shows a streak, and a streak on its own is a
// number about compliance: it says the person did what they were told. This
// readout leads with the streak because it is what makes the habit stick, and
// then immediately says what came OF it — rules in their own Rulebook, counted
// by actually looking for the Approach stamp on them, never inferred from the
// number of answers. A screen that implied rules exist because answers exist
// would be the exact lie this system is built to make impossible.
//
// ## And the empty states are states, not blanks
//
// Nothing asked yet, asked-but-nothing-answered, answered-but-nothing-distilled
// — each says which it is. A zero with no sentence beside it reads as "you are
// failing"; a zero with the sentence reads as "nothing has happened yet",
// which is the truth.

import { Flame, MessageSquareQuote, PauseCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  answeredDays,
  dayLabel,
  dripYield,
  isActive,
  isPaused,
  type DailyDrip,
} from "./scoring";
import { AGENT_ICON } from "@/components/icons/domain-icons";

export function DripStreakReadout({
  drip,
  rules,
  minAnswersToDistill,
  className,
}: {
  drip: DailyDrip;
  rules: ReadonlyArray<{ source_ref?: { approach?: string } | null }>;
  /**
   * The knob that decides how many answers are needed before rules can be
   * drawn. `null` means it has not been read yet — and the sentence that
   * depends on it is then NOT SHOWN rather than shown against a guess. A
   * number invented here would disagree with the one the dialog reads from the
   * knob row, which is one screen lying about the same person.
   */
  minAnswersToDistill: number | null;
  className?: string;
}) {
  const report = dripYield(drip.days, rules);
  const answered = answeredDays(drip.days);
  const active = isActive(drip);
  const paused = isPaused(drip);

  if (report.asked === 0) {
    return (
      <p
        className={cn("text-xs text-muted-foreground", className)}
        data-surface-value="drip_yield_empty"
      >
        {active
          ? "No questions have gone out yet — the first one arrives at your time."
          : "Nothing has been asked yet."}
      </p>
    );
  }

  const rate = Math.round((report.answered / report.asked) * 100);

  return (
    <section
      className={cn("space-y-2", className)}
      data-surface-value="drip_yield"
      aria-label="Your daily question so far"
    >
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat
          icon={<Flame className="h-3.5 w-3.5" />}
          value={`${report.streak}`}
          label={report.streak === 1 ? "day in a row" : "days in a row"}
          tone={report.streak > 0 ? "good" : "plain"}
        />
        <Stat
          icon={<MessageSquareQuote className="h-3.5 w-3.5" />}
          value={`${report.answered}/${report.asked}`}
          label={`answered (${rate}%)`}
          tone="plain"
        />
        <Stat
          icon={<AGENT_ICON className="h-3.5 w-3.5" />}
          value={`${report.rules}`}
          label={report.rules === 1 ? "rule from this" : "rules from this"}
          tone={report.rules > 0 ? "good" : "plain"}
        />
        <Stat
          icon={<PauseCircle className="h-3.5 w-3.5" />}
          value={paused ? "Paused" : active ? "On" : "Off"}
          label={
            report.lastAsked ? `last asked ${dayLabel(report.lastAsked)}` : "never asked"
          }
          tone={paused ? "warn" : "plain"}
        />
      </div>

      {/* The one sentence that says what the numbers MEAN right now. Every
          branch is a real state with a real next step — never a blank. */}
      <p className="text-xs text-muted-foreground">
        {report.answered === 0 ? (
          <>
            {report.asked} question{report.asked === 1 ? " has" : "s have"} gone out and
            none have been answered yet. Answering one takes about a minute.
          </>
        ) : report.rules > 0 ? (
          <>
            {report.answered} answer{report.answered === 1 ? "" : "s"} so far{" "}
            {report.answered === 1 ? "has" : "have"} become {report.rules} rule
            {report.rules === 1 ? "" : "s"} in this Rulebook
            {report.undistilled > 0 ? (
              <>
                , and {report.undistilled} more day{report.undistilled === 1 ? "" : "s"}{" "}
                {report.undistilled === 1 ? "is" : "are"} waiting to be read
              </>
            ) : null}
            .
          </>
        ) : minAnswersToDistill === null ? (
          <>
            {report.answered} answer{report.answered === 1 ? "" : "s"} in, none turned
            into rules yet.
          </>
        ) : answered.length >= minAnswersToDistill ? (
          <>
            {report.answered} answer{report.answered === 1 ? "" : "s"} in, and none have
            been turned into rules yet — that is the next step, and it takes one click.
          </>
        ) : (
          <>
            {report.answered} answer{report.answered === 1 ? "" : "s"} in.{" "}
            {minAnswersToDistill - report.answered} more and these can be turned into
            rules.
          </>
        )}
      </p>
    </section>
  );
}

function Stat({
  icon,
  value,
  label,
  tone,
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
  tone: "good" | "warn" | "plain";
}) {
  return (
    <div className="rounded-md border border-border bg-background p-2.5">
      <div
        className={cn(
          "flex items-center gap-1.5 text-lg font-semibold leading-none",
          tone === "good" && "text-emerald-600 dark:text-emerald-400",
          tone === "warn" && "text-amber-600 dark:text-amber-400",
          tone === "plain" && "text-foreground",
        )}
      >
        {icon}
        {value}
      </div>
      <div className="mt-1 text-[11px] leading-tight text-muted-foreground">{label}</div>
    </div>
  );
}
