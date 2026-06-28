-- Move the admin cluster public -> admin (clean cut). Atomic: tables move AND every
-- function that names public.admins / public.admin_audit_log is repointed in the SAME
-- transaction, so is_super_admin() (the authorization backbone) is never left broken at commit.
-- Views + RLS policies reference the table by OID and follow the move automatically.
-- Applied + verified live 2026-06-27 (Supabase MCP). Idempotent / re-runnable.

GRANT USAGE ON SCHEMA admin TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA admin GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated, service_role;

DO $$
BEGIN
  IF to_regclass('public.admins')                 IS NOT NULL THEN ALTER TABLE public.admins                 SET SCHEMA admin; END IF;
  IF to_regclass('public.admin_audit_log')        IS NOT NULL THEN ALTER TABLE public.admin_audit_log        SET SCHEMA admin; END IF;
  IF to_regclass('public.admin_email_logs')       IS NOT NULL THEN ALTER TABLE public.admin_email_logs       SET SCHEMA admin; END IF;
  IF to_regclass('public.admin_markdown_samples') IS NOT NULL THEN ALTER TABLE public.admin_markdown_samples SET SCHEMA admin; END IF;
END $$;

-- repoint every function body that names the moved tables (plpgsql/sql store the name as text)
DO $$
DECLARE r record; newdef text;
BEGIN
  FOR r IN
    SELECT p.oid FROM pg_proc p
    WHERE p.prokind IN ('f','p')
      AND (pg_get_functiondef(p.oid) ~ 'public\.admins\M'
           OR pg_get_functiondef(p.oid) ~ 'public\.admin_audit_log\M')
  LOOP
    newdef := pg_get_functiondef(r.oid);
    newdef := replace(newdef, 'public.admin_audit_log', 'admin.admin_audit_log');
    newdef := replace(newdef, 'public.admins', 'admin.admins');
    EXECUTE newdef;
  END LOOP;
END $$;

INSERT INTO platform.deprecated_relations (old_ref, new_ref, archived_as, reason, deprecated_at) VALUES
  ('public.admins',                 'admin.admins',                 NULL, 'moved to admin schema (clean cut). Direct reads via .schema(''admin'').from(''admins''); writes via the admin_* SECURITY DEFINER RPCs (unchanged, still in public).', now()),
  ('public.admin_audit_log',        'admin.admin_audit_log',        NULL, 'moved to admin schema (clean cut). Read via admin_list_audit() RPC; written only by the audit trigger.', now()),
  ('public.admin_email_logs',       'admin.admin_email_logs',       NULL, 'moved to admin schema (clean cut). Use .schema(''admin'').from(''admin_email_logs'').', now()),
  ('public.admin_markdown_samples', 'admin.admin_markdown_samples', NULL, 'moved to admin schema (clean cut). Use .schema(''admin'').from(''admin_markdown_samples'').', now())
ON CONFLICT (old_ref) DO UPDATE SET new_ref=excluded.new_ref, reason=excluded.reason, deprecated_at=excluded.deprecated_at;
