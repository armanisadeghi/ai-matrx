-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- lock: custom,platform
-- based-on: platform.reopen_declared_doors(text) a8b1cd53b5d111e7c17ebc2e73036f0b4b9bc58139b19b9f250c4d8bf0993748
--
-- A declared signed-in door must not inherit PostgreSQL's PUBLIC EXECUTE default.
-- `tablenames_a` recreated three SECURITY INVOKER overloads.  The closing pass
-- skipped them because their registry rows correctly declare a signed-in client
-- lane, leaving PUBLIC to reach anon.  Normalize that declared signed-in lane
-- before the opening pass: retain every existing signed-in/server role, remove
-- PUBLIC and anon, then let the registry restore authenticated if needed.

set local lock_timeout = '5s';
set local statement_timeout = '60s';

create or replace function platform.reopen_declared_doors(p_schema text)
 returns table(reopened text)
 language plpgsql
 security definer
 set search_path to 'pg_catalog'
as $function$
declare
  v_sig    text;
  fn       record;
  v_closed boolean;
  v_any    boolean := false;
  v_detail text;
  v_keep   text[];
  v_role   text;
begin
  select not coalesce(e.client_exposed, false) into v_closed
    from platform.schema_client_exposure e where e.schema_name = p_schema;
  if not coalesce(v_closed, false) then
    return;
  end if;

  -- A signed-in-only declaration is a positive ACL contract.  PUBLIC also
  -- reaches anon, so take it back even when the declaration makes the door
  -- legitimate.  Preserve every role already able to call it; the database
  -- records server and dashboard lanes must not lose their existing route.
  for fn in
    select p.oid::regprocedure::text as sig, p.oid, d.signed_in_callers,
           d.anonymous_callers
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace and n.nspname = p_schema
      join platform.client_callable_door d
        on d.schema_name = p_schema
       and d.function_name = p.proname
       and d.identity_argtypes = platform.door_argtypes(p.proargtypes)
     where d.signed_in_callers and not d.anonymous_callers
       and (has_function_privilege('public', p.oid, 'EXECUTE')
            or has_function_privilege('anon', p.oid, 'EXECUTE'))
  loop
    select coalesce(array_agg(r.rolname order by r.rolname), '{}'::text[])
      into v_keep
      from pg_roles r
     where r.rolname in ('authenticated', 'service_role', 'dashboard_user', 'svc_seo')
       and has_function_privilege(r.rolname, fn.oid, 'EXECUTE');

    execute format('revoke execute on function %s from public', fn.sig);
    execute format('revoke execute on function %s from anon', fn.sig);
    foreach v_role in array v_keep
    loop
      execute format('grant execute on function %s to %I', fn.sig, v_role);
    end loop;
    reopened := format('normalized %s', fn.sig);
    return next;
  end loop;

  -- A declared signed-in door that lost its grant gets it back.
  for v_sig in
    select p.oid::regprocedure::text
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace and n.nspname = p_schema
      join platform.client_callable_door d
        on d.schema_name = p_schema
       and d.function_name = p.proname
       and d.identity_argtypes = platform.door_argtypes(p.proargtypes)
     where d.signed_in_callers
       and not has_function_privilege('authenticated', p.oid, 'EXECUTE')
  loop
    v_any := true;
    execute format('grant execute on function %s to authenticated', v_sig);
    reopened := v_sig;
    return next;
  end loop;

  if exists (select 1
               from pg_proc p
               join pg_namespace n on n.oid = p.pronamespace and n.nspname = p_schema
               join platform.client_callable_door d
                 on d.schema_name = p_schema and d.function_name = p.proname
                and d.identity_argtypes = platform.door_argtypes(p.proargtypes)
              where d.signed_in_callers)
     and not has_schema_privilege('authenticated', p_schema, 'USAGE') then
    execute format('grant usage on schema %I to authenticated', p_schema);
    reopened := format('schema %s (USAGE)', p_schema);
    return next;
  end if;

  for fn in
    select p.oid::regprocedure::text as sig, p.proname as nm,
           pg_get_function_identity_arguments(p.oid) as ia
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace and n.nspname = p_schema
     where p.prokind in ('f', 'p')
       and p.prorettype not in ('pg_catalog.trigger'::regtype, 'pg_catalog.event_trigger'::regtype)
       and not exists (select 1 from pg_depend dep where dep.objid = p.oid and dep.deptype = 'e')
       and (has_function_privilege('authenticated', p.oid, 'EXECUTE')
            or has_function_privilege('anon', p.oid, 'EXECUTE')
            or has_function_privilege('public', p.oid, 'EXECUTE'))
       and not exists (select 1 from platform.client_callable_door d
                        where d.schema_name = p_schema
                          and d.function_name = p.proname
                          and d.identity_argtypes = platform.door_argtypes(p.proargtypes)
                          and (d.signed_in_callers or d.anonymous_callers))
  loop
    begin
      execute format('revoke execute on function %s from public', fn.sig);
      execute format('revoke execute on function %s from anon', fn.sig);
      execute format('revoke execute on function %s from authenticated', fn.sig);
      reopened := format('closed %s', fn.sig);
      return next;
    exception when others then
      raise warning 'platform.reopen_declared_doors(%): could NOT take the client EXECUTE grant back from % (%).', p_schema, fn.sig, sqlerrm;
      continue;
    end;
    begin
      v_detail := format('%s.%s(%s) held a client EXECUTE grant in a closed schema with no client door declaration.', p_schema, fn.nm, fn.ia);
      raise warning 'ddl_guard[undeclared_client_grant_in_a_closed_schema]: %', v_detail;
      insert into platform.ddl_guard_log(severity, rule, object_ref, command_tag, detail)
      values ('error', 'undeclared_client_grant_in_a_closed_schema',
              format('%s.%s(%s)', p_schema, fn.nm, fn.ia), 'reopen_declared_doors', v_detail);
    exception when others then
      raise warning 'ddl_guard[undeclared_client_grant_in_a_closed_schema]: announcement FAILED (%) — the client EXECUTE revoke on % DID happen; the guard needs repair.', sqlerrm, fn.sig;
    end;
  end loop;

  if v_any then
    raise notice 'platform.reopen_declared_doors(%): a revoke sweep took EXECUTE back from declared client doors and they were re-granted in the same transaction.', p_schema;
  end if;
end;
$function$;
