-- Migration: scheduler_tables_prep
-- Canonicalize sch_* tables while still in public (retrofit_entity is public-only)

-- sch_task: root entity — retrofit adds org/created_by/updated_by/version + canonical triggers
-- drops sch_task_updated_at (legacy), attaches _touch_row + _stamp_actor
SELECT platform.retrofit_entity('sch_task', 'sch_task', 'personal', 'user_id', null, null, 'sch_task_updated_at');

-- Add visibility + metadata (retrofit doesn't add these)
ALTER TABLE public.sch_task ADD COLUMN IF NOT EXISTS visibility platform.visibility NOT NULL DEFAULT 'private';
ALTER TABLE public.sch_task ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}';

-- sch_trigger: component of sch_task (task_id FK)
ALTER TABLE public.sch_trigger ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.sch_trigger ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE public.sch_trigger ADD COLUMN IF NOT EXISTS updated_by uuid;
ALTER TABLE public.sch_trigger ADD COLUMN IF NOT EXISTS version int NOT NULL DEFAULT 1;
ALTER TABLE public.sch_trigger ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}';
ALTER TABLE public.sch_trigger ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

UPDATE public.sch_trigger SET created_by = user_id WHERE created_by IS NULL AND user_id IS NOT NULL;
UPDATE public.sch_trigger t
  SET organization_id = st.organization_id
  FROM public.sch_task st
  WHERE t.task_id = st.id AND t.organization_id IS NULL;

DROP TRIGGER IF EXISTS sch_trigger_updated_at ON public.sch_trigger;
CREATE TRIGGER _touch_row BEFORE INSERT OR UPDATE ON public.sch_trigger
  FOR EACH ROW EXECUTE FUNCTION platform._touch_row();
CREATE TRIGGER _stamp_actor BEFORE INSERT OR UPDATE ON public.sch_trigger
  FOR EACH ROW EXECUTE FUNCTION platform._stamp_actor();

-- sch_run: component of sch_task (has organization_id + user_id already)
ALTER TABLE public.sch_run ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE public.sch_run ADD COLUMN IF NOT EXISTS updated_by uuid;
ALTER TABLE public.sch_run ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.sch_run ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}';

UPDATE public.sch_run SET created_by = user_id WHERE created_by IS NULL AND user_id IS NOT NULL;

CREATE TRIGGER _touch_row BEFORE INSERT OR UPDATE ON public.sch_run
  FOR EACH ROW EXECUTE FUNCTION platform._touch_row();
CREATE TRIGGER _stamp_actor BEFORE INSERT OR UPDATE ON public.sch_run
  FOR EACH ROW EXECUTE FUNCTION platform._stamp_actor();

-- sch_agent_task: 1:1 subtype (PK = FK → sch_task.id), pure config — component RLS needs no base cols
