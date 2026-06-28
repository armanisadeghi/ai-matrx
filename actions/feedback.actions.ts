"use server";

import { createClient } from "@/utils/supabase/server";
import { checkIsUserAdmin } from "@/utils/supabase/userSessionData";
import { notifyFeedbackAssigned } from "@/lib/services/feedback-assignment-notifier";
import type { Database } from "@/types/database.types";
import {
  CreateFeedbackInput,
  UpdateFeedbackInput,
  UserFeedback,
  FeedbackStatus,
  FeedbackComment,
  FeedbackUserMessage,
  AdminDecision,
  CreateAnnouncementInput,
  UpdateAnnouncementInput,
  SystemAnnouncement,
} from "@/types/feedback.types";
import {
  mapUserFeedbackRow,
  mapUserFeedbackRows,
  mapFeedbackCommentRow,
  mapFeedbackCommentRows,
  mapFeedbackUserMessageRows,
  mapSystemAnnouncementRow,
  mapSystemAnnouncementRows,
  parseFeedbackSummaryPayload,
  parseFeedbackUserMessageJson,
  parseGetTriageBatchResult,
  type FeedbackSummaryData,
  type TriageBatchData,
} from "@/types/feedback-row-mapper";

type UserFeedbackUpdate =
  Database["users"]["Tables"]["user_feedback"]["Update"];

// ============= USER FEEDBACK ACTIONS =============

/**
 * Submit user feedback.
 *
 * The optional `category_id` and `assigned_to` fields are admin-only — they
 * are silently dropped when the caller is not an admin. When `assigned_to`
 * is set to a non-self admin user, a DM + email notification fires
 * post-insert (best-effort, non-blocking).
 */
export async function submitFeedback(
  input: CreateFeedbackInput,
): Promise<{ success: boolean; error?: string; data?: UserFeedback }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: "User not authenticated" };
    }

    // Get user metadata for username
    const username = user.user_metadata?.username || user.email || "Anonymous";

    // Admin-gated extras
    const isAdmin = await checkIsUserAdmin(supabase, user.id);
    const categoryId = isAdmin && input.category_id ? input.category_id : null;
    const assignedTo = isAdmin && input.assigned_to ? input.assigned_to : null;

    const { data, error } = await supabase
      .schema("users").from("user_feedback")
      .insert({
        user_id: user.id,
        username,
        feedback_type: input.feedback_type,
        route: input.route,
        description: input.description,
        image_urls: input.image_urls || null,
        status: "new",
        category_id: categoryId,
        assigned_to: assignedTo,
      })
      .select()
      .single();

    if (error) {
      console.error("Error submitting feedback:", error);
      return { success: false, error: error.message };
    }

    const feedback = mapUserFeedbackRow(data);

    // Best-effort notification fire-and-forget — never block the submit.
    if (assignedTo && assignedTo !== user.id) {
      const assignerName =
        user.user_metadata?.name ||
        user.user_metadata?.full_name ||
        user.email ||
        "An admin";
      // Intentionally not awaited so the user gets their success response fast.
      notifyFeedbackAssigned({
        feedback,
        assignerId: user.id,
        assignerName,
        previousAssignedTo: null,
      }).catch((err) => {
        console.error("[submitFeedback] notifyFeedbackAssigned failed:", err);
      });
    }

    return { success: true, data: feedback };
  } catch (error: unknown) {
    console.error("Error in submitFeedback:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "An unexpected error occurred",
    };
  }
}

/**
 * Get user's own feedback
 */
export async function getUserFeedback(): Promise<{
  success: boolean;
  error?: string;
  data?: UserFeedback[];
}> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: "User not authenticated" };
    }

    const { data, error } = await supabase
      .schema("users").from("user_feedback")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching user feedback:", error);
      return { success: false, error: error.message };
    }

    return { success: true, data: mapUserFeedbackRows(data || []) };
  } catch (error: unknown) {
    console.error("Error in getUserFeedback:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "An unexpected error occurred",
    };
  }
}

/**
 * Update user's own feedback (only allowed when status is 'new')
 */
export async function updateUserOwnFeedback(
  feedbackId: string,
  updates: {
    description?: string;
    feedback_type?: "bug" | "feature" | "suggestion" | "other";
  },
): Promise<{ success: boolean; error?: string; data?: UserFeedback }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: "User not authenticated" };
    }

    // First verify ownership and status
    const { data: existing, error: fetchError } = await supabase
      .schema("users").from("user_feedback")
      .select("id, user_id, status")
      .eq("id", feedbackId)
      .single();

    if (fetchError || !existing) {
      return { success: false, error: "Feedback item not found" };
    }

    if (existing.user_id !== user.id) {
      return { success: false, error: "You can only edit your own feedback" };
    }

    if (existing.status !== "new") {
      return {
        success: false,
        error: "Can only edit feedback that hasn't been picked up yet",
      };
    }

    const { data, error } = await supabase
      .schema("users").from("user_feedback")
      .update({
        ...updates,
      })
      .eq("id", feedbackId)
      .eq("user_id", user.id)
      .select()
      .single();

    if (error) {
      console.error("Error updating own feedback:", error);
      return { success: false, error: error.message };
    }

    return { success: true, data: mapUserFeedbackRow(data) };
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "An unexpected error occurred";
    console.error("Error in updateUserOwnFeedback:", error);
    return { success: false, error: message };
  }
}

// ============= TRIAGE & WORKFLOW ACTIONS =============

/** Triage a feedback item (AI agent pushes analysis to DB) */
export async function triageFeedbackItem(
  feedbackId: string,
  triage: {
    ai_solution_proposal?: string;
    ai_suggested_priority?: string;
    ai_complexity?: string;
    ai_estimated_files?: string[];
    autonomy_score?: number;
    ai_assessment?: string;
  },
): Promise<{ success: boolean; error?: string; data?: UserFeedback }> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("triage_feedback_item", {
      p_id: feedbackId,
      p_ai_solution_proposal: triage.ai_solution_proposal || null,
      p_ai_suggested_priority: triage.ai_suggested_priority || null,
      p_ai_complexity: triage.ai_complexity || null,
      p_ai_estimated_files: triage.ai_estimated_files || null,
      p_autonomy_score: triage.autonomy_score || null,
      p_ai_assessment: triage.ai_assessment || null,
    });
    if (error) return { success: false, error: error.message };
    return { success: true, data: mapUserFeedbackRow(data) };
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "An unexpected error occurred";
    return { success: false, error: message };
  }
}

/** Get the agent work queue (approved items in priority order) */
export async function getAgentWorkQueue(): Promise<{
  success: boolean;
  error?: string;
  data?: UserFeedback[];
}> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_agent_work_queue");
    if (error) return { success: false, error: error.message };
    return { success: true, data: mapUserFeedbackRows(data || []) };
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "An unexpected error occurred";
    return { success: false, error: message };
  }
}

/** Get untriaged feedback items */
export async function getUntriagedFeedback(): Promise<{
  success: boolean;
  error?: string;
  data?: UserFeedback[];
}> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_untriaged_feedback");
    if (error) return { success: false, error: error.message };
    return { success: true, data: mapUserFeedbackRows(data || []) };
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "An unexpected error occurred";
    return { success: false, error: message };
  }
}

/** Get a batch of untriaged items with pipeline context */
export async function getTriageBatch(batchSize: number = 3): Promise<{
  success: boolean;
  error?: string;
  data?: TriageBatchData;
}> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_triage_batch", {
      p_batch_size: batchSize,
    });
    if (error) return { success: false, error: error.message };
    if (data === null) {
      return { success: false, error: "get_triage_batch returned no data" };
    }
    const parsed = parseGetTriageBatchResult(data);
    if (parsed.ok === false) {
      return { success: false, error: parsed.error };
    }
    return { success: true, data: parsed.value };
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "An unexpected error occurred";
    return { success: false, error: message };
  }
}

/** Set admin decision on a feedback item */
export async function setAdminDecision(
  feedbackId: string,
  decision: AdminDecision,
  direction?: string,
  workPriority?: number,
): Promise<{ success: boolean; error?: string; data?: UserFeedback }> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("set_admin_decision", {
      p_id: feedbackId,
      p_decision: decision,
      p_direction: direction || null,
      p_work_priority: workPriority || null,
    });
    if (error) return { success: false, error: error.message };
    if (data === null) {
      return { success: false, error: "set_admin_decision returned no row" };
    }
    return { success: true, data: mapUserFeedbackRow(data) };
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "An unexpected error occurred";
    return { success: false, error: message };
  }
}

/** Split a feedback item into sub-tasks */
export async function splitFeedbackItem(
  parentId: string,
  descriptions: string[],
): Promise<{ success: boolean; error?: string; data?: UserFeedback[] }> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("split_feedback_item", {
      p_parent_id: parentId,
      p_descriptions: descriptions,
    });
    if (error) return { success: false, error: error.message };
    return { success: true, data: mapUserFeedbackRows(data ?? []) };
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "An unexpected error occurred";
    return { success: false, error: message };
  }
}

/** Add a comment to a feedback item */
export async function addFeedbackComment(
  feedbackId: string,
  authorType: "user" | "admin" | "ai_agent",
  content: string,
  authorName?: string,
): Promise<{ success: boolean; error?: string; data?: FeedbackComment }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const name =
      authorName ||
      user?.email ||
      (authorType === "ai_agent" ? "AI Agent" : "Unknown");
    const { data, error } = await supabase.rpc("add_feedback_comment", {
      p_feedback_id: feedbackId,
      p_author_type: authorType,
      p_author_name: name,
      p_content: content,
    });
    if (error) return { success: false, error: error.message };
    if (data === null) {
      return { success: false, error: "add_feedback_comment returned no row" };
    }
    return { success: true, data: mapFeedbackCommentRow(data) };
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "An unexpected error occurred";
    return { success: false, error: message };
  }
}

/** Get all comments for a feedback item */
export async function getFeedbackComments(
  feedbackId: string,
): Promise<{ success: boolean; error?: string; data?: FeedbackComment[] }> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_feedback_comments", {
      p_feedback_id: feedbackId,
    });
    if (error) return { success: false, error: error.message };
    return { success: true, data: mapFeedbackCommentRows(data ?? []) };
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "An unexpected error occurred";
    return { success: false, error: message };
  }
}

/** Resolve a feedback item with testing instructions */
export async function resolveWithTesting(
  feedbackId: string,
  resolutionNotes: string,
  testingInstructions?: string,
  testingUrl?: string,
): Promise<{ success: boolean; error?: string; data?: UserFeedback }> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("resolve_with_testing", {
      p_id: feedbackId,
      p_resolution_notes: resolutionNotes,
      p_testing_instructions: testingInstructions || null,
      p_testing_url: testingUrl || null,
    });
    if (error) return { success: false, error: error.message };
    if (data === null) {
      return { success: false, error: "resolve_with_testing returned no row" };
    }
    return { success: true, data: mapUserFeedbackRow(data) };
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "An unexpected error occurred";
    return { success: false, error: message };
  }
}

// ============= USER REVIEW MESSAGING ACTIONS =============

/** Admin sends a message to user for review (changes status to user_review) */
export async function sendUserReviewMessage(
  feedbackId: string,
  message: string,
  senderName?: string,
  imageUrls?: string[],
): Promise<{ success: boolean; error?: string; data?: FeedbackUserMessage }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "User not authenticated" };

    const name = senderName || user.email || "Admin";
    const { data, error } = await supabase.rpc("send_user_review_message", {
      p_feedback_id: feedbackId,
      p_message: message,
      p_sender_name: name,
      p_image_urls: imageUrls && imageUrls.length > 0 ? imageUrls : null,
    });
    if (error) return { success: false, error: error.message };
    if (data === null) {
      return {
        success: false,
        error: "send_user_review_message returned no data",
      };
    }
    const row = parseFeedbackUserMessageJson(data);
    if (row === null) {
      return {
        success: false,
        error: "Invalid user message payload from send_user_review_message",
      };
    }
    return { success: true, data: row };
  } catch (error: unknown) {
    const message2 =
      error instanceof Error ? error.message : "An unexpected error occurred";
    return { success: false, error: message2 };
  }
}

/** Admin replies to a user in an ongoing user review thread */
export async function adminReplyUserReview(
  feedbackId: string,
  message: string,
  senderName?: string,
  imageUrls?: string[],
): Promise<{ success: boolean; error?: string; data?: FeedbackUserMessage }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "User not authenticated" };

    const name = senderName || user.email || "Admin";
    const { data, error } = await supabase.rpc("admin_reply_user_review", {
      p_feedback_id: feedbackId,
      p_message: message,
      p_sender_name: name,
      p_image_urls: imageUrls && imageUrls.length > 0 ? imageUrls : null,
    });
    if (error) return { success: false, error: error.message };
    if (data === null) {
      return {
        success: false,
        error: "admin_reply_user_review returned no data",
      };
    }
    const row = parseFeedbackUserMessageJson(data);
    if (row === null) {
      return {
        success: false,
        error: "Invalid user message payload from admin_reply_user_review",
      };
    }
    return { success: true, data: row };
  } catch (error: unknown) {
    const msg =
      error instanceof Error ? error.message : "An unexpected error occurred";
    return { success: false, error: msg };
  }
}

/** User replies to admin's review request (changes status back to awaiting_review) */
export async function replyToUserReview(
  feedbackId: string,
  message: string,
  senderName?: string,
  imageUrls?: string[],
): Promise<{ success: boolean; error?: string; data?: FeedbackUserMessage }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "User not authenticated" };

    const name =
      senderName || user.user_metadata?.username || user.email || "User";
    const { data, error } = await supabase.rpc("reply_to_user_review", {
      p_feedback_id: feedbackId,
      p_message: message,
      p_sender_name: name,
      p_image_urls: imageUrls && imageUrls.length > 0 ? imageUrls : null,
    });
    if (error) return { success: false, error: error.message };
    if (data === null) {
      return { success: false, error: "reply_to_user_review returned no data" };
    }
    const row = parseFeedbackUserMessageJson(data);
    if (row === null) {
      return {
        success: false,
        error: "Invalid user message payload from reply_to_user_review",
      };
    }
    return { success: true, data: row };
  } catch (error: unknown) {
    const msg =
      error instanceof Error ? error.message : "An unexpected error occurred";
    return { success: false, error: msg };
  }
}

/** Get all user review messages for a feedback item */
export async function getUserMessages(
  feedbackId: string,
): Promise<{ success: boolean; error?: string; data?: FeedbackUserMessage[] }> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_user_messages", {
      p_feedback_id: feedbackId,
    });
    if (error) return { success: false, error: error.message };
    return {
      success: true,
      data: mapFeedbackUserMessageRows(data ?? []),
    };
  } catch (error: unknown) {
    const msg =
      error instanceof Error ? error.message : "An unexpected error occurred";
    return { success: false, error: msg };
  }
}

/** Mark a user message as emailed */
export async function markUserMessageEmailed(
  messageId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("mark_user_message_emailed", {
      p_message_id: messageId,
    });
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (error: unknown) {
    const msg =
      error instanceof Error ? error.message : "An unexpected error occurred";
    return { success: false, error: msg };
  }
}

// ============= ADMIN FEEDBACK ACTIONS =============

/**
 * Get all feedback (admin only)
 */
export async function getAllFeedback(): Promise<{
  success: boolean;
  error?: string;
  data?: UserFeedback[];
}> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: "User not authenticated" };
    }

    const { data, error } = await supabase
      .schema("users").from("user_feedback")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching all feedback:", error);
      return { success: false, error: error.message };
    }

    return { success: true, data: mapUserFeedbackRows(data ?? []) };
  } catch (error: unknown) {
    console.error("Error in getAllFeedback:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "An unexpected error occurred",
    };
  }
}

/**
 * Update a feedback row (admin only).
 *
 * Non-admin callers are rejected. When `assigned_to` is changed to a new,
 * non-self admin user, a DM + email notification fires post-update
 * (best-effort, non-blocking).
 */
export async function updateFeedback(
  feedbackId: string,
  updates: UpdateFeedbackInput,
): Promise<{ success: boolean; error?: string; data?: UserFeedback }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: "User not authenticated" };
    }

    const isAdmin = await checkIsUserAdmin(supabase, user.id);
    if (!isAdmin) {
      return { success: false, error: "Admin access required" };
    }

    // Capture prior assigned_to so we only notify on a real change.
    let previousAssignedTo: string | null = null;
    if (Object.prototype.hasOwnProperty.call(updates, "assigned_to")) {
      const { data: priorRow } = await supabase
        .schema("users").from("user_feedback")
        .select("assigned_to")
        .eq("id", feedbackId)
        .single();
      previousAssignedTo = priorRow?.assigned_to ?? null;
    }

    const updateData: UserFeedbackUpdate = { ...updates };

    // If marking as resolved or closed, set resolved_at and resolved_by
    if (updates.status === "resolved" || updates.status === "closed") {
      updateData.resolved_at = new Date().toISOString();
      updateData.resolved_by = user.id;
    }

    // If user confirms (closed), set user_confirmed_at
    if (updates.status === "closed") {
      updateData.user_confirmed_at = new Date().toISOString();
    }

    const { data, error } = await supabase
      .schema("users").from("user_feedback")
      .update(updateData)
      .eq("id", feedbackId)
      .select()
      .single();

    if (error) {
      console.error("Error updating feedback:", error);
      return { success: false, error: error.message };
    }

    if (data === null) {
      return { success: false, error: "Update succeeded but no row returned" };
    }

    const feedback = mapUserFeedbackRow(data);

    // Fire notification only when assignment actually changed to a new,
    // non-self admin. Self-assignment is silently allowed without notify.
    if (
      Object.prototype.hasOwnProperty.call(updates, "assigned_to") &&
      feedback.assigned_to &&
      feedback.assigned_to !== previousAssignedTo &&
      feedback.assigned_to !== user.id
    ) {
      const assignerName =
        user.user_metadata?.name ||
        user.user_metadata?.full_name ||
        user.email ||
        "An admin";
      notifyFeedbackAssigned({
        feedback,
        assignerId: user.id,
        assignerName,
        previousAssignedTo,
      }).catch((err) => {
        console.error("[updateFeedback] notifyFeedbackAssigned failed:", err);
      });
    }

    return { success: true, data: feedback };
  } catch (error: unknown) {
    console.error("Error in updateFeedback:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "An unexpected error occurred",
    };
  }
}

/**
 * Fetch a single feedback item by ID (admin only)
 */
export async function getFeedbackById(
  feedbackId: string,
): Promise<{ success: boolean; error?: string; data?: UserFeedback }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "User not authenticated" };

    const { data, error } = await supabase
      .schema("users").from("user_feedback")
      .select("*")
      .eq("id", feedbackId)
      .single();

    if (error) return { success: false, error: error.message };
    if (data === null) {
      return { success: false, error: "Feedback not found" };
    }
    return { success: true, data: mapUserFeedbackRow(data) };
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "An unexpected error occurred";
    return { success: false, error: message };
  }
}

/**
 * Get feedback items by status (admin only)
 */
export async function getFeedbackByStatus(
  status: FeedbackStatus,
): Promise<{ success: boolean; error?: string; data?: UserFeedback[] }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: "User not authenticated" };
    }

    const { data, error } = await supabase.rpc("get_feedback_by_status", {
      p_status: status,
    });

    if (error) {
      console.error("Error fetching feedback by status:", error);
      return { success: false, error: error.message };
    }

    return { success: true, data: mapUserFeedbackRows(data ?? []) };
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "An unexpected error occurred";
    console.error("Error in getFeedbackByStatus:", error);
    return { success: false, error: message };
  }
}

/**
 * Get feedback summary counts (admin only)
 */
export async function getFeedbackSummary(): Promise<{
  success: boolean;
  error?: string;
  data?: FeedbackSummaryData;
}> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: "User not authenticated" };
    }

    const { data, error } = await supabase.rpc("get_feedback_summary");

    if (error) {
      console.error("Error fetching feedback summary:", error);
      return { success: false, error: error.message };
    }

    if (data === null) {
      return { success: false, error: "get_feedback_summary returned no data" };
    }

    const summary = parseFeedbackSummaryPayload(data);
    if (summary === null) {
      return {
        success: false,
        error: "get_feedback_summary returned invalid summary shape",
      };
    }

    return { success: true, data: summary };
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "An unexpected error occurred";
    console.error("Error in getFeedbackSummary:", error);
    return { success: false, error: message };
  }
}

/**
 * Admin force-closes a feedback item regardless of testing status.
 * Sets testing_result = 'admin_closed' atomically with status to bypass the
 * enforce_testing_before_close trigger (which only blocks when testing_result is NULL).
 */
export async function forceCloseFeedback(
  feedbackId: string,
  targetStatus: "closed" | "resolved" | "wont_fix" = "closed",
): Promise<{ success: boolean; error?: string; data?: UserFeedback }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: "User not authenticated" };
    }

    const now = new Date().toISOString();
    const updateData: UserFeedbackUpdate = {
      status: targetStatus,
      testing_result: "admin_closed",
      resolved_at: now,
      resolved_by: user.id,
      updated_at: now,
      ...(targetStatus === "closed" ? { user_confirmed_at: now } : {}),
      admin_decision: targetStatus === "wont_fix" ? "rejected" : "approved",
    };

    const { data, error } = await supabase
      .schema("users").from("user_feedback")
      .update(updateData)
      .eq("id", feedbackId)
      .select()
      .single();

    if (error) {
      console.error("Error force-closing feedback:", error);
      return { success: false, error: error.message };
    }

    if (data === null) {
      return {
        success: false,
        error: "Force-close succeeded but no row returned",
      };
    }

    return { success: true, data: mapUserFeedbackRow(data) };
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "An unexpected error occurred";
    console.error("Error in forceCloseFeedback:", error);
    return { success: false, error: message };
  }
}

/**
 * User confirms a resolved feedback item (marks as closed)
 */
export async function confirmFeedbackResolution(
  feedbackId: string,
): Promise<{ success: boolean; error?: string; data?: UserFeedback }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: "User not authenticated" };
    }

    const { data, error } = await supabase.rpc("close_feedback_item", {
      p_id: feedbackId,
      p_status: "closed",
      p_admin_notes: "Confirmed by user",
    });

    if (error) {
      console.error("Error confirming feedback:", error);
      return { success: false, error: error.message };
    }

    if (data === null) {
      return { success: false, error: "close_feedback_item returned no row" };
    }

    return { success: true, data: mapUserFeedbackRow(data) };
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "An unexpected error occurred";
    console.error("Error in confirmFeedbackResolution:", error);
    return { success: false, error: message };
  }
}

// ============= ANNOUNCEMENT ACTIONS =============

/**
 * Get active announcements
 */
export async function getActiveAnnouncements(): Promise<{
  success: boolean;
  error?: string;
  data?: SystemAnnouncement[];
}> {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("system_announcements")
      .select("*")
      .eq("is_active", true)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching announcements:", error);
      return { success: false, error: error.message };
    }

    return {
      success: true,
      data: mapSystemAnnouncementRows(data ?? []),
    };
  } catch (error: unknown) {
    console.error("Error in getActiveAnnouncements:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "An unexpected error occurred",
    };
  }
}

/**
 * Get all announcements (admin only)
 */
export async function getAllAnnouncements(): Promise<{
  success: boolean;
  error?: string;
  data?: SystemAnnouncement[];
}> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: "User not authenticated" };
    }

    const { data, error } = await supabase
      .from("system_announcements")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching all announcements:", error);
      return { success: false, error: error.message };
    }

    return {
      success: true,
      data: mapSystemAnnouncementRows(data ?? []),
    };
  } catch (error: unknown) {
    console.error("Error in getAllAnnouncements:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "An unexpected error occurred",
    };
  }
}

/**
 * Create announcement (admin only)
 */
export async function createAnnouncement(
  input: CreateAnnouncementInput,
): Promise<{ success: boolean; error?: string; data?: SystemAnnouncement }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: "User not authenticated" };
    }

    const { data, error } = await supabase
      .from("system_announcements")
      .insert({
        ...input,
        created_by: user.id,
        announcement_type: input.announcement_type || "info",
        min_display_seconds: input.min_display_seconds || 3,
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating announcement:", error);
      return { success: false, error: error.message };
    }

    if (data === null) {
      return { success: false, error: "Create announcement returned no row" };
    }
    return { success: true, data: mapSystemAnnouncementRow(data) };
  } catch (error: unknown) {
    console.error("Error in createAnnouncement:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "An unexpected error occurred",
    };
  }
}

/**
 * Update announcement (admin only)
 */
export async function updateAnnouncement(
  announcementId: string,
  updates: UpdateAnnouncementInput,
): Promise<{ success: boolean; error?: string; data?: SystemAnnouncement }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: "User not authenticated" };
    }

    const { data, error } = await supabase
      .from("system_announcements")
      .update({
        ...updates,
      })
      .eq("id", announcementId)
      .select()
      .single();

    if (error) {
      console.error("Error updating announcement:", error);
      return { success: false, error: error.message };
    }

    if (data === null) {
      return { success: false, error: "Update announcement returned no row" };
    }
    return { success: true, data: mapSystemAnnouncementRow(data) };
  } catch (error: unknown) {
    console.error("Error in updateAnnouncement:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "An unexpected error occurred",
    };
  }
}

/**
 * Delete announcement (admin only)
 */
export async function deleteAnnouncement(
  announcementId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: "User not authenticated" };
    }

    const { error } = await supabase
      .from("system_announcements")
      .delete()
      .eq("id", announcementId);

    if (error) {
      console.error("Error deleting announcement:", error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error: unknown) {
    console.error("Error in deleteAnnouncement:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "An unexpected error occurred",
    };
  }
}
