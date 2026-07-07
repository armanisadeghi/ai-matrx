-- share_link_policy_and_admin.sql
-- ============================================================================
-- Share-link POLICY model + super-admin control surface.
--
-- Makes "what is publicly link-shareable, and which columns are safe to expose
-- to anonymous viewers" a first-class, admin-editable policy on the registry —
-- not a code constant. Powers the /administration/sharing control panel.
--
--   • `is_link_shareable` (bool) — whether the "Anyone with the link" affordance
--     is offered AND whether resolve_share_token will serve the resource. A per-
--     type kill switch: flip it off and every existing token for that type stops
--     rendering immediately.
--   • `public_columns` (text[], added earlier) — the anon allowlist (default-deny).
--
-- Seeds safe allowlists for user-content types (canvas, flashcards, quizzes,
-- transcripts, content, code, notes, agents-non-secret, agent apps, workspace,
-- udt, research, chat). Deliberately EXCLUDES: PII (wc_claim), secrets
-- (wf_trigger.webhook_secret, scraper credentials), storage locations
-- (file.storage_uri, code s3_*), private DMs, and internal satellites
-- (file_* analysis, redaction crypto, sandbox, ingest batches, scope suggestions).
--
-- Super-admin gate on all writes (protected-resources pattern): the registry
-- controls what reaches anonymous clients, so a regular admin must not edit it.
-- Idempotent.
-- ============================================================================

ALTER TABLE platform.shareable_resource_registry
  ADD COLUMN IF NOT EXISTS is_link_shareable boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN platform.shareable_resource_registry.is_link_shareable IS
  'Whether this type offers no-login share links. Also a kill switch: false '
  'stops resolve_share_token serving the resource even for already-minted tokens.';

-- ---------------------------------------------------------------------------
-- Seed safe allowlists + enable link sharing for user-content types.
-- Each list is the SAFE subset of that table''s columns (no secrets/PII/storage).
-- ---------------------------------------------------------------------------
DO $seed$
DECLARE
  v record;
BEGIN
  FOR v IN
    SELECT * FROM (VALUES
      ('note',              ARRAY['id','label','content','tags','folder_name','created_at','updated_at']),
      ('content_template',  ARRAY['id','label','content','role','tags','created_at','updated_at']),
      ('code_file',         ARRAY['id','name','path','language','content','tags','created_at','updated_at']),
      ('code_folder',       ARRAY['id','name','description','created_at']),
      ('code_repository',   ARRAY['id','name','description','tags','created_at']),
      ('canvas_item',       ARRAY['id','type','content','title','description','tags','artifact_index','created_at','updated_at']),
      ('fc_set',            ARRAY['id','name','description','topic','lesson','difficulty','created_at']),
      ('fc_card',           ARRAY['id','front','back','card_kind','difficulty','topic','lesson','dynamic_content','created_at']),
      ('flashcard_data',    ARRAY['id','topic','lesson','difficulty','front','back','example','detailed_explanation','created_at']),
      ('quiz_sessions',     ARRAY['id','title','state','quiz_content_hash','quiz_metadata','category','is_completed','completed_at','created_at']),
      ('transcript',        ARRAY['id','title','description','segments','tags','folder_name','source_type','created_at']),
      ('studio_session',    ARRAY['id','title','status','started_at','ended_at','total_duration_ms','created_at']),
      ('conversation',      ARRAY['id','title','description','keywords','created_at']),
      ('agent',             ARRAY['id','name','description','agent_type','variable_definitions','category','tags','created_at','updated_at']),
      ('agent_card',        ARRAY['id','name','description','agent_type','category','tags','variable_definitions','output_schema','created_at','updated_at']),
      ('app',               ARRAY['id','slug','name','tagline','description','category','tags','app_kind','preview_image_url','favicon_url','variable_schema','layout_config','styling_config','published_at','created_at']),
      ('project',           ARRAY['id','name','description','slug','status','created_at']),
      ('task',              ARRAY['id','title','description','status','priority','due_date','created_at']),
      ('thread',            ARRAY['id','title','created_at']),
      ('war_room',          ARRAY['id','title','description','icon','color','created_at']),
      ('note_folder',       ARRAY['id','name','path','created_at']),
      ('research_template', ARRAY['id','name','description','default_tags','created_at']),
      ('research_topic',    ARRAY['id','name','description','status','created_at']),
      ('udt_datasets',      ARRAY['id','table_name','description','created_at']),
      ('udt_documents',     ARRAY['id','document_name','description','created_at']),
      ('udt_picklists',     ARRAY['id','list_name','description','created_at']),
      ('udt_workbooks',     ARRAY['id','workbook_name','description','created_at'])
    ) AS t(rt, cols)
  LOOP
    UPDATE platform.shareable_resource_registry r
    SET public_columns = (
          SELECT array_agg(c ORDER BY ord)
          FROM unnest(v.cols) WITH ORDINALITY AS u(c, ord)
          WHERE EXISTS (
            SELECT 1 FROM information_schema.columns ic
            WHERE ic.table_schema = r.schema_name AND ic.table_name = r.table_name
              AND ic.column_name = u.c)
        ),
        is_link_shareable = true
    WHERE r.resource_type = v.rt AND r.is_active;
  END LOOP;
END;
$seed$;

-- ---------------------------------------------------------------------------
-- resolve_share_token + create_share_link now honor is_link_shareable.
-- (resolve_share_token full body re-created to add the kill-switch check.)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_share_token(p_token text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_link record; v_resolved record; v_full jsonb; v_allowed text[]; v_row jsonb;
  v_newcount integer; v_shareable boolean;
BEGIN
  SELECT * INTO v_link FROM platform.share_links WHERE token = p_token;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'not_found', 'message', 'This link is invalid.'); END IF;
  IF NOT v_link.is_active THEN RETURN jsonb_build_object('success', false, 'error', 'revoked', 'message', 'This link has been turned off by its owner.'); END IF;
  IF v_link.expires_at IS NOT NULL AND v_link.expires_at < now() THEN
    RETURN jsonb_build_object('success', false, 'error', 'expired', 'message', 'This link has expired.'); END IF;

  BEGIN SELECT * INTO STRICT v_resolved FROM public.resolve_shareable_resource(v_link.resource_type);
  EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('success', false, 'error', 'unknown_type', 'message', 'This item type can no longer be shared.'); END;

  SELECT COALESCE(is_link_shareable, false), COALESCE(public_columns, '{}')
    INTO v_shareable, v_allowed
    FROM platform.shareable_resource_registry WHERE resource_type = v_link.resource_type;
  IF NOT v_shareable THEN
    RETURN jsonb_build_object('success', false, 'error', 'disabled', 'message', 'Public sharing is turned off for this item type.'); END IF;

  EXECUTE format('SELECT to_jsonb(t) FROM %I.%I t WHERE t.%I = $1',
    v_resolved.schema_name, v_resolved.table_name, v_resolved.id_column) INTO v_full USING v_link.resource_id;
  IF v_full IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'gone', 'message', 'The shared item no longer exists.'); END IF;
  IF (v_full ? 'deleted_at') AND (v_full->>'deleted_at') IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'gone', 'message', 'The shared item was deleted.'); END IF;

  v_allowed := array_append(v_allowed, v_resolved.id_column);
  SELECT COALESCE(jsonb_object_agg(e.key, e.value), '{}'::jsonb) INTO v_row
    FROM jsonb_each(v_full) e WHERE e.key = ANY(v_allowed);

  UPDATE platform.share_links SET use_count = use_count + 1, last_used_at = now()
   WHERE id = v_link.id AND (max_uses IS NULL OR use_count < max_uses)
  RETURNING use_count INTO v_newcount;
  IF v_newcount IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'exhausted', 'message', 'This link has reached its view limit.'); END IF;

  RETURN jsonb_build_object('success', true, 'resource_type', v_link.resource_type, 'resource_id', v_link.resource_id,
    'permission_level', v_link.permission_level, 'display_label', v_resolved.display_label,
    'url_path_template', v_resolved.url_path_template, 'resource', v_row);
END;
$function$;
GRANT EXECUTE ON FUNCTION public.resolve_share_token(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.create_share_link(
  p_resource_type text, p_resource_id uuid,
  p_permission_level text DEFAULT 'viewer', p_expires_at timestamptz DEFAULT NULL,
  p_max_uses integer DEFAULT NULL, p_label text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid := auth.uid(); v_resolved record; v_token text; v_id uuid; v_org uuid; v_shareable boolean;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Not authenticated'); END IF;
  IF COALESCE(p_permission_level,'viewer') NOT IN ('viewer','editor','admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid permission level'); END IF;
  BEGIN SELECT * INTO STRICT v_resolved FROM public.resolve_shareable_resource(p_resource_type);
  EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('success', false, 'error', SQLERRM); END;

  SELECT COALESCE(is_link_shareable, false) INTO v_shareable
    FROM platform.shareable_resource_registry WHERE resource_type = v_resolved.resource_type;
  IF NOT v_shareable THEN
    RETURN jsonb_build_object('success', false, 'error', 'Public link sharing is not enabled for this item type'); END IF;

  IF NOT public.is_resource_owner(v_resolved.resource_type, p_resource_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only the owner can create a share link'); END IF;

  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  BEGIN
    EXECUTE format('SELECT organization_id FROM %I.%I WHERE %I = $1',
      v_resolved.schema_name, v_resolved.table_name, v_resolved.id_column) INTO v_org USING p_resource_id;
  EXCEPTION WHEN OTHERS THEN v_org := NULL; END;
  INSERT INTO platform.share_links (resource_type, resource_id, token, permission_level, created_by, organization_id, expires_at, max_uses, label)
  VALUES (v_resolved.resource_type, p_resource_id, v_token, COALESCE(p_permission_level,'viewer')::permission_level, v_uid, v_org, p_expires_at, p_max_uses, p_label)
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('success', true, 'token', v_token, 'id', v_id, 'resource_type', v_resolved.resource_type);
EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END; $function$;
REVOKE EXECUTE ON FUNCTION public.create_share_link(text, uuid, text, timestamptz, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_share_link(text, uuid, text, timestamptz, integer, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Capability read for the owner UI (any authenticated user): should the Public
-- toggle / link panel appear for this type?
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_share_capabilities(p_resource_type text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_r record; v_has_vis boolean;
BEGIN
  SELECT * INTO v_r FROM platform.shareable_resource_registry
   WHERE (resource_type = p_resource_type OR table_name = p_resource_type) AND is_active LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('supports_public', false, 'is_link_shareable', false); END IF;
  SELECT EXISTS(SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = v_r.schema_name AND c.table_name = v_r.table_name AND c.column_name IN ('visibility','card_visibility')) INTO v_has_vis;
  RETURN jsonb_build_object(
    'supports_public', v_has_vis OR (v_r.is_public_column IS NOT NULL),
    'is_link_shareable', COALESCE(v_r.is_link_shareable, false));
END; $function$;
GRANT EXECUTE ON FUNCTION public.get_share_capabilities(text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Admin control surface (super-admin gated — the registry governs anon exposure).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_list_share_policies()
RETURNS TABLE(resource_type text, schema_name text, table_name text, display_label text,
              is_active boolean, rls_uses_has_permission boolean, is_link_shareable boolean,
              public_columns text[], supports_public boolean, all_columns text[])
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Forbidden: Super Admin required' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
  SELECT r.resource_type, r.schema_name, r.table_name, r.display_label,
         r.is_active, r.rls_uses_has_permission, COALESCE(r.is_link_shareable, false),
         r.public_columns,
         EXISTS(SELECT 1 FROM information_schema.columns c
           WHERE c.table_schema=r.schema_name AND c.table_name=r.table_name AND c.column_name IN ('visibility','card_visibility'))
           OR (r.is_public_column IS NOT NULL) AS supports_public,
         (SELECT array_agg(c.column_name ORDER BY c.ordinal_position)
            FROM information_schema.columns c
           WHERE c.table_schema=r.schema_name AND c.table_name=r.table_name) AS all_columns
  FROM platform.shareable_resource_registry r
  ORDER BY r.is_active DESC, COALESCE(r.is_link_shareable,false) DESC, r.resource_type;
END; $function$;
GRANT EXECUTE ON FUNCTION public.admin_list_share_policies() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_share_policy(
  p_resource_type text, p_is_link_shareable boolean, p_public_columns text[]
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_r record; v_safe text[];
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Forbidden: Super Admin required' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_r FROM platform.shareable_resource_registry WHERE resource_type = p_resource_type;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Unknown resource type'); END IF;
  -- Only persist columns that actually exist on the table (never allow a typo to
  -- become a phantom allowlist entry).
  SELECT array_agg(col ORDER BY ord) INTO v_safe
    FROM unnest(COALESCE(p_public_columns,'{}')) WITH ORDINALITY AS u(col, ord)
   WHERE EXISTS (SELECT 1 FROM information_schema.columns c
     WHERE c.table_schema=v_r.schema_name AND c.table_name=v_r.table_name AND c.column_name=u.col);
  UPDATE platform.shareable_resource_registry
     SET is_link_shareable = COALESCE(p_is_link_shareable, false),
         public_columns = v_safe
   WHERE resource_type = p_resource_type;
  RETURN jsonb_build_object('success', true, 'resource_type', p_resource_type,
    'is_link_shareable', COALESCE(p_is_link_shareable,false), 'public_columns', v_safe);
END; $function$;
GRANT EXECUTE ON FUNCTION public.admin_set_share_policy(text, boolean, text[]) TO authenticated;
