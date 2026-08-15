-- Read-only contract checks for the authenticated task-reminder preference RPCs.
do $$
declare
  getter regprocedure := to_regprocedure(
    'communication.get_my_sms_task_notification_preference(text)'
  );
  setter regprocedure := to_regprocedure(
    'communication.configure_my_sms_task_notifications(boolean,text)'
  );
begin
  if getter is null or setter is null then
    raise exception 'SMS task-notification preference RPCs are missing';
  end if;

  if not has_function_privilege('authenticated', getter, 'EXECUTE')
     or not has_function_privilege('authenticated', setter, 'EXECUTE') then
    raise exception 'authenticated must be able to execute both preference RPCs';
  end if;

  if has_function_privilege('anon', getter, 'EXECUTE')
     or has_function_privilege('anon', setter, 'EXECUTE') then
    raise exception 'anon must not execute SMS task-notification preference RPCs';
  end if;

  if not (
    select p.prosecdef
    from pg_proc p
    where p.oid = getter::oid
  ) or not (
    select p.prosecdef
    from pg_proc p
    where p.oid = setter::oid
  ) then
    raise exception 'preference RPCs must retain their auth.uid()-gated SECURITY DEFINER boundary';
  end if;
end;
$$;
