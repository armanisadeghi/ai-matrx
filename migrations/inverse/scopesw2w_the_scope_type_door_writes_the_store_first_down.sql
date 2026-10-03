-- chair-step: the inverse of scopesw2w_the_scope_type_door_writes_the_store_first.sql — restores the bodies of custom.context_type_write and custom._context_side_effects as they stood on production and the clone 2026-10-03 04:20Z, in which the door decides and writes through public.create_scope_type / public.update_scope_type and the store follows.
-- lane: SCOPES-ON-THE-STORE
-- based-on: custom.context_type_write(uuid, uuid, jsonb) d8738e5cf3ea0d35d63312cb698279904d0c225324ee68cde3a9a4856ba4dc61
-- based-on: custom._context_side_effects(jsonb) 1ce88feb98f19316d34ed85ba2284ad507fa7b49040b0d70365f9b37d2a749c8
-- lock: custom

CREATE OR REPLACE FUNCTION custom.context_type_write(p_organization_id uuid, p_type_id uuid, p_spec jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_row jsonb;
  v_org uuid := p_organization_id;
  s jsonb := coalesce(p_spec, '{}'::jsonb);
  v_parent uuid;
begin
  if p_type_id is null then
    if v_org is null then
      raise exception 'A new scope type needs the organization it belongs to.' using errcode = '22004';
    end if;
    perform custom.assert_client_may_reach(v_org, 'custom.context_type_write');
    v_row := public.create_scope_type(
      v_org, s ->> 'label_singular', s ->> 'label_plural', nullif(s ->> 'parent_type_id', '')::uuid,
      coalesce(s ->> 'icon', 'folder'), coalesce(s ->> 'description', ''),
      coalesce((s ->> 'sort_order')::smallint, 0::smallint), (s ->> 'max_assignments')::smallint,
      coalesce(array(select jsonb_array_elements_text(s -> 'default_variable_keys')), '{}'::text[]),
      s ->> 'color', nullif(s ->> 'slug', ''));
  elsif s ? 'parent_type_id' or (s ? 'max_assignments' and jsonb_typeof(s -> 'max_assignments') = 'null') then
    -- A PARENT MOVED OR A LIMIT CLEARED (lane SCOPES-OLD-WRITERS): what the agents' structure tool
    -- could always do and public.update_scope_type cannot (it COALESCEs every column and has no
    -- parent). One row write, under update_scope_type's own check, in its own sentences.
    select t.organization_id into v_org from context.scope_types t where t.id = p_type_id and t.deleted_at is null;
    if v_org is null then
      perform platform.refuse_not_found(format('active scope type %s not found', p_type_id));
    end if;
    if (auth.role() = 'service_role' or public.is_platform_admin() or iam.has_org_access(v_org)) is not true then
      raise exception 'not authorized for this organization' using errcode = '42501',
              detail = jsonb_build_object('org_id', v_org)::text;
    end if;
    perform custom.assert_client_may_reach(v_org, 'custom.context_type_write');
    v_parent := nullif(s ->> 'parent_type_id', '')::uuid;
    if s ? 'parent_type_id' and v_parent is not null and (
         v_parent = p_type_id
         or not exists (select 1 from context.scope_types st
                         where st.id = v_parent and st.organization_id = v_org and st.deleted_at is null)
         or exists (with recursive under as (
                      select st.id from context.scope_types st where st.parent_type_id = p_type_id
                      union
                      select st.id from context.scope_types st join under u on st.parent_type_id = u.id)
                    select 1 from under where under.id = v_parent)) then
      raise exception 'That parent is not a scope type of this organization this type can sit under.'
        using errcode = '22023',
              hint = 'A scope type''s parent is another live scope type of the same organization, and never the type itself or one of its own children.';
    end if;
    update context.scope_types t
       set parent_type_id = case when s ? 'parent_type_id' then v_parent else t.parent_type_id end,
           label_singular = coalesce(s ->> 'label_singular', t.label_singular),
           label_plural = coalesce(s ->> 'label_plural', t.label_plural),
           icon = coalesce(s ->> 'icon', t.icon),
           description = coalesce(s ->> 'description', t.description),
           sort_order = coalesce((s ->> 'sort_order')::smallint, t.sort_order),
           max_assignments_per_entity = case when s ? 'max_assignments' then (s ->> 'max_assignments')::smallint
                                             else t.max_assignments_per_entity end,
           color = coalesce(s ->> 'color', t.color),
           slug = coalesce(nullif(s ->> 'slug', ''), t.slug),
           updated_at = now()
     where t.id = p_type_id
    returning to_jsonb(t.*) into v_row;
  else
    v_row := public.update_scope_type(
      p_type_id, s ->> 'label_singular', s ->> 'label_plural', s ->> 'icon', s ->> 'description',
      (s ->> 'sort_order')::smallint, (s ->> 'max_assignments')::smallint, s ->> 'color', nullif(s ->> 'slug', ''));
    v_org := (v_row ->> 'organization_id')::uuid;
    perform custom.assert_client_may_reach(v_org, 'custom.context_type_write');
  end if;
  return custom._ctx_answer(coalesce(v_org, (v_row ->> 'organization_id')::uuid), (v_row ->> 'id')::uuid, v_row);
end;
$function$;

CREATE OR REPLACE FUNCTION custom._context_side_effects(p_events jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  c_tk constant uuid := '11111111-0000-4000-8000-000000000001';   -- custom.table_kernel_id()
  c_fk constant uuid := '11111111-0000-4000-8000-000000000002';   -- custom.field_kernel_id()
  e      record;
  r      custom.record;
  x      record;
  v_type uuid;
  v_key  text;
  v_rs   jsonb;
begin
  -- WHICH EVENTS ARE ABOUT THE CONTEXT SYSTEM: a Record in a Table kept for context (a scope), a Table
  -- kept for context (a scope type), a Field of one (a context field). A Table record that is gone
  -- (purged) is carried too, so its search row can go; everything else is left alone at the cost of
  -- one primary-key read per event.
  for e in
    select ev.org, ev.id, ev.table_id, bool_or(ev.operation = 'created') as created
      from (select (je ->> 0)::uuid as org, (je ->> 1)::uuid as id, (je ->> 2)::uuid as table_id, je ->> 3 as operation
              from jsonb_array_elements(coalesce(p_events, '[]'::jsonb)) je) ev
     where case
             when ev.table_id = c_tk then
               not exists (select 1 from custom.record t where t.organization_id = ev.org and t.id = ev.id)
               or exists (select 1 from custom.record t where t.organization_id = ev.org and t.id = ev.id
                            and t.data ->> 'kept_for' = 'context')
             when ev.table_id = c_fk then
               exists (select 1 from custom.record f
                         join custom.record t on t.organization_id = f.organization_id
                                             and t.id::text = f.data ->> 'entity_definition_id'
                                             and t.table_id = c_tk and t.data ->> 'kept_for' = 'context'
                        where f.organization_id = ev.org and f.id = ev.id)
             else
               exists (select 1 from custom.record t where t.organization_id = ev.org and t.id = ev.table_id
                         and t.table_id = c_tk and t.data ->> 'kept_for' = 'context')
           end
     group by 1, 2, 3
  loop
    select * into r from custom.record where organization_id = e.org and id = e.id;

    if e.table_id = c_tk then
      -- ── A SCOPE TYPE (twin of platform._search_item_sync_scope_type, public._notify_suggestion_sweep_scope_type)
      if r.id is null or r.deleted_at is not null then
        perform platform._search_item_drop('scope_type', e.id);
        continue;
      end if;
      -- The old title is the type's slug in the old grammar (hyphens); the store keeps it with
      -- underscores (measured 2026-09-28: 83 of 83 equal once read back).
      perform platform._search_item_put('scope_type', r.id, r.organization_id, r.created_by, null::platform.visibility,
        coalesce(nullif(btrim(replace(r.data ->> 'slug', '_', '-')), ''), 'Untitled scope type' || coalesce(' ' || to_char(r.created_at, 'YYYY-MM-DD'), '')),
        left(coalesce(nullif(r.data ->> 'description', ''), r.metadata #>> '{moved_from,carried,description}'), 140),
        '{}'::text[], r.updated_at, null::text, null::text);
      if e.created then
        insert into rag.kg_sweep_queue (change_type, entity_id, scope_type_id, organization_id, created_by)
        select 'scope_type', r.id, r.id, r.organization_id, null
         where not exists (select 1 from rag.kg_sweep_queue q where q.change_type = 'scope_type' and q.entity_id = r.id);
        if found then
          perform pg_notify('suggestion_sweep', json_build_object('change_type', 'scope_type', 'entity_id', r.id::text,
            'scope_type_id', r.id::text, 'organization_id', r.organization_id::text, 'created_by', null)::text);
        end if;
      end if;

    elsif e.table_id = c_fk then
      -- ── A CONTEXT FIELD (twin of public._notify_suggestion_sweep_context_item and the item half of
      --    context.provision_scope_datasets_trigger). An inactive or archived field wakes nothing.
      continue when r.id is null or r.deleted_at is not null
                 or not coalesce((r.metadata #>> '{moved_from,carried,is_active}')::boolean, true);
      v_type := (r.data ->> 'entity_definition_id')::uuid;
      if e.created then
        insert into rag.kg_sweep_queue (change_type, entity_id, scope_type_id, organization_id, created_by)
        select 'context_item', r.id, v_type, r.organization_id, r.created_by
         where not exists (select 1 from rag.kg_sweep_queue q where q.change_type = 'context_item' and q.entity_id = r.id);
        if found then
          perform pg_notify('suggestion_sweep', json_build_object('change_type', 'context_item', 'entity_id', r.id::text,
            'scope_type_id', v_type::text, 'organization_id', r.organization_id::text, 'created_by', r.created_by::text)::text);
        end if;
      end if;
      -- Where a Field says it is bound to a dataset template: its own document (lane
      -- SCOPES-STORE-HOMES' home), or what the copy carried before that home existed.
      v_rs := coalesce(r.data -> 'reference_source', r.metadata #> '{moved_from,carried,reference_source}');
      if v_rs ->> 'container_type' = 'dataset_template' then
        for x in select s.id from custom.record s
                  where s.organization_id = r.organization_id and s.table_id = v_type
                    and s.data_class = 'record' and s.deleted_at is null
        loop
          perform custom.scope_table_provision(r.organization_id, r.id, x.id, null);
        end loop;
      end if;

    else
      -- ── A SCOPE (twin of platform._search_item_sync_scope, public._notify_suggestion_sweep_scope
      --    and the scope half of context.provision_scope_datasets_trigger)
      if r.id is null or r.deleted_at is not null then
        perform platform._search_item_drop('scope', e.id);
        continue;
      end if;
      select f.data ->> 'key' into v_key from custom.record f
       where f.organization_id = r.organization_id and f.id = custom._ctx_id('scope-column-field', r.table_id::text, 'description');
      perform platform._search_item_put('scope', r.id, r.organization_id, r.created_by, r.visibility,
        coalesce(nullif(btrim(r.data ->> 'name'), ''), 'Untitled scope' || coalesce(' ' || to_char(r.created_at, 'YYYY-MM-DD'), '')),
        left(r.data ->> coalesce(v_key, 'description'), 140),
        '{}'::text[], r.updated_at, null::text, null::text);
      if e.created then
        insert into rag.kg_sweep_queue (change_type, entity_id, scope_type_id, organization_id, created_by)
        select 'scope', r.id, r.table_id, r.organization_id, r.created_by
         where not exists (select 1 from rag.kg_sweep_queue q where q.change_type = 'scope' and q.entity_id = r.id);
        if found then
          perform pg_notify('suggestion_sweep', json_build_object('change_type', 'scope', 'entity_id', r.id::text,
            'scope_type_id', r.table_id::text, 'organization_id', r.organization_id::text, 'created_by', r.created_by::text)::text);
        end if;
        for x in select f.id from custom.record f
                  where f.organization_id = r.organization_id and f.table_id = c_fk and f.deleted_at is null
                    and f.data ->> 'entity_definition_id' = r.table_id::text
                    and coalesce((f.metadata #>> '{moved_from,carried,is_active}')::boolean, true)
                    and coalesce(f.data -> 'reference_source', f.metadata #> '{moved_from,carried,reference_source}') ->> 'container_type' = 'dataset_template'
        loop
          perform custom.scope_table_provision(r.organization_id, x.id, r.id, null);
        end loop;
      end if;
    end if;
  end loop;
end
$function$;
