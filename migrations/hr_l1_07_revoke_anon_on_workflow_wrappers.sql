-- HR domain L1 — cross-lane security fix (register item HRB-013, lane l1-employees).
--
-- REVOKE `anon` EXECUTE ON THE THIRTEEN `public.hr_wf_*` WRAPPERS.
-- Applied live as `hr_l1_07_revoke_anon_on_workflow_wrappers`. Idempotent.
--
-- ===================================================================================
-- 🚨 WHAT WAS FOUND, AND HOW BAD IT ACTUALLY IS — both halves, because a security note that
-- overstates is as useless as one that understates.
--
-- Measuring the HR RPC surface after landing L1's doors: **98 `public.hr_*` functions, 19 of them
-- executable by `anon`.** Six are the kiosk family and are anon BY DESIGN — a wall-mounted clock
-- has no `auth.uid()` and SPEC-TIME's whole device-actor lane depends on it. The other thirteen
-- are the L10 inbox lane's workflow wrappers, including **`hr_wf_decide`, `hr_wf_bulk_decide`,
-- `hr_wf_cancel`, `hr_wf_delegate` and `hr_wf_reassign_step`** — the approval-decision surface.
--
-- Postgres grants EXECUTE to PUBLIC on every new function unless you revoke it. Core C3's
-- `hr_c3_06_audited_doors` knew that and closed each of its eight doors with an explicit
-- revoke + a §9 T-34 assertion that fails the migration if any door is anon-executable. The
-- workflow wrappers shipped without either.
--
-- **NOT EXPLOITABLE TODAY, and it matters that this is said accurately.** All thirteen are
-- `SECURITY INVOKER` (`prosecdef = false`), so they execute as the CALLER, and `anon` has no
-- USAGE on the `hr` schema (verified live: `has_schema_privilege('anon','hr','usage')` is false).
-- An anonymous call reaches the wrapper and dies at the inner `hr.wf_decide`. Nothing is open
-- right now.
--
-- **It is still a defect, and this is the class of defect that becomes real later.** The thing
-- standing between `anon` and the approval-decision RPC is a schema grant two layers away, not
-- the door's own grant. The obvious future edit — making one of these `SECURITY DEFINER`, which
-- is what someone will reach for the moment they need it to work for a caller who cannot see
-- `hr.*` directly — silently converts a closed door into an open one, with no assertion anywhere
-- to catch it. L1's own `hr_wf_request` / `hr_wf_submit` ARE `SECURITY DEFINER`, which is exactly
-- why they were revoked explicitly.
--
-- The fix is a revoke that removes a grant no legitimate caller uses: every real caller is
-- `authenticated` or `service_role`, and both keep EXECUTE. Behaviour for every working call site
-- is unchanged.
--
-- **Owned by L10 (HRB-022), fixed here under the defect-ownership rule** — a known, unambiguous,
-- one-statement fix on a security boundary does not wait for a ticket. Routed to the coordinator
-- so L10 folds the revoke + the T-34 assertion into its own file and the two do not drift.
-- ===================================================================================

set local statement_timeout = '600s';
set local lock_timeout = '20s';

do $$
declare f record; v_fixed int := 0;
begin
  for f in
    select p.oid::regprocedure as sig, p.proname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('hr_wf_decide','hr_wf_bulk_decide','hr_wf_cancel','hr_wf_withdraw',
                         'hr_wf_resubmit','hr_wf_escalate','hr_wf_reassign_step','hr_wf_delegate',
                         'hr_wf_record_result','hr_wf_resolve_failure','hr_wf_for_target',
                         'hr_wf_instance','hr_wf_inbox')
  loop
    execute format('revoke all on function %s from public', f.sig);
    execute format('revoke all on function %s from anon', f.sig);
    execute format('grant execute on function %s to authenticated, service_role', f.sig);
    v_fixed := v_fixed + 1;
  end loop;
  raise notice 'hr_l1_07: closed % workflow wrapper(s) to anon', v_fixed;
end $$;

-- ============================================================ assertions

do $$
declare v_bad int; v_names text;
begin
  select count(*), string_agg(p.proname, ', ' order by p.proname) into v_bad, v_names
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname like 'hr\_wf\_%'
     and has_function_privilege('anon', p.oid, 'execute');
  if v_bad > 0 then
    raise exception 'hr_l1_07: % workflow wrapper(s) still executable by anon: %', v_bad, v_names;
  end if;

  -- every real caller keeps its lane; a revoke that broke the product would be a worse defect
  select count(*) into v_bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname like 'hr\_wf\_%'
     and not has_function_privilege('authenticated', p.oid, 'execute');
  if v_bad > 0 then
    raise exception 'hr_l1_07: % workflow wrapper(s) lost their authenticated grant', v_bad;
  end if;

  -- 🚨 THE STANDING RULE, asserted here for the WHOLE `public.hr_*` surface rather than one file's
  -- own functions, because the hole this closes was created by nobody checking the whole surface.
  -- The kiosk family is the ONE sanctioned exception: a wall-mounted device has no auth.uid().
  select count(*), string_agg(p.proname, ', ' order by p.proname) into v_bad, v_names
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname like 'hr\_%'
     and p.proname not like 'hr\_kiosk\_%'
     and has_function_privilege('anon', p.oid, 'execute');
  if v_bad > 0 then
    raise exception 'hr_l1_07: § T-34 — % non-kiosk hr_* RPC(s) are executable by anon: %',
      v_bad, v_names;
  end if;
end $$;
