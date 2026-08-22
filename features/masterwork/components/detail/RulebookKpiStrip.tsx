"use client";

// features/masterwork/components/detail/RulebookKpiStrip.tsx
//
// The encouragement engine of the review loop (Arman, 2026-08-17): the Expert
// should always see how far they've come and exactly what one click gets them
// next. Counts, a review-progress bar, and a next-step line that celebrates
// forward motion — never a wall of numbers. Enterprise: Lucide only, semantic
// tokens, no emojis.

import {
  BadgeCheck,
  CircleDashed,
  ListChecks,
  MessageSquareWarning,
  Trophy,
  XCircle,
} from "lucide-react";
import type { Rulebook } from "../../types";
import { ruleState } from "../../types";
import type { Journey } from "../../journey";

export interface RulebookKpis {
  total: number;
  approved: number;
  drafts: number;
  rejected: number;
  changeRequests: number;
  retired: number;
  /** 0-100, share of live rules the Expert has approved. */
  progressPct: number;
}

export function computeKpis(rulebook: Pick<Rulebook, "rules">): RulebookKpis {
  let approved = 0;
  let drafts = 0;
  let rejected = 0;
  let retired = 0;
  let changeRequests = 0;
  for (const rule of rulebook.rules) {
    const state = ruleState(rule);
    if (state === "retired") retired += 1;
    else if (state === "rejected") rejected += 1;
    else if (state === "draft") drafts += 1;
    else approved += 1;
    if (rule.feedback && state !== "rejected" && state !== "retired")
      changeRequests += 1;
  }
  const live = approved + drafts + rejected;
  return {
    total: rulebook.rules.length,
    approved,
    drafts,
    rejected,
    changeRequests,
    retired,
    progressPct: live === 0 ? 0 : Math.round((approved / live) * 100),
  };
}

/**
 * The one line under the bar — always forward-looking, always earned.
 *
 * 🚨 It is THE JOURNEY's headline (`features/masterwork/journey.ts`, mirroring
 * aidream `masterwork_assists/journey.py`), not a private opinion. Before the
 * journey existed this line stopped at "Ready to Build" — so a Rulebook with a
 * finished Checkup nobody had looked at, three unanswered questions, three
 * built Masterworks and zero Auditions was told it was all caught up, while
 * the improvement chips right below it said something else entirely.
 *
 * `journey` is optional only so the KPI computation stays usable on its own
 * (the module home renders counts without facts); when it is absent this falls
 * back to the review-queue half of the same precedence, never to a claim about
 * a life stage it cannot see.
 */
function nextStepLine(k: RulebookKpis, journey?: Journey): string {
  if (journey) return journey.headline;
  if (k.total === 0)
    return "Start the interview — your first rules are one conversation away.";
  if (k.drafts === 0 && k.rejected === 0 && k.changeRequests === 0)
    return k.approved > 0
      ? `All caught up — ${k.approved} approved ${k.approved === 1 ? "rule" : "rules"} and nothing waiting on you.`
      : "No rules waiting on you.";
  if (k.drafts > 0 && k.drafts <= 3)
    return `Almost there — ${k.drafts} ${k.drafts === 1 ? "rule" : "rules"} left to review.`;
  if (k.drafts > 0)
    return `${k.drafts} suggested ${k.drafts === 1 ? "rule needs" : "rules need"} your call — approve, correct, or reject each one.`;
  if (k.rejected > 0)
    // Never "they'll come back rewritten": a rejected rule is rewritten by the
    // Scout on its NEXT turn, so nothing is happening to it while nobody is
    // talking to the interviewer. Same sentence as the journey's.
    return `${k.rejected} rejected ${k.rejected === 1 ? "rule" : "rules"} will be rewritten the next time you talk to the interviewer.`;
  return `${k.changeRequests} change ${k.changeRequests === 1 ? "request is" : "requests are"} queued for the interviewer.`;
}

function Tile({
  icon,
  value,
  label,
  tone,
}: {
  icon: React.ReactNode;
  value: number;
  label: string;
  tone?: "positive" | "attention" | "negative" | "muted";
}) {
  const valueCls =
    tone === "positive"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "attention"
        ? "text-primary"
        : tone === "negative"
          ? "text-destructive"
          : "text-foreground";
  return (
    <div className="flex min-w-[5.5rem] flex-1 items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1.5">
      <span className="text-muted-foreground">{icon}</span>
      <div className="min-w-0 leading-tight">
        <div className={`text-base font-semibold tabular-nums ${valueCls}`}>
          {value}
        </div>
        <div className="truncate text-[10px] text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}

export function RulebookKpiStrip({
  kpis,
  journey,
  live = false,
}: {
  kpis: RulebookKpis;
  /**
   * Where this Rulebook is in its life. When given, its headline IS the next
   * step line — the same computation the improvement brain raises chips from,
   * so the page and the chips can never say different things.
   */
  journey?: Journey;
  /**
   * True when the Rulebook's Understudy exists — the system is already
   * running, and every approval visibly improves it (vision doc 13).
   */
  live?: boolean;
}) {
  const done = kpis.progressPct >= 100 && kpis.approved > 0;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        <Tile
          icon={<ListChecks className="h-4 w-4" />}
          value={kpis.approved + kpis.drafts + kpis.rejected}
          label="Rules"
        />
        <Tile
          icon={<BadgeCheck className="h-4 w-4" />}
          value={kpis.approved}
          label="Approved"
          tone="positive"
        />
        <Tile
          icon={<CircleDashed className="h-4 w-4" />}
          value={kpis.drafts}
          label="Waiting on you"
          tone={kpis.drafts > 0 ? "attention" : "muted"}
        />
        {kpis.rejected > 0 ? (
          <Tile
            icon={<XCircle className="h-4 w-4" />}
            value={kpis.rejected}
            label="With the interviewer"
            tone="negative"
          />
        ) : null}
        {kpis.changeRequests > 0 ? (
          <Tile
            icon={<MessageSquareWarning className="h-4 w-4" />}
            value={kpis.changeRequests}
            label="Change requests"
            tone="attention"
          />
        ) : null}
      </div>
      <div>
        {/* ONE line, not three. Arman, 2026-08-18: "We don't need to write a
            goddamn novel about everything. Pick your favorite one, and that's
            all we write." The favourite is the next step — a "Review progress"
            label restates the bar, and a second sentence about the system
            being live restates the Understudy card below. */}
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
            {done ? (
              <Trophy className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
            ) : null}
            {live ? (
              <span
                className="inline-flex h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500"
                title="Your system is already running — every approval improves it"
              />
            ) : null}
            <span className="truncate">{nextStepLine(kpis, journey)}</span>
          </span>
          <span className="shrink-0 tabular-nums text-muted-foreground">
            {kpis.progressPct}%
          </span>
        </div>
        <div
          className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuenow={kpis.progressPct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Rules reviewed"
        >
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              done ? "bg-emerald-500" : "bg-primary"
            }`}
            style={{ width: `${Math.max(kpis.progressPct, 2)}%` }}
          />
        </div>
      </div>
    </div>
  );
}
