import * as React from "react";
import { sendEmail } from "./client";
import { renderTemplate } from "./render";
import {
  TaskAssignedEmail,
  CommentAddedEmail,
  MessageReceivedEmail,
  DueDateReminderEmail,
  FeedbackAssignedEmail,
} from "./templates/NotificationEmail";
import { createAdminClient } from "@/utils/supabase/adminClient";
// 🚨 THE ONE HELPER. Every link this file mails goes through it, so the rule that
// decides what an organization-bearing link looks like lives once, in the database,
// where the notice/assist/DM triggers read it too. Never build `?org=` by hand here.
import { linkCarriesItsOrganization } from "@/lib/organizations/linkCarriesItsOrganization";
import type { Database } from "@/types/database.types";

type UserEmailPreferencesRow =
  Database["users"]["Tables"]["user_email_preferences"]["Row"];

/** Fields read when deciding whether to send a notification email. */
type EmailNotificationPreferences = Pick<
  UserEmailPreferencesRow,
  "task_notifications" | "comment_notifications" | "message_notifications"
>;

/**
 * Email Notification Service
 * Handles sending notification emails with preference checking
 */

interface NotificationResult {
  success: boolean;
  message: string;
  skipped?: boolean;
  error?: string;
}

function defaultEmailPreferences(): EmailNotificationPreferences {
  return {
    task_notifications: true,
    comment_notifications: true,
    message_notifications: true,
  };
}

/**
 * Get user's email preferences
 */
async function getUserEmailPreferences(
  userId: string,
): Promise<EmailNotificationPreferences | null> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .schema("users")
      .from("user_email_preferences")
      .select("*")
      .eq("user_id", userId)
      .single();

    if (error) {
      // If no preferences found, return defaults (all enabled except marketing)
      if (error.code === "PGRST116") {
        return defaultEmailPreferences();
      }
      console.error("Error fetching email preferences:", error);
      return null;
    }

    return {
      task_notifications: data.task_notifications,
      comment_notifications: data.comment_notifications,
      message_notifications: data.message_notifications,
    };
  } catch (error) {
    console.error("Exception fetching email preferences:", error);
    return null;
  }
}

/**
 * Get user details (email, name)
 */
async function getUserDetails(
  userId: string,
): Promise<{ email: string; name: string } | null> {
  try {
    const supabase = createAdminClient();

    const { data: authData, error: authError } =
      await supabase.auth.admin.getUserById(userId);

    if (authError) {
      console.error("Error fetching auth user:", authError);
    }

    const user = authData?.user;
    if (!user?.email) {
      return null;
    }

    const { data: profile } = await supabase
      .schema("users")
      .from("profiles")
      .select("display_name")
      .is("deleted_at", null)
      .eq("id", userId)
      .maybeSingle();

    const meta = user.user_metadata;
    const metaFullName =
      meta && typeof meta.full_name === "string" ? meta.full_name : undefined;
    const metaName =
      meta && typeof meta.name === "string" ? meta.name : undefined;

    const name = profile?.display_name || metaFullName || metaName || "User";

    return {
      email: user.email,
      name,
    };
  } catch (error) {
    console.error("Error fetching user details:", error);
    return null;
  }
}

/**
 * Send task assignment notification email
 */
export async function sendTaskAssignmentEmail(options: {
  assigneeId: string;
  assignerName: string;
  taskTitle: string;
  taskId: string;
  taskDescription?: string;
}): Promise<NotificationResult> {
  const { assigneeId, assignerName, taskTitle, taskId, taskDescription } =
    options;

  // Check user preferences
  const preferences = await getUserEmailPreferences(assigneeId);
  if (!preferences?.task_notifications) {
    return {
      success: true,
      message: "User has disabled task notifications",
      skipped: true,
    };
  }

  // Get assignee details
  const assignee = await getUserDetails(assigneeId);
  if (!assignee?.email) {
    return { success: false, message: "Could not find assignee email" };
  }

  // Generate task URL
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://aimatrx.com";
  const taskUrl = `${baseUrl}/tasks?task=${taskId}`;

  // Render React Email template
  const html = await renderTemplate(
    React.createElement(TaskAssignedEmail, {
      taskTitle,
      assignerName,
      taskUrl,
      description: taskDescription,
    }),
  );

  // Send email
  const result = await sendEmail({
    to: assignee.email,
    subject: `Task assigned: ${taskTitle}`,
    html,
  });

  if (result.success) {
    return { success: true, message: "Task assignment email sent" };
  }

  return {
    success: false,
    message: "Failed to send task assignment email",
    error:
      result.error instanceof Error
        ? result.error.message
        : String(result.error),
  };
}

/**
 * Send comment notification email
 */
export async function sendCommentNotificationEmail(options: {
  /** The organization the resource is filed under, so the link names it. */
  organizationId?: string | null;
  resourceOwnerId: string;
  commenterName: string;
  commentText: string;
  resourceTitle: string;
  resourceType: "task" | "canvas" | "note";
  resourceId: string;
}): Promise<NotificationResult> {
  const {
    resourceOwnerId,
    commenterName,
    commentText,
    resourceTitle,
    resourceType,
    resourceId,
    organizationId,
  } = options;

  // Check user preferences
  const preferences = await getUserEmailPreferences(resourceOwnerId);
  if (!preferences?.comment_notifications) {
    return {
      success: true,
      message: "User has disabled comment notifications",
      skipped: true,
    };
  }

  // Get resource owner details
  const owner = await getUserDetails(resourceOwnerId);
  if (!owner?.email) {
    return { success: false, message: "Could not find resource owner email" };
  }

  // Generate resource URL. The map holds PATHS, and the link is built exactly once,
  // on the line below, so there is one place where an organization can be forgotten —
  // and it is the line that cannot forget, because the helper is the thing on it.
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://aimatrx.com";
  const resourcePaths: Record<string, string> = {
    task: `/tasks?task=${resourceId}`,
    canvas: `/canvas/${resourceId}`,
    note: `/notes/${resourceId}`,
  };
  const resourceUrl = await linkCarriesItsOrganization(
    `${baseUrl}${resourcePaths[resourceType] || `/${resourceType}/${resourceId}`}`,
    organizationId,
  );

  // Render React Email template
  const html = await renderTemplate(
    React.createElement(CommentAddedEmail, {
      resourceTitle,
      commenterName,
      commentText:
        commentText.length > 200
          ? commentText.substring(0, 200) + "..."
          : commentText,
      resourceUrl,
      resourceType,
    }),
  );

  // Send email
  const result = await sendEmail({
    to: owner.email,
    subject: `New comment on ${resourceType}: ${resourceTitle}`,
    html,
  });

  if (result.success) {
    return { success: true, message: "Comment notification email sent" };
  }

  return {
    success: false,
    message: "Failed to send comment notification email",
    error:
      result.error instanceof Error
        ? result.error.message
        : String(result.error),
  };
}

/**
 * Send message notification email (for offline users)
 */
export async function sendMessageNotificationEmail(options: {
  /** The organization the conversation is filed under, when the caller knows it. */
  organizationId?: string | null;
  recipientId: string;
  senderName: string;
  messagePreview: string;
  conversationId: string;
}): Promise<NotificationResult> {
  const {
    recipientId,
    senderName,
    messagePreview,
    conversationId,
    organizationId,
  } = options;

  // Check user preferences
  const preferences = await getUserEmailPreferences(recipientId);
  if (!preferences?.message_notifications) {
    return {
      success: true,
      message: "User has disabled message notifications",
      skipped: true,
    };
  }

  // Get recipient details
  const recipient = await getUserDetails(recipientId);
  if (!recipient?.email) {
    return { success: false, message: "Could not find recipient email" };
  }

  // Generate conversation URL
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://aimatrx.com";
  // /messages is declared organization-free in platform.organization_free_link_prefixes()
  // — a DM thread is the same thread from whichever organization somebody is working
  // in — so this comes back unchanged today. It goes through the helper anyway: the day
  // that ruling changes, it changes in one place and this link follows.
  const conversationUrl = await linkCarriesItsOrganization(
    `${baseUrl}/messages/${conversationId}`,
    organizationId,
  );

  // Render React Email template
  const html = await renderTemplate(
    React.createElement(MessageReceivedEmail, {
      senderName,
      messagePreview:
        messagePreview.length > 150
          ? messagePreview.substring(0, 150) + "..."
          : messagePreview,
      conversationUrl,
    }),
  );

  // Send email
  const result = await sendEmail({
    to: recipient.email,
    subject: `New message from ${senderName}`,
    html,
  });

  if (result.success) {
    return { success: true, message: "Message notification email sent" };
  }

  return {
    success: false,
    message: "Failed to send message notification email",
    error:
      result.error instanceof Error
        ? result.error.message
        : String(result.error),
  };
}

/**
 * Send due date reminder email
 */
export async function sendDueDateReminderEmail(options: {
  userId: string;
  organizationId: string;
  taskTitle: string;
  taskId: string;
  dueDate: Date;
  urgency: "upcoming" | "due_today" | "overdue";
}): Promise<NotificationResult> {
  const { userId, organizationId, taskTitle, taskId, dueDate, urgency } = options;

  // Check user preferences
  const preferences = await getUserEmailPreferences(userId);
  if (!preferences?.task_notifications) {
    return {
      success: true,
      message: "User has disabled task notifications",
      skipped: true,
    };
  }

  // Get user details
  const user = await getUserDetails(userId);
  if (!user?.email) {
    return { success: false, message: "Could not find user email" };
  }

  // Generate task URL
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://aimatrx.com";
  const taskUrl = await linkCarriesItsOrganization(
    `${baseUrl}/tasks?task=${taskId}`,
    organizationId,
  );

  // Render React Email template
  const dueDateFormatted = dueDate.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const html = await renderTemplate(
    React.createElement(DueDateReminderEmail, {
      taskTitle,
      dueDate: dueDateFormatted,
      taskUrl,
      urgency,
    }),
  );

  const urgencySubjects = {
    upcoming: `Due soon: ${taskTitle}`,
    due_today: `Due today: ${taskTitle}`,
    overdue: `Overdue: ${taskTitle}`,
  };

  // Send email
  const result = await sendEmail({
    to: user.email,
    subject: urgencySubjects[urgency],
    html,
  });

  if (result.success) {
    return { success: true, message: "Due date reminder email sent" };
  }

  return {
    success: false,
    message: "Failed to send due date reminder email",
    error:
      result.error instanceof Error
        ? result.error.message
        : String(result.error),
  };
}

/**
 * Send feedback assignment notification email.
 * Reuses the `task_notifications` preference — a feedback assignment is
 * conceptually the same kind of "you have a new work item" notification.
 */
export async function sendFeedbackAssignmentEmail(options: {
  /** The organization the feedback is filed under, so the link names it. */
  organizationId?: string | null;
  assigneeId: string;
  assignerName: string;
  feedbackId: string;
  feedbackType: "bug" | "feature" | "suggestion" | "other";
  feedbackPreview: string;
  feedbackRoute: string;
  categoryName?: string | null;
}): Promise<NotificationResult> {
  const {
    assigneeId,
    assignerName,
    feedbackId,
    feedbackType,
    feedbackPreview,
    feedbackRoute,
    categoryName,
    organizationId,
  } = options;

  // Check user preferences (reuse task_notifications — same surface)
  const preferences = await getUserEmailPreferences(assigneeId);
  if (!preferences?.task_notifications) {
    return {
      success: true,
      message: "User has disabled task notifications",
      skipped: true,
    };
  }

  const assignee = await getUserDetails(assigneeId);
  if (!assignee?.email) {
    return { success: false, message: "Could not find assignee email" };
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://aimatrx.com";
  const feedbackUrl = await linkCarriesItsOrganization(
    `${baseUrl}/administration/users/feedback?feedback=${feedbackId}`,
    organizationId,
  );

  const preview =
    feedbackPreview.length > 200
      ? feedbackPreview.substring(0, 200) + "..."
      : feedbackPreview;

  const html = await renderTemplate(
    React.createElement(FeedbackAssignedEmail, {
      assignerName,
      feedbackType,
      feedbackPreview: preview,
      feedbackRoute,
      feedbackUrl,
      categoryName: categoryName ?? null,
    }),
  );

  const typeLabel =
    feedbackType === "bug"
      ? "bug"
      : feedbackType === "feature"
        ? "feature request"
        : feedbackType === "suggestion"
          ? "suggestion"
          : "feedback item";

  const result = await sendEmail({
    to: assignee.email,
    subject: `${assignerName} assigned you a ${typeLabel}`,
    html,
  });

  if (result.success) {
    return { success: true, message: "Feedback assignment email sent" };
  }

  return {
    success: false,
    message: "Failed to send feedback assignment email",
    error:
      result.error instanceof Error
        ? result.error.message
        : String(result.error),
  };
}
