// features/flashcards/data/useWeakAreaDrill.ts
//
// Phase 3 (Flashcards Competitive Parity Push) — the weak-area drill: the
// learner's worst cards across ALL their sets, worst-first. Mirrors
// `useDueReview` almost exactly (same shared-spine session/grade plumbing,
// same <StudyDeck/> result shape) — the only real difference is the queue
// source: `studyService.listWeakest` (struggle_flag / low retrievability
// candidates) instead of `listDue` (due_at <= now), and the queue is re-sorted
// client-side by LIVE (time-decayed) retrievability via
// `currentRetrievability` — the DB snapshot doesn't account for FSRS decay
// since `last_review`, so a true worst-first order can't be a pure SQL ORDER
// BY today.
//
// Grading funnels through the SAME canonical path (`studyService.recordAttempt`
// → study_attempt + item_mastery), stamped `method='weak_area'`.
//
// React Compiler is on: no manual useMemo / useCallback / React.memo.

"use client";

import { useEffect, useRef, useState } from "react";
import { fcService } from "./fcService";
import { studyService } from "@/features/education/study/service/studyService";
import { currentRetrievability } from "@/features/education/study/utils/masteryFsrs";
import type { CardWithDetails } from "./types";
import type {
  ItemMasteryRow,
  StudySessionRow,
} from "@/features/education/study/types";
import type { ReviewResult } from "../types";
import type {
  FlashcardStudyProgress,
  UseFlashcardStudyResult,
} from "./useFlashcardStudy";

const FC_CARD_ITEM_TYPE = "fc_card";
const STUDY_MODE = "weak_area";

export type UseWeakAreaDrillResult = Omit<UseFlashcardStudyResult, "set">;

function clampIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  if (index < 0) return 0;
  if (index > length - 1) return length - 1;
  return index;
}

function progressDone(
  results: Record<string, ReviewResult | undefined>,
): number {
  return Object.values(results).filter((r) => r !== undefined).length;
}

export function useWeakAreaDrill(
  options: { limit?: number } = {},
): UseWeakAreaDrillResult {
  const { limit = 20 } = options;

  const [cards, setCards] = useState<CardWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [resultsByCard, setResultsByCard] = useState<
    Record<string, ReviewResult | undefined>
  >({});
  const [grading, setGrading] = useState(false);
  const [session, setSession] = useState<StudySessionRow | null>(null);
  const [masteryByCard, setMasteryByCard] = useState<
    Record<string, ItemMasteryRow | undefined>
  >({});

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setLoading(true);
      setError(null);
      setCurrentIndex(0);
      setIsFlipped(false);
      setMasteryByCard({});

      // 1. Candidate weak rows (struggling OR low write-time retrievability).
      const weakRes = await studyService.listWeakest(FC_CARD_ITEM_TYPE);
      if (cancelled) return;
      if (weakRes.error) {
        setError(weakRes.error);
        setCards([]);
        setResultsByCard({});
        setLoading(false);
        return;
      }

      // 2. Re-rank by LIVE (decayed) retrievability, worst first, then cap.
      const now = new Date();
      const ranked = [...(weakRes.data ?? [])].sort((a, b) => {
        const ra = currentRetrievability(a, now) ?? 0;
        const rb = currentRetrievability(b, now) ?? 0;
        if (a.struggle_flag !== b.struggle_flag) return a.struggle_flag ? -1 : 1;
        return ra - rb;
      });
      const worst = ranked.slice(0, limit);
      const ids = worst.map((m) => m.item_id);
      if (ids.length === 0) {
        setCards([]);
        setResultsByCard({});
        setLoading(false);
        return;
      }

      // 3. Hydrate the cards cross-set, preserving the worst-first order.
      const cardsRes = await fcService.getCardsByIds(ids);
      if (cancelled) return;
      if (cardsRes.error) {
        setError(cardsRes.error);
        setCards([]);
        setLoading(false);
        return;
      }
      setCards(cardsRes.data ?? []);
      setResultsByCard({});

      // 4. Open a weak_area session tagging every attempt.
      const sessionRes = await studyService.createSession({
        mode: STUDY_MODE,
        sourceKind: "weak_area",
      });
      if (!cancelled) {
        if (sessionRes.error) {
          console.error("[useWeakAreaDrill] createSession:", sessionRes.error);
        }
        setSession(sessionRes.data);
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [limit]);

  const closeRef = useRef<{ id: string; closed: boolean } | null>(null);
  useEffect(() => {
    closeRef.current = session ? { id: session.id, closed: false } : null;
  }, [session]);

  useEffect(() => {
    const ref = closeRef.current;
    if (!ref || ref.closed || !session) return;
    if (cards.length > 0 && progressDone(resultsByCard) >= cards.length) {
      ref.closed = true;
      void studyService.updateSession(session.id, {
        status: "completed",
        ended_at: new Date().toISOString(),
      });
    }
  }, [session, cards.length, resultsByCard]);

  useEffect(() => {
    return () => {
      const ref = closeRef.current;
      if (ref && !ref.closed) {
        ref.closed = true;
        void studyService.updateSession(ref.id, {
          status: "abandoned",
          ended_at: new Date().toISOString(),
        });
      }
    };
  }, []);

  const flip = (): void => setIsFlipped((f) => !f);

  const goTo = (index: number): void => {
    setCurrentIndex(clampIndex(index, cards.length));
    setIsFlipped(false);
  };
  const next = (): void => goTo(currentIndex + 1);
  const prev = (): void => goTo(currentIndex - 1);

  const grade = async (
    result: ReviewResult,
    extra?: { confidence?: number },
  ) => {
    const card = cards[currentIndex];
    if (!card) return null;
    setGrading(true);
    try {
      const res = await studyService.recordAttempt({
        itemType: FC_CARD_ITEM_TYPE,
        itemId: card.id,
        method: STUDY_MODE,
        result,
        responseKind: "selected",
        ...(extra?.confidence != null ? { confidence: extra.confidence } : {}),
        ...(session ? { sessionId: session.id } : {}),
      });
      if (res.error || !res.data) {
        console.error("[useWeakAreaDrill] recordAttempt:", res.error);
        return null;
      }
      const { mastery } = res.data;
      setResultsByCard((prev) => ({ ...prev, [card.id]: result }));
      setMasteryByCard((prev) => ({ ...prev, [card.id]: mastery }));
      goTo(currentIndex + 1);
      return mastery;
    } finally {
      setGrading(false);
    }
  };

  const gradedIds = Object.keys(resultsByCard).filter(
    (id) => resultsByCard[id] !== undefined,
  );
  const progress: FlashcardStudyProgress = {
    done: gradedIds.length,
    total: cards.length,
    correct: gradedIds.filter((id) => resultsByCard[id] === "correct").length,
  };

  return {
    cards,
    loading,
    error,
    currentIndex,
    isFlipped,
    resultsByCard,
    flip,
    next,
    prev,
    goTo,
    grade,
    grading,
    progress,
    masteryByCard,
    sessionId: session?.id ?? null,
    // No Learn-mode reshuffle here — every card graded correct counts, same
    // as `progress.correct` (the field only diverges once reshuffling is on).
    masteredCount: gradedIds.filter((id) => resultsByCard[id] === "correct").length,
  };
}
