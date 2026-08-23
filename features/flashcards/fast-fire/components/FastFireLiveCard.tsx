// features/flashcards/fast-fire/components/FastFireLiveCard.tsx
//
// The live drill card (REQUIREMENTS §2.3): ONLY the front is shown, a timer bar
// depletes, the learner speaks aloud, and the card advances on the deadline. No
// "flip" / "submit" buttons — the timer drives everything. A live mini-scoreboard
// shows grades catching up in the background ("processing N…"). The "I'm
// confused" button runs the help lane (mandate-resolved, best-effort).
//
// React Compiler is on: no manual memo.

"use client";

import { useEffect, useRef, useState } from "react";
import {
  HelpCircle,
  SkipForward,
  X,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { helpLive, type HelpLiveResult } from "../agents/helpLive.thunk";
import { studyService } from "@/features/education/study/service/studyService";
import type { SessionAiJournal } from "@/features/education/study/types";
import { coerceTrustEnvelope } from "@/features/education/trust/types";
import {
  selectFastFirePhase,
  selectFastFireCurrentCard,
  selectFastFireCurrentIndex,
  selectFastFireCards,
  selectFastFireConfig,
  selectFastFireScoreboard,
  selectPendingGradeCount,
  selectFastFireSessionId,
  selectFastFireAdaptation,
  selectFoldedCount,
} from "../redux/fastFire.selectors";
import CardFaceContent from "@/components/mardown-display/blocks/flashcards/CardFaceContent";
import { FastFireTimerBar } from "./FastFireTimerBar";
import { SpokenFrontPlayer } from "./SpokenFrontPlayer";
import { SeeSourceButton } from "@/features/education/trust/components/SeeSourceButton";
import { LiveHelpAnswerBlock } from "@/features/education/tutor/components/LiveHelpAnswerBlock";
import { FlashcardFaceImage } from "@/components/mardown-display/blocks/flashcards/FlashcardFaceImage";

interface FastFireLiveCardProps {
  subscribeProgress: (
    cb: (remainingMs: number, progress: number) => void,
  ) => () => void;
  onSkip: () => void;
  onAbort: () => void;
  /** VOICE MODE: called when the spoken question finishes → starts the timer. */
  onSpokenFrontEnded: (cardId: string) => void;
}

export function FastFireLiveCard({
  subscribeProgress,
  onSkip,
  onAbort,
  onSpokenFrontEnded,
}: FastFireLiveCardProps) {
  const dispatch = useAppDispatch();
  const phase = useAppSelector(selectFastFirePhase);
  const card = useAppSelector(selectFastFireCurrentCard);
  const index = useAppSelector(selectFastFireCurrentIndex);
  const cards = useAppSelector(selectFastFireCards);
  const config = useAppSelector(selectFastFireConfig);
  const board = useAppSelector(selectFastFireScoreboard);
  const pending = useAppSelector(selectPendingGradeCount);
  const sessionId = useAppSelector(selectFastFireSessionId);
  const adaptation = useAppSelector(selectFastFireAdaptation);
  const foldedCount = useAppSelector(selectFoldedCount);

  const [help, setHelp] = useState<HelpLiveResult | null>(null);
  const [helpLoading, setHelpLoading] = useState(false);
  // Q15 zero-wait lane: the card's PRE-GENERATED helper (text + durable audio)
  // shows/plays the instant the button is tapped — no run, no wait. The live
  // personalized lane still fires and replaces the text when it lands.
  const [instantHelp, setInstantHelp] = useState<{
    fileId: string;
    text: string | null;
    /** Bumped per tap so a re-tap remounts the player and replays the clip. */
    nonce: number;
  } | null>(null);
  const cardShownAtRef = useRef<number>(0);

  // L3: clear any help text when the card changes, so the previous card's help
  // doesn't linger over the next card. Keyed on the card id. Also resets the
  // "time on card" clock the help lane reports as real context.
  //
  // D151: clearing the DISPLAY is correct; it used to also destroy the answer.
  // The lane now journals every answer on the drill's session the instant it
  // lands, and `journal` below reads it back — so a timed-out card whose help
  // arrived a beat late is still recoverable instead of simply gone.
  useEffect(() => {
    setHelp(null);
    setInstantHelp(null);
    cardShownAtRef.current = Date.now();
  }, [card?.id]);

  const [journal, setJournal] = useState<SessionAiJournal>({});
  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    void studyService.getSession(sessionId).then((res) => {
      if (cancelled || !res.data?.session) return;
      setJournal(studyService.readSessionJournal(res.data.session));
    });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  // This card's live answer, else the one this drill already paid for.
  const storedHelp = ((): HelpLiveResult | null => {
    const rows = journal.helpAnswers ?? [];
    for (let i = rows.length - 1; i >= 0; i--) {
      if (rows[i].cardId !== card?.id) continue;
      return {
        answer: rows[i].answer,
        hintLevel: rows[i].hintLevel as HelpLiveResult["hintLevel"],
        followups: rows[i].followups,
        trust: coerceTrustEnvelope(rows[i].trust),
      };
    }
    return null;
  })();
  const shownHelp = help ?? storedHelp;

  if (!card) return null;

  // H1+H4: between cards (`advancing` beat) the card is no longer being recorded,
  // so Skip and Help are no-ops — disable them rather than render them live-but-
  // dead. They re-enable when the next card enters `card_recording`.
  const betweenCards = phase !== "card_recording";

  const askForHelp = async (): Promise<void> => {
    // Zero wait: cached helper audio + text land IMMEDIATELY ("fast fire = you
    // never wait on the AI"). The live lane below still runs for the deeper,
    // context-aware answer.
    if (card.helperFileId) {
      setInstantHelp((prev) => ({
        fileId: card.helperFileId as string,
        text: card.helperText ?? null,
        nonce: (prev?.nonce ?? 0) + 1,
      }));
    }
    setHelpLoading(true);
    setHelp(null);
    try {
      const result = await dispatch(
        helpLive({
          cardId: card.id,
          front: card.front,
          back: card.back,
          timeOnCardMs: Date.now() - cardShownAtRef.current,
        }),
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
          <span className="flex min-w-0 items-center gap-2 text-xs font-medium text-muted-foreground">
            <span className="shrink-0">
              Card {index + 1} / {cards.length}
            </span>
            {/* Collapse receipt (26a) — folding must never read as data loss:
                the learner sees WHY the deck is shorter. Shown on card 1 only. */}
            {foldedCount > 0 && index === 0 && (
              <span className="inline-flex min-w-0 items-center gap-1 rounded-full border border-green-600/40 bg-green-500/10 px-2 py-0.5 text-[10px] font-medium text-green-700 dark:text-green-400">
                <CheckCircle2 className="h-2.5 w-2.5 shrink-0" />
                <span className="truncate">
                  {foldedCount} mastered sub-card{foldedCount === 1 ? "" : "s"}{" "}
                  folded in
                </span>
              </span>
            )}
            {/* VISION §3 — the adaptation is EXPLAINED, never a silent
                shuffle: when resolving grades tilt the unseen queue toward a
                struggling topic, the learner sees why the order shifted.
                The receipt is honest about TIME (F5): it shows only while the
                reordered cards are actually coming up (a few cards past the
                reorder point), never on the final card. */}
            {adaptation &&
              adaptation.count > 0 &&
              index < cards.length - 1 &&
              index < adaptation.atIndex + 3 && (
              <span className="inline-flex min-w-0 items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                <Zap className="h-2.5 w-2.5 shrink-0" />
                <span className="truncate">
                  {adaptation.focusTopic
                    ? `Adapting — more ${adaptation.focusTopic} coming up`
                    : "Adapting to how you're doing"}
                </span>
              </span>
            )}
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
          <SpokenFrontPlayer
            fileId={card.spokenFrontFileId}
            cardId={card.id}
            onEnded={onSpokenFrontEnded}
          />
        )}

        {/* The card — FRONT ONLY (you speak the back) */}
        <div className="flex min-h-[40dvh] flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-card p-6 text-center shadow-sm">
          {(card.frontImageFileId || card.frontImageUrl) && (
            <FlashcardFaceImage
              image={{
                fileId: card.frontImageFileId,
                url: card.frontImageUrl,
                alt: card.frontImageAlt ?? undefined,
              }}
              className="max-h-[22dvh] shrink-0"
            />
          )}
          {/* The most-looked-at face in the product — markdown + LaTeX through
              the canonical per-face child, never raw text (a calculus card
              showed a literal \frac here until 2026-08-18). */}
          <div className="text-2xl font-semibold leading-snug text-foreground sm:text-3xl">
            <CardFaceContent content={card.front} variant="inline" />
          </div>
        </div>

        {/* Help + see-source + skip */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
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
            {/* Spec 26e — "See source": open the exact cited passage in the
                Source Inspector overlay. Renders only when the card carries
                provenance (trust refs or the lineage edge). */}
            <SeeSourceButton source={card.sourceRef} label="Source" />
          </div>
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

        {/* Pre-generated helper: plays the moment the button was tapped (the
            zero-wait lane). The player is text-independent — the live answer
            below may replace the text while the audio keeps playing. */}
        {instantHelp && (
          <SpokenFrontPlayer
            fileId={instantHelp.fileId}
            cardId={`${card.id}-help-${instantHelp.nonce}`}
          />
        )}
        {!shownHelp && instantHelp?.text && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200">
            {instantHelp.text}
          </div>
        )}

        {/* Help result — the `live_help_answer` kind component (answer,
            hint level, followups, citations; refusal-gated inside). */}
        {shownHelp && <LiveHelpAnswerBlock result={shownHelp} />}

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
