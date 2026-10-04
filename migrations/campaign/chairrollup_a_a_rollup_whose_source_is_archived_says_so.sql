-- additive: yes
--   It ADDS two functions — custom._derived_source_archived(uuid, uuid, jsonb) (a STABLE helper,
--   EXECUTE revoked from public/anon/authenticated, called only from the store's own bodies) and
--   the read door custom.field_source_archived(uuid, uuid) (SECURITY DEFINER, EXECUTE to
--   authenticated) — and REPLACES two bodies, custom.rollup_value and custom.lookup_value. No table,
--   column, trigger, policy or stored row is touched. Locks: pg_proc row locks only.
--   Inverse: migrations/inverse/chairrollup_a_a_rollup_whose_source_is_archived_says_so_down.sql
--
-- chair-step: it REPLACES the two worked-out readers custom.rollup_value and custom.lookup_value
--   (a roll-up or lookup whose source column is archived now answers a typed "source archived"
--   object instead of a number) and ADDS one client read door, custom.field_source_archived.
--   Nothing is dropped or revoked from a client.
--
-- guard: custom/system_enabled
-- lock: custom
-- lane: CHAIR-ROLLUP-HONEST
-- based-on: custom.rollup_value(uuid, uuid, jsonb) 11a4f891dabe2cda3d9282d4bbb683c0b14accfd1b82c6f915a88c986bb6efda
-- based-on: custom.lookup_value(uuid, uuid, jsonb) 5a08a3ebfd866cd4c1a2ed6bd5ae78a491adecf12d671ce3c477e4c8ebb539d7
--
-- CHAIR-ROLLUP-HONEST (Unified Data System v6) — A ROLL-UP WHOSE SOURCE IS ARCHIVED SAYS SO (Law 4).
--
-- THE GAP. Harbor Dental's Patients table totals "Booked visits" through the back-link of
-- Appointments' "Patient" link (CHAIR-UI-STORE). Archive "Patient" on Appointments and
-- custom.field_retire withdraws its edges and retires the Field — but the roll-up lives on the OTHER
-- table, so the retirement's same-table cascade never reaches it. custom._back_link_relation then
-- finds no live linking Field, custom.relation_targets falls through to the record's own document
-- (where a reverse column is never stored) and the roll-up reads 0 on every patient: a number, and a
-- false one. The same happens to a roll-up or lookup whose FAR column (`of` / `pick`) is archived on
-- the table it reads: it reads empty, as if nothing were there to add up.
--
-- THE FIX, one question asked in one place:
--   custom._derived_source_archived(org, table, field doc) answers null while every column the
--     worked-out column reads is live; otherwise a typed object naming the archived column:
--       {"__unavailable": "source_archived", "reads": "link" | "column",
--        "field_id": <archived Field id>, "label": <its label>,
--        "table_id": <its table>, "table": <that table's name>}
--     `reads: link` — the relation it reads through (a forward link of this table, or the linking
--     Field of a back-link) is archived; `reads: column` — the far column it totals or borrows is.
--   custom.rollup_value and custom.lookup_value ask it first and return that object instead of a
--     number or an empty. custom.field_restore of the named Field brings the edges and the column
--     back, and the values come back with them (nothing about the roll-up itself was changed).
--   custom.field_source_archived(org, field id) is the same answer for Column settings, which has no
--     record to read: null when the sources are live. A reader who may not know the archived
--     column's table gets the state without its names.
--
-- GUARD: scripts/campaign-tests/chairrollup_a_green.sql — RED before this file (the roll-up reads 0
-- after "Patient" is archived), GREEN after (it reads the typed state naming "Patient", and reads 3
-- again once "Patient" is restored).

CREATE OR REPLACE FUNCTION custom._derived_source_archived(p_organization_id uuid, p_table_id uuid, p_field_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_via     text := nullif(p_field_data -> 'config' ->> 'via', '');
  v_far_key text := nullif(case when custom.parity_type(p_field_data) = 'lookup'
                                then p_field_data -> 'config' ->> 'pick'
                                else p_field_data -> 'config' ->> 'of' end, '');
  v_rel     jsonb;
  v_far     uuid;
  v_id      uuid;
  v_doc     jsonb;
  v_reads   text;
begin
  -- WHICH COLUMNS A LOOKUP OR ROLL-UP READS, AND WHETHER ONE OF THEM IS ARCHIVED (CHAIR-ROLLUP-HONEST).
  -- Live first, in the order the readers resolve it: a relation Field of this table by key, else a
  -- back-link (custom._back_link_relation). Only when neither is live is an ARCHIVED one looked for.
  if v_via is null or p_table_id is null then
    return null;
  end if;
  select f.data into v_rel
    from custom.record f
   where f.organization_id = p_organization_id
     and f.table_id = custom.field_kernel_id()
     and f.deleted_at is null
     and f.data ->> 'entity_definition_id' = p_table_id::text
     and f.data ->> 'key' = v_via
   limit 1;
  if v_rel is null then
    v_rel := custom._back_link_relation(p_organization_id, p_table_id, v_via);
  end if;

  if v_rel is null then
    v_reads := 'link';
    -- (1) a relation of THIS table under that key, archived.
    select f.id, f.data into v_id, v_doc
      from custom.record f
     where f.organization_id = p_organization_id
       and f.table_id = custom.field_kernel_id()
       and f.deleted_at is not null
       and f.data ->> 'entity_definition_id' = p_table_id::text
       and f.data ->> 'key' = v_via
     order by f.deleted_at desc
     limit 1;
    -- (2) the linking Field of a back-link, archived: the same key custom.reverse_columns publishes
    --     (its inverse_key, else `linked_<field id>`), pointing at this table.
    if v_id is null then
      select f.id, f.data into v_id, v_doc
        from custom.record f
       where f.organization_id = p_organization_id
         and f.table_id = custom.field_kernel_id()
         and f.data_class = 'field'
         and f.deleted_at is not null
         and f.data ->> 'type' = 'relation'
         and (case coalesce(nullif(f.data -> 'config' ->> 'target_mode', ''), 'one')
                when 'one' then f.data ->> 'relation_target' = p_table_id::text
                when 'several' then coalesce(f.data -> 'config' -> 'target_tables', '[]'::jsonb) ? p_table_id::text
                else false end)
         and (nullif(f.data ->> 'inverse_key', '') = v_via
              or (nullif(f.data ->> 'inverse_key', '') is null and 'linked_' || replace(f.id::text, '-', '') = v_via))
       order by f.deleted_at desc
       limit 1;
    end if;
  elsif v_far_key is not null then
    -- (3) the far column it totals or borrows, archived on the table the relation points at.
    v_reads := 'column';
    v_far := nullif(v_rel ->> 'relation_target', '')::uuid;
    if v_far is not null
       and not exists (select 1 from custom.record f
                        where f.organization_id = p_organization_id
                          and f.table_id = custom.field_kernel_id()
                          and f.deleted_at is null
                          and f.data ->> 'entity_definition_id' = v_far::text
                          and f.data ->> 'key' = v_far_key) then
      select f.id, f.data into v_id, v_doc
        from custom.record f
       where f.organization_id = p_organization_id
         and f.table_id = custom.field_kernel_id()
         and f.deleted_at is not null
         and f.data ->> 'entity_definition_id' = v_far::text
         and f.data ->> 'key' = v_far_key
       order by f.deleted_at desc
       limit 1;
    end if;
  end if;

  if v_id is null then
    return null;
  end if;
  return jsonb_build_object(
    '__unavailable', 'source_archived',
    'reads', v_reads,
    'field_id', v_id::text,
    'label', coalesce(nullif(btrim(v_doc ->> 'label'), ''), v_doc ->> 'key'),
    'table_id', v_doc ->> 'entity_definition_id',
    'table', (select coalesce(nullif(btrim(t.data ->> 'name'), ''), 'a table')
                from custom.record t
               where t.organization_id = p_organization_id
                 and t.id = nullif(v_doc ->> 'entity_definition_id', '')::uuid));
end;
$function$;

revoke all on function custom._derived_source_archived(uuid, uuid, jsonb) from public, anon, authenticated;

CREATE OR REPLACE FUNCTION custom.field_source_archived(p_organization_id uuid, p_field_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_field jsonb;
  v_table uuid;
  v_out   jsonb;
begin
  -- COLUMN SETTINGS' QUESTION (CHAIR-ROLLUP-HONEST): is a column this lookup or roll-up reads
  -- archived, and which? Null when every source is live (or the column is not worked out).
  perform custom.assert_client_may_reach(p_organization_id, 'custom.field_source_archived');
  select f.data into v_field
    from custom.record f
   where f.organization_id = p_organization_id and f.id = p_field_id
     and f.table_id = custom.field_kernel_id() and f.deleted_at is null;
  v_table := nullif(v_field ->> 'entity_definition_id', '')::uuid;
  if v_table is null then
    return null;
  end if;
  perform custom.assert_may_know_table(p_organization_id, v_table, 'custom.field_source_archived');
  if coalesce(custom.parity_type(v_field), '') not in ('lookup', 'rollup') then
    return null;
  end if;
  v_out := custom._derived_source_archived(p_organization_id, v_table, v_field);
  if v_out is not null and (v_out ->> 'table_id') is distinct from v_table::text then
    begin
      perform custom.assert_may_know_table(p_organization_id, (v_out ->> 'table_id')::uuid, 'custom.field_source_archived');
    exception when insufficient_privilege then
      v_out := v_out - 'label' - 'table' - 'field_id';
    end;
  end if;
  return v_out;
end;
$function$;

revoke all on function custom.field_source_archived(uuid, uuid) from public, anon;
grant execute on function custom.field_source_archived(uuid, uuid) to authenticated;

CREATE OR REPLACE FUNCTION custom.rollup_value(p_organization_id uuid, p_record_id uuid, p_field_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_via     text := p_field_data -> 'config' ->> 'via';
  v_of      text := p_field_data -> 'config' ->> 'of';
  v_agg     text := p_field_data -> 'config' ->> 'agg';
  v_filter  jsonb := p_field_data -> 'config' -> 'filter';
  v_nums    numeric[] := array[]::numeric[];
  v_n       integer := 0;
  v_one     jsonb;
  v_t       uuid;
  v_targets uuid[];
  v_table   uuid;
  v_far     uuid;
  v_where   text;
  v_gone    jsonb;
begin
  v_table := coalesce(nullif(p_field_data ->> 'entity_definition_id', '')::uuid,
                      (select r.table_id from custom.record r
                        where r.organization_id = p_organization_id and r.id = p_record_id));
  -- CHAIR-ROLLUP-HONEST: A SOURCE THAT IS ARCHIVED IS NOT A ZERO. When the link it reads through
  -- (or the back-link's linking column, or the column it totals) is archived, the answer is the
  -- typed state naming that column — never a count of nothing.
  v_gone := custom._derived_source_archived(p_organization_id, v_table, p_field_data);
  if v_gone is not null then
    return v_gone;
  end if;

  -- The linked records, once each (custom.relation_targets is DISTINCT), never the record itself.
  select coalesce(array_agg(t), '{}'::uuid[]) into v_targets
    from custom.relation_targets(p_organization_id, p_record_id, v_via) t
   where t <> p_record_id;         -- a record is never one of the things it adds up.

  -- CHAIR-MATH (b): WHICH OF THEM. config.filter is a saved view's filter written against the far
  -- table (custom.record_filter_sql: the one grammar — a flat map of column keys, windows, or a
  -- Rule expression over field ids), compiled once per roll-up and asked of the linked records in
  -- ONE statement. It is asked as this reader: a column the reader may not read refuses here as it
  -- refuses on the view (custom.derived_value turns that into an empty column, warned), and a Rule
  -- filter treats a hidden column as undecided — the roll-up counts what THIS reader may see.
  if v_filter is not null and jsonb_typeof(v_filter) = 'object' and v_filter <> '{}'::jsonb
     and cardinality(v_targets) > 0 then
    select nullif(f.data ->> 'relation_target', '')::uuid into v_far
      from custom.record f
     where f.organization_id = p_organization_id
       and f.table_id = custom.field_kernel_id()
       and f.deleted_at is null
       and f.data ->> 'entity_definition_id' = v_table::text
       and f.data ->> 'key' = v_via
     limit 1;
    -- CHAIR-UI-STORE: a roll-up through a back-link adds up records of the LINKING table.
    if v_far is null then
      v_far := nullif(custom._back_link_relation(p_organization_id, v_table, v_via) ->> 'relation_target', '')::uuid;
    end if;
    if v_far is null then
      raise exception 'The column "%" narrows the records it adds up, but the relation it reads through (%) points at no table, so it is left empty.',
        coalesce(nullif(p_field_data ->> 'label', ''), p_field_data ->> 'key', 'this column'), v_via
        using errcode = '23514', hint = 'FLD-11: give the relation a relation_target.';
    end if;
    v_where := custom.record_filter_sql(p_organization_id, v_far,
                 case when custom.filter_is_rule(v_filter) then v_filter
                      else custom.choice_filter_normalize(custom.choice_field_map(p_organization_id, v_far), v_filter) end);
    execute format('select coalesce(array_agg(r.id), ''{}''::uuid[]) from custom.record r '
                   'where r.organization_id = $1 and r.table_id = $2 and r.id = any ($3) '
                   'and r.deleted_at is null and %s', v_where)
       into v_targets
      using p_organization_id, v_far, v_targets;
  end if;

  foreach v_t in array v_targets loop
    v_n := v_n + 1;                                    -- count counts RECORDS, once each.
    if v_of is not null then
      -- STORE-TAILS-3: the one column it adds up, never the far record whole.
      v_one := custom.far_value(p_organization_id, v_t, v_of, p_field_data);
      if v_one is not null and jsonb_typeof(v_one) = 'number' then
        v_nums := v_nums || (v_one #>> '{}')::numeric;
      end if;
    end if;
  end loop;

  if v_agg = 'count' then
    return to_jsonb(v_n);
  end if;
  if array_length(v_nums, 1) is null then
    return null;                    -- nothing to work out is an absence, never a zero.
  end if;
  return case v_agg
    when 'sum' then to_jsonb((select sum(x) from unnest(v_nums) x))
    when 'min' then to_jsonb((select min(x) from unnest(v_nums) x))
    when 'max' then to_jsonb((select max(x) from unnest(v_nums) x))
    when 'avg' then to_jsonb((select avg(x) from unnest(v_nums) x))
  end;
end;
$function$;

CREATE OR REPLACE FUNCTION custom.lookup_value(p_organization_id uuid, p_record_id uuid, p_field_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_via   text := p_field_data -> 'config' ->> 'via';
  v_pick  text := p_field_data -> 'config' ->> 'pick';
  v_multi boolean := coalesce((p_field_data ->> 'multi')::boolean, false);
  v_out   jsonb := '[]'::jsonb;
  v_one   jsonb;
  v_t     uuid;
  v_gone  jsonb;
begin
  -- CHAIR-ROLLUP-HONEST: the link it reads through, or the column it borrows, archived — the typed
  -- state naming that column, never an empty that looks like "nothing on the linked record".
  v_gone := custom._derived_source_archived(p_organization_id,
              coalesce(nullif(p_field_data ->> 'entity_definition_id', '')::uuid,
                       (select r.table_id from custom.record r
                         where r.organization_id = p_organization_id and r.id = p_record_id)),
              p_field_data);
  if v_gone is not null then
    return v_gone;
  end if;
  for v_t in select * from custom.relation_targets(p_organization_id, p_record_id, v_via) loop
    if v_t = p_record_id then
      continue;                     -- a record cannot look itself up through itself.
    end if;
    -- THE FAR SIDE, ONE COLUMN OF IT (STORE-TAILS-3). A lookup OF a computed Value, or of
    -- another lookup, still answers through the same precedence the whole-record reader uses —
    -- but only the picked column is worked out, so two tables that point at each other no
    -- longer work each other out whole, round and round, until the stack runs out.
    v_one := custom.far_value(p_organization_id, v_t, v_pick, p_field_data);
    if v_one is not null then
      v_out := v_out || jsonb_build_array(v_one);
    end if;
  end loop;
  if v_multi then
    return v_out;
  end if;
  return case when jsonb_array_length(v_out) = 0 then null else v_out -> 0 end;
end;
$function$;
