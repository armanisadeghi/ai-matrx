-- sandbox_instance_version_capture_split_d234.sql
--
-- Stops the largest writer in history.row_versions. `sandbox_instance` holds
-- 4,864,004 of 5,281,006 version rows -- 92% of the entire store -- across only
-- 375 distinct rows (~12,970 versions PER ROW), and was still growing at
-- ~3,850 snapshots per 30 minutes.
--
-- Measured, not assumed. Diffing each captured snapshot against its predecessor
-- over a 2-hour window (14,982 consecutive pairs) the ONLY keys that ever
-- differ are:
--     updated_at   14,982
--     version      14,982
-- i.e. 100% of these captures are NO-OP UPDATEs -- writes that changed nothing
-- but the columns platform._touch_row itself moves. Not even last_heartbeat_at
-- differs. There is no content history in this corpus at all.
--
-- Fix = the sanctioned split-trigger shape (db-rules §7), the same one live on
-- workflow.trigger and scheduler.sch_task/sch_trigger: unconditional capture on
-- INSERT/DELETE, and a conditional UPDATE capture that fires only when the row
-- differs in something other than updated_at/version. A real edit to a sandbox
-- instance still records a version; a no-op write records nothing.
--
-- Strip list: updated_at, version, last_heartbeat_at. The first two are noise by
-- definition on ANY table (a version row whose only change is the version counter
-- records nothing). last_heartbeat_at is this table's liveness ping and is the
-- direct analogue of `last_fired_at` in the workflow.trigger precedent -- it was
-- not moving during the sampled window, but it is exactly the column that would
-- re-open the firehose the moment heartbeats resume writing.
--
-- NOT INCLUDED, deliberately:
--   * Pruning the 4.86M existing rows. `version_prune(token, id, keep)` exists,
--     but discarding history is Arman's decision, not a side effect of a fix.
--   * The upstream write loop. Something issues no-change UPDATEs to
--     public.sandbox_instances continuously; this migration makes it stop
--     costing 4.8M history rows, but the wasted write traffic is still there and
--     wants a code hunt in aidream / matrx-sandbox.
--
-- Idempotent. Safe to re-run.

BEGIN;

DO $$
DECLARE
  strip text := '- ''updated_at'' - ''version'' - ''last_heartbeat_at''';
BEGIN
  IF to_regclass('public.sandbox_instances') IS NULL THEN
    RAISE EXCEPTION 'ABORT: public.sandbox_instances not found';
  END IF;

  -- Drop existing capture trigger(s) found by tgfoid, whatever they are named (D182).
  EXECUTE (
    SELECT coalesce(string_agg(format('DROP TRIGGER %I ON public.sandbox_instances;', tg.tgname), ' '), 'SELECT 1;')
    FROM pg_trigger tg JOIN pg_proc p ON p.oid = tg.tgfoid
    WHERE NOT tg.tgisinternal AND p.proname = '_version_capture'
      AND tg.tgrelid = 'public.sandbox_instances'::regclass
  );

  EXECUTE 'CREATE TRIGGER _version_capture AFTER INSERT OR DELETE ON public.sandbox_instances '
          'FOR EACH ROW EXECUTE FUNCTION platform._version_capture(''sandbox_instance'')';

  EXECUTE format(
    'CREATE TRIGGER _version_capture_update AFTER UPDATE ON public.sandbox_instances '
    'FOR EACH ROW WHEN ((to_jsonb(OLD.*) %s) IS DISTINCT FROM (to_jsonb(NEW.*) %s)) '
    'EXECUTE FUNCTION platform._version_capture(''sandbox_instance'')', strip, strip);
END $$;

-- ---------------------------------------------------------------------------
-- Verify the pair matches the sanctioned shape: exactly two capture triggers,
-- exactly one of them conditional.
-- ---------------------------------------------------------------------------
DO $$
DECLARE n_total int; n_cond int;
BEGIN
  SELECT count(*), count(*) FILTER (WHERE tg.tgqual IS NOT NULL)
    INTO n_total, n_cond
  FROM pg_trigger tg JOIN pg_proc p ON p.oid = tg.tgfoid
  WHERE NOT tg.tgisinternal AND p.proname = '_version_capture'
    AND tg.tgrelid = 'public.sandbox_instances'::regclass;

  IF n_total <> 2 OR n_cond <> 1 THEN
    RAISE EXCEPTION 'expected the split pair (2 triggers, 1 conditional), got % / %', n_total, n_cond;
  END IF;
  RAISE NOTICE 'OK: sandbox_instance split capture armed';
END $$;

COMMIT;
