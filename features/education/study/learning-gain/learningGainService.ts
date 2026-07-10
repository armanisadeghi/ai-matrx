// features/education/study/learning-gain/learningGainService.ts
//
// Reads the learning-gain pre/post rows P1 writes (`education.assessment_result`,
// phase in baseline|post) via `assessmentService.listGainResults()` +
// `pairLearningGain` (P1's own contract helpers — see
// features/education/assessment/data/learningGain.ts) and folds them into the
// `LearningGainReport` read model. Falls back to seed fixtures only when the
// user genuinely has no real baseline/post pairs yet, clearly flagged `isSeed`.

"use client";

import { assessmentService } from "@/features/education/assessment/data/assessmentService";
import { pairLearningGain } from "@/features/education/assessment/data/learningGain";
import type { AssessmentResultRow } from "@/features/education/assessment/data/types";
import type { StudyResult } from "../types";
import { fail } from "../service/serviceError";
import type {
  LearningGainPair,
  LearningGainReport,
  LearningGainRow,
} from "./types";
import { SEED_LEARNING_GAIN } from "./fixtures";

/** Adapt one side (baseline or post) of P1's row into the P5 read model. */
function toGainRow(row: AssessmentResultRow): LearningGainRow {
  return {
    id: row.id,
    subject: row.topic ?? row.source_id ?? row.id,
    subjectLabel: row.topic ?? null,
    phase: row.phase === "post" ? "post" : "baseline",
    score: row.score_value != null ? Number(row.score_value) : 0,
    takenAt: row.completed_at ?? row.created_at,
  };
}

/** Hake's normalized gain: (post − pre) / (1 − pre); null when pre is already 1. */
function normalizedGain(pre: number, post: number): number | null {
  if (pre >= 1) return null;
  return (post - pre) / (1 - pre);
}

/** Fold a flat list of rows into subject pairs + overall aggregates. */
export function buildReport(
  rows: LearningGainRow[],
  opts: { contractPending: boolean; isSeed: boolean },
): LearningGainReport {
  const bySubject = new Map<string, LearningGainRow[]>();
  for (const r of rows) {
    const arr = bySubject.get(r.subject) ?? [];
    arr.push(r);
    bySubject.set(r.subject, arr);
  }

  const pairs: LearningGainPair[] = [];
  for (const [subject, subjectRows] of bySubject) {
    // Latest baseline + latest post for the subject.
    const baseline = subjectRows
      .filter((r) => r.phase === "baseline")
      .sort((a, b) => a.takenAt.localeCompare(b.takenAt))[0];
    const post = subjectRows
      .filter((r) => r.phase === "post")
      .sort((a, b) => b.takenAt.localeCompare(a.takenAt))[0];
    if (!baseline || !post) continue;
    pairs.push({
      subject,
      subjectLabel: post.subjectLabel ?? baseline.subjectLabel ?? subject,
      baseline,
      post,
      delta: post.score - baseline.score,
      normalizedGain: normalizedGain(baseline.score, post.score),
    });
  }

  pairs.sort((a, b) => b.delta - a.delta);

  const overallDelta =
    pairs.length > 0
      ? pairs.reduce((s, p) => s + p.delta, 0) / pairs.length
      : null;
  const gainPairs = pairs.filter((p) => p.normalizedGain !== null);
  const overallNormalizedGain =
    gainPairs.length > 0
      ? gainPairs.reduce((s, p) => s + (p.normalizedGain ?? 0), 0) /
        gainPairs.length
      : null;

  return {
    pairs,
    overallDelta,
    overallNormalizedGain,
    contractPending: opts.contractPending,
    isSeed: opts.isSeed,
  };
}

export const learningGainService = {
  /**
   * The current user's learning-gain report. Reads P1's real baseline/post
   * pairs from `education.assessment_result` (RLS-scoped to the caller);
   * falls back to seed fixtures — clearly flagged `isSeed` — only when the
   * user has no complete pair yet, so the UI is real from day one.
   */
  async getReport(): Promise<StudyResult<LearningGainReport>> {
    const { data, error } = await assessmentService.listGainResults();
    if (error) return fail("learningGain.getReport", error);

    const p1Pairs = pairLearningGain(data ?? []).filter(
      (p) => p.baseline && p.post,
    );

    if (p1Pairs.length === 0) {
      return {
        data: buildReport(SEED_LEARNING_GAIN, {
          contractPending: false,
          isSeed: true,
        }),
        error: null,
      };
    }

    const rows: LearningGainRow[] = p1Pairs.flatMap((p) => [
      toGainRow(p.baseline!),
      toGainRow(p.post!),
    ]);
    return {
      data: buildReport(rows, { contractPending: false, isSeed: false }),
      error: null,
    };
  },
};
