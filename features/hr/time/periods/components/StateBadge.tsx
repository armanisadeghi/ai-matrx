"use client";

/**
 * features/hr/time/periods/components/StateBadge.tsx — ONE badge, TWO machines, never mixed.
 *
 * 🚨 SPEC-TIME §14 D8: the period's state and an employee row's state are different machines that
 * share three token spellings. This component takes a `machine` prop precisely so a caller cannot
 * render a row state with the period's vocabulary by accident — the label sets are separate
 * constants in `../periodStateMachine.ts` and neither is reachable through the other.
 *
 * Semantic colour tokens only. No emoji.
 */

import { cn } from "@/lib/utils";
import type { PayPeriodEmploymentState, PayPeriodState } from "../../api/types";
import {
  PERIOD_STATE_LABEL,
  PERIOD_STATE_MEANING,
  PERIOD_STATE_TONE,
  ROW_STATE_LABEL,
  ROW_STATE_TONE,
  type StateTone,
} from "../periodStateMachine";

const TONE_CLASS: Record<StateTone, string> = {
  neutral: "bg-muted text-muted-foreground border-border",
  progress: "bg-primary/10 text-primary border-primary/30",
  positive: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  locked: "bg-secondary text-secondary-foreground border-border",
  warning: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/40",
};

type Props =
  | { machine: "period"; state: PayPeriodState; className?: string }
  | { machine: "row"; state: PayPeriodEmploymentState; className?: string };

export function StateBadge(props: Props) {
  const isPeriod = props.machine === "period";
  const label = isPeriod
    ? PERIOD_STATE_LABEL[props.state]
    : ROW_STATE_LABEL[props.state];
  const tone = isPeriod ? PERIOD_STATE_TONE[props.state] : ROW_STATE_TONE[props.state];
  const title = isPeriod ? PERIOD_STATE_MEANING[props.state] : undefined;

  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap",
        TONE_CLASS[tone],
        props.className,
      )}
    >
      {label}
    </span>
  );
}
