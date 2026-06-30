// Service layer for external agent access to the feedback system.
// Used by both the MCP server and REST API endpoints.
// Uses the admin Supabase client (service role) to bypass RLS,
// since external agents authenticate via API key, not Supabase sessions.

import { createAdminClient } from "@/utils/supabase/adminClient";
import { resolveSystemOrgId } from "@/lib/organizations/systemOrg";
import type {
  UserFeedback,
  FeedbackComment,
  FeedbackType,
  FeedbackPriority,
  AiComplexity,
  AdminDecision,
} from "@/types/feedback.types";
import {
  mapFeedbackCommentRows,
  mapFeedbackCommentRow,
  mapUserFeedbackRow,
  mapUserFeedbackRows,
  parseGetTriageBatchResult,
  type TriageBatchData,
} from "@/types/feedback-row-mapper";

// ============= Types =============

interface ServiceResult<T> {
  success: boolean;
  error?: string;
  data?: T;
}

export interface AgentSubmitInput {
  feedback_type: FeedbackType;
  description: string;
  route?: string;
}

export interface AgentTriageInput {
  ai_solution_proposal?: string;
  ai_suggested_priority?: FeedbackPriority;
  ai_complexity?: AiComplexity;
  ai_estimated_files?: string[];
  autonomy_score?: number;
  ai_assessment?: string;
  category_id?: string;
}

// ============= Submit =============

/** Create a new feedback item on behalf of an agent */
export async function submitFeedback(
  agentId: string,
  agentName: string,
  input: AgentSubmitInput,
): Promise<ServiceResult<UserFeedback>> {
  try {
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .schema("users").from("user_feedback")
      .insert({
        // External agents have no personal org (no Supabase session); their
        // feedback homes to the global system org.
        organization_id: await resolveSystemOrgId(supabase),
        user_id: agentId,
        username: agentName,
        feedback_type: input.feedback_type,
        route: input.route || "",
        description: input.description,
        status: "new",
      })
      .select()
      .single();

    if (error) return { success: false, error: error.message };
    if (data === null) {
      return { success: false, error: "submitFeedback returned no row" };
    }
    return { success: true, data: mapUserFeedbackRow(data) };
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Unexpected error in submitFeedback";
    return { success: false, error: message };
  }
}

// ============= Read Operations =============

/** Get a single feedback item by ID */
export async function getFeedbackItem(
  feedbackId: string,
): Promise<ServiceResult<UserFeedback>> {
  try {
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .schema("users").from("user_feedback")
      .select("*")
      .eq("id", feedbackId)
      .single();

    if (error) return { success: false, error: error.message };
    if (data === null) {
      return { success: false, error: "Feedback item not found" };
    }
    return { success: true, data: mapUserFeedbackRow(data) };
  } catch (err: unknown) {
    const message =
      err instanceof Error
        ? err.message
        : "Unexpected error in getFeedbackItem";
    return { success: false, error: message };
  }
}

/** Get a batch of untriaged items with pipeline context */
export async function getTriageBatch(
  batchSize: number = 3,
): Promise<ServiceResult<TriageBatchData>> {
  try {
    const supabase = createAdminClient();

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
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Unexpected error in getTriageBatch";
    return { success: false, error: message };
  }
}

/** Get the agent work queue (approved items in priority order) */
export async function getWorkQueue(): Promise<ServiceResult<UserFeedback[]>> {
  try {
    const supabase = createAdminClient();

    const { data, error } = await supabase.rpc("get_agent_work_queue");

    if (error) return { success: false, error: error.message };
    return { success: true, data: mapUserFeedbackRows(data ?? []) };
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Unexpected error in getWorkQueue";
    return { success: false, error: message };
  }
}

/** Get comments for a feedback item */
export async function getComments(
  feedbackId: string,
): Promise<ServiceResult<FeedbackComment[]>> {
  try {
    const supabase = createAdminClient();

    const { data, error } = await supabase.rpc("get_feedback_comments", {
      p_feedback_id: feedbackId,
    });

    if (error) return { success: false, error: error.message };
    return { success: true, data: mapFeedbackCommentRows(data ?? []) };
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Unexpected error in getComments";
    return { success: false, error: message };
  }
}

/** Get items returned from testing (fail or partial) for rework */
export async function getReworkItems(): Promise<ServiceResult<UserFeedback[]>> {
  try {
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .schema("users").from("user_feedback")
      .select("*")
      .eq("admin_decision", "approved")
      .eq("status", "in_progress")
      .in("testing_result", ["fail", "partial"])
      .order("work_priority", { ascending: true, nullsFirst: false });

    if (error) return { success: false, error: error.message };
    return { success: true, data: mapUserFeedbackRows(data ?? []) };
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Unexpected error in getReworkItems";
    return { success: false, error: message };
  }
}

// ============= Triage & Workflow =============

/** Push AI triage analysis to a feedback item */
export async function triageItem(
  feedbackId: string,
  triage: AgentTriageInput,
): Promise<ServiceResult<UserFeedback>> {
  try {
    const supabase = createAdminClient();

    // Always pass p_category_id to resolve the PostgreSQL function overload ambiguity
    const { data, error } = await supabase.rpc("triage_feedback_item", {
      p_id: feedbackId,
      p_ai_solution_proposal: triage.ai_solution_proposal,
      p_ai_suggested_priority: triage.ai_suggested_priority,
      p_ai_complexity: triage.ai_complexity,
      p_ai_estimated_files: triage.ai_estimated_files,
      p_autonomy_score: triage.autonomy_score,
      p_ai_assessment: triage.ai_assessment,
      p_category_id: triage.category_id,
    });

    if (error) return { success: false, error: error.message };
    if (data === null) {
      return { success: false, error: "triage_feedback_item returned no row" };
    }
    return { success: true, data: mapUserFeedbackRow(data) };
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Unexpected error in triageItem";
    return { success: false, error: message };
  }
}

/** Add a comment to a feedback item */
export async function addComment(
  feedbackId: string,
  authorType: "user" | "admin" | "ai_agent",
  authorName: string,
  content: string,
): Promise<ServiceResult<FeedbackComment>> {
  try {
    const supabase = createAdminClient();

    const { data, error } = await supabase.rpc("add_feedback_comment", {
      p_feedback_id: feedbackId,
      p_author_type: authorType,
      p_author_name: authorName,
      p_content: content,
    });

    if (error) return { success: false, error: error.message };
    if (data === null) {
      return { success: false, error: "add_feedback_comment returned no row" };
    }
    return { success: true, data: mapFeedbackCommentRow(data) };
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Unexpected error in addComment";
    return { success: false, error: message };
  }
}

/** Resolve a feedback item with testing instructions (agent's final action) */
export async function resolveWithTesting(
  feedbackId: string,
  resolutionNotes: string,
  testingInstructions?: string,
  testingUrl?: string,
): Promise<ServiceResult<UserFeedback>> {
  try {
    const supabase = createAdminClient();

    const { data, error } = await supabase.rpc("resolve_with_testing", {
      p_id: feedbackId,
      p_resolution_notes: resolutionNotes,
      p_testing_instructions: testingInstructions,
      p_testing_url: testingUrl,
    });

    if (error) return { success: false, error: error.message };
    if (data === null) {
      return { success: false, error: "resolve_with_testing returned no row" };
    }
    return { success: true, data: mapUserFeedbackRow(data) };
  } catch (err: unknown) {
    const message =
      err instanceof Error
        ? err.message
        : "Unexpected error in resolveWithTesting";
    return { success: false, error: message };
  }
}

/** Set admin decision on a feedback item (used for auto-approval) */
export async function setAdminDecision(
  feedbackId: string,
  decision: AdminDecision,
  direction?: string,
  workPriority?: number,
): Promise<ServiceResult<UserFeedback>> {
  try {
    const supabase = createAdminClient();

    const { data, error } = await supabase.rpc("set_admin_decision", {
      p_id: feedbackId,
      p_decision: decision,
      p_direction: direction,
      p_work_priority: workPriority,
    });

    if (error) return { success: false, error: error.message };
    if (data === null) {
      return { success: false, error: "set_admin_decision returned no row" };
    }
    return { success: true, data: mapUserFeedbackRow(data) };
  } catch (err: unknown) {
    const message =
      err instanceof Error
        ? err.message
        : "Unexpected error in setAdminDecision";
    return { success: false, error: message };
  }
}
