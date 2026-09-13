"use client";

// features/question-desk/components/QuestionDeskRail.tsx
//
// The left rail: who is being asked and how far through they are, the queue
// with one dot per question, and the key legend that makes this surface
// keyboard-first rather than keyboard-capable.
//
// Above 900px it is a sticky column beside the question; below, it collapses
// to a band ABOVE the content (never a drawer that hides the progress).

import { cn } from "@/lib/utils";
import type { DecisionInterviewRow, DecisionQuestionRow } from "../types";
import { isAnswered } from "../types";

export interface QuestionDeskRailProps {
  interview: DecisionInterviewRow;
  queue: DecisionQuestionRow[];
  currentId: string | null;
  onGoTo: (questionId: string) => void;
  answeredCount: number;
  totalCount: number;
  /** Rendered under the legend — the live/failed state of this surface. */
  footer?: React.ReactNode;
}

export function QuestionDeskRail({
  interview,
  queue,
  currentId,
  onGoTo,
  answeredCount,
  totalCount,
  footer,
}: QuestionDeskRailProps) {
  const percent = totalCount === 0 ? 0 : (answeredCount / totalCount) * 100;

  return (
    <aside className="flex flex-col gap-4 border-b border-border bg-muted/40 px-4 py-4 lg:sticky lg:top-0 lg:h-dvh lg:w-[260px] lg:shrink-0 lg:overflow-y-auto lg:border-b-0 lg:border-r">
      <div>
        <h1 className="qd-editorial text-xl leading-tight font-semibold tracking-tight text-foreground">
          {interview.title}
        </h1>
        {interview.subtitle ? (
          <p className="mt-1.5 font-mono text-[10.5px] tracking-[0.12em] uppercase text-muted-foreground">
            {interview.subtitle}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="h-[5px] overflow-hidden rounded-full bg-border">
          <div
            className="h-full rounded-full bg-success transition-[width] duration-300"
            style={{ width: `${percent}%` }}
          />
        </div>
        <b className="font-mono text-[11px] font-medium tracking-wide text-muted-foreground">
          {answeredCount} of {totalCount} answered
        </b>
      </div>

      <ul className="flex max-h-[38vh] list-none flex-col gap-0.5 overflow-y-auto p-0 lg:max-h-none lg:overflow-visible">
        {queue.map((question) => {
          const answered = isAnswered(question);
          const shipped = question.verdict === "skip";
          const overturned = question.verdict === "overturn";
          return (
            <li key={question.id}>
              <button
                type="button"
                aria-current={question.id === currentId}
                onClick={() => onGoTo(question.id)}
                className={cn(
                  "flex w-full items-start gap-2.5 rounded-md px-2 py-2 text-left text-[12.5px] leading-snug text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  question.id === currentId &&
                    "bg-card font-medium text-foreground shadow-sm",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "mt-[5px] size-[7px] shrink-0 rounded-full bg-border",
                    answered && "bg-success",
                    shipped && "bg-warning",
                    overturned && "bg-destructive",
                  )}
                />
                <span className="min-w-0 break-words">{question.title}</span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="mt-auto space-y-2 border-t border-border pt-3.5">
        {/* A phone has no keyboard, so a key legend there is an affordance
            that cannot be used. It is not dimmed or disabled — it is absent. */}
        <dl className="hidden grid-cols-[auto_1fr] gap-x-2 gap-y-1 font-mono text-[10.5px] leading-relaxed text-muted-foreground lg:grid">
          <Key k="1" label="take the recommendation" />
          <Key k="2" label="skip" />
          <Key k="3" label="not mine — you decide" />
          <Key k="W" label="write an answer" />
          <Key k="V" label="answer by voice" />
          <Key k="R" label="read aloud" />
          <Key k="T" label="table view" />
          <Key k="J / K" label="next / previous" />
          <Key k="Esc" label="stop audio / cancel" />
        </dl>
        {footer}
      </div>
    </aside>
  );
}

function Key({ k, label }: { k: string; label: string }) {
  return (
    <>
      <dt className="rounded border border-border bg-muted px-1.5 text-center text-foreground/80">
        {k}
      </dt>
      <dd className="m-0">{label}</dd>
    </>
  );
}
