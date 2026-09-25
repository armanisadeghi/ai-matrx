-- LANE GRID-PRIMITIVES, G8 — "WHEN A ROW CHANGES, RUN AN AGENT" ON A RECORD-STORE TABLE.
--
-- THE USE CASE. Harbor Point Plumbing & Drain (Tacoma, WA) dispatches service calls from a
-- record-store table. Its office manager, Renée Castillo (admin@admin.com), keeps one schedule:
-- "when a service call's Status changes, run the invoice agent" — the agent drafts the invoice
-- for a call that reads Complete. Technician Sam Oduya (test@test.com) closes calls from the van.
-- Every name, address and phone below is synthesized.
--
-- The schedule is written the way the scheduler's own form writes one (scheduler.sch_task +
-- sch_agent_task + an `event` sch_trigger), as the fixture; the change is made from Sam's seat.
--
-- WHAT MAKES IT FAIL:
--   1  Sam flipping CALL-2291 to Complete queuing NO run of the invoice agent (the RED state:
--      G4 alone writes the spine only for a webhook, so scheduler.sch_match_event never hears it).
--   2  the queued run not carrying the event: the call, record.updated, Status among the
--      changed columns.
--   3  a change to a column the schedule does not listen to (Technician notes) running the agent.
--   4  a change on another table of the same company running it.

\set ON_ERROR_STOP on
\timing off
\set suite 'gridprim_g8_green.sql'
\set requires 'function:scheduler.sch_match_event|function:custom._record_events_to_activity'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local lock_timeout = '10s';
set local statement_timeout = '120s';

do $t$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_sam_j   constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  v_org uuid := gen_random_uuid(); v_home uuid; v_calls uuid; v_parts uuid; v_task uuid;
  v_call uuid; v_other uuid; v_part uuid; v_n integer; v_run record;
begin
  -- ── fixture (asserts nothing) ─────────────────────────────────────────────────────────
  perform set_config('app.actor_system', 'campaign-test/gridprim_g8', true);
  perform set_config('request.jwt.claims', c_admin_j, true);
  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'Harbor Point Plumbing & Drain ' || substr(v_org::text, 1, 8),
          'harbor-point-plumbing-' || substr(v_org::text, 1, 8), 'HPP', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_org, 'organization', v_org, c_admin, 'owner', 'active'),
    (v_org, 'organization', v_org, '4060701e-706a-4c76-b3ca-0bbc69fa5a14', 'member', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note) values
    ('custom', 'system_enabled', 'organization', v_org, v_org, 'true'::jsonb, 'gridprim G8'),
    ('custom', 'member_default_level', 'organization', v_org, v_org, '"editor"'::jsonb, 'gridprim G8: technicians close their own calls');
  insert into custom.record (organization_id, table_id, data) values (v_org, null, jsonb_build_object('name', 'Home')) returning id into v_home;
  v_calls := custom.table_declare(v_org, jsonb_build_object('name', 'Service calls', 'slug', 'service_calls', 'type', 'entity',
    'label_singular', 'Service call', 'label_plural', 'Service calls', 'title_field', 'call_number', 'display', 'list', 'weight', 'light',
    'ordered', true, 'row_order', 'sorted', 'agent_writable', true, 'retention_days', 3650,
    'default_sort', jsonb_build_array(jsonb_build_object('field', 'call_number', 'direction', 'asc')),
    'parent_id', v_home::text, 'fields', jsonb_build_array(jsonb_build_object('name', 'call_number'))));
  perform custom.field_declare(v_org, v_calls, jsonb_build_object('key', 'call_number', 'label', 'Call', 'type', 'text', 'required', true, 'sort', 10));
  perform custom.field_declare(v_org, v_calls, jsonb_build_object('key', 'customer', 'label', 'Customer', 'type', 'text', 'sort', 20));
  perform custom.field_declare(v_org, v_calls, jsonb_build_object('key', 'status', 'label', 'Status', 'type', 'select', 'sort', 30,
    'options', jsonb_build_array('Scheduled', 'En route', 'On site', 'Complete', 'Invoiced')));
  perform custom.field_declare(v_org, v_calls, jsonb_build_object('key', 'labor_hours', 'label', 'Labor hours', 'type', 'number', 'sort', 40));
  perform custom.field_declare(v_org, v_calls, jsonb_build_object('key', 'tech_notes', 'label', 'Technician notes', 'type', 'long_text', 'sort', 50));
  v_call := custom.record_write(v_org, v_calls, jsonb_build_object('call_number', 'CALL-2291', 'customer', 'Morales residence, 4418 N Pearl St',
    'status', 'On site', 'labor_hours', 2.5, 'tech_notes', 'Water heater T&P valve replaced'));
  v_other := custom.record_write(v_org, v_calls, jsonb_build_object('call_number', 'CALL-2292', 'customer', 'Bayview Dental, 1102 S 11th St',
    'status', 'En route', 'labor_hours', 1));
  v_parts := custom.table_declare(v_org, jsonb_build_object('name', 'Parts used', 'slug', 'parts_used', 'type', 'entity',
    'label_singular', 'Part', 'label_plural', 'Parts used', 'title_field', 'part', 'display', 'list', 'weight', 'light',
    'ordered', true, 'row_order', 'sorted', 'agent_writable', true, 'retention_days', 3650,
    'default_sort', jsonb_build_array(jsonb_build_object('field', 'part', 'direction', 'asc')),
    'parent_id', v_home::text, 'fields', jsonb_build_array(jsonb_build_object('name', 'part'))));
  perform custom.field_declare(v_org, v_parts, jsonb_build_object('key', 'part', 'label', 'Part', 'type', 'text', 'sort', 10));
  perform custom.field_declare(v_org, v_parts, jsonb_build_object('key', 'status', 'label', 'Status', 'type', 'text', 'sort', 20));
  v_part := custom.record_write(v_org, v_parts, jsonb_build_object('part', '3/4 in. T&P relief valve', 'status', 'On truck'));

  -- The schedule, as the scheduler's form writes it (config built by @ai-matrx/records recordChangeTrigger).
  insert into scheduler.sch_task (user_id, kind, title, description, organization_id, surfaces)
  values (c_admin, 'agent', 'Draft the invoice when a service call is complete',
          'Runs the invoice agent whenever a service call''s Status changes; the agent drafts the invoice for a call that reads Complete.',
          v_org, array['server']) returning id into v_task;
  insert into scheduler.sch_agent_task (id, prompt, auth_mode)
  values (v_task, 'The service call in this event changed status. If it now reads Complete, draft the invoice from its labor hours and parts used.', 'auto');
  insert into scheduler.sch_trigger (task_id, user_id, type, config, organization_id)
  values (v_task, c_admin, 'event', jsonb_build_object('entity_type', 'record:' || v_calls::text,
            'actions', jsonb_build_array('record.updated'), 'table_id', v_calls::text,
            'changed_fields', jsonb_build_array('status')), v_org);

  -- ── the seat ──────────────────────────────────────────────────────────────────────────
  perform set_config('request.jwt.claims', c_sam_j, true);
  perform set_config('role', 'authenticated', true);
  if current_user is distinct from 'authenticated' then raise exception '0: not seated'; end if;

  -- PART 3 first — a notes-only change must not run the agent.
  perform custom.record_update(v_org, v_call, jsonb_build_object('tech_notes', 'Water heater T&P valve replaced; customer shown the shutoff'));
  -- PART 4 — another table's status change must not run it.
  perform custom.record_update(v_org, v_part, jsonb_build_object('status', 'Installed'));
  perform set_config('role', 'postgres', true);
  select count(*) into v_n from scheduler.sch_run where task_id = v_task;
  perform set_config('role', 'authenticated', true);
  if v_n <> 0 then raise exception '3/4: a notes change or another table''s change ran the invoice agent (% runs)', v_n; end if;
  raise notice '3 PASS — a Technician notes change queues nothing.';
  raise notice '4 PASS — a Parts used status change queues nothing.';

  -- PART 1 — Sam closes CALL-2291.
  perform custom.record_update(v_org, v_call, jsonb_build_object('status', 'Complete'));
  perform set_config('role', 'postgres', true);
  select * into v_run from scheduler.sch_run where task_id = v_task;
  perform set_config('role', 'authenticated', true);
  if v_run.id is null then
    raise exception '1: CALL-2291 flipped to Complete and the invoice agent was not queued';
  end if;
  raise notice '1 PASS — CALL-2291 to Complete queued the invoice agent (run %, status %).', v_run.id, v_run.status;

  -- PART 2 — the run carries the event.
  if (v_run.metadata -> 'event' ->> 'entity_id')::uuid is distinct from v_call
     or v_run.metadata -> 'event' ->> 'action' is distinct from 'record.updated'
     or not (v_run.metadata -> 'event' -> 'metadata' -> 'changed_fields' ? 'status')
     or (v_run.metadata -> 'event' -> 'metadata' ->> 'table_id')::uuid is distinct from v_calls then
    raise exception '2: the queued run does not carry the call, the action and Status: %', v_run.metadata;
  end if;
  raise notice '2 PASS — the run carries CALL-2291, record.updated and changed_fields %.', v_run.metadata -> 'event' -> 'metadata' -> 'changed_fields';
  raise notice 'GRIDPRIM G8 GREEN — every part passed.';
end $t$;
rollback;
