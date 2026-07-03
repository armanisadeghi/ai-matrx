-- =============================================================================
-- agent_surface_associations_repoint_reads.sql  (STAGE 2)
--
-- Repoint the DB-side READERS of the agent↔surface binding onto
-- platform.associations, so the context-menu hot path and the shortcut RPC read
-- the canonical edge instead of agent.agent_surface.
--
-- Backward-compatible by design (safe to apply before the FE deploy):
--   • agent.menu_surface now reads associations, which already holds EVERY
--     current binding (Stage-1 backfill), so the currently-deployed FE keeps
--     seeing the same bound agents.
--   • create_shortcut_from_agent_surface resolves its source from associations
--     FIRST, then falls back to agent.agent_surface for a legacy id — so both
--     the old FE (passing an agent_surface.id) and the new FE (passing an
--     association id) work.
--
-- Idempotent: CREATE OR REPLACE. Depends on Stage 1 (surface entity + backfill).
-- =============================================================================

-- ── agent.menu_surface → platform.associations ──────────────────────────────
create or replace view agent.menu_surface as
  select
    a.id,
    a.source_id                                    as agent_id,
    us.name                                        as surface_name,
    nullif(a.metadata->>'user_id','')::uuid        as user_id,
    a.organization_id,
    nullif(a.metadata->>'project_id','')::uuid     as project_id,
    nullif(a.metadata->>'task_id','')::uuid        as task_id,
    coalesce(a.metadata->'value_mappings','{}'::jsonb) as value_mappings,
    coalesce((a.metadata->>'version')::int, 1)     as version,
    coalesce((a.metadata->>'visibility')::platform.visibility, 'internal'::platform.visibility) as visibility,
    a.created_at,
    a.created_at                                   as updated_at,
    a.created_by,
    a.created_by                                   as updated_by,
    c.name                                          as agent_name,
    c.description                                   as agent_description,
    c.agent_type,
    c.category                                      as agent_category,
    c.tags                                          as agent_tags,
    c.variable_definitions                          as agent_variable_definitions,
    c.output_schema                                 as agent_output_schema,
    c.is_active                                     as agent_is_active,
    c.card_visibility                               as agent_card_visibility,
    to_jsonb(c.*)                                   as agent,
    case
      when o.id is not null then jsonb_build_object(
        'id', o.id, 'name', o.name, 'slug', o.slug, 'description', o.description,
        'logo_url', o.logo_url, 'is_personal', o.is_personal, 'is_system', o.is_system)
      else null::jsonb
    end                                             as organizations
  from platform.associations a
  join agent.card c on c.id = a.source_id
  left join iam.organizations o on o.id = a.organization_id
  join ui.ui_surface us on us.id = a.target_id
  where a.source_type = 'agent'
    and a.target_type = 'surface';

-- ── create_shortcut_from_agent_surface → associations (legacy-tolerant) ──────
create or replace function public.create_shortcut_from_agent_surface(
  p_agent_surface_id uuid,
  p_category_id uuid,
  p_user_id uuid default null,
  p_organization_id uuid default null,
  p_project_id uuid default null,
  p_task_id uuid default null,
  p_overrides jsonb default '{}'::jsonb
) returns uuid
language plpgsql
as $function$
declare
  v_agent_id      uuid;
  v_surface_name  text;
  v_value_maps    jsonb;
  v_agent         record;
  v_new_id        uuid;
  v_label         text;
  v_description   text;
  v_icon_name     text;
begin
  -- Prefer the canonical association edge (id = association id).
  select a.source_id, us.name, coalesce(a.metadata->'value_mappings','{}'::jsonb)
    into v_agent_id, v_surface_name, v_value_maps
    from platform.associations a
    join ui.ui_surface us on us.id = a.target_id
   where a.id = p_agent_surface_id
     and a.source_type = 'agent'
     and a.target_type = 'surface';

  -- Legacy fallback: a bare agent.agent_surface id (kept until graveyard).
  if v_agent_id is null then
    select s.agent_id, s.surface_name, s.value_mappings
      into v_agent_id, v_surface_name, v_value_maps
      from agent.agent_surface s
     where s.id = p_agent_surface_id;
  end if;

  if v_agent_id is null then
    raise exception 'agent-surface binding % not found (association or legacy)', p_agent_surface_id;
  end if;

  select id, name, description into v_agent
    from agent.definition where id = v_agent_id;
  if not found then
    raise exception 'agent.definition row % not found', v_agent_id;
  end if;

  v_label       := coalesce(p_overrides->>'label',       v_agent.name || ' Shortcut');
  v_description := coalesce(p_overrides->>'description', v_agent.description);
  v_icon_name   := coalesce(p_overrides->>'icon_name',   null);

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
    coalesce((p_overrides->'value_mappings')::jsonb, v_value_maps),
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
