-- lane: HR-360
--
-- HR-360 WAVE 3 (2026-10-08): A MEETING ABOUT A CONFIDENTIAL RECORD CAPTURES NOTHING BY DEFAULT, AND
-- EVERY OPEN OF A CONFIDENTIAL ROW OR FILE IS LOGGED. Plan: common-docs/systems/human-resources/
-- employee-performance-reviews/PLAN.md, "Wave 3 changes after the plan attack".
--   1. CAPTURE OFF BY STAMP, KEPT OFF BY THE DOOR. A meeting whose app panel names a Confidential store
--      row is written with ai_enabled = false and recording_policy = 'disabled' and carries
--      metadata.capture_hold = 'confidential_record'; turning either back on — through
--      meet_update_meeting OR a direct UPDATE — is refused (42501) unless the organization's knob
--      meet.confidential_capture is on. A BEFORE trigger on meet_meetings, so no write path walks around it.
--   4. OPENS ARE LOGGED. iam.open_confidential_audited(type, id, purpose) answers {granted, audit_id} and
--      writes iam.access_audit on both paths (a refusal is a row with granted = false, never a raise).
-- NOT HERE — primitive 3 ("a file follows its record": `record` in platform.child_parent_types('file')).
--   Measured 2026-10-08 in a rolled-back transaction: with one file whose parent is a store row, a
--   files.files read as a member never returns, because the files read policy's child lane
--   (iam.accessible_child_parents) expands iam.accessible_entity_ids('record', viewer) — every record the
--   reader can see — and that alone exceeds 45 s for admin@admin.com. Shipping it would stall every file
--   read on the platform. Returned to the owner for a kernel ruling.
-- No RLS policy and no security function (custom.confidential_answer, iam.has_access*) is edited.
-- Proof, RED before / GREEN after: scripts/campaign-tests/hr360w3_confidential_meeting_artifacts_red_green.sql
-- Inverse: migrations/inverse/hr360w3_a_confidential_meetings_capture_nothing_and_opens_are_logged_down.sql

set local statement_timeout = '60s';

-- ── 1. the knob ─────────────────────────────────────────────────────────────────────────────────
insert into platform.feature_knob
  (feature, key, label, description, basis, value_type, default_value, value, overridable_by,
   override_direction, delegable, propagation, public_read, set_by, review_due)
values
  ('meet', 'confidential_capture', 'Capture in confidential meetings',
   'Whether a meeting about a Confidential record may turn on the AI note-taker or recording. Off: they stay off.',
   'HR-360 wave 3: live transcript segments and Meet notes are Organization-level rows, so a confidential meeting captures nothing unless the organization decides otherwise.',
   'boolean', 'false'::jsonb, 'false'::jsonb, array['organization'], 'any', true, 'next_load', false, 'agent', '2026-12-08')
on conflict (feature, key) do nothing;

-- ── 1. is this meeting about a Confidential record? ────────────────────────────────────────────
create or replace function communication.meet_carries_confidential_record(p_metadata jsonb)
returns boolean
language plpgsql
stable
security definer
set search_path to ''
as $function$
-- HR-360 wave 3. True when the meeting's app panel names a store row (record_id or
-- artifacts_record_id) that answers to a Confidential row (custom.confidential_anchor).
declare
  v_id text;
begin
  foreach v_id in array array[p_metadata #>> '{app_panel,record_id}', p_metadata #>> '{app_panel,artifacts_record_id}'] loop
    continue when v_id is null or v_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
    if custom.confidential_anchor(v_id::uuid) is not null then
      return true;
    end if;
  end loop;
  return false;
end
$function$;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by, non_client_lane,
   signed_in_callers, anonymous_callers)
values
  ('communication', 'meet_carries_confidential_record', 'p_metadata jsonb', array['jsonb'::regtype::oid],
   'HR-360 wave 3: reads a meeting''s metadata (no entity-id argument; the record ids inside it are only passed to custom.confidential_anchor, which answers a level, never a row). NULL metadata answers false.',
   'migrations/campaign/hr360w3_a_confidential_meetings_capture_nothing_and_opens_are_logged.sql (lane HR-360)',
   'server_only: called by the meet_meetings trigger communication._meet_confidential_capture; no client ever calls it, so it holds no client EXECUTE.',
   false, false)
on conflict do nothing;

create or replace function communication._meet_confidential_capture()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
-- HR-360 wave 3, primitive 1: CAPTURE OFF BY STAMP, KEPT OFF BY THE DOOR.
declare
  v_on boolean;
begin
  if not communication.meet_carries_confidential_record(new.metadata) then
    return new;
  end if;
  -- First time this meeting is about a Confidential record: stamp capture off.
  if tg_op = 'INSERT' or not communication.meet_carries_confidential_record(old.metadata) then
    new.ai_enabled := false;
    new.recording_policy := 'disabled';
    new.metadata := coalesce(new.metadata, '{}'::jsonb) || jsonb_build_object('capture_hold', 'confidential_record');
    return new;
  end if;
  -- Turning either back on is the organization's call.
  if (new.ai_enabled and not old.ai_enabled)
     or (new.recording_policy is distinct from 'disabled' and old.recording_policy = 'disabled') then
    v_on := coalesce((platform.knob_resolve('meet', 'confidential_capture', new.organization_id, auth.uid(), null) #>> '{}')::boolean, false);
    if not v_on then
      raise exception 'This meeting is about a confidential record, so the note-taker and recording stay off. An organization admin can allow them with the setting "Capture in confidential meetings".'
        using errcode = '42501';
    end if;
  end if;
  return new;
end
$function$;

create trigger _meet_confidential_capture
  before insert or update on communication.meet_meetings
  for each row execute function communication._meet_confidential_capture();

-- ── 4. the audited open door ───────────────────────────────────────────────────────────────────
create or replace function iam.open_confidential_audited(p_type text, p_id uuid, p_purpose text default 'read')
returns jsonb
language plpgsql
volatile
security definer
set search_path to ''
as $function$
-- HR-360 wave 3, primitive 4 (the hr_c3_06 audited-door pattern). Asks the platform's one check
-- (iam.has_access_for) whether the caller may read a store row or a file, and RECORDS THE OPEN in
-- iam.access_audit on BOTH paths. A refusal RETURNS {granted:false, reason, audit_id} — never a raise,
-- which would roll the audit row back. The envelope never carries the row: on a grant the caller
-- reads it through its ordinary door. A row that does not exist answers the same refusal, unlogged
-- (there is no organization to log it in).
declare
  v_uid uuid := auth.uid();
  v_org uuid;
  v_anchor uuid;
  v_granted boolean;
  v_audit uuid;
  v_name text;
begin
  if v_uid is null then
    return jsonb_build_object('granted', false, 'reason', 'Sign in first.', 'audit_id', null);
  end if;
  if p_type is null or p_type not in ('record', 'file') then
    raise exception 'iam.open_confidential_audited: type is record or file (got %)', p_type using errcode = '22023';
  end if;
  if p_type = 'record' then
    select r.organization_id into v_org from custom.record r where r.id = p_id and r.deleted_at is null;
    if v_org is not null then
      v_anchor := custom.confidential_anchor(p_id);
    end if;
  else
    select f.organization_id,
           case when f.parent_record_type = 'record' then custom.confidential_anchor(f.parent_record_id) end,
           f.file_name
      into v_org, v_anchor, v_name
      from files.files f where f.id = p_id and f.deleted_at is null;
  end if;
  if v_org is null then
    return jsonb_build_object('granted', false, 'reason', 'This is not open to you.', 'audit_id', null);
  end if;
  v_granted := iam.has_access_for(v_uid, p_type, p_id, 'viewer'::public.permission_level);
  v_audit := iam._record_access_audit(
    p_organization_id => v_org,
    p_action => 'read',
    p_target_token => p_type,
    p_data_class => case when v_anchor is not null then 'confidential' else 'organization' end,
    p_purpose => coalesce(nullif(btrim(p_purpose), ''), 'read'),
    p_basis => case when v_granted then 'record_reader' else 'refused' end,
    p_granted => v_granted,
    p_target_ids => array[p_id],
    p_row_count => case when v_granted then 1 else 0 end,
    p_denial_reason => case when v_granted then null else 'not a reader of this record' end,
    p_is_emergency_door => false,
    p_actor_user_id => v_uid);
  if not v_granted then
    return jsonb_build_object('granted', false, 'reason', 'This is not open to you.', 'audit_id', v_audit);
  end if;
  return jsonb_strip_nulls(jsonb_build_object('granted', true, 'audit_id', v_audit,
    'confidential', v_anchor is not null, 'file_name', v_name));
end
$function$;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, declared_by, reason,
   anonymous_callers, signed_in_callers)
values
  ('iam', 'open_confidential_audited', 'p_type text, p_id uuid, p_purpose text',
   array['text'::regtype::oid, 'uuid'::regtype::oid, 'text'::regtype::oid],
   'migrations/campaign/hr360w3_a_confidential_meetings_capture_nothing_and_opens_are_logged.sql (lane HR-360)',
   'HR-360 wave 3: the audited open of a store row or a file. Answers only granted/refused from iam.has_access_for for the CALLER (auth.uid()), never the row; writes one iam.access_audit row per open, granted or not (a refusal by a non-member is not logged, per iam._record_access_audit).',
   false, true)
on conflict do nothing;
grant execute on function iam.open_confidential_audited(text, uuid, text) to authenticated;
