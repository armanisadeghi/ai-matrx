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

import { useEffect, useRef, useState } from "react";
import { toast } from "@/lib/toast";
import { fcService } from "./fcService";
import { studyService } from "@/features/education/study/service/studyService";
import { recordAttemptOfflineAware } from "@/features/education/study/offline/recordAttemptOffline";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
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
  /** Re-read the card rows (new layers / sub-cards after an in-session
   *  enrich/deepen) without restarting the session or resetting progress.
   *  Optional because cross-set drivers (due review, weak-area drill) have no
   *  single owning set to re-read — they omit it, and StudyDeck hides the
   *  enhance affordance without a setId anyway. */
  refreshCards?: () => Promise<void>;
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
  // Whose attempt — the offline outbox is scoped per user so one device's
  // queue can never flush under another login.
  const userId = useAppSelector(selectUserId) ?? "";
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

  // Render-synced mirrors for `refreshCards`, whose queue rebuild runs AFTER
  // an awaited fetch: reading the closure state there would resurrect
  // anything graded/mastered while the request was in flight (the keyboard
  // still grades while the Enhance dialog is open). The refs are read
  // synchronously after the await, so the rebuild always sees the latest
  // committed session state.
  const cardsRef = useRef(cards);
  const currentIndexRef = useRef(currentIndex);
  const masteredIdsRef = useRef(masteredIds);
  useEffect(() => {
    cardsRef.current = cards;
    currentIndexRef.current = currentIndex;
    masteredIdsRef.current = masteredIds;
  }, [cards, currentIndex, masteredIds]);

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
      // Reset the grade map HERE, before any await — not after the mastery
      // fetch. Otherwise there is a committed render where `cards` is the NEW
      // set but `resultsByCard` still holds the PREVIOUS set's grades, and if
      // the old set had at least as many grades as the new set has cards,
      // `progress.done >= progress.total` is briefly true — which made the
      // completion effect stamp the PREVIOUS session 'completed', fabricating
      // exactly the metric this session-close work exists to make honest.
      // (Reachable on a plain /flashcards/A/study -> /B/study navigation: same
      // dynamic route, no key, so the hook never unmounts.)
      setResultsByCard({});

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

  // Re-read the card rows (details/layers/sub-cards) WITHOUT restarting the
  // session — used after an in-session enrich/deepen so the new material shows
  // immediately. Deliberately NOT the load effect: that would reset progress
  // and open a second study_session for the same sitting.
  //
  // THE SESSION QUEUE IS STATE, NOT A VIEW OF THE SET. Learn mode requeues
  // missed cards and drops mastered ones, so the queue's ORDER and MEMBERSHIP
  // are the session; rebuilding from set order would resurrect mastered cards
  // and teleport the learner off the card they just enriched. So: refresh each
  // queued card's row IN PLACE (new layers/sub-card details show immediately),
  // drop only cards deleted server-side, append genuinely new cards (deepen's
  // sub-cards) at the end, keep the learner anchored on the SAME card, and
  // only GROW the progress denominator — never reset it.
  const refreshCards = async (): Promise<void> => {
    if (!setId) return;
    const res = await fcService.getSetWithCards(setId);
    if (!res.data) return;
    const freshAll = res.data.cards;
    const freshById = new Map(freshAll.map((c) => [c.id, c]));
    // Read the render-synced refs, NOT the closure state — a grade or
    // navigation during the fetch has already committed by the time the
    // await resumes, and everything below runs in one synchronous block so
    // nothing can interleave between the read and the writes.
    const prevQueue = cardsRef.current;
    const mastered = masteredIdsRef.current;
    const currentId = prevQueue[currentIndexRef.current]?.id ?? null;
    const knownIds = new Set(prevQueue.map((c) => c.id));
    for (const id of mastered) knownIds.add(id);
    const added = freshAll.filter((c) => !knownIds.has(c.id));
    const nextQueue = [
      ...prevQueue.flatMap((c) => {
        const fresh = freshById.get(c.id);
        return fresh ? [fresh] : [];
      }),
      ...added,
    ];
    setSet(res.data.set);
    setCards(nextQueue);
    if (added.length > 0) setOriginalCount((n) => n + added.length);
    const anchored = currentId
      ? nextQueue.findIndex((c) => c.id === currentId)
      : -1;
    setCurrentIndex((i) =>
      anchored >= 0 ? anchored : clampIndex(i, nextQueue.length),
    );
  };

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
      // Offline-aware: with no connection the OBSERVATION is queued and
      // replayed idempotently on reconnect (IC-8), instead of the answer being
      // lost. Online this is exactly `studyService.recordAttempt`.
      const res = await recordAttemptOfflineAware({
        userId,
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
      if (res.error) {
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
      if (res.queued) {
        // Saved locally, not yet on the server. Say so once — silence here is
        // what makes a learner redo work they already did.
        toast.success("Saved offline — this syncs when you reconnect.");
      }
      // Reflect the graded result. `mastery` is null for a queued attempt: the
      // server computes it at flush time, so the card keeps its prior mastery
      // rather than showing an invented one.
      const { mastery } = res;
      setResultsByCard((prev) => ({ ...prev, [card.id]: result }));
      if (mastery) {
        setMasteryByCard((prev) => ({
          ...prev,
          [card.id]: mastery,
        }));
      }

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

  // ── Close the session terminal-first. Without this, classic/learn/write
  //    sessions NEVER reached a terminal state by their own action: the live DB
  //    held 142 `classic_review` sessions and ZERO completed ones, so every
  //    session in the most-used study mode was eventually stamped 'abandoned'
  //    by the 6h reaper — making session-level truth (completion rate, duration,
  //    aggregate score) wrong for the primary mode. Mirrors the proven
  //    due-review / weak-area / FastFire close. The reaper stays a backstop for
  //    a hard tab-kill, never the normal path.
  const closeRef = useRef<{ id: string; closed: boolean } | null>(null);
  useEffect(() => {
    closeRef.current = session ? { id: session.id, closed: false } : null;
    // Closing over the latch we just installed: when the session is REPLACED
    // (the learner moved to another set without unmounting), the outgoing
    // session would otherwise be dropped on the floor and leak 'active' until
    // the 6h reaper — the exact defect this close-path exists to remove.
    const outgoing = closeRef.current;
    return () => {
      if (outgoing && !outgoing.closed) {
        outgoing.closed = true;
        void studyService.updateSession(outgoing.id, {
          status: "abandoned",
          ended_at: new Date().toISOString(),
        });
      }
    };
  }, [session]);

  useEffect(() => {
    const ref = closeRef.current;
    if (!ref || ref.closed || !session) return;
    if (progress.total > 0 && progress.done >= progress.total) {
      ref.closed = true;
      void studyService.updateSession(session.id, {
        status: "completed",
        ended_at: new Date().toISOString(),
      });
    }
  }, [session, progress.done, progress.total]);

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
    refreshCards,
  };
}
