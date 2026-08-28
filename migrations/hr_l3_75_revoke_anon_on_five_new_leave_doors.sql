-- HR domain L3 — register item HRB-015, lane l3-punch-kiosk (BUILDER SQL-1).
--
-- 🚨 SECURITY. FIVE LEAVE DOORS SHIPPED MINUTES AGO ARE EXECUTABLE BY `anon`, INCLUDING A WRITE.
--
--   public.hr_leave_balances_export     (p_organization_id, p_scope, p_filters)
--   public.hr_leave_calendar_ics        (p_organization_id, p_from, p_to, p_filters)
--   public.hr_leave_ledger_export       (p_employment_id, p_leave_policy_id, p_as_of)
--   public.hr_leave_policy_deactivate   (p_leave_policy_id, p_disposition, …)   ← a WRITE
--   public.hr_leave_policy_floors       (p_organization_id, p_payload)
--
-- All five are `SECURITY DEFINER`. None takes a credential argument, so none is a designed
-- unauthenticated feed — they rely on the caller's identity, and an anon caller has none. Two
-- export leave balances and ledgers; one deactivates a leave policy. Reached without a session,
-- a SECURITY DEFINER door runs as its owner, which is the whole exposure.
--
-- This is Supabase's default privileges, not anybody's typo: `GRANT EXECUTE … TO anon` is applied
-- automatically to new functions in `public`, so a door is anon-reachable the moment it is created
-- unless the migration revokes it. This lane has paid for that once already (hr_l3_11) and its own
-- doors revoke from BOTH `public` and `anon` for exactly this reason.
--
-- 🚨 CROSS-LANE, AND DELIBERATELY SO. These are the Leave lane's doors. This migration touches
-- their GRANTS and nothing else — no body, no signature, no behaviour — because an anon-executable
-- policy-deactivate is a live exposure and a red blocking gate, and neither should wait for a
-- handoff. It cannot break a legitimate caller: there is no credential-bearing anon path to any of
-- these five, so every real caller is already authenticated. Reported to the Leave lane so the
-- revokes move into their own door migrations, where they belong.
--
-- Found by check 12 as rewritten in hr_l3_70 — the run that replaced a six-name allowlist with the
-- structural property. The name list would have caught these too; what the property adds is that it
-- will catch the sixth and seventh without anyone remembering to update a list.
--
-- Authority: hr_l3_15's client-door contract (check 12); hr_l3_11's revoke-from-both precedent.
--
-- Applied live as `hr_l3_75_revoke_anon_on_five_new_leave_doors`. Idempotent.
--
-- ── RECORDED TECHNICAL DECISIONS ────────────────────────────────────────────────────────────
-- 1. REVOKE FROM `public` AND `anon` BOTH. Revoking only `anon` leaves the PUBLIC grant, and
--    revoking only `public` leaves the explicit `anon=X` entry Supabase writes. The live ACLs show
--    `anon=X/postgres` explicitly, so `revoke … from public` alone would have changed nothing and
--    the gate would have stayed red with the migration reporting success.
-- 2. `authenticated` IS GRANTED EXPLICITLY, NOT ASSUMED. A door nobody can execute is the
--    dead-door defect T-41 exists to catch, and revoking PUBLIC can remove the only path a role
--    had. Each door is granted to `authenticated` and asserted afterwards.
-- 3. NOTHING ELSE IS TOUCHED. No `create or replace`, so no body and no ACL beyond these grants
--    changes, and the Leave lane can keep editing these functions concurrently without conflict.

begin;

do $mig$
declare
  v_fn text;
  v_doors text[] := array[
    'public.hr_leave_balances_export(uuid,text,jsonb)',
    'public.hr_leave_calendar_ics(uuid,date,date,jsonb)',
    'public.hr_leave_ledger_export(uuid,uuid,date)',
    'public.hr_leave_policy_deactivate(uuid,text,uuid,text)',
    'public.hr_leave_policy_floors(uuid,jsonb)'];
begin
  foreach v_fn in array v_doors loop
    -- decision 1: both, always
    execute format('revoke all on function %s from public', v_fn);
    execute format('revoke all on function %s from anon', v_fn);
    -- decision 2: and the real caller keeps its path
    execute format('grant execute on function %s to authenticated', v_fn);
  end loop;
end
$mig$;

do $chk$
declare
  v_fn text;
  v_doors text[] := array[
    'public.hr_leave_balances_export(uuid,text,jsonb)',
    'public.hr_leave_calendar_ics(uuid,date,date,jsonb)',
    'public.hr_leave_ledger_export(uuid,uuid,date)',
    'public.hr_leave_policy_deactivate(uuid,text,uuid,text)',
    'public.hr_leave_policy_floors(uuid,jsonb)'];
begin
  foreach v_fn in array v_doors loop
    if has_function_privilege('anon', v_fn, 'EXECUTE') then
      raise exception 'hr_l3_75: anon can still execute %', v_fn;
    end if;
    if not has_function_privilege('authenticated', v_fn, 'EXECUTE') then
      raise exception 'hr_l3_75: authenticated cannot execute % — a dead door is not the fix', v_fn;
    end if;
  end loop;

  if (select count(*) from hr.punch_write_path_conformance()
       where check_key = 'client_doors_well_formed' and not ok) > 0 then
    raise exception 'hr_l3_75: check 12 is still failing';
  end if;
  if (select count(*) from hr.punch_write_path_conformance() where not ok) <> 0 then
    raise exception 'hr_l3_75: another conformance check is failing';
  end if;
end
$chk$;

commit;
