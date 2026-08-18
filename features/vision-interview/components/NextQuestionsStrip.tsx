"use client";

// features/vision-interview/components/NextQuestionsStrip.tsx
//
// The compact strip DIRECTLY above the composer — the last thing the Expert
// reads before answering. Shows the open questions whose category matches the
// current stage's category (topped up to 3 with the oldest other open
// questions — selectNextQuestions). Clicking a question hands it to the
// composer via the canonical composerInsertRequested affordance (same as the
// panel's Answer button). The FULL ledger stays in the questions panel; this
// is the "what to answer next" view, never a second ledger.

import { ListTodo } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  composerInsertRequested,
  selectNextQuestions,
} from "../redux/vision-interview.slice";
import { QuestionCategoryChip } from "./QuestionCategoryChip";

export function NextQuestionsStrip() {
  const dispatch = useAppDispatch();
  const questions = useAppSelector(selectNextQuestions);

  if (questions.length === 0) return null;

  return (
    <div className="max-h-28 shrink-0 overflow-y-auto border-t border-border bg-muted/30 px-2 py-1">
      <p className="flex items-center gap-1 px-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        <ListTodo className="h-2.5 w-2.5" aria-hidden />
        Next questions
      </p>
      <div className="mt-0.5 space-y-px">
        {questions.map((q) => (
          <button
            key={q.id}
            type="button"
            onClick={() =>
              dispatch(
                composerInsertRequested({
                  text: `**Q:** ${q.question}\n**A:** `,
                }),
              )
            }
            title="Answer this question in the composer — it sends with your next turn"
            className="flex w-full items-start gap-1.5 rounded-md px-1 py-0.5 text-left hover:bg-accent/50"
          >
            <QuestionCategoryChip question={q} className="mt-px shrink-0" />
            <span className="min-w-0 flex-1 truncate text-xs text-foreground">
              {q.question}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
