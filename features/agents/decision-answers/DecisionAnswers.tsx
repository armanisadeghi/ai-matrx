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
  formatDecisionAnswer,
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
  className,
}: {
  value: number;
  threshold?: number | null;
  className?: string;
}) {
  const under = threshold != null && value < threshold;
  return (
    <div
      className={cn(
        "relative h-1.5 w-full min-w-[3rem] rounded-full bg-muted overflow-hidden",
        className,
      )}
    >
      <div
        className={cn(
          "h-full rounded-full",
          under ? "bg-amber-500" : "bg-emerald-500",
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
function Distribution({
  answer,
  threshold,
}: {
  answer: DecisionAnswerView;
  threshold?: number | null;
}) {
  if (answer.probabilities.length === 0) return null;
  return (
    <div className="mt-1 flex flex-col gap-0.5">
      {answer.probabilities.map((entry) => (
        <div
          key={entry.key}
          className={cn(
            "grid grid-cols-[minmax(4rem,9rem)_1fr_2.5rem] items-center gap-1.5 text-[10px]",
            entry.key === answer.answerKey && "text-foreground",
          )}
        >
          <span
            className={cn(
              "truncate text-muted-foreground",
              entry.key === answer.answerKey && "font-medium text-foreground",
            )}
            title={entry.label}
          >
            {entry.label}
          </span>
          <ProbabilityBar
            value={entry.value}
            threshold={
              answer.type === "noul" && entry.key === "true" ? threshold : null
            }
          />
          <span className="text-right font-mono text-muted-foreground">
            {percent(entry.value)}
          </span>
        </div>
      ))}
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
  className?: string;
}

export function DecisionAnswers({
  view,
  instructions,
  thresholds,
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
      {/* One row. Model, method, cost — nothing repeated, nothing explained. */}
      <div className="flex items-center gap-2 flex-wrap border-b border-border px-2 py-1.5">
        <span className="font-medium">Answers</span>
        <span className="font-mono text-[10px] text-muted-foreground">
          {view.answers.length}
        </span>
        {view.model && (
          <span className="font-mono text-[10px] text-muted-foreground">
            {view.model}
          </span>
        )}
        {method ? (
          <span
            className={cn(
              "rounded px-1.5 py-0.5 text-[10px]",
              method === "native"
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
            )}
            title={METHOD_EXPLANATIONS[method]}
          >
            {METHOD_LABELS[method]}
          </span>
        ) : (
          <span
            className="inline-flex items-center gap-1 rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] text-destructive"
            title="Without a method, there is no way to tell a measured probability from one the model wrote out."
          >
            <AlertTriangle className="w-3 h-3" />
            method not stated
          </span>
        )}
        {view.costUsd != null && (
          <span className="ml-auto font-mono text-[10px] text-muted-foreground">
            {formatUsd(view.costUsd, { digits: "adaptive" })}
          </span>
        )}
      </div>

      <div className="divide-y divide-border/60">
        {view.answers.map((answer) => {
          const instruction = instructions?.[answer.name] ?? answer.instruction;
          const threshold =
            thresholds?.[answer.name] ?? answer.suggestedThreshold;
          const probability = answerProbability(answer);
          const unreadable = answer.answer === null;
          return (
            <div key={answer.name} className="px-2 py-1.5">
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="font-mono text-[10px] text-muted-foreground">
                  {answer.name}
                </span>
                <span
                  className={cn(
                    "font-medium",
                    unreadable && "text-destructive",
                  )}
                >
                  {formatDecisionAnswer(answer)}
                </span>
                {probability != null && (
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {percent(probability)}
                  </span>
                )}
                {answer.confidence != null && (
                  <span
                    className="font-mono text-[10px] text-muted-foreground"
                    title="How sure the holder is of this answer."
                  >
                    conf {percent(answer.confidence)}
                  </span>
                )}
              </div>

              {instruction && (
                <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                  {instruction}
                </p>
              )}

              <Distribution answer={answer} threshold={threshold} />

              {threshold != null && (
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  Author&rsquo;s suggested cut {percent(threshold)} — the
                  consumer decides.
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
