-- HR domain C3 — migration 11 (register item HRB-007 follow-up, lane core-c3-access).
--
-- 🚨 A REGRESSION I INTRODUCED IN `hr_c3_00`, FOUND BY THE L10 INBOX PROOF (measured, on its
-- register trail). Writing `hr.employment` left the write-guard flag holding a STALE
-- statement-scoped token, so the NEXT `hr.*` write in the same transaction was refused.
--
-- THE MECHANISM, reproduced live before anything was touched:
--   R1  flag before the employment write = 'on'                     (the caller's legacy arm)
--   R2  flag AFTER the employment write  = 'cdcfdc61e361…'          (a statement token)
--   R3  🚨 the next hr.* write under the SAME legacy arm REFUSED 42501
--
-- `hr.employment` carries `_zzz_derive_grants`, whose derivation calls `hr._reconcile_grants`,
-- which calls `hr.arm_write()`. That call OVERWROTE the caller's transaction-scoped `'on'` with a
-- statement-scoped token. Inside that statement the token is valid, so the write itself succeeded
-- and nothing looked wrong; the damage only appears on the NEXT statement, where the token no
-- longer matches and the literal that would have covered it is gone. **A callee silently
-- downgraded its caller's privileges** — any fixture writing employment and then anything else in
-- one transaction hits it, which is why the L10 lane found it and not this one's own suites (all
-- of mine run inside a single DO block, i.e. a single statement, where the token stays valid).
--
-- ===================================================================================
-- THE FIX, and why this shape rather than save/restore
--
-- `hr.arm_write()` now leaves an existing LEGACY arm exactly as it found it. Its contract is
-- "ensure THIS statement is armed" — and when a transaction-scoped `'on'` is already in effect the
-- statement already is, so there is nothing to do and no reason to touch the caller's state.
--
-- Save/restore was the alternative and it is worse here: `arm_write()` has no natural end hook, so
-- restoring would mean pairing every one of the 18 C3 call sites with a disarm and getting every
-- early return, every refusal envelope and every exception path right. A callee that simply never
-- degrades its caller needs no pairing at all.
--
-- 🚨 THE THREE CASES, and the reason this cannot reopen what hr_c3_00 closed:
--   · a legacy `'on'` is in effect  → left alone. The caller was ALREADY armed for the whole
--     transaction; nothing a callee does can tighten that, so no privilege is added.
--   · a token is in effect for THIS statement → recomputed to the byte-identical value, because
--     the token is `md5(statement_timestamp() || pid || key)` and `statement_timestamp()` is stable
--     across a statement's inner calls. A no-op.
--   · a STALE token from an earlier statement, or nothing → overwritten with this statement's
--     token, exactly as before.
-- The tight lane is therefore unchanged in every respect that matters, and §9's statement-scope
-- assertions are re-run below as part of this item's proof rather than assumed.
-- ===================================================================================

set local statement_timeout = '600s';
set local lock_timeout = '30s';

create or replace function hr.arm_write()
returns void
language plpgsql security definer set search_path = hr, public
as $fn$
declare v_cur text := coalesce(current_setting('hr.privileged_write', true), '');
begin
  -- 🚨 A CALLEE MUST NEVER DEGRADE ITS CALLER'S ARM. A transaction-scoped legacy arm already
  -- covers this statement, so overwriting it with a statement-scoped token would take privileges
  -- AWAY from the caller for every later statement — which is precisely the regression the L10
  -- inbox proof measured. Leaving it adds nothing: the caller is already armed transaction-wide.
  if v_cur in ('on','true','1','yes') then
    return;
  end if;

  perform set_config('hr.privileged_write',
    md5(statement_timestamp()::text || pg_backend_pid()::text ||
        (select k.key from hr._write_guard_key k limit 1)),
    true);
end
$fn$;

comment on function hr.arm_write is
  'THE ONLY sanctioned way to arm the HR write guard (SPEC-ACCESS law 2). The token is statement-scoped — statement_timestamp() is stable across a function''s inner statements and changes between top-level statements — so the arm dies with the statement instead of surviving the whole transaction, and it is unforgeable (this function is REVOKEd from authenticated/anon and the token mixes a key that role cannot read). It NEVER overwrites a caller''s existing legacy arm: a callee that downgrades its caller is how writing hr.employment used to refuse the next write in the same transaction.';

revoke all on function hr.arm_write() from public;
revoke all on function hr.arm_write() from anon, authenticated;

-- ============================================================ assertions
do $$
declare v_bad int; v_before text; v_after text;
begin
  -- the guarantee, asserted in the migration itself rather than only in a probe
  perform set_config('hr.privileged_write','on',true);
  perform hr.arm_write();
  v_after := current_setting('hr.privileged_write', true);
  if v_after <> 'on' then
    raise exception 'hr_c3_11: arm_write still clobbers a legacy arm (left %)', v_after;
  end if;

  -- and it still arms when nothing is in effect
  perform set_config('hr.privileged_write','',true);
  perform hr.arm_write();
  v_after := current_setting('hr.privileged_write', true);
  if v_after is null or v_after = '' or v_after in ('on','true','1','yes') then
    raise exception 'hr_c3_11: arm_write did not issue a token from a cold start (left %)', v_after;
  end if;

  -- calling it twice inside one statement is a no-op, not a rotation
  v_before := v_after;
  perform hr.arm_write();
  if current_setting('hr.privileged_write', true) is distinct from v_before then
    raise exception 'hr_c3_11: the token rotated within a single statement';
  end if;

  -- the client-forgery wall from hr_c3_00 is untouched
  if has_function_privilege('authenticated', 'hr.arm_write()', 'execute')
     or has_function_privilege('anon', 'hr.arm_write()', 'execute') then
    raise exception 'hr_c3_11: hr.arm_write became callable by a client role';
  end if;
  if not (select prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'hr' and p.proname = '_guard_hr_write') then
    raise exception 'hr_c3_11: the guard stopped being SECURITY DEFINER';
  end if;

  perform set_config('hr.privileged_write','',true);

  select count(*) into v_bad from platform.entity_types e
   where e.schema_name = 'hr' and not iam.canonical_certify_ok(e.schema_name, e.table_name, e.token);
  if v_bad > 0 then
    raise exception 'hr_c3_11: % hr tokens no longer certify', v_bad;
  end if;
end $$;
