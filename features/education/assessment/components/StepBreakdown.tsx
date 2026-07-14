"use client";

// features/education/assessment/components/StepBreakdown.tsx
//
// Renders the per-step breakdown of a step-level grade (StepGradeVerdict.steps)
// — the headline differentiator of the vision/handwritten grader: instead of one
// blunt right/wrong, it shows each reasoning step and pinpoints exactly where the
// work broke. Shared by the assessment take flow feedback AND the standalone
// "Grade my handwritten work" surface. Pure presentational — hand it steps.
//
// React Compiler is on: no manual useMemo / useCallback / React.memo.

import { CheckCircle2, XCircle, MinusCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { GradeResult, GradeStep } from "@/features/education/trust/types";

const STEP_STYLE: Record<
  GradeResult,
  { icon: typeof CheckCircle2; className: string; rail: string }
> = {
  correct: {
    icon: CheckCircle2,
    className: "text-green-600 dark:text-green-400",
    rail: "bg-green-400 dark:bg-green-600",
  },
  partial: {
    icon: MinusCircle,
    className: "text-amber-600 dark:text-amber-400",
    rail: "bg-amber-400 dark:bg-amber-600",
  },
  incorrect: {
    icon: XCircle,
    className: "text-red-600 dark:text-red-400",
    rail: "bg-red-400 dark:bg-red-600",
  },
};

export function StepBreakdown({
  steps,
  className,
}: {
  steps: GradeStep[];
  className?: string;
}) {
  if (!steps || steps.length === 0) return null;
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        Step-by-step
      </p>
      <ol className="flex flex-col gap-1.5">
        {steps.map((step, i) => {
          const style = STEP_STYLE[step.status];
          const Icon = style.icon;
          return (
            <li
              key={i}
              className="flex gap-2.5 rounded-lg border border-border bg-card px-3 py-2"
            >
              <span className="relative flex flex-col items-center pt-0.5">
                <Icon className={cn("h-4 w-4 shrink-0", style.className)} />
                {i < steps.length - 1 && (
                  <span className={cn("mt-1 w-px flex-1", style.rail)} />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">
                  {step.stepLabel}
                </p>
                {step.note && (
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {step.note}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
