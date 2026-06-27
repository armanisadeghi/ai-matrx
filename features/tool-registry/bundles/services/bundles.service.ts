"use client";

import { createClient } from "@/utils/supabase/client";
import { buildSearchOr } from "@/utils/supabase-search";
import type { Database } from "@/types/database.types";

type Tables = Database["public"]["Tables"];
type ToolTables = Database["tool"]["Tables"];
export type BundleRow = ToolTables["bundle"]["Row"];
export type BundleMemberRow = ToolTables["bundle_member"]["Row"];
export type BundleUpsert = ToolTables["bundle"]["Insert"];

export interface BundleMemberWithTool {
  member: BundleMemberRow;
  tool: {
    id: string;
    name: string;
    description: string;
    is_active: boolean | null;
  } | null;
}

const sb = () => createClient();

export async function listBundles(opts?: {
  includeInactive?: boolean;
}): Promise<BundleRow[]> {
  let q = sb()
    .schema("tool").from("bundle")
    .select("*")
    .order("name", { ascending: true });
  if (!opts?.includeInactive) {
    q = q.eq("is_active", true);
  }
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function getBundle(id: string): Promise<BundleRow> {
  const { data, error } = await sb()
    .schema("tool").from("bundle")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}

/**
 * A bundle shaped for the agent / surface tool pickers.
 *
 * A bundle is "addable" to an agent (or a surface) by writing one or more
 * `tool_def` UUIDs into the agent's `tools` array. Which UUIDs depends on the
 * bundle's shape:
 *
 *  - **Lister bundle** (`listerToolId` set): adding the bundle = adding the
 *    single `bundle:list_<name>` lister tool. The model sees ONE tool; when it
 *    calls the lister, the backend (`bundle_lister.py`) resolves the members
 *    and hot-swaps them in for the rest of the run. This is the context-saving
 *    path — N member tools cost one tool slot until actually needed.
 *  - **Static bundle** (`listerToolId` null, e.g. `agent-core`): adding the
 *    bundle = adding every member `tool_def` UUID directly (no lister).
 *
 * `contributedToolIds` is exactly the set to add/remove for the agent, so the
 * picker never has to branch on shape.
 */
/** A tool recorded as a member of a bundle (`tool_bundle_member` → `tool_def`). */
export interface BundleMemberTool {
  id: string;
  name: string;
  isActive: boolean;
}

export interface AgentBundleOption {
  id: string;
  name: string;
  description: string;
  isSystem: boolean;
  listerToolId: string | null;
  /** Auto-managed MCP-server bundle (members discovered at runtime). */
  isMcp: boolean;
  serverSlug: string | null;
  /** Concrete member rows recorded in `tool_bundle_member`. MCP bundles report
   * 0 until first discovery — they expand on demand via the lister. */
  memberCount: number;
  /** The member tools, in sort order, for the "included tools" list. Empty for
   * auto-managed MCP bundles (their tools aren't known until runtime). */
  members: BundleMemberTool[];
  /** "lister" → one lister tool the model expands; "static" → members added directly. */
  loadMode: "lister" | "static";
  /** The `tool_def` UUID(s) to toggle on the agent for this bundle. */
  contributedToolIds: string[];
}

/**
 * Lists the bundles that can be added to an agent or surface, already shaped
 * for a picker. Reads are public (RLS SELECT policy `true` on both tables), so
 * this stays client-side — no admin route needed.
 *
 * Excluded on purpose: **shared-lister** bundles (>1 bundle pointing at the
 * same lister tool — today the 14 browser bundles that all share
 * `load_browser_tools`). They are facets of a single runtime category-loader,
 * not independently addable units; toggling any one would toggle the shared
 * tool for all. The `load_browser_tools` tool itself still appears in normal
 * tool browsing for anyone who wants it directly.
 */
export async function listAgentBundleOptions(): Promise<AgentBundleOption[]> {
  const client = sb();
  const [bundlesRes, membersRes] = await Promise.all([
    client
      .schema("tool").from("bundle")
      .select("*")
      .eq("is_active", true)
      .order("is_system", { ascending: true })
      .order("name", { ascending: true }),
    client
      .schema("tool").from("bundle_member")
      .select("bundle_id, tool_id, sort_order, tool:definition(id, name, is_active)")
      .order("sort_order", { ascending: true }),
  ]);
  if (bundlesRes.error) throw bundlesRes.error;
  if (membersRes.error) throw membersRes.error;

  const bundles = (bundlesRes.data ?? []) as BundleRow[];
  const members = (membersRes.data ?? []) as Array<{
    bundle_id: string;
    tool_id: string;
    sort_order: number;
    tool: { id: string; name: string; is_active: boolean } | null;
  }>;

  // Member tools grouped by bundle, in sort order. We carry the names so the
  // picker can show the "included tools" list, not just a count.
  const membersByBundle = new Map<string, BundleMemberTool[]>();
  for (const m of members) {
    const tool: BundleMemberTool = {
      id: m.tool_id,
      name: m.tool?.name ?? m.tool_id,
      isActive: m.tool?.is_active ?? false,
    };
    const arr = membersByBundle.get(m.bundle_id);
    if (arr) arr.push(tool);
    else membersByBundle.set(m.bundle_id, [tool]);
  }

  // Detect shared listers: any lister tool referenced by more than one active
  // bundle is a shared runtime loader, not a per-bundle lister.
  const listerUseCount = new Map<string, number>();
  for (const b of bundles) {
    if (b.lister_tool_id) {
      listerUseCount.set(
        b.lister_tool_id,
        (listerUseCount.get(b.lister_tool_id) ?? 0) + 1,
      );
    }
  }

  const options: AgentBundleOption[] = [];
  for (const b of bundles) {
    const memberTools = membersByBundle.get(b.id) ?? [];
    const memberIds = memberTools.map((t) => t.id);
    const sharedLister =
      !!b.lister_tool_id && (listerUseCount.get(b.lister_tool_id) ?? 0) > 1;
    if (sharedLister) continue;

    const meta = (b.metadata ?? {}) as Record<string, unknown>;
    const serverSlug =
      typeof meta.server_slug === "string" ? meta.server_slug : null;

    const contributedToolIds = b.lister_tool_id
      ? [b.lister_tool_id]
      : memberIds;
    // A bundle with neither a lister nor members contributes nothing — skip it
    // rather than offer a no-op toggle.
    if (contributedToolIds.length === 0) continue;

    options.push({
      id: b.id,
      name: b.name,
      description: b.description,
      isSystem: b.is_system,
      listerToolId: b.lister_tool_id,
      isMcp: !!serverSlug,
      serverSlug,
      memberCount: memberTools.length,
      members: memberTools,
      loadMode: b.lister_tool_id ? "lister" : "static",
      contributedToolIds,
    });
  }
  return options;
}

export async function listBundleMembers(
  bundleId: string,
): Promise<BundleMemberWithTool[]> {
  const { data, error } = await sb()
    .schema("tool").from("bundle_member")
    .select("*, tool:definition(id, name, description, is_active)")
    .eq("bundle_id", bundleId)
    .order("sort_order", { ascending: true })
    .order("local_alias", { ascending: true });
  if (error) throw error;
  type Joined = BundleMemberRow & {
    tool: {
      id: string;
      name: string;
      description: string;
      is_active: boolean | null;
    } | null;
  };
  return ((data ?? []) as Joined[]).map((row) => ({
    member: {
      bundle_id: row.bundle_id,
      tool_id: row.tool_id,
      local_alias: row.local_alias,
      sort_order: row.sort_order,
      created_at: row.created_at,
    },
    tool: row.tool,
  }));
}

// Writes to tool_bundle / tool_bundle_member can't go through the browser client:
// both tables are RLS-protected with a read-only SELECT policy and no write
// policy, so a user-session write silently affects zero rows. These mutations
// are routed through admin-gated Next.js API routes that use the service client.
// (Reads above stay client-side — public SELECT works fine.)
async function adminFetch(url: string, init: RequestInit): Promise<any> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      json?.error || json?.details || `Request failed (${res.status})`,
    );
  }
  return json;
}

export async function updateBundle(
  id: string,
  patch: Partial<{
    name: string;
    description: string;
    is_active: boolean;
    metadata: Database["tool"]["Tables"]["bundle"]["Update"]["metadata"];
    lister_tool_id: string | null;
  }>,
): Promise<BundleRow> {
  const json = await adminFetch(`/api/admin/bundles/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
  return json.bundle as BundleRow;
}

export async function setBundleMemberAlias(
  bundleId: string,
  toolId: string,
  alias: string,
): Promise<void> {
  await adminFetch(`/api/admin/bundles/${bundleId}/members/${toolId}`, {
    method: "PATCH",
    body: JSON.stringify({ local_alias: alias }),
  });
}

export async function addBundleMember(args: {
  bundleId: string;
  toolId: string;
  localAlias: string;
  sortOrder?: number;
}): Promise<void> {
  await adminFetch(`/api/admin/bundles/${args.bundleId}/members`, {
    method: "POST",
    body: JSON.stringify({
      tool_id: args.toolId,
      local_alias: args.localAlias,
      sort_order: args.sortOrder ?? 100,
    }),
  });
}

export async function removeBundleMember(
  bundleId: string,
  toolId: string,
): Promise<void> {
  await adminFetch(`/api/admin/bundles/${bundleId}/members/${toolId}`, {
    method: "DELETE",
  });
}

export async function searchToolsForBundle(
  query: string,
): Promise<{ id: string; name: string; description: string }[]> {
  let q = sb()
    .schema("tool").from("definition")
    .select("id, name, description")
    .eq("is_active", true);
  if (query.trim()) {
    q = q.or(buildSearchOr(query, ["name"]));
  }
  const { data, error } = await q.order("name", { ascending: true }).limit(50);
  if (error) throw error;
  return data ?? [];
}

export interface CreateBundleResult {
  bundle_id: string;
}

export interface CreateBundleMemberInput {
  /** Tool name (the new RPC takes tool *names*, not ids). */
  tool_name: string;
}

/**
 * Atomic backend RPC: creates the bundle, links its lister tool (by name),
 * and inserts member rows (by tool name) in one transaction.
 *
 * RPC signature changed in the 2026 tool-system refactor:
 *   - takes tool *names* (not ids or alias structs)
 *   - returns just the new bundle uuid
 *   - lister tool must already exist (referenced by name)
 *
 * Personal bundles require an authenticated user; system bundles do not
 * (admin-only path uses service_role).
 */
export async function createBundleWithLister(args: {
  name: string;
  description?: string;
  isSystem?: boolean;
  listerToolName?: string;
  memberToolNames?: string[];
}): Promise<CreateBundleResult> {
  const { data, error } = await sb().rpc("create_bundle_with_lister", {
    p_name: args.name,
    p_description: args.description ?? "",
    p_is_system: args.isSystem ?? false,
    p_lister_tool_name: args.listerToolName ?? null,
    p_member_tool_names: args.memberToolNames ?? [],
  });
  if (error) throw error;
  return { bundle_id: data as string };
}
