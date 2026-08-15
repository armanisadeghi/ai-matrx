-- canvas_write_rpcs_resolve_actor_from_auth.sql  (2026-08-15)
--
-- Fix: an agent-app run whose artifact materialization ran on an
-- unauthenticated PostgREST request failed with
--   42501 "cannot create another user's personal organization"
-- and the artifact was dropped ("artifact #1 (react) failed to persist").
--
-- Root cause chain (proven live, 2026-08-15):
--   1. The canvas write RPCs are SECURITY INVOKER and take the owner as a
--      CALLER-SUPPLIED `p_user_id` (the browser reads it from Redux).
--   2. `canvas.canvas_items.organization_id` is NOT NULL with no default, so
--      the BEFORE INSERT `_stamp_org_default()` fills it. It resolves the actor
--      as COALESCE(created_by, user_id, owner_id, auth.uid()) and calls
--      `public.ensure_personal_organization(actor)`.
--   3. On a request with no user JWT (anon / publishable-key only), the
--      `_stamp_actor` trigger leaves created_by NULL, so the actor falls
--      through to the caller-supplied `user_id` — a user that is NOT
--      auth.uid() — and the D31 identity guard inside
--      ensure_personal_organization raises the org message above.
--   The org error is therefore a RED HERRING: the true failure is "this write
--   was not authenticated". Nothing in the path was creating an organization.
--
-- Second defect closed here (same call, authenticated): with a valid JWT and a
-- mismatched p_user_id the insert SUCCEEDED, writing user_id = the other user
-- while created_by/organization_id were the caller's — a mis-tenanted row that
-- RLS could not catch, because std_insert only checks created_by. Verified
-- live before this migration.
--
-- The fix: the owner is DERIVED from auth.uid(), never accepted from the
-- caller. p_user_id is kept in the signature (no client change required) but is
-- now validated, not trusted. service_role (aidream / server jobs) keeps the
-- ability to name the owner explicitly.
--
-- Idempotent: CREATE OR REPLACE only.

-- ---------------------------------------------------------------------------
-- One resolver for the whole canvas write family — never hand-write a second.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION canvas._require_actor(p_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
AS $function$
DECLARE
  v_uid uuid := (SELECT auth.uid());
BEGIN
  -- Server-side callers (aidream, scheduled jobs) legitimately name the owner.
  IF auth.role() = 'service_role' THEN
    RETURN COALESCE(p_user_id, v_uid);
  END IF;

  IF v_uid IS NULL THEN
    RAISE EXCEPTION
      'not authenticated: canvas items can only be written by a signed-in user'
      USING ERRCODE = '28000';
  END IF;

  IF p_user_id IS NOT NULL AND p_user_id <> v_uid THEN
    RAISE EXCEPTION 'cannot write a canvas item for another user'
      USING ERRCODE = '42501';
  END IF;

  RETURN v_uid;
END;
$function$;

-- anon KEEPS execute on purpose: the canvas write RPCs are reachable by anon,
-- and this resolver is what turns such a call into the honest
-- "not authenticated" (28000). Revoking it would answer "permission denied for
-- function _require_actor" instead — a second unreadable error in place of the
-- org red herring this migration exists to delete. The function reads
-- auth.uid()/auth.role() and raises; it grants nothing.
GRANT EXECUTE ON FUNCTION canvas._require_actor(uuid) TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 1. Any-surface materialized upsert (the path the agent-app run hit).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cx_canvas_upsert_source(
  p_user_id uuid, p_source_system text, p_source_id uuid, p_artifact_index smallint,
  p_type text, p_title text, p_content jsonb,
  p_conversation_id uuid DEFAULT NULL::uuid, p_source_type text DEFAULT 'model_direct'::text)
 RETURNS canvas.canvas_items
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_row canvas.canvas_items;
  v_conv_id uuid;
  v_message_id uuid;
  v_actor uuid := canvas._require_actor(p_user_id);
BEGIN
  -- content_hash stays NULL: materialized artifacts are identified by
  -- (source_system, source_id, artifact_index), NOT by content. A hash here
  -- would collide (23505) against another artifact's identical content on the
  -- (user_id, content_hash) unique, which is reserved for manual user saves.
  IF p_source_system = 'cx_message' THEN
    v_message_id := p_source_id;
    IF p_conversation_id IS NULL AND p_source_id IS NOT NULL THEN
      SELECT conversation_id INTO v_conv_id
      FROM chat.message
      WHERE id = p_source_id;
    ELSE
      v_conv_id := p_conversation_id;
    END IF;
  ELSE
    v_message_id := NULL;
    v_conv_id := p_conversation_id;
  END IF;

  INSERT INTO canvas.canvas_items (
    user_id, source_system, source_id, source_message_id, artifact_index,
    type, title, content, content_hash, conversation_id, source_type, version
  )
  VALUES (
    v_actor, p_source_system, p_source_id, v_message_id, p_artifact_index,
    p_type, p_title, p_content, NULL, v_conv_id, p_source_type, 1
  )
  ON CONFLICT (source_system, source_id, artifact_index)
    WHERE source_id IS NOT NULL AND artifact_index IS NOT NULL
  DO UPDATE SET
    type = EXCLUDED.type,
    title = EXCLUDED.title,
    content = EXCLUDED.content,
    content_hash = NULL,
    updated_at = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 2. Programmatic manual create.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cx_canvas_create_manual(
  p_user_id uuid, p_type text, p_title text, p_content jsonb,
  p_source_type text DEFAULT 'model_converted'::text,
  p_conversation_id uuid DEFAULT NULL::uuid, p_source_message_id uuid DEFAULT NULL::uuid)
 RETURNS canvas.canvas_items
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_row canvas.canvas_items;
  v_actor uuid := canvas._require_actor(p_user_id);
BEGIN
  INSERT INTO canvas.canvas_items (
    user_id, type, title, content, content_hash,
    conversation_id, source_message_id, source_type,
    artifact_index, version
  )
  VALUES (
    v_actor, p_type, p_title, p_content, NULL,
    p_conversation_id, p_source_message_id, p_source_type,
    NULL, 1
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 3. Model-produced new version of an existing artifact.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cx_canvas_update_version(
  p_user_id uuid, p_original_canvas_id uuid, p_new_message_id uuid,
  p_artifact_index smallint, p_type text, p_title text, p_content jsonb)
 RETURNS canvas.canvas_items
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_hash text;
  v_root_id uuid;
  v_max_version smallint;
  v_conv_id uuid;
  v_row canvas.canvas_items;
  v_actor uuid := canvas._require_actor(p_user_id);
BEGIN
  SELECT COALESCE(parent_canvas_id, id) INTO v_root_id
  FROM canvas.canvas_items
  WHERE id = p_original_canvas_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'canvas item % is not available to this account — it may not exist, or your access may not reach it',
      p_original_canvas_id
      USING ERRCODE = 'P0002';
  END IF;

  SELECT COALESCE(MAX(version), 0) INTO v_max_version
  FROM canvas.canvas_items
  WHERE id = v_root_id OR parent_canvas_id = v_root_id;

  SELECT conversation_id INTO v_conv_id
  FROM chat.message
  WHERE id = p_new_message_id;

  v_hash := encode(extensions.digest(p_content::text, 'sha256'), 'hex');

  INSERT INTO canvas.canvas_items (
    user_id, source_message_id, artifact_index, type, title,
    content, content_hash, conversation_id, source_type,
    version, parent_canvas_id
  )
  VALUES (
    v_actor, p_new_message_id, p_artifact_index, p_type, p_title,
    p_content, v_hash, v_conv_id, 'model_direct',
    v_max_version + 1, v_root_id
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$function$;
