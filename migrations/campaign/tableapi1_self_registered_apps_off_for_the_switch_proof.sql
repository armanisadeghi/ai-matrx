-- chair-step: turns the platform knob mcp/oauth_dynamic_clients_enabled OFF so the running server can be seen refusing a self-registered app's sign-in; its inverse turns it back ON minutes later. Only the table API and the person's AI Matrx MCP read this knob (the AI Dream MCP does not), so nobody else is touched.
-- lane: TABLE-API-1
-- lock: platform
--
-- TABLE-API-1 — THE SELF-REGISTERED APPS SWITCH, PROVEN ON THE RUNNING SERVER.

set local lock_timeout = '3s';

update platform.feature_knob
   set value = 'false'::jsonb, updated_at = now()
 where feature = 'mcp' and key = 'oauth_dynamic_clients_enabled';
