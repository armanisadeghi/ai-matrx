"use client";

// features/vision-interview/components/QuestionCard.tsx
//
// ONE question, ONE card. The room v3 left panel is a stack of these — the
// question is the hero (readable, foreground, never tiny dim gray), and
// everything else is a quiet band around it. Arman's rejection of v2: every
// question blended into every other one.
//
// Status is explicit and human — Open · Pending · Answered · Dismissed — and
// a Pending card SAYS what pending means ("sends with your next message"),
// because a state the user has to infer is a state the user distrusts.
//
// The action set here is the SAME action set inside AnswerQuestionWindow
// (Arman: the list view and the focused view never disagree).

import {
  Check,
  Clock3,
  CornerUpLeft,
  PenLine,
  Trash2,
  Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { QuestionCategoryChip } from "./QuestionCategoryChip";
import {
  ROLES,
  type InterviewQuestionRow,
  type RoleKey,
} from "../types";

/** The four states a human is asked to understand. Nothing else. */
export type QuestionStatus = "open" | "pending" | "answered" | "dismissed";

export function questionStatus(
  question: InterviewQuestionRow,
  hasPendingAnswer: boolean,
): QuestionStatus {
  if (question.state === "answered") return "answered";
  if (question.state === "deferred") return "dismissed";
  return hasPendingAnswer ? "pending" : "open";
}

const STATUS_META: Record<
  QuestionStatus,
  { label: string; chip: string; rail: string }
> = {
  open: {
    label: "Open",
    chip: "border-border bg-muted text-muted-foreground",
    rail: "bg-border",
  },
  pending: {
    label: "Pending",
    chip: "border-primary/40 bg-primary/10 text-primary",
    rail: "bg-primary",
  },
  answered: {
    label: "Answered",
    chip: "border-success/40 bg-success/10 text-success",
    rail: "bg-success",
  },
  dismissed: {
    label: "Dismissed",
    chip: "border-border bg-background text-muted-foreground",
    rail: "bg-border",
  },
};

function ageLabel(round_raised: number, currentRound: number): string {
  const age = Math.max(0, currentRound - round_raised);
  if (age === 0) return "this round";
  return `${age} round${age === 1 ? "" : "s"} old`;
}

export interface QuestionCardProps {
  question: InterviewQuestionRow;
  currentRound: number;
  /** The locally-saved answer waiting to ride the next message, if any. */
  pendingAnswer: string | null;
  onAnswer: (question: InterviewQuestionRow) => void;
  onDiscardAnswer: (question: InterviewQuestionRow) => void;
  onDismiss: (question: InterviewQuestionRow) => void;
  onReopen: (question: InterviewQuestionRow) => void;
  busy?: boolean;
}

export function QuestionCard({
  question,
  currentRound,
  pendingAnswer,
  onAnswer,
  onDiscardAnswer,
  onDismiss,
  onReopen,
  busy = false,
}: QuestionCardProps) {
  const status = questionStatus(question, pendingAnswer !== null);
  const meta = STATUS_META[status];
  const age = Math.max(0, currentRound - question.round_raised);
  const nagging = status === "open" && age >= 3;
  const raisedBy =
    question.raised_by === "human"
      ? "You"
      : question.raised_by
        ? (ROLES[question.raised_by as RoleKey]?.name ?? null)
        : null;

  return (
    <article
      className={cn(
        "relative overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-colors",
        "hover:border-primary/40",
        status === "pending" && "border-primary/30",
        status === "dismissed" && "opacity-70",
      )}
    >
      <span
        className={cn("absolute inset-y-0 left-0 w-[3px]", meta.rail)}
        aria-hidden
      />

      <div className="space-y-2 py-2.5 pl-3.5 pr-2.5">
        {/* Band 1 — what kind of question, and where it stands. */}
        <div className="flex flex-wrap items-center gap-1.5">
          <QuestionCategoryChip question={question} />
          <span
            className={cn(
              "inline-flex items-center rounded-full border px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide",
              meta.chip,
            )}
          >
            {meta.label}
          </span>
          <span
            className={cn(
              "ml-auto shrink-0 text-[10px]",
              nagging ? "font-semibold text-warning" : "text-muted-foreground",
            )}
            title={
              raisedBy ? `Raised by ${raisedBy} in round ${question.round_raised}` : undefined
            }
          >
            {raisedBy ? `${raisedBy} · ` : ""}
            {ageLabel(question.round_raised, currentRound)}
          </span>
        </div>

        {/* Band 2 — the hero. */}
        <p className="text-[13.5px] font-medium leading-snug text-foreground">
          {question.question}
        </p>

        {question.state === "partially_answered" && question.missing_part && (
          <p className="rounded-md border border-warning/30 bg-warning/5 px-2 py-1 text-[11px] leading-snug text-foreground">
            Still missing: {question.missing_part}
          </p>
        )}

        {/* Band 3 — the saved answer, and what "saved" means. */}
        {pendingAnswer !== null && (
          <div className="rounded-md border border-primary/25 bg-primary/5 px-2 py-1.5">
            <p className="line-clamp-3 whitespace-pre-wrap text-[11.5px] leading-snug text-foreground">
              {pendingAnswer}
            </p>
            <p className="mt-1 flex items-center gap-1 text-[10px] font-medium text-primary">
              <Clock3 className="h-3 w-3 shrink-0" aria-hidden />
              Saved — sends with your next message
            </p>
          </div>
        )}

        {question.state === "answered" && question.answer_note && (
          <p className="flex items-start gap-1 text-[11px] leading-snug text-muted-foreground">
            <Check className="mt-px h-3 w-3 shrink-0 text-success" aria-hidden />
            {question.answer_note}
          </p>
        )}

        {/* Band 4 — the actions. Same set as the answer window. */}
        <div className="flex flex-wrap items-center gap-1">
          {status === "dismissed" ? (
            <Button
              variant="outline"
              size="sm"
              className="h-11 gap-1 px-2.5 text-xs sm:h-7"
              disabled={busy}
              onClick={() => onReopen(question)}
            >
              <Undo2 className="h-3.5 w-3.5" aria-hidden />
              Restore
            </Button>
          ) : (
            <Button
              variant={pendingAnswer !== null ? "outline" : "default"}
              size="sm"
              className="h-11 gap-1 px-2.5 text-xs sm:h-7"
              onClick={() => onAnswer(question)}
            >
              {pendingAnswer !== null ? (
                <>
                  <PenLine className="h-3.5 w-3.5" aria-hidden />
                  Edit answer
                </>
              ) : (
                <>
                  <CornerUpLeft className="h-3.5 w-3.5" aria-hidden />
                  Answer
                </>
              )}
            </Button>
          )}

          {pendingAnswer !== null && (
            <Button
              variant="ghost"
              size="sm"
              className="h-11 gap-1 px-2 text-xs text-muted-foreground sm:h-7"
              onClick={() => onDiscardAnswer(question)}
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
              Discard
            </Button>
          )}

          {status !== "dismissed" && (
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto h-11 px-2 text-xs text-muted-foreground sm:h-7"
              disabled={busy}
              onClick={() => onDismiss(question)}
              title="Set this question aside — the room stops pressing it"
            >
              Dismiss
            </Button>
          )}
        </div>
      </div>
    </article>
  );
}
