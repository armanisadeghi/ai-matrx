-- chair-step: THE INVERSE of migrations/campaign/hrloopcleanup_b_a_superseded_approval_task_closes_or_says_why.sql.
--   It puts back, verbatim, the production bodies of `hr._wf_unproject_step(uuid,text)` and
--   `hr._wf_project_step(uuid)` as they stood on 2026-09-22 — which puts the silent failure back:
--   a superseded approver's task is never closed and is counted as closed — and it reopens the
--   approval tasks the up closed (to their prior status, dropping the stamp), but only while they
--   still sit at the status the up gave them. The declared door row stays (additive, true either
--   way). It exists for rule 27. ACCESS SHARE for the bodies; row locks on those tasks.
-- lock: platform
-- lane: HR-LOOP-CLEANUP
-- based-on: hr._wf_unproject_step(uuid, text) b3ff3b1799a0def4724fe9d706108a998660aab9439d38231384cb47732b48ff
-- based-on: hr._wf_project_step(uuid) 5f5b551044a567e2a23e367b07b6e101325e0d1dbb039912ce62b40e51f2077b

set local lock_timeout = '2s';

CREATE OR REPLACE FUNCTION hr._wf_unproject_step(p_step uuid, p_outcome text DEFAULT 'completed'::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'hr', 'public'
AS $function$
declare st hr.workflow_step%rowtype; u uuid; v_n integer := 0; v_org uuid;
begin
  select * into st from hr.workflow_step where id = p_step;
  if not found then return 0; end if;
  v_org := st.organization_id;
  foreach u in array st.resolved_user_ids loop
    begin
      perform public.wsp_resolve_system_task('hrwf:' || p_step::text || ':' || u::text,
                                             p_outcome, v_org);
      v_n := v_n + 1;
    exception when others then null;
    end;
  end loop;
  return v_n;
end $function$

;

CREATE OR REPLACE FUNCTION hr._wf_project_step(p_step uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'hr', 'public'
AS $function$
declare
  st hr.workflow_step%rowtype; inst hr.workflow_instance%rowtype;
  d jsonb; u uuid; v_n integer := 0; v_task uuid;
begin
  if not (hr._hr_knob('hr.workflow', 'inbox_project_tasks', (select ws.organization_id from hr.workflow_step ws where ws.id = p_step), null) #>> '{}')::boolean then return 0; end if;
  select * into st   from hr.workflow_step where id = p_step;
  select * into inst from hr.workflow_instance where id = st.workflow_instance_id;
  -- 🚨 `true` is load-bearing: workspace.tasks is internal-visibility machinery shared with the
  -- general /tasks list, and the sensitivity split has to survive the projection.
  d := hr._wf_display(p_step, true);

  foreach u in array st.resolved_user_ids loop
    v_task := (public.wsp_upsert_system_task(
      p_dedupe_key      => 'hrwf:' || p_step::text || ':' || u::text,
      p_title           => d ->> 'title',
      p_description     => d ->> 'step_label',
      p_origin          => 'system',
      p_source_type     => 'hr_workflow_step',
      p_source_id       => p_step::text,
      p_source_url      => '/hr/tasks/' || inst.id::text || '?org=' || inst.organization_id::text || '&step=' || p_step::text,
      p_source_label    => 'HR approvals',
      p_due_date        => st.due_at::date,
      p_priority        => case inst.priority when 'low' then 'low'
                                              when 'urgent' then 'high'
                                              when 'high' then 'high'
                                              else 'medium' end,
      p_assignee_id     => u,
      p_organization_id => inst.organization_id,
      p_metadata        => jsonb_build_object('flow_key', inst.flow_key, 'instance_id', inst.id,
                                              'sensitivity_tier', inst.sensitivity_tier)) ->> 'id')::uuid;
    v_n := v_n + 1;
    if st.workspace_task_id is null and v_task is not null then
      perform hr.arm_write();
      update hr.workflow_step set workspace_task_id = v_task where id = p_step;
    end if;
  end loop;
  return v_n;
exception when others then
  perform hr._wf_event(st.workflow_instance_id, p_step, 'projection_failed', null, null,
                       'automation', null, null,
                       jsonb_build_object('sqlstate', sqlstate, 'detail', sqlerrm));
  return 0;
end $function$

;

create temporary table _hlc_undo on commit drop as
select m.id as log_id, m.target_id as id,
       m.inverse ->> 'status_before' as status_before, m.inverse ->> 'status_after' as status_after
  from history.migration_log m
 where m.verb = 'approval_task_closed_with_its_step'
   and m.inverse ->> 'lane' = 'HR-LOOP-CLEANUP'
   and m.undone_at is null;

update workspace.tasks t
   set status = u.status_before, updated_at = now(),
       completed_at = case when u.status_after = 'completed' then null else t.completed_at end,
       metadata = t.metadata - 'hr_superseded'
  from _hlc_undo u
 where t.id = u.id and t.status = u.status_after
   and t.metadata -> 'hr_superseded' ->> 'lane' = 'HR-LOOP-CLEANUP';

update history.migration_log m set undone_at = now() from _hlc_undo u where m.id = u.log_id;
