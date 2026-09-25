-- LANE SOURCE-KEY — A RECORD-STORE TABLE'S CHANGES ARE `record:<table id>` EVENTS.
--
-- THE RULING. The store's token is `record`; `custom_record` is the retired tier-2 table and
-- nothing new names it. The event-source key a webhook subscribes to and a schedule listens for
-- was `custom_record:<table id>` (GRIDPRIM G4/G8). From this file on it is `record:<table id>`,
-- as ONE change: the store writes only the new key, reads both for one release, turns an old
-- client's key into the new one on the way in (so a schedule made from an older screen still
-- fires), and repairs any stored row. The companion file sourcekey_the_old_key_is_refused.sql
-- (step 4, once the new @ai-matrx/records is installed and live) refuses the old key outright.
--
-- THE USE CASE. Harbor Point Plumbing & Drain (Tacoma, WA) dispatches service calls from a
-- record-store table. Its office manager (admin@admin.com) keeps a schedule "when a service
-- call's Status changes, draft the invoice" and a webhook that tells the accounting system about
-- every change. Technician Sam Oduya (test@test.com) closes calls from the van. Every name,
-- address and phone below is synthesized.
--
-- WHAT MAKES IT FAIL:
--   T1  the store's own door (custom.record_change_actions, what every screen asks) answering
--       anything but `record:<table id>`.
--   T2  a schedule saved with `record:<table id>` (what the new package and screens write) not
--       firing EXACTLY once when Sam closes CALL-2291 — or firing on a notes-only change.
--   T3  the activity line of that change carrying any key but `record:<table id>`.
--   T4  a schedule saved by an OLDER client with `custom_record:<table id>` being stored under
--       the old key, or not firing (the store accepts it and keeps only the new one).
--   T5  a webhook the office manager declares naming anything but `record:<table id>`, the
--       table's webhook list not finding it, or a webhook written with the old key not being
--       stored under the new one and not archivable through the table's door.
--   T6  any `custom_record:` source key left anywhere in this organization at the end.

\set ON_ERROR_STOP on
\timing off
\set suite 'sourcekey_a_row_change_is_a_record_event_red_green.sql'
\set requires 'function:scheduler.sch_match_event|function:custom._record_events_to_activity|function:custom.record_change_actions'
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
  v_org uuid := gen_random_uuid(); v_home uuid; v_calls uuid; v_task uuid; v_old_task uuid;
  v_call uuid; v_n integer; v_key text; v_cfg jsonb; v_wh jsonb; v_old_wh uuid; v_types text[];
begin
  -- ── fixture (asserts nothing) ─────────────────────────────────────────────────────────
  perform set_config('app.actor_system', 'campaign-test/sourcekey', true);
  perform set_config('request.jwt.claims', c_admin_j, true);
  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'Harbor Point Plumbing & Drain ' || substr(v_org::text, 1, 8),
          'harbor-point-plumbing-' || substr(v_org::text, 1, 8), 'HPP', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_org, 'organization', v_org, c_admin, 'owner', 'active'),
    (v_org, 'organization', v_org, '4060701e-706a-4c76-b3ca-0bbc69fa5a14', 'member', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note) values
    ('custom', 'system_enabled', 'organization', v_org, v_org, 'true'::jsonb, 'sourcekey suite'),
    ('custom', 'member_default_level', 'organization', v_org, v_org, '"editor"'::jsonb, 'sourcekey suite: technicians close their own calls');
  insert into custom.record (organization_id, table_id, data) values (v_org, null, jsonb_build_object('name', 'Home')) returning id into v_home;
  v_calls := custom.table_declare(v_org, jsonb_build_object('name', 'Service calls', 'slug', 'service_calls', 'type', 'entity',
    'label_singular', 'Service call', 'label_plural', 'Service calls', 'title_field', 'call_number', 'display', 'list', 'weight', 'light',
    'ordered', true, 'row_order', 'sorted', 'agent_writable', true, 'retention_days', 3650,
    'default_sort', jsonb_build_array(jsonb_build_object('field', 'call_number', 'direction', 'asc')),
    'parent_id', v_home::text, 'fields', jsonb_build_array(jsonb_build_object('name', 'call_number'))));
  perform custom.field_declare(v_org, v_calls, jsonb_build_object('key', 'call_number', 'label', 'Call', 'type', 'text', 'required', true, 'sort', 10));
  perform custom.field_declare(v_org, v_calls, jsonb_build_object('key', 'status', 'label', 'Status', 'type', 'select', 'sort', 20,
    'options', jsonb_build_array('Scheduled', 'En route', 'On site', 'Complete', 'Invoiced')));
  perform custom.field_declare(v_org, v_calls, jsonb_build_object('key', 'tech_notes', 'label', 'Technician notes', 'type', 'long_text', 'sort', 30));
  v_call := custom.record_write(v_org, v_calls, jsonb_build_object('call_number', 'CALL-2291',
    'status', 'On site', 'tech_notes', 'Water heater T&P valve replaced'));

  -- ── T1: the store's door, from the office manager's seat ──────────────────────────────
  perform set_config('role', 'authenticated', true);
  v_key := custom.record_change_actions(v_org, v_calls) ->> 'entity_type';
  perform set_config('role', 'postgres', true);
  if v_key is distinct from 'record:' || v_calls::text then
    raise exception 'T1 RED: the store says a change to Service calls is "%", not "record:%"', v_key, v_calls;
  end if;
  raise notice 'T1 PASS — custom.record_change_actions answers record:<Service calls>.';

  -- The schedule, saved the way the new screens save it (the key the store just answered).
  insert into scheduler.sch_task (user_id, kind, title, description, organization_id, surfaces)
  values (c_admin, 'agent', 'Draft the invoice when a service call is complete',
          'Runs the invoice agent whenever a service call''s Status changes.', v_org, array['server']) returning id into v_task;
  insert into scheduler.sch_agent_task (id, prompt, auth_mode)
  values (v_task, 'The service call in this event changed status. If it now reads Complete, draft the invoice.', 'auto');
  insert into scheduler.sch_trigger (task_id, user_id, type, config, organization_id)
  values (v_task, c_admin, 'event', jsonb_build_object('entity_type', v_key, 'actions', jsonb_build_array('record.updated'),
            'table_id', v_calls::text, 'changed_fields', jsonb_build_array('status')), v_org);

  -- ── T2 / T3: Sam's changes, from his own seat ─────────────────────────────────────────
  perform set_config('request.jwt.claims', c_sam_j, true);
  perform set_config('role', 'authenticated', true);
  perform custom.record_update(v_org, v_call, jsonb_build_object('tech_notes', 'Valve replaced; customer shown the shutoff'));
  perform set_config('role', 'postgres', true);
  select count(*) into v_n from scheduler.sch_run where task_id = v_task;
  if v_n <> 0 then raise exception 'T2 RED: a notes-only change ran the invoice agent (% runs)', v_n; end if;
  perform set_config('role', 'authenticated', true);
  perform custom.record_update(v_org, v_call, jsonb_build_object('status', 'Complete'));
  perform set_config('role', 'postgres', true);
  select count(*) into v_n from scheduler.sch_run where task_id = v_task;
  if v_n <> 1 then
    raise exception 'T2 RED: Sam closed CALL-2291 and the schedule saved as record:<table> queued % run(s), not 1', v_n;
  end if;
  raise notice 'T2 PASS — the record:<table> schedule fired once on the Status change and not on the notes change.';
  select count(*) into v_n from platform.activity_log where organization_id = v_org and entity_type = 'record:' || v_calls::text;
  if v_n < 2 or exists (select 1 from platform.activity_log where organization_id = v_org and entity_type like 'custom\_record:%') then
    raise exception 'T3 RED: the change''s activity lines carry % record:<table> key(s) and some custom_record: key', v_n;
  end if;
  raise notice 'T3 PASS — the activity spine carries record:<Service calls> (% lines) and no custom_record: key.', v_n;

  -- ── T4: an older client's schedule, key custom_record:<table> ─────────────────────────
  perform set_config('request.jwt.claims', c_admin_j, true);
  insert into scheduler.sch_task (user_id, kind, title, description, organization_id, surfaces)
  values (c_admin, 'agent', 'Tell dispatch when a call is archived', 'Saved from an older schedule screen.', v_org, array['server'])
  returning id into v_old_task;
  insert into scheduler.sch_agent_task (id, prompt, auth_mode)
  values (v_old_task, 'A service call was archived. Tell dispatch which one.', 'auto');
  insert into scheduler.sch_trigger (task_id, user_id, type, config, organization_id)
  values (v_old_task, c_admin, 'event', jsonb_build_object('entity_type', 'custom_record:' || v_calls::text,
            'actions', jsonb_build_array('record.archived'), 'table_id', v_calls::text), v_org);
  select config into v_cfg from scheduler.sch_trigger where task_id = v_old_task;
  if v_cfg ->> 'entity_type' is distinct from 'record:' || v_calls::text then
    raise exception 'T4 RED: an older client''s schedule is stored under "%"', v_cfg ->> 'entity_type';
  end if;
  perform set_config('request.jwt.claims', c_sam_j, true);
  perform set_config('role', 'authenticated', true);
  perform custom.record_delete(v_org, v_call);  -- archives: the row stays, deleted_at is set
  perform set_config('role', 'postgres', true);
  select count(*) into v_n from scheduler.sch_run where task_id = v_old_task;
  if v_n <> 1 then raise exception 'T4 RED: the older client''s schedule queued % run(s) on the archive, not 1', v_n; end if;
  raise notice 'T4 PASS — an older client''s custom_record: schedule is stored as record:<table> and fired once.';

  -- ── T5: webhooks, from the office manager's seat ──────────────────────────────────────
  perform set_config('request.jwt.claims', c_admin_j, true);
  perform set_config('role', 'authenticated', true);
  v_wh := custom.table_webhook_declare(v_org, v_calls, 'https://hooks.harborpointplumbing.com/matrx/service-calls',
                                       array['record.updated'], 'Accounting: service call changes');
  select count(*) into v_n from custom.table_webhooks(v_org, v_calls);
  perform set_config('role', 'postgres', true);
  select resource_types into v_types from files.webhooks where id = (v_wh ->> 'webhook_id')::uuid;
  if v_types is distinct from array['record:' || v_calls::text] or v_n <> 1 then
    raise exception 'T5 RED: the declared webhook names % and the table lists % webhook(s)', v_types, v_n;
  end if;
  insert into files.webhooks (owner_id, organization_id, target_url, secret, description, resource_types)
  values (c_admin, v_org, 'https://hooks.harborpointplumbing.com/matrx/dispatch-board', encode(extensions.gen_random_bytes(32), 'hex'),
          'Dispatch board (saved by an older client)', array['custom_record:' || v_calls::text])
  returning id, resource_types into v_old_wh, v_types;
  if v_types is distinct from array['record:' || v_calls::text] then
    raise exception 'T5 RED: a webhook written with the old key is stored as %', v_types;
  end if;
  perform set_config('role', 'authenticated', true);
  select count(*) into v_n from custom.table_webhooks(v_org, v_calls);
  perform custom.table_webhook_archive(v_org, v_old_wh);
  perform set_config('role', 'postgres', true);
  if v_n <> 2 or (select is_active from files.webhooks where id = v_old_wh) then
    raise exception 'T5 RED: the table lists % webhook(s) (want 2) or the older one did not archive', v_n;
  end if;
  raise notice 'T5 PASS — declared webhook names record:<table>, an old-key one is stored as the new key, both listed, archive works.';

  -- ── T6: nothing under the old key is left in this organization ────────────────────────
  select (select count(*) from scheduler.sch_trigger where organization_id = v_org and config ->> 'entity_type' like 'custom\_record:%')
       + (select count(*) from files.webhooks w where organization_id = v_org and array_to_string(w.resource_types, ',') like '%custom\_record:%')
       + (select count(*) from platform.activity_log where organization_id = v_org and entity_type like 'custom\_record:%')
    into v_n;
  if v_n <> 0 then raise exception 'T6 RED: % custom_record: source key(s) stored in this organization', v_n; end if;
  raise notice 'T6 PASS — 0 custom_record: source keys stored.';
  raise notice 'SOURCE-KEY GREEN — T1..T6 passed.';
end $t$;
rollback;
