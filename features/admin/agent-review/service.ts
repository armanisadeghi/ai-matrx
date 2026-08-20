import { createClient } from "@/utils/supabase/client";
import { readAllRows } from "@/lib/supabase/readAllRows";
import type {
  ReviewQueueRow,
  ReviewQueueUpdate,
  ReviewStatus,
} from "@/features/admin/agent-review/types";
import { ensureOrgId } from "@/lib/organizations/personalOrg";

/**
 * The board shows a true count per filter value, so the queue is a list treated
 * as COMPLETE — it reads through `readAllRows`, never a bare `.limit()` that
 * would quietly start under-reporting once the queue passes a page.
 */
export async function loadReviewQueue(): Promise<ReviewQueueRow[]> {
  const supabase = createClient();
  return readAllRows<ReviewQueueRow>(
    ({ from, to }) =>
      supabase
        .schema("agent")
        .from("review_queue")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, to),
    { label: "agent.review_queue" },
  );
}

export async function updateReviewQueueRow(
  id: string,
  patch: ReviewQueueUpdate,
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .schema("agent")
    .from("review_queue")
    .update(patch)
    .eq("id", id);

  if (error) throw new Error(error.message);
}

export async function loadReviewQueueItem(
  id: string,
): Promise<ReviewQueueRow | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .schema("agent")
    .from("review_queue")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

/** Append human feedback to the linked DM thread, then move the workflow.
 * Feedback is never overwritten: every round remains an ordered message. */
export async function recordHumanReviewAction({
  row,
  userId,
  content,
  status,
}: {
  row: ReviewQueueRow;
  userId: string;
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
  const { data: conversation, error: conversationError } = await supabase
    .schema("communication")
    .from("dm_conversations")
    .select("organization_id")
    .eq("id", row.conversation_id)
    .single();
  if (conversationError) throw new Error(conversationError.message);
  const organizationId = await ensureOrgId(conversation.organization_id);
  const message =
    trimmed ||
    (status === "approved"
      ? "Approved. Complete the follow-through and archive this review."
      : REVIEW_ACTION_DEFAULTS[status] ?? status);

  const { error: messageError } = await supabase
    .schema("communication")
    .from("dm_messages")
    .insert({
      conversation_id: row.conversation_id,
      sender_id: userId,
      content: message,
      message_type: "text",
      status: "sent",
      client_message_id: `agent-review:${row.id}:${status}:${crypto.randomUUID()}`,
      organization_id: organizationId,
      created_by: userId,
      metadata: {
        actor_kind: "human",
        actor_label: "Arman",
        review_event: status,
        review_queue_id: row.id,
      },
    });
  if (messageError) throw new Error(messageError.message);

  await updateReviewQueueRow(row.id, {
    status,
    feedback: trimmed || null,
    feedback_at: new Date().toISOString(),
  });
}

const REVIEW_ACTION_DEFAULTS: Partial<Record<ReviewStatus, string>> = {
  archived: "Review completed and archived.",
};
