-- chair-step: it restores the byte-exact `custom.work_assign` body that WORK-DOORS landed, so
--   the red twin can plant the real pre-fix bytes and show the refusal was real. It replaces
--   one function with the version the catalogue held at 15:24 UTC on 2026-09-20 and touches
--   nothing else.
--
-- CHECKLISTS — the inverse of `checklists_assigning_somebody_their_own_row.sql`.

set lock_timeout = '2s';

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
    v_share := custom.share_grant(p_organization_id, p_record_id, 'person', p_assignee_user_id,
                                  'editor'::public.permission_level);
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

