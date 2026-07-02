// features/flashcards/data/useDueReview.ts
//
// The adaptive "Review due" study hook — the vision's north-star (surface the
// exact cards a learner needs, across ALL their sets, on the FSRS schedule).
// Loads the due queue from the shared spine (`studyService.listDue('fc_card')`,
// ordered by `item_mastery.due_at`), hydrates the cards cross-set
// (`fcService.getCardsByIds`, preserving the due order), and drives the same
// flip + grade flow as `useFlashcardStudy` — but over a dynamic, cross-set queue
// instead of one set.
//
// Grading funnels through the SAME canonical path (`studyService.recordAttempt`
// → study_attempt + item_mastery), stamped `method='adaptive'` so the provenance
// is distinguishable from classic/fast_fire review. Returns the identical result
// shape the shared <StudyDeck/> consumes.
//
// React Compiler is on: no manual useMemo / useCallback / React.memo.

"use client";

import { useEffect, useState } from "react";
import { fcService } from "./fcService";
import { studyService } from "@/features/education/study/service/studyService";
import type { CardWithDetails } from "./types";
import type { StudySessionRow } from "@/features/education/study/types";
import type { ReviewResult } from "../types";
import type {
  FlashcardStudyProgress,
  UseFlashcardStudyResult,
} from "./useFlashcardStudy";

const FC_CARD_ITEM_TYPE = "fc_card";
/** mode + provenance for the adaptive due queue (source_kind CHECK allows it). */
const STUDY_MODE = "adaptive";

/** Same shape the shared StudyDeck consumes, minus `set` (there is no single set). */
export type UseDueReviewResult = Omit<UseFlashcardStudyResult, "set">;

function clampIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  if (index < 0) return 0;
  if (index > length - 1) return length - 1;
  return index;
}

function mapResult(last: string | null): ReviewResult | undefined {
  if (last === "correct" || last === "partial" || last === "incorrect") return last;
  return undefined;
}

export function useDueReview(options: { limit?: number } = {}): UseDueReviewResult {
  const { limit = 40 } = options;

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

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setLoading(true);
      setError(null);
      setCurrentIndex(0);
      setIsFlipped(false);

      // 1. The FSRS due queue (mastery rows, soonest-due first).
      const dueRes = await studyService.listDue(FC_CARD_ITEM_TYPE, limit);
      if (cancelled) return;
      if (dueRes.error) {
        setError(dueRes.error);
        setCards([]);
        setResultsByCard({});
        setLoading(false);
        return;
      }
      const due = dueRes.data ?? [];
      const ids = due.map((m) => m.item_id);
      if (ids.length === 0) {
        setCards([]);
        setResultsByCard({});
        setLoading(false);
        return;
      }

      // 2. Hydrate the cards cross-set, in the due order.
      const cardsRes = await fcService.getCardsByIds(ids);
      if (cancelled) return;
      if (cardsRes.error) {
        setError(cardsRes.error);
        setCards([]);
        setLoading(false);
        return;
      }
      setCards(cardsRes.data ?? []);

      // Seed prior results from the mastery rows we already have.
      const seeded: Record<string, ReviewResult | undefined> = {};
      for (const m of due) {
        const r = mapResult(m.last_result);
        if (r) seeded[m.item_id] = r;
      }
      setResultsByCard(seeded);

      // 3. Open an adaptive session tagging every attempt.
      const sessionRes = await studyService.createSession({
        mode: STUDY_MODE,
        sourceKind: "adaptive",
      });
      if (!cancelled) {
        if (sessionRes.error) {
          console.error("[useDueReview] createSession:", sessionRes.error);
        }
        setSession(sessionRes.data);
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [limit]);

  const flip = (): void => setIsFlipped((f) => !f);

  const goTo = (index: number): void => {
    setCurrentIndex(clampIndex(index, cards.length));
    setIsFlipped(false);
  };
  const next = (): void => goTo(currentIndex + 1);
  const prev = (): void => goTo(currentIndex - 1);

  const grade = async (result: ReviewResult) => {
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
        ...(session ? { sessionId: session.id } : {}),
      });
      if (res.error || !res.data) {
        console.error("[useDueReview] recordAttempt:", res.error);
        return null;
      }
      setResultsByCard((prev) => ({ ...prev, [card.id]: result }));
      goTo(currentIndex + 1);
      return res.data.mastery;
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
  };
}
