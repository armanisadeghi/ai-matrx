-- Inverse of chairblk_b (CHAIR-ENTITY-BLOCKS): the body chairblk_a created.
-- based-on: platform._drill_lookup_words(text, text, text[], jsonb, text, text, integer) 056a559c72f12fdc728e7abe02f91254dbc6b3121d42831703a2d6b6a7887f00

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
     or not has_table_privilege(current_user, format('%I.%I', s.schema_name, s.table_name), 'select')
     or not has_column_privilege(current_user, format('%I.%I', s.schema_name, s.table_name), p_column, 'select') then
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
