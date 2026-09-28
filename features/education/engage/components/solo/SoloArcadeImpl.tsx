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
import { useGamePlay, type UseGamePlayResult } from "../../data/useGamePlay";
import {
  StudyOrganizationGate,
  useStudyOrganizationReady,
} from "@/features/education/study/components/StudyOrganizationGate";
import { finalizeGame } from "../../data/finalizeGame";
import { useCurrentPlayer } from "../../data/useCurrentPlayer";
import { DEFAULT_ROOM_CONFIG, type GameOutcome } from "../../types";
import { PlaySurface } from "../play/PlaySurface";
import { ResultsSummary } from "../results/ResultsSummary";
import type { BadgeKey } from "../../engine/badges";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import {
  EDUCATION_GAME_SOLO_SURFACE_NAME,
  createEducationGameSoloScope,
  mapSoloMisses,
} from "@/features/surfaces/manifests/education-game-solo.manifest";
import type { SurfaceScopePayload } from "@/features/surfaces/types";

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
  // A round writes a study session, filed under one organization: with none
  // chosen, the notice shows in place (never the blocking workspace prompt).
  return (
    <StudyOrganizationGate what="This game">
      <SoloRound
        key={roundKey}
        sourceSetId={sourceSetId}
        sourceTitle={sourceTitle}
        onPlayAgain={() => setRoundKey((k) => k + 1)}
      />
    </StudyOrganizationGate>
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
  const orgReady = useStudyOrganizationReady();
  const { displayName } = useCurrentPlayer();
  const [finalOutcome, setFinalOutcome] = useState<GameOutcome | null>(null);
  const [newBadges, setNewBadges] = useState<BadgeKey[]>([]);
  const [verified, setVerified] = useState(false);
  const [verificationError, setVerificationError] = useState<string | null>(
    null,
  );

  async function verifyOutcome(outcome: GameOutcome): Promise<void> {
    setVerificationError(null);
    setVerified(false);
    const result = await finalizeGame({ outcome, displayName });
    setNewBadges(result.newBadges);
    setVerificationError(result.error);
    if (result.officialOutcome) {
      setFinalOutcome(result.officialOutcome);
      setVerified(true);
    }
    if (result.newBadges.length > 0) toast.success("New badge earned!");
  }

  const game = useGamePlay({
    sourceKind: sourceSetId ? "set" : "due",
    sourceSetId: sourceSetId ?? null,
    sourceTitle: sourceTitle ?? null,
    config: SOLO_CONFIG,
    mode: "solo",
    autoStart: true,
    // Nothing loads or is written until an organization is chosen.
    enabled: orgReady,
    onFinish: (outcome) => {
      setFinalOutcome(outcome);
      void verifyOutcome(outcome);
    },
  });

  const back = () => router.push("/education/game");

  let body: React.ReactNode;

  if (game.status === "error") {
    body = (
      <Centered>
        <p className="max-w-sm text-center text-sm text-muted-foreground">
          {game.error}
          <ErrorAlchemyMenu />
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
  } else if (game.status === "loading" || game.status === "ready") {
    body = (
      <Centered>
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Building your queue…</p>
      </Centered>
    );
  } else if (game.status === "finished" && finalOutcome) {
    body = (
      <div className="scroll-page-end-space h-full overflow-y-auto px-4">
        <ResultsSummary
          outcome={finalOutcome}
          newBadges={newBadges}
          verified={verified}
          verificationError={verificationError}
          onRetryVerification={() => void verifyOutcome(finalOutcome)}
          onPlayAgain={onPlayAgain}
          onExit={back}
        />
      </div>
    );
  } else {
    body = (
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

  return (
    <SurfaceRuntimeProvider
      surfaceName={EDUCATION_GAME_SOLO_SURFACE_NAME}
      getScope={() => buildSoloArcadeScope(game, sourceSetId ?? null, sourceTitle ?? null)}
    >
      {body}
    </SurfaceRuntimeProvider>
  );
}

/**
 * Builds the live `matrx-user/education-game-solo` scope from the current
 * `useGamePlay` result. Synchronous and read-only — the Surface Context
 * window polls this repeatedly, so it must never fetch.
 */
function buildSoloArcadeScope(
  game: UseGamePlayResult,
  sourceSetId: string | null,
  sourceTitle: string | null,
): SurfaceScopePayload {
  const phase =
    game.status === "loading" || game.status === "ready"
      ? "loading"
      : game.status;
  const seconds =
    game.remainingMs != null ? Math.ceil(game.remainingMs / 1000) : undefined;

  return createEducationGameSoloScope({
    phase,
    ...(phase === "loading"
      ? {}
      : {
          source_kind: sourceSetId ? "set" : "due",
          ...(sourceTitle ? { source_title: sourceTitle } : {}),
          score: game.score,
          streak: game.streak,
          best_streak: game.bestStreak,
          currency: game.currency,
          mastery_gain: game.masteryGain,
          answered_count: game.answeredCount,
          correct_count: game.correctCount,
          recent_misses: mapSoloMisses(game.misses),
          misses_count: game.misses.length,
        }),
    ...(seconds != null ? { remaining_seconds: seconds } : {}),
    ...(game.question
      ? {
          question_number: Math.min(game.index + 1, game.total),
          question_total: game.total,
          question_prompt: game.question.prompt,
          question_choices: game.question.choices,
          question_is_due: game.question.isDue,
        }
      : {}),
    ...(game.lastAnswer
      ? {
          last_answer: {
            correct: game.lastAnswer.correct,
            chosen_text: game.question?.choices[game.lastAnswer.chosenIndex] ?? "",
            correct_text: game.question?.choices[game.question.correctIndex] ?? "",
          },
        }
      : {}),
  });
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3">
      {children}
    </div>
  );
}
