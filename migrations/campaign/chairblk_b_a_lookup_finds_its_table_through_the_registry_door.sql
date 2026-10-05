-- additive: yes
-- lane: CHAIR-ENTITY-BLOCKS
-- based-on: platform._drill_lookup_words(text, text, text[], jsonb, text, text, integer) da86333f8ed1e930ec760c402ef2661c9adc4b4d8949ba86ff57052ba8bee725
-- LOCKS: one function body (CREATE OR REPLACE). Nothing else.
--
-- Found by the live check after chairblk_a: platform._drill_lookup_words asked
-- platform.entity_read_source for the lookup's table AS THE PERSON, and the registry rows are not
-- readable by a signed-in person, so every lookup answered no words (a deal's Stage had no choices).
-- It now finds the table through custom.entity_table, the door custom.entity_row_write already uses.
-- Inverse: migrations/inverse/chairblk_b_a_lookup_finds_its_table_through_the_registry_door_down.sql.

set local lock_timeout = '3s';

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
  -- the token's table through the registry's own door (custom.entity_table): the registry rows are not
  -- readable by a signed-in person directly, so platform.entity_read_source answered nothing as her
  select et.schema_name, et.table_name into s from custom.entity_table(p_token) et;
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
