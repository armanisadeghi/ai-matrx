-- canonicalize_wbx_entities_pre_move
-- 2026-06-27 · DB transition. Canonicalize the 6 wbx_* extension entity tables
-- (all EMPTY) while still in public, before moving them to the extend schema.
-- Adds visibility, drops the legacy double-fire set_updated_at trigger, swaps
-- the owner column user_id -> canonical created_by, installs canonical RLS
-- (entity for the 4 hard-delete tables; owner-by-created_by for the 2
-- tombstone/soft-delete tables whose is_deleted must stay readable), and
-- recreates indexes on created_by. Idempotent.

ALTER TABLE public.wbx_capture    ADD COLUMN IF NOT EXISTS visibility platform.visibility NOT NULL DEFAULT 'private';
ALTER TABLE public.wbx_seo_audit  ADD COLUMN IF NOT EXISTS visibility platform.visibility NOT NULL DEFAULT 'private';
ALTER TABLE public.wbx_screenshot ADD COLUMN IF NOT EXISTS visibility platform.visibility NOT NULL DEFAULT 'private';
ALTER TABLE public.wbx_pattern    ADD COLUMN IF NOT EXISTS visibility platform.visibility NOT NULL DEFAULT 'private';
ALTER TABLE public.wbx_highlight  ADD COLUMN IF NOT EXISTS visibility platform.visibility NOT NULL DEFAULT 'private';
ALTER TABLE public.wbx_guidance   ADD COLUMN IF NOT EXISTS visibility platform.visibility NOT NULL DEFAULT 'private';

DROP TRIGGER IF EXISTS set_updated_at ON public.wbx_capture;
DROP TRIGGER IF EXISTS set_updated_at ON public.wbx_seo_audit;
DROP TRIGGER IF EXISTS set_updated_at ON public.wbx_screenshot;
DROP TRIGGER IF EXISTS set_updated_at ON public.wbx_pattern;

SELECT iam.apply_rls('public','wbx_capture',   'wbx_capture',   'entity');
SELECT iam.apply_rls('public','wbx_seo_audit', 'wbx_seo_audit', 'entity');
SELECT iam.apply_rls('public','wbx_screenshot','wbx_screenshot','entity');
SELECT iam.apply_rls('public','wbx_pattern',   'wbx_pattern',   'entity');

-- owner-by-created_by RLS for the 2 tombstone tables (keep is_deleted readable:
-- guidance tombstones must sync across machines; the app filters is_deleted itself)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['wbx_highlight','wbx_guidance'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE (
      SELECT coalesce(string_agg(format('DROP POLICY IF EXISTS %I ON public.%I;', polname, t), ' '), '')
      FROM pg_policy WHERE polrelid = format('public.%I', t)::regclass
    );
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)', t||'_svc', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT USING (created_by = (select auth.uid()))', t||'_owner_select', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT WITH CHECK (created_by = (select auth.uid()))', t||'_owner_insert', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE USING (created_by = (select auth.uid())) WITH CHECK (created_by = (select auth.uid()))', t||'_owner_update', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE USING (created_by = (select auth.uid()))', t||'_owner_delete', t);
  END LOOP;
END $$;

ALTER TABLE public.wbx_capture    DROP COLUMN IF EXISTS user_id;
ALTER TABLE public.wbx_seo_audit  DROP COLUMN IF EXISTS user_id;
ALTER TABLE public.wbx_screenshot DROP COLUMN IF EXISTS user_id;
ALTER TABLE public.wbx_pattern    DROP COLUMN IF EXISTS user_id;
ALTER TABLE public.wbx_highlight  DROP COLUMN IF EXISTS user_id;
ALTER TABLE public.wbx_guidance   DROP COLUMN IF EXISTS user_id;

CREATE INDEX IF NOT EXISTS wbx_capture_owner_recent ON public.wbx_capture (created_by, captured_at DESC);
CREATE INDEX IF NOT EXISTS wbx_capture_owner_url    ON public.wbx_capture (created_by, url);
CREATE INDEX IF NOT EXISTS wbx_seo_audit_owner_recent ON public.wbx_seo_audit (created_by, audited_at DESC);
CREATE INDEX IF NOT EXISTS wbx_seo_audit_owner_url    ON public.wbx_seo_audit (created_by, url);
CREATE INDEX IF NOT EXISTS wbx_screenshot_owner_captured ON public.wbx_screenshot (created_by, captured_at DESC);
CREATE INDEX IF NOT EXISTS wbx_screenshot_owner_url      ON public.wbx_screenshot (created_by, page_url_canonical, captured_at DESC);
CREATE INDEX IF NOT EXISTS wbx_pattern_owner_domain ON public.wbx_pattern (created_by, domain);
CREATE UNIQUE INDEX IF NOT EXISTS wbx_pattern_owner_domain_name_key ON public.wbx_pattern (created_by, domain, name);
CREATE INDEX IF NOT EXISTS wbx_guidance_owner_domain  ON public.wbx_guidance (created_by, domain);
CREATE INDEX IF NOT EXISTS wbx_guidance_owner_updated ON public.wbx_guidance (created_by, updated_at DESC);
CREATE INDEX IF NOT EXISTS wbx_highlight_owner_conv   ON public.wbx_highlight (created_by, conversation_id) WHERE (is_deleted = false);
CREATE INDEX IF NOT EXISTS wbx_highlight_owner_domain ON public.wbx_highlight (created_by, domain)          WHERE (is_deleted = false);
CREATE INDEX IF NOT EXISTS wbx_highlight_owner_recent ON public.wbx_highlight (created_by, updated_at DESC) WHERE (is_deleted = false);
CREATE INDEX IF NOT EXISTS wbx_highlight_owner_url    ON public.wbx_highlight (created_by, url)             WHERE (is_deleted = false);

UPDATE platform.entity_types
SET is_versioned = true, default_visibility = 'private'
WHERE token IN ('wbx_capture','wbx_seo_audit','wbx_screenshot','wbx_pattern','wbx_highlight','wbx_guidance');
