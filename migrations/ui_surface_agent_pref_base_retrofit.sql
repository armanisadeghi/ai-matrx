-- ui_surface_agent_pref base retrofit
-- Multi-level scoped config: CHECK (user_id + org_id + scope_id <= 1).
-- NO org backfill — user-owned rows have user_id only (3 rows, all user-scoped).
-- Has: updated_at. Missing: created_by, updated_by, version, metadata, deleted_at.
-- Legacy trigger ui_surface_agent_pref_touch → replaced with _touch_row.
-- NOTE: applied as ui_surface_agent_pref_base_retrofit_b due to version collision during batch apply.

ALTER TABLE public.ui_surface_agent_pref
  ADD COLUMN IF NOT EXISTS created_by   uuid,
  ADD COLUMN IF NOT EXISTS updated_by   uuid,
  ADD COLUMN IF NOT EXISTS version      int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS metadata     jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS deleted_at   timestamptz;

-- Backfill created_by from user_id (no org backfill: one_scope constraint)
UPDATE public.ui_surface_agent_pref
SET created_by = user_id
WHERE created_by IS NULL AND user_id IS NOT NULL;

-- Drop legacy touch trigger; replace with canonical
DROP TRIGGER IF EXISTS ui_surface_agent_pref_touch ON public.ui_surface_agent_pref;
DROP TRIGGER IF EXISTS trg_ui_surface_agent_pref_touch ON public.ui_surface_agent_pref;
CREATE TRIGGER trg_ui_surface_agent_pref_touch
  BEFORE INSERT OR UPDATE ON public.ui_surface_agent_pref
  FOR EACH ROW EXECUTE FUNCTION platform._touch_row();

DROP TRIGGER IF EXISTS trg_ui_surface_agent_pref_stamp ON public.ui_surface_agent_pref;
CREATE TRIGGER trg_ui_surface_agent_pref_stamp
  BEFORE INSERT OR UPDATE ON public.ui_surface_agent_pref
  FOR EACH ROW EXECUTE FUNCTION platform._stamp_actor();

DO $$
DECLARE v_touch int; v_stamp int; v_total int;
BEGIN
  SELECT count(*) INTO v_total FROM public.ui_surface_agent_pref;
  SELECT count(*) INTO v_touch FROM pg_trigger WHERE tgrelid='public.ui_surface_agent_pref'::regclass AND tgname='trg_ui_surface_agent_pref_touch' AND NOT tgisinternal;
  SELECT count(*) INTO v_stamp FROM pg_trigger WHERE tgrelid='public.ui_surface_agent_pref'::regclass AND tgname='trg_ui_surface_agent_pref_stamp' AND NOT tgisinternal;
  IF v_touch = 0 THEN RAISE EXCEPTION 'ui_surface_agent_pref: _touch_row missing'; END IF;
  IF v_stamp = 0 THEN RAISE EXCEPTION 'ui_surface_agent_pref: _stamp_actor missing'; END IF;
  RAISE NOTICE 'ui_surface_agent_pref retrofit OK: % rows, triggers attached (one_scope constraint: no org backfill)', v_total;
END $$;
