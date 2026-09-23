-- additive: yes
--   It ADDS ONE new function, `custom.record_change_actions`, its `platform.client_callable_door`
--   row and its GRANT (the row FIRST, then the grant — `platform.enforce_definer_client_grants`
--   fires ON the grant). Nothing existing is replaced, dropped or revoked, so there is no
--   `-- based-on:` line. The inverse is
--   `migrations/inverse/gridport_a_table_says_which_changes_can_start_an_agent_down.sql`.
-- NO `-- target:` AND NO `-- guard:` HEADER, ON PURPOSE (the apprvtail precedent): a file that
--   NAMES production is judged by an allow-list that refuses every GRANT by name, and this
--   file's whole point is a client door. The OFF switch is kept: the body's FIRST statement is
--   `custom.assert_store_door`, which IS custom/system_enabled.
-- lane: GRID-PORT
-- APPLY ORDER: AFTER gridprim_a_row_change_runs_the_agent_in_either_store.sql (G8), in the same
--   window (2026-09-24). This door's presence is the grid's signal that G8 is there.
--
-- LANE GRID-PORT, finding F4 → G8. "When a row changes, run an agent…" builds an `event`
-- schedule. For a record-store table it only fires once G8 puts that table's changes on the
-- activity spine the scheduler matches. G8 changes an INTERNAL body, so a screen cannot tell
-- whether it is there — and a menu item offered before it is would build a schedule that never
-- fires, which is a screen lying. This door is how the grid asks, and what it answers is also
-- what the schedule form needs: the change words a schedule on THIS table may listen for, in
-- the store's own vocabulary (G4's `record.*`), with the words a person reads, and the exact
-- `entity_type` the matcher reads for it.
--
-- One Table in, on the one ladder (the switch, the organization, may-know-the-Table), nothing
-- written. Locks: create function / insert / grant only. Not window-class.

set local lock_timeout = '5s';
set local statement_timeout = '60s';

create function custom.record_change_actions(p_organization_id uuid, p_table_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $fn$
begin
  perform custom.assert_store_door(p_organization_id, 'custom.record_change_actions');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.record_change_actions');
  perform custom.assert_may_know_table(p_organization_id, p_table_id, 'custom.record_change_actions');
  return jsonb_build_object(
    'entity_type', 'custom_record:' || p_table_id::text,
    'table_id', p_table_id,
    'actions', jsonb_build_array(
      jsonb_build_object('value', 'record.created',  'label', 'A row is added'),
      jsonb_build_object('value', 'record.updated',  'label', 'A row is changed'),
      jsonb_build_object('value', 'record.archived', 'label', 'A row is archived'),
      jsonb_build_object('value', 'record.restored', 'label', 'A row is restored')));
end
$fn$;

comment on function custom.record_change_actions(uuid, uuid) is
  'GRID-PORT (after GRIDPRIM G8): the changes an event schedule on this record-store Table may listen for, the words a person reads for each, and the entity_type scheduler.sch_match_event matches. Its presence is how a screen knows a record-store row change can start an agent.';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   signed_in_callers, anonymous_callers)
values ('custom', 'record_change_actions',
        'p_organization_id uuid, p_table_id uuid',
        array['uuid'::regtype, 'uuid'::regtype]::oid[],
        'p_organization_id is checked by custom.assert_store_door and custom.assert_client_may_reach before anything is read; p_table_id by custom.assert_may_know_table, so a Table this caller may not know answers exactly as an invented one. It returns a fixed vocabulary and the Table''s own id, reads no record and writes nothing.',
        'gridport_a_table_says_which_changes_can_start_an_agent.sql',
        true, false);

grant execute on function custom.record_change_actions(uuid, uuid) to authenticated;
