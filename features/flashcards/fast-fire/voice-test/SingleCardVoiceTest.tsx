"use client";

// features/flashcards/fast-fire/voice-test/SingleCardVoiceTest.tsx
//
// "Test me on this card" — a self-contained, beautiful voice quiz for ONE card,
// droppable on ANY flashcard surface (study deck, set detail, chat blocks, window
// panels). Flow (owner design): Start → Preparing → the question is asked (spoken
// if cached, else shown) → you get a few seconds to answer out loud → it grades →
// "Go again?". The FIRST of many voice entry points (debate, role-play next), so
// it reuses the shared capture core + the decoupled grading primitive rather than
// forking anything.
//
// It takes only a card (+ optional cached spoken-front + answer seconds) and owns
// its own state machine, mic lifecycle, and timer. Render it inside a dialog,
// overlay, window panel, or inline — it doesn't care.
//
// React Compiler is on: no manual memo.

import { useEffect, useRef, useState } from "react";
import {
  Mic,
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
import { useFileSrc } from "@/features/files";
import {
  startContinuousCapture,
  startCardClip,
  stopCardClip,
  stopContinuousCapture,
  hardStopCapture,
  subscribeLevel,
} from "../audio/continuousCapture";
import { gradeSpokenAnswer } from "../agents/gradeSpokenAnswer.thunk";
import type { SpokenGrade } from "../agents/grading-core";

type Phase =
  | "intro"
  | "preparing"
  | "asking"
  | "answering"
  | "grading"
  | "result";

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

const READY_BEAT_MS = 700; // brief "get ready" beat before the answer window
const PREPARE_MIN_MS = 900; // minimum "Preparing…" dwell (feels intentional)

const RESULT_STYLE: Record<
  SpokenGrade["result"],
  { label: string; icon: typeof CheckCircle2; ring: string; text: string; bg: string }
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
  spokenFrontFileId,
  answerSeconds = 10,
  record = true,
  onClose,
}: SingleCardVoiceTestProps) {
  const dispatch = useAppDispatch();
  const [phase, setPhase] = useState<Phase>("intro");
  const [level, setLevel] = useState(0);
  const [grade, setGrade] = useState<SpokenGrade | null>(null);
  const [skipped, setSkipped] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showTranscript, setShowTranscript] = useState(false);

  const spokenSrc = useFileSrc(
    spokenFrontFileId ? { kind: "file_id", fileId: spokenFrontFileId } : null,
  );
  const capturingRef = useRef(false);
  // Idempotency guards (timeouts + audio onEnded/onError can each fire once; also
  // guards against StrictMode double-invokes). Reset on each new "asking" entry.
  const phaseRef = useRef<Phase>("intro");
  const answerStartedRef = useRef(false);
  const finishStartedRef = useRef(false);
  useEffect(() => {
    phaseRef.current = phase;
    if (phase === "asking") {
      answerStartedRef.current = false;
      finishStartedRef.current = false;
    }
  }, [phase]);

  // ── Mic level pulse while answering (throttled; imperative would be overkill) ─
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

  // ── Teardown: release the mic if we leave mid-test ──────────────────────────
  useEffect(() => {
    return () => {
      if (capturingRef.current) {
        hardStopCapture();
        capturingRef.current = false;
      }
    };
  }, []);

  // ── Start (user gesture → warm the mic, then prepare) ───────────────────────
  const start = async (): Promise<void> => {
    setError(null);
    setGrade(null);
    setSkipped(false);
    setPhase("preparing");
    try {
      await startContinuousCapture();
      capturingRef.current = true;
    } catch (err) {
      console.error("[voice-test] mic start failed:", err);
      setError("Couldn't access the microphone. Check your audio settings.");
      setPhase("intro");
      return;
    }
    // A short, deliberate "Preparing…" beat, then ask.
    window.setTimeout(() => {
      setPhase((p) => (p === "preparing" ? "asking" : p));
    }, PREPARE_MIN_MS);
  };

  // ── Asking: play the spoken question (if cached), then open the answer window.
  //    Without cached audio, a brief "get ready" beat leads into answering. ─────
  const beginAnswer = (): void => {
    if (phaseRef.current !== "asking" || answerStartedRef.current) return;
    answerStartedRef.current = true;
    startCardClip(card.id);
    setPhase("answering");
  };

  const finishAnswer = (): void => {
    if (phaseRef.current !== "answering" || finishStartedRef.current) return;
    finishStartedRef.current = true;
    setPhase("grading");
    void (async () => {
      const clip = await stopCardClip(card.id);
      const res = await dispatch(
        gradeSpokenAnswer({
          front: card.front,
          back: card.back,
          secondsAllowed: answerSeconds,
          clip,
          surface: "card-voice-test",
          ...(record ? { itemType: "fc_card", itemId: card.id, method: "voice_test" } : {}),
        }),
      );
      if (res.status === "graded" && res.grade) {
        setGrade(res.grade);
      } else if (res.status === "skipped") {
        setSkipped(true);
      } else {
        setError(res.error ?? "Grading didn't come back — try again.");
      }
      setPhase("result");
    })();
  };

  // If there's spoken audio, the <audio onEnded> advances us; otherwise a brief
  // "get ready" beat leads into the answer window.
  useEffect(() => {
    if (phase !== "asking") return undefined;
    if (spokenFrontFileId && spokenSrc) return undefined;
    const id = window.setTimeout(() => beginAnswer(), READY_BEAT_MS);
    return () => window.clearTimeout(id);
  }, [phase, spokenFrontFileId, spokenSrc]);

  // Answer window: a fixed timer, then stop the clip + grade.
  useEffect(() => {
    if (phase !== "answering") return undefined;
    const id = window.setTimeout(() => finishAnswer(), answerSeconds * 1000);
    return () => window.clearTimeout(id);
  }, [phase, answerSeconds]);

  const goAgain = (): void => {
    setGrade(null);
    setSkipped(false);
    setError(null);
    setShowTranscript(false);
    setPhase("asking");
  };

  const done = (): void => {
    if (capturingRef.current) {
      stopContinuousCapture();
      capturingRef.current = false;
    }
    onClose();
  };

  return (
    <div className="relative flex min-h-[26rem] w-full flex-col overflow-hidden rounded-2xl border border-border bg-card">
      {/* Close */}
      <button
        type="button"
        onClick={done}
        aria-label="Close"
        className="absolute right-3 top-3 z-10 rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>

      {/* Spoken question player — advances to the answer window on end/error. */}
      {phase === "asking" && spokenFrontFileId && spokenSrc && (
        <audio
          key={card.id}
          src={spokenSrc}
          autoPlay
          className="sr-only"
          onEnded={beginAnswer}
          onError={beginAnswer}
        >
          <track kind="captions" />
        </audio>
      )}

      <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6 py-8 text-center">
        {phase === "intro" && (
          <>
            <Badge>
              <Zap className="h-3.5 w-3.5" />
              Voice test
            </Badge>
            <p className="max-w-md text-lg font-medium text-foreground">
              I&apos;ll ask you this card out loud. Answer by speaking — you&apos;ll
              have {answerSeconds} seconds, then I&apos;ll grade you.
            </p>
            <Button size="lg" className="mt-1 gap-2" onClick={() => void start()}>
              <Mic className="h-5 w-5" />
              Start
            </Button>
            {error && <ErrorNote>{error}</ErrorNote>}
          </>
        )}

        {phase === "preparing" && (
          <>
            <Pulser>
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </Pulser>
            <p className="text-base font-medium text-muted-foreground">Preparing…</p>
          </>
        )}

        {phase === "asking" && (
          <>
            <Badge>
              <Volume2 className="h-3.5 w-3.5" />
              Here&apos;s your question
            </Badge>
            <p className="max-w-xl text-2xl font-semibold leading-snug text-foreground">
              {card.front}
            </p>
            <p className="text-xs text-muted-foreground">Get ready to answer…</p>
          </>
        )}

        {phase === "answering" && (
          <>
            <CountdownRing seconds={answerSeconds} level={level} />
            <p className="max-w-xl text-lg font-semibold leading-snug text-foreground">
              {card.front}
            </p>
            <p className="text-sm font-medium text-primary">Speak your answer…</p>
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
    </div>
  );
}

// ── Result ────────────────────────────────────────────────────────────────────
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
            {skipped
              ? "I didn't catch an answer that time — give it another go."
              : (error ?? "Something went wrong grading that answer.")}
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

// ── Small presentational bits ───────────────────────────────────────────────
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

function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="max-w-sm rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
      {children}
    </p>
  );
}

/** A circular countdown that depletes over `seconds` (CSS-animated) with a mic
 *  whose glow reacts to the live level. */
function CountdownRing({ seconds, level }: { seconds: number; level: number }) {
  const R = 46;
  const C = 2 * Math.PI * R;
  const glow = 0.4 + Math.min(1, level * 2.2) * 0.6;
  return (
    <div className="relative flex h-28 w-28 items-center justify-center">
      <svg className="absolute inset-0 -rotate-90" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r={R} fill="none" strokeWidth="6" className="stroke-muted" />
        <circle
          cx="50"
          cy="50"
          r={R}
          fill="none"
          strokeWidth="6"
          strokeLinecap="round"
          className="stroke-primary"
          strokeDasharray={C}
          style={{
            strokeDashoffset: 0,
            animation: `voiceTestCountdown ${seconds}s linear forwards`,
          }}
        />
      </svg>
      <div
        className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 transition-transform"
        style={{ transform: `scale(${1 + Math.min(1, level * 2.2) * 0.12})` }}
      >
        <Mic className="h-7 w-7 text-primary" style={{ opacity: glow }} />
      </div>
      <style>{`@keyframes voiceTestCountdown { from { stroke-dashoffset: 0 } to { stroke-dashoffset: ${C} } }`}</style>
    </div>
  );
}
