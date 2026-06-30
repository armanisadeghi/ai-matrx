// features/flashcards/fast-fire/hooks/useFastFireDrill.ts
//
// THE drill orchestrator. It wires the ONE state-machine slice to the deadline
// timer and the continuous-capture singleton, and fires grading per card —
// without ever awaiting the AI in the loop. Everything the historical bug class
// touched is structurally handled here:
//
//   • State machine (#1): the slice is the only source of truth; this hook only
//     dispatches transitions. No drifting useStates driving the flow.
//   • Deadline timer (#2): one `deadlineTs` (state) → useDeadlineTimer's single
//     rAF loop → `onExpire` fires the card transition once. No setInterval.
//   • Continuous capture (#3): ONE warm mic for the whole session; per-card
//     window timestamps recorded against the capture origin; buzzers at each
//     boundary.
//   • Fire-and-forget grading (#4): when a card's window closes we SLICE its clip
//     and dispatch `gradeCard(...)` WITHOUT awaiting. The drill advances to the
//     next card immediately; grades catch up via Redux.
//
// The per-card window is measured in two clocks that must not be confused:
//   - WALL CLOCK (Date.now()) for the deadline (what the timer compares).
//   - CAPTURE CLOCK (performance.now() via captureOrigin) for slicing the audio.
// We record both edges per card so the slice lines up with the real recording.
//
// React Compiler is on: no manual memo/callback.

"use client";

import { useEffect, useRef, useState } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  beginRecording,
  advanceCard,
  commitAdvance,
  completeDrill,
  abandonDrill,
  setSessionAudio,
} from "../redux/fastFireSlice";
import {
  selectFastFirePhase,
  selectFastFireConfig,
  selectFastFireCards,
  selectFastFireCurrentCard,
  selectFastFireCurrentIndex,
  selectFastFireSessionId,
} from "../redux/fastFire.selectors";
import { useDeadlineTimer } from "./useDeadlineTimer";
import {
  sliceCardClip,
  playBuzzer,
  stopContinuousCapture,
  hardStopCapture,
} from "../audio/continuousCapture";
import { fileHandler } from "@/features/files";
import { gradeCard } from "../agents/gradeCard.thunk";
import { reviewSession } from "../agents/reviewSession.thunk";

const COUNTDOWN_SECONDS = 3;
/** The brief beat between cards (buzzer + slice), then the next card arms. */
const ADVANCE_BEAT_MS = 450;

export interface UseFastFireDrillResult {
  /** Live timer-bar progress 0..1 for the CURRENT card (rAF-driven, no re-render). */
  subscribeProgress: (cb: (remainingMs: number, progress: number) => void) => () => void;
  /** Countdown number (3,2,1) while in the countdown phase, else null. */
  countdown: number | null;
  /** Manually end the current card early (skip). */
  skipCard: () => void;
  /** Abort the whole drill (back / leave). */
  abort: () => void;
}

interface CardWindow {
  cardId: string;
  /** capture-clock ms (performance.now()) when the card appeared. */
  captureStart: number;
}

export function useFastFireDrill(): UseFastFireDrillResult {
  const dispatch = useAppDispatch();
  const phase = useAppSelector(selectFastFirePhase);
  const config = useAppSelector(selectFastFireConfig);
  const cards = useAppSelector(selectFastFireCards);
  const currentCard = useAppSelector(selectFastFireCurrentCard);
  const currentIndex = useAppSelector(selectFastFireCurrentIndex);
  const sessionId = useAppSelector(selectFastFireSessionId);

  // The wall-clock deadline for the current card. STATE so the timer hook
  // restarts its single loop exactly once when it changes. null = no deadline.
  const [deadlineTs, setDeadlineTs] = useState<number | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);

  // Progress fan-out: the rAF loop pushes per-frame progress to subscribers
  // (the timer bar) WITHOUT any React state write — zero re-render per frame.
  const progressListenersRef = useRef<Set<(r: number, p: number) => void>>(new Set());

  // The capture-clock start of the card currently being recorded — for slicing.
  const windowRef = useRef<CardWindow | null>(null);
  // CLOSE-ONCE GUARD: the set of card ids already closed (graded + advanced).
  // Both the deadline timer's onExpire AND the manual Skip path call
  // `handleExpire`; this ref makes closing a given card IDEMPOTENT, so a timer
  // tick that races a Skip (or vice-versa) can never double-advance or
  // double-grade. This is the structural kill for the "dropped/double card" bug
  // class, independent of the timer's own single-fire guard.
  const closedCardsRef = useRef<Set<string>>(new Set());

  const subscribeProgress: UseFastFireDrillResult["subscribeProgress"] = (cb) => {
    progressListenersRef.current.add(cb);
    return () => {
      progressListenersRef.current.delete(cb);
    };
  };

  // ── Countdown ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "countdown") {
      setCountdown(null);
      return undefined;
    }
    // Fresh drill — clear the close-once guard so a re-run can close cards again.
    closedCardsRef.current = new Set();
    let n = COUNTDOWN_SECONDS;
    setCountdown(n);
    const id = setInterval(() => {
      n -= 1;
      if (n <= 0) {
        clearInterval(id);
        setCountdown(null);
        dispatch(beginRecording());
      } else {
        setCountdown(n);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [phase, dispatch]);

  // ── Arm the deadline + open the card window when a card starts recording ─────
  // Keyed on (phase, currentIndex). When a new card enters `card_recording` we
  // play the start buzzer, stamp the capture-clock window start, and set the
  // wall-clock deadline. The deadline change is what (re)starts the rAF loop.
  useEffect(() => {
    if (phase !== "card_recording" || !currentCard) {
      return undefined;
    }
    playBuzzer("start");
    windowRef.current = {
      cardId: currentCard.id,
      captureStart: performance.now(),
    };
    setDeadlineTs(Date.now() + config.secondsPerCard * 1000);
    return undefined;
    // currentCard.id is the real key (the card changing); phase guards entry.
  }, [phase, currentCard?.id, config.secondsPerCard]);

  // ── Deadline expiry → close the card: buzzer, slice, fire grading, advance ───
  // This is the ONE place a card ends. It runs synchronously-ish: it slices the
  // clip and dispatches `gradeCard(...)` FIRE-AND-FORGET (no await), then moves
  // the machine to `advancing`. The drill never blocks on a grade.
  const handleExpire = (): void => {
    const win = windowRef.current;
    const card = currentCard;
    if (!win || !card) {
      // Nothing to close (already closed by a racing call) — do NOT advance
      // again; the first close already moved the machine.
      return;
    }
    // Close-once: if this card was already closed, bail before grading/advancing.
    if (closedCardsRef.current.has(card.id)) {
      return;
    }
    closedCardsRef.current.add(card.id);
    playBuzzer("stop");
    const captureEnd = performance.now();

    // Slice the clip for THIS card from the continuous stream (±1s overlap +
    // header is handled inside sliceCardClip).
    const clip = sliceCardClip(win.captureStart, captureEnd);

    // Fire-and-forget grade — keyed by stable card id, never awaited.
    void dispatch(
      gradeCard({
        cardId: card.id,
        front: card.front,
        back: card.back,
        secondsAllowed: config.secondsPerCard,
        clip,
        sessionId,
      }),
    );

    windowRef.current = null;
    setDeadlineTs(null);
    dispatch(advanceCard());
  };

  useDeadlineTimer({
    deadlineTs: phase === "card_recording" ? deadlineTs : null,
    durationMs: config.secondsPerCard * 1000,
    onExpire: handleExpire,
    onTick: (remainingMs, progress) => {
      for (const l of progressListenersRef.current) {
        try {
          l(remainingMs, progress);
        } catch {
          /* ignore */
        }
      }
    },
  });

  // ── The advancing beat → commit to the next card (or finalize) ───────────────
  useEffect(() => {
    if (phase !== "advancing") return undefined;
    const id = setTimeout(() => {
      dispatch(commitAdvance());
    }, ADVANCE_BEAT_MS);
    return () => clearTimeout(id);
  }, [phase, currentIndex, dispatch]);

  // ── Finalize: stop capture, upload the full-session recording, run review ────
  const finalizingRef = useRef(false);
  useEffect(() => {
    if (phase !== "finalizing" || finalizingRef.current) return undefined;
    finalizingRef.current = true;
    let cancelled = false;

    void (async () => {
      // Stop the continuous recording and grab the full-session blob.
      const full = stopContinuousCapture();
      setDeadlineTs(null);

      // Upload the durable full-session recording (best-effort).
      if (full && full.size > 0) {
        try {
          const uploaded = await fileHandler.upload(
            {
              kind: "blob",
              blob: full,
              fileName: `fastfire-session-${sessionId ?? "anon"}.webm`,
              mime: full.type || "audio/webm",
            },
            { folderPath: "FastFire/sessions", visibility: "private" },
          );
          const fileId = uploaded.fileId;
          if (fileId && !cancelled) {
            dispatch(setSessionAudio({ fileId }));
            if (sessionId) {
              const { studyService } = await import(
                "@/features/education/study/service/studyService"
              );
              await studyService.updateSession(sessionId, {
                session_audio_file_id: fileId,
                status: "completed",
                ended_at: new Date().toISOString(),
              });
            }
          }
        } catch (err) {
          console.error("[useFastFireDrill] session upload failed:", err);
        }
      } else if (sessionId) {
        // No audio but still close the session out cleanly.
        const { studyService } = await import(
          "@/features/education/study/service/studyService"
        );
        await studyService.updateSession(sessionId, {
          status: "completed",
          ended_at: new Date().toISOString(),
        });
      }

      // Optional holistic review (no-op if no review agent configured).
      void dispatch(reviewSession({ sessionId }));

      if (!cancelled) dispatch(completeDrill());
    })();

    return () => {
      cancelled = true;
    };
  }, [phase, sessionId, dispatch]);

  // Reset the finalize guard whenever we leave finalize (so a re-run can finalize).
  useEffect(() => {
    if (phase !== "finalizing") finalizingRef.current = false;
  }, [phase]);

  // ── Teardown safety: if the component unmounts mid-drill, kill capture loudly ─
  useEffect(() => {
    return () => {
      // Only force-stop if we're still actively capturing — a clean finalize
      // already released the mic. This is the leak guard.
      hardStopCapture();
    };
  }, []);

  const skipCard = (): void => {
    if (phase === "card_recording") {
      handleExpire();
    }
  };

  const abort = (): void => {
    hardStopCapture();
    setDeadlineTs(null);
    dispatch(abandonDrill());
  };

  // Keep `cards` referenced so an empty-set drill still finalizes cleanly.
  void cards.length;

  return { subscribeProgress, countdown, skipCard, abort };
}
