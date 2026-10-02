-- chair-step: undo chairdoors2_b_a_workflow_loop_has_two_knobs_and_its_own_stop.sql: files any stopped_loop_cap fire back as failed (the guard's own fallback), narrows the CHECK on workflow.trigger_fire.status back to queued|failed, and deletes the two workflows loop knob rows (the code defaults 3 and 5 apply again).
-- lane: CHAIR-DOORS-2
update workflow.trigger_fire set status = 'failed' where status = 'stopped_loop_cap';
alter table workflow.trigger_fire drop constraint wf_trigger_fire_status_check;
alter table workflow.trigger_fire add constraint wf_trigger_fire_status_check
  check (status = any (array['queued'::text, 'failed'::text])) not valid;
alter table workflow.trigger_fire validate constraint wf_trigger_fire_status_check;
delete from platform.feature_knob
 where feature = 'workflows' and key in ('loop_depth_max', 'loop_runs_per_record_per_minute');
