-- INVERSE of migrations/campaign/postmovedoors_a_the_last_older_doors_answer_from_the_store.sql (lane POST-MOVE-DOORS): the
-- ten bodies exactly as they were on production 2026-10-01 before the file (read with pg_get_functiondef), except that
-- workbench.older_table_moved_to comes back as plpgsql around its original statement: a LANGUAGE sql body that names
-- workbench.udt_* cannot be created while those tables are in the graveyard.
-- based-on: context.provision_scope_dataset(uuid, uuid) 494d796677ea5e8d9d6eb616391bbec83ed5dd68d4f2194928c1402816e03a08
-- based-on: context.provision_scope_datasets_trigger() c4273927156129ca9a7c0489ac091a62fa2952f2670879245421d1b3d9d4560a
-- based-on: context.validate_reference_value(uuid, text) 8c366991e0c073e25317778a47f6ca5bc0b988867e4a8bb36737933c0d69c75a
-- based-on: public._d31_impl_get_user_list_with_items(uuid) cb3400b189e95cb5c07401f0a12d19de94364b94b3290165b6513224fb3fdef8
-- based-on: public.get_structured_list_for_selection(uuid) 69d122c680279f73841bba5474d559dea120ceb87ca785aa2adfbae612e97ec6
-- based-on: public.get_user_list_with_items(uuid) d461ffd265c0c562098d38d456c0afb20510deed6ac4537109ae337c58007517
-- based-on: public.get_user_lists_summary(uuid) 669c1f82abecdbee189a4ccfc3aa2b931d698cf0e7489fb6bf9cba8982b7df49
-- based-on: public.update_user_list(uuid, character varying, text, boolean, boolean, boolean, jsonb) a7d327fd4012271546e546651eaa498c81d9af6ee44cb2a964c79c72b1df9a1d
-- based-on: custom.scope_table_provision(uuid, uuid, uuid, uuid) c6d6725e4bfb6173c6d2553e5aefcb37a95348fa2f6f8b314920d27c4e5e5a54
-- based-on: workbench.older_table_moved_to(uuid) b0d4a0a94570a6f0761a9512ffb331aa35cd56cd915da732f808fcb4b9029faf
-- lane: POST-MOVE-DOORS

CREATE OR REPLACE FUNCTION context.provision_scope_dataset(p_item_id uuid, p_scope_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_item context.context_items; v_scope context.scopes; v_template workbench.udt_dataset_templates;
  v_dataset_id uuid; v_owner uuid; v_fence text; v_label text;
begin
  select * into v_item from context.context_items where id=p_item_id and is_active and deleted_at is null;
  select * into v_scope from context.scopes where id=p_scope_id and deleted_at is null;
  -- ARGS-RULED (2026-09-21). THE CALLER, BEFORE ANYTHING IS MADE IN SOMEBODY ELSE'S TENANT.
  -- This door took two ids and checked NEITHER against the person calling it: it resolved the
  -- scope, matched its scope_type to the item's, and then created a dataset, its fields, an
  -- instance row and a context value — all in `v_scope.organization_id`, whoever that was. It
  -- has carried a DECLARED `{"unchecked": true}` rule since 2026-09-17 and the reason did not
  -- hold: an organization id that decides where rows are written is an id that confers access.
  if v_scope.id is not null
     and not iam.is_trusted_backend()
     and not iam.has_org_access(v_scope.organization_id) then
    raise exception 'You are not a member of the organization that scope belongs to, so nothing was provisioned.'
      using errcode = '42501',
            hint = 'A context scope belongs to one organization, and provisioning its template-backed table writes a dataset, its fields and a context value into that organization. Switch to the organization the scope lives in, or ask an owner of it to add you.';
  end if;
  if not found or v_item.id is null or v_item.scope_type_id <> v_scope.scope_type_id then return null; end if;
  if v_item.reference_source->>'container_type' <> 'dataset_template' then return null; end if;
  select * into v_template from workbench.udt_dataset_templates
   where id=(v_item.reference_source->>'template_id')::uuid and is_active;
  -- A template belongs either to the scope's own organization, or to the
  -- PLATFORM (the system organization) — a platform starter kit such as "Known
  -- defects" is authored once and used by every organization, exactly like the
  -- 34 scope templates. Any third organization's template is still refused.
  if not found or v_template.organization_id not in (
       v_scope.organization_id, '39c38960-d30c-4840-b0c1-c9960de95582'::uuid) then
    raise exception 'dataset template binding is invalid for this context item' using errcode='22023',
            detail = jsonb_build_object('item_id', p_item_id)::text;
  end if;
  select dataset_id into v_dataset_id from context.scope_dataset_instances
   where context_item_id=p_item_id and scope_id=p_scope_id;
  if v_dataset_id is not null then return v_dataset_id; end if;
  v_owner := coalesce(auth.uid(), v_scope.created_by, v_item.created_by, v_template.created_by);
  if v_owner is null then raise exception 'cannot provision template dataset without an owner' using errcode='23502'; end if;
  v_label := v_scope.name || ' — ' || v_item.display_name;
  perform set_config('app.udt_template_provisioning','on',true);
  insert into workbench.udt_datasets (
    table_name, description, user_id, organization_id, validation_mode,
    template_id, template_version, created_by, updated_by
  ) values (
    v_label,
    'Template-backed context table for ' || v_scope.name || ' / ' || v_item.display_name,
    v_owner, v_scope.organization_id, 'strict', v_template.id, v_template.version, v_owner, v_owner
  ) returning id into v_dataset_id;
  insert into workbench.udt_dataset_fields (
    table_id, field_name, display_name, data_type, field_order, is_required,
    default_value, validation_rules, user_id, organization_id, created_by, updated_by
  ) select v_dataset_id, f.field_name, f.display_name, f.data_type, f.field_order,
      f.is_required, f.default_value, f.validation_rules, v_owner, v_scope.organization_id, v_owner, v_owner
    from workbench.udt_dataset_template_fields f where f.template_id=v_template.id order by f.field_order;
  -- organization_id is NOT NULL on this table (the org-null-ban sweep added it
  -- after this function was written, and nothing re-read the writer). It is the
  -- SCOPE's organization, never the template's: a platform template provisions
  -- into the tenant that asked for it.
  insert into context.scope_dataset_instances (
    context_item_id, scope_id, dataset_id, template_id, template_version, created_by,
    organization_id
  ) values (p_item_id, p_scope_id, v_dataset_id, v_template.id, v_template.version, v_owner,
    v_scope.organization_id)
  on conflict (context_item_id, scope_id) do nothing;
  -- Kind Directives two-key shell — __kind FIRST (jsonb normalizes key order at
  -- rest, so the fence is built as TEXT to preserve first-key streaming reads).
  -- The noun is `table`, whose resolver expands the reference to the table's
  -- ROWS; `dataset` is a record pointer and renders the row's description.
  v_fence := '```matrx' || chr(10)
    || '{"__kind":"directive_v1_reference_table","items":'
    || jsonb_build_array(jsonb_build_object('table_id',v_dataset_id,'table_name',v_label,'label',v_label))::text
    || '}' || chr(10) || '```';
  perform context.write_context_value(
    p_item_id=>p_item_id, p_scope_id=>p_scope_id, p_value_text=>v_fence,
    p_change_summary=>'Provisioned template-backed dataset', p_source_type=>'system', p_actor=>v_owner
  );
  return v_dataset_id;
end; $function$
;

CREATE OR REPLACE FUNCTION context.provision_scope_datasets_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r record; v_org uuid; v_home uuid; v_moved boolean;
begin
  -- An item carries no organization of its own; its scope type does (a scope's is the same).
  select st.organization_id into v_org from context.scope_types st where st.id = new.scope_type_id;
  -- GRID-PRIMITIVES G11: the record store once the organization has moved and its store is on.
  v_moved := coalesce((platform.knob_resolve('data_tables', 'older_tables_moved', v_org) #>> '{}')::boolean, false)
             and platform.knob_resolve('custom', 'system_enabled', v_org) is distinct from 'false'::jsonb;
  if v_moved then
    v_home := custom.organization_home_id(v_org);
    v_moved := v_home is not null;
  end if;
  if tg_table_name='scopes' then
    for r in select id from context.context_items
      where scope_type_id=new.scope_type_id and is_active and deleted_at is null
        and reference_source->>'container_type'='dataset_template'
    loop
      if v_moved then perform custom.scope_table_provision(v_org, r.id, new.id, v_home);
      else perform context.provision_scope_dataset(r.id,new.id); end if;
    end loop;
  else
    if new.is_active and new.deleted_at is null and new.reference_source->>'container_type'='dataset_template' then
      for r in select id from context.scopes
        where scope_type_id=new.scope_type_id and deleted_at is null
      loop
        if v_moved then perform custom.scope_table_provision(v_org, new.id, r.id, v_home);
        else perform context.provision_scope_dataset(new.id,r.id); end if;
      end loop;
    end if;
  end if;
  return new;
end; $function$
;

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
  if v_home is null then
    raise exception 'This organization has no Home in the record store yet, so its scope table has nowhere to live.'
      using errcode = '22023',
            hint = 'The organization''s move into the record store makes its Home; until then its scopes keep their older tables. Nothing was provisioned.';
  end if;

  v_label := v_scope.name || ' — ' || v_item.display_name;
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
$function$
;

CREATE OR REPLACE FUNCTION public._d31_impl_get_user_list_with_items(p_list_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
    v_result jsonb;
    v_is_editor boolean := false;
begin
    -- lane LISTS-AFTER-SWITCH: a list that lives in the store answers from its copy.
    if platform.list_lives_in(p_list_id) = 'record' then
      return platform._store_pick_list_document(
        p_list_id, case when auth.role() = 'service_role' then null else (select auth.uid()) end, 'detail');
    end if;

    select (l.user_id = (select auth.uid())
            or iam.has_access('structured_list', l.id, 'editor'::public.permission_level))
      into v_is_editor
    from workbench.udt_structured_lists l
    where l.id = p_list_id
      and (l.deleted_at is null or platform._older_list_moved_by_switch(l.id));

    select jsonb_build_object(
        'list_id', l.id, 'list_name', l.list_name, 'description', l.description,
        'created_at', l.created_at, 'updated_at', l.updated_at,
        'is_public', l.is_public, 'public_read', l.public_read,
        'lives_in', 'older',
        'address', '/lists/' || l.id::text,
        -- lane OLDER-DOORS-AFTER-SWITCH: marked moved when the list moved with the switch.
        'moved_to', workbench.older_table_moved_to(l.id),
        'items_grouped', (
            select jsonb_object_agg(coalesce(group_name, 'Ungrouped'), items)
            from (
                select
                    group_name,
                    jsonb_agg(jsonb_build_object(
                        'id', i.id, 'label', i.label,
                        'description', case when v_is_editor then i.description else null end,
                        'help_text', i.help_text
                    ) order by i.created_at) as items
                from workbench.udt_structured_list_items i
                where i.list_id = l.id
                  and i.deleted_at is null
                group by group_name
            ) as grouped_items
        )
    )
    into v_result
    from workbench.udt_structured_lists l
    where l.id = p_list_id
      and (l.deleted_at is null or platform._older_list_moved_by_switch(l.id));
    return v_result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_structured_list_for_selection(p_list_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_result jsonb;
begin
    -- lane LISTS-AFTER-SWITCH: a list that lives in the store answers from its copy; the
    -- store's ladder is the gate (null for a viewer who may not see it, as the older gate is).
    if platform.list_lives_in(p_list_id) = 'record' then
      return platform._store_pick_list_document(
        p_list_id, case when auth.role() = 'service_role' then null else (select auth.uid()) end, 'selection');
    end if;
    select jsonb_build_object(
        'list_id', l.id,
        'list_name', l.list_name,
        'description', l.description,
        'is_public', l.is_public,
        'public_read', l.public_read,
        'lives_in', 'older',
        'moved_to', workbench.older_table_moved_to(l.id),
        'items_grouped', (
            select jsonb_object_agg(coalesce(group_name, 'Ungrouped'), items)
            from (
                select
                    group_name,
                    jsonb_agg(jsonb_build_object(
                        'id', i.id,
                        'label', i.label,
                        'help_text', i.help_text,
                        'group_name', i.group_name,
                        'icon_name', i.icon_name
                    ) order by i.created_at) as items
                from workbench.udt_structured_list_items i
                where i.list_id = l.id
                  and i.deleted_at is null
                group by group_name
            ) as grouped_items
        )
    )
    into v_result
    from workbench.udt_structured_lists l
    where l.id = p_list_id
      -- lane OLDER-DOORS-AFTER-SWITCH: a list that moved with the switch still reads (marked moved).
      and (l.deleted_at is null or platform._older_list_moved_by_switch(l.id))
      -- 🚨 THE GATE (DD-169 batch 3). Mirrors udt_structured_lists' std_select + pub_read.
      and (l.created_by = (select auth.uid())
        or l.visibility = 'public'::platform.visibility
        or iam.has_access('structured_list', l.id, 'viewer'::public.permission_level));
    return v_result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_user_list_with_items(p_list_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  -- lane LISTS-AFTER-SWITCH: a list that lives in the store answers from its copy (same id,
  -- same shape, lives_in = record); the store's own ladder decides who may read it.
  if platform.list_lives_in(p_list_id) = 'record' then
    if (auth.role() = 'service_role'
        or coalesce(custom.has_visibility((select auth.uid()), 'record', p_list_id, 'viewer'::public.permission_level), false)) is not true then
      raise exception 'viewer access required for this list' using errcode = '42501',
            detail = jsonb_build_object('list_id', p_list_id)::text;
    end if;
    return public._d31_impl_get_user_list_with_items(p_list_id);
  end if;
  if (
    auth.role() = 'service_role'
    or exists (
      select 1 from workbench.udt_structured_lists l
      where l.id = p_list_id
        -- lane OLDER-DOORS-AFTER-SWITCH: a list that moved with the switch still reads (marked moved).
        and (l.deleted_at is null or platform._older_list_moved_by_switch(l.id))
        and (l.is_public or l.public_read or l.user_id = (select auth.uid()))
    )
    or coalesce(iam.has_access('structured_list', p_list_id, 'viewer'::public.permission_level), false)
  ) is not true then
    raise exception 'viewer access required for this list' using errcode = '42501',
            detail = jsonb_build_object('list_id', p_list_id)::text;
  end if;
  return public._d31_impl_get_user_list_with_items(p_list_id);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_user_lists_summary(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_result jsonb;
begin
  if (auth.role() = 'service_role' or p_user_id = ( SELECT auth.uid())) is not true then
    raise exception 'access denied: caller is not the target user'
      using errcode = '42501';
  end if;

  -- lane LISTS-AFTER-SWITCH: the caller's lists wherever they live — the live older lists, and
  -- the store's Tables of choices (copied from an older list that moved with its organization's
  -- switch, or born in the store). A store copy whose older list is still live is the older
  -- list's copy, not a second list: it is listed once, as the older list.
  select jsonb_agg(x.doc order by x.created_at desc)
    into v_result
    from (
      select l.created_at,
             jsonb_build_object(
               'list_id', l.id,
               'list_name', l.list_name,
               'description', l.description,
               'created_at', l.created_at,
               'updated_at', l.updated_at,
               'lives_in', 'older',
               'item_count', (
                 select count(*)
                 from workbench.udt_structured_list_items i
                 where i.list_id = l.id
                   and i.deleted_at is null
               ),
               'group_count', (
                 select count(distinct i.group_name)
                 from workbench.udt_structured_list_items i
                 where i.list_id = l.id
                   and i.deleted_at is null
               )
             ) as doc
        from workbench.udt_structured_lists l
       where l.user_id = p_user_id
         and l.deleted_at is null
      union all
      select coalesce(o.created_at, t.created_at),
             jsonb_build_object(
               'list_id', t.id,
               'list_name', coalesce(nullif(t.data ->> 'name', ''), 'List'),
               'description', t.data ->> 'description',
               'created_at', coalesce(o.created_at, t.created_at),
               'updated_at', t.updated_at,
               'lives_in', 'record',
               'organization_id', t.organization_id,
               'item_count', c.n,
               'group_count', c.g
             )
        from custom.record t
        left join workbench.udt_structured_lists o on o.id = t.id
        cross join lateral (
          select count(*) as n, count(distinct nullif(r.data ->> 'group_name', '')) as g
            from custom.record r
           where r.organization_id = t.organization_id and r.table_id = t.id
             and r.data_class = 'record' and r.deleted_at is null) c
       where t.table_id = custom.table_kernel_id()
         and t.data_class = 'table'
         and t.deleted_at is null
         and t.created_by = p_user_id
         and platform._is_store_pick_list(t.metadata)
         and platform.list_lives_in(t.id) = 'record'
    ) x;

  return coalesce(v_result, '[]'::jsonb);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.update_user_list(p_list_id uuid, p_list_name character varying DEFAULT NULL::character varying, p_description text DEFAULT NULL::text, p_is_public boolean DEFAULT NULL::boolean, p_authenticated_read boolean DEFAULT NULL::boolean, p_public_read boolean DEFAULT NULL::boolean, p_items jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_org  uuid;
  v_item jsonb;
  v_rows jsonb[];
  v_old  uuid;
begin
  -- lane LISTS-AFTER-SWITCH: a list that lives in the store is written through the store's own
  -- doors in the caller's seat (rename / describe the Table; p_items replaces the choices: the
  -- current ones are archived — soft, restorable — and the new ones written).
  if platform.list_lives_in(p_list_id) = 'record' then
    select t.organization_id into v_org
      from custom.record t where t.id = p_list_id and t.data_class = 'table' and t.deleted_at is null limit 1;
    if v_org is null then
      raise exception 'there is no list with that id in the new system' using errcode = '02000',
            detail = jsonb_build_object('list_id', p_list_id)::text;
    end if;
    if (auth.role() = 'service_role'
        or coalesce(custom.has_visibility((select auth.uid()), 'record', p_list_id, 'editor'::public.permission_level), false)) is not true then
      raise exception 'owner access required for this list' using errcode = '42501',
            detail = jsonb_build_object('list_id', p_list_id)::text;
    end if;
    if nullif(btrim(coalesce(p_list_name, '')), '') is not null or p_description is not null then
      perform custom.record_update(v_org, p_list_id, jsonb_strip_nulls(jsonb_build_object(
        'name', nullif(btrim(coalesce(p_list_name, '')), ''), 'description', p_description)));
    end if;
    if p_items is not null then
      for v_old in select c.id from custom.record c
                    where c.organization_id = v_org and c.table_id = p_list_id
                      and c.data_class = 'record' and c.deleted_at is null loop
        perform custom.record_delete(v_org, v_old);
      end loop;
      for v_item in select * from jsonb_array_elements(p_items) loop
        continue when coalesce(nullif(btrim(coalesce(v_item ->> 'Label', v_item ->> 'label')), ''), '') = '';
        v_rows := v_rows || jsonb_strip_nulls(jsonb_build_object(
          'name', coalesce(v_item ->> 'Label', v_item ->> 'label'),
          'description', coalesce(v_item ->> 'Description', v_item ->> 'description'),
          'help_text', coalesce(v_item ->> 'Help Text', v_item ->> 'help_text'),
          'group_name', coalesce(v_item ->> 'Group', v_item ->> 'group_name'),
          'icon', coalesce(v_item ->> 'icon_name', v_item ->> 'icon')));
      end loop;
      if coalesce(cardinality(v_rows), 0) > 0 then
        perform custom.record_write_many(v_org, p_list_id, v_rows);
      end if;
    end if;
    return platform._store_pick_list_document(p_list_id, null, 'detail') - 'items_grouped'
           || jsonb_build_object('items', coalesce((
                select jsonb_agg(jsonb_build_object(
                         'id', c.id, 'label', c.data ->> 'name', 'description', c.data ->> 'description',
                         'help_text', c.data ->> 'help_text', 'group_name', c.data ->> 'group_name') order by c.created_at, c.id)
                  from custom.record c
                 where c.organization_id = v_org and c.table_id = p_list_id
                   and c.data_class = 'record' and c.deleted_at is null), '[]'::jsonb));
  end if;

  if (
    auth.role() = 'service_role'
    or exists (
      select 1 from workbench.udt_structured_lists l
      where l.id = p_list_id and l.user_id = (select auth.uid())
    )
  ) is not true then
    raise exception 'owner access required for this list' using errcode = '42501',
            detail = jsonb_build_object('list_id', p_list_id)::text;
  end if;
  return public._d31_impl_update_user_list(
    p_list_id, p_list_name, p_description, p_is_public,
    p_authenticated_read, p_public_read, p_items
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION workbench.older_table_moved_to(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
begin
  -- (restored by the POST-MOVE-DOORS inverse as plpgsql: a LANGUAGE sql body naming workbench.udt_* cannot be
  -- created while those tables are in the graveyard; the statement is the original's, unchanged)
  return (select case
    -- The access decision comes first, so a foreign id and an invented one both answer null.
    when not ((select auth.role()) = 'service_role'
              or coalesce(iam.has_access('dataset', p_id, 'viewer'::public.permission_level), false)
              or coalesce(iam.has_access('structured_list', p_id, 'viewer'::public.permission_level), false)) then null
    when platform._older_table_moved_by_switch(p_id) then (
      select jsonb_build_object(
               'moved', true, 'kind', 'table', 'store', 'custom.record',
               'table_id', coalesce(d.metadata #>> '{moved_to,table_id}', p_id::text),
               'address', '/data/' || coalesce(d.metadata #>> '{moved_to,table_id}', p_id::text),
               'says', 'This table moved to the new system when its organization switched its Data tables. It is read-only here; its copy at /data/'
                       || coalesce(d.metadata #>> '{moved_to,table_id}', p_id::text)
                       || ' is the live table (same table, same address).')
        from workbench.udt_datasets d where d.id = p_id)
    when platform._older_list_moved_by_switch(p_id) then (
      select jsonb_build_object(
               'moved', true, 'kind', 'list', 'store', 'custom.record',
               'table_id', coalesce(l.metadata #>> '{moved_to,table_id}', p_id::text),
               'address', '/data/' || coalesce(l.metadata #>> '{moved_to,table_id}', p_id::text),
               'says', 'This list moved to the new system when its organization switched its Data tables. It is read-only here; its copy at /data/'
                       || coalesce(l.metadata #>> '{moved_to,table_id}', p_id::text)
                       || ' is the live list (same list, same id).')
        from workbench.udt_structured_lists l where l.id = p_id)
  end);
end;
$function$
;

CREATE OR REPLACE FUNCTION context.validate_reference_value(p_item_id uuid, p_value_text text)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_item context.context_items;
  v_envelope jsonb;
  v_type text;
  v_items jsonb;
  v_count int;
  v_scope_type_id uuid;
  v_scope_id uuid;
BEGIN
  SELECT * INTO v_item FROM context.context_items WHERE id = p_item_id;
  IF NOT FOUND THEN
    raise exception 'context item not found' using ERRCODE = '22023',
            detail = jsonb_build_object('item_id', p_item_id)::text;
  END IF;

  IF v_item.value_type <> 'reference' THEN
    RETURN;
  END IF;

  IF p_value_text IS NULL THEN
    RETURN;
  END IF;

  v_envelope := context.parse_reference_fence(p_value_text);
  IF v_envelope IS NULL THEN
    raise exception 'value is not a valid matrx reference fence for this item' using ERRCODE = '22023',
            detail = jsonb_build_object('item_id', p_item_id)::text;
  END IF;

  v_type := v_envelope->>'type';
  IF v_item.allowed_reference_types IS NULL
     OR NOT (v_type = ANY (v_item.allowed_reference_types)) THEN
    raise exception 'reference type % is not allowed on item (allowed: %)', v_type, v_item.allowed_reference_types using ERRCODE = '22023',
            detail = jsonb_build_object('item_id', p_item_id)::text;
  END IF;

  v_items := v_envelope->'items';
  v_count := COALESCE(jsonb_array_length(v_items), 0);
  IF v_count = 0 THEN
    raise exception 'reference fence for item has no items' using ERRCODE = '22023',
            detail = jsonb_build_object('item_id', p_item_id)::text;
  END IF;
  IF v_count > v_item.max_items THEN
    raise exception 'reference fence for item carries % items, max_items is %', v_count, v_item.max_items using ERRCODE = '22023',
            detail = jsonb_build_object('item_id', p_item_id)::text;
  END IF;

  IF v_type = 'scope' AND v_item.allowed_scope_type_ids IS NOT NULL
     AND cardinality(v_item.allowed_scope_type_ids) > 0 THEN
    FOR v_scope_id IN
      SELECT (elem->>'id')::uuid FROM jsonb_array_elements(v_items) elem
    LOOP
      SELECT scope_type_id INTO v_scope_type_id FROM context.scopes WHERE id = v_scope_id;
      IF v_scope_type_id IS NULL OR NOT (v_scope_type_id = ANY (v_item.allowed_scope_type_ids)) THEN
        raise exception 'scope is not of an allowed scope type for this item' using ERRCODE = '22023',
            detail = jsonb_build_object('scope_id', v_scope_id, 'item_id', p_item_id)::text;
      END IF;
    END LOOP;
  END IF;
END;
$function$;
