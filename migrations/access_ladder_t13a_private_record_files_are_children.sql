-- lane: access-ladder T-13 phase 2.1 — children first. Files that belong to a Private or
-- Confidential record become that record's children, and every writer that makes such a file
-- marks it at write time, so no file of a locked record is left on the Organization lane.
--
-- Law: common-docs/policies/access-ladder.md ("Children inherit their parent"). Since T-11j,
-- "personal" no longer locks on Organization tables, so a parentless files.files row is open to
-- the owner's coworkers. The T-13 phase-1 census
-- (common-docs/projects/access-ladder/t13/files-personal-no-parent-2026-09-28.json) found
-- attachments of AI chats, Confidential study sessions and Confidential browser-profile login
-- captures still parentless. Measured as test@test.com before this file: 106 of 108 login
-- captures, 20 of 171 AI-chat attachments and 7 study-session recordings readable.
--
-- 1. platform.child_parent_types('file') gains dm_conversation, study_session, browser_profile
--    (every HR type was already there).
-- 2. Writers mark the parent (one per way a file becomes such a record's):
--    * files._stamp_parent_record (insert): a login capture (login-captures-<org>/<profile>/…) is
--      its browser profile's from the first byte; the profile id comes from the path and must be
--      that organization's profile, else the type alone is set (owner-only until adopted).
--    * browser.capture → browser_profile (the capture row names profile and file).
--    * education.study_session.session_audio_file_id → study_session (the generic adopter).
--    * communication.dm_messages media_metadata file id → dm_conversation (sender's own file).
--    * chat.tool_trace (args/metadata/result) and chat.conversation (variables: the files handed
--      to the chat at its start) → conversation, through files._adopt_chat_output_ids: only the
--      chat owner's own personal parentless file, and only one made no earlier than 10 minutes
--      before the chat existed — an older library file a chat merely READ stays Organization.
--      A request's context objects (chat.user_request.metadata.context_objects, e.g. the file open
--      on the Files page beside the chat) are files the chat READ, not its attachments: not moved.
-- 3. Backfill (≈300 rows, one short statement per class; variants follow through
--    files._variants_follow_their_source).
-- 4. Guard: files.private_children_missing_parent() answers one row per file that a Private or
--    Confidential link says is a child but that has no parent, per missing/disabled adopter, and
--    per missing parent type. Zero rows or it failed: pnpm check:private-files-have-parents.
--
-- Not moved, on purpose (reported to the owner):
--   * the 52 "direct message" files of the census: every one is only MENTIONED in the text of a
--     system message in a group DM (agent notes quoting a file id); none is a DM attachment (no DM
--     row in the database carries media). Making them DM children would hide Organization files.
--   * the 1 "HR employee photo": the file belongs to a different person in a different
--     organization than the HR record; the adopter refuses that by design (pointing a record at
--     someone else's file never hands it to the record's readers).
--   * 61 census "AI chat" files whose only evidence is a request's context objects (files open
--     beside the chat, and thumbnails of them): read by the chat, not attached to it.
--   * derived files whose source has no parent record stay with their source (Organization):
--     naming the source file as parent would lock the variant owner-only while the source stays
--     open, because the read policy gives no lane through a `file` parent.
--
-- Grants: no REVOKE here (additive file). The SECURITY DEFINER adopters are closed to clients by
-- the database-wide definer guard; the guard function runs as its caller (row security applies).
-- Locks: CREATE TRIGGER takes SHARE ROW EXCLUSIVE on six tables for milliseconds; the backfill
-- updates ≈350 files.files rows by primary key. lock_timeout 2s.
set local lock_timeout = '2s';
-- based-on: platform.child_parent_types(text) 120532f5553959bd6a047df198bbbd84ab96ece105bb13bd79c149ba49d8c5c4
-- based-on: files._stamp_parent_record() e1748e44c2897b08e68f105d7c48dc1e4416cb6da6caf6e8c9b308a3f34f7606

-- ── 1. The one list ─────────────────────────────────────────────────────────────────────────────
create or replace function platform.child_parent_types(p_token text)
 returns text[]
 language sql
 immutable
as $function$
  -- Access ladder T-11: THE ONE LIST of record types a row of this token may be the child of
  -- (platform.child_parent_columns names the two columns). Read by the files.files shape check,
  -- iam.accessible_entity_ids (the set-wise parent lane) and the writers. A type added here must
  -- be an active platform.entity_types token.
  select case p_token
           when 'file' then array[
             -- AI chat and coding session (T-11 step 0); `file` = rows written before part n
             'conversation', 'coding_session', 'file',
             -- dictation: the studio session it was recorded into, else the chunk journal
             'studio_session', 'studio_recording_chunks',
             -- every HR record that points at a file (census 2026-09-28: 22 tables)
             'hr_background_check', 'hr_candidate', 'hr_careers_portal', 'hr_checklist_item',
             'hr_corrective_action', 'hr_course_version', 'hr_credential', 'hr_employee',
             'hr_engagement', 'hr_i9', 'hr_i9_document', 'hr_kiosk_session', 'hr_new_hire_report',
             'hr_offer', 'hr_payroll_export', 'hr_provider_event', 'hr_punch', 'hr_records_request',
             'hr_restricted_note', 'hr_tax_withholding', 'hr_transcript_entry',
             'hr_verification_letter_request',
             -- the other Private/Confidential table that points at a file
             'pdf_redaction_key_escrow',
             -- T-13 2.1: direct-message conversation (Private), study session (Confidential),
             -- cloud browser profile (Confidential — its login captures)
             'dm_conversation', 'study_session', 'browser_profile'
           ]
         end
$function$;

-- ── 2a. Insert stamp: login captures are their browser profile's from the first byte ───────────
create or replace function files._stamp_parent_record()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'pg_catalog'
as $function$
declare
  v_session uuid;
  v_type text;
  v_id uuid;
begin
  if new.parent_record_type is not null then
    return new;
  end if;
  -- A variant (a resized image, a thumbnail, a converted page) shows exactly what its source
  -- shows: it belongs to the record its source ultimately belongs to.
  if new.parent_file_id is not null then
    select u.parent_type, u.parent_id into v_type, v_id
      from files.ultimate_parent_record(new.parent_file_id) u;
    if v_type is not null then
      new.parent_record_type := v_type;
      new.parent_record_id := v_id;
      return new;
    end if;
  end if;
  -- A coding session's raw artifact (commands, environment values, tool output) is the session's.
  -- When the session record is not there yet the type alone is set: the file is a child with no
  -- readable parent, which keeps it its owner's; chat.coding_session's insert trigger fills the id.
  if new.artifact_kind = 'coding_session_artifact' then
    select c.id into v_session
      from chat.coding_session c
     where c.created_by = new.created_by
       and c.provider = coalesce(new.metadata ->> 'provider', 'claude_code')
       and c.provider_session_id = new.provider_session_id
       and c.deleted_at is null
     limit 1;
    new.parent_record_type := 'coding_session';
    new.parent_record_id := v_session;
    return new;
  end if;
  -- An HR artifact the server writes (aidream services/hr: the verification letter, the payroll
  -- export) is its HR record's from the first byte, before the record row names it: a letter's
  -- file name is its request's id; a payroll export's record names it moments later
  -- (files._adopt_files_named_by_row fills the id). Until then it is its owner's alone.
  if new.file_path like 'hr/verification-letters/%' then
    select v.id into v_id
      from hr.verification_letter_request v
     where v.id::text = substring(new.file_path from '^hr/verification-letters/([0-9a-f-]{36})')
       and v.organization_id is not distinct from new.organization_id;
    new.parent_record_type := 'hr_verification_letter_request';
    new.parent_record_id := v_id;
    return new;
  end if;
  if new.file_path like 'hr/payroll-exports/%' then
    new.parent_record_type := 'hr_payroll_export';
    new.parent_record_id := null;
    return new;
  end if;
  -- T-13 2.1: a cloud-browser login capture (aidream services/cloud_browser/local_login_captures:
  -- login-captures-<org>/<profile>/<command>/{before,after}.json) is its browser profile's
  -- (Confidential). The profile must be that organization's; otherwise the type alone is set,
  -- which keeps the file its owner's until browser.capture names the profile.
  if new.file_path like 'login-captures-%' then
    select p.id into v_id
      from browser.profile p
     where p.id::text = substring(new.file_path from '^login-captures-[0-9a-f-]{36}/([0-9a-f-]{36})/')
       and p.organization_id is not distinct from new.organization_id;
    new.parent_record_type := 'browser_profile';
    new.parent_record_id := v_id;
    return new;
  end if;
  -- A dictation's staged audio is the record it was dictated into: the studio session whose
  -- segment carries the recorder's safety id; until one exists, the person's own unsent input.
  if files.is_dictation_chunk(new.file_path, new.file_name, new.metadata) then
    select s.session_id into v_id
      from transcripts.studio_recording_segments s
     where s.safety_id = new.metadata ->> 'safety_id'
       and s.created_by = new.created_by
       and s.deleted_at is null
     limit 1;
    if v_id is not null then
      new.parent_record_type := 'studio_session';
      new.parent_record_id := v_id;
    else
      new.parent_record_type := 'studio_recording_chunks';
      new.parent_record_id := null;
    end if;
  end if;
  return new;
end;
$function$;

-- ── 2b. browser.capture → browser_profile ──────────────────────────────────────────────────────
create or replace function files._adopt_browser_capture_file()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'pg_catalog'
as $function$
begin
  -- The capture row names the profile and the file; the file becomes the profile's child. Only a
  -- file this capture's creator made or its organization holds moves, and a file already some
  -- other record's child stays where it is (a stamped login capture with no id yet is filled).
  update files.files f
     set parent_record_type = 'browser_profile',
         parent_record_id = new.profile_id
   where f.id = new.file_id
     and (f.parent_record_type is null
          or (f.parent_record_type = 'browser_profile' and f.parent_record_id is null))
     and (f.created_by = new.created_by or f.organization_id = new.organization_id);
  return null;
end;
$function$;

create trigger _adopt_browser_capture_file
  after insert or update of file_id, profile_id on browser.capture
  for each row when (new.file_id is not null and new.profile_id is not null)
  execute function files._adopt_browser_capture_file();

-- ── 2c. education.study_session.session_audio_file_id → study_session ──────────────────────────
create trigger _adopt_files_named_by_row
  after insert or update of session_audio_file_id on education.study_session
  for each row execute function files._adopt_files_named_by_row('study_session', 'session_audio_file_id');

-- ── 2d. communication.dm_messages media → dm_conversation ──────────────────────────────────────
create or replace function files._adopt_dm_attachment()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'pg_catalog'
as $function$
declare
  v_ids uuid[];
begin
  -- A direct message's attachment is named in media_metadata (file_id / fileId). Only the
  -- sender's own parentless file moves: attaching someone else's file never hands it to the DM.
  select array_agg(distinct m[1]::uuid) into v_ids
    from regexp_matches(new.media_metadata::text,
                        '"(?:file_id|fileId)": ?"([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})"', 'g') m;
  if coalesce(cardinality(v_ids), 0) = 0 then
    return null;
  end if;
  update files.files f
     set parent_record_type = 'dm_conversation',
         parent_record_id = new.conversation_id
   where f.id = any(v_ids)
     and f.parent_record_type is null
     and f.created_by = coalesce(new.sender_id, new.created_by);
  return null;
end;
$function$;

create trigger _adopt_dm_attachment
  after insert or update of media_metadata on communication.dm_messages
  for each row when (new.media_metadata is not null and new.conversation_id is not null)
  execute function files._adopt_dm_attachment();

-- ── 2e. AI chat: request context, tool output and conversation variables → conversation ───────
create or replace function files._adopt_chat_output_ids(p_conversation_id uuid, p_file_ids uuid[])
 returns integer
 language plpgsql
 security definer
 set search_path to 'pg_catalog'
as $function$
declare
  v_owner uuid;
  v_created timestamptz;
  v_n integer;
begin
  if p_conversation_id is null or coalesce(cardinality(p_file_ids), 0) = 0 then
    return 0;
  end if;
  select c.created_by, c.created_at into v_owner, v_created
    from chat.conversation c where c.id = p_conversation_id;
  if v_owner is null then
    return 0;
  end if;
  -- A file the chat PRODUCED or was handed for it (its owner's, made no earlier than 10 minutes
  -- before the chat existed) is the chat's. An older file the chat merely read — a library
  -- document, an exam source — stays an Organization file. Its variants follow
  -- (files._variants_follow_their_source).
  update files.files f
     set parent_record_type = 'conversation',
         parent_record_id = p_conversation_id
   where f.id = any(p_file_ids)
     and f.created_by = v_owner
     and f.visibility = 'personal'
     and f.parent_record_type is null
     and v_created <= f.created_at + interval '10 minutes';
  get diagnostics v_n = row_count;
  return v_n;
end;
$function$;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values
  ('files', '_adopt_chat_output_ids', 'p_conversation_id uuid, p_file_ids uuid[]',
   array['uuid'::regtype, 'uuid[]'::regtype]::oid[],
   'p_conversation_id: the chat whose owner and creation time are read (NULL or unknown -> 0, nothing changes). p_file_ids: only files created by that same owner, still personal, nobody''s child and made no earlier than 10 minutes before the chat, move.',
   'access_ladder_t13a_private_record_files_are_children.sql',
   'server_only: called only by the chat.tool_trace and chat.conversation adoption triggers (T-13 2.1); no client ever calls it.',
   false, false);

create or replace function files.chat_file_ids_in(p_text text)
 returns uuid[]
 language sql
 immutable
as $function$
  -- Every `"file_id": "<uuid>"` (also fileId) in a JSON text: how chat rows name a file.
  select array_agg(distinct m[1]::uuid)
    from regexp_matches(coalesce(p_text, ''),
                        '"(?:file_id|fileId)": ?"([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})"', 'g') m
$function$;

create or replace function files._adopt_chat_files_from_row()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'pg_catalog'
as $function$
declare
  v_conv uuid;
  v_ids uuid[];
begin
  if tg_table_name = 'tool_trace' then
    v_conv := new.conversation_id;
    v_ids := files.chat_file_ids_in(concat_ws(' ', new.args::text, new.metadata::text, new.result_preview));
  elsif tg_table_name = 'conversation' then
    v_conv := new.id;
    v_ids := files.chat_file_ids_in(new.variables::text);
  end if;
  perform files._adopt_chat_output_ids(v_conv, v_ids);
  return null;
end;
$function$;

create trigger _adopt_chat_files
  after insert or update of args, metadata, result_preview, conversation_id on chat.tool_trace
  for each row when (new.conversation_id is not null
                     and strpos(concat_ws(' ', new.args::text, new.metadata::text, new.result_preview), 'ile') > 0)
  execute function files._adopt_chat_files_from_row();

create trigger _adopt_chat_files
  after insert or update of variables on chat.conversation
  for each row when (strpos(coalesce(new.variables::text, ''), 'ile') > 0)
  execute function files._adopt_chat_files_from_row();


-- ── 3. Backfill ─────────────────────────────────────────────────────────────────────────────────
-- 3a. AI-chat files the census tied to their chat (owner = file creator re-checked here).
with a(fid, cid) as (values
  ('b8366cbf-6992-4223-8468-da1573a49054'::uuid, '05eaec50-61eb-4c37-bf16-e6a9f1e1a35b'::uuid),
  ('06a2d6a7-9ed3-4d18-bd18-ea138ec01306'::uuid, '094eef5b-4eab-4cb5-992b-94e562bc62eb'::uuid),
  ('1bf796d7-d5b9-4fa3-af24-b3c1aa5a310d'::uuid, '094eef5b-4eab-4cb5-992b-94e562bc62eb'::uuid),
  ('23180ece-2ad2-4dde-8168-6b22806a2d55'::uuid, '094eef5b-4eab-4cb5-992b-94e562bc62eb'::uuid),
  ('4089361e-1e8e-4767-bc10-5c5315d237ce'::uuid, '094eef5b-4eab-4cb5-992b-94e562bc62eb'::uuid),
  ('611ea6ab-8add-4620-97e3-6a5ffdb572a8'::uuid, '094eef5b-4eab-4cb5-992b-94e562bc62eb'::uuid),
  ('687c999b-ee62-4d6d-9e8d-9b6baaa45f48'::uuid, '094eef5b-4eab-4cb5-992b-94e562bc62eb'::uuid),
  ('6dc0d092-6f17-4f79-a854-ff205e7c91b9'::uuid, '094eef5b-4eab-4cb5-992b-94e562bc62eb'::uuid),
  ('755b693c-da24-4737-9957-2053f9e4631b'::uuid, '094eef5b-4eab-4cb5-992b-94e562bc62eb'::uuid),
  ('9285325b-7cbf-4841-9f58-5262be660776'::uuid, '094eef5b-4eab-4cb5-992b-94e562bc62eb'::uuid),
  ('a74bae9a-46ce-4a4e-9d31-a79ec3c01baa'::uuid, '094eef5b-4eab-4cb5-992b-94e562bc62eb'::uuid),
  ('1fd16be6-6444-4f14-9a4e-6c02ec98e236'::uuid, '160c2e9d-8de2-5aad-b076-085606417e1e'::uuid),
  ('2ddcf572-6816-41fe-8a64-7a2a10d470fe'::uuid, '160c2e9d-8de2-5aad-b076-085606417e1e'::uuid),
  ('38102c3d-ee48-4a23-8de3-2c25603efb9b'::uuid, '160c2e9d-8de2-5aad-b076-085606417e1e'::uuid),
  ('48c7eba1-ea92-4358-806a-083f1243ef99'::uuid, '160c2e9d-8de2-5aad-b076-085606417e1e'::uuid),
  ('5ab5430f-2f18-4eab-9bce-879527273156'::uuid, '160c2e9d-8de2-5aad-b076-085606417e1e'::uuid),
  ('a8c09517-f764-478c-bfd3-93a0515fc3d8'::uuid, '160c2e9d-8de2-5aad-b076-085606417e1e'::uuid),
  ('f6af6091-d1a3-4456-b424-683319037e3d'::uuid, '160c2e9d-8de2-5aad-b076-085606417e1e'::uuid),
  ('8ee87cb7-8cff-469e-88c8-a180a1e1ea71'::uuid, '17272229-1784-42a5-a4f4-0cd2cafc4b8a'::uuid),
  ('ba4a6b9c-2f15-48f4-a9ac-93f00cece732'::uuid, '17272229-1784-42a5-a4f4-0cd2cafc4b8a'::uuid),
  ('0fe45c2d-b04b-46b4-bae0-feffede28329'::uuid, '1ea1b793-9b12-4723-a840-7356f539362e'::uuid),
  ('5e13fdb7-9679-4e75-bfd3-e63aa8a9a993'::uuid, '1ea1b793-9b12-4723-a840-7356f539362e'::uuid),
  ('a692f1b8-bdd8-4746-9267-3c0220b2cfc2'::uuid, '1ea1b793-9b12-4723-a840-7356f539362e'::uuid),
  ('b5033f46-b1f0-4bae-b76f-8affe5ee8ebb'::uuid, '2049dfdc-a419-4215-9795-8cc500487302'::uuid),
  ('c113913a-6dbf-4412-9845-31cd47460179'::uuid, '2049dfdc-a419-4215-9795-8cc500487302'::uuid),
  ('722d88a0-2777-4fac-a45e-d4858211ac6e'::uuid, '24365498-5bd1-47cd-833c-d89758163a76'::uuid),
  ('2797a31a-4b25-422b-ba57-7ca08c0df57e'::uuid, '2536d264-eb09-45fc-9555-20e1a5ce2381'::uuid),
  ('47fe40fa-7587-48aa-a785-caf446374310'::uuid, '28a82d75-3944-4eaa-b06f-b2751fcbfaaa'::uuid),
  ('dcce3541-7d32-45ff-ae5e-7115a8ba616a'::uuid, '37d14272-1bfe-407d-bc74-f0e902999154'::uuid),
  ('f9fa386b-90c5-4a0e-b809-eef113727ac7'::uuid, '37d14272-1bfe-407d-bc74-f0e902999154'::uuid),
  ('0bcb636c-9eee-4cbf-8c6f-7101215ce980'::uuid, '3d93d883-410a-4bf9-9989-ddae88687b4b'::uuid),
  ('3075cf8b-124a-4cad-a06c-2b3aa83dff48'::uuid, '3d93d883-410a-4bf9-9989-ddae88687b4b'::uuid),
  ('33328280-fffc-4934-98e9-542cf13cac47'::uuid, '3d93d883-410a-4bf9-9989-ddae88687b4b'::uuid),
  ('758d8440-aa6e-4fcf-be07-88c4f0fd80cd'::uuid, '3d93d883-410a-4bf9-9989-ddae88687b4b'::uuid),
  ('8363b8a5-8cad-4565-89b5-28f88d80a07e'::uuid, '3d93d883-410a-4bf9-9989-ddae88687b4b'::uuid),
  ('92fb143f-ba2b-4786-8d14-6d4c13c1560f'::uuid, '3d93d883-410a-4bf9-9989-ddae88687b4b'::uuid),
  ('9f332502-f966-47ba-94ba-d5c93c969f8f'::uuid, '3d93d883-410a-4bf9-9989-ddae88687b4b'::uuid),
  ('d6f40f37-a814-4ec9-bb7c-84b4557f2ff5'::uuid, '3d93d883-410a-4bf9-9989-ddae88687b4b'::uuid),
  ('e2198115-f3e4-41e3-a578-05f6362a1750'::uuid, '3efab81f-c447-4945-8a58-64abf80b25cd'::uuid),
  ('8f180100-ed43-4cf6-9e59-8fc8b5f045ad'::uuid, '438be714-0660-4d52-b74c-0b9836b2c77b'::uuid),
  ('e847faad-2afb-48ca-b37c-697400fb020b'::uuid, '438be714-0660-4d52-b74c-0b9836b2c77b'::uuid),
  ('566ce6df-91cf-4bbc-90d0-5ddb6e1fac5a'::uuid, '44ec6f19-0c01-47a0-a67d-881bb8617890'::uuid),
  ('3ce2e487-e129-43c4-9010-00ca03b6a42c'::uuid, '4b4a56d8-4ab6-4e44-9dda-0b38432e89df'::uuid),
  ('1130ab78-38e8-4ecb-b3b3-54fa22118e4c'::uuid, '53ea48e3-d1d1-4072-845a-248d9dcb7522'::uuid),
  ('ae681519-724a-40ec-9342-0096b38a56be'::uuid, '543c43e5-d93c-5932-a4ee-9fa4505b3595'::uuid),
  ('c76004d6-f2f8-4bd9-a2db-db8478d3d353'::uuid, '543c43e5-d93c-5932-a4ee-9fa4505b3595'::uuid),
  ('22f566f7-52f2-4886-b3d5-e1ae602e0a6d'::uuid, '61701034-cac6-4b76-a5f2-f5aedf49c2f4'::uuid),
  ('d076c6af-5c25-4dad-ae22-48d24abfb5fe'::uuid, '61701034-cac6-4b76-a5f2-f5aedf49c2f4'::uuid),
  ('8fd46d50-f361-4276-9523-e789f21d69f5'::uuid, '6453497a-e42e-4007-81c9-4e5f4b23ba8e'::uuid),
  ('0ae4c614-68e8-458d-ad48-e9f851247c01'::uuid, '6703faa4-1ff3-4c72-aef7-adb12ed22c36'::uuid),
  ('fca22e7f-90d4-4f8d-ada7-ab2cbcd85166'::uuid, '6dc01311-e45e-4574-89d4-811dee740ad9'::uuid),
  ('4c8ed9eb-db82-4e97-b2fb-d8145654cbf5'::uuid, '7950006f-0954-4506-a972-fc53553632ac'::uuid),
  ('91a23f86-a8e9-4d23-9034-95fa82badd95'::uuid, '7ccd7e5c-39a0-4619-a050-6cbd6dd80272'::uuid),
  ('c3e7ec41-da18-423e-b2c2-9a2452016fc9'::uuid, '7ccd7e5c-39a0-4619-a050-6cbd6dd80272'::uuid),
  ('74370d2f-5cb3-49a8-beda-f1726da0e2ae'::uuid, '83785193-7c59-4192-ab2a-6f13d87f14e3'::uuid),
  ('1d4c9c9a-3aa4-4422-ae18-704cb29fabbf'::uuid, '8c57ccff-7cfe-4e13-a50e-9d1187109a4b'::uuid),
  ('28902e08-f517-450f-ada9-81569b4f74e6'::uuid, '8c57ccff-7cfe-4e13-a50e-9d1187109a4b'::uuid),
  ('76eea11c-3ddf-403d-b198-362a98a55717'::uuid, '8d77e193-119e-4fb2-8eb4-a3fb7b0e3777'::uuid),
  ('a7b59816-a0e8-449b-9f8a-7d00885b4e9d'::uuid, '8d77e193-119e-4fb2-8eb4-a3fb7b0e3777'::uuid),
  ('cd679844-e7b6-40fa-b9ba-0ba0fe7d5745'::uuid, '8d77e193-119e-4fb2-8eb4-a3fb7b0e3777'::uuid),
  ('8ed606b4-1b14-4a08-a465-9e368f3f69bf'::uuid, '8e68bf09-90de-4e8a-bed6-116c17721bd1'::uuid),
  ('17aa9a29-a470-45ce-93a0-6e42f52b16d3'::uuid, '90b0e19c-70c2-44f3-bd9f-249743848162'::uuid),
  ('89d5783a-5561-4a96-b841-fb47e0242ed4'::uuid, '90b0e19c-70c2-44f3-bd9f-249743848162'::uuid),
  ('c5c983ab-3850-4d72-bfc1-9ce00a683144'::uuid, '90b0e19c-70c2-44f3-bd9f-249743848162'::uuid),
  ('8dec0069-89ac-4d63-b7a8-e831b3caf289'::uuid, '92fd5754-0440-5ab5-954c-7a7ce0d2863e'::uuid),
  ('04b83de7-9f35-4b2a-a795-2c6e8395f8f9'::uuid, '93844933-f1a5-45a4-a7fa-f439943a8880'::uuid),
  ('00eed13c-2a9c-4fd7-a806-0e2aef299e74'::uuid, '97c2a7dd-2a63-4e8a-8fad-0cebb70720da'::uuid),
  ('e367f4cd-e65c-4a8c-afc5-d1b68821b8a2'::uuid, '97c2a7dd-2a63-4e8a-8fad-0cebb70720da'::uuid),
  ('0be5f643-639b-4b7d-8192-66f1f3fd244d'::uuid, 'a23694d8-908e-4c86-b17b-c7a7bfbbdf08'::uuid),
  ('28ca0803-1954-4c07-94bb-67c7ab6840f8'::uuid, 'a42ddedd-563d-4908-841f-2aa2b8b5ddee'::uuid),
  ('c6df31d1-2e15-4253-8f26-314bd1ab794f'::uuid, 'a42ddedd-563d-4908-841f-2aa2b8b5ddee'::uuid),
  ('f4e1c59f-0fd8-4dc1-8cd8-475fd4405b0e'::uuid, 'a42ddedd-563d-4908-841f-2aa2b8b5ddee'::uuid),
  ('6f494cc7-7748-465e-a236-c6805979afcb'::uuid, 'b3b89fed-dad4-4877-9083-1d91beb474d7'::uuid),
  ('4655e0b4-011f-48a8-a6e2-a0dcc3c5e7aa'::uuid, 'b4b53d7c-9e11-462c-b720-f3cbbd6b6954'::uuid),
  ('f7d97813-a364-4d5a-9dfb-9a369d5c7ceb'::uuid, 'b921053d-5b75-4f53-ac55-4a168e492589'::uuid),
  ('b0edf406-389a-499b-b681-91e99b2995cd'::uuid, 'b9af06bb-351c-40d8-be06-f67f1c382593'::uuid),
  ('a2e3d024-996e-4862-a7a4-d39443185c62'::uuid, 'bf34f0df-7810-4b41-9ff0-144f02dccc91'::uuid),
  ('5f37f4db-3240-4e75-bcdc-8a3fc73f773a'::uuid, 'c68e30d1-0edc-4528-ba41-af39e2cc4827'::uuid),
  ('2a967faf-e668-4d52-85a1-4a00e15d6d5e'::uuid, 'cbc3f410-ca7d-406d-b7c3-0d5d3821bc2e'::uuid),
  ('1bed51f0-00b7-455c-a114-ea36f576d43b'::uuid, 'cf067d0e-d0e1-43ad-bb3d-f798ddf68ddc'::uuid),
  ('279044d0-e250-4c54-8a86-0ae20476bdfa'::uuid, 'cf067d0e-d0e1-43ad-bb3d-f798ddf68ddc'::uuid),
  ('30ba0874-8526-4f67-9d37-75904d2c495c'::uuid, 'cf067d0e-d0e1-43ad-bb3d-f798ddf68ddc'::uuid),
  ('313cde73-c1c5-4166-8b92-e166d4fe8f85'::uuid, 'cf067d0e-d0e1-43ad-bb3d-f798ddf68ddc'::uuid),
  ('4afd7fda-4a0e-4fb8-a7f2-31f79d5912b1'::uuid, 'cf067d0e-d0e1-43ad-bb3d-f798ddf68ddc'::uuid),
  ('5fe1f961-cec2-4855-9976-d75fb11b0060'::uuid, 'cf067d0e-d0e1-43ad-bb3d-f798ddf68ddc'::uuid),
  ('6163d3da-0f76-46b7-a42a-380a81918829'::uuid, 'cf067d0e-d0e1-43ad-bb3d-f798ddf68ddc'::uuid),
  ('622e0e21-f721-4ae1-9eb3-91130e3f3676'::uuid, 'cf067d0e-d0e1-43ad-bb3d-f798ddf68ddc'::uuid),
  ('6dd72ac6-aa98-4a01-9bef-a4e10522b8e6'::uuid, 'cf067d0e-d0e1-43ad-bb3d-f798ddf68ddc'::uuid),
  ('74183956-b1b9-4f68-b23d-2476ff6769d2'::uuid, 'cf067d0e-d0e1-43ad-bb3d-f798ddf68ddc'::uuid),
  ('7825c326-f866-4317-8cd3-5f809098d6e4'::uuid, 'cf067d0e-d0e1-43ad-bb3d-f798ddf68ddc'::uuid),
  ('792a4fac-6f33-433b-8015-05656c0104b8'::uuid, 'cf067d0e-d0e1-43ad-bb3d-f798ddf68ddc'::uuid),
  ('c7b315ed-1bff-4394-9b5f-27110a1104dd'::uuid, 'cf067d0e-d0e1-43ad-bb3d-f798ddf68ddc'::uuid),
  ('d5002e51-3084-420f-9659-5442dedd943a'::uuid, 'cf067d0e-d0e1-43ad-bb3d-f798ddf68ddc'::uuid),
  ('df39a41e-25e3-444f-a980-4a3becf95a82'::uuid, 'cf067d0e-d0e1-43ad-bb3d-f798ddf68ddc'::uuid),
  ('e67fc653-ba67-4e9e-bf8a-b0f9c72a146b'::uuid, 'cf067d0e-d0e1-43ad-bb3d-f798ddf68ddc'::uuid),
  ('e7ccb52f-4d92-4d64-9031-800035203a64'::uuid, 'cf067d0e-d0e1-43ad-bb3d-f798ddf68ddc'::uuid),
  ('ebc62243-700c-45ac-b103-85d875c224b7'::uuid, 'cf067d0e-d0e1-43ad-bb3d-f798ddf68ddc'::uuid),
  ('f1ade360-a2de-46ac-92c4-f612eb127f39'::uuid, 'cf067d0e-d0e1-43ad-bb3d-f798ddf68ddc'::uuid),
  ('79f6433d-d785-4a98-b78d-2428510e3e1f'::uuid, 'dff4f880-8c29-4334-b10a-caceff0e8043'::uuid),
  ('de25a51f-69d3-44bb-8ace-7c968154113a'::uuid, 'e0ad90ff-373f-45e7-9a35-39e313528e7e'::uuid),
  ('875db8fb-6782-4a16-b98b-450a8922a12e'::uuid, 'e169a75e-c256-475a-9f2f-d83462997d2d'::uuid),
  ('9888d177-622c-44b7-b373-9f21b2fab37d'::uuid, 'e169a75e-c256-475a-9f2f-d83462997d2d'::uuid),
  ('bd0a0577-444d-411d-bf59-ba1a6c2544a6'::uuid, 'e169a75e-c256-475a-9f2f-d83462997d2d'::uuid),
  ('ea4cc95a-73b4-4bc9-8a88-ee2053c72395'::uuid, 'e169a75e-c256-475a-9f2f-d83462997d2d'::uuid),
  ('97c1e8d0-9e48-438b-83a6-7e19559ffe95'::uuid, 'e281c798-ba7b-447c-be72-6fe4e2849922'::uuid),
  ('ad288c91-6c6b-4801-a424-7d0bbb1a302c'::uuid, 'e3dc6d9c-5fce-420c-b08d-2f83515d35d9'::uuid),
  ('805ee4bf-fb9d-499f-92c2-e242e7edbc09'::uuid, 'e8213fe6-2b54-495d-bea9-cf1abedbea89'::uuid),
  ('8c007772-ef7e-4113-8c53-9e12e1ad7e8e'::uuid, 'eb7928e5-0c0b-48e8-9f71-7d95282fd75c'::uuid),
  ('20a8285c-4e2c-4973-8e47-cb121ad2b9b1'::uuid, 'f5ca3866-ee9e-4e13-8655-c7bb71e62ee2'::uuid),
  ('169f5499-3bb4-4eb1-82d9-89725c152b7b'::uuid, 'f853ae55-26f5-4d72-b853-9878cb689d13'::uuid)
)
update files.files f
   set parent_record_type = 'conversation', parent_record_id = a.cid
  from a join chat.conversation c on c.id = a.cid
 where f.id = a.fid and f.parent_record_type is null and f.created_by = c.created_by;

-- 3b. The dictation chunk its journal row names (same creator and organization).
update files.files f
   set parent_record_type = 'studio_recording_chunks', parent_record_id = c.id
  from transcripts.studio_recording_chunks c
 where c.file_id = f.id and f.parent_record_type is null
   and (f.created_by = c.created_by or f.organization_id = c.organization_id);

-- 3c. Every study session's recording (any visibility — the session is Confidential).
update files.files f
   set parent_record_type = 'study_session', parent_record_id = s.id
  from education.study_session s
 where s.session_audio_file_id = f.id and f.parent_record_type is null
   and (f.created_by = s.created_by or f.organization_id = s.organization_id);

-- 3d. Login captures: the profile the capture row names, else the one in the path (a profile that
--     no longer exists leaves the id empty: owner-only).
update files.files f
   set parent_record_type = 'browser_profile', parent_record_id = c.profile_id
  from browser.capture c
 where c.file_id = f.id and f.parent_record_type is null
   and (f.created_by = c.created_by or f.organization_id = c.organization_id);
update files.files f
   set parent_record_type = 'browser_profile',
       parent_record_id = (select p.id from browser.profile p
                            where p.id::text = substring(f.file_path from '^login-captures-[0-9a-f-]{36}/([0-9a-f-]{36})/')
                              and p.organization_id is not distinct from f.organization_id)
 where f.parent_record_type is null and f.file_path like 'login-captures-%';

-- 3e. Derived files whose source now has a record: follow it (sources adopted above already
--     carried their variants through files._variants_follow_their_source; this catches the rest).
update files.files f
   set parent_record_type = u.parent_type, parent_record_id = u.parent_id
  from files.files v cross join lateral files.ultimate_parent_record(v.parent_file_id) u
 where v.id = f.id and f.parent_record_type is null and f.parent_file_id is not null
   and u.parent_type is not null;

-- ── 4. Guard ────────────────────────────────────────────────────────────────────────────────────
create or replace function files.private_children_missing_parent()
 returns table(check_name text, file_id uuid, parent_type text, parent_id uuid)
 language plpgsql
 stable
 set search_path to 'pg_catalog'
as $function$
declare
  r record;
  v_args text[];
  i integer;
begin
  -- The parent types every writer below relies on.
  return query
    select 'parent_type_missing', null::uuid, t, null::uuid
      from unnest(array['conversation', 'dm_conversation', 'study_session', 'browser_profile',
                        'studio_recording_chunks', 'studio_session', 'coding_session']) t
     where not t = any(platform.child_parent_types('file'));

  -- Every adopter trigger this law relies on is present and enabled.
  return query
    select 'adopter_missing_or_disabled:' || x.tbl || '.' || x.tg, null::uuid, null::text, null::uuid
      from (values ('browser.capture', '_adopt_browser_capture_file'),
                   ('education.study_session', '_adopt_files_named_by_row'),
                   ('communication.dm_messages', '_adopt_dm_attachment'),
                   ('chat.tool_trace', '_adopt_chat_files'),
                   ('chat.conversation', '_adopt_chat_files'),
                   ('chat.message', '_adopt_chat_attachments'),
                   ('files.files', '_stamp_parent_record'),
                   ('files.files', '_variants_follow_their_source')) x(tbl, tg)
     where not exists (select 1 from pg_trigger t
                        where t.tgrelid = x.tbl::regclass and t.tgname = x.tg and t.tgenabled <> 'D');

  -- Every table registered with the generic adopter: a file its column names, made by the row's
  -- creator or held by its organization, has a parent.
  for r in select t.tgrelid::regclass::text as tbl, t.tgargs, t.tgenabled
             from pg_trigger t
            where t.tgfoid = 'files._adopt_files_named_by_row'::regproc and not t.tgisinternal loop
    select array_agg(a) into v_args
      from regexp_split_to_table(encode(r.tgargs, 'escape'), '\\000') a where a <> '';
    if r.tgenabled = 'D' then
      return query select 'adopter_missing_or_disabled:' || r.tbl, null::uuid, v_args[1], null::uuid;
    end if;
    for i in 2 .. coalesce(cardinality(v_args), 0) loop
      return query execute format(
        'select %L::text, f.id, %L::text, t.id from %s t join files.files f on f.id = t.%I
          where f.parent_record_type is null
            and (f.created_by = t.created_by or f.organization_id = t.organization_id)',
        'record_file_without_parent:' || r.tbl || '.' || v_args[i], v_args[1], r.tbl, v_args[i]);
    end loop;
  end loop;

  -- Login captures.
  return query
    select 'login_capture_without_parent', f.id, 'browser_profile', c.profile_id
      from browser.capture c join files.files f on f.id = c.file_id
     where f.parent_record_type is null
       and (f.created_by = c.created_by or f.organization_id = c.organization_id);
  return query
    select 'login_capture_without_parent', f.id, 'browser_profile', null::uuid
      from files.files f
     where f.parent_record_type is null and f.file_path like 'login-captures-%';

  -- Direct-message attachments.
  return query
    select 'dm_attachment_without_parent', f.id, 'dm_conversation', m.conversation_id
      from communication.dm_messages m
      cross join lateral unnest(files.chat_file_ids_in(m.media_metadata::text)) x(fid)
      join files.files f on f.id = x.fid
     where m.media_metadata is not null and f.parent_record_type is null
       and f.created_by = coalesce(m.sender_id, m.created_by);

  -- AI chat: attachments named in messages (files._adopt_chat_attachment_ids' rule) and files
  -- the chat produced or was handed (files._adopt_chat_output_ids' rule).
  return query
    select 'chat_file_without_parent', f.id, 'conversation', m.conversation_id
      from chat.message m
      join chat.conversation c on c.id = m.conversation_id
      cross join lateral unnest(files.chat_file_ids_in(coalesce(m.content::text, '') || ' ' || coalesce(m.user_content::text, ''))) x(fid)
      join files.files f on f.id = x.fid
     where strpos(coalesce(m.content::text, '') || coalesce(m.user_content::text, ''), '"file_id"') > 0
       and f.parent_record_type is null and f.visibility = 'personal' and f.created_by = c.created_by;
  return query
    select 'chat_file_without_parent', f.id, 'conversation', c.id
      from chat.conversation c
      cross join lateral unnest(files.chat_file_ids_in(c.variables::text)) x(fid)
      join files.files f on f.id = x.fid
     where strpos(coalesce(c.variables::text, ''), 'ile') > 0
       and f.parent_record_type is null and f.visibility = 'personal' and f.created_by = c.created_by
       and c.created_at <= f.created_at + interval '10 minutes';
  return query
    select 'chat_file_without_parent', f.id, 'conversation', c.id
      from chat.tool_trace t
      join chat.conversation c on c.id = t.conversation_id
      cross join lateral unnest(files.chat_file_ids_in(concat_ws(' ', t.args::text, t.metadata::text, t.result_preview))) x(fid)
      join files.files f on f.id = x.fid
     where f.parent_record_type is null and f.visibility = 'personal' and f.created_by = c.created_by
       and c.created_at <= f.created_at + interval '10 minutes';

  -- Derived files whose source belongs to a record.
  return query
    select 'derived_file_without_parent', f.id, u.parent_type, u.parent_id
      from files.files f cross join lateral files.ultimate_parent_record(f.parent_file_id) u
     where f.parent_record_type is null and f.parent_file_id is not null and u.parent_type is not null;
end;
$function$;

comment on function files.private_children_missing_parent() is
  'Access ladder T-13 2.1 guard: one row per file that a Private/Confidential record link names '
  'but that has no parent record, per missing or disabled adopter trigger, and per missing file '
  'parent type. Zero rows or it failed (pnpm check:private-files-have-parents).';
