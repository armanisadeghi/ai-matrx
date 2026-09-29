-- access_ladder_t13_22e_forks_and_lists_stop_reading_link.sql
--
-- T-13 step 2.2, part e of e (common-docs/projects/access-ladder/t13/PLAN.md).
-- fork_shared_conversation / _flashcard_set / _quiz: the no-token lane is visibility 'public'
-- only; a link holder presents its token (share_link_authorizes, unchanged). Live 2026-09-28:
-- zero conversation / fc_set / quiz_session rows at 'link', so no copy right is lost.
-- education.assessment_list_match / fc_set_list_match: the organization lane reads
-- "not personal" instead of listing 'link' (identical rows; lists never decide access).
-- Rollback: re-apply the bodies named by the based-on lines.
-- based-on: public.fork_shared_conversation(uuid, uuid, text) f6870e321400165966c53a5736ad412d1c0172821a0b55321c07ecc036c4c131
-- based-on: public.fork_shared_flashcard_set(uuid, uuid, text) 03c89ea4f03a5c4826e168ff5be95e3efa42aef8ca6ff059bfb0455f9aa5454f
-- based-on: public.fork_shared_quiz(uuid, uuid, text) 217524a157ecfa5ec10116a67921de76fa18fc621bb7df46e4957f6b690db7c8
-- based-on: education.assessment_list_match(uuid, uuid, text, uuid, timestamp with time zone, text, text, text, text, text, text, text, text, text, uuid, text, jsonb, text, text) 81d45717d1702b42bfc29150438f35182b04b0f1b2ced64b94382f71824740fd
-- based-on: education.fc_set_list_match(uuid, uuid, text, uuid, timestamp with time zone, text, text, text, text, text, uuid[], text, uuid, text, jsonb, text, text) 2cd3b75279dc01693c0f2f6be892ba3fbe9431496c8270371057218285c49651

CREATE OR REPLACE FUNCTION public.fork_shared_conversation(p_conversation_id uuid, p_organization_id uuid, p_token text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_unavailable constant jsonb := jsonb_build_object('success', false, 'error', 'There is no conversation here that you may copy — if one was shared with you, ask for the link again.', 'code', 'not_available');
  v_uid uuid := auth.uid();
  v_src chat.conversation;
  v_new_conv_id uuid := gen_random_uuid();
  v_org uuid := p_organization_id;
  v_shareable boolean;
  v_shared boolean;
  v_msg_map jsonb;
  v_tc_map jsonb;
  v_copied int := 0;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Sign in to save your own copy'); END IF;
  IF v_org IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Choose the organization your copy belongs to.'); END IF;
  IF NOT iam.has_org_access(v_org) THEN RETURN jsonb_build_object('success', false, 'error', 'You are not a member of that organization.'); END IF;

  SELECT * INTO v_src FROM chat.conversation WHERE id = p_conversation_id AND deleted_at IS NULL;
  -- ONE ANSWER for an id that names nothing and for a real one the caller may not copy
  -- (ARGS-RULED-2): v_unavailable is the only refusal either branch can return.
  IF NOT FOUND THEN RETURN v_unavailable; END IF;

  SELECT COALESCE(is_link_shareable, false) INTO v_shareable
    FROM platform.shareable_resource_registry WHERE resource_type = 'conversation';
  v_shared := COALESCE(v_shareable, false) AND (
       v_src.visibility = 'public'  -- T-13 2.2: `link` is never a row state; a link holder presents the token below
    OR (p_token IS NOT NULL AND public.share_link_authorizes(p_token, 'conversation', p_conversation_id))
    OR iam.has_access('conversation', p_conversation_id, 'viewer'));
  IF NOT v_shared THEN RETURN v_unavailable; END IF;

  INSERT INTO chat.conversation (
    id, created_by, title, description, system_instruction, config, variables, overrides, metadata, keywords,
    status, visibility, is_ephemeral, source_app, source_feature, organization_id,
    initial_agent_id, initial_agent_version_id, last_model_id, forked_from_id, message_count
  ) VALUES (
    v_new_conv_id, v_uid, v_src.title, v_src.description, v_src.system_instruction, v_src.config, v_src.variables,
    v_src.overrides, v_src.metadata, v_src.keywords, 'active', 'personal', v_src.is_ephemeral, v_src.source_app,
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

  INSERT INTO chat.tool_call (id, conversation_id, message_id, created_by, tool_name, tool_type, call_id, status,
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

CREATE OR REPLACE FUNCTION public.fork_shared_flashcard_set(p_set_id uuid, p_organization_id uuid, p_token text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_unavailable constant jsonb := jsonb_build_object('success', false, 'error', 'There is no flashcard set here that you may copy — if one was shared with you, ask for the link again.', 'code', 'not_available');
  v_uid uuid := auth.uid();
  v_src education.fc_set;
  v_new_set_id uuid := gen_random_uuid();
  v_org uuid := p_organization_id; v_shareable boolean; v_shared boolean;
  v_card_map jsonb; v_card_count int := 0;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Sign in to save your own copy'); END IF;
  IF v_org IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Choose the organization your copy belongs to.'); END IF;
  IF NOT iam.has_org_access(v_org) THEN RETURN jsonb_build_object('success', false, 'error', 'You are not a member of that organization.'); END IF;

  SELECT * INTO v_src FROM education.fc_set WHERE id = p_set_id AND deleted_at IS NULL;
  -- ONE ANSWER for an id that names nothing and for a real one the caller may not copy
  -- (ARGS-RULED-2): v_unavailable is the only refusal either branch can return.
  IF NOT FOUND THEN RETURN v_unavailable; END IF;

  SELECT COALESCE(is_link_shareable, false) INTO v_shareable FROM platform.shareable_resource_registry WHERE resource_type='fc_set';
  v_shared := COALESCE(v_shareable,false) AND (
       v_src.visibility = 'public'  -- T-13 2.2: `link` is never a row state; a link holder presents the token below
    OR (p_token IS NOT NULL AND public.share_link_authorizes(p_token, 'fc_set', p_set_id))
    OR iam.has_access('fc_set', p_set_id, 'viewer'));
  IF NOT v_shared THEN RETURN v_unavailable; END IF;

  INSERT INTO education.fc_set (id, organization_id, created_by, updated_by, metadata, visibility, name, description, topic, lesson, difficulty)
  VALUES (v_new_set_id, v_org, v_uid, v_uid, v_src.metadata, 'personal', v_src.name, v_src.description, v_src.topic, v_src.lesson, v_src.difficulty);

  SELECT COALESCE(jsonb_object_agg(a.source_id::text, gen_random_uuid()::text), '{}'::jsonb) INTO v_card_map
  FROM platform.associations_live a
  JOIN education.fc_card c ON c.id = a.source_id AND c.deleted_at IS NULL
  WHERE a.target_type='fc_set' AND a.target_id=p_set_id AND a.source_type='fc_card' AND a.role='member';

  INSERT INTO education.fc_card (id, organization_id, created_by, updated_by, metadata, visibility, front, back, card_kind, difficulty, topic, lesson, personal_notes, dynamic_content)
  SELECT (v_card_map ->> c.id::text)::uuid, v_org, v_uid, v_uid, c.metadata, 'personal', c.front, c.back, c.card_kind, c.difficulty, c.topic, c.lesson, c.personal_notes, c.dynamic_content
  FROM education.fc_card c WHERE c.deleted_at IS NULL AND v_card_map ? c.id::text;
  GET DIAGNOSTICS v_card_count = ROW_COUNT;

  INSERT INTO platform.associations (source_type, source_id, target_type, target_id, organization_id, role, position, created_by)
  SELECT 'fc_card', (v_card_map ->> a.source_id::text)::uuid, 'fc_set', v_new_set_id, v_org, 'member', a.position, v_uid
  FROM platform.associations_live a
  WHERE a.target_type='fc_set' AND a.target_id=p_set_id AND a.source_type='fc_card' AND a.role='member'
    AND v_card_map ? a.source_id::text;

  INSERT INTO education.fc_detail (organization_id, created_by, updated_by, metadata, card_id, kind, text, audio_file_id, generation_status, generated_by, position)
  SELECT v_org, v_uid, v_uid, d.metadata, (v_card_map ->> d.card_id::text)::uuid, d.kind, d.text, NULL, d.generation_status, v_uid, d.position
  FROM education.fc_detail d WHERE d.deleted_at IS NULL AND v_card_map ? d.card_id::text;

  RETURN jsonb_build_object('success', true, 'set_id', v_new_set_id, 'card_count', v_card_count);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END; $function$;

CREATE OR REPLACE FUNCTION public.fork_shared_quiz(p_quiz_id uuid, p_organization_id uuid, p_token text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_unavailable constant jsonb := jsonb_build_object('success', false, 'error', 'There is no quiz here that you may copy — if one was shared with you, ask for the link again.', 'code', 'not_available');
  v_uid uuid := auth.uid();
  v_src education.quiz_sessions;
  v_new_id uuid := gen_random_uuid();
  v_org uuid := p_organization_id;
  v_shareable boolean; v_shared boolean;
  v_state jsonb;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Sign in to save your own copy'); END IF;
  IF v_org IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Choose the organization your copy belongs to.'); END IF;
  IF NOT iam.has_org_access(v_org) THEN RETURN jsonb_build_object('success', false, 'error', 'You are not a member of that organization.'); END IF;

  SELECT * INTO v_src FROM education.quiz_sessions WHERE id = p_quiz_id AND deleted_at IS NULL;
  -- ONE ANSWER for an id that names nothing and for a real one the caller may not copy
  -- (ARGS-RULED-2): v_unavailable is the only refusal either branch can return.
  IF NOT FOUND THEN RETURN v_unavailable; END IF;

  SELECT COALESCE(is_link_shareable, false) INTO v_shareable FROM platform.shareable_resource_registry WHERE resource_type='quiz_session';
  v_shared := COALESCE(v_shareable,false) AND (
       v_src.visibility = 'public'  -- T-13 2.2: `link` is never a row state; a link holder presents the token below
    OR (p_token IS NOT NULL AND public.share_link_authorizes(p_token, 'quiz_session', p_quiz_id))
    OR iam.has_access('quiz_session', p_quiz_id, 'viewer'));
  IF NOT v_shared THEN RETURN v_unavailable; END IF;

  v_state := COALESCE(v_src.state, '{}'::jsonb) - 'progress' - 'results';

  INSERT INTO education.quiz_sessions (
    id, title, state, is_completed, quiz_content_hash, quiz_metadata, category,
    organization_id, created_by, updated_by, completed_at, visibility, metadata
  ) VALUES (
    v_new_id, v_src.title, v_state, false, v_src.quiz_content_hash, v_src.quiz_metadata, v_src.category,
    v_org, v_uid, v_uid, NULL, 'personal', v_src.metadata
  );
  RETURN jsonb_build_object('success', true, 'quiz_id', v_new_id);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END; $function$;

CREATE OR REPLACE FUNCTION education.assessment_list_match(p_created_by uuid, p_organization_id uuid, p_visibility text, p_id uuid, p_deleted_at timestamp with time zone, p_kind_row text, p_title text, p_topic text, p_description text, p_exam_type text, p_depth text, p_status text, p_kind text, p_scope text, p_org_id uuid, p_search text, p_filters jsonb, p_archived text, p_skip text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  SELECT
    (p_kind IS NULL OR p_kind_row = p_kind)
    AND (CASE p_scope
      WHEN 'mine' THEN p_created_by = (SELECT auth.uid())
      WHEN 'orgs' THEN p_created_by IS DISTINCT FROM (SELECT auth.uid())
        AND p_visibility <> 'personal'
        AND p_organization_id IN (SELECT iam.my_orgs())
        AND (p_org_id IS NULL OR p_organization_id = p_org_id)
      -- MY TEAM (T-29): my own rows in the organization plus what "orgs" admits; the caller
      -- narrows the others to my teammates once per query through iam.my_team_reach.
      WHEN 'team' THEN p_organization_id IN (SELECT iam.my_orgs())
        AND (p_org_id IS NULL OR p_organization_id = p_org_id)
        AND (p_created_by = (SELECT auth.uid()) OR p_visibility <> 'personal')
      WHEN 'shared' THEN p_created_by IS DISTINCT FROM (SELECT auth.uid())
        AND EXISTS (
          SELECT 1 FROM iam.permissions p
          WHERE p.resource_type = 'assessment' AND p.resource_id = p_id
            AND (p.granted_to_user_id = (SELECT auth.uid())
                 OR p.granted_to_organization_id IN (SELECT iam.my_orgs()))
            AND p.status <> 'rejected'
            AND (p.expires_at IS NULL OR p.expires_at > now()))
      WHEN 'public' THEN p_created_by IS DISTINCT FROM (SELECT auth.uid())
        AND p_visibility = 'public'
      ELSE false
    END)
    AND (CASE coalesce(p_archived, 'active')
      WHEN 'all' THEN true
      WHEN 'archived' THEN p_deleted_at IS NOT NULL
      ELSE p_deleted_at IS NULL
    END)
    AND (coalesce(btrim(p_search), '') = ''
      OR position(lower(btrim(p_search)) IN lower(concat_ws(' ', p_title, p_topic, p_description, p_exam_type))) > 0)
    AND education.fc_set_list_filter_ok(p_filters, 'title', p_title, p_skip)
    AND education.fc_set_list_filter_ok(p_filters, 'topic', p_topic, p_skip)
    AND education.fc_set_list_filter_ok(p_filters, 'description', p_description, p_skip)
    AND education.fc_set_list_filter_ok(p_filters, 'exam_type', p_exam_type, p_skip)
    AND education.fc_set_list_filter_ok(p_filters, 'depth', p_depth, p_skip)
    AND education.fc_set_list_filter_ok(p_filters, 'status', p_status, p_skip)
    AND education.fc_set_list_filter_ok(p_filters, 'visibility', p_visibility, p_skip)
$function$;

CREATE OR REPLACE FUNCTION education.fc_set_list_match(p_created_by uuid, p_organization_id uuid, p_visibility text, p_id uuid, p_deleted_at timestamp with time zone, p_name text, p_topic text, p_lesson text, p_description text, p_difficulty text, p_folder_ids uuid[], p_scope text, p_org_id uuid, p_search text, p_filters jsonb, p_archived text, p_skip text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  SELECT
    (CASE p_scope
      WHEN 'mine' THEN p_created_by = (SELECT auth.uid())
      WHEN 'orgs' THEN p_created_by IS DISTINCT FROM (SELECT auth.uid())
        AND p_visibility <> 'personal'
        AND p_organization_id IN (SELECT iam.my_orgs())
        AND (p_org_id IS NULL OR p_organization_id = p_org_id)
      -- MY TEAM (T-29): my own rows in the organization plus what "orgs" admits; the caller
      -- narrows the others to my teammates once per query through iam.my_team_reach.
      WHEN 'team' THEN p_organization_id IN (SELECT iam.my_orgs())
        AND (p_org_id IS NULL OR p_organization_id = p_org_id)
        AND (p_created_by = (SELECT auth.uid()) OR p_visibility <> 'personal')
      WHEN 'shared' THEN p_created_by IS DISTINCT FROM (SELECT auth.uid())
        AND EXISTS (
          SELECT 1 FROM iam.permissions p
          WHERE p.resource_type = 'fc_set' AND p.resource_id = p_id
            AND (p.granted_to_user_id = (SELECT auth.uid())
                 OR p.granted_to_organization_id IN (SELECT iam.my_orgs()))
            AND p.status <> 'rejected'
            AND (p.expires_at IS NULL OR p.expires_at > now()))
      WHEN 'public' THEN p_created_by IS DISTINCT FROM (SELECT auth.uid())
        AND p_visibility = 'public'
      ELSE false
    END)
    AND (CASE coalesce(p_archived, 'active')
      WHEN 'all' THEN true
      WHEN 'archived' THEN p_deleted_at IS NOT NULL
      ELSE p_deleted_at IS NULL
    END)
    AND (coalesce(btrim(p_search), '') = ''
      OR position(lower(btrim(p_search)) IN lower(concat_ws(' ', p_name, p_topic, p_lesson, p_description))) > 0)
    AND education.fc_set_list_filter_ok(p_filters, 'name', p_name, p_skip)
    AND education.fc_set_list_filter_ok(p_filters, 'topic', p_topic, p_skip)
    AND education.fc_set_list_filter_ok(p_filters, 'lesson', p_lesson, p_skip)
    AND education.fc_set_list_filter_ok(p_filters, 'description', p_description, p_skip)
    AND education.fc_set_list_filter_ok(p_filters, 'difficulty', p_difficulty, p_skip)
    AND education.fc_set_list_filter_ok(p_filters, 'visibility', p_visibility, p_skip)
    AND (p_skip = 'folders' OR p_filters IS NULL OR NOT (p_filters ? 'folders')
      OR jsonb_array_length(coalesce(p_filters -> 'folders' -> 'values', '[]'::jsonb)) = 0
      OR (cardinality(p_folder_ids) = 0 AND (p_filters -> 'folders' -> 'values') ? '__none__')
      OR EXISTS (SELECT 1 FROM unnest(p_folder_ids) f
                 WHERE f::text IN (SELECT jsonb_array_elements_text(p_filters -> 'folders' -> 'values'))))
$function$;
