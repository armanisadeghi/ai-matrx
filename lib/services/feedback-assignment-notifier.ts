/**
 * Feedback assignment notifier
 *
 * Tells an admin they were assigned a feedback item, through the notification
 * spine (`feedback.assigned`): email plus the paired DM, sent as the assigner.
 * Called from the `submitFeedback` and `updateFeedback` server actions whenever
 * `assigned_to` becomes a non-null value that differs from the previous value
 * AND is not the actor.
 *
 * Best-effort: a failure here MUST NOT block the underlying feedback
 * insert/update. Errors are logged.
 */

import { createAdminClient } from "@/utils/supabase/adminClient";
import {
  accountEmail,
  legacyEmailOptOut,
  notifyFromSql,
  preview,
} from "@/lib/notifications/notifyFromSql";
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

const TYPE_LABELS: Record<string, string> = {
  bug: "bug",
  feature: "feature request",
  suggestion: "suggestion",
  request: "access request",
};

/**
 * Resolve a category id to its display name (for the notice). Returns
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
 * Notify the newly-assigned admin. The result is for observability only.
 */
export async function notifyFeedbackAssigned(
  options: NotifyOptions,
): Promise<NotifyResult> {
  const { feedback, assignerId, assignerName, previousAssignedTo } = options;
  const newAssigneeId = feedback.assigned_to;

  // No-op conditions
  if (!newAssigneeId) {
    return { dmSent: false, emailSent: false, skipped: true, reason: "no_assignee" };
  }
  if (newAssigneeId === previousAssignedTo) {
    return { dmSent: false, emailSent: false, skipped: true, reason: "unchanged" };
  }
  if (newAssigneeId === assignerId) {
    return { dmSent: false, emailSent: false, skipped: true, reason: "self_assign" };
  }
  // The notice about a feedback item belongs where the feedback item lives, not in the
  // assigner's private workspace (DEFAULT-ORG-4, 2026-09-22).
  if (!feedback.organization_id) {
    return { dmSent: false, emailSent: false, skipped: true, reason: "no_organization" };
  }

  try {
    const admin = createAdminClient();
    const categoryName = await getCategoryName(feedback.category_id);
    const result = await notifyFromSql(admin, {
      organizationId: feedback.organization_id,
      eventKey: "feedback.assigned",
      recipientUserId: newAssigneeId,
      toAddress: await accountEmail(admin, newAssigneeId),
      payload: {
        assigner: { name: assignerName },
        feedback: {
          type_label: TYPE_LABELS[feedback.feedback_type] ?? "feedback item",
          category: categoryName ?? "None",
          route: feedback.route || "—",
          preview: preview(feedback.description, 240),
        },
      },
      deepLink: `/administration/users/feedback?feedback=${feedback.id}`,
      targetKind: "feedback",
      targetId: feedback.id,
      dedupeKey: `feedback.assigned:${feedback.id}:${newAssigneeId}:${feedback.updated_at ?? ""}`,
      dm: { sender_user_id: assignerId },
      // A feedback assignment is the same kind of "you have a new work item" notice
      // as a task, so it has always followed the task email switch.
      optedOut: await legacyEmailOptOut(admin, newAssigneeId, "task_notifications"),
    });
    return {
      dmSent: result.queued.includes("dm"),
      emailSent: result.queued.includes("email"),
      skipped: result.queued.length === 0,
      reason: result.queued.length === 0 ? result.say : undefined,
    };
  } catch (error) {
    console.error("[feedback-assignment-notifier] notice failed:", error);
    return { dmSent: false, emailSent: false, skipped: true, reason: "error" };
  }
}
