-- agent_user_kv base retrofit
-- Composite PK: (user_id, key) — no uuid id column
-- Singleton-style: no id → no _touch_row, no _version_capture, no version column
-- Has updated_at but no created_at — add created_at
-- Legacy trigger replaced: agent_user_kv_updated_at

ALTER TABLE public.agent_user_kv
  ADD COLUMN IF NOT EXISTS organization_id uuid,
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS updated_by uuid,
  ADD COLUMN IF NOT EXISTS created_at timestamptz not null default now(),
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS metadata jsonb not null default '{}'::jsonb;

DROP TRIGGER IF EXISTS agent_user_kv_updated_at ON public.agent_user_kv;

UPDATE public.agent_user_kv
SET created_by = user_id
WHERE created_by IS NULL;

UPDATE public.agent_user_kv akv
SET organization_id = (
  SELECT id FROM public.organizations
  WHERE is_personal = true AND created_by = akv.user_id
  ORDER BY created_at LIMIT 1
)
WHERE organization_id IS NULL;

UPDATE public.agent_user_kv
SET organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
WHERE organization_id IS NULL;

-- _stamp_actor only (no _touch_row: no uuid id column)
DROP TRIGGER IF EXISTS trg_stamp_actor ON public.agent_user_kv;
CREATE TRIGGER trg_stamp_actor
  BEFORE INSERT OR UPDATE ON public.agent_user_kv
  FOR EACH ROW EXECUTE FUNCTION platform._stamp_actor();

-- Restore updated_at stamping
CREATE OR REPLACE FUNCTION public.set_updated_at_agent_user_kv()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_updated_at ON public.agent_user_kv;
CREATE TRIGGER trg_updated_at
  BEFORE UPDATE ON public.agent_user_kv
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_agent_user_kv();

INSERT INTO platform.entity_types (token, label, schema_name, table_name)
VALUES ('agent_user_kv', 'Agent User KV', 'public', 'agent_user_kv')
ON CONFLICT (token) DO NOTHING;

DO $$
DECLARE v_null_org int;
BEGIN
  SELECT count(*) INTO v_null_org FROM public.agent_user_kv WHERE organization_id IS NULL;
  IF v_null_org > 0 THEN
    RAISE EXCEPTION 'agent_user_kv: % rows still have NULL organization_id', v_null_org;
  END IF;
END $$;
