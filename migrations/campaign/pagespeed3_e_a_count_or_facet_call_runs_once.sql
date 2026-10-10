-- lane: PAGE-SPEED-3
--
-- WHY. A scope-count or facet function returns one row per (scope, organization): the member with 1,532 organizations gets 3,072 rows from
-- agx_list_scope_counts and wfx_list_scope_counts (9 sibling *_list_scope_counts functions pass the cap for that seat, 1,539 to 3,070 rows). The API
-- hands back at most 1,000 rows of a response, so lib/entity-list/readListRpc re-executed the whole function for every page: one count request, the
-- first page, then pages 2-4 = FIVE executions of the same function for one dropdown (measured 2.3 s of server time for the member's agents list).
-- THE FIX is a single-row answer: this function runs the named count/facet function ONCE and returns every row as one jsonb array, which the row cap
-- cannot truncate. Nothing is dropped (zero-count organizations stay), no signature of the 30 count/facet functions changes, and every caller of
-- readListRpc inherits it.
-- SECURITY INVOKER on purpose: the called function runs as the caller, so its own grants and its own auth.uid() checks answer exactly as a direct call
-- does (a function the caller may not execute raises 42501 here too). The name is built with %I from the catalog, never concatenated: only a function of
-- schema public whose name ends in _scope_counts, _facets, _counts or _lane_facets can be named. Arguments are matched BY NAME against the function's own
-- parameter list and cast to its own types; a key the function does not have is refused, a key left out takes the function's default.
-- It lives in platform (shared plumbing; nothing new goes in public) and PostgREST serves that schema. No grant here: it is not SECURITY DEFINER, so there is no door to declare and nothing for a client to reach beyond what it could already call.
-- Inverse: migrations/inverse/pagespeed3_e_a_count_or_facet_call_runs_once_down.sql

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
begin
  if p_fn is null or p_fn !~ '^[a-z][a-z0-9_]*(_scope_counts|_facets|_counts|_lane_facets)$' then
    raise exception 'list_rpc_once: % is not a count or facet function', p_fn using errcode = '22023';
  end if;
  p_args := coalesce(p_args, '{}'::jsonb);
  if jsonb_typeof(p_args) <> 'object' then
    raise exception 'list_rpc_once: p_args must be a JSON object' using errcode = '22023';
  end if;
  select coalesce(array_agg(k), '{}') into v_keys from jsonb_object_keys(p_args) k;

  select p.oid, p.proargnames, p.proargtypes::oid[]
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
      v_val := case jsonb_typeof(p_args -> v_names[i])
                 when 'null' then null
                 when 'string' then p_args ->> v_names[i]
                 else (p_args -> v_names[i])::text
               end;
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
  'PAGE-SPEED-3: runs one public *_scope_counts / *_facets / *_counts function once and returns all its rows as a single jsonb array (the API row cap cannot page it). Invoker rights.';
