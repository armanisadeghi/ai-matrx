// features/education/study/learning-gain/learningGainService.ts
//
// Reads the learning-gain pre/post rows P1 writes and folds them into the
// `LearningGainReport` read model. Defensive: if P1's table isn't live yet
// (missing relation / not in schema cache) it returns `contractPending: true`
// and the report surface falls back to seed fixtures so the UI is real now.
//
// When P1's table lands, set `LEARNING_GAIN_TABLE` + adjust `mapRow` to its
// physical columns — the rest of P5 is already built against this read model.

"use client";

import { supabase } from "@/utils/supabase/client";
import type { StudyResult } from "../types";
import { fail } from "../service/serviceError";
import type {
  LearningGainPair,
  LearningGainReport,
  LearningGainRow,
} from "./types";
import { SEED_LEARNING_GAIN } from "./fixtures";

/**
 * P1's canonical table name (education schema). Unknown until P1 lands it —
 * this is the single reconcile point. Kept null so we NEVER hit a missing
 * relation in prod; flip it to the real name when P1 publishes.
 */
const LEARNING_GAIN_TABLE: string | null = null;

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
   * The current user's learning-gain report. Reads P1's rows when the table is
   * live; otherwise returns a seed-fixture report flagged `contractPending` so
   * the surface can label it honestly (never present fixtures as real gain).
   */
  async getReport(): Promise<StudyResult<LearningGainReport>> {
    if (!LEARNING_GAIN_TABLE) {
      return {
        data: buildReport(SEED_LEARNING_GAIN, {
          contractPending: true,
          isSeed: true,
        }),
        error: null,
      };
    }
    try {
      const { data, error } = await supabase
        .schema("education")
        .from(LEARNING_GAIN_TABLE)
        .select("*")
        .is("deleted_at", null);
      if (error) return fail("learningGain.getReport", error);
      const rows = ((data ?? []) as Record<string, unknown>[]).map(mapRow);
      const isSeed = rows.length === 0;
      return {
        data: buildReport(isSeed ? SEED_LEARNING_GAIN : rows, {
          contractPending: false,
          isSeed,
        }),
        error: null,
      };
    } catch (e) {
      return fail("learningGain.getReport", e);
    }
  },
};

/** Map P1's physical row to the P5 read model. Adjust when P1's table lands. */
function mapRow(raw: Record<string, unknown>): LearningGainRow {
  return {
    id: String(raw.id ?? ""),
    subject: String(raw.subject ?? raw.topic ?? raw.deck_id ?? ""),
    subjectLabel:
      (raw.subject_label as string | null) ??
      (raw.topic as string | null) ??
      null,
    phase: raw.phase === "post" ? "post" : "baseline",
    score: typeof raw.score === "number" ? raw.score : Number(raw.score ?? 0),
    takenAt: String(raw.taken_at ?? raw.created_at ?? ""),
  };
}
