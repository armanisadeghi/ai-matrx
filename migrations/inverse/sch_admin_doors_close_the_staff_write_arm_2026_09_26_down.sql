-- chair-step: inverse of sch_admin_doors_close_the_staff_write_arm_2026_09_26.sql — reopens the platform-staff write arm on the four scheduler tables and removes the two admin doors. The CHECK narrowing FAILS while any scheduler_* audit row exists; archive those rows first. Only run this together with reverting lib/services/scheduling-admin-service.ts to direct RLS updates, or both admin controls stop working.
-- inverse of sch_admin_doors_close_the_staff_write_arm_2026_09_26.sql

LOCK TABLE scheduler.sch_task, scheduler.sch_trigger, scheduler.sch_run, scheduler.sch_agent_task
  IN ACCESS EXCLUSIVE MODE;

update platform.entity_types
   set suppress_platform_admin_lane = false
 where token in ('sch_task', 'sch_run', 'sch_trigger', 'sch_agent_task');

do $$
declare r record;
begin
  for r in select token, schema_name, table_name, rls_variant from platform.entity_types
            where token in ('sch_task', 'sch_trigger', 'sch_run', 'sch_agent_task')
            order by case token when 'sch_task' then 0 else 1 end, token
  loop
    perform iam.apply_rls(r.schema_name, r.table_name, r.token, r.rls_variant);
  end loop;
end $$;

delete from platform.client_callable_door
 where schema_name = 'scheduler' and function_name in ('admin_disable_task', 'admin_mark_run_failed');
DROP FUNCTION scheduler.admin_disable_task(uuid, text);
DROP FUNCTION scheduler.admin_mark_run_failed(uuid, text);

ALTER TABLE admin.admin_audit_log DROP CONSTRAINT admin_audit_log_action_check;
ALTER TABLE admin.admin_audit_log ADD CONSTRAINT admin_audit_log_action_check
  CHECK (action = ANY (ARRAY['promote'::text, 'update'::text, 'revoke'::text,
                             'admin_lane_platform_tenant_admission'::text]));

notify pgrst, 'reload schema';
