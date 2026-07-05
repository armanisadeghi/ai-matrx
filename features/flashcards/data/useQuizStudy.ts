// features/flashcards/data/useQuizStudy.ts
//
// Phase 1B (Test mode) — multiple-choice study over a set's cards. Distractors
// come from sibling cards' back text first (free, instant); questions that
// come up short (small sets) get topped up on demand via the `fc_make_quiz_items`
// agent (features/flashcards/data/quiz/makeQuizItems.ts) — a clean no-op if
// that lane isn't configured, just fewer options for that one question.
//
// Every answer funnels through the SAME canonical study spine as every other
// mode: studyService.recordAttempt({ itemType: 'fc_card', method: 'test', ... }).
//
// React Compiler is on: no manual useMemo / useCallback / React.memo.

"use client";

import { useEffect, useState } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { fcService } from "./fcService";
import { studyService } from "@/features/education/study/service/studyService";
import {
  buildQuizQuestions,
  mergeFallbackDistractors,
  type QuizQuestion,
} from "./quiz/buildQuizQuestions";
import { makeQuizItems } from "./quiz/makeQuizItems";
import type { FcSetRow } from "./types";
import type { StudySessionRow } from "@/features/education/study/types";

const FC_CARD_ITEM_TYPE = "fc_card";
const QUIZ_MODE = "test";

function normalize(s: string): string {
  return s.trim().toLowerCase();
}

function clampIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  if (index < 0) return 0;
  if (index > length - 1) return length - 1;
  return index;
}

export interface UseQuizStudyOptions {
  setId?: string | null;
  withSession?: boolean;
}

export interface QuizStudyProgress {
  done: number;
  total: number;
  correct: number;
}

export interface UseQuizStudyResult {
  set: FcSetRow | null;
  questions: QuizQuestion[];
  loading: boolean;
  /** Enriching the current question's options via the AI fallback. */
  fallbackLoading: boolean;
  error: string | null;
  currentIndex: number;
  current: QuizQuestion | null;
  /** The option the user picked for the current question, or null if unanswered. */
  selected: string | null;
  /** True once the current question has been answered (locks the options). */
  answered: boolean;
  progress: QuizStudyProgress;
  grading: boolean;
  sessionId: string | null;
  /** Pick an option for the current question and record the attempt. */
  answer: (option: string) => Promise<void>;
  /** Advance to the next question (clamped). */
  next: () => void;
  goTo: (index: number) => void;
}

export function useQuizStudy(
  options: UseQuizStudyOptions = {},
): UseQuizStudyResult {
  const { setId, withSession = true } = options;
  const dispatch = useAppDispatch();

  const [set, setSet] = useState<FcSetRow | null>(null);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [loading, setLoading] = useState<boolean>(!!setId);
  const [fallbackLoading, setFallbackLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedByIndex, setSelectedByIndex] = useState<
    Record<number, string>
  >({});
  const [correctByIndex, setCorrectByIndex] = useState<Record<number, boolean>>(
    {},
  );
  const [grading, setGrading] = useState(false);
  const [session, setSession] = useState<StudySessionRow | null>(null);
  const [fallbackAttempted, setFallbackAttempted] = useState<Set<string>>(
    new Set(),
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!setId) {
        if (cancelled) return;
        setSet(null);
        setQuestions([]);
        setSelectedByIndex({});
        setCorrectByIndex({});
        setSession(null);
        setLoading(false);
        setError(null);
        setCurrentIndex(0);
        setFallbackAttempted(new Set());
        return;
      }

      setLoading(true);
      setError(null);
      setCurrentIndex(0);
      setSelectedByIndex({});
      setCorrectByIndex({});
      setFallbackAttempted(new Set());

      const setRes = await fcService.getSetWithCards(setId);
      if (cancelled) return;
      if (!setRes.data) {
        setSet(null);
        setQuestions([]);
        setError(setRes.error ?? "Failed to load flashcard set");
        setLoading(false);
        return;
      }

      const { set: loadedSet, cards: loadedCards } = setRes.data;
      setSet(loadedSet);
      setQuestions(buildQuizQuestions(loadedCards));

      if (withSession) {
        const sessionRes = await studyService.createSession({
          mode: QUIZ_MODE,
          sourceKind: "set",
          sourceSetId: loadedSet.id,
        });
        if (!cancelled) {
          if (sessionRes.error) {
            console.error("[useQuizStudy] createSession:", sessionRes.error);
          }
          setSession(sessionRes.data);
        }
      }

      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [setId, withSession]);

  // Top up the current question's options via the AI fallback when the
  // in-set distractor pool came up short (small sets). Fires once per card,
  // lazily (only for the question actually being shown), and cleanly no-ops
  // if the lane isn't configured.
  useEffect(() => {
    const q = questions[currentIndex];
    if (!q || !q.needsFallback || fallbackAttempted.has(q.cardId)) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFallbackAttempted((prev) => new Set(prev).add(q.cardId));
    setFallbackLoading(true);
    void dispatch(
      makeQuizItems({
        front: q.front,
        back: q.correctAnswer,
        topic: set?.topic ?? null,
        distractorCount: 3,
      }),
    )
      .then((result) => {
        if (cancelled || !result || result.distractors.length === 0) return;
        setQuestions((prev) =>
          prev.map((item) =>
            item.cardId === q.cardId
              ? mergeFallbackDistractors(item, result.distractors)
              : item,
          ),
        );
      })
      .finally(() => {
        if (!cancelled) setFallbackLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [currentIndex, questions, set, dispatch, fallbackAttempted]);

  const current = questions[currentIndex] ?? null;
  const selected = selectedByIndex[currentIndex] ?? null;
  const answered = selected != null;

  const goTo = (index: number): void => {
    setCurrentIndex(clampIndex(index, questions.length));
  };

  const next = (): void => {
    goTo(currentIndex + 1);
  };

  const answer = async (option: string): Promise<void> => {
    const q = questions[currentIndex];
    if (!q || answered) return;

    const isCorrect = normalize(option) === normalize(q.correctAnswer);
    setSelectedByIndex((prev) => ({ ...prev, [currentIndex]: option }));
    setCorrectByIndex((prev) => ({ ...prev, [currentIndex]: isCorrect }));

    setGrading(true);
    try {
      const res = await studyService.recordAttempt({
        itemType: FC_CARD_ITEM_TYPE,
        itemId: q.cardId,
        method: QUIZ_MODE,
        result: isCorrect ? "correct" : "incorrect",
        responseKind: "selected",
        ...(session ? { sessionId: session.id } : {}),
      });
      if (res.error) {
        console.error("[useQuizStudy] recordAttempt:", res.error);
      }
    } finally {
      setGrading(false);
    }
  };

  const doneCount = Object.keys(selectedByIndex).length;
  const correctCount = Object.values(correctByIndex).filter(Boolean).length;

  return {
    set,
    questions,
    loading,
    fallbackLoading,
    error,
    currentIndex,
    current,
    selected,
    answered,
    progress: {
      done: doneCount,
      total: questions.length,
      correct: correctCount,
    },
    grading,
    sessionId: session?.id ?? null,
    answer,
    next,
    goTo,
  };
}
