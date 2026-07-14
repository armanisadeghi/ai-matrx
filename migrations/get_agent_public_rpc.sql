-- get_agent_public(p_agent_id) — the PUBLIC non-secret read surface for any agent.
--
-- The run/share/fork model: the NON-SECRET parts of every agent (id, name,
-- description, variable_definitions, context_slots, agent_type, category, tags)
-- are public so ANYONE — including a logged-out guest — can RUN the agent. The
-- SECRETS (messages/prompt, settings, model_id, tools, custom_tools,
-- mcp_servers, tool_config, ui_gates, matrx_actions, skill_config) must NEVER
-- reach a non-share-holder. Running is a public capability; a share (which
-- conveys secrets via the builder) is the only thing that reveals them.
--
-- Why a SECURITY DEFINER RPC rather than an RLS policy: RLS on agent.definition
-- is whole-row (any caller RLS lets read gets the secret columns too), and
-- agents are CHECK-capped non-public so the anon `pub_read` policy matches zero
-- rows. A definer function projecting ONLY the safe columns is the minimal,
-- secret-proof surface, and it also covers `context_slots` (which the run form
-- needs and the `agent.card` view omits). The guest run then streams via the
-- Python backend which resolves prompt/model/tools server-side from the id —
-- the browser never calls the secret-bearing `agx_get_execution_full`.
--
-- Idempotent. Returns 0 rows for a missing / soft-deleted id.

CREATE OR REPLACE FUNCTION public.get_agent_public(p_agent_id uuid)
RETURNS TABLE (
  id                    uuid,
  name                  text,
  description           text,
  variable_definitions  jsonb,
  context_slots         jsonb,
  agent_type            text,
  category              text,
  tags                  text[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'agent', 'public'
AS $$
  SELECT
    d.id,
    d.name,
    d.description,
    d.variable_definitions,
    d.context_slots,
    d.agent_type,
    d.category,
    d.tags
  FROM agent.definition d
  WHERE d.id = p_agent_id
    AND d.deleted_at IS NULL;
$$;

-- Running is public — grant to anon (logged-out guests) and authenticated.
GRANT EXECUTE ON FUNCTION public.get_agent_public(uuid) TO anon, authenticated;
