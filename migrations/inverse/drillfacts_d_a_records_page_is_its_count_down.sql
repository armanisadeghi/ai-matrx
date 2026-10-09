-- chair-step: the inverse of migrations/campaign/drillfacts_d_a_records_page_is_its_count.sql (lane DRILL-FACTS) — puts platform._drill_run_declared back as production held it: the records' first page also computes the number's own sums (counted) and says any difference (settling). No table, grant or row is touched.
-- lane: DRILL-FACTS
-- lock: platform
-- based-on: platform._drill_run_declared(uuid, text, jsonb, text) 58dc4647496c31a5bd7c98319682d6aac99225bc32b4e21c698f6c3564941458

CREATE OR REPLACE FUNCTION platform._drill_run_declared(p_organization_id uuid, p_key text, p_question jsonb, p_kind text)
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
  v_cnt  jsonb;
  v_keys jsonb;
  v_set  jsonb := '{}'::jsonb;
  v_part text[] := '{}';
  v_says text;
  m      jsonb;
  v_d    numeric;
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
      -- the window's sums over the same filter, once (the first page): what these records add up to
      execute v_plan ->> 'sum_sql' into v_sums using v_plan -> 'params';
      -- AND THE NUMBER'S OWN SUMS for the same filter, as counted (decision 14 as amended by
      -- VERIFY-DRILL-LEDGER-RECORDS F1): a cost can land on a counted row after the count, so the
      -- records (the ledger now) and the number (the count as of as_of) are equal as of the count
      -- and any difference is SAID, measure by measure, never left for a person to discover.
      select coalesce(jsonb_agg(x -> 'key'), '[]'::jsonb) into v_keys
        from jsonb_array_elements(v_def -> 'measures') x
       where x ->> 'op' in ('sum', 'count') and coalesce((x ->> 'additive')::boolean, true) and v_sums ? (x ->> 'key');
      if jsonb_array_length(v_keys) > 0 then
        v_cnt := platform._drill_compile(p_organization_id, v_def,
                   (coalesce(p_question, '{}'::jsonb) - 'limit' - 'offset' - 'sort' - 'columns' - 'having')
                   || jsonb_build_object('by', '[]'::jsonb, 'show', v_keys), 'ask');
        execute format('select x.measures from (%s) x where x.kind = ''total'' limit 1', v_cnt ->> 'sql')
          into v_cnt using v_cnt -> 'params';
        for m in select x from jsonb_array_elements(v_def -> 'measures') x where v_keys ? (x ->> 'key') loop
          v_d := coalesce((v_sums ->> (m ->> 'key'))::numeric, 0) - coalesce((v_cnt ->> (m ->> 'key'))::numeric, 0);
          continue when v_d = 0;
          v_set := v_set || jsonb_build_object(m ->> 'key', jsonb_build_object(
                     'counted', v_cnt -> (m ->> 'key'), 'now', v_sums -> (m ->> 'key'), 'difference', v_d));
          v_part := v_part || (case when m ->> 'unit' = 'usd'
                                    then '$' || to_char(abs(v_d), 'FM999,999,999,990.00')
                                    else to_char(abs(v_d), 'FM999,999,999,999,990') || ' ' || lower(coalesce(m ->> 'label', m ->> 'key')) end
                               || case when v_d > 0 then ' more has landed' else ' has come off' end);
        end loop;
        if cardinality(v_part) > 0 then
          v_says := format('%s since the count at %s UTC. These records show the ledger now; the number shows the count until the next recount.',
                           array_to_string(v_part, '; '), to_char((v_plan ->> 'as_of')::timestamptz at time zone 'UTC', 'HH24:MI'));
        end if;
      end if;
    end if;
    -- (a record's empty value stays null: only the page's own absent keys are left out)
    return jsonb_build_object('total', v_n, 'limit', (v_plan ->> 'limit')::integer, 'offset', v_off, 'rows', v_rows,
                              'columns', v_plan -> 'columns', 'as_of', v_plan -> 'as_of')
      || case when v_off + jsonb_array_length(v_rows) < v_n
              then jsonb_build_object('next_offset', v_off + jsonb_array_length(v_rows)) else '{}'::jsonb end
      || case when v_sums is not null then jsonb_build_object('measures', v_sums) else '{}'::jsonb end
      || case when v_cnt is not null then jsonb_build_object('counted', v_cnt) else '{}'::jsonb end
      || case when v_set <> '{}'::jsonb then jsonb_build_object('settling', v_set, 'says', v_says) else '{}'::jsonb end;
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
$function$
;
