// features/flashcards/fast-fire/hooks/useFastFireDrill.ts
//
// THE drill orchestrator. It wires the ONE state-machine slice to the deadline
// timer and the per-card-capture singleton, and fires grading per card —
// without ever awaiting the AI in the loop. Everything the historical bug class
// touched is structurally handled here:
//
//   • State machine (#1): the slice is the only source of truth; this hook only
//     dispatches transitions. No drifting useStates driving the flow.
//   • Deadline timer (#2): one `deadlineTs` (state) → useDeadlineTimer's single
//     rAF loop → `onExpire` fires the card transition once. No setInterval.
//   • Per-card capture (#3): ONE warm mic + ONE continuous PCM buffer for the
//     whole session. `startCardClip`/`stopCardClip` only MARK the card's window on
//     the AUDIO clock (`ctx.currentTime`, see continuousCapture.ts) — each clip is
//     a sample-accurate slice of the one buffer, so the boundary can never drift
//     from the audible buzzer or the recorded speech, and skip vs timeout mark the
//     boundary identically. The full session is the same buffer with markers mixed
//     in. Buzzers fire at each boundary.
//   • Fire-and-forget grading (#4): when a card's window closes we stop its
//     recorder, take the resulting blob, and dispatch `gradeCard(...)` WITHOUT
//     awaiting the grade. The drill advances to the next card immediately; grades
//     catch up via Redux.
//
// The deadline is wall-clock (Date.now()); the clip is the card's audio by
// construction (the per-card recorder spans exactly the card), so no capture-clock
// window math is needed.
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
  selectFastFireAdvanceReason,
} from "../redux/fastFire.selectors";
import type { AdvanceReason } from "../redux/fastFireSlice";
import { useDeadlineTimer } from "./useDeadlineTimer";
import {
  startCardClip,
  stopCardClip,
  playBuzzer,
  stopContinuousCapture,
  hardStopCapture,
} from "../audio/continuousCapture";
import { fileHandler } from "@/features/files";
import { CloudFolders } from "@/features/files/utils/folder-conventions";
import {
  audioExtensionForType,
  normalizeAudioContentType,
} from "@/features/audio/utils/audio-mime";
import { gradeCard } from "../agents/gradeCard.thunk";
import { reviewSession } from "../agents/reviewSession.thunk";
import { studyService } from "@/features/education/study/service/studyService";

const COUNTDOWN_SECONDS = 3;
/** SKIP path: the brief beat between cards (buzzer + slice), then the next arms.
 *  The learner chose to move on, so this is short and unobtrusive. */
const SKIP_ADVANCE_BEAT_MS = 450;
/** TIMEOUT path: hold the full-screen "TIME'S UP" cue this long before the next
 *  card, so a learner still answering clearly registers that time ran out
 *  (owner direction: ~1 second). Longer than the skip beat by design. */
const TIMESUP_HOLD_MS = 1000;
/** VOICE MODE safety net: if the spoken question never signals it finished (e.g.
 *  iOS autoplay blocked), open the answer window anyway so a card can't hang. */
const SPOKEN_FRONT_MAX_WAIT_MS = 25000;

export interface UseFastFireDrillResult {
  /** Live timer-bar progress 0..1 for the CURRENT card (rAF-driven, no re-render). */
  subscribeProgress: (
    cb: (remainingMs: number, progress: number) => void,
  ) => () => void;
  /** Countdown number (3,2,1) while in the countdown phase, else null. */
  countdown: number | null;
  /** Manually end the current card early (skip). */
  skipCard: () => void;
  /** Abort the whole drill (back / leave). */
  abort: () => void;
  /** VOICE MODE: the spoken-front player calls this when the question finishes
   *  playing (or errors), which is what starts the answer timer for that card. */
  onSpokenFrontEnded: (cardId: string) => void;
}

interface CardWindow {
  cardId: string;
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
  const progressListenersRef = useRef<Set<(r: number, p: number) => void>>(
    new Set(),
  );

  // The card currently being recorded (its per-card recorder is live).
  const windowRef = useRef<CardWindow | null>(null);
  // CLOSE-ONCE GUARD: the set of card ids already closed (graded + advanced).
  // Both the deadline timer's onExpire AND the manual Skip path call
  // `handleExpire`; this ref makes closing a given card IDEMPOTENT, so a timer
  // tick that races a Skip (or vice-versa) can never double-advance or
  // double-grade. This is the structural kill for the "dropped/double card" bug
  // class, independent of the timer's own single-fire guard.
  const closedCardsRef = useRef<Set<string>>(new Set());

  const subscribeProgress: UseFastFireDrillResult["subscribeProgress"] = (
    cb,
  ) => {
    progressListenersRef.current.add(cb);
    return () => {
      progressListenersRef.current.delete(cb);
    };
  };

  // How long the learner has to ANSWER. In voice mode the answer timer starts
  // only after the spoken question finishes, and gets `voiceAnswerSeconds`
  // (deliberately shorter — no time is spent reading). Otherwise the full
  // `secondsPerCard`.
  const answerSeconds = config.spokenFronts
    ? config.voiceAnswerSeconds
    : config.secondsPerCard;

  // VOICE MODE: the card whose spoken question is still playing (answer window not
  // yet open), plus the safety-fallback timer handle.
  const awaitingAudioRef = useRef<string | null>(null);
  const audioFallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Open the answer window for a card: buzzer + start its clip + arm the deadline.
  // The ONE place the answer clock starts (immediately in normal mode; after the
  // spoken question in voice mode).
  const beginAnswerWindow = (cardId: string): void => {
    if (audioFallbackRef.current) {
      clearTimeout(audioFallbackRef.current);
      audioFallbackRef.current = null;
    }
    awaitingAudioRef.current = null;
    playBuzzer("start");
    startCardClip(cardId);
    setDeadlineTs(Date.now() + answerSeconds * 1000);
  };

  const onSpokenFrontEnded = (cardId: string): void => {
    if (awaitingAudioRef.current !== cardId) return;
    beginAnswerWindow(cardId);
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

  // ── Arm the deadline + mark the card's audio window when a card starts ───────
  // Keyed on (phase, currentCard.id). When a new card enters `card_recording` we
  // play the start buzzer, MARK this card's start on the audio clock
  // (`startCardClip`), and set the wall-clock deadline. The deadline change is
  // what (re)starts the rAF loop.
  useEffect(() => {
    if (phase !== "card_recording" || !currentCard) {
      return undefined;
    }
    windowRef.current = { cardId: currentCard.id };

    const cardId = currentCard.id;
    const voice = config.spokenFronts && !!currentCard.spokenFrontFileId;
    if (voice) {
      // Wait for the spoken question to finish before starting the answer clock,
      // so the timer never runs down while the question is being read. The
      // SpokenFrontPlayer autoplays it and calls `onSpokenFrontEnded`; a safety
      // fallback opens the window anyway if the audio never signals.
      awaitingAudioRef.current = cardId;
      audioFallbackRef.current = setTimeout(() => {
        if (awaitingAudioRef.current === cardId) beginAnswerWindow(cardId);
      }, SPOKEN_FRONT_MAX_WAIT_MS);
      return () => {
        if (audioFallbackRef.current) {
          clearTimeout(audioFallbackRef.current);
          audioFallbackRef.current = null;
        }
        awaitingAudioRef.current = null;
      };
    }

    // Normal mode: the answer window opens immediately.
    beginAnswerWindow(cardId);
    return undefined;
    // currentCard.id is the real key (the card changing); phase guards entry.
  }, [phase, currentCard?.id, config.spokenFronts]);

  // ── Deadline expiry (or Next) → close the card: buzzer, mark boundary, grade ──
  // The ONE place a card ends. It closes the card's audio window, dispatches
  // `gradeCard(...)` FIRE-AND-FORGET (no await on the clip flush or the grade),
  // then moves the machine to `advancing`. The drill never blocks. `reason`
  // distinguishes the clock running out (`timeout` — prominent buzzer + TIME'S UP
  // hold) from a deliberate "Next" (`skip` — gentle beep, quick advance).
  // CRITICAL: the two paths differ ONLY in the learner-facing cue; the audio
  // boundary (`stopCardClip`) is marked on the audio clock at this instant either
  // way, so the RECORDING timing is identical.
  const handleExpire = (reason: AdvanceReason): void => {
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
    playBuzzer(reason === "timeout" ? "timesup" : "stop");

    // Close THIS card's audio window and grade its clip. `stopCardClip` marks the
    // boundary on the audio clock NOW, then resolves the WAV a moment later (once
    // the trailing pad is captured), so we grade in the resolve callback — still
    // fire-and-forget: the drill advances NOW and never blocks on the clip or the
    // grade. Keyed by stable card id.
    const cardSnapshot = {
      cardId: card.id,
      front: card.front,
      back: card.back,
      secondsAllowed: answerSeconds,
      sessionId,
    };
    void stopCardClip(card.id).then((clip) => {
      void dispatch(gradeCard({ ...cardSnapshot, clip }));
    });

    windowRef.current = null;
    setDeadlineTs(null);
    dispatch(advanceCard({ reason }));
  };

  useDeadlineTimer({
    deadlineTs: phase === "card_recording" ? deadlineTs : null,
    durationMs: answerSeconds * 1000,
    onExpire: () => handleExpire("timeout"),
    // The light "almost out of time" nudge, once per card, from the same clock as
    // the countdown so it never drifts or double-fires.
    warningMs: config.warningSeconds * 1000,
    onWarning: () => playBuzzer("warning"),
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
  // A timeout holds the "TIME'S UP" cue longer (the learner may not have noticed);
  // a deliberate skip advances quickly. Capture continues throughout, so the extra
  // hold is just real audio that becomes the just-closed card's trailing pad.
  const advanceReason = useAppSelector(selectFastFireAdvanceReason);
  useEffect(() => {
    if (phase !== "advancing") return undefined;
    const holdMs =
      advanceReason === "timeout" ? TIMESUP_HOLD_MS : SKIP_ADVANCE_BEAT_MS;
    const id = setTimeout(() => {
      dispatch(commitAdvance());
    }, holdMs);
    return () => clearTimeout(id);
  }, [phase, currentIndex, advanceReason, dispatch]);

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

      // 1) TERMINAL FIRST. Mark the session completed IMMEDIATELY, before the
      //    (potentially slow) session-audio upload and the optional holistic
      //    review — so an interrupted tab, a failed upload, or a failed
      //    review can never orphan the session in status='active' forever
      //    (same class of fix as spoken-practice's endSession). Loud on
      //    failure; the drill still completes client-side either way.
      if (sessionId) {
        const completed = await studyService.updateSession(sessionId, {
          status: "completed",
          ended_at: new Date().toISOString(),
        });
        if (completed.error) {
          console.error(
            "[useFastFireDrill] could not mark session completed:",
            completed.error,
          );
        }
      }

      // 2) Durable full-session audio — best-effort enrichment, attached
      //    AFTER the session is already terminal (never blocks completion;
      //    a failed upload just means no session_audio_file_id, loud-logged).
      if (full && full.size > 0) {
        try {
          // The capture core emits WAV; derive ext/mime from the blob itself.
          const mime = normalizeAudioContentType(full.type || "audio/wav");
          const ext = audioExtensionForType(mime);
          const uploaded = await fileHandler.upload(
            {
              kind: "blob",
              blob: full,
              fileName: `fastfire-session-${sessionId ?? "anon"}.${ext}`,
              mime,
            },
            {
              folderPath: CloudFolders.SYSTEM_FASTFIRE_SESSIONS,
              visibility: "personal",
              metadata: { origin: "fastfire", session_id: sessionId ?? null },
            },
          );
          const fileId = uploaded.fileId;
          if (fileId && !cancelled) {
            dispatch(setSessionAudio({ fileId }));
            if (sessionId) {
              const audioRes = await studyService.updateSession(sessionId, {
                session_audio_file_id: fileId,
              });
              if (audioRes.error) {
                console.error(
                  "[useFastFireDrill] session_audio_file_id update failed:",
                  audioRes.error,
                );
              }
            }
          }
        } catch (err) {
          console.error("[useFastFireDrill] session upload failed:", err);
        }
      }

      // 3) Optional holistic review (no-op if no review agent configured).
      //    Persists its own session_review; the session already stands
      //    completed, so a failed review is a value-add gap, never a blocker.
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
      handleExpire("skip");
    }
  };

  const abort = (): void => {
    hardStopCapture();
    setDeadlineTs(null);
    // H1+H4: close the study_session so it doesn't leak as `active` forever.
    // Best-effort and fire-and-forget — abandoning the UI must not block on the DB.
    if (sessionId) {
      void (async () => {
        try {
          const res = await studyService.updateSession(sessionId, {
            status: "abandoned",
            ended_at: new Date().toISOString(),
          });
          if (res.error) {
            console.error(
              "[useFastFireDrill] abandon updateSession failed:",
              res.error,
            );
          }
        } catch (err) {
          console.error("[useFastFireDrill] abandon updateSession threw:", err);
        }
      })();
    }
    dispatch(abandonDrill());
  };

  // Keep `cards` referenced so an empty-set drill still finalizes cleanly.
  void cards.length;

  return { subscribeProgress, countdown, skipCard, abort, onSpokenFrontEnded };
}
