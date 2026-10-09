import { createClient } from "@/utils/supabase/client";
import { tryWriteOne, WriteDidNotLandError } from "@/utils/supabase/writeOne";
import { readAllRows } from "@ai-matrx/data/db";
import { operationFailed } from "@/utils/errors";
import { recordUnavailable } from "@/lib/records/recordUnavailable";
import type {
  ReviewQueueRow,
  ReviewQueueUpdate,
  ReviewStatus,
} from "@/features/admin/agent-review/types";
import { ensureOrgId } from "@/lib/organizations/ensureOrgId";
import { runWithSessionRetry } from "@/lib/supabase/authRetry";
import { browserAdminLaneOpen } from "@/utils/supabase/adminLane";

/**
 * The board shows a true count per filter value, so the queue is a list treated
 * as COMPLETE — it reads through `readAllRows`, never a bare `.limit()` that
 * would quietly start under-reporting once the queue passes a page.
 */
export async function loadReviewQueue(): Promise<ReviewQueueRow[]> {
  const supabase = createClient();
  return readAllRows<ReviewQueueRow>(
    ({ from, to }) =>
      runWithSessionRetry(() =>
        supabase
          .schema("agent")
          .from("review_queue")
          .select("*", { count: "exact" })
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .range(from, to),
      ).then((result) => ({
        data: result.data,
        count:
          "count" in result && typeof result.count === "number"
            ? result.count
            : null,
        error: result.error
          ? { message: result.error.message ?? "Review queue read failed" }
          : null,
      })),
    { label: "agent.review_queue" },
  );
}

export async function updateReviewQueueRow(
  id: string,
  patch: ReviewQueueUpdate,
): Promise<void> {
  const supabase = createClient();
  const { error } = await tryWriteOne(
    supabase
      .schema("agent")
      .from("review_queue")
      .update(patch)
      .eq("id", id)
      .select("id"),
    { action: "save", noun: "review item" },
  );

  if (error) {
    throw error instanceof WriteDidNotLandError ? error : operationFailed("save this review update", error);
  }
}

export async function loadReviewQueueItem(id: string): Promise<ReviewQueueRow> {
  const supabase = createClient();
  const { data, error } = await supabase
    .schema("agent")
    .from("review_queue")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) {
    throw recordUnavailable({
      entity: "review item",
      reason: "unknown",
      recordId: id,
      relation: "agent.review_queue",
    });
  }
  return data;
}

/** Append human feedback to the linked DM thread, then move the workflow.
 * Feedback is never overwritten: every round remains an ordered message. */
export async function recordHumanReviewAction({
  row,
  userId,
  actorLabel,
  content,
  status,
}: {
  row: ReviewQueueRow;
  userId: string;
  /** The signed-in reviewer's own name — stamped on the message, never a fixed one. */
  actorLabel: string;
  content: string;
  status: ReviewStatus;
}): Promise<void> {
  if (!row.conversation_id) {
    throw new Error("This review item has no conversation thread.");
  }
  const trimmed = content.trim();
  if (status === "human_changes_requested" && !trimmed) {
    throw new Error("Tell the agent what should change.");
  }

  const supabase = createClient();
  const message =
    trimmed ||
    (status === "approved"
      ? "Approved. Complete the follow-through and archive this review."
      : (REVIEW_ACTION_DEFAULTS[status] ?? status));
  const clientMessageId = `agent-review:${row.id}:${status}:${crypto.randomUUID()}`;

  if (browserAdminLaneOpen()) {
    // THE ADMIN SEAT. The thread is private to its members, and the admin
    // reading it is usually not one (a refused INSERT, measured 2026-10-08), so
    // the write goes through the lane-gated admin door instead of row security.
    const response = await fetch("/api/admin/agent-review/feedback", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        reviewId: row.id,
        content: message,
        status,
        actorLabel,
        clientMessageId,
      }),
    });
    if (!response.ok) {
      const detail = (await response.json().catch(() => null)) as { error?: string } | null;
      throw operationFailed("send your review feedback", new Error(detail?.error ?? `HTTP ${response.status}`));
    }
  } else {
    const { data: conversation, error: conversationError } = await supabase
      .schema("communication")
      .from("dm_conversations")
      .select("organization_id")
      .eq("id", row.conversation_id)
      .single();
    if (conversationError)
      throw operationFailed("send your review feedback", conversationError);
    const organizationId = await ensureOrgId(conversation.organization_id);
    const { error: messageError } = await supabase
      .schema("communication")
      .from("dm_messages")
      .insert({
        conversation_id: row.conversation_id,
        sender_id: userId,
        content: message,
        message_type: "text",
        status: "sent",
        client_message_id: clientMessageId,
        organization_id: organizationId,
        created_by: userId,
        metadata: {
          actor_kind: "human",
          actor_label: actorLabel,
          review_event: status,
          review_queue_id: row.id,
        },
      });
    if (messageError)
      throw operationFailed("send your review feedback", messageError);
  }

  await updateReviewQueueRow(row.id, {
    status,
    feedback: trimmed || null,
    feedback_at: new Date().toISOString(),
  });
}

const REVIEW_ACTION_DEFAULTS: Partial<Record<ReviewStatus, string>> = {
  archived: "Review completed and archived.",
};
