-- chair-step: it GRANTS EXECUTE to `authenticated` on sixteen functions of schema `custom`. A
--   GRANT is the one shape this runner's allow-list refuses by name, and correctly so — a grant
--   is how the store gets wider. It is deliberate here and it is the whole point of the file.
--   Measured live on 2026-09-20: all nineteen `custom.work_*` functions were SECURITY INVOKER,
--   held no EXECUTE for `authenticated`, and carried zero rows in
--   `platform.client_callable_door`, so REC-69, REC-70 and REC-71 were unreachable from a
--   browser. Every function this file opens decides FIRST, on the one ladder: the organization
--   wall (`custom.assert_client_may_reach`), then the table (`custom.assert_may_know_table`) or
--   the row (`custom.assert_client_may_open` / `_may_change`). Nothing becomes visible to
--   anybody that `custom.has_visibility` did not already say they may see; nothing is dropped,
--   nothing is revoked, no row of any feature is deleted or rewritten; every write verb keeps
--   `custom.assert_store_door` as its first statement, so the OFF switch still closes it. The
--   inverse is `migrations/inverse/workdoors_the_work_layer_gets_its_doors_down.sql`.
-- guard: custom/system_enabled
-- based-on: custom.work_take_assignment(uuid, uuid) 60afc66d2c391030fd477183e8f270eead72ceffb5279b0f547fe40790b430af
-- based-on: custom.work_whose_turn(uuid, uuid, boolean) 163ac45ce5a63c9813cada13585c13f18978cd38ede1c31107cd2644fb34ddf5
-- based-on: custom.work_has_assignment(uuid, uuid) 53f09dcee3ae64da7883c2277fe7f9f2874f3ff2c2eb77349b884d6671bb51bd
-- based-on: custom.work_transition_refusal(uuid, uuid, uuid) 86c75cbc067d6afce4ae63e6575ac6ca2c05a82ece723653ea81c4798caef23f
-- based-on: custom.work_template_declare(uuid, text, jsonb) 06120b1cfc29b7853ec3dbbd9f52a1b49b8963ac8836e54e8ffe10211f9933ba
-- based-on: custom.work_template_instantiate(uuid, uuid, jsonb) 1553470e1fd8f513e149e204d00a013a7cc9d33b5ef5d9d61fa3fe4e1231cff9
-- based-on: custom.work_template_shape(uuid, uuid) 23aaa29b17981699780679aa6e2f57d42ce570a68d0c5ce7039c8ebd47cde9bb
-- based-on: custom.work_instantiation_shape(uuid, uuid) 7acedb6d609013758c38405f7681361e77f6d3964146a435eefd62212bebbea9
-- based-on: custom.work_slots_declare(uuid, text, text, uuid) 6ebafb0a8710b9ba24fa6417e20e8f7d17f094dee30f2881fa68013a7fc2aee9
-- based-on: custom.work_slot_expire(uuid, uuid) 5d67921176c55aef8c9f95e5405012f20e45df45af1ca86b13b98572352a2055
-- based-on: custom.work_slot_hold(uuid, uuid, text, text, interval) d000cc8bb64ea71a48560f5064bf8b7cfae4ccf62e71d1e8605610438599ea8c
-- based-on: custom.work_slot_release(uuid, uuid) ab3a27f35164e32241bec0acc9fad19753f89b82ebe5336e2e3a0a160801152a
-- based-on: custom.work_slot_holds(uuid, uuid) 1f05f8f45fa75807a5b92302b9ca8009466f48d570fdc9c8d77e573a5bda8a4e
--
-- WORK-DOORS — THE WORK LAYER GETS DOORS A SIGNED-IN PERSON CAN REACH.
--
-- WHAT THIS CLOSES, measured live on the main database 2026-09-20 (lane ORG-DELETE's
-- converter found it while turning `w3_work_c44.sql` onto the seat, and its own PART 0b
-- asserts the census so this goes red the day it regresses):
--
--     select p.proname, p.prosecdef, has_function_privilege('authenticated', p.oid, 'EXECUTE')
--       from pg_proc p where p.pronamespace = 'custom'::regnamespace and p.proname like 'work\_%';
--
--   19 rows. `prosecdef` FALSE on every one. `has_function_privilege` FALSE on every one.
--   Zero rows in `platform.client_callable_door`, not even a stated server-only reason.
--
-- So REC-69 (assignment and action state), REC-70 (template instantiation) and REC-71 (the
-- slot hold) existed in the store and NOBODY could reach them. That is the base of product
-- #6, Approvals & assignments, and the whole of product #13 and #14 — built, live, and with
-- no door on the building.
--
-- WHY A GRANT ALONE WOULD NOT HAVE DONE IT — this is acceptance test T9, and census 11 of
-- `pnpm check:store-doors-decide` is the guard that now states it as a rule: `authenticated`
-- holds NO table privilege in schema `custom`, so a SECURITY INVOKER body here can reach
-- nothing of the store at all. Granting EXECUTE on one would have produced
-- `permission denied for function assert_client_may_reach` to the owner of the record. Each
-- verb needs four things and this file gives all four: SECURITY DEFINER, a question on the
-- ONE ladder, the grant, and a row in `platform.client_callable_door`.
--
-- THE LADDER, rung by rung, and why each verb sits where it does:
--
--   * `custom.assert_store_door`        — the product OFF switch. Already in every write verb
--                                         below; kept as the FIRST statement in each one.
--   * `custom.assert_client_may_reach`  — the organization wall.
--   * `custom.assert_may_know_table`    — "you know a table if you may open it, or if anything
--                                         in it has been shared with you" (VIS-5 / T10). This is
--                                         the READ threshold for a whole table's work.
--   * `custom.assert_client_may_open`   — viewer on ONE row.
--   * `custom.assert_client_may_change` — editor (or admin) on ONE row.
--
-- WHAT DOES NOT GET A GRANT, and why that is the design rather than an omission:
-- `work_assignment_fields`, `work_template_refusal`, `work_slot_index_name`,
-- `work_has_assignment` and `custom._work_shape_guard` stay SECURITY INVOKER with no grant.
-- They are the store's internals, called from inside the doors below (where `current_user`
-- is already the definer), and census 11 is exactly the rule that keeps an internal from
-- quietly becoming a half-open door.
--
-- THE PREFIX THIS LANE RESERVES, declared before its first statement (BUILD-BOOK §4.5, rule 7):
-- `custom.work_*` (continuing W3-WORK's own, by agreement — this file only replaces bodies it
-- names and adds new verbs under the same prefix) and `zz_workdoors_*` for any trigger.
--
-- THE INVERSE: `migrations/inverse/workdoors_the_work_layer_gets_its_doors_down.sql`.

set lock_timeout = '5s';
set statement_timeout = '600s';

-- ════════════════════════════════════════════════════════════════════════════════════════
-- 1. REC-69 — ASSIGNMENT AND ACTION STATE, REACHABLE.
-- ════════════════════════════════════════════════════════════════════════════════════════

-- Taking the kernel assignment fields CHANGES THE SHAPE OF A TABLE, so it asks the rung a
-- shape change asks: `admin` on the Table record. Not "a member of the organization" — every
-- colleague would then be able to add three columns to the invoices table.
create or replace function custom.work_take_assignment(p_organization_id uuid, p_table_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $$
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
  perform custom.assert_client_may_change(p_organization_id, p_table_id,
                                          'custom.work_take_assignment',
                                          'admin'::public.permission_level, 'table');

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
      'state_table_id', (select r.id from custom.record r
                          where r.organization_id = p_organization_id
                            and r.table_id = custom.table_kernel_id()
                            and r.data ->> 'slug' = left(coalesce(v_table.data ->> 'slug', 'table'), 40) || '_work_state'
                            and r.deleted_at is null limit 1),
      'ms', round(extract(epoch from (clock_timestamp() - v_t0)) * 1000, 1));
  end if;

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
$$;

-- "WHOSE TURN IS IT" — one query, and now one query A PERSON MAY ASK. The table threshold is
-- VIS-5's (`assert_may_know_table`); every ROW it answers about is then filtered by the one
-- ladder, so a colleague reads the work she can see and nothing else. Answering the whole
-- table to anybody who knows the table would be the leak T10 names.
create or replace function custom.work_whose_turn(p_organization_id uuid, p_table_id uuid,
                                                  p_include_finished boolean default false)
returns table (record_id uuid, title text, assignee_id uuid, turn text,
               due_on timestamptz, state text, status text, terminal boolean)
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $$
declare
  v_me   uuid;
  v_pred text;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.work_whose_turn');
  perform custom.assert_may_know_table(p_organization_id, p_table_id, 'custom.work_whose_turn');
  v_me   := custom.query_principal();
  v_pred := custom.visible_predicate_sql(v_me, p_organization_id, p_table_id,
                                         'viewer'::public.permission_level, 'r');
  return query execute format($q$
    select r.id,
           r.data ->> coalesce((select t.data ->> 'title_field'
                                  from custom.record t
                                 where t.organization_id = %1$L::uuid
                                   and t.id = %2$L::uuid), 'name'),
           nullif(r.data ->> 'assignee', '')::uuid,
           case when coalesce((s.data ->> 'terminal')::boolean, false) then 'nobody'
                when p.id is null then 'unassigned'
                else coalesce(nullif(p.data ->> 'name', ''), p.id::text) end,
           nullif(r.data ->> 'due_date', '')::timestamptz,
           case when coalesce((s.data ->> 'terminal')::boolean, false) then 'finished'
                when nullif(r.data ->> 'due_date', '') is null                        then 'undated'
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
     where r.organization_id = %1$L::uuid
       and r.table_id = %2$L::uuid
       and r.deleted_at is null
       and (%4$L::boolean or not coalesce((s.data ->> 'terminal')::boolean, false))
       and (%3$s)
     order by case when coalesce((s.data ->> 'terminal')::boolean, false) then 2
                   when nullif(r.data ->> 'due_date', '') is null then 1 else 0 end,
              nullif(r.data ->> 'due_date', '')::timestamptz nulls last,
              r.created_at
  $q$, p_organization_id, p_table_id, v_pred, coalesce(p_include_finished, false));
end
$$;

-- Does this Table hold the assignment fields? A screen asks it to decide whether to offer
-- "turn on assignments" at all, so it is a door — at the table-reading threshold.
create or replace function custom.work_has_assignment(p_organization_id uuid, p_table_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $$
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.work_has_assignment');
  perform custom.assert_may_know_table(p_organization_id, p_table_id, 'custom.work_has_assignment');
  return (select count(distinct f.data ->> 'key')
            from custom.record f
           where f.organization_id = p_organization_id
             and f.table_id = custom.field_kernel_id()
             and f.deleted_at is null
             and nullif(f.data ->> 'entity_definition_id', '')::uuid = p_table_id
             and (f.data ->> 'key') in ('assignee', 'due_date', 'status')) = 3;
end
$$;

-- ASK BEFORE YOU WRITE. The screen offers the moves the model allows and greys nothing: it
-- reads the state records themselves. Both state ids must be rows this person may open,
-- because the refusal sentence quotes both names.
create or replace function custom.work_transition_refusal(p_organization_id uuid,
                                                          p_from_state_id uuid, p_to_state_id uuid)
returns text
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $$
declare
  v_from custom.record;
  v_to   custom.record;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.work_transition_refusal');
  if p_from_state_id is null or p_to_state_id is null or p_from_state_id = p_to_state_id then
    return null;
  end if;
  perform custom.assert_client_may_open(p_organization_id, p_from_state_id,
                                        'custom.work_transition_refusal',
                                        'viewer'::public.permission_level, 'state');
  perform custom.assert_client_may_open(p_organization_id, p_to_state_id,
                                        'custom.work_transition_refusal',
                                        'viewer'::public.permission_level, 'state');
  select * into v_from from custom.record r
   where r.organization_id = p_organization_id and r.id = p_from_state_id and r.deleted_at is null;
  select * into v_to   from custom.record r
   where r.organization_id = p_organization_id and r.id = p_to_state_id   and r.deleted_at is null;
  if v_from.id is null or v_to.id is null then
    return null;
  end if;
  if jsonb_typeof(v_from.data -> 'next') is distinct from 'array' then
    return null;
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
$$;

-- ════════════════════════════════════════════════════════════════════════════════════════
-- 2. REC-70 — THE TEMPLATE, REACHABLE.
-- ════════════════════════════════════════════════════════════════════════════════════════

create or replace function custom.work_template_declare(p_organization_id uuid, p_name text, p_graph jsonb)
returns uuid
language plpgsql
security definer
set search_path to 'pg_catalog'
as $$
declare
  v_id   uuid;
  v_node jsonb;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.work_template_declare');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.work_template_declare');
  if p_organization_id is null then
    raise exception 'custom.work_template_declare: organization_id is required - the store is keyed (organization_id, id)'
      using errcode = '22004';
  end if;

  -- A template NAMES the tables it will write into. Declaring one against a table this
  -- person cannot change would be a way to hand somebody else a change they never asked
  -- for, so every table in the graph is decided here, at the rung writing it takes.
  if jsonb_typeof(coalesce(p_graph, '{}'::jsonb) -> 'nodes') = 'array' then
    for v_node in select e from jsonb_array_elements(p_graph -> 'nodes') e loop
      if (v_node ->> 'table') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        perform custom.assert_client_may_change(p_organization_id, (v_node ->> 'table')::uuid,
                                                'custom.work_template_declare',
                                                'editor'::public.permission_level, 'table');
      end if;
    end loop;
  end if;

  insert into custom.record (organization_id, table_id, data_class, data)
  values (p_organization_id, null, 'work_template',
          jsonb_build_object('name', coalesce(nullif(btrim(p_name), ''), 'Template'),
                             'graph', coalesce(p_graph, '{}'::jsonb)))
  returning id into v_id;
  return v_id;
end
$$;

-- RUNNING A TEMPLATE WRITES REAL RECORDS INTO REAL TABLES. So it asks twice: viewer on the
-- template (you may run what you may see) and EDITOR ON EVERY TABLE THE GRAPH NAMES, up
-- front, before one row is written. Deciding table by table as the loop reached it would
-- have been a half-built graph — and this function deliberately catches nothing, so there is
-- no half of it to keep.
create or replace function custom.work_template_instantiate(p_organization_id uuid, p_template_id uuid,
                                                            p_overrides jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $$
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
  perform custom.assert_client_may_open(p_organization_id, p_template_id,
                                        'custom.work_template_instantiate',
                                        'viewer'::public.permission_level, 'template');

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

  for v_node in select e from jsonb_array_elements(v_graph -> 'nodes') e loop
    perform custom.assert_client_may_change(p_organization_id, (v_node ->> 'table')::uuid,
                                            'custom.work_template_instantiate',
                                            'editor'::public.permission_level, 'table');
  end loop;

  for v_node in select e from jsonb_array_elements(v_graph -> 'nodes') e loop
    v_data := coalesce(v_node -> 'data', '{}'::jsonb)
              || coalesce(p_overrides -> (v_node ->> 'ref'), '{}'::jsonb);
    insert into custom.record (organization_id, table_id, data_class, data)
    values (p_organization_id, (v_node ->> 'table')::uuid, 'record', v_data)
    returning id into v_id;
    v_map := v_map || jsonb_build_object(v_node ->> 'ref', v_id);
    v_ids := v_ids || v_id;
  end loop;

  for v_rel in select e from jsonb_array_elements(coalesce(v_graph -> 'relations', '[]'::jsonb)) e loop
    v_redges := v_redges || custom.relation_own(p_organization_id,
                                                (v_map ->> (v_rel ->> 'from'))::uuid,
                                                (v_map ->> (v_rel ->> 'to'))::uuid);
  end loop;

  insert into custom.record (organization_id, table_id, data_class, data)
  values (p_organization_id, null, 'work_instantiation', jsonb_build_object(
    'template_id',  p_template_id,
    'template',     v_tpl.data ->> 'name',
    'at',           to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'actor',        custom.caller_role(),
    'actor_user',   custom.query_principal(),
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
$$;

create or replace function custom.work_template_shape(p_organization_id uuid, p_template_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $$
begin
  perform custom.assert_client_may_open(p_organization_id, p_template_id,
                                        'custom.work_template_shape',
                                        'viewer'::public.permission_level, 'template');
  return (
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
                                    from e group by src, dst, kind) t), '[]'::jsonb)));
end
$$;

create or replace function custom.work_instantiation_shape(p_organization_id uuid, p_instantiation_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $$
begin
  perform custom.assert_client_may_open(p_organization_id, p_instantiation_id,
                                        'custom.work_instantiation_shape',
                                        'viewer'::public.permission_level, 'instantiation');
  return (
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
                                    from e group by src, dst, kind) t), '[]'::jsonb)));
end
$$;

-- RE-RUNNABLE ON PURPOSE. `work_templates` is a NEW function of this lane and nothing else
-- in the database references it, so the file drops its own before creating it — rule 27's
-- down-then-up has to be able to run these exact bytes twice.
drop function if exists custom.work_templates(uuid, integer);

-- THE LIST A PERSON PICKS FROM. Without it the template doors take an id nobody can obtain.
create function custom.work_templates(p_organization_id uuid, p_limit integer default 100)
returns table (template_id uuid, name text, nodes integer, relations integer, created_at timestamptz)
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $$
declare v_me uuid;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.work_templates');
  v_me := custom.query_principal();
  return query
    select r.id,
           r.data ->> 'name',
           coalesce(jsonb_array_length(r.data #> '{graph,nodes}'), 0),
           coalesce(jsonb_array_length(r.data #> '{graph,relations}'), 0),
           r.created_at
      from custom.record r
     where r.organization_id = p_organization_id
       and r.data_class = 'work_template'
       and r.deleted_at is null
       and (custom.query_is_store_owner()
            or v_me is null
            or custom.has_visibility(v_me, 'record', r.id, 'viewer'::public.permission_level))
     order by r.created_at desc
     limit greatest(1, least(coalesce(p_limit, 100), 500));
end
$$;

-- ════════════════════════════════════════════════════════════════════════════════════════
-- 3. REC-71 — THE SLOT HOLD, REACHABLE.
-- ════════════════════════════════════════════════════════════════════════════════════════

create or replace function custom.work_slots_declare(p_organization_id uuid, p_name text, p_slug text,
                                                     p_home_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $$
declare
  v_on    boolean;
  v_table uuid;
  v_field uuid;
  v_home  uuid := coalesce(p_home_id, custom.table_kernel_id());
  v_promo jsonb;
  v_t0    timestamptz := clock_timestamp();
begin
  perform custom.assert_store_door(p_organization_id, 'custom.work_slots_declare');
  -- Declaring a Table is the same act `custom.table_declare` performs, at the same rung.
  perform custom.assert_client_may_reach(p_organization_id, 'custom.work_slots_declare');
  if p_home_id is not null then
    perform custom.assert_client_may_change(p_organization_id, p_home_id,
                                            'custom.work_slots_declare',
                                            'editor'::public.permission_level, 'record');
  end if;

  begin
    v_on := coalesce((platform.knob_resolve('custom', 'field_index_guard', p_organization_id) #>> '{}')::boolean, false);
  exception when others then
    v_on := false;
  end;
  if not v_on then
    raise exception 'slots cannot be declared here yet: the database cannot be asked to decide a double-booking'
      using errcode = '0A000',
            hint = 'REC-71 / REC-N-12: a slot is kept single by a UNIQUE index on its key, and custom/field_index_guard resolves false for this organization, so no index can be built. Nothing was created. Turn the guard on (the switch checklist does it) and declare the slots again.';
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
$$;

create or replace function custom.work_slot_expire(p_organization_id uuid, p_table_id uuid)
returns integer
language plpgsql
security definer
set search_path to 'pg_catalog'
as $$
declare v_n integer;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.work_slot_expire');
  perform custom.assert_client_may_change(p_organization_id, p_table_id, 'custom.work_slot_expire',
                                          'editor'::public.permission_level, 'table');
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
$$;

create or replace function custom.work_slot_hold(p_organization_id uuid, p_table_id uuid,
                                                 p_slot_key text, p_holder text,
                                                 p_ttl interval default interval '15 minutes')
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $$
declare
  v_id      uuid;
  v_expired integer;
  v_until   timestamptz := now() + coalesce(p_ttl, interval '15 minutes');
  v_con     text;
  v_t0      timestamptz := clock_timestamp();
begin
  perform custom.assert_store_door(p_organization_id, 'custom.work_slot_hold');
  perform custom.assert_client_may_change(p_organization_id, p_table_id, 'custom.work_slot_hold',
                                          'editor'::public.permission_level, 'table');
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
$$;

create or replace function custom.work_slot_release(p_organization_id uuid, p_hold_id uuid)
returns boolean
language plpgsql
security definer
set search_path to 'pg_catalog'
as $$
declare v_n integer;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.work_slot_release');
  perform custom.assert_client_may_change(p_organization_id, p_hold_id, 'custom.work_slot_release',
                                          'editor'::public.permission_level, 'hold');
  update custom.record r
     set deleted_at = now()
   where r.organization_id = p_organization_id
     and r.id = p_hold_id
     and r.deleted_at is null;
  get diagnostics v_n = row_count;
  return v_n = 1;
end
$$;

create or replace function custom.work_slot_holds(p_organization_id uuid, p_table_id uuid)
returns table (hold_id uuid, slot_key text, holder text, expires_at timestamptz, expired boolean)
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $$
declare
  v_me   uuid;
  v_pred text;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.work_slot_holds');
  perform custom.assert_may_know_table(p_organization_id, p_table_id, 'custom.work_slot_holds');
  v_me   := custom.query_principal();
  v_pred := custom.visible_predicate_sql(v_me, p_organization_id, p_table_id,
                                         'viewer'::public.permission_level, 'r');
  return query execute format($q$
    select r.id, r.data ->> 'slot_key', r.data ->> 'holder',
           nullif(r.data ->> 'expires_at', '')::timestamptz,
           coalesce((r.data ->> 'expires_at')::timestamptz <= now(), false)
      from custom.record r
     where r.organization_id = %1$L::uuid
       and r.table_id = %2$L::uuid
       and r.deleted_at is null
       and (%3$s)
     order by r.data ->> 'slot_key'
  $q$, p_organization_id, p_table_id, v_pred);
end
$$;

-- ════════════════════════════════════════════════════════════════════════════════════════
-- 4. THE GRANTS AND THE DOOR ROWS.
-- ════════════════════════════════════════════════════════════════════════════════════════
--
-- `custom.work_states()` and `custom.work_relation_kinds()` are IMMUTABLE lists with no
-- argument and no reach into any row — they are the workflow vocabulary a screen renders,
-- and they stay SECURITY INVOKER for exactly that reason (census 11 is about a granted
-- INVOKER body that touches the store; these touch nothing).

-- THE DOOR ROWS COME FIRST, AND THE ORDER IS LOAD-BEARING. Measured on this database at
-- 04:18Z on 2026-09-20 by getting it wrong: `platform.enforce_definer_client_grants` fires
-- ON THE GRANT, and a SECURITY DEFINER function in a schema declared closed that holds no
-- `platform.client_callable_door` row has its client EXECUTE taken straight back — so all
-- sixteen grants were issued and all sixteen were revoked inside the same transaction, and
-- the run reported success. Declare, then grant.

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes,
   signed_in_callers, anonymous_callers, declared_by, reason)
select 'custom', v.fn, iam.door_identity_args(p.oid), platform.door_argtypes(p.proargtypes),
       true, false, 'migrations/campaign/workdoors_the_work_layer_gets_its_doors.sql (lane WORK-DOORS)',
       v.why
  from (values
    ('work_states',
     'The five shipped workflow states and the moves each one allows (REC-69). An immutable list about the platform, not about anybody''s data — a screen renders the moves from it so a forbidden move is never offered.'),
    ('work_relation_kinds',
     'Which relation kinds a checklist template may ask for today, and the reason the unavailable one is refused rather than written as something else (REC-70).'),
    ('work_take_assignment',
     'Turns assignments on for one Table: assignee, due date and status become real Fields of it (REC-69). It CHANGES THE SHAPE of a table, so it asks admin on that Table record, not membership of the organization.'),
    ('work_has_assignment',
     'Whether this Table holds the three assignment Fields, so a screen knows whether to offer work at all. Read at VIS-5''s table threshold: you know a table if you may open it or anything in it.'),
    ('work_whose_turn',
     'Whose turn is it, for one Table — the person, the due state and the workflow state of every record in it that THIS person may see. The table threshold is VIS-5''s and every row is then filtered by the one ladder, so a colleague reads her own work and nothing else.'),
    ('work_transition_refusal',
     'Asks the workflow model whether a move is allowed BEFORE anything is written, so a screen offers the moves that exist instead of showing a control that fails. Both states must be rows this person may open, because the sentence quotes both names.'),
    ('work_template_declare',
     'Declares a checklist or SOP template — a graph of records and the relations between them (REC-70). Every Table the graph names is decided at editor, up front, because a template is a change to those tables waiting to happen.'),
    ('work_template_instantiate',
     'Runs a template: the whole graph of records and relations in ONE atomic, logged act (REC-70). Viewer on the template, editor on every Table it names, both decided before a single row is written.'),
    ('work_template_shape',
     'The shape of a template''s graph — how many records per Table and which Table-to-Table edges carry them — so an instance can be compared with what it came from.'),
    ('work_instantiation_shape',
     'The same shape, read off what an instantiation actually created, so "the instance matches the template" is a comparison rather than an eyeball.'),
    ('work_templates',
     'The templates of this organization that this person may see, so the template doors take an id a person can actually obtain.'),
    ('work_slots_declare',
     'Declares a bookable slot Table whose key is kept single by a UNIQUE index (REC-71). Refuses out loud, with the remedy, when the index guard is off — rather than declaring a booking table that silently double-books.'),
    ('work_slot_expire',
     'Lets go of the holds whose expiry has passed, and says how many. Editor on the slot Table, because it retires rows in it.'),
    ('work_slot_hold',
     'Takes a hold on a slot (REC-71). The database decides a collision through the unique index and the loser is refused BY THE INDEX''S OWN NAME, taken from Postgres''s diagnostics — never by a check this function made.'),
    ('work_slot_release',
     'Releases one hold, softly like every delete in this store, and says whether it released anything.'),
    ('work_slot_holds',
     'Who holds what right now on one slot Table, expired holds marked by the same clock the sweep uses, every row filtered by the one ladder.')
  ) as v(fn, why)
  join pg_proc p on p.proname = v.fn and p.pronamespace = 'custom'::regnamespace
 where not exists (select 1 from platform.client_callable_door d
                    where d.schema_name = 'custom' and d.function_name = v.fn
                      and d.identity_argtypes = platform.door_argtypes(p.proargtypes));

grant execute on function custom.work_states() to authenticated;
grant execute on function custom.work_relation_kinds() to authenticated;
grant execute on function custom.work_take_assignment(uuid, uuid) to authenticated;
grant execute on function custom.work_has_assignment(uuid, uuid) to authenticated;
grant execute on function custom.work_whose_turn(uuid, uuid, boolean) to authenticated;
grant execute on function custom.work_transition_refusal(uuid, uuid, uuid) to authenticated;
grant execute on function custom.work_template_declare(uuid, text, jsonb) to authenticated;
grant execute on function custom.work_template_instantiate(uuid, uuid, jsonb) to authenticated;
grant execute on function custom.work_template_shape(uuid, uuid) to authenticated;
grant execute on function custom.work_instantiation_shape(uuid, uuid) to authenticated;
grant execute on function custom.work_templates(uuid, integer) to authenticated;
grant execute on function custom.work_slots_declare(uuid, text, text, uuid) to authenticated;
grant execute on function custom.work_slot_expire(uuid, uuid) to authenticated;
grant execute on function custom.work_slot_hold(uuid, uuid, text, text, interval) to authenticated;
grant execute on function custom.work_slot_release(uuid, uuid) to authenticated;
grant execute on function custom.work_slot_holds(uuid, uuid) to authenticated;
