-- chair-step: REVOKEs INSERT, UPDATE, DELETE and TRUNCATE on eleven more workflow ledgers — workflow.checkpoint, node_outcome, work_item, idempotency, node_data_slot, run_log, worker_heartbeat, recovery_audit, extract_sweep_state, plan_event, plan_sample — from `anon` and `authenticated`, and on workflow.trigger REVOKEs the column-level INSERT and UPDATE `authenticated` held on every column plus the table-level DELETE. SELECT stays everywhere (table-level on the eleven, column-level on trigger), so every screen that reads them reads exactly as before through the same RLS select policies. No function, policy, index, column or data row is touched; service_role and the server's own role keep every privilege.
-- lane: CHAIR-DOORS-3B (asked by v6 lane 11 AUTOMATIONS-AND-PAGES, need 1; siblings of chairdoors2_a, WF-028)
--
-- A SIGNED-IN PERSON NEVER WRITES THE WORKFLOW LEDGERS (WF-028, the rest of the census). chairdoors2_a
-- closed run, trigger_fire, trigger_event and job. These eleven and trigger's columns were still open:
-- a member could INSERT/UPDATE a checkpoint or a node outcome (what a resumed run takes as its inputs),
-- a work item (what control.work_queue feeds while a run is going), or a trigger's definition version,
-- event source, is_active, default_inputs and max_steps straight through PostgREST.
--
-- WHY NOTHING A CLIENT DOES IS TAKEN (census, 2026-10-03, rg over matrx-frontend app/features/lib/
-- packages/components/hooks, aidream/apps, matrx-extend, matrx-local):
--   · workflow.node_outcome: every `.from("node_outcome")` is a SELECT (masterwork service, encore,
--     runPrice, news-monitor data).
--   · work_item: the batch admin page reads `batch.work_item` (another schema) — SELECT only; nothing
--     reads or writes workflow.work_item.
--   · checkpoint, idempotency, node_data_slot, run_log, worker_heartbeat, recovery_audit,
--     extract_sweep_state, plan_event, plan_sample: no client reference at all.
--   · workflow.trigger: no `.from("trigger")` anywhere in the clients; the studio creates, edits,
--     turns on/off and archives triggers through the aidream server (workflow_triggers.py), which
--     writes as its own role. The only SECURITY INVOKER writer, workflow.restore_triggers_archived_with,
--     is called only from SECURITY DEFINER doors (public.entity_undelete, public.org_trash_restore,
--     workflow._cascade_definition_soft_delete), so it runs as the owner and loses nothing here.
--   · No other SECURITY INVOKER function writes any of the twelve.
--   · The server writes them as its own role, never `SET LOCAL ROLE authenticated`.
-- The aidream admin dashboard's generic table editor reaches any table through the admin's own
-- session; its edit buttons on these tables now get the database's refusal, as on every other closed table.
revoke insert, update, delete, truncate on table workflow.checkpoint          from anon, authenticated;
revoke insert, update, delete, truncate on table workflow.node_outcome        from anon, authenticated;
revoke insert, update, delete, truncate on table workflow.work_item           from anon, authenticated;
revoke insert, update, delete, truncate on table workflow.idempotency         from anon, authenticated;
revoke insert, update, delete, truncate on table workflow.node_data_slot      from anon, authenticated;
revoke insert, update, delete, truncate on table workflow.run_log             from anon, authenticated;
revoke insert, update, delete, truncate on table workflow.worker_heartbeat    from anon, authenticated;
revoke insert, update, delete, truncate on table workflow.recovery_audit      from anon, authenticated;
revoke insert, update, delete, truncate on table workflow.extract_sweep_state from anon, authenticated;
revoke insert, update, delete, truncate on table workflow.plan_event          from anon, authenticated;
revoke insert, update, delete, truncate on table workflow.plan_sample         from anon, authenticated;

-- workflow.trigger: the table-level grant was DELETE only, but every column carried INSERT, UPDATE and
-- SELECT for `authenticated`. Column-level SELECT stays (it is how the studio and the trigger lists read).
-- A column REVOKE names the columns (the 33 the clone and production carry on 2026-10-03).
revoke insert (id, definition_id, definition_version_id, name, description, kind, cron_expression, timezone, default_inputs, max_steps, is_active, last_fired_at, last_run_id, next_run_at, fire_count, organization_id, project_id, task_id, created_at, updated_at, created_by, updated_by, visibility, deleted_at, version, metadata, callback_url, event_source, custom_fields, shown_to, published_to_web, published_to_web_at, published_to_web_by),
       update (id, definition_id, definition_version_id, name, description, kind, cron_expression, timezone, default_inputs, max_steps, is_active, last_fired_at, last_run_id, next_run_at, fire_count, organization_id, project_id, task_id, created_at, updated_at, created_by, updated_by, visibility, deleted_at, version, metadata, callback_url, event_source, custom_fields, shown_to, published_to_web, published_to_web_at, published_to_web_by)
    on table workflow.trigger from anon, authenticated;
revoke insert, update, delete, truncate on table workflow.trigger from anon, authenticated;
