-- chair-step: INSERTS two knob rows into platform.feature_knob — workflows/loop_depth_max (integer, default 3) and workflows/loop_runs_per_record_per_minute (integer, default 5), both overridable by an organization — and widens the CHECK on workflow.trigger_fire.status from queued|failed to queued|failed|stopped_loop_cap (dropped and re-added NOT VALID, then VALIDATEd). No function, grant, policy, index or column is touched; no existing row changes.
-- lane: CHAIR-DOORS-2 (asked by v6 lane 11 AUTOMATIONS-AND-PAGES, need 8)
--
-- A WORKFLOW LOOP HAS TWO KNOBS AND ITS OWN STOP (aidream 024ce3701b, AUTOMATION-MODEL §0.7 G2).
-- The store-trigger loop guard reads both knobs with scoped_knob_int("workflows", <key>, organization)
-- and, until these rows existed, used its code defaults (3 and 5) and logged that it did. A fire the
-- guard stops was filed as `failed` because the ledger's CHECK allowed nothing else; it can now be
-- filed as `stopped_loop_cap`.
--
-- THE CHECK CHANGE takes a brief ACCESS EXCLUSIVE lock on workflow.trigger_fire (13 rows on production,
-- measured 2026-10-02); the validate scans those rows under SHARE UPDATE EXCLUSIVE.
insert into platform.feature_knob
  (feature, key, value, default_value, value_type, unit, min_value, max_value,
   label, description, set_by, basis, overridable_by, override_direction, ui, taxonomy_node_id, public_read)
values
  ('workflows', 'loop_depth_max', '3'::jsonb, '3'::jsonb, 'integer', 'rounds', 1, 20,
   'Rounds a workflow chain may go',
   'When workflows change records that start other workflows, a chain may go this many rounds; the next round is stopped, filed as stopped by the loop cap, and the owner is told.',
   'agent', 'Agent-set limit, v6 lane 11 AUTOMATIONS-AND-PAGES round 5 (2026-10-02): the store-trigger loop guard in aidream 024ce3701b; 3 rounds lets a record change start a workflow that updates a related record without letting two workflows feed each other forever (Zapier and Airtable automations both stop self-triggering chains).',
   '{organization}'::text[], 'any', '{}'::jsonb, 'd885dcd8-288e-4be6-9991-2ebe71c72759', false),
  ('workflows', 'loop_runs_per_record_per_minute', '5'::jsonb, '5'::jsonb, 'integer', 'runs', 1, 120,
   'Runs per record each minute',
   'The most times one workflow may run on the same record in one minute. It catches chains that leave the database, such as webhooks, agents and approved holds; past it the fire is stopped and the owner is told.',
   'agent', 'Agent-set limit, v6 lane 11 AUTOMATIONS-AND-PAGES round 5 (2026-10-02): the backstop half of the loop guard in aidream 024ce3701b; 5 a minute is above any person editing a record and far below a runaway loop.',
   '{organization}'::text[], 'any', '{}'::jsonb, 'd885dcd8-288e-4be6-9991-2ebe71c72759', false)
on conflict (feature, key) do nothing;

alter table workflow.trigger_fire drop constraint wf_trigger_fire_status_check;
alter table workflow.trigger_fire add constraint wf_trigger_fire_status_check
  check (status = any (array['queued'::text, 'failed'::text, 'stopped_loop_cap'::text])) not valid;
alter table workflow.trigger_fire validate constraint wf_trigger_fire_status_check;
