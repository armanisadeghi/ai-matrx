-- lock: custom
-- lane: AGG-WITHHELD
-- based-on: custom.agg_fields_readable_assert(uuid, uuid, text[], text) c9ad9bf4beb48b10d84f39174f5f5f1250dcb37a19775e1226be1e19e599703a
-- based-on: custom.record_aggregate(uuid, uuid, jsonb, jsonb, jsonb, jsonb, integer, text, jsonb) f90b65ef1e57df97c4c6e4c67db66e79a518924ab19e986b25d8f10f812e8efa
-- chair-step: the inverse of aggwithheld_a_withheld_measure_answers_as_withheld_never_an_error.sql. It puts
-- back, byte for byte, the bodies of custom.agg_fields_readable_assert and custom.record_aggregate that
-- file replaced, then drops custom.agg_withheld_marker. What it undoes: a question over a column its
-- reader may not read is refused with 42501 by the record_aggregate door again, instead of answering
-- the withheld state.

set local lock_timeout = '2s';
set local statement_timeout = '60s';

CREATE OR REPLACE FUNCTION custom.agg_fields_readable_assert(p_organization_id uuid, p_table_id uuid, p_keys text[], p_required text DEFAULT 'viewer'::text)
 RETURNS void
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
-- SECURITY INVOKER on purpose: it only ever refuses, and its callers (custom.agg_sql,
-- custom.record_filter_sql) run inside definer doors, so it reads as those doors do.
declare
  v_me    uuid := custom.query_principal();
  v_level public.permission_level;
  v_label text;
  v_visible text[];
begin
  if v_me is null or p_keys is null or cardinality(p_keys) = 0 then
    return;
  end if;
  -- THE FLOOR of what this reader holds on the records the question reads: each passed the
  -- door's own `p_required` test, and the table's level lifts them all.
  v_level := greatest(coalesce(custom.effective_level(v_me, p_organization_id, p_table_id), 'viewer'::public.permission_level),
                      coalesce(nullif(p_required, ''), 'viewer')::public.permission_level);
  -- READ-MASK-ONCE: the columns this reader may read are the one mask's answer.
  select coalesce(array_agg(x #>> '{}'), '{}'::text[]) into v_visible
    from jsonb_array_elements(custom.read_mask_for(v_me, p_organization_id, p_table_id, v_level, 'read') -> 'visible') x;
  select coalesce(nullif(f.data ->> 'label', ''), f.data ->> 'key')
    into v_label
    from custom.record f
   where f.organization_id = p_organization_id
     and f.table_id = custom.field_kernel_id()
     and f.deleted_at is null
     and (f.data ->> 'entity_definition_id')::uuid = p_table_id
     and f.data ->> 'key' = any (p_keys)
     and not (f.data ->> 'key' = any (v_visible))
   order by array_position(p_keys, f.data ->> 'key')
   limit 1;
  if v_label is not null then
    raise exception 'You cannot read the % column of this table, so it cannot be counted, added up, grouped or filtered here.', v_label
      using errcode = '42501',
            hint = 'Leave that column out of this question, or ask somebody who is Admin on the table to move you up.';
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION custom.record_aggregate(p_organization_id uuid, p_table_id uuid, p_group_by jsonb DEFAULT '[]'::jsonb, p_measures jsonb DEFAULT '[]'::jsonb, p_bucket jsonb DEFAULT NULL::jsonb, p_filter jsonb DEFAULT '{}'::jsonb, p_limit integer DEFAULT 200, p_required text DEFAULT 'viewer'::text, p_compare jsonb DEFAULT NULL::jsonb)
 RETURNS TABLE(groups jsonb, measures jsonb, row_count bigint, prior_groups jsonb, prior_measures jsonb, prior_row_count bigint, delta jsonb, compare jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_map    jsonb;
  v_row    record;
  v_filter jsonb;
  v_cmp    jsonb;
  v_bkey   text;
  v_by     text;
  v_ws     text;
  v_tz     text;
  v_cur    jsonb := '[]'::jsonb;
  v_pri    jsonb := '[]'::jsonb;
  v_match  jsonb;
  v_side   text;
  v_from   timestamp;
  v_res    jsonb;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.record_aggregate');
  perform custom.assert_may_know_table(p_organization_id, p_table_id, 'custom.record_aggregate');

  -- DRILL-CUSTOM-PARITY: THE CONTRACT'S NAMES. A group may be a dimension (`status`, or a time
  -- dimension at a grain, `appointment_date:month`) and a measure may be its name
  -- (`sum_duration_minutes`, `count`, or one a table admin added) — the answer of
  -- custom.table_dimensions. They are turned into this door's own arguments HERE, once, for
  -- the reader asking, before anything is built; Field keys and {op, key} measures pass through
  -- untouched, so every older caller answers exactly as before.
  v_res := custom.drill_resolve(p_organization_id, p_table_id, p_group_by, p_measures, p_bucket);
  p_group_by := v_res -> 'group_by';
  p_measures := v_res -> 'measures';
  p_bucket   := v_res -> 'bucket';
  if p_bucket = 'null'::jsonb then p_bucket := null; end if;

  -- CHOICE-VALUE. One map per call: the filter is normalised to what is STORED before the
  -- statement is built, and the groups are named on the way out.
  v_map := custom.choice_field_map(p_organization_id, p_table_id);
  -- S2-PRIME FILTER-GROUPS: a Rule expression passes through to the one fragment; a flat map is
  -- normalised to what is stored, as before.
  v_filter := case when custom.filter_is_rule(p_filter) then p_filter
                   else custom.choice_filter_normalize(v_map, p_filter) end;

  if p_compare is null or jsonb_typeof(p_compare) = 'null' then
    for v_row in execute custom.agg_sql(p_organization_id, p_table_id, p_group_by, p_measures,
                                        p_bucket, v_filter, p_limit, p_required) loop
      groups          := custom.choice_render_groups(v_map, v_row.groups);
      measures        := v_row.measures;
      row_count       := v_row.row_count;
      prior_groups    := null;
      prior_measures  := null;
      prior_row_count := null;
      delta           := null;
      compare         := null;
      return next;
    end loop;
    return;
  end if;

  -- ── S3: THE SAME QUESTION, TWICE, UNDER THE SAME PRINCIPAL ─────────────────────────────
  v_cmp := custom.agg_compare_windows(p_organization_id, p_compare, p_bucket);
  v_tz  := v_cmp ->> 'time_zone';
  v_ws  := v_cmp ->> 'week_start';
  -- The comparison names the period, so a window on the SAME date in the filter gives way to
  -- it; every other part of the filter narrows both series alike.
  v_filter := v_filter - (v_cmp ->> 'key');
  if p_bucket is not null and jsonb_typeof(p_bucket) = 'object' then
    v_by   := lower(coalesce(p_bucket ->> 'by', 'month'));
    v_bkey := (p_bucket ->> 'key') || '_' || v_by;
  end if;

  foreach v_side in array array['window', 'prior_window'] loop
    v_from := ((v_cmp -> v_side ->> 'from')::timestamptz) at time zone v_tz;
    for v_row in execute custom.agg_sql(p_organization_id, p_table_id, p_group_by, p_measures,
                                        p_bucket, v_filter, p_limit, p_required,
                                        jsonb_build_object('key', v_cmp ->> 'key',
                                                           'from', v_cmp -> v_side ->> 'from',
                                                           'to', v_cmp -> v_side ->> 'to')) loop
      -- A group is matched by its value; a bucket by its POSITION in its own window.
      if v_bkey is null then
        v_match := coalesce(v_row.groups, '{}'::jsonb);
      else
        v_match := (coalesce(v_row.groups, '{}'::jsonb) - v_bkey)
                   || jsonb_build_object('#', case when v_row.groups ->> v_bkey is null then null else
                        custom.agg_bucket_ordinal(v_by, v_from, left(v_row.groups ->> v_bkey, 19)::timestamp, v_ws) end);
      end if;
      if v_side = 'window' then
        v_cur := v_cur || jsonb_build_array(jsonb_build_object(
          'groups', custom.choice_render_groups(v_map, v_row.groups),
          'measures', v_row.measures, 'row_count', v_row.row_count, 'match', v_match));
      else
        v_pri := v_pri || jsonb_build_array(jsonb_build_object(
          'groups', custom.choice_render_groups(v_map, v_row.groups),
          'measures', v_row.measures, 'row_count', v_row.row_count, 'match', v_match));
      end if;
    end loop;
  end loop;

  return query
    select c.e -> 'groups',
           coalesce(c.e -> 'measures', custom.agg_zero(p.e -> 'measures')),
           coalesce((c.e ->> 'row_count')::bigint, 0),
           p.e -> 'groups',
           coalesce(p.e -> 'measures', custom.agg_zero(c.e -> 'measures')),
           coalesce((p.e ->> 'row_count')::bigint, 0),
           custom.agg_delta(coalesce(c.e -> 'measures', custom.agg_zero(p.e -> 'measures')),
                            coalesce(p.e -> 'measures', custom.agg_zero(c.e -> 'measures'))),
           -- The row's bucket POSITION rides with the windows, so a screen can name a
           -- position the current window has not reached yet ("week 6") without counting rows.
           v_cmp || jsonb_build_object('position', coalesce(c.e -> 'match' -> '#', p.e -> 'match' -> '#'))
      from (select e from jsonb_array_elements(v_cur) e) c
      full join (select e from jsonb_array_elements(v_pri) e) p
        on (c.e -> 'match') = (p.e -> 'match')
     order by coalesce(c.e -> 'match' ->> '#', p.e -> 'match' ->> '#')::integer nulls last,
              coalesce((c.e ->> 'row_count')::bigint, 0) desc,
              coalesce((p.e ->> 'row_count')::bigint, 0) desc;
end;
$function$
;

drop function custom.agg_withheld_marker(uuid, uuid, text, text);
