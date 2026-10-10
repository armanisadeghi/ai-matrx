-- lane: LISTRPC-ARRAYS
--
-- based-on: platform.list_rpc_once(text, jsonb) 47f577a9731f15918e7d603191635cf9fa547649a7144f0741c780aa055dee65
--
-- Fix of pagespeed3_e2: a JSON array bound to an array parameter (text[], uuid[], ...) was cast through its JSON text ('["a"]'), which is a
-- malformed array literal (22P02). A parameter whose type is an array now gets a real Postgres array literal built from the JSON elements
-- (null element -> NULL, JSON null or empty array -> NULL / '{}'). Name validation, signature, SECURITY INVOKER and everything else unchanged.
-- Inverse: migrations/inverse/listrpc_arrays_list_rpc_once_down.sql (restores the pagespeed3_e2 body)

set local lock_timeout = '2s';
set local statement_timeout = '120s';

create or replace function platform.list_rpc_once(p_fn text, p_args jsonb default '{}'::jsonb)
 returns jsonb
 language plpgsql
 stable
 set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_oid    oid;
  v_names  text[];
  v_types  oid[];
  v_keys   text[];
  v_call   text := '';
  v_result jsonb;
  i        integer;
  v_val    text;
  v_arr    text;
begin
  if p_fn is null or p_fn !~ '^[a-z][a-z0-9_]*(_scope_counts|_facets|_counts|_lane_facets)$' then
    raise exception 'list_rpc_once: % is not a count or facet function', p_fn using errcode = '22023';
  end if;
  p_args := coalesce(p_args, '{}'::jsonb);
  if jsonb_typeof(p_args) <> 'object' then
    raise exception 'list_rpc_once: p_args must be a JSON object' using errcode = '22023';
  end if;
  select coalesce(array_agg(k), '{}') into v_keys from jsonb_object_keys(p_args) k;

  -- proargtypes is an oidvector (0-based); unnest makes the 1-based array the loop below indexes
  select p.oid, p.proargnames, array(select t from unnest(p.proargtypes::oid[]) with ordinality u(t, o) order by o)
    into v_oid, v_names, v_types
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.proname = p_fn and p.proretset
     and p.proargnames is not null
     and v_keys <@ p.proargnames[1:p.pronargs]
   order by p.pronargs
   limit 1;
  if v_oid is null then
    raise exception 'list_rpc_once: no public function % takes these arguments', p_fn using errcode = '42883';
  end if;

  for i in 1 .. coalesce(array_length(v_types, 1), 0) loop
    if p_args ? v_names[i] then
      if jsonb_typeof(p_args -> v_names[i]) = 'array' and exists (select 1 from pg_type where oid = v_types[i] and typcategory = 'A') then
        -- a JSON array bound to an array parameter: build a real array literal, one quoted element each
        select '{' || coalesce(string_agg(
                 case when jsonb_typeof(e) = 'null' then 'NULL'
                      else '"' || replace(replace(e #>> '{}', '\', '\\'), '"', '\"') || '"' end, ',' order by o), '') || '}'
          into v_arr
          from jsonb_array_elements(p_args -> v_names[i]) with ordinality x(e, o);
        v_val := v_arr;
      else
        v_val := case jsonb_typeof(p_args -> v_names[i])
                   when 'null' then null
                   when 'string' then p_args ->> v_names[i]
                   else (p_args -> v_names[i])::text
                 end;
      end if;
      v_call := v_call || case when v_call = '' then '' else ', ' end
             || format('%I => %L::%s', v_names[i], v_val, v_types[i]::regtype);
    end if;
  end loop;

  execute format('select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from public.%I(%s) t', p_fn, v_call)
     into v_result;
  return v_result;
end;
$function$;

comment on function platform.list_rpc_once(text, jsonb) is
  'PAGE-SPEED-3 / LISTRPC-ARRAYS: runs one public *_scope_counts / *_facets / *_counts function once and returns all its rows as a single jsonb array (the API row cap cannot page it). Invoker rights.';
