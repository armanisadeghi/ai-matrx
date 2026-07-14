"use client";

// features/education/media/audio/components/AudioReviewSession.tsx
//
// Audio review — "FastFire in audio-only format." Questions are read aloud, the
// learner answers by voice, each answer is graded on MEANING (gradeSpokenAnswer)
// and recorded to the shared study spine (method 'audio_review'), advancing FSRS
// mastery. Adaptive: when on, cards due for review (FSRS) come first.
//
// Reuses the hardened FastFire capture primitives (continuousCapture) — ONE warm
// mic across the whole session — the Cartesia read-aloud speaker, and the spine.
// React Compiler is on: no manual memo.
//
// Cross-surface orphan-on-interrupt fix (same pattern as
// useSpokenPractice.endSession, education/spoken-practice): endSession marks
// the study_session terminal (completed) as its first move, and quit() now
// marks it terminal too (abandoned) — so an interrupted tab or an early quit
// can never leave the session stuck in status='active' forever with attempts
// recorded but no terminal state. Loud-recovers (console + toast) on failure.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Loader2,
  Mic,
  Volume2,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { useAppDispatch } from "@/lib/redux/hooks";
import { useCartesiaSpeaker } from "@/features/tts/hooks/useCartesiaSpeaker";
import {
  startContinuousCapture,
  startCardClip,
  stopCardClip,
  stopContinuousCapture,
  hardStopCapture,
  isContinuousCaptureActive,
  playBuzzer,
} from "@/features/flashcards/fast-fire/audio/continuousCapture";
import { gradeSpokenAnswer } from "@/features/flashcards/fast-fire/agents/gradeSpokenAnswer.thunk";
import type { SpokenGrade } from "@/features/flashcards/fast-fire/agents/grading-core";
import { verdictResult, type GradeResult } from "@/features/education/trust/types";
import { fcService } from "@/features/flashcards/data/fcService";
import { studyService } from "@/features/education/study/service/studyService";
import type {
  CardWithDetails,
  FcSetRow,
} from "@/features/flashcards/data/types";

const ANSWER_SECONDS = 12;
const AUDIO_REVIEW_METHOD = "audio_review";

type Phase =
  "setup" | "asking" | "answering" | "grading" | "result" | "summary";

interface CardResult {
  cardId: string;
  result: GradeResult | "skipped";
  score: number;
}

const RESULT_STYLE: Record<
  GradeResult,
  { label: string; icon: typeof CheckCircle2; text: string; bg: string }
> = {
  correct: {
    label: "Correct",
    icon: CheckCircle2,
    text: "text-green-600 dark:text-green-400",
    bg: "bg-green-500/10",
  },
  partial: {
    label: "Almost",
    icon: AlertCircle,
    text: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-500/10",
  },
  incorrect: {
    label: "Not quite",
    icon: XCircle,
    text: "text-red-600 dark:text-red-400",
    bg: "bg-red-500/10",
  },
};

export function AudioReviewSession({
  initialDeckId,
}: {
  initialDeckId?: string;
}) {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { speak, stop: speakStop } = useCartesiaSpeaker({
    processMarkdown: true,
    purpose: "assistant",
  });

  const [decks, setDecks] = useState<FcSetRow[]>([]);
  const [deckId, setDeckId] = useState(initialDeckId ?? "");
  const [adaptive, setAdaptive] = useState(true);

  const [phase, setPhase] = useState<Phase>("setup");
  const [cards, setCards] = useState<CardWithDetails[]>([]);
  const [index, setIndex] = useState(0);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [results, setResults] = useState<CardResult[]>([]);
  const [grade, setGrade] = useState<SpokenGrade | null>(null);
  const [error, setError] = useState<string | null>(null);

  const capturingRef = useRef(false);
  const phaseRef = useRef<Phase>("setup");
  const answeringRef = useRef(false);
  const finishingRef = useRef(false);
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    fcService.listSets().then((res) => {
      if (res.data) setDecks(res.data);
    });
  }, []);

  // Clean up the mic on unmount.
  useEffect(() => {
    return () => {
      void speakStop();
      if (capturingRef.current) {
        hardStopCapture();
        capturingRef.current = false;
      }
    };
  }, [speakStop]);

  const card = cards[index];

  async function handleStart() {
    if (!deckId) {
      toast.error("Pick a deck to review");
      return;
    }
    const res = await fcService.getSetWithCards(deckId);
    if (res.error || !res.data || res.data.cards.length === 0) {
      toast.error(res.error ?? "That deck has no cards");
      return;
    }
    let ordered = res.data.cards;
    if (adaptive) {
      const due = await studyService.listDue("fc_card");
      const dueIds = new Set((due.data ?? []).map((m) => m.item_id));
      ordered = [...ordered].sort(
        (a, b) => Number(dueIds.has(b.id)) - Number(dueIds.has(a.id)),
      );
    }

    // Warm the mic inside the click gesture (iOS requirement).
    try {
      await startContinuousCapture();
      if (!isContinuousCaptureActive())
        throw new Error("Microphone did not start");
      capturingRef.current = true;
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Couldn't access the microphone",
      );
      return;
    }

    const session = await studyService.createSession({
      // The source is an fc_set (a "deck" in UI terms) — the study_session
      // check constraint accepts 'set', never 'deck'. Passing 'deck' silently
      // failed session creation (attempts still recorded, but orphaned from any
      // session); use the canonical token FastFire uses.
      mode: AUDIO_REVIEW_METHOD,
      sourceKind: "set",
      sourceSetId: deckId,
    });
    if (session.error || !session.data) {
      toast.error(session.error ?? "Couldn't start the review session");
      hardStopCapture();
      capturingRef.current = false;
      return;
    }
    setSessionId(session.data.id);
    setCards(ordered);
    setIndex(0);
    setResults([]);
    setPhase("asking");
  }

  // Ask: narrate the front, then open the answer window.
  useEffect(() => {
    if (phase !== "asking" || !card) return;
    answeringRef.current = false;
    finishingRef.current = false;
    let cancelled = false;
    const fallback = window.setTimeout(() => beginAnswer(), 20_000);
    void (async () => {
      await speak(card.front);
      if (!cancelled && phaseRef.current === "asking") beginAnswer();
    })();
    return () => {
      cancelled = true;
      window.clearTimeout(fallback);
      void speakStop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, index]);

  function beginAnswer() {
    if (phaseRef.current !== "asking" || answeringRef.current || !card) return;
    answeringRef.current = true;
    playBuzzer("start");
    startCardClip(card.id);
    setPhase("answering");
  }

  // Answer window timer.
  useEffect(() => {
    if (phase !== "answering") return;
    const id = window.setTimeout(
      () => void finishAnswer(),
      ANSWER_SECONDS * 1000,
    );
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, index]);

  async function finishAnswer() {
    if (phaseRef.current !== "answering" || finishingRef.current || !card)
      return;
    finishingRef.current = true;
    playBuzzer("stop");
    setPhase("grading");
    setGrade(null);
    setError(null);
    try {
      const clip = await stopCardClip(card.id);
      const res = await dispatch(
        gradeSpokenAnswer({
          front: card.front,
          back: card.back,
          secondsAllowed: ANSWER_SECONDS,
          clip,
          itemType: "fc_card",
          itemId: card.id,
          method: AUDIO_REVIEW_METHOD,
          sessionId,
          surface: "audio-review",
        }),
      );
      if (res.status === "graded" && res.grade) {
        setGrade(res.grade);
        setResults((r) => [
          ...r,
          {
            cardId: card.id,
            result: verdictResult(res.grade!.verdict),
            score: res.grade!.score,
          },
        ]);
      } else {
        setResults((r) => [
          ...r,
          { cardId: card.id, result: "skipped", score: 0 },
        ]);
        if (res.error) setError(res.error);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Grading failed");
      setResults((r) => [
        ...r,
        { cardId: card.id, result: "skipped", score: 0 },
      ]);
    } finally {
      setPhase("result");
    }
  }

  function next() {
    if (index + 1 >= cards.length) {
      void endSession();
      return;
    }
    setIndex((i) => i + 1);
    setGrade(null);
    setError(null);
    setPhase("asking");
  }

  // Terminal-first completion (same pattern as useSpokenPractice.endSession,
  // cross-surface orphan-on-interrupt fix). Mark the study_session terminal
  // IMMEDIATELY — before anything that could still be async/slow in the future
  // — so a crash or a tab close mid-flight can never leave the session stuck
  // in status='active' with recorded attempts but no terminal state. Loud on
  // failure; we still proceed (the summary screen is client-side).
  async function endSession() {
    if (capturingRef.current) {
      stopContinuousCapture();
      capturingRef.current = false;
    }
    if (sessionId) {
      const correct = results.filter((r) => r.result === "correct").length;
      const completed = await studyService.updateSession(sessionId, {
        status: "completed",
        ended_at: new Date().toISOString(),
        aggregate_score: cards.length ? correct / cards.length : 0,
      });
      if (completed.error) {
        console.error(
          "[audio-review] could not mark session completed:",
          completed.error,
        );
        toast.error(
          "We couldn't save your session status just now — your answers were recorded.",
        );
      }
    }
    setPhase("summary");
  }

  // Abandon: the learner quit mid-session (back button, "Quit"). Mark the
  // session terminal here too — same orphan-on-interrupt fix as endSession —
  // so leaving early never leaves status='active' forever with attempts
  // attached but no terminal state.
  function quit() {
    if (capturingRef.current) {
      stopContinuousCapture();
      capturingRef.current = false;
    }
    if (sessionId && phaseRef.current !== "summary") {
      void studyService
        .updateSession(sessionId, {
          status: "abandoned",
          ended_at: new Date().toISOString(),
        })
        .then((res) => {
          if (res.error) {
            console.error(
              "[audio-review] could not mark session abandoned:",
              res.error,
            );
          }
        });
    }
    router.push("/education/audio-study");
  }

  // ─── Render ─────────────────────────────────────────────────────────────
  if (phase === "setup") {
    return (
      <div className="mx-auto w-full max-w-md space-y-5 p-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push("/education/audio-study")}
            aria-label="Back"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-lg font-semibold text-foreground">
              Audio review
            </h1>
            <p className="text-xs text-muted-foreground">
              Questions read aloud — you answer by voice, graded on meaning.
            </p>
          </div>
        </div>
        <select
          value={deckId}
          onChange={(e) => setDeckId(e.target.value)}
          className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground"
        >
          <option value="">Select a deck…</option>
          {decks.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <label className="flex cursor-pointer items-start gap-2">
          <Checkbox
            checked={adaptive}
            onCheckedChange={(checked) => setAdaptive(checked === true)}
            className="mt-0.5"
          />
          <span className="text-sm text-foreground">
            Review what&apos;s due first
            <span className="block text-[11px] text-muted-foreground">
              Prioritizes cards the FSRS scheduler says you should review now.
            </span>
          </span>
        </label>
        <Button className="w-full gap-2" onClick={handleStart}>
          <Mic className="h-4 w-4" />
          Start review
        </Button>
      </div>
    );
  }

  if (phase === "summary") {
    const correct = results.filter((r) => r.result === "correct").length;
    return (
      <div className="mx-auto flex w-full max-w-md flex-col items-center gap-4 p-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
          <CheckCircle2 className="h-8 w-8 text-primary" />
        </div>
        <div>
          <div className="text-xl font-semibold text-foreground">
            Review complete
          </div>
          <div className="mt-0.5 text-sm text-muted-foreground">
            {correct} of {results.length} correct
          </div>
        </div>
        <div className="flex w-full flex-col gap-2 sm:flex-row">
          <Button
            className="flex-1"
            onClick={() => router.push("/education/flashcards/sessions")}
          >
            View session history
          </Button>
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => router.push("/education/audio-study")}
          >
            Done
          </Button>
        </div>
      </div>
    );
  }

  // Running (asking / answering / grading / result)
  const style = grade ? RESULT_STYLE[verdictResult(grade.verdict)] : null;
  return (
    <div className="mx-auto flex min-h-[60dvh] w-full max-w-md flex-col p-4">
      <div className="mb-4 flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          Card {index + 1} of {cards.length}
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="text-xs text-muted-foreground"
          onClick={quit}
        >
          Quit
        </Button>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
        {(phase === "asking" || phase === "answering") && card && (
          <>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              {phase === "answering" ? (
                <Mic className="h-3.5 w-3.5" />
              ) : (
                <Volume2 className="h-3.5 w-3.5" />
              )}
              {phase === "answering" ? "Answer out loud…" : "Listen…"}
            </span>
            <p className="max-w-xl text-2xl font-semibold leading-snug text-foreground">
              {card.front}
            </p>
          </>
        )}

        {phase === "grading" && (
          <>
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">
              Grading your answer…
            </p>
          </>
        )}

        {phase === "result" && card && (
          <div className="flex w-full flex-col items-center gap-3">
            {grade && style ? (
              <>
                <div
                  className={cn(
                    "flex h-14 w-14 items-center justify-center rounded-full",
                    style.bg,
                  )}
                >
                  <style.icon className={cn("h-7 w-7", style.text)} />
                </div>
                <div className={cn("text-lg font-semibold", style.text)}>
                  {style.label}
                </div>
                {grade.verdict.explanation && (
                  <p className="text-sm text-foreground">{grade.verdict.explanation}</p>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                {error ?? "Didn't catch that — moving on."}
              </p>
            )}
            <div className="w-full rounded-lg border border-border bg-background px-3 py-2 text-left">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Answer
              </div>
              <div className="text-sm text-foreground">{card.back}</div>
            </div>
            <Button className="w-full gap-1.5" onClick={next}>
              {index + 1 >= cards.length ? "Finish" : "Next card"}
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
