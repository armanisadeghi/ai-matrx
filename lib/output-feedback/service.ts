/**
 * Direct-to-Supabase service for `platform.output_feedback`.
 *
 * Per the data-flow law this is a plain UI↔DB operation, so it goes straight
 * through supabase-js — never through the Python server. Writes go through the
 * two SECURITY INVOKER RPCs so the "original is written once" rule and the
 * "a correction must not clobber an explicit verdict" rule live in ONE place
 * (the DB), not in each caller.
 */

import { supabase } from "@/utils/supabase/client";
import { operationFailed } from "@/utils/errors";
import { readAllRows } from "@/lib/supabase/readAllRows";
import type { Database } from "@/types/database.types";
import {
  toOutputFeedbackRecord,
  type OutputFeedbackRecord,
  type OutputFeedbackRow,
  type OutputFeedbackSubject,
  type OutputFeedbackVerdict,
} from "./types";

export interface SaveOutputFeedbackArgs extends OutputFeedbackSubject {
  /** Omit to leave an existing verdict untouched (pure correction capture). */
  verdict?: OutputFeedbackVerdict;
  prose?: string | null;
  /** The agent request that produced the output — the replay-harness handle. */
  requestId?: string | null;
  /** Surfaces-registry name of the UI that captured this. */
  surfaceName?: string | null;
  /** The model's output as produced. Written once, never overwritten. */
  originalContent?: string | null;
  /** What the user changed it to. This is the reference replay ranks against. */
  correctedContent?: string | null;
  /** Where the correction now lives (entity token + id), when it has a home. */
  correctedRefType?: string | null;
  correctedRefId?: string | null;
  organizationId?: string | null;
}

/** Insert-or-update this user's feedback on a subject. Returns the live row. */
export async function saveOutputFeedback(
  args: SaveOutputFeedbackArgs,
): Promise<OutputFeedbackRecord> {
  const { data, error } = await supabase
    .schema("platform")
    .rpc("upsert_output_feedback", {
      p_subject_type: args.subjectType,
      p_subject_id: args.subjectId,
      p_verdict: args.verdict ?? undefined,
      p_prose: args.prose ?? undefined,
      p_request_id: args.requestId ?? undefined,
      p_surface_name: args.surfaceName ?? undefined,
      p_original_content: args.originalContent ?? undefined,
      p_corrected_content: args.correctedContent ?? undefined,
      p_corrected_ref_type: args.correctedRefType ?? undefined,
      p_corrected_ref_id: args.correctedRefId ?? undefined,
      p_organization_id: args.organizationId ?? undefined,
    })
    .returns<OutputFeedbackRow>();

  if (error) {
    throw operationFailed("save your feedback", error);
  }
  if (!data) {
    throw new Error("upsert_output_feedback returned no row");
  }
  return toOutputFeedbackRecord(data);
}

/** Retract this user's feedback on a subject (a real delete, not trash). */
export async function clearOutputFeedback(
  subject: OutputFeedbackSubject,
): Promise<void> {
  const { error } = await supabase
    .schema("platform")
    .rpc("clear_output_feedback", {
      p_subject_type: subject.subjectType,
      p_subject_id: subject.subjectId,
    });
  if (error) {
    throw operationFailed("clear your feedback", error);
  }
}

/**
 * Every feedback row this user has left on the given subjects. Batched — a
 * chat hydrating 200 messages issues ONE query, never one per bar.
 *
 * `readAllRows` because the caller treats the result as complete (a missing
 * row renders as "no verdict", which would be silently wrong).
 */
export async function fetchOutputFeedbackForSubjects(
  subjectType: string,
  subjectIds: string[],
): Promise<OutputFeedbackRecord[]> {
  if (subjectIds.length === 0) return [];
  const rows = await readAllRows<
    Database["platform"]["Tables"]["output_feedback"]["Row"]
  >(
    ({ from, to }) =>
      supabase
        .schema("platform")
        .from("output_feedback")
        .select("*", { count: "exact" })
        .eq("subject_type", subjectType)
        .in("subject_id", subjectIds)
        .is("deleted_at", null)
        .order("id", { ascending: true })
        .range(from, to),
    { label: "platform.output_feedback" },
  );
  return rows.map(toOutputFeedbackRecord);
}
