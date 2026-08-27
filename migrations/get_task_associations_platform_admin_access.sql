-- Keep the task-association RPC's explicit SECURITY DEFINER gate aligned with
-- workspace.tasks SELECT policy. Platform admins can read task rows through
-- the policy's platform_admin_all lane, but the RPC previously reimplemented
-- only creator and organization membership and rejected the same visible row.

do $migration$
declare
  v_definition text;
  v_old text := $old$select exists(select 1 from workspace.tasks t where t.id = p_task_id
      and (t.created_by = v_uid or (t.organization_id is not null and t.organization_id in (
             select om.organization_id from iam.organization_member om where om.user_id = v_uid)))) into v_task_visible;$old$;
  v_new text := $new$select public.is_platform_admin()
      or exists(select 1 from workspace.tasks t where t.id = p_task_id
        and (t.created_by = v_uid or (t.organization_id is not null and t.organization_id in (
               select om.organization_id from iam.organization_member om where om.user_id = v_uid))))
    into v_task_visible;$new$;
begin
  select pg_get_functiondef('public.get_task_associations(uuid)'::regprocedure)
    into strict v_definition;

  if strpos(v_definition, v_old) = 0 then
    raise exception 'get_task_associations access gate no longer matches expected definition';
  end if;

  execute replace(v_definition, v_old, v_new);
end
$migration$;

