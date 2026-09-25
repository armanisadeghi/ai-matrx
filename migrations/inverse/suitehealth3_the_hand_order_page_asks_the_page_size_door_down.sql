-- inverse of migrations/campaign/suitehealth3_the_hand_order_page_asks_the_page_size_door.sql — restores the body exactly as it was live on production and
-- the dev clone on 2026-09-25 (sha256 of pg_get_functiondef identical on both).

set local lock_timeout = '30s';

CREATE OR REPLACE FUNCTION custom.read_records_in_view_order(p_organization_id uuid, p_view_id uuid, p_by_id boolean DEFAULT false, p_limit integer DEFAULT 200, p_offset integer DEFAULT 0, p_filter jsonb DEFAULT NULL::jsonb)
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

