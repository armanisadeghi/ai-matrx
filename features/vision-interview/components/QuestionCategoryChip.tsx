"use client";

// features/vision-interview/components/QuestionCategoryChip.tsx
//
// The ONE category chip for interview questions — semantic/chart tokens only,
// Lucide icon per category (no emojis). A null category on old rows reads as
// "gap" (questionCategory in ../types). Consumed by the questions panel and
// the composer's next-questions strip so the category language is identical
// everywhere.

import { cn } from "@/lib/utils";
import {
  QUESTION_CATEGORIES,
  questionCategory,
  type InterviewQuestionRow,
} from "../types";

export function QuestionCategoryChip({
  question,
  className,
}: {
  question: Pick<InterviewQuestionRow, "category">;
  className?: string;
}) {
  const meta = QUESTION_CATEGORIES[questionCategory(question)];
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full border px-1.5 py-px text-[10px] font-medium",
        meta.chip,
        className,
      )}
      title={`${meta.label} question`}
    >
      <Icon className="h-2.5 w-2.5" aria-hidden />
      {meta.label}
    </span>
  );
}
