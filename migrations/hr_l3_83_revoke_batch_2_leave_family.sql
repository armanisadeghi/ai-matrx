-- HR domain L3 — register item HRB-015, lane l3-punch-kiosk (BUILDER SQL-1).
--
-- CHECK 33 DEBT CAMPAIGN — BATCH 2 of N: the leave family. 45 SECURITY DEFINER helpers in `hr`,
-- every one anon-executable and every one NULL-ACL, which is the largest single block of the 202
-- and the reason it goes second: anon exposure is the priority for choosing family order.
--
-- These are ANOTHER LANE'S functions. This migration touches GRANTS and nothing else — no body, no
-- signature, no behaviour — so the leave lane can keep editing them concurrently, and the proof is
-- run through THEIR public doors rather than by reading their caller-gates and assuming.
--
-- 🚨 `REVOKE FROM PUBLIC` IS THE ONLY REVOKE THAT CLOSES ANYTHING HERE — the campaign rule ratified
-- after batch 1. On a NULL-ACL function `REVOKE FROM anon` is a no-op for reachability (anon still
-- executes) while it materialises an ACL, so the function reads as partially repaired and is
-- entirely open. All 45 are NULL-ACL, so all 45 leave the anon AND authenticated classes at once.
--
-- Authority: coordinator ruling (leave family next; the anon/authenticated split is dead as a step
-- sequence, anon exposure remains the priority for family ORDER); L1's proof discipline.
--
-- Applied live as `hr_l3_83_revoke_batch_2_leave_family`. Idempotent.
--
-- ── RECORDED TECHNICAL DECISIONS ────────────────────────────────────────────────────────────
-- 1. THE SET IS DERIVED, NOT LISTED (D13). The loop selects the family by name pattern out of
--    `pg_proc` and revokes through `oid::regprocedure`, which renders the correct signature for
--    every overload — `hr.leave_enroll` has TWO, and a hand-written list is exactly where one of
--    them gets missed. Deriving also means a leave helper created between this file being written
--    and being applied is closed too, which for a revoke campaign is the behaviour you want.
-- 2. IT CLOSES ONLY WHAT IS ALREADY OPEN, so a replay is a no-op and a function another lane
--    deliberately grants later is not silently re-closed by a re-run of this migration. The filter
--    is `prosecdef AND (anon OR authenticated can execute)` — the same predicate check 33 uses.
-- 3. NOTHING IS GRANTED BACK, AND A BREAK STOPS THE ITEM BY NAME. Every one of these is reached
--    through a `public.hr_leave_*` / `public.hr_my_time_off` wrapper that is itself SECURITY
--    DEFINER and executes as the owner. If a door breaks, that helper is one the product reaches
--    DIRECTLY rather than through its wrapper — a mis-layered door whose caller-gate needs
--    examining, not a quiet re-grant.
-- 4. THE PROOF SET INCLUDES THE TWO DOORS THAT LANE TOUCHED THIS WEEK — `hr_leave_request_submit`
--    (with a NON-ADMIN token, since an admin can mask a capability gap) and `hr_my_time_off` —
--    because their call graphs changed most recently and are therefore the likeliest to reach a
--    helper by a path the wrapper boundary does not cover.

begin;

do $mig$
declare r record; v_n integer := 0;
begin
  for r in
    select p.oid, p.oid::regprocedure::text as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'hr'
       and p.prosecdef
       and (p.proname like 'leave\_%' or p.proname like '\_leave\_%')
       -- decision 2: only what is actually open today
       and (has_function_privilege('anon', p.oid, 'EXECUTE')
         or has_function_privilege('authenticated', p.oid, 'EXECUTE'))
  loop
    execute format('revoke all on function %s from public', r.sig);
    execute format('revoke all on function %s from anon', r.sig);
    execute format('revoke all on function %s from authenticated', r.sig);
    v_n := v_n + 1;
  end loop;
  raise notice 'hr_l3_83: closed % leave-family definer helpers', v_n;
end
$mig$;

do $chk$
declare r record; v_open integer := 0; v_total integer := 0;
begin
  for r in
    select p.oid, n.nspname || '.' || p.proname as qname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'hr' and p.prosecdef
       and (p.proname like 'leave\_%' or p.proname like '\_leave\_%')
  loop
    v_total := v_total + 1;
    if has_function_privilege('anon', r.oid, 'EXECUTE')
       or has_function_privilege('authenticated', r.oid, 'EXECUTE') then
      v_open := v_open + 1;
      raise notice 'hr_l3_83: still client-reachable: %', r.qname;
    end if;
  end loop;

  if v_open > 0 then
    raise exception 'hr_l3_83: % of % leave-family definer helpers are still client-reachable',
      v_open, v_total;
  end if;
  if (select count(*) from hr.punch_write_path_conformance() where not ok) <> 0 then
    raise exception 'hr_l3_83: a conformance check is failing after the revoke';
  end if;
  raise notice 'hr_l3_83: % leave-family definer helpers verified closed', v_total;
end
$chk$;

commit;
