-- chair-step: revoke public execute on the new browser assist emit door
--
-- platform.emit_pending_assist — the ONE browser write for a live pending chip.
--
-- The old client path was SELECT pending-by-dedupe-key, then INSERT. That
-- loses to `assists_dedupe_pending_key` whenever another session already holds
-- the key (same-tab remount, another tab, or another addressee hidden by RLS).
-- PostgREST cannot upsert a partial unique index, so the loser arrived as HTTP
-- 409 / 23505 and the generic capture recorded a designed no-op as an error.
--
-- This door inserts, and on that exact unique index it refreshes the caller's
-- own row or returns NULL when the key is already addressed to someone else.
-- The unique violation never leaves the function, so the inspector never sees
-- it. first_seen_at is written only on insert.

CREATE FUNCTION platform.emit_pending_assist(
  p_organization_id uuid,
  p_source_kind text,
  p_source_key text,
  p_title text,
  p_body text,
  p_action jsonb,
  p_surface_name text,
  p_entity_type text,
  p_entity_id uuid,
  p_dedupe_key text,
  p_expires_at timestamptz,
  p_priority smallint,
  p_evidence jsonb,
  p_confidence real,
  p_reasoning text
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_id uuid;
  v_constraint text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'emit_pending_assist requires a signed-in user';
  END IF;
  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'emit_pending_assist requires organization_id';
  END IF;
  IF p_dedupe_key IS NULL OR btrim(p_dedupe_key) = '' THEN
    RAISE EXCEPTION 'emit_pending_assist requires dedupe_key';
  END IF;
  IF p_source_key IS NULL OR btrim(p_source_key) = '' THEN
    RAISE EXCEPTION 'emit_pending_assist requires source_key';
  END IF;
  IF p_title IS NULL OR btrim(p_title) = '' THEN
    RAISE EXCEPTION 'emit_pending_assist requires title';
  END IF;
  IF p_action IS NULL THEN
    RAISE EXCEPTION 'emit_pending_assist requires action';
  END IF;

  INSERT INTO platform.assists (
    user_id,
    organization_id,
    created_by,
    source_kind,
    source_key,
    title,
    body,
    action,
    surface_name,
    entity_type,
    entity_id,
    dedupe_key,
    expires_at,
    priority,
    evidence,
    confidence,
    reasoning,
    first_seen_at,
    status
  ) VALUES (
    v_uid,
    p_organization_id,
    v_uid,
    COALESCE(NULLIF(btrim(p_source_kind), ''), 'deterministic'),
    p_source_key,
    p_title,
    p_body,
    p_action,
    p_surface_name,
    p_entity_type,
    p_entity_id,
    p_dedupe_key,
    p_expires_at,
    COALESCE(p_priority, 0),
    p_evidence,
    p_confidence,
    p_reasoning,
    now(),
    'pending'
  )
  RETURNING id INTO v_id;

  RETURN v_id;
EXCEPTION
  WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
    IF v_constraint IS DISTINCT FROM 'assists_dedupe_pending_key' THEN
      RAISE;
    END IF;
    UPDATE platform.assists
       SET title = p_title,
           body = p_body,
           action = p_action,
           expires_at = p_expires_at,
           priority = COALESCE(p_priority, 0),
           evidence = p_evidence,
           confidence = p_confidence,
           reasoning = p_reasoning,
           occurrences = COALESCE(occurrences, 1) + 1,
           updated_at = now()
     WHERE dedupe_key = p_dedupe_key
       AND status = 'pending'
       AND deleted_at IS NULL
       AND user_id = v_uid
    RETURNING id INTO v_id;
    RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION platform.emit_pending_assist(
  uuid, text, text, text, text, jsonb, text, text, uuid, text, timestamptz, smallint, jsonb, real, text
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION platform.emit_pending_assist(
  uuid, text, text, text, text, jsonb, text, text, uuid, text, timestamptz, smallint, jsonb, real, text
) TO authenticated;

GRANT EXECUTE ON FUNCTION platform.emit_pending_assist(
  uuid, text, text, text, text, jsonb, text, text, uuid, text, timestamptz, smallint, jsonb, real, text
) TO service_role;

COMMENT ON FUNCTION platform.emit_pending_assist(
  uuid, text, text, text, text, jsonb, text, text, uuid, text, timestamptz, smallint, jsonb, real, text
) IS
  'Authenticated browser emit for a live pending assist. Inserts, or refreshes the caller''s own pending row on assists_dedupe_pending_key, or returns NULL when that key is already addressed to someone else. The unique violation never leaves the function.';

NOTIFY pgrst, 'reload schema';
