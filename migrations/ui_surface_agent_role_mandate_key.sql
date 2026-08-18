-- Surface agent roles: mandate-backed platform defaults.
--
-- A SurfaceAgentRole may now name an agent Mandate (`mandateKey` in the
-- manifest) instead of hardcoding a default agent UUID. The role's platform
-- default then resolves through the mandate registry (agent.mandate) at read
-- time — code names the Mandate, the DB decides the Holder (the NO HARDCODED
-- AGENTS law applied to surface roles). Mirrored by manifest sync.
--
-- Applied live via Supabase MCP 2026-08-17.

ALTER TABLE ui.ui_surface_agent_role ADD COLUMN IF NOT EXISTS mandate_key text;

COMMENT ON COLUMN ui.ui_surface_agent_role.mandate_key IS
  'Optional agent-mandate key (agent.mandate.mandate_key). When set, the role''s platform default resolves through the mandate registry at read time instead of default_agent_id — code names the Mandate, the DB decides the Holder. Mirrored from the surface manifest by manifest sync.';
