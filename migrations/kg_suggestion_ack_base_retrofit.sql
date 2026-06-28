-- kg_suggestion_ack_base_retrofit
-- Base-3 ledger; composite PK (user_id + suggestion_id); no uuid id col
-- retrofit_entity already live (personal, null_org=0)

ALTER TABLE public.kg_suggestion_ack
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS metadata   jsonb NOT NULL DEFAULT '{}'::jsonb;

DROP TRIGGER IF EXISTS set_updated_at ON public.kg_suggestion_ack;

INSERT INTO platform.entity_types
  (token, schema_name, table_name, label, base_tier, is_versioned, has_soft_delete, is_active, notes)
VALUES
  ('kg_suggestion_ack','public','kg_suggestion_ack','KG Suggestion Ack',3,false,false,true,
   'KG suggestion acknowledgement/dismissal per user. Composite PK (user_id+suggestion_id); Base-3 ledger.')
ON CONFLICT (token) DO NOTHING;

DO $$
DECLARE
  v_null_org bigint; v_null_creator bigint; v_touch boolean; v_stamp boolean;
BEGIN
  SELECT count(*) FILTER (WHERE organization_id IS NULL),
         count(*) FILTER (WHERE created_by IS NULL)
  INTO v_null_org, v_null_creator FROM public.kg_suggestion_ack;
  SELECT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='_touch_row'   AND tgrelid='public.kg_suggestion_ack'::regclass) INTO v_touch;
  SELECT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='_stamp_actor' AND tgrelid='public.kg_suggestion_ack'::regclass) INTO v_stamp;
  IF v_null_org > 0     THEN RAISE EXCEPTION 'kg_suggestion_ack: % rows null organization_id', v_null_org; END IF;
  IF v_null_creator > 0 THEN RAISE EXCEPTION 'kg_suggestion_ack: % rows null created_by', v_null_creator; END IF;
  IF NOT v_touch        THEN RAISE EXCEPTION 'kg_suggestion_ack: _touch_row trigger missing'; END IF;
  IF NOT v_stamp        THEN RAISE EXCEPTION 'kg_suggestion_ack: _stamp_actor trigger missing'; END IF;
  RAISE NOTICE 'kg_suggestion_ack VERIFIED: null_org=%, null_creator=%, triggers=OK', v_null_org, v_null_creator;
END $$;
