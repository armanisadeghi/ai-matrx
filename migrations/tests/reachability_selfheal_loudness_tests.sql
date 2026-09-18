-- ============================================================
-- DD-259 — the nightly reachability self-heal must be LOUD, ORDERED and FREEZABLE
-- ============================================================
-- Run with: psql $DATABASE_URL -v ON_ERROR_STOP=1 -f this_file.sql
--   (or pipe through any direct-connection client — the file opens its own
--    transaction and ROLLBACKs at the end, so nothing here persists.)
--
-- It plants real drift in platform.reachability, so it takes minutes and holds
-- row locks on that table while it runs: run it deliberately, not in CI.
--
-- PROVEN RED against the PRE-DD-259 body
-- (platform.heal_reachability_drift() sha256 9bd00a34f6…, live 2026-09-15):
--   • T4 (file-before-repair): 0 incident rows survived a throwing rebuild —
--     the INSERT came after platform.rebuild_reachability(), so the failure
--     rolled the evidence back with it. The nightly job would have reported
--     `failed` in cron.job_run_details with nothing whatsoever to triage.
--   • T3 (freeze): the old body healed regardless — `healed: true` with the
--     pause knob ON, because no such knob was consulted.
-- GREEN on the DD-259 body (migrations/dd259_reachability_selfheal_loud_and_pausable.sql):
--   all four tests pass.
-- ============================================================

BEGIN;

DO $pre$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM platform.feature_knob
                  WHERE feature = 'platform.reachability' AND key = 'selfheal_pause') THEN
    RAISE EXCEPTION 'platform.reachability.selfheal_pause is not seeded — apply dd259_reachability_selfheal_loud_and_pausable.sql first';
  END IF;
END $pre$;

-- ===================== T1: clean run files nothing =====================
SAVEPOINT t1;
DO $t$
DECLARE r jsonb; n bigint;
BEGIN
  r := platform.heal_reachability_drift();
  IF (r->>'drift_before')::bigint <> 0 THEN RAISE EXCEPTION 'T1: expected clean DB, got %', r; END IF;
  SELECT count(*) INTO n FROM ops.system_error WHERE kind = 'reachability_drift_detected';
  IF n <> 0 THEN RAISE EXCEPTION 'T1 FAIL: clean run filed % row(s)', n; END IF;
  RAISE INFO 'T1 PASS clean: %', r;
END $t$;
ROLLBACK TO SAVEPOINT t1;

-- ===================== T2: planted drift -> filed + repaired =====================
SAVEPOINT t2;
DO $t$
DECLARE r jsonb; e record; n bigint;
BEGIN
  DELETE FROM platform.reachability WHERE ctid IN (SELECT ctid FROM platform.reachability LIMIT 3);
  SELECT count(*) INTO n FROM platform.reachability_drift();
  IF n < 3 THEN RAISE EXCEPTION 'T2 SETUP: planted drift did not register (got %)', n; END IF;
  r := platform.heal_reachability_drift();
  SELECT * INTO e FROM ops.system_error WHERE kind = 'reachability_drift_detected';
  IF e.id IS NULL THEN RAISE EXCEPTION 'T2 FAIL: no incident row filed'; END IF;
  IF e.context->>'repair' <> 'repaired' THEN RAISE EXCEPTION 'T2 FAIL: repair=% %', e.context->>'repair', r; END IF;
  IF (e.context->>'drift_before')::bigint < 3 THEN RAISE EXCEPTION 'T2 FAIL: drift_before %', e.context->>'drift_before'; END IF;
  IF (e.context->>'containers_hit')::bigint < 1 THEN RAISE EXCEPTION 'T2 FAIL: containers_hit missing'; END IF;
  IF jsonb_array_length(e.context->'containers_sample') < 1 THEN RAISE EXCEPTION 'T2 FAIL: containers_sample empty'; END IF;
  IF (e.context->>'drift_after')::bigint <> 0 THEN RAISE EXCEPTION 'T2 FAIL: drift_after %', e.context->>'drift_after'; END IF;
  IF e.error_text NOT LIKE '%rows rebuilt%' THEN RAISE EXCEPTION 'T2 FAIL: error_text lacks repair count: %', e.error_text; END IF;
  SELECT count(*) INTO n FROM platform.reachability_drift();
  IF n <> 0 THEN RAISE EXCEPTION 'T2 FAIL: drift remains after heal (%)', n; END IF;
  RAISE INFO 'T2 PASS filed+repaired: %', r;
END $t$;
ROLLBACK TO SAVEPOINT t2;

-- ===================== T3: knob paused -> filed, repair SKIPPED =====================
SAVEPOINT t3;
DO $t$
DECLARE r jsonb; e record; n bigint;
BEGIN
  UPDATE platform.feature_knob SET value = 'true'::jsonb
    WHERE feature = 'platform.reachability' AND key = 'selfheal_pause';
  DELETE FROM platform.reachability WHERE ctid IN (SELECT ctid FROM platform.reachability LIMIT 3);
  r := platform.heal_reachability_drift();
  SELECT * INTO e FROM ops.system_error WHERE kind = 'reachability_drift_detected';
  IF e.id IS NULL THEN RAISE EXCEPTION 'T3 FAIL: paused run filed nothing'; END IF;
  IF e.context->>'repair' <> 'skipped_paused' THEN RAISE EXCEPTION 'T3 FAIL: repair=%', e.context->>'repair'; END IF;
  IF (e.context->>'selfheal_paused')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'T3 FAIL: selfheal_paused not recorded'; END IF;
  IF e.error_text NOT LIKE '%REPAIR WAS SKIPPED%' THEN RAISE EXCEPTION 'T3 FAIL: error_text not loud: %', e.error_text; END IF;
  SELECT count(*) INTO n FROM platform.reachability_drift();
  IF n < 3 THEN RAISE EXCEPTION 'T3 FAIL: repair ran anyway, drift now %', n; END IF;
  RAISE INFO 'T3 PASS paused: %', r;
END $t$;
ROLLBACK TO SAVEPOINT t3;

-- ===================== T4: repair THROWS -> the filed row survives =====================
-- This is the DD-259 ordering proof: before this file the INSERT came after the
-- rebuild, so a throwing rebuild erased the evidence with the transaction.
SAVEPOINT t4;
CREATE FUNCTION pg_temp._dd259_block() RETURNS trigger LANGUAGE plpgsql AS
$b$ BEGIN RAISE EXCEPTION 'DD259 injected rebuild failure'; END $b$;
CREATE TRIGGER _dd259_block BEFORE INSERT ON platform.reachability
  FOR EACH ROW EXECUTE FUNCTION pg_temp._dd259_block();
DO $t$
DECLARE r jsonb; e record;
BEGIN
  DELETE FROM platform.reachability WHERE ctid IN (SELECT ctid FROM platform.reachability LIMIT 3);
  r := platform.heal_reachability_drift();
  SELECT * INTO e FROM ops.system_error WHERE kind = 'reachability_drift_detected';
  IF e.id IS NULL THEN RAISE EXCEPTION 'T4 FAIL (this is the DD-259 defect): a throwing repair left NO incident row'; END IF;
  IF e.context->>'repair' <> 'failed' THEN RAISE EXCEPTION 'T4 FAIL: repair=%', e.context->>'repair'; END IF;
  IF e.context->>'repair_error' NOT LIKE '%DD259 injected rebuild failure%' THEN RAISE EXCEPTION 'T4 FAIL: repair_error=%', e.context->>'repair_error'; END IF;
  IF e.error_text NOT LIKE '%THE REPAIR FAILED%' THEN RAISE EXCEPTION 'T4 FAIL: error_text not loud: %', e.error_text; END IF;
  IF (e.context->>'drift_before')::bigint < 3 THEN RAISE EXCEPTION 'T4 FAIL: evidence lost'; END IF;
  RAISE INFO 'T4 PASS filed-before-repair: %', r;
END $t$;
ROLLBACK TO SAVEPOINT t4;

SELECT 'ALL 4 TESTS PASSED' AS result;
ROLLBACK;
