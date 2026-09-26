"use client";

/**
 * `decision_answers` — THE renderer. One primitive, every surface.
 *
 * The runner, the battle's comparison table, a workflow node's output panel
 * and any custom app that binds this kind all render THIS. A decision answer
 * without its probability, its confidence and the METHOD that produced the
 * probability is a number pretending to be a measurement, and the second
 * surface that draws its own version is the one that quietly drops the method
 * tag — so there is one.
 *
 * Contract: `common-docs/systems/agents/typed-messages/FEATURE.md`.
 */

import { AlertTriangle, Ban } from "lucide-react";
import { formatUsd } from "@ai-matrx/kit/format";
import { cn } from "@/lib/utils";
import {
  answerProbability,
  formatAnswerHeadline,
  METHOD_EXPLANATIONS,
  METHOD_LABELS,
  type DecisionAnswerView,
  type DecisionAnswersView,
} from "./read";

function percent(value: number | null): string {
  if (value == null) return "—";
  return `${Math.round(value * 100)}%`;
}

/** A probability bar. Amber under the threshold the author suggested. */
function ProbabilityBar({
  value,
  threshold,
  peak,
  className,
}: {
  value: number;
  threshold?: number | null;
  /** Only the answer given is coloured; the rest of the spread stays grey. */
  peak: boolean;
  className?: string;
}) {
  const under = threshold != null && value < threshold;
  return (
    <div
      className={cn(
        "relative h-1.5 w-full min-w-[3rem] rounded-full bg-border/60 overflow-hidden",
        className,
      )}
    >
      <div
        className={cn(
          "h-full rounded-full",
          !peak
            ? "bg-muted-foreground/40"
            : under
              ? "bg-amber-500"
              : "bg-emerald-500",
        )}
        style={{ width: `${Math.max(2, Math.min(100, value * 100))}%` }}
      />
      {threshold != null && (
        <span
          className="absolute top-0 h-full w-px bg-foreground/50"
          style={{ left: `${Math.min(100, threshold * 100)}%` }}
          title={`Suggested threshold ${percent(threshold)}`}
        />
      )}
    </div>
  );
}

/**
 * The distribution, one row per option or level. A Yes/No carries one too
 * (Yes p / No 1−p, synthesised by the reader), so the complement is visible
 * instead of implied — and the author's threshold, which is stated on the
 * true-probability scale, is marked on the Yes row rather than on whichever
 * answer came back.
 */
/** Choice options under this share fold into one "+N below 5%" line. */
const MINOR_SHARE = 0.05;

function Distribution({
  answer,
  threshold,
}: {
  answer: DecisionAnswerView;
  threshold?: number | null;
}) {
  if (answer.probabilities.length === 0) return null;
  // A score is a scale: its levels stay in level order so the shape reads.
  // A choice is sorted by share and its long tail folds away.
  const ordered =
    answer.type === "score"
      ? [...answer.probabilities].sort((a, b) => Number(a.key) - Number(b.key))
      : answer.probabilities;
  const shown =
    answer.type === "choice"
      ? ordered.filter(
          (e) => e.value >= MINOR_SHARE || e.key === answer.answerKey,
        )
      : ordered;
  const folded = ordered.length - shown.length;
  return (
    <div className="mt-1.5 flex flex-col gap-1">
      {shown.map((entry) => {
        const peak = entry.key === answer.answerKey;
        return (
          <div
            key={entry.key}
            className="grid grid-cols-[minmax(4.5rem,10rem)_minmax(3rem,14rem)_2.5rem] items-center gap-2 text-[11px]"
            data-peak={peak ? "true" : undefined}
          >
            <span
              className={cn(
                "truncate",
                peak ? "font-medium text-foreground" : "text-muted-foreground",
              )}
              title={entry.label}
            >
              {entry.label}
            </span>
            <ProbabilityBar
              value={entry.value}
              peak={peak}
              threshold={
                answer.type === "noul" && entry.key === "true"
                  ? threshold
                  : null
              }
            />
            <span
              className={cn(
                "text-right tabular-nums",
                peak ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {percent(entry.value)}
            </span>
          </div>
        );
      })}
      {folded > 0 && (
        <span className="text-[11px] text-muted-foreground">
          +{folded} more under {percent(MINOR_SHARE)}
        </span>
      )}
    </div>
  );
}

export interface DecisionAnswersProps {
  view: DecisionAnswersView;
  /**
   * The question as asked, by field name. The answers payload does not carry
   * the instruction — the questions part does — so the surface that has both
   * supplies it and the surface that has only the answer says so.
   */
  instructions?: Record<string, string>;
  /** Author-suggested cuts, by field name. */
  thresholds?: Record<string, number>;
  /** False when the host already shows the question right above the card. */
  showInstructions?: boolean;
  className?: string;
}

export function DecisionAnswers({
  view,
  instructions,
  thresholds,
  showInstructions = true,
  className,
}: DecisionAnswersProps) {
  const method = view.method;
  return (
    <div
      className={cn(
        "w-full rounded-lg border border-border bg-card text-xs",
        className,
      )}
    >
      {/* One quiet row. Model, method, cost are provenance — secondary. */}
      <div className="flex items-center gap-2 flex-wrap border-b border-border px-3 py-1.5 text-[11px] text-muted-foreground">
        <span className="font-medium text-foreground">
          {view.answers.length === 1
            ? "1 answer"
            : `${view.answers.length} answers`}
        </span>
        {view.model && <span className="truncate">{view.model}</span>}
        {method ? (
          <span
            className={cn(
              "cursor-help",
              method !== "native" &&
                "rounded bg-amber-500/10 px-1.5 py-0.5 text-amber-700 dark:text-amber-400",
            )}
            title={METHOD_EXPLANATIONS[method]}
          >
            {METHOD_LABELS[method]} probabilities
          </span>
        ) : (
          <span
            className="inline-flex items-center gap-1 rounded bg-destructive/10 px-1.5 py-0.5 text-destructive"
            title="Without a method, there is no way to tell a measured probability from one the model wrote out."
          >
            <AlertTriangle className="w-3 h-3" />
            method not stated
          </span>
        )}
        {view.costUsd != null && (
          <span className="ml-auto tabular-nums">
            {formatUsd(view.costUsd, { digits: "adaptive" })}
          </span>
        )}
      </div>

      <div className="divide-y divide-border/60">
        {view.answers.map((answer) => {
          const instruction = showInstructions
            ? (instructions?.[answer.name] ?? answer.instruction)
            : null;
          const threshold =
            thresholds?.[answer.name] ?? answer.suggestedThreshold;
          const probability = answerProbability(answer);
          const unreadable = answer.answer === null;
          return (
            <div key={answer.name} className="px-3 py-2">
              {instruction && (
                <p className="text-[11px] leading-snug text-muted-foreground">
                  {instruction}
                </p>
              )}
              <div className="mt-0.5 flex items-baseline gap-2 flex-wrap">
                <span
                  className={cn(
                    "text-sm font-semibold",
                    unreadable && "text-destructive",
                  )}
                >
                  {formatAnswerHeadline(answer)}
                </span>
                {probability != null && (
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {percent(probability)}
                  </span>
                )}
                <span className="ml-auto font-mono text-[10px] text-muted-foreground/80">
                  {answer.name}
                </span>
              </div>

              <Distribution answer={answer} threshold={threshold} />

              {(threshold != null ||
                answer.confidence != null ||
                (answer.type === "score" &&
                  typeof answer.answer === "number")) && (
                <p className="mt-1 flex flex-wrap gap-x-3 text-[10px] tabular-nums text-muted-foreground">
                  {answer.type === "score" &&
                    typeof answer.answer === "number" && (
                      <span title="The probability-weighted average level.">
                        Average level {answer.answer.toFixed(1)}
                      </span>
                    )}
                  {answer.confidence != null && (
                    <span title="How sure the holder is of this answer.">
                      Confidence {percent(answer.confidence)}
                    </span>
                  )}
                  {threshold != null && (
                    <span title="The author's suggested cut — the consumer decides.">
                      Suggested cut {percent(threshold)}
                    </span>
                  )}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {view.refusals.length > 0 && (
        <div className="border-t border-border px-2 py-1.5">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
            <Ban className="w-3 h-3" />
            Refused
          </div>
          <div className="mt-1 flex flex-col gap-0.5">
            {view.refusals.map((refusal) => (
              <div
                key={refusal.name}
                className="flex items-baseline gap-2 text-[11px]"
              >
                <span className="font-mono text-[10px] text-muted-foreground">
                  {refusal.name}
                </span>
                <span>{refusal.reason}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {view.answers.length === 0 && view.refusals.length === 0 && (
        <p className="px-2 py-1.5 text-[11px] text-muted-foreground">
          The holder returned no answers and named no refusals.
        </p>
      )}
    </div>
  );
}
