-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- based-on: custom.work_assign(uuid, uuid, uuid, timestamp with time zone, boolean) 35852f505a8f352a78041fdbf50e4ca5ff2fbe681f15393445cce054b551a369
--
-- CHECKLISTS — A CLASS DEFECT IN THE WORK LAYER, found the first time anything assigned a row
-- to the person who had just written it.
--
-- `custom.work_assign` does two things in one transaction: it puts a name on the row, and it
-- gives that person access to it. The second half called `custom.share_grant` unconditionally.
-- `custom.share_grant` refuses — rightly — to hand somebody a rung BELOW one they already
-- hold: *"That person already owns this record, which is the rung above every level you could
-- grant"* (VIS-25; the owner of a record is whoever created it). So EVERY generator that
-- writes a row and then assigns it to its own author failed on its first row — a checklist
-- run, an import, a template instantiation, a scheduled job — and failed because of the half
-- of the work that was ALREADY DONE.
--
-- Measured on the main database, 2026-09-20 15:24 UTC, from lane CHECKLISTS' green suite: an
-- onboarding run whose first step belonged to the admin who started it died at
-- `custom.share_grant` with that sentence, and no step was created at all.
--
-- THE FIX IS THE CLASS, NOT THE CALLER. `custom.work_assign` asks what that person already
-- reaches (`custom.effective_level`, the one ladder's own answer) and skips the grant when it
-- is editor or better, saying so in the `access` sentence it returns. Nothing is granted below
-- anything, nothing is revoked, and an assignment to somebody with NO access still grants
-- exactly what it always did.
--
-- The inverse is `migrations/inverse/checklists_assigning_somebody_their_own_row_down.sql`.

set lock_timeout = '45s';

create or replace function custom.work_assign(p_organization_id uuid, p_record_id uuid, p_assignee_user_id uuid, p_due_date timestamp with time zone DEFAULT NULL::timestamp with time zone, p_clear_due boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_person  uuid;
  v_was     uuid;
  v_patch   jsonb := '{}'::jsonb;
  v_share   jsonb;
  v_name    text;
  v_row     custom.record;
  v_version integer;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.work_assign');
  -- Handing a row to somebody is a CHANGE to that row, so it asks the rung a change asks.
  perform custom.assert_client_may_change(p_organization_id, p_record_id, 'custom.work_assign',
                                          'editor'::public.permission_level, 'record');

  select r.* into v_row from custom.record r
   where r.organization_id = p_organization_id and r.id = p_record_id and r.deleted_at is null;
  if v_row.id is null then
    raise exception 'There is no such record in this organization, so it cannot be assigned.'
      using errcode = '02000';
  end if;
  if not custom.work_has_assignment(p_organization_id, v_row.table_id) then
    raise exception 'This table does not do assignments yet, so nobody can be given one of its records.'
      using errcode = '0A000',
            hint = 'REC-69: turn assignments on for the table first — that adds Assignee, Due date and Status as real columns. An admin of the table does it in one step.';
  end if;

  v_was := nullif(v_row.data ->> 'assignee', '')::uuid;

  if p_assignee_user_id is null then
    v_patch := jsonb_build_object('assignee', null);
  else
    v_person := custom.work_person(p_organization_id, p_assignee_user_id, true);
    v_patch := jsonb_build_object('assignee', v_person::text);
  end if;

  if p_clear_due then
    v_patch := v_patch || jsonb_build_object('due_date', null);
  elsif p_due_date is not null then
    v_patch := v_patch || jsonb_build_object(
      'due_date', to_char(p_due_date at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
  end if;

  -- THROUGH THE STORE'S OWN UPDATE DOOR, so the value carries its envelope, the validators
  -- run, and `zzz_history_capture` files this change in the SAME transaction as the share.
  v_version := custom.record_update(p_organization_id, p_record_id, v_patch, null);

  if p_assignee_user_id is not null then
    -- AND THE ACCESS. An assignment that did not give access would put a row in somebody's
    -- inbox that they are refused when they click it.
    --
    -- UNLESS THEY ALREADY REACH IT. `custom.share_grant` refuses, correctly, to grant a rung
    -- BELOW one somebody already holds — "That person already owns this record, which is the
    -- rung above every level you could grant" — and the owner of a record is whoever created
    -- it. So a Table whose rows are made by the same person who is then given them (a
    -- checklist run, an import, any generator that assigns as it writes) hit that refusal on
    -- its first row, and the whole assignment failed because of the half of it that was
    -- already true. Giving somebody a row they already reach is not an error; it is nothing to
    -- do. Found by lane CHECKLISTS on 2026-09-20, whose runner creates every step and then
    -- hands it to the person the checklist names.
    if custom.effective_level(p_assignee_user_id, p_organization_id, p_record_id, 'record')
       >= 'editor'::public.permission_level then
      v_share := jsonb_build_object('message',
        'They could already open and change this, so nothing about access needed to change.');
    else
      v_share := custom.share_grant(p_organization_id, p_record_id, 'person', p_assignee_user_id,
                                    'editor'::public.permission_level);
    end if;
    select r.data ->> 'name' into v_name from custom.record r
     where r.organization_id = p_organization_id and r.id = v_person;
  end if;

  return jsonb_build_object(
    'record_id',   p_record_id,
    'assigned',    p_assignee_user_id is not null,
    'assignee',    v_person,
    'assignee_user_id', p_assignee_user_id,
    'assignee_name', v_name,
    'was',         v_was,
    'due_date',    case when p_clear_due then null else p_due_date end,
    'version',     v_version,
    'access',      coalesce(v_share -> 'message', to_jsonb(
                     'Nobody holds this now. Whatever access was already given stays as it was — '
                     'taking a name off a row is not a reason to take somebody''s access away.'::text)),
    'message',     case when p_assignee_user_id is null
                        then 'Nobody is assigned to this now.'
                        else format('%s has this now, and can edit it.', coalesce(v_name, 'That person')) end);
end
$function$
