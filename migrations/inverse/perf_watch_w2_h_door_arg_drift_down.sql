-- chair-step: inverse of perf_watch_w2_h_door_arg_drift.sql — restores the previous ops.perf_door_sql body verbatim (a missing argument raises again and fails the whole probe run). The data_home watch keeps its corrected argument: the old name no longer exists on custom.data_home.
CREATE OR REPLACE FUNCTION ops.perf_door_sql(p_subject jsonb)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_fn regprocedure;
  v_names text[];
  v_types oid[];
  v_args jsonb := coalesce(p_subject->'args', '{}'::jsonb);
  k text;
  v_pos int;
  v_type text;
  v_parts text[] := '{}';
begin
  v_fn := to_regprocedure(format('%I.%I(%s)', p_subject->>'schema', p_subject->>'function', coalesce(p_subject->>'argtypes', '')));
  if v_fn is null then
    return null;
  end if;
  -- 1-based on both sides (an oidvector cast to oid[] keeps its 0 lower bound).
  select p.proargnames,
         (select array_agg(t order by o) from unnest(p.proargtypes) with ordinality u(t, o))
    into v_names, v_types from pg_proc p where p.oid = v_fn;
  for k in select jsonb_object_keys(v_args) loop
    v_pos := array_position(v_names, k);
    if v_pos is null then
      raise exception 'perf_door_sql: % has no argument %', v_fn, k using errcode = '42883';
    end if;
    v_type := format_type(v_types[v_pos], null);
    v_parts := v_parts || case
      when v_type = 'jsonb' then format('%I => nullif($1->%L, ''null''::jsonb)', k, k)
      when v_type = 'json' then format('%I => nullif($1->%L, ''null''::jsonb)::json', k, k)
      when v_type like '%[]' then format('%I => (case when jsonb_typeof($1->%L) = ''array'' then array(select jsonb_array_elements_text($1->%L)) end)::%s', k, k, k, v_type)
      else format('%I => ($1->>%L)::%s', k, k, v_type) end;
  end loop;
  -- WAVE 2: bytes = length of the result as JSON text (what PostgREST would send): a scalar
  -- door's value, or the sum of a set's rows. Serialising also forces the whole result to be built.
  return format('select coalesce(sum(octet_length(case when x.j ? %L and (select count(*) from jsonb_object_keys(x.j)) = 1 '
                'then (x.j -> %L)::text else x.j::text end)), 0)::bigint from (select to_jsonb(t) j from %I.%I(%s) t) x',
                p_subject->>'function', p_subject->>'function',
                p_subject->>'schema', p_subject->>'function', array_to_string(v_parts, ', '));
end;
$function$;
