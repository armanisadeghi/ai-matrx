"use client";

import { createClient } from "@/utils/supabase/client";
import type { Database } from "@/types/database.types";

type Tables = Database["public"]["Tables"];
export type BundleRow = Tables["tool_bundle"]["Row"];
export type BundleMemberRow = Tables["tool_bundle_member"]["Row"];
export type BundleUpsert = Tables["tool_bundle"]["Insert"];

export interface BundleMemberWithTool {
  member: BundleMemberRow;
  tool: { id: string; name: string; description: string; is_active: boolean | null } | null;
}

const sb = () => createClient();

export async function listBundles(opts?: { includeInactive?: boolean }): Promise<BundleRow[]> {
  let q = sb().from("tool_bundle").select("*").order("name", { ascending: true });
  if (!opts?.includeInactive) {
    q = q.eq("is_active", true);
  }
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function getBundle(id: string): Promise<BundleRow> {
  const { data, error } = await sb().from("tool_bundle").select("*").eq("id", id).single();
  if (error) throw error;
  return data;
}

export async function listBundleMembers(bundleId: string): Promise<BundleMemberWithTool[]> {
  const { data, error } = await sb()
    .from("tool_bundle_member")
    .select("*, tool:tool_def(id, name, description, is_active)")
    .eq("bundle_id", bundleId)
    .order("sort_order", { ascending: true })
    .order("local_alias", { ascending: true });
  if (error) throw error;
  type Joined = BundleMemberRow & {
    tool: { id: string; name: string; description: string; is_active: boolean | null } | null;
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

export async function updateBundle(
  id: string,
  patch: Partial<{
    name: string;
    description: string;
    is_active: boolean;
    metadata: Database["public"]["Tables"]["tool_bundle"]["Update"]["metadata"];
    lister_tool_id: string | null;
  }>,
): Promise<BundleRow> {
  const { data, error } = await sb()
    .from("tool_bundle")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function setBundleMemberAlias(
  bundleId: string,
  toolId: string,
  alias: string,
): Promise<void> {
  const { error } = await sb()
    .from("tool_bundle_member")
    .update({ local_alias: alias })
    .eq("bundle_id", bundleId)
    .eq("tool_id", toolId);
  if (error) throw error;
}

export async function addBundleMember(args: {
  bundleId: string;
  toolId: string;
  localAlias: string;
  sortOrder?: number;
}): Promise<void> {
  const { error } = await sb().from("tool_bundle_member").insert({
    bundle_id: args.bundleId,
    tool_id: args.toolId,
    local_alias: args.localAlias,
    sort_order: args.sortOrder ?? 100,
  });
  if (error) throw error;
}

export async function removeBundleMember(bundleId: string, toolId: string): Promise<void> {
  const { error } = await sb()
    .from("tool_bundle_member")
    .delete()
    .eq("bundle_id", bundleId)
    .eq("tool_id", toolId);
  if (error) throw error;
}

export async function searchToolsForBundle(query: string): Promise<
  { id: string; name: string; description: string }[]
> {
  let q = sb().from("tool_def").select("id, name, description").eq("is_active", true);
  if (query.trim()) {
    q = q.ilike("name", `%${query.trim()}%`);
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
