-- share_links_column_allowlist_fix.sql
-- ============================================================================
-- SECURITY hardening of the no-login share-link system (follow-up to
-- share_links_canonical_system.sql). Adversarial review found that
-- resolve_share_token returned a FULL row dump minus a 3-column denylist — a
-- denylist can never be safe over an open-ended, growing resource registry, so
-- it leaked storage_uri / S3 keys / agent system prompts / WC-claim PII /
-- business metrics to anonymous viewers.
--
-- Fixes:
--   1. Per-type ALLOWLIST (default-deny). `shareable_resource_registry` gains
--      `public_columns text[]`. resolve_share_token returns ONLY those columns
--      (+ the id column). A type with no allowlist exposes NO content — the
--      link still resolves (type label + deep link), but nothing is dumped.
--   2. REVOKE the owner RPCs from PUBLIC (only resolve_share_token is anon).
--   3. Atomic max_uses enforcement (conditional UPDATE, no TOCTOU race).
--
-- Idempotent.
-- ============================================================================

ALTER TABLE platform.shareable_resource_registry
  ADD COLUMN IF NOT EXISTS public_columns text[];

COMMENT ON COLUMN platform.shareable_resource_registry.public_columns IS
  'Allowlist of columns safe to expose to ANONYMOUS share-link viewers via '
  'resolve_share_token. NULL/empty = expose no content (id only). NEVER add a '
  'column that carries secrets, storage locations, PII, or internal config.';

-- Seed the note allowlist (safe display fields only — no internal columns).
UPDATE platform.shareable_resource_registry
SET public_columns = ARRAY['id','label','content','tags','folder_name','created_at','updated_at']
WHERE resource_type = 'note';

-- Lock the owner RPCs to authenticated only (defense in depth; internal guards
-- already reject anon, but PUBLIC/anon EXECUTE violated least privilege).
-- Supabase auto-grants EXECUTE to anon/authenticated on new public functions,
-- so PUBLIC alone is insufficient — revoke from anon explicitly.
REVOKE EXECUTE ON FUNCTION public.create_share_link(text, uuid, text, timestamptz, integer, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.list_share_links(text, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.revoke_share_link(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_share_link(text, uuid, text, timestamptz, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_share_links(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_share_link(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.resolve_share_token(p_token text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_link      record;
  v_resolved  record;
  v_full      jsonb;
  v_allowed   text[];
  v_row       jsonb;
  v_newcount  integer;
BEGIN
  SELECT * INTO v_link FROM platform.share_links WHERE token = p_token;
  IF NOT FOUND        THEN RETURN jsonb_build_object('success', false, 'error', 'not_found',  'message', 'This link is invalid.'); END IF;
  IF NOT v_link.is_active THEN RETURN jsonb_build_object('success', false, 'error', 'revoked', 'message', 'This link has been turned off by its owner.'); END IF;
  IF v_link.expires_at IS NOT NULL AND v_link.expires_at < now() THEN
    RETURN jsonb_build_object('success', false, 'error', 'expired', 'message', 'This link has expired.'); END IF;

  BEGIN
    SELECT * INTO STRICT v_resolved FROM public.resolve_shareable_resource(v_link.resource_type);
  EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('success', false, 'error', 'unknown_type', 'message', 'This item type can no longer be shared.'); END;

  -- Full row read internally (definer) — used only to check existence /
  -- soft-delete; the full row NEVER leaves this function.
  EXECUTE format('SELECT to_jsonb(t) FROM %I.%I t WHERE t.%I = $1',
    v_resolved.schema_name, v_resolved.table_name, v_resolved.id_column)
    INTO v_full USING v_link.resource_id;
  IF v_full IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'gone', 'message', 'The shared item no longer exists.'); END IF;
  IF (v_full ? 'deleted_at') AND (v_full->>'deleted_at') IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'gone', 'message', 'The shared item was deleted.'); END IF;

  -- ALLOWLIST: expose only registry-declared public columns (+ the id column).
  SELECT COALESCE(public_columns, '{}') INTO v_allowed
    FROM platform.shareable_resource_registry
   WHERE resource_type = v_link.resource_type;
  v_allowed := array_append(COALESCE(v_allowed, '{}'), v_resolved.id_column);

  SELECT COALESCE(jsonb_object_agg(e.key, e.value), '{}'::jsonb) INTO v_row
    FROM jsonb_each(v_full) e
   WHERE e.key = ANY(v_allowed);

  -- Enforce max_uses ATOMICALLY (no read-then-write race).
  UPDATE platform.share_links
     SET use_count = use_count + 1, last_used_at = now()
   WHERE id = v_link.id
     AND (max_uses IS NULL OR use_count < max_uses)
  RETURNING use_count INTO v_newcount;
  IF v_newcount IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'exhausted', 'message', 'This link has reached its view limit.'); END IF;

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
