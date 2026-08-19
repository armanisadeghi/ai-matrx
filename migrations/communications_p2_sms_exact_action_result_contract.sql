-- Stable refusal contract for the already-applied exact-action confirmation
-- RPC. This additive replacement preserves its signature and atomic lock while
-- returning typed reasons instead of surfacing PostgreSQL exceptions as 500s.

CREATE OR REPLACE FUNCTION communication.confirm_sms_tool_authorization(
  p_call_id text,
  p_user_id uuid,
  p_recent_auth_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_row chat.tool_call%ROWTYPE;
  v_authorization jsonb;
  v_now timestamptz := clock_timestamp();
  v_match_count integer;
BEGIN
  IF p_call_id IS NULL OR btrim(p_call_id) = '' OR p_user_id IS NULL THEN
    RETURN jsonb_build_object('confirmed', false, 'reason', 'invalid_request');
  END IF;
  IF p_recent_auth_at IS NULL
     OR p_recent_auth_at < v_now - interval '15 minutes'
     OR p_recent_auth_at > v_now + interval '1 minute' THEN
    RETURN jsonb_build_object('confirmed', false, 'reason', 'recent_auth_required');
  END IF;

  SELECT count(*)
    INTO v_match_count
    FROM chat.tool_call tc
   WHERE tc.call_id = p_call_id
     AND tc.created_by = p_user_id
     AND tc.deleted_at IS NULL
     AND tc.status = 'delegated'
     AND tc.is_client_delegated = true
     AND tc.metadata->'execution_authorization'->>'kind' = 'sms_consequential_action'
     AND tc.metadata->'execution_authorization'->>'version' = '1';
  IF v_match_count <> 1 THEN
    RETURN jsonb_build_object('confirmed', false, 'reason', 'not_found');
  END IF;

  SELECT tc.*
    INTO STRICT v_row
    FROM chat.tool_call tc
   WHERE tc.call_id = p_call_id
     AND tc.created_by = p_user_id
     AND tc.deleted_at IS NULL
     AND tc.status = 'delegated'
     AND tc.is_client_delegated = true
     AND tc.metadata->'execution_authorization'->>'kind' = 'sms_consequential_action'
     AND tc.metadata->'execution_authorization'->>'version' = '1'
   FOR UPDATE;

  v_authorization := v_row.metadata->'execution_authorization';
  IF nullif(v_authorization->>'action_digest', '') IS NULL
     OR nullif(v_authorization->>'tool_name', '') IS NULL
     OR nullif(v_authorization->>'side_effect_class', '') IS NULL
     OR v_authorization ? 'confirmed_at'
     OR v_authorization ? 'consumed_at' THEN
    RETURN jsonb_build_object('confirmed', false, 'reason', 'conflict');
  END IF;
  IF NOT pg_input_is_valid(v_authorization->>'expires_at', 'timestamptz')
     OR (v_authorization->>'expires_at')::timestamptz <= v_now THEN
    RETURN jsonb_build_object('confirmed', false, 'reason', 'expired');
  END IF;

  v_authorization := v_authorization || jsonb_build_object(
    'confirmed_at', v_now,
    'confirmed_by', p_user_id,
    'recent_auth_at', p_recent_auth_at
  );
  UPDATE chat.tool_call
     SET metadata = jsonb_set(v_row.metadata, '{execution_authorization}', v_authorization, false)
   WHERE id = v_row.id;

  RETURN jsonb_build_object(
    'confirmed', true,
    'call_id', p_call_id,
    'action_digest', v_authorization->>'action_digest',
    'expires_at', v_authorization->>'expires_at'
  );
END;
$function$;

REVOKE ALL ON FUNCTION communication.confirm_sms_tool_authorization(text, uuid, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION communication.confirm_sms_tool_authorization(text, uuid, timestamptz)
  TO service_role;
