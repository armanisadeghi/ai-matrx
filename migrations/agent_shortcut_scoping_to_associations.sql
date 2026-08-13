-- Applied live 2026-08-12 via Supabase MCP (migration: agent_shortcut_scoping_to_associations).
-- D173: the forbidden project_id/task_id FK columns on agent.shortcut / agent.template were the
-- ONLY path for shortcut scoping after the mirror triggers were disarmed. This migration makes
-- platform.associations the one authority: RPC signatures and output shapes are UNCHANGED
-- (project_id/task_id outputs become projections of the edges), column writes become edge
-- writes, and the four columns are dropped. Proven dormant before the cut: 0 scoped rows on
-- both tables, so no data backfill is needed.

-- 1. Edge vocabulary: agent_shortcut → project/task, mirroring the agent→project/task precedent
--    (container_side='target', conveys editor: project/task members reach their scoped shortcuts).
INSERT INTO platform.association_types (source_type, target_type, container_side, conveys_max, is_active)
SELECT 'agent_shortcut', t.tgt, 'target', 'editor', true
FROM (VALUES ('project'), ('task')) AS t(tgt)
WHERE NOT EXISTS (
  SELECT 1 FROM platform.association_types at
  WHERE at.source_type = 'agent_shortcut' AND at.target_type = t.tgt AND at.label IS NULL
);

-- 2. Writers: edges instead of columns ---------------------------------------------------------

CREATE OR REPLACE FUNCTION public.agx_create_shortcut(p_agent_id uuid, p_label text, p_category_id uuid, p_user_id uuid DEFAULT NULL::uuid, p_organization_id uuid DEFAULT NULL::uuid, p_project_id uuid DEFAULT NULL::uuid, p_task_id uuid DEFAULT NULL::uuid, p_use_latest boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_agent record;
  v_version_id uuid;
  v_new_id uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if p_user_id is not null and p_user_id <> v_uid then
    raise exception 'cannot create a shortcut for another user' using errcode = '42501';
  end if;
  if p_organization_id is not null
     and coalesce(iam.has_org_access(p_organization_id), false) is not true then
    raise exception 'not authorized for organization %', p_organization_id using errcode = '42501';
  end if;
  if p_project_id is not null
     and coalesce(iam.has_access('project', p_project_id, 'editor'), false) is not true then
    raise exception 'not authorized for project %', p_project_id using errcode = '42501';
  end if;
  if p_task_id is not null
     and coalesce(iam.has_access('task', p_task_id, 'editor'), false) is not true then
    raise exception 'not authorized for task %', p_task_id using errcode = '42501';
  end if;

  select a.id, a.name, a.version
  into v_agent
  from agent.definition a
  where a.id = p_agent_id;
  if not found then raise exception 'Agent not found'; end if;

  if not p_use_latest then
    select av.id into v_version_id
    from agent.definition_version av
    where av.agent_id = p_agent_id and av.version_number = v_agent.version;
  end if;

  if p_user_id is null and p_organization_id is null
     and p_project_id is null and p_task_id is null then
    p_user_id := v_uid;
  end if;

  v_new_id := gen_random_uuid();
  insert into agent.shortcut (
    id, category_id, label, agent_id, agent_version_id, use_latest,
    enabled_features, display_mode, allow_chat, auto_run,
    show_variable_panel, variables_panel_style,
    show_definition_messages, show_definition_message_content,
    hide_reasoning, hide_tool_results, show_pre_execution_gate,
    bypass_gate_seconds, is_active, created_by, organization_id
  ) values (
    v_new_id, p_category_id, p_label, p_agent_id, v_version_id, p_use_latest,
    '["general"]'::jsonb, 'modal-full', true, false,
    false, 'inline', false, false, false, false, false,
    3, true, p_user_id, p_organization_id
  );

  if p_project_id is not null then
    insert into platform.associations (source_type, source_id, target_type, target_id, organization_id, created_by)
    values ('agent_shortcut', v_new_id, 'project', p_project_id,
            coalesce(p_organization_id, (select w.organization_id from workspace.projects w where w.id = p_project_id)),
            v_uid)
    on conflict do nothing;
  end if;
  if p_task_id is not null then
    insert into platform.associations (source_type, source_id, target_type, target_id, organization_id, created_by)
    values ('agent_shortcut', v_new_id, 'task', p_task_id,
            coalesce(p_organization_id, (select w.organization_id from workspace.tasks w where w.id = p_task_id)),
            v_uid)
    on conflict do nothing;
  end if;
  return v_new_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.agx_duplicate_shortcut(p_shortcut_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_source record;
  v_new_id uuid;
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_source FROM agent.shortcut WHERE id = p_shortcut_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Shortcut not found'; END IF;

  v_new_id := gen_random_uuid();

  -- a duplicate is always personal: no org, no scoping edges copied
  INSERT INTO agent.shortcut (
    id, category_id, label, description, icon_name, sort_order,
    agent_id, agent_version_id, use_latest,
    enabled_features, scope_mappings, context_mappings,
    display_mode, allow_chat, auto_run,
    show_variable_panel, variables_panel_style,
    show_definition_messages, show_definition_message_content,
    hide_reasoning, hide_tool_results,
    show_pre_execution_gate, pre_execution_message, bypass_gate_seconds,
    default_user_input, default_variables, context_overrides, llm_overrides,
    is_active, created_by, organization_id
  )
  VALUES (
    v_new_id, v_source.category_id, v_source.label || ' (Copy)',
    v_source.description, v_source.icon_name, v_source.sort_order,
    v_source.agent_id, v_source.agent_version_id, v_source.use_latest,
    v_source.enabled_features, v_source.scope_mappings, v_source.context_mappings,
    v_source.display_mode, v_source.allow_chat, v_source.auto_run,
    v_source.show_variable_panel, v_source.variables_panel_style,
    v_source.show_definition_messages, v_source.show_definition_message_content,
    v_source.hide_reasoning, v_source.hide_tool_results,
    v_source.show_pre_execution_gate, v_source.pre_execution_message, v_source.bypass_gate_seconds,
    v_source.default_user_input, v_source.default_variables, v_source.context_overrides, v_source.llm_overrides,
    true, v_uid, NULL
  );

  RETURN v_new_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.agx_promote_shortcut_to_global(p_shortcut_id uuid, p_target_category_id uuid, p_label text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_source record; v_category record; v_new_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only admins can promote shortcuts to global'; END IF;

  SELECT * INTO v_source FROM agent.shortcut WHERE id = p_shortcut_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Source shortcut % not found', p_shortcut_id; END IF;

  SELECT * INTO v_category FROM platform.categories WHERE id = p_target_category_id AND dimension = 'shortcut';
  IF NOT FOUND THEN RAISE EXCEPTION 'Target category % not found', p_target_category_id; END IF;

  IF v_category.organization_id IS NOT NULL
     OR (v_category.metadata->>'user_id')    IS NOT NULL
     OR (v_category.metadata->>'project_id') IS NOT NULL
     OR (v_category.metadata->>'task_id')    IS NOT NULL THEN
    RAISE EXCEPTION 'Target category must be global (all ownership columns NULL)';
  END IF;

  v_new_id := gen_random_uuid();

  INSERT INTO agent.shortcut (
    id, category_id, label, description, icon_name, keyboard_shortcut, sort_order,
    agent_id, agent_version_id, use_latest, enabled_features, scope_mappings, context_mappings,
    display_mode, allow_chat, auto_run, show_variable_panel, variables_panel_style,
    show_definition_messages, show_definition_message_content, hide_reasoning, hide_tool_results,
    show_pre_execution_gate, pre_execution_message, bypass_gate_seconds,
    default_user_input, default_variables, context_overrides, llm_overrides,
    is_active, created_by, organization_id)
  VALUES (
    v_new_id, p_target_category_id,
    COALESCE(NULLIF(btrim(p_label), ''), v_source.label),
    v_source.description, v_source.icon_name, NULL, v_source.sort_order,
    v_source.agent_id, v_source.agent_version_id, v_source.use_latest,
    v_source.enabled_features, v_source.scope_mappings, v_source.context_mappings,
    v_source.display_mode, v_source.allow_chat, v_source.auto_run,
    v_source.show_variable_panel, v_source.variables_panel_style,
    v_source.show_definition_messages, v_source.show_definition_message_content,
    v_source.hide_reasoning, v_source.hide_tool_results,
    v_source.show_pre_execution_gate, v_source.pre_execution_message, v_source.bypass_gate_seconds,
    v_source.default_user_input, v_source.default_variables, v_source.context_overrides, v_source.llm_overrides,
    true, NULL, NULL);

  RETURN v_new_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_shortcut_from_agent_surface(p_agent_surface_id uuid, p_category_id uuid, p_user_id uuid DEFAULT NULL::uuid, p_organization_id uuid DEFAULT NULL::uuid, p_project_id uuid DEFAULT NULL::uuid, p_task_id uuid DEFAULT NULL::uuid, p_overrides jsonb DEFAULT '{}'::jsonb)
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

  v_effective_maps := coalesce((p_overrides->'value_mappings')::jsonb, v_value_maps);
  if v_write_policies <> '{}'::jsonb
     and not (v_effective_maps ? '__write_policies') then
    v_effective_maps := coalesce(v_effective_maps, '{}'::jsonb)
      || jsonb_build_object('__write_policies', v_write_policies);
  end if;

  insert into agent.shortcut (
    category_id, label, description, icon_name, agent_id, surface_name,
    value_mappings, created_by, organization_id,
    keyboard_shortcut, display_mode, allow_chat, auto_run, show_variable_panel,
    variables_panel_style, show_definition_messages, show_definition_message_content,
    hide_reasoning, hide_tool_results, show_pre_execution_gate, pre_execution_message,
    bypass_gate_seconds, default_user_input, default_variables, context_overrides,
    llm_overrides, response_density, json_extraction, enabled_features, use_latest,
    agent_version_id, is_active
  ) values (
    p_category_id, v_label, v_description, v_icon_name, v_agent_id, v_surface_name,
    v_effective_maps,
    p_user_id, p_organization_id,
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

  if p_project_id is not null then
    insert into platform.associations (source_type, source_id, target_type, target_id, organization_id, created_by)
    values ('agent_shortcut', v_new_id, 'project', p_project_id,
            coalesce(p_organization_id, (select w.organization_id from workspace.projects w where w.id = p_project_id)),
            coalesce(p_user_id, auth.uid()))
    on conflict do nothing;
  end if;
  if p_task_id is not null then
    insert into platform.associations (source_type, source_id, target_type, target_id, organization_id, created_by)
    values ('agent_shortcut', v_new_id, 'task', p_task_id,
            coalesce(p_organization_id, (select w.organization_id from workspace.tasks w where w.id = p_task_id)),
            coalesce(p_user_id, auth.uid()))
    on conflict do nothing;
  end if;

  return v_new_id;
end;
$function$;

-- 3. Readers: identical signatures/output shapes; project_id/task_id are edge projections ------

CREATE OR REPLACE FUNCTION public.agx_get_shortcuts_for_context(p_project_id uuid DEFAULT NULL::uuid, p_task_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(shortcut_id uuid, category_id uuid, label text, description text, icon_name text, keyboard_shortcut text, sort_order integer, resolved_id uuid, is_version boolean, is_behind boolean, agent_id uuid, agent_version_id uuid, current_version integer, use_latest boolean, enabled_features jsonb, scope_mappings jsonb, context_mappings jsonb, display_mode text, allow_chat boolean, auto_run boolean, show_variable_panel boolean, variables_panel_style text, show_definition_messages boolean, show_definition_message_content boolean, hide_reasoning boolean, hide_tool_results boolean, show_pre_execution_gate boolean, pre_execution_message text, bypass_gate_seconds integer, default_user_input text, default_variables jsonb, context_overrides jsonb, llm_overrides jsonb, shortcut_user_id uuid, shortcut_org_id uuid, shortcut_project_id uuid, shortcut_task_id uuid, agent_name text, agent_variable_definitions jsonb, agent_context_slots jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    s.id, s.category_id, s.label, s.description, s.icon_name, s.keyboard_shortcut, s.sort_order,
    CASE
      WHEN s.agent_id IS NULL THEN NULL
      WHEN s.use_latest THEN s.agent_id
      WHEN COALESCE(av.version_number, a.version) >= a.version THEN s.agent_id
      ELSE s.agent_version_id
    END,
    CASE
      WHEN s.agent_id IS NULL THEN false
      WHEN s.use_latest THEN false
      WHEN COALESCE(av.version_number, a.version) >= a.version THEN false
      ELSE true
    END,
    CASE
      WHEN s.agent_id IS NULL THEN false
      WHEN s.use_latest THEN false
      ELSE a.version > COALESCE(av.version_number, a.version)
    END,
    s.agent_id, s.agent_version_id, a.version, s.use_latest,
    s.enabled_features, s.scope_mappings, s.context_mappings,
    s.display_mode, s.allow_chat, s.auto_run,
    s.show_variable_panel, s.variables_panel_style,
    s.show_definition_messages, s.show_definition_message_content,
    s.hide_reasoning, s.hide_tool_results,
    s.show_pre_execution_gate, s.pre_execution_message, s.bypass_gate_seconds,
    s.default_user_input, s.default_variables, s.context_overrides, s.llm_overrides,
    s.created_by, s.organization_id, sp.target_id, st.target_id,
    CASE WHEN s.agent_id IS NULL THEN NULL
         WHEN s.use_latest OR COALESCE(av.version_number, a.version) >= a.version THEN a.name
         ELSE av.name END,
    CASE WHEN s.agent_id IS NULL THEN NULL
         WHEN s.use_latest OR COALESCE(av.version_number, a.version) >= a.version THEN a.variable_definitions
         ELSE av.variable_definitions END,
    CASE WHEN s.agent_id IS NULL THEN NULL
         WHEN s.use_latest OR COALESCE(av.version_number, a.version) >= a.version THEN a.context_slots
         ELSE av.context_slots END
  FROM agent.shortcut s
  LEFT JOIN agent.definition a ON a.id = s.agent_id
  LEFT JOIN agent.definition_version av ON av.id = s.agent_version_id
  LEFT JOIN LATERAL (
    SELECT x.target_id FROM platform.associations x
    WHERE x.source_type = 'agent_shortcut' AND x.source_id = s.id AND x.target_type = 'project'
    ORDER BY x.created_at LIMIT 1
  ) sp ON true
  LEFT JOIN LATERAL (
    SELECT x.target_id FROM platform.associations x
    WHERE x.source_type = 'agent_shortcut' AND x.source_id = s.id AND x.target_type = 'task'
    ORDER BY x.created_at LIMIT 1
  ) st ON true
  WHERE s.is_active = true
    AND (
      (p_project_id IS NOT NULL AND sp.target_id = p_project_id)
      OR (p_task_id IS NOT NULL AND st.target_id = p_task_id)
      OR EXISTS (
        SELECT 1 FROM iam.permissions p
        WHERE p.resource_type = 'agent_shortcut'
          AND p.resource_id = s.id
          AND (
            p.granted_to_user_id = auth.uid()
            OR p.granted_to_organization_id IN (
              SELECT organization_id FROM iam.organization_member WHERE user_id = auth.uid()
            )
          )
      )
    )
  ORDER BY s.category_id, s.sort_order;
END;
$function$;

CREATE OR REPLACE FUNCTION public.agx_get_user_shortcuts()
 RETURNS TABLE(id uuid, label text, description text, icon_name text, keyboard_shortcut text, sort_order integer, category_id uuid, category_label text, agent_id uuid, agent_name text, agent_version_id uuid, use_latest boolean, scope_type text, scope_name text, user_id uuid, organization_id uuid, project_id uuid, task_id uuid, enabled_features jsonb, scope_mappings jsonb, context_mappings jsonb, display_mode text, allow_chat boolean, auto_run boolean, show_variable_panel boolean, variables_panel_style text, show_definition_messages boolean, show_definition_message_content boolean, hide_reasoning boolean, hide_tool_results boolean, show_pre_execution_gate boolean, pre_execution_message text, bypass_gate_seconds integer, default_user_input text, default_variables jsonb, context_overrides jsonb, llm_overrides jsonb, is_active boolean, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_uid uuid := auth.uid();
begin
  return query
  select
    s.id, s.label, s.description, s.icon_name, s.keyboard_shortcut, s.sort_order,
    s.category_id, sc.name,
    s.agent_id, a.name, s.agent_version_id, s.use_latest,
    (case when st.target_id is not null then 'task' when sp.target_id is not null then 'project'
          when s.organization_id is not null then 'organization' when s.created_by is not null then 'personal'
          else 'system' end)::text,
    (case when st.target_id is not null then (select t.title from workspace.tasks t where t.id = st.target_id)
          when sp.target_id is not null then (select p.name from workspace.projects p where p.id = sp.target_id)
          when s.organization_id is not null then (select o.name from iam.organizations o where o.id = s.organization_id)
          when s.created_by is not null then 'Personal' else 'System' end)::text,
    s.created_by, s.organization_id, sp.target_id, st.target_id,
    s.enabled_features, s.scope_mappings, s.context_mappings,
    s.display_mode, s.allow_chat, s.auto_run,
    s.show_variable_panel, s.variables_panel_style,
    s.show_definition_messages, s.show_definition_message_content,
    s.hide_reasoning, s.hide_tool_results,
    s.show_pre_execution_gate, s.pre_execution_message, s.bypass_gate_seconds,
    s.default_user_input, s.default_variables, s.context_overrides, s.llm_overrides,
    s.is_active, s.created_at, s.updated_at
  from agent.shortcut s
  left join agent.definition a on a.id = s.agent_id
  left join platform.categories sc on sc.id = s.category_id and sc.dimension = 'shortcut'
  left join lateral (
    select x.target_id from platform.associations x
    where x.source_type = 'agent_shortcut' and x.source_id = s.id and x.target_type = 'project'
    order by x.created_at limit 1
  ) sp on true
  left join lateral (
    select x.target_id from platform.associations x
    where x.source_type = 'agent_shortcut' and x.source_id = s.id and x.target_type = 'task'
    order by x.created_at limit 1
  ) st on true
  where s.created_by = v_uid
     or s.organization_id in (select om.organization_id from iam.organization_member om
        where om.user_id = v_uid and om.role in ('owner','admin'))
     or sp.target_id in (select m.container_id from iam.memberships m
        where m.container_type='project' and m.user_id = v_uid and m.deleted_at is null and m.role in ('owner','admin'))
  order by case when s.created_by is not null then 0 when s.organization_id is not null then 1
                when sp.target_id is not null then 2 when st.target_id is not null then 3 else 4 end,
           s.sort_order, s.label;
end;
$function$;

CREATE OR REPLACE FUNCTION public.agx_list_non_global_shortcuts_for_admin()
 RETURNS TABLE(id uuid, category_id uuid, label text, description text, icon_name text, keyboard_shortcut text, sort_order integer, agent_id uuid, agent_version_id uuid, use_latest boolean, enabled_features jsonb, scope_mappings jsonb, context_mappings jsonb, is_active boolean, user_id uuid, organization_id uuid, project_id uuid, task_id uuid, display_mode text, show_variable_panel boolean, variables_panel_style text, auto_run boolean, allow_chat boolean, show_definition_messages boolean, show_definition_message_content boolean, hide_reasoning boolean, hide_tool_results boolean, show_pre_execution_gate boolean, pre_execution_message text, bypass_gate_seconds integer, default_user_input text, default_variables jsonb, context_overrides jsonb, llm_overrides jsonb, created_at timestamp with time zone, updated_at timestamp with time zone, owner_email text, owner_display text, scope_type text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admins only';
  END IF;

  RETURN QUERY
  SELECT
    s.id, s.category_id, s.label, s.description, s.icon_name, s.keyboard_shortcut, s.sort_order,
    s.agent_id, s.agent_version_id, s.use_latest,
    s.enabled_features, s.scope_mappings, s.context_mappings,
    s.is_active, s.created_by, s.organization_id, sp.target_id, st.target_id,
    s.display_mode, s.show_variable_panel, s.variables_panel_style,
    s.auto_run, s.allow_chat,
    s.show_definition_messages, s.show_definition_message_content,
    s.hide_reasoning, s.hide_tool_results,
    s.show_pre_execution_gate, s.pre_execution_message, s.bypass_gate_seconds,
    s.default_user_input, s.default_variables, s.context_overrides, s.llm_overrides,
    s.created_at, s.updated_at,
    u.email::text AS owner_email,
    COALESCE(u.email::text, o.name, sp.target_id::text, st.target_id::text) AS owner_display,
    CASE
      WHEN s.created_by      IS NOT NULL THEN 'user'
      WHEN s.organization_id IS NOT NULL THEN 'organization'
      WHEN sp.target_id      IS NOT NULL THEN 'project'
      WHEN st.target_id      IS NOT NULL THEN 'task'
      ELSE 'global'
    END AS scope_type
  FROM agent.shortcut s
  LEFT JOIN auth.users u ON u.id = s.created_by
  LEFT JOIN iam.organizations o ON o.id = s.organization_id
  LEFT JOIN LATERAL (
    SELECT x.target_id FROM platform.associations x
    WHERE x.source_type = 'agent_shortcut' AND x.source_id = s.id AND x.target_type = 'project'
    ORDER BY x.created_at LIMIT 1
  ) sp ON true
  LEFT JOIN LATERAL (
    SELECT x.target_id FROM platform.associations x
    WHERE x.source_type = 'agent_shortcut' AND x.source_id = s.id AND x.target_type = 'task'
    ORDER BY x.created_at LIMIT 1
  ) st ON true
  WHERE NOT (
    s.created_by IS NULL AND s.organization_id IS NULL
    AND sp.target_id IS NULL AND st.target_id IS NULL
  )
  ORDER BY s.updated_at DESC;
END;
$function$;

-- 3b. agent.context_menu_view — the one view reading the doomed columns; same output shape,
--     shortcut project/task become edge projections (render_definition's own columns unchanged).
CREATE OR REPLACE VIEW agent.context_menu_view AS
 WITH shortcut_items AS (
         SELECT sc_1.id AS category_id,
            sc_1.placement_type,
            COALESCE(json_agg(json_build_object('type', 'agent_shortcut', 'id', s.id, 'category_id', s.category_id, 'label', s.label, 'description', s.description, 'icon_name', s.icon_name, 'sort_order', s.sort_order, 'keyboard_shortcut', s.keyboard_shortcut, 'surface_name', s.surface_name, 'value_mappings', s.value_mappings, 'scope_mappings', s.scope_mappings, 'context_mappings', s.context_mappings, 'enabled_features', s.enabled_features, 'display_mode', s.display_mode, 'auto_run', s.auto_run, 'allow_chat', s.allow_chat, 'show_variable_panel', s.show_variable_panel, 'variables_panel_style', s.variables_panel_style, 'show_definition_messages', s.show_definition_messages, 'show_definition_message_content', s.show_definition_message_content, 'hide_reasoning', s.hide_reasoning, 'hide_tool_results', s.hide_tool_results, 'response_density', s.response_density, 'show_pre_execution_gate', s.show_pre_execution_gate, 'pre_execution_message', s.pre_execution_message, 'bypass_gate_seconds', s.bypass_gate_seconds, 'default_user_input', s.default_user_input, 'default_variables', s.default_variables, 'context_overrides', s.context_overrides, 'llm_overrides', s.llm_overrides, 'json_extraction', s.json_extraction, 'agent_id', s.agent_id, 'agent_version_id', s.agent_version_id, 'use_latest', s.use_latest, 'is_active', s.is_active, 'user_id', s.created_by, 'organization_id', s.organization_id, 'project_id', sp.target_id, 'task_id', st.target_id, 'scope',
                CASE
                    WHEN s.created_by IS NOT NULL THEN 'user'::text
                    WHEN s.organization_id IS NOT NULL THEN 'organization'::text
                    WHEN sp.target_id IS NOT NULL THEN 'project'::text
                    WHEN st.target_id IS NOT NULL THEN 'task'::text
                    ELSE 'global'::text
                END, 'agent',
                CASE
                    WHEN s.agent_id IS NOT NULL THEN json_build_object('id', s.agent_id, 'name', COALESCE(v.name, a.name), 'description', a.description, 'variable_definitions',
                    CASE
                        WHEN s.use_latest = false AND v.id IS NOT NULL THEN v.variable_definitions
                        ELSE a.variable_definitions
                    END, 'context_slots',
                    CASE
                        WHEN s.use_latest = false AND v.id IS NOT NULL THEN v.context_slots
                        ELSE a.context_slots
                    END)
                    ELSE NULL::json
                END) ORDER BY s.sort_order) FILTER (WHERE s.id IS NOT NULL), '[]'::json) AS items
           FROM platform.categories sc_1
             LEFT JOIN agent.shortcut s ON s.category_id = sc_1.id AND s.is_active = true
             LEFT JOIN agent.definition a ON a.id = s.agent_id
             LEFT JOIN agent.definition_version v ON v.id = s.agent_version_id
             LEFT JOIN LATERAL (
               SELECT x.target_id FROM platform.associations x
               WHERE x.source_type = 'agent_shortcut' AND x.source_id = s.id AND x.target_type = 'project'
               ORDER BY x.created_at LIMIT 1
             ) sp ON true
             LEFT JOIN LATERAL (
               SELECT x.target_id FROM platform.associations x
               WHERE x.source_type = 'agent_shortcut' AND x.source_id = s.id AND x.target_type = 'task'
               ORDER BY x.created_at LIMIT 1
             ) st ON true
          WHERE sc_1.dimension = 'shortcut'::text AND sc_1.deleted_at IS NULL AND COALESCE((sc_1.metadata ->> 'is_active'::text)::boolean, true)
          GROUP BY sc_1.id, sc_1.placement_type
        ), block_items AS (
         SELECT sc_1.id AS category_id,
            sc_1.placement_type,
            COALESCE(json_agg(json_build_object('type', 'content_block', 'id', rd.id, 'category_id', rd.category_id, 'label', rd.label, 'description', rd.description, 'icon_name', rd.icon_name, 'sort_order', rd.sort_order, 'template', rd.template, 'block_id', rd.block_id, 'block_type', rd.block_type, 'skill_id', rd.skill_id, 'visibility', rd.visibility, 'is_active', rd.is_active, 'user_id', rd.created_by, 'organization_id', rd.organization_id, 'project_id', rd.project_id, 'task_id', rd.task_id, 'scope',
                CASE
                    WHEN rd.created_by IS NOT NULL THEN 'user'::text
                    WHEN rd.organization_id IS NOT NULL THEN 'organization'::text
                    WHEN rd.project_id IS NOT NULL THEN 'project'::text
                    WHEN rd.task_id IS NOT NULL THEN 'task'::text
                    ELSE 'global'::text
                END) ORDER BY rd.sort_order) FILTER (WHERE rd.id IS NOT NULL), '[]'::json) AS items
           FROM platform.categories sc_1
             LEFT JOIN skill.render_definition rd ON rd.category_id = sc_1.id AND rd.is_active = true
          WHERE sc_1.dimension = 'shortcut'::text AND sc_1.deleted_at IS NULL AND COALESCE((sc_1.metadata ->> 'is_active'::text)::boolean, true)
          GROUP BY sc_1.id, sc_1.placement_type
        )
 SELECT sc.placement_type,
    json_agg(json_build_object('category', json_build_object('id', sc.id, 'placement_type', sc.placement_type, 'parent_category_id', sc.parent_id, 'label', sc.name, 'description', sc.metadata ->> 'description'::text, 'icon_name', sc.icon, 'color', sc.color, 'sort_order', sc."position", 'is_active', COALESCE((sc.metadata ->> 'is_active'::text)::boolean, true), 'metadata', sc.metadata, 'enabled_features', COALESCE(sc.metadata -> 'enabled_features'::text, '[]'::jsonb), 'user_id', (sc.metadata ->> 'user_id'::text)::uuid, 'organization_id', sc.organization_id, 'project_id', (sc.metadata ->> 'project_id'::text)::uuid, 'task_id', (sc.metadata ->> 'task_id'::text)::uuid, 'scope',
        CASE
            WHEN (sc.metadata ->> 'user_id'::text) IS NOT NULL THEN 'user'::text
            WHEN sc.organization_id IS NOT NULL THEN 'organization'::text
            WHEN (sc.metadata ->> 'project_id'::text) IS NOT NULL THEN 'project'::text
            WHEN (sc.metadata ->> 'task_id'::text) IS NOT NULL THEN 'task'::text
            ELSE 'global'::text
        END), 'items', ( SELECT COALESCE(json_agg(combined.elem ORDER BY ((combined.elem ->> 'sort_order'::text)::integer)), '[]'::json) AS "coalesce"
           FROM ( SELECT json_array_elements(si.items) AS elem
                  WHERE si.items::text <> '[]'::text
                UNION ALL
                 SELECT json_array_elements(bi.items) AS elem
                  WHERE bi.items::text <> '[]'::text) combined)) ORDER BY sc."position") AS categories_flat
   FROM platform.categories sc
     LEFT JOIN shortcut_items si ON si.category_id = sc.id
     LEFT JOIN block_items bi ON bi.category_id = sc.id
  WHERE sc.dimension = 'shortcut'::text AND sc.deleted_at IS NULL AND COALESCE((sc.metadata ->> 'is_active'::text)::boolean, true)
  GROUP BY sc.placement_type;

-- 4. The cut: the forbidden columns die --------------------------------------------------------
ALTER TABLE agent.shortcut DROP COLUMN IF EXISTS project_id;
ALTER TABLE agent.shortcut DROP COLUMN IF EXISTS task_id;
ALTER TABLE agent.template DROP COLUMN IF EXISTS project_id;
ALTER TABLE agent.template DROP COLUMN IF EXISTS task_id;
