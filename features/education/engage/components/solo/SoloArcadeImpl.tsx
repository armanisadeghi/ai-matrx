// features/education/engage/components/solo/SoloArcadeImpl.tsx
//
// Solo arcade — the daily-habit surface. The SAME game engine (useGamePlay) as
// multiplayer, single-player against your due/weak queue (Gravity's
// replacement). Every answer records to the spine and demonstrably moves
// item_mastery. Heavy client component → loaded via `next/dynamic({ssr:false})`
// from the route (the *Impl + wrapper split for the code-splitting doctrine).
//
// "Play again" remounts a keyed <SoloRound> so the queue is rebuilt fresh (the
// game engine's load effect keys off source, not a round counter).
//
// React Compiler is on: no manual useMemo / useCallback / React.memo.

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";
import { ArrowLeft, Loader2, Gamepad2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useGamePlay } from "../../data/useGamePlay";
import { finalizeGame } from "../../data/finalizeGame";
import { useCurrentPlayer } from "../../data/useCurrentPlayer";
import { DEFAULT_ROOM_CONFIG, type GameOutcome } from "../../types";
import { PlaySurface } from "../play/PlaySurface";
import { ResultsSummary } from "../results/ResultsSummary";
import type { BadgeKey } from "../../engine/badges";

/** Solo rounds are short + snappy — a tighter clock than a multiplayer match. */
const SOLO_CONFIG = { ...DEFAULT_ROOM_CONFIG, durationMs: 90_000 };

export function SoloArcadeImpl({
  sourceSetId,
  sourceTitle,
}: {
  sourceSetId?: string | null;
  sourceTitle?: string | null;
}) {
  const [roundKey, setRoundKey] = useState(0);
  return (
    <SoloRound
      key={roundKey}
      sourceSetId={sourceSetId}
      sourceTitle={sourceTitle}
      onPlayAgain={() => setRoundKey((k) => k + 1)}
    />
  );
}

function SoloRound({
  sourceSetId,
  sourceTitle,
  onPlayAgain,
}: {
  sourceSetId?: string | null;
  sourceTitle?: string | null;
  onPlayAgain: () => void;
}) {
  const router = useRouter();
  const { displayName } = useCurrentPlayer();
  const [finalOutcome, setFinalOutcome] = useState<GameOutcome | null>(null);
  const [newBadges, setNewBadges] = useState<BadgeKey[]>([]);

  const game = useGamePlay({
    sourceKind: sourceSetId ? "set" : "due",
    sourceSetId: sourceSetId ?? null,
    sourceTitle: sourceTitle ?? null,
    config: SOLO_CONFIG,
    mode: "solo",
    autoStart: true,
    onFinish: (outcome) => {
      setFinalOutcome(outcome);
      void finalizeGame({ outcome, displayName }).then((r) => {
        setNewBadges(r.newBadges);
        if (r.newBadges.length > 0) {
          toast.success(`New badge earned!`);
        }
      });
    },
  });

  const back = () => router.push("/education/game");

  if (game.status === "error") {
    return (
      <Centered>
        <p className="max-w-sm text-center text-sm text-muted-foreground">
          {game.error}
        </p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={back}>
            <ArrowLeft className="mr-1 h-4 w-4" /> Back
          </Button>
          <Button onClick={() => router.push("/education/flashcards")}>
            Create a deck
          </Button>
        </div>
      </Centered>
    );
  }

  if (game.status === "loading" || game.status === "ready") {
    return (
      <Centered>
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Building your queue…</p>
      </Centered>
    );
  }

  if (game.status === "finished" && finalOutcome) {
    return (
      <div className="h-full overflow-y-auto px-4">
        <ResultsSummary
          outcome={finalOutcome}
          newBadges={newBadges}
          onPlayAgain={onPlayAgain}
          onExit={back}
        />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col p-4">
      <div className="mb-3 flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={back} className="gap-1">
          <ArrowLeft className="h-4 w-4" /> Exit
        </Button>
        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground">
          <Gamepad2 className="h-4 w-4" /> Solo Arcade
        </span>
      </div>
      <div className="min-h-0 flex-1">
        <PlaySurface game={game} />
      </div>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3">
      {children}
    </div>
  );
}
