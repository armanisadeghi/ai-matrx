-- chair-step: drops the BEFORE INSERT trigger agent.definition.zz_seed_org_default_tools, its two
-- functions, the declaration view agent.org_default_tool and that function's client-callable-door
-- row, and retires the knob custom/records_tool_default (its overrides, then its row — the ai_101
-- pattern). DROP TRIGGER takes a brief lock on agent.definition (metadata only, no rewrite). No
-- table is altered and no agent row is touched. The inverse recreates all of it verbatim.
--
-- WHY (Arman, 2026-10-02: "Remove the database rule … OF course!!!!"). The server never adds a
-- tool on its own. This trigger replaced an empty tool list on every new agent with the
-- organization's default (`records`), so 189 agents were born carrying a tool nobody gave them.
-- aidream's turn-time copy of the same default was removed in aidream cd3bbf2751. With the seed
-- gone, custom/records_tool_default is read by nothing; a retired knob left behind would still
-- show in every organization's settings as a switch that does nothing.
-- Guard: aidream aidream/services/agent_service/tests/test_a_new_toolless_agent_is_born_with_no_tools_clone.py
SELECT set_config('app.actor_system', 'migration:records_a_new_agent_is_never_seeded_with_a_tool', true);

DROP TRIGGER IF EXISTS zz_seed_org_default_tools ON agent.definition;
DROP FUNCTION IF EXISTS agent._seed_org_default_tools();
DROP FUNCTION IF EXISTS agent.default_tool_ids_for_organization(uuid);
DROP VIEW IF EXISTS agent.org_default_tool;

DELETE FROM platform.client_callable_door
 WHERE schema_name = 'agent' AND function_name = 'default_tool_ids_for_organization';

DELETE FROM platform.knob_override
 WHERE feature = 'custom' AND key = 'records_tool_default';

DELETE FROM platform.feature_knob
 WHERE feature = 'custom' AND key = 'records_tool_default';
