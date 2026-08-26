-- HR L13 — migration 3 of 3 (register item HRB-025, lane lane-l13-export).
--
-- THE SIX CAPABILITY TOKENS THE FROZEN ENDPOINT CATALOG NAMES AND NO ROLE HELD.
--
-- Authority: SPEC-CONTRACTS §3.5 / §3.6 (each endpoint's `Capability` column), §4.6 (the PII
-- gate), §1.3 rule 2 (a denial names what was missing); SPEC-ACCESS §1.4 owns the predicate.
-- Applied live as `hr_l13_03_seam_capabilities`. Idempotent.
--
-- ===================================================================================
-- RECORDED TECHNICAL DECISIONS (EXECUTION §8)
--
-- 1. 🚨 FIVE OF THIS LANE'S SIX DECLARED CAPABILITIES DID NOT EXIST IN THE LIVE VOCABULARY.
--    The frozen catalog assigns `payroll.read` (E-18, E-22, E-23), `payroll.export` (E-19, E-20,
--    E-24, E-25, E-26), `time.read` (E-21), `integration.read` (E-27, E-30),
--    `integration.dispatch` (E-28) and `integration.record` (E-29). Measured live across every
--    `hr.access_role.capabilities` array, exactly ONE of those — `payroll.export` — was held by
--    any role. The other five were tokens no grant could ever satisfy, which means every one of
--    those endpoints would have returned `403 hr_capability_denied` naming a capability that
--    nobody in the system could be given. `payroll.export_pii` (§4.6) was the sixth and also
--    absent. This file seeds them onto the builtin roles. **This is SPEC-ACCESS's vocabulary, not
--    this lane's** — it is recorded on the register as owed back to that spec, and nothing here
--    invents a token the frozen contract does not already name.
--
-- 2. THE SEEDS GO ON THE SYSTEM-ORG BUILTINS, WHICH IS HOW `hr.capability` ALREADY WORKS.
--    Its role lookup is `ar.organization_id in (ra.organization_id, '39c38960-…')` with the org's
--    own row winning — so a builtin edited here reaches every tenant that has not overridden it,
--    and a tenant that HAS overridden the role keeps its own tighter list. No per-org backfill.
--
-- 3. `payroll.export_pii` GOES TO `hr_owner` ALONE, AND THAT IS THE POINT.
--    §4.6 makes it a capability required ON TOP OF `payroll.export`, so granting it to
--    `payroll_admin` — who already holds `payroll.export` — would collapse the second gate into
--    the first and make the PII flag a checkbox rather than a decision. An org that wants its
--    payroll administrator to run SSN-bearing exports grants it deliberately, on its own role row.
--
-- 4. `integration.dispatch` IS NOT GIVEN TO `recruiter`, EVEN THOUGH BACKGROUND CHECKS ARE THE
--    WORKED SEAM. E-28 is the raw edge-out for FIVE seams; the recruiter's door to a background
--    check is E-32, which is FCRA-gated on disclosure-then-authorization and carries its own
--    capability. Handing a recruiter the generic dispatch would be a way around that gate.
--
-- 5. THE WRITE GUARD IS ARMED FOR EXACTLY THESE STATEMENTS AND DISARMED IMMEDIATELY.
--    `hr.privileged_write` is transaction-scoped (HRB-008's sixth finding), so an armed flag left
--    set disarms every hr guard for the rest of the caller's transaction. Armed, used, reset.
-- ===================================================================================

set local statement_timeout = '600s';
set local lock_timeout = '30s';

do $$
declare
  r record;
  v_grants constant jsonb := jsonb_build_object(
    'payroll.read',         jsonb_build_array('hr_admin','hr_owner','payroll_admin'),
    'payroll.export_pii',   jsonb_build_array('hr_owner'),
    'time.read',            jsonb_build_array('manager','hr_admin','hr_owner','payroll_admin'),
    'integration.read',     jsonb_build_array('hr_admin','hr_owner'),
    'integration.dispatch', jsonb_build_array('hr_admin','hr_owner'),
    'integration.record',   jsonb_build_array('hr_admin','hr_owner','compliance_officer'));
  v_cap text;
  v_role text;
begin
  perform hr.arm_write();
  for v_cap in select jsonb_object_keys(v_grants) loop
    for v_role in select jsonb_array_elements_text(v_grants -> v_cap) loop
      update hr.access_role
         set capabilities = (
               select array_agg(c order by c)
                 from (select unnest(capabilities) as c
                       union select v_cap) u)
       where role_key = v_role
         and organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'::uuid
         and deleted_at is null
         and not (v_cap = any (capabilities));
    end loop;
  end loop;
  perform set_config('hr.privileged_write', '', true);
end $$;

-- ---------------------------------------------------------------------------------
-- ASSERTIONS — this file does not commit a lie.
-- ---------------------------------------------------------------------------------
do $$
declare v_cap text; v_missing text;
begin
  -- every capability this lane's frozen endpoints name is now held by at least one role
  foreach v_cap in array ARRAY['payroll.read','payroll.export','payroll.export_pii','time.read',
                               'integration.read','integration.dispatch','integration.record'] loop
    if not exists (select 1 from hr.access_role
                    where deleted_at is null and v_cap = any (capabilities)) then
      raise exception 'hr_l13_03: capability % is still held by no role', v_cap;
    end if;
  end loop;

  -- RECORDED DECISION 3 — the PII gate is a SECOND gate, so exactly one builtin holds it
  select string_agg(role_key, ', ') into v_missing from hr.access_role
   where deleted_at is null and 'payroll.export_pii' = any (capabilities)
     and organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'::uuid;
  if v_missing is distinct from 'hr_owner' then
    raise exception 'hr_l13_03: payroll.export_pii is held by [%], not hr_owner alone', v_missing;
  end if;

  -- RECORDED DECISION 4 — the recruiter never gets the generic dispatch
  if exists (select 1 from hr.access_role
              where role_key = 'recruiter' and deleted_at is null
                and 'integration.dispatch' = any (capabilities)) then
    raise exception 'hr_l13_03: recruiter holds integration.dispatch — that is a way around the FCRA gate';
  end if;

  -- the guard must be disarmed again; an armed flag would leave every hr table writable
  if coalesce(current_setting('hr.privileged_write', true), '') <> '' then
    raise exception 'hr_l13_03: the hr write guard is still armed at the end of this file';
  end if;
end $$;
