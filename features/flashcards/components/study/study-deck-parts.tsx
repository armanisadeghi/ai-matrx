"use client";

import { useEffect, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  CheckCircle2,
  BookOpen,
  Trophy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import FlashcardItem from "@/components/mardown-display/blocks/flashcards/FlashcardItem";
import type { CardWithDetails } from "../../data/types";
import type { ReviewResult } from "../../types";
import type { ItemMasteryRow } from "@/features/education/study/types";
import { displayMasteryPct } from "@/features/education/study/utils/masteryFsrs";
import { FlashcardGradeButtonRow } from "./FlashcardGradeButton";

export interface StudyProgress {
  done: number;
  total: number;
  correct: number;
}

export function StudyProgressBar({
  currentIndex,
  cardCount,
  progress,
}: {
  currentIndex: number;
  cardCount: number;
  progress: StudyProgress;
}) {
  const positionPct =
    cardCount > 0 ? Math.round(((currentIndex + 1) / cardCount) * 100) : 0;

  return (
    <div className="shrink-0 border-b border-border/50 px-2 py-1">
      <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <BookOpen className="h-3 w-3" />
          {currentIndex + 1} / {cardCount}
        </span>
        <span className="inline-flex items-center gap-2">
          <span>
            {progress.done}/{progress.total} studied
          </span>
          {progress.correct > 0 && (
            <span className="inline-flex items-center gap-0.5 text-green-600 dark:text-green-400">
              <CheckCircle2 className="h-3 w-3" />
              {progress.correct}
            </span>
          )}
        </span>
      </div>
      <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all duration-500"
          style={{ width: `${positionPct}%` }}
        />
      </div>
    </div>
  );
}

export function StudyCardDots({
  cards,
  currentIndex,
  resultsByCard,
  onGoTo,
}: {
  cards: CardWithDetails[];
  currentIndex: number;
  resultsByCard: Record<string, ReviewResult | undefined>;
  onGoTo: (index: number) => void;
}) {
  return (
    <div className="flex max-w-[220px] flex-wrap items-center justify-center gap-1">
      {cards.map((card, i) => (
        <button
          key={`dot-${card.id}`}
          type="button"
          onClick={() => onGoTo(i)}
          aria-label={`Go to card ${i + 1}`}
          className={cn(
            "h-1.5 w-1.5 rounded-full transition-colors",
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
  );
}

export function StudyWindowFooter({
  currentIndex,
  cardCount,
  grading,
  cards,
  resultsByCard,
  onPrev,
  onNext,
  onGoTo,
  onGrade,
}: {
  currentIndex: number;
  cardCount: number;
  grading: boolean;
  cards: CardWithDetails[];
  resultsByCard: Record<string, ReviewResult | undefined>;
  onPrev: () => void;
  onNext: () => void;
  onGoTo: (index: number) => void;
  onGrade: (result: ReviewResult) => void;
}) {
  return (
    <div className="flex w-full flex-col gap-1 px-2 py-0.5">
      <div className="flex justify-center">
        <StudyCardDots
          cards={cards}
          currentIndex={currentIndex}
          resultsByCard={resultsByCard}
          onGoTo={onGoTo}
        />
      </div>
      <div className="flex w-full items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 shrink-0 px-2 text-xs"
          onClick={onPrev}
          disabled={currentIndex === 0}
        >
          <ChevronLeft className="mr-0.5 h-3.5 w-3.5" />
          Prev
        </Button>

        <FlashcardGradeButtonRow
          onGrade={onGrade}
          disabled={grading}
          size="compact"
          className="min-w-0 flex-1"
        />

        <Button
          variant="ghost"
          size="sm"
          className="h-7 shrink-0 px-2 text-xs"
          onClick={onNext}
          disabled={currentIndex >= cardCount - 1}
        >
          Next
          <ChevronRight className="ml-0.5 h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

export function StudyCompletionSummary({
  progress,
  onRestart,
}: {
  progress: StudyProgress;
  onRestart?: () => void;
}) {
  const accuracy =
    progress.done > 0
      ? Math.round((progress.correct / progress.done) * 100)
      : 0;

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-4 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Trophy className="h-6 w-6" />
      </div>
      <div>
        <h2 className="text-base font-semibold text-foreground">
          Session complete
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          You studied all {progress.total} cards.
        </p>
      </div>
      <div className="grid w-full max-w-xs grid-cols-3 gap-2">
        <StudyStat label="Studied" value={`${progress.done}`} />
        <StudyStat
          label="Correct"
          value={`${progress.correct}`}
          accent="green"
        />
        <StudyStat label="Accuracy" value={`${accuracy}%`} />
      </div>
      {onRestart && (
        <Button variant="outline" size="sm" onClick={onRestart}>
          <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
          Study again
        </Button>
      )}
    </div>
  );
}

function StudyStat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "green";
}) {
  return (
    <div className="rounded-md border border-border bg-background px-2 py-1.5">
      <div
        className={cn(
          "text-base font-semibold tabular-nums",
          accent === "green"
            ? "text-green-600 dark:text-green-400"
            : "text-foreground",
        )}
      >
        {value}
      </div>
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
    </div>
  );
}

export function FlashcardStudySidebar({
  cards,
  currentIndex,
  resultsByCard,
  masteryByCard,
  onGoTo,
}: {
  cards: CardWithDetails[];
  currentIndex: number;
  resultsByCard: Record<string, ReviewResult | undefined>;
  masteryByCard: Record<string, ItemMasteryRow | undefined>;
  onGoTo: (index: number) => void;
}) {
  const current = cards[currentIndex];
  const mastery = current ? masteryByCard[current.id] : undefined;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto py-1">
        <div className="space-y-0.5">
          {cards.map((card, i) => {
            const result = resultsByCard[card.id];
            return (
              <button
                key={card.id}
                type="button"
                onClick={() => onGoTo(i)}
                className={cn(
                  "flex w-full items-start gap-1.5 rounded-md py-1 pl-1 pr-1.5 text-left text-xs transition-colors",
                  i === currentIndex
                    ? "bg-accent text-accent-foreground"
                    : "hover:bg-muted/60",
                )}
              >
                <span
                  className={cn(
                    "mt-1 h-1.5 w-1.5 shrink-0 rounded-full",
                    result === "correct"
                      ? "bg-green-500"
                      : result === "partial"
                        ? "bg-amber-500"
                        : result === "incorrect"
                          ? "bg-red-500"
                          : "bg-muted-foreground/30",
                  )}
                />
                <span className="line-clamp-2 min-w-0 flex-1 leading-snug">
                  {card.front}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <FlashcardStudySidebarStats
        cardNumber={currentIndex + 1}
        mastery={mastery}
      />
    </div>
  );
}

const LAST_RESULT_STYLES: Record<string, string> = {
  correct: "text-green-600 dark:text-green-400",
  partial: "text-amber-600 dark:text-amber-400",
  incorrect: "text-red-600 dark:text-red-400",
};

function FlashcardStudySidebarStats({
  cardNumber,
  mastery,
}: {
  cardNumber: number;
  mastery: ItemMasteryRow | undefined;
}) {
  const hasHistory = mastery && mastery.attempt_count > 0;
  // Phase 2 (FSRS): live retrievability (decays with elapsed time), falling
  // back to the legacy write-time snapshot for pre-FSRS rows.
  const liveMasteryPct = displayMasteryPct(mastery);
  const masteryPct =
    liveMasteryPct != null ? `${Math.round(liveMasteryPct * 100)}%` : null;
  const dueLabel =
    mastery?.due_at &&
    new Date(mastery.due_at).toLocaleDateString([], {
      month: "short",
      day: "numeric",
    });
  const metaParts = [
    dueLabel ? `Due ${dueLabel}` : null,
    mastery?.interval_days != null ? `${mastery.interval_days}d` : null,
  ].filter(Boolean);

  return (
    <div className="shrink-0 border-t border-border bg-muted/25 px-1.5 py-1.5">
      <div className="flex h-[5.25rem] flex-col justify-between gap-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-medium tabular-nums text-muted-foreground">
            Card {cardNumber}
          </span>
          {mastery?.last_result ? (
            <span
              className={cn(
                "rounded px-1 py-px text-[10px] font-medium capitalize tabular-nums",
                LAST_RESULT_STYLES[mastery.last_result] ??
                  "text-muted-foreground",
              )}
            >
              {mastery.last_result}
            </span>
          ) : (
            <span className="text-[10px] text-muted-foreground/50">—</span>
          )}
        </div>

        <div className="grid grid-cols-4 gap-0.5">
          <SidebarMetric
            label="Att"
            value={hasHistory ? mastery.attempt_count : "—"}
          />
          <SidebarMetric
            label="Cor"
            value={hasHistory ? mastery.correct_count : "—"}
            accent={hasHistory ? "green" : undefined}
          />
          <SidebarMetric
            label="Str"
            value={hasHistory ? mastery.streak : "—"}
          />
          <SidebarMetric label="Mst" value={masteryPct ?? "—"} />
        </div>

        <div className="flex min-h-4 items-center justify-between gap-1 text-[10px] leading-none">
          {metaParts.length > 0 ? (
            <span className="truncate text-muted-foreground">
              {metaParts.join(" · ")}
            </span>
          ) : !hasHistory ? (
            <span className="text-muted-foreground/60">No review history</span>
          ) : (
            <span className="text-muted-foreground/40">&nbsp;</span>
          )}
          {mastery?.struggle_flag ? (
            <span className="shrink-0 font-medium text-amber-600 dark:text-amber-400">
              Struggling
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function SidebarMetric({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent?: "green";
}) {
  const empty = value === "—";

  return (
    <div className="rounded border border-border/60 bg-background/80 px-1 py-0.5 text-center">
      <div
        className={cn(
          "text-[11px] font-semibold leading-tight tabular-nums",
          empty
            ? "text-muted-foreground/40"
            : accent === "green"
              ? "text-green-600 dark:text-green-400"
              : "text-foreground",
        )}
      >
        {value}
      </div>
      <div className="text-[8px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
    </div>
  );
}

export function useStudyKeyboard({
  enabled,
  grading,
  onFlip,
  onNext,
  onPrev,
  onGrade,
}: {
  enabled: boolean;
  grading: boolean;
  onFlip: () => void;
  onNext: () => void;
  onPrev: () => void;
  onGrade: (result: ReviewResult) => void;
}) {
  useEffect(() => {
    if (!enabled) return undefined;
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
        onFlip();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        onNext();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        onPrev();
      } else if (
        !grading &&
        (e.key === "1" || e.key === "2" || e.key === "3")
      ) {
        e.preventDefault();
        const map: Record<string, ReviewResult> = {
          "1": "incorrect",
          "2": "partial",
          "3": "correct",
        };
        onGrade(map[e.key]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled, grading, onFlip, onNext, onPrev, onGrade]);
}

export function useStudyCompletion(
  cardCount: number,
  progress: StudyProgress,
): [boolean, () => void] {
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    if (cardCount > 0 && progress.done >= progress.total) {
      setCompleted(true);
    }
  }, [cardCount, progress.done, progress.total]);

  const restart = () => setCompleted(false);

  return [completed, restart];
}
