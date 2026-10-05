// features/flashcards/components/study/round-controls.tsx
//
// The pieces Test and Write share, so the two modes read as one product:
// the round-size menu in the header, the progress strip over the question,
// and the end-of-round screen (score, retake, retake missed, round size).
//
// React Compiler is on: no manual useMemo / useCallback / React.memo.

"use client";

import { Check, ChevronDown, Layers, RotateCcw, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import { ROUND_SIZE_ALL, roundSizeValue } from "../../data/roundSize";

/** The page body every study round sits in: below the shell header, safe
 *  area at the bottom, the deck page's own background and touch floor. */
export const ROUND_PAGE_CLASS =
  "matrx-touch-targets mx-auto w-full max-w-2xl px-3 pb-safe pt-[calc(var(--shell-header-h)+0.75rem)] sm:px-6 sm:pt-[calc(var(--shell-header-h)+1.5rem)]";

function choiceLabel(choice: number, deckSize: number): string {
  return choice === ROUND_SIZE_ALL ? `All ${deckSize}` : String(choice);
}

/** Round size in the page header. Absent when the deck offers one choice. */
export function RoundSizeMenu({
  dealt,
  deckSize,
  choices,
  noun,
  onChange,
}: {
  /** Cards in the current round. */
  dealt: number;
  deckSize: number;
  choices: number[];
  /** Plural noun for the menu title: "Questions", "Cards". */
  noun: string;
  onChange: (count: number) => void;
}) {
  if (choices.length < 2) return null;
  const value = roundSizeValue(dealt, deckSize);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          icon={<Layers />} iconEnd={<ChevronDown className="opacity-60" />}
          variant="quiet"
          aria-label={`${noun} per round`}
        >
          {dealt}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
          {noun} per round
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={String(value)}
          onValueChange={(next) => {
            const count = Number(next);
            if (count !== value) onChange(count);
          }}
        >
          {choices.map((n) => (
            <DropdownMenuRadioItem
              key={n}
              value={String(n)}
              className="tabular-nums"
            >
              {choiceLabel(n, deckSize)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** One thin bar plus "3 / 20" and the running correct count. */
export function RoundProgress({
  position,
  total,
  correct,
}: {
  /** 1-based position of the card on screen. */
  position: number;
  total: number;
  correct: number;
}) {
  const pct = total > 0 ? Math.round((position / total) * 100) : 0;
  return (
    <div className="mb-3 flex items-center gap-3 sm:mb-4">
      <div
        className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={position}
      >
        <div
          className="h-full rounded-full bg-primary transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground">
        {position} / {total}
      </span>
      <span
        className={cn(
          "inline-flex shrink-0 items-center gap-1 text-xs font-medium tabular-nums",
          correct > 0
            ? "text-green-600 dark:text-green-400"
            : "text-muted-foreground/60",
        )}
        title="Correct"
      >
        <Check className="h-3.5 w-3.5" />
        {correct}
      </span>
    </div>
  );
}

/** End of a round: score, retake, retake missed, round size, back. */
export function RoundComplete({
  title,
  correct,
  total,
  missed,
  deckSize,
  sizeChoices,
  dealt,
  onSizeChange,
  onRetake,
  onRetakeMissed,
  onBack,
}: {
  title: string;
  correct: number;
  total: number;
  missed: number;
  deckSize: number;
  sizeChoices: number[];
  dealt: number;
  onSizeChange: (count: number) => void;
  onRetake: () => void;
  onRetakeMissed: () => void;
  onBack: () => void;
}) {
  const score = total > 0 ? Math.round((correct / total) * 100) : 0;
  const value = roundSizeValue(dealt, deckSize);
  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center gap-5 rounded-2xl border border-border bg-card px-5 py-8 text-center shadow-sm sm:px-8">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Trophy className="h-7 w-7" />
      </div>
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      <div className="grid w-full grid-cols-3 gap-2">
        <Stat label="Score" value={`${score}%`} />
        <Stat label="Correct" value={String(correct)} tone="good" />
        <Stat label="Missed" value={String(missed)} tone={missed > 0 ? "bad" : undefined} />
      </div>

      {sizeChoices.length >= 2 && (
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={String(value)}
          onValueChange={(next) => {
            if (next && Number(next) !== value) onSizeChange(Number(next));
          }}
          aria-label="Cards per round"
          className="flex-wrap justify-center"
        >
          {sizeChoices.map((n) => (
            <ToggleGroupItem
              key={n}
              value={String(n)}
              className="h-11 min-w-11 px-3 tabular-nums sm:h-9 sm:min-w-9"
            >
              {choiceLabel(n, deckSize)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      )}

      <div className="flex w-full flex-col gap-2">
        {missed > 0 && (
          <Button icon={<RotateCcw />} variant="primary" className="w-full" onClick={onRetakeMissed}>
            Retake {missed} missed
          </Button>
        )}
        <Button
          icon={<RotateCcw />}
          variant={missed > 0 ? "outline" : "primary"}
          className="w-full"
          onClick={onRetake}
        >
          New round
        </Button>
        <Button variant="quiet" className="w-full" onClick={onBack}>
          Back to deck
        </Button>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "good" | "bad";
}) {
  return (
    <div className="rounded-xl border border-border bg-background px-2 py-2.5">
      <div
        className={cn(
          "text-xl font-semibold tabular-nums text-foreground",
          tone === "good" && "text-green-600 dark:text-green-400",
          tone === "bad" && "text-red-600 dark:text-red-400",
        )}
      >
        {value}
      </div>
      <div className="text-[11px] font-medium text-muted-foreground">
        {label}
      </div>
    </div>
  );
}
