-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- lock: custom,platform
--
-- Policy-only half of DOORACL. The normalized sweep repairs the three wrappers
-- tablenames_a recreated. It retains all currently reachable signed-in/server
-- roles, removes PUBLIC and anon, and then verifies the signed-in contract.

set local lock_timeout = '5s';
set local statement_timeout = '60s';

select * from platform.reopen_declared_doors('custom');

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
end;
$proof$;
