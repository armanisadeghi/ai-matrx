// features/education/engage/data/useGamePlay.ts
//
// THE game engine — the single answer loop both solo arcade and multiplayer
// share. It loads a player's SRS-biased question queue (engine/queue.ts), opens
// a study session (mode='game'), and on every answer funnels through the
// canonical spine writer (studyService.recordAttempt, method='game') so fun
// shows up in mastery. Score is correctness-first (engine/scoring.ts); mastery
// gain is REAL (measured from the FSRS retrievability delta the RPC returns).
//
// Multiplayer differs only by: it waits for the host's start signal, and it
// calls `onScore` to broadcast the mutable scoreboard. The learning loop is
// identical — no forked engine.
//
// React Compiler is on: no manual useMemo / useCallback / React.memo.

"use client";

import { useEffect, useRef, useState } from "react";
import { fcService } from "@/features/flashcards/data/fcService";
import { studyService } from "@/features/education/study/service/studyService";
import { currentRetrievability } from "@/features/education/study/utils/masteryFsrs";
import type { ItemMasteryRow, StudySessionRow } from "@/features/education/study/types";
import type { CardWithDetails } from "@/features/flashcards/data/types";
import { buildGameQueue } from "../engine/queue";
import { scoreAnswer } from "../engine/scoring";
import { POWER_UPS } from "../engine/scoring";
import {
  GAME_ITEM_TYPE,
  GAME_METHOD,
  type GameOutcome,
  type GameQuestion,
  type GameRoomConfig,
  type PowerUpKey,
} from "../types";

export type PlayStatus = "loading" | "ready" | "playing" | "finished" | "error";

export interface UseGamePlayArgs {
  sourceKind: "set" | "due";
  sourceSetId?: string | null;
  sourceTitle?: string | null;
  config: GameRoomConfig;
  mode: "multiplayer" | "solo";
  roomId?: string | null;
  /** Deterministic per-player queue seed (defaults to a random-ish value). */
  seed?: number;
  /** Solo: start on load. Multiplayer: false — call `start()` on the host signal. */
  autoStart?: boolean;
  /**
   * Gate the queue load. Defaults true; multiplayer passes `!!room` so the load
   * (and session creation) waits until the room source is known — avoiding an
   * orphaned 'due' session created against the null-room first render.
   */
  enabled?: boolean;
  /** Multiplayer: broadcast the mutable scoreboard after each answer. */
  onScore?: (fields: {
    score: number;
    correctCount: number;
    answeredCount: number;
    streak: number;
    currency: number;
  }) => void;
  /** Called once when the round finishes with the finalized outcome. */
  onFinish?: (outcome: GameOutcome) => void;
}

export interface UseGamePlayResult {
  status: PlayStatus;
  error: string | null;
  question: GameQuestion | null;
  index: number;
  total: number;
  score: number;
  correctCount: number;
  answeredCount: number;
  streak: number;
  bestStreak: number;
  currency: number;
  masteryGain: number;
  /** ms left in the round (null before start). */
  remainingMs: number | null;
  /** Choice indexes hidden by an active 50/50 (empty otherwise). */
  hiddenChoices: number[];
  /** Power-up armed flags for the current UI. */
  doublePointsArmed: boolean;
  shieldArmed: boolean;
  /** Last answer feedback for the current question, or null before answering. */
  lastAnswer: { correct: boolean; chosenIndex: number } | null;
  start: (atMs?: number) => void;
  answer: (choiceIndex: number) => void;
  buyPowerUp: (key: PowerUpKey) => void;
  sessionId: string | null;
}

export function useGamePlay(args: UseGamePlayArgs): UseGamePlayResult {
  const {
    sourceKind,
    sourceSetId,
    config,
    mode,
    roomId = null,
    autoStart = mode === "solo",
    enabled = true,
    onScore,
    onFinish,
  } = args;

  const [status, setStatus] = useState<PlayStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [questions, setQuestions] = useState<GameQuestion[]>([]);
  const [index, setIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [answeredCount, setAnsweredCount] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [currency, setCurrency] = useState(0);
  const [masteryGain, setMasteryGain] = useState(0);
  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  const [hiddenChoices, setHiddenChoices] = useState<number[]>([]);
  const [doublePointsArmed, setDoublePointsArmed] = useState(false);
  const [shieldArmed, setShieldArmed] = useState(false);
  const [lastAnswer, setLastAnswer] = useState<{ correct: boolean; chosenIndex: number } | null>(null);
  const [session, setSession] = useState<StudySessionRow | null>(null);

  const masteryRef = useRef<Record<string, ItemMasteryRow | undefined>>({});
  const questionShownAt = useRef<number>(0);
  const startedAtRef = useRef<number | null>(null);
  const finishedRef = useRef(false);
  const seedRef = useRef(args.seed ?? Math.floor(Math.random() * 1e9));
  // Authoritative outcome accumulators (refs, not state): the finish report must
  // read final values even though the last recordAttempt resolves async. Mirror
  // the display state below but are the source of truth for the outcome.
  const masteryGainRef = useRef(0);
  const pendingAttemptsRef = useRef<Promise<unknown>[]>([]);

  // ── Load the queue + open a session. ──────────────────────────────────────
  useEffect(() => {
    // Don't load until the caller is ready (multiplayer waits for the room to
    // resolve — otherwise the first render's null-room args would open an
    // orphaned 'due' session and then reload the real queue).
    if (!enabled) return;
    let cancelled = false;
    void (async () => {
      setStatus("loading");
      setError(null);
      finishedRef.current = false;

      let cards: CardWithDetails[] = [];
      let masteryById: Record<string, ItemMasteryRow | undefined> = {};

      if (sourceKind === "set" && sourceSetId) {
        const setRes = await fcService.getSetWithCards(sourceSetId);
        if (cancelled) return;
        if (setRes.error || !setRes.data) {
          setError(setRes.error ?? "Failed to load deck");
          setStatus("error");
          return;
        }
        cards = setRes.data.cards;
        const mRes = await studyService.getMasteryBulk(
          cards.map((c) => ({ itemType: GAME_ITEM_TYPE, itemId: c.id })),
        );
        if (cancelled) return;
        for (const m of mRes.data ?? []) masteryById[m.item_id] = m;
      } else {
        // 'due' — cross-set adaptive queue (mirrors useDueReview).
        const dueRes = await studyService.listDue(GAME_ITEM_TYPE, 100);
        if (cancelled) return;
        if (dueRes.error) {
          setError(dueRes.error);
          setStatus("error");
          return;
        }
        const due = dueRes.data ?? [];
        for (const m of due) masteryById[m.item_id] = m;
        const ids = due.map((m) => m.item_id);
        if (ids.length > 0) {
          const cardsRes = await fcService.getCardsByIds(ids);
          if (cancelled) return;
          cards = cardsRes.data ?? [];
        }
        // If there's nothing due yet, fall back to the largest recent set so the
        // arcade is always playable (loud in dev only — expected for new users).
        if (cards.length < 2) {
          const setsRes = await fcService.listSets();
          const firstSet = (setsRes.data ?? [])[0];
          if (firstSet) {
            const swc = await fcService.getSetWithCards(firstSet.id);
            if (!cancelled && swc.data) {
              cards = swc.data.cards;
              const mRes = await studyService.getMasteryBulk(
                cards.map((c) => ({ itemType: GAME_ITEM_TYPE, itemId: c.id })),
              );
              for (const m of mRes.data ?? []) masteryById[m.item_id] = m;
            }
          }
        }
      }

      if (cancelled) return;
      masteryRef.current = masteryById;
      const queue = buildGameQueue(cards, masteryById, {
        limit: 20,
        seed: seedRef.current,
      });
      if (queue.length === 0) {
        setError("Not enough cards with both sides to build a game (need 2+).");
        setStatus("error");
        return;
      }
      setQuestions(queue);

      const sessRes = await studyService.createSession({
        mode: GAME_METHOD,
        sourceKind: sourceKind === "set" ? "set" : "due",
        ...(sourceSetId ? { sourceSetId } : {}),
        metadata: { engage: true, mode, roomId },
      });
      if (cancelled) return;
      setSession(sessRes.data);
      setStatus("ready");
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, sourceKind, sourceSetId, mode, roomId]);

  // Solo autostart once the queue is ready.
  useEffect(() => {
    if (autoStart && status === "ready") start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart, status]);

  // ── Countdown timer while playing. ────────────────────────────────────────
  useEffect(() => {
    if (status !== "playing" || startedAtRef.current === null) return undefined;
    const id = window.setInterval(() => {
      const elapsed = Date.now() - (startedAtRef.current as number);
      const left = Math.max(0, config.durationMs - elapsed);
      setRemainingMs(left);
      if (left <= 0) finish();
    }, 250);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, config.durationMs]);

  // `atMs` lets a rejoining multiplayer client SYNC to the host's original
  // start time (from game_room.started_at / the game_started broadcast), so its
  // countdown matches everyone else's instead of restarting a full round.
  const start = (atMs?: number): void => {
    if (status !== "ready") return;
    const startAt = atMs ?? Date.now();
    startedAtRef.current = startAt;
    questionShownAt.current = Date.now();
    const elapsed = Date.now() - startAt;
    const left = Math.max(0, config.durationMs - elapsed);
    setRemainingMs(left);
    if (left <= 0) {
      // Joined after the round already ended — go straight to finish.
      setStatus("playing");
      finish();
      return;
    }
    setStatus("playing");
  };

  const advance = (): void => {
    setHiddenChoices([]);
    setLastAnswer(null);
    questionShownAt.current = Date.now();
    setIndex((i) => {
      const next = i + 1;
      if (next >= questions.length) {
        // Ran out of questions before the clock — finish.
        finish();
        return i;
      }
      return next;
    });
  };

  const answer = (choiceIndex: number): void => {
    if (status !== "playing") return;
    const q = questions[index];
    if (!q || lastAnswer) return; // already answered this card

    const now = Date.now();
    const latencyMs = now - questionShownAt.current;
    const correct = choiceIndex === q.correctIndex;

    // Streak: shield saves a wrong answer's streak exactly once.
    let usedShield = false;
    let nextStreak: number;
    if (correct) nextStreak = streak + 1;
    else if (shieldArmed) {
      nextStreak = streak;
      usedShield = true;
    } else nextStreak = 0;

    const delta = scoreAnswer({
      correct,
      latencyMs,
      budgetMs: 15_000,
      streakAfter: nextStreak,
      multiplier: doublePointsArmed ? 2 : 1,
    });

    setLastAnswer({ correct, chosenIndex: choiceIndex });
    setAnsweredCount((n) => n + 1);
    setScore((s) => s + delta.points);
    setCurrency((c) => c + delta.currency);
    setStreak(nextStreak);
    setBestStreak((b) => Math.max(b, nextStreak));
    if (correct) setCorrectCount((n) => n + 1);
    if (doublePointsArmed) setDoublePointsArmed(false);
    if (usedShield) setShieldArmed(false);

    // Record to the spine + measure REAL mastery gain from the FSRS delta.
    // Track the in-flight promise so finish() can await it — otherwise the last
    // answer's gain (→ league standing + badges) is lost to the async race.
    const prior = masteryRef.current[q.card.id];
    const priorR = currentRetrievability(prior) ?? 0;
    const attemptPromise = studyService
      .recordAttempt({
        itemType: GAME_ITEM_TYPE,
        itemId: q.card.id,
        method: GAME_METHOD,
        result: correct ? "correct" : "incorrect",
        responseKind: "selected",
        latencyMs,
        ...(session ? { sessionId: session.id } : {}),
      })
      .then((res) => {
        if (res.error || !res.data) {
          console.error("[useGamePlay] recordAttempt:", res.error);
          return;
        }
        masteryRef.current[q.card.id] = res.data.mastery;
        const newR = res.data.mastery.retrievability != null
          ? Number(res.data.mastery.retrievability)
          : priorR;
        const gain = Math.max(0, newR - priorR);
        if (gain > 0) {
          masteryGainRef.current += gain;
          setMasteryGain((g) => g + gain);
        }
      });
    pendingAttemptsRef.current.push(attemptPromise);

    // Broadcast the new scoreboard (multiplayer).
    if (onScore) {
      onScore({
        score: score + delta.points,
        correctCount: correctCount + (correct ? 1 : 0),
        answeredCount: answeredCount + 1,
        streak: nextStreak,
        currency: currency + delta.currency,
      });
    }

    // Brief reveal, then advance.
    window.setTimeout(advance, 700);
  };

  const buyPowerUp = (key: PowerUpKey): void => {
    if (status !== "playing") return;
    const cost = POWER_UPS[key].cost;
    if (currency < cost) return;
    if (key === "double_points" && doublePointsArmed) return;
    if (key === "shield" && shieldArmed) return;
    if (key === "fifty_fifty" && hiddenChoices.length > 0) return;

    setCurrency((c) => c - cost);
    if (key === "double_points") setDoublePointsArmed(true);
    if (key === "shield") setShieldArmed(true);
    if (key === "fifty_fifty") {
      const q = questions[index];
      if (!q) return;
      const wrong = q.choices
        .map((_, i) => i)
        .filter((i) => i !== q.correctIndex);
      // Hide two wrong choices (deterministic: first two).
      setHiddenChoices(wrong.slice(0, 2));
    }
  };

  // finish() only FLIPS state — the outcome is reported from the effect below,
  // which reads the CURRENT render's accumulated score/mastery (avoids the
  // stale-closure trap where the timer's finish() would capture zeros).
  const finish = (): void => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setStatus("finished");
    setRemainingMs(0);
    if (session) {
      void studyService.updateSession(session.id, {
        status: "completed",
        ended_at: new Date().toISOString(),
      });
    }
  };

  // Report the finalized outcome exactly once, reading live state. Await any
  // in-flight attempt writes first so masteryGain (the headline "real learning"
  // metric that feeds the league + badges) includes the final answer(s).
  const finishReportedRef = useRef(false);
  useEffect(() => {
    if (status !== "finished" || finishReportedRef.current) return;
    finishReportedRef.current = true;
    const outcomeBase = {
      roomId,
      sessionId: session?.id ?? null,
      mode,
      score,
      correctCount,
      answeredCount,
      bestStreak,
      currencyEarned: currency,
      durationMs: startedAtRef.current ? Date.now() - startedAtRef.current : 0,
      sourceKind,
      sourceSetId: sourceSetId ?? null,
      sourceTitle: args.sourceTitle ?? null,
    };
    void Promise.allSettled(pendingAttemptsRef.current).then(() => {
      onFinish?.({ ...outcomeBase, masteryGain: masteryGainRef.current });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  // Close an abandoned session on unmount if we never finished.
  useEffect(() => {
    return () => {
      if (!finishedRef.current && session) {
        void studyService.updateSession(session.id, {
          status: "abandoned",
          ended_at: new Date().toISOString(),
        });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  return {
    status,
    error,
    question: questions[index] ?? null,
    index,
    total: questions.length,
    score,
    correctCount,
    answeredCount,
    streak,
    bestStreak,
    currency,
    masteryGain,
    remainingMs,
    hiddenChoices,
    doublePointsArmed,
    shieldArmed,
    lastAnswer,
    start,
    answer,
    buyPowerUp,
    sessionId: session?.id ?? null,
  };
}
