-- DD-212b — THE §6d-4 DEFINER GUARD READS THE FLAG TOO, NOT JUST THE ROW'S EXISTENCE.
-- (B-99, Data Doctrine adoption program, 2026-09-14. SECURITY P1.
--  The one residue V-72 found while verifying DD-212/DD-207 — §10 of its report.)
--
-- THE DEFECT — V-72's PLANT, REPRODUCED BY THIS LANE AND ROLLED BACK
-- -----------------------------------------------------------------
-- DD-212 taught the DD-202 birth trigger, `check:impl-doors` D5 and D9 to read
-- `platform.client_callable_door.anonymous_callers`. It did not reach the OTHER
-- guard. `platform.enforce_definer_client_grants_impl` skips a function the
-- moment ANY door row exists for it:
--
--     if exists (select 1 from platform.client_callable_door c
--                 where c.schema_name = fn.sch and c.function_name = fn.nm
--                   and c.identity_args = fn.ia) then continue; end if;
--
-- and DD-202's trigger skips every SECURITY DEFINER on purpose ("SECURITY
-- DEFINER belongs to the §6d-4 guard"). So between them, a DEFINER function BORN
-- FRESH beside a flag-FALSE door row is reachable by a signed-out caller and
-- nothing says a word:
--
--   insert into platform.client_callable_door (…, reason, anonymous_callers)
--   values ('public','v72_definer_signedin','','Signed-in door. …', false);
--   create function public.v72_definer_signedin() returns void language sql security definer …
--   → has_function_privilege('anon', …) = TRUE
--     proacl = {=X/postgres,postgres=X,authenticated=X,service_role=X}   ← PUBLIC is there
--     no NOTICE, no WARNING, no ddl_guard_log row
--
--   control, same shape with NO door row → WARNING definer_client_grant_revoked, anon FALSE
--
-- A bare `GRANT EXECUTE … TO anon` on such a function fires nothing either: the
-- guard's GRANT re-sweep carries the same existence-only filter. `check:impl-doors`
-- D13 catches both — but CI is a signal, not a gate (Arman's ruling), so the door
-- stands open and silent from the DDL until somebody runs the gate.
--
-- THE FIX — A DECLARED SIGNED-IN DOOR IS A DECISION ABOUT SIGNED-IN CALLERS
-- ------------------------------------------------------------------------
-- The door-row skip splits in two, in both the per-object pass and the GRANT
-- re-sweep:
--   * `anonymous_callers = true`  → skip entirely. A declared anonymous door
--     keeps every grant it has; that is what the flag MEANS.
--   * `anonymous_callers = false` → the row is a decision about SIGNED-IN
--     callers, so `authenticated` and `service_role` keep everything they hold
--     and only `anon`/PUBLIC are taken back — DD-197's capture-revoke-regrant, so
--     nobody's feature fails at call time tomorrow. Announced with its own
--     sentence and its own `platform.ddl_guard_log` rule
--     (`declared_signed_in_door_anon_revoked`), because this one fires rarely —
--     only on a fresh birth or an explicit grant — and somebody should read it.
--   * no door row at all → unchanged: the full public/anon/authenticated revoke
--     and the `definer_client_grant_revoked` row the §6d-4 contract promises.
--
-- AND THE REMEDY SENTENCE STOPS TEACHING THE DEFECT. `definer_guard_revoke_notice`
-- printed an INSERT template with no `anonymous_callers`/`anonymous_purpose`, so an
-- author following it verbatim wrote a flag-false row and re-issued the anon GRANT
-- — manufacturing exactly this class, on the guard's own instructions. It now
-- prints both columns and says which one the guard reads.

-- ─── 1. The two wordings ────────────────────────────────────────────────────
create or replace function platform.definer_guard_revoke_notice(
  p_schema text, p_name text, p_identity_args text, p_signature text)
returns text
language sql
immutable
as $$
  select format(
    'Client EXECUTE (public/anon/authenticated) was REVOKED from %s. It is a SECURITY DEFINER '
    'function and it is NOT declared in platform.client_callable_door, so every client call now '
    'returns 42501 / HTTP 403 — if you just granted it, THE GRANT DID NOT STICK. To keep the grant, '
    'declare the door in the SAME migration, BEFORE the grant: '
    'INSERT INTO platform.client_callable_door (schema_name, function_name, identity_args, reason, '
    'anonymous_callers, anonymous_purpose) VALUES (%L, %L, %L, ''why a client may safely call this'', '
    'false, NULL); then re-issue the GRANT. A door declared like that keeps its SIGNED-IN grants and '
    'nothing else — if a caller with NO ACCOUNT is meant to reach it, the row must instead carry '
    'anonymous_callers = true WITH an anonymous_purpose saying who that caller is and what stands in '
    'for an identity, or this guard takes the anon grant back again (DD-212: the FLAG is what both '
    'DDL guards read, never a word in the reason). '
    'If it is NOT meant to be client-callable, nothing to do — this is the guard working. '
    '(hr_l3_108/hr_l3_110/DD-212b; common-docs /systems/platform/db-rules/FEATURE.md §6d-4.)',
    p_signature, p_schema, p_name, p_identity_args)
$$;
revoke execute on function platform.definer_guard_revoke_notice(text,text,text,text) from public;
revoke execute on function platform.definer_guard_revoke_notice(text,text,text,text) from anon;
revoke execute on function platform.definer_guard_revoke_notice(text,text,text,text) from authenticated;

create or replace function platform.definer_guard_anon_revoke_notice(
  p_schema text, p_name text, p_identity_args text, p_signature text, p_kept text)
returns text
language sql
immutable
as $$
  select format(
    'EXECUTE for PUBLIC and anon was REVOKED from %s. It is a SECURITY DEFINER function and its '
    'platform.client_callable_door row carries anonymous_callers = false — a decision about '
    'SIGNED-IN callers — so a caller with no account was never meant to reach it. Everything '
    'signed-in keeps what it held (%s); only anon lost anything. This fires when the function is '
    'BORN (PostgreSQL gives every new function EXECUTE to PUBLIC, and PUBLIC reaches anon) or when '
    'somebody GRANTs it to anon explicitly. If a caller with NO ACCOUNT really is meant to reach it, '
    'do not re-issue the grant — change the DECLARATION first, in a migration: UPDATE '
    'platform.client_callable_door SET anonymous_callers = true, anonymous_purpose = ''who the '
    'signed-out caller is and what stands in for an identity — a token, a slug, a device secret, a '
    'fingerprint'' WHERE schema_name = %L AND function_name = %L AND identity_args = %L; then GRANT '
    'EXECUTE ON FUNCTION %s TO anon, and gate the body for a NULL auth.uid(). '
    '(DD-212b; common-docs /systems/platform/db-rules/FEATURE.md §6d-4.)',
    p_signature, coalesce(nullif(p_kept, ''), 'nothing — no signed-in role held EXECUTE'),
    p_schema, p_name, p_identity_args, p_signature)
$$;
revoke execute on function platform.definer_guard_anon_revoke_notice(text,text,text,text,text) from public;
revoke execute on function platform.definer_guard_anon_revoke_notice(text,text,text,text,text) from anon;
revoke execute on function platform.definer_guard_anon_revoke_notice(text,text,text,text,text) from authenticated;

-- ─── 2. The guard ───────────────────────────────────────────────────────────
-- Everything outside the two door-row tests is preserved verbatim from the live
-- body (the exempt-schema list, the argtypes grandfather match, the fail-open
-- handlers, the announcement subtransactions, the 'warn'/'error' severities), so
-- a diff against what was running shows exactly one idea moving.
create or replace function platform.enforce_definer_client_grants_impl(
  p_objids oid[], p_grant boolean, p_tag text)
returns void
language plpgsql
security definer
set search_path to 'platform', 'public', 'pg_catalog'
as $$
declare
  r_oid oid;
  fn record;
  v_detail text;
  v_revoked boolean;
  v_anon_door boolean;
  v_keep text[];
  v_role text;
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
             pg_get_function_identity_arguments(p.oid) as ia, p.oid::regprocedure::text as sig,
             p.oid as oid
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

      -- 🚨 DD-212b: the door row's FLAG, not merely its existence. NULL = no row.
      select bool_or(c.anonymous_callers) into v_anon_door
        from platform.client_callable_door c
       where c.schema_name = fn.sch and c.function_name = fn.nm and c.identity_args = fn.ia;

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
             pg_get_function_identity_arguments(p.oid) as ia, p.oid as oid,
             -- 🚨 DD-212b: carried out of the filter so the loop body knows WHICH revoke to make.
             exists (select 1 from platform.client_callable_door c
                      where c.schema_name = n.nspname and c.function_name = p.proname
                        and c.identity_args = pg_get_function_identity_arguments(p.oid)) as declared
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
                            and c.identity_args = pg_get_function_identity_arguments(p.oid)
                            and c.anonymous_callers)
         and (not exists (select 1 from platform.client_callable_door c
                           where c.schema_name = n.nspname and c.function_name = p.proname
                             and c.identity_args = pg_get_function_identity_arguments(p.oid))
              or has_function_privilege('anon', p.oid, 'EXECUTE')
              or has_function_privilege('public', p.oid, 'EXECUTE'))
    loop
      v_revoked := false;
      if fn.declared then
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
$$;
revoke execute on function platform.enforce_definer_client_grants_impl(oid[],boolean,text) from public;
revoke execute on function platform.enforce_definer_client_grants_impl(oid[],boolean,text) from anon;
revoke execute on function platform.enforce_definer_client_grants_impl(oid[],boolean,text) from authenticated;

-- ─── 3. THE FORCING PROOF, on this path, in this file ───────────────────────
do $$
declare
  v_anon boolean; v_auth boolean; v_svc boolean; v_n int;
begin
  -- (a) V-72's plant: a DEFINER born beside a flag-FALSE door row
  insert into platform.client_callable_door
    (schema_name, function_name, identity_args, reason, anonymous_callers)
  values ('public','dd212b_definer_signedin','',
          'Signed-in door. The caller is resolved inside the body; no caller without an account exists.', false);
  execute 'create function public.dd212b_definer_signedin() returns void language sql security definer as $b$ select 1 $b$';
  select has_function_privilege('anon','public.dd212b_definer_signedin()','execute'),
         has_function_privilege('authenticated','public.dd212b_definer_signedin()','execute'),
         has_function_privilege('service_role','public.dd212b_definer_signedin()','execute')
    into v_anon, v_auth, v_svc;
  if v_anon then
    raise exception 'DD-212b FAILED: a SECURITY DEFINER function born beside a flag-false door row is still executable by anon — the §6d-4 guard is still reading the row''s existence.';
  end if;
  if not v_auth or not v_svc then
    raise exception 'DD-212b FAILED: a declared SIGNED-IN door lost a signed-in grant (authenticated=%, service_role=%) — this file must take back anon and nothing else.', v_auth, v_svc;
  end if;
  select count(*) into v_n from platform.ddl_guard_log
   where rule = 'declared_signed_in_door_anon_revoked'
     and object_ref = 'public.dd212b_definer_signedin()';
  if v_n = 0 then
    raise exception 'DD-212b FAILED: the anon revoke on a declared signed-in door happened in silence — nothing fails silently.';
  end if;

  -- (b) a bare GRANT … TO anon on that same declared signed-in door is taken back
  execute 'grant execute on function public.dd212b_definer_signedin() to anon';
  select has_function_privilege('anon','public.dd212b_definer_signedin()','execute'),
         has_function_privilege('authenticated','public.dd212b_definer_signedin()','execute')
    into v_anon, v_auth;
  if v_anon then
    raise exception 'DD-212b FAILED: an explicit GRANT EXECUTE … TO anon on a declared SIGNED-IN definer door stuck — the GRANT re-sweep is still skipping declared doors.';
  end if;
  if not v_auth then
    raise exception 'DD-212b FAILED: the GRANT re-sweep took a signed-in grant as well.';
  end if;

  -- (c) a DECLARED ANONYMOUS door still keeps anon at birth — the flag means what it says
  insert into platform.client_callable_door
    (schema_name, function_name, identity_args, reason, anonymous_callers, anonymous_purpose)
  values ('public','dd212b_definer_anon','','DD-212b self-test.', true,
          'A caller with no account reaches this self-test probe by design; it exists only to prove a declared anonymous definer door keeps its grant.');
  execute 'create function public.dd212b_definer_anon() returns void language sql security definer as $b$ select 1 $b$';
  execute 'grant execute on function public.dd212b_definer_anon() to anon';
  select has_function_privilege('anon','public.dd212b_definer_anon()','execute') into v_anon;
  if not v_anon then
    raise exception 'DD-212b FAILED: a door DECLARED with anonymous_callers = true lost anon EXECUTE — the guard must not touch a declared anonymous door.';
  end if;

  -- (d) an UNDECLARED definer still loses every client grant, with its own §6d-4 row
  execute 'create function public.dd212b_definer_nodoor() returns void language sql security definer as $b$ select 1 $b$';
  select has_function_privilege('anon','public.dd212b_definer_nodoor()','execute'),
         has_function_privilege('authenticated','public.dd212b_definer_nodoor()','execute')
    into v_anon, v_auth;
  if v_anon or v_auth then
    raise exception 'DD-212b FAILED: an UNDECLARED SECURITY DEFINER function kept a client grant (anon=%, authenticated=%) — the §6d-4 contract regressed.', v_anon, v_auth;
  end if;

  -- teardown: nothing of this file's proof survives it
  execute 'drop function public.dd212b_definer_signedin()';
  execute 'drop function public.dd212b_definer_anon()';
  execute 'drop function public.dd212b_definer_nodoor()';
  delete from platform.client_callable_door where function_name like 'dd212b!_%' escape '!';
  delete from platform.ddl_guard_log where object_ref like 'public.dd212b!_%' escape '!';

  raise notice 'DD-212b proven on the sanctioned path: a definer born beside a flag-false door row comes out closed to anon and says so, an explicit GRANT to anon on one is taken back, a declared anonymous door keeps anon, and an undeclared definer still loses every client grant.';
end $$;

-- ─── 4. This file's own §6d-4 log row is ACKNOWLEDGED, never deleted ────────
-- `create or replace` of the DEFINER impl makes the guard revoke client EXECUTE
-- from ITSELF and write a row. That is the guard working, and it is expected
-- here — but an unacknowledged row is somebody else's triage lane. `now()` is
-- the transaction timestamp, so this touches only rows this apply produced.
update platform.ddl_guard_log
   set acknowledged_at = now(),
       acknowledged_by = 'DD-212b (B-99)',
       ack_reason = 'Expected: DD-212b replaces platform.enforce_definer_client_grants_impl so the §6d-4 guard reads platform.client_callable_door.anonymous_callers instead of the row''s mere existence. The impl is deliberately not client-callable — no client role should hold EXECUTE on it — so the revoke this row records is the intended end state, not a lost grant.'
 where rule = 'definer_client_grant_revoked'
   and object_ref like 'platform.enforce_definer_client_grants_impl%'
   and acknowledged_at is null
   and occurred_at >= now();

comment on function platform.enforce_definer_client_grants_impl(oid[],boolean,text) is
  'db-rules §6d-4. DD-212b (2026-09-14): the door-row test reads platform.client_callable_door.anonymous_callers, not merely the row''s existence. anonymous_callers = true skips entirely; false takes back anon/PUBLIC and re-grants every signed-in role that held EXECUTE; no row at all still loses every client grant. Before this, a DEFINER born beside a flag-false door row came out anon-executable in silence, and an explicit GRANT … TO anon on one fired nothing (V-72, rolled back).';
comment on function platform.definer_guard_anon_revoke_notice(text,text,text,text,text) is
  'DD-212b: the sentence for a DECLARED SIGNED-IN definer door that just lost anon/PUBLIC. It names the signed-in roles that kept EXECUTE and tells the author to change the DECLARATION (anonymous_callers + anonymous_purpose) rather than re-issue the grant.';
