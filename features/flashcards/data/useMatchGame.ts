// features/flashcards/data/useMatchGame.ts
//
// Phase 1B (Match mode) — a timed click-to-pair matching game over a set's
// cards (front tiles vs back tiles, shuffled onto one board). Click-to-pair
// rather than drag-and-drop: identical interaction on desktop and mobile, no
// custom drag/touch plumbing, same engagement loop as a Quizlet-style
// "Match" game. The learner picks the pairs per round (MATCH_PAIR_COUNT_OPTIONS,
// persisted at `userPreferences.flashcard.matchPairCount`, default 8) and the
// round clamps it to the deck size — a full 40-card set as one board is a
// UX/perf non-starter, not a real constraint.
//
// Each card, once paired, writes ONE study_attempt (method='match',
// result='correct', responseKind='selected') through the SAME canonical
// study spine as every other mode — mismatches are gameplay, not graded
// attempts (this is an engagement mode, not an assessment one).
//
// The write goes through `recordAttemptOfflineAware`, not the bare service.
// Match is the mode that loses the MOST to a dropped connection: a pair
// self-grades exactly once and then leaves the board, so a failed write has no
// card left to retry against — the answer is simply gone. Offline the
// observation is queued and replayed idempotently on reconnect (IC-8).
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
import type { FcSetRow, CardWithDetails } from "./types";
import { useLazyStudySession } from "@/features/education/study/hooks/useLazyStudySession";
import { useSetting } from "@/features/settings/hooks/useSetting";
import { studyFaces } from "../utils/cardVariants";

const FC_CARD_ITEM_TYPE = "fc_card";
const MATCH_MODE = "match";
/** The pair counts a learner can pick for one round. Above 12 a board is just
 *  more scrolling with no extra learning value. */
export const MATCH_PAIR_COUNT_OPTIONS = [4, 6, 8, 10, 12] as const;
export const DEFAULT_MATCH_PAIR_COUNT = 8;
const MATCH_PAIR_COUNT_SETTING = "userPreferences.flashcard.matchPairCount";

/** Pairs the round actually deals: the requested count, clamped to the deck
 *  (a non-number or < 1 falls back to the default). */
export function clampMatchPairCount(requested: unknown, deckSize: number): number {
  const wanted =
    typeof requested === "number" && Number.isFinite(requested) && requested >= 1
      ? Math.floor(requested)
      : DEFAULT_MATCH_PAIR_COUNT;
  return Math.max(0, Math.min(wanted, deckSize));
}

/** The choices offered for a deck: every option smaller than the deck, plus
 *  the whole deck when it fits under the largest option. One choice or none
 *  means there is nothing to pick. */
export function matchPairCountChoices(deckSize: number): number[] {
  const max = MATCH_PAIR_COUNT_OPTIONS[MATCH_PAIR_COUNT_OPTIONS.length - 1];
  const choices: number[] = MATCH_PAIR_COUNT_OPTIONS.filter((n) => n < deckSize);
  if (deckSize > 0 && deckSize <= max) choices.push(deckSize);
  return choices;
}
/** How long a mismatched pair flashes red before clearing (ms). */
const MISMATCH_FLASH_MS = 650;

export interface MatchTile {
  id: string;
  cardId: string;
  text: string;
  side: "front" | "back";
}

export interface UseMatchGameOptions {
  setId?: string | null;
  withSession?: boolean;
  /**
   * False until an organization is chosen — see StudyOrganizationGate. Nothing
   * loads and no `study_session` is written while it is false. Defaults true.
   */
  enabled?: boolean;
}

export interface UseMatchGameResult {
  set: FcSetRow | null;
  loading: boolean;
  error: string | null;
  tiles: MatchTile[];
  selectedTileId: string | null;
  matchedCardIds: Set<string>;
  mismatchTileIds: [string, string] | null;
  /** Total pairing attempts (matches + mismatches) this round. */
  attempts: number;
  elapsedMs: number;
  completed: boolean;
  totalCards: number;
  sessionId: string | null;
  /** Pairs on this board (the saved choice clamped to the deck). */
  pairCount: number;
  /** Pair counts offered for this deck — see matchPairCountChoices. */
  pairCountChoices: number[];
  /** Save the choice for the learner and deal a fresh round with it. */
  setPairCount: (count: number) => void;
  selectTile: (tileId: string) => void;
  restart: () => void;
}

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function pickRoundCards(
  cards: CardWithDetails[],
  requested: unknown,
): CardWithDetails[] {
  const count = clampMatchPairCount(requested, cards.length);
  if (cards.length <= count) return cards;
  return shuffle(cards).slice(0, count);
}

export function useMatchGame(
  options: UseMatchGameOptions = {},
): UseMatchGameResult {
  const { setId, withSession = true, enabled = true } = options;

  const [set, setSet] = useState<FcSetRow | null>(null);
  const [roundCards, setRoundCards] = useState<CardWithDetails[]>([]);
  const [tiles, setTiles] = useState<MatchTile[]>([]);
  const [loading, setLoading] = useState<boolean>(!!setId);
  const [error, setError] = useState<string | null>(null);
  // Whose queue an offline answer joins. Empty only when signed out, and a
  // signed-out learner cannot open a study session at all.
  const userId = useAppSelector(selectUserId) ?? "";
  // The session is written on the FIRST ANSWER, never on open — opening and
  // leaving writes nothing (see useLazyStudySession).
  const lazySession = useLazyStudySession("useMatchGame");
  const session = lazySession.session;
  /** One "saved offline" notice per round — see the grade write below. */
  const offlineNoticeShown = useRef(false);
  const [selectedTileId, setSelectedTileId] = useState<string | null>(null);
  const [matchedCardIds, setMatchedCardIds] = useState<Set<string>>(new Set());
  const [mismatchTileIds, setMismatchTileIds] = useState<
    [string, string] | null
  >(null);
  const [attempts, setAttempts] = useState(0);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [roundKey, setRoundKey] = useState(0);
  const [deckCards, setDeckCards] = useState<CardWithDetails[]>([]);
  // The learner's saved pair count (durable user preference, synced across
  // devices). Read through a ref by the loader so a change never refetches.
  const [savedPairCount, setSavedPairCount] = useSetting<number>(
    MATCH_PAIR_COUNT_SETTING,
  );
  const pairCountRef = useRef<unknown>(savedPairCount);
  useEffect(() => {
    pairCountRef.current = savedPairCount;
  }, [savedPairCount]);

  // Faces come through studyFaces — the same bridge the flip card uses — so a
  // cloze or formula card shows its study faces, never raw markup.
  const buildBoard = (cards: CardWithDetails[]): MatchTile[] => {
    const faces = cards.map((c) => ({ id: c.id, ...studyFaces(c) }));
    const front: MatchTile[] = faces.map((f) => ({
      id: `${f.id}-front`,
      cardId: f.id,
      text: f.front,
      side: "front",
    }));
    const back: MatchTile[] = faces.map((f) => ({
      id: `${f.id}-back`,
      cardId: f.id,
      text: f.back,
      side: "back",
    }));
    return shuffle([...front, ...back]);
  };

  /** Reset every per-round field. Called from event handlers and the loader's
   *  async continuation, never synchronously in an effect body. */
  const resetRoundState = (): void => {
    setSelectedTileId(null);
    setMatchedCardIds(new Set());
    setMismatchTileIds(null);
    setAttempts(0);
    setStartedAt(null);
    setElapsedMs(0);
    setCompleted(false);
  };

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void (async () => {
      if (!setId) {
        if (cancelled) return;
        setSet(null);
        setDeckCards([]);
        setRoundCards([]);
        setTiles([]);
        lazySession.arm(null);
        setLoading(false);
        setError(null);
        return;
      }

      setLoading(true);
      setError(null);
      setSelectedTileId(null);
      setMatchedCardIds(new Set());
      setMismatchTileIds(null);
      setAttempts(0);
      setStartedAt(null);
      setElapsedMs(0);
      setCompleted(false);

      const setRes = await fcService.getSetWithCards(setId);
      if (cancelled) return;
      if (!setRes.data) {
        setSet(null);
        setDeckCards([]);
        setRoundCards([]);
        setTiles([]);
        setError(setRes.error ?? "Failed to load flashcard set");
        setLoading(false);
        return;
      }

      const { set: loadedSet, cards: loadedCards } = setRes.data;
      const round = pickRoundCards(loadedCards, pairCountRef.current);
      setSet(loadedSet);
      setDeckCards(loadedCards);
      setRoundCards(round);
      setTiles(buildBoard(round));

      // Armed, never written: the first match opens it.
      if (!cancelled) {
        lazySession.arm(
          withSession
            ? () =>
                studyService.createSession({
                  mode: MATCH_MODE,
                  sourceKind: "set",
                  sourceSetId: loadedSet.id,
                  // Filed under the DECK's own organization, never the active one.
                  orgId: loadedSet.organization_id,
                })
            : null,
        );
      }

      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [setId, withSession, roundKey, enabled]);

  // Live elapsed-time ticker, stopped once the round completes.
  useEffect(() => {
    if (startedAt === null || completed) return undefined;
    const id = window.setInterval(() => {
      setElapsedMs(Date.now() - startedAt);
    }, 250);
    return () => window.clearInterval(id);
  }, [startedAt, completed]);

  const selectTile = (tileId: string): void => {
    const tile = tiles.find((t) => t.id === tileId);
    if (!tile || matchedCardIds.has(tile.cardId) || mismatchTileIds) return;

    if (startedAt === null) setStartedAt(Date.now());

    if (!selectedTileId) {
      setSelectedTileId(tileId);
      return;
    }
    if (selectedTileId === tileId) {
      setSelectedTileId(null);
      return;
    }

    const first = tiles.find((t) => t.id === selectedTileId);
    if (!first) {
      setSelectedTileId(tileId);
      return;
    }

    // Same side re-selection (browsing fronts, say) — swap, no penalty.
    if (first.side === tile.side) {
      setSelectedTileId(tileId);
      return;
    }

    setAttempts((a) => a + 1);

    if (first.cardId === tile.cardId) {
      // Match.
      const cardId = tile.cardId;
      setMatchedCardIds((prev) => new Set(prev).add(cardId));
      setSelectedTileId(null);
      void lazySession
        .ensure()
        .then((openSession) =>
          recordAttemptOfflineAware({
            userId,
            itemType: FC_CARD_ITEM_TYPE,
            itemId: cardId,
            method: MATCH_MODE,
            result: "correct",
            responseKind: "selected",
            ...(openSession ? { sessionId: openSession.id } : {}),
          }),
        )
        .then((res) => {
        if (res.error) {
          console.error("[useMatchGame] recordAttempt:", res.error);
          toast.error("Couldn't record that match — it wasn't saved.");
          return;
        }
        // One toast per round, not one per pair: an 8-card board offline would
        // otherwise stack eight identical toasts over the game.
        if (res.queued && !offlineNoticeShown.current) {
          offlineNoticeShown.current = true;
          toast.success("Saved offline — this syncs when you reconnect.");
        }
      });
    } else {
      // Mismatch — flash both tiles, then clear.
      setMismatchTileIds([selectedTileId, tileId]);
      window.setTimeout(() => {
        setMismatchTileIds(null);
        setSelectedTileId(null);
      }, MISMATCH_FLASH_MS);
    }
  };

  // `completed` is a one-way latch for the round (stops the timer, flips the
  // board to the summary) — not a pure derivation, so a synchronizing effect
  // is correct here.
  useEffect(() => {
    if (
      roundCards.length > 0 &&
      matchedCardIds.size >= roundCards.length &&
      !completed
    ) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCompleted(true);
    }
  }, [matchedCardIds.size, roundCards.length, completed]);

  // ── Terminal-first session close (WP8). Match used to create a session and
  //    never close it, leaving it 'active' until the 6h reaper. `completed` is
  //    the round latch above, so the session closes the moment the board is
  //    cleared — before the summary renders.
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
    if (!ref || ref.closed || !session || !completed) return;
    ref.closed = true;
    void studyService.updateSession(session.id, {
      status: "completed",
      ended_at: new Date().toISOString(),
    });
  }, [session, completed]);

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

  const restart = (): void => {
    offlineNoticeShown.current = false;
    setRoundKey((k) => k + 1);
  };

  // A new pair count deals a fresh round from the already-loaded deck — no
  // refetch, no loader flash. Mid-round the armed session is kept (it is
  // written on the first match). After a cleared board that session is
  // already closed, so the new round goes through restart, which arms a new one.
  const setPairCount = (count: number): void => {
    setSavedPairCount(count);
    pairCountRef.current = count;
    if (completed) {
      restart();
      return;
    }
    if (deckCards.length === 0) return;
    offlineNoticeShown.current = false;
    resetRoundState();
    const round = pickRoundCards(deckCards, count);
    setRoundCards(round);
    setTiles(buildBoard(round));
  };

  return {
    set,
    loading,
    error,
    tiles,
    selectedTileId,
    matchedCardIds,
    mismatchTileIds,
    attempts,
    elapsedMs,
    completed,
    totalCards: roundCards.length,
    sessionId: session?.id ?? null,
    pairCount: roundCards.length,
    pairCountChoices: matchPairCountChoices(deckCards.length),
    setPairCount,
    selectTile,
    restart,
  };
}
