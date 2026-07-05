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
import {
  CheckCircle2,
  XCircle,
  ArrowRight,
  Trophy,
  Layers,
  AlertCircle,
  BookOpen,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import MatrxMiniLoader from "@/components/loaders/MatrxMiniLoader";
import { cn } from "@/lib/utils";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { useQuizStudy } from "../../data/useQuizStudy";
import { StudyDeckHeader } from "./StudyDeckHeader";

const EDU_BASE = "/education/flashcards";

export function TestSurface({ setId }: { setId: string }) {
  const router = useRouter();
  const study = useQuizStudy({ setId, withSession: true });
  const title = study.set?.name ?? "Test";

  // One-way latch, not a pure derivation (see StudyDeck's `completed`).
  const [completed, setCompleted] = useState(false);
  useEffect(() => {
    if (
      study.progress.total > 0 &&
      study.progress.done >= study.progress.total
    ) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCompleted(true);
    }
  }, [study.progress.done, study.progress.total]);

  return (
    <>
      <PageHeader>
        <StudyDeckHeader
          title={`Test — ${title}`}
          backHref={`${EDU_BASE}/${setId}`}
        />
      </PageHeader>
      <div className="h-full overflow-y-auto overscroll-contain bg-background">
        <div className="mx-auto max-w-2xl px-2 pb-safe pt-14 sm:px-6">
          {study.loading ? (
            <div className="flex h-64 items-center justify-center">
              <MatrxMiniLoader />
            </div>
          ) : study.error ? (
            <ErrorState title="Couldn't load this set" body={study.error} />
          ) : study.questions.length === 0 ? (
            <EmptyState />
          ) : completed ? (
            <CompletionScreen
              progress={study.progress}
              onBackToSet={() => router.push(`${EDU_BASE}/${setId}`)}
            />
          ) : (
            <QuestionPanel study={study} />
          )}
        </div>
      </div>
    </>
  );
}

function QuestionPanel({ study }: { study: ReturnType<typeof useQuizStudy> }) {
  const { current, selected, answered, questions, currentIndex, progress } =
    study;
  if (!current) return null;

  const positionPct = Math.round(((currentIndex + 1) / questions.length) * 100);

  return (
    <>
      <div className="mb-4">
        <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>
            Question {currentIndex + 1} / {questions.length}
          </span>
          <span className="inline-flex items-center gap-3">
            <span>
              {progress.done}/{progress.total}
            </span>
            {progress.correct > 0 && (
              <span className="inline-flex items-center gap-1 text-green-600 dark:text-green-400">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {progress.correct}
              </span>
            )}
          </span>
        </div>
        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all duration-500"
            style={{ width: `${positionPct}%` }}
          />
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5">
        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
          Which answer matches?
        </p>
        <p className="mt-1.5 text-lg font-medium leading-snug text-foreground">
          {current.front}
        </p>
        {study.fallbackLoading && current.needsFallback && (
          <p className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Finding more options…
          </p>
        )}

        <div className="mt-4 flex flex-col gap-2">
          {current.options.map((option) => {
            const isCorrectOption =
              option.trim().toLowerCase() ===
              current.correctAnswer.trim().toLowerCase();
            const isSelected = selected === option;
            const showFeedback = answered;
            return (
              <button
                key={option}
                type="button"
                disabled={answered}
                onClick={() => void study.answer(option)}
                className={cn(
                  "flex items-center justify-between gap-2 rounded-xl border px-4 py-3 text-left text-sm transition-colors",
                  !showFeedback &&
                    "border-border bg-background hover:border-primary/50 hover:bg-accent",
                  showFeedback &&
                    isCorrectOption &&
                    "border-green-500/60 bg-green-50 text-green-900 dark:bg-green-950/30 dark:text-green-200",
                  showFeedback &&
                    isSelected &&
                    !isCorrectOption &&
                    "border-red-500/60 bg-red-50 text-red-900 dark:bg-red-950/30 dark:text-red-200",
                  showFeedback &&
                    !isSelected &&
                    !isCorrectOption &&
                    "border-border bg-background opacity-50",
                )}
              >
                <span>{option}</span>
                {showFeedback && isCorrectOption && (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600 dark:text-green-400" />
                )}
                {showFeedback && isSelected && !isCorrectOption && (
                  <XCircle className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
                )}
              </button>
            );
          })}
        </div>

        {answered && (
          <Button className="mt-4 w-full" onClick={study.next}>
            {currentIndex === questions.length - 1 ? "Finish" : "Next question"}
            <ArrowRight className="ml-1.5 h-4 w-4" />
          </Button>
        )}
      </div>
    </>
  );
}

function CompletionScreen({
  progress,
  onBackToSet,
}: {
  progress: { done: number; total: number; correct: number };
  onBackToSet: () => void;
}) {
  const accuracy =
    progress.done > 0
      ? Math.round((progress.correct / progress.done) * 100)
      : 0;
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-2xl border border-border bg-card px-6 py-10 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Trophy className="h-7 w-7" />
      </div>
      <div>
        <h2 className="text-lg font-semibold text-foreground">Test complete</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          You answered {progress.total} questions.
        </p>
      </div>
      <div className="grid w-full grid-cols-2 gap-2 text-center">
        <div className="rounded-lg border border-border bg-background px-2 py-2">
          <div className="text-lg font-semibold tabular-nums text-green-600 dark:text-green-400">
            {progress.correct}
          </div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Correct
          </div>
        </div>
        <div className="rounded-lg border border-border bg-background px-2 py-2">
          <div className="text-lg font-semibold tabular-nums text-foreground">
            {accuracy}%
          </div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Accuracy
          </div>
        </div>
      </div>
      <Button className="w-full" onClick={onBackToSet}>
        <Layers className="mr-1.5 h-4 w-4" />
        Back to set
      </Button>
    </div>
  );
}

function ErrorState({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-border bg-card px-6 py-16 text-center">
      <AlertCircle className="h-6 w-6 text-muted-foreground" />
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="max-w-md text-xs text-muted-foreground">{body}</p>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-card px-6 py-16 text-center">
      <BookOpen className="h-6 w-6 text-muted-foreground" />
      <p className="text-sm font-medium text-foreground">
        This set has no cards yet
      </p>
      <p className="max-w-sm text-xs text-muted-foreground">
        Generate some in chat to test yourself.
      </p>
    </div>
  );
}
