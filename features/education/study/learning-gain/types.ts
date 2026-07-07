// features/education/study/learning-gain/types.ts
//
// The LEARNING-GAIN read contract (P5 consumes P1). P1 (assessment engine) OWNS
// the write side and the canonical table; P5 only READS pre/post rows and
// renders the delta ("prove it makes you smarter"). Published-day-1 shape from
// the P1 brief: rows keyed (user, topic/deck, phase: baseline|post, score,
// taken_at).
//
// COORDINATION NOTE: until P1 lands its table, `learningGainService` reads
// defensively (missing relation → `contractPending`) and the report renders
// seed fixtures so the UI is real and testable now. When P1's table lands,
// reconcile `LEARNING_GAIN_TABLE` + the row mapping here — nothing else changes.

/** The two measurement phases of a learning-gain measurement. */
export type LearningGainPhase = "baseline" | "post";

/**
 * One measured assessment score at a point in time. This is the read-model P5
 * depends on — P1 maps its physical columns onto this shape (or we adapt the
 * mapping in `learningGainService` when the table lands).
 */
export interface LearningGainRow {
  id: string;
  /** The subject of measurement — a topic label or a deck/assessment id. */
  subject: string;
  /** Human label for the subject (deck title / topic) when available. */
  subjectLabel?: string | null;
  phase: LearningGainPhase;
  /** Normalized score 0..1. */
  score: number;
  takenAt: string; // ISO timestamp
}

/** A baseline→post pair for one subject, with the computed delta. */
export interface LearningGainPair {
  subject: string;
  subjectLabel: string;
  baseline: LearningGainRow;
  post: LearningGainRow;
  /** post.score − baseline.score, in 0..1 (can be negative). */
  delta: number;
  /**
   * Normalized learning gain (Hake's g): (post − pre) / (1 − pre). The standard
   * education-research measure of "how much of what was left to learn did you
   * learn." `null` when baseline was already 1.0 (nothing left to gain).
   */
  normalizedGain: number | null;
}

/** The whole report read model. */
export interface LearningGainReport {
  pairs: LearningGainPair[];
  /** Mean delta across all subjects with a complete pair (0..1). */
  overallDelta: number | null;
  /** Mean normalized gain across subjects where it's defined (0..1). */
  overallNormalizedGain: number | null;
  /** True when the underlying P1 table isn't live yet (fixtures shown). */
  contractPending: boolean;
  /** True when rows are seed fixtures, not the user's real measurements. */
  isSeed: boolean;
}
