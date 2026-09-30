-- INVERSE of migrations/campaign/scopesoldwriters_the_old_writers_write_through_the_scope_doors.sql (lane SCOPES-OLD-WRITERS).
-- chair-step: puts back, byte for byte as production held them on 2026-09-29, the eight bodies the file replaced (the three scope doors that call the old write functions, the agents' structure tool, the two knowledge accepts, a class's join code and access mode), turns the seven doors it only made definers back into SECURITY INVOKER, and takes the SCOPES-OLD-WRITERS sentence back off the ten door rows. Run it only while clients still hold EXECUTE on the old public write functions (i.e. after the inverse of scopesoldwriters_clients_lose_the_old_scope_write_doors.sql, if that file was applied): an invoker door needs that grant.
-- based-on: custom.context_type_write(uuid, uuid, jsonb) b25d660e70a848ddc86b31acee5af5a718dbc22f955df7ef01ea6ac4555660c2
-- based-on: custom.context_scope_write(uuid, uuid, uuid, jsonb) 420e695039bcc2a01ee544a62a4527f7d6027a4f78211b2972fb6e5f218ad03c
-- based-on: custom.context_item_write(uuid, uuid, jsonb) 05de0dfb75a7fa00b642fb390a478ed9acba18ca25c9118521545a24c629ea62
-- based-on: public.scope_system_apply(uuid, jsonb) c9d2c8cbb6be64e79fe21a7a511abdfcfa839b3cc7954ed86929349460905034
-- based-on: public.accept_scope_suggestion(uuid, uuid) cc70fbf808b09a1358170f44bd546ad0df516154d4d9571081ebabb18b4d0eba
-- based-on: public.accept_context_item_suggestion(uuid) 27d502026e22ce836290b60625ca0a98a85fc8844a26253005d21ef76e8c02ad
-- based-on: public.edu_class_join_code(uuid, text) aa2875b527c512e8dd2246c94d9a04b48f502c9270fbdbd6f0c71dc5381ff7a3
-- based-on: public.edu_class_set_access(uuid, text) b9679661bc5bec382c392e3831f9a89784a87709bb2e9e2f9b6594c22821816a

CREATE OR REPLACE FUNCTION custom.context_type_write(p_organization_id uuid, p_type_id uuid, p_spec jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_row jsonb;
  v_org uuid := p_organization_id;
  s jsonb := coalesce(p_spec, '{}'::jsonb);
begin
  if p_type_id is null then
    if v_org is null then
      raise exception 'A new scope type needs the organization it belongs to.' using errcode = '22004';
    end if;
    perform custom.assert_scope_door(v_org, 'custom.context_type_write');
    v_row := public.create_scope_type(
      v_org, s ->> 'label_singular', s ->> 'label_plural', nullif(s ->> 'parent_type_id', '')::uuid,
      coalesce(s ->> 'icon', 'folder'), coalesce(s ->> 'description', ''),
      coalesce((s ->> 'sort_order')::smallint, 0::smallint), (s ->> 'max_assignments')::smallint,
      coalesce(array(select jsonb_array_elements_text(s -> 'default_variable_keys')), '{}'::text[]),
      s ->> 'color', nullif(s ->> 'slug', ''));
  else
    v_row := public.update_scope_type(
      p_type_id, s ->> 'label_singular', s ->> 'label_plural', s ->> 'icon', s ->> 'description',
      (s ->> 'sort_order')::smallint, (s ->> 'max_assignments')::smallint, s ->> 'color', nullif(s ->> 'slug', ''));
    v_org := (v_row ->> 'organization_id')::uuid;
    perform custom.assert_scope_door(v_org, 'custom.context_type_write');
  end if;
  return custom._ctx_answer(coalesce(v_org, (v_row ->> 'organization_id')::uuid), (v_row ->> 'id')::uuid, v_row);
end;
$function$

;

CREATE OR REPLACE FUNCTION custom.context_scope_write(p_organization_id uuid, p_scope_id uuid, p_type_id uuid, p_spec jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_row jsonb;
  s jsonb := coalesce(p_spec, '{}'::jsonb);
begin
  if p_scope_id is null then
    perform custom.assert_scope_door(p_organization_id, 'custom.context_scope_write');
    v_row := public.create_scope(
      p_organization_id, p_type_id, s ->> 'name', nullif(s ->> 'parent_scope_id', '')::uuid,
      coalesce(s ->> 'description', ''), coalesce(s -> 'settings', '{}'::jsonb), nullif(s ->> 'slug', ''),
      (s ->> 'sort_order')::smallint);
  else
    v_row := public.update_scope(
      p_scope_id, s ->> 'name', s ->> 'description', case when s ? 'settings' then s -> 'settings' end,
      nullif(s ->> 'slug', ''), (s ->> 'sort_order')::smallint);
  end if;
  if p_scope_id is not null then
    perform custom.assert_scope_door((v_row ->> 'organization_id')::uuid, 'custom.context_scope_write');
  end if;
  return custom._ctx_answer((v_row ->> 'organization_id')::uuid, (v_row ->> 'id')::uuid, v_row);
end;
$function$

;

CREATE OR REPLACE FUNCTION custom.context_item_write(p_item_id uuid, p_scope_type_id uuid, p_spec jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_row  jsonb;
  s jsonb := coalesce(p_spec, '{}'::jsonb);
  v_org  uuid;
  v_rowupdate boolean;
begin
  if p_item_id is null then
    v_row := public.create_context_item(
      p_scope_type_id, s ->> 'key', s ->> 'display_name', coalesce(s ->> 'value_type', 'string')::public.context_value_type,
      coalesce(s ->> 'description', ''), s ->> 'category',
      coalesce(s ->> 'fetch_hint', 'on_demand')::public.context_fetch_hint,
      coalesce(s ->> 'sensitivity', 'internal')::public.context_sensitivity,
      coalesce(array(select jsonb_array_elements_text(s -> 'tags')), '{}'::text[]),
      nullif(s ->> 'slug', ''), (s ->> 'sort_order')::smallint,
      case when jsonb_typeof(s -> 'allowed_reference_types') = 'array' then array(select jsonb_array_elements_text(s -> 'allowed_reference_types')) end,
      (s ->> 'max_items')::int,
      case when jsonb_typeof(s -> 'allowed_scope_type_ids') = 'array' then array(select jsonb_array_elements_text(s -> 'allowed_scope_type_ids'))::uuid[] end,
      case when jsonb_typeof(s -> 'reference_source') = 'object' then s -> 'reference_source' end);
  else
    v_rowupdate := exists (select 1 from jsonb_each(s) e where jsonb_typeof(e.value) = 'null')
                   or s ?| array['custom_component', 'review_interval_days', 'allowed_reference_types', 'max_items',
                                 'allowed_scope_type_ids', 'reference_source'];
    if v_rowupdate then
      update context.context_items i
         set display_name = case when s ? 'display_name' then s ->> 'display_name' else i.display_name end,
             description = case when s ? 'description' then s ->> 'description' else i.description end,
             category = case when s ? 'category' then s ->> 'category' else i.category end,
             value_type = case when s ? 'value_type' then (s ->> 'value_type')::public.context_value_type else i.value_type end,
             fetch_hint = case when s ? 'fetch_hint' then (s ->> 'fetch_hint')::public.context_fetch_hint else i.fetch_hint end,
             sensitivity = case when s ? 'sensitivity' then (s ->> 'sensitivity')::public.context_sensitivity else i.sensitivity end,
             tags = case when s ? 'tags' then coalesce(array(select jsonb_array_elements_text(s -> 'tags')), '{}'::text[]) else i.tags end,
             sort_order = case when s ? 'sort_order' then (s ->> 'sort_order')::smallint else i.sort_order end,
             status = case when s ? 'status' then (s ->> 'status')::public.context_item_status else i.status end,
             status_note = case when s ? 'status_note' then s ->> 'status_note' else i.status_note end,
             custom_component = case when s ? 'custom_component' then case when jsonb_typeof(s -> 'custom_component') = 'null' then null else s -> 'custom_component' end else i.custom_component end,
             review_interval_days = case when s ? 'review_interval_days' then (s ->> 'review_interval_days')::int else i.review_interval_days end,
             allowed_reference_types = case when s ? 'allowed_reference_types' then case when jsonb_typeof(s -> 'allowed_reference_types') = 'array' then array(select jsonb_array_elements_text(s -> 'allowed_reference_types')) end else i.allowed_reference_types end,
             max_items = case when s ? 'max_items' then coalesce((s ->> 'max_items')::int, 1) else i.max_items end,
             allowed_scope_type_ids = case when s ? 'allowed_scope_type_ids' then case when jsonb_typeof(s -> 'allowed_scope_type_ids') = 'array' then array(select jsonb_array_elements_text(s -> 'allowed_scope_type_ids'))::uuid[] end else i.allowed_scope_type_ids end,
             reference_source = case when s ? 'reference_source' then case when jsonb_typeof(s -> 'reference_source') = 'null' then null else s -> 'reference_source' end else i.reference_source end
       where i.id = p_item_id
      returning to_jsonb(i.*) into v_row;
      if v_row is null then
        raise exception 'There is no such context field you may change.' using errcode = '42501',
            detail = jsonb_build_object('item_id', p_item_id)::text;
      end if;
    else
      v_row := public.update_context_item(
        p_item_id, s ->> 'display_name', s ->> 'description', s ->> 'category',
        (s ->> 'value_type')::public.context_value_type, (s ->> 'fetch_hint')::public.context_fetch_hint,
        (s ->> 'sensitivity')::public.context_sensitivity,
        case when s ? 'tags' then array(select jsonb_array_elements_text(s -> 'tags')) end,
        (s ->> 'sort_order')::smallint, (s ->> 'status')::public.context_item_status, s ->> 'status_note');
    end if;
  end if;
  select t.organization_id into v_org from context.scope_types t where t.id = (v_row ->> 'scope_type_id')::uuid;
  return custom._ctx_answer(v_org, (v_row ->> 'id')::uuid, v_row);
end;
$function$

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
    v_item_id := null; v_scope_id := null; v_template_id := null; v_row := null;

    if kind = 'upsert_scope_type' then
      if op ? 'id' then v_id := (op->>'id')::uuid; end if;
      if v_id is null then
        select id into v_id from context.scope_types
        where organization_id = p_org_id and deleted_at is null and slug = op->>'key';
      end if;
      v_parent_id := null;
      if op ? 'parent_key' then
        select id into v_parent_id from context.scope_types
        where organization_id = p_org_id and deleted_at is null and slug = op->>'parent_key';
      end if;
      if v_id is null then
        insert into context.scope_types (
          organization_id, parent_type_id, label_singular, label_plural, icon, description,
          color, sort_order, max_assignments_per_entity, default_variable_keys, slug
        ) values (
          p_org_id, v_parent_id, op->>'label_singular',
          coalesce(op->>'label_plural', (op->>'label_singular') || 's'),
          coalesce(op->>'icon', 'folder'), coalesce(op->>'description', ''),
          coalesce(op->>'color', ''), coalesce((op->>'sort_order')::smallint, 0),
          nullif(op->>'max_assignments', '')::smallint,
          coalesce(array(select jsonb_array_elements_text(op->'default_variable_keys')), '{}'),
          op->>'key'
        ) returning id into v_id;
      else
        update context.scope_types set
          parent_type_id = case when op ? 'parent_key' then v_parent_id else parent_type_id end,
          label_singular = coalesce(op->>'label_singular', label_singular),
          label_plural = coalesce(op->>'label_plural', label_plural),
          icon = coalesce(op->>'icon', icon),
          description = coalesce(op->>'description', description),
          color = coalesce(op->>'color', color),
          sort_order = coalesce((op->>'sort_order')::smallint, sort_order),
          max_assignments_per_entity = case
            when op ? 'max_assignments' then nullif(op->>'max_assignments', '')::smallint
            else max_assignments_per_entity
          end,
          updated_by = (select auth.uid()),
          updated_at = now()
        where id = v_id and organization_id = p_org_id;
      end if;
      select to_jsonb(st) into v_row from context.scope_types st where id = v_id;

    elsif kind = 'archive_scope_type' then
      select id into v_id from context.scope_types
      where organization_id = p_org_id and deleted_at is null
        and (id::text = op->>'id' or slug = op->>'key');
      update context.scope_types
        set deleted_at = now(), updated_by = (select auth.uid()), updated_at = now()
      where id = v_id;
      v_row := jsonb_build_object('id', v_id, 'archived', true);

    elsif kind = 'upsert_context_item' then
      v_type_id := public._scope_system_resolve_type_id(p_org_id, op, 'context item');
      if op ? 'id' then
        v_item_id := (op->>'id')::uuid;
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
      if v_item_id is null then
        insert into context.context_items (
          scope_type_id, key, display_name, description, category, tags, status, value_type,
          fetch_hint, sensitivity, source_type, is_active, created_by, slug, sort_order,
          allowed_reference_types, max_items, allowed_scope_type_ids, reference_source,
          custom_component
        ) values (
          v_type_id, op->>'key', coalesce(op->>'display_name', op->>'key'),
          coalesce(op->>'description', ''), op->>'category',
          coalesce(array(select jsonb_array_elements_text(op->'tags')), '{}'),
          'active',
          coalesce(op->>'value_type', 'string')::public.context_value_type,
          coalesce(op->>'fetch_hint', 'on_demand')::public.context_fetch_hint,
          coalesce(op->>'sensitivity', 'internal')::public.context_sensitivity,
          'manual', true, (select auth.uid()), coalesce(op->>'slug', op->>'key'),
          coalesce((op->>'sort_order')::smallint, 0),
          case when op ? 'allowed_reference_types'
            then array(select jsonb_array_elements_text(op->'allowed_reference_types'))
            else null end,
          coalesce((op->>'max_items')::integer, 1),
          case when op ? 'allowed_scope_type_ids'
            then array(select jsonb_array_elements_text(op->'allowed_scope_type_ids'))::uuid[]
            else null end,
          op->'reference_source',
          case when op ? 'custom_component' then op->'custom_component' else null end
        ) returning id into v_item_id;
      else
        update context.context_items set
          display_name = coalesce(op->>'display_name', display_name),
          description = coalesce(op->>'description', description),
          category = case when op ? 'category' then op->>'category' else category end,
          value_type = coalesce(op->>'value_type', value_type::text)::public.context_value_type,
          fetch_hint = coalesce(op->>'fetch_hint', fetch_hint::text)::public.context_fetch_hint,
          sensitivity = coalesce(op->>'sensitivity', sensitivity::text)::public.context_sensitivity,
          sort_order = coalesce((op->>'sort_order')::smallint, sort_order),
          allowed_reference_types = case when op ? 'allowed_reference_types'
            then array(select jsonb_array_elements_text(op->'allowed_reference_types'))
            else allowed_reference_types end,
          max_items = coalesce((op->>'max_items')::integer, max_items),
          allowed_scope_type_ids = case when op ? 'allowed_scope_type_ids'
            then array(select jsonb_array_elements_text(op->'allowed_scope_type_ids'))::uuid[]
            else allowed_scope_type_ids end,
          reference_source = case when op ? 'reference_source'
            then op->'reference_source' else reference_source end,
          custom_component = case when op ? 'custom_component'
            then op->'custom_component' else custom_component end,
          updated_by = (select auth.uid()),
          updated_at = now()
        where id = v_item_id and scope_type_id = v_type_id;
      end if;
      select to_jsonb(ci) into v_row from context.context_items ci where id = v_item_id;
      v_id := v_item_id;

    elsif kind = 'archive_context_item' then
      select ci.id into v_id
      from context.context_items ci
      join context.scope_types st on st.id = ci.scope_type_id
      where st.organization_id = p_org_id and ci.deleted_at is null
        and (ci.id::text = op->>'id' or (st.slug = op->>'scope_type_key' and ci.key = op->>'key'));
      update context.context_items
        set is_active = false, deleted_at = now(), updated_by = (select auth.uid()), updated_at = now()
      where id = v_id;
      v_row := jsonb_build_object('id', v_id, 'archived', true);

    elsif kind = 'upsert_scope' then
      v_type_id := public._scope_system_resolve_type_id(p_org_id, op, 'scope');
      v_parent_id := null;
      if op ? 'parent_key' then
        select id into v_parent_id from context.scopes
        where organization_id = p_org_id and deleted_at is null and slug = op->>'parent_key';
      end if;
      if op ? 'id' then
        v_scope_id := (op->>'id')::uuid;
      else
        select id into v_scope_id from context.scopes
        where organization_id = p_org_id and scope_type_id = v_type_id
          and deleted_at is null and slug = op->>'key';
      end if;
      if v_scope_id is null then
        insert into context.scopes (
          organization_id, scope_type_id, parent_scope_id, name, description,
          settings, created_by, slug, sort_order
        ) values (
          p_org_id, v_type_id, v_parent_id, op->>'name', coalesce(op->>'description', ''),
          coalesce(op->'settings', '{}'::jsonb), (select auth.uid()), op->>'key',
          coalesce((op->>'sort_order')::smallint, 0)
        ) returning id into v_scope_id;
      else
        update context.scopes set
          parent_scope_id = case when op ? 'parent_key' then v_parent_id else parent_scope_id end,
          name = coalesce(op->>'name', name),
          description = coalesce(op->>'description', description),
          settings = case when op ? 'settings' then op->'settings' else settings end,
          sort_order = coalesce((op->>'sort_order')::smallint, sort_order),
          updated_by = (select auth.uid()),
          updated_at = now()
        where id = v_scope_id and organization_id = p_org_id;
      end if;
      select to_jsonb(s) into v_row from context.scopes s where id = v_scope_id;
      v_id := v_scope_id;

    elsif kind = 'archive_scope' then
      select id into v_id from context.scopes
      where organization_id = p_org_id and deleted_at is null
        and (id::text = op->>'id' or slug = op->>'key');
      update context.scopes
        set deleted_at = now(), updated_by = (select auth.uid()), updated_at = now()
      where id = v_id;
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
      select to_jsonb(x) into v_row from context.write_context_value(
        p_item_id => v_item_id,
        p_scope_id => v_scope_id,
        p_value_text => case when v_value_type in (
          'string', 'email', 'url', 'phone', 'color', 'markdown', 'reference'
        ) then v_value#>>'{}' end,
        p_value_number => case when v_value_type in ('number', 'percent')
          then (v_value#>>'{}')::numeric end,
        p_value_boolean => case when v_value_type = 'boolean'
          then (v_value#>>'{}')::boolean end,
        p_value_json => case when v_value_type in ('object', 'array', 'currency')
          then v_value end,
        p_value_date => case when v_value_type = 'date'
          then (v_value#>>'{}')::date end,
        p_value_timestamp => case when v_value_type = 'datetime'
          then (v_value#>>'{}')::timestamptz end,
        p_value_time => case when v_value_type = 'time'
          then (v_value#>>'{}')::time end,
        p_value_document_url => case when v_value_type = 'document'
          then v_value#>>'{}' end,
        p_change_summary => coalesce(op->>'change_summary', 'Updated by scope_system tool'),
        p_source_type => 'ai_generated',
        p_actor => (select auth.uid())
      ) x;
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

CREATE OR REPLACE FUNCTION public.accept_scope_suggestion(p_suggestion_id uuid, p_organization_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid           UUID := auth.uid();
  v_sugg          RECORD;
  v_org           UUID;
  v_type_id       UUID;
  v_scope_id      UUID := gen_random_uuid();
  v_seeded        INT  := 0;
  v_key           TEXT;
  v_val           TEXT;
  v_item_id       UUID;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error',
      jsonb_build_object('code','unauthorized','message','no acting user'));
  END IF;

  SELECT * INTO v_sugg
    FROM rag.scope_suggestions
   WHERE id = p_suggestion_id AND user_id = v_uid
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error',
      jsonb_build_object('code','not_found','message','suggestion not found'));
  END IF;
  IF v_sugg.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'error',
      jsonb_build_object('code','invalid_argument',
        'message','suggestion is not pending (status=' || v_sugg.status || ')'));
  END IF;

  v_org := COALESCE(p_organization_id, v_sugg.organization_id);
  IF v_org IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error',
      jsonb_build_object('code','invalid_argument',
        'message','no organization: pass p_organization_id'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM iam.organization_member om
                  WHERE om.organization_id = v_org AND om.user_id = v_uid) THEN
    RETURN jsonb_build_object('ok', false, 'error',
      jsonb_build_object('code','forbidden_org',
        'message','caller is not a member of this organization'));
  END IF;

  IF v_sugg.scope_type_id IS NOT NULL THEN
    SELECT id INTO v_type_id FROM context.scope_types
     WHERE id = v_sugg.scope_type_id AND organization_id = v_org;
  END IF;
  IF v_type_id IS NULL THEN
    SELECT id INTO v_type_id FROM context.scope_types
     WHERE organization_id = v_org
       AND (lower(label_singular) = lower(v_sugg.scope_type_label)
            OR lower(label_plural) = lower(v_sugg.scope_type_label))
     ORDER BY created_at LIMIT 1;
  END IF;
  IF v_type_id IS NULL THEN
    INSERT INTO context.scope_types (organization_id, label_singular, label_plural)
    VALUES (v_org, v_sugg.scope_type_label, v_sugg.scope_type_label || 's')
    RETURNING id INTO v_type_id;
  END IF;

  INSERT INTO context.scopes (id, organization_id, scope_type_id, name, created_by)
  VALUES (v_scope_id, v_org, v_type_id, v_sugg.suggested_name, v_uid);

  PERFORM context._assert_scope_readable(v_scope_id, 'editor');

  FOR v_key, v_val IN
    SELECT key, value FROM jsonb_each_text(COALESCE(v_sugg.suggested_slot_values, '{}'::jsonb))
  LOOP
    SELECT id INTO v_item_id FROM context.context_items
     WHERE scope_type_id = v_type_id AND key = v_key
       AND is_active IS DISTINCT FROM false
     LIMIT 1;
    IF v_item_id IS NOT NULL AND v_val IS NOT NULL THEN
      INSERT INTO context.context_item_values
        (context_item_id, scope_id, version, is_current, value_text,
         has_nested_objects, source_type, authored_by, change_summary)
      VALUES
        (v_item_id, v_scope_id, 1, true, v_val,
         false, 'ai_enriched', v_uid,
         'Seeded from scope suggestion ' || v_sugg.id);
      v_seeded := v_seeded + 1;
    END IF;
  END LOOP;

  UPDATE rag.scope_suggestions
     SET status = 'accepted', decided_at = now(), decided_by = v_uid
   WHERE id = v_sugg.id;

  RETURN jsonb_build_object('ok', true, 'data', jsonb_build_object(
    'scope_id', v_scope_id,
    'scope_type_id', v_type_id,
    'seeded_value_count', v_seeded));
END;
$function$

;

CREATE OR REPLACE FUNCTION public.accept_context_item_suggestion(p_suggestion_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid       UUID := auth.uid();
  v_sugg      RECORD;
  v_type_org  UUID;
  v_item_id   UUID;
  v_created   BOOLEAN := false;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error',
      jsonb_build_object('code','unauthorized','message','no acting user'));
  END IF;

  SELECT * INTO v_sugg
    FROM rag.context_item_suggestions
   WHERE id = p_suggestion_id AND user_id = v_uid
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error',
      jsonb_build_object('code','not_found','message','suggestion not found'));
  END IF;
  IF v_sugg.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'error',
      jsonb_build_object('code','invalid_argument',
        'message','suggestion is not pending (status=' || v_sugg.status || ')'));
  END IF;

  SELECT organization_id INTO v_type_org
    FROM context.scope_types WHERE id = v_sugg.scope_type_id;
  IF v_type_org IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error',
      jsonb_build_object('code','not_found','message','scope type not found'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM iam.organization_member om
                  WHERE om.organization_id = v_type_org AND om.user_id = v_uid
                    AND om.role IN ('owner','admin')) THEN
    RETURN jsonb_build_object('ok', false, 'error',
      jsonb_build_object('code','forbidden_org',
        'message','only an org owner/admin may add context items'));
  END IF;

  SELECT id INTO v_item_id FROM context.context_items
   WHERE scope_type_id = v_sugg.scope_type_id AND key = v_sugg.suggested_key
   LIMIT 1;
  IF v_item_id IS NULL THEN
    INSERT INTO context.context_items
      (scope_type_id, key, display_name, description, created_by)
    VALUES
      (v_sugg.scope_type_id, v_sugg.suggested_key, v_sugg.display_name,
       COALESCE(v_sugg.rationale, ''), v_uid)
    RETURNING id INTO v_item_id;
    v_created := true;
  END IF;

  UPDATE rag.context_item_suggestions
     SET status = 'accepted', decided_at = now(), decided_by = v_uid
   WHERE id = v_sugg.id;

  RETURN jsonb_build_object('ok', true, 'data', jsonb_build_object(
    'context_item_id', v_item_id,
    'created', v_created));
END;
$function$

;

CREATE OR REPLACE FUNCTION public.edu_class_join_code(p_class uuid, p_action text DEFAULT 'get'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_scope public._edu_class_row;
  v_uid uuid := (select auth.uid());
  v_code text;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if p_action not in ('get', 'rotate', 'disable') then
    raise exception 'invalid action %', p_action using errcode = '22023';
  end if;
  v_scope := public._edu_class_of(p_class);
  if not public._edu_is_owner(v_scope) then
    raise exception 'class owner required' using errcode = '42501';
  end if;

  v_code := v_scope.settings->>'join_code';

  if p_action = 'disable' then
    update context.scopes
       set settings = coalesce(settings, '{}'::jsonb) - 'join_code',
           updated_at = now(), updated_by = v_uid
     where id = v_scope.id;
    return jsonb_build_object('code', null);
  end if;

  if p_action = 'rotate' or v_code is null then
    v_code := public._edu_generate_join_code();
    update context.scopes
       set settings = jsonb_set(coalesce(settings, '{}'::jsonb), '{join_code}', to_jsonb(v_code)),
           updated_at = now(), updated_by = v_uid
     where id = v_scope.id;
  end if;

  return jsonb_build_object('code', v_code);
end;
$function$

;

CREATE OR REPLACE FUNCTION public.edu_class_set_access(p_class uuid, p_access_mode text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_scope public._edu_class_row;
begin
  if p_access_mode not in ('open', 'closed', 'paid') then
    raise exception 'invalid access_mode %', p_access_mode using errcode = '22023';
  end if;
  v_scope := public._edu_class_of(p_class);
  if not public._edu_is_owner(v_scope) then
    raise exception 'only the class owner can change access mode' using errcode = '42501';
  end if;
  -- The write merges into the row's own settings (SCOPES-READS-ACCESS): the class is read from the
  -- store, and a copy of its settings is never written back over the old row.
  update context.scopes set settings = coalesce(settings, '{}'::jsonb) || jsonb_build_object('access_mode', p_access_mode), updated_at = now() where id = v_scope.id;
  perform public._edu_ensure_owner_membership(v_scope);
  return jsonb_build_object('status', 'ok', 'access_mode', p_access_mode);
end;
$function$

;

ALTER FUNCTION custom.context_type_archive(uuid) SECURITY INVOKER;
ALTER FUNCTION custom.context_type_restore(uuid) SECURITY INVOKER;
ALTER FUNCTION custom.context_scope_archive(uuid) SECURITY INVOKER;
ALTER FUNCTION custom.context_scope_restore(uuid) SECURITY INVOKER;
ALTER FUNCTION custom.context_item_archive(uuid) SECURITY INVOKER;
ALTER FUNCTION custom.context_item_restore(uuid) SECURITY INVOKER;
ALTER FUNCTION custom.context_tags_set(text, uuid, uuid[]) SECURITY INVOKER;

update platform.client_callable_door d
   set reason = regexp_replace(
                  replace(d.reason, ' (SCOPES-OLD-WRITERS 2026-09-29: a definer, so it reaches the old function in the owner''s right while clients no longer hold EXECUTE on it; the old function still decides by auth.uid(), and the door by custom.caller_role().)', ''),
                  '^SECURITY DEFINER ', 'SECURITY INVOKER ')
 where d.schema_name = 'custom'
   and d.function_name in ('context_type_write', 'context_type_archive', 'context_type_restore',
                           'context_scope_write', 'context_scope_archive', 'context_scope_restore',
                           'context_item_write', 'context_item_archive', 'context_item_restore',
                           'context_tags_set')
   and d.reason like '%(SCOPES-OLD-WRITERS 2026-09-29: a definer%';
