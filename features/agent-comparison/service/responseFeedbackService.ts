/**
 * responseFeedbackService — user feedback on agent responses.
 *
 * Upsert pattern keyed on (user_id, conversation_id, request_id) so the
 * UI can save partial state (rating only, then add overall, then add
 * rank, then comment) without creating duplicate rows.
 *
 * Columns:
 *   - rating: "up" | "down" | null  — the quick-shorthand thumbs
 *   - overall: 1..5 | null         — the cross-cutting headline score
 *   - rank: integer | null         — uniqueness per (set, rank)
 *                                    enforced at the DB level
 *   - comment: text | null
 *   - metadata.scores: { id: number } — per-metric 1-5 scores
 *
 * The rank uniqueness constraint at the DB rejects races between two
 * clients trying to claim the same rank. UI code should still pre-clear
 * the previous holder via `clearRankForOthers` before claiming.
 */

import { createClient } from "@/utils/supabase/client";

export type FeedbackRating = "up" | "down" | null;

export interface ResponseFeedbackRow {
  id: string;
  user_id: string;
  conversation_id: string;
  request_id: string | null;
  rating: "up" | "down" | null;
  overall: number | null;
  rank: number | null;
  comment: string | null;
  comparison_set_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface SaveFeedbackInput {
  userId: string;
  conversationId: string;
  requestId: string | null;
  rating: FeedbackRating;
  overall?: number | null;
  rank?: number | null;
  comment: string | null;
  comparisonSetId?: string | null;
  metadata?: Record<string, unknown>;
}

const supabase = () => createClient().schema("agent");

export async function fetchLatestFeedback(
  userId: string,
  conversationId: string,
): Promise<ResponseFeedbackRow[]> {
  const { data, error } = await supabase()
    .from("cmp_response_feedback")
    .select("*")
    .eq("user_id", userId)
    .eq("conversation_id", conversationId)
    .order("updated_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as ResponseFeedbackRow[];
}

/**
 * Fetch every feedback row for a comparison set in one shot — used by
 * the runs comparison + rank coordination so the UI knows what every
 * column scored.
 */
export async function fetchFeedbackBySet(
  userId: string,
  comparisonSetId: string,
): Promise<ResponseFeedbackRow[]> {
  const { data, error } = await supabase()
    .from("cmp_response_feedback")
    .select("*")
    .eq("user_id", userId)
    .eq("comparison_set_id", comparisonSetId)
    .order("updated_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as ResponseFeedbackRow[];
}

export async function saveFeedback(
  input: SaveFeedbackInput,
): Promise<ResponseFeedbackRow> {
  const payload = {
    user_id: input.userId,
    conversation_id: input.conversationId,
    request_id: input.requestId,
    rating: input.rating,
    overall: input.overall ?? null,
    rank: input.rank ?? null,
    comment: input.comment,
    comparison_set_id: input.comparisonSetId ?? null,
    metadata: input.metadata ?? {},
  };

  const { data, error } = await supabase()
    .from("cmp_response_feedback")
    .upsert(payload, { onConflict: "user_id,conversation_id,request_id" })
    .select("*")
    .single();

  if (error) throw error;
  return data as ResponseFeedbackRow;
}

/**
 * Clear `rank` on any rows in this comparison set that currently hold it,
 * EXCEPT the one keyed by (conversationId, requestId). Returns the
 * conversationIds that were cleared so the UI can refresh their bars.
 *
 * Used by the rank picker: when the user claims rank N on column A and
 * column B already had it, we clear B so the DB unique index doesn't
 * reject the next save.
 */
export async function clearRankForOthers(args: {
  userId: string;
  comparisonSetId: string;
  rank: number;
  exceptConversationId: string;
  exceptRequestId: string | null;
}): Promise<string[]> {
  let q = supabase()
    .from("cmp_response_feedback")
    .update({ rank: null })
    .eq("user_id", args.userId)
    .eq("comparison_set_id", args.comparisonSetId)
    .eq("rank", args.rank)
    .neq("conversation_id", args.exceptConversationId);

  // If the same conversation has multiple historical rows with the same
  // rank (different request_ids), keep the one we're about to claim.
  if (args.exceptRequestId) {
    q = q.neq("request_id", args.exceptRequestId);
  }

  const { data, error } = await q.select("conversation_id");
  if (error) throw error;
  return (data ?? []).map((r: { conversation_id: string }) => r.conversation_id);
}
