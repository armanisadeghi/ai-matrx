import { createClient } from "@/utils/supabase/client";
import { getScriptSupabaseClient } from "@/utils/supabase/getScriptClient";
import { requireUserId } from "@/utils/auth/getUserId";
import { resolveSystemOrgId } from "@/lib/organizations/systemOrg";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import type { JsonObject } from "@/types/json";
import { isJsonObject } from "@/types/json";

function getClient(): SupabaseClient<Database> {
  if (typeof window !== "undefined") {
    return createClient();
  } else {
    return getScriptSupabaseClient();
  }
}

export interface AgentAppCategoryRow {
  id: string;
  name: string;
  description?: string | null;
  icon?: string | null;
  sort_order: number;
}

export interface CreateAgentAppCategoryInput {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  sort_order?: number;
}

export interface UpdateAgentAppCategoryInput {
  id: string;
  name?: string;
  description?: string;
  icon?: string;
  sort_order?: number;
}

export interface AgentAppAdminView {
  id: string;
  user_id: string | null;
  agent_id: string;
  slug: string;
  name: string;
  tagline?: string | null;
  description?: string | null;
  category?: string | null;
  tags: string[];
  status: "draft" | "published" | "archived" | "suspended";
  is_public: boolean;
  is_verified: boolean;
  is_featured: boolean;
  rate_limit_per_ip: number | null;
  rate_limit_window_hours: number | null;
  rate_limit_authenticated: number | null;
  total_executions: number | null;
  unique_users_count: number | null;
  success_rate: number | null;
  avg_execution_time_ms?: number | null;
  total_tokens_used: number | null;
  total_cost: number | null;
  created_at: string;
  updated_at: string;
  published_at?: string | null;
  last_execution_at?: string | null;
  creator_email?: string;
}

export interface UpdateAgentAppAdminInput {
  id: string;
  status?: "draft" | "published" | "archived" | "suspended";
  is_verified?: boolean;
  is_featured?: boolean;
  is_public?: boolean;
  rate_limit_per_ip?: number;
  rate_limit_window_hours?: number;
  rate_limit_authenticated?: number;
}

export interface AgentAppExecutionRow {
  id: string;
  app_id: string;
  user_id?: string | null;
  fingerprint?: string | null;
  ip_address?: string | null;
  user_agent?: string | null;
  task_id: string;
  variables_provided: JsonObject;
  variables_used: JsonObject;
  success: boolean;
  error_type?: string | null;
  error_message?: string | null;
  execution_time_ms?: number | null;
  tokens_used?: number | null;
  cost?: number | null;
  referer?: string | null;
  metadata: JsonObject;
  created_at: string;
  app_name?: string;
  app_slug?: string;
}

export interface AgentAppErrorRow {
  id: string;
  app_id: string;
  execution_id?: string | null;
  error_type: string;
  error_code?: string | null;
  error_message?: string | null;
  error_details: JsonObject;
  variables_sent: JsonObject;
  expected_variables: JsonObject;
  resolved: boolean;
  resolved_at?: string | null;
  resolved_by?: string | null;
  resolution_notes?: string | null;
  created_at: string;
  app_name?: string;
  app_slug?: string;
}

export interface AgentAppRateLimitRow {
  id: string;
  app_id: string;
  user_id?: string | null;
  fingerprint?: string | null;
  ip_address?: string | null;
  execution_count: number;
  first_execution_at: string;
  last_execution_at: string;
  window_start_at: string;
  is_blocked: boolean;
  blocked_until?: string | null;
  blocked_reason?: string | null;
  created_at: string;
  updated_at: string;
  app_name?: string;
  app_slug?: string;
}

export async function fetchAgentAppCategories(): Promise<
  AgentAppCategoryRow[]
> {
  const supabase = getClient();
  const { data, error } = await supabase
    .schema("platform").from("categories")
    // Parsing the aliased/JSON-path column list blows TS's instantiation depth
    // (TS2589); explicit select generics pin the row type without the parse.
    .select<string, AgentAppCategoryRow>(
      "id, name, sort_order:position, icon, description:metadata->>description",
    )
    .eq("dimension", "app")
    .order("position", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function createAgentAppCategory(
  input: CreateAgentAppCategoryInput,
): Promise<AgentAppCategoryRow> {
  const supabase = getClient();
  const { data, error } = await supabase
    .schema("platform").from("categories")
    .insert([
      {
        dimension: "app",
        // platform.categories requires an owning org; agent-app categories are
        // platform-wide, so they belong to the Matrx System tenant.
        organization_id: await resolveSystemOrgId(supabase),
        name: input.name,
        slug: input.name
          ?.toLowerCase()
          .trim()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, ""),
        icon: input.icon ?? null,
        position: input.sort_order ?? 0,
        metadata: {
          description: input.description ?? null,
          legacy_id: input.id,
          legacy_table: "app.category",
        },
      },
    ])
    .select<string, AgentAppCategoryRow>(
      "id, name, sort_order:position, icon, description:metadata->>description",
    )
    .single();
  if (error) throw error;
  return data;
}

export async function updateAgentAppCategory(
  input: UpdateAgentAppCategoryInput,
): Promise<AgentAppCategoryRow> {
  const supabase = getClient();
  const patch: Database["platform"]["Tables"]["categories"]["Update"] = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.icon !== undefined) patch.icon = input.icon;
  if (input.sort_order !== undefined) patch.position = input.sort_order;
  // description lives in metadata; merge atomically so legacy_id/legacy_table
  // and any other existing metadata keys are not wiped by a partial update.
  if (input.description !== undefined) {
    const { data: current, error: readError } = await supabase
      .schema("platform").from("categories")
      .select("metadata")
      .eq("id", input.id)
      .eq("dimension", "app")
      .single();
    if (readError) throw readError;
    patch.metadata = {
      ...(isJsonObject(current.metadata) ? current.metadata : {}),
      description: input.description,
    };
  }
  const { data, error } = await supabase
    .schema("platform").from("categories")
    .update(patch)
    .eq("id", input.id)
    .eq("dimension", "app")
    .select<string, AgentAppCategoryRow>(
      "id, name, sort_order:position, icon, description:metadata->>description",
    )
    .single();
  if (error) throw error;
  return data;
}

export async function deleteAgentAppCategory(id: string): Promise<void> {
  const supabase = getClient();
  const { error } = await supabase
    .schema("platform").from("categories")
    .delete()
    .eq("id", id)
    .eq("dimension", "app");
  if (error) throw error;
}

export async function fetchAgentAppsAdmin(filters?: {
  status?: string;
  is_featured?: boolean;
  is_verified?: boolean;
  category?: string;
  limit?: number;
  /** Filter by ownership scope. `"global"` returns system apps (user_id IS NULL);
   *  `"user"` returns user-owned apps (user_id IS NOT NULL). Omit for all. */
  scope?: "global" | "user";
}): Promise<AgentAppAdminView[]> {
  const supabase = getClient();
  let query = supabase
    .schema("app").from("definition")
    .select("*")
    .order("updated_at", { ascending: false });

  if (filters?.status) query = query.eq("status", filters.status);
  if (filters?.is_featured !== undefined)
    query = query.eq("is_featured", filters.is_featured);
  if (filters?.is_verified !== undefined)
    query = query.eq("is_verified", filters.is_verified);
  if (filters?.category) query = query.eq("category", filters.category);
  if (filters?.scope === "global") query = query.is("user_id", null);
  if (filters?.scope === "user") query = query.not("user_id", "is", null);
  if (filters?.limit) query = query.limit(filters.limit);

  const { data, error } = await query;
  if (error) throw error;

  if (data && data.length > 0) {
    const userIds = [
      ...new Set(
        data.map((r) => r.user_id).filter((v): v is string => !!v),
      ),
    ];
    if (userIds.length > 0) {
      const { data: users, error: usersError } = await supabase.rpc(
        "get_user_emails_by_ids",
        { user_ids: userIds },
      );
      if (usersError) throw usersError;
      const userMap = new Map((users ?? []).map((u) => [u.id, u]));
      return data.map((item) => ({
        ...item,
        creator_email: item.user_id
          ? userMap.get(item.user_id)?.email
          : undefined,
      })) as AgentAppAdminView[];
    }
  }
  return (data ?? []).map((item) => ({
    ...item,
    creator_email: undefined,
  })) as AgentAppAdminView[];
}

export async function getAgentAppById(
  id: string,
): Promise<AgentAppAdminView | null> {
  const supabase = getClient();
  const { data, error } = await supabase
    .schema("app").from("definition")
    .select("*")
    .eq("id", id)
    .single();
  if (error) {
    if (error.code === "PGRST116") return null;
    throw error;
  }
  return data as AgentAppAdminView;
}

export async function updateAgentAppAdmin(
  input: UpdateAgentAppAdminInput,
): Promise<AgentAppAdminView> {
  const supabase = getClient();
  const patch: Database["app"]["Tables"]["definition"]["Update"] = {};
  if (input.status !== undefined) patch.status = input.status;
  if (input.is_verified !== undefined) patch.is_verified = input.is_verified;
  if (input.is_featured !== undefined) patch.is_featured = input.is_featured;
  if (input.is_public !== undefined) patch.is_public = input.is_public;
  if (input.rate_limit_per_ip !== undefined)
    patch.rate_limit_per_ip = input.rate_limit_per_ip;
  if (input.rate_limit_window_hours !== undefined)
    patch.rate_limit_window_hours = input.rate_limit_window_hours;
  if (input.rate_limit_authenticated !== undefined)
    patch.rate_limit_authenticated = input.rate_limit_authenticated;

  const { data, error } = await supabase
    .schema("app").from("definition")
    .update(patch)
    .eq("id", input.id)
    .select()
    .single();
  if (error) throw error;
  return data as AgentAppAdminView;
}

export async function fetchAgentAppExecutions(filters?: {
  app_id?: string;
  success?: boolean;
  limit?: number;
}): Promise<AgentAppExecutionRow[]> {
  const supabase = getClient();
  let query = supabase
    .schema("app").from("execution")
    .select("*")
    .order("created_at", { ascending: false });

  if (filters?.app_id) query = query.eq("app_id", filters.app_id);
  if (filters?.success !== undefined)
    query = query.eq("success", filters.success);
  if (filters?.limit) query = query.limit(filters.limit);

  const { data, error } = await query;
  if (error) throw error;

  if (data && data.length > 0) {
    const appIds = [...new Set(data.map((e) => e.app_id))];
    const { data: apps, error: appsError } = await supabase
      .schema("app").from("definition")
      .select("id, name, slug")
      .in("id", appIds);
    if (appsError) throw appsError;
    const appMap = new Map((apps ?? []).map((a) => [a.id, a]));
    return data.map((item) => ({
      ...item,
      app_name: appMap.get(item.app_id)?.name,
      app_slug: appMap.get(item.app_id)?.slug,
    })) as AgentAppExecutionRow[];
  }
  return (data ?? []) as AgentAppExecutionRow[];
}

export async function fetchAgentAppErrors(filters?: {
  app_id?: string;
  error_type?: string;
  resolved?: boolean;
  limit?: number;
}): Promise<AgentAppErrorRow[]> {
  const supabase = getClient();
  let query = supabase
    .schema("app").from("error")
    .select("*")
    .order("created_at", { ascending: false });

  if (filters?.app_id) query = query.eq("app_id", filters.app_id);
  if (filters?.error_type) query = query.eq("error_type", filters.error_type);
  if (filters?.resolved !== undefined)
    query = query.eq("resolved", filters.resolved);
  if (filters?.limit) query = query.limit(filters.limit);

  const { data, error } = await query;
  if (error) throw error;

  if (data && data.length > 0) {
    const appIds = [...new Set(data.map((e) => e.app_id))];
    const { data: apps, error: appsError } = await supabase
      .schema("app").from("definition")
      .select("id, name, slug")
      .in("id", appIds);
    if (appsError) throw appsError;
    const appMap = new Map((apps ?? []).map((a) => [a.id, a]));
    return data.map((item) => ({
      ...item,
      app_name: appMap.get(item.app_id)?.name,
      app_slug: appMap.get(item.app_id)?.slug,
    })) as AgentAppErrorRow[];
  }
  return (data ?? []) as AgentAppErrorRow[];
}

export async function resolveAgentAppError(input: {
  id: string;
  resolution_notes?: string;
}): Promise<AgentAppErrorRow> {
  const supabase = getClient();
  const userId = requireUserId();
  const { data, error } = await supabase
    .schema("app").from("error")
    .update({
      resolved: true,
      resolved_at: new Date().toISOString(),
      resolved_by: userId,
      resolution_notes: input.resolution_notes ?? null,
    })
    .eq("id", input.id)
    .select()
    .single();
  if (error) throw error;
  return data as AgentAppErrorRow;
}

export async function unresolveAgentAppError(
  id: string,
): Promise<AgentAppErrorRow> {
  const supabase = getClient();
  const { data, error } = await supabase
    .schema("app").from("error")
    .update({
      resolved: false,
      resolved_at: null,
      resolved_by: null,
      resolution_notes: null,
    })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as AgentAppErrorRow;
}

export async function fetchAgentAppRateLimits(filters?: {
  app_id?: string;
  is_blocked?: boolean;
  limit?: number;
}): Promise<AgentAppRateLimitRow[]> {
  const supabase = getClient();
  let query = supabase
    .schema("app").from("rate_limit")
    .select("*")
    .order("updated_at", { ascending: false });

  if (filters?.app_id) query = query.eq("app_id", filters.app_id);
  if (filters?.is_blocked !== undefined)
    query = query.eq("is_blocked", filters.is_blocked);
  if (filters?.limit) query = query.limit(filters.limit);

  const { data, error } = await query;
  if (error) throw error;

  if (data && data.length > 0) {
    const appIds = [...new Set(data.map((e) => e.app_id))];
    const { data: apps, error: appsError } = await supabase
      .schema("app").from("definition")
      .select("id, name, slug")
      .in("id", appIds);
    if (appsError) throw appsError;
    const appMap = new Map((apps ?? []).map((a) => [a.id, a]));
    return data.map((item) => ({
      ...item,
      app_name: appMap.get(item.app_id)?.name,
      app_slug: appMap.get(item.app_id)?.slug,
    })) as AgentAppRateLimitRow[];
  }
  return (data ?? []) as AgentAppRateLimitRow[];
}

export async function unblockAgentAppRateLimit(
  id: string,
): Promise<AgentAppRateLimitRow> {
  const supabase = getClient();
  const { data, error } = await supabase
    .schema("app").from("rate_limit")
    .update({
      is_blocked: false,
      blocked_until: null,
      blocked_reason: null,
      execution_count: 0,
      window_start_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as AgentAppRateLimitRow;
}

export async function blockAgentAppRateLimit(
  id: string,
  reason?: string,
  blockedUntil?: Date,
): Promise<AgentAppRateLimitRow> {
  const supabase = getClient();
  const { data, error } = await supabase
    .schema("app").from("rate_limit")
    .update({
      is_blocked: true,
      blocked_until: blockedUntil?.toISOString() ?? null,
      blocked_reason: reason ?? null,
    })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as AgentAppRateLimitRow;
}
