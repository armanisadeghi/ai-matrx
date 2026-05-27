"use client";

import { createClient } from "@/utils/supabase/client";
import type { Database } from "@/types/database.types";

type Tables = Database["public"]["Tables"];
export type McpServerRow = Tables["tool_mcp_server"]["Row"];
export type McpConfigRow = Tables["tool_mcp_config"]["Row"];

const sb = () => createClient();

export async function listServers(): Promise<McpServerRow[]> {
  const { data, error } = await sb()
    .from("tool_mcp_server")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function listServerConfigs(serverId: string): Promise<McpConfigRow[]> {
  const { data, error } = await sb()
    .from("tool_mcp_config")
    .select("*")
    .eq("server_id", serverId)
    .order("is_default", { ascending: false })
    .order("label", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/**
 * Tools owned by an MCP server.
 * The 2026 refactor introduced `tool_def.managed_by_server_id` as the
 * authoritative link — preferred over the legacy `${slug}:%` name pattern.
 */
export async function listServerTools(
  serverId: string,
): Promise<{ id: string; name: string; description: string; is_active: boolean | null }[]> {
  const { data, error } = await sb()
    .from("tool_def")
    .select("id, name, description, is_active")
    .eq("managed_by_server_id", serverId)
    .order("name", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function countConnectedUsers(serverId: string): Promise<number> {
  const { count, error } = await sb()
    .from("tool_mcp_user_conn")
    .select("id", { count: "exact", head: true })
    .eq("server_id", serverId);
  if (error) throw error;
  return count ?? 0;
}

export async function setServerStatus(
  serverId: string,
  status: Database["public"]["Enums"]["mcp_server_status"],
): Promise<void> {
  const { error } = await sb().from("tool_mcp_server").update({ status }).eq("id", serverId);
  if (error) throw error;
}

// ─── tool_mcp_config CRUD ────────────────────────────────────────────────────

export type McpConfigUpsert = Database["public"]["Tables"]["tool_mcp_config"]["Insert"];

export async function createServerConfig(args: {
  serverId: string;
  label: string;
  configType: string;
  command: string;
  argsArr: string[];
  envSchema?: Database["public"]["Tables"]["tool_mcp_config"]["Insert"]["env_schema"];
  isDefault?: boolean;
  npmPackage?: string | null;
  pipPackage?: string | null;
  minNodeVersion?: string | null;
  requiresDocker?: boolean;
  notes?: string | null;
}): Promise<McpConfigRow> {
  // If this row is being set default, unset the others on the same server first.
  if (args.isDefault) {
    const { error: clearErr } = await sb()
      .from("tool_mcp_config")
      .update({ is_default: false })
      .eq("server_id", args.serverId);
    if (clearErr) throw clearErr;
  }
  const { data, error } = await sb()
    .from("tool_mcp_config")
    .insert({
      server_id: args.serverId,
      label: args.label,
      config_type: args.configType,
      command: args.command,
      args: args.argsArr,
      env_schema: (args.envSchema ?? []) as never,
      is_default: args.isDefault ?? false,
      npm_package: args.npmPackage ?? null,
      pip_package: args.pipPackage ?? null,
      min_node_version: args.minNodeVersion ?? null,
      requires_docker: args.requiresDocker ?? false,
      notes: args.notes ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateServerConfig(
  configId: string,
  patch: Partial<{
    label: string;
    config_type: string;
    command: string;
    args: string[];
    env_schema: Database["public"]["Tables"]["tool_mcp_config"]["Update"]["env_schema"];
    is_default: boolean;
    npm_package: string | null;
    pip_package: string | null;
    min_node_version: string | null;
    requires_docker: boolean;
    notes: string | null;
  }>,
): Promise<void> {
  // If we're setting default, clear the others on the same server first.
  if (patch.is_default) {
    const { data: row, error: lookupErr } = await sb()
      .from("tool_mcp_config")
      .select("server_id")
      .eq("id", configId)
      .single();
    if (lookupErr) throw lookupErr;
    const { error: clearErr } = await sb()
      .from("tool_mcp_config")
      .update({ is_default: false })
      .eq("server_id", row.server_id)
      .neq("id", configId);
    if (clearErr) throw clearErr;
  }
  const { error } = await sb().from("tool_mcp_config").update(patch).eq("id", configId);
  if (error) throw error;
}

export async function deleteServerConfig(configId: string): Promise<void> {
  const { error } = await sb().from("tool_mcp_config").delete().eq("id", configId);
  if (error) throw error;
}

/** Count of user connections referencing a specific config (used in the delete confirm). */
export async function countConfigUserConnections(configId: string): Promise<number> {
  const { count, error } = await sb()
    .from("tool_mcp_user_conn")
    .select("id", { count: "exact", head: true })
    .eq("config_id", configId);
  if (error) throw error;
  return count ?? 0;
}

export interface SyncFreshness {
  state: "fresh" | "stale" | "errored" | "never";
  ageSec: number | null;
  ttlSec: number;
  lastError: string | null;
}

export function computeFreshness(server: McpServerRow): SyncFreshness {
  const ttlSec = server.discovery_ttl_seconds;
  const lastError = server.last_sync_error;
  if (!server.last_synced_at) {
    return { state: "never", ageSec: null, ttlSec, lastError };
  }
  const ageMs = Date.now() - new Date(server.last_synced_at).getTime();
  const ageSec = Math.floor(ageMs / 1000);
  if (lastError) return { state: "errored", ageSec, ttlSec, lastError };
  if (ageSec > ttlSec) return { state: "stale", ageSec, ttlSec, lastError };
  return { state: "fresh", ageSec, ttlSec, lastError };
}

export function formatRelativeAge(seconds: number | null): string {
  if (seconds === null) return "never";
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export async function refreshServer(serverId: string): Promise<void> {
  const res = await fetch(`/api/mcp/servers/${serverId}/refresh`, { method: "POST" });
  if (!res.ok) {
    let detail = "";
    try {
      detail = (await res.json()).error ?? "";
    } catch {
      /* ignore */
    }
    throw new Error(detail || `Refresh failed (${res.status})`);
  }
}

export interface McpTestResult {
  ok: boolean;
  reachable: boolean;
  statusCode: number | null;
  latencyMs: number | null;
  error: string | null;
  transport: string;
  endpointTested: string | null;
  message: string;
}

/**
 * Probe an MCP server's endpoint URL from the Next.js server runtime.
 * Persists the outcome to tool_mcp_server.last_test_* so the freshness UI
 * can read it without re-running the test. See
 * `app/api/admin/mcp/[serverId]/test/route.ts` for the test semantics
 * (any HTTP response = reachable; only 5xx / network errors = unhealthy).
 */
export async function testMcpServer(serverId: string): Promise<McpTestResult> {
  const res = await fetch(`/api/admin/mcp/${serverId}/test`, { method: "POST" });
  if (!res.ok) {
    let detail = "";
    try {
      detail = (await res.json()).error ?? "";
    } catch {
      /* ignore */
    }
    throw new Error(detail || `Test failed (${res.status})`);
  }
  return res.json() as Promise<McpTestResult>;
}

export interface TestFreshness {
  state: "untested" | "ok" | "errored";
  ageSec: number | null;
  ok: boolean | null;
  statusCode: number | null;
  latencyMs: number | null;
  error: string | null;
}

export function computeTestFreshness(server: McpServerRow): TestFreshness {
  if (!server.last_tested_at) {
    return {
      state: "untested",
      ageSec: null,
      ok: null,
      statusCode: server.last_test_status_code ?? null,
      latencyMs: server.last_test_latency_ms ?? null,
      error: server.last_test_error ?? null,
    };
  }
  const ageMs = Date.now() - new Date(server.last_tested_at).getTime();
  const ageSec = Math.floor(ageMs / 1000);
  return {
    state: server.last_test_ok ? "ok" : "errored",
    ageSec,
    ok: server.last_test_ok,
    statusCode: server.last_test_status_code ?? null,
    latencyMs: server.last_test_latency_ms ?? null,
    error: server.last_test_error ?? null,
  };
}

export interface ProvisionMcpServerInput {
  slug: string;
  name: string;
  vendor: string;
  category: Database["public"]["Enums"]["mcp_server_category"];
  transport: Database["public"]["Enums"]["mcp_transport"];
  authStrategy: Database["public"]["Enums"]["mcp_auth_strategy"];
  endpointUrl?: string;
  description?: string;
  iconUrl?: string;
  color?: string;
  docsUrl?: string;
  websiteUrl?: string;
  status?: Database["public"]["Enums"]["mcp_server_status"];
  isOfficial?: boolean;
  oauthScopes?: string[];
}

export interface ProvisionMcpServerResult {
  server_id: string;
  server_slug: string;
  /** Name of the paired `tool_executor` row (was "executor_kind" pre-2026). */
  executor: string;
  bundle_id: string;
  bundle_name: string;
  lister_tool_id: string;
  lister_name: string;
  next_step: string;
}

/**
 * Atomic 5-step MCP provisioning. Inserts:
 *   1. tool_mcp_server row
 *   2. paired tool_executor row named `mcp.<slug>` (mcp_server_id = new server)
 *   3. lister tool in tool_def named `bundle:list_<slug>`
 *   4. system bundle in tool_bundle named <slug>, lister linked
 *
 * Returns IDs of all created rows + the recommended next step
 * (POST /api/mcp/servers/<id>/refresh to fetch the catalog).
 */
export async function provisionMcpServer(
  input: ProvisionMcpServerInput,
): Promise<ProvisionMcpServerResult> {
  const { data, error } = await sb().rpc("provision_mcp_server", {
    p_slug: input.slug,
    p_name: input.name,
    p_vendor: input.vendor,
    p_category: input.category,
    p_transport: input.transport,
    p_auth_strategy: input.authStrategy,
    p_endpoint_url: input.endpointUrl ?? undefined,
    p_description: input.description ?? undefined,
    p_icon_url: input.iconUrl ?? undefined,
    p_color: input.color ?? undefined,
    p_docs_url: input.docsUrl ?? undefined,
    p_website_url: input.websiteUrl ?? undefined,
    p_status: input.status ?? undefined,
    p_is_official: input.isOfficial ?? undefined,
    p_oauth_scopes: input.oauthScopes ?? undefined,
  });
  if (error) throw error;
  return data as unknown as ProvisionMcpServerResult;
}
