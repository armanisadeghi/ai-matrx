-- lane note: lane TEMPLATE-INSTALL-SLOW — REPLACES the bodies of custom.field_cycle and custom._context_side_effects (one comparison each: the record id compared as a uuid instead of a text cast of the column). Signatures, return types, volatility, SECURITY DEFINER, search_path and grants unchanged. Same answers, only faster. No trigger, table or policy is touched.
-- lane: TEMPLATE-INSTALL-SLOW
-- based-on: custom.field_cycle(uuid, jsonb, uuid) 58f669fba107eff9239155d90b26c79664f81dedd37c8eca1cb9d80e02016b2e
-- based-on: custom._context_side_effects(jsonb) 0990ae9e4256b69326269fb3f00d4092223c4bba5689f2d36e4f65fadfbf0a6f
-- lock: custom
--
-- TEMPLATE-INSTALL-SLOW (part b) — `t.id::text = <text>` cannot use the record's key, so every write of a Field
-- in a large organization read all its records: custom.field_cycle's first step (the table the written Field
-- belongs to) and custom._context_side_effects's field arm (is that table kept for context). In admin's Workspace
-- (26k records) 100 ms and 2 ms per call, in an empty organization 18 ms and 0.5 ms; an install makes ~220 calls.

set local statement_timeout = '60s';

CREATE OR REPLACE FUNCTION custom.field_cycle(p_organization_id uuid, p_field_data jsonb, p_self uuid)
 RETURNS text[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
  -- The shortest circle from this definition back to the column `p_self`, as the names a person
  -- knows ("Rooms › Working budget", "Quotes › Room's working budget", …), or NULL when there is
  -- none. It starts from the definition GIVEN (the one being written, before it is stored) and
  -- walks the stored columns it reads; live inputs only (a retired column is never worked out);
  -- 24 steps, and no column is walked twice.
  -- TEMPLATE-INSTALL-SLOW: `me` compares the id as a uuid (a text cast of the column read every record of the
  -- organization); a value that is not a uuid names no table, exactly as before.
  with recursive
  me as (
    select coalesce(nullif(t.data ->> 'name', ''), 'a table') || ' › ' ||
           coalesce(nullif(p_field_data ->> 'label', ''), p_field_data ->> 'key') as name
      from (select 1) one
      left join custom.record t
        on t.organization_id = p_organization_id
       and t.id = (case when (p_field_data ->> 'entity_definition_id') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then (p_field_data ->> 'entity_definition_id')::uuid end)),
  walk(id, path, names) as (
    select i.input_id, array[i.input_id],
           array[me.name, coalesce(nullif(t.data ->> 'name', ''), 'a table') || ' › ' || i.input_label]
      from me
      cross join lateral custom.field_inputs_of(p_organization_id, p_field_data) i
      left join custom.record t on t.organization_id = p_organization_id and t.id = i.input_table
     where not i.retired
    union all
    select j.input_id, w.path || j.input_id,
           w.names || (coalesce(nullif(t.data ->> 'name', ''), 'a table') || ' › ' || j.input_label)
      from walk w
      join custom.record f
        on f.organization_id = p_organization_id
       and f.id = w.id
       and f.table_id = custom.field_kernel_id()
       and f.deleted_at is null
      cross join lateral custom.field_inputs_of(p_organization_id, f.data) j
      left join custom.record t on t.organization_id = p_organization_id and t.id = j.input_table
     where w.id <> p_self
       and cardinality(w.path) < 24
       and not j.retired
       and not (j.input_id = any (w.path)))
  select w.names from walk w
   where w.id = p_self
   order by cardinality(w.path)
   limit 1;
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
  v_held uuid;
begin
  -- WHICH EVENTS ARE ABOUT THE CONTEXT SYSTEM: a Record in a Table kept for context (a scope), a Table
  -- kept for context (a scope type), a Field of one (a context field). A Table record that is gone
  -- (purged) is carried too, so its search row can go; everything else is left alone at the cost of
  -- one primary-key read per event.
  -- LANE 9 W2-W: A STORE-FIRST SCOPE DOOR HOLDS ITS OWN ROW BACK. The door writes the store first and the old
  -- row second; the old row's own triggers (the sweep wake, the search sync, the dataset provisioning) must run
  -- first, as they did when the old row was the writer, so the door names its row here for its first store
  -- write and runs this twin for it itself once the old row is written (custom.context_scope_write,
  -- custom.context_type_write). Every other event, and every other row in the same statement, is unchanged.
  v_held := nullif(current_setting('custom.context_door_row', true), '')::uuid;
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
                                             and t.id = (case when (f.data ->> 'entity_definition_id') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then (f.data ->> 'entity_definition_id')::uuid end)   -- TEMPLATE-INSTALL-SLOW: uuid compare, not a text cast of the id
                                             and t.table_id = c_tk and t.data ->> 'kept_for' = 'context'
                        where f.organization_id = ev.org and f.id = ev.id)
             else
               exists (select 1 from custom.record t where t.organization_id = ev.org and t.id = ev.table_id
                         and t.table_id = c_tk and t.data ->> 'kept_for' = 'context')
           end
       and ev.id is distinct from v_held
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
        coalesce(nullif(btrim(r.data ->> 'label_plural'), ''), nullif(btrim(r.data ->> 'label_singular'), ''), nullif(btrim(replace(r.data ->> 'slug', '_', '-')), ''), 'Untitled scope type' || coalesce(' ' || to_char(r.created_at, 'YYYY-MM-DD'), '')),
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
      -- Where a Field says it is bound to a table template: its own document (lane
      -- SCOPES-STORE-HOMES' home), or what the copy carried before that home existed.
      v_rs := coalesce(r.data -> 'reference_source', r.metadata #> '{moved_from,carried,reference_source}');
      if v_rs ->> 'container_type' = 'table_template' then
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
                    and coalesce(f.data -> 'reference_source', f.metadata #> '{moved_from,carried,reference_source}') ->> 'container_type' = 'table_template'
        loop
          perform custom.scope_table_provision(r.organization_id, x.id, r.id, null);
        end loop;
      end if;
    end if;
  end loop;
end
$function$;
