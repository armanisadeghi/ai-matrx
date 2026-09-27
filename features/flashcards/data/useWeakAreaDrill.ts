// features/flashcards/data/useWeakAreaDrill.ts
//
// Phase 3 (Flashcards Competitive Parity Push) — the weak-area drill: the
// learner's worst cards across ALL their sets, worst-first. Mirrors
// `useDueReview` almost exactly (same shared-spine session/grade plumbing,
// same <StudyDeck/> result shape) — the only real difference is the queue
// source: every mastery row filtered by the dashboard's `needsWork` rule
// (struggle_flag or live mastery < 40%) instead of `listDue` (due_at <= now),
// so the drill opens the cards the progress page counts; the queue is re-sorted
// client-side by LIVE (time-decayed) retrievability via
// `currentRetrievability` — the DB snapshot doesn't account for FSRS decay
// since `last_review`, so a true worst-first order can't be a pure SQL ORDER
// BY today.
//
// Grading funnels through the SAME canonical path — `recordAttemptOfflineAware`
// over `studyService.recordAttempt` → study_attempt + item_mastery — stamped
// `method='weak_area'`. The wrapper is what keeps an answer alive when the
// connection dies mid-drill (IC-8); the bare service would drop it.
//
// React Compiler is on: no manual useMemo / useCallback / React.memo.

"use client";

import { useEffect, useRef, useState } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { fcService } from "./fcService";
import { studyService } from "@/features/education/study/service/studyService";
import { recordAttemptOfflineAware } from "@/features/education/study/offline/recordAttemptOffline";
import { toast } from "@/lib/toast";
import { currentRetrievability } from "@/features/education/study/utils/masteryFsrs";
import { needsWork } from "@/features/education/study/analytics/computeAnalytics";
import type { CardWithDetails } from "./types";
import type {
  ItemMasteryRow,
} from "@/features/education/study/types";
import { useLazyStudySession } from "@/features/education/study/hooks/useLazyStudySession";
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
  options: {
    limit?: number;
    /**
     * Drill ONE topic (the raw `fc_card.topic`, as the progress dashboard's
     * topic rows link it): every card the learner has studied in that topic,
     * worst first — not only the globally weakest, so a strong topic still
     * opens a real drill instead of an empty one.
     */
    topic?: string | null;
    /**
     * False while the session has no organization yet: a drill opens a
     * study_session, which is filed under one, so starting now would raise
     * the blocking "Which workspace?" prompt. The surface shows the inline
     * organization notice instead and the drill starts once one is chosen.
     */
    enabled?: boolean;
  } = {},
): UseWeakAreaDrillResult {
  const { limit = 20 } = options;
  const topic = options.topic?.trim() || null;
  const enabled = options.enabled ?? true;

  const [cards, setCards] = useState<CardWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [resultsByCard, setResultsByCard] = useState<
    Record<string, ReviewResult | undefined>
  >({});
  const [grading, setGrading] = useState(false);
  // Whose queue an offline answer joins. Empty only when signed out, and a
  // signed-out learner cannot open a study session at all.
  const userId = useAppSelector(selectUserId) ?? "";
  // The session is written on the FIRST ANSWER, never on open — opening and
  // leaving writes nothing (see useLazyStudySession).
  const lazySession = useLazyStudySession("useWeakAreaDrill");
  const session = lazySession.session;
  const [masteryByCard, setMasteryByCard] = useState<
    Record<string, ItemMasteryRow | undefined>
  >({});

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    void (async () => {
      setLoading(true);
      setError(null);
      lazySession.arm(null);
      setCurrentIndex(0);
      setIsFlipped(false);
      setMasteryByCard({});

      // 1. Candidates: the weak rows (struggling OR low write-time
      //    retrievability) — or, for one topic, every studied card in it.
      // Both read every mastery row: the weak set is the dashboard's own
      // "needs work" rule over LIVE (decayed) mastery, never the write-time
      // retrievability snapshot, which found 2 cards while the dashboard
      // counted dozens.
      const weakRes = await studyService.listAllMastery();
      if (cancelled) return;
      if (weakRes.error) {
        setError(weakRes.error);
        setCards([]);
        setResultsByCard({});
        setLoading(false);
        return;
      }
      let candidates = weakRes.data ?? [];
      if (topic) {
        const fcRows = candidates.filter(
          (m) => m.item_type === FC_CARD_ITEM_TYPE,
        );
        const topicsRes = await fcService.getTopicsForCardIds(
          fcRows.map((m) => m.item_id),
        );
        if (cancelled) return;
        if (topicsRes.error) {
          setError(topicsRes.error);
          setCards([]);
          setResultsByCard({});
          setLoading(false);
          return;
        }
        const topics = topicsRes.data ?? {};
        candidates = fcRows.filter(
          (m) => topics[m.item_id]?.trim() === topic,
        );
      } else {
        const now = new Date();
        candidates = candidates.filter(
          (m) => m.item_type === FC_CARD_ITEM_TYPE && needsWork(m, now),
        );
      }

      // 2. Re-rank by LIVE (decayed) retrievability, worst first, then cap.
      const now = new Date();
      const ranked = [...candidates].sort((a, b) => {
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

      // 4. Arm (never write) the weak_area session tagging every attempt —
      //    the first answer opens it, so opening and leaving writes nothing.
      if (!cancelled) {
        lazySession.arm(() =>
          studyService.createSession({
            mode: STUDY_MODE,
            sourceKind: "weak_area",
            ...(topic ? { sourceQuery: { topic } } : {}),
          }),
        );
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [limit, topic, enabled]);

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
      // The first answer opens the session (once); later answers share it.
      const openSession = await lazySession.ensure();
      // Offline-aware: with no connection the OBSERVATION is queued and
      // replayed idempotently on reconnect (IC-8), instead of the answer being
      // lost. Online this is exactly `studyService.recordAttempt`.
      const res = await recordAttemptOfflineAware({
        userId,
        itemType: FC_CARD_ITEM_TYPE,
        itemId: card.id,
        method: STUDY_MODE,
        result,
        responseKind: "selected",
        ...(extra?.confidence != null ? { confidence: extra.confidence } : {}),
        ...(openSession ? { sessionId: openSession.id } : {}),
      });
      if (res.error) {
        console.error("[useWeakAreaDrill] recordAttempt:", res.error);
        toast.error(
          "Couldn't record your grade — check your connection and try again.",
        );
        return null;
      }
      if (res.queued) {
        toast.success("Saved offline — this syncs when you reconnect.");
      }
      // `mastery` is null for a queued attempt: the server computes it at flush
      // time, so the card keeps its prior mastery rather than showing an
      // invented one. The card still advances — the answer IS captured.
      const { mastery } = res;
      setResultsByCard((prev) => ({ ...prev, [card.id]: result }));
      if (mastery) {
        setMasteryByCard((prev) => ({ ...prev, [card.id]: mastery }));
      }
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
