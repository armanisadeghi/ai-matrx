-- Honest access errors for SECURITY INVOKER functions (the D167 class).
--
-- THE DEFECT. A SECURITY INVOKER function does `select … into` (or an UPDATE)
-- on an RLS-protected table, gets zero rows because RLS HID the row from THIS
-- caller, and then raises '<thing> not found'. For a user looking straight at
-- the record on screen, "not found" is the one answer that is definitely
-- wrong. It cost us D133 (live sites reported as deleted) and D167 (every
-- research Outputs Studio save reporting "rs_topic not found").
--
-- THE RULE. An invoker function CANNOT distinguish missing / deleted / denied
-- without probing with elevated rights. So it does not try and it does not
-- assert. RLS stays the sole authority — no security-definer probe and no new
-- access check is added here. The function raises an honest, AMBIGUOUS message
-- under a stable errcode (P0002) and the client resolves the real state
-- through <AccessGate token id/>, the surface that already exists for this.
--
-- Template: migrations/rs_topic_append_output_honest_access_error.sql.
--
-- SCOPE. Every SECURITY INVOKER function in the live DB that raised
-- "not found" off an RLS-protected zero-row read (17 of them; rs_topic_append_output
-- was already done as the template). Each body below is the LIVE body with only
-- its raise(s) rewritten — no behavioural change beyond the error text/code.
--
-- DELIBERATELY NOT CHANGED — these raise sites are genuinely reachable only
-- for a truly absent row, because the caller already passed the parent gate and
-- the child table's RLS policy is derived from that same parent access:
--   * get_table_row      'Row not found'    — udt_dataset_rows_select grants every
--     row of a dataset the caller can reach (its predicate is a superset of
--     udt_datasets_select), so past the table gate a null row IS a bad row_id.
--   * get_table_column   'Column not found' — same, via udt_dataset_fields_select.
--   * get_table_cell     'Column not found' — same.
--   * fn_get_library_full_page 'page not found' — processed_document_pages policies
--     key on the same can_read_processed_document/owner gate the document check
--     already passed, so a null page IS a bad page_index.
-- Their PARENT gates (the table / document existence checks) are rewritten below,
-- because those ARE the ambiguous ones.


-- ─── public.append_rows_to_user_table ───
CREATE OR REPLACE FUNCTION public.append_rows_to_user_table(p_table_id uuid, p_rows jsonb)
 RETURNS integer
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_inserted int;
  v_allowed  text[];
  v_row      jsonb;
  v_clean    jsonb;
  v_key      text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM workbench.udt_datasets
    WHERE id = p_table_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION
      'dataset % is not available to this account — it may not exist, or your access may not reach it',
      p_table_id
      USING ERRCODE = 'P0002';
  END IF;

  SELECT array_agg(field_name) INTO v_allowed
  FROM workbench.udt_dataset_fields
  WHERE table_id = p_table_id;

  v_inserted := 0;
  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows)
  LOOP
    v_clean := '{}'::jsonb;
    FOR v_key IN SELECT jsonb_object_keys(v_row)
    LOOP
      IF v_allowed IS NULL OR v_key = ANY(v_allowed) THEN
        v_clean := v_clean || jsonb_build_object(v_key, v_row -> v_key);
      END IF;
    END LOOP;

    INSERT INTO workbench.udt_dataset_rows (table_id, user_id, data)
    VALUES (p_table_id, auth.uid(), v_clean);
    v_inserted := v_inserted + 1;
  END LOOP;

  RETURN v_inserted;
END;
$function$;


-- ─── public.create_shortcut_from_agent_surface ───
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
    RAISE EXCEPTION
      'agent-surface binding % is not available to this account — it may not exist, or your access may not reach it',
      p_agent_surface_id
      USING ERRCODE = 'P0002';
  end if;

  select id, name, description into v_agent
    from agent.definition where id = v_agent_id;
  if not found then
    RAISE EXCEPTION
      'agent % is not available to this account — it may not exist, or your access may not reach it',
      v_agent_id
      USING ERRCODE = 'P0002';
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


-- ─── public.cx_canvas_toggle_favorite ───
CREATE OR REPLACE FUNCTION public.cx_canvas_toggle_favorite(p_canvas_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_new_state boolean;
BEGIN
  UPDATE canvas.canvas_items
  SET is_favorited = NOT is_favorited, updated_at = now()
  WHERE id = p_canvas_id
  RETURNING is_favorited INTO v_new_state;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'canvas item % is not available to this account — it may not exist, or your access may not reach it',
      p_canvas_id
      USING ERRCODE = 'P0002';
  END IF;

  RETURN v_new_state;
END;
$function$;


-- ─── public.cx_canvas_update_version ───
CREATE OR REPLACE FUNCTION public.cx_canvas_update_version(p_user_id uuid, p_original_canvas_id uuid, p_new_message_id uuid, p_artifact_index smallint, p_type text, p_title text, p_content jsonb)
 RETURNS canvas.canvas_items
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_hash text;
  v_root_id uuid;
  v_max_version smallint;
  v_conv_id uuid;
  v_row canvas.canvas_items;
BEGIN
  SELECT COALESCE(parent_canvas_id, id) INTO v_root_id
  FROM canvas.canvas_items
  WHERE id = p_original_canvas_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'canvas item % is not available to this account — it may not exist, or your access may not reach it',
      p_original_canvas_id
      USING ERRCODE = 'P0002';
  END IF;

  SELECT COALESCE(MAX(version), 0) INTO v_max_version
  FROM canvas.canvas_items
  WHERE id = v_root_id OR parent_canvas_id = v_root_id;

  SELECT conversation_id INTO v_conv_id
  FROM chat.message
  WHERE id = p_new_message_id;

  v_hash := encode(extensions.digest(p_content::text, 'sha256'), 'hex');

  INSERT INTO canvas.canvas_items (
    user_id, source_message_id, artifact_index, type, title,
    content, content_hash, conversation_id, source_type,
    version, parent_canvas_id
  )
  VALUES (
    p_user_id, p_new_message_id, p_artifact_index, p_type, p_title,
    p_content, v_hash, v_conv_id, 'model_direct',
    v_max_version + 1, v_root_id
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$function$;


-- ─── public.cx_fork_conversation ───
CREATE OR REPLACE FUNCTION public.cx_fork_conversation(p_conversation_id uuid, p_at_position smallint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
    v_src chat.conversation;
    v_new_conv_id uuid := gen_random_uuid();
    v_msg_map jsonb;
    v_tc_map jsonb;
    v_copied_count int := 0;
    v_assoc record;
BEGIN
    SELECT * INTO v_src
    FROM chat.conversation
    WHERE id = p_conversation_id
      AND deleted_at IS NULL;

    IF NOT FOUND THEN
      RAISE EXCEPTION
      'conversation % is not available to this account — it may not exist, or your access may not reach it',
      p_conversation_id
      USING ERRCODE = 'P0002';
    END IF;

    INSERT INTO chat.conversation (
        id, created_by, title, description, system_instruction,
        config, variables, overrides, metadata, keywords,
        status, visibility, is_ephemeral,
        source_app, source_feature,
        organization_id, task_id,
        initial_agent_id, initial_agent_version_id, last_model_id,
        forked_from_id, forked_at_position,
        parent_conversation_id, message_count
    ) VALUES (
        v_new_conv_id, v_src.created_by, v_src.title, v_src.description, v_src.system_instruction,
        v_src.config, v_src.variables, v_src.overrides, v_src.metadata, v_src.keywords,
        'active', v_src.visibility, v_src.is_ephemeral,
        v_src.source_app, v_src.source_feature,
        v_src.organization_id, v_src.task_id,
        v_src.initial_agent_id, v_src.initial_agent_version_id, v_src.last_model_id,
        p_conversation_id, p_at_position,
        NULL, 0
    );

    FOR v_assoc IN
        SELECT target_id, role, label, position, metadata
        FROM platform.associations
        WHERE source_type = 'conversation'
          AND source_id = p_conversation_id
          AND target_type = 'project'
        ORDER BY position NULLS LAST, created_at, id
    LOOP
        PERFORM public.assoc_link(
            'conversation', v_new_conv_id, 'project', v_assoc.target_id,
            v_assoc.role, v_assoc.label, v_assoc.position, v_assoc.metadata
        );
    END LOOP;

    SELECT COALESCE(jsonb_object_agg(m.id::text, gen_random_uuid()::text), '{}'::jsonb)
    INTO v_msg_map
    FROM chat.message m
    WHERE m.conversation_id = p_conversation_id
      AND m.deleted_at IS NULL
      AND m.position <= p_at_position;

    INSERT INTO chat.message (
        id, conversation_id, role, position, status,
        content, user_content, content_history,
        source, agent_id, is_visible_to_user, is_visible_to_model, metadata
    )
    SELECT (v_msg_map ->> m.id::text)::uuid, v_new_conv_id,
        m.role, m.position, m.status, m.content, m.user_content, m.content_history,
        m.source, m.agent_id, m.is_visible_to_user, m.is_visible_to_model, m.metadata
    FROM chat.message m
    WHERE m.conversation_id = p_conversation_id
      AND m.deleted_at IS NULL
      AND m.position <= p_at_position;

    GET DIAGNOSTICS v_copied_count = ROW_COUNT;
    UPDATE chat.conversation
    SET message_count = v_copied_count
    WHERE id = v_new_conv_id;

    SELECT COALESCE(jsonb_object_agg(tc.id::text, gen_random_uuid()::text), '{}'::jsonb)
    INTO v_tc_map
    FROM chat.tool_call tc
    WHERE tc.conversation_id = p_conversation_id
      AND tc.deleted_at IS NULL
      AND tc.message_id IS NOT NULL
      AND v_msg_map ? tc.message_id::text;

    INSERT INTO chat.tool_call (
        id, conversation_id, message_id, user_request_id,
        created_by, tool_name, tool_type, call_id, status,
        arguments, success, output, output_type,
        is_error, error_type, error_message,
        duration_ms, started_at, completed_at,
        input_tokens, output_tokens, total_tokens, cost_usd,
        iteration, retry_count, parent_call_id, execution_events,
        persist_key, file_path, metadata
    )
    SELECT (v_tc_map ->> tc.id::text)::uuid, v_new_conv_id,
        (v_msg_map ->> tc.message_id::text)::uuid, NULL,
        tc.created_by, tc.tool_name, tc.tool_type, tc.call_id, tc.status,
        tc.arguments, tc.success, tc.output, tc.output_type,
        tc.is_error, tc.error_type, tc.error_message,
        tc.duration_ms, tc.started_at, tc.completed_at,
        tc.input_tokens, tc.output_tokens, tc.total_tokens, tc.cost_usd,
        tc.iteration, tc.retry_count,
        CASE WHEN tc.parent_call_id IS NOT NULL AND v_tc_map ? tc.parent_call_id::text
             THEN (v_tc_map ->> tc.parent_call_id::text)::uuid ELSE NULL END,
        tc.execution_events, tc.persist_key, tc.file_path, tc.metadata
    FROM chat.tool_call tc
    WHERE tc.conversation_id = p_conversation_id
      AND tc.deleted_at IS NULL
      AND tc.message_id IS NOT NULL
      AND v_msg_map ? tc.message_id::text;

    INSERT INTO chat.artifact (
        conversation_id, message_id, created_by, organization_id, task_id,
        source_system, source_id, artifact_index,
        artifact_type, status, external_system, external_id, external_url,
        title, description, thumbnail_url, metadata
    )
    SELECT v_new_conv_id, (v_msg_map ->> a.message_id::text)::uuid,
        a.created_by, a.organization_id, a.task_id,
        'cx_message', (v_msg_map ->> a.message_id::text)::uuid, a.artifact_index,
        a.artifact_type, a.status, a.external_system, a.external_id, a.external_url,
        a.title, a.description, a.thumbnail_url, a.metadata
    FROM chat.artifact a
    WHERE a.conversation_id = p_conversation_id
      AND a.deleted_at IS NULL
      AND a.message_id IS NOT NULL
      AND v_msg_map ? a.message_id::text;

    INSERT INTO chat.media (conversation_id, created_by, kind, url, file_uri, mime_type, file_size_bytes, metadata)
    SELECT v_new_conv_id, m.created_by, m.kind, m.url, m.file_uri, m.mime_type, m.file_size_bytes,
        CASE WHEN m.metadata ? 'message_id' AND v_msg_map ? (m.metadata->>'message_id')
             THEN jsonb_set(m.metadata, '{message_id}', to_jsonb(v_msg_map ->> (m.metadata->>'message_id')))
             ELSE m.metadata END
    FROM chat.media m
    WHERE m.conversation_id = p_conversation_id
      AND m.deleted_at IS NULL
      AND (m.metadata->>'message_id' IS NULL OR v_msg_map ? (m.metadata->>'message_id'));

    RETURN get_cx_conversation_bundle(v_new_conv_id);
END;
$function$;


-- ─── public.cx_message_set_reaction ───
CREATE OR REPLACE FUNCTION public.cx_message_set_reaction(p_message_id uuid, p_reaction text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_metadata jsonb;
begin
  if p_reaction is not null and p_reaction not in ('', 'like', 'dislike') then
    raise exception 'invalid reaction: %', p_reaction;
  end if;

  update chat.message
     set metadata = case
       when p_reaction is null or p_reaction = ''
         then coalesce(metadata, '{}'::jsonb) - 'user_reaction'
       else jsonb_set(
         coalesce(metadata, '{}'::jsonb),
         '{user_reaction}',
         to_jsonb(p_reaction),
         true
       )
     end
   where id = p_message_id
  returning metadata into v_metadata;

  if not found then
    RAISE EXCEPTION
      'message % is not available to this account — it may not exist, or your access may not reach it',
      p_message_id
      USING ERRCODE = 'P0002';
  end if;

  return v_metadata;
end;
$function$;


-- ─── public.dict_owner_org ───
CREATE OR REPLACE FUNCTION public.dict_owner_org(p_level text, p_owner_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE v_org uuid;
BEGIN
    IF p_level = 'user' THEN
        RETURN NULL;
    ELSIF p_level = 'organization' THEN
        SELECT id INTO v_org FROM iam.organizations WHERE id = p_owner_id;
    ELSIF p_level = 'scope_type' THEN
        SELECT organization_id INTO v_org FROM context.scope_types WHERE id = p_owner_id;
    ELSIF p_level = 'scope' THEN
        SELECT organization_id INTO v_org FROM context.scopes WHERE id = p_owner_id;
    ELSE
        RAISE EXCEPTION 'dict: unknown level "%"', p_level USING ERRCODE = '22023';
    END IF;

    IF p_level <> 'user' AND v_org IS NULL THEN
        RAISE EXCEPTION
          'dict: % "%" is not available to this account — it may not exist, or your access may not reach it',
          p_level, p_owner_id
          USING ERRCODE = 'P0002';
    END IF;
    RETURN v_org;
END;
$function$;


-- ─── public.get_full_table ───
CREATE OR REPLACE FUNCTION public.get_full_table(ref jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
  v_table_id uuid;
  v_table_name text;
  j jsonb;
BEGIN
  v_table_id := (ref->>'table_id')::uuid;
  v_table_name := ref->>'table_name';

  IF NOT EXISTS (
    SELECT 1 FROM workbench.udt_datasets t
    WHERE t.id = v_table_id
      AND (v_table_name IS NULL OR t.table_name = v_table_name)
  ) THEN
    RAISE EXCEPTION
      'dataset % is not available to this account — it may not exist, the table_name may not match, or your access may not reach it',
      v_table_id
      USING ERRCODE = 'P0002';
  END IF;

  j := jsonb_build_object(
    -- Full row. row_ordering_config in particular is load-bearing: it carries
    -- default_sort, which the dataset viewer applies on first load.
    'table',
    (
      SELECT to_jsonb(t)
      FROM workbench.udt_datasets t
      WHERE t.id = v_table_id
    ),
    -- Full field rows, in field_order. validation_rules and default_value are
    -- needed by export and by any column-editing surface.
    'columns',
    (
      SELECT COALESCE(
               jsonb_agg(to_jsonb(tf) ORDER BY tf.field_order, tf.created_at),
               '[]'::jsonb)
      FROM workbench.udt_dataset_fields tf
      WHERE tf.table_id = v_table_id
    ),
    -- COUNT(*), not the length of a materialized row array. This is the whole
    -- reason to call this instead of get_user_table_complete.
    'row_count',
    (
      SELECT COUNT(*)::int
      FROM workbench.udt_dataset_rows d
      WHERE d.table_id = v_table_id
    )
  );

  RETURN j;
END;
$function$;


-- ─── public.get_table_cell ───
CREATE OR REPLACE FUNCTION public.get_table_cell(ref jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
  v_table_id uuid := (ref->>'table_id')::uuid;
  v_table_name text := ref->>'table_name';
  v_row_id uuid := (ref->>'row_id')::uuid;
  v_field_name text := ref->>'column_name';
  v_display_name text := ref->>'column_display_name';
  v_resolved_field text;
  v_value jsonb;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM workbench.udt_datasets t
    WHERE t.id = v_table_id
      AND (v_table_name IS NULL OR t.table_name = v_table_name)
  ) THEN
    RAISE EXCEPTION
      'dataset % is not available to this account — it may not exist, the table_name may not match, or your access may not reach it',
      v_table_id
      USING ERRCODE = 'P0002';
  END IF;

  IF v_field_name IS NULL THEN
    SELECT tf.field_name INTO v_resolved_field
    FROM workbench.udt_dataset_fields tf
    WHERE tf.table_id = v_table_id
      AND tf.display_name = v_display_name
    LIMIT 1;
  ELSE
    v_resolved_field := v_field_name;
  END IF;

  IF v_resolved_field IS NULL THEN
    RAISE EXCEPTION 'Column not found';
  END IF;

  SELECT d.data -> v_resolved_field
  INTO v_value
  FROM workbench.udt_dataset_rows d
  WHERE d.table_id = v_table_id
    AND d.id = v_row_id;

  IF v_value IS NULL THEN
    RETURN jsonb_build_object('value', null, 'field', v_resolved_field);
  END IF;

  RETURN jsonb_build_object('value', v_value, 'field', v_resolved_field);
END;
$function$;


-- ─── public.get_table_column ───
CREATE OR REPLACE FUNCTION public.get_table_column(ref jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
  v_table_id uuid := (ref->>'table_id')::uuid;
  v_table_name text := ref->>'table_name';
  v_field_name text := ref->>'column_name';
  v_display_name text := ref->>'column_display_name';
  j jsonb;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM workbench.udt_datasets t
    WHERE t.id = v_table_id
      AND (v_table_name IS NULL OR t.table_name = v_table_name)
  ) THEN
    RAISE EXCEPTION
      'dataset % is not available to this account — it may not exist, the table_name may not match, or your access may not reach it',
      v_table_id
      USING ERRCODE = 'P0002';
  END IF;

  SELECT to_jsonb(tf)
  INTO j
  FROM workbench.udt_dataset_fields tf
  WHERE tf.table_id = v_table_id
    AND (
      (v_field_name IS NOT NULL AND tf.field_name = v_field_name)
      OR (v_field_name IS NULL AND v_display_name IS NOT NULL AND tf.display_name = v_display_name)
    )
  LIMIT 1;

  IF j IS NULL THEN
    RAISE EXCEPTION 'Column not found';
  END IF;

  RETURN j;
END;
$function$;


-- ─── public.get_table_row ───
CREATE OR REPLACE FUNCTION public.get_table_row(ref jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
  v_table_id uuid := (ref->>'table_id')::uuid;
  v_table_name text := ref->>'table_name';
  v_row_id uuid := (ref->>'row_id')::uuid;
  j jsonb;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM workbench.udt_datasets t
    WHERE t.id = v_table_id
      AND (v_table_name IS NULL OR t.table_name = v_table_name)
  ) THEN
    RAISE EXCEPTION
      'dataset % is not available to this account — it may not exist, the table_name may not match, or your access may not reach it',
      v_table_id
      USING ERRCODE = 'P0002';
  END IF;

  j := (
    SELECT to_jsonb(d)
    FROM workbench.udt_dataset_rows d
    WHERE d.table_id = v_table_id
      AND d.id = v_row_id
  );

  IF j IS NULL THEN
    RAISE EXCEPTION 'Row not found';
  END IF;

  RETURN j;
END;
$function$;


-- ─── public.list_table_rows ───
CREATE OR REPLACE FUNCTION public.list_table_rows(ref jsonb, limit_rows integer DEFAULT 100, offset_rows integer DEFAULT 0, order_by text DEFAULT 'created_at'::text, order_dir text DEFAULT 'desc'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
  v_table_id uuid := (ref->>'table_id')::uuid;
  v_table_name text := ref->>'table_name';
  j jsonb;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM workbench.udt_datasets t
    WHERE t.id = v_table_id
      AND (v_table_name IS NULL OR t.table_name = v_table_name)
  ) THEN
    RAISE EXCEPTION
      'dataset % is not available to this account — it may not exist, the table_name may not match, or your access may not reach it',
      v_table_id
      USING ERRCODE = 'P0002';
  END IF;

  IF order_by NOT IN ('created_at','updated_at','id') THEN
    order_by := 'created_at';
  END IF;
  IF lower(order_dir) NOT IN ('asc','desc') THEN
    order_dir := 'desc';
  END IF;

  j := (
    SELECT jsonb_build_object(
      'rows', jsonb_agg(to_jsonb(d)),
      'total', (SELECT COUNT(*)::int FROM workbench.udt_dataset_rows dd WHERE dd.table_id = v_table_id)
    )
    FROM (
      SELECT d.*
      FROM workbench.udt_dataset_rows d
      WHERE d.table_id = v_table_id
      ORDER BY
        CASE WHEN order_by = 'created_at' AND lower(order_dir) = 'asc' THEN d.created_at END ASC,
        CASE WHEN order_by = 'created_at' AND lower(order_dir) = 'desc' THEN d.created_at END DESC,
        CASE WHEN order_by = 'updated_at' AND lower(order_dir) = 'asc' THEN d.updated_at END ASC,
        CASE WHEN order_by = 'updated_at' AND lower(order_dir) = 'desc' THEN d.updated_at END DESC,
        CASE WHEN order_by = 'id' AND lower(order_dir) = 'asc' THEN d.id END ASC,
        CASE WHEN order_by = 'id' AND lower(order_dir) = 'desc' THEN d.id END DESC,
        -- `d.id` is the unique tiebreaker that makes this a TOTAL order. Do not remove it.
        d.id DESC
      LIMIT limit_rows OFFSET offset_rows
    ) d
  );

  RETURN COALESCE(j, jsonb_build_object('rows','[]'::jsonb,'total',0));
END;
$function$;


-- ─── public.page_extraction_clear_job_results ───
CREATE OR REPLACE FUNCTION public.page_extraction_clear_job_results(p_job_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'docproc', 'public'
AS $function$
BEGIN
  DELETE FROM docproc.page_extraction_results   WHERE job_id = p_job_id;
  DELETE FROM docproc.page_extraction_page_runs WHERE job_id = p_job_id;
  DELETE FROM docproc.page_extraction_runs      WHERE job_id = p_job_id;

  UPDATE docproc.page_extraction_jobs
     SET latest_run_id = null, updated_at = now()
   WHERE id = p_job_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'extraction dataset % is not available to this account — it may not exist, or your access may not reach it',
      p_job_id
      USING ERRCODE = 'P0002';
  END IF;
END;
$function$;


-- ─── public.research_topic_resource_manifest ───
CREATE OR REPLACE FUNCTION public.research_topic_resource_manifest(p_topic_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE v_topic research.rs_topic; v_result jsonb;
BEGIN
  SELECT * INTO v_topic FROM research.rs_topic WHERE id = p_topic_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION
      'research topic % is not available to this account — it may not exist, or your access may not reach it',
      p_topic_id
      USING ERRCODE = 'P0002';
  END IF;
  WITH latest_analysis AS (
    SELECT DISTINCT ON (source_id) id, source_id FROM research.rs_analysis
    WHERE topic_id=p_topic_id AND agent_type='page_summary'
    ORDER BY source_id, updated_at DESC, created_at DESC NULLS LAST, id DESC
  ),
  items AS (
    SELECT 'search.result'::text AS k, s.id AS id, NULL::uuid AS p,
      left(coalesce(s.title,s.url),140) AS l, s.hostname AS s2,
      coalesce(length(s.url),0) + coalesce(length(s.page_age),0)
        + coalesce(length(s.title),0) + coalesce(length(s.description),0)
        + coalesce(length(s.extra_snippets::text),0) AS c,
      s.scrape_status AS st, coalesce(s.last_seen_at,s.discovered_at) AS t,
      jsonb_strip_nulls(jsonb_build_object('included',s.is_included,'authority',s.authority_score,
        'tier',s.authority_tier,'hostname',s.hostname,'url',s.url,'origin',s.origin,'type',s.source_type)) AS f
    FROM research.rs_source s WHERE s.topic_id=p_topic_id
    UNION ALL
    SELECT 'search.raw', s.id, NULL::uuid, left(coalesce(s.title,s.url),140), s.hostname,
      length(s.raw_search_result::text), NULL, coalesce(s.last_seen_at,s.discovered_at),
      jsonb_strip_nulls(jsonb_build_object('included',s.is_included,'hostname',s.hostname,
        'authority',s.authority_score,'tier',s.authority_tier))
    FROM research.rs_source s WHERE s.topic_id=p_topic_id AND s.raw_search_result IS NOT NULL
    UNION ALL
    SELECT 'search.keyword_serp', k.id, k.id, left(k.keyword,140), k.search_provider,
      length(k.raw_api_response::text), NULL, k.last_searched_at,
      jsonb_strip_nulls(jsonb_build_object('provider',k.search_provider,'result_count',k.result_count))
    FROM research.rs_keyword k WHERE k.topic_id=p_topic_id AND k.raw_api_response IS NOT NULL
    UNION ALL
    SELECT 'page.content', c.id, c.source_id, left(coalesce(s.title,s.url,'Untitled page'),140), s.hostname,
      coalesce(c.char_count,length(c.content),0),
      CASE WHEN c.is_good_scrape THEN 'success' ELSE 'poor' END,
      coalesce(c.scraped_at,c.updated_at),
      jsonb_strip_nulls(jsonb_build_object('good_scrape',c.is_good_scrape,'included',s.is_included,
        'hostname',s.hostname,'authority',s.authority_score,'tier',s.authority_tier,
        'edited',(c.original_content IS NOT NULL),'capture',c.capture_method))
    FROM research.rs_content c JOIN research.rs_source s ON s.id=c.source_id
    WHERE c.topic_id=p_topic_id AND c.is_current=true
    UNION ALL
    SELECT 'page.analysis', a.id, a.source_id, left(coalesce(s.title,s.url,'Untitled page'),140), a.agent_type,
      coalesce(length(a.result),0), a.status, coalesce(a.updated_at,a.created_at),
      jsonb_strip_nulls(jsonb_build_object('agent_type',a.agent_type,'latest',(la.id IS NOT NULL),
        'included',s.is_included,'hostname',s.hostname,'authority',s.authority_score,'tier',s.authority_tier))
    FROM research.rs_analysis a LEFT JOIN research.rs_source s ON s.id=a.source_id
    LEFT JOIN latest_analysis la ON la.id=a.id WHERE a.topic_id=p_topic_id
    UNION ALL
    SELECT 'page.scoring', s.id, s.id, left(coalesce(s.title,s.url),140), s.recommended_use,
      length(s.page_analysis::text), s.analysis_status, coalesce(s.authority_ranked_at,s.updated_at),
      jsonb_strip_nulls(jsonb_build_object('included',s.is_included,'hostname',s.hostname,
        'pre_read',s.pre_read_score,'post_read',s.post_read_score,'final',s.final_source_score,
        'recommended_use',s.recommended_use,'authority',s.authority_score,'tier',s.authority_tier))
    FROM research.rs_source s WHERE s.topic_id=p_topic_id AND s.page_analysis IS NOT NULL
    UNION ALL
    SELECT 'page.links', c.id, c.source_id, left(coalesce(s.title,s.url),140), s.hostname,
      length(c.extracted_links::text), NULL, coalesce(c.scraped_at,c.updated_at),
      jsonb_strip_nulls(jsonb_build_object('included',s.is_included,'hostname',s.hostname,
        'count',jsonb_array_length(c.extracted_links)))
    FROM research.rs_content c JOIN research.rs_source s ON s.id=c.source_id
    WHERE c.topic_id=p_topic_id AND c.is_current=true AND jsonb_typeof(c.extracted_links)='array'
      AND jsonb_array_length(c.extracted_links)>0
    UNION ALL
    SELECT 'page.images', c.id, c.source_id, left(coalesce(s.title,s.url),140), s.hostname,
      length(c.extracted_images::text), NULL, coalesce(c.scraped_at,c.updated_at),
      jsonb_strip_nulls(jsonb_build_object('included',s.is_included,'hostname',s.hostname,
        'count',jsonb_array_length(c.extracted_images)))
    FROM research.rs_content c JOIN research.rs_source s ON s.id=c.source_id
    WHERE c.topic_id=p_topic_id AND c.is_current=true AND jsonb_typeof(c.extracted_images)='array'
      AND jsonb_array_length(c.extracted_images)>0
    UNION ALL
    SELECT 'synthesis.keyword', y.id, y.keyword_id, left(coalesce(k.keyword,'Keyword synthesis'),140), y.model_id,
      coalesce(length(y.result),coalesce(length(y.result_structured::text),0)), y.status,
      coalesce(y.updated_at,y.created_at),
      jsonb_strip_nulls(jsonb_build_object('current',y.is_current,'version',y.version,
        'keyword_id',y.keyword_id,'iteration',y.iteration_mode))
    FROM research.rs_synthesis y LEFT JOIN research.rs_keyword k ON k.id=y.keyword_id
    WHERE y.topic_id=p_topic_id AND y.scope='keyword'
    UNION ALL
    SELECT 'synthesis.tag', y.id, y.tag_id, left(coalesce(g.name,'Tag consolidation'),140), y.model_id,
      coalesce(length(y.result),coalesce(length(y.result_structured::text),0)), y.status,
      coalesce(y.updated_at,y.created_at),
      jsonb_strip_nulls(jsonb_build_object('current',y.is_current,'version',y.version,'tag_id',y.tag_id))
    FROM research.rs_synthesis y LEFT JOIN research.rs_tag g ON g.id=y.tag_id
    WHERE y.topic_id=p_topic_id AND y.tag_id IS NOT NULL AND y.scope<>'keyword'
    UNION ALL
    SELECT 'synthesis.topic', y.id, NULL::uuid, left(coalesce(v_topic.name,'Topic report'),140), y.model_id,
      coalesce(length(y.result),coalesce(length(y.result_structured::text),0)), y.status,
      coalesce(y.updated_at,y.created_at),
      jsonb_strip_nulls(jsonb_build_object('current',y.is_current,'version',y.version))
    FROM research.rs_synthesis y WHERE y.topic_id=p_topic_id
      AND y.scope IN ('topic','project') AND y.tag_id IS NULL
    UNION ALL
    SELECT 'document.report', d.id, NULL::uuid, left(coalesce(d.title,'Document'),140), d.model_id,
      coalesce(length(d.content),0), d.status, coalesce(d.updated_at,d.created_at),
      jsonb_strip_nulls(jsonb_build_object('current',d.is_current,'version',d.version))
    FROM research.rs_document d WHERE d.topic_id=p_topic_id
    UNION ALL
    SELECT 'media.items', m.id, m.source_id,
      left(coalesce(nullif(m.alt_text,''),nullif(m.caption,''),m.url),140), m.media_type,
      coalesce(length(m.alt_text),0)+coalesce(length(m.caption),0)+coalesce(length(m.url),0),
      NULL, m.created_at,
      jsonb_strip_nulls(jsonb_build_object('relevant',m.is_relevant,'type',m.media_type,'url',m.url,
        'thumbnail',m.thumbnail_url,'width',m.width,'height',m.height))
    FROM research.rs_media m WHERE m.topic_id=p_topic_id
  ),
  edges AS (
    SELECT sk.id AS source_id, sk.keyword_id, sk.rank_for_keyword AS rank
    FROM research.rs_source_keywords sk WHERE sk.topic_id=p_topic_id AND sk.keyword_id IS NOT NULL
  )
  SELECT jsonb_build_object(
    'topic_id',p_topic_id,'generated_at',now(),
    'topic',jsonb_build_object('id',v_topic.id,'name',v_topic.name,'description',v_topic.description,
      'tone_profile',v_topic.tone_profile,'status',v_topic.status,'created_at',v_topic.created_at),
    'keywords',coalesce((SELECT jsonb_agg(jsonb_build_object('id',k.id,'keyword',k.keyword,'position',k.position,
      'searched_at',k.last_searched_at,'stale',k.is_stale,'result_count',k.result_count)
      ORDER BY k.position NULLS LAST,k.created_at) FROM research.rs_keyword k WHERE k.topic_id=p_topic_id),'[]'::jsonb),
    'tags',coalesce((SELECT jsonb_agg(jsonb_build_object('id',g.id,'name',g.name,'description',g.description,
      'sort_order',g.sort_order) ORDER BY g.sort_order NULLS LAST,g.name)
      FROM research.rs_tag g WHERE g.topic_id=p_topic_id),'[]'::jsonb),
    'tag_sources',coalesce((SELECT jsonb_agg(jsonb_build_array(a.target_id,a.source_id))
      FROM platform.associations a WHERE a.source_type='research_source' AND a.target_type='research_tag'
        AND a.target_id IN (SELECT id FROM research.rs_tag WHERE topic_id=p_topic_id)),'[]'::jsonb),
    'edges',coalesce((SELECT jsonb_agg(jsonb_build_array(e.source_id,e.keyword_id,e.rank)) FROM edges e),'[]'::jsonb),
    'kinds',coalesce((SELECT jsonb_agg(jsonb_build_object('kind',g.k,'item_count',g.n,'chars',g.chars) ORDER BY g.k)
      FROM (SELECT k,count(*) AS n,coalesce(sum(c),0) AS chars FROM items GROUP BY k) g),'[]'::jsonb),
    'items',coalesce((SELECT jsonb_agg(jsonb_build_object('k',i.k,'id',i.id,'p',i.p,'l',i.l,'s',i.s2,
      'c',coalesce(i.c,0),'st',i.st,'t',i.t,'f',i.f)) FROM items i),'[]'::jsonb)
  ) INTO v_result;
  RETURN v_result;
END; $function$;


-- ─── public.udt_validate_row ───
CREATE OR REPLACE FUNCTION public.udt_validate_row(p_table_id uuid, p_data jsonb, p_prior jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_field RECORD; v_value JSONB; v_old_value JSONB; v_mode TEXT;
  v_is_insert BOOLEAN := p_prior IS NULL; v_had BOOLEAN; v_has BOOLEAN;
BEGIN
  SELECT validation_mode INTO v_mode FROM workbench.udt_datasets WHERE id = p_table_id;
  IF v_mode IS NULL THEN
    RAISE EXCEPTION
      'dataset % is not available to this account — it may not exist, or your access may not reach it',
      p_table_id
      USING ERRCODE = 'P0002';
  END IF;

  -- permissive (default for every pre-existing dataset) enforces NOTHING.
  IF v_mode <> 'strict' THEN
    RETURN p_data;
  END IF;

  FOR v_field IN
    SELECT field_name, data_type, is_required FROM workbench.udt_dataset_fields WHERE table_id = p_table_id
  LOOP
    v_value := p_data -> v_field.field_name;
    v_old_value := p_prior -> v_field.field_name;
    v_has := v_value IS NOT NULL AND jsonb_typeof(v_value) <> 'null';
    v_had := v_old_value IS NOT NULL AND jsonb_typeof(v_old_value) <> 'null';

    IF v_field.is_required AND NOT v_has THEN
      IF v_is_insert THEN
        RAISE EXCEPTION 'udt_validate_row: required field % missing on insert into table %', v_field.field_name, p_table_id;
      ELSIF v_had THEN
        RAISE EXCEPTION 'udt_validate_row: required field % cannot be dropped on table %', v_field.field_name, p_table_id;
      END IF;
      CONTINUE;
    END IF;

    IF v_has THEN
      CASE v_field.data_type::text
        WHEN 'string' THEN
          IF jsonb_typeof(v_value) NOT IN ('string','number') THEN
            RAISE EXCEPTION 'udt_validate_row: field % expects string, got %', v_field.field_name, jsonb_typeof(v_value);
          END IF;
        WHEN 'number' THEN
          IF jsonb_typeof(v_value) NOT IN ('number','string') THEN
            RAISE EXCEPTION 'udt_validate_row: field % expects number, got %', v_field.field_name, jsonb_typeof(v_value);
          END IF;
          IF jsonb_typeof(v_value) = 'string' THEN
            BEGIN PERFORM (v_value #>> '{}')::numeric;
            EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'udt_validate_row: field % value is not numeric', v_field.field_name; END;
          END IF;
        WHEN 'integer' THEN
          IF jsonb_typeof(v_value) NOT IN ('number','string') THEN
            RAISE EXCEPTION 'udt_validate_row: field % expects integer, got %', v_field.field_name, jsonb_typeof(v_value);
          END IF;
          BEGIN PERFORM (v_value #>> '{}')::bigint;
          EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'udt_validate_row: field % value is not an integer', v_field.field_name; END;
        WHEN 'boolean' THEN
          IF jsonb_typeof(v_value) NOT IN ('boolean','string') THEN
            RAISE EXCEPTION 'udt_validate_row: field % expects boolean, got %', v_field.field_name, jsonb_typeof(v_value);
          END IF;
        WHEN 'date','datetime' THEN
          IF jsonb_typeof(v_value) <> 'string' THEN
            RAISE EXCEPTION 'udt_validate_row: field % expects ISO date string, got %', v_field.field_name, jsonb_typeof(v_value);
          END IF;
          BEGIN PERFORM (v_value #>> '{}')::timestamptz;
          EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'udt_validate_row: field % value is not parseable as date', v_field.field_name; END;
        WHEN 'json' THEN NULL;
        WHEN 'array' THEN
          IF jsonb_typeof(v_value) <> 'array' THEN
            RAISE EXCEPTION 'udt_validate_row: field % expects array, got %', v_field.field_name, jsonb_typeof(v_value);
          END IF;
        ELSE NULL;
      END CASE;
    END IF;
  END LOOP;
  RETURN p_data;
END;
$function$;


-- ─── rag.fn_get_library_full_page ───
CREATE OR REPLACE FUNCTION rag.fn_get_library_full_page(p_id uuid, p_page_index integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'rag', 'docproc'
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM docproc.processed_documents WHERE id = p_id) THEN
    RAISE EXCEPTION
      'document % is not available to this account — it may not exist, or your access may not reach it',
      p_id
      USING ERRCODE = 'P0002';
  END IF;

  SELECT jsonb_build_object(
    'page_index', p.page_index,
    'page_number', p.page_number,
    'raw_text', COALESCE(p.raw_text, ''),
    'raw_char_count', COALESCE(p.raw_char_count, 0),
    'cleaned_text', COALESCE(p.cleaned_text, ''),
    'cleaned_char_count', COALESCE(p.cleaned_char_count, 0),
    'extraction_method', p.extraction_method,
    'used_ocr', COALESCE(p.used_ocr, false),
    'section_kind', p.section_kind,
    'section_title', p.section_title,
    'is_continuation', COALESCE(p.is_continuation, false),
    'has_image', (p.image_cld_file_id IS NOT NULL)
  ) INTO v_result
  FROM docproc.processed_document_pages p
  WHERE p.processed_document_id = p_id AND p.page_index = p_page_index;

  IF v_result IS NULL THEN
    RAISE EXCEPTION 'page not found';
  END IF;

  RETURN v_result;
END;
$function$;


-- ─── rag.fn_list_library_chunks ───
CREATE OR REPLACE FUNCTION rag.fn_list_library_chunks(p_id uuid, p_limit integer DEFAULT 100, p_offset integer DEFAULT 0, p_parent_only boolean DEFAULT false, p_children_only boolean DEFAULT false, p_page_number integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'rag', 'docproc'
AS $function$
DECLARE
  v_limit int := GREATEST(1, LEAST(p_limit, 500));
  v_offset int := GREATEST(0, p_offset);
  v_total int;
  v_result jsonb;
BEGIN
  IF p_parent_only AND p_children_only THEN
    RAISE EXCEPTION 'parent_only and children_only are mutually exclusive';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM docproc.processed_documents WHERE id = p_id) THEN
    RAISE EXCEPTION
      'document % is not available to this account — it may not exist, or your access may not reach it',
      p_id
      USING ERRCODE = 'P0002';
  END IF;

  SELECT COUNT(*) INTO v_total FROM rag.kg_chunks
   WHERE processed_document_id = p_id AND valid_to IS NULL
     AND (NOT p_parent_only OR parent_chunk_id IS NULL)
     AND (NOT p_children_only OR parent_chunk_id IS NOT NULL)
     AND (p_page_number IS NULL OR p_page_number = ANY(page_numbers));

  SELECT jsonb_build_object(
    'total', v_total,
    'limit', v_limit,
    'offset', v_offset,
    'chunks', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', c.id,
        'chunk_index', c.chunk_index,
        'chunk_kind', c.chunk_kind,
        'parent_chunk_id', c.parent_chunk_id,
        'page_numbers', c.page_numbers,
        'token_count', c.token_count,
        'content_text', COALESCE(c.content_text, ''),
        'has_oai_embedding', EXISTS (SELECT 1 FROM rag.embeddings_voyage_4_large_1024 e WHERE e.chunk_id = c.id),
        'has_voyage_embedding', EXISTS (SELECT 1 FROM rag.embeddings_voyage_code_3_1024 e WHERE e.chunk_id = c.id),
        'section_kind', c.metadata->>'section_kind',
        'metadata', c.metadata
      ))
      FROM (
        SELECT * FROM rag.kg_chunks
        WHERE processed_document_id = p_id AND valid_to IS NULL
          AND (NOT p_parent_only OR parent_chunk_id IS NULL)
          AND (NOT p_children_only OR parent_chunk_id IS NOT NULL)
          AND (p_page_number IS NULL OR p_page_number = ANY(page_numbers))
        -- `id` is the unique tiebreaker that makes this a TOTAL order. Do not remove it.
        ORDER BY chunk_index, created_at, id
        LIMIT v_limit OFFSET v_offset
      ) c
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;
