-- chair-step: undo chairdoors3b_a_a_signed_in_person_never_writes_the_other_workflow_ledgers.sql: gives `authenticated` back INSERT, UPDATE and DELETE on the eleven workflow ledgers (checkpoint, node_outcome, work_item, idempotency, node_data_slot, run_log, worker_heartbeat, recovery_audit, extract_sweep_state, plan_event, plan_sample) and on workflow.trigger the table-level DELETE plus the column-level INSERT and UPDATE on every column (what it held before; `anon` held nothing and TRUNCATE was never granted). Reversing reopens WF-028: a member could forge checkpoints, node outcomes, work items and trigger settings again.
-- lane: CHAIR-DOORS-3B
grant insert, update, delete on table workflow.checkpoint          to authenticated;
grant insert, update, delete on table workflow.node_outcome        to authenticated;
grant insert, update, delete on table workflow.work_item           to authenticated;
grant insert, update, delete on table workflow.idempotency         to authenticated;
grant insert, update, delete on table workflow.node_data_slot      to authenticated;
grant insert, update, delete on table workflow.run_log             to authenticated;
grant insert, update, delete on table workflow.worker_heartbeat    to authenticated;
grant insert, update, delete on table workflow.recovery_audit      to authenticated;
grant insert, update, delete on table workflow.extract_sweep_state to authenticated;
grant insert, update, delete on table workflow.plan_event          to authenticated;
grant insert, update, delete on table workflow.plan_sample         to authenticated;
grant delete on table workflow.trigger to authenticated;
grant insert (id, definition_id, definition_version_id, name, description, kind, cron_expression, timezone, default_inputs, max_steps, is_active, last_fired_at, last_run_id, next_run_at, fire_count, organization_id, project_id, task_id, created_at, updated_at, created_by, updated_by, visibility, deleted_at, version, metadata, callback_url, event_source, custom_fields, shown_to, published_to_web, published_to_web_at, published_to_web_by),
      update (id, definition_id, definition_version_id, name, description, kind, cron_expression, timezone, default_inputs, max_steps, is_active, last_fired_at, last_run_id, next_run_at, fire_count, organization_id, project_id, task_id, created_at, updated_at, created_by, updated_by, visibility, deleted_at, version, metadata, callback_url, event_source, custom_fields, shown_to, published_to_web, published_to_web_at, published_to_web_by)
   on table workflow.trigger to authenticated;
