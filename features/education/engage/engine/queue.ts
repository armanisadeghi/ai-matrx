// features/education/engage/engine/queue.ts
//
// PURE per-player SRS-biased question queue — THE innovation no rival game has.
// Generalizes useDueReview's selection logic to the game context: instead of
// "only what's due", it builds a full-length round that BIASES toward each
// player's due/weak items while still including fresh items so a game is always
// long enough. Deterministic given (cards, mastery, now, seed) — no I/O.
//
// Priority tiers (highest first):
//   1. DUE now  (item_mastery.due_at <= now)
//   2. STRUGGLING (struggle_flag)
//   3. WEAK      (current retrievability < 0.7)
//   4. UNSEEN    (no mastery row — new material)
//   5. KNOWN     (everything else)
// Within a tier, order is a seeded shuffle so rounds vary without losing bias.

import type { ItemMasteryRow } from "@/features/education/study/types";
import type { CardWithDetails } from "@/features/flashcards/data/types";
import { currentRetrievability } from "@/features/education/study/utils/masteryFsrs";
import type { GameQuestion } from "../types";

const WEAK_RETRIEVABILITY = 0.7;
/** Distractor count per multiple-choice question (total choices = this + 1). */
const DISTRACTORS = 3;

interface Prioritized {
  card: CardWithDetails;
  tier: number;
  isDue: boolean;
}

/** A tiny deterministic PRNG (mulberry32) so shuffles are seedable + testable. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededShuffle<T>(arr: T[], rnd: () => number): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function priorityTier(
  mastery: ItemMasteryRow | undefined,
  now: Date,
): { tier: number; isDue: boolean } {
  if (!mastery) return { tier: 4, isDue: false }; // unseen
  const due =
    mastery.due_at != null && new Date(mastery.due_at).getTime() <= now.getTime();
  if (due) return { tier: 1, isDue: true };
  if (mastery.struggle_flag) return { tier: 2, isDue: false };
  const r = currentRetrievability(mastery, now);
  if (r != null && r < WEAK_RETRIEVABILITY) return { tier: 3, isDue: false };
  return { tier: 5, isDue: false };
}

/** Only cards with a non-empty front + back can become MC questions. */
function isPlayable(card: CardWithDetails): boolean {
  return Boolean(card.front?.trim()) && Boolean(card.back?.trim());
}

export interface BuildQueueOptions {
  /** Max questions in the round. */
  limit?: number;
  /** Seed for the deterministic shuffle (e.g. a per-player numeric hash). */
  seed?: number;
  now?: Date;
}

/**
 * Build the ordered, SRS-biased multiple-choice round for one player.
 * `masteryByCardId` maps fc_card id → the player's mastery row (absent = unseen).
 */
export function buildGameQueue(
  cards: CardWithDetails[],
  masteryByCardId: Record<string, ItemMasteryRow | undefined>,
  options: BuildQueueOptions = {},
): GameQuestion[] {
  const { limit = 20, seed = 1, now = new Date() } = options;
  const rnd = mulberry32(seed);

  const playable = cards.filter(isPlayable);
  if (playable.length < 2) return []; // need at least a card + 1 distractor pool

  const prioritized: Prioritized[] = playable.map((card) => {
    const { tier, isDue } = priorityTier(masteryByCardId[card.id], now);
    return { card, tier, isDue };
  });

  // Group by tier, seed-shuffle within tier, then concatenate tiers in order.
  const byTier = new Map<number, Prioritized[]>();
  for (const p of prioritized) {
    const arr = byTier.get(p.tier) ?? [];
    arr.push(p);
    byTier.set(p.tier, arr);
  }
  const ordered: Prioritized[] = [];
  for (const tier of [1, 2, 3, 4, 5]) {
    const group = byTier.get(tier);
    if (group) ordered.push(...seededShuffle(group, rnd));
  }

  const chosen = ordered.slice(0, limit);
  const backPool = playable.map((c) => c.back);

  return chosen.map((p) => buildQuestion(p.card, p.isDue, backPool, rnd));
}

/** Turn one card into a 4-choice MC question with distractors from the pool. */
function buildQuestion(
  card: CardWithDetails,
  isDue: boolean,
  backPool: string[],
  rnd: () => number,
): GameQuestion {
  const correct = card.back;
  // Distractors: distinct other-card backs, seed-shuffled, deduped vs the answer.
  const distractors: string[] = [];
  const seen = new Set<string>([norm(correct)]);
  for (const b of seededShuffle(backPool, rnd)) {
    const key = norm(b);
    if (seen.has(key)) continue;
    seen.add(key);
    distractors.push(b);
    if (distractors.length >= DISTRACTORS) break;
  }
  const choices = seededShuffle([correct, ...distractors], rnd);
  const correctIndex = choices.findIndex((c) => c === correct);
  return { card, prompt: card.front, choices, correctIndex, isDue };
}

function norm(s: string): string {
  return s.trim().toLowerCase();
}

/** Stable numeric hash of a string (for a per-player deterministic seed). */
export function seedFromString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
