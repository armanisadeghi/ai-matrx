-- App Config — remote runtime configuration for shipped desktop clients.
-- Spec (System of Record): /Users/armanisadeghi/code/common-docs/app-config/FEATURE.md
--
-- One row per app (matrx-local first). Anon-readable by design (values are
-- public: server URLs, flags, min versions — never secrets). All writes go
-- through ONE SECURITY DEFINER RPC gated by is_super_admin(), which snapshots
-- the previous row into an append-only history table (protected-resources
-- pattern, same as public.admins — iam.apply_rls does not apply because this
-- is an ownerless system table with no created_by/organization_id).

-- ============================================================================
-- 1. Tables
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.app_config (
  app text PRIMARY KEY
    CHECK (app ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  schema_version int NOT NULL DEFAULT 1
    CHECK (schema_version >= 1),
  min_supported_app_version text NOT NULL
    CHECK (min_supported_app_version ~ '^[0-9]+\.[0-9]+\.[0-9]+'),
  config jsonb NOT NULL
    CHECK (jsonb_typeof(config) = 'object'),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

COMMENT ON TABLE public.app_config IS
  'Remote runtime config for shipped clients (one row per app). Anon-readable; writes ONLY via admin_update_app_config(). Never store secrets here.';

CREATE TABLE IF NOT EXISTS public.app_config_history (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  app text NOT NULL,
  schema_version int NOT NULL,
  min_supported_app_version text NOT NULL,
  config jsonb NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  changed_by uuid
);

CREATE INDEX IF NOT EXISTS app_config_history_app_idx
  ON public.app_config_history (app, changed_at DESC);

-- ============================================================================
-- 2. RLS — anon read on app_config (config must load pre-login); history is
--    admin-read; NO direct-write policies anywhere (RPC is the only path).
-- ============================================================================
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_config_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "app_config_public_read" ON public.app_config;
CREATE POLICY "app_config_public_read"
ON public.app_config
FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "app_config_history_admin_read" ON public.app_config_history;
CREATE POLICY "app_config_history_admin_read"
ON public.app_config_history
FOR SELECT
TO authenticated
USING (public.is_admin());

GRANT SELECT ON public.app_config TO anon, authenticated;
GRANT SELECT ON public.app_config_history TO authenticated;

-- ============================================================================
-- 3. The single sanctioned write path
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_update_app_config(
  p_app text,
  p_schema_version int,
  p_min_supported_app_version text,
  p_config jsonb
)
RETURNS public.app_config
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing public.app_config;
  updated  public.app_config;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Forbidden: Super Admin required' USING ERRCODE = '42501';
  END IF;

  IF p_config IS NULL OR jsonb_typeof(p_config) <> 'object' THEN
    RAISE EXCEPTION 'config must be a JSON object' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO existing FROM public.app_config WHERE app = p_app;

  IF FOUND THEN
    INSERT INTO public.app_config_history
      (app, schema_version, min_supported_app_version, config, changed_by)
    VALUES
      (existing.app, existing.schema_version, existing.min_supported_app_version,
       existing.config, auth.uid());
  END IF;

  INSERT INTO public.app_config AS ac
    (app, schema_version, min_supported_app_version, config, updated_at, updated_by)
  VALUES
    (p_app, p_schema_version, p_min_supported_app_version, p_config, now(), auth.uid())
  ON CONFLICT (app) DO UPDATE
    SET schema_version            = EXCLUDED.schema_version,
        min_supported_app_version = EXCLUDED.min_supported_app_version,
        config                    = EXCLUDED.config,
        updated_at                = now(),
        updated_by                = auth.uid()
  RETURNING * INTO updated;

  RETURN updated;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_app_config(text, int, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_update_app_config(text, int, text, jsonb) TO authenticated;

-- ============================================================================
-- 4. Seed row — matrx-local, matching its compiled shipping defaults
-- ============================================================================
INSERT INTO public.app_config (app, schema_version, min_supported_app_version, config)
VALUES (
  'matrx-local',
  1,
  '0.1.0',
  '{
    "aidream_server_url": "https://server.app.matrxserver.com",
    "matrx_files_url": "https://files.matrxserver.com",
    "scraper_server_url": "https://scraper.app.matrxserver.com",
    "flags": {},
    "notice": null
  }'::jsonb
)
ON CONFLICT (app) DO NOTHING;

-- New tables need a PostgREST schema-cache reload or anon reads 42501/404.
NOTIFY pgrst, 'reload schema';
