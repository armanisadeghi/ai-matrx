-- kg_sweep_run base retrofit
-- Class: Base-3 log (run telemetry, append-mostly). Rows: 62.
-- org already NOT NULL. Has: metadata, updated_at. Missing: created_by, updated_by, version, deleted_at.
-- Existing triggers: stamp_run_org (KEEP — already backfills org on INSERT), emit_run_lifecycle (KEEP),
--   trg_kg_sweep_run_touch → _fn_kg_sweep_touch_updated_at (just sets updated_at → DROP, replace with _touch_row).
-- user_id nullable → system rows have NULL creator (valid per decision #9).

ALTER TABLE public.kg_sweep_run
  ADD COLUMN IF NOT EXISTS created_by   uuid,
  ADD COLUMN IF NOT EXISTS updated_by   uuid,
  ADD COLUMN IF NOT EXISTS version      int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS deleted_at   timestamptz;

-- Backfill created_by from user_id where present
UPDATE public.kg_sweep_run
SET created_by = user_id
WHERE created_by IS NULL AND user_id IS NOT NULL;

-- Drop legacy updated_at-only trigger; replace with _touch_row
DROP TRIGGER IF EXISTS trg_kg_sweep_run_touch ON public.kg_sweep_run;
CREATE TRIGGER trg_kg_sweep_run_touch
  BEFORE INSERT OR UPDATE ON public.kg_sweep_run
  FOR EACH ROW EXECUTE FUNCTION platform._touch_row();

DROP TRIGGER IF EXISTS trg_kg_sweep_run_stamp ON public.kg_sweep_run;
CREATE TRIGGER trg_kg_sweep_run_stamp
  BEFORE INSERT OR UPDATE ON public.kg_sweep_run
  FOR EACH ROW EXECUTE FUNCTION platform._stamp_actor();

DO $$
DECLARE v_null_org int; v_null_cb int; v_null_cb_system int; v_touch int; v_stamp int;
BEGIN
  SELECT count(*) INTO v_null_org FROM public.kg_sweep_run WHERE organization_id IS NULL;
  SELECT count(*) INTO v_null_cb  FROM public.kg_sweep_run WHERE created_by IS NULL;
  SELECT count(*) INTO v_null_cb_system FROM public.kg_sweep_run WHERE created_by IS NULL AND user_id IS NULL;
  SELECT count(*) INTO v_touch FROM pg_trigger WHERE tgrelid='public.kg_sweep_run'::regclass AND tgname='trg_kg_sweep_run_touch' AND NOT tgisinternal;
  SELECT count(*) INTO v_stamp FROM pg_trigger WHERE tgrelid='public.kg_sweep_run'::regclass AND tgname='trg_kg_sweep_run_stamp' AND NOT tgisinternal;
  IF v_null_org > 0 THEN RAISE EXCEPTION 'kg_sweep_run: % null org', v_null_org; END IF;
  IF v_null_cb > v_null_cb_system THEN RAISE EXCEPTION 'kg_sweep_run: % non-system null created_by', (v_null_cb - v_null_cb_system); END IF;
  IF v_touch = 0 THEN RAISE EXCEPTION 'kg_sweep_run: _touch_row missing'; END IF;
  IF v_stamp = 0 THEN RAISE EXCEPTION 'kg_sweep_run: _stamp_actor missing'; END IF;
  RAISE NOTICE 'kg_sweep_run retrofit OK: 0 null org, % system-row null creators, triggers attached', v_null_cb_system;
END $$;
