import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase as browserClient } from "@/utils/supabase/client";

/**
 * The PUBLIC, non-secret view of an agent — everything a guest needs to RUN it,
 * and nothing that reveals how it works.
 *
 * 🚨 RUNNING IS NOT A CAPABILITY OF *EVERY* AGENT — it is a capability of every
 * agent you are allowed to SEE, and those are different sets. Until DD-116
 * (2026-09-11) this RPC had no visibility test at all: anyone holding the
 * published anon key and an agent UUID read the name, description, launch
 * variables and context policies of any of the 628 `card_visibility='internal'`
 * agents on the platform. The gate now lives in the function body
 * (`migrations/dd116_agent_public_door_visibility_gate.sql`):
 *
 *   - anonymous caller → `card_visibility = 'public'` rows only. (The gate is
 *     `card_visibility`, never `visibility`: `agent.definition` carries
 *     `agent_definition_body_not_public_chk`, so an agent BODY is never public
 *     and a `visibility='public'` filter would match zero rows by construction.
 *     The CARD is the public face — db-rules §6a.)
 *   - signed-in caller → the above, plus anything
 *     `iam.has_access('agent', id, 'viewer')` admits.
 *
 * The SECRETS (prompt/messages, settings, model, tools, mcp servers) stay
 * server-side either way, and only a share reveals them (via the builder).
 * See the run/share/fork model in `docs/handoffs/SHARING_GUEST_FEATURES_HANDOFF.md`.
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
  /** Declared context policies the run needs filled. */
  contextPolicies: unknown;
  agentType: string;
  category: string | null;
  tags: string[];
}

/**
 * Resolve the public (non-secret) view of an agent by id. Works for anon and
 * authenticated callers alike, but they do NOT see the same set — see above.
 *
 * Returns null when the id is missing, soft-deleted, OR not visible to this
 * caller, and those three are deliberately indistinguishable: an anonymous
 * caller must not learn that a non-public agent exists (access DECISIONS,
 * 2026-08-11). Never render "no permission" copy from a null here — it would
 * confirm the very thing the door refuses to confirm.
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
    contextPolicies: row.context_policies,
    agentType: row.agent_type,
    category: row.category ?? null,
    tags: row.tags ?? [],
  };
}
