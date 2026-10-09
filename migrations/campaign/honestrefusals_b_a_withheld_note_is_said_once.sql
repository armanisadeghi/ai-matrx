-- target: production
-- additive: yes
-- lane: HONEST-REFUSALS
-- lock: custom
-- guard: custom/system_enabled
-- based-on: custom.record_aggregate(uuid, uuid, jsonb, jsonb, jsonb, jsonb, integer, text, jsonb, text, text) 17a486d4ab8525e5fe789ca195a90d6a437919cc0fb9ab65e087817c183d18e4
--
-- LANE HONEST-REFUSALS 2. For a reader who may not see a confidential measure, custom.record_aggregate repeated
-- the same `_withheld` explanation (field key, label, reason, what is needed, sentence: about 330 bytes) on EVERY
-- group row. It now says it ONCE, on the first row's `measures._withheld`; every row keeps `<measure>: null`.
-- The question that cannot be answered at all (grouped/filtered by a withheld column) already returns one row.
-- Readers in the database (custom.dashboard_run, platform.drill_ask) read any row's note and are unchanged;
-- the records client (liftWithheld) lifts the one note onto every row, so the records-ui screens read the same
-- `row.withheld` as before. No grant, no argument, no column of the answer changes.
-- LOCKS: one function body replaced (CREATE OR REPLACE keeps grants).
-- Inverse: migrations/inverse/honestrefusals_b_a_withheld_note_is_said_once_down.sql.

set local statement_timeout = '60s';

CREATE OR REPLACE FUNCTION custom.record_aggregate(p_organization_id uuid, p_table_id uuid, p_group_by jsonb DEFAULT '[]'::jsonb, p_measures jsonb DEFAULT '[]'::jsonb, p_bucket jsonb DEFAULT NULL::jsonb, p_filter jsonb DEFAULT '{}'::jsonb, p_limit integer DEFAULT 200, p_required text DEFAULT 'viewer'::text, p_compare jsonb DEFAULT NULL::jsonb, p_search text DEFAULT NULL::text, p_time_zone text DEFAULT NULL::text)
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
  v_wm     jsonb := '{}'::jsonb;
  v_add    jsonb := '{}'::jsonb;
  v_m      jsonb;
  v_name   text;
  v_det    text;
  v_all    jsonb;
  v_first  boolean := true;
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
        v_wh := v_wh || jsonb_build_object(v_name, null);
        v_wm := v_wm || jsonb_build_object(v_name, custom.agg_withheld_marker(p_organization_id, p_table_id, v_m ->> 'key', p_required));
        continue;
      end;
    end if;
    v_keep := v_keep || jsonb_build_array(v_m);
  end loop;
  p_measures := v_keep;
  -- HONEST-REFUSALS 2: the withheld explanation is said ONCE (on the first row only, `measures._withheld`);
  -- every row keeps `<measure>: null`. The client lifts the one note back onto every row it belongs to.
  v_add := v_wh;

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
                                        p_bucket, v_filter, p_limit, p_required, null, p_search, p_time_zone) loop
      groups          := custom.choice_render_groups(v_map, v_row.groups);
      measures        := v_row.measures || v_add
                         || case when v_first and v_wm <> '{}'::jsonb then jsonb_build_object('_withheld', v_wm) else '{}'::jsonb end;
      v_first         := false;
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
                                                           'to', v_cmp -> v_side ->> 'to'),
                                        p_search, p_time_zone) loop
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
    select q.groups, q.measures || case when q.rn = 1 and v_wm <> '{}'::jsonb then jsonb_build_object('_withheld', v_wm) else '{}'::jsonb end,
           q.row_count, q.prior_groups, q.prior_measures, q.prior_row_count, q.delta, q.compare
      from (
    select c.e -> 'groups' as groups,
           coalesce(c.e -> 'measures', custom.agg_zero(p.e -> 'measures')) || v_add as measures,
           coalesce((c.e ->> 'row_count')::bigint, 0) as row_count,
           p.e -> 'groups' as prior_groups,
           coalesce(p.e -> 'measures', custom.agg_zero(c.e -> 'measures')) || v_add as prior_measures,
           coalesce((p.e ->> 'row_count')::bigint, 0) as prior_row_count,
           custom.agg_delta(coalesce(c.e -> 'measures', custom.agg_zero(p.e -> 'measures')),
                            coalesce(p.e -> 'measures', custom.agg_zero(c.e -> 'measures'))) as delta,
           -- The row's bucket POSITION rides with the windows, so a screen can name a
           -- position the current window has not reached yet ("week 6") without counting rows.
           v_cmp || jsonb_build_object('position', coalesce(c.e -> 'match' -> '#', p.e -> 'match' -> '#')) as compare,
           row_number() over (order by coalesce(c.e -> 'match' ->> '#', p.e -> 'match' ->> '#')::integer nulls last,
                                       coalesce((c.e ->> 'row_count')::bigint, 0) desc,
                                       coalesce((p.e ->> 'row_count')::bigint, 0) desc) as rn
      from (select e from jsonb_array_elements(v_cur) e) c
      full join (select e from jsonb_array_elements(v_pri) e) p
        on (c.e -> 'match') = (p.e -> 'match')) q
     order by q.rn;
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
    v_wm  := '{}'::jsonb;
    for v_m in select e from jsonb_array_elements(v_orig) e loop
      v_name := case when jsonb_typeof(v_m) = 'string' then v_m #>> '{}'
                     when lower(coalesce(v_m ->> 'op', 'count')) = 'count' then coalesce(nullif(v_m ->> 'as', ''), 'count')
                     else coalesce(nullif(v_m ->> 'as', ''), lower(coalesce(v_m ->> 'op', 'count')) || '_' || (v_m ->> 'key')) end;
      v_all := v_all || jsonb_build_object(v_name, null);
      v_wm  := v_wm  || jsonb_build_object(v_name,
                 custom.agg_withheld_marker(p_organization_id, p_table_id, substr(v_det, 10), p_required));
    end loop;
    if v_all = '{}'::jsonb then
      v_all := jsonb_build_object('count', null);
      v_wm  := jsonb_build_object('count',
                 custom.agg_withheld_marker(p_organization_id, p_table_id, substr(v_det, 10), p_required));
    end if;
    v_all := v_all || jsonb_build_object('_withheld', v_wm);
    groups := '{}'::jsonb; measures := v_all; row_count := null;
    prior_groups := null; prior_measures := null; prior_row_count := null; delta := null; compare := null;
    return next;
    return;
  end;
end;
$function$;
