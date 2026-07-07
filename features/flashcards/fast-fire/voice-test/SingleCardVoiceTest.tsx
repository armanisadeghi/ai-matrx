"use client";

// features/flashcards/fast-fire/voice-test/SingleCardVoiceTest.tsx
//
// Voice test: setup → warm mic → ask (cached file OR Cartesia read-aloud) →
// answer → grade. Question playback uses SpokenFrontPlayer when a durable
// spoken_front exists; otherwise useCartesiaSpeaker (same as MessageOptionsMenu).

import { useEffect, useRef, useState } from "react";
import {
  Zap,
  Loader2,
  CheckCircle2,
  AlertCircle,
  XCircle,
  RotateCcw,
  X,
  Volume2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAppDispatch } from "@/lib/redux/hooks";
import { useCartesiaSpeaker } from "@/features/tts/hooks/useCartesiaSpeaker";
import {
  startContinuousCapture,
  startCardClip,
  stopCardClip,
  stopContinuousCapture,
  hardStopCapture,
  subscribeLevel,
  isContinuousCaptureActive,
  playBuzzer,
} from "../audio/continuousCapture";
import { SpokenFrontPlayer } from "../components/SpokenFrontPlayer";
import { gradeSpokenAnswer } from "../agents/gradeSpokenAnswer.thunk";
import type { SpokenGrade } from "../agents/grading-core";
import { VoiceTestAudioSetup } from "./VoiceTestAudioSetup";
import { VoiceAnswerMicMeter } from "./VoiceAnswerMicMeter";

type Phase =
  "setup" | "preparing" | "asking" | "answering" | "grading" | "result";

export interface SingleCardVoiceTestProps {
  card: { id: string; front: string; back: string };
  /** Cached spoken-front audio (fc_detail kind='spoken_front'); played if present. */
  spokenFrontFileId?: string | null;
  /** Seconds to answer after the question (default 10, per the owner's flow). */
  answerSeconds?: number;
  /** Record the attempt on the study spine (counts toward mastery). Default true. */
  record?: boolean;
  onClose: () => void;
}

const PREPARE_MIN_MS = 900;
const SPOKEN_FRONT_MAX_WAIT_MS = 25_000;

const RESULT_STYLE: Record<
  SpokenGrade["result"],
  {
    label: string;
    icon: typeof CheckCircle2;
    ring: string;
    text: string;
    bg: string;
  }
> = {
  correct: {
    label: "Correct",
    icon: CheckCircle2,
    ring: "text-green-500",
    text: "text-green-600 dark:text-green-400",
    bg: "bg-green-500/10",
  },
  partial: {
    label: "Almost",
    icon: AlertCircle,
    ring: "text-amber-500",
    text: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-500/10",
  },
  incorrect: {
    label: "Not quite",
    icon: XCircle,
    ring: "text-red-500",
    text: "text-red-600 dark:text-red-400",
    bg: "bg-red-500/10",
  },
};

export function SingleCardVoiceTest({
  card,
  spokenFrontFileId: initialSpokenFrontFileId,
  answerSeconds = 10,
  record = true,
  onClose,
}: SingleCardVoiceTestProps) {
  const dispatch = useAppDispatch();
  const {
    speak: cartesiaSpeak,
    stop: cartesiaStop,
    isLoading: cartesiaLoading,
    isPlaying: cartesiaPlaying,
  } = useCartesiaSpeaker({
    processMarkdown: true,
    purpose: "assistant",
  });
  const [phase, setPhase] = useState<Phase>("setup");
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [activeSpokenFrontFileId, setActiveSpokenFrontFileId] = useState<
    string | null
  >(initialSpokenFrontFileId ?? null);
  const [level, setLevel] = useState(0);
  const [grade, setGrade] = useState<SpokenGrade | null>(null);
  const [skipped, setSkipped] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showTranscript, setShowTranscript] = useState(false);

  const capturingRef = useRef(false);
  const spokenFallbackRef = useRef<number | null>(null);
  const phaseRef = useRef<Phase>("setup");
  const answerStartedRef = useRef(false);
  const finishStartedRef = useRef(false);

  useEffect(() => {
    phaseRef.current = phase;
    if (phase === "asking") {
      answerStartedRef.current = false;
      finishStartedRef.current = false;
    }
  }, [phase]);

  useEffect(() => {
    if (phase !== "answering") return undefined;
    let raf = 0;
    let last = 0;
    const unsub = subscribeLevel((l) => {
      const now = performance.now();
      if (now - last > 60) {
        last = now;
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => setLevel(l));
      }
    });
    return () => {
      unsub();
      cancelAnimationFrame(raf);
      setLevel(0);
    };
  }, [phase]);

  useEffect(() => {
    return () => {
      if (spokenFallbackRef.current) {
        clearTimeout(spokenFallbackRef.current);
        spokenFallbackRef.current = null;
      }
      void cartesiaStop();
      if (capturingRef.current) {
        hardStopCapture();
        capturingRef.current = false;
      }
    };
  }, [cartesiaStop]);

  /** Start gesture — warms the mic inside the click (same as useFastFireLauncher). */
  const handleSetupStart = (spokenFrontId: string | null): void => {
    void (async () => {
      setStartError(null);
      setActiveSpokenFrontFileId(spokenFrontId);
      setStarting(true);
      setPhase("preparing");
      try {
        await startContinuousCapture();
        if (!isContinuousCaptureActive()) {
          throw new Error("Microphone capture did not start.");
        }
        capturingRef.current = true;
      } catch (err) {
        console.error("[voice-test] mic start failed:", err);
        capturingRef.current = false;
        setStartError(
          err instanceof Error
            ? err.message
            : "Couldn't access the microphone. Check your audio settings above.",
        );
        setPhase("setup");
        setStarting(false);
        return;
      }
      setStarting(false);
      window.setTimeout(() => {
        setPhase((p) => (p === "preparing" ? "asking" : p));
      }, PREPARE_MIN_MS);
    })();
  };

  const beginAnswer = (): void => {
    if (phaseRef.current !== "asking" || answerStartedRef.current) return;
    answerStartedRef.current = true;
    if (spokenFallbackRef.current) {
      clearTimeout(spokenFallbackRef.current);
      spokenFallbackRef.current = null;
    }
    playBuzzer("start");
    startCardClip(card.id);
    setPhase("answering");
  };

  const onSpokenFrontEnded = (endedCardId: string): void => {
    if (endedCardId !== card.id) return;
    beginAnswer();
  };

  const finishAnswer = (): void => {
    if (phaseRef.current !== "answering" || finishStartedRef.current) return;
    finishStartedRef.current = true;
    playBuzzer("stop");
    setPhase("grading");
    void (async () => {
      try {
        const clip = await stopCardClip(card.id);
        const res = await dispatch(
          gradeSpokenAnswer({
            front: card.front,
            back: card.back,
            secondsAllowed: answerSeconds,
            clip,
            surface: "card-voice-test",
            ...(record
              ? { itemType: "fc_card", itemId: card.id, method: "voice_test" }
              : {}),
          }),
        );
        if (res.status === "graded" && res.grade) {
          setGrade(res.grade);
        } else if (res.status === "skipped") {
          setSkipped(true);
          if (res.error) setError(res.error);
        } else {
          setError(res.error ?? "Grading didn't come back — try again.");
        }
      } catch (err) {
        console.error("[voice-test] grading failed:", err);
        setError(
          err instanceof Error
            ? err.message
            : "Something went wrong grading that answer.",
        );
      } finally {
        setPhase("result");
      }
    })();
  };

  // Pre-recorded spoken_front → SpokenFrontPlayer. Otherwise stream the question
  // live via Cartesia (same hook as cx-chat MessageOptionsMenu read-aloud).
  useEffect(() => {
    if (phase !== "asking" || activeSpokenFrontFileId) return undefined;

    let cancelled = false;

    spokenFallbackRef.current = window.setTimeout(() => {
      if (!cancelled) beginAnswer();
    }, SPOKEN_FRONT_MAX_WAIT_MS);

    void (async () => {
      await cartesiaSpeak(card.front);
      if (!cancelled && phaseRef.current === "asking") {
        beginAnswer();
      }
    })();

    return () => {
      cancelled = true;
      if (spokenFallbackRef.current) {
        clearTimeout(spokenFallbackRef.current);
        spokenFallbackRef.current = null;
      }
      void cartesiaStop();
    };
  }, [phase, activeSpokenFrontFileId, card.front, cartesiaSpeak, cartesiaStop]);

  // Cached audio — max-wait safety net (autoplay block / load failure).
  useEffect(() => {
    if (phase !== "asking" || !activeSpokenFrontFileId) return undefined;

    spokenFallbackRef.current = window.setTimeout(
      () => beginAnswer(),
      SPOKEN_FRONT_MAX_WAIT_MS,
    );
    return () => {
      if (spokenFallbackRef.current) {
        clearTimeout(spokenFallbackRef.current);
        spokenFallbackRef.current = null;
      }
    };
  }, [phase, activeSpokenFrontFileId, card.id]);

  useEffect(() => {
    if (phase !== "answering") return undefined;
    const id = window.setTimeout(() => finishAnswer(), answerSeconds * 1000);
    return () => window.clearTimeout(id);
  }, [phase, answerSeconds]);

  const goAgain = (): void => {
    void (async () => {
      setGrade(null);
      setSkipped(false);
      setError(null);
      setShowTranscript(false);
      answerStartedRef.current = false;
      finishStartedRef.current = false;

      if (!isContinuousCaptureActive()) {
        try {
          await startContinuousCapture();
          capturingRef.current = isContinuousCaptureActive();
        } catch (err) {
          console.error("[voice-test] mic re-warm failed on go-again:", err);
          setError("Mic session ended — tap Done and start again.");
          setPhase("setup");
          capturingRef.current = false;
          return;
        }
      }

      setPhase("asking");
    })();
  };

  const done = (): void => {
    void cartesiaStop();
    if (capturingRef.current) {
      stopContinuousCapture();
      capturingRef.current = false;
    }
    onClose();
  };

  const showClose = phase !== "setup";

  return (
    <div className="relative flex max-h-[min(90dvh,40rem)] w-full flex-col overflow-hidden rounded-2xl border border-border bg-card">
      {showClose && (
        <button
          type="button"
          onClick={done}
          aria-label="Close"
          className="absolute right-3 top-3 z-10 rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      )}

      {phase === "asking" && activeSpokenFrontFileId && (
        <SpokenFrontPlayer
          fileId={activeSpokenFrontFileId}
          cardId={card.id}
          onEnded={onSpokenFrontEnded}
        />
      )}

      {phase === "setup" ? (
        <div className="overflow-y-auto">
          <VoiceTestAudioSetup
            card={{ id: card.id, front: card.front }}
            initialSpokenFrontFileId={initialSpokenFrontFileId}
            onStart={handleSetupStart}
            starting={starting}
            startError={startError}
            answerSeconds={answerSeconds}
          />
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-5 overflow-y-auto px-6 py-8 text-center">
          {phase === "preparing" && (
            <>
              <Pulser>
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </Pulser>
              <p className="text-base font-medium text-muted-foreground">
                Starting…
              </p>
            </>
          )}

          {phase === "asking" && (
            <>
              <Badge>
                {cartesiaLoading && !activeSpokenFrontFileId ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Volume2 className="h-3.5 w-3.5" />
                )}
                Here&apos;s your question
              </Badge>
              <p className="max-w-xl text-2xl font-semibold leading-snug text-foreground">
                {card.front}
              </p>
              <p className="text-xs text-muted-foreground">
                Listen, then speak your answer…
              </p>
            </>
          )}

          {phase === "answering" && (
            <>
              <VoiceAnswerMicMeter level={level} seconds={answerSeconds} />
              <p className="max-w-xl text-lg font-semibold leading-snug text-foreground">
                {card.front}
              </p>
            </>
          )}

          {phase === "grading" && (
            <>
              <Pulser>
                <Zap className="h-8 w-8 animate-pulse text-primary" />
              </Pulser>
              <p className="text-base font-medium text-muted-foreground">
                Grading your answer…
              </p>
            </>
          )}

          {phase === "result" && (
            <ResultView
              grade={grade}
              skipped={skipped}
              error={error}
              back={card.back}
              showTranscript={showTranscript}
              onToggleTranscript={() => setShowTranscript((v) => !v)}
              onAgain={goAgain}
              onDone={done}
            />
          )}
        </div>
      )}
    </div>
  );
}

function ResultView({
  grade,
  skipped,
  error,
  back,
  showTranscript,
  onToggleTranscript,
  onAgain,
  onDone,
}: {
  grade: SpokenGrade | null;
  skipped: boolean;
  error: string | null;
  back: string;
  showTranscript: boolean;
  onToggleTranscript: () => void;
  onAgain: () => void;
  onDone: () => void;
}) {
  const style = grade ? RESULT_STYLE[grade.result] : null;
  return (
    <div className="flex w-full max-w-md flex-col items-center gap-4">
      {grade && style ? (
        <>
          <div
            className={cn(
              "flex h-16 w-16 items-center justify-center rounded-full",
              style.bg,
            )}
          >
            <style.icon className={cn("h-8 w-8", style.text)} />
          </div>
          <div>
            <div className={cn("text-xl font-semibold", style.text)}>
              {style.label}
            </div>
            <div className="mt-0.5 text-sm text-muted-foreground">
              Score {Math.round(grade.score * 100)}%
            </div>
          </div>
          {grade.feedback && (
            <p className="text-sm text-foreground">{grade.feedback}</p>
          )}
          {grade.missing.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Missed: {grade.missing.join(", ")}
            </p>
          )}
          {grade.transcript && (
            <button
              type="button"
              onClick={onToggleTranscript}
              className="text-xs text-muted-foreground underline-offset-2 hover:underline"
            >
              {showTranscript ? "Hide" : "Show"} what I heard
            </button>
          )}
          {showTranscript && grade.transcript && (
            <p className="w-full rounded-lg bg-muted/50 px-3 py-2 text-left text-xs italic text-muted-foreground">
              “{grade.transcript}”
            </p>
          )}
        </>
      ) : (
        <>
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
            <AlertCircle className="h-8 w-8 text-muted-foreground" />
          </div>
          <p className="text-sm text-foreground">
            {error ??
              (skipped
                ? "I didn't catch an answer that time — give it another go."
                : "Something went wrong grading that answer.")}
          </p>
        </>
      )}

      <div className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-left">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Answer
        </div>
        <div className="text-sm text-foreground">{back}</div>
      </div>

      <div className="flex w-full flex-col gap-2 sm:flex-row">
        <Button className="flex-1 gap-1.5" onClick={onAgain}>
          <RotateCcw className="h-4 w-4" />
          Go again
        </Button>
        <Button variant="outline" className="flex-1" onClick={onDone}>
          Done
        </Button>
      </div>
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
      {children}
    </span>
  );
}

function Pulser({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex h-20 w-20 items-center justify-center">
      <span className="absolute inset-0 animate-ping rounded-full bg-primary/10" />
      <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
        {children}
      </div>
    </div>
  );
}
