"use client";

/**
 * THE SCORED CHECKLIST — a list of graded checks with a score that never lies
 * about what it measured.
 *
 * It lives in the shared marketing layer, not beside the YouTube panel that
 * needed it first (law 5: never scope a capability to the feature that surfaced
 * it). "Grade this draft against a rule set and say what each rule found" is
 * the shape of a page-SEO check, a press-release check and a listing-completeness
 * check too; the YouTube pre-upload check is only the first caller.
 *
 * WHAT IT REFUSES TO DO. It will not print a percentage that excludes rows
 * without saying so, and it will not render a `not_measured` row as a quiet
 * pass. Both are the same failure the analytics coverage judge exists to stop
 * next door (`features/marketing/analytics/window.ts` rule 3): a number over an
 * unstated denominator reads as a verdict.
 *
 * It computes NOTHING. Scoring is the caller's pure module, so the rule is
 * provable by a test with fixed inputs and this component stays a renderer.
 */

import { AlertTriangle, CheckCircle2, CircleDashed, XCircle } from "lucide-react";

import { cn } from "@/lib/utils";

export type ScoredChecklistState = "pass" | "warn" | "fail" | "not_measured";

export interface ScoredChecklistRow {
  id: string;
  label: string;
  state: ScoredChecklistState;
  detail: string;
}

export interface ScoredChecklistProps {
  rows: readonly ScoredChecklistRow[];
  /** 0–100, over the MEASURED rows only. Omit when nothing was scored. */
  score?: number | null;
  /** How many rows the score is over, and how many exist. Both printed. */
  measured?: number;
  total?: number;
  /**
   * Printed INSTEAD of the score when there is none — never an empty space and
   * never a zero, which would read as "this draft is bad".
   */
  refusal?: string | null;
  className?: string;
}

const STATE_ICON = {
  pass: CheckCircle2,
  warn: AlertTriangle,
  fail: XCircle,
  not_measured: CircleDashed,
} as const;

const STATE_CLASS: Record<ScoredChecklistState, string> = {
  pass: "text-success",
  warn: "text-warning",
  fail: "text-destructive",
  not_measured: "text-muted-foreground",
};

const STATE_WORD: Record<ScoredChecklistState, string> = {
  pass: "Good",
  warn: "Could be better",
  fail: "Fix this",
  not_measured: "Not measured",
};

function scoreToneClass(score: number): string {
  if (score >= 80) return "text-success";
  if (score >= 50) return "text-warning";
  return "text-destructive";
}

export function ScoredChecklist({
  rows,
  score = null,
  measured,
  total,
  refusal = null,
  className,
}: ScoredChecklistProps) {
  const unmeasured = rows.filter((row) => row.state === "not_measured").length;
  return (
    <div className={cn("flex min-w-0 flex-col gap-2", className)}>
      {refusal ? (
        <p className="rounded-md border border-dashed border-warning/50 bg-warning/5 px-2.5 py-2 text-xs leading-5 text-foreground">
          {refusal}
        </p>
      ) : score !== null ? (
        <div className="flex flex-wrap items-baseline gap-2">
          <span className={cn("text-2xl font-semibold tabular-nums", scoreToneClass(score))}>
            {score}
            <span className="text-base font-normal text-muted-foreground">/100</span>
          </span>
          {/* 🚨 THE DENOMINATOR, ALWAYS. A score over 4 of 7 checks is not a
              score out of 7, and the reader cannot see that from the number. */}
          <span className="text-[11px] leading-4 text-muted-foreground">
            {measured !== undefined && total !== undefined
              ? measured === total
                ? `over all ${total} checks`
                : `over the ${measured} of ${total} checks that could be measured — the other ${unmeasured} say why below`
              : null}
          </span>
        </div>
      ) : null}
      <ul className="flex flex-col gap-1.5">
        {rows.map((row) => {
          const Icon = STATE_ICON[row.state];
          return (
            <li key={row.id} className="flex gap-2">
              <Icon
                className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", STATE_CLASS[row.state])}
                aria-hidden
              />
              <div className="min-w-0">
                <p className="text-sm leading-5 text-foreground">
                  <span className="font-medium">{row.label}</span>
                  <span className={cn("ml-1.5 text-[11px]", STATE_CLASS[row.state])}>
                    {STATE_WORD[row.state]}
                  </span>
                </p>
                <p className="text-[11px] leading-4 text-muted-foreground">{row.detail}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
