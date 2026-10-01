-- lock: custom
-- lane: AGG-WITHHELD
-- based-on: custom.agg_fields_readable_assert(uuid, uuid, text[], text) c9ad9bf4beb48b10d84f39174f5f5f1250dcb37a19775e1226be1e19e599703a
-- based-on: custom.record_aggregate(uuid, uuid, jsonb, jsonb, jsonb, jsonb, integer, text, jsonb) ee7ba48e12b4fdd3698d1bcd9bcd32d51a0cdb1b889e87cdeee29305a9aebdd1
-- based-on: custom.dashboard_run(uuid, uuid, jsonb, jsonb, text) 198c9bef00ea155f7c614300a2f093fdfdd6163c41ebfc9ce194b02830a1fe04
-- chair-step: the inverse of aggwithheld_a_withheld_measure_answers_as_withheld_never_an_error.sql. It puts
-- back, byte for byte, the bodies of custom.agg_fields_readable_assert, custom.record_aggregate and custom.dashboard_run that
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

CREATE OR REPLACE FUNCTION custom.dashboard_run(p_organization_id uuid, p_dashboard_id uuid, p_filter jsonb DEFAULT '{}'::jsonb, p_compare jsonb DEFAULT NULL::jsonb, p_grain text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_doc     jsonb;
  v_name    text;
  v_subject uuid;
  v_out     jsonb := '[]'::jsonb;
  v_rows    jsonb;
  v_block   jsonb;
  v_merged  jsonb;
  v_started timestamptz;
  v_grain   text;
  v_cmp     jsonb;
  v_windows jsonb;
  v_note    text;
  v_extra   jsonb;
  v_tgt     jsonb;
  v_mk      text;
  v_op      text;
  v_cur     numeric;
  v_pri     numeric;
  v_additive boolean;
  v_tval    numeric;
  v_tnote   text;
  b         jsonb;
  k         text;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.dashboard_run');

  select d.data into v_doc
    from custom.record d
   where d.organization_id = p_organization_id
     and d.id = p_dashboard_id
     and d.table_id = custom.presentation_kernel_id()
     and d.data_class = custom.dashboard_class()
     and d.deleted_at is null;
  if v_doc is null then
    raise exception 'There is no such dashboard in this organization.' using errcode = '02000',
            hint = 'A dashboard id from another organization reads as absent — organizations are hard walls (REC-29).',
            detail = jsonb_build_object('dashboard_id', p_dashboard_id)::text;
  end if;

  v_name    := v_doc ->> 'name';
  v_subject := nullif(v_doc ->> 'subject_table_id', '')::uuid;

  -- READING A DASHBOARD IS KNOWING ITS TABLE, and nothing more, because a dashboard holds no
  -- record: every number below is produced by custom.record_aggregate under THIS caller's own
  -- principal, and this caller could ask that door the same question about the same Table
  -- directly. Asking about the dashboard RECORD instead protected nothing and, under
  -- custom/member_default_visibility = shared_only, refused an organization's own members
  -- their own organization's dashboard (measured 2026-09-20).
  perform custom.assert_may_know_table(p_organization_id, v_subject, 'custom.dashboard_run');

  -- S3: THE CANVAS'S DATE GRAIN AND COMPARISON, judged once for the whole run — a picker that
  -- sends a grain the store does not cut is the caller's mistake, not eight blocks' mistakes.
  v_grain := lower(nullif(btrim(coalesce(p_grain, '')), ''));
  if v_grain is not null and not (v_grain = any (custom.agg_buckets())) then
    raise exception '"%" is not a date grain', v_grain
      using errcode = '22023',
            hint = format('A dashboard can be cut by %s.', array_to_string(custom.agg_buckets(), ', '));
  end if;
  if p_compare is not null and jsonb_typeof(p_compare) <> 'null' then
    perform custom.agg_compare_windows(p_organization_id,
      case when jsonb_typeof(p_compare) = 'object' and not (p_compare ? 'key')
           then p_compare || '{"key": "created_at"}'::jsonb else p_compare end, null);
  end if;

  for b in select e from jsonb_array_elements(coalesce(v_doc -> 'blocks', '[]'::jsonb)) e loop
    -- RE-JUDGED ON THE WAY OUT, NOT TRUSTED BECAUSE IT WAS JUDGED ON THE WAY IN. A Field
    -- can be deleted or renamed after a block was saved, and a block naming a Table THIS
    -- caller may not know is refused here by the same wall — so a canvas that reaches
    -- somebody else's Table loses that ONE block and answers the rest.
    begin
      v_block := custom.dashboard_block_normalize(p_organization_id, v_subject, b);
    exception when others then
      v_out := v_out || jsonb_build_object(
        'title', coalesce(b ->> 'title', 'Block'),
        'kind', coalesce(b ->> 'kind', 'number'),
        'refused', sqlerrm,
        'sqlstate', sqlstate);
      continue;
    end;

    -- ONE FILTER BAR ACROSS EVERY PANEL (SCR-16, Linear Insights). The canvas's filter is
    -- merged over each block's own, and the block's own wins on a key they share.
    v_merged := coalesce(v_block -> 'filter', '{}'::jsonb);
    if p_filter is not null and jsonb_typeof(p_filter) = 'object' then
      for k in select kk from jsonb_object_keys(p_filter) kk loop
        if not (v_merged ? k) then
          v_merged := v_merged || jsonb_build_object(k, p_filter -> k);
        end if;
      end loop;
    end if;

    -- S3: the canvas's grain re-cuts every bucketed block; the block's own comparison wins over
    -- the canvas's, as its own filter does.
    if v_grain is not null and jsonb_typeof(v_block -> 'bucket') = 'object' then
      v_block := jsonb_set(v_block, '{bucket,by}', to_jsonb(v_grain));
    end if;
    v_cmp := null; v_windows := null; v_note := null;
    if v_block ->> 'kind' <> 'stuck' then
      v_cmp := coalesce(v_block -> 'compare',
                        case when p_compare is not null and jsonb_typeof(p_compare) = 'object' then p_compare end);
      if v_cmp is not null and nullif(v_cmp ->> 'key', '') is null
         and jsonb_typeof(v_block -> 'bucket') is distinct from 'object' then
        v_note := 'This block has no date to compare along, so it shows this period alone. Give it a bucket, or give its comparison a date field.';
        v_cmp := null;
      end if;
    end if;

    v_started := clock_timestamp();
    begin
      if v_cmp is not null then
        v_windows := custom.agg_compare_windows(p_organization_id, v_cmp,
                       case when jsonb_typeof(v_block -> 'bucket') = 'object' then v_block -> 'bucket' end);
      end if;
      if v_block ->> 'kind' = 'stuck' then
        select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) into v_rows
          from custom.dashboard_stuck(p_organization_id,
                                      (v_block ->> 'table_id')::uuid,
                                      v_block ->> 'state_key',
                                      (v_block ->> 'days')::integer,
                                      v_merged,
                                      (v_block ->> 'limit')::integer,
                                      'viewer') s;
      else
        select coalesce(jsonb_agg(
                 jsonb_build_object('groups', a.groups, 'measures', a.measures, 'row_count', a.row_count)
                 || case when v_cmp is null then '{}'::jsonb else jsonb_build_object(
                      'prior_groups', a.prior_groups, 'prior_measures', a.prior_measures,
                      'prior_row_count', a.prior_row_count, 'delta', a.delta,
                      'position', a.compare -> 'position') end), '[]'::jsonb)
          into v_rows
          from custom.record_aggregate(p_organization_id,
                                       (v_block ->> 'table_id')::uuid,
                                       coalesce(v_block -> 'group_by', '[]'::jsonb),
                                       coalesce(v_block -> 'measures', '[]'::jsonb),
                                       v_block -> 'bucket',
                                       v_merged,
                                       (v_block ->> 'limit')::integer,
                                       'viewer',
                                       v_cmp) a;
      end if;
    exception when others then
      -- NOTHING FAILS SILENTLY: one block that refuses is one block that says why, and the
      -- other seven still answer. A canvas that went blank because one Field was renamed
      -- would be the screen telling a lie about the whole organization.
      v_out := v_out || (v_block || jsonb_build_object('refused', sqlerrm, 'sqlstate', sqlstate));
      continue;
    end;

    -- ── S3: the totals and the target, worked out HERE from the rows the store just answered,
    -- so the tile, the chart and the ring can never disagree with each other ─────────────
    v_extra := '{}'::jsonb;
    if v_block ->> 'kind' <> 'stuck' then
      v_tgt := v_block -> 'target';
      v_mk := coalesce(v_tgt ->> 'measure',
                       case when (v_block -> 'measures' -> 0 ->> 'op') = 'count' or (v_block -> 'measures' -> 0 ->> 'op') is null
                            then 'count' else (v_block -> 'measures' -> 0 ->> 'op') || '_' || (v_block -> 'measures' -> 0 ->> 'key') end);
      v_op := split_part(v_mk, '_', 1);
      -- A total across groups is a sum only for a measure that adds up; an average of averages
      -- is not the average, so a one-row answer is the only total such a measure has.
      v_additive := v_op in ('count', 'sum', 'filled', 'empty');
      if v_additive or jsonb_array_length(v_rows) = 1 then
        select sum(case when jsonb_typeof(r -> 'measures' -> v_mk) = 'number' then (r -> 'measures' ->> v_mk)::numeric end),
               sum(case when jsonb_typeof(r -> 'prior_measures' -> v_mk) = 'number' then (r -> 'prior_measures' ->> v_mk)::numeric end)
          into v_cur, v_pri
          from jsonb_array_elements(v_rows) r;
        v_cur := coalesce(v_cur, case when v_additive then 0 end);
        if v_cmp is not null then
          v_pri := coalesce(v_pri, case when v_additive then 0 end);
        else
          v_pri := null;
        end if;
        v_extra := v_extra || jsonb_build_object('totals', jsonb_build_object(
          'measure', v_mk, 'current', v_cur, 'prior', v_pri,
          'change', v_cur - v_pri,
          'change_pct', case when v_pri is null or v_cur is null or v_pri = 0 then null
                             else round((v_cur - v_pri) / abs(v_pri) * 100, 1) end));
      else
        v_cur := null;
      end if;
      if v_tgt is not null then
        -- S3: A TARGET READ FROM A GOAL COLUMN is that column added up over exactly the records
        -- this block's own number read — the same merged filter, the same current window, the
        -- same reader through the same door — so the goal and the number cannot disagree about
        -- which jobs they are about. A column this reader may not read refuses the TARGET by
        -- name and the block still draws its number.
        v_tval := null; v_tnote := null;
        if v_tgt ? 'field' then
          begin
            perform custom.dashboard_target_field_assert(p_organization_id, (v_block ->> 'table_id')::uuid, v_tgt ->> 'field');
            select case when jsonb_typeof(a.measures -> ((v_tgt ->> 'op') || '_' || (v_tgt ->> 'field'))) = 'number'
                        then (a.measures ->> ((v_tgt ->> 'op') || '_' || (v_tgt ->> 'field')))::numeric end
              into v_tval
              from custom.record_aggregate(p_organization_id,
                                           (v_block ->> 'table_id')::uuid,
                                           '[]'::jsonb,
                                           jsonb_build_array(jsonb_build_object('op', v_tgt ->> 'op', 'key', v_tgt ->> 'field')),
                                           null,
                                           v_merged,
                                           1,
                                           'viewer',
                                           case when v_cmp is null then null
                                                else v_cmp || jsonb_build_object('key',
                                                       coalesce(nullif(v_cmp ->> 'key', ''), v_block -> 'bucket' ->> 'key')) end) a
             limit 1;
            if v_tval is null and v_tgt ->> 'op' = 'sum' then v_tval := 0; end if;
          exception when others then
            v_tval := null;
            v_tnote := sqlerrm;
          end;
        else
          v_tval := (v_tgt ->> 'value')::numeric;
        end if;
        v_extra := v_extra || jsonb_build_object('target', v_tgt || jsonb_build_object(
          'value', v_tval,
          'current', v_cur,
          'progress', case when v_cur is null or v_tval is null or v_tval = 0 then null
                           else round(v_cur / v_tval, 4) end,
          'pace', case
            when v_tval is null then null
            when jsonb_typeof(v_block -> 'bucket') is distinct from 'object' then null
            when v_tgt ->> 'per' = 'bucket' then v_tval
            when coalesce((v_windows ->> 'bucket_count')::integer, 0) > 0
              then round(v_tval / (v_windows ->> 'bucket_count')::integer, 2)
            else null end)
          || case when v_tnote is null then '{}'::jsonb else jsonb_build_object('refused', v_tnote) end);
      end if;
    end if;

    v_out := v_out || (v_block || v_extra || jsonb_build_object(
      'rows', v_rows,
      'filter', v_merged,
      'compare', v_windows,
      'ms', round(extract(epoch from (clock_timestamp() - v_started)) * 1000.0, 1))
      || case when v_note is null then '{}'::jsonb else jsonb_build_object('compare_refused', v_note) end);
  end loop;

  return jsonb_build_object(
    'dashboard_id', p_dashboard_id,
    'name', v_name,
    'subject_table_id', v_subject,
    'presentation', coalesce(v_doc -> 'presentation', '{}'::jsonb),
    'filter', coalesce(p_filter, '{}'::jsonb),
    'grain', v_grain,
    'compare', case when jsonb_typeof(p_compare) = 'object' then p_compare end,
    'calendar', custom.agg_calendar(p_organization_id),
    'blocks', v_out);
end;
$function$
;

drop function custom.agg_withheld_marker(uuid, uuid, text, text);
