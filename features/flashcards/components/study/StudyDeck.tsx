// features/flashcards/components/study/StudyDeck.tsx
//
// The shared, presentational flashcard STUDY DECK — the keyboard-driven flip +
// grade UI, progress bar, dot strip, and completion summary. It owns NO data
// loading: it takes a study-result shape (cards, currentIndex, flip/next/grade,
// progress, …) so ANY driver renders identically. Consumers:
//   - StudySurface        → useFlashcardStudy (one set)
//   - ReviewDueSurface    → useDueReview (cross-set FSRS due queue)
// Every grade still funnels through the driver's `grade` (→ study spine); this
// component just advances the UI. Extracted from StudySurface so the two surfaces
// don't fork the ~200 lines of study UI.
//
// Keyboard: Space/Enter = flip · ←/→ = navigate · 1/2/3 = grade.
// React Compiler is on: no manual useMemo / useCallback / React.memo.

"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  XCircle,
  BookOpen,
  Trophy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import MatrxMiniLoader from "@/components/loaders/MatrxMiniLoader";
import { cn } from "@/lib/utils";
import FlashcardItem from "@/components/mardown-display/blocks/flashcards/FlashcardItem";
import type { CardWithDetails } from "../../data/types";
import type { ReviewResult } from "../../types";

export interface StudyDeckProgress {
  done: number;
  total: number;
  correct: number;
}

export interface StudyDeckProps {
  title: string;
  onBack: () => void;
  loading: boolean;
  error: string | null;
  cards: CardWithDetails[];
  currentIndex: number;
  isFlipped: boolean;
  resultsByCard: Record<string, ReviewResult | undefined>;
  grading: boolean;
  progress: StudyDeckProgress;
  flip: () => void;
  next: () => void;
  prev: () => void;
  goTo: (index: number) => void;
  grade: (result: ReviewResult) => void | Promise<unknown>;
  /** Copy for the empty (no-cards) state. */
  emptyTitle?: string;
  emptyBody?: string;
  /** Copy for the error state title. */
  errorTitle?: string;
  /** Completion summary copy + the primary "done" action. */
  completionTitle?: string;
  completionSubtitle?: string;
  /** "Study again" — omit to hide the restart button. */
  onRestart?: () => void;
  /** The primary completion action (e.g. Back to set / Back to flashcards). */
  completionPrimary?: { label: string; icon: typeof BookOpen; onClick: () => void };
  /** Optional per-card slot (e.g. an autoplay spoken-front) rendered while active. */
  renderCardExtra?: (card: CardWithDetails) => ReactNode;
}

/** A grade button (Again / Partial / Got it), keyboard-hinted. */
function GradeButton({
  result,
  hotkey,
  onGrade,
  disabled,
}: {
  result: ReviewResult;
  hotkey: string;
  onGrade: (r: ReviewResult) => void;
  disabled: boolean;
}) {
  const cfg: Record<
    ReviewResult,
    { label: string; icon: typeof XCircle; classes: string }
  > = {
    incorrect: {
      label: "Again",
      icon: XCircle,
      classes:
        "border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300 dark:hover:bg-red-950/60",
    },
    partial: {
      label: "Partial",
      icon: AlertCircle,
      classes:
        "border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300 dark:hover:bg-amber-950/60",
    },
    correct: {
      label: "Got it",
      icon: CheckCircle2,
      classes:
        "border-green-300 bg-green-50 text-green-700 hover:bg-green-100 dark:border-green-800 dark:bg-green-950/40 dark:text-green-300 dark:hover:bg-green-950/60",
    },
  };
  const { label, icon: Icon, classes } = cfg[result];
  return (
    <button
      type="button"
      onClick={() => onGrade(result)}
      disabled={disabled}
      className={cn(
        "flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50",
        classes,
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
      <span className="ml-1 rounded bg-black/5 px-1 text-[10px] tabular-nums dark:bg-white/10">
        {hotkey}
      </span>
    </button>
  );
}

export function StudyDeck(props: StudyDeckProps) {
  const {
    title,
    onBack,
    loading,
    error,
    cards,
    currentIndex,
    isFlipped,
    resultsByCard,
    grading,
    progress,
    flip,
    next,
    prev,
    goTo,
    grade,
    emptyTitle = "No cards to study",
    emptyBody = "There are no cards here yet.",
    errorTitle = "Couldn't load",
    completionTitle = "Session complete",
    completionSubtitle,
    onRestart,
    completionPrimary,
    renderCardExtra,
  } = props;

  // Completion once every card has a result this load (state so the user can
  // re-enter from the summary).
  const [completed, setCompleted] = useState(false);
  useEffect(() => {
    if (cards.length > 0 && progress.done >= progress.total) {
      setCompleted(true);
    }
  }, [cards.length, progress.done, progress.total]);

  useEffect(() => {
    if (loading || error || cards.length === 0 || completed) return undefined;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        flip();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        next();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        prev();
      } else if (!grading && (e.key === "1" || e.key === "2" || e.key === "3")) {
        e.preventDefault();
        const map: Record<string, ReviewResult> = {
          "1": "incorrect",
          "2": "partial",
          "3": "correct",
        };
        void grade(map[e.key]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [loading, error, cards.length, completed, grading, flip, next, prev, grade]);

  const restart = () => {
    setCompleted(false);
    onRestart?.();
  };

  if (loading) {
    return (
      <div className="flex min-h-[60dvh] items-center justify-center">
        <MatrxMiniLoader />
      </div>
    );
  }

  if (error) {
    return (
      <Shell onBack={onBack} title={title}>
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-border bg-card px-6 py-16 text-center">
          <AlertCircle className="h-6 w-6 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">{errorTitle}</p>
          <p className="max-w-md text-xs text-muted-foreground">{error}</p>
        </div>
      </Shell>
    );
  }

  if (cards.length === 0) {
    return (
      <Shell onBack={onBack} title={title}>
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-card px-6 py-16 text-center">
          <BookOpen className="h-6 w-6 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">{emptyTitle}</p>
          <p className="max-w-sm text-xs text-muted-foreground">{emptyBody}</p>
        </div>
      </Shell>
    );
  }

  if (completed) {
    const accuracy =
      progress.done > 0 ? Math.round((progress.correct / progress.done) * 100) : 0;
    return (
      <Shell onBack={onBack} title={title}>
        <div className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-2xl border border-border bg-card px-6 py-10 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Trophy className="h-7 w-7" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">{completionTitle}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {completionSubtitle ?? `You studied all ${progress.total} cards.`}
            </p>
          </div>
          <div className="grid w-full grid-cols-3 gap-2 text-center">
            <Stat label="Studied" value={`${progress.done}`} />
            <Stat label="Correct" value={`${progress.correct}`} accent="green" />
            <Stat label="Accuracy" value={`${accuracy}%`} />
          </div>
          <div className="flex w-full flex-col gap-2 sm:flex-row">
            {onRestart && (
              <Button variant="outline" className="flex-1" onClick={restart}>
                <RotateCcw className="mr-1.5 h-4 w-4" />
                Study again
              </Button>
            )}
            {completionPrimary && (
              <Button className="flex-1" onClick={completionPrimary.onClick}>
                <completionPrimary.icon className="mr-1.5 h-4 w-4" />
                {completionPrimary.label}
              </Button>
            )}
          </div>
        </div>
      </Shell>
    );
  }

  const current = cards[currentIndex];
  const pct =
    progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  const handleGrade = (result: ReviewResult): void => {
    if (grading) return;
    void grade(result);
  };

  return (
    <Shell onBack={onBack} title={title}>
      <div className="mb-4">
        <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <BookOpen className="h-3.5 w-3.5" />
            Card {currentIndex + 1} / {cards.length}
          </span>
          <span className="inline-flex items-center gap-3">
            <span>
              {progress.done}/{progress.total} studied
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
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <div className="mx-auto max-w-2xl">
        {renderCardExtra?.(current)}
        <FlashcardItem
          key={`fc-card-${current.id}`}
          front={current.front}
          back={current.back}
          index={currentIndex}
          layoutMode="list"
          lastResult={resultsByCard[current.id] ?? null}
        />

        <div className="mt-4 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-9 px-2 text-xs"
              onClick={prev}
              disabled={currentIndex === 0}
            >
              <ChevronLeft className="mr-1 h-4 w-4" />
              Prev
            </Button>
            <Button variant="outline" size="sm" className="h-9 px-3 text-xs" onClick={flip}>
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              {isFlipped ? "Show front" : "Flip"}
              <span className="ml-1.5 rounded bg-muted px-1 text-[10px]">Space</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-9 px-2 text-xs"
              onClick={next}
              disabled={currentIndex === cards.length - 1}
            >
              Next
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>

          <div className="flex items-stretch gap-2">
            <GradeButton result="incorrect" hotkey="1" onGrade={handleGrade} disabled={grading} />
            <GradeButton result="partial" hotkey="2" onGrade={handleGrade} disabled={grading} />
            <GradeButton result="correct" hotkey="3" onGrade={handleGrade} disabled={grading} />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-center gap-1.5">
          {cards.map((card, i) => (
            <button
              key={`dot-${card.id}`}
              type="button"
              onClick={() => goTo(i)}
              aria-label={`Go to card ${i + 1}`}
              className={cn(
                "h-2 w-2 rounded-full transition-colors",
                i === currentIndex
                  ? "bg-primary"
                  : resultsByCard[card.id] === "correct"
                    ? "bg-green-500/70"
                    : resultsByCard[card.id]
                      ? "bg-amber-500/70"
                      : "bg-muted-foreground/30",
              )}
            />
          ))}
        </div>
      </div>
    </Shell>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "green";
}) {
  return (
    <div className="rounded-lg border border-border bg-background px-2 py-2">
      <div
        className={cn(
          "text-lg font-semibold tabular-nums",
          accent === "green" ? "text-green-600 dark:text-green-400" : "text-foreground",
        )}
      >
        {value}
      </div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
    </div>
  );
}

/** Shared focused-session frame: a single scroll area + a back affordance. */
function Shell({
  onBack,
  title,
  children,
}: {
  onBack: () => void;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-full w-full overflow-y-auto bg-textured">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 py-4 sm:py-6 pb-safe">
        <div className="mb-4 flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-xs text-muted-foreground"
            onClick={onBack}
          >
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back
          </Button>
          <span className="truncate text-sm font-medium text-foreground">{title}</span>
        </div>
        {children}
      </div>
    </div>
  );
}
