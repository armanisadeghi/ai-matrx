-- lane: DEFAULT-ORG-4
-- additive: yes
-- based-on: public.access_request_create(text, uuid, text, text) c6e09bd57c9995c2837920c93852248b5f92e83489266bc35dbe901012024264
-- based-on: public.setting_access_request_create(uuid, text, text, text, text, jsonb, text) 9c7f7fde934f63e52615ee9ff5f4a29d350b0ee38751e4af11a88504a5aef44d
-- based-on: public.ctx_projects_add_creator_membership() 6fa27c91aed912a64f231f52e93657a395e33e1ec639a5d52898e49d8bea56f9
-- based-on: public.dm_get_or_create_direct_conversation(uuid, uuid, uuid) 35b9fa8cacddb7398f44bd6f71db5d1d4b1458df4b920aef5024a139aaa1cbf2
-- based-on: public.fork_processed_document(uuid) 5a38db7fd98092ba17091a721b1c0c6b5f48ff744c595ba81f729f37da149685
-- based-on: public.fork_shared_conversation(uuid, text) 8885d8a358bd97b750097f45df3d0d85da3c007838d4da3c05292ef776b44461
-- based-on: public.fork_shared_flashcard_set(uuid, text) 76c593a24f3703d7460b057e28e975dc97f65322a61a32a9aac02ad21b959622
-- based-on: public.fork_shared_quiz(uuid, text) 9dbf6d224b05bf747f0fefacdc3d228d0b0fbc6cdfb52d611c65a6fd0525876c
-- based-on: public.get_user_email_preferences(uuid) 9de1500510b012326454fa4e531478090370ba982777f97f7908df48a9be3a1b
-- based-on: public.user_form_profile_append_to_array(uuid, text, jsonb) 7f2cbf9609c1a7d79f7058241ed8754bc5559ae264bf2948ddfefa00a4918982
-- based-on: public.user_form_profile_set_custom_field(uuid, text, jsonb) 83afd4df41056ae23ddded550bf1ecb39f5141e9b011121f997f224a6e3907b8
-- based-on: public.transfer_guest_data_to_user(uuid, uuid, text) cfa49d731f6f178e8334c19e1e26a202e38e2eb973fa8aa65102ca258b2c0fc9
-- based-on: public.wsp_resolve_system_task(text, text, uuid) b663b2f83583a7e49b4e20f44ed4f82eeec200a325d5ce6addad9abb357611ef
-- based-on: public.wsp_upsert_system_task(text, text, text, text, text, text, text, text, date, text, uuid, uuid, uuid, jsonb) bc8aa9bdbe40ca61b218a53082f75e6807436f5f2ae30e967182548600578e33
--
-- A PERSON HAS NO DEFAULT ORGANIZATION. THE FOURTEEN REMAINING NON-CREATION BODIES
-- STOP ANSWERING "WHICH ORGANIZATION?" WITH "THE CALLER'S OWN".
--
-- The law (Arman, 2026-09-19; scripts/check-no-default-organization-sql.ts rule 7): a
-- default organization is at most a per-client DISPLAY preference. No read, no write,
-- no route, no trigger and no billing query may pick or substitute one -- not a cookie,
-- not a preference, not the personal organization. Satisfying a NOT NULL column is an
-- argument for making the CALLER supply the value, never for inventing one.
--
-- 🚨 HOW THESE FOURTEEN WERE FOUND, AND WHY NOBODY FOUND THEM BEFORE. The guard's
-- catalogue clause asks only about functions a `-- supersedes-function:` header NAMES,
-- so it exited 0 on a database carrying SEVENTEEN live bodies with the shape. The same
-- commit that carries this file gave the guard a CENSUS: every function body in every
-- non-system schema, read through the same stripping, matched against the same rules,
-- printed BY NAME. Three of the seventeen are signup CREATION sites and are answered by
-- dorg4_signup_creation_sites_declare_themselves.sql. These are the other fourteen.
--
-- THE ONE QUESTION EACH ANSWERS INSTEAD. Every fix takes the organization from something
-- that already knows it -- the RECORD being acted on, the DOOR'S OWN ARGUMENT, or the
-- parent row -- and REFUSES (23502, naming what to pass) when none of them answers. A
-- refusal a person can act on is honest; a silently mis-tenanted row is not.
--
--  1. access_request_create          -> the RESOURCE the request is about
--  2. setting_access_request_create  -> p_org_id, already an argument
--  3. ctx_projects_add_creator_membership -> NEW.organization_id, the row being inserted
--  4. dm_get_or_create_direct_conversation -> p_organization_id, already an argument
--  5. fork_processed_document        -> p_organization_id, NEW argument
--  6. fork_shared_conversation       -> p_organization_id, NEW argument
--  7. fork_shared_flashcard_set      -> p_organization_id, NEW argument
--  8. fork_shared_quiz               -> p_organization_id, NEW argument
--  9. get_user_email_preferences     -> the user's own profile row
-- 10. user_form_profile_append_to_array -> the user's own profile row
-- 11. user_form_profile_set_custom_field -> the user's own profile row
-- 12. transfer_guest_data_to_user    -> the converted user's own profile row
-- 13. wsp_resolve_system_task        -> p_organization_id, already an argument
-- 14. wsp_upsert_system_task         -> p_organization_id, already an argument
--
-- 🚨 ONE SIGNATURE PER DOOR. DEFAULT-ORG-3 added a three-argument creator_claim_handle
-- BESIDE the two-argument one and every existing two-argument call became ambiguous
-- (42725), which killed the creator dashboard. The four fork doors need an argument they
-- did not have, so the OLD arity is REPLACED -- never left live, never dropped -- with a
-- body that RAISES and names the argument to add. The arities differ, so no call is
-- ambiguous; PostgREST resolves by argument NAME; and a caller that was never updated
-- fails with a sentence instead of filing somebody's work in a workspace they never chose.

set local lock_timeout = '2s';

-- ── 1. access_request_create — THE RESOURCE THE REQUEST IS ABOUT ────────────────
-- It filed `iam.access_requests.organization_id` with the REQUESTER'S personal
-- workspace, so a request for access to an organization's record was recorded in a
-- workspace that organization can never see. The request is ABOUT a registered entity,
-- and `platform.entity_organization_id` (DEFAULT-ORG-3) reads that entity's own
-- organization. Where the entity type is not organization-scoped there is nothing to
-- derive and nothing to guess: refuse, and say which resource could not be placed.
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

  -- THE RECORD ANSWERS. A request to be let into something is recorded where that
  -- something lives, so the people who can grant it can see it. It used to be recorded
  -- in the REQUESTER'S personal workspace.
  if platform.entity_is_org_scoped(p_resource_type) then
    v_org := platform.entity_organization_id(p_resource_type, p_resource_id);
  end if;
  if v_org is null then
    raise exception
      'We could not tell which organization this % belongs to, so your request was not filed.',
      lower(coalesce(v_meta.label, 'item'))
      using errcode = '23502',
            hint = 'This kind of record does not carry an organization, so there is nowhere to file a request about it. Ask the owner directly.';
  end if;

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
$function$;

-- ── 2. setting_access_request_create — THE ARGUMENT WAS ALREADY THERE ───────────
-- The door takes `p_org_id`, checks the caller is a member of it, checks they are not
-- already an owner/admin of it -- and then filed the request in the caller's PERSONAL
-- workspace, where the owners it is addressed to can never see it. The organization the
-- request is about is the organization it belongs in.
CREATE OR REPLACE FUNCTION public.setting_access_request_create(p_org_id uuid, p_setting_key text, p_setting_label text, p_setting_href text, p_action_key text, p_action_payload jsonb DEFAULT '{}'::jsonb, p_message text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'platform', 'iam', 'users'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_existing uuid;
  v_recipients jsonb;
  v_request_key text;
begin
  if v_uid is null then
    raise exception 'Sign in first.' using errcode='42501';
  end if;
  if p_org_id is null then
    raise exception 'Name the organization whose setting you are asking about.'
      using errcode='23502', hint='Pass p_org_id.';
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

  -- The request is ABOUT p_org_id and is addressed to p_org_id's owners, so it is
  -- recorded in p_org_id. It used to be recorded in the caller's personal workspace.
  insert into iam.access_requests(
    organization_id,created_by,resource_type,resource_id,requested_level,message,
    request_kind,request_key,request_payload
  )
  values(
    p_org_id,v_uid,'organization',p_org_id,'viewer',nullif(btrim(p_message),''),
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
$function$;

-- ── 3. ctx_projects_add_creator_membership — THE ROW BEING INSERTED ─────────────
-- The owner membership for a new project lands in the PROJECT'S organization. The
-- coalesce meant a project row that arrived without one silently gave its creator an
-- ownership membership in their own personal workspace instead -- a membership pointing
-- at a container that lives somewhere else.
CREATE OR REPLACE FUNCTION public.ctx_projects_add_creator_membership()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if NEW.created_by is not null then
    if NEW.organization_id is null then
      raise exception
        'This project has no organization, so there is nobody to make its owner.'
        using errcode = '23502',
              hint = 'Set organization_id on the project row; the creator membership is created in the project''s own organization.';
    end if;
    insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status, created_by, updated_by)
    values (NEW.organization_id,
            'project', NEW.id, NEW.created_by, 'owner', 'active', NEW.created_by, NEW.created_by)
    on conflict (container_type, container_id, user_id) do nothing;
  end if;
  return NEW;
end $function$;

-- ── 4. dm_get_or_create_direct_conversation — THE ARGUMENT WAS ALREADY THERE ────
-- `p_organization_id` has existed since 0850 ("every argument is an argument") and
-- defaulted to the caller's personal workspace when omitted, so two people in the same
-- company got a conversation filed in one of their private workspaces. The membership
-- check below already refuses an organization the caller cannot reach; now an ABSENT
-- one is refused too, which is the same answer to the same question.
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

  -- THE CALL NAMES IT OR THERE IS NO CONVERSATION. Omitting it used to mean "file it in
  -- user1's personal workspace".
  v_org := p_organization_id;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Name the organization this conversation belongs to.'
      USING ERRCODE = '23502',
            HINT = 'Pass p_organization_id: the organization the sender is acting in.';
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
$function$;

-- ── 5-8. THE FOUR FORK DOORS — A COPY LANDS WHERE THE PERSON IS WORKING ─────────
-- Forking is the one case where neither the record nor the ladder can answer: the
-- SOURCE's organization is where the original lives (often a library or somebody else's
-- workspace) and the copy is emphatically not going there. Only the person knows where
-- they want their copy, so the door takes the argument and the client passes the active
-- organization (`ensureOrgId`, which asks when there is no selection instead of
-- substituting one).
--
-- Each old arity is REPLACED with a raising body rather than dropped: a dropped function
-- tells a stale caller only that it does not exist, and PostgREST resolves overloads by
-- argument NAME, so the new arity is reached by passing p_organization_id.

CREATE OR REPLACE FUNCTION public.fork_processed_document(p_source_id uuid, p_organization_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_org  uuid := p_organization_id;
  v_new  uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Name the organization your copy belongs to.'
      USING ERRCODE = '23502', HINT = 'Pass p_organization_id.';
  END IF;
  IF NOT iam.has_org_access(v_org) THEN
    RAISE EXCEPTION 'You are not a member of that organization.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.can_read_processed_document(p_source_id, v_user) THEN
    RAISE EXCEPTION 'not permitted to read source document %', p_source_id USING ERRCODE = '42501';
  END IF;

  SELECT id INTO v_new
  FROM docproc.processed_documents
  WHERE owner_id = v_user AND parent_processed_id = p_source_id AND derivation_kind = 'user_fork'
    AND organization_id = v_org
  LIMIT 1;
  IF v_new IS NOT NULL THEN RETURN v_new; END IF;

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
$function$;

CREATE OR REPLACE FUNCTION public.fork_processed_document(p_source_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RAISE EXCEPTION 'Name the organization your copy belongs to.'
    USING ERRCODE = '23502',
          HINT = 'Call fork_processed_document(p_source_id, p_organization_id). This one-argument door used to file the copy in the caller''s personal workspace, which is a choice nobody made.';
END;
$function$;

CREATE OR REPLACE FUNCTION public.fork_shared_conversation(p_conversation_id uuid, p_organization_id uuid, p_token text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
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
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Conversation not found'); END IF;

  SELECT COALESCE(is_link_shareable, false) INTO v_shareable
    FROM platform.shareable_resource_registry WHERE resource_type = 'conversation';
  v_shared := COALESCE(v_shareable, false) AND (
       v_src.visibility IN ('public','link')
    OR (p_token IS NOT NULL AND public.share_link_authorizes(p_token, 'conversation', p_conversation_id))
    OR iam.has_access('conversation', p_conversation_id, 'viewer'));
  IF NOT v_shared THEN RETURN jsonb_build_object('success', false, 'error', 'This conversation is not shared'); END IF;

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

CREATE OR REPLACE FUNCTION public.fork_shared_conversation(p_conversation_id uuid, p_token text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN jsonb_build_object(
    'success', false,
    'error', 'Choose the organization your copy belongs to, then try again.',
    'code', 'organization_required');
END; $function$;

CREATE OR REPLACE FUNCTION public.fork_shared_flashcard_set(p_set_id uuid, p_organization_id uuid, p_token text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
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
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Flashcard set not found'); END IF;

  SELECT COALESCE(is_link_shareable, false) INTO v_shareable FROM platform.shareable_resource_registry WHERE resource_type='fc_set';
  v_shared := COALESCE(v_shareable,false) AND (
       v_src.visibility IN ('public','link')
    OR (p_token IS NOT NULL AND public.share_link_authorizes(p_token, 'fc_set', p_set_id))
    OR iam.has_access('fc_set', p_set_id, 'viewer'));
  IF NOT v_shared THEN RETURN jsonb_build_object('success', false, 'error', 'This set is not shared'); END IF;

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

CREATE OR REPLACE FUNCTION public.fork_shared_flashcard_set(p_set_id uuid, p_token text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN jsonb_build_object(
    'success', false,
    'error', 'Choose the organization your copy belongs to, then try again.',
    'code', 'organization_required');
END; $function$;

CREATE OR REPLACE FUNCTION public.fork_shared_quiz(p_quiz_id uuid, p_organization_id uuid, p_token text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
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
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Quiz not found'); END IF;

  SELECT COALESCE(is_link_shareable, false) INTO v_shareable FROM platform.shareable_resource_registry WHERE resource_type='quiz_session';
  v_shared := COALESCE(v_shareable,false) AND (
       v_src.visibility IN ('public','link')
    OR (p_token IS NOT NULL AND public.share_link_authorizes(p_token, 'quiz_session', p_quiz_id))
    OR iam.has_access('quiz_session', p_quiz_id, 'viewer'));
  IF NOT v_shared THEN RETURN jsonb_build_object('success', false, 'error', 'This quiz is not shared'); END IF;

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

CREATE OR REPLACE FUNCTION public.fork_shared_quiz(p_quiz_id uuid, p_token text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN jsonb_build_object(
    'success', false,
    'error', 'Choose the organization your copy belongs to, then try again.',
    'code', 'organization_required');
END; $function$;

-- ── THE DOOR REGISTER — the four new fork arities declare themselves ───────────
-- Every client-callable SECURITY DEFINER function carries a row saying who may call it
-- and why (`platform.client_callable_door`, D2/D15). The old arities keep their rows --
-- they are still live, and they now refuse -- and the new ones are declared here with the
-- same signed-in-only posture.
insert into platform.client_callable_door (
  schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
  non_client_lane, signed_in_callers, anonymous_callers)
values
('public', 'fork_processed_document', 'p_source_id uuid, p_organization_id uuid',
 array['uuid'::regtype, 'uuid'::regtype]::oid[],
 'SIGNED-IN door (authenticated only). Copies a readable processed document into the organization the caller NAMES, checked with iam.has_org_access. The one-argument arity is still live and now refuses: it used to file the copy in the caller''s personal workspace.',
 'migrations/campaign/dorg4_fourteen_doors_name_the_organization_they_act_in.sql',
 null, true, false),
('public', 'fork_shared_conversation', 'p_conversation_id uuid, p_organization_id uuid, p_token text',
 array['uuid'::regtype, 'uuid'::regtype, 'text'::regtype]::oid[],
 'SIGNED-IN door (authenticated only). Copies a shared conversation into the organization the caller NAMES, checked with iam.has_org_access. Sharing authorisation is unchanged (visibility, p_token via share_link_authorizes, or iam.has_access).',
 'migrations/campaign/dorg4_fourteen_doors_name_the_organization_they_act_in.sql',
 null, true, false),
('public', 'fork_shared_flashcard_set', 'p_set_id uuid, p_organization_id uuid, p_token text',
 array['uuid'::regtype, 'uuid'::regtype, 'text'::regtype]::oid[],
 'SIGNED-IN door (authenticated only). Copies a shared flashcard set into the organization the caller NAMES, checked with iam.has_org_access. Sharing authorisation is unchanged.',
 'migrations/campaign/dorg4_fourteen_doors_name_the_organization_they_act_in.sql',
 null, true, false),
('public', 'fork_shared_quiz', 'p_quiz_id uuid, p_organization_id uuid, p_token text',
 array['uuid'::regtype, 'uuid'::regtype, 'text'::regtype]::oid[],
 'SIGNED-IN door (authenticated only). Copies a shared quiz into the organization the caller NAMES, checked with iam.has_org_access. Sharing authorisation is unchanged.',
 'migrations/campaign/dorg4_fourteen_doors_name_the_organization_they_act_in.sql',
 null, true, false),
-- transfer_guest_data_to_user carried NO declaration at all -- the shape guard caught it the
-- first time this file ran on the clone. It has never been client-callable (postgres and
-- service_role only), so the debt is settled by saying which lane calls it rather than by
-- opening a door.
('public', 'transfer_guest_data_to_user', 'p_anon_user_id uuid, p_new_user_id uuid, p_fingerprint text',
 array['uuid'::regtype, 'uuid'::regtype, 'text'::regtype]::oid[],
 'Guest-to-permanent conversion. p_anon_user_id must be an anonymous auth.users row and p_new_user_id a non-anonymous one, both checked in the body; a NULL for either returns an error envelope rather than acting. The destination organization is read from the converted account''s OWN users.profiles row and the call is refused when that row is missing; it used to create a personal organization for the target and move real rows into it.',
 'migrations/campaign/dorg4_fourteen_doors_name_the_organization_they_act_in.sql',
 'server_only: called by the sign-up completion path on the Next.js server with the service role (lib/services/guest-promotion.ts and guest-oauth-transfer.ts). No client may ever call it: it rewrites foreign keys across every table in the database as the definer, so a client that could name two user ids could move somebody else''s rows.',
 false, false)
on conflict (schema_name, function_name, identity_argtypes) do update set
  identity_args = excluded.identity_args,
  reason = excluded.reason,
  declared_by = excluded.declared_by,
  non_client_lane = excluded.non_client_lane,
  signed_in_callers = excluded.signed_in_callers,
  anonymous_callers = excluded.anonymous_callers;

-- The grants come AFTER the rows above: the DDL guard reads the door register at
-- GRANT time and takes a client grant back when the function it names is undeclared.
grant execute on function public.fork_processed_document(uuid, uuid) to authenticated, service_role;
grant execute on function public.fork_shared_conversation(uuid, uuid, text) to authenticated, service_role;
grant execute on function public.fork_shared_flashcard_set(uuid, uuid, text) to authenticated, service_role;
grant execute on function public.fork_shared_quiz(uuid, uuid, text) to authenticated, service_role;

-- ── 9-11. THE THREE 1:1 SATELLITES OF users.profiles — THE PARENT ROW ───────────
-- Each of these creates a row that belongs to ONE user and is a satellite of that user's
-- profile. The profile row carries that user's organization; carrying one is not choosing
-- one. The "self-heal if the profile row is missing" arm invented a workspace instead,
-- which is the substitution wearing a comment that explains it.
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
    SELECT organization_id INTO v_org FROM users.profiles WHERE id = p_user_id;
    IF v_org IS NULL THEN
      RAISE EXCEPTION 'This account has no profile yet, so there is nowhere to keep its email preferences.'
        USING ERRCODE = '23502',
              HINT = 'Signup provisioning creates users.profiles with the account''s own organization. Repair the profile row rather than inventing a workspace.';
    END IF;

    INSERT INTO users.user_email_preferences (user_id, organization_id)
    VALUES (p_user_id, v_org)
    RETURNING * INTO v_preferences;
  END IF;

  RETURN v_preferences;
END;
$function$;

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

  -- PARENT ROW: users.user_form_profile is a 1:1 satellite of users.profiles for the
  -- same user and carries that user's own organization.
  SELECT organization_id INTO v_org FROM users.profiles WHERE id = p_user_id;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'This account has no profile yet, so there is nowhere to keep its details.'
      USING ERRCODE = '23502',
            HINT = 'Signup provisioning creates users.profiles with the account''s own organization. Repair the profile row rather than inventing a workspace.';
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
$function$;

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

  -- PARENT ROW: users.user_form_profile is a 1:1 satellite of users.profiles for the
  -- same user and carries that user's own organization.
  SELECT organization_id INTO v_org FROM users.profiles WHERE id = p_user_id;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'This account has no profile yet, so there is nowhere to keep its details.'
      USING ERRCODE = '23502',
            HINT = 'Signup provisioning creates users.profiles with the account''s own organization. Repair the profile row rather than inventing a workspace.';
  END IF;

  INSERT INTO users.user_form_profile (user_id, organization_id, custom_fields)
  VALUES (p_user_id, v_org, jsonb_build_object(p_key, p_value))
  ON CONFLICT (user_id) DO UPDATE
    SET custom_fields = users.user_form_profile.custom_fields || jsonb_build_object(p_key, p_value)
  RETURNING custom_fields INTO v_result;

  RETURN v_result;
END;
$function$;

-- ── 12. transfer_guest_data_to_user — THE CONVERTED ACCOUNT'S OWN PROFILE ROW ───
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

  -- THE CONVERTED ACCOUNT'S OWN PROFILE ROW ANSWERS. Guest-created rows move to the
  -- organization the permanent account already carries; the guest organization and
  -- membership stay with guest. It used to RESOLVE-OR-CREATE a personal organization
  -- for the target here, which meant a conversion could invent a workspace for an
  -- account whose provisioning had failed and move real rows into it.
  select organization_id into v_target_personal_org
  from users.profiles where id = p_new_user_id;
  if v_target_personal_org is null then
    return jsonb_build_object('status', 'error', 'message',
      'the target account has no profile row, so there is no organization to move the guest rows into');
  end if;
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

-- ── 13. wsp_resolve_system_task — THE ARGUMENT WAS ALREADY THERE ──────────
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
  -- THE CALL NAMES IT. Omitting it used to resolve a task in the caller's personal
  -- workspace, which silently matched nothing (or the wrong thing) for anyone whose
  -- tasks live in a real organization.
  v_org := p_organization_id;
  if v_org is null then
    raise exception 'Name the organization whose task this is.'
      using errcode = '23502', hint = 'Pass p_organization_id.';
  end if;
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

-- ── 14. wsp_upsert_system_task — THE ARGUMENT WAS ALREADY THERE ───────────
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
  -- THE CALL NAMES IT. The coalesce meant a system task raised for a person's work
  -- landed in their private workspace whenever the caller forgot the argument, where
  -- nobody else on their team could ever see it.
  v_org := p_organization_id;
  if v_org is null then
    raise exception 'Name the organization this task belongs to.'
      using errcode = '23502', hint = 'Pass p_organization_id.';
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
