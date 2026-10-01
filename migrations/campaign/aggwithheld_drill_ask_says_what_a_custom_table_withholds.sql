-- lock: platform
-- lane: AGG-WITHHELD
-- based-on: platform.drill_ask(uuid, jsonb, jsonb) 42072560970056efb3fdd134cc49711045410777c9aee481000d25121d0a1fa9
--
-- AGG-WITHHELD, second file. platform.drill_ask answers a custom Table through custom.record_aggregate
-- as the seat. That door now answers a measure over a column the seat may not read as null plus a
-- `_withheld` marker (aggwithheld_a_withheld_measure_answers_as_withheld_never_an_error.sql); this
-- body carries the marker's sentence into the contract's own `says` line, so the drill shows the
-- measure as "no value" with the reason in words instead of a bare dash. REPLACES one body; nothing
-- is dropped or granted. ORDER: after that file. Inverse:
-- `migrations/inverse/aggwithheld_drill_ask_says_what_a_custom_table_withholds_down.sql`.

set local statement_timeout = '60s';

CREATE OR REPLACE FUNCTION platform.drill_ask(p_organization_id uuid, p_source jsonb, p_question jsonb DEFAULT '{}'::jsonb)
 RETURNS TABLE(kind text, groups jsonb, measures jsonb, row_count bigint, prior_groups jsonb, prior_measures jsonb, prior_row_count bigint, delta jsonb, compare jsonb, distinct_groups bigint, labels jsonb, says text, as_of timestamp with time zone)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_plan  jsonb;
  v_rows  jsonb := '[]'::jsonb;
  v_lab   jsonb := '{}'::jsonb;
  v_one   jsonb;
  v_says  text[] := '{}';
  v_ids   text[];
  v_d     jsonb;
  v_rel   jsonb;
  r       jsonb;
  v_cap   integer;
  v_n     bigint;
  v_na    bigint;
  v_limit integer;
  v_by    jsonb;
  k       text;
  v_asof  timestamptz;
  v_nall  bigint;
  v_wsay  text;
begin
  perform custom.assert_entity_door(p_organization_id, 'platform.drill_ask');
  v_plan := platform._drill_plan(p_organization_id, p_source, p_question, 'ask');

  if v_plan ? 'delegate' then
    -- ── A CUSTOM TABLE: the store's own door, as the seat ────────────────────────────────
    v_d := v_plan -> 'delegate';
    v_limit := (v_d ->> 'limit')::integer;
    select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) into v_rows
      from custom.record_aggregate(
             p_organization_id => p_organization_id, p_table_id => (p_source ->> 'id')::uuid,
             p_group_by => v_d -> 'group_by', p_measures => coalesce(v_d -> 'measures', '[]'::jsonb),
             p_bucket => v_d -> 'bucket', p_filter => coalesce(v_d -> 'filter', '{}'::jsonb),
             p_limit => v_limit, p_compare => v_d -> 'compare') x;
    -- AGG-WITHHELD: a measure over a column this seat may not read comes back null, with the
    -- store's marker beside it (`_withheld`); the contract's way to say why is `says`, so the
    -- sentence rides there — the same people-facing words the grid's withheld cell carries.
    select string_agg(distinct w.value ->> 'says', ' ') into v_wsay
      from jsonb_array_elements(v_rows) x
     cross join lateral jsonb_each(case when jsonb_typeof(x -> 'measures' -> '_withheld') = 'object'
                                        then x -> 'measures' -> '_withheld' else '{}'::jsonb end) w;
    if v_wsay is not null then
      v_says := v_says || v_wsay;
    end if;
    -- the period's group key is `<key>_<grain>` in the store and `<key>:<grain>` in the contract
    if v_d ? 'bucket' then
      k := (v_d -> 'bucket' ->> 'key') || '_' || (v_d -> 'bucket' ->> 'by');
      select coalesce(jsonb_agg(x
               || jsonb_build_object('groups', case when (x -> 'groups') ? k then ((x -> 'groups') - k) || jsonb_build_object((v_d -> 'bucket' ->> 'key') || ':' || (v_d -> 'bucket' ->> 'by'), (x -> 'groups') -> k) else x -> 'groups' end)
               || jsonb_build_object('prior_groups', case when (x -> 'prior_groups') ? k then ((x -> 'prior_groups') - k) || jsonb_build_object((v_d -> 'bucket' ->> 'key') || ':' || (v_d -> 'bucket' ->> 'by'), (x -> 'prior_groups') -> k) else x -> 'prior_groups' end)),
             '[]'::jsonb)
        into v_rows from jsonb_array_elements(v_rows) x;
    end if;
    if (select count(*) filter (where (x ->> 'row_count')::bigint > 0) from jsonb_array_elements(v_rows) x) >= v_limit
       or (select count(*) filter (where (x ->> 'prior_row_count')::bigint > 0) from jsonb_array_elements(v_rows) x) >= v_limit then
      v_says := v_says || format('Only the first %s groups (the largest by count) are shown; this table does not add up the rest yet.', v_limit);
    end if;
    return query
      select case when jsonb_array_length(v_d -> 'group_by') = 0 and not (v_d ? 'bucket') then 'total' else 'group' end,
             nullif(x -> 'groups', 'null'), nullif(x -> 'measures', 'null'), (x ->> 'row_count')::bigint,
             nullif(x -> 'prior_groups', 'null'), nullif(x -> 'prior_measures', 'null'),
             (x ->> 'prior_row_count')::bigint, nullif(x -> 'delta', 'null'), nullif(x -> 'compare', 'null'), null::bigint, '{}'::jsonb,
             case when o = 1 and cardinality(v_says) > 0 then array_to_string(v_says, ' ') end,
             null::timestamptz
        from jsonb_array_elements(v_rows) with ordinality z(x, o)
       order by case when v_plan -> 'sort' ->> 'key' is null or v_plan -> 'sort' ->> 'key' = 'count'
                     then case when lower(coalesce(v_plan -> 'sort' ->> 'direction', 'desc')) = 'asc' then (x ->> 'row_count')::numeric else -(x ->> 'row_count')::numeric end end,
                case when lower(coalesce(v_plan -> 'sort' ->> 'direction', 'asc')) = 'desc' then null else x -> 'groups' -> (v_plan -> 'sort' ->> 'key') end,
                case when lower(coalesce(v_plan -> 'sort' ->> 'direction', 'asc')) = 'desc' then x -> 'groups' -> (v_plan -> 'sort' ->> 'key') end desc,
                o;
    return;
  end if;

  -- ── A STANDARD SOURCE ──────────────────────────────────────────────────────────────────
  if v_plan ->> 'mode' = 'definer' then
    v_plan := platform._drill_run_declared(p_organization_id, p_source ->> 'token', p_question, 'ask');
    v_rows := v_plan -> 'rows';
    -- as of: the moment the summary counted through (null = counted live from the table)
    v_asof := (v_plan ->> 'as_of')::timestamptz;
  else
    -- AS THE SEAT: the table's own row security decides which rows are counted.
    execute format('select coalesce(jsonb_agg(to_jsonb(x) order by x.ord), ''[]''::jsonb) from (%s) x', v_plan ->> 'sql')
      into v_rows using v_plan -> 'params';
  end if;

  -- labels of relation groups, read as the seat through the target's own row security
  for v_rel in select x from jsonb_array_elements(coalesce(v_plan -> 'relations', '[]'::jsonb)) x loop
    select array_agg(distinct g) into v_ids
      from jsonb_array_elements(v_rows) x
      cross join lateral (values (x -> 'groups' ->> (v_rel ->> 'key')), (x -> 'prior_groups' ->> (v_rel ->> 'key'))) v(g)
     where g is not null;
    continue when v_ids is null;
    begin
      execute format('select coalesce(jsonb_object_agg(x.id, x.t), ''{}''::jsonb) from (select %I::text as id, %I::text as t from %I.%I where %I %s) x',
                     v_rel ->> 'to', v_rel ->> 'title', v_rel ->> 'schema', v_rel ->> 'table', v_rel ->> 'to',
                     case when (v_rel ->> 'uuid')::boolean then '= any ($1::uuid[])' else '::text = any ($1)' end)
        into v_one using v_ids;
      v_lab := v_lab || jsonb_build_object(v_rel ->> 'key', v_one);
    exception when insufficient_privilege then
      v_says := v_says || format('The names behind %s could not be read for you, so they show as ids.', v_rel ->> 'key');
    end;
  end loop;

  -- an answer always carries its total row, even when no row passed the filter
  if not exists (select 1 from jsonb_array_elements(v_rows) x where x ->> 'kind' = 'total' and coalesce(x -> 'groups', '{}'::jsonb) = '{}'::jsonb) then
    v_rows := v_rows || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'kind', 'total', 'groups', '{}'::jsonb, 'measures', v_plan -> 'zero', 'row_count', 0,
      'prior_groups', case when v_plan -> 'compare' is not null and jsonb_typeof(v_plan -> 'compare') = 'object' then '{}'::jsonb end,
      'prior_measures', case when jsonb_typeof(v_plan -> 'compare') = 'object' then v_plan -> 'zero' end,
      'prior_row_count', case when jsonb_typeof(v_plan -> 'compare') = 'object' then 0 end,
      'compare', case when jsonb_typeof(v_plan -> 'compare') = 'object' then v_plan -> 'compare' end,
      'distinct_groups', 0)));
  end if;
  v_cap := (v_plan ->> 'cap')::integer;
  select max((x ->> 'distinct_groups')::bigint), max((x ->> 'distinct_across')::bigint), max((x ->> 'distinct_all')::bigint) into v_n, v_na, v_nall
    from jsonb_array_elements(v_rows) x;
  -- a summary counted through a moment older than its stale line says what is not counted yet
  if v_plan ->> 'lag_says' is not null then
    v_says := v_says || (v_plan ->> 'lag_says');
  end if;
  -- thresholds (having): how many groups met them, in words; the rest are in Other
  if v_plan ->> 'having_says' is not null then
    if coalesce(v_n, 0) = 0 then
      v_says := v_says || format('No group meets the rule (%s).', v_plan ->> 'having_says');
    else
      v_says := v_says || format('%s of %s groups meet the rule (%s); the rest are added together in Other.',
                                 v_n, coalesce(v_nall, v_n), v_plan ->> 'having_says');
    end if;
  end if;
  if v_n > v_cap then
    if coalesce((v_plan ->> 'time_first')::boolean, false) then
      v_says := v_says || format('Showing the latest %s of %s periods; the %s earlier ones are added together in Other. Ask by a coarser period or a shorter window to see them one by one.',
                                 v_cap, v_n, v_n - v_cap);
    else
      v_says := v_says || format('Showing the top %s of %s groups by %s; the other %s are added together in Other. Up to %s groups are shown at once (the setting "Groups shown before Other").',
                                 v_cap, v_n, lower(coalesce(v_plan ->> 'sort_label', 'count')), v_n - v_cap, v_cap);
    end if;
  end if;
  if v_na > (v_plan ->> 'acap')::integer then
    v_says := v_says || format('Showing %s of %s columns; the other %s are added together in one Other column (the setting "Pivot columns before Other").',
                               v_plan ->> 'acap', v_na, v_na - (v_plan ->> 'acap')::integer);
  end if;

  return query
    select x ->> 'kind', nullif(x -> 'groups', 'null'), nullif(x -> 'measures', 'null'), (x ->> 'row_count')::bigint,
           nullif(x -> 'prior_groups', 'null'), nullif(x -> 'prior_measures', 'null'), (x ->> 'prior_row_count')::bigint,
           nullif(x -> 'delta', 'null'), nullif(x -> 'compare', 'null'),
           (x ->> 'distinct_groups')::bigint,
           coalesce((select jsonb_object_agg(l.key, l.value -> (coalesce(nullif(x -> 'groups', 'null'), x -> 'prior_groups') ->> l.key))
                       from jsonb_each(v_lab) l
                      where coalesce(nullif(x -> 'groups', 'null'), x -> 'prior_groups') ? l.key
                        and l.value ? (coalesce(nullif(x -> 'groups', 'null'), x -> 'prior_groups') ->> l.key)), '{}'::jsonb),
           case when x ->> 'kind' = 'total' and coalesce(nullif(x -> 'groups', 'null'), '{}'::jsonb) = '{}'::jsonb and cardinality(v_says) > 0
                then array_to_string(v_says, ' ') end,
           v_asof
      from jsonb_array_elements(v_rows) with ordinality z(x, o)
     order by o;
end
$function$
;
