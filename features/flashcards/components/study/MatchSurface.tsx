// features/flashcards/components/study/MatchSurface.tsx
//
// Phase 1B (Match mode) — the click-to-pair matching game surface for ONE
// flashcard set. A thin driver over useMatchGame → this presentational
// board (tile grid, timer, attempts, completion summary).
//
// React Compiler is on: no manual useMemo / useCallback / React.memo.

"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { formatDurationMs } from "@ai-matrx/kit/format";
import {
  Trophy,
  Layers,
  BookOpen,
  Timer,
  Target,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { AccessGate } from "@/features/access-gate/components/AccessGate";
import MatrxMiniLoader from "@/components/loaders/MatrxMiniLoader";
import { cn } from "@/lib/utils";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { useMatchGame } from "../../data/useMatchGame";
import { StudyDeckHeader } from "./StudyDeckHeader";
import CardFaceBlock from "@/components/mardown-display/blocks/flashcards/CardFaceBlock";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

const EDU_BASE = "/education/flashcards";

export function MatchSurface({ setId }: { setId: string }) {
  const router = useRouter();
  // The session files under the deck's own organization (see the hook).
  const game = useMatchGame({
    setId,
    withSession: true,
  });
  const title = game.set?.name ?? "Match";

  return (
    <>
      <PageHeader>
        <StudyDeckHeader
          title={`Match — ${title}`}
          backHref={`${EDU_BASE}/${setId}`}
        />
      </PageHeader>
      <div className="h-full overflow-y-auto overscroll-contain bg-background">
        <div className="mx-auto max-w-4xl px-2 pb-safe pt-14 sm:px-6">
          {game.loading ? (
            <div className="flex h-64 items-center justify-center">
              <MatrxMiniLoader />
            </div>
          ) : game.error ? (
            // Denied / deleted / never existed / signed-out all read as the
            // same failed load — the gate asks the platform which one it is.
            <AccessGate
              token="fc_set"
              id={setId}
              error={game.error}
              fallbackHref={EDU_BASE}
              fallbackLabel="Flashcards"
            />
          ) : game.totalCards === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-card px-6 py-16 text-center">
              <BookOpen className="h-6 w-6 text-muted-foreground" />
              <p className="text-sm font-medium text-foreground">
                This set has no cards yet
              </p>
              <p className="max-w-sm text-xs text-muted-foreground">
                Generate some in chat to play Match.
              </p>
            </div>
          ) : game.completed ? (
            <CompletionScreen
              elapsedMs={game.elapsedMs}
              attempts={game.attempts}
              totalCards={game.totalCards}
              pairPicker={<PairCountPicker game={game} />}
              onPlayAgain={game.restart}
              onBackToSet={() => router.push(`${EDU_BASE}/${setId}`)}
            />
          ) : (
            <Board game={game} />
          )}
        </div>
      </div>
    </>
  );
}

function Board({ game }: { game: ReturnType<typeof useMatchGame> }) {
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-xs text-muted-foreground">
        <PairCountPicker game={game} />
        <div className="flex items-center gap-4">
          <span className="inline-flex items-center gap-1">
            <Target className="h-3.5 w-3.5" />
            {game.matchedCardIds.size}/{game.totalCards} matched
          </span>
          <span className="inline-flex items-center gap-1 tabular-nums">
            <Timer className="h-3.5 w-3.5" />
            {formatDurationMs(game.elapsedMs, { style: "clock" })}
          </span>
        </div>
      </div>

      {/* Every tile is the same fixed size at every width: the grid columns
          share the width equally and each tile has one fixed height. A long
          face scrolls inside its tile instead of stretching the row. */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
        {game.tiles.map((tile) => {
          const matched = game.matchedCardIds.has(tile.cardId);
          const selected = game.selectedTileId === tile.id;
          const mismatched = game.mismatchTileIds?.includes(tile.id) ?? false;
          return (
            <button
              key={tile.id}
              type="button"
              disabled={matched}
              onClick={() => game.selectTile(tile.id)}
              className={cn(
                "flex h-32 min-w-0 flex-col overflow-hidden rounded-lg border text-center text-xs font-medium leading-snug transition-all sm:h-36",
                matched &&
                  "border-green-500/40 bg-green-50/60 text-green-700/60 opacity-0 dark:bg-green-950/20 dark:text-green-400/50",
                !matched &&
                  !selected &&
                  !mismatched &&
                  "border-border bg-card text-foreground hover:border-primary/50 hover:bg-accent",
                selected &&
                  !mismatched &&
                  "border-primary bg-primary/10 text-foreground",
                mismatched &&
                  "border-red-500/60 bg-red-50 text-red-900 dark:bg-red-950/30 dark:text-red-200",
              )}
            >
              {/* The face renders through the flip card's own renderer. */}
              <span className="block h-full w-full overflow-y-auto overscroll-contain p-2.5 scrollbar-thin">
                <span className="flex min-h-full w-full flex-col justify-center">
                  <CardFaceBlock content={tile.text} />
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </>
  );
}

/** Pairs per round. Hidden when the deck offers one choice or none. */
function PairCountPicker({ game }: { game: ReturnType<typeof useMatchGame> }) {
  if (game.pairCountChoices.length < 2) return null;
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">Pairs</span>
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        value={String(game.pairCount)}
        onValueChange={(next) => {
          const count = Number(next);
          if (next && count !== game.pairCount) game.setPairCount(count);
        }}
        aria-label="Pairs per round"
      >
        {game.pairCountChoices.map((n) => (
          <ToggleGroupItem
            key={n}
            value={String(n)}
            aria-label={`${n} pairs`}
            className="h-11 min-w-11 px-2 tabular-nums sm:h-8 sm:min-w-8"
          >
            {n}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}

function CompletionScreen({
  elapsedMs,
  attempts,
  totalCards,
  pairPicker,
  onPlayAgain,
  onBackToSet,
}: {
  elapsedMs: number;
  attempts: number;
  totalCards: number;
  pairPicker: ReactNode;
  onPlayAgain: () => void;
  onBackToSet: () => void;
}) {
  const accuracy =
    attempts > 0 ? Math.round((totalCards / attempts) * 100) : 100;
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-2xl border border-border bg-card px-6 py-10 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Trophy className="h-7 w-7" />
      </div>
      <h2 className="text-lg font-semibold text-foreground">Board cleared</h2>
      <div className="grid w-full grid-cols-3 gap-2 text-center">
        <Stat
          label="Time"
          value={formatDurationMs(elapsedMs, { style: "clock" })}
        />
        <Stat label="Attempts" value={`${attempts}`} />
        <Stat label="Accuracy" value={`${accuracy}%`} />
      </div>
      {pairPicker}
      <div className="flex w-full flex-col gap-2 sm:flex-row">
        <Button variant="outline" className="flex-1" onClick={onPlayAgain}>
          <RotateCcw className="mr-1.5 h-4 w-4" />
          Play again
        </Button>
        <Button className="flex-1" onClick={onBackToSet}>
          <Layers className="mr-1.5 h-4 w-4" />
          Back to set
        </Button>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-background px-2 py-2">
      <div className="text-lg font-semibold tabular-nums text-foreground">
        {value}
      </div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
    </div>
  );
}
