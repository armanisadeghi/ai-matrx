-- Applied via Supabase MCP 2026-08-12 (agent_definition_created_by_backfill).
-- Completes created_by from user_id where missing (190 rows). Never overwrites a set created_by
-- (11 divergent rows are system agents with user_id NULL and correct created_by).
-- Prerequisite for the agent.definition user_id cut. NOTE: is_public -> visibility mapping is
-- IMPOSSIBLE by design: agent_definition_body_not_public_chk bans visibility='public' on
-- definitions (prompt bodies never anon-readable; the CARD is the public face).
update agent.definition set created_by = user_id
where created_by is null and user_id is not null;
