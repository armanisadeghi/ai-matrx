-- kg_sweep_queue base retrofit
-- Strategy: personal (user_id nullable — system rows get NULL creator; org already NOT NULL)
-- Rows: 66. org already NOT NULL. Missing: created_by, updated_by, updated_at, version, deleted_at. Has: metadata already.
-- user_id is nullable → system rows remain with NULL created_by (valid per decision #9)

ALTER TABLE public.kg_sweep_queue
  ADD COLUMN IF NOT EXISTS created_by   uuid,
  ADD COLUMN IF NOT EXISTS updated_by   uuid,
  ADD COLUMN IF NOT EXISTS updated_at   timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS version      int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS deleted_at   timestamptz;

-- Backfill created_by from user_id where present
UPDATE public.kg_sweep_queue
SET created_by = user_id
WHERE created_by IS NULL AND user_id IS NOT NULL;

-- organization_id is already NOT NULL — no backfill needed

DROP TRIGGER IF EXISTS trg_kg_sweep_queue_touch ON public.kg_sweep_queue;
CREATE TRIGGER trg_kg_sweep_queue_touch
  BEFORE INSERT OR UPDATE ON public.kg_sweep_queue
  FOR EACH ROW EXECUTE FUNCTION platform._touch_row();

DROP TRIGGER IF EXISTS trg_kg_sweep_queue_stamp ON public.kg_sweep_queue;
CREATE TRIGGER trg_kg_sweep_queue_stamp
  BEFORE INSERT OR UPDATE ON public.kg_sweep_queue
  FOR EACH ROW EXECUTE FUNCTION platform._stamp_actor();

DO $$
DECLARE v_null_org int; v_null_cb int; v_null_cb_system int; v_touch int; v_stamp int;
BEGIN
  SELECT count(*) INTO v_null_org FROM public.kg_sweep_queue WHERE organization_id IS NULL;
  SELECT count(*) INTO v_null_cb  FROM public.kg_sweep_queue WHERE created_by IS NULL;
  SELECT count(*) INTO v_null_cb_system FROM public.kg_sweep_queue WHERE created_by IS NULL AND user_id IS NULL;
  SELECT count(*) INTO v_touch FROM pg_trigger WHERE tgrelid='public.kg_sweep_queue'::regclass AND tgname='trg_kg_sweep_queue_touch' AND NOT tgisinternal;
  SELECT count(*) INTO v_stamp FROM pg_trigger WHERE tgrelid='public.kg_sweep_queue'::regclass AND tgname='trg_kg_sweep_queue_stamp' AND NOT tgisinternal;
  IF v_null_org > 0 THEN RAISE EXCEPTION 'kg_sweep_queue: % null org', v_null_org; END IF;
  -- null created_by only OK if all are system rows (user_id also null)
  IF v_null_cb > v_null_cb_system THEN RAISE EXCEPTION 'kg_sweep_queue: % non-system rows have null created_by', (v_null_cb - v_null_cb_system); END IF;
  IF v_touch = 0 THEN RAISE EXCEPTION 'kg_sweep_queue: _touch_row missing'; END IF;
  IF v_stamp = 0 THEN RAISE EXCEPTION 'kg_sweep_queue: _stamp_actor missing'; END IF;
  RAISE NOTICE 'kg_sweep_queue retrofit OK: 0 null org, % system-row null creators, triggers attached', v_null_cb_system;
END $$;
