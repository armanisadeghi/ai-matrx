-- create_shortcut_from_agent_surface: carry the binding's write_policies into
-- the minted shortcut, and read the v2 edge payload.
--
-- Two fixes in one CREATE OR REPLACE:
--  1. value_mappings now read payload-first (payload -> metadata -> '{}'),
--     matching agent.menu_surface — v2 bindings store mappings in a.payload,
--     so the old metadata-only read minted shortcuts with EMPTY mappings for
--     any binding saved through the current FE.
--  2. The binding's payload->'write_policies' (per-target apply-policy
--     overrides) is nested into the shortcut's value_mappings under the
--     reserved '__write_policies' key — the FE shortcut converters'
--     serialization contract (agent.shortcut has no separate column; the two
--     halves share the one JSONB). An explicit p_overrides value_mappings that
--     already carries '__write_policies' wins untouched.
--
-- Applied via Supabase MCP (project txzxabzwovsujtloxrus) 2026-07-29.

CREATE OR REPLACE FUNCTION public.create_shortcut_from_agent_surface(
  p_agent_surface_id uuid,
  p_category_id uuid,
  p_user_id uuid DEFAULT NULL::uuid,
  p_organization_id uuid DEFAULT NULL::uuid,
  p_project_id uuid DEFAULT NULL::uuid,
  p_task_id uuid DEFAULT NULL::uuid,
  p_overrides jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
AS $function$
declare
  v_agent_id       uuid;
  v_surface_name   text;
  v_value_maps     jsonb;
  v_write_policies jsonb;
  v_effective_maps jsonb;
  v_agent          record;
  v_new_id         uuid;
  v_label          text;
  v_description    text;
  v_icon_name      text;
begin
  select a.source_id,
         us.name,
         coalesce(a.payload->'value_mappings', a.metadata->'value_mappings', '{}'::jsonb),
         coalesce(a.payload->'write_policies', '{}'::jsonb)
    into v_agent_id, v_surface_name, v_value_maps, v_write_policies
    from platform.associations a
    join ui.ui_surface us on us.id = a.target_id
   where a.id = p_agent_surface_id
     and a.source_type = 'agent'
     and a.target_type = 'surface';

  if v_agent_id is null then
    raise exception 'agent-surface binding association % not found', p_agent_surface_id;
  end if;

  select id, name, description into v_agent
    from agent.definition where id = v_agent_id;
  if not found then
    raise exception 'agent.definition row % not found', v_agent_id;
  end if;

  v_label       := coalesce(p_overrides->>'label',       v_agent.name || ' Shortcut');
  v_description := coalesce(p_overrides->>'description', v_agent.description);
  v_icon_name   := coalesce(p_overrides->>'icon_name',   null);

  -- Effective mappings: explicit override wins; else the binding's. Then nest
  -- the binding's write policies under the reserved key unless the caller
  -- already supplied that key explicitly.
  v_effective_maps := coalesce((p_overrides->'value_mappings')::jsonb, v_value_maps);
  if v_write_policies <> '{}'::jsonb
     and not (v_effective_maps ? '__write_policies') then
    v_effective_maps := coalesce(v_effective_maps, '{}'::jsonb)
      || jsonb_build_object('__write_policies', v_write_policies);
  end if;

  insert into agent.shortcut (
    category_id, label, description, icon_name, agent_id, surface_name,
    value_mappings, user_id, organization_id, project_id, task_id,
    keyboard_shortcut, display_mode, allow_chat, auto_run, show_variable_panel,
    variables_panel_style, show_definition_messages, show_definition_message_content,
    hide_reasoning, hide_tool_results, show_pre_execution_gate, pre_execution_message,
    bypass_gate_seconds, default_user_input, default_variables, context_overrides,
    llm_overrides, response_density, json_extraction, enabled_features, use_latest,
    agent_version_id, is_active
  ) values (
    p_category_id, v_label, v_description, v_icon_name, v_agent_id, v_surface_name,
    v_effective_maps,
    p_user_id, p_organization_id, p_project_id, p_task_id,
    p_overrides->>'keyboard_shortcut',
    coalesce(p_overrides->>'display_mode', 'modal-full'),
    coalesce((p_overrides->>'allow_chat')::boolean, true),
    coalesce((p_overrides->>'auto_run')::boolean, true),
    coalesce((p_overrides->>'show_variable_panel')::boolean, false),
    coalesce(p_overrides->>'variables_panel_style', 'inline'),
    coalesce((p_overrides->>'show_definition_messages')::boolean, false),
    coalesce((p_overrides->>'show_definition_message_content')::boolean, false),
    coalesce((p_overrides->>'hide_reasoning')::boolean, false),
    coalesce((p_overrides->>'hide_tool_results')::boolean, false),
    coalesce((p_overrides->>'show_pre_execution_gate')::boolean, false),
    p_overrides->>'pre_execution_message',
    coalesce((p_overrides->>'bypass_gate_seconds')::int, 3),
    p_overrides->>'default_user_input',
    (p_overrides->'default_variables')::jsonb,
    (p_overrides->'context_overrides')::jsonb,
    (p_overrides->'llm_overrides')::jsonb,
    coalesce(p_overrides->>'response_density', 'comfortable'),
    (p_overrides->'json_extraction')::jsonb,
    coalesce((p_overrides->'enabled_features')::jsonb, '["general"]'::jsonb),
    coalesce((p_overrides->>'use_latest')::boolean, true),
    nullif(p_overrides->>'agent_version_id', '')::uuid,
    true
  )
  returning id into v_new_id;

  return v_new_id;
end;
$function$;
