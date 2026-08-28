-- HR L5 administrator and leave-case doors are authenticated-only. New public
-- functions inherit EXECUTE for PUBLIC and anon unless both grants are revoked.

revoke execute on function public.hr_leave_policy_list(uuid) from public, anon;
revoke execute on function public.hr_leave_policy_validate(uuid,jsonb) from public, anon;
revoke execute on function public.hr_leave_policy_save(uuid,jsonb,boolean) from public, anon;
revoke execute on function public.hr_leave_enroll(uuid,uuid[],date) from public, anon;
revoke execute on function public.hr_leave_balances(uuid,text,jsonb) from public, anon;
revoke execute on function public.hr_leave_calendar(uuid,date,date,jsonb) from public, anon;
revoke execute on function public.hr_leave_adjust(uuid,uuid,text,numeric,text,text,boolean) from public, anon;

revoke execute on function public.hr_leave_case_open(uuid,text,text,date,numeric,text,date,boolean,uuid[],uuid) from public, anon;
revoke execute on function public.hr_leave_case_get(uuid) from public, anon;
revoke execute on function public.hr_leave_case_list(uuid) from public, anon;
revoke execute on function public.hr_leave_case_entitlement(uuid,date) from public, anon;
revoke execute on function public.hr_leave_reinstate_on_rehire(uuid) from public, anon;

grant execute on function public.hr_leave_policy_list(uuid) to authenticated;
grant execute on function public.hr_leave_policy_validate(uuid,jsonb) to authenticated;
grant execute on function public.hr_leave_policy_save(uuid,jsonb,boolean) to authenticated;
grant execute on function public.hr_leave_enroll(uuid,uuid[],date) to authenticated;
grant execute on function public.hr_leave_balances(uuid,text,jsonb) to authenticated;
grant execute on function public.hr_leave_calendar(uuid,date,date,jsonb) to authenticated;
grant execute on function public.hr_leave_adjust(uuid,uuid,text,numeric,text,text,boolean) to authenticated;

grant execute on function public.hr_leave_case_open(uuid,text,text,date,numeric,text,date,boolean,uuid[],uuid) to authenticated;
grant execute on function public.hr_leave_case_get(uuid) to authenticated;
grant execute on function public.hr_leave_case_list(uuid) to authenticated;
grant execute on function public.hr_leave_case_entitlement(uuid,date) to authenticated;
grant execute on function public.hr_leave_reinstate_on_rehire(uuid) to authenticated;
