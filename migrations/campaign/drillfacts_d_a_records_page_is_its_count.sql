-- chair-step: lane DRILL-FACTS (owner ruling 2026-10-08, option c) — A RECORDS PAGE IS ITS COUNT. REPLACES platform._drill_run_declared by removal only: the first page of a summary-backed definition's records no longer computes the number's own sums a second time (`counted`) nor the difference between them (`settling` and its "… more has landed since the count" sentence). The records are now the same stored facts the number was counted from (drillfacts_c_usage_is_counted_from_the_execution_facts.sql), cut at the same as_of, so the two cannot differ and the screen states the moment as "as of". Every other line, the records' own sums (`measures`), as_of and the lag sentence are unchanged. No table, grant or row is touched.
-- lane: DRILL-FACTS
-- lock: platform
-- based-on: platform._drill_run_declared(uuid, text, jsonb, text) cba9959f60f4c9766b6dca50924041d7667fd39ae0a5e26ee6e5c39390b71868
--
-- APPLY ORDER: after drillfacts_c_usage_is_counted_from_the_execution_facts.sql.
-- INVERSE: migrations/inverse/drillfacts_d_a_records_page_is_its_count_down.sql

create or replace function platform._drill_run_declared(p_organization_id uuid, p_key text, p_question jsonb, p_kind text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_def  jsonb;
  v_plan jsonb;
  v_rows jsonb;
  v_n    bigint;
  v_asof timestamptz;
  v_sums jsonb;
  v_off  integer;
  v_end  timestamptz;
  v_min  numeric;
  v_lag  text;
begin
  perform platform._drill_reach(p_organization_id, 'entity', case when p_kind = 'rows' then 'platform.drill_rows' else 'platform.drill_ask' end);
  if p_kind not in ('ask', 'count', 'rows') then
    raise exception 'A declared fact is answered (ask), counted (count) or listed (rows) here.' using errcode = '22023';
  end if;
  -- re-resolved by KEY, validated again (platform.drill_definition_problems), never taken from a caller
  v_def := platform._drill_resolve(p_organization_id, p_key);
  if v_def ->> 'mode' is distinct from 'definer' then
    raise exception '"%" is read through the table''s own row security; ask platform.drill_ask.', p_key using errcode = '22023';
  end if;
  -- AS OF: how far the fact has counted (its <table>_watermark), so every answer says its moment
  if v_def -> '_c' ? 'watermark' then
    execute format('select max(covered_to) from %s', v_def -> '_c' ->> 'watermark') into v_asof;
  end if;
  if p_kind = 'rows' then
    -- THE RECORDS of a definer definition (decision 14): the declared records relation, the SAME
    -- compiler, filter and lane rule as the number; a window is required; cut at the same as_of.
    if not (v_def -> '_c' ? 'records') then
      raise exception '"%" declares no records relation, so its records are read as you.', p_key using errcode = '22023';
    end if;
    v_plan := platform._drill_compile(p_organization_id, v_def, p_question, 'rows');
    execute v_plan ->> 'count_sql' into v_n using v_plan -> 'params';
    execute v_plan ->> 'page_sql' into v_rows using v_plan -> 'params';
    v_off := (v_plan ->> 'offset')::integer;
    if v_off = 0 then
      -- the window's sums over the same filter, once (the first page): what these records add up to.
      -- The records are the SAME stored facts the number was counted from, cut at the same as_of
      -- (lane DRILL-FACTS, owner ruling 2026-10-08), so these sums ARE the number's: nothing settles.
      execute v_plan ->> 'sum_sql' into v_sums using v_plan -> 'params';
    end if;
    -- (a record's empty value stays null: only the page's own absent keys are left out)
    return jsonb_build_object('total', v_n, 'limit', (v_plan ->> 'limit')::integer, 'offset', v_off, 'rows', v_rows,
                              'columns', v_plan -> 'columns', 'as_of', v_plan -> 'as_of')
      || case when v_off + jsonb_array_length(v_rows) < v_n
              then jsonb_build_object('next_offset', v_off + jsonb_array_length(v_rows)) else '{}'::jsonb end
      || case when v_sums is not null then jsonb_build_object('measures', v_sums) else '{}'::jsonb end;
  end if;
  if p_kind = 'count' then
    v_plan := platform._drill_compile(p_organization_id, v_def, p_question, 'rows');
    execute v_plan ->> 'count_sql' into v_n using v_plan -> 'params';
    return jsonb_build_object('total', v_n);
  end if;
  v_plan := platform._drill_compile(p_organization_id, v_def, p_question, 'ask');
  execute format('select coalesce(jsonb_agg(to_jsonb(x) order by x.ord), ''[]''::jsonb) from (%s) x', v_plan ->> 'sql')
    into v_rows using v_plan -> 'params';
  -- A LAGGING COUNT IS SAID: when the summary counted through a moment older than the definition's
  -- stale line and the window asked reaches past it, the answer says how much of the window is not
  -- counted yet — never a silent short number (the rebuild schedule is behind, or has not run).
  if v_asof is not null and v_def ->> 'stale_after_knob' is not null then
    v_end := least(coalesce((v_plan -> 'params' ->> 'wt')::timestamptz, now()), now());
    v_min := platform.drill_knob(p_organization_id, v_def ->> 'stale_after_knob');
    if v_end - v_asof > make_interval(mins => v_min::integer) then
      v_lag := format('Counted through %s UTC; the last %s of this window are not counted yet (the rebuild is more than %s minutes behind).',
                      to_char(v_asof at time zone 'UTC', 'YYYY-MM-DD HH24:MI'),
                      case when v_end - v_asof < interval '2 hours' then round(extract(epoch from v_end - v_asof) / 60) || ' minutes'
                           when v_end - v_asof < interval '2 days' then round(extract(epoch from v_end - v_asof) / 3600) || ' hours'
                           else round(extract(epoch from v_end - v_asof) / 86400) || ' days' end,
                      v_min);
    end if;
  end if;
  return (v_plan - 'sql' - 'params') || jsonb_build_object('rows', v_rows, 'def', v_def - '_c', 'mode', 'definer', 'as_of', v_asof)
         || case when v_lag is not null then jsonb_build_object('lag_says', v_lag) else '{}'::jsonb end;
end
$function$;
