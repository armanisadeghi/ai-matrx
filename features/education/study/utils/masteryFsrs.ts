// features/education/study/utils/masteryFsrs.ts
//
// Adapter between `education.item_mastery` DB rows and the pure FSRS state
// shape in `lib/srs/fsrs.ts`. The DB persists difficulty/stability/last_review
// (the real, canonical FSRS state); it does NOT persist a trustworthy
// "current" retrievability — that decays continuously with elapsed time, so
// every reader must recompute it fresh from `now()` rather than trust the
// write-time snapshot in `item_mastery.retrievability` / `.mastery_score`
// (see migrations/edu_study_fsrs_scheduler.sql for why those columns are
// snapshot-only).
//
// `reps` is approximated from `attempt_count` (close enough for display/UI —
// the two diverge only for ungraded/skipped attempts, which don't advance the
// scheduler anyway). Items reviewed before this migration have no
// difficulty/stability yet; `toFsrsState` returns null for them, which
// `studyService` treats as "first review" per the plan's explicit decision
// not to backfill box history into FSRS state.

import type { FsrsState } from "@/lib/srs/fsrs";
import { retrievability as fsrsRetrievability } from "@/lib/srs/fsrs";
import type { ItemMasteryRow } from "../types";

/**
 * Convert a mastery row into FSRS state, or null if the item has never been
 * reviewed under the FSRS scheduler (no difficulty/stability recorded yet).
 */
export function masteryToFsrsState(
  mastery: Pick<
    ItemMasteryRow,
    "difficulty" | "stability" | "last_review" | "attempt_count" | "lapses"
  > | null | undefined,
): FsrsState | null {
  if (!mastery || mastery.difficulty == null || mastery.stability == null) {
    return null;
  }
  return {
    difficulty: Number(mastery.difficulty),
    stability: Number(mastery.stability),
    due: mastery.last_review ?? new Date().toISOString(),
    lastReview: mastery.last_review ?? null,
    reps: mastery.attempt_count ?? 0,
    lapses: mastery.lapses ?? 0,
  };
}

/**
 * The learner's CURRENT (decayed) probability of recalling this item, as of
 * `now`. Returns null for items with no FSRS state yet (nothing to decay) —
 * callers should fall back to the legacy `mastery_score` snapshot for those
 * pre-migration rows, never to 0 (that would misrepresent an unreviewed item
 * as "fully forgotten").
 */
export function currentRetrievability(
  mastery: Pick<
    ItemMasteryRow,
    "difficulty" | "stability" | "last_review" | "attempt_count" | "lapses"
  > | null | undefined,
  now: Date = new Date(),
): number | null {
  const state = masteryToFsrsState(mastery);
  if (!state) return null;
  return fsrsRetrievability(state, now);
}

/**
 * Best-effort mastery percentage for display: current FSRS retrievability
 * when available, otherwise the legacy write-time `mastery_score` snapshot
 * (pre-FSRS box-tier rows), otherwise null (never studied).
 */
export function displayMasteryPct(
  mastery: Pick<
    ItemMasteryRow,
    "difficulty" | "stability" | "last_review" | "attempt_count" | "lapses" | "mastery_score"
  > | null | undefined,
  now: Date = new Date(),
): number | null {
  if (!mastery) return null;
  const live = currentRetrievability(mastery, now);
  if (live != null) return live;
  return mastery.mastery_score != null ? Number(mastery.mastery_score) : null;
}
