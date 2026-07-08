-- definer_rpc_self_guard_layer2.sql
--
-- SECURITY layer 2 (follows definer_rpc_anon_grant_revoke.sql). Closes the
-- AUTHENTICATED-cross-user residual on the p_user_id SECURITY DEFINER RPCs: an
-- authenticated user (incl. an anonymous-auth guest, which carries the
-- `authenticated` role) could still pass ANOTHER user's id. Add an in-body
-- self-guard that allows only (a) the service_role admin client or (b) the
-- caller acting on their OWN id. auth.role()/auth.uid() are schema-qualified so
-- they resolve even under `SET search_path TO ''`.
--
-- Callsites verified: each of these 5 is invoked with the CALLER's own id
-- (browser authenticated self, or SSR/server authenticated self), so the guard
-- is transparent to every legitimate call and only blocks cross-user/anon.
--
-- The two server-admin-only RPCs (get_user_email_preferences, apply_usage_delta)
-- have no authenticated browser caller, so they simply drop `authenticated`
-- (no body change) — fully closed at the grant layer.
--
-- Idempotent: CREATE OR REPLACE + REVOKE.

-- ── 1. create_user_list ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_user_list(p_list_name character varying, p_description text, p_user_id uuid, p_is_public boolean, p_authenticated_read boolean DEFAULT false, p_public_read boolean DEFAULT false, p_items jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_list_id uuid;
    v_item jsonb;
    v_result jsonb;
BEGIN
    if not (auth.role() = 'service_role' or p_user_id = auth.uid()) then
      raise exception 'access denied: caller is not the target user' using errcode = '42501';
    end if;
    INSERT INTO workbench.udt_picklists (
        list_name, description, user_id, is_public, public_read
    )
    VALUES (p_list_name, p_description, p_user_id, p_is_public, p_public_read)
    RETURNING id INTO v_list_id;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        INSERT INTO workbench.udt_picklist_items (
            label, description, help_text, group_name,
            user_id, is_public, public_read, list_id
        )
        VALUES (
            v_item->>'Label', v_item->>'Description', v_item->>'Help Text', v_item->>'Group',
            p_user_id, p_is_public, p_public_read, v_list_id
        );
    END LOOP;

    SELECT jsonb_build_object(
        'list_id', l.id, 'list_name', l.list_name, 'description', l.description,
        'items', (
            SELECT jsonb_agg(jsonb_build_object(
                'id', i.id, 'label', i.label, 'description', i.description,
                'help_text', i.help_text, 'group_name', i.group_name
            ))
            FROM workbench.udt_picklist_items i WHERE i.list_id = l.id
        )
    )
    INTO v_result
    FROM workbench.udt_picklists l
    WHERE l.id = v_list_id;

    RETURN v_result;
END;
$function$;

-- ── 2. cx_canvas_save_user_version ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cx_canvas_save_user_version(p_user_id uuid, p_canvas_id uuid, p_title text, p_content jsonb)
 RETURNS canvas.canvas_items
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_orig canvas.canvas_items;
  v_new canvas.canvas_items;
  v_root uuid;
  v_next integer;
BEGIN
  if not (auth.role() = 'service_role' or p_user_id = auth.uid()) then
    raise exception 'access denied: caller is not the target user' using errcode = '42501';
  end if;
  SELECT * INTO v_orig
  FROM canvas.canvas_items
  WHERE id = p_canvas_id AND user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'canvas item % not found or not owned by user', p_canvas_id;
  END IF;

  v_root := COALESCE(v_orig.parent_canvas_id, v_orig.id);

  -- Serialize concurrent version bumps on the same chain.
  PERFORM 1 FROM canvas.canvas_items WHERE id = v_root FOR UPDATE;

  SELECT COALESCE(MAX(version), v_orig.version) + 1 INTO v_next
  FROM canvas.canvas_items
  WHERE id = v_root OR parent_canvas_id = v_root;

  INSERT INTO canvas.canvas_items
    (user_id, type, title, content, conversation_id,
     source_message_id, artifact_index, version, parent_canvas_id, source_type)
  VALUES
    (p_user_id, v_orig.type, COALESCE(p_title, v_orig.title), p_content,
     v_orig.conversation_id, NULL, NULL, v_next, v_root, 'user_created')
  RETURNING * INTO v_new;

  RETURN v_new;
END;
$function$;

-- ── 3. get_conversations_for_user ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_conversations_for_user(p_user_id uuid)
 RETURNS TABLE(conversation_id uuid, conversation_name text, conversation_avatar_url text, conversation_type text, conversation_updated_at timestamp with time zone, is_muted boolean, is_pinned boolean, last_message_id uuid, last_message_content text, last_message_created_at timestamp with time zone, last_message_sender_id uuid, last_message_sender_name text, last_message_type text, unread_count bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  if not (auth.role() = 'service_role' or p_user_id = auth.uid()) then
    raise exception 'access denied: caller is not the target user' using errcode = '42501';
  end if;
  RETURN QUERY
  SELECT
    c.id AS conversation_id,
    CASE
      WHEN c.type = 'direct' THEN other_profile.display_name
      ELSE c.name
    END AS conversation_name,
    CASE
      WHEN c.type = 'direct' THEN other_profile.avatar_url
      ELSE c.avatar_url
    END AS conversation_avatar_url,
    c.type AS conversation_type,
    c.updated_at AS conversation_updated_at,
    cp.is_muted,
    cp.is_pinned,
    last_msg.id AS last_message_id,
    last_msg.content AS last_message_content,
    last_msg.created_at AS last_message_created_at,
    last_msg.sender_id AS last_message_sender_id,
    last_msg_sender.display_name AS last_message_sender_name,
    last_msg.type AS last_message_type,
    COALESCE(
      (
        SELECT count(*)
        FROM public.messages m
        WHERE m.conversation_id = c.id
          AND m.created_at > COALESCE(
            (SELECT mm.created_at FROM public.messages mm WHERE mm.id = cp.last_read_message_id),
            cp.joined_at
          )
          AND m.sender_id != p_user_id
          AND m.is_deleted = false
      ),
      0
    )::bigint AS unread_count
  FROM public.conversation_participants cp
  JOIN public.conversations c ON c.id = cp.conversation_id
  LEFT JOIN LATERAL (
    SELECT p.display_name, p.avatar_url
    FROM public.conversation_participants ocp
    JOIN public.profiles p ON p.id = ocp.user_id
    WHERE ocp.conversation_id = c.id
      AND ocp.user_id != p_user_id
    LIMIT 1
  ) other_profile ON c.type = 'direct'
  LEFT JOIN LATERAL (
    SELECT m.id, m.content, m.created_at, m.sender_id, m.type
    FROM public.messages m
    WHERE m.conversation_id = c.id AND m.is_deleted = false
    ORDER BY m.created_at DESC
    LIMIT 1
  ) last_msg ON true
  LEFT JOIN public.profiles last_msg_sender ON last_msg_sender.id = last_msg.sender_id
  WHERE cp.user_id = p_user_id
  ORDER BY COALESCE(last_msg.created_at, c.updated_at) DESC;
END;
$function$;

-- ── 4. get_dm_conversations_with_details ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_dm_conversations_with_details(p_user_id uuid)
 RETURNS TABLE(conversation_id uuid, conversation_type text, group_name text, group_image_url text, conversation_created_at timestamp with time zone, conversation_updated_at timestamp with time zone, last_message_content text, last_message_sender_id uuid, last_message_at timestamp with time zone, unread_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'communication'
AS $function$
BEGIN
  if not (auth.role() = 'service_role' or p_user_id = auth.uid()) then
    raise exception 'access denied: caller is not the target user' using errcode = '42501';
  end if;
  RETURN QUERY
  SELECT
    c.id AS conversation_id,
    c.type AS conversation_type,
    c.group_name,
    c.group_image_url,
    c.created_at AS conversation_created_at,
    c.updated_at AS conversation_updated_at,
    m.content AS last_message_content,
    m.sender_id AS last_message_sender_id,
    m.msg_created_at AS last_message_at,
    get_dm_unread_count(c.id, p_user_id) AS unread_count
  FROM communication.dm_conversations c
  JOIN communication.dm_conversation_participants cp ON cp.conversation_id = c.id
  LEFT JOIN LATERAL (
    SELECT
      dm.content,
      dm.sender_id,
      dm.created_at AS msg_created_at
    FROM communication.dm_messages dm
    WHERE dm.conversation_id = c.id
    AND dm.deleted_at IS NULL
    ORDER BY dm.created_at DESC
    LIMIT 1
  ) m ON true
  WHERE cp.user_id = p_user_id
  AND cp.is_archived = false
  ORDER BY COALESCE(m.msg_created_at, c.updated_at) DESC;
END;
$function$;

-- ── 5. get_user_session_data ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_user_session_data(p_user_id uuid)
 RETURNS TABLE(is_admin boolean, preferences jsonb, preferences_exists boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
  if not (auth.role() = 'service_role' or p_user_id = auth.uid()) then
    raise exception 'access denied: caller is not the target user' using errcode = '42501';
  end if;
  return query
  select
    exists(select 1 from admin.admins where user_id = p_user_id) as is_admin,
    coalesce(up.preferences, '{}'::jsonb) as preferences,
    (up.user_id is not null) as preferences_exists
  from
    (select p_user_id as uid) as user_check
  left join users.user_preferences up on up.user_id = user_check.uid;
end;
$function$;

-- ── 6. get_user_email_preferences: server-admin-only caller (createAdminClient
--       in app/api/user/email-preferences/route.ts) — drop authenticated, no
--       body change. (apply_usage_delta is intentionally NOT touched here: it
--       has no FE caller and may be driven by a trigger in the authenticated
--       user's context, so revoking `authenticated` risks breaking upload quota
--       accounting; its authenticated-cross-user residual is escalated instead.)
revoke execute on function public.get_user_email_preferences(p_user_id uuid) from authenticated;
