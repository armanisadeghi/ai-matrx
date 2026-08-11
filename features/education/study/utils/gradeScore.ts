// features/education/study/utils/gradeScore.ts
//
// THE CANONICAL SHAPE OF A GRADE'S REASONING ON THE STUDY SPINE.
//
// A paid grade persists its REASONING, not just its score. `study_attempt` has
// no dedicated explanation column — the grader's narrative rides in the row's
// `score` jsonb (the same blob that already carries rubric / missing / steps /
// confidence), and `study_record_attempt` accepts it as `p_score`. This module
// is the ONE place that knows the key names, so writers (assessment take,
// grade-work, spoken practice, fast-fire) and the reader (SessionDetailView)
// can never drift apart.
//
// Field contract — keys are stable, callers never hand-write them:
//   feedback      the grader's explanation of WHY (rendered as "Explanation")
//   misconception the named wrong belief the learner appears to hold
//   missing       what a full-credit answer contained and this one didn't
//   rubric        the grader's rubric breakdown (mode-specific shape)
//   steps         per-step breakdown for multi-step / handwritten work

/** The grade-reasoning fields a caller supplies (all optional). */
export interface GradeScoreDetail {
  /** Why the learner got this result — persisted as `score.feedback`. */
  explanation?: string | null;
  /** The named misconception the learner appears to hold, if any. */
  misconception?: string | null;
  missing?: string[] | null;
  rubric?: unknown;
  steps?: unknown[] | null;
  /** Mode-specific extras merged in verbatim (e.g. pronunciation dims). */
  extra?: Record<string, unknown>;
}

/** What a reader gets back out of an attempt's `score` jsonb. */
export interface GradeScoreExtras {
  feedback?: string;
  misconception?: string;
  missing?: string[];
}

const isNonEmpty = (v: unknown): v is string =>
  typeof v === "string" && v.trim().length > 0;

/**
 * Build the `score` jsonb for a graded attempt. Returns null when there is
 * nothing to persist, so callers can spread it conditionally without writing an
 * empty object over a meaningful one.
 */
export function buildGradeScore(
  detail: GradeScoreDetail,
): Record<string, unknown> | null {
  const score: Record<string, unknown> = { ...(detail.extra ?? {}) };
  if (isNonEmpty(detail.explanation)) score.feedback = detail.explanation.trim();
  if (isNonEmpty(detail.misconception)) {
    score.misconception = detail.misconception.trim();
  }
  if (detail.missing && detail.missing.length > 0) score.missing = detail.missing;
  if (detail.rubric != null) score.rubric = detail.rubric;
  if (detail.steps && detail.steps.length > 0) score.steps = detail.steps;
  return Object.keys(score).length > 0 ? score : null;
}

/** Read the grade reasoning back out of an attempt's `score` jsonb. */
export function readGradeScore(score: unknown): GradeScoreExtras {
  if (!score || typeof score !== "object") return {};
  const s = score as Record<string, unknown>;
  return {
    feedback: isNonEmpty(s.feedback) ? s.feedback : undefined,
    misconception: isNonEmpty(s.misconception) ? s.misconception : undefined,
    missing: Array.isArray(s.missing)
      ? s.missing.filter((m): m is string => typeof m === "string")
      : undefined,
  };
}
