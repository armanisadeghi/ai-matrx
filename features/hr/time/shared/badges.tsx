"use client";

/**
 * features/hr/time/shared/badges.tsx — the chips that must not lie.
 *
 * Three rules decide everything in this file:
 *
 * 1. 🚨 **LAW 3a — no cell prints a type name.** A category badge's label is
 *    `WorkIntervalRow.earningCodeName` (*Regular*, *PTO*, *Meal premium*), never `hoursCategory`.
 *    The category only picks the COLOUR.
 * 2. 🚨 **`isOvertime` carries distinct visual weight, not just a different word** (SPEC-TIME §5.2).
 *    A manager scanning forty rows finds overtime by shape, not by reading.
 * 3. 🚨 **Two state machines, labelled distinctly** (§14 D8). The row chip and the period chip use
 *    different words and different shapes on purpose, because `pay_period_employment.state` and
 *    `pay_period.state` are different machines that share three member names.
 */

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import type {
  ExceptionSeverity,
  HoursCategory,
  PayPeriodEmploymentState,
  PayPeriodState,
} from "../api/types";
import {
  PAID_LEAVE_TOOLTIP,
  PERIOD_STATE_LABELS,
  ROW_STATE_LABELS,
  SEVERITY_LABELS,
} from "./vocabulary";

const CATEGORY_TONE: Record<HoursCategory, string> = {
  worked: "border-border bg-muted text-foreground",
  paid_leave: "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  unpaid_leave: "border-border bg-transparent text-muted-foreground",
  holiday: "border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300",
  on_call: "border-teal-500/40 bg-teal-500/10 text-teal-700 dark:text-teal-300",
  premium: "border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300",
};

/**
 * One badge per interval.
 *
 * `label` is the server's earning-code name and is REQUIRED — there is no fallback to the category
 * token, because a fallback is how an enum ends up on screen the one time the join is missing.
 */
export function CategoryBadge({
  label,
  category,
  isOvertime = false,
  className,
}: {
  label: string;
  category: HoursCategory;
  isOvertime?: boolean;
  className?: string;
}) {
  const chip = (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] leading-none",
        CATEGORY_TONE[category],
        // Rule 2: overtime is heavier, ringed and uppercase — a different SHAPE, not a synonym.
        isOvertime &&
          "border-amber-500/60 bg-amber-500/15 font-semibold uppercase tracking-wide text-amber-800 ring-1 ring-amber-500/40 dark:text-amber-200",
        className,
      )}
    >
      {label}
    </span>
  );

  // §5.2: the paid-leave badge's tooltip says exactly what paid leave does and does not count for.
  if (category === "paid_leave") {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{chip}</TooltipTrigger>
        <TooltipContent className="max-w-[18rem]">{PAID_LEAVE_TOOLTIP}</TooltipContent>
      </Tooltip>
    );
  }
  return chip;
}

const ROW_STATE_TONE: Record<PayPeriodEmploymentState, string> = {
  open: "border-border bg-muted text-muted-foreground",
  attested: "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  disputed: "border-orange-500/50 bg-orange-500/10 text-orange-700 dark:text-orange-300",
  approved: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  exported: "border-indigo-500/40 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300",
  locked: "border-border bg-foreground/5 text-foreground",
};

/**
 * 🚨 The ROW state — one person's timecard. Pill-shaped, and the label says who did what
 * ("Attested by the employee") rather than repeating a bare token that also exists on the period.
 */
export function RowStateChip({
  state,
  className,
}: {
  state: PayPeriodEmploymentState;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium leading-none",
        ROW_STATE_TONE[state],
        className,
      )}
    >
      {ROW_STATE_LABELS[state]}
    </span>
  );
}

/**
 * 🚨 The PERIOD state — the whole pay group. Square-cornered and prefixed, so it can never be
 * mistaken for the row chip beside it. `submitted` appears HERE and nowhere else (§14 D8).
 */
export function PeriodStateChip({
  state,
  className,
}: {
  state: PayPeriodState;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm border border-border bg-card px-2 py-0.5 text-[11px] font-medium leading-none",
        className,
      )}
    >
      <span className="text-muted-foreground">Pay period</span>
      <span>{PERIOD_STATE_LABELS[state]}</span>
    </span>
  );
}

const SEVERITY_TONE: Record<ExceptionSeverity, string> = {
  info: "border-border bg-muted text-muted-foreground",
  warn: "border-amber-500/50 bg-amber-500/10 text-amber-800 dark:text-amber-200",
  violation: "border-red-500/50 bg-red-500/10 font-semibold text-red-700 dark:text-red-300",
};

export function SeverityChip({
  severity,
  className,
}: {
  severity: ExceptionSeverity;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] leading-none",
        SEVERITY_TONE[severity],
        className,
      )}
    >
      {SEVERITY_LABELS[severity]}
    </span>
  );
}

/**
 * An estimate marker. SPEC-TIME §4.2 invariant 1: the flag stays after acknowledgement, after
 * approval and after export — **acknowledging an estimate confirms it, it does not promote it.**
 */
export function EstimateChip({ className }: { className?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            "inline-flex items-center rounded-full border border-amber-500/50 bg-amber-500/10 px-2 py-0.5 text-[11px] leading-none text-amber-800 dark:text-amber-200",
            className,
          )}
        >
          Estimated
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-[20rem]">
        This end time was written automatically because nobody clocked out. It is an estimate and it
        stays marked as one — confirming it does not turn it into a measurement.
      </TooltipContent>
    </Tooltip>
  );
}
