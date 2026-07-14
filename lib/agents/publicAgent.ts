import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase as browserClient } from "@/utils/supabase/client";

/**
 * The PUBLIC, non-secret view of an agent — everything a logged-out guest needs
 * to RUN it, and nothing that reveals how it works.
 *
 * Running is a public capability of every agent (see the run/share/fork model in
 * `docs/handoffs/SHARING_GUEST_FEATURES_HANDOFF.md`): the non-secret fields are
 * readable by anyone, so a guest can fill the variable form and invoke the agent,
 * while the SECRETS (prompt/messages, settings, model, tools, mcp servers) stay
 * server-side and only a share reveals them (via the builder).
 *
 * Backed by the `public.get_agent_public` SECURITY DEFINER RPC — the ONLY
 * sanctioned way to read an agent's fields without a share. Never widen this to
 * pull secret columns, and never read `agent.definition` directly from a guest
 * surface (RLS returns 0 rows for anon, and `agx_get_execution_full` leaks the
 * secret payload to any caller RLS lets read).
 */
export interface PublicAgent {
  id: string;
  name: string;
  description: string | null;
  /** Declared launch variables — drives the guest run form. */
  variableDefinitions: unknown;
  /** Declared context slots the run needs filled. */
  contextSlots: unknown;
  agentType: string;
  category: string | null;
  tags: string[];
}

/**
 * Resolve the public (non-secret) view of an agent by id. Works for anon and
 * authenticated callers alike. Returns null when the id is missing/soft-deleted.
 *
 * Pass an explicit client for SSR (`createClient()` from `@/utils/supabase/server`);
 * omit it on the client to use the browser client.
 */
export async function getAgentPublic(
  agentId: string,
  client?: SupabaseClient,
): Promise<PublicAgent | null> {
  if (!agentId) return null;
  const db = (client ?? (browserClient as unknown as SupabaseClient));
  const { data, error } = await db.rpc("get_agent_public", {
    p_agent_id: agentId,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? null,
    variableDefinitions: row.variable_definitions,
    contextSlots: row.context_slots,
    agentType: row.agent_type,
    category: row.category ?? null,
    tags: row.tags ?? [],
  };
}
