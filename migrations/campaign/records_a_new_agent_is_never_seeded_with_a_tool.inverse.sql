-- chair-step: THE INVERSE of `records_a_new_agent_is_never_seeded_with_a_tool.sql`. Recreates the
-- knob row, the declaration view, both functions (bodies verbatim as live on 2026-10-02), the
-- client-callable-door row and the BEFORE INSERT trigger. Restoring it brings back the seed the
-- owner ordered removed; it exists so the forward file is provably reversible.
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

CREATE VIEW agent.org_default_tool WITH (security_invoker = true) AS
SELECT tool_name, feature, key, why
  FROM (VALUES
    ('records'::text, 'custom'::text, 'system_enabled'::text,
     'Is this organization''s unified record store open at all? With it shut, every action of the tool can only answer "the custom data store is switched off".'::text),
    ('records'::text, 'custom'::text, 'records_tool_default'::text,
     'And when it is open, does this organization want its agents to reach its records without attaching the tool by hand? Default true, organization-overridable.'::text)
  ) v(tool_name, feature, key, why);
REVOKE ALL ON agent.org_default_tool FROM PUBLIC, anon, authenticated;
GRANT ALL ON agent.org_default_tool TO service_role;
COMMENT ON VIEW agent.org_default_tool IS
    'Tools an organization''s new agents carry without anybody attaching them, and the platform knobs that must ALL resolve true for that to happen. Read by agent.default_tool_ids_for_organization on every agent INSERT, and by a guard test in each of matrx-frontend and aidream that fails when their own copy disagrees with this one.';

CREATE OR REPLACE FUNCTION agent.default_tool_ids_for_organization(p_organization_id uuid)
 RETURNS uuid[]
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
    v_ids uuid[] := '{}';
begin
    if p_organization_id is null then
        return v_ids;
    end if;

    -- A tool is offered only when EVERY switch it declares resolves true for this
    -- organization. bool_and over the tool's own rows is that sentence in one line.
    -- A tool in Trash is never offered.
    select coalesce(array_agg(t.id order by t.name), '{}')
      into v_ids
      from tool.definition t
     where t.is_active
       and t.deleted_at is null
       and t.name in (
             select o.tool_name
               from agent.org_default_tool o
              group by o.tool_name
             having bool_and(
                        platform.knob_resolve(o.feature, o.key, p_organization_id, null, null)
                        = to_jsonb(true)
                    )
           );

    return v_ids;
exception
    -- AN UNREADABLE SWITCH NEVER HANDS OUT A CAPABILITY. A knob that is not seeded raises
    -- P0001; the agent is still created, carrying nothing, and the reason is on the log.
    when others then
        raise warning
            'agent.default_tool_ids_for_organization(%): no default tools were added because a switch could not be read (% %). The agent was created with the tools its writer sent.',
            p_organization_id, sqlstate, sqlerrm;
        return '{}'::uuid[];
end;
$function$;
REVOKE ALL ON FUNCTION agent.default_tool_ids_for_organization(uuid) FROM PUBLIC, anon, authenticated, service_role;

INSERT INTO platform.client_callable_door (
    schema_name, function_name, identity_args, identity_argtypes,
    reason, declared_by, non_client_lane, signed_in_callers, anonymous_callers
) VALUES (
    'agent', 'default_tool_ids_for_organization', 'p_organization_id uuid',
    ARRAY['uuid'::regtype]::oid[],
    'p_organization_id is NEVER checked against the caller: the only caller is agent._seed_org_default_tools, the BEFORE INSERT trigger on agent.definition, which passes the organization of the row being written after _stamp_org_default has settled it. NULL returns an empty array and adds nothing.',
    'agtui_a_new_agent_carries_its_organizations_tools.sql',
    'server_only: called exclusively by the BEFORE INSERT trigger agent._seed_org_default_tools on agent.definition; no client ever calls it, because answering for an arbitrary organization id would disclose whether that organization has its record store switched on.',
    false, false
);

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

CREATE TRIGGER zz_seed_org_default_tools
    BEFORE INSERT ON agent.definition
    FOR EACH ROW EXECUTE FUNCTION agent._seed_org_default_tools();
