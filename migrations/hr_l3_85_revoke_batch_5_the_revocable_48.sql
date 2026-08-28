-- HR domain L3 — register item HRB-015, lane l3-punch-kiosk (BUILDER SQL-1).
--
-- CHECK 33 DEBT CAMPAIGN — BATCH 5 (final revocable batch): the 48 helpers whose doors are all
-- SECURITY DEFINER. After this, the remaining debt is 53 and every one of them is the workflow
-- family, blocked on one named dependency rather than spread across a mixed backlog.
--
-- WHY THESE 48 AND NOT THE OTHER 53. A census of all 149 `public.hr_*` doors: **137 are SECURITY
-- DEFINER, 12 are SECURITY INVOKER, and all 12 are `hr_wf_*`**. An INVOKER wrapper runs as the
-- CALLING role, so for those doors the grant on the inner body is the mechanism — measured in
-- batch 4, as role `authenticated`, in a rolled-back transaction:
--
--     WITH grant    : authenticated CAN execute hr.wf_inbox      (the door works)
--     WITHOUT grant : permission denied for function wf_inbox    (the door 403s)
--
-- Every family in THIS batch is reached only through DEFINER doors, which execute as the owner and
-- never consult the inner grant. So these 48 are ordinary debt and the 53 are a blocked dependency.
--
-- 🚨 ALL 48 CARRY EXPLICIT ACLs — there are no NULL-ACL functions left anywhere in `hr` (batch 3
-- closed the last of them). An explicit grant is a lane's recorded intent, so per the campaign rule
-- each was checked before revoking: none of these is reached by an INVOKER door, none is depended on
-- by an RLS policy / CHECK constraint / column default (the `pg_depend` exemption check 33 derives),
-- and none is called by the aidream drain, which connects as `postgres.<project>` — the owner role,
-- which no client-role revoke can reach.
--
-- Authority: coordinator ruling (take the 48; the 12 INVOKER doors are C4's conversion); the
-- campaign rule ratified after batch 1 and extended after batch 3.
--
-- Applied live as `hr_l3_85_revoke_batch_5_the_revocable_48`. Idempotent.
--
-- ── RECORDED TECHNICAL DECISIONS ────────────────────────────────────────────────────────────
-- 1. THE SET IS DERIVED AS "CLIENT-REACHABLE AND NOT WORKFLOW" (D13), on the same predicate check
--    33 uses, so this batch closes exactly what the check would still report minus the one item
--    that is deliberately stopped. The workflow exclusion is by name pattern rather than by a list
--    of 53, because a 54th workflow helper written tomorrow must also be excluded, not swept.
-- 2. IT CLOSES ONLY WHAT IS ALREADY OPEN, so a replay is a no-op and a grant a lane makes later is
--    not silently re-closed by a re-run of this migration.
-- 3. `PUBLIC` IS REVOKED TOO EVEN THOUGH NO ACL IS NULL. These all have explicit ACLs, so `PUBLIC`
--    is very likely absent — but revoking it costs nothing and closes the one shape that would
--    otherwise survive: an ACL that grants `authenticated` explicitly AND still carries `PUBLIC`
--    from before, where revoking only the named role leaves the function open through the other.
--    Batch 1 measured that exact trap from the other direction.
-- 4. A BREAK STOPS THE ITEM BY NAME, NEVER A QUIET RE-GRANT. If a door in the proof set fails, the
--    helper it needed is one the product reaches directly — a mis-layered door for its owning lane
--    to examine, exactly as the workflow family was stopped rather than forced.

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
       and (has_function_privilege('anon', p.oid, 'EXECUTE')
         or has_function_privilege('authenticated', p.oid, 'EXECUTE'))
       -- decision 1: the workflow family is STOPPED, not swept — its doors are INVOKER
       and p.proname !~ 'wf'
       -- decision 2 of check 33: a client role genuinely evaluates these itself
       and not exists (
         select 1 from pg_depend d
          where d.refclassid = 'pg_proc'::regclass and d.refobjid = p.oid
            and d.classid in ('pg_policy'::regclass, 'pg_constraint'::regclass, 'pg_attrdef'::regclass))
  loop
    execute format('revoke all on function %s from public', r.sig);
    execute format('revoke all on function %s from anon', r.sig);
    execute format('revoke all on function %s from authenticated', r.sig);
    v_n := v_n + 1;
  end loop;
  raise notice 'hr_l3_85: closed % definer helpers behind DEFINER doors', v_n;
end
$mig$;

do $chk$
declare v_left integer; v_wf integer; v_nonwf integer;
begin
  select count(*) into v_left  from hr.definer_functions_client_reachable();
  select count(*) into v_wf    from hr.definer_functions_client_reachable() t where t.qname ~ 'wf';
  select count(*) into v_nonwf from hr.definer_functions_client_reachable() t where t.qname !~ 'wf';

  if v_nonwf > 0 then
    raise exception 'hr_l3_85: % non-workflow definer helpers are still client-reachable', v_nonwf;
  end if;
  if v_left <> v_wf then
    raise exception 'hr_l3_85: remaining debt (%) is not all workflow (%)', v_left, v_wf;
  end if;
  if (select count(*) from hr.punch_write_path_conformance() where not ok) <> 0 then
    raise exception 'hr_l3_85: a conformance check is failing after the revoke';
  end if;
  raise notice 'hr_l3_85: remaining debt is % and all of it is the workflow family', v_left;
end
$chk$;

commit;
