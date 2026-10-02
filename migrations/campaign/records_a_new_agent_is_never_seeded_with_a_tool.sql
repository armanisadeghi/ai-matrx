-- chair-step: neutralizes the BEFORE INSERT trigger agent.definition.zz_seed_org_default_tools by
-- replacing its function body (CREATE OR REPLACE — no trigger DDL, no table lock) so it returns the
-- row untouched, and retires the knob custom/records_tool_default (its overrides, then its row — the
-- ai_101 pattern). No table is altered and no agent row is touched. The inverse puts the body and
-- the knob row back verbatim.
-- based-on: agent._seed_org_default_tools() 1b769298e076753d6e985f0aaecf84ecf40e440ccaf8505999e814857501da4d
--
-- WHY (Arman, 2026-10-02: "Remove the database rule … OF course!!!!"). The server never adds a
-- tool on its own. This trigger replaced an empty tool list on every new agent with the
-- organization's default (`records`), so 189 agents were born carrying a tool nobody gave them.
-- aidream's turn-time copy of the same default was removed in aidream cd3bbf2751. With the seed
-- inert, custom/records_tool_default is read by nothing; a retired knob left behind would still
-- show in every organization's settings as a switch that does nothing.
--
-- THE DROP ITSELF IS WINDOW-CLASS. DROP TRIGGER on agent.definition takes ACCESS EXCLUSIVE plus
-- the 23 supautils auth/storage/realtime relations (measured by db:rehearse 2026-10-02), so the
-- trigger, both functions, the view agent.org_default_tool and the door row are removed by
-- records_seed_trigger_teardown.sql in the 1–4 AM Pacific window. Until then the trigger fires
-- and does nothing.
-- Guard: aidream aidream/services/agent_service/tests/test_a_new_toolless_agent_is_born_with_no_tools_clone.py
SELECT set_config('app.actor_system', 'migration:records_a_new_agent_is_never_seeded_with_a_tool', true);

CREATE OR REPLACE FUNCTION agent._seed_org_default_tools()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
begin
    -- INERT since 2026-10-02 (owner: the platform never adds a tool on its own). A new agent
    -- carries exactly the tools its writer sent. Dropped by records_seed_trigger_teardown.sql.
    return new;
end;
$function$;

DELETE FROM platform.knob_override
 WHERE feature = 'custom' AND key = 'records_tool_default';

DELETE FROM platform.feature_knob
 WHERE feature = 'custom' AND key = 'records_tool_default';
