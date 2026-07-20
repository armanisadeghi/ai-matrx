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
import { toast } from "@/lib/toast";
import { fcService } from "./fcService";
import { studyService } from "@/features/education/study/service/studyService";
import type { FcSetRow, CardWithDetails } from "./types";
import type {
  ItemMasteryRow,
  StudySessionRow,
  RecordAttemptInput,
} from "@/features/education/study/types";
import type { ReviewResult } from "../types";

/** The study item type every flashcard attempt is keyed by in the study spine. */
const FC_CARD_ITEM_TYPE = "fc_card";
const STUDY_MODE = "classic_review";

/** Phase 1B (Learn mode) — how far ahead a not-yet-mastered card gets
 *  reinserted into the working queue after a wrong/partial grade, so it
 *  resurfaces "soon" rather than "never again this session" or "immediately"
 *  (which would just be an annoying repeat-until-right loop). */
const LEARN_REQUEUE_OFFSET = 3;

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
   * `extra.responseKind`/`responseTranscript` let Write mode persist the
   * typed answer instead of the default "selected" flip-and-grade shape.
   */
  grade: (
    result: ReviewResult,
    extra?: {
      responseKind?: RecordAttemptInput["responseKind"];
      responseTranscript?: string;
      /** 1–5 confidence tap — drives the FSRS grade (see recordAttempt). */
      confidence?: number;
    },
  ) => Promise<ItemMasteryRow | null>;
  /** True while a grade write is in flight. */
  grading: boolean;
  /** Cards graded / total / correct (this load). */
  progress: FlashcardStudyProgress;
  /** Per-card mastery rows (seeded on load, updated on grade). */
  masteryByCard: Record<string, ItemMasteryRow | undefined>;
  /** The open `study_session.id` tagging every attempt this load, or null
   *  (no session — `withSession: false`, or still loading). Phase 4: lets the
   *  shared <StudyDeck/> auto-run the end-of-session AI review against it. */
  sessionId: string | null;
  /** Phase 1B (Learn mode) — distinct cards mastered (graded correct) at
   *  least once this load. Only meaningful when `reshuffleWeighted` is on;
   *  `progress.total` still reflects the ORIGINAL card count even though the
   *  working queue shrinks as cards are mastered. */
  masteredCount: number;
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
  /**
   * Phase 1B — the `study_session.mode` / `study_attempt.method` string this
   * load writes. Defaults to `"classic_review"`. Learn mode passes `"learn"`.
   */
  mode?: string;
  /**
   * Phase 1B (Learn mode) — instead of linear advance-and-never-return, a
   * wrong/partial grade reinserts the card `LEARN_REQUEUE_OFFSET` slots ahead
   * in the working queue (so it resurfaces soon) and a correct grade removes
   * it entirely (mastered for this session). The session/deck naturally ends
   * once the queue is empty. Classic study (default `false`) is unaffected —
   * `cards` stays the static, ordered set.
   */
  reshuffleWeighted?: boolean;
}

function clampIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  if (index < 0) return 0;
  if (index > length - 1) return length - 1;
  return index;
}

export function useFlashcardStudy(
  options: UseFlashcardStudyOptions = {},
): UseFlashcardStudyResult {
  const {
    setId,
    withSession = false,
    mode = STUDY_MODE,
    reshuffleWeighted = false,
  } = options;

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
  const [masteryByCard, setMasteryByCard] = useState<
    Record<string, ItemMasteryRow | undefined>
  >({});
  // Phase 1B (Learn mode) — `cards` becomes a shrinking working queue when
  // `reshuffleWeighted` is on, so the ORIGINAL count is captured separately
  // for a stable `progress.total` (otherwise the bar would shrink as cards
  // get mastered instead of filling up).
  const [originalCount, setOriginalCount] = useState(0);
  const [masteredIds, setMasteredIds] = useState<Set<string>>(new Set());

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
        setMasteryByCard({});
        setSession(null);
        setLoading(false);
        setError(null);
        setCurrentIndex(0);
        setIsFlipped(false);
        setOriginalCount(0);
        setMasteredIds(new Set());
        return;
      }

      setLoading(true);
      setError(null);
      setCurrentIndex(0);
      setIsFlipped(false);
      setMasteredIds(new Set());

      const setRes = await fcService.getSetWithCards(setId);
      if (cancelled) return;
      if (!setRes.data) {
        setSet(null);
        setCards([]);
        setResultsByCard({});
        setMasteryByCard({});
        setError(setRes.error ?? "Failed to load flashcard set");
        setLoading(false);
        return;
      }

      const { set: loadedSet, cards: loadedCards } = setRes.data;
      setSet(loadedSet);
      setCards(loadedCards);
      setOriginalCount(loadedCards.length);

      // Load prior mastery for sidebar/stats display — but do NOT seed
      // resultsByCard. Every card with history has a last_result; counting
      // those as "done" would freeze the progress bar and instantly complete
      // the session (same invariant as useDueReview).
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
          const masterySeed: Record<string, ItemMasteryRow | undefined> = {};
          for (const m of masteryRes.data ?? []) {
            masterySeed[m.item_id] = m;
          }
          setResultsByCard({});
          setMasteryByCard(masterySeed);
        }
      } else {
        setResultsByCard({});
        setMasteryByCard({});
      }

      // Optionally open a session this study tags its attempts with.
      if (withSession) {
        const sessionRes = await studyService.createSession({
          mode,
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
  }, [setId, withSession, mode]);

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

  // Learn mode: once a card is removed from the shrinking `cards` queue
  // (mastered, no reinsertion) the current index can point past the new
  // end — clamp it back onto the last remaining card (or 0 when empty).
  // Synchronizes local index state with an external-to-this-effect array
  // mutation (the grade() below), not a same-render derivation.
  useEffect(() => {
    if (!reshuffleWeighted) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCurrentIndex((idx) => clampIndex(idx, cards.length));
  }, [cards.length, reshuffleWeighted]);

  const grade = async (
    result: ReviewResult,
    extra?: {
      responseKind?: RecordAttemptInput["responseKind"];
      responseTranscript?: string;
      confidence?: number;
    },
  ): Promise<ItemMasteryRow | null> => {
    const card = cards[currentIndex];
    if (!card) return null;

    setGrading(true);
    try {
      const res = await studyService.recordAttempt({
        itemType: FC_CARD_ITEM_TYPE,
        itemId: card.id,
        method: mode,
        result,
        responseKind: extra?.responseKind ?? "selected",
        ...(extra?.confidence != null ? { confidence: extra.confidence } : {}),
        ...(extra?.responseTranscript
          ? { responseTranscript: extra.responseTranscript }
          : {}),
        ...(session ? { sessionId: session.id } : {}),
      });
      if (res.error || !res.data) {
        // Loud recovery: a silently dropped grade leaves the card looking
        // ungraded with zero user signal (worst on matching cards, which
        // self-grade exactly once). Scream, and return null so callers can
        // offer a retry.
        console.error("[useFlashcardStudy] recordAttempt:", res.error);
        toast.error(
          "Couldn't record your grade — check your connection and try again.",
        );
        return null;
      }
      // Reflect the graded result.
      const { mastery } = res.data;
      setResultsByCard((prev) => ({ ...prev, [card.id]: result }));
      setMasteryByCard((prev) => ({
        ...prev,
        [card.id]: mastery,
      }));

      if (reshuffleWeighted) {
        // Learn mode: remove the card from the working queue; a wrong/
        // partial grade reinserts it a few slots ahead instead of at the
        // very end, so it resurfaces soon rather than "never again".
        setCards((prevCards) => {
          const idx = prevCards.findIndex((c) => c.id === card.id);
          if (idx === -1) return prevCards;
          const next = prevCards.slice(0, idx).concat(prevCards.slice(idx + 1));
          if (result !== "correct") {
            const insertAt = Math.min(idx + LEARN_REQUEUE_OFFSET, next.length);
            next.splice(insertAt, 0, card);
          }
          return next;
        });
        if (result === "correct") {
          setMasteredIds((prev) => new Set(prev).add(card.id));
        }
        setIsFlipped(false);
        // currentIndex stays put — the splice already shifted the next card
        // into this slot (or clamps naturally via the render below).
      } else {
        goTo(currentIndex + 1);
      }
      return mastery;
    } catch (e) {
      // Same loud recovery for a thrown write (network drop mid-request).
      console.error("[useFlashcardStudy] recordAttempt threw:", e);
      toast.error(
        "Couldn't record your grade — check your connection and try again.",
      );
      return null;
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

  // Learn mode: "done" is cards MASTERED (graded correct at least once), not
  // merely attempted — a wrong grade keeps a card in the working queue, so
  // counting it as done would complete the session before it's truly over.
  // `total` is pinned to the original set size so the bar fills up instead
  // of shrinking as the queue drains.
  const progress: FlashcardStudyProgress = reshuffleWeighted
    ? {
        done: masteredIds.size,
        total: originalCount,
        correct: masteredIds.size,
      }
    : {
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
    masteryByCard,
    sessionId: session?.id ?? null,
    masteredCount: masteredIds.size,
  };
}
