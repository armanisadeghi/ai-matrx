-- chair-step: the inverse of scopesw2w_the_scope_type_door_writes_the_store_first.sql — restores the bodies of custom.context_type_write, custom._context_side_effects and context._follow_to_the_copy as they stood on production and the clone 2026-10-03 04:20Z, in which the door decides and writes through public.create_scope_type / public.update_scope_type and the store follows.
-- lane: SCOPES-ON-THE-STORE
-- based-on: custom.context_type_write(uuid, uuid, jsonb) 10c89f96b1637a73cff45ef02597bd24c53abbae4b25531c56b92ea9d9f43476
-- based-on: custom._context_side_effects(jsonb) 1ce88feb98f19316d34ed85ba2284ad507fa7b49040b0d70365f9b37d2a749c8
-- based-on: context._follow_to_the_copy() bb5196fdee4e612502ee30ad7777f6a71ff1f04173de2f8b4b111aa7663de592
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

CREATE OR REPLACE FUNCTION context._follow_to_the_copy()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_row  jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_id   uuid  := (v_row ->> 'id')::uuid;
  v_org  uuid;
  v_type uuid;
  v_on   boolean;
begin
  -- WHICH ORGANIZATION AND WHICH SCOPE TYPE (the copy's Table) this row belongs to.
  if tg_table_name = 'scope_types' then
    v_org  := (v_row ->> 'organization_id')::uuid;
    v_type := v_id;
  elsif tg_table_name = 'scopes' then
    v_org  := (v_row ->> 'organization_id')::uuid;
    v_type := (v_row ->> 'scope_type_id')::uuid;
  elsif tg_table_name = 'context_items' then
    v_type := (v_row ->> 'scope_type_id')::uuid;
    select t.organization_id into v_org from context.scope_types t where t.id = v_type;
  elsif tg_table_name = 'context_item_values' then
    select s.organization_id, s.scope_type_id into v_org, v_type
      from context.scopes s where s.id = (v_row ->> 'scope_id')::uuid;
  end if;
  if v_org is null then
    return null;
  end if;

  -- SCOPES-WRITE-THROUGH: IN AN ORGANIZATION WHOSE STORE IS THE WRITER, the record store is written
  -- in this same statement and its rules govern — a store refusal refuses the write. OUTSIDE the
  -- exception handler below on purpose: swallowing a refusal here would commit the old row and leave
  -- the store behind, silently. A scope door has already written the store for its own rows (marked).
  if custom.context_writer(v_org) = 'store' then
    if not custom._ctx_marked() then
      perform custom._ctx_bridge(tg_table_name, tg_op, v_row, v_org, v_type);
    end if;
    return null;
  end if;

  begin
    v_on := coalesce((platform.knob_resolve('custom', 'context_copy_following', v_org) #>> '{}')::boolean, true);
    if not v_on then
      return null;
    end if;

    insert into custom.io_outbox (event_key, record_id, table_id, operation, dedupe_key, organization_id, actor)
    values ('context.follow', v_id, v_type,
            case tg_op when 'INSERT' then 'created' when 'DELETE' then 'deleted' else 'updated' end,
            'context.follow:' || tg_table_name || ':' || v_id::text,
            v_org,
            jsonb_build_object('declared', 'context.' || tg_table_name, 'user_id', auth.uid()))
    on conflict (organization_id, dedupe_key) where deleted_at is null
    do update set consumed_at = null,
                  consumer    = null,
                  operation   = excluded.operation,
                  actor       = excluded.actor;
    -- RE-ARMED FOR EVERY CONSUMER (CHAIR-RECORD-CHANGED): once each consumer keeps its own
    -- consumption, a re-armed row is news again only when those rows go too.
    if custom.io_outbox_per_consumer() then
      perform custom.io_outbox_rearm(v_org, 'context.follow:' || tg_table_name || ':' || v_id::text);
    end if;
    -- A RE-ARMED ROW IS NEWS TOO. custom.io_outbox_announce fires on INSERT only, so the second
    -- edit of the same old row (an update of the outbox row) would wake nobody; say it here, in the
    -- announce's own shape (a pointer, never the row). The follow debounces, so a duplicate on the
    -- first insert costs nothing.
    perform pg_notify('records_changed',
                      jsonb_build_object('organization_id', v_org, 'record_id', v_id, 'table_id', v_type,
                                         'operation', 'updated', 'event_key', 'context.follow')::text);
  exception when others then
    -- NEVER FAIL THE OLD SIDE'S EDIT, NEVER FAIL IN SILENCE. The current screens are the writer;
    -- an edit there must land whether or not the copy could be told. The miss is recorded with its
    -- remedy, and the next change to the same organization (or any follow drain run for it)
    -- re-plans the whole organization, so nothing is lost for good.
    begin
      perform ops.record_system_error(jsonb_build_object(
      'kind', 'context_follow_enqueue_failure',
      'organization_id', v_org,
      'source_app', 'database',
      'source_feature', 'context-follow',
      'route', 'context._follow_to_the_copy',
      'error_type', sqlstate,
      'error_text', sqlerrm,
      'context', jsonb_build_object('table', 'context.' || tg_table_name, 'row_id', v_id, 'operation', tg_op,
                                 'remedy', 'run the follow for this organization: python -m matrx_records.movers.runner --follow-context --organization <id> --apply --i-know-this-writes')));
    exception when others then
      raise warning 'context._follow_to_the_copy: could not tell the copy about %.% (%), and could not record it: %',
        'context', tg_table_name, v_id, sqlerrm;
    end;
  end;
  return null;
end;
$function$;
