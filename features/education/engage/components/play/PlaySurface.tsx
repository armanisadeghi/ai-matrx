// features/education/engage/components/play/PlaySurface.tsx
//
// The shared in-game UI — HUD (score / streak / timer / mastery), the current
// question with multiple-choice answers, the earn-to-upgrade power-up bar, and
// per-answer feedback. Driven entirely by a `useGamePlay` result, so solo and
// multiplayer render the identical loop. Enterprise-clean: Lucide icons, no
// emojis, semantic color tokens.
//
// React Compiler is on: no manual useMemo / useCallback / React.memo.

"use client";

import { Check, X, Clock, Flame, Zap, TrendingUp, Coins } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { POWER_UP_LIST } from "../../engine/scoring";
import type { UseGamePlayResult } from "../../data/useGamePlay";

export function PlaySurface({ game }: { game: UseGamePlayResult }) {
  const {
    question,
    index,
    total,
    score,
    streak,
    currency,
    masteryGain,
    remainingMs,
    hiddenChoices,
    doublePointsArmed,
    shieldArmed,
    lastAnswer,
    answer,
    buyPowerUp,
  } = game;

  if (!question) return null;

  const seconds = remainingMs != null ? Math.ceil(remainingMs / 1000) : null;

  return (
    <div className="flex h-full flex-col gap-3">
      {/* HUD */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Stat icon={TrendingUp} label="Score" value={score.toLocaleString()} />
        <Stat
          icon={Flame}
          label="Streak"
          value={String(streak)}
          highlight={streak >= 3}
        />
        <Stat icon={Coins} label="Coins" value={String(currency)} />
        <Stat
          icon={TrendingUp}
          label="Mastery"
          value={`+${masteryGain.toFixed(1)}`}
        />
        <div className="ml-auto flex items-center gap-2">
          <span className="text-muted-foreground">
            {Math.min(index + 1, total)} / {total}
          </span>
          {seconds != null && (
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 font-mono tabular-nums",
                seconds <= 10 && "bg-destructive/10 text-destructive",
              )}
            >
              <Clock className="h-3.5 w-3.5" />
              {seconds}s
            </span>
          )}
        </div>
      </div>

      {/* Power-up bar (earn-to-upgrade — keeps late players in the match) */}
      <div className="flex flex-wrap items-center gap-2">
        {POWER_UP_LIST.map((pu) => {
          const armed =
            (pu.key === "double_points" && doublePointsArmed) ||
            (pu.key === "shield" && shieldArmed);
          const usedFifty = pu.key === "fifty_fifty" && hiddenChoices.length > 0;
          const affordable = currency >= pu.cost && !armed && !usedFifty;
          return (
            <Button
              key={pu.key}
              type="button"
              size="sm"
              variant={armed ? "default" : "outline"}
              disabled={!affordable}
              onClick={() => buyPowerUp(pu.key)}
              title={pu.description}
              className="gap-1"
            >
              <Zap className="h-3.5 w-3.5" />
              {pu.label}
              <span className="ml-1 inline-flex items-center gap-0.5 text-xs opacity-70">
                <Coins className="h-3 w-3" />
                {pu.cost}
              </span>
            </Button>
          );
        })}
      </div>

      {/* Question */}
      <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-border bg-card p-5">
        {question.isDue && (
          <span className="mb-2 inline-flex w-fit items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
            <TrendingUp className="h-3 w-3" /> Due for review
          </span>
        )}
        <p className="mb-4 text-lg font-semibold text-foreground">
          {question.prompt}
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {question.choices.map((choice, i) => {
            const hidden = hiddenChoices.includes(i);
            const answered = lastAnswer != null;
            const isCorrect = i === question.correctIndex;
            const isChosen = lastAnswer?.chosenIndex === i;
            return (
              <button
                key={i}
                type="button"
                disabled={answered || hidden}
                onClick={() => answer(i)}
                className={cn(
                  "flex items-center justify-between rounded-lg border border-border bg-background px-4 py-3 text-left text-sm transition-colors",
                  !answered && !hidden && "hover:border-primary hover:bg-accent",
                  hidden && "pointer-events-none opacity-30",
                  answered && isCorrect && "border-green-500 bg-green-500/10",
                  answered &&
                    isChosen &&
                    !isCorrect &&
                    "border-destructive bg-destructive/10",
                )}
              >
                <span>{choice}</span>
                {answered && isCorrect && (
                  <Check className="h-4 w-4 text-green-600" />
                )}
                {answered && isChosen && !isCorrect && (
                  <X className="h-4 w-4 text-destructive" />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  highlight,
}: {
  icon: typeof Flame;
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-1",
        highlight && "bg-orange-500/15 text-orange-600 dark:text-orange-400",
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold tabular-nums text-foreground">{value}</span>
    </span>
  );
}
