-- HR domain L3 — register item HRB-015, lane l3-punch-kiosk (BUILDER SQL-1).
--
-- CHECK 33 DEBT CAMPAIGN — BATCH 3 of N: the punch-adjacent `other` family, which is the entire
-- remaining ANON surface. After this batch no SECURITY DEFINER function in `hr` is reachable by
-- `anon` at all, which was the campaign's stated priority.
--
-- 36 functions, and they split into two kinds worth naming because the risk is not the same:
--
--   12 TRIGGER functions — `_derive_on_authority`, `_derive_on_employee_login`,
--      `_derive_on_employment`, `_derive_on_interview`, `_derive_on_position`,
--      `_derive_on_requisition`, `_derive_on_role_assignment`, `_guard_hr_write`,
--      `_incident_excluded_actors_refresh`, `_incident_party_redrive_veto`,
--      `_refresh_current_position`, `_sync_legal_hold_count`. A trigger function is invoked by the
--      SYSTEM on behalf of the statement, and the writing role needs no EXECUTE privilege on it at
--      all. Their grants were never load-bearing; this is the cleanest revoke in the campaign.
--   24 ORDINARY helpers, reached through `public.hr_*` wrappers that are themselves SECURITY
--      DEFINER — the same boundary batches 1 and 2 proved twice.
--
-- 🚨 THE ONE REAL RISK ITEM, CLEARED BY MEASUREMENT RATHER THAN ASSUMPTION.
-- `hr.recompute_queue_claim` and `hr.recompute_queue_complete` are the aidream drain's own doors,
-- called from the Python server rather than from a browser — if the server connected as a client
-- role, revoking would stop the drain and the first symptom would be timesheets quietly never
-- recomputing. Measured: aidream connects as `postgres.<project>`, the owner role, which is not
-- `anon` and not `authenticated`, so a revoke of those two roles cannot reach it. They are also
-- the only two functions in this batch whose ACL was NOT null — someone had already written a
-- grant on them, which is why they were worth checking rather than sweeping up.
--
-- Authority: coordinator ruling (batch 3, then the remainder by size); the campaign rule ratified
-- after batch 1 (REVOKE FROM PUBLIC is the only revoke that closes a NULL-ACL function).
--
-- Applied live as `hr_l3_84_revoke_batch_3_anon_remainder`. Idempotent.
--
-- ── RECORDED TECHNICAL DECISIONS ────────────────────────────────────────────────────────────
-- 1. THE SET IS DERIVED AS "STILL ANON-REACHABLE AND NOT CATALOG-EXEMPT" (D13), not as a family
--    name list. `other` was never a family — it is the remainder after the named ones — so a
--    pattern match would have been a fiction. Deriving on the same predicate check 33 uses means
--    this batch closes exactly what check 33 would still be reporting, and nothing else.
-- 2. THE `pg_depend` EXEMPTION IS HONOURED HERE TOO. A function called by an RLS policy, CHECK
--    constraint or column default genuinely needs its grant, and the loop skips those the same way
--    the check does. Today that set is empty, but the loop must not be the one place that forgets.
-- 3. SIGNATURES WERE PULLED BEFORE THE PROOF SET WAS WRITTEN. Three times across batches 1 and 2 a
--    guessed parameter name produced a PGRST202 404 that momentarily looked like a broken door. In
--    a revoke campaign a 404 must only ever be able to mean something real, so the door signatures
--    for this batch's proof set were read out of `pg_proc` first and the calls built from them.

begin;

do $mig$
declare r record; v_trig integer := 0; v_plain integer := 0;
begin
  for r in
    select p.oid, p.oid::regprocedure::text as sig,
           exists (select 1 from pg_trigger tg where tg.tgfoid = p.oid) as is_trigger
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'hr'
       and p.prosecdef
       and has_function_privilege('anon', p.oid, 'EXECUTE')
       -- decision 2: the catalog exemption, same as check 33's
       and not exists (
         select 1 from pg_depend d
          where d.refclassid = 'pg_proc'::regclass and d.refobjid = p.oid
            and d.classid in ('pg_policy'::regclass, 'pg_constraint'::regclass, 'pg_attrdef'::regclass))
  loop
    execute format('revoke all on function %s from public', r.sig);
    execute format('revoke all on function %s from anon', r.sig);
    execute format('revoke all on function %s from authenticated', r.sig);
    if r.is_trigger then v_trig := v_trig + 1; else v_plain := v_plain + 1; end if;
  end loop;
  raise notice 'hr_l3_84: closed % trigger functions and % ordinary helpers', v_trig, v_plain;
end
$mig$;

do $chk$
declare v_anon integer; v_debt integer;
begin
  select count(*) into v_anon
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.prosecdef
     and has_function_privilege('anon', p.oid, 'EXECUTE')
     and not exists (
       select 1 from pg_depend d
        where d.refclassid = 'pg_proc'::regclass and d.refobjid = p.oid
          and d.classid in ('pg_policy'::regclass, 'pg_constraint'::regclass, 'pg_attrdef'::regclass));

  if v_anon > 0 then
    raise exception 'hr_l3_84: % hr definer functions are still anon-reachable', v_anon;
  end if;

  select count(*) into v_debt from hr.definer_functions_client_reachable();
  raise notice 'hr_l3_84: anon surface is zero; % client-reachable definer functions remain (authenticated)', v_debt;

  if (select count(*) from hr.punch_write_path_conformance() where not ok) <> 0 then
    raise exception 'hr_l3_84: a conformance check is failing after the revoke';
  end if;
end
$chk$;

commit;
