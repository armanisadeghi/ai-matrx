-- ============================================================================
-- user_surface_state — generic per-user, per-surface UI state.
--
-- A reusable primitive (the "Level 3" preferences store) that moves us off
-- cookies for surface-scoped state. Distinct from `agent_user_kv` (flat KV)
-- because it carries STRUCTURED (feature, surface_key) columns so the Python
-- backend can query a user's selection for a given surface server-side
-- (e.g. auto-injecting the right dictionary on a transcription surface).
--
-- Resolution convention (owned by the client `useSurfaceUserState` hook):
--   surface_key = '<ui_surface.name>'  → per-surface override
--   surface_key = '_default'           → the user's global default for a feature
-- '_default' can never collide with a real surface name: surface names validate
-- against ^[a-z0-9-/]+$ (no underscores) in features/surfaces.
--
-- First consumer: the Custom Dictionary feature (feature = 'dictionary'),
-- storing which orgs / scope types / scopes / personal dictionary are active on
-- each transcription / TTS surface.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.user_surface_state (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    feature      text NOT NULL,
    surface_key  text NOT NULL DEFAULT '_default',
    state        jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT user_surface_state_uniq UNIQUE (user_id, feature, surface_key)
);

CREATE INDEX IF NOT EXISTS user_surface_state_user_feature_idx
    ON public.user_surface_state (user_id, feature);

ALTER TABLE public.user_surface_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_surface_state_owner_all ON public.user_surface_state;
CREATE POLICY user_surface_state_owner_all
    ON public.user_surface_state
    FOR ALL
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- Keep updated_at fresh on every write.
CREATE OR REPLACE FUNCTION public.user_surface_state_touch()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS user_surface_state_touch_trg ON public.user_surface_state;
CREATE TRIGGER user_surface_state_touch_trg
    BEFORE UPDATE ON public.user_surface_state
    FOR EACH ROW EXECUTE FUNCTION public.user_surface_state_touch();

NOTIFY pgrst, 'reload schema';
