-- hr_l1_45_the_repair_door.sql
--
-- 🚨 THE ONLY STATE IN THE SYSTEM WITH NO WAY OUT.
-- hr_l1_44 stops NEW unreachable people. This reaches the ones the old path already made:
-- they cannot be invited (`hr_employee_invite` refuses — "already signs in here") and they
-- cannot reach HR (no membership). Before this door there was nothing left to try.
--
-- It grants the ONE thing missing, through the platform's own membership door
-- (`public.mbr_add`) rather than writing `iam.memberships` directly, and it is a no-op for
-- anybody not actually stranded: this repairs a defect, it is not a second way to hand out
-- access. Standing is required — owner, admin, or `role.assign` on that employer.
--
-- A kiosk-only employee (no login) is NOT a defect and is refused by name: SPEC-ACCESS
-- T-17 makes that a first-class record, and "repairing" it would hand somebody a login
-- they were never meant to have.
--
-- Applied live 2026-08-28 and ledgered. Proven on a real stranded record: before,
-- `hr_my_context -> 'active'` was jsonb null and the employer was absent from the person's
-- employer list; after, `active` is an object and the employer is listed.

create or replace function public.hr_employee_grant_missing_membership(p_employee_id uuid)
returns jsonb language plpgsql security definer set search_path = public, hr, iam as $fn$
declare v_uid uuid := auth.uid(); v_e hr.employee%rowtype; v_has boolean;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'no_caller',
      'detail', 'Repairing access needs an authenticated caller.');
  end if;

  select * into v_e from hr.employee where id = p_employee_id and deleted_at is null;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found', 'field', 'employee_id',
      'detail', 'There is no such employee here.');
  end if;

  if not (hr._l1_org_role(v_uid, v_e.organization_id) in ('owner','admin')
          or hr.capability(v_uid, 'role.assign', null, current_date, v_e.organization_id)) then
    return jsonb_build_object('ok', false, 'reason', 'no_standing',
      'detail', 'Repairing somebody''s access to this employer needs owner, admin or '
             || 'role-assignment standing.');
  end if;

  if v_e.login_user_id is null then
    return jsonb_build_object('ok', false, 'reason', 'no_login', 'field', 'login_user_id',
      'detail', 'This person has no platform login, so there is nothing to repair — a '
             || 'kiosk-only employee is a first-class record. Invite them if they need one.');
  end if;

  select exists (
    select 1 from iam.memberships m
     where m.user_id = v_e.login_user_id and m.organization_id = v_e.organization_id
       and m.container_type = 'organization' and m.deleted_at is null
       and coalesce(m.status,'active') = 'active') into v_has;

  if v_has then
    return jsonb_build_object('ok', true, 'repaired', false, 'reason', 'already_reachable',
      'detail', 'This person is already a member of this employer; nothing needed repairing.');
  end if;

  perform public.mbr_add('organization', v_e.organization_id, v_e.login_user_id,
                         v_e.organization_id, 'member', 'active',
                         jsonb_build_object('granted_by', 'hr_employee_grant_missing_membership',
                                            'reason', 'link_at_create_wrote_no_membership'));

  return jsonb_build_object('ok', true, 'repaired', true,
    'employee_id', v_e.id, 'organization_id', v_e.organization_id,
    'detail', 'Access repaired — they are a member of this employer now and can reach '
           || 'their own HR record.');
end $fn$;

grant execute on function public.hr_employee_grant_missing_membership(uuid) to authenticated;
