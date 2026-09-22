-- chair-step: THIS FILE'S WHOLE JOB IS A REVOKE, which the additive allow-list refuses by name and rightly so. 31 functions in schemas `custom` and `history` hold a client EXECUTE grant that nobody decided: Postgres's default PUBLIC grant on 10 of them (`custom.delete_cascade_closure` among them) and one blanket `GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA history TO authenticated` on the other 21. Both schemas are declared CLOSED in `platform.schema_client_exposure`, which until now was a sentence with nothing acting on it. This file takes those undeclared grants back, in both schemas (so `-- allows: revoke <one schema>` cannot express it), and brings the `history.row_versions_*` partitions level with their parent, which grants `authenticated` SELECT and never granted it INSERT/UPDATE/DELETE. Nothing DECLARED loses anything: the closing pass skips every function with a `platform.client_callable_door` row opening a client lane, the file's own exit proof fails the whole transaction if one undeclared function is still reachable, and `platform.reopen_declared_doors(schema)` hands the grant straight back the moment a declaration lands. Measured 2026-09-19: no signed-in client calls ANY of the 31 anywhere in matrx-frontend or aidream; the store's history verbs are reached from `custom`'s SECURITY DEFINER doors, which run as the owner.
-- based-on: platform.reopen_declared_doors(text) d62d4e3b5cbc55456ac0b697d2598e35501f42825093a018d527f1ba202905f4
-- based-on: custom.reopen_declared_doors() 657191c9fe3d6de514cc4c120cd3fafab424efac5ca445bc3e8cc639bdde2695
-- based-on: platform._reopen_declared_doors_after_revoke() ca0afc68e4cff9f3945b72807a560b41556eebef93a73245c35f28191a20c82f
--
-- OPEN-CENSUS — A CLOSED SCHEMA CLOSES ITSELF.
--
-- THE DEFECT, measured live on the main database on 2026-09-19.
-- `platform.schema_client_exposure` declares schema `custom` CLOSED: "the only reach
-- into it is as the table owner" until the switch checklist opens it deliberately, and
-- `platform.client_callable_door` is the register of the exceptions. But the only thing
-- that ever ACTED on that declaration was `platform.reopen_declared_doors(schema)`, and
-- it has exactly one pass: it OPENS a declared door that lost its grant. Nothing ever
-- CLOSED a function that holds a client grant and has no declaration. So the declaration
-- was a sentence, not a posture, and 31 functions were reachable by a signed-in person by
-- accident:
--
--   custom  — 10, every one of them through Postgres's own default. `CREATE FUNCTION`
--             grants EXECUTE to PUBLIC, `authenticated` holds USAGE on the schema (the
--             opening pass grants it as "a consequence of there being a door"), and the
--             two birth guards both stand down: `platform.enforce_definer_client_grants`
--             skips SECURITY INVOKER by design, and `platform.close_new_functions_to_anon`
--             does not list `custom` in `platform.anon_function_birth_schemas()` — and
--             even where it does fire it deliberately hands `authenticated` back. Hence
--             `custom.delete_cascade_closure(uuid, uuid)`, born after lane REACH's sweep,
--             executable by `authenticated` AND by `anon`, by nobody's decision.
--             Also: _containment_association, _field_type_converts_values,
--             assert_client_may_open, field_behaviour, field_value_convert,
--             record_carrying_edges, organization_kernel_id, presentation_kernel_id,
--             widget_kernel_id.
--
--   history — 21, from a blanket `GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA history TO
--             authenticated` (one uniform ACL, postgres/dashboard_user/authenticated/
--             service_role/svc_seo, on every function in the schema). The store's history
--             verbs are reached from `custom`'s declared doors — which are SECURITY
--             DEFINER and run as the owner — or by the records server as `service_role`.
--             Measured: not one of them is called by a signed-in client anywhere in
--             matrx-frontend or aidream. The grant was a sweep, not a decision.
--             Same sweep, table side: `authenticated` holds INSERT/UPDATE/DELETE on all
--             27 `history.row_versions_*` partitions while the PARENT grants it only
--             SELECT — so a signed-in person could rewrite another organization's version
--             history by naming the partition instead of the table. `history.record_capture`
--             and `history.grant_capture`, which is what actually writes those rows, are
--             SECURITY DEFINER and run as the owner: nothing needs that grant.
--
-- WHAT THIS FILE DOES — removes the door, it does not add a path beside it.
--
--   1. `history` is declared CLOSED in `platform.schema_client_exposure`, next to `custom`.
--      That is the truth already: every client reach into it is through `custom`'s doors.
--   2. `platform.reopen_declared_doors(p_schema)` grows its CLOSING pass. In a schema
--      declared closed, a function with no `client_callable_door` row opening a client
--      lane loses EXECUTE from PUBLIC, `anon` and `authenticated`, and says so in
--      `platform.ddl_guard_log`. One implementation; `custom.reopen_declared_doors()`
--      becomes a wrapper over it so the two can never drift.
--   3. The event trigger that runs it stops being REVOKE-only. `CREATE FUNCTION`,
--      `CREATE PROCEDURE`, `ALTER FUNCTION` and `GRANT` now run the same pass, so a
--      function born in a closed schema is closed in the statement that created it —
--      which is the class `delete_cascade_closure` belongs to.
--   4. The `history.row_versions_*` partitions lose the DML the parent never gave.
--   5. The pass is run, here, on both closed schemas.
--
-- The guard that keeps it true is `pnpm check:store-doors-decide` census 8.
-- ─────────────────────────────────────────────────────────────────────────────
-- 1. `history` IS A CLOSED SCHEMA.
-- ─────────────────────────────────────────────────────────────────────────────
insert into platform.schema_client_exposure (schema_name, client_exposed, reason, declared_by)
values (
  'history',
  false,
  'The record store''s history. Every client reach into it is through a declared door in '
  'schema `custom` (query_record_as_of, io_revisions, io_restore, migrate_purge and the '
  'migration verbs), which is SECURITY DEFINER and runs as the owner; the records server '
  'reaches it as `service_role`. Measured 2026-09-19 (lane OPEN-CENSUS): no signed-in client '
  'calls any function in this schema anywhere in matrx-frontend or aidream, yet all 21 held '
  'an `authenticated` EXECUTE grant from one blanket GRANT ON ALL FUNCTIONS. Closed means the '
  'exceptions are rows in platform.client_callable_door, and nothing else. This declaration '
  'governs FUNCTIONS: history.row_versions keeps its RLS-bounded SELECT for authenticated, '
  'which is the read side of the same store and is a decision somebody made, not a sweep.',
  'migrations/campaign/open_census_a_closed_schema_closes_itself.sql (lane OPEN-CENSUS)')
on conflict (schema_name) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. THE CLOSING PASS.
-- ─────────────────────────────────────────────────────────────────────────────
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
begin
  -- ONLY a schema DECLARED CLOSED. In an open schema a revoke is somebody's decision and this
  -- has no business undoing it; in a closed one a blanket revoke is posture restoration, and
  -- taking the declared doors with it is collateral nobody intended. The same sentence is what
  -- makes the CLOSING pass below lawful: in an open schema a client grant is a decision too.
  select not coalesce(e.client_exposed, false) into v_closed
    from platform.schema_client_exposure e where e.schema_name = p_schema;
  if not coalesce(v_closed, false) then
    return;
  end if;

  -- ── THE OPENING PASS (unchanged): a DECLARED door that lost its grant gets it back.
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

  -- The schema grant is a consequence of there being a door, never a decision of its own.
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

  -- ── THE CLOSING PASS (OPEN-CENSUS, 2026-09-19). The other half of the same sentence.
  -- A schema declared closed reaches a client through its DECLARED doors or not at all.
  -- A function holding a client EXECUTE grant with no row opening a client lane is not a
  -- decision anybody made — it is Postgres's default PUBLIC grant, or a blanket
  -- `GRANT ... ON ALL FUNCTIONS`, and both of those are this pass's business.
  --
  -- Extension-owned functions are left alone (they are the extension's posture, not ours),
  -- and so are trigger / event-trigger functions, which no client can call in the first
  -- place and whose grants therefore say nothing.
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
      -- NOTHING FAILS SILENTLY. A function this pass could not close is the whole defect
      -- again, so it screams with the remedy instead of being skipped.
      raise warning 'platform.reopen_declared_doors(%): could NOT take the client EXECUTE grant back from % (%). That function is reachable by a signed-in caller with no row in platform.client_callable_door. Fix the grant by hand or declare it.', p_schema, fn.sig, sqlerrm;
      continue;
    end;

    -- The announcement, in its own subtransaction and AFTER the revoke, so a logging
    -- failure can never roll the revoke back (§6d-4's rule).
    begin
      v_detail := format(
        '%s.%s(%s) held a client EXECUTE grant in a schema declared closed in '
        'platform.schema_client_exposure, with no row in platform.client_callable_door '
        'opening a client lane. PUBLIC, anon and authenticated have been taken back. If a '
        'signed-in person really is meant to call it, declare it — a row with '
        'signed_in_callers = true and a reason naming that caller — and '
        'platform.reopen_declared_doors(%L) will hand the grant back.',
        p_schema, fn.nm, fn.ia, p_schema);
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

-- ONE IMPLEMENTATION. `custom.reopen_declared_doors()` is the name lane REACH's guard and
-- the campaign's docs use; it keeps working, and it can no longer drift from the platform
-- function because it no longer has a body of its own.
create or replace function custom.reopen_declared_doors()
 returns table(reopened text)
 language sql
 security definer
 set search_path to 'pg_catalog'
as $function$
  select r.reopened from platform.reopen_declared_doors('custom') r
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. THE PASS RUNS AT BIRTH, NOT ONLY AFTER A REVOKE.
-- ─────────────────────────────────────────────────────────────────────────────
-- `delete_cascade_closure` was open because it was CREATED after the last sweep and
-- nothing ran at its birth. Re-entrancy is handled the way §6d-4 handles it: the pass
-- issues GRANT and REVOKE of its own, both of which are this trigger's tags.
create or replace function platform._reopen_declared_doors_after_revoke()
 returns event_trigger
 language plpgsql
 security definer
 set search_path to 'pg_catalog'
as $function$
declare
  v_schema text;
begin
  if coalesce(current_setting('platform.closed_schema_sweep', true), '') = '1' then
    return;
  end if;
  perform set_config('platform.closed_schema_sweep', '1', true);

  -- EVERY schema declared closed — not only the ones that already have a door. The closing
  -- pass has business in a closed schema with no doors at all, which is the state `custom`
  -- is in before its first door lands and the state a new closed schema starts in.
  for v_schema in
    select e.schema_name
      from platform.schema_client_exposure e
     where not coalesce(e.client_exposed, false)
       and exists (select 1 from pg_namespace n where n.nspname = e.schema_name)
  loop
    perform platform.reopen_declared_doors(v_schema);
  end loop;
  perform set_config('platform.closed_schema_sweep', '0', true);
exception when others then
  -- A DDL statement must never fail because the sweep could not run — that would make the
  -- sweep itself unrunnable and every lane would work around it. It SCREAMS instead.
  perform set_config('platform.closed_schema_sweep', '0', true);
  raise warning 'platform._reopen_declared_doors_after_revoke: the closed-schema sweep did not run (%). A declared door may be shut to signed-in callers, or an UNDECLARED function may be open to them; run select * from platform.reopen_declared_doors(''<schema>'') and find out why this failed.', sqlerrm;
end;
$function$;

drop event trigger if exists platform_reopen_declared_doors;
create event trigger platform_reopen_declared_doors
  on ddl_command_end
  when tag in ('REVOKE', 'GRANT', 'CREATE FUNCTION', 'CREATE PROCEDURE', 'ALTER FUNCTION')
  execute function platform._reopen_declared_doors_after_revoke();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. THE PARTITIONS LOSE THE DML THE PARENT NEVER GAVE.
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare
  part text;
  n    int := 0;
begin
  for part in
    select c.oid::regclass::text
      from pg_class c
     where c.relnamespace = 'history'::regnamespace
       and c.relkind = 'r'
       and c.relname like 'row_versions%'
       and (has_table_privilege('authenticated', c.oid, 'INSERT')
         or has_table_privilege('authenticated', c.oid, 'UPDATE')
         or has_table_privilege('authenticated', c.oid, 'DELETE'))
  loop
    execute format('revoke insert, update, delete on table %s from authenticated', part);
    execute format('revoke insert, update, delete on table %s from anon', part);
    n := n + 1;
  end loop;
  raise notice 'OPEN-CENSUS: % history.row_versions partition(s) brought level with the parent (SELECT only for authenticated).', n;
end
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. RUN IT.
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare
  r record;
  n int := 0;
begin
  for r in select * from platform.reopen_declared_doors('custom') loop
    raise notice 'OPEN-CENSUS custom: %', r.reopened; n := n + 1;
  end loop;
  for r in select * from platform.reopen_declared_doors('history') loop
    raise notice 'OPEN-CENSUS history: %', r.reopened; n := n + 1;
  end loop;
  raise notice 'OPEN-CENSUS: % door(s) changed hands.', n;
end
$$;

-- THE EXIT PROOF, IN THE FILE. If one undeclared function in a closed schema is still
-- reachable by a client when this commits, the migration fails instead of reporting success.
do $$
declare
  v_open text[];
begin
  select coalesce(array_agg(p.oid::regprocedure::text order by p.oid::regprocedure::text), '{}')
    into v_open
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    join platform.schema_client_exposure e
      on e.schema_name = n.nspname and not coalesce(e.client_exposed, false)
   where p.prokind in ('f', 'p')
     and p.prorettype not in ('pg_catalog.trigger'::regtype, 'pg_catalog.event_trigger'::regtype)
     and not exists (select 1 from pg_depend dep where dep.objid = p.oid and dep.deptype = 'e')
     and (has_function_privilege('authenticated', p.oid, 'EXECUTE')
       or has_function_privilege('anon', p.oid, 'EXECUTE')
       or has_function_privilege('public', p.oid, 'EXECUTE'))
     and not exists (select 1 from platform.client_callable_door d
                      where d.schema_name = n.nspname and d.function_name = p.proname
                        and d.identity_argtypes = platform.door_argtypes(p.proargtypes)
                        and (d.signed_in_callers or d.anonymous_callers));
  if coalesce(array_length(v_open, 1), 0) > 0 then
    raise exception 'OPEN-CENSUS: the closing pass ran and % function(s) in a declared-closed schema are STILL reachable by a client with no declaration: %',
      array_length(v_open, 1), array_to_string(v_open, ', ');
  end if;
  raise notice 'OPEN-CENSUS: every client-reachable function in a declared-closed schema is declared.';
end
$$;

