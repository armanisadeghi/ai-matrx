"use client";

// features/flashcards/fast-fire/components/AnswerGradeBlock.tsx
//
// THE verdict render for a spoken answer — the `answer_grade` kind (the
// `flashcards.grade_spoken` mandate's output: core verdict + score + rubric +
// transcript + what was missed), drawn by the kind's registered component
// through the canonical kind render path (KindInstanceRender ->
// applyIrKindRoute). Mounted by the single-card voice test and the audio
// review session, which used to carry the same verdict block twice
// (agent-manifest wave 1, 2026-08-22). The FastFire scoreboard stays custom
// (a table of grades, not one verdict).

import { CheckCircle2, AlertCircle, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import KindInstanceRender from "@/features/content-ir/studio/components/KindInstanceRender";
import { verdictResult, type GradeResult } from "@/features/education/trust/types";
import {
  ANSWER_GRADE_KIND,
  answerGradeValue,
  type SpokenGrade,
} from "../agents/grading-core";

export function AnswerGradeBlock({
  grade,
  className,
}: {
  grade: SpokenGrade;
  className?: string;
}) {
  return (
    <div className={cn("w-full text-left", className)}>
      <KindInstanceRender
        kind={ANSWER_GRADE_KIND}
        value={answerGradeValue(grade)}
        variant="bare"
        showRoutingNote={false}
        // Registry floor: a held/cold component must never put a JSON
        // document in front of a learner who just answered out loud.
        unroutableFallback={<PlainVerdict grade={grade} />}
      />
    </div>
  );
}

const RESULT_STYLE: Record<
  GradeResult,
  { label: string; icon: typeof CheckCircle2; text: string; bg: string }
> = {
  correct: {
    label: "Correct",
    icon: CheckCircle2,
    text: "text-green-600 dark:text-green-400",
    bg: "bg-green-500/10",
  },
  partial: {
    label: "Almost",
    icon: AlertCircle,
    text: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-500/10",
  },
  incorrect: {
    label: "Not quite",
    icon: XCircle,
    text: "text-red-600 dark:text-red-400",
    bg: "bg-red-500/10",
  },
};

function PlainVerdict({ grade }: { grade: SpokenGrade }) {
  const style = RESULT_STYLE[verdictResult(grade.verdict)];
  return (
    <div className="flex w-full flex-col items-center gap-3 text-center">
      <div
        className={cn(
          "flex h-14 w-14 items-center justify-center rounded-full",
          style.bg,
        )}
      >
        <style.icon className={cn("h-7 w-7", style.text)} />
      </div>
      <div>
        <div className={cn("text-lg font-semibold", style.text)}>
          {style.label}
        </div>
        <div className="mt-0.5 text-sm text-muted-foreground">
          Score {Math.round(grade.score * 100)}%
        </div>
      </div>
      {grade.verdict.explanation && (
        <p className="text-sm text-foreground">{grade.verdict.explanation}</p>
      )}
      {grade.missing.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Missed: {grade.missing.join(", ")}
        </p>
      )}
      {grade.transcript && (
        <p className="w-full rounded-lg bg-muted/50 px-3 py-2 text-left text-xs italic text-muted-foreground">
          What I heard: {grade.transcript}
        </p>
      )}
    </div>
  );
}
