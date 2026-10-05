-- chair-step: INVERSE of migrations/campaign/scopesfts1g_the_last_scope_readers_read_the_store.sql (lane FINISH-THE-SWITCH, FTS-1g): the six bodies read the old scope tables again.
-- lane: FINISH-THE-SWITCH (FTS-1g)
-- lock: public,custom

CREATE OR REPLACE FUNCTION public.scope_system_inspect(p_org_id uuid, p_include_values boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if iam.has_org_access(p_org_id) is not true then raise exception 'not authorized for this organization' using errcode='42501',
            detail = jsonb_build_object('org_id', p_org_id)::text; end if;
  return jsonb_build_object(
    'organization_id',p_org_id,
    'scope_types',coalesce((select jsonb_agg(
      (to_jsonb(st)-'organization_id'-'created_at'-'updated_at'-'updated_by') || jsonb_build_object(
        'context_items',coalesce((select jsonb_agg(to_jsonb(ci)-'created_at'-'updated_at'-'status_updated_at'-'status_updated_by'-'created_by'-'updated_by' order by ci.sort_order,ci.display_name)
          from context.context_items ci where ci.scope_type_id=st.id and ci.is_active and ci.deleted_at is null),'[]'::jsonb),
        'scopes',coalesce((select jsonb_agg((to_jsonb(s)-'organization_id'-'created_at'-'updated_at'-'created_by'-'updated_by') ||
          case when p_include_values then jsonb_build_object('values',coalesce((select jsonb_object_agg(ci.key,
            coalesce(to_jsonb(v.value_text),to_jsonb(v.value_number),to_jsonb(v.value_boolean),v.value_json,to_jsonb(v.value_date),to_jsonb(v.value_timestamp),to_jsonb(v.value_time),to_jsonb(v.value_document_url)))
            from context.context_items ci left join context.context_item_values v on v.context_item_id=ci.id and v.scope_id=s.id and v.is_current
            where ci.scope_type_id=st.id and ci.is_active and ci.deleted_at is null),'{}'::jsonb)) else '{}'::jsonb end
          order by s.sort_order,s.name) from context.scopes s where s.scope_type_id=st.id and s.deleted_at is null and context._scope_readable(s.id,'viewer')),'[]'::jsonb)
      ) order by st.sort_order,st.label_singular) from context.scope_types st where st.organization_id=p_org_id and st.deleted_at is null),'[]'::jsonb),
    'table_templates',public.list_udt_dataset_templates(p_org_id)
  );
end; $function$
;

CREATE OR REPLACE FUNCTION public.scope_system_apply(p_org_id uuid, p_operations jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  op jsonb; kind text; v_id uuid; v_type_id uuid; v_parent_id uuid; v_item_id uuid; v_scope_id uuid;
  v_template_id uuid; v_row jsonb; v_results jsonb := '[]'::jsonb; v_value jsonb; v_value_type text;
  v_spec jsonb; v_answer jsonb; k text;
begin
  if iam.has_org_admin(p_org_id) is not true then
    raise exception 'organization admin required for this organization' using errcode = '42501',
            detail = jsonb_build_object('org_id', p_org_id)::text;
  end if;
  if jsonb_typeof(p_operations) <> 'array' then
    raise exception 'operations must be an array' using errcode = '22023';
  end if;

  for op in select * from jsonb_array_elements(p_operations) loop
    kind := op->>'op'; v_id := null; v_type_id := null; v_parent_id := null;
    v_item_id := null; v_scope_id := null; v_template_id := null; v_row := null; v_spec := '{}'::jsonb;

    if kind = 'upsert_scope_type' then
      if op ? 'id' then
        select st.id into v_id from context.scope_types st
         where st.id = (op->>'id')::uuid and st.organization_id = p_org_id;
      end if;
      if v_id is null and not (op ? 'id') then
        select id into v_id from context.scope_types
        where organization_id = p_org_id and deleted_at is null and slug = op->>'key';
      end if;
      v_parent_id := null;
      if op ? 'parent_key' then
        select id into v_parent_id from context.scope_types
        where organization_id = p_org_id and deleted_at is null and slug = op->>'parent_key';
      end if;
      if v_id is null and not (op ? 'id') then
        v_answer := custom.context_type_write(p_org_id, null, jsonb_strip_nulls(jsonb_build_object(
          'label_singular', op->>'label_singular',
          'label_plural', coalesce(op->>'label_plural', (op->>'label_singular') || 's'),
          'parent_type_id', v_parent_id,
          'icon', coalesce(op->>'icon', 'folder'),
          'description', coalesce(op->>'description', ''),
          'color', coalesce(op->>'color', ''),
          'sort_order', coalesce((op->>'sort_order')::smallint, 0),
          'max_assignments', nullif(op->>'max_assignments', '')::smallint,
          'default_variable_keys', coalesce(op->'default_variable_keys', '[]'::jsonb),
          'slug', op->>'key')));
        v_id := (v_answer -> 'row' ->> 'id')::uuid;
      elsif v_id is not null then
        foreach k in array array['label_singular', 'label_plural', 'icon', 'description', 'color'] loop
          if op->>k is not null then v_spec := v_spec || jsonb_build_object(k, op->>k); end if;
        end loop;
        if op->>'sort_order' is not null then
          v_spec := v_spec || jsonb_build_object('sort_order', (op->>'sort_order')::smallint);
        end if;
        if op ? 'max_assignments' then
          v_spec := v_spec || jsonb_build_object('max_assignments', nullif(op->>'max_assignments', '')::smallint);
        end if;
        if op ? 'parent_key' then
          v_spec := v_spec || jsonb_build_object('parent_type_id', v_parent_id);
        end if;
        perform custom.context_type_write(p_org_id, v_id, v_spec);
      end if;
      select to_jsonb(st) into v_row from context.scope_types st where id = v_id;

    elsif kind = 'archive_scope_type' then
      select id into v_id from context.scope_types
      where organization_id = p_org_id and deleted_at is null
        and (id::text = op->>'id' or slug = op->>'key');
      if v_id is not null then
        perform custom.context_type_archive(v_id);
      end if;
      v_row := jsonb_build_object('id', v_id, 'archived', true);

    elsif kind = 'upsert_context_item' then
      v_type_id := public._scope_system_resolve_type_id(p_org_id, op, 'context item');
      if op ? 'id' then
        select ci.id into v_item_id from context.context_items ci
         where ci.id = (op->>'id')::uuid and ci.scope_type_id = v_type_id;
      else
        select id into v_item_id from context.context_items
        where scope_type_id = v_type_id and is_active and deleted_at is null and key = op->>'key';
      end if;
      if op->'reference_source'->>'container_type' = 'dataset_template' then
        if not (op->'reference_source' ? 'template_id') and op->'reference_source' ? 'template_name' then
          select id into v_template_id from workbench.udt_dataset_templates
          where organization_id = p_org_id and is_active
            and lower(name) = lower(op->'reference_source'->>'template_name');
          if v_template_id is null then
            raise exception 'table template % not found',
              op->'reference_source'->>'template_name' using errcode = '22023';
          end if;
          op := jsonb_set(op, '{reference_source,template_id}', to_jsonb(v_template_id::text), true);
        end if;
        perform context.validate_dataset_template_source(op->'reference_source', p_org_id);
      end if;
      if v_item_id is null and not (op ? 'id') then
        v_answer := custom.context_item_write(null, v_type_id, jsonb_strip_nulls(jsonb_build_object(
          'key', op->>'key',
          'display_name', coalesce(op->>'display_name', op->>'key'),
          'description', coalesce(op->>'description', ''),
          'category', op->>'category',
          'tags', coalesce(op->'tags', '[]'::jsonb),
          'value_type', coalesce(op->>'value_type', 'string'),
          'fetch_hint', coalesce(op->>'fetch_hint', 'on_demand'),
          'sensitivity', coalesce(op->>'sensitivity', 'internal'),
          'slug', coalesce(op->>'slug', op->>'key'),
          'sort_order', coalesce((op->>'sort_order')::smallint, 0),
          'allowed_reference_types', case when op ? 'allowed_reference_types' then op->'allowed_reference_types' end,
          'max_items', coalesce((op->>'max_items')::integer, 1),
          'allowed_scope_type_ids', case when op ? 'allowed_scope_type_ids' then op->'allowed_scope_type_ids' end,
          'reference_source', op->'reference_source')));
        v_item_id := (v_answer -> 'row' ->> 'id')::uuid;
        if op ? 'custom_component' and v_item_id is not null then
          perform custom.context_item_write(v_item_id, v_type_id,
            jsonb_build_object('custom_component', op->'custom_component'));
        end if;
      elsif v_item_id is not null then
        foreach k in array array['display_name', 'description', 'value_type', 'fetch_hint', 'sensitivity'] loop
          if op->>k is not null then v_spec := v_spec || jsonb_build_object(k, op->>k); end if;
        end loop;
        if op ? 'category' then v_spec := v_spec || jsonb_build_object('category', op->'category'); end if;
        if op->>'sort_order' is not null then
          v_spec := v_spec || jsonb_build_object('sort_order', (op->>'sort_order')::smallint);
        end if;
        if op->>'max_items' is not null then
          v_spec := v_spec || jsonb_build_object('max_items', (op->>'max_items')::integer);
        end if;
        foreach k in array array['allowed_reference_types', 'allowed_scope_type_ids', 'reference_source', 'custom_component'] loop
          if op ? k then v_spec := v_spec || jsonb_build_object(k, op->k); end if;
        end loop;
        if v_spec <> '{}'::jsonb then
          perform custom.context_item_write(v_item_id, v_type_id, v_spec);
        end if;
      end if;
      select to_jsonb(ci) into v_row from context.context_items ci where id = v_item_id;
      v_id := v_item_id;

    elsif kind = 'archive_context_item' then
      select ci.id into v_id
      from context.context_items ci
      join context.scope_types st on st.id = ci.scope_type_id
      where st.organization_id = p_org_id and ci.deleted_at is null
        and (ci.id::text = op->>'id' or (st.slug = op->>'scope_type_key' and ci.key = op->>'key'));
      if v_id is not null then
        perform custom.context_item_archive(v_id);
      end if;
      v_row := jsonb_build_object('id', v_id, 'archived', true);

    elsif kind = 'upsert_scope' then
      v_type_id := public._scope_system_resolve_type_id(p_org_id, op, 'scope');
      v_parent_id := null;
      if op ? 'parent_key' then
        select id into v_parent_id from context.scopes
        where organization_id = p_org_id and deleted_at is null and slug = op->>'parent_key';
      end if;
      if op ? 'id' then
        select s.id into v_scope_id from context.scopes s
         where s.id = (op->>'id')::uuid and s.organization_id = p_org_id;
      else
        select id into v_scope_id from context.scopes
        where organization_id = p_org_id and scope_type_id = v_type_id
          and deleted_at is null and slug = op->>'key';
      end if;
      if v_scope_id is null and not (op ? 'id') then
        v_answer := custom.context_scope_write(p_org_id, null, v_type_id, jsonb_strip_nulls(jsonb_build_object(
          'name', op->>'name',
          'parent_scope_id', v_parent_id,
          'description', coalesce(op->>'description', ''),
          'settings', coalesce(op->'settings', '{}'::jsonb),
          'slug', op->>'key',
          'sort_order', coalesce((op->>'sort_order')::smallint, 0))));
        v_scope_id := (v_answer -> 'row' ->> 'id')::uuid;
      elsif v_scope_id is not null then
        if op->>'name' is not null then v_spec := v_spec || jsonb_build_object('name', op->>'name'); end if;
        if op->>'description' is not null then v_spec := v_spec || jsonb_build_object('description', op->>'description'); end if;
        if op ? 'settings' then v_spec := v_spec || jsonb_build_object('settings', op->'settings'); end if;
        if op->>'sort_order' is not null then
          v_spec := v_spec || jsonb_build_object('sort_order', (op->>'sort_order')::smallint);
        end if;
        if op ? 'parent_key' then v_spec := v_spec || jsonb_build_object('parent_scope_id', v_parent_id); end if;
        perform custom.context_scope_write(p_org_id, v_scope_id, v_type_id, v_spec);
      end if;
      select to_jsonb(s) into v_row from context.scopes s where id = v_scope_id;
      v_id := v_scope_id;

    elsif kind = 'archive_scope' then
      select id into v_id from context.scopes
      where organization_id = p_org_id and deleted_at is null
        and (id::text = op->>'id' or slug = op->>'key');
      if v_id is not null then
        perform custom.context_scope_archive(v_id);
      end if;
      v_row := jsonb_build_object('id', v_id, 'archived', true);

    elsif kind = 'set_value' then
      select s.id, s.scope_type_id into v_scope_id, v_type_id
      from context.scopes s
      where s.organization_id = p_org_id and s.deleted_at is null
        and (s.id::text = op->>'scope_id' or s.slug = op->>'scope_key');
      select ci.id, ci.value_type::text into v_item_id, v_value_type
      from context.context_items ci
      where ci.scope_type_id = v_type_id and ci.is_active and ci.deleted_at is null
        and (ci.id::text = op->>'context_item_id' or ci.key = op->>'item_key');
      if v_scope_id is null or v_item_id is null then
        raise exception 'scope or context item not found for value operation' using errcode = '22023';
      end if;
      v_value := op->'value';
      v_answer := custom.context_value_write(jsonb_strip_nulls(jsonb_build_object(
        'context_item_id', v_item_id,
        'scope_id', v_scope_id,
        'value_text', case when v_value_type in ('string', 'email', 'url', 'phone', 'color', 'markdown', 'reference')
                           then v_value#>>'{}' end,
        'value_number', case when v_value_type in ('number', 'percent') then (v_value#>>'{}')::numeric end,
        'value_boolean', case when v_value_type = 'boolean' then (v_value#>>'{}')::boolean end,
        'value_json', case when v_value_type in ('object', 'array', 'currency') then v_value end,
        'value_date', case when v_value_type = 'date' then (v_value#>>'{}')::date end,
        'value_timestamp', case when v_value_type = 'datetime' then (v_value#>>'{}')::timestamptz end,
        'value_time', case when v_value_type = 'time' then (v_value#>>'{}')::time end,
        'value_document_url', case when v_value_type = 'document' then v_value#>>'{}' end,
        'change_summary', coalesce(op->>'change_summary', 'Updated by scope_system tool'),
        'source_type', 'ai_generated')));
      if coalesce((v_answer ->> 'ok')::boolean, false) is not true then
        raise exception '%', coalesce(v_answer #>> '{error,message}', 'the value could not be written')
          using errcode = case v_answer #>> '{error,code}'
                            when 'forbidden' then '42501' when 'unauthorized' then '42501'
                            when 'invalid_argument' then '22023' when 'not_found' then '22023'
                            else 'P0001' end;
      end if;
      select to_jsonb(x) into v_row from context.context_item_values x where x.id = (v_answer #>> '{data,id}')::uuid;
      v_id := v_row->>'id';

    elsif kind = 'upsert_table_template' then
      if op ? 'id' then
        v_template_id := (op->>'id')::uuid;
      else
        select id into v_template_id from workbench.udt_dataset_templates
        where organization_id = p_org_id and is_active and lower(name) = lower(op->>'name');
      end if;
      if v_template_id is null then
        insert into workbench.udt_dataset_templates (
          organization_id, name, description, created_by, updated_by
        ) values (
          p_org_id, op->>'name', coalesce(op->>'description', ''), (select auth.uid()), (select auth.uid())
        ) returning id into v_template_id;
        insert into workbench.udt_dataset_template_fields (
          template_id, field_name, display_name, data_type, field_order,
          is_required, default_value, validation_rules
        )
        select
          v_template_id, f->>'field_name', coalesce(f->>'display_name', f->>'field_name'),
          coalesce(f->>'data_type', 'string')::public.field_data_type,
          coalesce((f->>'field_order')::integer, ord::integer - 1),
          coalesce((f->>'is_required')::boolean, false),
          f->'default_value', f->'validation_rules'
        from jsonb_array_elements(coalesce(op->'fields', '[]'::jsonb)) with ordinality as x(f, ord);
      else
        update workbench.udt_dataset_templates set
          name = coalesce(op->>'name', name),
          description = coalesce(op->>'description', description),
          updated_by = (select auth.uid()),
          updated_at = now()
        where id = v_template_id and organization_id = p_org_id;
      end if;
      select to_jsonb(t) into v_row from workbench.udt_dataset_templates t where id = v_template_id;
      v_id := v_template_id;

    elsif kind = 'archive_table_template' then
      select id into v_id from workbench.udt_dataset_templates
      where organization_id = p_org_id and is_active
        and (id::text = op->>'id' or lower(name) = lower(op->>'name'));
      update workbench.udt_dataset_templates
        set is_active = false, updated_by = (select auth.uid()), updated_at = now()
      where id = v_id;
      v_row := jsonb_build_object('id', v_id, 'archived', true);

    else
      raise exception 'unknown scope-system operation %', kind using errcode = '22023';
    end if;

    if v_id is null then
      perform platform.refuse_not_found(format('operation %s did not match or create a record', kind));
    end if;
    v_results := v_results || jsonb_build_array(
      jsonb_build_object('op', kind, 'id', v_id, 'record', v_row)
    );
  end loop;

  return jsonb_build_object(
    'organization_id', p_org_id,
    'applied', jsonb_array_length(v_results),
    'results', v_results
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public._scope_system_resolve_type_id(p_org_id uuid, p_op jsonb, p_kind text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_ref text;
  v_type_id uuid;
  v_other_org uuid;
begin
  v_ref := nullif(coalesce(
    p_op->>'scope_type_id',
    p_op->>'scope_type',
    p_op->>'scope_type_key'
  ), '');
  if v_ref is null then
    raise exception 'scope type not found for % % — pass scope_type_id or scope_type_key',
      p_kind, p_op using errcode = '22023';
  end if;

  select id into v_type_id
  from context.scope_types
  where organization_id = p_org_id
    and deleted_at is null
    and (id::text = v_ref or slug = v_ref);

  if v_type_id is not null then
    return v_type_id;
  end if;

  select organization_id into v_other_org
  from context.scope_types
  where deleted_at is null
    and id::text = v_ref
  limit 1;

  if v_other_org is not null then
    raise exception
      'scope type % belongs to organization %, but apply targeted organization % — pass organization_id=% (or ensure AppContext carries the conversation org)',
      v_ref, v_other_org, p_org_id, v_other_org
      using errcode = '22023';
  end if;

  raise exception 'scope type not found for % %', p_kind, p_op using errcode = '22023';
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_entity_scopes(p_entity_type text, p_entity_id uuid, p_scope_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_uid uuid := auth.uid(); v_scope record; v_count int; v_result jsonb; v_edge record;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'set_entity_scopes: not authenticated' USING ERRCODE = '42501';
    END IF;

    -- 0749 (A16/A17): the ENTITY being tagged is a caller-supplied id and was
    -- never checked. Tagging someone's row changes what that row is filed
    -- under, so it takes `editor`. One message: a foreign id and an invented id
    -- are refused identically, and it names only the TYPE.
    IF p_entity_id IS NULL
       OR coalesce(iam.has_access_for(v_uid, p_entity_type, p_entity_id, 'editor'::public.permission_level), false) IS NOT true THEN
        RAISE EXCEPTION 'set_entity_scopes: no editor access to the % you are tagging', p_entity_type
            USING ERRCODE = '42501';
    END IF;

    IF EXISTS (
        SELECT 1 FROM context.scopes s
        WHERE s.id = ANY(p_scope_ids)
          AND NOT EXISTS (SELECT 1 FROM iam.organization_member om
                          WHERE om.organization_id = s.organization_id AND om.user_id = v_uid)
    ) THEN
        RAISE EXCEPTION 'set_entity_scopes: scope outside your organizations' USING ERRCODE = '42501';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM platform.associations_live a
        JOIN context.scopes s ON s.id = a.target_id
        WHERE a.target_type='scope' AND a.source_type = p_entity_type AND a.source_id = p_entity_id
          AND NOT EXISTS (SELECT 1 FROM iam.organization_member om
                          WHERE om.organization_id = s.organization_id AND om.user_id = v_uid)
    ) THEN
        RAISE EXCEPTION 'set_entity_scopes: entity is tagged with scopes outside your organizations' USING ERRCODE = '42501';
    END IF;

    FOR v_scope IN
        SELECT s.id, s.scope_type_id, st.max_assignments_per_entity, st.label_singular
        FROM context.scopes s JOIN context.scope_types st ON s.scope_type_id = st.id
        WHERE s.id = ANY(p_scope_ids)
    LOOP
        IF v_scope.max_assignments_per_entity IS NOT NULL THEN
            SELECT count(*) INTO v_count
            FROM unnest(p_scope_ids) sid JOIN context.scopes s ON s.id = sid
            WHERE s.scope_type_id = v_scope.scope_type_id;
            IF v_count > v_scope.max_assignments_per_entity THEN
                RAISE EXCEPTION 'Type "%" allows max % assignment(s) per entity, but % were provided',
                    v_scope.label_singular, v_scope.max_assignments_per_entity, v_count;
            END IF;
        END IF;
    END LOOP;

    -- TAILS-5: ARCHIVED, NOT DESTROYED — one edge per scope, kept across every re-tagging.
    -- The set is re-stated exactly as before: every scope edge is withdrawn and the ones in the
    -- new set are written back. The difference is that writing one back REVIVES the row it
    -- always was (platform.revive_tombstoned_association), so a scope that keeps coming back
    -- keeps one identity and one history instead of a new row each time.
    FOR v_edge IN
        SELECT a.target_id
        FROM platform.associations_live a
        WHERE a.source_type = p_entity_type AND a.source_id = p_entity_id AND a.target_type = 'scope'
    LOOP
        PERFORM platform.assoc_unset(p_entity_type, p_entity_id, 'scope', v_edge.target_id, null,
                                     p_entity_type, p_entity_id);
    END LOOP;

    -- ON CONFLICT must name the FULL unique index (associations_unique is
    -- (source_type, source_id, target_type, target_id, role) NULLS NOT DISTINCT).
    -- Omitting `role` made every call fail with 42P10 before it could write.
    INSERT INTO platform.associations (source_type, source_id, target_type, target_id, organization_id, created_by)
    SELECT p_entity_type, p_entity_id, 'scope', sc.id, sc.organization_id, v_uid
    FROM unnest(p_scope_ids) AS sid JOIN context.scopes sc ON sc.id = sid
    ON CONFLICT (source_type, source_id, target_type, target_id, role) DO NOTHING;

    SELECT jsonb_agg(jsonb_build_object(
        'scope_id', a.target_id, 'scope_name', s.name,
        'type_label', st.label_singular, 'type_icon', st.icon, 'type_color', st.color))
    INTO v_result
    FROM platform.associations_live a
    JOIN context.scopes s ON a.target_id = s.id
    JOIN context.scope_types st ON s.scope_type_id = st.id
    WHERE a.target_type='scope' AND a.source_type = p_entity_type AND a.source_id = p_entity_id;

    RETURN COALESCE(v_result, '[]'::jsonb);
END;
$function$
;

CREATE OR REPLACE FUNCTION custom.context_compare_facts(p_user_id uuid, p_record_ids uuid[], p_item_ids uuid[] DEFAULT NULL::uuid[], p_cells jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_records jsonb;
  v_items   jsonb;
  v_cells   jsonb;
  v_follow  jsonb;
begin
  select coalesce(jsonb_object_agg(x.id::text, jsonb_build_object(
           'in_store', exists (select 1 from custom.record r where r.id = x.id and r.deleted_at is null),
           'in_store_trash', exists (select 1 from custom.record r where r.id = x.id and r.deleted_at is not null),
           'old_readable', coalesce(context._scope_readable_for(p_user_id, x.id, 'viewer'), false))), '{}'::jsonb)
    into v_records
    from (select distinct unnest(coalesce(p_record_ids, '{}'::uuid[])) as id) x
   where x.id is not null;

  select coalesce(jsonb_object_agg(ci.id::text, jsonb_build_object(
           'old_active', ci.is_active and ci.deleted_at is null,
           'old_fetch_hint', ci.fetch_hint::text)), '{}'::jsonb)
    into v_items
    from context.context_items ci
   where ci.id = any (coalesce(p_item_ids, '{}'::uuid[]));

  -- THE CURRENT SYSTEM'S VERSION OF EACH CELL BOTH SIDES DELIVER, so a changed value can be
  -- classed as the copy catching up (old written later) or not.
  select coalesce(jsonb_object_agg((c ->> 'item_id') || ':' || (c ->> 'scope_id'), jsonb_build_object(
           'old_version', v.version, 'old_written_at', v.created_at)), '{}'::jsonb)
    into v_cells
    from jsonb_array_elements(coalesce(p_cells, '[]'::jsonb)) c
    join context.context_item_values v
      on v.context_item_id = (c ->> 'item_id')::uuid
     and v.scope_id = (c ->> 'scope_id')::uuid
     and v.is_current;

  -- THE FOLLOW'S LAG (P8, lane SC-2'): what the old-wins follow has not applied yet. Until
  -- SC-2' lands the follow there is no `context.follow` row at all, and the page says so.
  select jsonb_build_object(
           'running', exists (select 1 from custom.io_outbox o where o.event_key = 'context.follow'),
           'pending', count(*) filter (where not custom.io_outbox_consumed_by(o.id, 'context-follow', o.consumed_at)),
           'oldest_pending_at', min(o.created_at) filter (where not custom.io_outbox_consumed_by(o.id, 'context-follow', o.consumed_at)),
           'last_applied_at', custom.io_outbox_last_consumed('context-follow', 'context.follow', null))
    into v_follow
    from custom.io_outbox o
   where o.event_key = 'context.follow';

  return jsonb_build_object('records', v_records, 'items', v_items, 'cells', v_cells, 'follow', v_follow);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.__scope_access_membrane_conformance()
 RETURNS TABLE(check_key text, ok boolean, severity text, detail jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  c_refs constant text := 'context\.(scopes|context_items|context_item_values)';
  c_values constant text := 'context\.context_item_values';
  c_call constant text := '(context\._(assert_scope_readable|scope_readable|scope_readable_for|readable_scope_ids)|custom\.levels_of|custom\.seen_among|custom\.resolve_context)\s*\(';
  -- STORE-READ-PERF-5: custom.seen_among is custom.levels_of's "s" (the one ladder's viewer answer),
  -- asked once per class of look-alike records and through levels_of itself for every other id.
  v_unregistered text[];
  v_stale text[];
  v_lost text[];
  v_wrongclass text[];
  v_listdoors text[];
  v_pols jsonb;
  v_sel text;
begin
  check_key := 'membrane_helpers_installed';
  detail := (select jsonb_object_agg(p.proname, jsonb_build_object('definer', p.prosecdef))
               from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'context'
                and p.proname in ('_scope_readable','_scope_readable_for','_assert_scope_readable',
                                  '_scope_denial_message','_readable_scope_ids'));
  ok := (select count(*) = 5 and bool_and(p.prosecdef)
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'context'
            and p.proname in ('_scope_readable','_scope_readable_for','_assert_scope_readable',
                              '_scope_denial_message','_readable_scope_ids'));
  severity := 'error';
  if not ok then detail := coalesce(detail,'{}'::jsonb) || jsonb_build_object(
    'why','All five membrane helpers must exist and be SECURITY DEFINER. As INVOKER they would ask the question through the caller''s own RLS and answer "no" to everybody.'); end if;
  return next;

  select array_agg(n.nspname || '.' || p.proname order by n.nspname, p.proname)
    into v_unregistered
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public','context') and p.prosecdef
    and p.prosrc ~ c_refs
    and n.nspname || '.' || p.proname <> 'public.__scope_access_membrane_conformance'
    and not exists (select 1 from context.scope_door_registry r
                     where r.function_name = n.nspname || '.' || p.proname);
  check_key := 'all_scope_doors_registered';
  ok := v_unregistered is null;
  severity := 'error';
  detail := jsonb_build_object(
    'why','A new SECURITY DEFINER function reads the scopes tables and nobody has decided what it is. Either make it call context._assert_scope_readable and register it as `membraned`, or register it with the class and the reason it does not need one: insert into context.scope_door_registry.',
    'unregistered', coalesce(to_jsonb(v_unregistered),'[]'::jsonb));
  return next;

  select array_agg(r.function_name order by r.function_name)
    into v_stale
  from context.scope_door_registry r
  where not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                     where n.nspname || '.' || p.proname = r.function_name and p.prosecdef);
  check_key := 'registry_has_no_stale_rows';
  ok := v_stale is null;
  severity := 'error';
  detail := jsonb_build_object(
    'why','These registry rows name a SECURITY DEFINER function that does not exist. Delete the row, or restore the function.',
    'stale', coalesce(to_jsonb(v_stale),'[]'::jsonb));
  return next;

  select array_agg(r.function_name order by r.function_name)
    into v_lost
  from context.scope_door_registry r
  join pg_proc p on true
  join pg_namespace n on n.oid = p.pronamespace and n.nspname || '.' || p.proname = r.function_name
  where r.door_class = 'membraned'
    and p.prosecdef
    and context._strip_sql_noise(p.prosrc) !~ c_call;
  check_key := 'membraned_doors_carry_a_real_call';
  ok := v_lost is null;
  severity := 'error';
  detail := jsonb_build_object(
    'why','These doors are registered as `membraned` and their live body contains no CALL to the membrane once comments, string literals and dollar-quoted blocks are removed. A comment is not a gate (V-7 B-F2). Re-apply migrations/ctx_scope_access_membrane_b7.sql, or change the row''s class with a reason.',
    'lost', coalesce(to_jsonb(v_lost),'[]'::jsonb));
  return next;

  select array_agg(n.nspname || '.' || p.proname || ' (' || coalesce(r.door_class,'UNREGISTERED') || ')'
                   order by p.proname)
    into v_wrongclass
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  left join context.scope_door_registry r on r.function_name = n.nspname || '.' || p.proname
  where n.nspname in ('public','context') and p.prosecdef
    and p.prosrc ~ c_values
    and n.nspname || '.' || p.proname <> 'public.__scope_access_membrane_conformance'
    and coalesce(r.door_class,'') not in ('membraned','unreachable');
  check_key := 'value_doors_are_membraned';
  ok := v_wrongclass is null;
  severity := 'error';
  detail := jsonb_build_object(
    'why','RLS does not run inside a SECURITY DEFINER function. A door that serves a scope''s cell values must be class `membraned` (or provably `unreachable`) — organization membership is not the question. This is the 2026-09-11 finding on get_scope_context.',
    'offenders', coalesce(to_jsonb(v_wrongclass),'[]'::jsonb));
  return next;

  select array_agg(x.fn order by x.fn) into v_listdoors
  from (select unnest(array['public.list_scopes','public.get_scope_tree','public.search_scopes']) as fn) x
  where not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname || '.' || p.proname = x.fn
       and context._strip_sql_noise(p.prosrc) ~ '(context\._readable_scope_ids|custom\.levels_of|custom\.seen_among)\s*\(');
  check_key := 'list_doors_filter_the_readable_set';
  ok := v_listdoors is null;
  severity := 'error';
  detail := jsonb_build_object(
    'why','These doors list scopes without filtering on context._readable_scope_ids(), so they can name a `personal` record — its name, slug, creator and visibility — to somebody the record itself refuses. On a personal legal matter the case NAME is the most sensitive field there is.',
    'unfiltered', coalesce(to_jsonb(v_listdoors),'[]'::jsonb));
  return next;

  check_key := 'values_registered_as_component_of_scope';
  detail := jsonb_build_object(
    'entity_type', (select to_jsonb(t) from (select rls_variant, is_component, is_active
                                               from platform.entity_types where token = 'context_item_value') t),
    'parents', coalesce((select jsonb_agg(jsonb_build_object('parent', er.parent_type, 'fk', er.fk_column))
                           from platform.entity_relationships er
                          where er.child_type = 'context_item_value' and er.kind = 'composition'), '[]'::jsonb),
    'why','A second composition parent (context_item) would OR an ORG-WIDE id set back into the read lane and undo the membrane. The parent is `scope`, and only `scope`.');
  ok := exists (select 1 from platform.entity_types
                 where token = 'context_item_value' and rls_variant = 'component' and is_component and is_active)
        and (select count(*) from platform.entity_relationships
              where child_type = 'context_item_value' and kind = 'composition') = 1
        and exists (select 1 from platform.entity_relationships
                     where child_type = 'context_item_value' and parent_type = 'scope' and fk_column = 'scope_id');
  severity := 'error';
  return next;

  select jsonb_object_agg(policyname, cmd), max(qual) filter (where cmd = 'SELECT')
    into v_pols, v_sel
  from pg_policies where schemaname = 'context' and tablename = 'context_item_values';
  check_key := 'values_policies_are_generated_component_lane';
  ok := coalesce(v_sel,'') like '%accessible_entity_ids(''scope''::text%'
        and coalesce(v_sel,'') not like '%context.scopes%'
        and v_pols ? 'std_select' and v_pols ? 'std_insert' and v_pols ? 'std_update'
        and v_pols ? 'std_delete' and v_pols ? 'svc_all';
  severity := 'error';
  detail := jsonb_build_object(
    'policies', coalesce(v_pols,'{}'::jsonb),
    'why','The read lane must resolve the PARENT id set once per query (THE COMPONENT-ACCESS PRECEDENT, 2026-08-08) and must not fall back to organization membership. Re-apply with select iam.apply_rls(''context'',''context_item_values'',''context_item_value'',''component'').');
  return next;

  check_key := 'no_anon_grants_on_values';
  detail := jsonb_build_object(
    'grants', coalesce((select jsonb_agg(privilege_type order by privilege_type)
                          from information_schema.role_table_grants
                         where table_schema = 'context' and table_name = 'context_item_values'
                           and grantee = 'anon'), '[]'::jsonb),
    'why','A table grant that only a policy stands behind is one apply_rls away from being a hole.');
  ok := not exists (select 1 from information_schema.role_table_grants
                     where table_schema = 'context' and table_name = 'context_item_values' and grantee = 'anon');
  severity := 'error';
  return next;
end;
$function$
;

