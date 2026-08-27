begin;

do $test$
declare
  v_admin uuid;
  v_task uuid;
  v_result jsonb;
begin
  select a.user_id into strict v_admin
  from admin.admins a
  order by a.created_at
  limit 1;

  select t.id into strict v_task
  from workspace.tasks t
  where t.deleted_at is null
    and t.created_by is distinct from v_admin
    and not exists (
      select 1
      from iam.organization_member member
      where member.user_id = v_admin
        and member.organization_id = t.organization_id
    )
  order by t.created_at
  limit 1;

  perform set_config('request.jwt.claim.sub', v_admin::text, true);

  if not public.is_platform_admin() then
    raise exception 'Fixture user is not recognized by the platform-admin policy lane';
  end if;

  v_result := public.get_task_associations(v_task);
  if v_result ->> 'task_id' <> v_task::text then
    raise exception 'Platform-admin task association read returned the wrong task';
  end if;
end
$test$;

rollback;

