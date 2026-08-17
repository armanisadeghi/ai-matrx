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

export function computeKpis(rulebook: Rulebook): RulebookKpis {
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
    if (rule.feedback && state !== "rejected") changeRequests += 1;
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

/** The one line under the bar — always forward-looking, always earned. */
function nextStepLine(k: RulebookKpis): string {
  if (k.total === 0)
    return "Start the interview — your first rules are one conversation away.";
  if (k.drafts === 0 && k.rejected === 0 && k.changeRequests === 0)
    return k.approved > 0
      ? "All caught up — every rule is reviewed. Ready to Build."
      : "No rules waiting on you.";
  if (k.drafts > 0 && k.drafts <= 3)
    return `Almost there — ${k.drafts} ${k.drafts === 1 ? "rule" : "rules"} left to review.`;
  if (k.drafts > 0)
    return `${k.drafts} suggested ${k.drafts === 1 ? "rule needs" : "rules need"} your call — approve, correct, or reject each one.`;
  if (k.rejected > 0)
    return `${k.rejected} rejected ${k.rejected === 1 ? "rule is" : "rules are"} with the interviewer — they'll come back rewritten.`;
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

export function RulebookKpiStrip({ kpis }: { kpis: RulebookKpis }) {
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
        <div className="flex items-center justify-between text-[11px]">
          <span className="flex items-center gap-1 font-medium text-foreground">
            {done ? <Trophy className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" /> : null}
            Review progress
          </span>
          <span className="tabular-nums text-muted-foreground">
            {kpis.progressPct}%
          </span>
        </div>
        <div
          className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuenow={kpis.progressPct}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              done ? "bg-emerald-500" : "bg-primary"
            }`}
            style={{ width: `${Math.max(kpis.progressPct, 2)}%` }}
          />
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{nextStepLine(kpis)}</p>
      </div>
    </div>
  );
}
