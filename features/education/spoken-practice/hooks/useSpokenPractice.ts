"use client";

// features/education/spoken-practice/hooks/useSpokenPractice.ts
//
// The Spoken Practice orchestrator. Drives one voice-first session end to end:
//   generate prompts (designer agent) → open ONE warm mic → for each prompt:
//   speak it (TTS) → capture the spoken answer → grade it on MEANING → record
//   to the shared study spine → examiner's batch summary at the end.
//
// EVERYTHING heavy is REUSED, never forked (VOICE_INTERACTIONS invariant):
//   · continuousCapture  — the hardened one-warm-mic capture singleton
//   · grading-core        — upload + runSpokenGrader + coerceSpokenGrade (reused by
//     the in-feature gradePracticeAnswer, which points at the DEDICATED mode-aware
//     spoken-practice grader instead of the flashcard one — GAP 1)
//   · reviewPracticeSession — the DEDICATED mode-aware examiner/interviewer/judge
//     review (replaces the flashcard batch-review agent that leaked DB-narration)
//   · studyService       — createSession / updateSession (the ONE study spine)
//   · useCartesiaSpeaker — read the prompt aloud
// This hook only adds the prompt-sequencing state machine + long-form answering
// (press "Done" — no short FastFire timer), same local-state discipline as
// AudioReviewSession / SingleCardVoiceTest. React Compiler is on: no manual memo.
//
// THE FLOATING LAW, inline variant: every one of the three agent runs (design
// the session, grade an answer, review the session) exposes its live
// conversation as `liveConversationId`, and PracticeRunner renders it with
// `<LiveRunDisplay>` exactly where the spinner used to be. This surface earns
// the inline exception because at those moments the wait IS the entire screen —
// there is nothing to shift, and a floating window over an empty page would be
// worse. `useLiveRunHandle` owns the kept-alive instance (released on the next
// run and on unmount).

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "@/lib/toast";
import { useAppDispatch } from "@/lib/redux/hooks";
import { useLiveRunHandle } from "@/features/agents/hooks/useLiveRunHandle";
import { useCartesiaSpeaker } from "@/features/tts/hooks/useCartesiaSpeaker";
import {
  startContinuousCapture,
  startCardClip,
  stopCardClip,
  stopContinuousCapture,
  hardStopCapture,
  isContinuousCaptureActive,
  subscribeLevel,
  playBuzzer,
} from "@/features/flashcards/fast-fire/audio/continuousCapture";
import { uploadResponseClip } from "@/features/flashcards/fast-fire/agents/grading-core";
import { CloudFolders } from "@/features/files/utils/folder-conventions";
import { studyService } from "@/features/education/study/service/studyService";
import { verdictResult } from "@/features/education/trust/types";
import type { ReviewSessionResult } from "@/features/education/tutor/lanes/reviewSession";
import {
  buildReviewAggregate,
  type ReviewAttempt,
} from "@/features/education/tutor/lanes/learnerContext";
import { generateSession } from "../data/generateSession";
import { gradePracticeAnswer } from "../data/gradePracticeAnswer";
import { reviewPracticeSession } from "../data/reviewPracticeSession";
import { ANSWER_MAX_SECONDS } from "../constants";
import type {
  PracticeConfig,
  PracticePlan,
  PromptResult,
  RunnerPhase,
} from "../types";
import type { SpokenGrade } from "@/features/flashcards/fast-fire/agents/grading-core";

export interface UseSpokenPractice {
  phase: RunnerPhase;
  /** The current run's live conversation — render it, never a spinner. */
  liveConversationId: string | null;
  plan: PracticePlan | null;
  index: number;
  sessionId: string | null;
  results: PromptResult[];
  grade: SpokenGrade | null;
  review: ReviewSessionResult | null;
  micLevel: number;
  error: string | null;
  /**
   * Begin a session (call inside a click gesture — it warms the mic). Resolves
   * true only when the session fully started, so the caller can meter usage.
   */
  start: (config: PracticeConfig) => Promise<boolean>;
  /** Submit the current spoken answer now (the learner pressed "Done"). */
  submitAnswer: () => void;
  /** Skip the current prompt without answering. */
  skip: () => void;
  /** Advance to the next prompt (or finish). */
  next: () => void;
  /** Abandon the session and release the mic. */
  quit: () => void;
  /** Reset to setup after an error. */
  reset: () => void;
}

export function useSpokenPractice(): UseSpokenPractice {
  const dispatch = useAppDispatch();
  const liveRun = useLiveRunHandle();
  const { speak, stop: speakStop } = useCartesiaSpeaker({
    processMarkdown: false,
    purpose: "assistant",
  });

  const [phase, setPhase] = useState<RunnerPhase>("idle");
  const [plan, setPlan] = useState<PracticePlan | null>(null);
  const [index, setIndex] = useState(0);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [results, setResults] = useState<PromptResult[]>([]);
  const [grade, setGrade] = useState<SpokenGrade | null>(null);
  const [review, setReview] = useState<ReviewSessionResult | null>(null);
  const [micLevel, setMicLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const configRef = useRef<PracticeConfig | null>(null);
  const capturingRef = useRef(false);
  const phaseRef = useRef<RunnerPhase>("idle");
  const answeringRef = useRef(false);
  const finishingRef = useRef(false);
  const answerStartRef = useRef(0);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  // Live mic level for the answer meter (rAF-driven; only moves while capturing).
  useEffect(() => subscribeLevel(setMicLevel), []);

  // Release the mic + stop TTS on unmount.
  useEffect(() => {
    return () => {
      void speakStop();
      if (capturingRef.current) {
        hardStopCapture();
        capturingRef.current = false;
      }
    };
  }, [speakStop]);

  const current = plan?.prompts[index] ?? null;

  // Returns true only when the grounded session was designed AND fully started
  // (mic warmed, study-spine session opened, phase → asking). The caller meters
  // the entitlement on that success; any early error return yields false so a
  // failed start never burns quota.
  const start = useCallback(
    async (config: PracticeConfig): Promise<boolean> => {
      configRef.current = config;
      setError(null);
      setResults([]);
      setGrade(null);
      setReview(null);
      setIndex(0);
      setPhase("generating");

      // 1) Design the grounded prompt set.
      const designed = await dispatch(
        generateSession({
          mode: config.mode,
          focus: config.focus,
          difficulty: config.difficulty,
          count: config.count,
          studyMaterial: config.source?.material ?? "",
          source: config.source,
          onConversationCreated: liveRun.claim,
        }),
      );
      if (!designed) {
        setError("Couldn't design your session. Please try again.");
        setPhase("error");
        return false;
      }

      // 2) Warm ONE mic (inside the start gesture chain).
      try {
        await startContinuousCapture();
        if (!isContinuousCaptureActive())
          throw new Error("Microphone did not start");
        capturingRef.current = true;
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "Couldn't access the microphone",
        );
        setPhase("error");
        return false;
      }

      // 3) Open the study-spine session (mode carries the practice type).
      const session = await studyService.createSession({
        mode: config.mode,
        sourceKind: config.source?.kind ?? "topic",
        sourceSetId: config.source?.setId ?? null,
        settings: {
          focus: config.focus,
          difficulty: config.difficulty,
          count: config.count,
          sourceTitle: config.source?.title ?? null,
          sessionTitle: designed.sessionTitle,
          intro: designed.intro,
          prompts: designed.prompts,
        },
      });
      if (session.error || !session.data) {
        hardStopCapture();
        capturingRef.current = false;
        setError(session.error ?? "Couldn't start the session");
        setPhase("error");
        return false;
      }

      setSessionId(session.data.id);
      setPlan(designed);
      setPhase("asking");
      return true;
    },
    [dispatch],
  );

  const beginAnswer = useCallback(() => {
    if (phaseRef.current !== "asking" || answeringRef.current || !current)
      return;
    answeringRef.current = true;
    answerStartRef.current = Date.now();
    playBuzzer("start");
    startCardClip(current.id);
    setPhase("answering");
  }, [current]);

  // Ask: read the prompt (intro precedes the first), then open the answer window.
  useEffect(() => {
    if (phase !== "asking" || !current || !plan) return;
    answeringRef.current = false;
    finishingRef.current = false;
    let cancelled = false;
    const spoken =
      index === 0 && plan.intro
        ? `${plan.intro} ${current.prompt}`
        : current.prompt;
    const fallback = window.setTimeout(() => beginAnswer(), 30_000);
    void (async () => {
      await speak(spoken);
      if (!cancelled && phaseRef.current === "asking") beginAnswer();
    })();
    return () => {
      cancelled = true;
      window.clearTimeout(fallback);
      void speakStop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, index]);

  const finishAnswer = useCallback(async () => {
    const config = configRef.current;
    if (
      phaseRef.current !== "answering" ||
      finishingRef.current ||
      !current ||
      !config
    )
      return;
    finishingRef.current = true;
    playBuzzer("stop");
    setPhase("grading");
    setGrade(null);
    setError(null);

    const elapsed = Math.max(
      1,
      Math.round((Date.now() - answerStartRef.current) / 1000),
    );
    try {
      const clip = await stopCardClip(current.id);
      const res = await dispatch(
        gradePracticeAnswer({
          mode: config.mode,
          prompt: current.prompt,
          referenceAnswer: current.referenceAnswer,
          rubric: current.rubric,
          secondsAllowed: elapsed,
          clip,
          itemId: current.id,
          sessionId,
          onConversationCreated: liveRun.claim,
        }),
      );
      if (res.status === "graded" && res.grade) {
        setGrade(res.grade);
        setResults((r) => [
          ...r,
          {
            promptId: current.id,
            result: verdictResult(res.grade!.verdict),
            score: res.grade!.score,
            grade: res.grade!,
          },
        ]);
      } else {
        setResults((r) => [
          ...r,
          { promptId: current.id, result: "skipped", score: 0, grade: null },
        ]);
        if (res.error) setError(res.error);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Grading failed");
      setResults((r) => [
        ...r,
        { promptId: current.id, result: "skipped", score: 0, grade: null },
      ]);
    } finally {
      setPhase("result");
    }
  }, [current, dispatch, sessionId]);

  // Runaway guard: auto-submit a never-ending answer. There is no short timer —
  // spoken-practice answers are long-form and end on the learner's "Done".
  useEffect(() => {
    if (phase !== "answering") return;
    const id = window.setTimeout(
      () => void finishAnswer(),
      ANSWER_MAX_SECONDS * 1000,
    );
    return () => window.clearTimeout(id);
  }, [phase, finishAnswer]);

  const endSession = useCallback(async () => {
    const config = configRef.current;
    let sessionClip: Blob | null = null;
    if (capturingRef.current) {
      sessionClip = stopContinuousCapture();
      capturingRef.current = false;
    }
    setPhase("reviewing");

    const activePlan = plan;
    const currentResults = results;
    if (!activePlan || !sessionId || !config) {
      setPhase("summary");
      return;
    }

    const attempts: ReviewAttempt[] = [];
    for (const p of activePlan.prompts) {
      const r = currentResults.find((x) => x.promptId === p.id);
      if (!r) continue;
      attempts.push({
        front: p.prompt,
        result: r.result === "skipped" ? null : r.result,
        score: r.score,
        transcript: r.grade?.transcript ?? "",
      });
    }
    const aggregate = buildReviewAggregate(attempts, activePlan.prompts.length);

    // 1) TERMINAL FIRST (GAP 2). Mark the session completed IMMEDIATELY, before
    //    the (potentially slow) session-audio upload and the async review — so an
    //    interrupted tab, a failed upload, or a failed review can never orphan the
    //    session in status='active' with recorded attempts but no terminal state.
    //    Loud on failure; we still proceed (the summary screen is client-side).
    const completed = await studyService.updateSession(sessionId, {
      status: "completed",
      ended_at: new Date().toISOString(),
      aggregate_score: {
        total: aggregate.total,
        graded: aggregate.graded,
        correct: aggregate.correct,
        accuracy: aggregate.accuracy,
      },
    });
    if (completed.error) {
      console.error(
        "[spoken-practice] could not mark session completed:",
        completed.error,
      );
      toast.error(
        "We couldn't save your session status just now — your answers were recorded.",
      );
    }

    // 2) Durable full-session audio — best-effort enrichment, attached AFTER the
    //    session is already terminal (never blocks completion; null on failure).
    if (sessionClip) {
      const sessionAudioFileId = await uploadResponseClip(sessionClip, {
        folderPath: CloudFolders.SYSTEM_SPOKEN_PRACTICE_SESSIONS,
        metadata: { surface: "spoken-practice", sessionId },
      });
      if (sessionAudioFileId) {
        await studyService.updateSession(sessionId, {
          session_audio_file_id: sessionAudioFileId,
        });
      }
    }

    // 3) The dedicated, mode-aware examiner's / interviewer's / judge's review.
    //    Persists session_review itself; returns it for inline display. On failure
    //    we LOUD-RECOVER: the session already stands completed, we just note the
    //    review gap and show the scorecard without the narrative.
    const summary = await dispatch(
      reviewPracticeSession({
        sessionId,
        mode: config.mode,
        attempts,
        aggregate,
        onConversationCreated: liveRun.claim,
      }),
    );
    if (!summary) {
      console.warn(
        `[spoken-practice] session ${sessionId} completed but the ${config.mode} review was not generated (review gap) — scorecard shown without a narrative review.`,
      );
    }
    setReview(summary);
    setPhase("summary");
  }, [dispatch, plan, results, sessionId]);

  const next = useCallback(() => {
    if (!plan) return;
    if (index + 1 >= plan.prompts.length) {
      void endSession();
      return;
    }
    setIndex((i) => i + 1);
    setGrade(null);
    setError(null);
    setPhase("asking");
  }, [plan, index, endSession]);

  const submitAnswer = useCallback(() => void finishAnswer(), [finishAnswer]);

  const skip = useCallback(() => {
    // Treat a skip as a null-audio answer through the SAME path (records a
    // result-less attempt, keeping the ledger honest), then move on.
    void finishAnswer();
  }, [finishAnswer]);

  const quit = useCallback(() => {
    void speakStop();
    if (capturingRef.current) {
      hardStopCapture();
      capturingRef.current = false;
    }
    if (sessionId && phaseRef.current !== "summary") {
      void studyService.updateSession(sessionId, {
        status: "abandoned",
        ended_at: new Date().toISOString(),
      });
    }
    setPhase("idle");
    setPlan(null);
    setSessionId(null);
  }, [sessionId, speakStop]);

  const reset = useCallback(() => {
    if (capturingRef.current) {
      hardStopCapture();
      capturingRef.current = false;
    }
    setError(null);
    setPlan(null);
    setSessionId(null);
    setPhase("idle");
  }, []);

  return {
    phase,
    liveConversationId: liveRun.conversationId,
    plan,
    index,
    sessionId,
    results,
    grade,
    review,
    micLevel,
    error,
    start,
    submitAnswer,
    skip,
    next,
    quit,
    reset,
  };
}
