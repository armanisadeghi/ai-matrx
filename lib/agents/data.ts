import "server-only";
import { cache } from "react";
import { createClient } from "@/utils/supabase/server";
import { notFound } from "next/navigation";
import {
  dbRowToAgentDefinition,
  versionSnapshotRowToAgentDefinition,
} from "@/features/agents/redux/agent-definition/converters";
import type {
  AgentDefinition,
  AgentListRow,
  AgentVersionSnapshot,
} from "@/features/agents/types/agent-definition.types";

/**
 * SSR seed for the agents list page.
 * Uses agx_get_list RPC with pagination — p_limit: 30 for the initial page.
 * Client dispatches fetchAgentsList() (no limit) to backfill all agents.
 */
export const getAgentListSeed = cache(async () => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("agx_get_list", {
    p_limit: 30,
    p_offset: 0,
  });
  if (error) throw error;
  return (data ?? []) as AgentListRow[];
});

/**
 * SSR seed for the admin system-agents list page. Returns every builtin
 * (global/system) agent — no pagination, no scope filter. Backed by
 * agx_get_list_full (same RPC used by `fetchAgentsListFull`) filtered
 * client-side to `agent_type = 'builtin'`.
 *
 * Called from the admin route; client then dispatches `fetchAgentsListFull()`
 * to populate the Redux slice for selectors like `selectBuiltinAgents`.
 */
export const getSystemAgentListSeed = cache(async () => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("agx_get_list_full");
  if (error) throw error;
  const rows = (data ?? []) as AgentListRow[];
  return rows.filter((row) => row.agent_type === "builtin");
});

/**
 * Full live agent row. Wrapped in cache() so layout + generateMetadata + page
 * all call this — React deduplicates to one DB hit per request.
 * Calls notFound() on missing/unauthorized — triggers not-found.tsx.
 */
export const getAgent = cache(async (id: string): Promise<AgentDefinition> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("agx_agent")
    .select("*")
    .eq("id", id)
    .single();
  if (error || !data) notFound();
  return dbRowToAgentDefinition(data);
});

/**
 * Version snapshot for /agents/{id}/{version} comparison page.
 * Uses agx_get_version_snapshot RPC. Result is converted via
 * versionSnapshotRowToAgentDefinition so SSR and client thunk use identical logic.
 */
export const getAgentSnapshot = cache(
  async (id: string, versionNumber: number): Promise<AgentDefinition> => {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("agx_get_version_snapshot", {
      p_agent_id: id,
      p_version_number: versionNumber,
    });
    if (error) notFound();
    const raw = Array.isArray(data) ? data[0] : data;
    if (!raw) notFound();
    return versionSnapshotRowToAgentDefinition(
      id,
      raw as unknown as AgentVersionSnapshot,
    );
  },
);

/**
 * Apps that run a specific agent — backs `/agents/[id]/apps`.
 *
 * `aga_apps.agent_id` is a real FK to `agx_agent.id`, so the relationship
 * is direct (no compiled-recipe indirection). RLS gates the query: the
 * caller sees their own apps + public published apps + org/admin apps
 * per the standard agent-apps policy.
 */
export const getAppsForAgent = cache(async (agentId: string) => {
  const supabase = await createClient();
  const { data, error } = await (
    supabase as unknown as {
      from: (table: string) => {
        select: (columns: string) => {
          eq: (
            column: string,
            value: string,
          ) => {
            order: (
              column: string,
              opts: { ascending: boolean },
            ) => Promise<{ data: unknown; error: unknown }>;
          };
        };
      };
    }
  )
    .schema("app")
    .from("definition")
    .select(
      "id, slug, name, tagline, description, category, tags, preview_image_url, favicon_url, status, is_public, is_featured, total_executions, last_execution_at, agent_id, agent_version_id, use_latest, created_at, updated_at",
    )
    .eq("agent_id", agentId)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data as Record<string, unknown>[] | null) ?? [];
});

/**
 * Surface bindings for a specific agent. Backs `/agents/[id]/surfaces`.
 *
 * Returns every `agx_agent_surface` row visible to the caller for this agent
 * — global (all scope FKs null), the caller's personal binding, their org
 * bindings, and project/task scopes per RLS. The page UI groups by scope.
 *
 * Joined columns from `ui_surface` are included so the user can see the
 * client / description / is_active without a second round-trip.
 */
export const getSurfacesForAgent = cache(async (agentId: string) => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("agx_agent_surface")
    .select(
      `
      id,
      agent_id,
      surface_name,
      user_id,
      organization_id,
      project_id,
      task_id,
      value_mappings,
      created_at,
      ui_surface:surface_name (
        name,
        client_name,
        description,
        sort_order,
        is_active
      )
    `,
    )
    .eq("agent_id", agentId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
});
