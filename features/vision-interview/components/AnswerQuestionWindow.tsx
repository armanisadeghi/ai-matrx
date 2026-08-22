"use client";

// features/vision-interview/components/AnswerQuestionWindow.tsx
//
// The focused answer surface — a real WindowPanel (page-local, inline-closed),
// never a hand-rolled modal. It sits BESIDE the room: the transcript keeps
// streaming, the composer keeps its draft, and the user can answer as many
// questions as they like.
//
// THE TWO RULES THIS SURFACE EXISTS FOR
//
//  1. SAVE DOES NOT SUBMIT. Save dispatches `answerDrafted(...)` — the card
//     flips to Pending and the text rides the NEXT message the user sends
//     (the room's answer-append rule). Nothing is sent from here.
//  2. CLOSING NEVER DESTROYS TYPED TEXT. The entry area is backed by
//     `useDurableDraft` (localStorage write-through), keyed by question id, so
//     a close, a reload, a crash, or a mis-tap all restore the words exactly.
//
// The entry area is `ProTextarea` — its built-in mic makes every question
// click-and-talk for a user who would never type three paragraphs.
//
// The action set is IDENTICAL to QuestionCard's (Arman: the list view and the
// focused view never disagree).

import { useEffect, useRef } from "react";
import { Clock3, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProTextarea } from "@/components/official/ProTextarea";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { RecordingOriginProvider } from "@/features/audio/RecordingOriginProvider";
import { useDurableDraft } from "@/hooks/useDurableDraft";
import { useAppDispatch } from "@/lib/redux/hooks";
import { cn } from "@/lib/utils";
import {
  answerDiscarded,
  answerDrafted,
} from "../redux/vision-interview.slice";
import { QuestionCategoryChip } from "./QuestionCategoryChip";
import { questionStatus } from "./QuestionCard";
import type { InterviewQuestionRow } from "../types";

export interface AnswerQuestionWindowProps {
  question: InterviewQuestionRow;
  /** The answer already saved for this question, if any. */
  pendingAnswer: string | null;
  sessionId: string | null;
  onClose: () => void;
  onDismiss: (question: InterviewQuestionRow) => void;
}

export function AnswerQuestionWindow({
  question,
  pendingAnswer,
  sessionId,
  onClose,
  onDismiss,
}: AnswerQuestionWindowProps) {
  const dispatch = useAppDispatch();
  const { draft, setDraft, clearDraft } = useDurableDraft(
    `vision-interview-answer:${question.id}`,
  );
  // Seed the field from the already-saved answer exactly once per question —
  // an in-flight local draft (crash recovery) always wins over it.
  const seededFor = useRef<string | null>(null);

  useEffect(() => {
    if (seededFor.current === question.id) return;
    seededFor.current = question.id;
    if (!draft && pendingAnswer) setDraft(pendingAnswer);
  }, [question.id, draft, pendingAnswer, setDraft]);

  const text = draft.trim();
  const dirty = text !== (pendingAnswer ?? "").trim();
  const status = questionStatus(question, pendingAnswer !== null);

  const save = () => {
    if (!text) return;
    dispatch(
      answerDrafted({
        questionId: question.id,
        questionText: question.question,
        answerText: text,
      }),
    );
    onClose();
  };

  const discard = () => {
    dispatch(answerDiscarded({ questionId: question.id }));
    clearDraft();
    onClose();
  };

  return (
    <WindowPanel
      id={`vision-interview-answer-${question.id}`}
      onClose={onClose}
      titleNode={
        <span className="flex items-center gap-1.5 text-xs font-medium">
          Answer this question
        </span>
      }
      width={560}
      height={480}
      minWidth={320}
      minHeight={300}
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
      footerVariant="rich"
      footerRight={
        <div className="flex items-center gap-1.5">
          {pendingAnswer !== null && (
            <Button
              variant="ghost"
              size="sm"
              className="h-11 gap-1 px-2.5 text-xs text-muted-foreground sm:h-8"
              onClick={discard}
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
              Discard
            </Button>
          )}
          {question.state !== "deferred" && (
            <Button
              variant="ghost"
              size="sm"
              className="h-11 px-2.5 text-xs text-muted-foreground sm:h-8"
              onClick={() => {
                onDismiss(question);
                onClose();
              }}
            >
              Dismiss
            </Button>
          )}
          <Button
            size="sm"
            className="h-11 px-3 text-xs sm:h-8"
            disabled={!text}
            onClick={save}
          >
            {pendingAnswer !== null ? "Save changes" : "Save answer"}
          </Button>
        </div>
      }
    >
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
        <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-3">
          <QuestionCategoryChip question={question} />
          <p className="text-sm font-medium leading-snug text-foreground">
            {question.question}
          </p>
          {question.missing_part && (
            <p className="text-xs leading-snug text-muted-foreground">
              Still missing: {question.missing_part}
            </p>
          )}
        </div>

        <RecordingOriginProvider
          origin={{
            surface: "vision-interview.answer",
            entityId: sessionId ?? undefined,
            label: `Answer — ${question.question.slice(0, 60)}`,
            href: sessionId ? `/masterwork/vision-interview/${sessionId}` : undefined,
          }}
        >
          <ProTextarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Answer in your own words — type, or press the mic and just talk…"
            autoGrow
            minHeight={160}
            maxHeight={420}
            enableTextStats={false}
            className="text-base sm:text-sm"
            autoFocus
          />
        </RecordingOriginProvider>

        {/* The one sentence that keeps Save honest — it never sends. */}
        <p
          className={cn(
            "flex items-start gap-1.5 text-[11px] leading-snug",
            dirty && text
              ? "text-warning"
              : status === "pending"
                ? "text-primary"
                : "text-muted-foreground",
          )}
        >
          <Clock3 className="mt-px h-3 w-3 shrink-0" aria-hidden />
          {dirty && text
            ? "Unsaved — Save keeps this for your next message."
            : status === "pending"
              ? "Saved — this rides your next message to the room."
              : "Saving does not send. Your answer rides your next message, so you can answer several questions and send once."}
        </p>
      </div>
    </WindowPanel>
  );
}

export default AnswerQuestionWindow;
