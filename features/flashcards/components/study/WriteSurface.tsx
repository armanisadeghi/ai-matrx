// features/flashcards/components/study/WriteSurface.tsx
//
// Phase 1B (Write mode) — free-typed recall graded against the card's back
// text. Types an answer → auto-graded via normalized Levenshtein similarity
// (features/flashcards/utils/textSimilarity.ts) → the user confirms or
// overrides the suggested grade with the SAME three-button row every other
// mode uses, then it's recorded through useFlashcardStudy's canonical
// `grade()` with responseKind='typed' + the typed transcript persisted.
//
// React Compiler is on: no manual useMemo / useCallback / React.memo.

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  AlertCircle,
  BookOpen,
  Trophy,
  Layers,
  PenLine,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import MatrxMiniLoader from "@/components/loaders/MatrxMiniLoader";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { useFlashcardStudy } from "../../data/useFlashcardStudy";
import { StudyDeckHeader } from "./StudyDeckHeader";
import { FlashcardGradeButtonRow } from "./FlashcardGradeButton";
import { gradeTypedAnswer, type TypedGrade } from "../../utils/textSimilarity";
import type { ReviewResult } from "../../types";

const EDU_BASE = "/education/flashcards";

const AUTO_GRADE_LABEL: Record<TypedGrade, string> = {
  correct: "Looks correct",
  partial: "Partial match",
  incorrect: "Doesn't match",
};

export function WriteSurface({ setId }: { setId: string }) {
  const router = useRouter();
  const study = useFlashcardStudy({ setId, withSession: true, mode: "write" });
  const title = study.set?.name ?? "Write";
  const current = study.cards[study.currentIndex];

  const [typed, setTyped] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [autoGrade, setAutoGrade] = useState<TypedGrade | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTyped("");
    setSubmitted(false);
    setAutoGrade(null);
  }, [current?.id]);

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

  const submitAnswer = (): void => {
    if (!current || submitted) return;
    setAutoGrade(gradeTypedAnswer(typed, current.back));
    setSubmitted(true);
  };

  const confirmGrade = async (result: ReviewResult): Promise<void> => {
    if (study.grading) return;
    await study.grade(result, {
      responseKind: "typed",
      responseTranscript: typed,
    });
  };

  return (
    <>
      <PageHeader>
        <StudyDeckHeader
          title={`Write — ${title}`}
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
            <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-border bg-card px-6 py-16 text-center">
              <AlertCircle className="h-6 w-6 text-muted-foreground" />
              <p className="text-sm font-medium text-foreground">
                Couldn&apos;t load this set
              </p>
              <p className="max-w-md text-xs text-muted-foreground">
                {study.error}
              </p>
            </div>
          ) : study.cards.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-card px-6 py-16 text-center">
              <BookOpen className="h-6 w-6 text-muted-foreground" />
              <p className="text-sm font-medium text-foreground">
                This set has no cards yet
              </p>
              <p className="max-w-sm text-xs text-muted-foreground">
                Generate some in chat to practice writing answers.
              </p>
            </div>
          ) : completed ? (
            <CompletionScreen
              progress={study.progress}
              onBackToSet={() => router.push(`${EDU_BASE}/${setId}`)}
            />
          ) : current ? (
            <>
              <div className="mb-4">
                <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                  <span>
                    Card {study.currentIndex + 1} / {study.cards.length}
                  </span>
                  <span className="inline-flex items-center gap-3">
                    <span>
                      {study.progress.done}/{study.progress.total} written
                    </span>
                    {study.progress.correct > 0 && (
                      <span className="inline-flex items-center gap-1 text-green-600 dark:text-green-400">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {study.progress.correct}
                      </span>
                    )}
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-500"
                    style={{
                      width: `${Math.round(((study.currentIndex + 1) / study.cards.length) * 100)}%`,
                    }}
                  />
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-card p-5">
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
                  Type the answer
                </p>
                <p className="mt-1.5 text-lg font-medium leading-snug text-foreground">
                  {current.front}
                </p>

                {!submitted ? (
                  <form
                    className="mt-4 flex flex-col gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      submitAnswer();
                    }}
                  >
                    <Input
                      autoFocus
                      value={typed}
                      onChange={(e) => setTyped(e.target.value)}
                      placeholder="Your answer…"
                      className="text-base"
                    />
                    <Button type="submit" disabled={typed.trim().length === 0}>
                      <PenLine className="mr-1.5 h-4 w-4" />
                      Check answer
                    </Button>
                  </form>
                ) : (
                  <div className="mt-4 flex flex-col gap-3">
                    <div className="rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-sm">
                      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
                        Your answer
                      </p>
                      <p className="mt-0.5 text-foreground">
                        {typed || "(blank)"}
                      </p>
                    </div>
                    <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2.5 text-sm dark:border-green-900 dark:bg-green-950/30">
                      <p className="text-[11px] font-medium uppercase tracking-wider text-green-700/80 dark:text-green-400/80">
                        Correct answer
                      </p>
                      <p className="mt-0.5 text-green-900 dark:text-green-200">
                        {current.back}
                      </p>
                    </div>
                    {autoGrade && (
                      <p className="text-xs text-muted-foreground">
                        {AUTO_GRADE_LABEL[autoGrade]} — confirm or adjust the
                        grade below.
                      </p>
                    )}
                    <FlashcardGradeButtonRow
                      onGrade={(r) => void confirmGrade(r)}
                      disabled={study.grading}
                    />
                  </div>
                )}
              </div>
            </>
          ) : null}
        </div>
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
        <h2 className="text-lg font-semibold text-foreground">
          Write session complete
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          You wrote answers for all {progress.total} cards.
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
