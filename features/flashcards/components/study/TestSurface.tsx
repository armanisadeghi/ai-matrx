// features/flashcards/components/study/TestSurface.tsx
//
// Phase 1B (Test mode) — the multiple-choice study surface for ONE flashcard
// set. A thin driver over useQuizStudy → this presentational shell (question,
// 4-ish options, instant feedback, completion summary). Every answer funnels
// through the hook's `answer` (records study_attempt with method='test').
//
// React Compiler is on: no manual useMemo / useCallback / React.memo.

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, BookOpen, Check, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AccessGate } from "@/features/access-gate/components/AccessGate";
import MatrxMiniLoader from "@/components/loaders/MatrxMiniLoader";
import { cn } from "@/lib/utils";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { useQuizStudy } from "../../data/useQuizStudy";
import { StudyDeckHeader } from "./StudyDeckHeader";
import CardFaceBlock from "@/components/mardown-display/blocks/flashcards/CardFaceBlock";
import { useFlashcardMandates } from "../../data/mandate-disclosure";
import {
  ROUND_PAGE_CLASS,
  RoundComplete,
  RoundProgress,
  RoundSizeMenu,
} from "./round-controls";

const EDU_BASE = "/education/flashcards";

export function TestSurface({ setId }: { setId: string }) {
  useFlashcardMandates(["makeQuizItems"]);
  const router = useRouter();
  // The session files under the deck's own organization (see the hook).
  const study = useQuizStudy({
    setId,
    withSession: true,
  });
  const title = study.set?.name ?? "Test";
  // The results show once the learner moves past the LAST answer (so its
  // feedback is seen first); a new round clears it.
  const [showResults, setShowResults] = useState(false);
  const completed =
    showResults &&
    study.progress.total > 0 &&
    study.progress.done >= study.progress.total;
  const newRound = (deal: () => void): void => {
    setShowResults(false);
    deal();
  };
  const setQuestionCount = (count: number): void =>
    newRound(() => study.setQuestionCount(count));

  return (
    <>
      <PageHeader>
        <StudyDeckHeader
          title={`Test · ${title}`}
          backHref={`${EDU_BASE}/${setId}`}
          actions={
            <RoundSizeMenu
              dealt={study.questionCount}
              deckSize={study.deckSize}
              choices={study.questionCountChoices}
              noun="Questions"
              onChange={setQuestionCount}
            />
          }
        />
      </PageHeader>
      <div className="h-full overflow-y-auto overscroll-contain bg-textured">
        <div className={ROUND_PAGE_CLASS}>
          {study.loading ? (
            <div className="flex h-64 items-center justify-center">
              <MatrxMiniLoader />
            </div>
          ) : study.error ? (
            // Denied / deleted / never existed / signed-out all read as the
            // same failed load — the gate asks the platform which one it is.
            <AccessGate
              token="fc_set"
              id={setId}
              error={study.error}
              fallbackHref={EDU_BASE}
              fallbackLabel="Flashcards"
            />
          ) : study.questions.length === 0 ? (
            <EmptyState />
          ) : completed ? (
            <RoundComplete
              title="Test complete"
              correct={study.progress.correct}
              total={study.progress.total}
              missed={study.missedCount}
              deckSize={study.deckSize}
              sizeChoices={study.questionCountChoices}
              dealt={study.questionCount}
              onSizeChange={setQuestionCount}
              onRetake={() => newRound(study.restart)}
              onRetakeMissed={() => newRound(study.retakeMissed)}
              onBack={() => router.push(`${EDU_BASE}/${setId}`)}
            />
          ) : (
            <QuestionPanel
              study={study}
              onFinish={() => setShowResults(true)}
            />
          )}
        </div>
      </div>
    </>
  );
}

function QuestionPanel({
  study,
  onFinish,
}: {
  study: ReturnType<typeof useQuizStudy>;
  onFinish: () => void;
}) {
  const { current, selected, answered, questions, currentIndex, progress } =
    study;
  const isLast = currentIndex === questions.length - 1;
  const advance = (): void => {
    if (isLast) onFinish();
    else study.next();
  };

  // Keyboard: 1–4 pick an option, Enter / Space / → moves on once answered.
  // Typing in a field elsewhere on the page is never hijacked.
  useEffect(() => {
    if (!current) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (
        target?.closest(
          "input, textarea, select, [contenteditable='true'], [role='menu'], [role='dialog']",
        )
      ) {
        return;
      }
      if (!answered) {
        const n = Number(e.key);
        if (Number.isInteger(n) && n >= 1 && n <= current.options.length) {
          e.preventDefault();
          void study.answer(current.options[n - 1]);
        }
        return;
      }
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowRight") {
        e.preventDefault();
        advance();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!current) return null;

  return (
    <>
      <RoundProgress
        position={currentIndex + 1}
        total={questions.length}
        correct={progress.correct}
      />

      {/* The question, rendered by the flip card's own face renderer. D151:
          an AI-authored question stem, when the card has one, is what we
          paid for; the card front is the fallback. */}
      <div className="flex min-h-32 flex-col justify-center rounded-2xl border border-border bg-card px-5 py-6 shadow-sm sm:min-h-48 sm:px-8">
        <CardFaceBlock
          content={current.aiQuestion || current.front}
          size="card"
          align="center"
        />
      </div>

      {study.fallbackLoading && current.needsFallback && (
        <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          Finding more options…
        </p>
      )}

      {/* Every option is the same size: equal rows on the grid, one column on
          a phone, two from sm up. A long face scrolls inside its tile. */}
      <div className="mt-3 grid auto-rows-fr grid-cols-1 gap-2 sm:mt-4 sm:grid-cols-2 sm:gap-3">
        {current.options.map((option, i) => {
          const isCorrectOption =
            option.trim().toLowerCase() ===
            current.correctAnswer.trim().toLowerCase();
          const isSelected = selected === option;
          return (
            <button
              key={option}
              type="button"
              disabled={answered}
              onClick={() => void study.answer(option)}
              className={cn(
                "group flex min-h-16 min-w-0 items-start gap-3 rounded-xl border bg-card px-3.5 py-3 text-left shadow-sm transition-colors sm:min-h-20",
                !answered &&
                  "border-border hover:border-primary/60 hover:bg-accent/40 active:scale-[0.99]",
                answered &&
                  isCorrectOption &&
                  "border-green-500/70 bg-green-50 dark:bg-green-950/30",
                answered &&
                  isSelected &&
                  !isCorrectOption &&
                  "border-red-500/70 bg-red-50 dark:bg-red-950/30",
                answered && !isSelected && !isCorrectOption && "opacity-50",
              )}
            >
              <span
                className={cn(
                  "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border text-xs font-semibold tabular-nums",
                  !answered &&
                    "border-border text-muted-foreground group-hover:border-primary/60 group-hover:text-primary",
                  answered &&
                    isCorrectOption &&
                    "border-green-600 bg-green-600 text-white dark:border-green-500 dark:bg-green-500",
                  answered &&
                    isSelected &&
                    !isCorrectOption &&
                    "border-red-600 bg-red-600 text-white dark:border-red-500 dark:bg-red-500",
                  answered &&
                    !isSelected &&
                    !isCorrectOption &&
                    "border-border text-muted-foreground",
                )}
                aria-hidden
              >
                {answered && isCorrectOption ? (
                  <Check className="h-3.5 w-3.5" />
                ) : answered && isSelected ? (
                  <X className="h-3.5 w-3.5" />
                ) : (
                  i + 1
                )}
              </span>
              <span className="max-h-40 min-w-0 flex-1 self-center overflow-y-auto overscroll-contain scrollbar-thin">
                <CardFaceBlock content={option} align="start" />
              </span>
            </button>
          );
        })}
      </div>

      {/* The agent's explanation of the right answer — generated, paid for,
          and previously dropped at the coercion boundary (D151). */}
      {answered && current.explanation && (
        <p className="mt-3 rounded-xl border border-border bg-muted/40 px-3.5 py-2.5 text-sm text-foreground">
          {current.explanation}
        </p>
      )}

      {answered && (
        <Button className="mt-4 h-11 w-full" onClick={advance}>
          {isLast ? "See results" : "Next"}
          <ArrowRight className="ml-1.5 h-4 w-4" />
        </Button>
      )}
    </>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-card px-6 py-16 text-center">
      <BookOpen className="h-6 w-6 text-muted-foreground" />
      <p className="text-sm font-medium text-foreground">No cards yet</p>
    </div>
  );
}
