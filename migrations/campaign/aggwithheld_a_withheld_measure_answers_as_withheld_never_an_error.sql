-- target: production
-- additive: yes
--   It REPLACES two bodies (custom.agg_fields_readable_assert gains a DETAIL naming the column it
--   refused; custom.record_aggregate catches that refusal and answers it as a withheld state) and
--   ADDS one SECURITY INVOKER helper (custom.agg_withheld_marker, no client EXECUTE). Nothing is
--   dropped, revoked or granted. The inverse is
--   `migrations/inverse/aggwithheld_a_withheld_measure_answers_as_withheld_never_an_error_down.sql`.
-- lane: AGG-WITHHELD
-- lock: custom
-- guard: custom/system_enabled
-- based-on: custom.agg_fields_readable_assert(uuid, uuid, text[], text) de0959039821fbbfd4f5fd9e1d125e127c703ef6eee8a5293606df6fd2b22576
-- based-on: custom.record_aggregate(uuid, uuid, jsonb, jsonb, jsonb, jsonb, integer, text, jsonb) 4302620a0e02f8654b54f3acd6dc3ed2a02d4b27a41ba0f5a70c7dff6d027ae0
--
-- LANE AGG-WITHHELD (safety-net platform walk P04). test@test.com (a member) opens the Patients
-- table; a chart or summary asks custom.record_aggregate to count or add up the Insurance column,
-- which the member may not read. The door answered 42501 ("You cannot read the Insurance column...")
-- and the browser logged a 403 and a console error. THE LAW: a read never errors; a field the seat may
-- not read is WITHHELD AS A STATE (the one custom.withheld_marker already gives a cell of
-- custom.read_records_page), with the people-facing sentence, status 200.
--
--   * A MEASURE over a withheld column: that measure's value is the marker
--     {"withheld": {reason, needs, or}, "field_key", "label", "says"}; every other measure and the
--     row counts answer as before (the counts never read the withheld column).
--   * A GROUP, a date bucket, a window or a FILTER over a withheld column: the question cannot be
--     answered at all without leaking the column, so the door answers ONE row (groups {}, row_count
--     null) whose every measure is the marker. Never a number computed from the withheld column.
--
-- Every other caller of custom.agg_sql (dashboard_run's blocks, the grid summary bar, digests) still
-- gets the 42501 refusal exactly as before: only this door turns it into a state. The server lane
-- (no principal) reads every column, as before. Suite: scripts/campaign-tests/aggwithheld_green.sql.
--
-- LOCKS. create function, create or replace function: catalogue only. Not window-class.

set local statement_timeout = '60s';

CREATE OR REPLACE FUNCTION custom.agg_fields_readable_assert(p_organization_id uuid, p_table_id uuid, p_keys text[], p_required text DEFAULT 'viewer'::text)
 RETURNS void
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
-- SECURITY INVOKER on purpose: it only ever refuses, and its callers (custom.agg_sql,
-- custom.record_filter_sql) run inside definer doors, so it reads as those doors do.
-- AGG-WITHHELD: the refusal's DETAIL is `withheld:<field key>`, so the one door that answers a
-- withheld column as a state (custom.record_aggregate) knows WHICH column without reading a sentence.
declare
  v_me    uuid := custom.query_principal();
  v_level public.permission_level;
  v_label text;
  v_key   text;
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
  select coalesce(nullif(f.data ->> 'label', ''), f.data ->> 'key'), f.data ->> 'key'
    into v_label, v_key
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
            detail = 'withheld:' || v_key,
            hint = 'Leave that column out of this question, or ask somebody who is Admin on the table to move you up.';
  end if;
end;
$function$;

create function custom.agg_withheld_marker(p_organization_id uuid, p_table_id uuid, p_key text, p_required text DEFAULT 'viewer'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
-- AGG-WITHHELD: what a measure over a column this reader may not read answers INSTEAD of a number:
-- the cell marker custom.read_records_page already gives (custom.withheld_marker) plus the field's
-- label and the one people-facing sentence (custom.withheld_sentence). SECURITY INVOKER; its only
-- caller is the definer door custom.record_aggregate.
declare
  v_me    uuid := custom.query_principal();
  v_level public.permission_level;
  v_mask  jsonb;
  v_label text;
begin
  v_level := greatest(coalesce(custom.effective_level(v_me, p_organization_id, p_table_id), 'viewer'::public.permission_level),
                      coalesce(nullif(p_required, ''), 'viewer')::public.permission_level);
  v_mask := custom.read_mask_for(v_me, p_organization_id, p_table_id, v_level, 'read');
  select coalesce(nullif(f.data ->> 'label', ''), f.data ->> 'key') into v_label
    from custom.record f
   where f.organization_id = p_organization_id and f.table_id = custom.field_kernel_id()
     and f.deleted_at is null and (f.data ->> 'entity_definition_id')::uuid = p_table_id
     and f.data ->> 'key' = p_key
   limit 1;
  return custom.withheld_marker(v_mask, p_key)
         || jsonb_build_object('label', coalesce(v_label, p_key),
                               'says', coalesce(v_label, p_key) || ' ' || custom.withheld_sentence(v_mask, p_key));
end;
$function$;

comment on function custom.agg_withheld_marker(uuid, uuid, text, text) is
  'AGG-WITHHELD: the withheld state a measure over an unreadable column answers instead of a number (cell marker + label + people-facing sentence). Called only by custom.record_aggregate.';

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
  v_orig   jsonb;
  v_keep   jsonb := '[]'::jsonb;
  v_wh     jsonb := '{}'::jsonb;
  v_m      jsonb;
  v_name   text;
  v_det    text;
  v_all    jsonb;
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

  -- AGG-WITHHELD: A MEASURE OVER A COLUMN THIS READER MAY NOT READ IS A STATE, NEVER AN ERROR.
  -- Each measure's column is asked the read door's question on its own; a withheld one leaves the
  -- statement (so no number is ever computed from it) and comes back as the withheld marker under
  -- the name its answer would have had. The rest of the question answers as asked.
  v_orig := coalesce(p_measures, '[]'::jsonb);
  for v_m in select e from jsonb_array_elements(v_orig) e loop
    if jsonb_typeof(v_m) = 'object' and nullif(v_m ->> 'key', '') is not null
       and lower(coalesce(v_m ->> 'op', 'count')) <> 'count' then
      begin
        perform custom.agg_fields_readable_assert(p_organization_id, p_table_id, array[v_m ->> 'key'], p_required);
      exception when insufficient_privilege then
        get stacked diagnostics v_det = pg_exception_detail;
        if v_det is null or v_det not like 'withheld:%' then
          raise;
        end if;
        v_name := coalesce(nullif(v_m ->> 'as', ''), lower(coalesce(v_m ->> 'op', 'count')) || '_' || (v_m ->> 'key'));
        v_wh := v_wh || jsonb_build_object(v_name, custom.agg_withheld_marker(p_organization_id, p_table_id, v_m ->> 'key', p_required));
        continue;
      end;
    end if;
    v_keep := v_keep || jsonb_build_array(v_m);
  end loop;
  p_measures := v_keep;

  begin
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
      measures        := v_row.measures || v_wh;
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
           coalesce(c.e -> 'measures', custom.agg_zero(p.e -> 'measures')) || v_wh,
           coalesce((c.e ->> 'row_count')::bigint, 0),
           p.e -> 'groups',
           coalesce(p.e -> 'measures', custom.agg_zero(c.e -> 'measures')) || v_wh,
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
  return;

  exception when insufficient_privilege then
    -- AGG-WITHHELD: a GROUP, a date bucket, a window or a FILTER reads a column this reader may not
    -- read. Nothing can be counted by it without leaking it, so the question is answered as ONE
    -- row whose every measure is the withheld state — never a number, never an error. A refusal
    -- that is not about a withheld column (no `withheld:` detail) is re-raised untouched.
    get stacked diagnostics v_det = pg_exception_detail;
    if v_det is null or v_det not like 'withheld:%' then
      raise;
    end if;
    v_all := '{}'::jsonb;
    for v_m in select e from jsonb_array_elements(v_orig) e loop
      v_name := case when jsonb_typeof(v_m) = 'string' then v_m #>> '{}'
                     when lower(coalesce(v_m ->> 'op', 'count')) = 'count' then coalesce(nullif(v_m ->> 'as', ''), 'count')
                     else coalesce(nullif(v_m ->> 'as', ''), lower(coalesce(v_m ->> 'op', 'count')) || '_' || (v_m ->> 'key')) end;
      v_all := v_all || jsonb_build_object(v_name,
                 custom.agg_withheld_marker(p_organization_id, p_table_id, substr(v_det, 10), p_required));
    end loop;
    if v_all = '{}'::jsonb then
      v_all := jsonb_build_object('count',
                 custom.agg_withheld_marker(p_organization_id, p_table_id, substr(v_det, 10), p_required));
    end if;
    groups := '{}'::jsonb; measures := v_all; row_count := null;
    prior_groups := null; prior_measures := null; prior_row_count := null; delta := null; compare := null;
    return next;
    return;
  end;
end;
$function$;
