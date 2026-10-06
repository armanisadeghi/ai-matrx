-- Inverse of chairnoorg_a_a_drill_with_no_organization_reads_every_organization_she_is_in: the six prior bodies back, the helper dropped.
set local lock_timeout = '3s';

CREATE OR REPLACE FUNCTION platform.drill_rows(p_organization_id uuid, p_source jsonb, p_question jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_plan  jsonb;
  v_total bigint;
  v_rows  jsonb;
  v_n     bigint;
  v_says  text[] := '{}';
  v_d     jsonb;
  v_page  jsonb;
  v_off   integer;
  v_pres  jsonb;
begin
  perform custom.assert_entity_door(p_organization_id, 'platform.drill_rows');
  -- CHAIR-ENTITY-BLOCKS: a standard source's presentation (table_api/standard_tables). A filter on a
  -- lookup column by its words becomes the ids it compares; the browser page keeps the token's
  -- default list rule (as the Table API's page does) and reads its shown columns.
  if p_source ->> 'kind' = 'entity' then
    v_pres := platform.api_presentation(p_source ->> 'token');
  end if;
  if v_pres is not null then
    p_question := coalesce(p_question, '{}'::jsonb);
    if p_source ->> 'api' is distinct from 'true' then
      if v_pres -> 'default_list_where' <> '{}'::jsonb then
        p_question := jsonb_set(p_question, '{where}', (v_pres -> 'default_list_where') || coalesce(p_question -> 'where', '{}'::jsonb));
      end if;
      if v_pres ? 'show_columns' and not p_question ? 'columns' then
        p_question := p_question || jsonb_build_object('columns', platform._drill_shown_real(v_pres));
      end if;
    end if;
    if jsonb_typeof(p_question -> 'where') = 'object' then
      p_question := jsonb_set(p_question, '{where}', platform._drill_words_in(p_source ->> 'token', p_question -> 'where', 'where'));
    end if;
  end if;
  -- LANE7-W3A: rows she can read in other organizations that keep fields on this table, found
  -- by her own SELECT, so their organizations' fields describe them (platform._drill_resolve)
  -- (the Table API names itself with "api": true; a drill page's question is untouched)
  perform set_config('mx.api_fast', case when p_source ->> 'api' = 'true' then '1' else '' end, true);
  perform set_config('mx.api_rows', '', true);
  if p_source ->> 'kind' = 'entity' and p_source ->> 'api' = 'true' then
    perform set_config('mx.api_rows', coalesce(platform.api_sample_rows(p_source ->> 'token'), '{}')::text, true);
  end if;
  v_plan := platform._drill_plan(p_organization_id, p_source, p_question, 'rows');

  -- THE RECORDS OF A DEFINER DEFINITION (decision 14): its declared records relation, read by the
  -- definer step with the SAME filter compiler and the SAME lane rule the number was counted with,
  -- for a window, cut at the number's as_of.
  if coalesce((v_plan ->> 'records')::boolean, false) then
    return platform._drill_run_declared(p_organization_id, p_source ->> 'token', p_question, 'rows');
  end if;

  if v_plan ? 'delegate' then
    -- the SAME filter custom.record_aggregate counted with (custom.record_filter_sql), as the seat
    v_d := v_plan -> 'delegate';
    v_page := custom.read_records_page(
      p_organization_id => p_organization_id, p_table_id => (p_source ->> 'id')::uuid,
      p_filter => coalesce(v_d -> 'filter', '{}'::jsonb),
      p_sort => case when v_plan -> 'sort' ->> 'key' is not null and v_plan -> 'sort' ->> 'key' <> 'count'
                     then jsonb_build_array(jsonb_build_object('field', v_plan -> 'sort' ->> 'key', 'direction', coalesce(v_plan -> 'sort' ->> 'direction', 'asc')))
                     else '[]'::jsonb end,
      p_limit => coalesce((p_question ->> 'limit')::integer, 50), p_offset => (v_plan ->> 'offset')::integer);
    v_total := (v_page ->> 'total')::bigint;
    v_off := coalesce((v_page ->> 'offset')::integer, 0);
    return v_page || jsonb_build_object('next_offset',
      case when v_off + jsonb_array_length(coalesce(v_page -> 'rows', '[]'::jsonb)) < v_total
           then v_off + jsonb_array_length(coalesce(v_page -> 'rows', '[]'::jsonb)) end, 'as_of', null);
  end if;

  -- AS THE SEAT, ALWAYS — even for a declared definer fact: "see these records" opens only rows
  -- the seat may open, and says so when the number counted more.
  execute v_plan ->> 'sql' into v_total, v_rows using v_plan -> 'params';
  if v_pres is not null then
    v_rows := platform._drill_present_rows(p_source ->> 'token', v_rows);
  end if;
  if coalesce((v_plan ->> 'api')::boolean, false) then
    -- LANE7-W3A: the Table API's page. The count is exact up to the knob table_api/exact_count_max
    -- and "at least" past it; the next cursor is the last row's sort value and key.
    return jsonb_strip_nulls(jsonb_build_object(
      'total', least(v_total, (v_plan ->> 'count_max')::bigint),
      'estimated', case when v_total > (v_plan ->> 'count_max')::bigint then true end,
      'limit', (v_plan ->> 'limit')::integer, 'offset', (v_plan ->> 'offset')::integer,
      'rows', v_rows, 'scope', v_plan ->> 'scope',
      'next_cursor', case when jsonb_array_length(v_rows) >= (v_plan ->> 'limit')::integer
                          then jsonb_build_object('v', v_rows -> -1 -> '_k' -> 0, 'id', v_rows -> -1 -> '_k' -> 1) end,
      'columns', case when v_pres is not null then platform._drill_present(p_source ->> 'token', v_plan -> 'def' -> 'api' -> 'columns')
                      else v_plan -> 'def' -> 'api' -> 'columns' end));
  end if;
  if jsonb_array_length(v_rows) = 0 and (v_plan ->> 'offset')::integer > 0 then
    execute v_plan ->> 'count_sql' into v_total using v_plan -> 'params';
  end if;
  if v_plan ->> 'mode' = 'definer' then
    v_n := (platform._drill_run_declared(p_organization_id, p_source ->> 'token', p_question - 'limit' - 'offset' - 'sort' - 'columns', 'count') ->> 'total')::bigint;
    if v_n > v_total then
      v_says := v_says || format('%s of the %s counted are records you can open; the rest belong to other people in this organization.', v_total, v_n);
    end if;
  end if;
  v_off := (v_plan ->> 'offset')::integer;
  return jsonb_strip_nulls(jsonb_build_object(
    'total', v_total, 'limit', (v_plan ->> 'limit')::integer, 'offset', v_off, 'rows', v_rows,
    'next_offset', case when v_off + jsonb_array_length(v_rows) < v_total then v_off + jsonb_array_length(v_rows) end,
    'columns', case when v_pres ? 'show_columns' then platform._drill_shown_real(v_pres) else v_plan -> 'def' -> 'detail' -> 'columns' end,
    'says', case when cardinality(v_says) > 0 then array_to_string(v_says, ' ') end))
    || jsonb_build_object('as_of', null);   -- read live from the table: no summary moment
end
$function$
;

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
  v_pres  jsonb;
begin
  perform custom.assert_entity_door(p_organization_id, 'platform.drill_ask');
  -- CHAIR-ENTITY-BLOCKS-2: a standard source counts the rows its list shows — the token's default
  -- list rule (a directory's opted-out people are off it) and a lookup filtered by its words —
  -- exactly as platform.drill_rows reads them; the Table API ("api": true) is untouched.
  if p_source ->> 'kind' = 'entity' and p_source ->> 'api' is distinct from 'true' then
    v_pres := platform.api_presentation(p_source ->> 'token');
    if v_pres is not null then
      p_question := coalesce(p_question, '{}'::jsonb);
      if coalesce(v_pres -> 'default_list_where', '{}'::jsonb) <> '{}'::jsonb then
        p_question := jsonb_set(p_question, '{where}', (v_pres -> 'default_list_where') || coalesce(p_question -> 'where', '{}'::jsonb));
      end if;
      if jsonb_typeof(p_question -> 'where') = 'object' then
        p_question := jsonb_set(p_question, '{where}', platform._drill_words_in(p_source ->> 'token', p_question -> 'where', 'where'));
      end if;
    end if;
  end if;
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

CREATE OR REPLACE FUNCTION platform.drill_describe(p_organization_id uuid, p_source jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v jsonb;
  v_def jsonb;
  v_pres jsonb;
begin
  perform custom.assert_entity_door(p_organization_id, 'platform.drill_describe');
  -- LANE7-W3A: as in platform.drill_rows — the rows she reads elsewhere name their fields
  -- (the Table API names itself with "api": true; a drill page's question is untouched)
  perform set_config('mx.api_fast', case when p_source ->> 'api' = 'true' then '1' else '' end, true);
  perform set_config('mx.api_rows', '', true);
  if p_source ->> 'kind' = 'entity' and p_source ->> 'api' = 'true' then
    perform set_config('mx.api_rows', coalesce(platform.api_sample_rows(p_source ->> 'token'), '{}')::text, true);
  end if;
  v := platform._drill_plan(p_organization_id, p_source, null, 'describe');
  if p_source ->> 'kind' = 'table' then
    if not coalesce((v ->> 'd2')::boolean, false) then
      raise exception 'A custom Table says its own dimensions and measures once lane DRILL-CUSTOM-PARITY''s door (custom.table_dimensions) is on this database.'
        using errcode = '0A000', hint = 'Until then ask it directly: its columns are its dimensions, and count / sum_<column> its measures.';
    end if;
    execute 'select custom.table_dimensions($1, $2)' into v using p_organization_id, (p_source ->> 'id')::uuid;
    return v || jsonb_build_object('source', jsonb_build_object('kind', 'table', 'id', p_source ->> 'id'),
                                   'stale_after_knob', null,
                                   'calendar', platform.drill_calendar(p_organization_id));
  end if;
  v_def := v -> 'def';
  -- CHAIR-ENTITY-BLOCKS: a standard source's presentation (table_api/standard_tables), one answer for
  -- the browser and the Table API: its api columns presented, a choice Dimension carrying its words,
  -- the detail columns following show_columns. A token with no presentation facts is untouched.
  if p_source ->> 'kind' = 'entity' then
    v_pres := platform.api_presentation(p_source ->> 'token');
  end if;
  if v_pres is not null and v_def ? 'api' then
    v_def := jsonb_set(v_def, '{api,columns}', platform._drill_present(p_source ->> 'token', v_def -> 'api' -> 'columns'));
    v_def := jsonb_set(v_def, '{dimensions}', coalesce((
      select jsonb_agg(case
               when jsonb_typeof(v_pres -> 'choices' -> (d ->> 'from')) = 'array' then
                 d || jsonb_build_object('kind', 'choice', 'cardinality', 'low', 'choices',
                        (select coalesce(jsonb_agg(jsonb_build_object('value', w #>> '{}', 'label', w #>> '{}')), '[]'::jsonb)
                           from jsonb_array_elements(v_pres -> 'choices' -> (d ->> 'from')) w))
               when c.col ? 'choice_ids' and coalesce((c.col -> 'lookup' ->> 'replaces')::boolean, false) then
                 d || jsonb_build_object('kind', 'choice', 'cardinality', 'low', 'label', c.col ->> 'name', 'choices',
                        (select coalesce(jsonb_agg(jsonb_build_object('value', i #>> '{}', 'label', w #>> '{}') order by o), '[]'::jsonb)
                           from jsonb_array_elements(c.col -> 'choices') with ordinality e(w, o),
                                jsonb_array_elements(c.col -> 'choice_ids' -> (w #>> '{}')) i))
               else d end order by o)
        from jsonb_array_elements(coalesce(v_def -> 'dimensions', '[]'::jsonb)) with ordinality x(d, o)
        left join lateral (select y as col from jsonb_array_elements(v_def -> 'api' -> 'columns') y
                            where y ->> 'api_name' = d ->> 'from' limit 1) c on true), '[]'::jsonb));
    if v_pres ? 'show_columns' then
      v_def := jsonb_set(v_def, '{detail}', coalesce(v_def -> 'detail', '{}'::jsonb)
                 || jsonb_build_object('columns', platform._drill_shown_real(v_pres)));
    end if;
  end if;
  -- the calendar the door cuts periods in (VERIFY-DRILL-LIVE F8): screens print times in it and say it once
  return v_def || jsonb_build_object('calendar', platform.drill_calendar(p_organization_id));
end
$function$
;

CREATE OR REPLACE FUNCTION platform._drill_plan(p_organization_id uuid, p_source jsonb, p_question jsonb, p_kind text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  c_steps constant jsonb := '{"day":"1 day","week":"7 days","month":"1 month","quarter":"3 months","year":"1 year"}';
  q       jsonb := coalesce(p_question, '{}'::jsonb);
  v_def   jsonb;
  v_plan  jsonb;
  v_kind  text := p_source ->> 'kind';
  v_d2    boolean := to_regprocedure('custom.table_dimensions(uuid,uuid)') is not null;
  v_gb    jsonb := '[]';
  v_bk    jsonb;
  v_meas  jsonb := '[]';
  v_filt  jsonb := '{}';
  v_cmp   jsonb;
  e       jsonb;
  k       text;
  v_x     text;
  v_tz    text;
begin
  if p_kind not in ('describe', 'ask', 'rows') then
    raise exception '"%" is not something the drill doors do.', p_kind using errcode = '22023';
  end if;
  perform custom.assert_client_may_reach(p_organization_id, 'platform.drill_' || p_kind);
  if p_source is null or jsonb_typeof(p_source) <> 'object' or v_kind not in ('table', 'entity') then
    raise exception 'A source is {"kind": "table", "id": <a custom Table>} or {"kind": "entity", "token": <a standard table or a declared definition>}.'
      using errcode = '22023';
  end if;

  if v_kind = 'entity' then
    v_def := platform._drill_resolve(p_organization_id, p_source ->> 'token');
    v_def := platform._drill_protect(v_def, q, p_kind);   -- LANE7-W4A[p1]: protected custom fields
    if p_kind = 'describe' then
      return jsonb_build_object('def', v_def - '_c');
    end if;
    if v_def ->> 'mode' = 'definer' and p_kind = 'ask' then
      -- the answer is computed by platform._drill_run_declared, which re-resolves by key
      return jsonb_build_object('def', v_def - '_c', 'mode', 'definer');
    end if;
    -- A declared definer definition that names its RECORDS relation (decision 14) has its records
    -- read by platform._drill_run_declared: definer, the SAME filter compiler and the SAME lane rule
    -- the ask used, re-resolved by key.
    if p_kind = 'rows' and v_def ->> 'mode' = 'definer' and v_def -> '_c' ? 'records' then
      return jsonb_build_object('def', v_def - '_c', 'mode', 'definer', 'records', true);
    end if;
    -- Otherwise "see these records" is read as the seat. A declared definer fact the seat cannot read
    -- at all (a server-only rollup, lane DRILL-USAGE-PAGE) with no records relation has no records to
    -- open; say so in words rather than a permission error.
    if p_kind = 'rows' and v_def ->> 'mode' = 'definer'
       and not has_table_privilege(custom.caller_role(),
             format('%I.%I', v_def -> '_c' -> 'fact' ->> 'schema', v_def -> '_c' -> 'fact' ->> 'table'), 'select') then
      raise exception '"%" is counted from a summary only the platform reads, so its records cannot be listed here.', v_def ->> 'label'
        using errcode = '0A000',
              hint = coalesce(v_def -> 'detail' ->> 'open', 'Open the records from the screen that owns them.');
    end if;
    return platform._drill_compile(p_organization_id, v_def, q, p_kind)
           || jsonb_build_object('def', v_def - '_c', 'mode', v_def ->> 'mode');
  end if;

  -- ── A CUSTOM TABLE: the question, as custom.record_aggregate's arguments ─────────────────
  if (p_source ->> 'id') !~ '^[0-9a-fA-F-]{36}$' then
    raise exception 'A custom Table is named by its id.' using errcode = '22023';
  end if;
  if p_kind = 'describe' then
    return jsonb_build_object('d2', v_d2);
  end if;
  for k in select jsonb_object_keys(q) loop
    if not (k = any (array['by','show','where','window','compare','sort','limit','offset','lane','across','columns','path'])) then
      raise exception '"%" is not part of a question.', k using errcode = '22023';
    end if;
  end loop;
  if coalesce(q ->> 'lane', 'organization') <> 'organization' then
    raise exception 'A custom Table is counted in its organization''s lane; the other lanes come with lane DRILL-CUSTOM-PARITY.' using errcode = '0A000';
  end if;
  if q ? 'across' and jsonb_typeof(q -> 'across') <> 'null' then
    raise exception 'A custom Table does not pivot yet; that comes with lane DRILL-CUSTOM-PARITY.' using errcode = '0A000',
      hint = 'Group by both dimensions instead.';
  end if;
  v_tz := custom.agg_calendar(p_organization_id) ->> 'time_zone';

  -- where (+ a clicked period) + window -> the store's own flat filter
  for k, e in select key, value from jsonb_each(coalesce(q -> 'where', '{}'::jsonb)) loop
    if jsonb_typeof(e) = 'array' then
      raise exception 'A custom Table''s filter takes one value per column; a list comes with lane DRILL-CUSTOM-PARITY.' using errcode = '0A000';
    end if;
    if position(':' in k) > 0 then
      v_x := split_part(k, ':', 2);
      if not (c_steps ? v_x) or jsonb_typeof(e) <> 'string' then
        raise exception '"%" is a period filter: a date column, a grain, and the period''s label.', k using errcode = '22023';
      end if;
      e := jsonb_build_object('from', (e #>> '{}')::timestamptz,
                              'to', (((e #>> '{}')::timestamptz at time zone v_tz) + (c_steps ->> v_x)::interval) at time zone v_tz);
      k := split_part(k, ':', 1);
    end if;
    v_filt := v_filt || jsonb_build_object(k, e);
  end loop;
  if jsonb_typeof(q -> 'window') = 'object' and (q -> 'window') ? 'key' then
    e := q -> 'window';
    if e ? 'preset' then
      v_x := e ->> 'preset';
      if v_x !~ '^[0-9]{1,4}(h|d)$' then
        raise exception '"%" is not a window: 24h, 7d, 30d, 90d or 365d.', v_x using errcode = '22023';
      end if;
      e := jsonb_build_object('from', now() - (left(v_x, -1) || case right(v_x, 1) when 'h' then ' hours' else ' days' end)::interval, 'to', now());
    end if;
    v_filt := v_filt || jsonb_build_object(q -> 'window' ->> 'key', jsonb_strip_nulls(jsonb_build_object('from', e -> 'from', 'to', e -> 'to')));
  end if;

  -- by -> groups + at most one period
  for e in select x from jsonb_array_elements(coalesce(q -> 'by', '[]'::jsonb)) x loop
    k := e #>> '{}';
    if position(':' in k) > 0 then
      if v_bk is not null then
        raise exception 'A custom Table is cut by one period at a time.' using errcode = '0A000';
      end if;
      v_bk := jsonb_build_object('key', split_part(k, ':', 1), 'by', split_part(k, ':', 2));
    else
      v_gb := v_gb || to_jsonb(k);
    end if;
  end loop;

  -- show -> the store's measures ({op, key}); a named Measure passes once D2 reads names
  for e in select x from jsonb_array_elements(coalesce(q -> 'show', '["count"]'::jsonb)) x loop
    if jsonb_typeof(e) = 'object' then
      v_meas := v_meas || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
        'op', case e ->> 'op' when 'count_distinct' then 'unique' else e ->> 'op' end,
        'key', coalesce(e ->> 'of', e ->> 'key'))));
    elsif e #>> '{}' = 'count' then
      v_meas := v_meas || '[{"op":"count"}]'::jsonb;
    elsif (e #>> '{}') ~ '^(sum|avg|min|max|median|filled|empty|unique)_[a-zA-Z_][a-zA-Z0-9_]*$' then
      v_meas := v_meas || jsonb_build_array(jsonb_build_object(
        'op', split_part(e #>> '{}', '_', 1), 'key', substr(e #>> '{}', length(split_part(e #>> '{}', '_', 1)) + 2)));
    elsif v_d2 then
      v_meas := v_meas || jsonb_build_array(e);
    else
      raise exception 'There is no measure "%" on this table yet.', e #>> '{}' using errcode = '22023',
        hint = 'Name it as op_field (sum_amount), or count.';
    end if;
  end loop;

  if q ? 'compare' and jsonb_typeof(q -> 'compare') <> 'null' then
    v_cmp := case when jsonb_typeof(q -> 'compare') = 'string' then jsonb_build_object('against', q ->> 'compare') else q -> 'compare' end;
    if v_cmp ->> 'against' in ('prev', 'previous') then v_cmp := v_cmp || '{"against":"previous_period"}'; end if;
    if v_cmp ->> 'against' = 'yoy' then v_cmp := v_cmp || '{"against":"same_period_last_year"}'; end if;
    if not v_cmp ? 'key' and q -> 'window' ? 'key' then
      v_cmp := v_cmp || jsonb_build_object('key', q -> 'window' ->> 'key');
    end if;
  end if;

  if q ? 'sort' and not (q -> 'sort' ->> 'key' = 'count'
                         or (q -> 'sort' ->> 'key') = any (select x #>> '{}' from jsonb_array_elements(coalesce(q -> 'by', '[]')) x)) then
    raise exception 'A custom Table ranks its groups by their count until lane DRILL-CUSTOM-PARITY; sort by count or by a grouped column.'
      using errcode = '0A000';
  end if;

  return jsonb_build_object('delegate', jsonb_strip_nulls(jsonb_build_object(
    'group_by', v_gb, 'measures', v_meas, 'bucket', v_bk, 'filter', v_filt,
    'limit', coalesce((q ->> 'limit')::integer, 200), 'compare', v_cmp)),
    'sort', q -> 'sort', 'by', coalesce(q -> 'by', '[]'), 'lane', 'organization',
    'columns', q -> 'columns', 'offset', coalesce((q ->> 'offset')::integer, 0));
end
$function$
;

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
  perform custom.assert_client_may_reach(p_organization_id, case when p_kind = 'rows' then 'platform.drill_rows' else 'platform.drill_ask' end);
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

CREATE OR REPLACE FUNCTION platform.drill_calendar(p_organization_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
begin
  -- The calendar an organization's periods are cut in (time zone + week start). The drill doors run as the
  -- seat, which may not execute custom.agg_calendar; this signed-in door decides reach first.
  perform custom.assert_client_may_reach(p_organization_id, 'platform.drill_calendar');
  return custom.agg_calendar(p_organization_id);
end
$function$
;

DROP FUNCTION IF EXISTS platform._drill_reach(uuid, text, text);
