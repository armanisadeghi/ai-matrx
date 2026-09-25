-- mandate_reference_latest_admin_read_2026_09_25.sql
--
-- Lets signed-in admins read the "latest row per reference" views directly
-- (the replacement pages for /administration/mandates/references:
-- /administration/mandates/unconverted-preview and /health-preview, and the
-- per-mandate source facts the admin list consumes).
--
-- ADDITIVE ONLY. Both views are `security_invoker = true`, so this GRANT
-- exposes nothing new by itself: every row still passes mandate.reference's
-- own RLS (`platform_admin_all` / `std_select` — platform admins, or the row's
-- creator). A non-admin reads zero rows.

GRANT SELECT ON mandate.v_reference_latest TO authenticated;
GRANT SELECT ON mandate.reference_latest_deployed TO authenticated;

-- Proof: both grants landed and both views still run as the invoker.
DO $$
BEGIN
  IF NOT has_table_privilege('authenticated', 'mandate.v_reference_latest', 'SELECT') THEN
    RAISE EXCEPTION 'grant on mandate.v_reference_latest did not land';
  END IF;
  IF NOT has_table_privilege('authenticated', 'mandate.reference_latest_deployed', 'SELECT') THEN
    RAISE EXCEPTION 'grant on mandate.reference_latest_deployed did not land';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'mandate'
      AND c.relname IN ('v_reference_latest', 'reference_latest_deployed')
      AND NOT ('security_invoker=true' = ANY (coalesce(c.reloptions, '{}')))
  ) THEN
    RAISE EXCEPTION 'a reference view is not security_invoker — the grant would bypass RLS';
  END IF;
END $$;
