-- industry_curators_base_retrofit
-- Base-2 join (user_id + industry_id composite PK); parent industries has no org col
-- retrofit_entity already live (personal, null_org=0)

ALTER TABLE public.industry_curators
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS metadata   jsonb NOT NULL DEFAULT '{}'::jsonb;

DROP TRIGGER IF EXISTS set_updated_at ON public.industry_curators;

INSERT INTO platform.entity_types
  (token, schema_name, table_name, label, base_tier, is_versioned, has_soft_delete, is_active, notes)
VALUES
  ('industry_curator','public','industry_curators','Industry Curator',2,false,false,true,
   'User-as-curator grant for an industry taxonomy node. Base-2 join; composite PK (user_id+industry_id); org from personal org (parent industries table has no org).')
ON CONFLICT (token) DO NOTHING;

DO $$
DECLARE
  v_null_org bigint; v_null_creator bigint; v_touch boolean; v_stamp boolean;
BEGIN
  SELECT count(*) FILTER (WHERE organization_id IS NULL),
         count(*) FILTER (WHERE created_by IS NULL)
  INTO v_null_org, v_null_creator FROM public.industry_curators;
  SELECT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='_touch_row'   AND tgrelid='public.industry_curators'::regclass) INTO v_touch;
  SELECT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='_stamp_actor' AND tgrelid='public.industry_curators'::regclass) INTO v_stamp;
  IF v_null_org > 0     THEN RAISE EXCEPTION 'industry_curators: % rows null organization_id', v_null_org; END IF;
  IF v_null_creator > 0 THEN RAISE EXCEPTION 'industry_curators: % rows null created_by', v_null_creator; END IF;
  IF NOT v_touch        THEN RAISE EXCEPTION 'industry_curators: _touch_row trigger missing'; END IF;
  IF NOT v_stamp        THEN RAISE EXCEPTION 'industry_curators: _stamp_actor trigger missing'; END IF;
  RAISE NOTICE 'industry_curators VERIFIED: null_org=%, null_creator=%, triggers=OK', v_null_org, v_null_creator;
END $$;
