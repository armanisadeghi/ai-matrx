-- LANE SHARE-LANE-2 — THE GREEN SUITE. An organization's owner or admin does NOT open a personal
-- Table (one its owner set to "Only people I share it with") that they are not named on. Access is
-- personal (chair ruling 2026-09-25, the Google Workspace / Notion model: of course the admin cannot
-- read her private notes); what the organization's owners get instead is governance — the audited
-- custom.table_transfer_owner, proven in part T below.
--
-- THE REAL USE CASE: Cedar Hollow Veterinary. admin@admin.com owns the practice; test@test.com
-- (Dr. Reyes) is one of its admins and keeps "My case notes", set to "Only people I share it with".
--   S1  the owner opens neither the Table nor its row: the door answers exactly what it answers for
--       a record that is not there ("You do not have access to this record.", 42501).
--   S2  and the same from the other seat: an org ADMIN (Dr. Reyes) does not open the owner's own
--       personal Table "Owner payroll notes".
--   S3  named, the owner reads: Dr. Reyes shares the Table with admin by name, and admin reads it.
--   S4  the organization default is unchanged: a Table nobody set a lane on ("Kennel schedule")
--       is read by the owner (role arm) and, as a plain member, by Dr. Reyes (member default, viewer).
--   S5  platform admin arms unchanged: admin@admin.com is still a platform admin and the kernel's
--       platform-admin arm is byte-identical (the organization-role arms are the only ones touched).
--   T1  the transfer: admin (owner) hands "My case notes" to himself with a reason; the table is
--       now his, Dr. Reyes stays named as editor, one audit row and two notifications exist.
--   T2  the transfer refuses a plain member, a missing reason, and a person outside the organization.
--
-- RUN IT (clone or branch; always ONE rolled-back transaction):
--   cd matrx-frontend && psql "<clone DSN>" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/sharelane2_green.sql
-- ITS RED: before sharelane2_an_owner_does_not_open_a_personal_table.sql (and after its inverse) S1
-- fails: the owner reads the row of a personal Table at admin. Before
-- sharelane2_the_owner_transfers_a_personal_table.sql part T fails: there is no transfer door.

\set ON_ERROR_STOP on
\timing off

\set suite 'sharelane2_green.sql'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local statement_timeout = '180s';
select set_config('app.actor_system', 'sharelane2_green_suite', true);

-- ── fixtures (the owner is admin@admin.com; Dr. Reyes is test@test.com, an org admin)
insert into iam.organizations (id, name, slug, abbreviation, created_by)
values ('5ba5aa1e-0000-4a00-8a00-000000000c01', 'Cedar Hollow Veterinary', 'cedar-hollow-vet-share-lane-2',
        'CHV', '87a6e699-3622-4869-8843-d0867456c0dd');
insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
 ('5ba5aa1e-0000-4a00-8a00-000000000c01', 'organization', '5ba5aa1e-0000-4a00-8a00-000000000c01',
  '87a6e699-3622-4869-8843-d0867456c0dd', 'owner', 'active'),
 ('5ba5aa1e-0000-4a00-8a00-000000000c01', 'organization', '5ba5aa1e-0000-4a00-8a00-000000000c01',
  '4060701e-706a-4c76-b3ca-0bbc69fa5a14', 'admin', 'active');
insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
values ('custom', 'system_enabled', 'organization', '5ba5aa1e-0000-4a00-8a00-000000000c01',
        '5ba5aa1e-0000-4a00-8a00-000000000c01', 'true'::jsonb, 'SHARE-LANE-2 green suite');

create temp table s2_probe (k text primary key, v uuid) on commit drop;
grant select on s2_probe to authenticated;

do $t$
declare
  v_org constant uuid := '5ba5aa1e-0000-4a00-8a00-000000000c01';
  v_hq  constant uuid := '5ba5aa1e-0000-4a00-8a00-000000000c02';
  v_adm constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  v_dr  constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';
  t uuid; b uuid;
  f jsonb := jsonb_build_array(jsonb_build_object('name', 'title', 'kind', 'text'));
begin
  insert into custom.record (id, organization_id, table_id, data_class, data, created_by)
  values (v_hq, v_org, '11111111-0000-4000-8000-000000000004', 'record', jsonb_build_object('name', 'Front desk'), v_adm);
  -- Dr. Reyes' own Table
  t := custom.table_declare(v_org, jsonb_build_object(
    'name', 'My case notes', 'slug', 'my_case_notes', 'label_singular', 'Note', 'label_plural', 'Notes',
    'type', 'entity', 'display', 'list', 'ordered', false, 'weight', 'light', 'retention_days', 30,
    'default_sort', '[]'::jsonb, 'row_order', 'sorted', 'agent_writable', true,
    'fields', f, 'title_field', 'title', 'parent_id', v_hq::text));
  update custom.record set created_by = v_dr where id = t;
  insert into custom.record (organization_id, table_id, data_class, data, created_by)
  values (v_org, t, 'record', jsonb_build_object('title', 'Biscuit (beagle) - recheck ear cytology in 10 days'), v_dr)
  returning id into b;
  insert into s2_probe values ('notes', t), ('note', b);
  -- the owner's own Table
  t := custom.table_declare(v_org, jsonb_build_object(
    'name', 'Owner payroll notes', 'slug', 'owner_payroll_notes', 'label_singular', 'Note', 'label_plural', 'Notes',
    'type', 'entity', 'display', 'list', 'ordered', false, 'weight', 'light', 'retention_days', 30,
    'default_sort', '[]'::jsonb, 'row_order', 'sorted', 'agent_writable', true,
    'fields', f, 'title_field', 'title', 'parent_id', v_hq::text));
  update custom.record set created_by = v_adm where id = t;
  insert into custom.record (organization_id, table_id, data_class, data, created_by)
  values (v_org, t, 'record', jsonb_build_object('title', 'Q3 bonus pool for the kennel staff'), v_adm)
  returning id into b;
  insert into s2_probe values ('payroll', t), ('payline', b);
  -- a Table nobody set a lane on (the organization default)
  t := custom.table_declare(v_org, jsonb_build_object(
    'name', 'Kennel schedule', 'slug', 'kennel_schedule', 'label_singular', 'Shift', 'label_plural', 'Shifts',
    'type', 'entity', 'display', 'list', 'ordered', false, 'weight', 'light', 'retention_days', 30,
    'default_sort', '[]'::jsonb, 'row_order', 'sorted', 'agent_writable', true,
    'fields', f, 'title_field', 'title', 'parent_id', v_hq::text));
  update custom.record set created_by = v_dr where id = t;
  insert into custom.record (organization_id, table_id, data_class, data, created_by)
  values (v_org, t, 'record', jsonb_build_object('title', 'Saturday morning - two techs'), v_dr)
  returning id into b;
  insert into s2_probe values ('kennel', t), ('shift', b);
end $t$;

-- Dr. Reyes sets her notes to "Only people I share it with"; the owner sets his payroll notes the same.
select set_config('request.jwt.claims', '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}', true);
set local role authenticated;
select custom.share_lane_set('5ba5aa1e-0000-4a00-8a00-000000000c01', (select v from s2_probe where k = 'notes'), 'mine') ->> 'message' as said;
reset role;
select set_config('request.jwt.claims', '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}', true);
set local role authenticated;
select custom.share_lane_set('5ba5aa1e-0000-4a00-8a00-000000000c01', (select v from s2_probe where k = 'payroll'), 'mine') ->> 'message' as said;

-- S1: the owner, not named, opens neither the Table nor its row — the honest not-found.
do $t$
declare v_state text; v_msg text;
begin
  foreach v_msg in array array['notes', 'note'] loop
    begin
      perform custom.read_record('5ba5aa1e-0000-4a00-8a00-000000000c01', (select v from s2_probe where k = v_msg));
      raise exception 'S1 FAILED — the organization owner opened % of a personal Table he is not named on.', v_msg;
    exception when sqlstate '42501' then
      get stacked diagnostics v_state = returned_sqlstate, v_state = message_text;
      if v_state <> 'You do not have access to this record.' then
        raise exception 'S1 FAILED — the refusal is not the honest not-found: %', v_state;
      end if;
    end;
  end loop;
  -- and the door says the same for a record that does not exist (existence is not disclosed)
  begin
    perform custom.read_record('5ba5aa1e-0000-4a00-8a00-000000000c01', '5ba5aa1e-0000-4a00-8a00-00000000dead');
    raise exception 'S1 FAILED — a missing record read as something.';
  exception when sqlstate '42501' then
    get stacked diagnostics v_msg = message_text;
    if v_msg <> 'You do not have access to this record.' then
      raise exception 'S1 FAILED — a missing record and a refused one answer differently: %', v_msg;
    end if;
  end;
  raise notice 'S1 PASSED — the owner is refused on the Table and its row, same words as not-found';
end $t$;
reset role;
do $t$
begin
  if custom.effective_level('87a6e699-3622-4869-8843-d0867456c0dd', null, (select v from s2_probe where k = 'note')) is not null then
    raise exception 'S1 FAILED — the owner still holds a level on the row: %',
      custom.effective_level('87a6e699-3622-4869-8843-d0867456c0dd', null, (select v from s2_probe where k = 'note'));
  end if;
end $t$;

-- S2: an org ADMIN is refused on the owner's own personal Table too.
select set_config('request.jwt.claims', '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}', true);
set local role authenticated;
do $t$
begin
  begin
    perform custom.read_record('5ba5aa1e-0000-4a00-8a00-000000000c01', (select v from s2_probe where k = 'payline'));
    raise exception 'S2 FAILED — an organization admin read a row of the owner''s personal Table.';
  exception when sqlstate '42501' then null;
  end;
  raise notice 'S2 PASSED — the org admin is refused on the owner''s personal Table';
end $t$;

-- S3: named, the owner reads. Dr. Reyes shares her notes with him by name.
select custom.share_grant('5ba5aa1e-0000-4a00-8a00-000000000c01', (select v from s2_probe where k = 'notes'),
                          'person', '87a6e699-3622-4869-8843-d0867456c0dd', 'viewer') is not null as granted;
reset role;
select set_config('request.jwt.claims', '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}', true);
set local role authenticated;
do $t$
declare d jsonb;
begin
  d := custom.read_record('5ba5aa1e-0000-4a00-8a00-000000000c01', (select v from s2_probe where k = 'note'));
  if d is null then raise exception 'S3 FAILED — named, the owner still cannot read the row.'; end if;
  perform custom.read_record('5ba5aa1e-0000-4a00-8a00-000000000c01', (select v from s2_probe where k = 'notes'));
  raise notice 'S3 PASSED — named, the owner reads the Table and its row';
end $t$;
-- S4 (owner half): the organization-default Table is read by the owner as before.
do $t$
begin
  perform custom.read_record('5ba5aa1e-0000-4a00-8a00-000000000c01', (select v from s2_probe where k = 'shift'));
  raise notice 'S4a PASSED — the owner reads a row of an organization-default Table';
end $t$;
reset role;
-- revoke the S3 grant so part T starts from "not named"
update iam.permissions set status = 'archived'
 where resource_type = 'record' and resource_id = (select v from s2_probe where k = 'notes')
   and granted_to_user_id = '87a6e699-3622-4869-8843-d0867456c0dd';

-- S4 (member half): as a PLAIN member Dr. Reyes reads the owner's organization-default Table rows at viewer.
update iam.memberships set role = 'member'
 where organization_id = '5ba5aa1e-0000-4a00-8a00-000000000c01' and container_type = 'organization'
   and user_id = '4060701e-706a-4c76-b3ca-0bbc69fa5a14';
update custom.record set created_by = '87a6e699-3622-4869-8843-d0867456c0dd'
 where id in ((select v from s2_probe where k = 'kennel'), (select v from s2_probe where k = 'shift'));
do $t$
declare l public.permission_level;
begin
  l := custom.effective_level('4060701e-706a-4c76-b3ca-0bbc69fa5a14', null, (select v from s2_probe where k = 'shift'));
  if l is distinct from 'viewer' then
    raise exception 'S4b FAILED — the member default on an organization-default Table moved: %', l;
  end if;
  raise notice 'S4b PASSED — a plain member reads an organization-default Table at viewer';
end $t$;
update iam.memberships set role = 'admin'
 where organization_id = '5ba5aa1e-0000-4a00-8a00-000000000c01' and container_type = 'organization'
   and user_id = '4060701e-706a-4c76-b3ca-0bbc69fa5a14';

-- S5: platform-admin arms unchanged.
do $t$
declare v_body text := pg_get_functiondef('iam.has_access_for_base(uuid,text,uuid,public.permission_level,boolean,text[])'::regprocedure);
begin
  if position('if v_lanes.platform_admin_lane
       and v_org is not null and v_org in (select organization_id from iam.system_orgs where global_readable)
       and (v_vis >= ''internal''::platform.visibility
            or (not iam.table_has_visibility(v_schema, v_table) and not iam.token_is_parented_component(v_type)))
       and public.is_super_admin_for(v_uid) then return true; end if;' in v_body) = 0 then
    raise exception 'S5 FAILED — the kernel''s platform-admin arm is not the one it was.';
  end if;
  -- custom.record's platform-admin policies are not touched by either SHARE-LANE-2 file (neither
  -- names a policy); the mirror is not client-reachable (authenticated holds no SELECT on it).
  if has_table_privilege('authenticated', 'custom.record', 'select') then
    raise exception 'S5 FAILED — custom.record became directly readable, so its policy text is a door again.';
  end if;
  if not public.is_super_admin_for('87a6e699-3622-4869-8843-d0867456c0dd') then
    raise exception 'S5 FAILED — admin@admin.com is no longer a platform admin.';
  end if;
  raise notice 'S5 PASSED — platform-admin arms unchanged';
end $t$;

-- ── PART T: the transfer (sharelane2_the_owner_transfers_a_personal_table.sql)
\if :{?skip_transfer}
\echo 'PART T SKIPPED (skip_transfer set)'
\else
select set_config('request.jwt.claims', '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}', true);
set local role authenticated;
do $t$
declare d jsonb; v_msg text;
begin
  -- T2a: a reason is required
  begin
    perform custom.table_transfer_owner((select v from s2_probe where k = 'notes'), '87a6e699-3622-4869-8843-d0867456c0dd', '  ');
    raise exception 'T2a FAILED — a transfer with no reason went through.';
  exception when sqlstate '22023' then null;
  end;
  -- T2b: the person must belong to the organization
  begin
    perform custom.table_transfer_owner((select v from s2_probe where k = 'notes'), '5ba5aa1e-0000-4a00-8a00-00000000beef', 'Dr. Reyes is leaving the practice');
    raise exception 'T2b FAILED — a transfer to somebody outside the organization went through.';
  exception when sqlstate '22023' then null;
  end;
  -- T1: the owner transfers Dr. Reyes' notes to himself, with a reason.
  d := custom.table_transfer_owner((select v from s2_probe where k = 'notes'), '87a6e699-3622-4869-8843-d0867456c0dd',
                                   'Dr. Reyes is moving to the Irvine clinic; her open cases stay with the practice.');
  if (d ->> 'to_person')::uuid is distinct from '87a6e699-3622-4869-8843-d0867456c0dd'
     or (d ->> 'from_person')::uuid is distinct from '4060701e-706a-4c76-b3ca-0bbc69fa5a14' then
    raise exception 'T1 FAILED — the door answered %', d;
  end if;
  -- he now reads it, and it is still personal (now to him)
  perform custom.read_record('5ba5aa1e-0000-4a00-8a00-000000000c01', (select v from s2_probe where k = 'note'));
  raise notice 'T1a PASSED — %', d ->> 'message';
end $t$;
reset role;
do $t$
declare v_t uuid := (select v from s2_probe where k = 'notes');
begin
  if (select created_by from custom.record where id = v_t) <> '87a6e699-3622-4869-8843-d0867456c0dd' then
    raise exception 'T1 FAILED — the Table''s owner did not change.';
  end if;
  if (select visibility from custom.record where id = v_t) <> 'personal' then
    raise exception 'T1 FAILED — the transfer changed who can see the Table: %', (select visibility from custom.record where id = v_t);
  end if;
  if iam.grant_addressed_level('4060701e-706a-4c76-b3ca-0bbc69fa5a14', 'record', v_t) is distinct from 'editor' then
    raise exception 'T1 FAILED — the previous owner is not named as editor: %',
      iam.grant_addressed_level('4060701e-706a-4c76-b3ca-0bbc69fa5a14', 'record', v_t);
  end if;
  if (select count(*) from iam.org_admin_audit a
       where a.organization_id = '5ba5aa1e-0000-4a00-8a00-000000000c01'
         and a.action = 'table.transfer_owner' and (a.detail ->> 'table_id')::uuid = v_t
         and a.actor_user_id = '87a6e699-3622-4869-8843-d0867456c0dd'
         and a.target_user_id = '4060701e-706a-4c76-b3ca-0bbc69fa5a14'
         and a.detail ->> 'reason' like 'Dr. Reyes is moving%') <> 1 then
    raise exception 'T1 FAILED — no single audit row names who, what and why.';
  end if;
  if (select count(*) from communication.notification n
       where n.event_key = 'custom.table.ownership_transferred' and n.target_id = v_t and n.channel = 'in_app'
         and n.recipient_user_id in ('87a6e699-3622-4869-8843-d0867456c0dd', '4060701e-706a-4c76-b3ca-0bbc69fa5a14')) <> 2 then
    raise exception 'T1 FAILED — both people were not notified.';
  end if;
  raise notice 'T1b PASSED — owner moved, visibility kept, previous owner named editor, one audit row, two notifications';
end $t$;
-- T2c: a plain member may not transfer.
update iam.memberships set role = 'member'
 where organization_id = '5ba5aa1e-0000-4a00-8a00-000000000c01' and container_type = 'organization'
   and user_id = '4060701e-706a-4c76-b3ca-0bbc69fa5a14';
select set_config('request.jwt.claims', '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}', true);
set local role authenticated;
do $t$
begin
  begin
    perform custom.table_transfer_owner((select v from s2_probe where k = 'payroll'), '4060701e-706a-4c76-b3ca-0bbc69fa5a14', 'I would like the payroll notes');
    raise exception 'T2c FAILED — a plain member transferred a Table.';
  exception when sqlstate '42501' then null;
  end;
  raise notice 'T2 PASSED — no reason, an outsider, and a plain member are each refused';
end $t$;
reset role;
\endif

\echo 'ALL PASSED — sharelane2_green'
rollback;
