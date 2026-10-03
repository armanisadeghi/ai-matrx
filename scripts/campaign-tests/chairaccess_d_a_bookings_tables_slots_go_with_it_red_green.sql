-- LANE CHAIR-ACCESS d — A BOOKINGS TABLE'S SLOTS GO WITH IT, AND COME BACK WITH IT.
--
-- Cedar Ridge Physical Therapy (a fresh fixture organization each run; rolled back). Dr. Ana Whitfield
-- (admin@admin.com) keeps a "Consults" Table with a public booking page; the store made its slots Table
-- (slug booking_slots_<consults id>) beside it. Ana archives the Consults Table as a whole, then brings it
-- back.
--
-- WHAT MUST HOLD:
--   · after the archive, the slots Table is archived too, and the parent's archive event names it (built_on kind table);
--   · the organization's live table list no longer shows the slots Table;
--   · after the restore, the Consults Table AND its slots Table are live again;
--   · an ordinary Table (no slots) archives and restores exactly as before.
--
-- RED before migrations/campaign/chairaccess_d_a_bookings_tables_slots_go_with_it.sql (the slots Table
-- stays live), GREEN after. One transaction, rolled back; prints one row per check and a last line
-- `chairaccess d: N of M checks hold`.

\set ON_ERROR_STOP on
\timing off
\set suite 'chairaccess_d_a_bookings_tables_slots_go_with_it_red_green.sql'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local lock_timeout = '10s';
set local statement_timeout = '300s';

create temp table cc (k text primary key, v uuid) on commit drop;
create temp table cc_out (n serial, check_name text, want text, got text) on commit drop;
grant select, insert on cc, cc_out to authenticated;
grant usage on sequence cc_out_n_seq to authenticated;

do $fixture$
declare
  c_admin constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  v_org uuid := gen_random_uuid(); v_home uuid; v_table uuid; v_plain uuid; v_f1 uuid; v_f2 uuid; v_accept uuid; v_made jsonb; v_slots uuid;
begin
  perform set_config('app.actor_system', 'campaign-test/chairaccess-d', true);
  perform set_config('request.jwt.claims', json_build_object('sub', c_admin, 'role', 'authenticated')::text, true);
  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'Cedar Ridge Physical Therapy ' || substr(v_org::text, 1, 8), 'cedar-ridge-pt-' || substr(v_org::text, 1, 8), 'CRP', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status, created_by)
  values (v_org, 'organization', v_org, c_admin, 'owner', 'active', c_admin);
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note, updated_by)
  values ('custom', 'system_enabled', 'organization', v_org, v_org, 'true'::jsonb, 'chairaccess d fixture', c_admin);
  perform set_config('role', 'authenticated', true);

  v_home := custom.record_write(v_org, custom.organization_kernel_id(), jsonb_build_object('name', 'Clinic', '_actor', 'user'));
  v_table := custom.table_declare(v_org, jsonb_build_object(
      'name', 'Consults', 'slug', 'consults', 'type', 'entity', 'display', 'list', 'ordered', false, 'weight', 'light',
      'retention_days', 30, 'row_order', 'sorted',
      'default_sort', jsonb_build_array(jsonb_build_object('field', 'full_name', 'direction', 'asc')),
      'agent_writable', true, 'label_singular', 'Consult', 'label_plural', 'Consults', 'title_field', 'full_name',
      'fields', jsonb_build_array(jsonb_build_object('name', 'full_name'), jsonb_build_object('name', 'email')),
      'parent_id', v_home));
  v_f1 := custom.field_declare(v_org, v_table, jsonb_build_object('label', 'full name', 'key', 'full_name', 'type', 'text', 'required', true));
  v_f2 := custom.field_declare(v_org, v_table, jsonb_build_object('label', 'email', 'key', 'email', 'type', 'text', 'required', true));
  v_accept := custom.rule_declare(v_org, jsonb_build_object(
      'name', 'every answer is there', 'kind', 'predicate', 'uses', jsonb_build_array('validate'),
      'scope_table_id', v_table, 'applies_to_types', '[]'::jsonb,
      'expr', jsonb_build_object('op', 'and', 'args', jsonb_build_array(
                jsonb_build_object('op', 'present', 'args', jsonb_build_array(jsonb_build_object('field', v_f1))),
                jsonb_build_object('op', 'present', 'args', jsonb_build_array(jsonb_build_object('field', v_f2))))),
      'description', 'the booking page''s accept Rule'), null);
  v_made := custom.booking_declare(v_org, v_table, 'Initial consult',
      jsonb_build_array(
        jsonb_build_object('field', 'full_name', 'ask', 'Your name', 'required', true),
        jsonb_build_object('field', 'email', 'ask', 'Your email', 'required', true)),
      jsonb_build_object('timezone', 'America/Los_Angeles', 'slot_minutes', 30, 'lead_minutes', 0, 'max_per_day', 12, 'days', 5,
        'windows', jsonb_build_array(
          jsonb_build_object('weekday', 1, 'from', '09:00', 'to', '17:00'),
          jsonb_build_object('weekday', 2, 'from', '09:00', 'to', '17:00'),
          jsonb_build_object('weekday', 3, 'from', '09:00', 'to', '17:00'),
          jsonb_build_object('weekday', 4, 'from', '09:00', 'to', '17:00'),
          jsonb_build_object('weekday', 5, 'from', '09:00', 'to', '17:00'))),
      '{}'::jsonb, null, v_accept, null, null, null, v_home);
  v_slots := (v_made ->> 'slot_table_id')::uuid;
  -- a plain Table, for the "exactly as before" check
  v_plain := custom.table_declare(v_org, jsonb_build_object(
      'name', 'Equipment inventory', 'slug', 'equipment_inventory', 'type', 'entity', 'display', 'list', 'ordered', false, 'weight', 'light',
      'retention_days', 30, 'row_order', 'sorted', 'default_sort', '[]'::jsonb,
      'agent_writable', false, 'label_singular', 'Equipment item', 'label_plural', 'Equipment inventory', 'title_field', 'item',
      'fields', jsonb_build_array(jsonb_build_object('name', 'item')), 'parent_id', v_home));
  perform custom.record_write(v_org, v_plain, jsonb_build_object('item', 'Ultrasound gel, 5 L'));
  perform set_config('role', 'postgres', true);
  insert into cc values ('org', v_org), ('consults', v_table), ('slots', v_slots), ('plain', v_plain), ('form', (v_made ->> 'form_id')::uuid);
  insert into cc_out (check_name, want, got) values ('fixture: the store made the slots table beside the bookings table', 'live',
    case when exists (select 1 from custom.record r where r.organization_id = v_org and r.id = v_slots and r.deleted_at is null
                        and r.data ->> 'slug' = 'booking_slots_' || replace(v_table::text, '-', '')) then 'live' else 'missing' end);
end $fixture$;

-- ARCHIVE the bookings Table as a whole, as Ana
do $archive$
declare v_org uuid; v_t uuid; v_slots uuid; v_plain uuid; v_res jsonb; v_event history.migration_log;
begin
  select v into v_org from cc where k = 'org'; select v into v_t from cc where k = 'consults';
  select v into v_slots from cc where k = 'slots'; select v into v_plain from cc where k = 'plain';
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}', true);
  loop
    v_res := custom.table_archive(v_org, v_t, 50, true);
    exit when coalesce((v_res ->> 'done')::boolean, true);
  end loop;
  loop
    v_res := custom.table_archive(v_org, v_plain, 50, true);
    exit when coalesce((v_res ->> 'done')::boolean, true);
  end loop;
  perform set_config('role', 'postgres', true);
  insert into cc_out (check_name, want, got) values ('archive: the bookings table is archived', 'archived',
    case when (select deleted_at is not null from custom.record where organization_id = v_org and id = v_t) then 'archived' else 'live' end);
  insert into cc_out (check_name, want, got) values ('archive: the slots table went with it', 'archived',
    case when (select deleted_at is not null from custom.record where organization_id = v_org and id = v_slots) then 'archived' else 'live' end);
  v_event := custom.archive_event_of(v_org, v_t);
  insert into cc_out (check_name, want, got) values ('archive: the parent''s event names the slots table (built_on kind table)', 'named',
    case when exists (select 1 from jsonb_array_elements(coalesce(v_event.inverse -> 'built_on', '[]'::jsonb)) x
                       where x ->> 'kind' = 'table' and x ->> 'id' = v_slots::text) then 'named' else 'not named' end);
  insert into cc_out (check_name, want, got) values ('archive: the live table list leaves the slots table out', 'left out',
    case when exists (select 1 from custom.record r where r.organization_id = v_org and r.table_id = custom.table_kernel_id()
                        and r.deleted_at is null and r.id = v_slots) then 'listed' else 'left out' end);
  insert into cc_out (check_name, want, got) values ('archive: the plain table archived as before', 'archived',
    case when (select deleted_at is not null from custom.record where organization_id = v_org and id = v_plain) then 'archived' else 'live' end);
end $archive$;

-- RESTORE both, as Ana
do $restore$
declare v_org uuid; v_t uuid; v_slots uuid; v_plain uuid;
begin
  select v into v_org from cc where k = 'org'; select v into v_t from cc where k = 'consults';
  select v into v_slots from cc where k = 'slots'; select v into v_plain from cc where k = 'plain';
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}', true);
  perform custom.record_restore(v_org, v_t);
  perform custom.record_restore(v_org, v_plain);
  perform set_config('role', 'postgres', true);
  insert into cc_out (check_name, want, got) values ('restore: the bookings table is live again', 'live',
    case when (select deleted_at is null from custom.record where organization_id = v_org and id = v_t) then 'live' else 'archived' end);
  insert into cc_out (check_name, want, got) values ('restore: the slots table came back with it', 'live',
    case when (select deleted_at is null from custom.record where organization_id = v_org and id = v_slots) then 'live' else 'archived' end);
  insert into cc_out (check_name, want, got) values ('restore: the slots table''s own columns are live', '3',
    (select count(*)::text from custom.record f where f.organization_id = v_org and f.table_id = custom.field_kernel_id()
      and f.deleted_at is null and f.data ->> 'entity_definition_id' = v_slots::text));
  insert into cc_out (check_name, want, got) values ('restore: the plain table and its row came back as before', 'live 1',
    (select case when t.deleted_at is null then 'live' else 'archived' end || ' ' ||
            (select count(*) from custom.record r where r.organization_id = v_org and r.table_id = v_plain and r.data_class = 'record' and r.deleted_at is null)::text
       from custom.record t where t.organization_id = v_org and t.id = v_plain));
end $restore$;

select n, check_name, want, got, case when want = got then 'HOLDS' else 'FAILS' end as verdict from cc_out order by n;
select format('chairaccess d: %s of %s checks hold', count(*) filter (where want = got), count(*)) from cc_out;
rollback;
