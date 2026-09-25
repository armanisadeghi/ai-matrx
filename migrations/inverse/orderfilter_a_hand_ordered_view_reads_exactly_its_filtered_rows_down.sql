-- target: branch,production
-- additive: no
--   The inverse of orderfilter_a_hand_ordered_view_reads_exactly_its_filtered_rows.sql: drops the
--   six-argument order door and puts G13's five-argument one back, byte for byte (sha256
--   8e214a18594c1c573579e5e0f08fdf8ca354a9c7cbb764e59fac58506a57109f), its comment, and its
--   `platform.client_callable_door` row as it stood (declared_by gridprim, the five argument
--   rules), then hands the signed-in lane its EXECUTE back. Nothing stored is touched.
-- guard: custom/system_enabled
-- lock: custom,platform
-- lane: ORDER-FILTER
-- based-on: custom.read_records_in_view_order(uuid, uuid, boolean, integer, integer, jsonb) 213896eba65adecc4316e1bbd8862b12646a427c4ad35b4f78d4d92270bbb1a7

set local lock_timeout = '30s';
set local statement_timeout = '60s';

drop function custom.read_records_in_view_order(uuid, uuid, boolean, integer, integer, jsonb);

CREATE OR REPLACE FUNCTION custom.read_records_in_view_order(p_organization_id uuid, p_view_id uuid, p_by_id boolean DEFAULT false, p_limit integer DEFAULT 200, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, document jsonb, level permission_level, "position" numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
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
$function$;

comment on function custom.read_records_in_view_order(uuid, uuid, boolean, integer, integer) is
  'GRID-PRIMITIVES G13: the rows of a hand-ordered saved view this reader may see — positioned ones by position, then the rest by created time (oldest first, then id), a total order. Each document through custom.read_records_by_ids (same ladder, same masking). At most 500 per page. A view ordered by its sort is refused with the door to use.';

update platform.client_callable_door set identity_args = 'p_organization_id uuid, p_view_id uuid, p_by_id boolean, p_limit integer, p_offset integer', identity_argtypes = array['uuid'::regtype, 'uuid'::regtype, 'boolean'::regtype, 'integer'::regtype, 'integer'::regtype]::oid[], declared_by = 'gridprim_a_view_keeps_the_order_a_person_dragged.sql', reason = 'p_organization_id is checked by custom.assert_client_may_reach before anything is read. p_view_id is read only as a live custom/records saved view OF THAT organization, and its Table is then asked custom.assert_client_may_open. Rows are only those inside custom.query_visible_ids for that Table, and every document is read through custom.read_records_by_ids, which asks the ladder and masks as every read does. It writes nothing.', signed_in_callers = 't', non_client_lane = NULL, argument_rules = '{"version": 1, "arguments": {"p_by_id": {"type": "boolean", "check": "passed to custom.read_records_by_ids: key the document by field id or by name.", "position": 3, "not_an_id": true}, "p_limit": {"type": "integer", "check": "clamped to 1..500.", "position": 4, "not_an_id": true}, "p_offset": {"type": "integer", "check": "clamped to 0 or more.", "position": 5, "not_an_id": true}, "p_view_id": {"type": "uuid", "check": "read only as a live custom/records saved view whose organization_id = arg1, after arg1 is decided; its Table is then asked custom.assert_client_may_open; any other raises the same 23503 an invented id does.", "entity": "saved_view", "foreign": {"sqlstate": "23503", "same_as_invented": true}, "position": 2, "verified": "2026-09-24 lane GRID-PRIMITIVES — written with this body"}, "p_organization_id": {"type": "uuid", "check": "this body decides it with custom.assert_client_may_reach(arg1) — the organization wall — a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.", "entity": "organization", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "position": 1, "verified": "2026-09-24 lane GRID-PRIMITIVES — written with this body"}}, "declared_at": "2026-09-24 lane GRID-PRIMITIVES", "declared_by": "gridprim_a_view_keeps_the_order_a_person_dragged.sql"}'::jsonb where schema_name = 'custom' and function_name = 'read_records_in_view_order';

select custom.reopen_declared_doors();

do $check$
begin
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'custom' and p.proname = 'read_records_in_view_order') <> 1 then
    raise exception 'ORDER-FILTER inverse: read_records_in_view_order must have exactly one signature';
  end if;
  if not has_function_privilege('authenticated', 'custom.read_records_in_view_order(uuid, uuid, boolean, integer, integer)', 'execute') then
    raise exception 'ORDER-FILTER inverse: a signed-in person holds no EXECUTE on the order door';
  end if;
end
$check$;
