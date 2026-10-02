-- chair-step: THE INVERSE of `records_a_new_agent_is_never_seeded_with_a_tool.sql`. Puts the knob
-- row back and the seed function body back verbatim (CREATE OR REPLACE, no trigger DDL). Restoring
-- it brings back the seed the owner ordered removed; it exists so the forward file is reversible.
-- based-on: agent._seed_org_default_tools() a960d3e447d95379dca83915dead95c0da6b6f628f0e2524d67cc0ed7bad58c2
SELECT set_config('app.actor_system', 'migration:records_a_new_agent_is_never_seeded_with_a_tool.inverse', true);

INSERT INTO platform.feature_knob (
    feature, key, value, default_value, value_type, label, description,
    set_by, basis, overridable_by, override_direction, public_read
) VALUES (
    'custom', 'records_tool_default', 'true'::jsonb, 'true'::jsonb, 'boolean',
    'New agents start with records',
    'New agents with no tools of their own start with the records tool.',
    'agent',
    'The verifier found zero agents on the platform carrying the records tool on 2026-09-19, so the store was unreachable from any agent a person could pick.',
    array['organization']::text[], 'any', true
) ON CONFLICT (feature, key) DO NOTHING;

CREATE OR REPLACE FUNCTION agent._seed_org_default_tools()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
    v_defaults uuid[];
begin
    -- Only a writer who said nothing about tools gets the organization's default set.
    if new.tools is not null and cardinality(new.tools) > 0 then
        return new;
    end if;
    -- A writer that DECLARED its tool list (the Agent Factory's spec) meant exactly that
    -- list, including an empty one. Never seed over a declaration.
    if coalesce(new.metadata ->> 'tools_declared', '') = 'true' then
        return new;
    end if;
    -- THE OFF SWITCH, READ HERE AND NOT ONLY INSIDE THE HELPER. With
    -- `custom/system_enabled` off for this organization there is nothing this seed can
    -- add, and the old path — an agent carrying exactly the tools its writer sent — is
    -- reached without touching a second function.
    if not custom.store_is_open(new.organization_id) then
        return new;
    end if;
    v_defaults := agent.default_tool_ids_for_organization(new.organization_id);
    if cardinality(v_defaults) > 0 then
        new.tools := v_defaults;
    end if;
    return new;
end;
$function$;

