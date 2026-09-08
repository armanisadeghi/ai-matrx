"use client";

// features/education/assessment/components/take/QuestionView.tsx
//
// Renders ONE assessment question across all 5 types, captures the learner's
// answer, and (once graded) shows meaning-grounded feedback: the verdict, the
// correct answer, the explanation, the TrustEnvelope citations, any named
// misconception, and a grade-override row (grade-on-meaning can be argued).
//
// React Compiler is on: no manual useMemo / useCallback / React.memo.

import { PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@ai-matrx/design-system";
import { cn } from "@/lib/utils";
import { coerceTrustEnvelope } from "@/features/education/trust/types";
import { SourceCitations } from "@/features/education/trust/components/SourceCitations";
import { ConfidenceBadge } from "@/features/education/trust/components/ConfidenceBadge";
import { VerifyAgainstSourceButton } from "@/features/education/trust/components/VerifyAgainstSourceButton";
import { HandwrittenWorkInput } from "../HandwrittenWorkInput";
import { StepBreakdown } from "../StepBreakdown";
import { GradedAnswerBlock } from "../GradedAnswerBlock";
import { canPhotographAnswer } from "./useTakeAssessment";
import type { GradedAnswer } from "../../data/grading";
import type { AssessmentItemRow, AttemptResult, QuestionType } from "../../data/types";
import { ProTextarea } from "@/components/official/ProTextarea";

function optionsOf(item: AssessmentItemRow): string[] {
  const raw = item.options;
  if (Array.isArray(raw))
    return raw.filter((x): x is string => typeof x === "string");
  if (item.question_type === "true_false") return ["True", "False"];
  return [];
}

const DEPTH_LABEL: Record<string, string> = {
  recall: "Recall",
  applied: "Applied",
  exam: "Exam",
};


export function QuestionView({
  item,
  index,
  total,
  response,
  onResponseChange,
  photo = null,
  onPhotoChange,
  graded,
  onOverride,
  disabled,
}: {
  item: AssessmentItemRow;
  index: number;
  total: number;
  response: string;
  onResponseChange: (v: string) => void;
  /** The learner's photographed handwritten work (free-response types only). */
  photo?: File | null;
  onPhotoChange?: (file: File | null) => void;
  graded: GradedAnswer | null;
  onOverride?: (result: AttemptResult) => void;
  disabled?: boolean;
}) {
  const type = item.question_type as QuestionType;
  const options = optionsOf(item);
  const locked = graded !== null || disabled;
  const trust = coerceTrustEnvelope(item.trust);
  const photoable = canPhotographAnswer(type) && !!onPhotoChange;

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      {/* Meta line */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
        <span className="font-medium">
          Question {index + 1} of {total}
        </span>
        {item.depth && (
          <span className="rounded-full border border-border bg-muted px-1.5 py-0 uppercase tracking-wider">
            {DEPTH_LABEL[item.depth] ?? item.depth}
          </span>
        )}
        {item.topic && <span className="truncate">· {item.topic}</span>}
        <ConfidenceBadge confidence={trust?.confidence} className="ml-auto" />
      </div>

      <p className="mt-2 text-lg font-medium leading-snug text-foreground">
        {item.prompt}
      </p>

      {/* Answer capture */}
      <div className="mt-4">
        {type === "multiple_choice" || type === "true_false" ? (
          <div className="flex flex-col gap-2">
            {options.map((opt) => {
              const selected = response === opt;
              const isCorrect = graded && opt === item.correct_answer;
              const isWrongPick = graded && selected && opt !== item.correct_answer;
              return (
                <button
                  key={opt}
                  type="button"
                  disabled={locked}
                  onClick={() => onResponseChange(opt)}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors",
                    !graded && selected && "border-primary bg-primary/5",
                    !graded && !selected && "border-border hover:bg-accent/40",
                    isCorrect &&
                      "border-green-400 bg-green-50 dark:bg-green-950/30",
                    isWrongPick && "border-red-400 bg-red-50 dark:bg-red-950/30",
                    graded && !isCorrect && !isWrongPick && "border-border opacity-70",
                    locked && "cursor-default",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                      selected ? "border-primary" : "border-muted-foreground/40",
                    )}
                  >
                    {selected && <span className="h-2 w-2 rounded-full bg-primary" />}
                  </span>
                  <span className="text-foreground">{opt}</span>
                </button>
              );
            })}
          </div>
        ) : type === "fill_blank" ? (
          <Input
            value={response}
            onChange={(e) => onResponseChange(e.target.value)}
            placeholder="Type the missing word or phrase…"
            className="text-base"
            disabled={locked}
          />
        ) : (
          <div className="flex flex-col gap-3">
            <ProTextarea
              value={response}
              onChange={(e) => onResponseChange(e.target.value)}
              placeholder={
                type === "written_response"
                  ? "Write your response…"
                  : "Type your answer…"
              }
              className={cn(
                "text-base",
                type === "written_response" ? "min-h-[140px]" : "min-h-[72px]",
              )}
              disabled={locked || !!photo}
            />
            {photoable && (
              <>
                <div className="flex items-center gap-3">
                  <span className="h-px flex-1 bg-border" />
                  <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    or photograph your handwritten work
                  </span>
                  <span className="h-px flex-1 bg-border" />
                </div>
                <HandwrittenWorkInput
                  photo={photo}
                  onPhotoChange={(f) => onPhotoChange?.(f)}
                  disabled={locked}
                />
              </>
            )}
          </div>
        )}
      </div>

      {/* Feedback (post-grade) */}
      {graded && (
        <FeedbackBlock
          item={item}
          graded={graded}
          trust={trust}
          onOverride={onOverride}
        />
      )}
    </div>
  );
}

function FeedbackBlock({
  item,
  graded,
  trust,
  onOverride,
}: {
  item: AssessmentItemRow;
  graded: GradedAnswer;
  trust: ReturnType<typeof coerceTrustEnvelope>;
  onOverride?: (result: AttemptResult) => void;
}) {
  const type = item.question_type as QuestionType;
  const showCorrect =
    (type === "multiple_choice" ||
      type === "true_false" ||
      type === "fill_blank" ||
      type === "short_answer") &&
    !!item.correct_answer;

  return (
    <div className="mt-4 flex flex-col gap-3">
      {/* The verdict is the `answer_grade` kind, drawn by its component. */}
      <GradedAnswerBlock graded={graded} />

      {showCorrect && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm dark:border-green-900 dark:bg-green-950/30">
          <p className="text-[11px] font-medium uppercase tracking-wider text-green-700/80 dark:text-green-400/80">
            {type === "short_answer" ? "Model answer" : "Correct answer"}
          </p>
          <p className="mt-0.5 text-green-900 dark:text-green-200">
            {item.correct_answer}
          </p>
        </div>
      )}

      {graded.steps && graded.steps.length > 0 && (
        <StepBreakdown steps={graded.steps} />
      )}

      <SourceCitations trust={trust} />
      <VerifyAgainstSourceButton
        trust={trust}
        front={item.prompt}
        back={item.correct_answer ?? ""}
      />

      {/* Grade override — the learner can argue a meaning-graded verdict. */}
      {onOverride && graded.gradedBy !== "local" && (
        <div className="flex items-center gap-2 pt-1">
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <PenLine className="h-3 w-3" />
            Adjust grade:
          </span>
          {(["correct", "partial", "incorrect"] as AttemptResult[]).map((r) => (
            <Button
              key={r}
              size="sm"
              variant={graded.result === r ? "default" : "outline"}
              className="h-7 px-2 text-xs capitalize"
              onClick={() => onOverride(r)}
            >
              {r}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
