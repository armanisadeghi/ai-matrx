-- chair-step: prove no callable custom function remains anonymously executable after ACL normalization
-- lock: custom,platform
--
-- The policy-only DOORACL sweep has committed. Prove the three repaired
-- overloads retain authenticated access and that no callable custom function
-- is reachable by anon through either a direct or PUBLIC grant.

set local statement_timeout = '60s';

do $proof$
declare
  v_bad text[];
begin
  select coalesce(array_agg(p.oid::regprocedure::text order by p.oid::regprocedure::text), '{}'::text[])
    into v_bad
    from pg_proc p
   where p.oid in (
     'custom.data_home_slim(uuid, text, boolean)'::regprocedure,
     'custom.data_home_tables(uuid, boolean)'::regprocedure,
     'custom.table_list_everywhere(uuid, boolean)'::regprocedure)
     and (not has_function_privilege('authenticated', p.oid, 'EXECUTE')
          or has_function_privilege('anon', p.oid, 'EXECUTE')
          or has_function_privilege('public', p.oid, 'EXECUTE'));
  if cardinality(v_bad) <> 0 then
    raise exception 'DOORACL: signed-in-only overload ACLs are wrong: %', v_bad;
  end if;

  select coalesce(array_agg(p.oid::regprocedure::text order by p.oid::regprocedure::text), '{}'::text[])
    into v_bad
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'custom'
     and p.prokind in ('f', 'p')
     and p.prorettype not in ('pg_catalog.trigger'::regtype, 'pg_catalog.event_trigger'::regtype)
     and has_function_privilege('anon', p.oid, 'EXECUTE');
  if cardinality(v_bad) <> 0 then
    raise exception 'DOORACL: anon still executes custom function(s): %', v_bad;
  end if;
end;
$proof$;
