// features/education/assessment/data/learningGain.ts
//
// ── THE LEARNING-GAIN CONTRACT (P1 → P5), published day 1 ────────────────────
//
// The vision's single most important institutional differentiator: "we don't
// optimize for streaks and screen time; we optimize for the pre/post test
// delta." A learner takes a BASELINE assessment before studying and a POST
// assessment after; the persisted delta proves learning happened.
//
// STORAGE (canonical): `education.assessment_result` rows carry:
//   - phase          : 'baseline' | 'post' (or 'standalone' for a plain taking)
//   - gain_group_id  : links a baseline+post pair (same uuid on both)
//   - topic / source_kind / source_id : what was assessed
//   - score_value    : overall 0..1
//   - created_at     : taken_at
//   - created_by     : the learner (RLS-scoped)
//
// This is the contract P5 reads. It pairs rows by `gain_group_id` (preferred),
// falling back to (topic | source_id) when a group id is absent, and computes
// `delta = post.score_value - baseline.score_value`. P5 must NOT reach into the
// assessment engine's internals — it reads `assessment_result` (or calls
// `assessmentService.listGainResults`) and uses `pairLearningGain` below.

import type { AssessmentResultRow, LearningGainPair } from "./types";

/** A stable key for pairing a baseline with its post when no gain_group_id exists. */
function fallbackKey(r: AssessmentResultRow): string {
  return r.source_id
    ? `src:${r.source_kind ?? ""}:${r.source_id}`
    : `topic:${(r.topic ?? "").toLowerCase().trim()}`;
}

/**
 * Pair baseline/post results into learning-gain deltas. Consumes the rows from
 * `assessmentService.listGainResults()` (phase in baseline/post). Pairs by
 * `gain_group_id` first; for ungrouped rows, matches the earliest unpaired
 * baseline with the latest post sharing a (topic|source) key. A pair with only
 * one side present is returned with `delta: null` (in progress).
 */
export function pairLearningGain(
  results: AssessmentResultRow[],
): LearningGainPair[] {
  const pairs: LearningGainPair[] = [];

  // 1) Grouped pairs (explicit gain_group_id).
  const byGroup = new Map<string, AssessmentResultRow[]>();
  const ungrouped: AssessmentResultRow[] = [];
  for (const r of results) {
    if (r.gain_group_id) {
      const arr = byGroup.get(r.gain_group_id) ?? [];
      arr.push(r);
      byGroup.set(r.gain_group_id, arr);
    } else {
      ungrouped.push(r);
    }
  }
  for (const [groupId, rows] of byGroup) {
    const baseline = pickLatest(rows.filter((r) => r.phase === "baseline"));
    const post = pickLatest(rows.filter((r) => r.phase === "post"));
    pairs.push(makePair(groupId, baseline, post));
  }

  // 2) Ungrouped: match by (topic|source) key, earliest baseline ↔ latest post.
  const keyed = new Map<string, { baselines: AssessmentResultRow[]; posts: AssessmentResultRow[] }>();
  for (const r of ungrouped) {
    const k = fallbackKey(r);
    const bucket = keyed.get(k) ?? { baselines: [], posts: [] };
    if (r.phase === "baseline") bucket.baselines.push(r);
    else if (r.phase === "post") bucket.posts.push(r);
    keyed.set(k, bucket);
  }
  for (const { baselines, posts } of keyed.values()) {
    const baseline = pickEarliest(baselines);
    const post = pickLatest(posts);
    if (baseline || post) pairs.push(makePair(null, baseline, post));
  }

  return pairs;
}

function makePair(
  gainGroupId: string | null,
  baseline: AssessmentResultRow | null,
  post: AssessmentResultRow | null,
): LearningGainPair {
  const ref = post ?? baseline;
  const delta =
    baseline?.score_value != null && post?.score_value != null
      ? Number(post.score_value) - Number(baseline.score_value)
      : null;
  return {
    gainGroupId,
    topic: ref?.topic ?? null,
    sourceKind: ref?.source_kind ?? null,
    sourceId: ref?.source_id ?? null,
    baseline,
    post,
    delta,
  };
}

function pickLatest(rows: AssessmentResultRow[]): AssessmentResultRow | null {
  if (rows.length === 0) return null;
  return rows.reduce((a, b) => (a.created_at >= b.created_at ? a : b));
}
function pickEarliest(rows: AssessmentResultRow[]): AssessmentResultRow | null {
  if (rows.length === 0) return null;
  return rows.reduce((a, b) => (a.created_at <= b.created_at ? a : b));
}

/** A fresh gain_group_id (uuid) linking a baseline to its future post. */
export function newGainGroupId(): string {
  return crypto.randomUUID();
}
