-- chair-step: lane POST-MOVE-DOORS (2026-10-01), after step two — the last older doors that still named the moved
-- tables answer from the record store. Found after the move (v6 CENSUS-CLEANUP gaps 1 and 2, widened to the class by
-- a catalog census: every client-callable, non-trigger function outside the graveyard whose code names one of the six
-- moved tables and is not a file-c refusal). Each one below would answer a caller "relation workbench.udt_… does not
-- exist" (42P01), a developer sentence:
--   · context.provision_scope_dataset inserted a dataset into workbench.udt_datasets. Its one caller is
--     context.provision_scope_datasets_trigger, which still took that path for an organization with no Home in the
--     store (1,580 of 1,669 on production). Re-pointed: it answers through the store's own door
--     custom.scope_table_provision (a scope's table is a store Table born through custom.table_declare), and the
--     trigger always provisions in the store. custom.scope_table_provision no longer refuses an organization with no
--     Home ("until then its scopes keep their older tables" — there are no older tables now): the Table gets its own
--     Home, as custom._options_table_for gives a choice list one (REC-1). And
--     context.validate_reference_value accepted only the item's own noun: the store writes a scope's table with the
--     `table` noun, so an item that allows `dataset` (2 of the 5 template-bound items) refused it ("reference type
--     table is not allowed on item"); after the switch a dataset IS a Table, so either noun satisfies either.
--   · get_structured_list_for_selection, get_user_list_with_items (+ its impl), update_user_list: live doors (named by
--     the web app) whose store branch answers every non-null id since file b; their older branch, still reachable
--     with a null id, read the moved tables. It goes: a null id is no list.
--   · get_user_lists_summary unioned the moved lists with the store's (an error on every call); it lists the store's.
--   · workbench.older_table_moved_to read the moved tables and has no caller left: it answers file c's moved sentence.
-- Not here, owned elsewhere and in the guard's baseline: platform.final_switch_press / final_switch_undo (they refuse
-- before reaching the tables: already_there / undo_retired; FINAL-SWITCH, after the soak).
-- PRECONDITION: the six tables are in the graveyard. Locks: pg_proc row locks; no relation lock.
-- based-on: context.provision_scope_dataset(uuid, uuid) d7e6723be7bb9d8d6d853b991abc44694af13f305c42b00bd81bc099c71f9a69
-- based-on: context.provision_scope_datasets_trigger() fc58d50d4439b895293d781c0792f3b4cf06d5da18a3aeaa9d5334da538168c2
-- based-on: context.validate_reference_value(uuid, text) 3ea1a566cdb87cc2e43a61df6c136a5daf4ad82d89801163b8dd21a41d311c8e
-- based-on: custom.scope_table_provision(uuid, uuid, uuid, uuid) 0d7d32d3fb741fc21f55fa3eb85f7919ae795077f6f33e4d9d3ea10fe1989b7d
-- based-on: public.get_structured_list_for_selection(uuid) b92dde7acd310c74b8d9b318040bf07f1079f379c5340a7e6e98bd269fd6c707
-- based-on: public.get_user_list_with_items(uuid) 581884feed7afdfdeebac461e66a0d5f5a98412eb80639655a42a574ee2ca963
-- based-on: public._d31_impl_get_user_list_with_items(uuid) f69fb4b47d929654eebbcefae3dfad5490d982285bc50ce30f77bcc39a32f8cb
-- based-on: public.get_user_lists_summary(uuid) 993911bdeae59d9f34b198f8850f3bc84a856bf0eca4b2e4ee28d279596df159
-- based-on: public.update_user_list(uuid, character varying, text, boolean, boolean, boolean, jsonb) b0c43aad6d5e810376b4fd0b93e5275b92c7afb40f4c1c3b885748ee19340647
-- based-on: workbench.older_table_moved_to(uuid) e62a81f87e8697327a997fe89f5978b891c9ffd6a92719e95e8d7a8415a0c167
-- lane: POST-MOVE-DOORS
-- INVERSE: migrations/inverse/postmovedoors_a_the_last_older_doors_answer_from_the_store_down.sql

do $pre$
begin
  if to_regclass('workbench.udt_datasets') is not null or to_regclass('workbench.udt_structured_lists') is not null then
    raise exception 'refused: the older tables are still in workbench; these bodies are for after step two''s move.';
  end if;
end
$pre$;

CREATE OR REPLACE FUNCTION context.provision_scope_dataset(p_item_id uuid, p_scope_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_item context.context_items; v_scope context.scopes;
begin
  select * into v_item from context.context_items where id=p_item_id and is_active and deleted_at is null;
  select * into v_scope from context.scopes where id=p_scope_id and deleted_at is null;
  -- ARGS-RULED (2026-09-21). THE CALLER, BEFORE ANYTHING IS MADE IN SOMEBODY ELSE'S TENANT.
  if v_scope.id is not null
     and not iam.is_trusted_backend()
     and not iam.has_org_access(v_scope.organization_id) then
    raise exception 'You are not a member of the organization that scope belongs to, so nothing was provisioned.'
      using errcode = '42501',
            hint = 'A context scope belongs to one organization, and provisioning its template-backed table writes a dataset, its fields and a context value into that organization. Switch to the organization the scope lives in, or ask an owner of it to add you.';
  end if;
  if v_item.id is null or v_scope.id is null or v_item.scope_type_id <> v_scope.scope_type_id then return null; end if;
  if v_item.reference_source->>'container_type' is distinct from 'dataset_template' then return null; end if;
  -- POST-MOVE-DOORS: the older dataset store is in the graveyard. A scope's table is a Table in the record store,
  -- made (or found: a pre-move instance answers with its moved Table) by the store's own door.
  return custom.scope_table_provision(v_scope.organization_id, p_item_id, p_scope_id);
end; $function$;

CREATE OR REPLACE FUNCTION context.provision_scope_datasets_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r record; v_org uuid; v_home uuid;
begin
  -- An item carries no organization of its own; its scope type does (a scope's is the same).
  select st.organization_id into v_org from context.scope_types st where st.id = new.scope_type_id;
  -- POST-MOVE-DOORS: every organization provisions in the record store (the older store is in the graveyard);
  -- an organization with no Home yet gets one for the Table (custom.scope_table_provision).
  v_home := custom.organization_home_id(v_org);
  if tg_table_name='scopes' then
    for r in select id from context.context_items
      where scope_type_id=new.scope_type_id and is_active and deleted_at is null
        and reference_source->>'container_type'='dataset_template'
    loop
      perform custom.scope_table_provision(v_org, r.id, new.id, v_home);
    end loop;
  else
    if new.is_active and new.deleted_at is null and new.reference_source->>'container_type'='dataset_template' then
      for r in select id from context.scopes
        where scope_type_id=new.scope_type_id and deleted_at is null
      loop
        perform custom.scope_table_provision(v_org, new.id, r.id, v_home);
      end loop;
    end if;
  end if;
  return new;
end; $function$;

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
  -- POST-MOVE-DOORS: after the final switch a dataset IS a Table in the record store, and a scope's provisioned
  -- table is written with the `table` noun; an item that allows the one allows the other.
  IF v_item.allowed_reference_types IS NULL
     OR NOT (v_type = ANY (v_item.allowed_reference_types)
             OR (v_type IN ('table', 'dataset')
                 AND v_item.allowed_reference_types && ARRAY['table', 'dataset']::text[])) THEN
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

CREATE OR REPLACE FUNCTION public.get_structured_list_for_selection(p_list_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
    -- POST-MOVE-DOORS: every list lives in the store (the older lists are in the graveyard); the store's ladder is
    -- the gate (null for a viewer who may not see it). A null id is no list.
    if p_list_id is null then
      return null;
    end if;
    return platform._store_pick_list_document(
      p_list_id, case when auth.role() = 'service_role' then null else (select auth.uid()) end, 'selection');
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_user_list_with_items(p_list_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  -- POST-MOVE-DOORS: every list lives in the store (same id, same shape, lives_in = record); the store's own
  -- ladder decides who may read it. The older lists are in the graveyard.
  if p_list_id is null
     or (auth.role() = 'service_role'
         or coalesce(custom.has_visibility((select auth.uid()), 'record', p_list_id, 'viewer'::public.permission_level), false)) is not true then
    raise exception 'viewer access required for this list' using errcode = '42501',
          detail = jsonb_build_object('list_id', p_list_id)::text;
  end if;
  return public._d31_impl_get_user_list_with_items(p_list_id);
end;
$function$;

CREATE OR REPLACE FUNCTION public._d31_impl_get_user_list_with_items(p_list_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
    -- POST-MOVE-DOORS: every list lives in the store; it answers from there. A null id is no list.
    if p_list_id is null then
      return null;
    end if;
    return platform._store_pick_list_document(
      p_list_id, case when auth.role() = 'service_role' then null else (select auth.uid()) end, 'detail');
end;
$function$;

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

  -- POST-MOVE-DOORS: the caller's lists are the store's Tables of choices (copied from an older list at the
  -- final switch, or born in the store). The older lists are in the graveyard.
  select jsonb_agg(x.doc order by x.created_at desc)
    into v_result
    from (
      select t.created_at,
             jsonb_build_object(
               'list_id', t.id,
               'list_name', coalesce(nullif(t.data ->> 'name', ''), 'List'),
               'description', t.data ->> 'description',
               'created_at', t.created_at,
               'updated_at', t.updated_at,
               'lives_in', 'record',
               'organization_id', t.organization_id,
               'item_count', c.n,
               'group_count', c.g
             ) as doc
        from custom.record t
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
    ) x;

  return coalesce(v_result, '[]'::jsonb);
end;
$function$;

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

  -- POST-MOVE-DOORS: there is no older list any more (the older lists are in the graveyard); a list
  -- with no id is no list.
  raise exception 'there is no list with that id in the new system' using errcode = '02000',
        detail = jsonb_build_object('list_id', p_list_id)::text;
end;
$function$;


CREATE OR REPLACE FUNCTION workbench.older_table_moved_to(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
begin
  -- POST-MOVE-DOORS: an older-table door. Its tables are in the graveyard and nothing calls it any more (its two
  -- callers, the older branches of the list doors above, are gone); it answers that, by name, like file c's doors.
  raise exception 'The older tables moved to the archive after the final switch. Tables and lists live in the new system now: open them from /data.'
    using errcode = 'P0001', hint = 'older_table_moved_to was a door to the older tables (workbench.udt_*), retired after step two of the final switch.';
end;
$function$;
