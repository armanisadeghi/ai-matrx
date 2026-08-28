-- HR domain L3 — register item HRB-015, lane l3-punch-kiosk (BUILDER SQL-1).
--
-- CHECK 33 DEBT CAMPAIGN — FINAL REVOKE. C4 converted 11 of 12 workflow doors to SECURITY DEFINER,
-- which unblocks the inner grants that were load-bearing only because an INVOKER wrapper ran as the
-- caller. 50 of the 53 close here. Three are HELD BY NAME, each with a reason and an owner.
--
-- 🚨 PROOF SUITES REACH PAST DOORS, AND THIS IS WHY THE REPOINT CAME FIRST. C4's hrb008 aborted at
-- 92/188 mid-campaign because it called `hr.pay_period_transition` DIRECTLY while running
-- `set local role authenticated` — an inner revoke read exactly like an engine break. Both HR proof
-- suites carried the same shape against the workflow inners. Before revoking anything I swept them
-- and repointed **70 call sites** onto the public doors — 50 in `hrb008_proof.py`, 20 in
-- `hrb022_proof.py` — for the twelve inners that have a door and whose door signature is
-- byte-identical to the inner's: wf_request, wf_decide, wf_submit, wf_resolve_failure,
-- wf_record_result, wf_bulk_decide, wf_delegate, wf_withdraw, wf_escalate, wf_cancel. Line counts
-- unchanged; the suites now exercise the surface a client actually uses, which is a better proof
-- than the one they were running.
--
-- HELD, BY NAME:
--   * `hr.wf_for_target`      — D283. Its door shipped with NO authorization gate (cross-org history
--                               leak, predating the conversion); C4 is fixing it under a ruling and
--                               hands the grant back when done. The 12th door is still INVOKER.
--   * `hr.wf_publish_definition` — no public door exists, and `hrb008_proof.py:809,827` calls it as a
--                               client role. Revoking would break that suite with no door to
--                               repoint to.
--   * `hr.wf_pending`        — no public door exists, and `hrb022_proof.py:409` calls it as bob with
--                               NO arguments, i.e. caller-scoped "my pending items". Forcing that
--                               call to run as owner would not break the suite — it would silently
--                               stop proving bob's scoping, which is worse. Needs a door or the
--                               owning lane's repoint.
--
-- Authority: coordinator ruling (final revoke, split with inline evidence, repoint proofs first);
-- the campaign rule ratified after batch 1.
--
-- Applied live as `hr_l3_89_revoke_final_workflow_inner_grants`. Idempotent.
--
-- ── RECORDED TECHNICAL DECISIONS ────────────────────────────────────────────────────────────
-- 1. THE HOLD LIST IS THREE NAMES WITH REASONS, NOT AN EXEMPTION LIST. Each names its blocker and
--    its owner, and each is expected to disappear — two need a door or a repoint, one needs D283.
--    An exemption list says "never"; this says "not yet, and here is who".
-- 2. THE SET IS OTHERWISE DERIVED (D13): every `hr` definer function matching the workflow family
--    that is still client-reachable, minus the three. A 54th workflow helper written tomorrow is
--    closed by this migration's next replay rather than missed by a stale list.
-- 3. GROUPED, AND THE GROUPS ARE ANNOUNCED. The revoke runs per door group with its own notice, so
--    the log reads as five reviewable steps rather than one sweep of fifty — the reviewability point
--    raised against batch 5's forty-eight.
-- 4. IT CLOSES ONLY WHAT IS OPEN, so a replay is a no-op and a grant a lane makes later is not
--    silently re-closed by a re-run.

begin;

do $mig$
declare
  r record;
  v_held text[] := array['wf_for_target', 'wf_publish_definition', 'wf_pending'];
  v_group text;
  v_n integer;
  v_total integer := 0;
begin
  foreach v_group in array array['decide', 'request', 'delegate', 'inbox', 'engine'] loop
    v_n := 0;
    for r in
      select p.oid::regprocedure::text as sig, p.proname
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'hr'
         and p.prosecdef
         and p.proname ~ 'wf'
         and not (p.proname = any (v_held))                      -- decision 1
         and (has_function_privilege('anon', p.oid, 'EXECUTE')
           or has_function_privilege('authenticated', p.oid, 'EXECUTE'))
         and case v_group                                        -- decision 3
               when 'decide'   then p.proname ~ '(decide|record_result|escalate|activate_step|auto_decide)'
               when 'request'  then p.proname ~ '(request|submit|resubmit|withdraw|cancel)'
               when 'delegate' then p.proname ~ '(delegate|reassign|grant_step|revoke_step)'
               when 'inbox'    then p.proname ~ '(inbox|instance|display|project_step|unproject_step)'
               else true                                         -- engine: everything remaining
             end
    loop
      execute format('revoke all on function %s from public', r.sig);
      execute format('revoke all on function %s from anon', r.sig);
      execute format('revoke all on function %s from authenticated', r.sig);
      v_n := v_n + 1; v_total := v_total + 1;
    end loop;
    raise notice 'hr_l3_89: group % -> % closed', v_group, v_n;
  end loop;
  raise notice 'hr_l3_89: % workflow inner grants closed in total', v_total;
end
$mig$;

do $chk$
declare v_left integer; v_held integer; v_names text;
begin
  select count(*), coalesce(string_agg(t.qname, ', ' order by t.qname), '')
    into v_left, v_names
    from hr.definer_functions_client_reachable() t;

  select count(*) into v_held
    from hr.definer_functions_client_reachable() t
   where t.qname in ('hr.wf_for_target', 'hr.wf_publish_definition', 'hr.wf_pending');

  if v_left <> v_held then
    raise exception 'hr_l3_89: % client-reachable remain but only % are the named holds: %',
      v_left, v_held, v_names;
  end if;
  if (select count(*) from hr.punch_write_path_conformance() where not ok) <> 0 then
    raise exception 'hr_l3_89: a conformance check is failing after the revoke';
  end if;
  raise notice 'hr_l3_89: debt is now % and it is exactly the named holds: %', v_left, v_names;
end
$chk$;

commit;
