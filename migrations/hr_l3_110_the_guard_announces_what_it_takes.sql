-- hr_l3_110 — THE DEFINER GUARD ANNOUNCES WHAT IT TAKES.
--
-- THE DEFECT (found 2026-08-29, one day after hr_l3_108 shipped)
--   `platform.enforce_definer_client_grants` strips client EXECUTE from an undeclared SECURITY
--   DEFINER function *inside the GRANT statement itself* — and said NOTHING. An agent building an
--   HR door reported it verbatim: "My first cut granted without declaring; the guard took it back
--   and nothing errored. The door existed and the client would have 403'd." It was caught only
--   because an unrelated conformance gate happened to run that day.
--
--   The silence is worse than it looks, because the requirement is invisible from every example a
--   developer can copy: all 1,788 pre-existing definers are in the grandfather snapshot, so every
--   existing `hr_*` wrapper keeps its grant WITHOUT a `client_callable_door` row. Reading working
--   code teaches the opposite of the rule.
--
-- THE LAW IT VIOLATES (this program's own): every stand-in ships with a constant, counted, VISIBLE
--   scream; quiet patches are defects. A guard that silently removes something a developer just
--   deliberately granted is the loudest-needed case there is.
--
-- WHAT THIS MIGRATION CHANGES — ANNOUNCEMENT ONLY. Not one revoke decision moves: the predicate,
--   the exemptions, the grandfather match (arg-type OIDs, hr_l3_109), the door match, and the two
--   event shapes are copied byte-for-byte from the live body. The only additions are, per revoke:
--     · a `RAISE WARNING` naming the exact function and the copy-pasteable remedy, and
--     · a durable row in `platform.ddl_guard_log` — the EXISTING DDL-guard lane that
--       `platform._ddl_guard` already writes, that `platform.ddl_guard_unacked` /
--       `pnpm check:ddl-guard-log` / docs-steward step 7c already read, and that carries a
--       mandatory-reason acknowledgement contract. No new table was invented; a warning alone is
--       lost the moment a migration is run by CI or an auto-applier, and the developer whose door
--       403s tomorrow needs to be able to find out why.
--
-- 🚨 IT STILL CANNOT HALT DDL — THE ONE THING THIS CHANGE MUST NOT BREAK.
--   `RAISE WARNING` does not abort a transaction; no path added here can raise out of the trigger.
--   Three layers, deliberately:
--     1. The announcement is its own nested BEGIN…EXCEPTION block, placed AFTER the revokes. A
--        failed announcement (log table missing, permission, constraint) rolls back the
--        announcement's OWN subtransaction only — the revoke, done in the enclosing block, stands.
--        Putting the INSERT in the same block as the revokes would have made a log failure
--        silently UNDO the revoke: a security regression dressed as an observability win.
--     2. That handler screams that the guard itself is sick rather than swallowing (the pattern
--        `platform._ddl_guard`'s warn lane already uses) — and states that the revoke DID happen,
--        so nobody reads the failure as "my grant survived".
--     3. The per-row and whole-function fail-open handlers from hr_l3_108 are untouched.
--
-- SEVERITY IS THE SIGNAL, and it splits by event shape:
--     · CREATE FUNCTION → 'warn'. In `public`/`files`/`storage` a client grant arrives by DEFAULT
--       PRIVILEGES; stripping it is routine and implies no developer intent.
--     · GRANT → 'error'. Postgres reports no objid for a GRANT, so this is the bounded re-sweep —
--       and reaching it means somebody just wrote `GRANT EXECUTE … TO authenticated` on an
--       undeclared definer. That is a deliberate act being undone, i.e. the exact incident above.
--   Same `rule` for both, so one query finds every firing:
--     select * from platform.ddl_guard_log where rule = 'definer_client_grant_revoked';
--
-- NO WARNING STORM ON THE GRANDFATHERED POPULATION. Verified live before applying: the GRANT
--   sweep's own predicate currently selects ZERO functions, so the next GRANT anywhere in the
--   database emits zero warnings and writes zero rows. Grandfathered doors are skipped before the
--   revoke, so they can never reach the announcement; and a function revoked once no longer holds
--   a client privilege, so it cannot be re-selected and re-announced.
--
-- Idempotent (CREATE OR REPLACE + a guarded contract insert). Applied live 2026-08-29.

-- ── 1. THE MESSAGE — one text, used by the warning AND by the durable row ───────────────────────
-- Its own function so the warning a developer sees and the row a later reader finds can never
-- drift apart, and so the exact wording is greppable from the docs. SECURITY INVOKER (the guard
-- calls it; nothing else does), pure text formatting, no catalog access.
create or replace function platform.definer_guard_revoke_notice(
  p_schema text, p_name text, p_identity_args text, p_signature text)
returns text
language sql
immutable
as $notice$
  select format(
    'Client EXECUTE (public/anon/authenticated) was REVOKED from %s. It is a SECURITY DEFINER '
    'function and it is NOT declared in platform.client_callable_door, so every client call now '
    'returns 42501 / HTTP 403 — if you just granted it, THE GRANT DID NOT STICK. To keep the grant, '
    'declare the door in the SAME migration, BEFORE the grant: '
    'INSERT INTO platform.client_callable_door (schema_name, function_name, identity_args, reason) '
    'VALUES (%L, %L, %L, ''why a client may safely call this''); then re-issue the GRANT. '
    'If it is NOT meant to be client-callable, nothing to do — this is the guard working. '
    '(hr_l3_108/hr_l3_110; common-docs /systems/platform/db-rules/FEATURE.md.)',
    p_signature, p_schema, p_name, p_identity_args)
$notice$;

comment on function platform.definer_guard_revoke_notice(text,text,text,text) is
  'The exact wording platform.enforce_definer_client_grants screams and stores when it revokes a '
  'client grant (hr_l3_110). Change it here and both the WARNING and the platform.ddl_guard_log '
  'row change together; keep it in step with common-docs /systems/platform/db-rules/FEATURE.md.';

-- ── 2. THE GUARD, NOW LOUD ───────────────────────────────────────────────────────────────────────
create or replace function platform.enforce_definer_client_grants()
returns event_trigger
language plpgsql
security definer
set search_path to 'platform', 'public', 'pg_catalog'
as $fn$
declare
  r  record;
  fn record;
  v_grant boolean := false;
  v_detail text;
  v_revoked boolean;
  v_exempt constant text[] := array[
    'pg_catalog','information_schema','pg_toast','extensions','graphql','graphql_public',
    'pgbouncer','realtime','_realtime','storage','auth','cron','net','vault','pgsodium',
    'pgsodium_masks','supabase_functions','supabase_migrations','dashboard','pgtle','tiger',
    'tiger_data','topology'];
begin
  for r in select objid, object_type from pg_event_trigger_ddl_commands()
  loop
    begin
      if r.objid is not null and lower(r.object_type) = 'function' then
        select n.nspname as sch, p.proname as nm, p.prosecdef, p.prokind, p.prorettype,
               p.proargtypes::text as argtypes,
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
                  format('%s.%s(%s)', fn.sch, fn.nm, fn.ia), tg_tag, v_detail);
        exception when others then
          raise warning 'ddl_guard[definer_client_grant_revoked]: announcement FAILED (%) — the client EXECUTE revoke on % DID happen; the guard needs repair.', sqlerrm, fn.sig;
        end;
      elsif upper(r.object_type) = 'FUNCTION' then
        v_grant := true;
      end if;
    exception when others then null;
    end;
  end loop;

  if v_grant then
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
      -- 🚨 THE ANNOUNCEMENT (hr_l3_110) — severity 'error' on this path: reaching it means somebody
      -- just GRANTed an undeclared definer and the guard took it straight back. Announced only when
      -- the revoke actually happened, and in its own subtransaction.
      if v_revoked then
        begin
          v_detail := platform.definer_guard_revoke_notice(fn.sch, fn.nm, fn.ia, fn.sig);
          raise warning 'ddl_guard[definer_client_grant_revoked]: %', v_detail;
          insert into platform.ddl_guard_log(severity, rule, object_ref, command_tag, detail)
          values ('error', 'definer_client_grant_revoked',
                  format('%s.%s(%s)', fn.sch, fn.nm, fn.ia), tg_tag, v_detail);
        exception when others then
          raise warning 'ddl_guard[definer_client_grant_revoked]: announcement FAILED (%) — the client EXECUTE revoke on % DID happen; the guard needs repair.', sqlerrm, fn.sig;
        end;
      end if;
    end loop;
  end if;
exception
  when others then
    null;   -- belt and suspenders: the whole pass can never raise.
end;
$fn$;

comment on function platform.enforce_definer_client_grants() is
  'DB-wide ddl_command_end guard (hr_l3_108, fixed hr_l3_109, made LOUD hr_l3_110). Revokes client '
  'EXECUTE (public/anon/authenticated) from any SECURITY DEFINER function that is neither '
  'grandfathered nor declared in platform.client_callable_door — and, since hr_l3_110, RAISEs a '
  'WARNING naming the function plus the one-line remedy and writes a durable '
  'platform.ddl_guard_log row (rule=definer_client_grant_revoked). Fail-open by construction: it '
  'fires on every team''s CREATE FUNCTION/GRANT, so it must never be able to abort a migration.';

-- ── 3. CONTRACT — a future re-emit cannot silently drop the announcement ─────────────────────────
-- hr.function_contract is asserted by hr.function_contracts_broken(), which the blocking punch
-- conformance gate reads. If somebody CREATE OR REPLACEs this guard from the hr_l3_108/109 text
-- (the exact way this defect was born), the contract goes red instead of the guard going quiet.
insert into hr.function_contract
  (schema_name, function_name, home_migration, must_contain, must_not_contain, reason,
   is_active, must_be_definer, overloads_intended)
select
  'platform', 'enforce_definer_client_grants', 'hr_l3_110_the_guard_announces_what_it_takes',
  array[
    'raise warning',
    'definer_client_grant_revoked',
    'platform.ddl_guard_log',
    'platform.definer_guard_revoke_notice'],
  array[]::text[],
  'hr_l3_110: the guard must ANNOUNCE every revoke — a RAISE WARNING naming the function and the '
  || 'client_callable_door remedy, plus a durable platform.ddl_guard_log row. It shipped silent in '
  || 'hr_l3_108 and an agent lost a door to it the next day with no error anywhere. The tokens '
  || 'assert the warning, the rule key, the durable lane, and the shared message builder; if a '
  || 'later CREATE OR REPLACE reverts to the quiet body, this contract goes red in the blocking '
  || 'gate instead of the loss going unnoticed again. RAISE WARNING never aborts a transaction, so '
  || 'the guard stays fail-open.',
  true, true, false
where not exists (
  select 1 from hr.function_contract
   where schema_name = 'platform' and function_name = 'enforce_definer_client_grants'
     and home_migration = 'hr_l3_110_the_guard_announces_what_it_takes');

-- ── 4. SELF-CHECK ───────────────────────────────────────────────────────────────────────────────
do $chk$
begin
  if to_regprocedure('platform.definer_guard_revoke_notice(text,text,text,text)') is null then
    raise exception 'hr_l3_110: the message builder did not install';
  end if;
  if not exists (select 1 from pg_event_trigger
                  where evtname = 'enforce_definer_client_grants' and evtenabled <> 'D') then
    raise exception 'hr_l3_110: the event trigger is missing or disabled';
  end if;
  if exists (select 1 from hr.function_contracts_broken()
              where qname = 'platform.enforce_definer_client_grants') then
    raise exception 'hr_l3_110: the announcement contract is RED on landing';
  end if;
end
$chk$;
