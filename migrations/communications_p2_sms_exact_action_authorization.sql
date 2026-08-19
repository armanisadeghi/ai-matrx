-- Exact-action authorization for consequential tools requested over SMS.
--
-- The SMS runtime keeps the Mandate Holder's complete authored tool surface.
-- Read-only tools run normally. A db_write-or-higher invocation is delegated
-- into the existing durable chat.tool_call suspension path, and these two
-- service-only functions atomically confirm and consume its exact digest.
-- No new table or parallel execution ledger is introduced.

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
    RAISE EXCEPTION 'sms authorization identity is required' USING ERRCODE = '22023';
  END IF;
  IF p_recent_auth_at IS NULL
     OR p_recent_auth_at < v_now - interval '15 minutes'
     OR p_recent_auth_at > v_now + interval '1 minute' THEN
    RAISE EXCEPTION 'recent authentication is required' USING ERRCODE = '28000';
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
    RAISE EXCEPTION 'pending sms authorization is not exact' USING ERRCODE = 'P0002';
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
    RAISE EXCEPTION 'sms authorization is invalid or already resolved' USING ERRCODE = '40001';
  END IF;
  IF NOT pg_input_is_valid(v_authorization->>'expires_at', 'timestamptz')
     OR (v_authorization->>'expires_at')::timestamptz <= v_now THEN
    RAISE EXCEPTION 'sms authorization expired' USING ERRCODE = 'P0001';
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

CREATE OR REPLACE FUNCTION communication.consume_sms_tool_authorization(
  p_user_id uuid,
  p_organization_id uuid,
  p_conversation_id uuid,
  p_action_digest text
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
BEGIN
  IF p_user_id IS NULL OR p_organization_id IS NULL OR p_conversation_id IS NULL
     OR p_action_digest !~ '^[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object('consumed', false);
  END IF;

  SELECT tc.*
    INTO v_row
    FROM chat.tool_call tc
   WHERE tc.created_by = p_user_id
     AND tc.organization_id = p_organization_id
     AND tc.conversation_id = p_conversation_id
     AND tc.deleted_at IS NULL
     AND tc.status = 'completed'
     AND tc.is_client_delegated = true
     AND tc.metadata->'execution_authorization'->>'kind' = 'sms_consequential_action'
     AND tc.metadata->'execution_authorization'->>'version' = '1'
     AND tc.metadata->'execution_authorization'->>'action_digest' = p_action_digest
     AND tc.metadata->'execution_authorization'->>'confirmed_by' = p_user_id::text
     AND NOT (tc.metadata->'execution_authorization' ? 'consumed_at')
     AND pg_input_is_valid(tc.metadata->'execution_authorization'->>'expires_at', 'timestamptz')
     AND (tc.metadata->'execution_authorization'->>'expires_at')::timestamptz > v_now
   ORDER BY tc.created_at
   FOR UPDATE SKIP LOCKED
   LIMIT 1;

  IF v_row.id IS NULL THEN
    RETURN jsonb_build_object('consumed', false);
  END IF;

  v_authorization := v_row.metadata->'execution_authorization' ||
    jsonb_build_object('consumed_at', v_now);
  UPDATE chat.tool_call
     SET metadata = jsonb_set(v_row.metadata, '{execution_authorization}', v_authorization, false)
   WHERE id = v_row.id;

  RETURN jsonb_build_object(
    'consumed', true,
    'authorization_call_id', v_row.call_id,
    'action_digest', p_action_digest,
    'consumed_at', v_now
  );
END;
$function$;

REVOKE ALL ON FUNCTION communication.confirm_sms_tool_authorization(text, uuid, timestamptz)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION communication.consume_sms_tool_authorization(uuid, uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION communication.confirm_sms_tool_authorization(text, uuid, timestamptz)
  TO service_role;
GRANT EXECUTE ON FUNCTION communication.consume_sms_tool_authorization(uuid, uuid, uuid, text)
  TO service_role;

COMMENT ON FUNCTION communication.confirm_sms_tool_authorization(text, uuid, timestamptz) IS
  'Service-only, recent-auth-gated confirmation of one exact suspended SMS tool invocation.';
COMMENT ON FUNCTION communication.consume_sms_tool_authorization(uuid, uuid, uuid, text) IS
  'Service-only atomic single-use consumption of an exact confirmed SMS action digest.';
