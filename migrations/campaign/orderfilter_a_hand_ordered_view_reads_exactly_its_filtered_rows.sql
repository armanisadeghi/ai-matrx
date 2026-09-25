-- target: branch,production
-- additive: no
--   It REPLACES the one order door, `custom.read_records_in_view_order`, with the same door plus a
--   sixth, last, defaulted argument `p_filter jsonb` (the list door's filter: a flat map or a
--   nested Rule). Because the argument list changes, the five-argument function is DROPPED and the
--   six-argument one created in the same transaction, so there is only ever one signature (a
--   second, defaulted overload would make every existing call ambiguous — dorg3's lesson). Every
--   existing call, positional or by name, still resolves: p_filter defaults to null (no filter).
--   Its `platform.client_callable_door` row follows the signature (identity_args, argtypes, the
--   p_filter argument rule), and `custom.reopen_declared_doors()` hands the signed-in lane its
--   EXECUTE back (the ddl guard takes a new definer's client grant at birth). No table, column,
--   stored row, policy or trigger is touched; nothing is written by the door.
--   The inverse is `migrations/inverse/orderfilter_a_hand_ordered_view_reads_exactly_its_filtered_rows_down.sql`.
-- guard: custom/system_enabled
-- lock: custom,platform
-- lane: ORDER-FILTER
-- based-on: custom.read_records_in_view_order(uuid, uuid, boolean, integer, integer) 8e214a18594c1c573579e5e0f08fdf8ca354a9c7cbb764e59fac58506a57109f
--
-- LANE ORDER-FILTER. A FILTERED, HAND-ORDERED VIEW READS EXACTLY ITS ROWS, IN THEIR PLACES.
--
-- THE USE CASE. Cedar Ridge Veterinary Clinic's front desk keeps a "Call-back list" view of the
-- Appointments table: only the No-show visits (the view's own `where`), in the order the desk
-- will phone them, dragged by hand. The table holds the whole season — hundreds of visits — and
-- the desk placed every one of them in the day sheet's order.
--
-- WHAT WAS WRONG (lane GRID-MANUAL's named limit). The order door took no filter, so the grid
-- read the first 500 POSITIONS of the whole table and then kept only the rows the filter's own
-- page answered. A No-show placed at position 501 or later had no position in that answer and
-- fell to the end in arrival order (MISORDERED), and every page read up to 500 documents of
-- visits the view does not show (OVER-READ: rows the person may see, but not rows this view is).
--
-- THE FIX, IN THE STORE. The order door takes the same filter the list door
-- (`custom.read_records_matching`) takes and puts it in the SAME where clause, through the ONE
-- builder (`custom.record_filter_sql(org, table, filter)`: a flat map normalised by
-- `custom.choice_filter_normalize`, or a Rule compiled over the reader's visible columns — a flat
-- key naming a column the reader may not read is refused 42501 by its name, exactly as on the
-- list door). The ladder is unchanged and inside: only ids in `custom.query_visible_ids` for the
-- view's Table are ever considered, and each document is read through
-- `custom.read_records_by_ids` (same masking). The positions ARE NOT re-numbered: a row answers
-- the position stored for it on the view's row, and the rows the filter hides keep theirs,
-- untouched. Page parameters are the door's own: p_limit (1..500) and p_offset over the
-- FILTERED order, so page two of a filtered hand order is page two of that order.
--
-- LOCKS. drop function + create function + comment + one registry update. Not window-class.

set local lock_timeout = '30s';
set local statement_timeout = '60s';

drop function custom.read_records_in_view_order(uuid, uuid, boolean, integer, integer);

create function custom.read_records_in_view_order(p_organization_id uuid, p_view_id uuid, p_by_id boolean DEFAULT false, p_limit integer DEFAULT 200, p_offset integer DEFAULT 0, p_filter jsonb DEFAULT NULL::jsonb)
 RETURNS TABLE(id uuid, document jsonb, level permission_level, "position" numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
#variable_conflict use_column
declare
  v_view   record;
  v_table  uuid;
  v_ids    uuid[];
  v_pos    numeric[];
  v_filter jsonb;
  v_sql    text;
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

  -- ORDER-FILTER: THE LIST DOOR'S QUESTION, THE LIST DOOR'S WAY. A flat map is normalised to the
  -- stored choice keys first (CHOICE-VALUE); a Rule expression is compiled as-is. Both become
  -- one WHERE fragment from the one builder, asked over this reader's columns. Nothing asked
  -- (null, {}) is `true`.
  v_filter := coalesce(p_filter, '{}'::jsonb);
  v_sql := format($q$
    select array_agg(q.id order by q.n), array_agg(q.pos order by q.n)
      from (select r.id, ($1 ->> r.id::text)::numeric as pos,
                   row_number() over (order by ($1 ->> r.id::text)::numeric nulls last,
                                               r.created_at, r.id) as n
              from custom.record r
             where r.organization_id = %L::uuid
               and r.table_id = %L::uuid
               and r.deleted_at is null
               and r.id in (select v from custom.query_visible_ids(%L::uuid, %L::uuid, 'viewer') v)
               and %s
             order by n
             limit %s offset %s) q
  $q$,
    p_organization_id, v_table, p_organization_id, v_table,
    custom.record_filter_sql(p_organization_id, v_table,
      case when custom.filter_is_rule(v_filter) then v_filter
           else custom.choice_filter_normalize(custom.choice_field_map(p_organization_id, v_table), v_filter) end),
    least(greatest(coalesce(p_limit, 200), 1), 500),
    greatest(coalesce(p_offset, 0), 0));
  execute v_sql into v_ids, v_pos using coalesce(v_view.metadata -> 'record_positions', '{}'::jsonb);

  if v_ids is null then
    return;
  end if;
  return query
    select d.id, d.document, d.level, v_pos[o.n]
      from unnest(v_ids) with ordinality o(rid, n)
      join custom.read_records_by_ids(p_organization_id, v_table, v_ids, coalesce(p_by_id, false)) d on d.id = o.rid
     order by o.n;
end
$function$;

comment on function custom.read_records_in_view_order(uuid, uuid, boolean, integer, integer, jsonb) is
  'GRID-PRIMITIVES G13 + ORDER-FILTER: the rows of a hand-ordered saved view this reader may see that match p_filter (the list door''s filter — a flat map or a nested Rule, one WHERE fragment through custom.record_filter_sql; null or {} asks nothing) — positioned ones by their stored position, then the rest by created time (oldest first, then id), a total order; p_limit (1..500) and p_offset page that filtered order. Positions are never re-numbered and rows the filter hides keep theirs. Each document through custom.read_records_by_ids (same ladder, same masking). A view ordered by its sort is refused with the door to use.';

update platform.client_callable_door
   set identity_args = 'p_organization_id uuid, p_view_id uuid, p_by_id boolean, p_limit integer, p_offset integer, p_filter jsonb',
       identity_argtypes = array['uuid'::regtype, 'uuid'::regtype, 'boolean'::regtype, 'integer'::regtype, 'integer'::regtype, 'jsonb'::regtype]::oid[],
       declared_by = 'orderfilter_a_hand_ordered_view_reads_exactly_its_filtered_rows.sql',
       reason = 'p_organization_id is checked by custom.assert_client_may_reach before anything is read. p_view_id is read only as a live custom/records saved view OF THAT organization, and its Table is then asked custom.assert_client_may_open. Rows are only those inside custom.query_visible_ids for that Table; p_filter only narrows that set in the same where clause (custom.record_filter_sql, the list door''s builder), and every document is read through custom.read_records_by_ids, which asks the ladder and masks as every read does. It writes nothing.',
       signed_in_callers = true,
       non_client_lane = null,
       argument_rules = jsonb_set(
         jsonb_set(jsonb_set(argument_rules, '{declared_by}', '"orderfilter_a_hand_ordered_view_reads_exactly_its_filtered_rows.sql"'),
                   '{declared_at}', '"2026-09-25 lane ORDER-FILTER"'),
         '{arguments,p_filter}',
         jsonb_build_object('type', 'jsonb', 'position', 6, 'not_an_id', true,
           'check', 'A FILTER, AND NOT A LEAK — the list door''s own. It appears only as an additional conjunct in the SAME where clause as the custom.query_visible_ids arm: it NARROWS a set this caller is already entitled to read and has no arm that can widen it. It is written by custom.record_filter_sql(arg1, the view''s Table, filter): a flat key naming a column this caller may not read is refused 42501 by name; a Rule treats it as undecided; keys are refused by shape before they reach format(); values are quoted literals. The documents are masked afterwards by custom.read_records_by_ids exactly as on the unfiltered door.',
           'foreign', jsonb_build_object('not_a_leak', true, 'same_as_invented', true),
           'verified', '2026-09-25 lane ORDER-FILTER — written with this body'))
 where schema_name = 'custom' and function_name = 'read_records_in_view_order';

select custom.reopen_declared_doors();

do $check$
begin
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'custom' and p.proname = 'read_records_in_view_order') <> 1 then
    raise exception 'ORDER-FILTER: read_records_in_view_order must have exactly one signature';
  end if;
  if not has_function_privilege('authenticated', 'custom.read_records_in_view_order(uuid, uuid, boolean, integer, integer, jsonb)', 'execute') then
    raise exception 'ORDER-FILTER: a signed-in person holds no EXECUTE on the order door';
  end if;
  if has_function_privilege('anon', 'custom.read_records_in_view_order(uuid, uuid, boolean, integer, integer, jsonb)', 'execute') then
    raise exception 'ORDER-FILTER: anon may call the order door';
  end if;
  if (select count(*) from platform.client_callable_door
       where schema_name = 'custom' and function_name = 'read_records_in_view_order'
         and identity_argtypes = array['uuid'::regtype, 'uuid'::regtype, 'boolean'::regtype, 'integer'::regtype, 'integer'::regtype, 'jsonb'::regtype]::oid[]) <> 1 then
    raise exception 'ORDER-FILTER: the order door''s registry row does not name its signature';
  end if;
end
$check$;
