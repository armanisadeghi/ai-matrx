-- chair-step: inverse of accesssetup_c — removes the hr_review access setup row, archives the upper_management builtin HR role (refused if anyone holds it), and drops the review stage, row-facts and seat-resolver functions with their door declarations. No live door calls any of them before the swap step.
-- lane: access-setup
-- lock: hr,iam

delete from iam.access_setup where entity_type = 'hr_review';
do $$
begin
  if exists (select 1 from hr.role_assignment where role_key = 'upper_management' and is_active and revoked_at is null) then
    raise exception 'upper_management is assigned to someone; revoke those assignments first';
  end if;
end $$;
select hr.arm_write();
update hr.access_role set deleted_at = now(), is_active = false
 where role_key = 'upper_management' and organization_id = '39c38960-d30c-4840-b0c1-c9960de95582' and deleted_at is null;
delete from platform.client_callable_door where schema_name = 'hr' and function_name in (
  '_review_logins_of_employment', '_review_org_capable', '_review_orgs_capable', '_review_skip_level_on',
  'review_stages', 'review_row_facts', 'review_seat_employee', 'review_seat_employee_set', 'review_seat_manager',
  'review_seat_manager_set', 'review_seat_hr', 'review_seat_hr_set', 'review_seat_upper_in_org', 'review_seat_upper',
  'review_seat_upper_set', 'review_seat_skip_level', 'review_seat_skip_level_set', 'review_seat_peers', 'review_seat_peers_set');
drop function if exists hr.review_seat_peers_set(uuid);
drop function if exists hr.review_seat_peers(uuid);
drop function if exists hr.review_seat_skip_level_set(uuid);
drop function if exists hr.review_seat_skip_level(uuid);
drop function if exists hr.review_seat_upper_set(uuid);
drop function if exists hr.review_seat_upper(uuid);
drop function if exists hr.review_seat_upper_in_org(uuid, uuid);
drop function if exists hr.review_seat_hr_set(uuid);
drop function if exists hr.review_seat_hr(uuid);
drop function if exists hr.review_seat_manager_set(uuid);
drop function if exists hr.review_seat_manager(uuid);
drop function if exists hr.review_seat_employee_set(uuid);
drop function if exists hr.review_seat_employee(uuid);
drop function if exists hr.review_row_facts(text, uuid);
drop function if exists hr.review_stages(uuid);
drop function if exists hr._review_skip_level_on(uuid);
drop function if exists hr._review_orgs_capable(uuid, text);
drop function if exists hr._review_org_capable(uuid, text);
drop function if exists hr._review_logins_of_employment(uuid);
