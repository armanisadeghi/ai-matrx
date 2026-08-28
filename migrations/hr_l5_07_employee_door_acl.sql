-- HR L5 leave doors are authenticated-only. PostgreSQL grants EXECUTE on new
-- functions to PUBLIC by default, so the authenticated grants in L5_04 did not
-- by themselves keep the wrappers out of the anon PostgREST role.

revoke execute on function public.hr_my_time_off(uuid) from public, anon;
revoke execute on function public.hr_leave_request_preview(uuid,uuid,date,date,jsonb) from public, anon;
revoke execute on function public.hr_leave_request_submit(uuid,uuid,date,date,jsonb,uuid,text,uuid,text) from public, anon;
revoke execute on function public.hr_leave_request_cancel(uuid,text,numeric) from public, anon;
revoke execute on function public.hr_leave_ledger_view(uuid,uuid,date) from public, anon;

grant execute on function public.hr_my_time_off(uuid) to authenticated;
grant execute on function public.hr_leave_request_preview(uuid,uuid,date,date,jsonb) to authenticated;
grant execute on function public.hr_leave_request_submit(uuid,uuid,date,date,jsonb,uuid,text,uuid,text) to authenticated;
grant execute on function public.hr_leave_request_cancel(uuid,text,numeric) to authenticated;
grant execute on function public.hr_leave_ledger_view(uuid,uuid,date) to authenticated;
