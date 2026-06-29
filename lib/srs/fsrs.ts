// lib/srs/fsrs.ts
//
// A PURE, framework-agnostic FSRS (Free Spaced Repetition Scheduler) primitive.
// No app imports, no I/O, no Date.now() side effects (the caller passes `now`):
// every function is deterministic given its inputs, so the whole module is
// trivially unit-testable.
//
// ─── The model (FSRS, simplified FSRS-6 lineage) ─────────────────────────────
// FSRS schedules reviews from three per-item quantities:
//
//   • difficulty  D ∈ [1, 10]  — how hard the item is to retain. Higher D means
//                                stability grows more slowly per review.
//   • stability   S > 0 (days) — the time at which predicted recall has decayed
//                                to the desired retention (0.9). Bigger S ⇒ a
//                                longer next interval.
//   • retrievability R ∈ [0,1] — predicted probability of recall right now,
//                                a function of elapsed time since the last
//                                review and current stability.
//
// On each review the learner gives a rating (Again/Hard/Good/Easy). The first
// review SEEDS D and S from the rating; subsequent reviews UPDATE them: a lapse
// (Again) shrinks stability toward a small "post-lapse" value; a success grows
// stability by a factor that shrinks as D, S, and R grow (you learn less from
// reviewing something you already knew well).
//
// The interval to the next review is the stability scaled so that predicted
// retrievability has decayed to `DESIRED_RETENTION` (0.9):
//     interval_days = S · ln(DESIRED_RETENTION) / ln(0.9)   (= S at 0.9)
// and `due = now + interval_days`.
//
// The weights below are the published FSRS default parameters (w0..w16),
// lightly used here. They are intentionally surfaced as a named constant so a
// future calibration step can replace them per-user/per-deck without touching
// the math. Correctness and tunability over cleverness.
//
// Reference: Jarrett Ye et al., "A Stochastic Shortest Path Algorithm for
// Optimizing Spaced Repetition Scheduling" (FSRS); the open-source `ts-fsrs`
// and `fsrs4anki` projects implement the full FSRS-6 form.

// ─── Public types ─────────────────────────────────────────────────────────────

/** Grade the learner gives a review: 1=Again, 2=Hard, 3=Good, 4=Easy. */
export type FsrsRating = 1 | 2 | 3 | 4;

export interface FsrsState {
  /** Difficulty D ∈ [1, 10]. */
  difficulty: number;
  /** Stability S > 0, in days. */
  stability: number;
  /** ISO timestamp of the next scheduled review (now + interval). */
  due: string;
  /** ISO timestamp of this review, or null before the first review. */
  lastReview: string | null;
  /** Total number of reviews recorded. */
  reps: number;
  /** Number of `Again` lapses recorded. */
  lapses: number;
}

// ─── Tunable model parameters ─────────────────────────────────────────────────

/** Target probability of recall at the moment an item next comes due. */
export const DESIRED_RETENTION = 0.9;

/** Bounds keep difficulty in the model's valid range. */
const MIN_DIFFICULTY = 1;
const MAX_DIFFICULTY = 10;

/** Stability floor so an item never schedules at a sub-minute interval. */
const MIN_STABILITY = 0.1;

/**
 * FSRS default weights (w0..w16). Indices follow the canonical FSRS ordering.
 * w0..w3   — initial stability seeds per first-review rating.
 * w4..w7   — initial difficulty + difficulty update terms.
 * w8..w16  — stability growth (success) and post-lapse stability terms.
 */
const W: readonly number[] = [
  0.4072, 1.1829, 3.1262, 15.4722, // w0..w3  initial stability by rating
  7.2102, 0.5316, 1.0651, 0.0234, //  w4..w7  difficulty
  1.616, 0.1544, 1.0824, 1.9813, //   w8..w11 success stability growth
  0.0953, 0.2975, 2.2042, 0.2407, //  w12..w15 post-lapse + extras
  2.9466, //                          w16
] as const;

const MS_PER_DAY = 86_400_000;

// ─── Result → rating mapping ──────────────────────────────────────────────────

/**
 * Map a coarse study result to an FSRS rating. The study spine records
 * correct/partial/incorrect; FSRS wants Again/Hard/Good/Easy. We map:
 *   incorrect → Again (1), partial → Hard (2), correct → Good (3).
 * (Easy (4) is reserved for explicit learner "too easy" signals, which the
 * coarse result does not carry.)
 */
export function mapResultToRating(result: "correct" | "partial" | "incorrect"): FsrsRating {
  switch (result) {
    case "incorrect":
      return 1;
    case "partial":
      return 2;
    case "correct":
      return 3;
  }
}

// ─── Core math ────────────────────────────────────────────────────────────────

function clampDifficulty(d: number): number {
  return Math.min(MAX_DIFFICULTY, Math.max(MIN_DIFFICULTY, d));
}

/** Initial difficulty after the first review, seeded by its rating. */
function initialDifficulty(rating: FsrsRating): number {
  // D0(g) = w4 − e^(w5·(g−1)) + 1, clamped to [1, 10].
  return clampDifficulty(W[4] - Math.exp(W[5] * (rating - 1)) + 1);
}

/** Initial stability after the first review, seeded by its rating. */
function initialStability(rating: FsrsRating): number {
  // S0(g) = w[g−1]; one of w0..w3.
  return Math.max(MIN_STABILITY, W[rating - 1]);
}

/** Difficulty update on a subsequent review (mean-reverts toward the Easy anchor). */
function nextDifficulty(prevD: number, rating: FsrsRating): number {
  // Linear damping toward D0(Easy), per FSRS-6.
  const deltaD = -W[6] * (rating - 3);
  const dampened = prevD + deltaD * ((10 - prevD) / 9);
  const anchor = initialDifficulty(4); // D0(Easy)
  const reverted = W[7] * anchor + (1 - W[7]) * dampened;
  return clampDifficulty(reverted);
}

/** Stability after a SUCCESS (rating ≥ 2): grows, less so when D/S/R are high. */
function nextStabilitySuccess(d: number, s: number, r: number, rating: FsrsRating): number {
  const hardPenalty = rating === 2 ? W[15] : 1;
  const easyBonus = rating === 4 ? W[16] : 1;
  const growth =
    Math.exp(W[8]) *
    (11 - d) *
    Math.pow(s, -W[9]) *
    (Math.exp(W[10] * (1 - r)) - 1) *
    hardPenalty *
    easyBonus;
  return Math.max(MIN_STABILITY, s * (1 + growth));
}

/** Stability after a LAPSE (rating = 1): collapses toward a small post-lapse value. */
function nextStabilityLapse(d: number, s: number, r: number): number {
  const postLapse =
    W[11] *
    Math.pow(d, -W[12]) *
    (Math.pow(s + 1, W[13]) - 1) *
    Math.exp(W[14] * (1 - r));
  // Never let a lapse increase stability.
  return Math.max(MIN_STABILITY, Math.min(postLapse, s));
}

/**
 * Predicted probability of recall at `now`, given the time elapsed since the
 * last review and current stability. R = (1 + t/(9·S))^(−1), the FSRS power
 * forgetting curve. Before the first review (lastReview === null) recall is 1.
 */
export function retrievability(state: FsrsState, now: Date): number {
  if (!state.lastReview) return 1;
  const elapsedDays = Math.max(0, (now.getTime() - Date.parse(state.lastReview)) / MS_PER_DAY);
  const r = Math.pow(1 + elapsedDays / (9 * state.stability), -1);
  return Math.min(1, Math.max(0, r));
}

/** Days until recall decays to DESIRED_RETENTION, given a stability. */
function intervalDaysFor(stability: number): number {
  // From R = (1 + t/(9S))^(−1) solved for t at R = DESIRED_RETENTION:
  //   t = 9·S·(1/DESIRED_RETENTION − 1)
  const days = 9 * stability * (1 / DESIRED_RETENTION - 1);
  return Math.max(MIN_STABILITY, days);
}

/**
 * Advance the scheduler by one review. `prev` is the item's prior state, or
 * `null` for a brand-new item (first review). `now` is the review timestamp.
 * Returns the next state, including the `due` time for the following review.
 */
export function nextState(prev: FsrsState | null, rating: FsrsRating, now: Date): FsrsState {
  let difficulty: number;
  let stability: number;
  let reps: number;
  let lapses: number;

  if (!prev) {
    // First review — seed D and S from the rating.
    difficulty = initialDifficulty(rating);
    stability = initialStability(rating);
    reps = 1;
    lapses = rating === 1 ? 1 : 0;
  } else {
    const r = retrievability(prev, now);
    difficulty = nextDifficulty(prev.difficulty, rating);
    stability =
      rating === 1
        ? nextStabilityLapse(prev.difficulty, prev.stability, r)
        : nextStabilitySuccess(prev.difficulty, prev.stability, r, rating);
    reps = prev.reps + 1;
    lapses = prev.lapses + (rating === 1 ? 1 : 0);
  }

  const intervalDays = intervalDaysFor(stability);
  const due = new Date(now.getTime() + intervalDays * MS_PER_DAY);

  return {
    difficulty,
    stability,
    due: due.toISOString(),
    lastReview: now.toISOString(),
    reps,
    lapses,
  };
}
