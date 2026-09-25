-- LANE SOURCE-KEY, STEP 3 (closes the lane) — THE STORE'S TWO READERS STOP ACCEPTING THE RETIRED
-- `custom_record:<table id>` KEY AT ALL.
--
-- THE USE CASE. Harbor Point Plumbing & Drain's office manager (admin@admin.com) has a webhook
-- and a schedule watching her "Service calls" table, both saved the current way, under
-- `record:<table id>` (step 2 refuses anything else on write). Nothing legitimate should ever
-- again ask "is this the old key" — this suite proves the two readers just don't recognize it.
--
-- WHAT MAKES IT FAIL:
--   T1  custom.record_source_table('custom_record:<table>') still resolves to the table (old
--       acceptance not removed).
--   T2  custom.record_source_keys(<table>) still carries the old-prefix key (still a 2-element
--       array, or its second element is not the new key alone).
--   T3  the new key stops working too (over-corrected — record_source_table/keys must still
--       answer `record:<table>`).
--   T4  a table's live webhook (saved under record:, per step 2) stops showing up in
--       custom.table_webhooks (the narrowed reader broke the sibling that still matters).

\set ON_ERROR_STOP on
\timing off
\set suite 'sourcekey_the_old_key_is_no_longer_read_red_green.sql'
\set requires 'function:custom.record_source_table|function:custom.record_source_keys|function:custom.table_webhooks'
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
  v_org uuid := gen_random_uuid(); v_home uuid; v_calls uuid; v_n integer;
  v_old_key text; v_new_key text; v_keys text[];
begin
  perform set_config('app.actor_system', 'campaign-test/sourcekey-step3', true);
  perform set_config('request.jwt.claims', c_admin_j, true);
  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'Harbor Point Plumbing & Drain ' || substr(v_org::text, 1, 8), 'harbor-point-plumbing-' || substr(v_org::text, 1, 8), 'HPP', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status)
  values (v_org, 'organization', v_org, c_admin, 'owner', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  values ('custom', 'system_enabled', 'organization', v_org, v_org, 'true'::jsonb, 'sourcekey step 3 suite');
  insert into custom.record (organization_id, table_id, data) values (v_org, null, jsonb_build_object('name', 'Home')) returning id into v_home;
  v_calls := custom.table_declare(v_org, jsonb_build_object('name', 'Service calls', 'slug', 'service_calls', 'type', 'entity',
    'label_singular', 'Service call', 'label_plural', 'Service calls', 'title_field', 'call_number', 'display', 'list', 'weight', 'light',
    'ordered', true, 'row_order', 'sorted', 'agent_writable', true, 'retention_days', 3650,
    'default_sort', jsonb_build_array(jsonb_build_object('field', 'call_number', 'direction', 'asc')),
    'parent_id', v_home::text, 'fields', jsonb_build_array(jsonb_build_object('name', 'call_number'))));

  v_old_key := 'custom_record:' || v_calls::text;
  v_new_key := custom.record_source_key(v_calls);

  -- T1
  if custom.record_source_table(v_old_key) is not null then
    raise exception 'T1 RED: record_source_table still resolves the retired custom_record: key to %', custom.record_source_table(v_old_key);
  end if;
  raise notice 'T1 PASS — record_source_table(custom_record:<table>) is null.';

  -- T2
  v_keys := custom.record_source_keys(v_calls);
  if v_old_key = any (v_keys) then
    raise exception 'T2 RED: record_source_keys still carries the retired key: %', v_keys;
  end if;
  if cardinality(v_keys) <> 1 or v_keys[1] <> v_new_key then
    raise exception 'T2 RED: record_source_keys(<table>) is %, want exactly [%]', v_keys, v_new_key;
  end if;
  raise notice 'T2 PASS — record_source_keys(<table>) is exactly [%].', v_new_key;

  -- T3
  if custom.record_source_table(v_new_key) <> v_calls then
    raise exception 'T3 RED: record_source_table(%) is %, want %', v_new_key, custom.record_source_table(v_new_key), v_calls;
  end if;
  raise notice 'T3 PASS — record_source_table(record:<table>) still resolves.';

  -- T4
  insert into files.webhooks (owner_id, organization_id, target_url, secret, description, resource_types)
  values (c_admin, v_org, 'https://hooks.harborpointplumbing.com/matrx/service-calls', encode(extensions.gen_random_bytes(32), 'hex'),
          'Accounting', array[v_new_key]);
  perform set_config('role', 'authenticated', true);
  select count(*) into v_n from custom.table_webhooks(v_org, v_calls);
  perform set_config('role', 'postgres', true);
  if v_n <> 1 then raise exception 'T4 RED: the table lists % webhook(s) saved under record:<table>, want 1', v_n; end if;
  raise notice 'T4 PASS — the table''s webhook list still reads the record:<table> webhook.';

  raise notice 'SOURCE-KEY STEP 3 GREEN — T1..T4 passed.';
end $t$;
rollback;
