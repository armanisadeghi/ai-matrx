-- Remote Catalogs — DB-backed catalogs for everything shipped clients treat
-- as data (local LLM GGUF list, LoRAs, image/video/TTS/NER models, workflow
-- presets, system prompts, ...). Approved by Arman 2026-07-14.
-- System of record: common-docs/remote-catalogs/FEATURE.md
--
-- Same protected-resources posture as public.app_config: anon-readable
-- (active rows only — clients fetch pre-login), ALL writes through gated
-- SECURITY DEFINER RPCs with history snapshots, explicit revoke of the
-- Supabase default-privilege grants (the app_config hardening lesson).

-- ============================================================================
-- 1. Tables
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.catalog_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app text NOT NULL
    CHECK (app ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  kind text NOT NULL
    CHECK (kind ~ '^[a-z0-9][a-z0-9_]{1,62}$'),
  key text NOT NULL
    CHECK (key ~ '^[A-Za-z0-9][A-Za-z0-9._:@/ -]{0,199}$'),
  schema_version int NOT NULL DEFAULT 1
    CHECK (schema_version >= 1),
  payload jsonb NOT NULL
    CHECK (jsonb_typeof(payload) = 'object'),
  artifact_url text,
  artifact_sha256 text
    CHECK (artifact_sha256 IS NULL OR artifact_sha256 ~ '^[a-f0-9]{64}$'),
  artifact_size_bytes bigint
    CHECK (artifact_size_bytes IS NULL OR artifact_size_bytes > 0),
  min_app_version text
    CHECK (min_app_version IS NULL OR min_app_version ~ '^[0-9]+\.[0-9]+\.[0-9]+$'),
  is_active boolean NOT NULL DEFAULT false,
  sort_order int NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id),
  UNIQUE (app, kind, key)
);

COMMENT ON TABLE public.catalog_entries IS
  'Remote catalogs for shipped clients (models, LoRAs, presets, prompts — one row per entry). Anon-readable when is_active; writes ONLY via admin_upsert_catalog_entry()/admin_delete_catalog_entry(). Never store secrets. SoR: common-docs/remote-catalogs/FEATURE.md';

CREATE INDEX IF NOT EXISTS catalog_entries_lookup_idx
  ON public.catalog_entries (app, kind, is_active, sort_order);

CREATE TABLE IF NOT EXISTS public.catalog_entries_history (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entry_id uuid NOT NULL,
  app text NOT NULL,
  kind text NOT NULL,
  key text NOT NULL,
  schema_version int NOT NULL,
  payload jsonb NOT NULL,
  artifact_url text,
  artifact_sha256 text,
  artifact_size_bytes bigint,
  min_app_version text,
  is_active boolean NOT NULL,
  sort_order int NOT NULL,
  notes text,
  op text NOT NULL CHECK (op IN ('update', 'delete')),
  changed_at timestamptz NOT NULL DEFAULT now(),
  changed_by uuid
);

CREATE INDEX IF NOT EXISTS catalog_entries_history_idx
  ON public.catalog_entries_history (app, kind, key, changed_at DESC);

-- ============================================================================
-- 2. RLS + grants (revoke-first: default privileges are NOT trusted)
-- ============================================================================
ALTER TABLE public.catalog_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_entries_history ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.catalog_entries FROM anon, authenticated;
REVOKE ALL ON public.catalog_entries_history FROM anon, authenticated;
GRANT SELECT ON public.catalog_entries TO anon, authenticated;
GRANT SELECT ON public.catalog_entries_history TO authenticated;

DROP POLICY IF EXISTS "catalog_entries_read" ON public.catalog_entries;
CREATE POLICY "catalog_entries_read"
ON public.catalog_entries
FOR SELECT
TO anon, authenticated
USING (is_active OR public.is_admin());

DROP POLICY IF EXISTS "catalog_entries_history_admin_read" ON public.catalog_entries_history;
CREATE POLICY "catalog_entries_history_admin_read"
ON public.catalog_entries_history
FOR SELECT
TO authenticated
USING (public.is_admin());

-- ============================================================================
-- 3. Write RPCs — the only mutation paths
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_upsert_catalog_entry(
  p_app text,
  p_kind text,
  p_key text,
  p_schema_version int,
  p_payload jsonb,
  p_artifact_url text DEFAULT NULL,
  p_artifact_sha256 text DEFAULT NULL,
  p_artifact_size_bytes bigint DEFAULT NULL,
  p_min_app_version text DEFAULT NULL,
  p_is_active boolean DEFAULT false,
  p_sort_order int DEFAULT 0,
  p_notes text DEFAULT NULL,
  p_expected_updated_at timestamptz DEFAULT NULL
)
RETURNS public.catalog_entries
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing public.catalog_entries;
  updated  public.catalog_entries;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Forbidden: Super Admin required' USING ERRCODE = '42501';
  END IF;

  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'payload must be a JSON object' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('catalog:' || p_app || ':' || p_kind || ':' || p_key));

  SELECT * INTO existing FROM public.catalog_entries
   WHERE app = p_app AND kind = p_kind AND key = p_key;

  IF p_expected_updated_at IS NOT NULL
     AND FOUND
     AND existing.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'Conflict: entry %/%/% changed since it was loaded (now %). Reload and re-apply.',
      p_app, p_kind, p_key, existing.updated_at
      USING ERRCODE = '40001';
  END IF;

  IF FOUND THEN
    INSERT INTO public.catalog_entries_history
      (entry_id, app, kind, key, schema_version, payload, artifact_url,
       artifact_sha256, artifact_size_bytes, min_app_version, is_active,
       sort_order, notes, op, changed_by)
    VALUES
      (existing.id, existing.app, existing.kind, existing.key,
       existing.schema_version, existing.payload, existing.artifact_url,
       existing.artifact_sha256, existing.artifact_size_bytes,
       existing.min_app_version, existing.is_active, existing.sort_order,
       existing.notes, 'update', auth.uid());
  END IF;

  INSERT INTO public.catalog_entries AS ce
    (app, kind, key, schema_version, payload, artifact_url, artifact_sha256,
     artifact_size_bytes, min_app_version, is_active, sort_order, notes,
     updated_at, updated_by)
  VALUES
    (p_app, p_kind, p_key, p_schema_version, p_payload, p_artifact_url,
     p_artifact_sha256, p_artifact_size_bytes, p_min_app_version, p_is_active,
     p_sort_order, p_notes, now(), auth.uid())
  ON CONFLICT (app, kind, key) DO UPDATE
    SET schema_version      = EXCLUDED.schema_version,
        payload             = EXCLUDED.payload,
        artifact_url        = EXCLUDED.artifact_url,
        artifact_sha256     = EXCLUDED.artifact_sha256,
        artifact_size_bytes = EXCLUDED.artifact_size_bytes,
        min_app_version     = EXCLUDED.min_app_version,
        is_active           = EXCLUDED.is_active,
        sort_order          = EXCLUDED.sort_order,
        notes               = EXCLUDED.notes,
        updated_at          = now(),
        updated_by          = auth.uid()
  RETURNING * INTO updated;

  RETURN updated;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_delete_catalog_entry(
  p_app text,
  p_kind text,
  p_key text
)
RETURNS public.catalog_entries
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing public.catalog_entries;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Forbidden: Super Admin required' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('catalog:' || p_app || ':' || p_kind || ':' || p_key));

  SELECT * INTO existing FROM public.catalog_entries
   WHERE app = p_app AND kind = p_kind AND key = p_key;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No catalog entry %/%/%', p_app, p_kind, p_key USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.catalog_entries_history
    (entry_id, app, kind, key, schema_version, payload, artifact_url,
     artifact_sha256, artifact_size_bytes, min_app_version, is_active,
     sort_order, notes, op, changed_by)
  VALUES
    (existing.id, existing.app, existing.kind, existing.key,
     existing.schema_version, existing.payload, existing.artifact_url,
     existing.artifact_sha256, existing.artifact_size_bytes,
     existing.min_app_version, existing.is_active, existing.sort_order,
     existing.notes, 'delete', auth.uid());

  DELETE FROM public.catalog_entries
   WHERE app = p_app AND kind = p_kind AND key = p_key;

  RETURN existing;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_upsert_catalog_entry(text, text, text, int, jsonb, text, text, bigint, text, boolean, int, text, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_upsert_catalog_entry(text, text, text, int, jsonb, text, text, bigint, text, boolean, int, text, timestamptz) TO authenticated;
REVOKE ALL ON FUNCTION public.admin_delete_catalog_entry(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_catalog_entry(text, text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
