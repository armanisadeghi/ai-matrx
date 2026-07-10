-- fork_shared_token_authorization_fix.sql
--
-- SECURITY FIX (P7): the fork_shared_* RPCs authorized a "link" fork with a
-- caller-independent `EXISTS(active share_link for this resource)` clause — it
-- neither took nor validated a token, so ANY authenticated user could fork a
-- private resource the moment its owner had ever minted ONE share link
-- (get_resource_access='none', no token held). Live-reproduced on fc_set.
--
-- Fix: thread the share token through the fork RPCs and authorize the link
-- branch ONLY when a VALID, ACTIVE token for THAT resource is presented,
-- validated exactly like the share-link READ path (`resolve_share_token`):
-- active (not revoked) + unexpired + not exhausted (use_count < max_uses) +
-- matches this resource. That validity predicate is factored into ONE helper
-- (`share_link_authorizes`) so the fork path can't drift from the read path.
--
-- The `visibility IN ('public','link')` branch is KEPT token-less: those are
-- owner-set resource-row states (set via SetVisibilityControl; RLS grants any
-- signed-in viewer via iam.has_access container-visibility) — anyone allowed to
-- SEE such a resource may fork it, same as 'public'. The `iam.has_access`
-- grantee/owner branch is also KEPT token-less (it validates the caller).
--
-- Idempotent: CREATE OR REPLACE for the helper; DROP IF EXISTS the old
-- single-arg fork signatures then create the (…, p_token) signatures. Re-grants
-- EXECUTE to authenticated (never anon — a fork requires a real account).

-- ---------------------------------------------------------------------------
-- Single validity predicate for a share token against a specific resource.
-- Mirrors resolve_share_token's revoked/expired/exhausted checks. Read-only:
-- a fork does NOT consume a view (it isn't a view), so use_count is checked but
-- NOT incremented here.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.share_link_authorizes(
  p_token text,
  p_resource_type text,
  p_resource_id uuid
) RETURNS boolean
  LANGUAGE sql
  SECURITY DEFINER
  STABLE
  SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM platform.share_links l
    WHERE l.token = p_token
      AND l.resource_type = p_resource_type
      AND l.resource_id = p_resource_id
      AND l.is_active
      AND (l.expires_at IS NULL OR l.expires_at > now())
      AND (l.max_uses IS NULL OR l.use_count < l.max_uses)
  );
$function$;

REVOKE ALL ON FUNCTION public.share_link_authorizes(text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.share_link_authorizes(text, text, uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- fork_shared_flashcard_set(p_set_id, p_token)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.fork_shared_flashcard_set(uuid);

CREATE OR REPLACE FUNCTION public.fork_shared_flashcard_set(p_set_id uuid, p_token text DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_src education.fc_set;
  v_new_set_id uuid := gen_random_uuid();
  v_org uuid; v_shareable boolean; v_shared boolean;
  v_card_map jsonb; v_card_count int := 0;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Sign in to save your own copy'); END IF;
  SELECT * INTO v_src FROM education.fc_set WHERE id = p_set_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Flashcard set not found'); END IF;

  SELECT COALESCE(is_link_shareable, false) INTO v_shareable FROM platform.shareable_resource_registry WHERE resource_type='fc_set';
  v_shared := COALESCE(v_shareable,false) AND (
       v_src.visibility IN ('public','link')
    OR (p_token IS NOT NULL AND public.share_link_authorizes(p_token, 'fc_set', p_set_id))
    OR iam.has_access('fc_set', p_set_id, 'viewer'));
  IF NOT v_shared THEN RETURN jsonb_build_object('success', false, 'error', 'This set is not shared'); END IF;

  v_org := public.ensure_personal_organization(v_uid);

  -- Do not carry the source owner's private audio file into the fork (the forker
  -- can't re-mint another tenant's file); they regenerate their own overview.
  INSERT INTO education.fc_set (id, organization_id, created_by, updated_by, metadata, visibility, name, description, topic, lesson, difficulty)
  VALUES (v_new_set_id, v_org, v_uid, v_uid, v_src.metadata, 'private', v_src.name, v_src.description, v_src.topic, v_src.lesson, v_src.difficulty);

  -- Map each LIVE member card (join fc_card so soft-deleted cards never produce
  -- an orphan edge/detail pointing at a card that isn't copied).
  SELECT COALESCE(jsonb_object_agg(a.source_id::text, gen_random_uuid()::text), '{}'::jsonb) INTO v_card_map
  FROM platform.associations a
  JOIN education.fc_card c ON c.id = a.source_id AND c.deleted_at IS NULL
  WHERE a.target_type='fc_set' AND a.target_id=p_set_id AND a.source_type='fc_card' AND a.role='member';

  INSERT INTO education.fc_card (id, organization_id, created_by, updated_by, metadata, visibility, front, back, card_kind, difficulty, topic, lesson, personal_notes, dynamic_content)
  SELECT (v_card_map ->> c.id::text)::uuid, v_org, v_uid, v_uid, c.metadata, 'private', c.front, c.back, c.card_kind, c.difficulty, c.topic, c.lesson, c.personal_notes, c.dynamic_content
  FROM education.fc_card c WHERE c.deleted_at IS NULL AND v_card_map ? c.id::text;
  GET DIAGNOSTICS v_card_count = ROW_COUNT;

  INSERT INTO platform.associations (source_type, source_id, target_type, target_id, organization_id, role, position, created_by)
  SELECT 'fc_card', (v_card_map ->> a.source_id::text)::uuid, 'fc_set', v_new_set_id, v_org, 'member', a.position, v_uid
  FROM platform.associations a
  WHERE a.target_type='fc_set' AND a.target_id=p_set_id AND a.source_type='fc_card' AND a.role='member'
    AND v_card_map ? a.source_id::text;

  -- Copy details but drop the source owner's audio_file_id (private-file ref).
  INSERT INTO education.fc_detail (organization_id, created_by, updated_by, metadata, card_id, kind, text, audio_file_id, generation_status, generated_by, position)
  SELECT v_org, v_uid, v_uid, d.metadata, (v_card_map ->> d.card_id::text)::uuid, d.kind, d.text, NULL, d.generation_status, v_uid, d.position
  FROM education.fc_detail d WHERE d.deleted_at IS NULL AND v_card_map ? d.card_id::text;

  RETURN jsonb_build_object('success', true, 'set_id', v_new_set_id, 'card_count', v_card_count);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END; $function$;

REVOKE ALL ON FUNCTION public.fork_shared_flashcard_set(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fork_shared_flashcard_set(uuid, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- fork_shared_conversation(p_conversation_id, p_token)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.fork_shared_conversation(uuid);

CREATE OR REPLACE FUNCTION public.fork_shared_conversation(p_conversation_id uuid, p_token text DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_src chat.conversation;
  v_new_conv_id uuid := gen_random_uuid();
  v_org uuid;
  v_shareable boolean;
  v_shared boolean;
  v_msg_map jsonb;
  v_tc_map jsonb;
  v_copied int := 0;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Sign in to save your own copy'); END IF;

  SELECT * INTO v_src FROM chat.conversation WHERE id = p_conversation_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Conversation not found'); END IF;

  -- Must be a type that offers link sharing, AND actually shared to THIS caller:
  -- public/link visibility (owner-set, RLS-viewable), a valid token for this
  -- resource, or an explicit grant — you can only fork what was shared with you.
  SELECT COALESCE(is_link_shareable, false) INTO v_shareable
    FROM platform.shareable_resource_registry WHERE resource_type = 'conversation';
  v_shared := COALESCE(v_shareable, false) AND (
       v_src.visibility IN ('public','link')
    OR (p_token IS NOT NULL AND public.share_link_authorizes(p_token, 'conversation', p_conversation_id))
    OR iam.has_access('conversation', p_conversation_id, 'viewer'));
  IF NOT v_shared THEN RETURN jsonb_build_object('success', false, 'error', 'This conversation is not shared'); END IF;

  v_org := public.ensure_personal_organization(v_uid);

  INSERT INTO chat.conversation (
    id, created_by, title, description, system_instruction, config, variables, overrides, metadata, keywords,
    status, visibility, is_ephemeral, source_app, source_feature, organization_id,
    initial_agent_id, initial_agent_version_id, last_model_id, forked_from_id, message_count
  ) VALUES (
    v_new_conv_id, v_uid, v_src.title, v_src.description, v_src.system_instruction, v_src.config, v_src.variables,
    v_src.overrides, v_src.metadata, v_src.keywords, 'active', 'private', v_src.is_ephemeral, v_src.source_app,
    v_src.source_feature, v_org, v_src.initial_agent_id, v_src.initial_agent_version_id, v_src.last_model_id,
    p_conversation_id, 0
  );

  SELECT COALESCE(jsonb_object_agg(m.id::text, gen_random_uuid()::text), '{}'::jsonb) INTO v_msg_map
  FROM chat.message m WHERE m.conversation_id = p_conversation_id AND m.deleted_at IS NULL;

  INSERT INTO chat.message (id, conversation_id, role, position, status, content, user_content, content_history,
    source, agent_id, is_visible_to_user, is_visible_to_model, metadata)
  SELECT (v_msg_map ->> m.id::text)::uuid, v_new_conv_id, m.role, m.position, m.status, m.content, m.user_content,
    m.content_history, m.source, m.agent_id, m.is_visible_to_user, m.is_visible_to_model, m.metadata
  FROM chat.message m WHERE m.conversation_id = p_conversation_id AND m.deleted_at IS NULL;
  GET DIAGNOSTICS v_copied = ROW_COUNT;
  UPDATE chat.conversation SET message_count = v_copied WHERE id = v_new_conv_id;

  SELECT COALESCE(jsonb_object_agg(tc.id::text, gen_random_uuid()::text), '{}'::jsonb) INTO v_tc_map
  FROM chat.tool_call tc WHERE tc.conversation_id = p_conversation_id AND tc.deleted_at IS NULL
    AND tc.message_id IS NOT NULL AND v_msg_map ? tc.message_id::text;

  INSERT INTO chat.tool_call (id, conversation_id, message_id, user_id, tool_name, tool_type, call_id, status,
    arguments, success, output, output_type, is_error, error_type, error_message, duration_ms, started_at,
    completed_at, input_tokens, output_tokens, total_tokens, cost_usd, iteration, retry_count, parent_call_id,
    execution_events, persist_key, file_path, metadata)
  SELECT (v_tc_map ->> tc.id::text)::uuid, v_new_conv_id, (v_msg_map ->> tc.message_id::text)::uuid, v_uid,
    tc.tool_name, tc.tool_type, tc.call_id, tc.status, tc.arguments, tc.success, tc.output, tc.output_type,
    tc.is_error, tc.error_type, tc.error_message, tc.duration_ms, tc.started_at, tc.completed_at, tc.input_tokens,
    tc.output_tokens, tc.total_tokens, tc.cost_usd, tc.iteration, tc.retry_count,
    CASE WHEN tc.parent_call_id IS NOT NULL AND v_tc_map ? tc.parent_call_id::text
         THEN (v_tc_map ->> tc.parent_call_id::text)::uuid ELSE NULL END,
    tc.execution_events, tc.persist_key, tc.file_path, tc.metadata
  FROM chat.tool_call tc WHERE tc.conversation_id = p_conversation_id AND tc.deleted_at IS NULL
    AND tc.message_id IS NOT NULL AND v_msg_map ? tc.message_id::text;

  RETURN jsonb_build_object('success', true, 'conversation_id', v_new_conv_id, 'message_count', v_copied);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END; $function$;

REVOKE ALL ON FUNCTION public.fork_shared_conversation(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fork_shared_conversation(uuid, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- fork_shared_quiz(p_quiz_id, p_token)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.fork_shared_quiz(uuid);

CREATE OR REPLACE FUNCTION public.fork_shared_quiz(p_quiz_id uuid, p_token text DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_src education.quiz_sessions;
  v_new_id uuid := gen_random_uuid();
  v_org uuid;
  v_shareable boolean; v_shared boolean;
  v_state jsonb;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Sign in to save your own copy'); END IF;
  SELECT * INTO v_src FROM education.quiz_sessions WHERE id = p_quiz_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Quiz not found'); END IF;

  SELECT COALESCE(is_link_shareable, false) INTO v_shareable FROM platform.shareable_resource_registry WHERE resource_type='quiz_sessions';
  v_shared := COALESCE(v_shareable,false) AND (
       v_src.visibility IN ('public','link')
    OR (p_token IS NOT NULL AND public.share_link_authorizes(p_token, 'quiz_sessions', p_quiz_id))
    OR iam.has_access('quiz_sessions', p_quiz_id, 'viewer'));
  IF NOT v_shared THEN RETURN jsonb_build_object('success', false, 'error', 'This quiz is not shared'); END IF;

  v_org := public.ensure_personal_organization(v_uid);

  -- Reset the taker's progress/results so the fork is a fresh attempt; keep the
  -- questions (originalQuestions/randomizedQuestions/quizId/mode).
  v_state := COALESCE(v_src.state, '{}'::jsonb) - 'progress' - 'results';

  INSERT INTO education.quiz_sessions (
    id, user_id, title, state, is_completed, quiz_content_hash, quiz_metadata, category,
    organization_id, created_by, updated_by, completed_at, visibility, metadata
  ) VALUES (
    v_new_id, v_uid, v_src.title, v_state, false, v_src.quiz_content_hash, v_src.quiz_metadata, v_src.category,
    v_org, v_uid, v_uid, NULL, 'private', v_src.metadata
  );
  RETURN jsonb_build_object('success', true, 'quiz_id', v_new_id);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END; $function$;

REVOKE ALL ON FUNCTION public.fork_shared_quiz(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fork_shared_quiz(uuid, text) TO authenticated, service_role;
