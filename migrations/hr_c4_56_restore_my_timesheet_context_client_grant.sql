-- The first hr_c4_55 bytes created this authenticated self-service door before
-- declaring it to the definer-grant guard. The guard correctly revoked the
-- grant. Declare the narrowly self-scoped door first, then restore and verify
-- the intended authenticated-only execute privilege.

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, declared_by, reason)
values
  ('public', 'hr_my_timesheet_context', 'p_employment_id uuid',
   'hr_c4_56',
   'Route /hr/me/timesheet resolves only the authenticated caller own employment and current pay period through this wrapper.')
on conflict (schema_name, function_name, identity_args) do update
  set declared_by = excluded.declared_by,
      reason = excluded.reason,
      declared_at = now();

revoke all on function public.hr_my_timesheet_context(uuid) from public;
revoke all on function public.hr_my_timesheet_context(uuid) from anon;
grant execute on function public.hr_my_timesheet_context(uuid) to authenticated, service_role;

do $verify$
begin
  if not has_function_privilege(
    'authenticated', 'public.hr_my_timesheet_context(uuid)', 'EXECUTE'
  ) then
    raise exception 'hr_c4_56: authenticated grant did not survive the definer grant guard';
  end if;

  if has_function_privilege(
    'anon', 'public.hr_my_timesheet_context(uuid)', 'EXECUTE'
  ) then
    raise exception 'hr_c4_56: anon can execute a self-scoped employee door';
  end if;
end $verify$;
