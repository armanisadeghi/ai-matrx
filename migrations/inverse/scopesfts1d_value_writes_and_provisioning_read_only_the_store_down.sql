-- chair-step: INVERSE of migrations/campaign/scopesfts1d_value_writes_and_provisioning_read_only_the_store.sql (lane FINISH-THE-SWITCH, FTS-1d): restores the three bodies as production held them on 2026-10-05 and drops custom._ctx_reference_value_holds. The scope_binding written on one pre-move dataset Table stays (the old door wrote the same on its first call).
-- lane: FINISH-THE-SWITCH (FTS-1d)
-- lock: custom

CREATE OR REPLACE FUNCTION custom._ctx_store_value(p_org uuid, p_row jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_field  custom.record;
  v_rec    custom.record;
  v_value  jsonb;
  v_src    jsonb;
  v_env    jsonb;
  v_actor  text := custom._ctx_word('actor', p_row ->> 'source_type');
begin
  if not coalesce((p_row ->> 'is_current')::boolean, true) then
    return jsonb_build_object('did', 'not_current');
  end if;
  select * into v_field from custom.record f
   where f.organization_id = p_org and f.id = (p_row ->> 'context_item_id')::uuid and f.data_class = 'field';
  select * into v_rec from custom.record r
   where r.organization_id = p_org and r.id = (p_row ->> 'scope_id')::uuid and r.data_class = 'record';
  -- A VALUE BRINGS ITS FIELD AND ITS SCOPE (SC-2', "a declared Field is added first, never a
  -- refusal"): a value written for an item or a scope the store has not been handed yet (an old
  -- writer that inserted the three rows in one statement batch, a row written before the switch)
  -- lands them from the image first.
  if v_field.id is null then
    perform custom._ctx_store_item(p_org, i.scope_type_id, i.id, to_jsonb(i))
       from context.context_items i where i.id = (p_row ->> 'context_item_id')::uuid;
    select * into v_field from custom.record f
     where f.organization_id = p_org and f.id = (p_row ->> 'context_item_id')::uuid and f.data_class = 'field';
  end if;
  if v_rec.id is null then
    perform custom._ctx_store_scope(p_org, s.scope_type_id, s.id, to_jsonb(s))
       from context.scopes s where s.id = (p_row ->> 'scope_id')::uuid;
    select * into v_rec from custom.record r
     where r.organization_id = p_org and r.id = (p_row ->> 'scope_id')::uuid and r.data_class = 'record';
  end if;
  if v_field.id is null or v_rec.id is null then
    raise exception 'The record store has no % for this value yet, so it cannot hold it.',
                    case when v_field.id is null then 'field' else 'record' end
      using errcode = '23503',
            hint = 'SCOPES-WRITE-THROUGH: a value is written after its scope and its context field. Nothing was written.';
  end if;
  -- THE OLD TYPE RULE (public.ctx_validate_value_scope_type), read from the store (lane SCOPES-SIDE-EFFECTS):
  -- a value belongs to a field of its own scope's type.
  perform custom._ctx_value_fits_its_scope(v_field, v_rec);
  if v_field.deleted_at is not null or v_rec.deleted_at is not null then
    -- An archived field or scope keeps its values as they were archived (the copy never writes them).
    return jsonb_build_object('did', 'archived');
  end if;

  v_value := custom._ctx_value_of(p_row, v_field.data);
  v_src := jsonb_build_object('kind', 'move', 'store', 'context.context_item_values',
                              'source_type', coalesce(p_row ->> 'source_type', 'manual'),
                              'feed', custom._ctx_word('source', p_row ->> 'source_type'),
                              'old_value_id', p_row ->> 'id',
                              'old_version', coalesce((p_row ->> 'version')::int, 1));
  if p_row ->> 'authored_by' is not null then
    v_src := v_src || jsonb_build_object('authored_by', p_row ->> 'authored_by');
  end if;
  if nullif(p_row ->> 'change_summary', '') is not null then
    v_src := v_src || jsonb_build_object('change_summary', p_row ->> 'change_summary');
  end if;
  v_env := jsonb_build_object('src', v_src, 'actor', v_actor,
                              'at', custom._ctx_iso(coalesce(nullif(p_row ->> 'created_at', '')::timestamptz, now())));
  if v_actor = 'agent' and p_row ->> 'authored_by' is not null then
    v_env := v_env || jsonb_build_object('on_behalf_of', p_row ->> 'authored_by');
  end if;
  if v_value is null then
    v_env := v_env || '{"absent": "none"}'::jsonb;
  end if;

  update custom.record r
     set data = (coalesce(r.data, '{}'::jsonb) || jsonb_build_object(v_field.data ->> 'key', coalesce(v_value, 'null'::jsonb)))
                || jsonb_build_object('_values', coalesce(r.data -> '_values', '{}'::jsonb)
                                                 || jsonb_build_object(v_field.data ->> 'key', v_env))
   where r.organization_id = p_org and r.id = v_rec.id;
  return jsonb_build_object('did', 'written', 'key', v_field.data ->> 'key');
end;
$function$;

CREATE OR REPLACE FUNCTION custom._ctx_value_write_store(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_uid     uuid := auth.uid();
  v_item    uuid := (p_payload ->> 'context_item_id')::uuid;
  v_scope   uuid := (p_payload ->> 'scope_id')::uuid;
  v_source  text := coalesce(p_payload ->> 'source_type', 'ai_enriched');
  v_org     uuid;
  v_owner   uuid;
  v_id      uuid := gen_random_uuid();
  v_version int;
  v_image   jsonb;
  v_was     text;
  v_row     context.context_item_values;
  v_live    boolean;
  v_name    text;
begin
  -- LANE 9 W2-W (SCOPES-ON-THE-STORE): WHO MAY WRITE THIS VALUE IS DECIDED ON THE STORE. The scope's organization,
  -- its maker, whether it is live and its name come from its Record; the rule is the old one (the maker, or editor
  -- access through iam), and the refusal says it in the old sentences.
  if v_uid is null and nullif(current_setting('request.jwt.claims', true), '') is null then
    v_uid := (p_payload ->> 'acting_user_id')::uuid;       -- the server's own trusted path, as set_context_value
  end if;
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'unauthorized', 'message', 'no acting user'));
  end if;
  if v_item is null or v_scope is null then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'invalid_argument', 'message', 'context_item_id and scope_id are required'));
  end if;
  select r.organization_id, r.created_by, r.deleted_at is null, r.data ->> 'name'
    into v_org, v_owner, v_live, v_name
    from custom.record r
    join custom.record t on t.organization_id = r.organization_id and t.id = r.table_id
                        and t.table_id = custom.table_kernel_id() and t.data ->> 'kept_for' = 'context'
   where r.id = v_scope and r.data_class = 'record';
  if not found then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'not_found', 'message', 'scope not found'));
  end if;
  if not (v_owner = v_uid or context._scope_readable_for(v_uid, v_scope, 'editor')) then
    -- context._scope_denial_message's own sentences, its scope read from the store.
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'forbidden',
      'message', case
        when not v_live or v_name is null then 'That record no longer exists, or it was deleted.'
        when context._scope_readable(v_scope, 'viewer')
          then format('You can view "%s" but you cannot change it. Ask for edit access on that record.', v_name)
        else format('You do not have access to "%s". Ask someone who can already open it to share it with you.', v_name) end));
  end if;
  -- Every organization's scopes are written in the store (custom.context_writer); one that is not refuses in
  -- its own words instead of reaching for the old value function.
  if custom.context_writer(v_org) <> 'store' then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'unavailable',
      'message', 'This organization''s scopes are not written in the record store yet, so this value was not saved.'));
  end if;

  begin
    perform context.validate_reference_value(v_item, p_payload ->> 'value_text');
    perform pg_advisory_xact_lock(hashtext('civ:' || v_item::text || ':' || v_scope::text));
    select coalesce(max(v.version), 0) + 1 into v_version
      from context.context_item_values v where v.context_item_id = v_item and v.scope_id = v_scope;
    v_image := jsonb_build_object(
      'id', v_id, 'context_item_id', v_item, 'scope_id', v_scope, 'version', v_version, 'is_current', true,
      'value_text', p_payload -> 'value_text', 'value_number', p_payload -> 'value_number',
      'value_boolean', p_payload -> 'value_boolean', 'value_json', p_payload -> 'value_json',
      'value_date', p_payload -> 'value_date', 'value_document_url', p_payload -> 'value_document_url',
      'value_timestamp', p_payload -> 'value_timestamp', 'value_time', p_payload -> 'value_time',
      'source_type', v_source, 'authored_by', v_uid, 'change_summary', p_payload -> 'change_summary',
      'created_at', now());

    -- THE STORE FIRST: its rules decide.
    v_was := custom._ctx_mark('door');
    perform custom._ctx_store_value(v_org, v_image);

    -- THE IMAGE: the old row, under the id the Record's source names.
    insert into context.context_item_values (
      id, context_item_id, scope_id,
      value_text, value_number, value_boolean, value_json, value_date, value_document_url,
      value_timestamp, value_time, source_type, authored_by, change_summary)
    values (
      v_id, v_item, v_scope,
      p_payload ->> 'value_text',
      case when p_payload ? 'value_number' then (p_payload ->> 'value_number')::numeric end,
      case when p_payload ? 'value_boolean' then (p_payload ->> 'value_boolean')::boolean end,
      case when p_payload ? 'value_json' then p_payload -> 'value_json' end,
      case when p_payload ? 'value_date' then (p_payload ->> 'value_date')::date end,
      p_payload ->> 'value_document_url',
      case when p_payload ? 'value_timestamp' then (p_payload ->> 'value_timestamp')::timestamptz end,
      case when p_payload ? 'value_time' then (p_payload ->> 'value_time')::time end,
      v_source::public.context_source_type, v_uid, p_payload ->> 'change_summary')
    returning * into v_row;
    perform context.index_reference_value(v_row.id, v_item, v_scope, p_payload ->> 'value_text');
    perform custom._ctx_mark(v_was);
  exception
    when unique_violation then
      return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'conflict', 'message', 'concurrent write on this cell — retry'));
    when sqlstate '22023' then
      return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'invalid_argument', 'message', sqlerrm));
  end;
  return jsonb_build_object('ok', true, 'writer', 'store', 'data', jsonb_build_object(
    'id', v_row.id, 'context_item_id', v_row.context_item_id, 'scope_id', v_row.scope_id,
    'version', v_row.version, 'is_current', v_row.is_current,
    'value_text', v_row.value_text, 'value_date', v_row.value_date,
    'value_timestamp', v_row.value_timestamp, 'value_time', v_row.value_time,
    'source_type', v_row.source_type),
    'store', (select jsonb_build_object('id', r.id, 'table_id', r.table_id, 'version', r.version)
                from custom.record r where r.organization_id = v_org and r.id = v_scope));
end;
$function$;

CREATE OR REPLACE FUNCTION custom.scope_table_provision(p_organization_id uuid, p_item_id uuid, p_scope_id uuid, p_home_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_item     record;
  v_scope    record;
  v_tpl      record;
  v_f        record;
  v_table    uuid;
  v_label    text;
  v_fence    text;
  v_title    text;
  v_n        integer := 0;
  v_home     uuid;
  v_prior    uuid;
  v_store    boolean := false;
  v_was      text;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.scope_table_provision');
  -- The service-role key is refused here ON PURPOSE: the server writes as the store owner or as the person (ruled 2026-09-24).
  perform custom.assert_client_may_reach(p_organization_id, 'custom.scope_table_provision');

  select s.id, s.organization_id, s.scope_type_id, s.name into v_scope
    from context.scopes s where s.id = p_scope_id and s.deleted_at is null;
  if v_scope.id is null then
    -- THE IMAGE IS OFF FOR THIS SCOPE (lane SCOPES-SIDE-EFFECTS): the store holds it, as a Record of a
    -- Table kept for context.
    select r.id, r.organization_id, r.table_id as scope_type_id, r.data ->> 'name' as name into v_scope
      from custom.record r
     where r.organization_id = p_organization_id and r.id = p_scope_id and r.data_class = 'record' and r.deleted_at is null
       and exists (select 1 from custom.record t where t.organization_id = r.organization_id and t.id = r.table_id
                     and t.table_id = custom.table_kernel_id() and t.data ->> 'kept_for' = 'context');
    v_store := v_scope.id is not null;
  end if;
  if v_scope.id is null or v_scope.organization_id is distinct from p_organization_id then
    raise exception 'That scope is not in this organization, so nothing was provisioned.'
      using errcode = '42501', hint = 'A context scope belongs to one organization. Open the organization it lives in.';
  end if;
  select i.id, i.scope_type_id, i.reference_source, i.display_name into v_item
    from context.context_items i where i.id = p_item_id and i.is_active and i.deleted_at is null;
  if v_item.id is null then
    -- THE IMAGE IS OFF FOR THIS FIELD: its Field says where it is bound (its own document, or what
    -- the copy carried).
    select f.id, (f.data ->> 'entity_definition_id')::uuid as scope_type_id,
           coalesce(f.data -> 'reference_source', f.metadata #> '{moved_from,carried,reference_source}') as reference_source,
           f.data ->> 'label' as display_name into v_item
      from custom.record f
     where f.organization_id = p_organization_id and f.id = p_item_id and f.table_id = custom.field_kernel_id()
       and f.deleted_at is null and coalesce((f.metadata #>> '{moved_from,carried,is_active}')::boolean, true);
    v_store := v_store or v_item.id is not null;
  end if;
  if v_item.id is null or v_item.scope_type_id is distinct from v_scope.scope_type_id
     or v_item.reference_source ->> 'container_type' is distinct from 'dataset_template' then
    raise exception 'That context item is not a table this kind of scope provisions from a template.'
      using errcode = '22023', hint = 'The item must be active, of the scope''s own type, and bound to a dataset template. Nothing was provisioned.';
  end if;
  select * into v_tpl from workbench.udt_dataset_templates
   where id = (v_item.reference_source ->> 'template_id')::uuid and is_active;
  if v_tpl.id is null or v_tpl.organization_id not in (p_organization_id, '39c38960-d30c-4840-b0c1-c9960de95582'::uuid) then
    raise exception 'The template this item is bound to is not this organization''s or the platform''s.'
      using errcode = '22023', hint = 'Nothing was provisioned.';
  end if;

  -- A PRE-MOVE INSTANCE ANSWERS FIRST: the moved Table carries the older dataset's own id.
  select i.dataset_id into v_prior from context.scope_dataset_instances i
   where i.context_item_id = p_item_id and i.scope_id = p_scope_id
   limit 1;
  if v_prior is not null and exists (
       select 1 from custom.record t
        where t.organization_id = p_organization_id and t.id = v_prior
          and t.table_id = custom.table_kernel_id() and t.data_class = 'table' and t.deleted_at is null) then
    update custom.record
       set data = jsonb_set(data, '{scope_binding}', jsonb_build_object(
                    'context_item_id', p_item_id, 'scope_id', p_scope_id,
                    'template_id', v_tpl.id, 'template_version', v_tpl.version, 'carried_from', 'older'), true)
     where organization_id = p_organization_id and id = v_prior and table_id = custom.table_kernel_id()
       and data -> 'scope_binding' is null;
    return v_prior;
  end if;

  -- ONE Table per item and scope: the binding is on the Table itself.
  select t.id into v_table from custom.record t
   where t.organization_id = p_organization_id and t.table_id = custom.table_kernel_id()
     and t.data_class = 'table' and t.deleted_at is null
     and t.data -> 'scope_binding' ->> 'context_item_id' = p_item_id::text
     and t.data -> 'scope_binding' ->> 'scope_id' = p_scope_id::text
   limit 1;
  if v_table is not null then
    return v_table;
  end if;

  v_home := coalesce(p_home_id, custom.organization_home_id(p_organization_id));
  v_label := v_scope.name || ' — ' || v_item.display_name;
  if v_home is null then
    -- POST-MOVE-DOORS: after step two there are no older tables to keep. An organization with no Home yet (REC-1:
    -- a Table has to live somewhere) gets one for this Table, the way custom._options_table_for gives a choice list
    -- its own Home.
    insert into custom.record (organization_id, table_id, data)
    values (p_organization_id, custom.person_kernel_id(), jsonb_build_object('name', v_label || ' Home'))
    returning id into v_home;
  end if;

  select f.field_name into v_title from workbench.udt_dataset_template_fields f
   where f.template_id = v_tpl.id order by f.field_order limit 1;
  v_table := custom.table_declare(p_organization_id, jsonb_build_object(
    'name', v_label, 'slug', 'scope_' || left(md5(p_item_id::text || p_scope_id::text), 12),
    'type', 'entity', 'display', 'list', 'weight', 'light', 'ordered', true, 'row_order', 'sorted',
    'label_singular', coalesce(v_item.display_name, 'Row'), 'label_plural', coalesce(v_item.display_name, 'Rows'),
    'title_field', v_title, 'agent_writable', true, 'retention_days', 3650,
    'default_sort', jsonb_build_array(jsonb_build_object('field', v_title, 'direction', 'asc')),
    'parent_id', v_home::text,
    'fields', jsonb_build_array(jsonb_build_object('name', v_title))));
  for v_f in select * from workbench.udt_dataset_template_fields f where f.template_id = v_tpl.id order by f.field_order loop
    v_n := v_n + 1;
    perform custom.field_declare(p_organization_id, v_table, jsonb_strip_nulls(jsonb_build_object(
      'key', v_f.field_name, 'label', coalesce(nullif(v_f.display_name, ''), v_f.field_name),
      'type', case v_f.data_type::text when 'number' then 'number' when 'integer' then 'number'
                                      when 'boolean' then 'checkbox' when 'date' then 'datetime'
                                      when 'datetime' then 'datetime' when 'json' then 'long_text'
                                      when 'array' then 'long_text' else 'text' end,
      'kind', case when v_f.data_type::text = 'datetime' then 'datetime' end,
      'required', coalesce(v_f.is_required, false),
      'sort', v_n * 10,
      'config', case when nullif(v_f.validation_rules ->> 'description', '') is not null
                     then jsonb_build_object('help', v_f.validation_rules ->> 'description') end)));
  end loop;
  update custom.record
     set data = jsonb_set(data, '{scope_binding}', jsonb_build_object(
                  'context_item_id', p_item_id, 'scope_id', p_scope_id,
                  'template_id', v_tpl.id, 'template_version', v_tpl.version), true)
   where organization_id = p_organization_id and id = v_table and table_id = custom.table_kernel_id();

  v_fence := '```matrx' || chr(10)
    || '{"__kind":"directive_v1_reference_table","items":'
    || jsonb_build_array(jsonb_build_object('table_id', v_table, 'table_name', v_label, 'label', v_label,
                                            'store', 'records'))::text
    || '}' || chr(10) || '```';
  if v_store then
    -- THE IMAGE IS OFF: the pointer lands in the scope's Record through the store half, as the
    -- write-through would have carried the old value writer's row.
    v_was := custom._ctx_mark('bridge');
    perform custom._ctx_store_value(p_organization_id, jsonb_build_object(
      'context_item_id', p_item_id, 'scope_id', p_scope_id, 'value_text', v_fence, 'is_current', true,
      'source_type', 'system', 'change_summary', 'Provisioned template-backed table in the record store',
      'created_at', now()));
    perform custom._ctx_mark(v_was);
  else
    perform context.write_context_value(
      p_item_id => p_item_id, p_scope_id => p_scope_id, p_value_text => v_fence,
      p_change_summary => 'Provisioned template-backed table in the record store',
      p_source_type => 'system', p_actor => custom.query_principal());
  end if;
  return v_table;
end
$function$;

drop function if exists custom._ctx_reference_value_holds(uuid, uuid, text);
