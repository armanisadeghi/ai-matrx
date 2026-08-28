-- hr_l3_108 — the make-it-impossible layer: a DB-wide DDL trigger that strips client EXECUTE from
--             any newly-created undeclared SECURITY DEFINER function, across every schema.
--
-- ARMAN'S RULING (relayed): DATABASE-WIDE. The reactive checks 33/35 catch a client-reachable
--   definer AFTER it is applied to the live DB. This is the layer above them: on CREATE FUNCTION (or
--   replace) and on GRANT of any SECURITY DEFINER function, auto-REVOKE client EXECUTE
--   (PUBLIC/anon/authenticated) UNLESS the function is a declared DOOR — so the definer-grant hole
--   cannot exist even for an instant, in ANY domain.
--
-- THE SAFETY OF A DB-WIDE TRIGGER IS THE DOOR EXCLUSION, AND THE GRANDFATHER
--   1228 SECURITY DEFINER functions are client-executable across 37 schemas RIGHT NOW — 792 in
--   `public` alone (the PostgREST wrapper surface), plus every other domain's legitimate RPC doors.
--   Stripping any of them would break production. So this trigger touches NOTHING that exists today:
--   every current definer (1784 of them) is snapshotted into a GRANDFATHER table, and the trigger
--   skips anything in it. Day one strips zero live doors. The trigger governs only the FUTURE: a new
--   undeclared definer is born with no client grant; a new door declares itself in the cross-domain
--   registry and keeps its grant.
--
-- 🚨 THE TRIGGER CAN NEVER BLOCK A MIGRATION. It runs on EVERY CREATE/GRANT DB-wide, for every team.
--   A trigger that raises would halt all DDL everywhere. So the whole body is wrapped fail-open: on
--   ANY error it does nothing and lets the DDL proceed. The cost of a bug is a hole that slips to the
--   reactive checks — never a blocked migration. That trade-off is deliberate and correct for a
--   shared production database.
--
-- WHY BOTH CREATE AND GRANT
--   `public`/`files`/`storage` auto-grant anon+authenticated to new functions via default privileges
--   (applied at CREATE — the trigger strips them there). `communication`/`platform`/most schemas
--   give a new function only the implicit PUBLIC grant (proacl NULL — stripped at CREATE too). But
--   the cross-tenant mint's `authenticated` grant was an EXPLICIT `GRANT` statement AFTER the create,
--   which a CREATE-only trigger never sees. Firing on GRANT as well closes that variant: an explicit
--   grant to a client role on an undeclared definer is re-revoked.
--
-- Applied live as `hr_l3_108_definer_grants_impossible_at_birth`. Idempotent.
--
-- RECORDED TECHNICAL DECISIONS
--   · GRANDFATHER BY IDENTITY (schema, name, identity_args), captured from the live catalog in this
--     migration BEFORE the trigger exists. A CREATE OR REPLACE of a grandfathered door matches and is
--     skipped, so its grants (preserved by REPLACE) survive. Only genuinely NEW functions are new.
--   · THE DOOR REGISTRY IS CROSS-DOMAIN. `platform.client_callable_door` — any team declares a new
--     client-callable definer with one INSERT (schema, name, identity_args, reason) and keeps its
--     grant. This is the check-33/35 door-baseline mechanism extended database-wide, exactly as ruled.
--   · SUPABASE / EXTENSION SCHEMAS ARE EXEMPT, and so is any extension-owned function (pg_depend
--     deptype 'e'). The trigger governs application schemas only; it must never fight the platform's
--     own managed objects.
--   · ONLY CLIENT ROLES ARE TOUCHED. service_role and postgres (the owner, the adapter's role) keep
--     EXECUTE always — the trigger revokes public/anon/authenticated and nothing else.
--   · SECURITY INVOKER FUNCTIONS ARE UNTOUCHED (prosecdef only). Aggregates/windows/trigger-return
--     functions are not RPC doors and are skipped.

-- ── 1. THE GRANDFATHER SNAPSHOT — every definer that exists right now ─────────────────────────────
create table if not exists platform.definer_client_grant_grandfather (
  schema_name   text not null,
  function_name text not null,
  identity_args text not null,
  snapshotted_at timestamptz not null default now(),
  primary key (schema_name, function_name, identity_args)
);

insert into platform.definer_client_grant_grandfather (schema_name, function_name, identity_args)
select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where p.prosecdef
on conflict do nothing;

-- ── 2. THE CROSS-DOMAIN DOOR REGISTRY — how any team declares a new client-callable definer ──────
create table if not exists platform.client_callable_door (
  id            uuid primary key default gen_random_uuid(),
  schema_name   text not null,
  function_name text not null,
  identity_args text not null,
  declared_by   text,
  reason        text not null,
  declared_at   timestamptz not null default now(),
  unique (schema_name, function_name, identity_args)
);

comment on table platform.client_callable_door is
  'Cross-domain registry of SECURITY DEFINER functions intentionally callable by a client role. To '
  'keep the client EXECUTE grant on a NEW definer function, INSERT a row here (schema_name, '
  'function_name, identity_args from pg_get_function_identity_arguments, reason) in the same '
  'migration, before/with the CREATE. Enforced by platform.enforce_definer_client_grants (hr_l3_108).';

-- ── 3. THE ENFORCEMENT FUNCTION — fail-open, client-roles-only ───────────────────────────────────
create or replace function platform.enforce_definer_client_grants()
returns event_trigger
language plpgsql
security definer
set search_path to 'platform', 'pg_catalog'
as $fn$
declare
  r  record;
  fn record;
  v_exempt constant text[] := array[
    'pg_catalog','information_schema','pg_toast','extensions','graphql','graphql_public',
    'pgbouncer','realtime','_realtime','storage','auth','cron','net','vault','pgsodium',
    'pgsodium_masks','supabase_functions','supabase_migrations','dashboard','pgtle','tiger',
    'tiger_data','topology'];
  v_grant boolean := false;
begin
  -- 🚨 TWO EVENT SHAPES. A CREATE FUNCTION reports object_type='function' with the objid, so it is
  -- handled per-function (fast — one lookup). A GRANT reports object_type='FUNCTION' (uppercase)
  -- with a NULL objid — Postgres does not say WHICH function was granted — so a GRANT triggers a
  -- bounded RE-SWEEP of every undeclared client-reachable definer. GRANTs are infrequent relative to
  -- creates; the sweep is what closes the explicit-grant (mint) variant a CREATE-only guard misses.
  for r in select objid, object_type from pg_event_trigger_ddl_commands()
  loop
    begin
      if r.objid is not null and lower(r.object_type) = 'function' then
        -- ---- CREATE path: the one function that was just created ----
        select n.nspname as sch, p.proname as nm, p.prosecdef, p.prokind, p.prorettype,
               pg_get_function_identity_arguments(p.oid) as ia, p.oid::regprocedure::text as sig
          into fn
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where p.oid = r.objid;
        if not found then continue; end if;
        if not fn.prosecdef then continue; end if;
        if fn.prokind not in ('f','p') then continue; end if;
        if fn.prorettype in ('pg_catalog.trigger'::regtype, 'pg_catalog.event_trigger'::regtype) then continue; end if;
        if fn.sch = any(v_exempt) then continue; end if;
        if exists (select 1 from pg_depend d where d.objid = r.objid and d.deptype = 'e') then continue; end if;
        if exists (select 1 from platform.definer_client_grant_grandfather g
                    where g.schema_name = fn.sch and g.function_name = fn.nm and g.identity_args = fn.ia) then continue; end if;
        if exists (select 1 from platform.client_callable_door c
                    where c.schema_name = fn.sch and c.function_name = fn.nm and c.identity_args = fn.ia) then continue; end if;
        execute format('revoke execute on function %s from public', fn.sig);
        execute format('revoke execute on function %s from anon', fn.sig);
        execute format('revoke execute on function %s from authenticated', fn.sig);
      elsif upper(r.object_type) = 'FUNCTION' then
        v_grant := true;   -- a GRANT on some function(s); sweep after the loop.
      end if;
    exception when others then null;   -- 🚨 FAIL-OPEN per row: never abort the DDL.
    end;
  end loop;

  if v_grant then
    -- ---- GRANT path: re-revoke every undeclared client-reachable definer DB-wide ----
    for fn in
      select p.oid::regprocedure::text as sig
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where p.prosecdef and p.prokind in ('f','p')
         and p.prorettype not in ('pg_catalog.trigger'::regtype, 'pg_catalog.event_trigger'::regtype)
         and not (n.nspname = any(v_exempt))
         and (has_function_privilege('anon', p.oid, 'EXECUTE')
           or has_function_privilege('authenticated', p.oid, 'EXECUTE')
           or has_function_privilege('public', p.oid, 'EXECUTE'))
         and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
         and not exists (select 1 from platform.definer_client_grant_grandfather g
                          where g.schema_name = n.nspname and g.function_name = p.proname
                            and g.identity_args = pg_get_function_identity_arguments(p.oid))
         and not exists (select 1 from platform.client_callable_door c
                          where c.schema_name = n.nspname and c.function_name = p.proname
                            and c.identity_args = pg_get_function_identity_arguments(p.oid))
    loop
      begin
        execute format('revoke execute on function %s from public', fn.sig);
        execute format('revoke execute on function %s from anon', fn.sig);
        execute format('revoke execute on function %s from authenticated', fn.sig);
      exception when others then null;
      end;
    end loop;
  end if;
exception
  when others then
    null;   -- belt and suspenders: the whole pass can never raise.
end;
$fn$;

-- ── 4. THE EVENT TRIGGER — CREATE FUNCTION and GRANT, DB-wide ────────────────────────────────────
drop event trigger if exists enforce_definer_client_grants;
create event trigger enforce_definer_client_grants
  on ddl_command_end
  when tag in ('CREATE FUNCTION', 'GRANT')
  execute function platform.enforce_definer_client_grants();

-- ── 5. CHECK 36 — the trigger exists and is enabled, and cannot be silently dropped ──────────────
do $mig$
declare v_src text; v_new text;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'punch_write_path_conformance';
  if position('definer_grant_ddl_guard_installed' in v_src) > 0 then return; end if;

  v_new := replace(v_src,
$anchor$  return next;

end
$function$$anchor$,
$anchor$  return next;

  ---------------------------------------------------------------- 36. the create-time definer-grant DDL guard is installed
  check_key := 'definer_grant_ddl_guard_installed';
  declare v_evt record; begin
    select e.evtenabled, e.evttags into v_evt
      from pg_event_trigger e where e.evtname = 'enforce_definer_client_grants';
    ok       := found and v_evt.evtenabled <> 'D'
                and to_regprocedure('platform.enforce_definer_client_grants()') is not null;
    severity := 'blocking';
    detail   := jsonb_build_object(
      'present', found, 'enabled', (found and v_evt.evtenabled <> 'D'),
      'tags', coalesce(v_evt.evttags, array[]::text[]),
      'grandfathered_definers', (select count(*) from platform.definer_client_grant_grandfather),
      'declared_doors', (select count(*) from platform.client_callable_door),
      'why', 'hr_l3_108: the DB-wide ddl_command_end trigger that revokes client EXECUTE from any '
        || 'newly-created undeclared SECURITY DEFINER function, in every schema — the make-it-'
        || 'impossible layer above the reactive checks 33/35. If this event trigger is dropped or '
        || 'disabled, the definer-grant class can be reintroduced at birth again. Grandfather + a '
        || 'cross-domain door registry keep every legitimate door working; the trigger is fail-open '
        || 'so it can never block a migration.');
  end;
  return next;

end
$function$$anchor$);
  execute v_new;
end
$mig$;

-- ── 6. SELF-CHECK (scoped to check 36) + CONTRACT ────────────────────────────────────────────────
do $chk$
begin
  if not exists (select 1 from pg_event_trigger where evtname = 'enforce_definer_client_grants') then
    raise exception 'hr_l3_108: the event trigger did not install';
  end if;
  if exists (select 1 from hr.punch_write_path_conformance()
              where check_key = 'definer_grant_ddl_guard_installed' and not ok) then
    raise exception 'hr_l3_108: check 36 is RED on landing';
  end if;
end
$chk$;

insert into hr.function_contract
  (schema_name, function_name, home_migration, must_contain, must_not_contain, reason,
   is_active, must_be_definer, overloads_intended)
values
  ('hr', 'punch_write_path_conformance', 'hr_l3_108_definer_grants_impossible_at_birth',
   array['definer_grant_ddl_guard_installed'],
   array[]::text[],
   'Check 36 asserts the DB-wide create-time definer-grant DDL guard (event trigger '
   || 'platform.enforce_definer_client_grants) exists and is enabled. Arman ruled the enforcement '
   || 'database-wide: a new undeclared SECURITY DEFINER function must be born with no client EXECUTE. '
   || 'If the trigger is dropped, this check goes red so the regression is caught at CI.',
   true, true, false)
on conflict do nothing;
