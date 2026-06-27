// NOTE: Most `prompt_app_*` tables (categories, errors, executions, rate_limits, prompt_apps itself)
// have been moved to the graveyard schema and are no longer reachable via PostgREST.
// Functions that hit those tables are stubbed to return empty/throw clearly.
// `prompt_app_analytics` remains in the public schema and still works.
import { createClient } from "@/utils/supabase/client";
import { getScriptSupabaseClient } from "@/utils/supabase/getScriptClient";

// Helper to get the right client based on context (used only by fetchAnalytics which hits
// prompt_app_analytics, the one table still in the public schema)
function getClient() {
  if (typeof window !== "undefined") {
    return createClient();
  } else {
    return getScriptSupabaseClient();
  }
}

const DECOMMISSION_WARN = (fn: string) =>
  console.warn(`[prompt-apps-admin-service] ${fn}: table is in graveyard schema — returning empty`);

// ============================================================================
// Types
// ============================================================================

export interface PromptAppCategory {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  sort_order: number;
}

export interface CreateCategoryInput {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  sort_order?: number;
}

export interface UpdateCategoryInput {
  id: string;
  name?: string;
  description?: string;
  icon?: string;
  sort_order?: number;
}

export interface PromptAppError {
  id: string;
  app_id: string;
  execution_id?: string;
  error_type: string;
  error_code?: string;
  error_message?: string;
  error_details: Record<string, any>;
  variables_sent: Record<string, any>;
  expected_variables: Record<string, any>;
  resolved: boolean;
  resolved_at?: string;
  resolved_by?: string;
  resolution_notes?: string;
  created_at: string;
  // Joined data
  app_name?: string;
  app_slug?: string;
}

export interface ResolveErrorInput {
  id: string;
  resolution_notes?: string;
}

export interface PromptAppExecution {
  id: string;
  app_id: string;
  user_id?: string;
  fingerprint?: string;
  ip_address?: string;
  user_agent?: string;
  task_id: string;
  variables_provided: Record<string, any>;
  variables_used: Record<string, any>;
  success: boolean;
  error_type?: string;
  error_message?: string;
  execution_time_ms?: number;
  tokens_used?: number;
  cost?: number;
  referer?: string;
  metadata: Record<string, any>;
  created_at: string;
  // Joined data
  app_name?: string;
  app_slug?: string;
}

export interface PromptAppRateLimit {
  id: string;
  app_id: string;
  user_id?: string;
  fingerprint?: string;
  ip_address?: string;
  execution_count: number;
  first_execution_at: string;
  last_execution_at: string;
  window_start_at: string;
  is_blocked: boolean;
  blocked_until?: string;
  blocked_reason?: string;
  created_at: string;
  updated_at: string;
  // Joined data
  app_name?: string;
  app_slug?: string;
}

export interface PromptAppAdminView {
  id: string;
  user_id: string;
  prompt_id: string;
  slug: string;
  name: string;
  tagline?: string;
  description?: string;
  category?: string;
  tags: string[];
  status: string;
  is_verified: boolean;
  is_featured: boolean;
  total_executions: number;
  unique_users_count: number;
  success_rate: number;
  avg_execution_time_ms?: number;
  total_tokens_used: number;
  total_cost: number;
  created_at: string;
  updated_at: string;
  published_at?: string;
  last_execution_at?: string;
  // Joined data
  creator_email?: string;
}

export interface UpdateAppAdminInput {
  id: string;
  status?: "draft" | "published" | "archived" | "suspended";
  is_verified?: boolean;
  is_featured?: boolean;
}

// ============================================================================
// Categories
// ============================================================================

export async function fetchCategories(): Promise<PromptAppCategory[]> {
  DECOMMISSION_WARN("fetchCategories()");
  return [];
}

export async function getCategoryById(
  id: string,
): Promise<PromptAppCategory | null> {
  DECOMMISSION_WARN(`getCategoryById(${id})`);
  return null;
}

export async function createCategory(
  input: CreateCategoryInput,
): Promise<PromptAppCategory> {
  DECOMMISSION_WARN(`createCategory(${input.id})`);
  throw new Error("prompt_app_categories table is in graveyard schema — decommissioned");
}

export async function updateCategory(
  input: UpdateCategoryInput,
): Promise<PromptAppCategory> {
  DECOMMISSION_WARN(`updateCategory(${input.id})`);
  throw new Error("prompt_app_categories table is in graveyard schema — decommissioned");
}

export async function deleteCategory(id: string): Promise<void> {
  DECOMMISSION_WARN(`deleteCategory(${id})`);
}

// ============================================================================
// Errors
// ============================================================================

export async function fetchErrors(filters?: {
  app_id?: string;
  error_type?: string;
  resolved?: boolean;
  limit?: number;
}): Promise<PromptAppError[]> {
  DECOMMISSION_WARN("fetchErrors()");
  void filters;
  return [];
}

export async function resolveError(
  input: ResolveErrorInput,
): Promise<PromptAppError> {
  DECOMMISSION_WARN(`resolveError(${input.id})`);
  throw new Error("prompt_app_errors table is in graveyard schema — decommissioned");
}

export async function unresolveError(id: string): Promise<PromptAppError> {
  DECOMMISSION_WARN(`unresolveError(${id})`);
  throw new Error("prompt_app_errors table is in graveyard schema — decommissioned");
}

// ============================================================================
// Executions
// ============================================================================

export async function fetchExecutions(filters?: {
  app_id?: string;
  success?: boolean;
  limit?: number;
}): Promise<PromptAppExecution[]> {
  DECOMMISSION_WARN("fetchExecutions()");
  void filters;
  return [];
}

// ============================================================================
// Rate Limits
// ============================================================================

export async function fetchRateLimits(filters?: {
  app_id?: string;
  is_blocked?: boolean;
  limit?: number;
}): Promise<PromptAppRateLimit[]> {
  DECOMMISSION_WARN("fetchRateLimits()");
  void filters;
  return [];
}

export async function unblockRateLimit(
  id: string,
): Promise<PromptAppRateLimit> {
  DECOMMISSION_WARN(`unblockRateLimit(${id})`);
  throw new Error("prompt_app_rate_limits table is in graveyard schema — decommissioned");
}

export async function blockRateLimit(
  id: string,
  reason?: string,
  blockedUntil?: Date,
): Promise<PromptAppRateLimit> {
  DECOMMISSION_WARN(`blockRateLimit(${id})`);
  void reason; void blockedUntil;
  throw new Error("prompt_app_rate_limits table is in graveyard schema — decommissioned");
}

// ============================================================================
// Apps Admin
// ============================================================================

export async function fetchAppsAdmin(filters?: {
  status?: string;
  is_featured?: boolean;
  is_verified?: boolean;
  category?: string;
  limit?: number;
}): Promise<PromptAppAdminView[]> {
  DECOMMISSION_WARN("fetchAppsAdmin()");
  void filters;
  return [];
}

export async function updateAppAdmin(
  input: UpdateAppAdminInput,
): Promise<PromptAppAdminView> {
  DECOMMISSION_WARN(`updateAppAdmin(${input.id})`);
  throw new Error("prompt_apps table is in graveyard schema — decommissioned");
}

// ============================================================================
// Analytics
// ============================================================================

export async function fetchAnalytics(filters?: {
  app_id?: string;
  status?: string;
  limit?: number;
}): Promise<any[]> {
  const supabase = getClient();
  let query = supabase
    .from("prompt_app_analytics")
    .select("*")
    .order("total_executions", { ascending: false });

  if (filters?.app_id) query = query.eq("app_id", filters.app_id);
  if (filters?.status) query = query.eq("status", filters.status);
  if (filters?.limit) query = query.limit(filters.limit);

  const { data, error } = await query;
  if (error) {
    console.error("Error fetching analytics:", error);
    // Return empty array if view doesn't exist yet
    return [];
  }
  return data || [];
}
