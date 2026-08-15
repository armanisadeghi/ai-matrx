/**
 * Output feedback — the platform primitive for "was this AI output good?"
 *
 * One destination: `platform.output_feedback`. Every thumbs button, every
 * "this is wrong" affordance, and every corrected-output capture writes here.
 * See ./FEATURE.md.
 */

import type { Database } from "@/types/database.types";

export type OutputFeedbackRow =
  Database["platform"]["Tables"]["output_feedback"]["Row"];

/**
 * `positive` / `negative` are the thumbs. `mixed` is what a correction with no
 * explicit thumb means: the user rewrote the output, so it was not right as
 * produced, but they did not call it bad either.
 */
export type OutputFeedbackVerdict = "positive" | "negative" | "mixed";

/**
 * What was judged. `subjectType` is a canonical `platform.entity_types.token`
 * (FK-enforced in the DB) — `message` for a chat message, and whichever token
 * a workflow deliverable / artifact surface registers.
 */
export interface OutputFeedbackSubject {
  subjectType: string;
  subjectId: string;
}

export interface OutputFeedbackRecord {
  id: string;
  subjectType: string;
  subjectId: string;
  verdict: OutputFeedbackVerdict;
  prose: string | null;
  requestId: string | null;
  surfaceName: string | null;
  originalContent: string | null;
  correctedContent: string | null;
  correctedAt: string | null;
  createdAt: string;
}

/** Stable cache/store key for a subject. */
export function subjectKey(subject: OutputFeedbackSubject): string {
  return `${subject.subjectType}:${subject.subjectId}`;
}

export function isOutputFeedbackVerdict(
  value: unknown,
): value is OutputFeedbackVerdict {
  return value === "positive" || value === "negative" || value === "mixed";
}

export function toOutputFeedbackRecord(
  row: OutputFeedbackRow,
): OutputFeedbackRecord {
  return {
    id: row.id,
    subjectType: row.subject_type,
    subjectId: row.subject_id,
    verdict: isOutputFeedbackVerdict(row.verdict) ? row.verdict : "mixed",
    prose: row.prose,
    requestId: row.request_id,
    surfaceName: row.surface_name,
    originalContent: row.original_content,
    correctedContent: row.corrected_content,
    correctedAt: row.corrected_at,
    createdAt: row.created_at,
  };
}
