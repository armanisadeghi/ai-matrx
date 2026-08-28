-- HR domain L3 — register item HRB-015, lane l3-punch-kiosk (BUILDER SQL-1).
--
-- CHECK 33 DEBT CAMPAIGN — THE LAST THREE. Debt goes to ZERO.
--
-- These three were HELD BY NAME across three reports rather than swept, because each was
-- load-bearing for a reason that was not mine to overrule:
--
--   hr.wf_for_target         its door was the 12th SECURITY INVOKER wrapper, and D283 had it
--                            shipping with no authorization gate. C4's hr_c4_36 extracted the
--                            instance-visibility rule and gated the door through it.
--   hr.wf_publish_definition no public door existed at all, and `hrb008_proof.py` called it as a
--                            client role. C4's hr_c4_37 gave publishing a real door and repointed
--                            the proof.
--   hr.wf_pending            no door, and `hrb022_proof.py:409` called it as bob with NO arguments
--                            — caller-scoped "my pending items". Forcing it to run as owner would
--                            not have broken the suite; it would have silently stopped proving
--                            bob's scoping, which is worse than a red. C4 moved that assertion to
--                            impersonation-via-claims, which keeps the scoping proven without the
--                            grant.
--
-- All three were verified free by C4 in its own rolled-back revoke before handing them over: every
-- door still answered and all three inners returned 42501 to a client role.
--
-- 🚨 A CONCURRENT RULING MAY COLOUR THE PUBLISH PROBE. C4 is flipping the publish door's capability
-- gate to the owner-held `workflow.publish_definition` at the same time. If that door refuses an
-- admin in the proof below, that is the RULING LANDING, not this revoke: a capability refusal is a
-- structured envelope from inside the door, whereas a revoke that broke something shows as 42501
-- `permission denied for function` before any door logic runs. The two are distinguishable and the
-- report says which was seen.
--
-- Authority: coordinator ruling (C4 hands over the three; take them, land the campaign at zero);
-- the campaign rule ratified after batch 1.
--
-- Applied live as `hr_l3_90_the_last_three_grants`. Idempotent.
--
-- ── RECORDED TECHNICAL DECISIONS ────────────────────────────────────────────────────────────
-- 1. STILL DERIVED, EVEN AT THREE (D13). The loop closes whatever `hr.definer_functions_client_
--    reachable()` still reports rather than naming the three, so if a fourth appeared between the
--    handover and this migration it is closed too rather than missed — and if C4's own revoke
--    already landed one of them, this is simply a no-op for it.
-- 2. THE ASSERTION IS THE CAMPAIGN'S CLOSING CONDITION, NOT A COUNT. It requires the debt to be
--    exactly zero AND the baseline to be fully inert — every row in `hr.definer_grant_baseline`
--    describing a function that no longer appears in the reachable set. A baseline row that still
--    matched would mean a grant came back while nobody was looking.
-- 3. NO GRANTS ARE ISSUED HERE, AND NONE WERE ISSUED ANYWHERE IN THE CAMPAIGN. 202 functions were
--    closed across six batches and the only writes were REVOKEs. Whatever the product needed, it
--    already had through a SECURITY DEFINER door.

begin;

do $mig$
declare r record; v_n integer := 0;
begin
  -- decision 1: derived from the diagnostic, joined on schema+name so the signature never has to
  -- be rebuilt as a string (regprocedure will not accept one carrying parameter NAMES).
  for r in
    select distinct p.oid, p.oid::regprocedure::text as sig, n.nspname||'.'||p.proname as qname
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      join hr.definer_functions_client_reachable() t
        on t.qname = n.nspname||'.'||p.proname
  loop
    execute format('revoke all on function %s from public', r.sig);
    execute format('revoke all on function %s from anon', r.sig);
    execute format('revoke all on function %s from authenticated', r.sig);
    v_n := v_n + 1;
    raise notice 'hr_l3_90: closed %', r.qname;
  end loop;
  raise notice 'hr_l3_90: % remaining grants closed', v_n;
end
$mig$;

do $chk$
declare v_debt integer; v_live_baseline integer; v_names text;
begin
  select count(*), coalesce(string_agg(qname, ', ' order by qname), '')
    into v_debt, v_names from hr.definer_functions_client_reachable();

  if v_debt <> 0 then
    raise exception 'hr_l3_90: debt is %, not zero: %', v_debt, v_names;
  end if;

  -- decision 2: the baseline must be fully inert, not merely out-counted
  select count(*) into v_live_baseline
    from hr.definer_grant_baseline b
   where exists (select 1 from hr.definer_functions_client_reachable() t
                  where split_part(t.qname,'.',2) = b.function_name);
  if v_live_baseline <> 0 then
    raise exception 'hr_l3_90: % baseline rows still match a reachable function', v_live_baseline;
  end if;

  if (select count(*) from hr.punch_write_path_conformance() where not ok) <> 0 then
    raise exception 'hr_l3_90: a conformance check is failing at the campaign''s close';
  end if;
  raise notice 'hr_l3_90: debt is ZERO and the baseline is inert — campaign closed';
end
$chk$;

commit;
