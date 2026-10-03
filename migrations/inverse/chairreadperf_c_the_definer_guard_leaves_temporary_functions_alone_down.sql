-- chair-step: inverse of migrations/campaign/chairreadperf_c_the_definer_guard_leaves_temporary_functions_alone.sql — puts back the platform.enforce_definer_client_grants_impl body it replaced (signature, grants unchanged).
-- lane: CHAIR-READPERF
-- based-on: platform.enforce_definer_client_grants_impl(oid[], boolean, text) 37a367f65078100467c60a210eec71b20dadd421bbd2384679a4476ae774ae21
-- lock: platform

CREATE OR REPLACE FUNCTION platform.enforce_definer_client_grants_impl(p_objids oid[], p_grant boolean, p_tag text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'platform', 'public', 'pg_catalog'
AS $function$
declare
  r_oid oid;
  fn record;
  v_detail text;
  v_revoked boolean;
  v_anon_door boolean;
  v_signed_in_door boolean;
  v_lane text;
  v_keep text[];
  v_role text;
  v_refusals text[] := '{}'::text[];
  v_exempt constant text[] := array[
    'pg_catalog','information_schema','pg_toast','extensions','graphql','graphql_public',
    'pgbouncer','realtime','_realtime','storage','auth','cron','net','vault','pgsodium',
    'pgsodium_masks','supabase_functions','supabase_migrations','dashboard','pgtle','tiger',
    'tiger_data','topology'];
begin
  -- 🚨 THE FAIL-OPEN BLOCK. Everything the guard DOES lives in here, so a guard
  -- failure is still a warning and never an abort (DD-151). A REFUSAL is not a
  -- failure: it is collected and raised below, outside this handler, because a
  -- refusal that this block swallowed would be a rule nobody obeys (DD-223).
  begin
  foreach r_oid in array coalesce(p_objids, '{}'::oid[])
  loop
    begin
      select n.nspname as sch, p.proname as nm, p.prosecdef, p.prokind, p.prorettype,
             p.proargtypes::text as argtypes,
             platform.door_argtypes(p.proargtypes) as argtype_oids,
             pg_get_function_identity_arguments(p.oid) as ia, p.oid::regprocedure::text as sig,
             p.oid as oid,
             -- 🚨 READ BEFORE ANY REVOKE, because a revoke MATERIALISES an acl.
             -- `proacl is null` is the catalog's word for "nobody has ever granted
             -- anything on this function" — its EXECUTE is PUBLIC's implicit
             -- default and no client grant exists to revoke. `xmin` says the
             -- pg_proc tuple was written by THIS transaction, so the migration
             -- that is speaking right now is still mid-sentence.
             (p.proacl is null) as acl_default,
             (p.xmin = pg_current_xact_id()::xid) as newborn
        into fn
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where p.oid = r_oid;
      if not found then continue; end if;
      if not fn.prosecdef then continue; end if;
      if fn.prokind not in ('f','p') then continue; end if;
      if fn.prorettype in ('pg_catalog.trigger'::regtype, 'pg_catalog.event_trigger'::regtype) then continue; end if;
      if fn.sch = any(v_exempt) then continue; end if;
      if exists (select 1 from pg_depend d where d.objid = r_oid and d.deptype = 'e') then continue; end if;
      -- 🚨 GRANDFATHER MATCH BY ARG-TYPE OIDs — search-path-independent (hr_l3_109 fix).
      if exists (select 1 from platform.definer_client_grant_grandfather g
                  where g.schema_name = fn.sch and g.function_name = fn.nm and g.argtypes = fn.argtypes) then continue; end if;

      -- 🚨 DD-223: THE DOOR ROW IS FOUND BY THE CATALOG'S IDENTITY, never by the
      -- rendered signature. `identity_args` renders bare or schema-qualified
      -- depending on the reader's search_path, so a correctly declared door read
      -- as UNDECLARED here and this guard revoked its grant (proven, rolled back).
      -- DD-212b: the row's FLAGS, not merely its existence. NULL = no row.
      select bool_or(c.anonymous_callers), bool_or(c.signed_in_callers),
             max(c.non_client_lane)
        into v_anon_door, v_signed_in_door, v_lane
        from platform.client_callable_door c
       where c.schema_name = fn.sch and c.function_name = fn.nm
         and c.identity_argtypes = fn.argtype_oids;

      -- 🚨 DD-223: a row that declares NO CLIENT LANE is a refusal, not a
      -- stand-down. Until today the guard re-granted `authenticated` here and
      -- only CI noticed — and CI is a signal, never a gate.
      if v_anon_door is false and v_signed_in_door is false
         and has_function_privilege('authenticated', fn.oid, 'EXECUTE') then
        v_refusals := v_refusals || format(
          '%s is registered in platform.client_callable_door as a door NO CLIENT may open (signed_in_callers = false, anonymous_callers = false). The lane its row names is: %s. A client EXECUTE grant on it is refused. Either grant it to the role that lane names instead of to authenticated/anon, or — if a signed-in caller really is meant to reach it — change its row to signed_in_callers = true with a reason saying who that caller is, in the SAME migration, BEFORE the grant.',
          fn.sig, coalesce(v_lane, '(the row names no lane)'));
        continue;
      end if;

      if v_anon_door is true then
        -- A DECLARED anonymous door keeps every grant it has. That is what the flag means.
        continue;
      elsif v_anon_door is false then
        -- A DECLARED SIGNED-IN door: signed-in callers keep everything, anon loses its reach.
        if not (has_function_privilege('anon', fn.oid, 'EXECUTE')
                or has_function_privilege('public', fn.oid, 'EXECUTE')) then continue; end if;
        select coalesce(array_agg(x.rolname), '{}'::text[])
          into v_keep
          from pg_roles x
         where x.rolname in ('authenticated','service_role','dashboard_user','svc_seo')
           and has_function_privilege(x.rolname, fn.oid, 'EXECUTE');
        execute format('revoke execute on function %s from public', fn.sig);
        execute format('revoke execute on function %s from anon', fn.sig);
        foreach v_role in array v_keep
        loop
          execute format('grant execute on function %s to %I', fn.sig, v_role);
        end loop;
        begin
          v_detail := platform.definer_guard_anon_revoke_notice(
                        fn.sch, fn.nm, fn.ia, fn.sig, array_to_string(v_keep, ', '));
          raise warning 'ddl_guard[declared_signed_in_door_anon_revoked]: %', v_detail;
          insert into platform.ddl_guard_log(severity, rule, object_ref, command_tag, detail)
          values ('warn', 'declared_signed_in_door_anon_revoked',
                  format('%s.%s(%s)', fn.sch, fn.nm, fn.ia), p_tag, v_detail);
        exception when others then
          raise warning 'ddl_guard[declared_signed_in_door_anon_revoked]: announcement FAILED (%) — the anon/PUBLIC EXECUTE revoke on % DID happen; the guard needs repair.', sqlerrm, fn.sig;
        end;
        continue;
      end if;

      -- No door row at all — the §6d-4 contract, unchanged.
      execute format('revoke execute on function %s from public', fn.sig);
      execute format('revoke execute on function %s from anon', fn.sig);
      execute format('revoke execute on function %s from authenticated', fn.sig);
      -- 🚨 THE ANNOUNCEMENT (hr_l3_110) — its OWN subtransaction, so a logging failure can never
      -- roll the revoke above back, and `raise warning` can never abort the DDL.
      --
      -- 🚨 TWO DIFFERENT FACTS, TWO DIFFERENT SENTENCES (TAILS-4, 2026-09-21).
      -- Until now both arrived as `definer_client_grant_revoked`, whose words are
      -- "if you just granted it, THE GRANT DID NOT STICK". On the CREATE FUNCTION
      -- of a brand-new definer that is simply not declared YET, that sentence is
      -- false: no client grant existed, nothing a client held was taken away, and
      -- the door row and the GRANT are usually the next two statements in the very
      -- same transaction. Lane TAILS-3 read it on
      -- `custom.portal_tables(uuid)` and reported the guard as wrong, having
      -- measured afterwards that the door row exists and
      -- `has_function_privilege('authenticated', …, 'execute')` is true. It was.
      -- 549 of the 1,025 rows under this rule were still unacknowledged when this
      -- was written, which is what a warning nobody can act on turns into.
      begin
        if fn.newborn and fn.acl_default then
          -- The ordinary birth of a SECURITY DEFINER function. A notice, not a
          -- warning: there is nothing here for anybody to do unless the migration
          -- ends without declaring the door — and if it does, the GRANT it issues
          -- is what this guard refuses, loudly, on the next statement.
          v_detail := platform.definer_guard_birth_notice(fn.sch, fn.nm, fn.ia, fn.sig);
          raise notice 'ddl_guard[definer_default_public_execute_cleared_at_birth]: %', v_detail;
          insert into platform.ddl_guard_log(severity, rule, object_ref, command_tag, detail)
          values ('notice', 'definer_default_public_execute_cleared_at_birth',
                  format('%s.%s(%s)', fn.sch, fn.nm, fn.ia), p_tag, v_detail);
        else
          -- A REAL one: either the function already existed (so a client could
          -- have been calling it), or somebody GRANTed before declaring the door
          -- in this same transaction — `proacl` is not null, so an explicit grant
          -- is exactly what was just taken back. This is the sentence's own case.
          v_detail := platform.definer_guard_revoke_notice(fn.sch, fn.nm, fn.ia, fn.sig);
          raise warning 'ddl_guard[definer_client_grant_revoked]: %', v_detail;
          insert into platform.ddl_guard_log(severity, rule, object_ref, command_tag, detail)
          values ('warn', 'definer_client_grant_revoked',
                  format('%s.%s(%s)', fn.sch, fn.nm, fn.ia), p_tag, v_detail);
        end if;
      exception when others then
        raise warning 'ddl_guard[definer_client_grant_revoked]: announcement FAILED (%) — the client EXECUTE revoke on % DID happen; the guard needs repair.', sqlerrm, fn.sig;
      end;
    exception when others then null;
    end;
  end loop;

  if p_grant then
    for fn in
      select p.oid::regprocedure::text as sig, n.nspname as sch, p.proname as nm,
             pg_get_function_identity_arguments(p.oid) as ia, p.oid as oid,
             -- 🚨 DD-212b/DD-223: carried out of the filter so the loop body knows
             -- WHICH revoke to make, and matched on the catalog identity.
             (select bool_or(c.signed_in_callers) from platform.client_callable_door c
               where c.schema_name = n.nspname and c.function_name = p.proname
                 and c.identity_argtypes = platform.door_argtypes(p.proargtypes)) as signed_in_flag,
             (select max(c.non_client_lane) from platform.client_callable_door c
               where c.schema_name = n.nspname and c.function_name = p.proname
                 and c.identity_argtypes = platform.door_argtypes(p.proargtypes)) as lane,
             exists (select 1 from platform.client_callable_door c
                      where c.schema_name = n.nspname and c.function_name = p.proname
                        and c.identity_argtypes = platform.door_argtypes(p.proargtypes)) as declared
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where p.prosecdef and p.prokind in ('f','p')
         and p.prorettype not in ('pg_catalog.trigger'::regtype, 'pg_catalog.event_trigger'::regtype)
         and not (n.nspname = any(v_exempt))
         and (has_function_privilege('anon', p.oid, 'EXECUTE')
           or has_function_privilege('authenticated', p.oid, 'EXECUTE')
           or has_function_privilege('public', p.oid, 'EXECUTE'))
         and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
         -- 🚨 same argtypes match — the re-sweep MUST respect the grandfather (the hr_l3_108 bug).
         and not exists (select 1 from platform.definer_client_grant_grandfather g
                          where g.schema_name = n.nspname and g.function_name = p.proname
                            and g.argtypes = p.proargtypes::text)
         -- 🚨 DD-212b: only a door declared ANONYMOUS is exempt from the sweep. A declared
         -- SIGNED-IN door now enters it and loses anon/PUBLIC — a bare `GRANT … TO anon`
         -- on one used to fire nothing at all.
         and not exists (select 1 from platform.client_callable_door c
                          where c.schema_name = n.nspname and c.function_name = p.proname
                            and c.identity_argtypes = platform.door_argtypes(p.proargtypes)
                            and c.anonymous_callers)
         and (not exists (select 1 from platform.client_callable_door c
                           where c.schema_name = n.nspname and c.function_name = p.proname
                             and c.identity_argtypes = platform.door_argtypes(p.proargtypes))
              or has_function_privilege('anon', p.oid, 'EXECUTE')
              or has_function_privilege('public', p.oid, 'EXECUTE')
              -- 🚨 DD-223: a both-flags-false door holding an `authenticated` grant
              -- never entered this sweep at all, which is exactly why nothing
              -- refused it. It enters now, and the refusal is below.
              or exists (select 1 from platform.client_callable_door c
                          where c.schema_name = n.nspname and c.function_name = p.proname
                            and c.identity_argtypes = platform.door_argtypes(p.proargtypes)
                            and not c.signed_in_callers and not c.anonymous_callers))
    loop
      v_revoked := false;
      if fn.declared and fn.signed_in_flag is false
         and has_function_privilege('authenticated', fn.oid, 'EXECUTE') then
        -- 🚨 DD-223: declared, and declared UNREACHABLE by any client.
        v_refusals := v_refusals || format(
          '%s is registered in platform.client_callable_door as a door NO CLIENT may open (signed_in_callers = false, anonymous_callers = false). The lane its row names is: %s. A client EXECUTE grant on it is refused. Either grant it to the role that lane names instead of to authenticated/anon, or — if a signed-in caller really is meant to reach it — change its row to signed_in_callers = true with a reason saying who that caller is, in the SAME migration, BEFORE the grant.',
          fn.sig, coalesce(fn.lane, '(the row names no lane)'));
      elsif fn.declared then
        -- Declared SIGNED-IN door: take back anon/PUBLIC, hand every signed-in role back.
        begin
          select coalesce(array_agg(x.rolname), '{}'::text[])
            into v_keep
            from pg_roles x
           where x.rolname in ('authenticated','service_role','dashboard_user','svc_seo')
             and has_function_privilege(x.rolname, fn.oid, 'EXECUTE');
          execute format('revoke execute on function %s from public', fn.sig);
          execute format('revoke execute on function %s from anon', fn.sig);
          foreach v_role in array v_keep
          loop
            execute format('grant execute on function %s to %I', fn.sig, v_role);
          end loop;
          v_revoked := true;
        exception when others then v_revoked := false;
        end;
        if v_revoked then
          begin
            v_detail := platform.definer_guard_anon_revoke_notice(
                          fn.sch, fn.nm, fn.ia, fn.sig, array_to_string(v_keep, ', '));
            raise warning 'ddl_guard[declared_signed_in_door_anon_revoked]: %', v_detail;
            insert into platform.ddl_guard_log(severity, rule, object_ref, command_tag, detail)
            values ('error', 'declared_signed_in_door_anon_revoked',
                    format('%s.%s(%s)', fn.sch, fn.nm, fn.ia), p_tag, v_detail);
          exception when others then
            raise warning 'ddl_guard[declared_signed_in_door_anon_revoked]: announcement FAILED (%) — the anon/PUBLIC EXECUTE revoke on % DID happen; the guard needs repair.', sqlerrm, fn.sig;
          end;
        end if;
      else
        begin
          execute format('revoke execute on function %s from public', fn.sig);
          execute format('revoke execute on function %s from anon', fn.sig);
          execute format('revoke execute on function %s from authenticated', fn.sig);
          v_revoked := true;
        exception when others then v_revoked := false;
        end;
        -- 🚨 severity 'error' on this path: reaching it means somebody just GRANTed an undeclared
        -- definer and the guard took it straight back. Announced only when the revoke happened.
        if v_revoked then
          begin
            v_detail := platform.definer_guard_revoke_notice(fn.sch, fn.nm, fn.ia, fn.sig);
            raise warning 'ddl_guard[definer_client_grant_revoked]: %', v_detail;
            insert into platform.ddl_guard_log(severity, rule, object_ref, command_tag, detail)
            values ('error', 'definer_client_grant_revoked',
                    format('%s.%s(%s)', fn.sch, fn.nm, fn.ia), p_tag, v_detail);
          exception when others then
            raise warning 'ddl_guard[definer_client_grant_revoked]: announcement FAILED (%) — the client EXECUTE revoke on % DID happen; the guard needs repair.', sqlerrm, fn.sig;
          end;
        end if;
      end if;
    end loop;
  end if;
  exception
    when others then
      -- fail-open, but NEVER silent (DD-151): the old body swallowed into `null`.
      raise warning 'ddl_guard[definer_client_grant_revoked]: THE GUARD FAILED (%) — an undeclared client EXECUTE grant may have survived. The guard needs repair.', sqlerrm;
  end;

  -- 🚨 DD-223: OUTSIDE the fail-open handler. A refusal is a decision, not a
  -- failure, and it aborts the command that caused it.
  if coalesce(array_length(v_refusals, 1), 0) > 0 then
    raise exception 'ddl_guard[client_grant_on_a_non_client_door]: %', array_to_string(v_refusals, ' || ')
      using errcode = '42501',
            hint = 'platform.client_callable_door is the register of what a client may call. A row with signed_in_callers = false and anonymous_callers = false says, in the database, that no browser session of any kind reaches this function. §6d-4 now enforces that at grant time instead of leaving it to CI. (DD-223.)';
  end if;
end;
$function$;
