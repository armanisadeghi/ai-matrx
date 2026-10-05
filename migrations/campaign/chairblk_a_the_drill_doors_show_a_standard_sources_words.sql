-- additive: yes
-- lane: CHAIR-ENTITY-BLOCKS
-- based-on: platform.drill_describe(uuid, jsonb) e06b56fd4bea8596ce51303b147f7e929841ebff6172ad7957d842d2e966446c
-- based-on: platform.drill_rows(uuid, jsonb, jsonb) e42f0cea747930d0e2c24757c0072d51ca782db2cd4d83c35a1f365cf7de7321
-- based-on: custom.entity_row_write(uuid, text, uuid, jsonb, jsonb, integer, boolean) a4a929bf943009c4954cd376d7764059e6e3ef2937fccf2b23f53930d70666d4
-- LOCKS: function bodies only (CREATE OR REPLACE FUNCTION x3 + seven new SECURITY INVOKER functions,
-- which take platform's default function grants at creation). No table, trigger, grant or policy is
-- touched; nothing is tightened. The three replaced bodies keep their grants.
--
-- ONE CORE FOR A STANDARD SOURCE'S PRESENTATION (chair ruling, CHAIR-ENTITY-BLOCKS). The three
-- per-token facts in table_api/standard_tables — show_columns, choices, lookups — and, for a
-- presented token, its default_list_where, are applied INSIDE the drill doors, so the browser
-- (platform.drill_describe / drill_rows) and the Python Table API read the same answer:
--   drill_describe  api.columns presented (choice types, lookup words, choice lists read as the
--                   person, shown columns); a choice Dimension carries its words; detail.columns
--                   follows show_columns
--   drill_rows      a filter on a lookup column by its words becomes the ids it compares; each
--                   lookup column's value on a row is the word its id names (null when she cannot
--                   open that row); the browser page also keeps the token's default_list_where
--   entity_row_write a change to a lookup column by its word is turned back into the id it keeps
-- Every word is read AS THE PERSON (these helpers are SECURITY INVOKER): the column subset is a
-- presentation filter, never a permission; the tables' own row rules decide. _drill_resolve is
-- SECURITY DEFINER and so is deliberately NOT where words are read.
-- A token with none of show_columns / choices / lookups is untouched: platform.api_presentation is
-- null for it and every door answers byte-identically (the parity check below the inverse).
-- Inverse: migrations/inverse/chairblk_a_the_drill_doors_show_a_standard_sources_words_down.sql.

set local lock_timeout = '3s';

-- the token's presentation facts, or null when it has none (the knob is read through platform.knob_resolve, as the caller)
create or replace function platform.api_presentation(p_token text)
returns jsonb
language sql
stable
set search_path to 'pg_catalog'
as $function$
  select case when f ? 'show_columns' or f ? 'choices' or f ? 'lookups'
              then jsonb_strip_nulls(jsonb_build_object(
                     'show_columns', case when jsonb_typeof(f -> 'show_columns') = 'array' and jsonb_array_length(f -> 'show_columns') > 0 then f -> 'show_columns' end,
                     'choices', case when jsonb_typeof(f -> 'choices') = 'object' then f -> 'choices' end,
                     'lookups', case when jsonb_typeof(f -> 'lookups') = 'array' then f -> 'lookups' end))
                   || jsonb_build_object('default_list_where',
                        case when jsonb_typeof(f -> 'default_list_where') = 'object' then f -> 'default_list_where' else '{}'::jsonb end)
         end
    from (select platform.knob_resolve('table_api', 'standard_tables', null, null) -> p_token as f) k
   where jsonb_typeof(f) = 'object';
$function$;
comment on function platform.api_presentation(text) is
  'table_api/standard_tables presentation facts of one token (show_columns, choices, lookups, default_list_where), or null when it has none. CHAIR-ENTITY-BLOCKS.';

-- the words another table holds, read AS THE PERSON (its own row rules decide); [] when she cannot read it
create or replace function platform._drill_lookup_words(
  p_token text, p_column text, p_ids text[] default null, p_where jsonb default null,
  p_word text default null, p_sort text default null, p_limit integer default 500)
returns jsonb
language plpgsql
stable
set search_path to 'pg_catalog'
as $function$
declare
  s       record;
  v_conds text[] := '{}';
  k       text;
  v       jsonb;
  v_out   jsonb;
begin
  -- where the token's rows are read (platform.entity_read_source, SCOPES-REFS), else its registry table
  if to_regprocedure('platform.entity_read_source(text)') is not null then
    execute 'select rs.schema_name, rs.table_name from platform.entity_read_source($1) rs' into s using p_token;
  else
    select e.schema_name, e.table_name into s from platform.entity_types e where e.token = p_token and e.is_active;
  end if;
  if s.table_name is null
     or not has_table_privilege(custom.caller_role(), format('%I.%I', s.schema_name, s.table_name), 'select')
     or not has_column_privilege(custom.caller_role(), format('%I.%I', s.schema_name, s.table_name), p_column, 'select') then
    return '[]'::jsonb;
  end if;
  if p_ids is not null then
    v_conds := v_conds || format('t.id::text = any (%L::text[])', p_ids);
  elsif platform._drill_column(s.schema_name, s.table_name, 'deleted_at') is not null then
    v_conds := v_conds || 't.deleted_at is null'::text;   -- a choice list offers live rows only
  end if;
  if p_word is not null then
    v_conds := v_conds || format('(t.%I::text = %L or lower(t.%I::text) = lower(%L))', p_column, p_word, p_column, p_word);
  end if;
  for k, v in select e.key, e.value from jsonb_each(coalesce(p_where, '{}'::jsonb)) e loop
    if v = 'null'::jsonb then
      v_conds := v_conds || format('t.%I is null', k);
    elsif jsonb_typeof(v) = 'object' and v ? 'empty' then
      v_conds := v_conds || format('t.%I is %s null', k, case when (v ->> 'empty')::boolean then '' else 'not' end);
    else
      v_conds := v_conds || format('t.%I::text = %L', k, v #>> '{}');
    end if;
  end loop;
  execute format(
    'select coalesce(jsonb_agg(jsonb_build_object(''id'', x.id, ''word'', x.w) order by x.o), ''[]'') from ('
    || 'select t.id::text as id, t.%I::text as w, row_number() over (order by %s) as o from %I.%I t%s order by %s limit %s'
    || ') x where x.w is not null',
    p_column,
    case when p_sort is not null then format('t.%I nulls last, t.id', p_sort) else 't.id' end,
    s.schema_name, s.table_name,
    case when cardinality(v_conds) > 0 then ' where ' || array_to_string(v_conds, ' and ') else '' end,
    case when p_sort is not null then format('t.%I nulls last, t.id', p_sort) else 't.id' end,
    greatest(coalesce(p_limit, 500), 1))
    into v_out;
  return v_out;
end
$function$;
comment on function platform._drill_lookup_words(text, text, text[], jsonb, text, text, integer) is
  'id -> word pairs of a lookup column, read as the person (SECURITY INVOKER). CHAIR-ENTITY-BLOCKS.';

-- a token's api columns with its presentation facts applied (as the Python _present did)
create or replace function platform._drill_present(p_token text, p_cols jsonb)
returns jsonb
language plpgsql
stable
set search_path to 'pg_catalog'
as $function$
declare
  f       jsonb := platform.api_presentation(p_token);
  v_by    jsonb := '{}'::jsonb;
  v_order text[] := '{}';
  c       jsonb;
  k       text;
  v       jsonb;
  l       jsonb;
  v_api   text;
  v_col   jsonb;
  v_words jsonb;
begin
  if f is null or jsonb_typeof(p_cols) <> 'array' then
    return p_cols;
  end if;
  for c in select x from jsonb_array_elements(p_cols) x loop
    continue when c ->> 'api_name' is null;
    v_by := v_by || jsonb_build_object(c ->> 'api_name', c);
    v_order := v_order || (c ->> 'api_name');
  end loop;
  for k, v in select e.key, e.value from jsonb_each(coalesce(f -> 'choices', '{}'::jsonb)) e loop
    if v_by ? k and jsonb_typeof(v) = 'array' then
      v_by := jsonb_set(v_by, array[k], (v_by -> k) || jsonb_build_object('type', 'choice', 'choices', v));
    end if;
  end loop;
  for l in select x from jsonb_array_elements(coalesce(f -> 'lookups', '[]'::jsonb)) x loop
    continue when l ->> 'via' is null or l ->> 'token' is null or l ->> 'column' is null;
    continue when not v_by ? (l ->> 'via');   -- an id she does not read: neither are its words
    v_api := coalesce(l ->> 'api_name', l ->> 'via');
    v_col := case when v_api = l ->> 'via' then v_by -> v_api
                  else jsonb_build_object('api_name', v_api, 'writable', false, 'indexed', false, 'custom', false) end;
    v_col := v_col || jsonb_build_object(
      'name', coalesce(l ->> 'name', v_col ->> 'name', v_api),
      'type', case when coalesce((l ->> 'choice')::boolean, false) then 'choice' else coalesce(l ->> 'type', 'text') end,
      'lookup', jsonb_build_object('via', l ->> 'via', 'token', l ->> 'token', 'column', l ->> 'column',
                                   'replaces', v_api = l ->> 'via'));
    if coalesce((l ->> 'choice')::boolean, false) then
      v_words := platform._drill_lookup_words(l ->> 'token', l ->> 'column', null,
                   case when jsonb_typeof(l -> 'choices_where') = 'object' then l -> 'choices_where' end,
                   null, l ->> 'choices_sort', 500);
      select v_col || jsonb_build_object(
               'choices', coalesce(jsonb_agg(g.w order by g.first), '[]'::jsonb),
               'choice_ids', coalesce(jsonb_object_agg(g.w, g.ids), '{}'::jsonb))
        into v_col
        from (select x ->> 'word' as w, jsonb_agg(x ->> 'id' order by o) as ids, min(o) as first
                from jsonb_array_elements(v_words) with ordinality e(x, o) group by 1) g;
    end if;
    v_by := v_by || jsonb_build_object(v_api, v_col);
    if not v_api = any (v_order) then
      v_order := v_order || v_api;
    end if;
  end loop;
  if f ? 'show_columns' then
    return (select coalesce(jsonb_agg(v_by -> (n #>> '{}') order by o), '[]'::jsonb)
              from jsonb_array_elements(f -> 'show_columns') with ordinality e(n, o) where v_by ? (n #>> '{}'));
  end if;
  return (select coalesce(jsonb_agg(v_by -> n order by o), '[]'::jsonb) from unnest(v_order) with ordinality u(n, o));
end
$function$;
comment on function platform._drill_present(text, jsonb) is
  'A standard token''s api columns with table_api/standard_tables presentation applied (choices, lookups read as the person, show_columns). CHAIR-ENTITY-BLOCKS.';

-- each lookup column's value on each row: the word its id names (null when she cannot open that row)
create or replace function platform._drill_present_rows(p_token text, p_rows jsonb)
returns jsonb
language plpgsql
stable
set search_path to 'pg_catalog'
as $function$
declare
  f      jsonb := platform.api_presentation(p_token);
  l      jsonb;
  v_api  text;
  v_via  text;
  v_ids  text[];
  v_map  jsonb;
  v_out  jsonb := p_rows;
begin
  if f is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    return p_rows;
  end if;
  for l in select x from jsonb_array_elements(coalesce(f -> 'lookups', '[]'::jsonb)) x loop
    continue when l ->> 'via' is null or l ->> 'token' is null or l ->> 'column' is null;
    v_via := l ->> 'via';
    v_api := coalesce(l ->> 'api_name', v_via);
    continue when not exists (select 1 from jsonb_array_elements(v_out) r where r ? v_via);
    select array_agg(distinct r ->> v_via) into v_ids
      from jsonb_array_elements(v_out) r where r ->> v_via is not null;
    v_map := '{}'::jsonb;
    if cardinality(v_ids) > 0 then
      select coalesce(jsonb_object_agg(x ->> 'id', x ->> 'word'), '{}'::jsonb) into v_map
        from jsonb_array_elements(platform._drill_lookup_words(l ->> 'token', l ->> 'column', v_ids, null, null, null, cardinality(v_ids))) x;
    end if;
    select jsonb_agg(r || jsonb_build_object(v_api, case when r ->> v_via is null then null else v_map -> (r ->> v_via) end) order by o)
      into v_out from jsonb_array_elements(v_out) with ordinality e(r, o);
  end loop;
  return v_out;
end
$function$;
comment on function platform._drill_present_rows(text, jsonb) is
  'Rows of a standard token with each lookup column shown as the word its id names, read as the person. CHAIR-ENTITY-BLOCKS.';

-- words in, ids out: a filter (p_mode 'where') or a change (p_mode 'values') on a lookup column
create or replace function platform._drill_words_in(p_token text, p_map jsonb, p_mode text)
returns jsonb
language plpgsql
stable
set search_path to 'pg_catalog'
as $function$
declare
  f      jsonb := platform.api_presentation(p_token);
  l      jsonb;
  v_api  text;
  v_name text;
  v      jsonb;
  v_out  jsonb := p_map;
  v_ops  jsonb;
  op     text;
  ov     jsonb;
  v_ids  jsonb;
begin
  if f is null or jsonb_typeof(p_map) <> 'object' then
    return p_map;
  end if;
  for l in select x from jsonb_array_elements(coalesce(f -> 'lookups', '[]'::jsonb)) x loop
    continue when l ->> 'via' is null or l ->> 'token' is null or l ->> 'column' is null;
    v_api := coalesce(l ->> 'api_name', l ->> 'via');
    continue when not v_out ? v_api;
    v_name := coalesce(l ->> 'name', v_api);
    v := v_out -> v_api;
    if v_api <> l ->> 'via' then
      if p_mode = 'values' then
        raise exception '"%" is shown from another table, so it is changed there. Nothing was written.', v_name using errcode = '22023';
      end if;
      raise exception '"%" is shown from another table, so rows are not filtered by it yet.', v_name using errcode = '22023';
    end if;
    if v = 'null'::jsonb or v #>> '{}' = '' then
      if p_mode = 'values' then v_out := jsonb_set(v_out, array[v_api], 'null'::jsonb); end if;
      continue;
    end if;
    if p_mode = 'values' then
      v_ids := platform._drill_word_ids(l, v #>> '{}');
      if jsonb_array_length(v_ids) > 1 then
        raise exception '"%" names % different "%" rows. Send the id of the one you mean. Nothing was written.', v #>> '{}', jsonb_array_length(v_ids), v_name
          using errcode = 'PT409';
      end if;
      v_out := jsonb_set(v_out, array[v_api], v_ids -> 0);
    elsif jsonb_typeof(v) = 'array' then
      select coalesce(jsonb_agg(i), '[]'::jsonb) into v_ids
        from jsonb_array_elements(v) w2, jsonb_array_elements(platform._drill_word_ids(l, w2 #>> '{}')) i;
      v_out := jsonb_set(v_out, array[v_api], v_ids);
    elsif jsonb_typeof(v) = 'object' then
      v_ops := '{}'::jsonb;
      for op, ov in select e.key, e.value from jsonb_each(v) e loop
        if op = 'empty' then
          v_ops := v_ops || jsonb_build_object(op, ov);
        elsif op in ('eq', 'in') then
          select coalesce(jsonb_agg(i), '[]'::jsonb) into v_ids
            from jsonb_array_elements(case when jsonb_typeof(ov) = 'array' then ov else jsonb_build_array(ov) end) w2,
                 jsonb_array_elements(platform._drill_word_ids(l, w2 #>> '{}')) i;
          v_ops := v_ops || jsonb_build_object('in', v_ids);
        elsif op = 'ne' then
          v_ids := platform._drill_word_ids(l, ov #>> '{}');
          if jsonb_array_length(v_ids) <> 1 then
            raise exception '"%" names more than one "%"; filter for the ones you want instead.', ov #>> '{}', v_name using errcode = '22023';
          end if;
          v_ops := v_ops || jsonb_build_object('ne', v_ids -> 0);
        else
          raise exception '"%" is filtered by its words: a word, a list, empty, eq, ne or in.', v_name using errcode = '22023';
        end if;
      end loop;
      v_out := jsonb_set(v_out, array[v_api], v_ops);
    else
      v_out := jsonb_set(v_out, array[v_api], platform._drill_word_ids(l, v #>> '{}'));
    end if;
  end loop;
  return v_out;
end
$function$;
comment on function platform._drill_words_in(text, jsonb, text) is
  'A filter or a change on a standard token''s lookup column, by its words, turned into the ids the row keeps (read as the person). CHAIR-ENTITY-BLOCKS.';

-- the ids one word names in a lookup column (an id passes through)
create or replace function platform._drill_word_ids(p_lookup jsonb, p_word text)
returns jsonb
language plpgsql
stable
set search_path to 'pg_catalog'
as $function$
declare
  v_text  text := btrim(coalesce(p_word, ''));
  v_name  text := coalesce(p_lookup ->> 'name', p_lookup ->> 'api_name', p_lookup ->> 'via');
  v_found jsonb;
begin
  if v_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return jsonb_build_array(lower(v_text));
  end if;
  if coalesce((p_lookup ->> 'choice')::boolean, false) then
    select coalesce(jsonb_agg(x -> 'id'), '[]'::jsonb) into v_found
      from jsonb_array_elements(platform._drill_lookup_words(p_lookup ->> 'token', p_lookup ->> 'column', null,
             case when jsonb_typeof(p_lookup -> 'choices_where') = 'object' then p_lookup -> 'choices_where' end,
             v_text, p_lookup ->> 'choices_sort', 500)) x;
    if jsonb_array_length(v_found) = 0 then
      raise exception '"%" is not one of the choices of "%".', v_text, v_name
        using errcode = '22023', hint = 'The columns call lists its choices.';
    end if;
    return v_found;
  end if;
  select coalesce(jsonb_agg(x -> 'id'), '[]'::jsonb) into v_found
    from jsonb_array_elements(platform._drill_lookup_words(p_lookup ->> 'token', p_lookup ->> 'column', null, null, v_text, null, 50)) x;
  if jsonb_array_length(v_found) = 0 then
    raise exception 'Nothing called "%" that you can open is a "%" here.', v_text, v_name using errcode = '22023';
  end if;
  return v_found;
end
$function$;
comment on function platform._drill_word_ids(jsonb, text) is
  'The ids one word names in a table_api/standard_tables lookup, read as the person. CHAIR-ENTITY-BLOCKS.';

-- the real columns a shown-columns source reads: its shown columns that are columns, and each lookup's id
create or replace function platform._drill_shown_real(p_pres jsonb)
returns jsonb
language sql
immutable
set search_path to 'pg_catalog'
as $function$
  select coalesce(jsonb_agg(n order by o), '[]'::jsonb) from (
    select n, min(o) as o from (
      select s.n #>> '{}' as n, s.o * 2 as o
        from jsonb_array_elements(p_pres -> 'show_columns') with ordinality s(n, o)
       where not exists (select 1 from jsonb_array_elements(coalesce(p_pres -> 'lookups', '[]'::jsonb)) l
                          where l ->> 'api_name' = s.n #>> '{}' and l ->> 'api_name' <> l ->> 'via')
      union all
      select l ->> 'via', s.o * 2 + 1
        from jsonb_array_elements(p_pres -> 'show_columns') with ordinality s(n, o)
        join jsonb_array_elements(coalesce(p_pres -> 'lookups', '[]'::jsonb)) l
          on coalesce(l ->> 'api_name', l ->> 'via') = s.n #>> '{}' and l ->> 'via' is not null) u
     group by n) g;
$function$;

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

CREATE OR REPLACE FUNCTION custom.entity_row_write(p_organization_id uuid, p_token text, p_record_id uuid, p_columns jsonb DEFAULT '{}'::jsonb, p_custom jsonb DEFAULT '{}'::jsonb, p_expected_version integer DEFAULT NULL::integer, p_archive boolean DEFAULT NULL::boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  t        record;
  v_reg    record;
  v_row    jsonb;
  v_org    uuid;
  v_sets   text[] := '{}';
  v_args   jsonb := '[]'::jsonb;
  v_key    text;
  v_clear  text[] := '{}';
  v_patch  jsonb := '{}'::jsonb;
  v_n      int;
  v_where  text;
  v_has_ver boolean;
  v_cols   jsonb := coalesce(p_columns, '{}'::jsonb);
  v_custom jsonb := coalesce(p_custom, '{}'::jsonb);
  v_cf     jsonb;
  v_same   boolean := true;
  v_level  public.permission_level;
  v_mask   jsonb;
  v_vis    text[];
  v_decl   text[];
  v_out    jsonb;
begin
  -- the client wall is asked of an organization the call names; a change by id needs none
  if p_organization_id is not null or p_record_id is null then
    perform custom.assert_entity_door(p_organization_id, 'custom.entity_row_write');
  end if;
  select * into t from custom.entity_table(p_token);
  perform custom.assert_entity_is_organization_scoped(t.token, t.label, t.has_organization);
  select f.api_reach, f.api_writable_columns, f.create_via into v_reg from platform.api_facts(p_token) f;

  -- (How far the Table API reaches a table is the API's own question, answered before it calls
  -- this door. This door is the store's: the app's Custom fields section writes through it too.)
  if jsonb_typeof(v_cols) <> 'object' or jsonb_typeof(v_custom) <> 'object' then
    raise exception 'A write names its columns and values as {"name": value}.' using errcode = '22023';
  end if;
  -- CHAIR-ENTITY-BLOCKS: a lookup column (table_api/standard_tables) is changed by its word — a deal's
  -- stage by its name — and kept as the id that word names, read as the person.
  v_cols := platform._drill_words_in(p_token, v_cols, 'values');
  if p_record_id is null then
    if coalesce(v_reg.create_via, 'refuse') <> 'insert' then
      raise exception 'New % records are added in AI Matrx, which checks for duplicates.', t.label
        using errcode = '0A000', hint = 'This API changes records that already exist.';
    end if;
    raise exception 'New % records are not created through this API yet.', t.label using errcode = '0A000';
  end if;

  -- the row, as she may read it: its own organization, never one a caller supplies
  execute format('select to_jsonb(x) from %I.%I x where x.id = $1', t.schema_name, t.table_name)
    into v_row using p_record_id;
  v_cf := case when jsonb_typeof(v_row -> 'custom_fields') = 'object' then v_row -> 'custom_fields' else '{}'::jsonb end;
  v_row := v_row - 'custom_fields';
  if v_row is null then
    raise exception 'There is no % you can open with that id.', t.label using errcode = '02000';
  end if;
  v_org := (v_row ->> 'organization_id')::uuid;
  if p_organization_id is not null and v_org is distinct from p_organization_id then
    raise exception 'This % belongs to another organization, not to the one this call names.', t.label
      using errcode = '42501', hint = 'Leave the organization out, or name the one the record belongs to.';
  end if;

  -- real columns: only the ones the registry lists for the API
  for v_key in select k from jsonb_object_keys(v_cols) k loop
    if not (v_key = any (coalesce(v_reg.api_writable_columns, '{}'::text[]))) then
      raise exception '"%" cannot be changed through the API.', v_key
        using errcode = '42501', hint = 'Change it in AI Matrx. Nothing was written.';
    end if;
    v_sets := v_sets || format('%I = ($2->>%s)::%s', v_key, jsonb_array_length(v_args),
                               (select format_type(a.atttypid, a.atttypmod) from pg_attribute a
                                 where a.attrelid = format('%I.%I', t.schema_name, t.table_name)::regclass and a.attname = v_key));
    v_args := v_args || jsonb_build_array(v_cols -> v_key);
  end loop;

  -- custom values: a key set to null clears it (and its envelope); the author is the session's
  select string_agg(format('"%s"', k), ', ' order by k) into v_key
    from jsonb_object_keys(v_custom) k where left(k, 1) = '_';
  if v_key is not null then
    raise exception '% % kept by the store itself, so it cannot be written. Nothing was written.', v_key,
      case when position(',' in v_key) > 0 then 'are' else 'is' end
      using errcode = '22023', hint = 'Who changed a value comes from your sign-in; send only the fields you are setting.';
  end if;
  for v_key in select k from jsonb_object_keys(v_custom) k loop
    if jsonb_typeof(v_custom -> v_key) = 'null' then
      v_clear := v_clear || v_key;
    else
      v_patch := v_patch || jsonb_build_object(v_key, v_custom -> v_key);
    end if;
  end loop;
  if cardinality(v_clear) > 0 or v_patch <> '{}'::jsonb then
    v_sets := v_sets || ('custom_fields = (case when cardinality($3::text[]) > 0 then jsonb_set(coalesce(case when jsonb_typeof(custom_fields) = ''object'' then custom_fields end, ''{}''::jsonb) - $3::text[], ''{_values}'', coalesce(custom_fields -> ''_values'', ''{}''::jsonb) - $3::text[]) '
                         || 'else coalesce(case when jsonb_typeof(custom_fields) = ''object'' then custom_fields end, ''{}''::jsonb) end) || $4');
  end if;

  if p_archive is not null then
    if not t.has_deleted_at then
      raise exception '% records are never archived.', t.label using errcode = '0A000';
    end if;
    v_sets := v_sets || case when p_archive then 'deleted_at = coalesce(deleted_at, now())' else 'deleted_at = null' end;
  end if;
  if cardinality(v_sets) = 0 then
    raise exception 'Send at least one value to change.' using errcode = '22023';
  end if;

  v_has_ver := v_row ? 'version';
  if p_expected_version is not null and v_has_ver and (v_row ->> 'version')::integer is distinct from p_expected_version then
    raise exception 'Someone changed this % since you read it (it is at version %, and you sent %). Nothing was written.',
      t.label, v_row ->> 'version', p_expected_version
      using errcode = 'PT409', hint = 'Read it again, then send your change with the new version.';
  end if;
  -- A CHANGE THAT CHANGES NOTHING WRITES NOTHING: the version does not move and no history is made.
  select v_same and coalesce(bool_and((v_cf -> k) is not distinct from (v_patch -> k)), true) into v_same from jsonb_object_keys(v_patch) k;
  select v_same and coalesce(bool_and(not (v_cf ? k)), true) into v_same from unnest(v_clear) k;
  select v_same and coalesce(bool_and((v_row -> k) is not distinct from (v_cols -> k)), true) into v_same from jsonb_object_keys(v_cols) k;
  if p_archive is not null and ((v_row ->> 'deleted_at') is not null) is distinct from p_archive then
    v_same := false;
  end if;
  if not v_same then
  v_where := 'x.id = $1';
  if p_expected_version is not null then
    if not v_has_ver then
      raise exception '% records carry no version, so expected_version cannot be checked.', t.label using errcode = '22023';
    end if;
    v_where := v_where || ' and x.version = $5';
  end if;
  -- LANE7-W4B[h1]: AN HR ROW is changed through HR's own edit rule — the write gate that gates
  -- hr_employee_update today asks the signed-in person and arms this statement; with no subject
  -- employee nothing is armed and HR's guard refuses exactly as before.
  if t.schema_name = 'hr' then
    perform hr.custom_fields_write_gate(v_org, p_token, p_record_id);
  end if;
  execute format('update %I.%I x set %s where %s', t.schema_name, t.table_name, array_to_string(v_sets, ', '), v_where)
    using p_record_id, v_args, v_clear, v_patch, p_expected_version;
  get diagnostics v_n = row_count;
  if v_n = 0 then
    if p_expected_version is not null and (v_row ->> 'version')::integer is distinct from p_expected_version then
      raise exception 'Someone changed this % since you read it (it is at version %, and you sent %). Nothing was written.',
        t.label, v_row ->> 'version', p_expected_version
        using errcode = 'PT409', hint = 'Read it again, then send your change with the new version.';
    end if;
    raise exception 'You can see this %, but it is not yours to change.', t.label
      using errcode = '42501', hint = 'It takes edit access, or a share of this record with you. Nothing was written.';
  end if;
  end if;   -- (a change that changes nothing skipped the UPDATE above)

  -- WHAT THIS DOOR ANSWERS: the row and its custom values AS SHE MAY READ THEM — through
  -- custom.entity_read_mask and custom.mask_document, exactly as custom.entity_record_read
  -- answers (a field she may not read is null, with its withheld notice). The mask is asked in
  -- the row's own organization; for a row shared with her from an organization she is not a
  -- member of, that door has no answer for her, so no values are returned (`custom` absent) and
  -- the caller reads the row back through a read door.
  v_out := jsonb_build_object('id', p_record_id, 'organization_id', v_org, 'token', t.token)
           || case when v_same then '{"unchanged": true}'::jsonb else '{}'::jsonb end;
  if v_org is not null and iam.has_org_access(v_org) then
    execute format('select x.custom_fields from %I.%I x where x.id = $1', t.schema_name, t.table_name)
      into v_cf using p_record_id;
    if v_cf is null or jsonb_typeof(v_cf) <> 'object' then v_cf := '{}'::jsonb; end if;
    v_level := custom.entity_seat_level(v_org, p_token, p_record_id);
    v_mask  := custom.entity_read_mask(v_org, p_token, v_level, 'read');
    select coalesce(array_agg(x), '{}'::text[]) into v_vis  from jsonb_array_elements_text(v_mask -> 'visible') x;
    select coalesce(array_agg(x), '{}'::text[]) into v_decl from jsonb_array_elements_text(v_mask -> 'declared') x;
    v_out := v_out || jsonb_build_object('custom',
      custom.mask_document(v_cf - '_values' - '_retired', v_vis, v_mask -> 'notices', false, '{}'::jsonb, v_decl));
  end if;
  return v_out;
end
$function$
;

do $$
begin
  if platform.api_presentation('agent') is not null then
    raise exception 'a token with no presentation facts must read as none';
  end if;
  if platform.api_presentation('crm_deal') is null then
    raise exception 'crm_deal carries presentation facts in table_api/standard_tables';
  end if;
end $$;
