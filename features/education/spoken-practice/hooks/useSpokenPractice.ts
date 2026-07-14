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
//   · gradeSpokenAnswer  — upload + grade + recordAttempt (the crown-jewel path)
//   · reviewSession lane — the mode-agnostic "professor" batch review
//   · studyService       — createSession / updateSession (the ONE study spine)
//   · useCartesiaSpeaker — read the prompt aloud
// This hook only adds the prompt-sequencing state machine + long-form answering
// (press "Done" — no short FastFire timer), same local-state discipline as
// AudioReviewSession / SingleCardVoiceTest. React Compiler is on: no manual memo.

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useAppDispatch } from "@/lib/redux/hooks";
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
import { gradeSpokenAnswer } from "@/features/flashcards/fast-fire/agents/gradeSpokenAnswer.thunk";
import { uploadResponseClip } from "@/features/flashcards/fast-fire/agents/grading-core";
import { CloudFolders } from "@/features/files/utils/folder-conventions";
import { studyService } from "@/features/education/study/service/studyService";
import { verdictResult } from "@/features/education/trust/types";
import {
  reviewSession,
  type ReviewSessionResult,
} from "@/features/education/tutor/lanes/reviewSession";
import {
  buildReviewAggregate,
  type ReviewAttempt,
} from "@/features/education/tutor/lanes/learnerContext";
import { generateSession } from "../data/generateSession";
import { SPOKEN_PROMPT_ITEM_TYPE } from "../agents";
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
  plan: PracticePlan | null;
  index: number;
  sessionId: string | null;
  results: PromptResult[];
  grade: SpokenGrade | null;
  review: ReviewSessionResult | null;
  micLevel: number;
  error: string | null;
  /** Begin a session (call inside a click gesture — it warms the mic). */
  start: (config: PracticeConfig) => Promise<void>;
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

  const start = useCallback(
    async (config: PracticeConfig) => {
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
        }),
      );
      if (!designed) {
        setError("Couldn't design your session. Please try again.");
        setPhase("error");
        return;
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
        return;
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
        return;
      }

      setSessionId(session.data.id);
      setPlan(designed);
      setPhase("asking");
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
        gradeSpokenAnswer({
          front: current.prompt,
          back: current.referenceAnswer,
          secondsAllowed: elapsed,
          clip,
          rubric: current.rubric,
          itemType: SPOKEN_PROMPT_ITEM_TYPE,
          itemId: current.id,
          method: config.mode,
          sessionId,
          surface: "spoken-practice",
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
    let sessionClip: Blob | null = null;
    if (capturingRef.current) {
      sessionClip = stopContinuousCapture();
      capturingRef.current = false;
    }
    setPhase("reviewing");

    const activePlan = plan;
    const currentResults = results;
    if (!activePlan || !sessionId) {
      setPhase("summary");
      return;
    }

    // Durable full-session audio (never throws → null on failure).
    let sessionAudioFileId: string | null = null;
    if (sessionClip) {
      sessionAudioFileId = await uploadResponseClip(sessionClip, {
        folderPath: CloudFolders.SYSTEM_SPOKEN_PRACTICE_SESSIONS,
        metadata: { surface: "spoken-practice", sessionId },
      });
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

    await studyService.updateSession(sessionId, {
      status: "completed",
      ended_at: new Date().toISOString(),
      aggregate_score: {
        total: aggregate.total,
        graded: aggregate.graded,
        correct: aggregate.correct,
        accuracy: aggregate.accuracy,
      },
      ...(sessionAudioFileId
        ? { session_audio_file_id: sessionAudioFileId }
        : {}),
    });

    // The examiner's batch summary (reused professor grader). Persists
    // session_review itself; returns it for inline display, or null on skip.
    const summary = await dispatch(
      reviewSession({ sessionId, attempts, aggregate }),
    );
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
