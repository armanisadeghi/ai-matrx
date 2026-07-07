-- share_links_canonical_system.sql
-- ============================================================================
-- Canonical no-login share links: one link, zero sign-in, renders any
-- registered shareable resource. The token IS the authorization — an anonymous
-- visitor with a valid token reads the resource through a SECURITY DEFINER RPC
-- that deliberately bypasses `iam.has_access` (which refuses anon). This is the
-- generic analog of the per-feature `files.share_links` / `consume_share_link`
-- and `canvas.shared_canvas_items` systems, keyed to the shareable-resource
-- registry so it works for every type without per-type plumbing.
--
-- Design notes:
--  • The link does NOT change the resource's `visibility` — visibility='link'
--    would also grant logged-in org members access (has_access treats it like
--    'internal'), an unintended side effect. The token alone authorizes the
--    anon read, so visibility is left untouched.
--  • Anon has NO direct table access; the only anon path is resolve_share_token.
--  • Idempotent (IF NOT EXISTS / CREATE OR REPLACE).
-- ============================================================================

CREATE TABLE IF NOT EXISTS platform.share_links (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_type    text        NOT NULL,          -- entity token (registry resource_type)
  resource_id      uuid        NOT NULL,
  token            text        NOT NULL UNIQUE,
  permission_level permission_level NOT NULL DEFAULT 'viewer',
  created_by       uuid        NOT NULL REFERENCES auth.users(id),
  organization_id  uuid,
  label            text,                            -- optional human label for the link
  expires_at       timestamptz,
  max_uses         integer,
  use_count        integer     NOT NULL DEFAULT 0,
  is_active        boolean     NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  last_used_at     timestamptz,
  metadata         jsonb       NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS share_links_token_idx    ON platform.share_links (token);
CREATE INDEX IF NOT EXISTS share_links_resource_idx ON platform.share_links (resource_type, resource_id);
CREATE INDEX IF NOT EXISTS share_links_creator_idx  ON platform.share_links (created_by);

ALTER TABLE platform.share_links ENABLE ROW LEVEL SECURITY;

-- Owner manages their own links; anon/others have NO direct table access
-- (the only anon path is the SECURITY DEFINER resolve_share_token RPC).
DROP POLICY IF EXISTS share_links_svc_all ON platform.share_links;
CREATE POLICY share_links_svc_all ON platform.share_links TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS share_links_owner_all ON platform.share_links;
CREATE POLICY share_links_owner_all ON platform.share_links TO authenticated
  USING (created_by = auth.uid()) WITH CHECK (created_by = auth.uid());

-- ---------------------------------------------------------------------------
-- Mint a share link (owner-gated). Returns the token.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_share_link(
  p_resource_type    text,
  p_resource_id      uuid,
  p_permission_level text        DEFAULT 'viewer',
  p_expires_at       timestamptz DEFAULT NULL,
  p_max_uses         integer     DEFAULT NULL,
  p_label            text        DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_uid      uuid := auth.uid();
  v_resolved record;
  v_token    text;
  v_id       uuid;
  v_org      uuid;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Not authenticated'); END IF;
  IF COALESCE(p_permission_level,'viewer') NOT IN ('viewer','editor','admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid permission level');
  END IF;
  BEGIN
    SELECT * INTO STRICT v_resolved FROM public.resolve_shareable_resource(p_resource_type);
  EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('success', false, 'error', SQLERRM); END;

  IF NOT public.is_resource_owner(v_resolved.resource_type, p_resource_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only the owner can create a share link');
  END IF;

  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');

  BEGIN
    EXECUTE format('SELECT organization_id FROM %I.%I WHERE %I = $1',
      v_resolved.schema_name, v_resolved.table_name, v_resolved.id_column)
      INTO v_org USING p_resource_id;
  EXCEPTION WHEN OTHERS THEN v_org := NULL; END;

  INSERT INTO platform.share_links (
    resource_type, resource_id, token, permission_level, created_by,
    organization_id, expires_at, max_uses, label
  ) VALUES (
    v_resolved.resource_type, p_resource_id, v_token,
    COALESCE(p_permission_level,'viewer')::permission_level, v_uid,
    v_org, p_expires_at, p_max_uses, p_label
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('success', true, 'token', v_token, 'id', v_id,
    'resource_type', v_resolved.resource_type);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$;

-- ---------------------------------------------------------------------------
-- Resolve a token to the shared resource (ANON-callable). The token is the
-- authorization; this deliberately bypasses iam.has_access.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_share_token(p_token text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_link     record;
  v_resolved record;
  v_row      jsonb;
BEGIN
  SELECT * INTO v_link FROM platform.share_links WHERE token = p_token;
  IF NOT FOUND        THEN RETURN jsonb_build_object('success', false, 'error', 'not_found',   'message', 'This link is invalid.'); END IF;
  IF NOT v_link.is_active THEN RETURN jsonb_build_object('success', false, 'error', 'revoked',  'message', 'This link has been turned off by its owner.'); END IF;
  IF v_link.expires_at IS NOT NULL AND v_link.expires_at < now() THEN
    RETURN jsonb_build_object('success', false, 'error', 'expired', 'message', 'This link has expired.'); END IF;
  IF v_link.max_uses IS NOT NULL AND v_link.use_count >= v_link.max_uses THEN
    RETURN jsonb_build_object('success', false, 'error', 'exhausted', 'message', 'This link has reached its view limit.'); END IF;

  BEGIN
    SELECT * INTO STRICT v_resolved FROM public.resolve_shareable_resource(v_link.resource_type);
  EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('success', false, 'error', 'unknown_type', 'message', 'This item type can no longer be shared.'); END;

  EXECUTE format('SELECT to_jsonb(t) FROM %I.%I t WHERE t.%I = $1',
    v_resolved.schema_name, v_resolved.table_name, v_resolved.id_column)
    INTO v_row USING v_link.resource_id;

  IF v_row IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'gone', 'message', 'The shared item no longer exists.'); END IF;
  IF (v_row ? 'deleted_at') AND (v_row->>'deleted_at') IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'gone', 'message', 'The shared item was deleted.'); END IF;

  -- Strip heavy/internal columns that should never reach an anonymous client.
  v_row := v_row - 'embedding' - 'search_tsv' - 'search_vector';

  UPDATE platform.share_links
     SET use_count = use_count + 1, last_used_at = now()
   WHERE id = v_link.id;

  RETURN jsonb_build_object(
    'success', true,
    'resource_type', v_link.resource_type,
    'resource_id', v_link.resource_id,
    'permission_level', v_link.permission_level,
    'display_label', v_resolved.display_label,
    'url_path_template', v_resolved.url_path_template,
    'resource', v_row
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.resolve_share_token(text) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- List a resource's share links (owner-gated).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_share_links(p_resource_type text, p_resource_id uuid)
RETURNS TABLE(id uuid, token text, permission_level text, label text,
              expires_at timestamptz, max_uses integer, use_count integer,
              is_active boolean, created_at timestamptz, last_used_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_resolved record;
BEGIN
  BEGIN SELECT * INTO STRICT v_resolved FROM public.resolve_shareable_resource(p_resource_type);
  EXCEPTION WHEN OTHERS THEN RETURN; END;
  IF NOT public.is_resource_owner(v_resolved.resource_type, p_resource_id) THEN RETURN; END IF;
  RETURN QUERY
  SELECT l.id, l.token, l.permission_level::text, l.label, l.expires_at, l.max_uses,
         l.use_count, l.is_active, l.created_at, l.last_used_at
  FROM platform.share_links l
  WHERE l.resource_type = v_resolved.resource_type AND l.resource_id = p_resource_id
  ORDER BY l.created_at DESC;
END;
$function$;

-- ---------------------------------------------------------------------------
-- Revoke a share link by id (owner-gated).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.revoke_share_link(p_link_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid := auth.uid(); v_rows int;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Not authenticated'); END IF;
  UPDATE platform.share_links SET is_active = false
   WHERE id = p_link_id AND created_by = v_uid;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN RETURN jsonb_build_object('success', false, 'error', 'Link not found or not yours'); END IF;
  RETURN jsonb_build_object('success', true);
END;
$function$;
