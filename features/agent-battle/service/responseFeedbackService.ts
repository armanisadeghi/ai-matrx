/**
 * responseFeedbackService — user feedback on agent responses.
 *
 * Upsert pattern keyed on (user_id, conversation_id, request_id) so the
 * UI can save partial state (rating only, then rating+comment) without
 * creating duplicate rows.
 */

import { createClient } from "@/utils/supabase/client";

export type FeedbackRating = "up" | "down" | null;

export interface ResponseFeedbackRow {
  id: string;
  user_id: string;
  conversation_id: string;
  request_id: string | null;
  rating: "up" | "down" | null;
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
  comment: string | null;
  comparisonSetId?: string | null;
  /**
   * Free-form structured payload — primarily used to store the multi-metric
   * scores under `metadata.scores: { metric_id: number }`. Lives in the
   * `metadata` jsonb column so we can extend without schema migrations.
   */
  metadata?: Record<string, unknown>;
}

const supabase = () => createClient();

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

export async function saveFeedback(
  input: SaveFeedbackInput,
): Promise<ResponseFeedbackRow> {
  const payload = {
    user_id: input.userId,
    conversation_id: input.conversationId,
    request_id: input.requestId,
    rating: input.rating,
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
