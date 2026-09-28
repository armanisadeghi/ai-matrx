-- chair-step: lane SCOPES-SIDE-EFFECTS (SCOPES-CUTOVER-PLAN step 0.3). Three jobs the old scope tables' triggers do for everyone else — the platform search index rows for scopes and scope types, the suggestion-sweep wake for a new scope / scope type / context field, and a scope's own dataset table provisioned from its type's dataset-template field — now also follow the record store's own change feed: one statement-level consumer of custom.io_outbox 'records.changed' events (custom._context_side_effects_from_record_events, trigger zz_ctx_side_effects_s_i on custom.io_outbox, never a trigger on custom.record), filtered to Tables kept_for = context and their Fields and Records. Every effect is idempotent with its old trigger (the same search row by (id, token); a sweep enqueued at most once per entity, as the old INSERT-only triggers did; a scope's dataset table found by its binding), so both run side by side until the image stops and nothing doubles. custom.scope_table_provision reads a scope or field the image no longer holds from the store and writes its pointer through the store half. Writes no scope data at apply.
-- based-on: custom.scope_table_provision(uuid, uuid, uuid, uuid) f5825ad935ac78c58113f3736a09515746cff87729a6e656ce40defa2033f92f
-- lane: SCOPES-SIDE-EFFECTS
-- INVERSE: migrations/inverse/scopessidefx_the_context_side_effects_follow_the_store_down.sql
-- window-class: one new function, one replaced function body, one new statement trigger on custom.io_outbox (SHARE ROW EXCLUSIVE for the create only, lock_timeout 3s). Applied directly (owner, 2026-09-24).
--
-- THE USE CASE. Brightwater Software Studio makes a client project, "Harbor Freight Portal Rebuild".
-- Today the old context tables' triggers put it into the platform search, wake the suggestion sweep
-- and give it its own "Known defects" table from the platform template. The day only the record store
-- is written (SCOPES-CUTOVER-PLAN 4.3.3) those triggers stop firing, and none of it would happen —
-- silently. Now the store's own change feed does each of them, for every writer: the scope doors, the
-- mover, the follow, a template, Copy again.
--
-- Census of all 66 triggers on context.* and the ruling on each: matrx-frontend
-- scripts/cutover-census/scopes-side-effects.census.json (guard scripts/cutover-census/scopes-side-effects.ts).
-- Proof: scripts/campaign-tests/scopessidefx_the_side_effects_hold_with_the_image_off_red_green.sql.

-- ── THE CONSUMER ─────────────────────────────────────────────────────────────────────────────────
create or replace function custom._context_side_effects_from_record_events()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'pg_catalog'
as $function$
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
      from (select n.organization_id as org, n.record_id as id, n.table_id, n.operation
              from new_rows n
             where n.event_key = 'records.changed' and n.table_id is not null) ev
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
  return null;
end
$function$;

comment on function custom._context_side_effects_from_record_events() is
  'Lane SCOPES-SIDE-EFFECTS: the old scope tables'' side effects (search index rows for scopes and scope types, the suggestion-sweep wake, a scope''s dataset table) done from the record store''s own change feed (custom.io_outbox records.changed), for Tables kept_for = context. Idempotent with the old triggers while both run. Census: matrx-frontend scripts/cutover-census/scopes-side-effects.census.json.';

revoke all on function custom._context_side_effects_from_record_events() from public, anon, authenticated;

-- ── A SCOPE'S DATASET TABLE, WITH THE IMAGE OFF ──────────────────────────────────────────────────
-- Unchanged while the old tables hold the scope and the field. When either is only in the store,
-- the scope is its Record, the field its Field, and the table's pointer is written through the
-- store half (custom._ctx_store_value) instead of the old value writer.
create or replace function custom.scope_table_provision(p_organization_id uuid, p_item_id uuid, p_scope_id uuid, p_home_id uuid DEFAULT NULL::uuid)
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
$function$;

-- ── THE CONSUMER LISTENS ON THE STORE'S OWN CHANGE FEED ─────────────────────────────────────────
-- A statement trigger on custom.io_outbox beside the existing consumers (_record_events_to_activity,
-- io_outbox_broadcast_stmt), never on custom.record. The create takes SHARE ROW EXCLUSIVE on
-- custom.io_outbox for an instant; it waits at most 3s and the file refuses rather than queue writes.
set local lock_timeout = '3s';
create trigger zz_ctx_side_effects_s_i
  after insert on custom.io_outbox
  referencing new table as new_rows
  for each statement execute function custom._context_side_effects_from_record_events();
