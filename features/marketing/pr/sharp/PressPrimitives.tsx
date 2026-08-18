"use client";

/**
 * The Press Room — the small pieces every view shares.
 *
 * The score comb is the answer to the brief's hardest constraint. Five 0–100
 * numbers per row is unreadable; five *bars* is a shape, and a shape can be
 * compared across twenty rows in one sweep without reading a single digit. The
 * digits are still there — in the tooltip, and in full in the detail panel — so
 * nothing is hidden, it is just not shouted.
 *
 * Everything here paints with semantic tokens only.
 */

import * as React from "react";
import { Clock } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import {
  ACTION_COPY,
  ENDOWMENT_COPY,
  SCORE_MODEL,
  keyOf,
  pressScore,
  readDeadline,
  scoreBand,
  scoreValue,
  weakestScore,
  type ScoreBand,
  type Urgency,
} from "./press-model";
import {
  ENDOWMENTS,
  RECOMMENDED_ACTIONS,
  type Endowment,
  type RecommendedAction,
  type StoryAngleRow,
} from "./types";

/* ── the composite + comb ────────────────────────────────────────────────── */

const BAND_TEXT: Record<ScoreBand, string> = {
  strong: "text-emerald-600 dark:text-emerald-400",
  solid: "text-foreground",
  weak: "text-muted-foreground",
};

const BAND_BAR: Record<ScoreBand, string> = {
  strong: "bg-emerald-500/80",
  solid: "bg-primary/70",
  weak: "bg-muted-foreground/35",
};

export function ScoreComb({
  angle,
  className,
}: {
  angle: StoryAngleRow;
  className?: string;
}) {
  const composite = pressScore(angle);
  const band = scoreBand(composite);
  const summary = SCORE_MODEL.map(
    (spec) => `${spec.label} ${scoreValue(angle, spec.key)}`,
  ).join(" · ");

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={cn("flex items-center gap-2", className)}
          aria-label={`Press score ${composite} of 100. ${summary}.`}
        >
          <span
            className={cn(
              "w-8 text-right text-base font-semibold tabular-nums leading-none",
              BAND_TEXT[band],
            )}
          >
            {composite}
          </span>
          <span className="flex h-5 items-end gap-[3px]" aria-hidden="true">
            {SCORE_MODEL.map((spec) => {
              const value = scoreValue(angle, spec.key);
              return (
                <span
                  key={spec.key}
                  className={cn(
                    "w-[3px] rounded-sm",
                    BAND_BAR[scoreBand(value)],
                  )}
                  style={{ height: `${4 + (value / 100) * 16}px` }}
                />
              );
            })}
          </span>
        </div>
      </TooltipTrigger>
      <TooltipContent side="left" className="max-w-64">
        <p className="text-xs font-medium">Press score {composite}/100</p>
        <p className="mt-1 text-[11px] text-muted-foreground">{summary}</p>
      </TooltipContent>
    </Tooltip>
  );
}

/** The same five numbers, weights shown, in the one place there is room. */
export function ScoreBreakdown({ angle }: { angle: StoryAngleRow }) {
  return (
    <div className="space-y-1.5">
      {SCORE_MODEL.map((spec) => {
        const value = scoreValue(angle, spec.key);
        const band = scoreBand(value);
        return (
          <div key={spec.key} className="flex items-center gap-3">
            <span className="w-24 shrink-0 text-[11px] font-medium text-muted-foreground">
              {spec.label}
            </span>
            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
              <span
                className={cn("block h-full rounded-full", BAND_BAR[band])}
                style={{ width: `${value}%` }}
              />
            </span>
            <span
              className={cn(
                "w-7 text-right text-[11px] font-semibold tabular-nums",
                BAND_TEXT[band],
              )}
            >
              {value}
            </span>
            <span className="w-10 shrink-0 text-right text-[10px] tabular-nums text-muted-foreground/70">
              ×{spec.weight.toFixed(2)}
            </span>
          </div>
        );
      })}
      {/* ONE sentence, from the score that is actually holding this angle back
          — five explanations under five bars would be the noise we removed. */}
      {(() => {
        const weakest = weakestScore(angle);
        const value = scoreValue(angle, weakest.key);
        return (
          <p className="pt-1 text-[11px] leading-relaxed text-muted-foreground">
            {value >= 70 ? weakest.high : weakest.low}
          </p>
        );
      })()}
    </div>
  );
}

/* ── chips ───────────────────────────────────────────────────────────────── */

const ACTION_TONE: Record<
  ReturnType<typeof actionSpec>["tone"],
  string
> = {
  go: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  build: "border-primary/40 bg-primary/10 text-primary",
  wait: "border-border bg-muted text-muted-foreground",
  ask: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  park: "border-border bg-transparent text-muted-foreground/80",
};

function actionSpec(action: string) {
  return ACTION_COPY[keyOf<RecommendedAction>(action, RECOMMENDED_ACTIONS, "park")];
}

export function ActionChip({
  action,
  className,
}: {
  action: string;
  className?: string;
}) {
  const spec = actionSpec(action);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            "inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
            ACTION_TONE[spec.tone],
            className,
          )}
        >
          {spec.label}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-56 text-[11px]">
        {spec.meaning}
      </TooltipContent>
    </Tooltip>
  );
}

export function EndowmentChip({ endowment }: { endowment: string }) {
  const key = keyOf<Endowment>(endowment, ENDOWMENTS, "expertise");
  const copy = ENDOWMENT_COPY[key];
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex shrink-0 items-center rounded border border-border/70 bg-muted/50 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {copy.label}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-56 text-[11px]">
        {copy.hint}
      </TooltipContent>
    </Tooltip>
  );
}

/* ── deadlines ───────────────────────────────────────────────────────────── */

const URGENCY_PILL: Record<Urgency, string> = {
  expired: "border-border bg-muted text-muted-foreground line-through",
  critical:
    "border-destructive/50 bg-destructive text-destructive-foreground shadow-sm",
  today:
    "border-amber-500/50 bg-amber-500/15 text-amber-700 dark:text-amber-300",
  soon: "border-border bg-muted/60 text-foreground",
  later: "border-border/60 bg-transparent text-muted-foreground",
};

export function DeadlinePill({
  deadlineAt,
  now,
  className,
}: {
  deadlineAt: string | null;
  now: Date;
  className?: string;
}) {
  const read = readDeadline(deadlineAt, now);
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold tabular-nums",
        URGENCY_PILL[read.urgency],
        read.urgency === "critical" && "animate-pulse motion-reduce:animate-none",
        className,
      )}
      title={deadlineAt ?? "No deadline recorded"}
    >
      <Clock className="h-3 w-3" aria-hidden="true" />
      {read.label}
    </span>
  );
}

/* ── match score (source requests) ───────────────────────────────────────── */

export function MatchScore({ value }: { value: number }) {
  const band = scoreBand(value);
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={cn(
          "text-sm font-semibold tabular-nums leading-none",
          BAND_TEXT[band],
        )}
      >
        {value}
      </span>
      <span className="h-1.5 w-10 overflow-hidden rounded-full bg-muted">
        <span
          className={cn("block h-full rounded-full", BAND_BAR[band])}
          style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
        />
      </span>
    </span>
  );
}

/* ── status ──────────────────────────────────────────────────────────────── */

export function StatusPill({ label }: { label: string }) {
  return (
    <Badge variant="outline" className="shrink-0 border-border/70 font-medium">
      {label}
    </Badge>
  );
}

/** Section heading used across the detail panel. Nothing else does headings. */
export function PanelSection({
  title,
  aside,
  children,
}: {
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-border/60 px-4 py-3.5 first:border-t-0">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h3>
        {aside}
      </div>
      {children}
    </section>
  );
}
