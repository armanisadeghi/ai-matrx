-- microservice_project_base_retrofit
-- Base-1 entity; is_system=true row has user_id IS NULL (system actor — created_by NULL valid per Decision #9)
-- retrofit_entity already live (personal, null_org=0, legacy set_updated_at dropped)

ALTER TABLE public.microservice_project
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS metadata   jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Backfill created_by for non-system rows that still have it null
UPDATE public.microservice_project
SET created_by = user_id
WHERE created_by IS NULL AND user_id IS NOT NULL;
-- is_system=true / user_id NULL rows: created_by stays NULL (system actor — valid per Decision #9)

INSERT INTO platform.entity_types
  (token, schema_name, table_name, label, base_tier, is_versioned, has_soft_delete, is_active, notes)
VALUES
  ('microservice_project','public','microservice_project','Microservice Project',1,true,true,true,
   'GitHub-backed microservice project. is_system=true rows owned by Matrx System org; created_by NULL = system actor.')
ON CONFLICT (token) DO NOTHING;

DO $$
DECLARE
  v_null_org      bigint;
  v_null_creator_non_system bigint;
  v_touch         boolean;
  v_stamp         boolean;
  v_legacy        boolean;
BEGIN
  SELECT count(*) FILTER (WHERE organization_id IS NULL) INTO v_null_org FROM public.microservice_project;
  SELECT count(*) FILTER (WHERE created_by IS NULL AND (is_system IS FALSE OR is_system IS NULL))
  INTO v_null_creator_non_system FROM public.microservice_project;

  SELECT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='_touch_row'    AND tgrelid='public.microservice_project'::regclass) INTO v_touch;
  SELECT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='_stamp_actor'  AND tgrelid='public.microservice_project'::regclass) INTO v_stamp;
  SELECT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='set_updated_at' AND tgrelid='public.microservice_project'::regclass) INTO v_legacy;

  IF v_null_org > 0                THEN RAISE EXCEPTION 'microservice_project: % rows null organization_id', v_null_org; END IF;
  IF v_null_creator_non_system > 0 THEN RAISE EXCEPTION 'microservice_project: % non-system rows null created_by', v_null_creator_non_system; END IF;
  IF NOT v_touch                   THEN RAISE EXCEPTION 'microservice_project: _touch_row trigger missing'; END IF;
  IF NOT v_stamp                   THEN RAISE EXCEPTION 'microservice_project: _stamp_actor trigger missing'; END IF;
  IF v_legacy                      THEN RAISE EXCEPTION 'microservice_project: legacy set_updated_at still present'; END IF;
  RAISE NOTICE 'microservice_project VERIFIED: null_org=%, non_system_null_creator=%, triggers=OK, legacy=dropped', v_null_org, v_null_creator_non_system;
END $$;
