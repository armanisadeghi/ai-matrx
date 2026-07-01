// features/flashcards/fast-fire/components/FastFireLiveCard.tsx
//
// The live drill card (REQUIREMENTS §2.3): ONLY the front is shown, a timer bar
// depletes, the learner speaks aloud, and the card advances on the deadline. No
// "flip" / "submit" buttons — the timer drives everything. A live mini-scoreboard
// shows grades catching up in the background ("processing N…"). The "I'm
// confused" button runs the optional help lane (no-op-friendly when unconfigured).
//
// React Compiler is on: no manual memo.

"use client";

import { useEffect, useState } from "react";
import {
  HelpCircle,
  SkipForward,
  X,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { getFastFireAgentConfig } from "../config";
import { helpLive, type HelpLiveResult } from "../agents/helpLive.thunk";
import {
  selectFastFirePhase,
  selectFastFireCurrentCard,
  selectFastFireCurrentIndex,
  selectFastFireCards,
  selectFastFireConfig,
  selectFastFireScoreboard,
  selectPendingGradeCount,
} from "../redux/fastFire.selectors";
import { FastFireTimerBar } from "./FastFireTimerBar";
import { SpokenFrontPlayer } from "./SpokenFrontPlayer";

interface FastFireLiveCardProps {
  subscribeProgress: (
    cb: (remainingMs: number, progress: number) => void,
  ) => () => void;
  onSkip: () => void;
  onAbort: () => void;
}

export function FastFireLiveCard({
  subscribeProgress,
  onSkip,
  onAbort,
}: FastFireLiveCardProps) {
  const dispatch = useAppDispatch();
  const phase = useAppSelector(selectFastFirePhase);
  const card = useAppSelector(selectFastFireCurrentCard);
  const index = useAppSelector(selectFastFireCurrentIndex);
  const cards = useAppSelector(selectFastFireCards);
  const config = useAppSelector(selectFastFireConfig);
  const board = useAppSelector(selectFastFireScoreboard);
  const pending = useAppSelector(selectPendingGradeCount);

  const [help, setHelp] = useState<HelpLiveResult | null>(null);
  const [helpLoading, setHelpLoading] = useState(false);
  const [helpUnavailable, setHelpUnavailable] = useState(false);

  // L3: clear any help text when the card changes, so the previous card's help
  // doesn't linger over the next card. Keyed on the card id.
  useEffect(() => {
    setHelp(null);
    setHelpUnavailable(false);
  }, [card?.id]);

  if (!card) return null;

  // H1+H4: between cards (`advancing` beat) the card is no longer being recorded,
  // so Skip and Help are no-ops — disable them rather than render them live-but-
  // dead. They re-enable when the next card enters `card_recording`.
  const betweenCards = phase !== "card_recording";

  const askForHelp = async (): Promise<void> => {
    const cfg = getFastFireAgentConfig();
    if (!cfg.helpAgentId) {
      setHelpUnavailable(true);
      return;
    }
    setHelpLoading(true);
    setHelp(null);
    try {
      const result = await dispatch(
        helpLive({ front: card.front, back: card.back }),
      );
      setHelp(result);
    } finally {
      setHelpLoading(false);
    }
  };

  return (
    <div className="min-h-full w-full bg-textured">
      <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 sm:px-6 py-4 sm:py-6 pb-safe">
        {/* Top row: progress + abort */}
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">
            Card {index + 1} / {cards.length}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1 px-2 text-xs text-muted-foreground"
            onClick={onAbort}
          >
            <X className="h-4 w-4" />
            End
          </Button>
        </div>

        {/* Timer bar + mic level + recording indicator */}
        <FastFireTimerBar subscribeProgress={subscribeProgress} />

        {/* Optional: speak the question aloud the instant the card appears
            (pre-generated + cached; plays only during the live recording phase). */}
        {config.spokenFronts && !betweenCards && card.spokenFrontFileId && (
          <SpokenFrontPlayer fileId={card.spokenFrontFileId} cardId={card.id} />
        )}

        {/* The card — FRONT ONLY (you speak the back) */}
        <div className="flex min-h-[40dvh] items-center justify-center rounded-2xl border border-border bg-card p-6 text-center shadow-sm">
          <p className="text-2xl font-semibold leading-snug text-foreground sm:text-3xl">
            {card.front}
          </p>
        </div>

        {/* Help + skip */}
        <div className="flex items-center justify-between gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => void askForHelp()}
            disabled={helpLoading || betweenCards}
          >
            {helpLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <HelpCircle className="h-4 w-4" />
            )}
            I&apos;m confused
          </Button>
          {/* Answer early → advance NOW. Mechanically this closes the card's
              window at the current sample (PCM slice start→now +pad, with the
              trailing pad captured during the advance), grades it, and moves on —
              fully audio-safe with the Web-Audio core. Prominent because "move
              ahead when you're done" is a primary action, not a rare escape. */}
          <Button
            variant="secondary"
            size="sm"
            className="gap-1.5 font-medium"
            onClick={onSkip}
            disabled={betweenCards}
          >
            <SkipForward className="h-4 w-4" />
            Next card
          </Button>
        </div>

        {/* Help result / unavailable hint */}
        {helpUnavailable && (
          <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            Live help isn&apos;t configured yet. Set a help agent in FastFire
            settings to enable it.
          </div>
        )}
        {help && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200">
            {help.answer}
          </div>
        )}

        {/* Live background-grading status (only when liveScore is on) */}
        {config.liveScore && (
          <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
            {pending > 0 && (
              <span className="inline-flex items-center gap-1.5">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Grading {pending} in background…
              </span>
            )}
            {board.graded > 0 && (
              <span className="inline-flex items-center gap-3">
                <span className="inline-flex items-center gap-1 text-green-600 dark:text-green-400">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {board.correct}
                </span>
                <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                  <AlertCircle className="h-3.5 w-3.5" />
                  {board.partial}
                </span>
                <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400">
                  <XCircle className="h-3.5 w-3.5" />
                  {board.incorrect}
                </span>
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
