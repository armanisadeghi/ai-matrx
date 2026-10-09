-- lane: HR-360-REC
--
-- HR-360-REC (2026-10-09): THE RECORDING AND TRANSCRIPT OF A CONFIDENTIAL MEETING ARE FILES UNDER THE
-- REVIEW'S CONFIDENTIAL NOTES ROW. Builds on hr360w3_a (capture off by stamp; knob meet.confidential_capture
-- decides whether an organization may turn it on) and ENTITY-IDS 1-4 (a file whose parent is a store row is
-- readable only by that row's readers, is never published or Anyone-linked).
--   1. communication.meet_link_capture_to_notes(review_id, notes_id): the host of the live meeting(s) whose app
--      panel names the review, and who edits the Confidential notes row, records that row as the meeting's
--      artifacts parent (metadata.app_panel.artifacts_record_id — the key hr360w3_a already reads). Client door.
--   2. communication.meet_attach_capture_file(meeting_id, file_id): server-only. Makes a recording or transcript
--      file a child of the meeting's artifacts row (parent_record_type 'record'), never published. Refuses a file
--      of another organization, a file already under another parent, a meeting with no artifacts row.
-- No RLS policy, no security function and no existing body is edited. Nothing is migrated.
-- Proof (rolled back): scripts/campaign-tests/hr360rec_capture_files_follow_the_notes_row_proof.sql
-- Inverse: migrations/inverse/hr360rec_a_a_confidential_meetings_files_live_under_the_notes_row_down.sql

set local statement_timeout = '60s';

create or replace function communication.meet_link_capture_to_notes(p_review_id uuid, p_notes_id uuid)
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
-- Client door. The caller must host the meeting and edit the Confidential notes row; the row must be Confidential.
declare
  v_uid uuid := auth.uid();
  v_n integer;
begin
  if v_uid is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  if p_review_id is null or p_notes_id is null then
    raise exception 'A review and its notes row are both required.' using errcode = '22023';
  end if;
  if custom.confidential_anchor(p_notes_id) is null then
    raise exception 'Only a Confidential row can hold a meeting''s recording and transcript.' using errcode = '22023';
  end if;
  if not iam.has_access_for(v_uid, 'record', p_notes_id, 'editor'::public.permission_level) then
    raise exception 'You do not edit this notes row.' using errcode = '42501';
  end if;
  update communication.meet_meetings m
     set metadata = jsonb_set(m.metadata, '{app_panel,artifacts_record_id}', to_jsonb(p_notes_id::text), true)
   where m.deleted_at is null
     and m.host_user_id = v_uid
     and m.metadata #>> '{app_panel,record_id}' = p_review_id::text
     and coalesce(m.metadata #>> '{app_panel,artifacts_record_id}', '') <> p_notes_id::text;
  get diagnostics v_n = row_count;
  return v_n;
end
$function$;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, declared_by, reason,
   anonymous_callers, signed_in_callers, argument_rules)
values
  ('communication', 'meet_link_capture_to_notes', 'p_review_id uuid, p_notes_id uuid',
   array['uuid'::regtype::oid, 'uuid'::regtype::oid],
   'migrations/campaign/hr360rec_a_a_confidential_meetings_files_live_under_the_notes_row.sql (lane HR-360-REC)',
   'HR-360-REC: a meeting host who edits a Confidential notes row records it as the parent of the meeting''s recording and transcript files. Checks the caller (auth.uid()) hosts the meeting and edits the row; answers only a count.',
   false, true,
   '{"version": 1, "arguments": {"p_review_id": {"type": "uuid", "check": "only meetings the caller hosts whose app panel names this id are touched", "foreign": {"note": "A review id that no meeting of the caller names changes nothing and answers 0.", "bounded": true}, "optional": false, "position": 1, "null_rule": {"sqlstate": "22023", "says": "p_review_id"}}, "p_notes_id": {"type": "uuid", "check": "custom.confidential_anchor(p_notes_id) is not null and iam.has_access_for(caller, record, p_notes_id, editor)", "access": "editor", "entity": "record", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "optional": false, "position": 2, "null_rule": {"sqlstate": "22023", "says": "p_notes_id"}}}}'::jsonb)
on conflict do nothing;
grant execute on function communication.meet_link_capture_to_notes(uuid, uuid) to authenticated;

create or replace function communication.meet_attach_capture_file(p_meeting_id uuid, p_file_id uuid)
returns boolean
language plpgsql
security definer
set search_path to ''
as $function$
-- Server-only. True when the file now sits under the meeting's artifacts row; false when the meeting has none
-- (an ordinary meeting — nothing to do). Raises when the file cannot be attached (other organization, other parent).
declare
  v_art uuid;
  v_org uuid;
  v_f record;
begin
  -- Server-only: a signed-in client (auth.uid() set) is refused; the server's own connection carries no user.
  if auth.uid() is not null then
    raise exception 'meet_attach_capture_file is a server step.' using errcode = '42501';
  end if;
  select nullif(m.metadata #>> '{app_panel,artifacts_record_id}', '')::uuid, m.organization_id
    into v_art, v_org
    from communication.meet_meetings m where m.id = p_meeting_id;
  if v_art is null then
    return false;
  end if;
  select f.organization_id, f.parent_record_type, f.parent_record_id into v_f
    from files.files f where f.id = p_file_id and f.deleted_at is null;
  if not found then
    raise exception 'meet_attach_capture_file: file % does not exist', p_file_id using errcode = 'P0002';
  end if;
  if v_f.organization_id is distinct from v_org then
    raise exception 'meet_attach_capture_file: the file belongs to another organization than the meeting' using errcode = '42501';
  end if;
  if v_f.parent_record_id is not null and v_f.parent_record_id is distinct from v_art then
    raise exception 'meet_attach_capture_file: the file already sits under another record' using errcode = '23505';
  end if;
  update files.files
     set parent_record_type = 'record', parent_record_id = v_art, published_to_web = false
   where id = p_file_id;
  return true;
end
$function$;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by, non_client_lane,
   signed_in_callers, anonymous_callers)
values
  ('communication', 'meet_attach_capture_file', 'p_meeting_id uuid, p_file_id uuid',
   array['uuid'::regtype::oid, 'uuid'::regtype::oid],
   'HR-360-REC: moves one meeting recording or transcript file under the meeting''s Confidential notes row. Takes ids only, answers a boolean.',
   'migrations/campaign/hr360rec_a_a_confidential_meetings_files_live_under_the_notes_row.sql (lane HR-360-REC)',
   'server_only: called by aidream services/meet/confidential_artifacts.py after a recording or transcript file is written; no client ever calls it, so it holds no client EXECUTE.',
   false, false)
on conflict do nothing;
