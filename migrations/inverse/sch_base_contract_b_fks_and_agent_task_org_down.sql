-- chair-step: inverse of sch_base_contract_b_fks_and_agent_task_org.sql — drops the scheduler base-contract FKs and the sch_agent_task organization_id/created_at columns, and restores the two function bodies that insert sch_agent_task without an organization. Only run together with reverting the writers that now pass organization_id to sch_agent_task (matrx-scheduler upsert_agent_task, aidream Gmail recovery carrier + seed scripts), or those inserts fail on the missing column.
-- inverse of sch_base_contract_b_fks_and_agent_task_org.sql
-- LOCKS (measured on the clone, 2026-09-26): dropping the FKs takes ACCESS EXCLUSIVE on auth.users and
-- iam.organizations until COMMIT (~1.0 s for the whole file, rule 27 on the clone) — every sign-in and org read waits that long.

LOCK TABLE scheduler.sch_task, scheduler.sch_trigger, scheduler.sch_run, scheduler.sch_agent_task
  IN ACCESS EXCLUSIVE MODE;

-- The function bodies first: they reference the column this file drops.
do $$
declare
  v_fn   regprocedure;
  v_def  text;
  v_new  text;
  v_edits jsonb := jsonb_build_array(
    jsonb_build_object(
      'fn', 'public.create_agent_task(text,text,text,jsonb,text,text[],text[],text,timestamp with time zone,timestamp with time zone,uuid,jsonb,uuid,text,integer,integer,uuid)',
      'pairs', jsonb_build_array(
        jsonb_build_array(
          'id, agent_id, prompt, variables, persistent_conversation_id, auth_mode, max_runtime_seconds, max_concurrent, organization_id' || E'\n',
          'id, agent_id, prompt, variables, persistent_conversation_id, auth_mode, max_runtime_seconds, max_concurrent' || E'\n'),
        jsonb_build_array(
          'v_task_id, p_agent_id, p_prompt, p_variables, p_persistent_conversation_id, p_auth_mode, p_max_runtime_seconds, p_max_concurrent, p_organization_id' || E'\n',
          'v_task_id, p_agent_id, p_prompt, p_variables, p_persistent_conversation_id, p_auth_mode, p_max_runtime_seconds, p_max_concurrent' || E'\n'))),
    jsonb_build_object(
      'fn', 'communication.schedule_task_sms_snooze(uuid,uuid,uuid,uuid,text)',
      'pairs', jsonb_build_array(
        jsonb_build_array(
          E'    max_runtime_seconds, max_concurrent, organization_id\n  ) values (\n    v_schedule_id, null,',
          E'    max_runtime_seconds, max_concurrent\n  ) values (\n    v_schedule_id, null,'),
        jsonb_build_array(
          E'    ''auto'', 120, 1, p_organization_id\n  );',
          E'    ''auto'', 120, 1\n  );'))));
  e jsonb;
  p jsonb;
  v_count int;
begin
  for e in select * from jsonb_array_elements(v_edits) loop
    v_fn  := (e ->> 'fn')::regprocedure;
    v_def := pg_get_functiondef(v_fn);
    v_new := v_def;
    for p in select * from jsonb_array_elements(e -> 'pairs') loop
      v_count := (length(v_new) - length(replace(v_new, p ->> 0, ''))) / length(p ->> 0);
      if v_count <> 1 then
        raise exception '% : needle occurs % times (expected exactly 1): %', v_fn, v_count, p ->> 0;
      end if;
      v_new := replace(v_new, p ->> 0, p ->> 1);
    end loop;
    execute v_new;
  end loop;
end $$;

drop index scheduler.sch_agent_task_organization_id_idx;
drop index scheduler.sch_task_organization_id_idx;
drop index scheduler.sch_task_created_by_idx;
drop index scheduler.sch_task_updated_by_idx;
drop index scheduler.sch_trigger_created_by_idx;
drop index scheduler.sch_trigger_updated_by_idx;
drop index scheduler.sch_run_created_by_idx;
drop index scheduler.sch_run_updated_by_idx;

alter table scheduler.sch_agent_task
  drop constraint sch_agent_task_organization_id_fkey,
  drop column organization_id,
  drop column created_at;

alter table scheduler.sch_run
  drop constraint sch_run_created_by_fkey,
  drop constraint sch_run_updated_by_fkey;

alter table scheduler.sch_trigger
  drop constraint sch_trigger_created_by_fkey,
  drop constraint sch_trigger_updated_by_fkey;

alter table scheduler.sch_task
  drop constraint sch_task_organization_id_fkey,
  drop constraint sch_task_created_by_fkey,
  drop constraint sch_task_updated_by_fkey;
