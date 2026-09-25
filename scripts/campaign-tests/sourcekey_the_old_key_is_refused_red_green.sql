-- LANE SOURCE-KEY, STEP 2 — THE STORE REFUSES THE RETIRED `custom_record:<table id>` KEY ON WRITE.
--
-- THE USE CASE. Harbor Point Plumbing & Drain's office manager (admin@admin.com) keeps a
-- "draft the invoice when a service call's Status changes" schedule. Once every client writes
-- `record:<table id>`, a schedule or webhook still naming `custom_record:<table id>` can only come
-- from a stale client, and it is refused by name rather than saved.
--
-- WHAT MAKES IT FAIL:
--   R1  a schedule trigger saved with custom_record:<table> not refused 23514 naming the key.
--   R2  a webhook saved with custom_record:<table> not refused 23514.
--   R3  the new key refused (a schedule and a webhook under record:<table> must save).
--   R4  a row saved before (under record:) no longer read by the table's webhook list.

\set ON_ERROR_STOP on
\timing off
\set suite 'sourcekey_the_old_key_is_refused_red_green.sql'
\set requires 'function:custom._record_source_key_is_record|function:custom.record_source_key'
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
  v_org uuid := gen_random_uuid(); v_home uuid; v_calls uuid; v_task uuid; v_n integer; v_ok boolean;
begin
  perform set_config('app.actor_system', 'campaign-test/sourcekey-step2', true);
  perform set_config('request.jwt.claims', c_admin_j, true);
  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'Harbor Point Plumbing & Drain ' || substr(v_org::text, 1, 8), 'harbor-point-plumbing-' || substr(v_org::text, 1, 8), 'HPP', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status)
  values (v_org, 'organization', v_org, c_admin, 'owner', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  values ('custom', 'system_enabled', 'organization', v_org, v_org, 'true'::jsonb, 'sourcekey step 2 suite');
  insert into custom.record (organization_id, table_id, data) values (v_org, null, jsonb_build_object('name', 'Home')) returning id into v_home;
  v_calls := custom.table_declare(v_org, jsonb_build_object('name', 'Service calls', 'slug', 'service_calls', 'type', 'entity',
    'label_singular', 'Service call', 'label_plural', 'Service calls', 'title_field', 'call_number', 'display', 'list', 'weight', 'light',
    'ordered', true, 'row_order', 'sorted', 'agent_writable', true, 'retention_days', 3650,
    'default_sort', jsonb_build_array(jsonb_build_object('field', 'call_number', 'direction', 'asc')),
    'parent_id', v_home::text, 'fields', jsonb_build_array(jsonb_build_object('name', 'call_number'))));
  insert into scheduler.sch_task (user_id, kind, title, organization_id, surfaces)
  values (c_admin, 'agent', 'Draft the invoice when a service call is complete', v_org, array['server']) returning id into v_task;
  insert into scheduler.sch_agent_task (id, prompt, auth_mode) values (v_task, 'If the call now reads Complete, draft the invoice.', 'auto');

  -- R1
  v_ok := false;
  begin
    insert into scheduler.sch_trigger (task_id, user_id, type, config, organization_id)
    values (v_task, c_admin, 'event', jsonb_build_object('entity_type', 'custom_record:' || v_calls::text, 'table_id', v_calls::text), v_org);
  exception when check_violation then
    v_ok := sqlerrm like '%retired key custom_record:%';
  end;
  if not v_ok then raise exception 'R1 RED: a schedule saved with custom_record:<table> was not refused by name'; end if;
  raise notice 'R1 PASS — a custom_record: schedule is refused 23514 by name.';

  -- R2
  v_ok := false;
  begin
    insert into files.webhooks (owner_id, organization_id, target_url, secret, description, resource_types)
    values (c_admin, v_org, 'https://hooks.harborpointplumbing.com/matrx/dispatch-board', encode(extensions.gen_random_bytes(32), 'hex'),
            'Dispatch board', array['custom_record:' || v_calls::text]);
  exception when check_violation then
    v_ok := sqlerrm like '%retired key%';
  end;
  if not v_ok then raise exception 'R2 RED: a webhook saved with custom_record:<table> was not refused'; end if;
  raise notice 'R2 PASS — a custom_record: webhook is refused 23514 by name.';

  -- R3
  insert into scheduler.sch_trigger (task_id, user_id, type, config, organization_id)
  values (v_task, c_admin, 'event', jsonb_build_object('entity_type', custom.record_source_key(v_calls), 'table_id', v_calls::text), v_org);
  insert into files.webhooks (owner_id, organization_id, target_url, secret, description, resource_types)
  values (c_admin, v_org, 'https://hooks.harborpointplumbing.com/matrx/service-calls', encode(extensions.gen_random_bytes(32), 'hex'),
          'Accounting', array[custom.record_source_key(v_calls)]);
  raise notice 'R3 PASS — the record:<table> schedule and webhook save.';

  -- R4
  perform set_config('role', 'authenticated', true);
  select count(*) into v_n from custom.table_webhooks(v_org, v_calls);
  perform set_config('role', 'postgres', true);
  if v_n <> 1 then raise exception 'R4 RED: the table lists % webhook(s), want 1', v_n; end if;
  raise notice 'R4 PASS — the table''s webhook list reads the record:<table> webhook.';
  raise notice 'SOURCE-KEY STEP 2 GREEN — R1..R4 passed.';
end $t$;
rollback;
