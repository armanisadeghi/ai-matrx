-- LANE CHAIR-ACCESS a — A MEMBER ADDS A FIELD TO AN OUTPUTS TABLE; "MEMBERS ADD THEIR OWN ROWS" IS ONE SETTING.
--
-- Cedar Ridge Physical Therapy (a fresh fixture organization each run; rolled back). Dr. Ana Whitfield
-- (admin@admin.com) owns the organization; Marisol Vega (test@test.com) is a member who VIEWS by default
-- (member_default_level = viewer). The app keeps a "Flashcard outputs" table for agent output in the
-- organization's "Platform tables" Home (marker kept_for = agent_output on the Home).
--
-- WHAT MUST HOLD:
--   · the outputs Home written through the record door stores the marker and answers viewer on the add rung;
--   · Marisol adds a row AND a column to the outputs table (NC-12);
--   · an outputs table whose document says members_add_rows = false takes rows from editors only (the
--     setting overrides the default);
--   · an ordinary table with members_add_rows = true takes Marisol's row; she edits hers, not Ana's;
--   · an ordinary table without the setting still refuses her row (the default is off);
--   · a column add on an ordinary members_add_rows table is still admin's.
--
-- RED before migrations/campaign/chairaccess_a_a_member_adds_a_field_to_an_outputs_table.sql (the column add
-- is refused; a stored false is ignored), GREEN after. One transaction, rolled back; prints one row per
-- check and a last line `chairaccess a: N of M checks hold`.

\set ON_ERROR_STOP on
\timing off
\set suite 'chairaccess_a_the_add_rung_and_the_field_add_red_green.sql'
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
  c_admin constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com, Ana
  c_test  constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';   -- test@test.com, Marisol
  v_org uuid := gen_random_uuid(); v_home uuid; v_app uuid; v_t uuid;
begin
  perform set_config('app.actor_system', 'campaign-test/chairaccess-a', true);
  perform set_config('request.jwt.claims', json_build_object('sub', c_admin, 'role', 'authenticated')::text, true);
  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'Cedar Ridge Physical Therapy ' || substr(v_org::text, 1, 8), 'cedar-ridge-pt-' || substr(v_org::text, 1, 8), 'CRP', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_org, 'organization', v_org, c_admin, 'owner',  'active'),
    (v_org, 'organization', v_org, c_test,  'member', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note) values
    ('custom', 'system_enabled',       'organization', v_org, v_org, 'true'::jsonb,     'chairaccess a fixture'),
    ('custom', 'member_default_level', 'organization', v_org, v_org, '"viewer"'::jsonb, 'chairaccess a fixture: members view by default');
  insert into custom.record (organization_id, table_id, data) values (v_org, null, jsonb_build_object('name', 'Clinic')) returning id into v_home;
  insert into cc values ('org', v_org), ('home', v_home);

  perform set_config('role', 'authenticated', true);
  -- the outputs Home, as the lander makes it
  v_app := custom.record_write(v_org, custom.person_kernel_id(), jsonb_build_object('name', 'Kept by the app', 'kept_for', 'agent_output'));
  insert into cc values ('apphome', v_app);
  -- an outputs table, and one whose organization turned member adds off
  v_t := custom.table_declare(v_org, jsonb_build_object(
    'name', 'Flashcard outputs', 'slug', 'flashcard_outputs', 'type', 'entity', 'kept_for', 'agent_output', 'kept_by_the_app', true,
    'label_singular', 'Flashcard output', 'label_plural', 'Flashcard outputs',
    'title_field', 'front', 'display', 'list', 'weight', 'light', 'ordered', false,
    'row_order', 'sorted', 'agent_writable', true, 'retention_days', 3650,
    'default_sort', '[]'::jsonb, 'parent_id', v_app::text,
    'fields', jsonb_build_array(jsonb_build_object('name', 'front'))));
  insert into cc values ('outputs', v_t);
  v_t := custom.table_declare(v_org, jsonb_build_object(
    'name', 'Summary outputs', 'slug', 'summary_outputs', 'type', 'entity', 'kept_for', 'agent_output', 'kept_by_the_app', true,
    'members_add_rows', false,
    'label_singular', 'Summary output', 'label_plural', 'Summary outputs',
    'title_field', 'summary', 'display', 'list', 'weight', 'light', 'ordered', false,
    'row_order', 'sorted', 'agent_writable', true, 'retention_days', 3650,
    'default_sort', '[]'::jsonb, 'parent_id', v_app::text,
    'fields', jsonb_build_array(jsonb_build_object('name', 'summary'))));
  insert into cc values ('outputs_closed', v_t);
  -- an ordinary table that takes members' own rows, and one that does not
  v_t := custom.table_declare(v_org, jsonb_build_object(
    'name', 'Shift swap requests', 'slug', 'shift_swap_requests', 'type', 'entity', 'members_add_rows', true,
    'label_singular', 'Shift swap request', 'label_plural', 'Shift swap requests',
    'title_field', 'reason', 'display', 'list', 'weight', 'light', 'ordered', false,
    'row_order', 'sorted', 'agent_writable', false, 'retention_days', 3650,
    'default_sort', '[]'::jsonb, 'parent_id', v_home::text,
    'fields', jsonb_build_array(jsonb_build_object('name', 'reason'))));
  insert into cc values ('swaps', v_t);
  insert into cc values ('swap_theirs', custom.record_write(v_org, v_t, jsonb_build_object('reason', 'Covering the Saturday clinic.')));
  v_t := custom.table_declare(v_org, jsonb_build_object(
    'name', 'Equipment inventory', 'slug', 'equipment_inventory', 'type', 'entity',
    'label_singular', 'Equipment item', 'label_plural', 'Equipment inventory',
    'title_field', 'item', 'display', 'list', 'weight', 'light', 'ordered', false,
    'row_order', 'sorted', 'agent_writable', false, 'retention_days', 3650,
    'default_sort', '[]'::jsonb, 'parent_id', v_home::text,
    'fields', jsonb_build_array(jsonb_build_object('name', 'item'))));
  insert into cc values ('inventory', v_t);
  perform set_config('role', 'postgres', true);
end $fixture$;

-- the rungs, read as the store's owner (the helper is the doors' own)
do $rungs$
declare v_org uuid;
begin
  select v into v_org from cc where k = 'org';
  insert into cc_out (check_name, want, got) values ('home: the outputs Home stores its marker', 'agent_output',
    coalesce((select r.data ->> 'kept_for' from custom.record r where r.id = (select v from cc where k = 'apphome')), 'none'));
  insert into cc_out (check_name, want, got) values ('home: add rung on the outputs Home', 'viewer', custom.table_add_rung(v_org, (select v from cc where k = 'apphome'))::text);
  insert into cc_out (check_name, want, got) values ('home: add rung on a plain Home', 'editor', custom.table_add_rung(v_org, (select v from cc where k = 'home'))::text);
  insert into cc_out (check_name, want, got) values ('rung: outputs table', 'viewer', custom.table_add_rung(v_org, (select v from cc where k = 'outputs'))::text);
  insert into cc_out (check_name, want, got) values ('rung: outputs table with members_add_rows = false', 'editor', custom.table_add_rung(v_org, (select v from cc where k = 'outputs_closed'))::text);
  insert into cc_out (check_name, want, got) values ('rung: ordinary table with members_add_rows = true', 'viewer', custom.table_add_rung(v_org, (select v from cc where k = 'swaps'))::text);
  insert into cc_out (check_name, want, got) values ('rung: ordinary table without the setting', 'editor', custom.table_add_rung(v_org, (select v from cc where k = 'inventory'))::text);
end $rungs$;

-- MARISOL'S SEAT: a member who views by default
do $marisol$
declare v_org uuid; v_t uuid; v_mine uuid; v_theirs uuid;
begin
  select v into v_org from cc where k = 'org';
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}', true);

  select v into v_t from cc where k = 'outputs';
  begin
    perform custom.record_write(v_org, v_t, jsonb_build_object('front', 'Which muscles form the rotator cuff?'));
    insert into cc_out (check_name, want, got) values ('member: adds a row to the outputs table', 'ok', 'ok');
  exception when others then
    insert into cc_out (check_name, want, got) values ('member: adds a row to the outputs table', 'ok', 'refused: ' || left(sqlerrm, 90));
  end;
  begin
    perform custom.field_declare(v_org, v_t, jsonb_build_object('key', 'back', 'label', 'Back', 'type', 'text', 'sort', 20));
    insert into cc_out (check_name, want, got) values ('member: adds a column to the outputs table (NC-12)', 'ok', 'ok');
  exception when others then
    insert into cc_out (check_name, want, got) values ('member: adds a column to the outputs table (NC-12)', 'ok', 'refused: ' || left(sqlerrm, 90));
  end;

  select v into v_t from cc where k = 'outputs_closed';
  begin
    perform custom.record_write(v_org, v_t, jsonb_build_object('summary', 'Visit summary'));
    insert into cc_out (check_name, want, got) values ('member: outputs table with members_add_rows = false refuses her row', 'refused', 'ok');
  exception when others then
    insert into cc_out (check_name, want, got) values ('member: outputs table with members_add_rows = false refuses her row', 'refused', 'refused');
  end;
  begin
    perform custom.field_declare(v_org, v_t, jsonb_build_object('key', 'tone', 'label', 'Tone', 'type', 'text', 'sort', 20));
    insert into cc_out (check_name, want, got) values ('member: outputs table with members_add_rows = false refuses her column', 'refused', 'ok');
  exception when others then
    insert into cc_out (check_name, want, got) values ('member: outputs table with members_add_rows = false refuses her column', 'refused', 'refused');
  end;

  select v into v_t from cc where k = 'swaps'; select v into v_theirs from cc where k = 'swap_theirs';
  begin
    v_mine := custom.record_write(v_org, v_t, jsonb_build_object('reason', 'Dentist appointment Tuesday morning.'));
    insert into cc_out (check_name, want, got) values ('member: adds her own row to a members_add_rows table', 'ok', 'ok');
  exception when others then
    insert into cc_out (check_name, want, got) values ('member: adds her own row to a members_add_rows table', 'ok', 'refused: ' || left(sqlerrm, 90));
  end;
  begin
    perform custom.record_update(v_org, v_mine, jsonb_build_object('reason', 'Dentist moved to Wednesday.'), null);
    insert into cc_out (check_name, want, got) values ('member: edits her own row', 'ok', 'ok');
  exception when others then
    insert into cc_out (check_name, want, got) values ('member: edits her own row', 'ok', 'refused: ' || left(sqlerrm, 90));
  end;
  begin
    perform custom.record_update(v_org, v_theirs, jsonb_build_object('reason', 'tampered'), null);
    insert into cc_out (check_name, want, got) values ('member: cannot edit Ana''s row', 'refused', 'written');
  exception when others then
    insert into cc_out (check_name, want, got) values ('member: cannot edit Ana''s row', 'refused', 'refused');
  end;
  begin
    perform custom.field_declare(v_org, v_t, jsonb_build_object('key', 'shift', 'label', 'Shift', 'type', 'text', 'sort', 20));
    insert into cc_out (check_name, want, got) values ('member: a column on a members_add_rows table is still admin''s', 'refused', 'ok');
  exception when others then
    insert into cc_out (check_name, want, got) values ('member: a column on a members_add_rows table is still admin''s', 'refused', 'refused');
  end;

  select v into v_t from cc where k = 'inventory';
  begin
    perform custom.record_write(v_org, v_t, jsonb_build_object('item', 'Ultrasound gel, 5 L'));
    insert into cc_out (check_name, want, got) values ('member: an ordinary table without the setting refuses her row', 'refused', 'ok');
  exception when others then
    insert into cc_out (check_name, want, got) values ('member: an ordinary table without the setting refuses her row', 'refused', 'refused');
  end;
  perform set_config('role', 'postgres', true);
end $marisol$;

select n, check_name, want, got, case when want = got then 'HOLDS' else 'FAILS' end as verdict from cc_out order by n;
select format('chairaccess a: %s of %s checks hold', count(*) filter (where want = got), count(*)) from cc_out;
rollback;
