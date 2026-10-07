import "server-only";
import { cache } from "react";
import { createClient } from "@/utils/supabase/server";
import { notFound } from "next/navigation";
import {
  dbRowToAgentDefinition,
  versionSnapshotRowToAgentDefinition,
} from "@ai-matrx/chat/agents/redux/agent-definition/converters";
import { parseAgentVersionSnapshot } from "@ai-matrx/chat/agents/redux/agent-definition/parse-output-snapshot";
import type {
  AgentDefinition,
  AgentListRow,
} from "@ai-matrx/chat/agents/types/agent-definition.types";

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
 * Full live agent row. Wrapped in cache() so layout + generateMetadata + page
 * all call this — React deduplicates to one DB hit per request.
 *
 * Returns `null` on a missing/unauthorized/deleted row rather than asserting
 * which one it is — under RLS a denied, deleted, never-existed, and
 * session-expired read all come back as the same `{ data: null, error: null }`
 * shape. Callers render `<AccessGate token="agent" id={id} />`, which asks
 * `access_denied_context` for the real answer instead of guessing "not found".
 */
export const getAgent = cache(
  async (id: string): Promise<AgentDefinition | null> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .schema("agent")
      .from("definition")
      .select("*")
      .is("deleted_at", null)
      .eq("id", id)
      .single();
    if (error || !data) return null;
    return dbRowToAgentDefinition(data);
  },
);

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
      parseAgentVersionSnapshot(raw),
    );
  },
);

