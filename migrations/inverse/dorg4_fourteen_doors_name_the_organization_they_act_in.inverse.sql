-- DEFAULT-ORG-4 inverse — puts the fourteen non-creation doors BACK to answering
-- "which organization?" with the caller's own personal workspace.
--
-- Running this restores every one of them exactly as it stood on the main database on
-- 2026-09-22 before
-- migrations/campaign/dorg4_fourteen_doors_name_the_organization_they_act_in.sql:
--   * access_request_create files a request about somebody else's record in the
--     REQUESTER's private workspace, where the people who could grant it never see it;
--   * setting_access_request_create does the same for a setting request addressed to an
--     organization's owners;
--   * ctx_projects_add_creator_membership gives a project's creator an ownership
--     membership in their own workspace when the project row carries no organization;
--   * dm_get_or_create_direct_conversation files a conversation between two colleagues in
--     one of their private workspaces whenever the caller omits the argument;
--   * the four fork doors copy somebody's work into a workspace they never chose (and the
--     three-argument arities and their door rows are removed);
--   * the three users.profiles satellites invent a workspace for an account whose profile
--     row is missing, instead of saying so;
--   * transfer_guest_data_to_user creates a personal organization for a converted account
--     and moves real rows into it;
--   * the two workspace-task doors file a person's task where their team cannot see it.
-- That is the shape `pnpm check:no-default-organization-sql` names (rule 7) and the shape
-- its census clause goes red on, so this file re-breaks a guard on purpose.
--
-- Only run it to undo a change that broke something worse, and say what.

-- ground-standing-ok: c
-- Clause (c) asks whether `public.ctx_projects_add_creator_membership` is a trigger body
-- nothing runs. MEASURED ON THE CLONE AND ON THE MAIN DATABASE 2026-09-22: it IS run, by
--   trigger `trg_ctx_projects_add_creator_membership` on `workspace.projects`
-- (the guard looks for the trigger under the function's own `ctx_*` naming, and this one
-- lives on a `workspace.*` table, so it does not find it). Restoring the body therefore
-- restores a body a live trigger calls, which is exactly what an inverse is for.

-- The bodies this file OVERWRITES are the ones the forward migration installed, so these
-- hashes are of the POST-change bodies, measured on the dev clone right after leg 1.
-- based-on: public.access_request_create(text, uuid, text, text) 97e326d520ec2eb478976c2a830048dd1974e2434d17797ffc0a425a87d65d72
-- based-on: public.ctx_projects_add_creator_membership() 449d9d3530e2ddfb9f62351c76b1d08e21a0fb413e520175d8e5ae5e00224b75
-- based-on: public.dm_get_or_create_direct_conversation(uuid, uuid, uuid) 485c921bacacfd103397a5421e0e701e3f5b3d40b72fdfa1f18c71fe4886c23f
-- based-on: public.fork_processed_document(uuid) 0d0cc413dff949a594ca2804d7485b6a7e84bbfcb03ed217ae7c02349d5e87c2
-- based-on: public.fork_shared_conversation(uuid, text) a6b2ef1e33742f658252a510ce674b53081b657d1d5586432631c3500355f19a
-- based-on: public.fork_shared_flashcard_set(uuid, text) 3506969cae25e88fb5fa3a692ce9e6678eb4a7e5562eb841f08dd7966ca1a010
-- based-on: public.fork_shared_quiz(uuid, text) 7b56ac11be0c30960371e841f71b95036b60eeec158feb6192e35ba363cbca87
-- based-on: public.get_user_email_preferences(uuid) e34c108e7f383cb95f0a543772178f116dd4900eaf1a4b88ea9118af487ef70a
-- based-on: public.setting_access_request_create(uuid, text, text, text, text, jsonb, text) 9d6deaf25b37728fa86c630c7d024459f219d7834d7a6439a732453c9b2ffabb
-- based-on: public.transfer_guest_data_to_user(uuid, uuid, text) d511a7fb7d5f35124708f3ad1501e7ff95fa2b09cf6a5c5e8b1d57e7338137c9
-- based-on: public.user_form_profile_append_to_array(uuid, text, jsonb) d35a464095cd25f534a59277c57404728fc6307c327cd26fb0baf2158bf7a295
-- based-on: public.user_form_profile_set_custom_field(uuid, text, jsonb) 04aa40b09daaaa6dc75fbb8f5fc4c04c9e83a500d3521212fd966c2702c55848
-- based-on: public.wsp_resolve_system_task(text, text, uuid) 5a0f445f551127a1686d11567639ba686b9345021363e1e2f9ab4cb28f9efb80
-- based-on: public.wsp_upsert_system_task(text, text, text, text, text, text, text, text, date, text, uuid, uuid, uuid, jsonb) b84e71ac2f515f1b8134a82e8d9074ccc47e4154f5991566e85dfaf705476af5

set local lock_timeout = '2s';


-- access_request_create(text, uuid, text, text) — as it stood before DEFAULT-ORG-4
CREATE OR REPLACE FUNCTION public.access_request_create(p_resource_type text, p_resource_id uuid, p_level text DEFAULT 'viewer'::text, p_message text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'platform', 'iam'
AS $function$
declare
  v_uid uuid := (select auth.uid());
  v_command text := coalesce(nullif(p_level, ''), 'viewer');
  v_level text;
  v_kind text := 'resource_access';
  v_request_key text := '';
  v_meta record;
  v_attrs record;
  v_existing record;
  v_org uuid;
  v_id uuid;
  v_recent int;
  v_recipients jsonb;
  v_recipient_ids jsonb;
  v_payload jsonb := '{}'::jsonb;
  v_upgraded boolean := false;
begin
  if v_uid is null then
    raise exception 'Sign in to request access.' using errcode = '42501';
  end if;

  if v_command = 'delete' then
    v_kind := 'resource_action';
    v_request_key := 'delete';
    v_level := 'admin';
  elsif v_command in ('viewer', 'commenter', 'editor', 'admin') then
    v_level := v_command;
  else
    v_level := 'viewer';
  end if;

  select et.schema_name, et.table_name, et.label into v_meta
  from platform.entity_types et
  where et.token = p_resource_type and coalesce(et.is_active, true);

  if v_meta.schema_name is null then
    raise exception 'We could not identify what you are asking for.'
      using errcode = '22023';
  end if;

  select * into v_attrs
  from platform.entity_row_access_attrs(v_meta.schema_name, v_meta.table_name, p_resource_id);

  if not coalesce(v_attrs.o_found, false) then
    raise exception 'That % no longer exists.', lower(coalesce(v_meta.label, 'item'))
      using errcode = '02000';
  end if;

  if v_kind = 'resource_action' then
    if not iam.has_access(p_resource_type, p_resource_id, 'editor'::public.permission_level) then
      raise exception 'You need edit access before asking the owner to delete this %.',
        lower(coalesce(v_meta.label, 'item')) using errcode = '42501';
    end if;
    if iam.has_access(p_resource_type, p_resource_id, 'admin'::public.permission_level) then
      raise exception 'You already have full access to this %.',
        lower(coalesce(v_meta.label, 'item')) using errcode = '23505';
    end if;
  elsif iam.has_access(p_resource_type, p_resource_id, v_level::public.permission_level) then
    raise exception 'You already have the access you requested for this %.',
      lower(coalesce(v_meta.label, 'item')) using errcode = '23505';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'user_id', r.user_id,
           'reason', r.reason,
           'display_name', nullif(pr.display_name, '')
         )), '[]'::jsonb),
         coalesce(jsonb_agg(to_jsonb(r.user_id::text)), '[]'::jsonb)
    into v_recipients, v_recipient_ids
  from iam.access_request_recipients(p_resource_type, p_resource_id) r
  left join users.profiles pr on pr.id = r.user_id;

  if v_recipients = '[]'::jsonb then
    raise exception 'There is nobody who can grant access to this %.',
      lower(coalesce(v_meta.label, 'item')) using errcode = '42501';
  end if;

  if v_kind = 'resource_action' then
    v_payload := jsonb_build_object(
      'action_key', 'delete',
      'action_label', 'Delete ' || coalesce(v_meta.label, 'item'),
      'entity_label', v_meta.label,
      'entity_title', platform.entity_title(p_resource_type, p_resource_id),
      'recipient_ids', v_recipient_ids
    );
  end if;

  select ar.id, ar.status, ar.request_kind, ar.requested_level, ar.request_key
    into v_existing
  from iam.access_requests ar
  where ar.resource_type = p_resource_type
    and ar.resource_id = p_resource_id
    and ar.created_by = v_uid
    and ar.deleted_at is null
  order by ar.created_at desc
  limit 1;

  if v_existing.status = 'pending' then
    v_upgraded := v_existing.request_kind is distinct from v_kind
      or v_existing.requested_level is distinct from v_level
      or coalesce(v_existing.request_key, '') is distinct from v_request_key;
    if v_upgraded then
      update iam.access_requests
         set request_kind = v_kind,
             request_key = v_request_key,
             request_payload = v_payload,
             requested_level = v_level,
             message = nullif(btrim(p_message), ''),
             updated_at = now(),
             updated_by = v_uid
       where id = v_existing.id;
    end if;
    return jsonb_build_object(
      'request_id', v_existing.id,
      'status', 'pending',
      'already', not v_upgraded,
      'level', v_level,
      'request_kind', v_kind,
      'action_key', nullif(v_request_key, ''),
      'entity_label', v_meta.label,
      'entity_title', platform.entity_title(p_resource_type, p_resource_id),
      'recipients', case when v_upgraded then v_recipients else '[]'::jsonb end
    );
  end if;
  if v_existing.status = 'reported' then
    raise exception 'You can no longer make requests about this %.',
      lower(coalesce(v_meta.label, 'item')) using errcode = '42501';
  end if;

  select count(*) into v_recent
  from iam.access_requests ar
  where ar.created_by = v_uid
    and ar.created_at > now() - interval '1 day'
    and ar.deleted_at is null;
  if v_recent >= 25 then
    raise exception 'You have sent a lot of access requests today. Try again tomorrow.'
      using errcode = '54000';
  end if;

  v_org := public.current_personal_org_id();

  begin
    insert into iam.access_requests
      (organization_id, created_by, resource_type, resource_id, requested_level,
       message, request_kind, request_key, request_payload)
    values
      (v_org, v_uid, p_resource_type, p_resource_id, v_level,
       nullif(btrim(p_message), ''), v_kind, v_request_key, v_payload)
    returning id into v_id;
  exception when unique_violation then
    select ar.id into v_id
    from iam.access_requests ar
    where ar.resource_type = p_resource_type
      and ar.resource_id = p_resource_id
      and ar.created_by = v_uid
      and ar.status = 'pending'
      and ar.deleted_at is null
    limit 1;
    return jsonb_build_object('request_id', v_id, 'status', 'pending',
                              'already', true, 'level', v_level,
                              'request_kind', v_kind, 'recipients', '[]'::jsonb);
  end;

  return jsonb_build_object(
    'request_id', v_id,
    'status', 'pending',
    'already', false,
    'level', v_level,
    'request_kind', v_kind,
    'action_key', nullif(v_request_key, ''),
    'entity_label', v_meta.label,
    'entity_title', platform.entity_title(p_resource_type, p_resource_id),
    'recipients', v_recipients
  );
end;
$function$
;

-- setting_access_request_create(uuid, text, text, text, text, jsonb, text) — as it stood before DEFAULT-ORG-4
CREATE OR REPLACE FUNCTION public.setting_access_request_create(p_org_id uuid, p_setting_key text, p_setting_label text, p_setting_href text, p_action_key text, p_action_payload jsonb DEFAULT '{}'::jsonb, p_message text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'platform', 'iam', 'users'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_personal_org uuid;
  v_id uuid;
  v_existing uuid;
  v_recipients jsonb;
  v_request_key text;
begin
  if v_uid is null then
    raise exception 'Sign in first.' using errcode='42501';
  end if;
  if not exists (
    select 1 from iam.organization_member
    where organization_id=p_org_id and user_id=v_uid
  ) then
    raise exception 'You are not a member of this organization.' using errcode='42501';
  end if;
  if exists (
    select 1 from iam.organization_member
    where organization_id=p_org_id and user_id=v_uid and role in ('owner','admin')
  ) then
    raise exception 'You can change this setting yourself.' using errcode='23505';
  end if;
  if nullif(btrim(p_setting_key),'') is null
     or nullif(btrim(p_setting_label),'') is null
     or nullif(btrim(p_action_key),'') is null then
    raise exception 'The setting request is incomplete.' using errcode='22023';
  end if;
  if length(btrim(p_setting_key)) > 200
     or length(btrim(p_setting_label)) > 160
     or length(btrim(p_action_key)) > 160 then
    raise exception 'The setting request is too long.' using errcode='22023';
  end if;
  if p_setting_href is null
     or length(p_setting_href) > 1000
     or p_setting_href !~ '^/organizations/[^/]+/settings' then
    raise exception 'The setting link is not valid.' using errcode='22023';
  end if;
  if pg_column_size(coalesce(p_action_payload,'{}'::jsonb)) > 8192 then
    raise exception 'The setting request is too large.' using errcode='22023';
  end if;

  v_request_key := btrim(p_setting_key) || ':' ||
    md5(coalesce(p_action_payload,'{}'::jsonb)::text);

  select ar.id into v_existing
  from iam.access_requests ar
  where ar.request_kind='setting'
    and ar.resource_type='organization'
    and ar.resource_id=p_org_id
    and ar.created_by=v_uid
    and ar.request_key=v_request_key
    and ar.status='pending'
    and ar.deleted_at is null
  limit 1;

  if v_existing is not null then
    return jsonb_build_object(
      'request_id',v_existing,
      'status','pending',
      'already',true,
      'recipients','[]'::jsonb
    );
  end if;

  v_personal_org := public.current_personal_org_id();
  insert into iam.access_requests(
    organization_id,created_by,resource_type,resource_id,requested_level,message,
    request_kind,request_key,request_payload
  )
  values(
    v_personal_org,v_uid,'organization',p_org_id,'viewer',nullif(btrim(p_message),''),
    'setting',v_request_key,jsonb_build_object(
      'setting_label',btrim(p_setting_label),
      'href',p_setting_href,
      'action_key',btrim(p_action_key),
      'action_payload',coalesce(p_action_payload,'{}'::jsonb)
    )
  )
  returning id into v_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'user_id',m.user_id,
        'display_name',nullif(pr.display_name,''),
        'role',m.role
      )
      order by case m.role when 'owner' then 0 else 1 end,pr.display_name
    ),
    '[]'::jsonb
  )
  into v_recipients
  from iam.organization_member m
  left join users.profiles pr on pr.id=m.user_id
  where m.organization_id=p_org_id
    and m.role in ('owner','admin')
    and m.user_id<>v_uid;

  return jsonb_build_object(
    'request_id',v_id,
    'status','pending',
    'already',false,
    'recipients',v_recipients,
    'setting_label',btrim(p_setting_label)
  );
end;
$function$
;

-- ctx_projects_add_creator_membership() — as it stood before DEFAULT-ORG-4
CREATE OR REPLACE FUNCTION public.ctx_projects_add_creator_membership()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if NEW.created_by is not null then
    insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status, created_by, updated_by)
    values (coalesce(NEW.organization_id, public.ensure_personal_organization(NEW.created_by)),
            'project', NEW.id, NEW.created_by, 'owner', 'active', NEW.created_by, NEW.created_by)
    on conflict (container_type, container_id, user_id) do nothing;
  end if;
  return NEW;
end $function$
;

-- dm_get_or_create_direct_conversation(uuid, uuid, uuid) — as it stood before DEFAULT-ORG-4
CREATE OR REPLACE FUNCTION public.dm_get_or_create_direct_conversation(p_user1_id uuid, p_user2_id uuid, p_organization_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'communication'
AS $function$
DECLARE
  v_conv uuid;
  v_org  uuid;
BEGIN
  IF p_user1_id IS NULL OR p_user2_id IS NULL THEN
    RAISE EXCEPTION 'both user ids are required';
  END IF;
  IF p_user1_id = p_user2_id THEN
    RAISE EXCEPTION 'cannot create a direct conversation with oneself';
  END IF;

  IF ( SELECT auth.uid()) IS NOT NULL AND p_user1_id <> ( SELECT auth.uid()) THEN
    RAISE EXCEPTION 'p_user1_id must be the calling user';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      least(p_user1_id, p_user2_id)::text || ':' ||
      greatest(p_user1_id, p_user2_id)::text,
      0
    )
  );

  SELECT c.id
    INTO v_conv
  FROM communication.dm_conversations c
  WHERE c.type = 'direct'
    AND c.deleted_at IS NULL
    AND EXISTS (
      SELECT 1 FROM communication.dm_conversation_participants p
      WHERE p.conversation_id = c.id AND p.user_id = p_user1_id
    )
    AND EXISTS (
      SELECT 1 FROM communication.dm_conversation_participants p
      WHERE p.conversation_id = c.id AND p.user_id = p_user2_id
    )
    AND (
      SELECT count(*) FROM communication.dm_conversation_participants p
      WHERE p.conversation_id = c.id
    ) = 2
  ORDER BY c.created_at ASC
  LIMIT 1;

  IF v_conv IS NOT NULL THEN
    RETURN v_conv;
  END IF;

  v_org := COALESCE(p_organization_id, public.ensure_personal_organization(p_user1_id));
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'could not resolve an organization for the conversation';
  END IF;
  -- A CONVERSATION LANDS IN A TENANT THE CALLER BELONGS TO (0850). Proven live: the
  -- non-member test account created a direct conversation stamped with
  -- "Castellano & Reyes, LLP" as its organization. An organization the caller cannot
  -- reach and an organization that does not exist now answer identically. The server
  -- lane, which carries no identity, is unchanged.
  IF iam.is_client_lane() AND NOT iam.has_org_access(v_org) THEN
    RAISE EXCEPTION 'dm_organization_denied: no access to that organization'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO communication.dm_conversations (type, created_by, organization_id)
  VALUES ('direct', p_user1_id, v_org)
  RETURNING id INTO v_conv;

  INSERT INTO communication.dm_conversation_participants
    (conversation_id, user_id, role, organization_id)
  VALUES
    (v_conv, p_user1_id, 'owner',  v_org),
    (v_conv, p_user2_id, 'member', v_org);

  RETURN v_conv;
END;
$function$
;

-- fork_processed_document(uuid) — as it stood before DEFAULT-ORG-4
CREATE OR REPLACE FUNCTION public.fork_processed_document(p_source_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_org  uuid;
  v_new  uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  IF NOT public.can_read_processed_document(p_source_id, v_user) THEN
    RAISE EXCEPTION 'not permitted to read source document %', p_source_id USING ERRCODE = '42501';
  END IF;

  SELECT id INTO v_new
  FROM docproc.processed_documents
  WHERE owner_id = v_user AND parent_processed_id = p_source_id AND derivation_kind = 'user_fork'
  LIMIT 1;
  IF v_new IS NOT NULL THEN RETURN v_new; END IF;

  v_org := public.ensure_personal_organization(v_user);

  INSERT INTO docproc.processed_documents (
    organization_id, owner_id, source_kind, source_id, parent_processed_id,
    derivation_kind, derivation_metadata, name, mime_type, total_pages,
    source_hash, storage_uri, content, clean_content, structured_json, metadata,
    file_content_hash, extractor_name, extractor_version, cleaner_name, cleaner_version, rag_boost
  )
  SELECT
    v_org, v_user, source_kind, source_id, p_source_id,
    'user_fork', jsonb_build_object('forked_from', p_source_id, 'forked_by', v_user),
    name || ' (my copy)', mime_type, total_pages,
    source_hash, storage_uri, content, clean_content, structured_json,
    COALESCE(metadata, '{}'::jsonb), file_content_hash, extractor_name,
    extractor_version, cleaner_name, cleaner_version, 0
  FROM docproc.processed_documents WHERE id = p_source_id
  RETURNING id INTO v_new;

  INSERT INTO docproc.processed_document_pages (
    processed_document_id, page_index, page_number, width, height, rotation,
    raw_text, raw_char_count, extraction_method, blocks, words, cleaned_text,
    cleaned_char_count, section_kind, section_title, section_subtype,
    is_continuation, used_ocr, extraction_confidence, image_cld_file_id, image_dpi, metadata
  )
  SELECT
    v_new, page_index, page_number, width, height, rotation,
    raw_text, raw_char_count, extraction_method, blocks, words, cleaned_text,
    cleaned_char_count, section_kind, section_title, section_subtype,
    is_continuation, used_ocr, extraction_confidence, image_cld_file_id, image_dpi, metadata
  FROM docproc.processed_document_pages WHERE processed_document_id = p_source_id;

  RETURN v_new;
END;
$function$
;

-- fork_shared_conversation(uuid, text) — as it stood before DEFAULT-ORG-4
CREATE OR REPLACE FUNCTION public.fork_shared_conversation(p_conversation_id uuid, p_token text DEFAULT NULL::text)
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
END; $function$
;

-- fork_shared_flashcard_set(uuid, text) — as it stood before DEFAULT-ORG-4
CREATE OR REPLACE FUNCTION public.fork_shared_flashcard_set(p_set_id uuid, p_token text DEFAULT NULL::text)
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
END; $function$
;

-- fork_shared_quiz(uuid, text) — as it stood before DEFAULT-ORG-4
CREATE OR REPLACE FUNCTION public.fork_shared_quiz(p_quiz_id uuid, p_token text DEFAULT NULL::text)
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

  SELECT COALESCE(is_link_shareable, false) INTO v_shareable FROM platform.shareable_resource_registry WHERE resource_type='quiz_session';
  v_shared := COALESCE(v_shareable,false) AND (
       v_src.visibility IN ('public','link')
    OR (p_token IS NOT NULL AND public.share_link_authorizes(p_token, 'quiz_session', p_quiz_id))
    OR iam.has_access('quiz_session', p_quiz_id, 'viewer'));
  IF NOT v_shared THEN RETURN jsonb_build_object('success', false, 'error', 'This quiz is not shared'); END IF;

  v_org := public.ensure_personal_organization(v_uid);

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
END; $function$
;

-- get_user_email_preferences(uuid) — as it stood before DEFAULT-ORG-4
CREATE OR REPLACE FUNCTION public.get_user_email_preferences(p_user_id uuid)
 RETURNS users.user_email_preferences
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_preferences users.user_email_preferences;
  v_org uuid;
BEGIN
  SELECT * INTO v_preferences
  FROM users.user_email_preferences
  WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    -- PARENT ROW: users.user_email_preferences is a 1:1 satellite of
    -- users.profiles for the same user — it carries that same user's own
    -- organization_id, never a resolver's choice. Falls back to
    -- ensure_personal_organization only if the profile row itself is
    -- somehow missing (signup provisioning failure self-heal, same as
    -- public._provision_new_user_profile / creator_claim_handle).
    SELECT organization_id INTO v_org FROM users.profiles WHERE id = p_user_id;
    IF v_org IS NULL THEN
      v_org := public.ensure_personal_organization(p_user_id);
    END IF;

    INSERT INTO users.user_email_preferences (user_id, organization_id)
    VALUES (p_user_id, v_org)
    RETURNING * INTO v_preferences;
  END IF;

  RETURN v_preferences;
END;
$function$
;

-- user_form_profile_append_to_array(uuid, text, jsonb) — as it stood before DEFAULT-ORG-4
CREATE OR REPLACE FUNCTION public.user_form_profile_append_to_array(p_user_id uuid, p_column text, p_item jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_sql    text;
  v_result jsonb;
  v_org    uuid;
BEGIN
  IF p_user_id IS DISTINCT FROM auth.uid() AND auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'permission denied' USING ERRCODE = '42501';
  END IF;

  IF p_column NOT IN ('phones','emails','social_handles','emergency_contacts','images') THEN
    RAISE EXCEPTION 'Invalid column name: %', p_column;
  END IF;

  -- PARENT ROW: users.user_form_profile is a 1:1 satellite of
  -- users.profiles for the same user — it carries that same user's own
  -- organization_id, never a resolver's choice. Falls back to
  -- ensure_personal_organization only if the profile row itself is
  -- somehow missing (signup provisioning failure self-heal).
  SELECT organization_id INTO v_org FROM users.profiles WHERE id = p_user_id;
  IF v_org IS NULL THEN
    v_org := public.ensure_personal_organization(p_user_id);
  END IF;

  -- Idempotent ensure-row
  INSERT INTO users.user_form_profile (user_id, organization_id) VALUES (p_user_id, v_org)
  ON CONFLICT (user_id) DO NOTHING;

  v_sql := format(
    'UPDATE users.user_form_profile SET %1$I = COALESCE(%1$I, ''[]''::jsonb) || $1::jsonb
     WHERE user_id = $2 RETURNING %1$I',
    p_column
  );

  EXECUTE v_sql INTO v_result USING jsonb_build_array(p_item), p_user_id;
  RETURN v_result;
END;
$function$
;

-- user_form_profile_set_custom_field(uuid, text, jsonb) — as it stood before DEFAULT-ORG-4
CREATE OR REPLACE FUNCTION public.user_form_profile_set_custom_field(p_user_id uuid, p_key text, p_value jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
  v_org    uuid;
BEGIN
  IF p_user_id IS DISTINCT FROM auth.uid() AND auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'permission denied' USING ERRCODE = '42501';
  END IF;

  -- PARENT ROW: users.user_form_profile is a 1:1 satellite of
  -- users.profiles for the same user — it carries that same user's own
  -- organization_id, never a resolver's choice. Falls back to
  -- ensure_personal_organization only if the profile row itself is
  -- somehow missing (signup provisioning failure self-heal).
  SELECT organization_id INTO v_org FROM users.profiles WHERE id = p_user_id;
  IF v_org IS NULL THEN
    v_org := public.ensure_personal_organization(p_user_id);
  END IF;

  INSERT INTO users.user_form_profile (user_id, organization_id, custom_fields)
  VALUES (p_user_id, v_org, jsonb_build_object(p_key, p_value))
  ON CONFLICT (user_id) DO UPDATE
    SET custom_fields = users.user_form_profile.custom_fields || jsonb_build_object(p_key, p_value)
  RETURNING custom_fields INTO v_result;

  RETURN v_result;
END;
$function$
;

-- transfer_guest_data_to_user(uuid, uuid, text) — as it stood before DEFAULT-ORG-4
CREATE OR REPLACE FUNCTION public.transfer_guest_data_to_user(p_anon_user_id uuid, p_new_user_id uuid, p_fingerprint text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_anon_is_anonymous boolean;
  v_new_is_anonymous boolean;
  v_target_personal_org uuid;
  v_source_personal_org record;
  v_col record;
  v_count bigint;
  v_total bigint := 0;
  v_transferred jsonb := '{}'::jsonb;
  v_skipped jsonb := '{}'::jsonb;
  v_key text;
  v_guest_row_id uuid;
begin
  if p_anon_user_id is null or p_new_user_id is null then
    return jsonb_build_object('status', 'error', 'message', 'both user ids are required');
  end if;
  if p_anon_user_id = p_new_user_id then
    return jsonb_build_object('status', 'noop', 'message', 'source and target are the same user');
  end if;

  select is_anonymous into v_anon_is_anonymous from auth.users where id = p_anon_user_id;
  if v_anon_is_anonymous is null then
    return jsonb_build_object('status', 'error', 'message', 'anon user not found');
  end if;
  if v_anon_is_anonymous is not true then
    return jsonb_build_object('status', 'error', 'message', 'source user is not anonymous');
  end if;
  select is_anonymous into v_new_is_anonymous from auth.users where id = p_new_user_id;
  if v_new_is_anonymous is null then
    return jsonb_build_object('status', 'error', 'message', 'target user not found');
  end if;
  if v_new_is_anonymous is true then
    return jsonb_build_object('status', 'error', 'message', 'target user is anonymous');
  end if;

  select id into v_guest_row_id from users.guest_executions
  where auth_user_id = p_anon_user_id for update;

  -- A permanent user owns exactly one personal organization. Guest-created
  -- rows move there; the guest organization and membership stay with guest.
  v_target_personal_org := public.ensure_personal_organization(p_new_user_id);
  for v_source_personal_org in
    select id from iam.organizations
    where created_by = p_anon_user_id and is_personal is true
    order by created_at
  loop
    for v_col in
      select n.nspname as sch, cl.relname as tbl, a.attname as col
      from pg_constraint con
      join pg_class cl on cl.oid = con.conrelid
      join pg_namespace n on n.oid = cl.relnamespace
      join pg_class ref on ref.oid = con.confrelid
      join pg_namespace refn on refn.oid = ref.relnamespace
      join unnest(con.conkey) as ck(attnum) on true
      join pg_attribute a on a.attrelid = cl.oid and a.attnum = ck.attnum
      where con.contype = 'f'
        and refn.nspname = 'iam' and ref.relname = 'organizations'
        and not (n.nspname = 'iam' and cl.relname = 'memberships')
        and n.nspname not in (
          'auth', 'storage', 'graveyard', 'realtime', 'vault', 'extensions',
          'pgsodium', 'supabase_functions'
        )
      order by n.nspname, cl.relname, a.attname
    loop
      v_key := format('personal_org.%s.%s.%s', v_col.sch, v_col.tbl, v_col.col);
      begin
        execute format(
          'update %I.%I set %I = $1 where %I = $2',
          v_col.sch, v_col.tbl, v_col.col, v_col.col
        ) using v_target_personal_org, v_source_personal_org.id;
        get diagnostics v_count = row_count;
        if v_count > 0 then
          v_transferred := v_transferred || jsonb_build_object(v_key, v_count);
          v_total := v_total + v_count;
        end if;
      exception when others then
        v_skipped := v_skipped || jsonb_build_object(v_key, sqlerrm);
      end;
    end loop;

    begin
      update platform.associations set source_id = v_target_personal_org
      where source_type = 'organization' and source_id = v_source_personal_org.id;
      get diagnostics v_count = row_count;
      if v_count > 0 then
        v_key := 'personal_org.platform.associations.source_id';
        v_transferred := v_transferred || jsonb_build_object(v_key, v_count);
        v_total := v_total + v_count;
      end if;
      update platform.associations set target_id = v_target_personal_org
      where target_type = 'organization' and target_id = v_source_personal_org.id;
      get diagnostics v_count = row_count;
      if v_count > 0 then
        v_key := 'personal_org.platform.associations.target_id';
        v_transferred := v_transferred || jsonb_build_object(v_key, v_count);
        v_total := v_total + v_count;
      end if;
    exception when others then
      v_skipped := v_skipped || jsonb_build_object(
        'personal_org.platform.associations', sqlerrm
      );
    end;
  end loop;

  -- Transfer every ordinary auth-user FK, but never transfer personal-org
  -- ownership or the guest's personal-org owner membership.
  for v_col in
    select n.nspname as sch, cl.relname as tbl, a.attname as col
    from pg_constraint con
    join pg_class cl on cl.oid = con.conrelid
    join pg_namespace n on n.oid = cl.relnamespace
    join pg_class ref on ref.oid = con.confrelid
    join pg_namespace refn on refn.oid = ref.relnamespace
    join unnest(con.conkey) as ck(attnum) on true
    join pg_attribute a on a.attrelid = cl.oid and a.attnum = ck.attnum
    where con.contype = 'f'
      and refn.nspname = 'auth' and ref.relname = 'users'
      and n.nspname not in (
        'auth', 'storage', 'graveyard', 'realtime', 'vault', 'extensions',
        'pgsodium', 'supabase_functions'
      )
      and not (n.nspname = 'public' and cl.relname = 'users.guest_executions')
      and not (n.nspname = 'public' and cl.relname = 'users.guest_conversion_audit')
      and not (n.nspname = 'users' and cl.relname = 'profiles' and a.attname = 'id')
      and not (n.nspname = 'iam' and cl.relname = 'organizations' and a.attname = 'created_by')
      and not (n.nspname = 'iam' and cl.relname = 'memberships' and a.attname = 'user_id')
    order by n.nspname, cl.relname, a.attname
  loop
    v_key := format('%s.%s.%s', v_col.sch, v_col.tbl, v_col.col);
    begin
      execute format(
        'update %I.%I set %I = $1 where %I = $2',
        v_col.sch, v_col.tbl, v_col.col, v_col.col
      ) using p_new_user_id, p_anon_user_id;
      get diagnostics v_count = row_count;
      if v_count > 0 then
        v_transferred := v_transferred || jsonb_build_object(v_key, v_count);
        v_total := v_total + v_count;
      end if;
    exception when others then
      v_skipped := v_skipped || jsonb_build_object(v_key, sqlerrm);
    end;
  end loop;

  -- Non-personal organizations and memberships still belong to the converted
  -- account. Only the guest's personal-org machinery is excluded.
  update iam.organizations set created_by = p_new_user_id
  where created_by = p_anon_user_id and is_personal is not true;
  get diagnostics v_count = row_count;
  if v_count > 0 then
    v_transferred := v_transferred || jsonb_build_object(
      'iam.organizations.created_by.non_personal', v_count
    );
    v_total := v_total + v_count;
  end if;

  update iam.memberships as membership set user_id = p_new_user_id
  where membership.user_id = p_anon_user_id
    and not exists (
      select 1 from iam.organizations as organization
      where organization.id = membership.organization_id
        and organization.is_personal is true
        and organization.created_by = p_anon_user_id
    );
  get diagnostics v_count = row_count;
  if v_count > 0 then
    v_transferred := v_transferred || jsonb_build_object(
      'iam.memberships.user_id.non_personal', v_count
    );
    v_total := v_total + v_count;
  end if;

  if v_guest_row_id is not null then
    update users.guest_executions
    set converted_to_user_id = p_new_user_id, converted_at = now(), auth_user_id = null
    where id = v_guest_row_id;
  end if;
  insert into users.guest_conversion_audit
    (anon_user_id, new_user_id, fingerprint, transferred, skipped, total_rows)
  values
    (p_anon_user_id, p_new_user_id, p_fingerprint,
     v_transferred, v_skipped, v_total::integer);
  return jsonb_build_object(
    'status', 'transferred', 'total_rows', v_total,
    'transferred', v_transferred, 'skipped', v_skipped
  );
end;
$function$
;

-- wsp_resolve_system_task(text, text, uuid) — as it stood before DEFAULT-ORG-4
CREATE OR REPLACE FUNCTION public.wsp_resolve_system_task(p_dedupe_key text, p_outcome text DEFAULT 'completed'::text, p_organization_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'workspace'
AS $function$
declare
  v_org uuid;
  v_id uuid;
begin
  if p_outcome not in ('completed','cancelled','dismissed') then
    raise exception 'wsp_resolve_system_task: invalid outcome %', p_outcome;
  end if;
  v_org := coalesce(p_organization_id, public.ensure_personal_organization(auth.uid()));
  update workspace.tasks
     set status = p_outcome,
         completed_at = case when p_outcome = 'completed' then now() else completed_at end,
         updated_at = now()
   where organization_id = v_org and dedupe_key = p_dedupe_key and deleted_at is null
     and status not in ('completed','cancelled','dismissed')
   returning id into v_id;
  return jsonb_build_object('id', v_id, 'resolved', v_id is not null);
end;
$function$
;

-- wsp_upsert_system_task(text, text, text, text, text, text, text, text, date, text, uuid, uuid, uuid, jsonb) — as it stood before DEFAULT-ORG-4
CREATE OR REPLACE FUNCTION public.wsp_upsert_system_task(p_dedupe_key text, p_title text, p_description text DEFAULT NULL::text, p_origin text DEFAULT 'system'::text, p_source_type text DEFAULT NULL::text, p_source_id text DEFAULT NULL::text, p_source_url text DEFAULT NULL::text, p_source_label text DEFAULT NULL::text, p_due_date date DEFAULT NULL::date, p_priority text DEFAULT NULL::text, p_assignee_id uuid DEFAULT NULL::uuid, p_organization_id uuid DEFAULT NULL::uuid, p_project_id uuid DEFAULT NULL::uuid, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'workspace'
AS $function$
declare
  v_org uuid;
  v_existing workspace.tasks%rowtype;
  v_id uuid;
begin
  if p_dedupe_key is null or length(trim(p_dedupe_key)) = 0 then
    raise exception 'wsp_upsert_system_task: dedupe_key is required';
  end if;
  v_org := coalesce(p_organization_id, public.ensure_personal_organization(auth.uid()));
  if v_org is null then
    raise exception 'wsp_upsert_system_task: organization could not be resolved — pass p_organization_id when calling without a user session';
  end if;

  select * into v_existing from workspace.tasks
   where organization_id = v_org and dedupe_key = p_dedupe_key and deleted_at is null
   limit 1;

  if found then
    if v_existing.status in ('completed','cancelled','dismissed') then
      return jsonb_build_object('id', v_existing.id, 'created', false, 'status', v_existing.status);
    end if;
    update workspace.tasks
       set title = p_title,
           description = coalesce(p_description, description),
           due_date = coalesce(p_due_date, due_date),
           source_url = coalesce(p_source_url, source_url),
           source_label = coalesce(p_source_label, source_label),
           updated_at = now()
     where id = v_existing.id;
    return jsonb_build_object('id', v_existing.id, 'created', false, 'status', v_existing.status);
  end if;

  begin
    insert into workspace.tasks (
      title, description, status, origin, source_type, source_id, source_url, source_label,
      dedupe_key, due_date, priority, assignee_id, organization_id, project_id,
      metadata, created_by
    ) values (
      p_title, p_description, 'inbox', coalesce(p_origin, 'system'),
      p_source_type, p_source_id, p_source_url, p_source_label,
      p_dedupe_key, p_due_date,
      nullif(p_priority, '')::task_priority,
      coalesce(p_assignee_id, (select auth.uid())), v_org, p_project_id,
      coalesce(p_metadata, '{}'::jsonb), (select auth.uid())
    ) returning id into v_id;
    return jsonb_build_object('id', v_id, 'created', true, 'status', 'inbox');
  exception when unique_violation then
    -- Lost a race (or the row exists but RLS hid it from our select).
    select * into v_existing from workspace.tasks
     where organization_id = v_org and dedupe_key = p_dedupe_key and deleted_at is null
     limit 1;
    if found then
      return jsonb_build_object('id', v_existing.id, 'created', false, 'status', v_existing.status);
    end if;
    return jsonb_build_object('id', null, 'created', false, 'status', null, 'reason', 'exists_not_visible');
  end;
end;
$function$
;

-- The new fork arities and their door rows go with the change that introduced them.
drop function if exists public.fork_processed_document(uuid, uuid);
drop function if exists public.fork_shared_conversation(uuid, uuid, text);
drop function if exists public.fork_shared_flashcard_set(uuid, uuid, text);
drop function if exists public.fork_shared_quiz(uuid, uuid, text);
delete from platform.client_callable_door
 where declared_by = 'migrations/campaign/dorg4_fourteen_doors_name_the_organization_they_act_in.sql';
