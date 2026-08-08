/**
 * Feedback assignment notifier
 *
 * Single helper that fires both in-app DM and email notifications when an
 * admin is assigned a feedback item. Called from the `submitFeedback` and
 * `updateFeedback` server actions whenever `assigned_to` becomes a non-null
 * value that differs from the previous value AND is not the actor.
 *
 * Both DM and email are best-effort: failures here MUST NOT block the
 * underlying feedback insert/update. Errors are logged.
 */

import { createAdminClient } from "@/utils/supabase/adminClient";
import { sendDm } from "@/lib/services/system-dm";
import { sendFeedbackAssignmentEmail } from "@/lib/email/notificationService";
import type { UserFeedback } from "@/types/feedback.types";

interface NotifyOptions {
  /** The feedback item that was just inserted or updated. */
  feedback: UserFeedback;
  /** auth.uid() of the admin who set the assignment. */
  assignerId: string;
  /** Display name for the assigner (falls back to email). */
  assignerName: string;
  /**
   * Previous value of `assigned_to` (null on insert). The helper exits early
   * if the new value matches the previous, is null, or matches the assigner.
   */
  previousAssignedTo: string | null;
}

interface NotifyResult {
  dmSent: boolean;
  emailSent: boolean;
  skipped: boolean;
  reason?: string;
}

/**
 * Compose the in-app message body sent to the assignee. Kept short — full
 * detail is one click away on the admin dashboard.
 */
function buildDmContent(
  feedback: UserFeedback,
  assignerName: string,
  categoryName: string | null,
): string {
  const typeLabel =
    feedback.feedback_type.charAt(0).toUpperCase() +
    feedback.feedback_type.slice(1);
  const preview =
    feedback.description.length > 240
      ? feedback.description.slice(0, 240) + "…"
      : feedback.description;

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://aimatrx.com";
  const url = `${baseUrl}/administration/users/feedback?feedback=${feedback.id}`;

  const categoryLine = categoryName ? `\nCategory: ${categoryName}` : "";

  return `📋 ${assignerName} assigned you a ${typeLabel.toLowerCase()}${categoryLine}
Route: ${feedback.route}

${preview}

Open: ${url}`;
}

/**
 * Resolve a category id to its display name (for the DM/email body). Returns
 * null if not set or not found.
 */
async function getCategoryName(
  categoryId: string | null,
): Promise<string | null> {
  if (!categoryId) return null;
  try {
    const supabase = createAdminClient();
    const { data } = await supabase
      .schema("platform")
      .from("categories")
      .select("name")
      .eq("dimension", "feedback")
      .eq("id", categoryId)
      .maybeSingle();
    return data?.name ?? null;
  } catch {
    return null;
  }
}

/**
 * Notify the newly-assigned admin via DM + email.
 *
 * The result is for observability only — both channels are best-effort.
 */
export async function notifyFeedbackAssigned(
  options: NotifyOptions,
): Promise<NotifyResult> {
  const { feedback, assignerId, assignerName, previousAssignedTo } = options;
  const newAssigneeId = feedback.assigned_to;

  // No-op conditions
  if (!newAssigneeId) {
    return {
      dmSent: false,
      emailSent: false,
      skipped: true,
      reason: "no_assignee",
    };
  }
  if (newAssigneeId === previousAssignedTo) {
    return {
      dmSent: false,
      emailSent: false,
      skipped: true,
      reason: "unchanged",
    };
  }
  if (newAssigneeId === assignerId) {
    return {
      dmSent: false,
      emailSent: false,
      skipped: true,
      reason: "self_assign",
    };
  }

  const categoryName = await getCategoryName(feedback.category_id);

  // Fire DM and email in parallel — best effort.
  const dmContent = buildDmContent(feedback, assignerName, categoryName);
  const [dmResult, emailResult] = await Promise.allSettled([
    sendDm({ senderId: assignerId, recipientId: newAssigneeId, content: dmContent }),
    sendFeedbackAssignmentEmail({
      assigneeId: newAssigneeId,
      assignerName,
      feedbackId: feedback.id,
      feedbackType: feedback.feedback_type,
      feedbackPreview: feedback.description,
      feedbackRoute: feedback.route,
      categoryName,
    }),
  ]);

  let dmSent = false;
  if (dmResult.status === "fulfilled") {
    dmSent = dmResult.value.ok;
    if (!dmSent) {
      console.error(
        "[feedback-assignment-notifier] DM failed:",
        dmResult.value.error,
      );
    }
  } else {
    console.error("[feedback-assignment-notifier] DM threw:", dmResult.reason);
  }

  let emailSent = false;
  if (emailResult.status === "fulfilled") {
    emailSent = emailResult.value.success && !emailResult.value.skipped;
  } else {
    console.error(
      "[feedback-assignment-notifier] Email threw:",
      emailResult.reason,
    );
  }

  return { dmSent, emailSent, skipped: false };
}
