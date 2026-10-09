import { createClient } from "@/utils/supabase/client";
import { appletJobs } from "@/features/applets/types";
import { catWriteArgs, categoryRow } from "@/lib/db/category-door";
import { getScriptSupabaseClient } from "@/utils/supabase/getScriptClient";
import { requireUserId } from "@/utils/auth/getUserId";
import { resolveSystemOrgId } from "@/lib/organizations/systemOrg";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import type { JsonObject } from "@/types/json";
import { isJsonObject } from "@/types/json";
import { readAllRows } from "@ai-matrx/data/db";
import { writeOneRow } from "@/utils/supabase/writeOne";

function getClient(): SupabaseClient<Database> {
  if (typeof window !== "undefined") {
    return createClient();
  } else {
    return getScriptSupabaseClient();
  }
}

export interface AppletCategoryRow {
  id: string;
  name: string;
  description?: string | null;
  icon?: string | null;
  sort_order: number;
}

export interface CreateAppletCategoryInput {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  sort_order?: number;
}

export interface UpdateAppletCategoryInput {
  id: string;
  name?: string;
  description?: string;
  icon?: string;
  sort_order?: number;
}

export interface AppletAdminView {
  id: string;
  created_by: string | null;
  /** The jobs the Applet runs (`mandates` [{ alias, key }]) — the keys, read-only here. */
  job_keys: string[];
  slug: string;
  name: string;
  tagline?: string | null;
  description?: string | null;
  category?: string | null;
  tags: string[];
  status: "draft" | "published" | "suspended";
  published_to_web: boolean;
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

export interface UpdateAppletAdminInput {
  id: string;
  status?: "draft" | "published" | "suspended";
  is_verified?: boolean;
  is_featured?: boolean;
  published_to_web?: boolean;
  rate_limit_per_ip?: number;
  rate_limit_window_hours?: number;
  rate_limit_authenticated?: number;
}

export interface AppletExecutionRow {
  id: string;
  app_id: string;
  /**
   * The signed-in RUNNER — read from the row's `runner_user_id`. Never
   * `created_by`, which on these component rows is the app's owner. NULL for
   * a guest (then `fingerprint` / `ip_address`).
   */
  user_id?: string | null;
  fingerprint?: string | null;
  ip_address?: string | null;
  user_agent?: string | null;
  task_id: string;
  variables_provided: JsonObject;
  variables_used: JsonObject;
  success: boolean | null;
  kind?: "visit" | "run" | null;
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

export interface AppletErrorRow {
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

export interface AppletRateLimitRow {
  id: string;
  app_id: string;
  /**
   * The signed-in RUNNER — read from the row's `runner_user_id`. Never
   * `created_by`, which on these component rows is the app's owner. NULL for
   * a guest (then `fingerprint` / `ip_address`).
   */
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

/**
 * A door answers with the WHOLE row; this list's shape is a projection of four of its
 * columns, with `description` reached through metadata. Written once here rather than
 * at each door call site.
 */
function categoryRowFromDoor(row: unknown): AppletCategoryRow {
  const r = (isJsonObject(row) ? row : {}) as Record<string, unknown>;
  const metadata = isJsonObject(r.metadata) ? r.metadata : {};
  return {
    id: String(r.id),
    name: typeof r.name === "string" ? r.name : "",
    sort_order: typeof r.position === "number" ? r.position : 0,
    icon: typeof r.icon === "string" ? r.icon : null,
    description:
      typeof metadata.description === "string" ? metadata.description : null,
  } as AppletCategoryRow;
}

export async function fetchAppletCategories(): Promise<
  AppletCategoryRow[]
> {
  const supabase = getClient();
  const { data, error } = await supabase
    .schema("platform")
    .from("categories")
    // Parsing the aliased/JSON-path column list blows TS's instantiation depth
    // (TS2589); explicit select generics pin the row type without the parse.
    .select<string, AppletCategoryRow>(
      "id, name, sort_order:position, icon, description:metadata->>description",
    )
    .eq("dimension", "app")
    .order("position", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function createAppletCategory(
  input: CreateAppletCategoryInput,
): Promise<AppletCategoryRow> {
  const supabase = getClient();
  // org-fallback-deliberate: an applet category is a platform-wide catalog
  //   row every organization sees; the only callers are the admin-gated (admin)
  //   surfaces
  const organizationId = await resolveSystemOrgId(supabase);
  // THE DOOR. `platform` is not a client-writable schema (chair ruling, VERIFIER-8
  // HIGH-3); `cat_write` stamps created_by from auth.uid() and carries the dimension
  // as a wall rather than a column each caller filters on by hand.
  const { data, error } = await supabase.rpc(
    "cat_write",
    catWriteArgs(
      "app",
      {
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
      // platform.categories requires an owning org; applet categories are
      // platform-wide, so they belong to the Matrx System tenant.
      { organizationId },
    ),
  );
  if (error) throw error;
  if (!data)
    throw new Error(
      "That category could not be created. Reload and try again.",
    );
  return categoryRowFromDoor(data);
}

export async function updateAppletCategory(
  input: UpdateAppletCategoryInput,
): Promise<AppletCategoryRow> {
  const supabase = getClient();
  const patch: Database["platform"]["Tables"]["categories"]["Update"] = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.icon !== undefined) patch.icon = input.icon;
  if (input.sort_order !== undefined) patch.position = input.sort_order;
  // description lives in metadata. The read-modify-write that used to be here — a
  // round trip taken ONLY so a partial update would not wipe legacy_id/legacy_table —
  // is gone: `cat_write` merges the patch inside the database, so only the key that
  // changed is sent and nothing else on the column can be lost.
  const { data, error } = await supabase.rpc(
    "cat_write",
    catWriteArgs(
      "app",
      {
        name: patch.name,
        icon: patch.icon,
        position: patch.position,
        ...(input.description === undefined
          ? {}
          : { metadata: { description: input.description } }),
      },
      { id: input.id },
    ),
  );
  if (error) throw error;
  if (!data)
    throw new Error("That category is no longer available. Reload the list.");
  return categoryRowFromDoor(data);
}

export async function deleteAppletCategory(id: string): Promise<void> {
  const supabase = getClient();
  // 🚨 SOFT, NOW. This was a HARD `.delete()` on a table more than thirty tables carry
  // a foreign key to, several of them ON DELETE SET NULL — so destroying an applet
  // category silently NULLed a live column on every row that named it.
  const { data, error } = await supabase.rpc("cat_archive", {
    p_dimension: "app",
    p_category_id: id,
  });
  if (error) throw error;
  if (!data)
    throw new Error("That category is no longer available. Reload the list.");
}

export async function fetchAppletsAdmin(filters?: {
  status?: string;
  is_featured?: boolean;
  is_verified?: boolean;
  category?: string;
  limit?: number;
  /** Filter by ownership scope. `"global"` returns system apps (created_by IS
   *  NULL); `"user"` returns user-owned apps (created_by IS NOT NULL). Omit for
   *  all. */
  scope?: "global" | "user";
}): Promise<AppletAdminView[]> {
  const supabase = getClient();
  const limit = filters?.limit;
  const makeQuery = (range?: { from: number; to: number }) => {
    let query = supabase
      .schema("app")
      .from("definition")
      .select("*")
      .is("deleted_at", null)
      .order("updated_at", { ascending: false });

    if (filters?.status) query = query.eq("status", filters.status);
    if (filters?.is_featured !== undefined)
      query = query.eq("is_featured", filters.is_featured);
    if (filters?.is_verified !== undefined)
      query = query.eq("is_verified", filters.is_verified);
    if (filters?.category) query = query.eq("category", filters.category);
    if (filters?.scope === "global") query = query.is("created_by", null);
    if (filters?.scope === "user") query = query.not("created_by", "is", null);
    return range ? query.range(range.from, range.to) : query;
  };

  const data = limit
    ? await (async () => {
        const { data: limited, error } = await makeQuery().limit(limit);
        if (error) throw error;
        return limited ?? [];
      })()
    : await readAllRows<Database["app"]["Tables"]["definition"]["Row"]>(
        ({ from, to }) => makeQuery({ from, to }),
        { label: "app.definition (Applets administration)" },
      );

  if (data && data.length > 0) {
    const userIds = [
      ...new Set(data.map((r) => r.created_by).filter((v): v is string => !!v)),
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
        job_keys: appletJobs(item).map((j) => j.key),
        creator_email: item.created_by
          ? userMap.get(item.created_by)?.email
          : undefined,
      })) as AppletAdminView[];
    }
  }
  return (data ?? []).map((item) => ({
    ...item,
    job_keys: appletJobs(item).map((j) => j.key),
    creator_email: undefined,
  })) as AppletAdminView[];
}

export async function getAppletById(
  id: string,
): Promise<AppletAdminView | null> {
  const supabase = getClient();
  const { data, error } = await supabase
    .schema("app")
    .from("definition")
    .select("*")
    .is("deleted_at", null)
    .eq("id", id)
    .single();
  if (error) {
    if (error.code === "PGRST116") return null;
    throw error;
  }
  return { ...data, job_keys: appletJobs(data).map((j) => j.key) } as AppletAdminView;
}

export async function updateAppletAdmin(
  input: UpdateAppletAdminInput,
): Promise<AppletAdminView> {
  const supabase = getClient();
  const patch: Database["app"]["Tables"]["definition"]["Update"] = {};
  if (input.status !== undefined) patch.status = input.status;
  if (input.is_verified !== undefined) patch.is_verified = input.is_verified;
  if (input.is_featured !== undefined) patch.is_featured = input.is_featured;
  if (input.published_to_web !== undefined)
    patch.published_to_web = input.published_to_web;
  if (input.rate_limit_per_ip !== undefined)
    patch.rate_limit_per_ip = input.rate_limit_per_ip;
  if (input.rate_limit_window_hours !== undefined)
    patch.rate_limit_window_hours = input.rate_limit_window_hours;
  if (input.rate_limit_authenticated !== undefined)
    patch.rate_limit_authenticated = input.rate_limit_authenticated;

  const { data, error } = await writeOneRow(
    supabase
      .schema("app")
      .from("definition")
      .update(patch)
      .eq("id", input.id)
      .select(),
    { action: "update", noun: "definition" },
  );
  if (error) throw error;
  return { ...data, job_keys: appletJobs(data).map((j) => j.key) } as AppletAdminView;
}

export async function fetchAppletExecutions(filters?: {
  app_id?: string;
  success?: boolean;
  limit?: number;
}): Promise<AppletExecutionRow[]> {
  const supabase = getClient();
  let query = supabase
    .schema("app")
    .from("execution")
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
      .schema("app")
      .from("definition")
      .select("id, name, slug")
      .in("id", appIds);
    if (appsError) throw appsError;
    const appMap = new Map((apps ?? []).map((a) => [a.id, a]));
    return data.map((item) => ({
      ...item,
      user_id: item.runner_user_id,
      app_name: appMap.get(item.app_id)?.name,
      app_slug: appMap.get(item.app_id)?.slug,
    })) as AppletExecutionRow[];
  }
  return (data ?? []) as AppletExecutionRow[];
}

export async function fetchAppletErrors(filters?: {
  app_id?: string;
  error_type?: string;
  resolved?: boolean;
  limit?: number;
}): Promise<AppletErrorRow[]> {
  const supabase = getClient();
  let query = supabase
    .schema("app")
    .from("error")
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
      .schema("app")
      .from("definition")
      .select("id, name, slug")
      .in("id", appIds);
    if (appsError) throw appsError;
    const appMap = new Map((apps ?? []).map((a) => [a.id, a]));
    return data.map((item) => ({
      ...item,
      app_name: appMap.get(item.app_id)?.name,
      app_slug: appMap.get(item.app_id)?.slug,
    })) as AppletErrorRow[];
  }
  return (data ?? []) as AppletErrorRow[];
}

export async function resolveAppletError(input: {
  id: string;
  resolution_notes?: string;
}): Promise<AppletErrorRow> {
  const supabase = getClient();
  const userId = requireUserId();
  const { data, error } = await writeOneRow(
    supabase
      .schema("app")
      .from("error")
      .update({
        resolved: true,
        resolved_at: new Date().toISOString(),
        resolved_by: userId,
        resolution_notes: input.resolution_notes ?? null,
      })
      .eq("id", input.id)
      .select(),
    { action: "update", noun: "error" },
  );
  if (error) throw error;
  return data as AppletErrorRow;
}

export async function unresolveAppletError(
  id: string,
): Promise<AppletErrorRow> {
  const supabase = getClient();
  const { data, error } = await writeOneRow(
    supabase
      .schema("app")
      .from("error")
      .update({
        resolved: false,
        resolved_at: null,
        resolved_by: null,
        resolution_notes: null,
      })
      .eq("id", id)
      .select(),
    { action: "update", noun: "error" },
  );
  if (error) throw error;
  return data as AppletErrorRow;
}

export async function fetchAppletRateLimits(filters?: {
  app_id?: string;
  is_blocked?: boolean;
  /** A bounded preview for legacy callers; omitted means the complete source. */
  limit?: number;
}): Promise<AppletRateLimitRow[]> {
  const supabase = getClient();
  const limit = filters?.limit;
  const data = limit
    ? await (async () => {
        let query = supabase
          .schema("app")
          .from("rate_limit")
          .select("*")
          .order("updated_at", { ascending: false })
          .order("id", { ascending: false });
        if (filters.app_id) query = query.eq("app_id", filters.app_id);
        if (filters.is_blocked !== undefined) {
          query = query.eq("is_blocked", filters.is_blocked);
        }
        const { data: limited, error } = await query.limit(limit);
        if (error) throw error;
        return limited ?? [];
      })()
    : await readAllRows<Database["app"]["Tables"]["rate_limit"]["Row"]>(
        ({ from, to }) => {
          let query = supabase
            .schema("app")
            .from("rate_limit")
            .select("*", { count: "exact" })
            .order("updated_at", { ascending: false })
            .order("id", { ascending: false });
          if (filters?.app_id) query = query.eq("app_id", filters.app_id);
          if (filters?.is_blocked !== undefined) {
            query = query.eq("is_blocked", filters.is_blocked);
          }
          return query.range(from, to);
        },
        { label: "app.rate_limit (Applets administration)" },
      );

  if (data.length > 0) {
    const appIds = [...new Set(data.map((e) => e.app_id))];
    const { data: apps, error: appsError } = await supabase
      .schema("app")
      .from("definition")
      .select("id, name, slug")
      .in("id", appIds);
    if (appsError) throw appsError;
    const appMap = new Map((apps ?? []).map((a) => [a.id, a]));
    return data.map((item) => ({
      ...item,
      user_id: item.runner_user_id,
      app_name: appMap.get(item.app_id)?.name,
      app_slug: appMap.get(item.app_id)?.slug,
    })) as AppletRateLimitRow[];
  }
  return data as AppletRateLimitRow[];
}

export async function unblockAppletRateLimit(
  id: string,
): Promise<AppletRateLimitRow> {
  const supabase = getClient();
  const { data, error } = await writeOneRow(
    supabase
      .schema("app")
      .from("rate_limit")
      .update({
        is_blocked: false,
        blocked_until: null,
        blocked_reason: null,
        execution_count: 0,
        window_start_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select(),
    { action: "update", noun: "rate limit" },
  );
  if (error) throw error;
  return data as AppletRateLimitRow;
}

export async function blockAppletRateLimit(
  id: string,
  reason?: string,
  blockedUntil?: Date,
): Promise<AppletRateLimitRow> {
  const supabase = getClient();
  const { data, error } = await writeOneRow(
    supabase
      .schema("app")
      .from("rate_limit")
      .update({
        is_blocked: true,
        blocked_until: blockedUntil?.toISOString() ?? null,
        blocked_reason: reason ?? null,
      })
      .eq("id", id)
      .select(),
    { action: "update", noun: "rate limit" },
  );
  if (error) throw error;
  return data as AppletRateLimitRow;
}
