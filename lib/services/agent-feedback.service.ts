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
  FeedbackStatus,
  FeedbackPriority,
  AiComplexity,
  AdminDecision,
  UpdateFeedbackInput,
} from "@/types/feedback.types";
import { isDurableMediaUrl } from "@/lib/media/durability";
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
  priority?: FeedbackPriority;
  image_urls?: string[];
}

export interface AgentListInput {
  query?: string;
  status?: FeedbackStatus;
  priority?: FeedbackPriority;
  feedback_type?: FeedbackType;
  limit?: number;
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

/** The valid auth user that owns external agent submissions. */
const AGENT_SERVICE_ACCOUNT_EMAIL = "claude-01@aimatrx.com";

let cachedAgentUserId: string | null = null;

/**
 * Resolve the `user_id` for an agent submission.
 *
 * `users.user_feedback.user_id` is NOT NULL with an FK to `auth.users`.
 * Caller identity is optional: a real Matrx user id is honored, a legacy
 * external id is preserved in metadata, and no id uses the service account.
 *
 * Submission never fails because an external agent lacks an arbitrary UUID.
 */
async function resolveAgentUserId(
  supabase: ReturnType<typeof createAdminClient>,
  agentId?: string,
): Promise<{ userId: string; substituted: boolean }> {
  // `users.profiles` is 1:1 with `auth.users`, so a profile row proves the id
  // satisfies the feedback FK. (`auth.users` itself is not PostgREST-readable.)
  if (agentId) {
    const { data: real } = await supabase
      .schema("users")
      .from("profiles")
      .select("id")
      .eq("id", agentId)
      .maybeSingle();
    if (real?.id) return { userId: real.id, substituted: false };
  }

  if (!cachedAgentUserId) {
    // The canonical email→user resolver (same RPC the sharing UI uses).
    const { data, error } = await supabase.rpc("lookup_user_by_email", {
      lookup_email: AGENT_SERVICE_ACCOUNT_EMAIL,
    });
    const accountId = data?.[0]?.user_id;
    if (error || !accountId) {
      throw new Error(
        `agent feedback cannot be attributed: ${agentId ?? "no agent id"} is not a Matrx user and ` +
          `the agent service account ${AGENT_SERVICE_ACCOUNT_EMAIL} was not found`,
      );
    }
    cachedAgentUserId = accountId;
  }
  // Loud: an agent id that isn't a real user is expected for external agents,
  // but the substitution should never be invisible.
  if (agentId) {
    console.warn(
      `[agent-feedback] agent_id ${agentId} is not a Matrx user — attributing to ` +
        `${AGENT_SERVICE_ACCOUNT_EMAIL} and preserving the id in metadata.agent_id`,
    );
  }
  return { userId: cachedAgentUserId, substituted: true };
}

export function validateFeedbackScreenshotUrls(urls: string[]): string[] {
  const normalized = urls.map((raw) => raw.trim()).filter(Boolean);
  for (const url of normalized) {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error(
        `Screenshot URL must be a durable public HTTPS URL: ${url}`,
      );
    }
    const ephemeralShare =
      parsed.hostname === "server.app.matrxserver.com" &&
      parsed.pathname.startsWith("/share/");
    if (
      parsed.protocol !== "https:" ||
      !isDurableMediaUrl(url) ||
      ephemeralShare
    ) {
      throw new Error(
        "Screenshot URLs must be durable public URLs. Upload/publish the image " +
          `first and pass its CDN URL; expiring URL rejected: ${url}`,
      );
    }
  }
  return [...new Set(normalized)];
}

/** Create a new feedback item on behalf of an agent */
export async function submitFeedback(
  agentId: string | undefined,
  agentName: string | undefined,
  input: AgentSubmitInput,
): Promise<ServiceResult<UserFeedback>> {
  try {
    const supabase = createAdminClient();
    const { userId, substituted } = await resolveAgentUserId(supabase, agentId);

    const { data, error } = await supabase
      .schema("users")
      .from("user_feedback")
      .insert({
        // External agents have no personal org (no Supabase session); their
        // feedback homes to the global system org.
        organization_id: await resolveSystemOrgId(supabase),
        user_id: userId,
        metadata: agentId
          ? {
              agent_id: agentId,
              attributed_to_service_account: substituted,
            }
          : { submitted_via: "agent_feedback_api" },
        username: agentName || "External agent",
        feedback_type: input.feedback_type,
        // route is NOT NULL with no DB default; "" is the deliberate
        // sentinel for "no route supplied" (route is optional at the API/MCP
        // boundary — general feedback with no specific location).
        // MATRX-EXCEPTION: honest default for a NOT NULL column, not a boundary failure
        route: input.route ? input.route : "",
        description: input.description,
        status: "new",
        priority: input.priority ?? "medium",
        image_urls: input.image_urls
          ? validateFeedbackScreenshotUrls(input.image_urls)
          : null,
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
      .schema("users")
      .from("user_feedback")
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

/** List/search feedback without requiring callers to know an item ID first. */
export async function listFeedbackItems(
  input: AgentListInput = {},
): Promise<ServiceResult<UserFeedback[]>> {
  try {
    const supabase = createAdminClient();
    const requestedLimit = Math.min(Math.max(input.limit ?? 50, 1), 100);
    const fetchLimit = input.query ? 500 : requestedLimit;
    let request = supabase
      .schema("users")
      .from("user_feedback")
      .select("*")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(fetchLimit);

    if (input.status) request = request.eq("status", input.status);
    if (input.priority) request = request.eq("priority", input.priority);
    if (input.feedback_type) {
      request = request.eq("feedback_type", input.feedback_type);
    }

    const { data, error } = await request;
    if (error) return { success: false, error: error.message };

    let items = mapUserFeedbackRows(data ?? []);
    if (input.query) {
      const needle = input.query.toLocaleLowerCase();
      items = items.filter((item) => {
        const searchable = [item.id, item.description, item.route];
        if (item.username) searchable.push(item.username);
        return searchable.join(" ").toLocaleLowerCase().includes(needle);
      });
    }
    return { success: true, data: items.slice(0, requestedLimit) };
  } catch (err: unknown) {
    const message =
      err instanceof Error
        ? err.message
        : "Unexpected error in listFeedbackItems";
    return { success: false, error: message };
  }
}

/** Apply a typed patch, including status and durable screenshot updates. */
export async function updateFeedbackItem(
  feedbackId: string,
  updates: UpdateFeedbackInput,
): Promise<ServiceResult<UserFeedback>> {
  try {
    if (Object.keys(updates).length === 0) {
      return {
        success: false,
        error: "updates must contain at least one field",
      };
    }

    const supabase = createAdminClient();
    const patch: UpdateFeedbackInput = { ...updates };
    if (Array.isArray(patch.image_urls)) {
      patch.image_urls = validateFeedbackScreenshotUrls(patch.image_urls);
    }

    if (
      (patch.status === "closed" || patch.status === "resolved") &&
      !patch.testing_result
    ) {
      const current = await getFeedbackItem(feedbackId);
      if (!current.success || !current.data) return current;
      if (!current.data.testing_result) {
        return {
          success: false,
          error:
            "Closing/resolving feedback requires testing_result " +
            "(pass, fail, partial, pending, or admin_closed).",
        };
      }
    }

    if (patch.status === "closed" || patch.status === "resolved") {
      patch.resolved_at ??= new Date().toISOString();
    }

    const { data, error } = await supabase
      .schema("users")
      .from("user_feedback")
      .update(patch)
      .eq("id", feedbackId)
      .select()
      .single();

    if (error) return { success: false, error: error.message };
    if (data === null) {
      return { success: false, error: "updateFeedbackItem returned no row" };
    }
    return { success: true, data: mapUserFeedbackRow(data) };
  } catch (err: unknown) {
    const message =
      err instanceof Error
        ? err.message
        : "Unexpected error in updateFeedbackItem";
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
      .schema("users")
      .from("user_feedback")
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
