-- target: branch
--
-- THE INVERSE of `migrations/campaign/workdoors_the_work_layer_gets_its_doors.sql`
-- (§4.13, rule 27). It puts the work layer back exactly where lane ORG-DELETE's converter
-- found it: nineteen SECURITY INVOKER functions with no EXECUTE grant for `authenticated`
-- and no row in `platform.client_callable_door` — REC-69, REC-70 and REC-71 unreachable
-- from a browser.
--
-- IT IS `-- target: branch` ON PURPOSE, like every other inverse in this directory: an
-- inverse REVOKEs and DROPs, and rule 9 forbids both on production in any lane.
--
-- ORDER: the door rows and the grants first (so nothing is reachable while the bodies are
-- being swapped), then the bodies, restored BYTE FOR BYTE from the live catalogue as it
-- stood on 2026-09-20 before this lane's first statement.
--
-- IT DELETES NO ROWS of anybody's data. Templates, holds, assignments and approvals are
-- written by CALLERS of these verbs.

set lock_timeout = '2s';
set statement_timeout = '600s';

delete from platform.client_callable_door
 where schema_name = 'custom'
   and declared_by like '%workdoors_the_work_layer_gets_its_doors.sql%';

revoke execute on function custom.work_states() from authenticated;
revoke execute on function custom.work_relation_kinds() from authenticated;
revoke execute on function custom.work_take_assignment(uuid, uuid) from authenticated;
revoke execute on function custom.work_has_assignment(uuid, uuid) from authenticated;
revoke execute on function custom.work_whose_turn(uuid, uuid, boolean) from authenticated;
revoke execute on function custom.work_transition_refusal(uuid, uuid, uuid) from authenticated;
revoke execute on function custom.work_template_declare(uuid, text, jsonb) from authenticated;
revoke execute on function custom.work_template_instantiate(uuid, uuid, jsonb) from authenticated;
revoke execute on function custom.work_template_shape(uuid, uuid) from authenticated;
revoke execute on function custom.work_instantiation_shape(uuid, uuid) from authenticated;
revoke execute on function custom.work_slots_declare(uuid, text, text, uuid) from authenticated;
revoke execute on function custom.work_slot_expire(uuid, uuid) from authenticated;
revoke execute on function custom.work_slot_hold(uuid, uuid, text, text, interval) from authenticated;
revoke execute on function custom.work_slot_release(uuid, uuid) from authenticated;
revoke execute on function custom.work_slot_holds(uuid, uuid) from authenticated;

drop function if exists custom.work_templates(uuid, integer);

-- ── the bodies, exactly as they stood before this lane ───────────────────────────────────
CREATE OR REPLACE FUNCTION custom.work_take_assignment(p_organization_id uuid, p_table_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_table    custom.record;
  v_slug     text;
  v_states   uuid;
  v_names    jsonb;
  v_missing  text[] := '{}';
  v_field    record;
  v_state    record;
  v_id       uuid;
  v_fields   jsonb := '[]'::jsonb;
  v_n_states integer := 0;
  v_n_fields integer := 0;
  v_t0       timestamptz := clock_timestamp();
begin
  perform custom.assert_store_door(p_organization_id, 'custom.work_take_assignment');

  select r.* into v_table
    from custom.record r
   where r.organization_id = p_organization_id
     and r.id = p_table_id
     and r.table_id = custom.table_kernel_id()
     and r.deleted_at is null;
  if v_table.id is null then
    raise exception 'that table is not in this organization'
      using errcode = '23503',
            hint = 'REC-69: the assignment fields are taken BY a Table, and the Table is named by its record id.';
  end if;
  if coalesce(v_table.data ->> 'type', '') = 'detail' then
    raise exception 'a detail table cannot take the assignment fields'
      using errcode = '23514',
            hint = 'REC-11 / REC-69: a detail table''s records inherit only. Whose turn it is belongs to the entity the detail hangs off.';
  end if;

  if custom.work_has_assignment(p_organization_id, p_table_id) then
    return jsonb_build_object(
      'table_id', p_table_id, 'taken', false,
      'reason', 'this table already holds the assignment fields',
      'fields', 3, 'states_created', 0, 'fields_created', 0,
      'ms', round(extract(epoch from (clock_timestamp() - v_t0)) * 1000, 1));
  end if;

  -- The workflow-state Table. Homed on the Table it serves, so it travels with it.
  v_slug := left(coalesce(v_table.data ->> 'slug', 'table'), 40) || '_work_state';
  select r.id into v_states
    from custom.record r
   where r.organization_id = p_organization_id
     and r.table_id = custom.table_kernel_id()
     and r.data ->> 'slug' = v_slug
     and r.deleted_at is null
   limit 1;

  if v_states is null then
    insert into custom.record (organization_id, table_id, data_class, data)
    values (p_organization_id, custom.table_kernel_id(), 'table', jsonb_build_object(
      'name',           coalesce(v_table.data ->> 'name', 'Table') || ' — workflow state',
      'slug',           v_slug,
      'type',           'entity',
      'label_singular', 'State',
      'label_plural',   'States',
      'title_field',    'name',
      'display',        'list',
      'weight',         'light',
      'ordered',        true,
      'row_order',      'sorted',
      'default_sort',   jsonb_build_array(jsonb_build_object('field', 'sort', 'direction', 'asc')),
      'agent_writable', false,
      'retention_days', 365,
      'work_kind',      'state',
      'fields', jsonb_build_array(jsonb_build_object('name', 'name'),
                                  jsonb_build_object('name', 'sort'),
                                  jsonb_build_object('name', 'terminal'),
                                  jsonb_build_object('name', 'next')),
      'parent_id',      p_table_id::text))
    returning id into v_states;

    for v_state in select * from custom.work_states() order by sort loop
      insert into custom.record (organization_id, table_id, data_class, data)
      values (p_organization_id, v_states, 'record',
              jsonb_build_object('name', v_state.name, 'sort', v_state.sort,
                                 'terminal', v_state.terminal,
                                 'next', to_jsonb(v_state.next)));
      v_n_states := v_n_states + 1;
    end loop;
  end if;

  -- REC-1 / FLD-8, both ways: the Table declares the field names, the definitions define them.
  v_names := coalesce(v_table.data -> 'fields', '[]'::jsonb);
  for v_field in select * from custom.work_assignment_fields(v_states) loop
    if not exists (select 1 from jsonb_array_elements(v_names) f where f ->> 'name' = v_field.key) then
      v_names := v_names || jsonb_build_array(jsonb_build_object('name', v_field.key));
      v_missing := v_missing || v_field.key;
    end if;
  end loop;
  if array_length(v_missing, 1) is not null then
    update custom.record r
       set data = r.data || jsonb_build_object('fields', v_names)
     where r.organization_id = p_organization_id and r.id = p_table_id;
  end if;

  for v_field in select * from custom.work_assignment_fields(v_states) loop
    if exists (select 1 from custom.record f
                where f.organization_id = p_organization_id
                  and f.table_id = custom.field_kernel_id()
                  and f.deleted_at is null
                  and nullif(f.data ->> 'entity_definition_id', '')::uuid = p_table_id
                  and f.data ->> 'key' = v_field.key) then
      continue;
    end if;
    insert into custom.record (organization_id, table_id, data_class, data)
    values (p_organization_id, custom.field_kernel_id(), 'field',
            v_field.spec || jsonb_build_object('entity_definition_id', p_table_id::text))
    returning id into v_id;
    v_fields := v_fields || jsonb_build_array(jsonb_build_object('key', v_field.key, 'id', v_id));
    v_n_fields := v_n_fields + 1;
  end loop;

  return jsonb_build_object(
    'table_id',        p_table_id,
    'taken',           true,
    'state_table_id',  v_states,
    'states_created',  v_n_states,
    'fields_created',  v_n_fields,
    'fields',          v_fields,
    'declared_on_table', to_jsonb(v_missing),
    'ms', round(extract(epoch from (clock_timestamp() - v_t0)) * 1000, 1));
end
$function$
;

CREATE OR REPLACE FUNCTION custom.work_whose_turn(p_organization_id uuid, p_table_id uuid, p_include_finished boolean DEFAULT false)
 RETURNS TABLE(record_id uuid, title text, assignee_id uuid, turn text, due_on timestamp with time zone, state text, status text, terminal boolean)
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
  select r.id,
         r.data ->> coalesce((select t.data ->> 'title_field'
                                from custom.record t
                               where t.organization_id = p_organization_id
                                 and t.id = p_table_id), 'name'),
         nullif(r.data ->> 'assignee', '')::uuid,
         case when coalesce((s.data ->> 'terminal')::boolean, false) then 'nobody'
              when p.id is null then 'unassigned'
              else coalesce(nullif(p.data ->> 'name', ''), p.id::text) end,
         nullif(r.data ->> 'due_date', '')::timestamptz,
         case when coalesce((s.data ->> 'terminal')::boolean, false) then 'finished'
              when nullif(r.data ->> 'due_date', '') is null                       then 'undated'
              when (r.data ->> 'due_date')::timestamptz <  date_trunc('day', now()) then 'overdue'
              when (r.data ->> 'due_date')::timestamptz <  date_trunc('day', now()) + interval '1 day'
                                                                                   then 'due_today'
              else 'scheduled' end,
         s.data ->> 'name',
         coalesce((s.data ->> 'terminal')::boolean, false)
    from custom.record r
    left join custom.record p
      on p.organization_id = r.organization_id
     and p.id = nullif(r.data ->> 'assignee', '')::uuid
     and p.table_id = custom.person_kernel_id()
     and p.deleted_at is null
    left join custom.record s
      on s.organization_id = r.organization_id
     and s.id = nullif(r.data ->> 'status', '')::uuid
     and s.deleted_at is null
   where r.organization_id = p_organization_id
     and r.table_id = p_table_id
     and r.deleted_at is null
     and (p_include_finished or not coalesce((s.data ->> 'terminal')::boolean, false))
   order by case when coalesce((s.data ->> 'terminal')::boolean, false) then 2
                 when nullif(r.data ->> 'due_date', '') is null then 1 else 0 end,
            nullif(r.data ->> 'due_date', '')::timestamptz nulls last,
            r.created_at;
$function$
;

CREATE OR REPLACE FUNCTION custom.work_has_assignment(p_organization_id uuid, p_table_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
  select (select count(distinct f.data ->> 'key')
            from custom.record f
           where f.organization_id = p_organization_id
             and f.table_id = custom.field_kernel_id()
             and f.deleted_at is null
             and nullif(f.data ->> 'entity_definition_id', '')::uuid = p_table_id
             and (f.data ->> 'key') in ('assignee', 'due_date', 'status')) = 3;
$function$
;

CREATE OR REPLACE FUNCTION custom.work_transition_refusal(p_organization_id uuid, p_from_state_id uuid, p_to_state_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_from custom.record;
  v_to   custom.record;
begin
  if p_from_state_id is null or p_to_state_id is null or p_from_state_id = p_to_state_id then
    return null;
  end if;
  select * into v_from from custom.record r
   where r.organization_id = p_organization_id and r.id = p_from_state_id and r.deleted_at is null;
  select * into v_to   from custom.record r
   where r.organization_id = p_organization_id and r.id = p_to_state_id   and r.deleted_at is null;
  if v_from.id is null or v_to.id is null then
    return null;                      -- `custom.validate_values` already refuses a non-option.
  end if;
  if jsonb_typeof(v_from.data -> 'next') is distinct from 'array' then
    return null;                      -- this state declares no model, so it forbids nothing.
  end if;
  if (v_from.data -> 'next') ? (v_to.data ->> 'name') then
    return null;
  end if;
  return format('%s cannot go straight to %s. From %s it can go to %s.',
                v_from.data ->> 'name', v_to.data ->> 'name', v_from.data ->> 'name',
                coalesce(nullif((select string_agg(x #>> '{}', ' or ' order by x #>> '{}')
                                   from jsonb_array_elements(v_from.data -> 'next') x), ''),
                         'nowhere - it is finished'));
end
$function$
;

CREATE OR REPLACE FUNCTION custom.work_template_declare(p_organization_id uuid, p_name text, p_graph jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_id uuid;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.work_template_declare');
  if p_organization_id is null then
    raise exception 'custom.work_template_declare: organization_id is required - the store is keyed (organization_id, id)'
      using errcode = '22004';
  end if;
  insert into custom.record (organization_id, table_id, data_class, data)
  values (p_organization_id, null, 'work_template',
          jsonb_build_object('name', coalesce(nullif(btrim(p_name), ''), 'Template'),
                             'graph', coalesce(p_graph, '{}'::jsonb)))
  returning id into v_id;
  return v_id;
end
$function$
;

CREATE OR REPLACE FUNCTION custom.work_template_instantiate(p_organization_id uuid, p_template_id uuid, p_overrides jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_tpl     custom.record;
  v_graph   jsonb;
  v_why     text;
  v_node    jsonb;
  v_rel     jsonb;
  v_map     jsonb := '{}'::jsonb;
  v_ids     uuid[] := '{}';
  v_redges  uuid[] := '{}';
  v_id      uuid;
  v_data    jsonb;
  v_log     uuid;
  v_t0      timestamptz := clock_timestamp();
begin
  perform custom.assert_store_door(p_organization_id, 'custom.work_template_instantiate');

  select r.* into v_tpl
    from custom.record r
   where r.organization_id = p_organization_id
     and r.id = p_template_id
     and r.data_class = 'work_template'
     and r.deleted_at is null;
  if v_tpl.id is null then
    raise exception 'that template is not in this organization'
      using errcode = '23503', hint = 'REC-70: a Template is a Record of this store.';
  end if;

  v_graph := v_tpl.data -> 'graph';
  v_why := custom.work_template_refusal(v_graph);
  if v_why is not null then
    raise exception '%', v_why
      using errcode = '23514',
            hint = 'REC-70: the whole graph is created in one act, so it is judged before any of it is written.';
  end if;

  -- 1. The records. Every one through the store's own guards; the first refusal ends the
  --    statement and nothing survives it.
  for v_node in select e from jsonb_array_elements(v_graph -> 'nodes') e loop
    v_data := coalesce(v_node -> 'data', '{}'::jsonb)
              || coalesce(p_overrides -> (v_node ->> 'ref'), '{}'::jsonb);
    insert into custom.record (organization_id, table_id, data_class, data)
    values (p_organization_id, (v_node ->> 'table')::uuid, 'record', v_data)
    returning id into v_id;
    v_map := v_map || jsonb_build_object(v_node ->> 'ref', v_id);
    v_ids := v_ids || v_id;
  end loop;

  -- 2. The relations, through the ONE verb the store already offers for owned/contained
  --    records. W1-REL is not built and this does not build it.
  for v_rel in select e from jsonb_array_elements(coalesce(v_graph -> 'relations', '[]'::jsonb)) e loop
    v_redges := v_redges || custom.relation_own(p_organization_id,
                                                (v_map ->> (v_rel ->> 'from'))::uuid,
                                                (v_map ->> (v_rel ->> 'to'))::uuid);
  end loop;

  -- 3. The log. A STAND-IN for W3-HIST and it says so in its own row.
  insert into custom.record (organization_id, table_id, data_class, data)
  values (p_organization_id, null, 'work_instantiation', jsonb_build_object(
    'template_id',  p_template_id,
    'template',     v_tpl.data ->> 'name',
    'at',           to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'actor',        custom.caller_role(),
    'records',      to_jsonb(v_ids),
    'relations',    to_jsonb(v_redges),
    'record_count', cardinality(v_ids),
    'relation_count', cardinality(v_redges),
    'stand_in_for', 'W3-HIST (HIS-*): until the history store lands, this row IS the log of the act.'))
  returning id into v_log;

  return jsonb_build_object(
    'template_id',      p_template_id,
    'instantiation_id', v_log,
    'records_created',  cardinality(v_ids),
    'relations_created', cardinality(v_redges),
    'relation_kind',    'owned',
    'refs',             v_map,
    'records',          to_jsonb(v_ids),
    'relations',        to_jsonb(v_redges),
    'ms', round(extract(epoch from (clock_timestamp() - v_t0)) * 1000, 1));
end
$function$
;

CREATE OR REPLACE FUNCTION custom.work_template_shape(p_organization_id uuid, p_template_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
  with g as (select r.data -> 'graph' as graph from custom.record r
              where r.organization_id = p_organization_id and r.id = p_template_id
                and r.data_class = 'work_template'),
  n as (select e ->> 'ref' as ref, (e ->> 'table')::uuid as tbl
          from g, jsonb_array_elements(g.graph -> 'nodes') e),
  e as (select (select tbl from n where n.ref = r ->> 'from') as src,
               (select tbl from n where n.ref = r ->> 'to')   as dst,
               coalesce(r ->> 'kind', 'owned') as kind
          from g, jsonb_array_elements(coalesce(g.graph -> 'relations', '[]'::jsonb)) r)
  select jsonb_build_object(
    'tables', coalesce((select jsonb_agg(x order by x ->> 'table')
                          from (select jsonb_build_object('table', tbl::text, 'records', count(*)) x
                                  from n group by tbl) t), '[]'::jsonb),
    'edges',  coalesce((select jsonb_agg(x order by x ->> 'from', x ->> 'to')
                          from (select jsonb_build_object('from', src::text, 'to', dst::text,
                                                          'kind', kind, 'n', count(*)) x
                                  from e group by src, dst, kind) t), '[]'::jsonb));
$function$
;

CREATE OR REPLACE FUNCTION custom.work_instantiation_shape(p_organization_id uuid, p_instantiation_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
  with l as (select r.data as d from custom.record r
              where r.organization_id = p_organization_id and r.id = p_instantiation_id
                and r.data_class = 'work_instantiation'),
  n as (select rec.id, rec.table_id as tbl
          from l, jsonb_array_elements_text(l.d -> 'records') x
          join custom.record rec
            on rec.organization_id = p_organization_id and rec.id = x::uuid),
  e as (select (select tbl from n where n.id = (er.data ->> 'from')::uuid) as src,
               (select tbl from n where n.id = (er.data ->> 'to')::uuid)   as dst,
               er.data ->> 'kind' as kind
          from l, jsonb_array_elements_text(l.d -> 'relations') y
          join custom.record er
            on er.organization_id = p_organization_id and er.id = y::uuid)
  select jsonb_build_object(
    'tables', coalesce((select jsonb_agg(x order by x ->> 'table')
                          from (select jsonb_build_object('table', tbl::text, 'records', count(*)) x
                                  from n group by tbl) t), '[]'::jsonb),
    'edges',  coalesce((select jsonb_agg(x order by x ->> 'from', x ->> 'to')
                          from (select jsonb_build_object('from', src::text, 'to', dst::text,
                                                          'kind', kind, 'n', count(*)) x
                                  from e group by src, dst, kind) t), '[]'::jsonb));
$function$
;

CREATE OR REPLACE FUNCTION custom.work_slots_declare(p_organization_id uuid, p_name text, p_slug text, p_home_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_on    boolean;
  v_table uuid;
  v_field uuid;
  v_home  uuid := coalesce(p_home_id, custom.table_kernel_id());
  v_promo jsonb;
  v_t0    timestamptz := clock_timestamp();
begin
  perform custom.assert_store_door(p_organization_id, 'custom.work_slots_declare');

  -- B1: THE ORGANIZATION'S OWN SYSTEM SWITCH, not a second knob nobody turns on.
  -- custom.store_is_open resolves custom/system_enabled at the organization rung and, like
  -- every other reader of it, treats a switch it cannot READ as closed rather than open.
  v_on := custom.store_is_open(p_organization_id);
  if not v_on then
    raise exception 'slots cannot be declared here yet: the database cannot be asked to decide a double-booking'
      using errcode = '0A000',
            hint = 'REC-71 / REC-N-12: a slot is kept single by a UNIQUE index on its key, and this organization''s record store is switched off (custom/system_enabled), so no index can be built. Nothing was created. Turn the store on for this organization on the switch screen and declare the slots again.';
  end if;

  if p_slug is null or p_slug !~ '^[a-z][a-z0-9_]*$' then
    raise exception 'a slot table needs a slug made of lower-case letters, digits and underscores, and this one says %',
                    coalesce(p_slug, 'nothing')
      using errcode = '23514', hint = 'REC-66: slug.';
  end if;

  insert into custom.record (organization_id, table_id, data_class, data)
  values (p_organization_id, custom.table_kernel_id(), 'table', jsonb_build_object(
    'name',           coalesce(nullif(btrim(p_name), ''), 'Slots'),
    'slug',           p_slug,
    'type',           'entity',
    'label_singular', 'Hold',
    'label_plural',   'Holds',
    'title_field',    'slot_key',
    'display',        'page',
    'weight',         'light',
    'ordered',        false,
    'row_order',      'sorted',
    'default_sort',   jsonb_build_array(jsonb_build_object('field', 'expires_at', 'direction', 'asc')),
    'agent_writable', false,
    'retention_days', 365,
    'work_kind',      'slot',
    'fields', jsonb_build_array(jsonb_build_object('name', 'slot_key'),
                                jsonb_build_object('name', 'holder'),
                                jsonb_build_object('name', 'expires_at')),
    'parent_id',      v_home::text))
  returning id into v_table;

  insert into custom.record (organization_id, table_id, data_class, data)
  values (p_organization_id, custom.field_kernel_id(), 'field', jsonb_build_object(
    'key', 'slot_key', 'label', 'Slot', 'sort', 10, 'type', 'text',
    'multi', false, 'dated', false, 'required', true, 'source', 'manual',
    'config', '{}'::jsonb, 'rules', '[]'::jsonb, 'depends_on', '[]'::jsonb,
    'source_config', '{}'::jsonb, 'sensitivity', 'internal',
    'context_policy', 'include', 'applies_to_types', '[]'::jsonb,
    'promoted', true, 'unique', true, 'entity_definition_id', v_table::text))
  returning id into v_field;

  insert into custom.record (organization_id, table_id, data_class, data)
  values (p_organization_id, custom.field_kernel_id(), 'field', jsonb_build_object(
    'key', 'holder', 'label', 'Held by', 'sort', 20, 'type', 'text',
    'multi', false, 'dated', false, 'required', true, 'source', 'manual',
    'config', '{}'::jsonb, 'rules', '[]'::jsonb, 'depends_on', '[]'::jsonb,
    'source_config', '{}'::jsonb, 'sensitivity', 'internal',
    'context_policy', 'include', 'applies_to_types', '[]'::jsonb,
    'promoted', false, 'entity_definition_id', v_table::text));

  insert into custom.record (organization_id, table_id, data_class, data)
  values (p_organization_id, custom.field_kernel_id(), 'field', jsonb_build_object(
    'key', 'expires_at', 'label', 'Held until', 'sort', 30, 'type', 'range',
    'parity_type', 'datetime', 'config', jsonb_build_object('kind', 'datetime'),
    'multi', false, 'dated', false, 'required', true, 'source', 'manual',
    'rules', '[]'::jsonb, 'depends_on', '[]'::jsonb,
    'source_config', '{}'::jsonb, 'sensitivity', 'internal',
    'context_policy', 'include', 'applies_to_types', '[]'::jsonb,
    'promoted', false, 'entity_definition_id', v_table::text));

  -- REC-N-12's index, built by W1-INDEX's own verb. `promote_field` cannot be called from
  -- inside a query that is itself scanning `custom.record` (measured by W1-INDEX), which is
  -- why the Field's id came back from its own INSERT above rather than from a sub-select.
  v_promo := custom.promote_field(p_organization_id, v_table, v_field);

  return jsonb_build_object(
    'table_id',      v_table,
    'slot_field_id', v_field,
    'index_name',    v_promo ->> 'index_name',
    'unique',        (v_promo ->> 'unique')::boolean,
    'fields_created', 3,
    'records_created', 0,
    'ms', round(extract(epoch from (clock_timestamp() - v_t0)) * 1000, 1));
end
$function$
;

CREATE OR REPLACE FUNCTION custom.work_slot_expire(p_organization_id uuid, p_table_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare v_n integer;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.work_slot_expire');
  update custom.record r
     set deleted_at = now()
   where r.organization_id = p_organization_id
     and r.table_id = p_table_id
     and r.deleted_at is null
     and nullif(r.data ->> 'expires_at', '') is not null
     and (r.data ->> 'expires_at')::timestamptz <= now();
  get diagnostics v_n = row_count;
  return v_n;
end
$function$
;

CREATE OR REPLACE FUNCTION custom.work_slot_hold(p_organization_id uuid, p_table_id uuid, p_slot_key text, p_holder text, p_ttl interval DEFAULT '00:15:00'::interval)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_id      uuid;
  v_expired integer;
  v_until   timestamptz := now() + coalesce(p_ttl, interval '15 minutes');
  v_con     text;
  v_t0      timestamptz := clock_timestamp();
begin
  perform custom.assert_store_door(p_organization_id, 'custom.work_slot_hold');
  if coalesce(p_ttl, interval '15 minutes') <= interval '0' then
    raise exception 'a hold that has already expired is not a hold'
      using errcode = '22023', hint = 'REC-71: a slot hold is a reservation WITH an expiry, and the expiry is in the future.';
  end if;

  v_expired := custom.work_slot_expire(p_organization_id, p_table_id);

  begin
    insert into custom.record (organization_id, table_id, data_class, data)
    values (p_organization_id, p_table_id, 'record', jsonb_build_object(
      'slot_key',   p_slot_key,
      'holder',     p_holder,
      'expires_at', to_char(v_until at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')))
    returning id into v_id;
  exception when unique_violation then
    -- THE DATABASE DECIDED IT, AND WHAT IT DECIDED WITH IS QUOTED BACK. The name comes from
    -- Postgres's own diagnostics, never from a string this function built, so a hold refused
    -- by anything other than REC-N-12's index cannot wear its name.
    get stacked diagnostics v_con = constraint_name;
    raise exception 'the slot % is already held, and the database refused this hold by %',
                    p_slot_key, coalesce(v_con, 'a constraint it did not name')
      using errcode = '23505',
            hint = 'REC-71 / REC-N-12: one hold per slot is a UNIQUE index, not a check the application makes. Wait for the hold to expire or be released, then take it again.';
  end;

  return jsonb_build_object(
    'hold_id',      v_id,
    'slot_key',     p_slot_key,
    'holder',       p_holder,
    'expires_at',   v_until,
    'expired_swept', v_expired,
    'kept_single_by', custom.work_slot_index_name(p_table_id),
    'ms', round(extract(epoch from (clock_timestamp() - v_t0)) * 1000, 1));
end
$function$
;

CREATE OR REPLACE FUNCTION custom.work_slot_release(p_organization_id uuid, p_hold_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare v_n integer;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.work_slot_release');
  update custom.record r
     set deleted_at = now()
   where r.organization_id = p_organization_id
     and r.id = p_hold_id
     and r.deleted_at is null;
  get diagnostics v_n = row_count;
  return v_n = 1;
end
$function$
;

CREATE OR REPLACE FUNCTION custom.work_slot_holds(p_organization_id uuid, p_table_id uuid)
 RETURNS TABLE(hold_id uuid, slot_key text, holder text, expires_at timestamp with time zone, expired boolean)
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
  select r.id, r.data ->> 'slot_key', r.data ->> 'holder',
         nullif(r.data ->> 'expires_at', '')::timestamptz,
         coalesce((r.data ->> 'expires_at')::timestamptz <= now(), false)
    from custom.record r
   where r.organization_id = p_organization_id
     and r.table_id = p_table_id
     and r.deleted_at is null
   order by r.data ->> 'slot_key';
$function$
;

