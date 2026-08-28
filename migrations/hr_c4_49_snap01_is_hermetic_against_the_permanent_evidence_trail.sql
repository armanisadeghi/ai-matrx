-- HR domain C4 — migration 49 (register item HRB-008; HRB-009 D15 verifier — the blocking rule-
-- fixture gate is RED live).
--
-- 🚨 THE JURISDICTION-FIXTURE GATE hr.run_rule_fixtures IS RED (66/67, green=false), AND A RED GATE
--    BLOCKS EVERY MIGRATION THAT REFUSES TO COMMIT ON A RED RUN.
--
-- SNAP-01 asserts `affected_snapshots_found = 1`, but its §4.4 enumeration is written CROSS-ORG:
--
--     select count(*) into v_n from hr.calculation_snapshot
--      where resolution @> {resolved.overtime.rules[0].rule_id = v_rule};
--
-- The probe writes its own snapshot into its dedicated fixture org (`5dc930e9`, which holds ZERO
-- persistent snapshots — the probe rolls back cleanly, measured). But the count query has no org
-- filter, so it also sweeps up **14 snapshots in the sandbox org `2643e470`** that cite the same
-- US-CA overtime rule — 1 (own, transient) + 14 (ambient) = 15. The engine's enumeration is
-- CORRECT; the fixture's reproduction of it is not, and its expected count drifts with ambient
-- snapshot volume in a DIFFERENT org.
--
-- ===================================================================================
-- RECORDED TECHNICAL DECISIONS
--
-- 1. 🚨 HERMETIC BY ORG-SCOPING, WHICH IS ALSO THE FAITHFUL §4.4 SEMANTIC — NOT A LOOSENED "≥1".
--    A rule correction opens ONE recalculation_batch in ONE org and enumerates THAT org's affected
--    snapshots; the batch the probe creates is `organization_id = v_org`. So the enumeration is
--    `organization_id = v_org AND resolution @> {rule_id}` — exact, org-scoped, and matching the
--    batch it feeds. The fixture org holds only the probe's transient write, so the count is
--    deterministically 1 regardless of ambient volume anywhere else. The cross-org form was simply
--    a bug in the fixture's reproduction; fixing it keeps the enumeration EXACT, per the ruling.
--
-- 2. THE PROBE DOES NOT LEAK. Measured: run_rule_fixtures(['SNAP-01']) inside a rolled-back
--    transaction left the fixture org at 0 snapshots — the internal subtransaction discards the
--    probe's write. SNAP-01 is not the source of the pollution.
--
-- 3. THE 135 SANDBOX-ORG SNAPSHOTS, CHARACTERIZED (the coordinator's "report before deleting"):
--      · 61 `overtime` (actor `automation`, created_by NULL, ~19 distinct engine_version git SHAs,
--        Aug 27-28) — and NO live function writes an overtime snapshot: the only callers of
--        hr.write_calculation_snapshot are this fixture probe (rolls back) and two LEAVE paths.
--        These are ORPHANED TEST DEBRIS from old overtime-engine proof runs that called the writer
--        directly and never cleaned up; nothing live recreates them. Verified UNREFERENCED — none
--        is in a supersede chain, none is cited by a recalculation_batch.
--      · 74 `leave_accrual` (38 automation + 36 manager) — written by the LIVE
--        `public.hr_leave_accrual_apply` / `hr.leave_ledger_post`. These are the LEAVE LANE's active
--        territory (it is mid-fix on hr_leave_accrual_apply), so they are REPORTED to that lane and
--        NOT touched here — deleting another lane's live-writer data during its fix is exactly the
--        coordination failure the note warns against.
--
-- 4. 🚨 THERE IS NO PURGE, BECAUSE hr.calculation_snapshot IS PROTECTED EVIDENCE. A DELETE is
--    refused by a hard guard — "hr.calculation_snapshot is evidence and is never deleted"
--    (SPEC-JURISDICTION §4.5) — and there is no deleted_at soft-delete either. So the 135 rows are
--    PERMANENT and will only grow as any computation (test or real) persists a snapshot. That is the
--    system working as designed, not a leak to sweep. The register's "After: 0 snapshots" expectation
--    is therefore WRONG by construction: a jurisdiction snapshot is append-only evidence and its
--    count is never 0 in an org that has ever computed. The ONLY correct fix is a fixture that is
--    hermetic against a permanent, growing evidence trail — which is exactly the org-scoping in
--    RD 1. The overtime rows have no live writer (old proof-run debris) and the leave_accrual rows
--    are the Leave lane's live writers; both are reported, neither can or should be deleted.
--
-- Authority: HRB-009 D15 verifier's root-cause; SPEC-TIME §4.4 (a recalculation batch is per-org);
-- the record-honestly / hermetic-fixture law.
-- Applied live as `hr_c4_49_snap01_is_hermetic_and_the_orphan_overtime_snapshots_are_purged`.
-- Idempotent.

set local statement_timeout = '600s';
set local lock_timeout = '120s';

-- ============================================================ 1. SNAP-01 becomes hermetic (RD 1)
do $mig$
declare
  v_oid oid; v_def text;
  v_old constant text := $o$      select count(*) into v_n from hr.calculation_snapshot
       where resolution @> jsonb_build_object('resolved', jsonb_build_object('overtime',
               jsonb_build_object('rules', jsonb_build_array(jsonb_build_object('rule_id', v_rule)))));$o$;
  v_new constant text := $o$      -- 🚨 ORG-SCOPED (hr_c4_49). A §4.4 recalculation batch is per-org, and this probe's batch is
      -- created in v_org — so its enumeration must be org-scoped too, or it counts snapshots in
      -- other orgs citing the same rule (14 ambient in the sandbox org tipped it to 15). The fixture
      -- org holds only this probe's transient write, so the count is deterministically 1.
      select count(*) into v_n from hr.calculation_snapshot
       where organization_id = v_org
         and resolution @> jsonb_build_object('resolved', jsonb_build_object('overtime',
               jsonb_build_object('rules', jsonb_build_array(jsonb_build_object('rule_id', v_rule)))));$o$;
begin
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = '_run_fixture_probe';
  v_def := pg_get_functiondef(v_oid);
  if position('ORG-SCOPED (hr_c4_49)' in v_def) > 0 then
    raise notice 'hr_c4_49: SNAP-01 is already org-scoped';
  else
    if position(v_old in v_def) = 0 then
      raise exception 'hr_c4_49: the SNAP-01 enumeration is not the expected cross-org form — refusing to overwrite drift';
    end if;
    execute replace(v_def, v_old, v_new);
    raise notice 'hr_c4_49: SNAP-01''s enumeration is now org-scoped and hermetic';
  end if;
end
$mig$;

-- ============================================================ 2. the contract on hermeticity
do $$
begin
  delete from hr.function_contract where home_migration = 'hr_c4_49';
  insert into hr.function_contract (schema_name, function_name, home_migration,
                                    must_contain, must_not_contain, must_be_definer, reason)
  values ('hr', '_run_fixture_probe', 'hr_c4_49',
    array['organization_id = v_org', 'ORG-SCOPED (hr_c4_49)'],
    '{}', false,
    'hr_c4_49: SNAP-01''s §4.4 enumeration must stay ORG-SCOPED to v_org. A recalculation batch is per-org (SPEC-TIME §4.4) and this probe''s batch is created in v_org, so a cross-org count is both wrong semantics AND non-hermetic — it sweeps up ambient snapshots in other orgs citing the same rule and asserts against a number that drifts with their volume (the HRB-009 gate went red at 66/67 this way). The fix must NEVER be a loosened `>= 1`: the enumeration stays exact, it is only scoped to the org whose batch it feeds.');
end $$;

-- ============================================================ 3. post-conditions that EXECUTE
do $$
declare v_snap01 jsonb; v_full jsonb; v_left integer;
begin
  -- 🚨 SNAP-01 now passes, executed live (run_rule_fixtures rolls back its own probe writes)
  v_snap01 := hr.run_rule_fixtures(array['SNAP-01']);
  if not exists (select 1 from jsonb_array_elements(v_snap01 -> 'results') r
                  where r ->> 'code' = 'SNAP-01' and (r ->> 'passed')::boolean) then
    raise exception 'hr_c4_49: SNAP-01 still fails: %',
      (select r from jsonb_array_elements(v_snap01 -> 'results') r where r ->> 'code' = 'SNAP-01');
  end if;

  -- 🚨 THE WHOLE GATE IS GREEN — the blocking condition the migrations refuse to commit under
  v_full := hr.run_rule_fixtures(null);
  if not (v_full ->> 'green')::boolean then
    raise exception 'hr_c4_49: run_rule_fixtures(NULL) is still not green: %/% (failed %)',
      v_full ->> 'passed', v_full ->> 'total', v_full ->> 'failed';
  end if;

  -- the gate is now green DESPITE the permanent evidence trail — that is the whole point
  select count(*) into v_left from hr.calculation_snapshot
   where organization_id = '2643e470-b275-47f3-95f3-ae275ad3ca47'::uuid;
  raise notice 'hr_c4_49: % permanent snapshots remain in the sandbox org (evidence, never deleted) and the gate is green anyway', v_left;
  raise notice 'hr_c4_49: the fixture gate is green (%/%), SNAP-01 hermetic',
    v_full ->> 'passed', v_full ->> 'total';
end $$;
