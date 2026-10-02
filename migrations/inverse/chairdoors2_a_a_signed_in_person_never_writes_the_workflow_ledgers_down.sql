-- chair-step: undo chairdoors2_a_a_signed_in_person_never_writes_the_workflow_ledgers.sql: gives `authenticated` back INSERT, UPDATE and DELETE on workflow.run, workflow.trigger_fire, workflow.trigger_event and workflow.job (what it held before; `anon` held nothing and TRUNCATE was never granted). Reversing reopens WF-028: a member could forge run metadata and trigger stamps again.
-- lane: CHAIR-DOORS-2
grant insert, update, delete on table workflow.run           to authenticated;
grant insert, update, delete on table workflow.trigger_fire  to authenticated;
grant insert, update, delete on table workflow.trigger_event to authenticated;
grant insert, update, delete on table workflow.job           to authenticated;
