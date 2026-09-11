-- get_agent_public(p_agent_id) — the PUBLIC non-secret read surface for any agent.
--
-- The run/share/fork model: the NON-SECRET parts of every agent (id, name,
-- description, variable_definitions, context_policies, agent_type, category, tags)
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
-- secret-proof surface, and it also covers `context_policies` (which the run form
-- needs and the `agent.card` view omits). The guest run then streams via the
-- Python backend which resolves prompt/model/tools server-side from the id —
-- the browser never calls the secret-bearing `agx_get_execution_full`.
--
-- Idempotent. Returns 0 rows for a missing / soft-deleted id.
--
-- ⚠️ CORRECTED 2026-09-11 (B-15 / DD-116), AND READ THIS BEFORE TRUSTING THE LEDGER FOR THIS FILE.
-- This file said `context_slots` in both its RETURNS TABLE and its SELECT. **There has never been a
-- `context_slots` column on `agent.definition`** — the column is `context_policies`, and that is what
-- the live function has always returned. So these bytes, as they stood, could not have executed: they
-- would have raised 42703 (undefined column). The ledger row for this filename
-- (`public._schema_migrations`, applied_at 2026-07-14 03:44:22+00, checksum
-- 72ab5c3dfa941f867a4c14f3b21ad8fe0142d9c0e15b92e8153c6c876ff9affa) matched THESE bytes exactly, which
-- means the ledger was recording a hash of something that never ran. That is the precise failure mode
-- `pnpm db:apply` was built to end (CLAUDE.md § Migrations): on the hand-apply path nothing links the
-- ledgered bytes to the executed bytes. The column names are corrected here so the file stops lying
-- about the database; the ledger row is deliberately NOT re-stamped, because re-hashing would only
-- record a second number for bytes that still never ran as written. `pnpm check:migrations` will
-- therefore report this file as DRIFTED — that report is TRUE and must not be silenced.
--
-- ⚠️ SUPERSEDED. The live body is no longer this one. `dd116_agent_public_door_visibility_gate.sql`
-- (2026-09-11) added the visibility gate this file never had: anonymous callers see only
-- `card_visibility='public'` rows, signed-in callers additionally what
-- `iam.has_access('agent', id, 'viewer')` admits. As written below, this function returned ANY
-- non-deleted agent to any anonymous caller — proven live over HTTPS with the published anon key.
-- Do not re-apply this file.

CREATE OR REPLACE FUNCTION public.get_agent_public(p_agent_id uuid)
RETURNS TABLE (
  id                    uuid,
  name                  text,
  description           text,
  variable_definitions  jsonb,
  context_policies      jsonb,
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
    d.context_policies,
    d.agent_type,
    d.category,
    d.tags
  FROM agent.definition d
  WHERE d.id = p_agent_id
    AND d.deleted_at IS NULL;
$$;

-- Running is public — grant to anon (logged-out guests) and authenticated.
GRANT EXECUTE ON FUNCTION public.get_agent_public(uuid) TO anon, authenticated;
