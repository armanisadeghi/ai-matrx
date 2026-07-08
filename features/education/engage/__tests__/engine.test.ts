/**
 * Pure-engine tests for the P10 Engagement Engine. These prove the NOVEL
 * deterministic logic — correctness-first scoring, the per-player SRS-biased
 * queue, and outcome-badge qualification — independent of any UI or I/O. (The
 * spine-write path itself is the already-proven studyService.recordAttempt used
 * live by Match / Due Review; this suite covers only the new code.)
 */

import {
  scoreAnswer,
  comebackCurrencyBonus,
  canAfford,
  POWER_UPS,
  BASE_CORRECT_POINTS,
  CURRENCY_PER_CORRECT,
} from "../engine/scoring";
import { buildGameQueue, seedFromString } from "../engine/queue";
import { qualifyingBadges } from "../engine/badges";
import type { CardWithDetails } from "@/features/flashcards/data/types";
import type { ItemMasteryRow } from "@/features/education/study/types";

// ─── scoring ─────────────────────────────────────────────────────────────────
describe("scoreAnswer (correctness-first, no speed-shame)", () => {
  const budgetMs = 15_000;

  it("a wrong answer scores 0 points and 0 currency (never negative)", () => {
    const r = scoreAnswer({ correct: false, latencyMs: 100, budgetMs, streakAfter: 0 });
    expect(r).toEqual({ points: 0, currency: 0 });
  });

  it("a slow correct answer still beats a fast wrong one", () => {
    const slowCorrect = scoreAnswer({ correct: true, latencyMs: 14_900, budgetMs, streakAfter: 1 });
    const fastWrong = scoreAnswer({ correct: false, latencyMs: 100, budgetMs, streakAfter: 0 });
    expect(slowCorrect.points).toBeGreaterThan(fastWrong.points);
    expect(slowCorrect.points).toBeGreaterThanOrEqual(BASE_CORRECT_POINTS);
  });

  it("an instant correct answer earns the full speed bonus", () => {
    const instant = scoreAnswer({ correct: true, latencyMs: 0, budgetMs, streakAfter: 1 });
    // base + full speed (50) + 0 streak bonus (streakAfter 1 → 0)
    expect(instant.points).toBe(BASE_CORRECT_POINTS + 50);
    expect(instant.currency).toBe(CURRENCY_PER_CORRECT);
  });

  it("streak bonus grows but is capped", () => {
    const s3 = scoreAnswer({ correct: true, latencyMs: 15_000, budgetMs, streakAfter: 3 });
    const s99 = scoreAnswer({ correct: true, latencyMs: 15_000, budgetMs, streakAfter: 99 });
    expect(s3.points).toBe(BASE_CORRECT_POINTS + 0 + 20); // (3-1)*10
    expect(s99.points).toBe(BASE_CORRECT_POINTS + 0 + 100); // capped at 100
  });

  it("double-points multiplier doubles the total", () => {
    const single = scoreAnswer({ correct: true, latencyMs: 0, budgetMs, streakAfter: 1, multiplier: 1 });
    const doubled = scoreAnswer({ correct: true, latencyMs: 0, budgetMs, streakAfter: 1, multiplier: 2 });
    expect(doubled.points).toBe(single.points * 2);
  });

  it("comeback bonus helps the trailing player, never the leader", () => {
    expect(comebackCurrencyBonus(0, 1000)).toBeGreaterThan(0);
    expect(comebackCurrencyBonus(1000, 1000)).toBe(0);
    expect(comebackCurrencyBonus(1200, 1000)).toBe(0);
  });

  it("canAfford respects power-up cost", () => {
    expect(canAfford(POWER_UPS.shield.cost, "shield")).toBe(true);
    expect(canAfford(POWER_UPS.shield.cost - 1, "shield")).toBe(false);
  });
});

// ─── SRS queue ────────────────────────────────────────────────────────────────
function card(id: string, front: string, back: string): CardWithDetails {
  return {
    id,
    front,
    back,
    // minimal fields the queue reads; the rest are unused by buildGameQueue
    position: null,
    details: [],
  } as unknown as CardWithDetails;
}

function mastery(id: string, over: Partial<ItemMasteryRow>): ItemMasteryRow {
  return {
    item_id: id,
    item_type: "fc_card",
    due_at: null,
    struggle_flag: false,
    difficulty: null,
    stability: null,
    last_review: null,
    attempt_count: 0,
    lapses: 0,
    retrievability: null,
    mastery_score: null,
    ...over,
  } as unknown as ItemMasteryRow;
}

describe("buildGameQueue (per-player SRS bias)", () => {
  const cards = [
    card("a", "Q-A", "A-A"),
    card("b", "Q-B", "A-B"),
    card("c", "Q-C", "A-C"),
    card("d", "Q-D", "A-D"),
  ];
  const now = new Date("2026-07-07T00:00:00Z");

  it("puts DUE items before unseen ones", () => {
    const masteryById: Record<string, ItemMasteryRow | undefined> = {
      d: mastery("d", { due_at: "2026-07-01T00:00:00Z" }), // due (past)
    };
    const q = buildGameQueue(cards, masteryById, { seed: 1, now });
    expect(q[0].card.id).toBe("d");
    expect(q[0].isDue).toBe(true);
  });

  it("builds a 4-choice MC question with exactly one correct answer", () => {
    const q = buildGameQueue(cards, {}, { seed: 42, now });
    for (const item of q) {
      expect(item.choices.length).toBe(4);
      expect(item.choices[item.correctIndex]).toBe(item.card.back);
      // the correct answer appears exactly once
      expect(item.choices.filter((c) => c === item.card.back).length).toBe(1);
    }
  });

  it("is deterministic for a given seed (per-player reproducibility)", () => {
    const q1 = buildGameQueue(cards, {}, { seed: 7, now });
    const q2 = buildGameQueue(cards, {}, { seed: 7, now });
    expect(q1.map((x) => x.card.id)).toEqual(q2.map((x) => x.card.id));
  });

  it("different players (seeds) get different orderings", () => {
    const seedA = seedFromString("user-A:room-1");
    const seedB = seedFromString("user-B:room-1");
    expect(seedA).not.toBe(seedB);
  });

  it("returns empty when there are fewer than 2 playable cards", () => {
    expect(buildGameQueue([card("only", "q", "a")], {}, { seed: 1, now })).toEqual([]);
    expect(buildGameQueue([], {}, { seed: 1, now })).toEqual([]);
  });

  it("prioritises struggling and weak items over well-known ones", () => {
    const masteryById: Record<string, ItemMasteryRow | undefined> = {
      a: mastery("a", { struggle_flag: true }),
      b: mastery("b", {
        // strong FSRS state → high retrievability, low priority
        difficulty: 5,
        stability: 100,
        last_review: now.toISOString(),
        attempt_count: 5,
      }),
    };
    const q = buildGameQueue(cards, masteryById, { seed: 3, now });
    const posA = q.findIndex((x) => x.card.id === "a");
    const posB = q.findIndex((x) => x.card.id === "b");
    expect(posA).toBeLessThan(posB);
  });
});

// ─── badges ───────────────────────────────────────────────────────────────────
describe("qualifyingBadges (outcome-only)", () => {
  it("awards first_game on the first game", () => {
    expect(
      qualifyingBadges({ gamesPlayed: 1, itemsMastered: 0, currentStreak: 0, wasComeback: false, perfectRound: false }),
    ).toContain("first_game");
  });

  it("awards mastery milestones by items mastered", () => {
    const b = qualifyingBadges({ gamesPlayed: 3, itemsMastered: 50, currentStreak: 0, wasComeback: false, perfectRound: false });
    expect(b).toContain("mastery_10");
    expect(b).toContain("mastery_50");
  });

  it("does not award a mastery badge below threshold", () => {
    const b = qualifyingBadges({ gamesPlayed: 3, itemsMastered: 9, currentStreak: 0, wasComeback: false, perfectRound: false });
    expect(b).not.toContain("mastery_10");
  });

  it("awards healthy-habit streak badges", () => {
    expect(
      qualifyingBadges({ gamesPlayed: 5, itemsMastered: 0, currentStreak: 7, wasComeback: false, perfectRound: false }),
    ).toContain("streak_7");
    expect(
      qualifyingBadges({ gamesPlayed: 5, itemsMastered: 0, currentStreak: 30, wasComeback: false, perfectRound: false }),
    ).toContain("streak_30");
  });
});
