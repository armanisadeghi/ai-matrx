-- target: branch,production
-- additive: yes
--   It ADDS two functions, `custom.view_record_order_set` and `custom.read_records_in_view_order`,
--   their `platform.client_callable_door` rows, and one knob (`custom/view_record_order_max`).
--   Nothing existing is replaced, dropped or revoked; no table, column, trigger, policy or grant is
--   touched. The positions live on the view's own row (`platform.saved_view.metadata ->
--   'record_positions'`), written only by the first door. The inverse is
--   `migrations/inverse/gridprim_a_view_keeps_the_order_a_person_dragged_down.sql`.
-- guard: custom/system_enabled
-- lock: custom,platform
--
-- LANE GRID-PRIMITIVES, G13 — A VIEW KEEPS THE ORDER A PERSON DRAGGED.
--
-- The older grid lets a person drag rows into an order they keep
-- (`workbench.udt_datasets.row_ordering_config = {"enabled": true, "order": [row ids]}`); the
-- store's Table already accepts `row_order: 'manual'` (REC-N-17) but had nowhere to HOLD an
-- order, so the mover dropped it. The order belongs to a VIEW: two people's views of one
-- Table can each keep their own.
--
-- `custom.view_record_order_set(org, view, record_ids[])` — the named records, in the order
-- given, go first; records the view had already positioned and the call did not name keep
-- their relative order after them (a person dragging among the rows she can see never loses
-- the place of a row she cannot); every position is RE-SPACED (1024, 2048, …) on each call, so
-- moving one record never needs a fraction. The view's definition carries `order: "manual"`
-- from then on. Every named id must be a live record of the view's Table that this person
-- may see; one that is not refuses the whole call and changes nothing. Who may: whoever may
-- open the Table — exactly the rule `custom.view_declare` applies to changing a view.
--
-- `custom.read_records_in_view_order(org, view, by_id, limit, offset)` — the read door for a
-- view whose order is manual: the rows this reader may see, positioned ones first by position,
-- then the ones not yet positioned by created time (oldest first, then id — a TOTAL order, so
-- a page is always the same page), each document read through `custom.read_records_by_ids`
-- (the same ladder and masking as every read).
--
-- LOCKS. create function / insert / comment on only. Not window-class.

set local lock_timeout = '5s';
set local statement_timeout = '60s';

insert into platform.feature_knob
  (feature, key, value, default_value, value_type, label, description,
   set_by, basis, review_due, overridable_by, override_direction, propagation, public_read, ui)
values
  ('custom', 'view_record_order_max', '20000'::jsonb, '20000'::jsonb, 'integer',
   'Most rows one view may hold a hand-set order for',
   'The ceiling on the records custom.view_record_order_set positions in one view. The positions live on the view''s own row, so the ceiling keeps that row a sensible size.',
   'agent', 'Lane GRID-PRIMITIVES 2026-09-24: the largest hand-ordered older table is a few dozen rows; twenty thousand is far past any list a person drags.',
   date '2026-12-24', '{organization}'::text[], 'any', 'next_load', false, '{}'::jsonb)
on conflict (feature, key) do nothing;

create function custom.view_record_order_set(p_organization_id uuid, p_view_id uuid, p_record_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_view   record;
  v_table  uuid;
  v_max    integer := coalesce((platform.knob_resolve('custom', 'view_record_order_max', p_organization_id) #>> '{}')::integer, 20000);
  v_named  integer := coalesce(cardinality(p_record_ids), 0);
  v_bad    integer;
  v_pos    jsonb;
  v_total  integer;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.view_record_order_set');
  perform custom.assert_store_door(p_organization_id, 'custom.view_record_order_set');

  select * into v_view from platform.saved_view
   where id = p_view_id and organization_id = p_organization_id
     and surface_key = 'custom/records' and deleted_at is null;
  if v_view.id is null then
    raise exception 'There is no saved view % here.', p_view_id
      using errcode = '23503',
            hint = 'It may have been removed, or it may belong to another organization — organizations are hard walls (REC-29).';
  end if;
  v_table := coalesce(v_view.subject_id, nullif(v_view.definition ->> 'table_id', '')::uuid);
  perform custom.assert_client_may_open(p_organization_id, v_table, 'custom.view_record_order_set');

  if v_named = 0 then
    raise exception 'Name the records in the order you want them.' using errcode = '22023',
      hint = 'custom.view_record_order_set takes the record ids of this view''s table, first to last. Nothing was changed.';
  end if;
  if v_named > v_max then
    raise exception 'This order names % records; a view holds a hand-set order for at most %.', v_named, v_max
      using errcode = '54000', hint = 'The ceiling is the organization knob custom/view_record_order_max. Nothing was changed.';
  end if;
  if (select count(distinct x) from unnest(p_record_ids) x) <> v_named then
    raise exception 'The same record is named twice in this order.' using errcode = '22023',
      hint = 'Each record takes one place. Nothing was changed.';
  end if;

  select count(*) into v_bad
    from unnest(p_record_ids) x(id)
   where x.id not in (select v from custom.query_visible_ids(p_organization_id, v_table, 'viewer') v);
  if v_bad > 0 then
    raise exception '% of the records named are not rows of this view''s table that you can see.', v_bad
      using errcode = '22023', hint = 'Order only the rows the view shows you. Nothing was changed.';
  end if;

  -- The named first, in the order given; then the rows the view had already placed and this
  -- call did not name, in their old order (only while they still live in the Table); re-spaced.
  with named as (
    select x.id, x.n::numeric as k from unnest(p_record_ids) with ordinality x(id, n)
  ),
  kept as (
    select (e.key)::uuid as id, (e.value #>> '{}')::numeric as old
      from jsonb_each(coalesce(v_view.metadata -> 'record_positions', '{}'::jsonb)) e
     where (e.key)::uuid not in (select id from named)
       and exists (select 1 from custom.record r
                    where r.organization_id = p_organization_id and r.id = (e.key)::uuid
                      and r.table_id = v_table and r.deleted_at is null)
  ),
  ordered as (
    select id, row_number() over (order by grp, k, id) as n
      from (select id, 0 as grp, k from named
            union all
            select id, 1 as grp, old from kept) u
  )
  select jsonb_object_agg(id::text, n * 1024), count(*) into v_pos, v_total from ordered;

  update platform.saved_view
     set metadata = jsonb_set(coalesce(metadata, '{}'::jsonb), '{record_positions}', v_pos, true),
         definition = definition || jsonb_build_object('order', 'manual'),
         updated_at = now()
   where id = p_view_id and organization_id = p_organization_id;

  return jsonb_build_object('view_id', p_view_id, 'table_id', v_table, 'order', 'manual',
                            'named', v_named, 'positioned', v_total);
end
$fn$;

comment on function custom.view_record_order_set(uuid, uuid, uuid[]) is
  'GRID-PRIMITIVES G13: a hand-set row order for one saved view. The named records go first in the order given; rows the view had already placed and this call did not name keep their relative order after them; every position is re-spaced (1024, 2048, ...). The view''s definition carries order: manual from then on. Every named id must be a live record of the view''s table this person may see, or nothing changes. Whoever may open the table may, as for custom.view_declare.';

create function custom.read_records_in_view_order(p_organization_id uuid, p_view_id uuid,
                                                   p_by_id boolean default false,
                                                   p_limit integer default 200, p_offset integer default 0)
returns table(id uuid, document jsonb, level public.permission_level, "position" numeric)
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $fn$
#variable_conflict use_column
declare
  v_view  record;
  v_table uuid;
  v_ids   uuid[];
  v_pos   numeric[];
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.read_records_in_view_order');

  select * into v_view from platform.saved_view sv
   where sv.id = p_view_id and sv.organization_id = p_organization_id
     and sv.surface_key = 'custom/records' and sv.deleted_at is null;
  if v_view.id is null then
    raise exception 'There is no saved view % here.', p_view_id
      using errcode = '23503',
            hint = 'It may have been removed, or it may belong to another organization — organizations are hard walls (REC-29).';
  end if;
  v_table := coalesce(v_view.subject_id, nullif(v_view.definition ->> 'table_id', '')::uuid);
  perform custom.assert_client_may_open(p_organization_id, v_table, 'custom.read_records_in_view_order');
  if v_view.definition ->> 'order' is distinct from 'manual' then
    raise exception 'This view is ordered by its sort, not by hand.' using errcode = '22023',
      hint = 'Read it with custom.read_records (or read_records_matching). A view takes a hand-set order through custom.view_record_order_set.';
  end if;

  select array_agg(q.id order by q.n), array_agg(q.pos order by q.n) into v_ids, v_pos
    from (select r.id, (v_view.metadata -> 'record_positions' ->> r.id::text)::numeric as pos,
                 row_number() over (order by (v_view.metadata -> 'record_positions' ->> r.id::text)::numeric nulls last,
                                             r.created_at, r.id) as n
            from custom.record r
           where r.organization_id = p_organization_id
             and r.table_id = v_table
             and r.deleted_at is null
             and r.id in (select v from custom.query_visible_ids(p_organization_id, v_table, 'viewer') v)
           order by n
           limit least(greatest(coalesce(p_limit, 200), 1), 500)
          offset greatest(coalesce(p_offset, 0), 0)) q;

  if v_ids is null then
    return;
  end if;
  return query
    select d.id, d.document, d.level, v_pos[o.n]
      from unnest(v_ids) with ordinality o(rid, n)
      join custom.read_records_by_ids(p_organization_id, v_table, v_ids, coalesce(p_by_id, false)) d on d.id = o.rid
     order by o.n;
end
$fn$;

comment on function custom.read_records_in_view_order(uuid, uuid, boolean, integer, integer) is
  'GRID-PRIMITIVES G13: the rows of a hand-ordered saved view this reader may see — positioned ones by position, then the rest by created time (oldest first, then id), a total order. Each document through custom.read_records_by_ids (same ladder, same masking). At most 500 per page. A view ordered by its sort is refused with the door to use.';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers, argument_rules)
values
  ('custom', 'view_record_order_set', 'p_organization_id uuid, p_view_id uuid, p_record_ids uuid[]',
   array['uuid'::regtype, 'uuid'::regtype, 'uuid[]'::regtype]::oid[],
   'p_organization_id is checked by custom.assert_client_may_reach and custom.assert_store_door before anything is read. p_view_id is read only as a live custom/records saved view OF THAT organization, and its Table is then asked custom.assert_client_may_open (the rule custom.view_declare applies). Every p_record_ids entry must be inside custom.query_visible_ids for that Table or nothing is written. It writes only that view''s own metadata.record_positions and definition.order.',
   'gridprim_a_view_keeps_the_order_a_person_dragged.sql', null, true, false,
   jsonb_build_object('version', 1, 'declared_by', 'gridprim_a_view_keeps_the_order_a_person_dragged.sql',
     'declared_at', '2026-09-24 lane GRID-PRIMITIVES',
     'arguments', jsonb_build_object(
       'p_organization_id', jsonb_build_object('type', 'uuid', 'position', 1, 'entity', 'organization',
         'check', 'this body decides it with custom.assert_client_may_reach(arg1), custom.assert_store_door(arg1) — the organization wall — a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.',
         'foreign', jsonb_build_object('sqlstate', '42501', 'same_as_invented', true),
         'verified', '2026-09-24 lane GRID-PRIMITIVES — written with this body'),
       'p_view_id', jsonb_build_object('type', 'uuid', 'position', 2, 'entity', 'saved_view',
         'check', 'read only as a live custom/records saved view whose organization_id = arg1, after arg1 is decided; its Table is then asked custom.assert_client_may_open; any other raises the same 23503 an invented id does.',
         'foreign', jsonb_build_object('sqlstate', '23503', 'same_as_invented', true),
         'verified', '2026-09-24 lane GRID-PRIMITIVES — written with this body'),
       'p_record_ids', jsonb_build_object('type', 'uuid[]', 'position', 3, 'entity', 'custom_record',
         'check', 'every id must be inside custom.query_visible_ids(arg1, the view''s Table) — the caller''s own ladder — or the call raises 22023 and writes nothing.',
         'foreign', jsonb_build_object('sqlstate', '22023', 'same_as_invented', true),
         'verified', '2026-09-24 lane GRID-PRIMITIVES — written with this body')))),
  ('custom', 'read_records_in_view_order', 'p_organization_id uuid, p_view_id uuid, p_by_id boolean, p_limit integer, p_offset integer',
   array['uuid'::regtype, 'uuid'::regtype, 'boolean'::regtype, 'integer'::regtype, 'integer'::regtype]::oid[],
   'p_organization_id is checked by custom.assert_client_may_reach before anything is read. p_view_id is read only as a live custom/records saved view OF THAT organization, and its Table is then asked custom.assert_client_may_open. Rows are only those inside custom.query_visible_ids for that Table, and every document is read through custom.read_records_by_ids, which asks the ladder and masks as every read does. It writes nothing.',
   'gridprim_a_view_keeps_the_order_a_person_dragged.sql', null, true, false,
   jsonb_build_object('version', 1, 'declared_by', 'gridprim_a_view_keeps_the_order_a_person_dragged.sql',
     'declared_at', '2026-09-24 lane GRID-PRIMITIVES',
     'arguments', jsonb_build_object(
       'p_organization_id', jsonb_build_object('type', 'uuid', 'position', 1, 'entity', 'organization',
         'check', 'this body decides it with custom.assert_client_may_reach(arg1) — the organization wall — a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.',
         'foreign', jsonb_build_object('sqlstate', '42501', 'same_as_invented', true),
         'verified', '2026-09-24 lane GRID-PRIMITIVES — written with this body'),
       'p_view_id', jsonb_build_object('type', 'uuid', 'position', 2, 'entity', 'saved_view',
         'check', 'read only as a live custom/records saved view whose organization_id = arg1, after arg1 is decided; its Table is then asked custom.assert_client_may_open; any other raises the same 23503 an invented id does.',
         'foreign', jsonb_build_object('sqlstate', '23503', 'same_as_invented', true),
         'verified', '2026-09-24 lane GRID-PRIMITIVES — written with this body'),
       'p_by_id', jsonb_build_object('type', 'boolean', 'position', 3, 'not_an_id', true, 'check', 'passed to custom.read_records_by_ids: key the document by field id or by name.'),
       'p_limit', jsonb_build_object('type', 'integer', 'position', 4, 'not_an_id', true, 'check', 'clamped to 1..500.'),
       'p_offset', jsonb_build_object('type', 'integer', 'position', 5, 'not_an_id', true, 'check', 'clamped to 0 or more.'))))
on conflict do nothing;
