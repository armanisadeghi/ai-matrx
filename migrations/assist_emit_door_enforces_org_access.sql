-- based-on: platform.emit_pending_assist(uuid, text, text, text, text, jsonb, text, text, uuid, text, timestamp with time zone, smallint, jsonb, real, text) e28c2c35b50b136d22954c79c841ea5a73e95e9eacd6fbfee16ea82823605415
-- chair-step: The already-deployed SECURITY DEFINER assist door must re-state its organization authorization and declare its client callable contract; this restores the RLS scope it bypasses while retaining the direct-table refusal.

INSERT INTO platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason, gate_predicate, signed_in_callers, anonymous_callers)
VALUES (
  'platform', 'emit_pending_assist',
  'p_organization_id uuid, p_source_kind text, p_source_key text, p_title text, p_body text, p_action jsonb, p_surface_name text, p_entity_type text, p_entity_id uuid, p_dedupe_key text, p_expires_at timestamp with time zone, p_priority smallint, p_evidence jsonb, p_confidence real, p_reasoning text',
  'assist RLS repair 2026-09-21',
  'Signed-in browser assist door. The addressee and created_by derive only from auth.uid(); iam.has_org_access(p_organization_id) refuses callers outside the explicit organization before the definer write; a duplicate refresh requires that same organization and caller.',
  'auth.uid() is not null AND iam.has_org_access(p_organization_id); the insert writes user_id = created_by = auth.uid(), and the dedupe refresh requires both user_id = auth.uid() and organization_id = p_organization_id.',
  true, false
)
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION platform.emit_pending_assist(
  p_organization_id uuid, p_source_kind text, p_source_key text, p_title text,
  p_body text, p_action jsonb, p_surface_name text, p_entity_type text,
  p_entity_id uuid, p_dedupe_key text, p_expires_at timestamptz,
  p_priority smallint, p_evidence jsonb, p_confidence real, p_reasoning text
)
RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_id uuid;
  v_constraint text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'emit_pending_assist requires a signed-in user'; END IF;
  IF p_organization_id IS NULL THEN RAISE EXCEPTION 'emit_pending_assist requires organization_id'; END IF;
  IF NOT iam.has_org_access(p_organization_id) THEN
    RAISE EXCEPTION 'emit_pending_assist requires access to organization %', p_organization_id USING ERRCODE = '42501';
  END IF;
  IF p_dedupe_key IS NULL OR btrim(p_dedupe_key) = '' THEN RAISE EXCEPTION 'emit_pending_assist requires dedupe_key'; END IF;
  IF p_source_key IS NULL OR btrim(p_source_key) = '' THEN RAISE EXCEPTION 'emit_pending_assist requires source_key'; END IF;
  IF p_title IS NULL OR btrim(p_title) = '' THEN RAISE EXCEPTION 'emit_pending_assist requires title'; END IF;
  IF p_action IS NULL THEN RAISE EXCEPTION 'emit_pending_assist requires action'; END IF;

  INSERT INTO platform.assists (
    user_id, organization_id, created_by, source_kind, source_key, title, body,
    action, surface_name, entity_type, entity_id, dedupe_key, expires_at, priority,
    evidence, confidence, reasoning, first_seen_at, status
  ) VALUES (
    v_uid, p_organization_id, v_uid, COALESCE(NULLIF(btrim(p_source_kind), ''), 'deterministic'),
    p_source_key, p_title, p_body, p_action, p_surface_name, p_entity_type, p_entity_id,
    p_dedupe_key, p_expires_at, COALESCE(p_priority, 0), p_evidence, p_confidence,
    p_reasoning, now(), 'pending'
  ) RETURNING id INTO v_id;
  RETURN v_id;
EXCEPTION WHEN unique_violation THEN
  GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
  IF v_constraint IS DISTINCT FROM 'assists_dedupe_pending_key' THEN RAISE; END IF;
  UPDATE platform.assists
     SET title = p_title, body = p_body, action = p_action, expires_at = p_expires_at,
         priority = COALESCE(p_priority, 0), evidence = p_evidence, confidence = p_confidence,
         reasoning = p_reasoning, occurrences = COALESCE(occurrences, 1) + 1, updated_at = now()
   WHERE dedupe_key = p_dedupe_key AND status = 'pending' AND deleted_at IS NULL
     AND user_id = v_uid AND organization_id = p_organization_id
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE oid = 'platform.emit_pending_assist(uuid,text,text,text,text,jsonb,text,text,uuid,text,timestamptz,smallint,jsonb,real,text)'::regprocedure
      AND prosecdef
      AND position('iam.has_org_access(p_organization_id)' in prosrc) > 0
      AND position('AND organization_id = p_organization_id' in prosrc) > 0
  ) THEN
    RAISE EXCEPTION 'emit_pending_assist must be a SECURITY DEFINER door with an explicit organization gate and organization-scoped dedupe refresh';
  END IF;
END;
$$;
