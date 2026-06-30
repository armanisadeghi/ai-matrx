// features/flashcards/data/useFlashcardStudy.ts
//
// Canonical flashcard STUDY hook — the reusable study flow over a single
// `education.fc_set`. Loads the set's ordered cards (`fcService.getSetWithCards`)
// plus the current user's per-card mastery (`studyService.getMasteryBulk`), and
// drives an interactive review: flip, navigate, and self-grade.
//
// Grading is the load-bearing part: `grade(result)` funnels through the SHARED
// study spine via `studyService.recordAttempt({ itemType:'fc_card', ... })`, the
// ONLY path that atomically appends the immutable ledger row AND advances
// `item_mastery`. No mode bypasses it. The fresh mastery the RPC returns is
// merged back into local state so progress reflects immediately.
//
// Self-contained and mode-agnostic so the standalone study surfaces (Wave 3)
// reuse it verbatim — it owns no canvas concepts, just a setId.
//
// React Compiler is on: no manual useMemo / useCallback / React.memo.

"use client";

import { useEffect, useState } from "react";
import { fcService } from "./fcService";
import { studyService } from "@/features/education/study/service/studyService";
import type {
  FcSetRow,
  CardWithDetails,
} from "./types";
import type {
  ItemMasteryRow,
  StudySessionRow,
} from "@/features/education/study/types";
import type { ReviewResult } from "../types";

/** The study item type every flashcard attempt is keyed by in the study spine. */
const FC_CARD_ITEM_TYPE = "fc_card";
const STUDY_MODE = "classic_review";

export interface FlashcardStudyProgress {
  /** Distinct cards the user has graded at least once this load. */
  done: number;
  /** Total cards in the set. */
  total: number;
  /** Distinct cards last graded `correct`. */
  correct: number;
}

export interface UseFlashcardStudyResult {
  /** The loaded set row (null until loaded / on error). */
  set: FcSetRow | null;
  /** The set's ordered cards with their detail rows. */
  cards: CardWithDetails[];
  loading: boolean;
  /** Structured error string (service-style), or null. */
  error: string | null;
  /** Index of the card currently in view. */
  currentIndex: number;
  /** Whether the current card is showing its back. */
  isFlipped: boolean;
  /** The current user's latest result per card id (this load). */
  resultsByCard: Record<string, ReviewResult | undefined>;
  /** Toggle the current card's face. */
  flip: () => void;
  /** Advance to the next card (clamped; resets the flip). */
  next: () => void;
  /** Go to the previous card (clamped; resets the flip). */
  prev: () => void;
  /** Jump to a specific card index (clamped; resets the flip). */
  goTo: (index: number) => void;
  /**
   * Record a self-grade for the current card through the canonical study spine,
   * then advance. Returns the fresh mastery row (or null on error / no card).
   */
  grade: (result: ReviewResult) => Promise<ItemMasteryRow | null>;
  /** True while a grade write is in flight. */
  grading: boolean;
  /** Cards graded / total / correct (this load). */
  progress: FlashcardStudyProgress;
}

export interface UseFlashcardStudyOptions {
  /** The `education.fc_set.id` to study. Null/undefined → idle (no load). */
  setId?: string | null;
  /**
   * Open a `study_session` on first load and tag every attempt with it. Off by
   * default (attempts are valid session-less); the canvas inline view leaves it
   * off, the standalone study surfaces will turn it on.
   */
  withSession?: boolean;
}

function clampIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  if (index < 0) return 0;
  if (index > length - 1) return length - 1;
  return index;
}

/** Map a mastery row's last result back to the card-level review result, if any. */
function resultFromMastery(
  mastery: ItemMasteryRow,
): ReviewResult | undefined {
  const last = mastery.last_result;
  if (last === "correct" || last === "partial" || last === "incorrect") {
    return last;
  }
  return undefined;
}

export function useFlashcardStudy(
  options: UseFlashcardStudyOptions = {},
): UseFlashcardStudyResult {
  const { setId, withSession = false } = options;

  const [set, setSet] = useState<FcSetRow | null>(null);
  const [cards, setCards] = useState<CardWithDetails[]>([]);
  const [loading, setLoading] = useState<boolean>(!!setId);
  const [error, setError] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [resultsByCard, setResultsByCard] = useState<
    Record<string, ReviewResult | undefined>
  >({});
  const [grading, setGrading] = useState(false);
  const [session, setSession] = useState<StudySessionRow | null>(null);

  // Load the set, its cards, and the current user's existing mastery per card.
  // All state writes happen inside the async body so none fire synchronously in
  // the effect (which would trigger cascading renders).
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      if (!setId) {
        if (cancelled) return;
        setSet(null);
        setCards([]);
        setResultsByCard({});
        setSession(null);
        setLoading(false);
        setError(null);
        setCurrentIndex(0);
        setIsFlipped(false);
        return;
      }

      setLoading(true);
      setError(null);
      setCurrentIndex(0);
      setIsFlipped(false);

      const setRes = await fcService.getSetWithCards(setId);
      if (cancelled) return;
      if (!setRes.data) {
        setSet(null);
        setCards([]);
        setResultsByCard({});
        setError(setRes.error ?? "Failed to load flashcard set");
        setLoading(false);
        return;
      }

      const { set: loadedSet, cards: loadedCards } = setRes.data;
      setSet(loadedSet);
      setCards(loadedCards);

      // Seed prior results from mastery (best-effort; loud but never fatal).
      if (loadedCards.length > 0) {
        const masteryRes = await studyService.getMasteryBulk(
          loadedCards.map((c) => ({
            itemType: FC_CARD_ITEM_TYPE,
            itemId: c.id,
          })),
        );
        if (!cancelled) {
          if (masteryRes.error) {
            console.error(
              "[useFlashcardStudy] getMasteryBulk:",
              masteryRes.error,
            );
          }
          const seeded: Record<string, ReviewResult | undefined> = {};
          for (const m of masteryRes.data ?? []) {
            const result = resultFromMastery(m);
            if (result) seeded[m.item_id] = result;
          }
          setResultsByCard(seeded);
        }
      } else {
        setResultsByCard({});
      }

      // Optionally open a session this study tags its attempts with.
      if (withSession) {
        const sessionRes = await studyService.createSession({
          mode: STUDY_MODE,
          sourceKind: "set", //  study_session.source_kind CHECK = set|dynamic_batch|adaptive
          sourceSetId: loadedSet.id,
        });
        if (!cancelled) {
          if (sessionRes.error) {
            console.error(
              "[useFlashcardStudy] createSession:",
              sessionRes.error,
            );
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

  const flip = (): void => {
    setIsFlipped((f) => !f);
  };

  const goTo = (index: number): void => {
    const nextIndex = clampIndex(index, cards.length);
    setCurrentIndex(nextIndex);
    setIsFlipped(false);
  };

  const next = (): void => {
    goTo(currentIndex + 1);
  };

  const prev = (): void => {
    goTo(currentIndex - 1);
  };

  const grade = async (
    result: ReviewResult,
  ): Promise<ItemMasteryRow | null> => {
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
        console.error("[useFlashcardStudy] recordAttempt:", res.error);
        return null;
      }
      // Reflect the graded result and advance.
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
  const correctCount = gradedIds.filter(
    (id) => resultsByCard[id] === "correct",
  ).length;

  const progress: FlashcardStudyProgress = {
    done: gradedIds.length,
    total: cards.length,
    correct: correctCount,
  };

  return {
    set,
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
