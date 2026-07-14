-- App Config hardening (adversarial-review follow-up, 2026-07-14):
--
-- 1. H1: Supabase default privileges had granted anon/authenticated FULL table
--    privileges at CREATE TABLE time (and anon EXECUTE on the RPC via default
--    function ACLs) — the original migration's GRANT SELECT was a no-op on top
--    and REVOKE FROM PUBLIC missed the direct anon grant. RLS-with-no-write-
--    policy and the in-RPC is_super_admin() gate held, but the designed
--    defense-in-depth layer didn't exist. Revoke everything not intended.
-- 2. M2: the RPC's snapshot-then-upsert wasn't concurrency-safe (double/lost
--    history snapshots under concurrent saves) — add an advisory xact lock.
-- 3. M3: add optional p_expected_updated_at optimistic check (ERRCODE 40001 on
--    mismatch) so a stale editor can't silently clobber another admin's save.
-- 4. L1: anchor the semver CHECK ('1.2.3abc' passed the unanchored regex).
--
-- NOTE: the parameter list changed, so the old 4-arg overload is DROPPED (a
-- CREATE OR REPLACE would have left both). 4-arg calls still resolve via the
-- DEFAULT on the new parameter.

-- ── 1. Privilege revocations ────────────────────────────────────────────────
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.app_config FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.app_config_history FROM anon, authenticated;
REVOKE SELECT ON public.app_config_history FROM anon;

-- ── 4. Anchored semver CHECK ────────────────────────────────────────────────
ALTER TABLE public.app_config
  DROP CONSTRAINT IF EXISTS app_config_min_supported_app_version_check;
ALTER TABLE public.app_config
  ADD CONSTRAINT app_config_min_supported_app_version_check
  CHECK (min_supported_app_version ~ '^[0-9]+\.[0-9]+\.[0-9]+$');

-- ── 2 + 3. RPC v2: advisory lock + optimistic concurrency ───────────────────
DROP FUNCTION IF EXISTS public.admin_update_app_config(text, int, text, jsonb);

CREATE OR REPLACE FUNCTION public.admin_update_app_config(
  p_app text,
  p_schema_version int,
  p_min_supported_app_version text,
  p_config jsonb,
  p_expected_updated_at timestamptz DEFAULT NULL
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

  -- Serialize writers per app: snapshot-then-upsert must be atomic or
  -- concurrent saves duplicate/lose history versions.
  PERFORM pg_advisory_xact_lock(hashtext('app_config:' || p_app));

  SELECT * INTO existing FROM public.app_config WHERE app = p_app;

  IF p_expected_updated_at IS NOT NULL
     AND FOUND
     AND existing.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'Conflict: row for % changed since it was loaded (now %). Reload and re-apply.',
      p_app, existing.updated_at
      USING ERRCODE = '40001';
  END IF;

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

REVOKE ALL ON FUNCTION public.admin_update_app_config(text, int, text, jsonb, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_app_config(text, int, text, jsonb, timestamptz) TO authenticated;

NOTIFY pgrst, 'reload schema';
