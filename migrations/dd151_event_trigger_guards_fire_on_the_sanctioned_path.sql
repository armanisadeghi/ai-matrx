-- DD-151 — the DDL guards must fire on the SANCTIONED apply path.
-- (B-39, Data Doctrine adoption program, 2026-09-12. SECURITY. Found by B-35/DD-146.)
--
-- THE DEFECT, MEASURED LIVE BEFORE ANY CHANGE (brsgrqvjdzwihsvnfqkf, 2026-09-12)
-- -----------------------------------------------------------------------------
-- `platform.enforce_definer_client_grants` — the §6d-4 guard that takes back a
-- client EXECUTE grant on an undeclared SECURITY DEFINER function — DID NOT RUN
-- AT ALL on `pnpm db:apply`, i.e. on every migration this repo has applied since
-- the guard shipped on 2026-08-28. Nothing errored; nothing was logged; the
-- grant simply survived.
--
-- The cause is NOT the door function, NOT the payload, and NOT event triggers
-- being disabled. It is this, isolated to one bit and reproduced four ways:
--
--   🚨 A `SECURITY DEFINER` EVENT-TRIGGER FUNCTION DOES NOT FIRE WHEN THE
--      SESSION IS A PostgREST SESSION (`session_user = authenticator`).
--      A `SECURITY INVOKER` one fires normally on the same statement.
--
-- The experiment (two event triggers on the same tags, same owner, same
-- `SET search_path`, same body, differing ONLY in `SECURITY DEFINER`, both
-- writing a row to a scratch table):
--
--   transport                                           definer trg   invoker trg
--   Supabase MCP, plain SQL          (session postgres)      FIRED         FIRED
--   Supabase MCP -> execute_admin_query (session postgres)   FIRED         FIRED
--   PostgREST    -> execute_admin_query (session authenticator)  —         FIRED
--   ... then the SAME function re-created as SECURITY INVOKER,
--       same PostgREST call                                   n/a       FIRED  ← one bit
--
--   MCP, rolled back, `set local role service_role` before the same door call:
--       definer trigger silent, invoker trigger fired. So the trigger is skipped
--       by the session's role stack, not by the door and not by the payload.
--
-- The guard's own fail-open posture (§6d-4: "the per-row and whole-function
-- handlers swallow every error") is what kept this invisible for fifteen days:
-- a guard that never runs and never speaks looks exactly like a guard with
-- nothing to do.
--
-- THE CLASS, not the instance
-- ---------------------------
-- Three platform event triggers were SECURITY DEFINER, so ALL THREE were dead on
-- the sanctioned apply path:
--
--   enforce_definer_client_grants -> platform.enforce_definer_client_grants  (§6d-4 guard)
--   entity_types_ddl_sync         -> platform.sync_entity_types_on_ddl       (registry text columns)
--   entity_types_drop_flag        -> platform.flag_entity_types_on_drop      (registry retire flag)
--
-- `ddl_guard`, `ddl_lock_timeout_guard` and `graveyard_outbound_fk_guard` are
-- SECURITY INVOKER and were never affected — which is exactly why B-35 saw
-- `platform.ddl_guard_log` gain a `no_new_public_tables` row on the same path
-- where the §6d-4 guard wrote nothing.
--
-- THE FIX, same shape for all three
-- ---------------------------------
-- The event-trigger function becomes SECURITY INVOKER (so it FIRES), collects
-- what `pg_event_trigger_*()` reports, and hands it to a SECURITY DEFINER
-- implementation function that does the privileged work (owner rights for the
-- REVOKEs, the registry UPDATEs and the durable log row). The definer half is
-- a plain function, and plain SECURITY DEFINER functions work on the PostgREST
-- path — `public.execute_admin_query`, the door this file is running through,
-- is one.
--
-- The implementations are NOT client-callable (DD-146 / check-impl-doors D7):
-- every one is REVOKEd from public/anon/authenticated in this file.
--
-- Nothing silent: where the old wrapper swallowed everything into `null`, the
-- new wrapper raises a WARNING naming the failure. `RAISE WARNING` cannot abort
-- a transaction, so the fail-open contract (§6d-4: a guard bug must never block
-- another team's DDL) is unchanged.
--
-- STANDING GUARDS ADDED WITH THIS CHANGE
-- --------------------------------------
--   * `hr.function_contract` rows asserting `must_be_definer = false` on each of
--     the three event-trigger functions, and `must_be_definer = true` on each
--     implementation (the existing §6d-4 announcement contracts are repointed to
--     the implementation, where the announcement now lives).
--   * `pnpm check:db-guards` (scripts/check-db-guards.ts) fails when ANY platform
--     event-trigger function is SECURITY DEFINER.
--
-- BOTH BRANCHES ARE DEAD THERE, MEASURED SEPARATELY (2026-09-12)
-- --------------------------------------------------------------
--   * CREATE FUNCTION branch: a fresh SECURITY DEFINER function created through
--     the door kept PUBLIC + `authenticated` EXECUTE and logged nothing
--     (probes public._dd151_probe_c / _d / _h).
--   * GRANT branch: `public._dd151_grantonly()` was created and stripped in a
--     `postgres` session (guard fired, EXECUTE = false), then a bare
--     `grant execute on function public._dd151_grantonly() to authenticated`
--     was sent through the door ALONE → `authenticated` EXECUTE = true,
--     `definer_client_grant_revoked` rows 195 → 195.
--
-- WHY THE LOG LOOKS LIKE THE GUARD HAS BEEN WORKING. `platform.ddl_guard_log`
-- holds 25 `definer_client_grant_revoked` rows that line up with frontend
-- migrations, all tagged CREATE FUNCTION. Every one of them predates the door:
-- `scripts/apply-migration.ts` was first committed 2026-09-11 09:49 PDT
-- (16:49 UTC, 551d51db2b/4256705c79), and before that migrations were pasted
-- into the Supabase MCP — a `postgres` session, where the guard fires. Of the
-- 33 migrations applied through `pnpm db:apply` since it existed, NOT ONE has
-- produced a `definer_client_grant_revoked` row.
--
-- CENSUS — what the blind spot actually cost (no live hole)
-- --------------------------------------------------------
-- Ten client-role EXECUTE grants on SECURITY DEFINER functions were issued by
-- door-applied migrations (log_client_error ×2, get_published_app_with_prompt,
-- admin_spend_overview, admin_spend_headline, admin_spend_breakdown,
-- org_admin_reassign_member_resources, org_admin_remove_member,
-- seo.keyword_placement_resolve, seo.gsc_keyword_topics_for). Checked live:
-- every one of them either carries a `platform.client_callable_door` row or a
-- `platform.definer_client_grant_grandfather` row, so the guard would have
-- stood down for all ten. The whole DB-wide population of undeclared,
-- client-granted definers is 15 functions and all 15 are trigger functions,
-- which the guard skips by contract. The exposure was latent, not realised —
-- DD-110 and DD-146 had already closed everything the guard would have caught.
--
-- FORCING PROOF — in this file, on this path. §5 below creates a fresh
-- undeclared SECURITY DEFINER function, GRANTs it to `authenticated`, and
-- asserts the grant was taken back and logged. Before this migration that exact
-- payload kept its grant through this same door (probes `public._dd151_probe_c`,
-- `_d`, `_h`, measured 2026-09-12 and dropped in §0).

-- ─── 0. Clean up B-39's RED-state probes and the diagnostic rig ──────────────
drop function if exists public._dd151_probe_c();
drop function if exists public._dd151_probe_d();
drop function if exists public._dd151_probe_h();
drop function if exists public._dd151_grantonly();
drop event trigger if exists _dd151_diag_def_et;
drop event trigger if exists _dd151_diag_inv_et;
drop function if exists platform._dd151_diag_def();
drop function if exists platform._dd151_diag_inv();
drop table if exists platform._dd151_diag;

-- ─── 1. §6d-4 guard: the privileged half ────────────────────────────────────
-- Body is hr_l3_108 + hr_l3_109 + hr_l3_110 verbatim in behaviour; the only
-- change is that it is driven by the oids the wrapper collected instead of
-- calling pg_event_trigger_ddl_commands() itself.
create or replace function platform.enforce_definer_client_grants_impl(
  p_objids oid[],
  p_grant  boolean,
  p_tag    text
) returns void
 language plpgsql
 security definer
 set search_path to 'platform', 'public', 'pg_catalog'
as $impl$
declare
  r_oid oid;
  fn record;
  v_detail text;
  v_revoked boolean;
  v_exempt constant text[] := array[
    'pg_catalog','information_schema','pg_toast','extensions','graphql','graphql_public',
    'pgbouncer','realtime','_realtime','storage','auth','cron','net','vault','pgsodium',
    'pgsodium_masks','supabase_functions','supabase_migrations','dashboard','pgtle','tiger',
    'tiger_data','topology'];
begin
  foreach r_oid in array coalesce(p_objids, '{}'::oid[])
  loop
    begin
      select n.nspname as sch, p.proname as nm, p.prosecdef, p.prokind, p.prorettype,
             p.proargtypes::text as argtypes,
             pg_get_function_identity_arguments(p.oid) as ia, p.oid::regprocedure::text as sig
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
      if exists (select 1 from platform.client_callable_door c
                  where c.schema_name = fn.sch and c.function_name = fn.nm and c.identity_args = fn.ia) then continue; end if;
      execute format('revoke execute on function %s from public', fn.sig);
      execute format('revoke execute on function %s from anon', fn.sig);
      execute format('revoke execute on function %s from authenticated', fn.sig);
      -- 🚨 THE ANNOUNCEMENT (hr_l3_110) — its OWN subtransaction, so a logging failure can never
      -- roll the revoke above back, and `raise warning` can never abort the DDL.
      begin
        v_detail := platform.definer_guard_revoke_notice(fn.sch, fn.nm, fn.ia, fn.sig);
        raise warning 'ddl_guard[definer_client_grant_revoked]: %', v_detail;
        insert into platform.ddl_guard_log(severity, rule, object_ref, command_tag, detail)
        values ('warn', 'definer_client_grant_revoked',
                format('%s.%s(%s)', fn.sch, fn.nm, fn.ia), p_tag, v_detail);
      exception when others then
        raise warning 'ddl_guard[definer_client_grant_revoked]: announcement FAILED (%) — the client EXECUTE revoke on % DID happen; the guard needs repair.', sqlerrm, fn.sig;
      end;
    exception when others then null;
    end;
  end loop;

  if p_grant then
    for fn in
      select p.oid::regprocedure::text as sig, n.nspname as sch, p.proname as nm,
             pg_get_function_identity_arguments(p.oid) as ia
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
         and not exists (select 1 from platform.client_callable_door c
                          where c.schema_name = n.nspname and c.function_name = p.proname
                            and c.identity_args = pg_get_function_identity_arguments(p.oid))
    loop
      v_revoked := false;
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
    end loop;
  end if;
exception
  when others then
    -- fail-open, but NEVER silent (DD-151): the old body swallowed into `null`.
    raise warning 'ddl_guard[definer_client_grant_revoked]: THE GUARD FAILED (%) — an undeclared client EXECUTE grant may have survived. The guard needs repair.', sqlerrm;
end;
$impl$;

-- ─── 2. §6d-4 guard: the event-trigger half ─────────────────────────────────
-- 🚨 SECURITY INVOKER ON PURPOSE — DD-151. A SECURITY DEFINER event-trigger
--    function does not fire at all on a PostgREST session, which is every
--    `pnpm db:apply`. Do not "restore" SECURITY DEFINER here: the privileged
--    work lives in platform.enforce_definer_client_grants_impl, and
--    hr.function_contract + pnpm check:db-guards both assert this.
create or replace function platform.enforce_definer_client_grants()
 returns event_trigger
 language plpgsql
 set search_path to 'platform', 'public', 'pg_catalog'
as $et$
declare
  v_objids oid[];
  v_grant  boolean;
begin
  -- CREATE FUNCTION reports object_type 'function' with a real objid.
  -- GRANT reports object_type 'FUNCTION' with objid NULL (Postgres gives no
  -- objid for a GRANT), which is what triggers the bounded DB-wide re-sweep.
  select coalesce(array_agg(c.objid) filter (
             where c.objid is not null and c.objid <> 0 and lower(c.object_type) = 'function'),
           '{}'::oid[]),
         coalesce(bool_or(upper(c.object_type) = 'FUNCTION'
                          and (c.objid is null or c.objid = 0)), false)
    into v_objids, v_grant
    from pg_event_trigger_ddl_commands() c;

  perform platform.enforce_definer_client_grants_impl(v_objids, v_grant, tg_tag);
exception when others then
  raise warning 'ddl_guard[definer_client_grant_revoked]: THE §6d-4 GUARD DID NOT RUN (%) — an undeclared client EXECUTE grant may have survived this statement. The guard needs repair.', sqlerrm;
end;
$et$;

-- ─── 3. entity_types registry sync — same split, same reason ────────────────
create or replace function platform.sync_entity_types_on_ddl_impl(p_objids oid[])
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $impl$
declare r_oid oid;
begin
  foreach r_oid in array coalesce(p_objids, '{}'::oid[])
  loop
    begin
      update platform.entity_types et
         set schema_name = n.nspname, table_name = c.relname
        from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
       where c.oid = r_oid and et.table_ref::oid = r_oid
         and (et.schema_name is distinct from n.nspname or et.table_name is distinct from c.relname);
    exception when others then
      raise warning 'entity_types DDL sync skipped (oid %): %', r_oid, sqlerrm;  -- never abort the DDL
    end;
  end loop;
end;
$impl$;

-- 🚨 SECURITY INVOKER ON PURPOSE — DD-151 (see §2).
create or replace function platform.sync_entity_types_on_ddl()
 returns event_trigger
 language plpgsql
 set search_path to ''
as $et$
declare v_objids oid[];
begin
  select coalesce(array_agg(c.objid), '{}'::oid[]) into v_objids
    from pg_event_trigger_ddl_commands() c where c.object_type = 'table';
  perform platform.sync_entity_types_on_ddl_impl(v_objids);
exception when others then
  raise warning 'entity_types DDL sync DID NOT RUN (%) — platform.entity_types text columns may now be stale.', sqlerrm;
end;
$et$;

create or replace function platform.flag_entity_types_on_drop_impl(p_objids oid[])
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $impl$
declare r_oid oid;
begin
  foreach r_oid in array coalesce(p_objids, '{}'::oid[])
  loop
    begin
      update platform.entity_types set is_active = false, table_ref = null where table_ref::oid = r_oid;
    exception when others then
      raise warning 'entity_types drop-flag skipped (oid %): %', r_oid, sqlerrm;
    end;
  end loop;
end;
$impl$;

-- 🚨 SECURITY INVOKER ON PURPOSE — DD-151 (see §2).
create or replace function platform.flag_entity_types_on_drop()
 returns event_trigger
 language plpgsql
 set search_path to ''
as $et$
declare v_objids oid[];
begin
  select coalesce(array_agg(c.objid), '{}'::oid[]) into v_objids
    from pg_event_trigger_dropped_objects() c where c.object_type = 'table';
  perform platform.flag_entity_types_on_drop_impl(v_objids);
exception when others then
  raise warning 'entity_types drop-flag DID NOT RUN (%) — a dropped entity table may still look active in platform.entity_types.', sqlerrm;
end;
$et$;

-- ─── 4. The implementations are NOT doors (DD-146 / check-impl-doors D7) ────
revoke all on function platform.enforce_definer_client_grants_impl(oid[], boolean, text) from public, anon, authenticated;
revoke all on function platform.sync_entity_types_on_ddl_impl(oid[]) from public, anon, authenticated;
revoke all on function platform.flag_entity_types_on_drop_impl(oid[]) from public, anon, authenticated;

-- ─── 5. Contracts: the mode is now part of the contract ─────────────────────
-- The two existing §6d-4 announcement contracts move to the implementation,
-- which is where the announcement now lives and which must stay SECURITY DEFINER.
update hr.function_contract
   set function_name = 'enforce_definer_client_grants_impl',
       reason = reason || ' DD-151 (2026-09-12): the announcement moved to the _impl function; the event-trigger half must be SECURITY INVOKER or it does not fire on a PostgREST session at all.'
 where schema_name = 'platform' and function_name = 'enforce_definer_client_grants';

insert into hr.function_contract
  (schema_name, function_name, home_migration, must_contain, must_not_contain, reason, is_active, must_be_definer, overloads_intended)
values
  ('platform','enforce_definer_client_grants','dd151_event_trigger_guards_fire_on_the_sanctioned_path',
   array['enforce_definer_client_grants_impl','pg_event_trigger_ddl_commands','raise warning'], array[]::text[],
   'DD-151: a SECURITY DEFINER event-trigger function DOES NOT FIRE when session_user is `authenticator`, i.e. on every PostgREST session, i.e. on every `pnpm db:apply`. Proven 2026-09-12 by flipping that one bit on an otherwise identical pair of event triggers. This wrapper must stay SECURITY INVOKER and must delegate to the SECURITY DEFINER _impl; making it definer again silently disables the §6d-4 guard on the sanctioned migration path, which is how it was silently absent for fifteen days.',
   true, false, false),
  ('platform','sync_entity_types_on_ddl','dd151_event_trigger_guards_fire_on_the_sanctioned_path',
   array['sync_entity_types_on_ddl_impl'], array[]::text[],
   'DD-151: same class as platform.enforce_definer_client_grants. A SECURITY DEFINER event-trigger function does not fire on a PostgREST session, so the registry text columns stopped being maintained for every migration applied through `pnpm db:apply`. Wrapper stays SECURITY INVOKER; the privileged UPDATE lives in the _impl.',
   true, false, false),
  ('platform','sync_entity_types_on_ddl_impl','dd151_event_trigger_guards_fire_on_the_sanctioned_path',
   array['platform.entity_types'], array[]::text[],
   'DD-151: the privileged half of the registry DDL sync. Must stay SECURITY DEFINER — it updates platform.entity_types on behalf of whoever ran the DDL.',
   true, true, false),
  ('platform','flag_entity_types_on_drop','dd151_event_trigger_guards_fire_on_the_sanctioned_path',
   array['flag_entity_types_on_drop_impl'], array[]::text[],
   'DD-151: same class as platform.enforce_definer_client_grants. Wrapper stays SECURITY INVOKER; the privileged UPDATE lives in the _impl.',
   true, false, false),
  ('platform','flag_entity_types_on_drop_impl','dd151_event_trigger_guards_fire_on_the_sanctioned_path',
   array['platform.entity_types'], array[]::text[],
   'DD-151: the privileged half of the registry drop flag. Must stay SECURITY DEFINER.',
   true, true, false);

-- ─── 6. Assertions — structural AND behavioural, on THIS path ───────────────
do $assert$
declare
  n int;
  v_before bigint;
  v_after bigint;
  v_auth boolean;
  v_pub boolean;
begin
  -- 6a. all three event triggers bound, enabled, and NOT SECURITY DEFINER
  select count(*) into n
    from pg_event_trigger e
    join pg_proc p on p.oid = e.evtfoid
    join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'platform' and p.prosecdef;
  if n <> 0 then
    raise exception 'dd151: % platform event-trigger function(s) are still SECURITY DEFINER — they do not fire on the sanctioned apply path', n;
  end if;

  select count(*) into n
    from pg_event_trigger e
   where e.evtname in ('enforce_definer_client_grants','entity_types_ddl_sync','entity_types_drop_flag')
     and e.evtenabled <> 'D';
  if n <> 3 then
    raise exception 'dd151: expected 3 bound+enabled event triggers, found %', n;
  end if;

  -- 6b. the three implementations exist, ARE definer, and are not client doors
  select count(*) into n
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'platform'
     and p.proname in ('enforce_definer_client_grants_impl','sync_entity_types_on_ddl_impl','flag_entity_types_on_drop_impl')
     and p.prosecdef
     and not has_function_privilege('anon', p.oid, 'EXECUTE')
     and not has_function_privilege('authenticated', p.oid, 'EXECUTE')
     and not has_function_privilege('public', p.oid, 'EXECUTE');
  if n <> 3 then
    raise exception 'dd151: expected 3 SECURITY DEFINER implementations with no client EXECUTE, found %', n;
  end if;

  -- 6c. no declared contract is broken
  select count(*) into n from hr.function_contracts_broken()
   where qname like 'platform.%entity_types%' or qname like 'platform.enforce_definer_client_grants%';
  if n <> 0 then
    raise exception 'dd151: % function contract(s) broken after this change', n;
  end if;

  -- 6d. 🚨 THE FORCING PROOF, ON THIS PATH. Before this migration the identical
  --     payload through this identical door kept its grant and logged nothing.
  select count(*) into v_before from platform.ddl_guard_log where rule = 'definer_client_grant_revoked';

  execute 'create function platform._dd151_forcing_probe() returns int language sql security definer as ''select 1''';
  execute 'grant execute on function platform._dd151_forcing_probe() to authenticated';

  select has_function_privilege('authenticated', 'platform._dd151_forcing_probe()', 'EXECUTE'),
         has_function_privilege('public', 'platform._dd151_forcing_probe()', 'EXECUTE')
    into v_auth, v_pub;
  select count(*) into v_after from platform.ddl_guard_log where rule = 'definer_client_grant_revoked';

  execute 'drop function platform._dd151_forcing_probe()';

  if v_auth or v_pub then
    raise exception 'dd151: FORCING PROOF FAILED — a fresh undeclared SECURITY DEFINER function KEPT its client EXECUTE on this apply path (authenticated=%, public=%). The §6d-4 guard still does not fire here.', v_auth, v_pub;
  end if;
  if v_after <= v_before then
    raise exception 'dd151: FORCING PROOF FAILED — the grant was taken back but nothing was logged (definer_client_grant_revoked rows % -> %). A guard that does not announce is how DD-151 stayed invisible.', v_before, v_after;
  end if;

  raise notice 'dd151: all assertions passed (definer_client_grant_revoked rows % -> %, probe kept no client EXECUTE)', v_before, v_after;
end
$assert$;
