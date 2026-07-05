// features/flashcards/data/useMatchGame.ts
//
// Phase 1B (Match mode) — a timed click-to-pair matching game over a set's
// cards (front tiles vs back tiles, shuffled onto one board). Click-to-pair
// rather than drag-and-drop: identical interaction on desktop and mobile, no
// custom drag/touch plumbing, same engagement loop as a Quizlet-style
// "Match" game. Capped at MAX_BOARD_CARDS cards per round — a full 40-card
// set as one board is a UX/perf non-starter, not a real constraint.
//
// Each card, once paired, writes ONE study_attempt (method='match',
// result='correct', responseKind='selected') through the SAME canonical
// study spine as every other mode — mismatches are gameplay, not graded
// attempts (this is an engagement mode, not an assessment one).
//
// React Compiler is on: no manual useMemo / useCallback / React.memo.

"use client";

import { useEffect, useState } from "react";
import { fcService } from "./fcService";
import { studyService } from "@/features/education/study/service/studyService";
import type { FcSetRow, CardWithDetails } from "./types";
import type { StudySessionRow } from "@/features/education/study/types";

const FC_CARD_ITEM_TYPE = "fc_card";
const MATCH_MODE = "match";
/** A bigger board just means more scrolling with no extra learning value —
 *  a random subset keeps every round tight and legible on one screen. */
const MAX_BOARD_CARDS = 8;
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

function pickRoundCards(cards: CardWithDetails[]): CardWithDetails[] {
  if (cards.length <= MAX_BOARD_CARDS) return cards;
  return shuffle(cards).slice(0, MAX_BOARD_CARDS);
}

export function useMatchGame(
  options: UseMatchGameOptions = {},
): UseMatchGameResult {
  const { setId, withSession = true } = options;

  const [set, setSet] = useState<FcSetRow | null>(null);
  const [roundCards, setRoundCards] = useState<CardWithDetails[]>([]);
  const [tiles, setTiles] = useState<MatchTile[]>([]);
  const [loading, setLoading] = useState<boolean>(!!setId);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<StudySessionRow | null>(null);
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

  const buildBoard = (cards: CardWithDetails[]): MatchTile[] => {
    const front: MatchTile[] = cards.map((c) => ({
      id: `${c.id}-front`,
      cardId: c.id,
      text: c.front,
      side: "front",
    }));
    const back: MatchTile[] = cards.map((c) => ({
      id: `${c.id}-back`,
      cardId: c.id,
      text: c.back,
      side: "back",
    }));
    return shuffle([...front, ...back]);
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!setId) {
        if (cancelled) return;
        setSet(null);
        setRoundCards([]);
        setTiles([]);
        setSession(null);
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
        setRoundCards([]);
        setTiles([]);
        setError(setRes.error ?? "Failed to load flashcard set");
        setLoading(false);
        return;
      }

      const { set: loadedSet, cards: loadedCards } = setRes.data;
      const round = pickRoundCards(loadedCards);
      setSet(loadedSet);
      setRoundCards(round);
      setTiles(buildBoard(round));

      if (withSession) {
        const sessionRes = await studyService.createSession({
          mode: MATCH_MODE,
          sourceKind: "set",
          sourceSetId: loadedSet.id,
        });
        if (!cancelled) {
          if (sessionRes.error) {
            console.error("[useMatchGame] createSession:", sessionRes.error);
          }
          setSession(sessionRes.data);
        }
      }

      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [setId, withSession, roundKey]);

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
      void studyService
        .recordAttempt({
          itemType: FC_CARD_ITEM_TYPE,
          itemId: cardId,
          method: MATCH_MODE,
          result: "correct",
          responseKind: "selected",
          ...(session ? { sessionId: session.id } : {}),
        })
        .then((res) => {
          if (res.error)
            console.error("[useMatchGame] recordAttempt:", res.error);
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

  const restart = (): void => {
    setRoundKey((k) => k + 1);
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
    selectTile,
    restart,
  };
}
