-- Installed-client fleet visibility — the missing half of the app-config
-- version gate. `min_supported_app_version` could be raised with ZERO
-- visibility into which installed clients it would lock out, because nothing
-- ever recorded the running app version.
--
-- 1. `app_instances.app_version` — reported by matrx-local on every sync.
-- 2. `admin_list_app_instances()` — super-admin fleet read (the table's RLS is
--    owner-only by design; admins need the whole fleet, so one gated RPC).
-- SoR: common-docs/app-config/FEATURE.md + /remote-catalogs/FEATURE.md

ALTER TABLE public.app_instances
  ADD COLUMN IF NOT EXISTS app_version text;

COMMENT ON COLUMN public.app_instances.app_version IS
  'Running client version (semver) reported on sync. Compared against app_config.min_supported_app_version to see who the gate would lock out.';

CREATE OR REPLACE FUNCTION public.admin_list_app_instances()
RETURNS TABLE (
  id uuid,
  user_id uuid,
  user_email text,
  instance_id text,
  instance_name text,
  app_version text,
  platform text,
  os_version text,
  architecture text,
  cpu_model text,
  cpu_cores integer,
  ram_total_gb real,
  is_active boolean,
  tunnel_active boolean,
  last_seen timestamptz,
  created_at timestamptz,
  metadata jsonb
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Forbidden: Super Admin required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    SELECT
      i.id, i.user_id, u.email::text AS user_email,
      i.instance_id, i.instance_name, i.app_version,
      i.platform, i.os_version, i.architecture,
      i.cpu_model, i.cpu_cores, i.ram_total_gb,
      i.is_active, i.tunnel_active,
      i.last_seen, i.created_at, i.metadata
    FROM public.app_instances i
    LEFT JOIN auth.users u ON u.id = i.user_id
    WHERE i.deleted_at IS NULL
    ORDER BY i.last_seen DESC NULLS LAST;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_app_instances() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_app_instances() TO authenticated;

NOTIFY pgrst, 'reload schema';
