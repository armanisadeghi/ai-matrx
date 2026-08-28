-- hr_l1_46_the_repair_door_is_not_public.sql
--
-- SECURITY DEFINER functions receive PostgreSQL's default PUBLIC execute grant when
-- created. The repair door is for authenticated HR administrators only, so revoke the
-- implicit grants explicitly before restoring the intended authenticated grant.

revoke all on function public.hr_employee_grant_missing_membership(uuid) from public;
revoke all on function public.hr_employee_grant_missing_membership(uuid) from anon;
grant execute on function public.hr_employee_grant_missing_membership(uuid) to authenticated;
