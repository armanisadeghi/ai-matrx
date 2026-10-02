-- window-class: DROP TRIGGER on agent.definition takes ACCESS EXCLUSIVE plus the 23 supautils auth/storage/realtime relations; 1–4 AM Pacific only.
-- chair-step: drops the (already inert) BEFORE INSERT trigger agent.definition.zz_seed_org_default_tools,
-- its function, agent.default_tool_ids_for_organization, the declaration view agent.org_default_tool
-- and that function's client-callable-door row. No table is altered and no agent row is touched.
-- The inverse recreates all of it verbatim (the seed function in its inert form).
--
-- WHY (Arman, 2026-10-02: "Remove the database rule … OF course!!!!"). The seed was neutralized and
-- its knob retired by records_a_new_agent_is_never_seeded_with_a_tool.sql; this removes the dead
-- parts. Nothing in any repo calls them (aidream directive readback stopped calling
-- default_tool_ids_for_organization in the same change).
SELECT set_config('app.actor_system', 'migration:records_seed_trigger_teardown', true);

DROP TRIGGER IF EXISTS zz_seed_org_default_tools ON agent.definition;
DROP FUNCTION IF EXISTS agent._seed_org_default_tools();
DROP FUNCTION IF EXISTS agent.default_tool_ids_for_organization(uuid);
DROP VIEW IF EXISTS agent.org_default_tool;

DELETE FROM platform.client_callable_door
 WHERE schema_name = 'agent' AND function_name = 'default_tool_ids_for_organization';
