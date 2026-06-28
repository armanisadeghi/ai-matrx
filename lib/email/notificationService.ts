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
import type { Database } from "@/types/database.types";

type UserEmailPreferencesRow =
  Database["users"]["Tables"]["user_email_preferences"]["Row"];

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

function defaultEmailPreferences(userId: string): UserEmailPreferencesRow {
  return {
    id: "",
    user_id: userId,
    feedback_notifications: true,
    sharing_notifications: true,
    organization_invitations: true,
    resource_updates: true,
    marketing_emails: false,
    weekly_digest: true,
    task_notifications: true,
    comment_notifications: true,
    message_notifications: true,
    message_digest: false,
    metadata: {},
    organization_id: null,
    version: 0,
    created_by: null,
    deleted_at: null,
    updated_by: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

/**
 * Get user's email preferences
 */
async function getUserEmailPreferences(
  userId: string,
): Promise<UserEmailPreferencesRow | null> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .schema("users").from("user_email_preferences")
      .select("*")
      .eq("user_id", userId)
      .single();

    if (error) {
      // If no preferences found, return defaults (all enabled except marketing)
      if (error.code === "PGRST116") {
        return defaultEmailPreferences(userId);
      }
      console.error("Error fetching email preferences:", error);
      return null;
    }

    return data;
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
      .schema("users").from("profiles")
      .select("display_name")
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

  // Generate resource URL
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://aimatrx.com";
  const resourceUrls: Record<string, string> = {
    task: `${baseUrl}/tasks?task=${resourceId}`,
    canvas: `${baseUrl}/canvas/${resourceId}`,
    note: `${baseUrl}/notes/${resourceId}`,
  };
  const resourceUrl =
    resourceUrls[resourceType] || `${baseUrl}/${resourceType}/${resourceId}`;

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
  recipientId: string;
  senderName: string;
  messagePreview: string;
  conversationId: string;
}): Promise<NotificationResult> {
  const { recipientId, senderName, messagePreview, conversationId } = options;

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
  const conversationUrl = `${baseUrl}/messages/${conversationId}`;

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
  taskTitle: string;
  taskId: string;
  dueDate: Date;
  urgency: "upcoming" | "due_today" | "overdue";
}): Promise<NotificationResult> {
  const { userId, taskTitle, taskId, dueDate, urgency } = options;

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
  const taskUrl = `${baseUrl}/tasks?task=${taskId}`;

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
  const feedbackUrl = `${baseUrl}/administration/feedback?feedback=${feedbackId}`;

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
