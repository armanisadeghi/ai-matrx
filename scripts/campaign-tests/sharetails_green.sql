-- LANE SHARE-TAILS — THE GREEN SUITE. "Only people I share it with" means only the owner and the
-- people named, and an availability row only ever names an organization.
--
-- THE REAL USE CASE: admin@admin.com runs Harbor Landscaping Crew, a throwaway organization in
-- which test@test.com (Dana) is a plain member. Admin keeps a Table, "Irrigation bids", with one
-- bid in it. The organization's member default is the platform's own (every member reads), so
-- Dana reads the Table — until admin sets it to "Only people I share it with". From then on Dana
-- is refused with the honest not-found, the Share dialog stops saying "organization default",
-- naming Dana by hand lets her back in (Table and bid), taking the name back shuts her out again,
-- and "Everyone in this organization" opens it to every member.
--
-- RUN IT (clone or branch; always ONE rolled-back transaction):
--   cd matrx-frontend && psql "<clone DSN>" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/sharetails_green.sql
-- ITS RED: before sharetails_* (and after their inverses) it fails at A1 (a person row can be
-- stamped availability) and, with A skipped, at B2 (Dana still reads the "mine" Table).

\set ON_ERROR_STOP on
\timing off

\set suite 'sharetails_green.sql'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local statement_timeout = '120s';
select set_config('app.actor_system', 'sharetails_green_suite', true);

-- ── fixtures (as the store owner)
insert into iam.organizations (id, name, slug, abbreviation, created_by)
values ('5ba5aa1e-0000-4a00-8a00-000000000a01', 'Harbor Landscaping Crew', 'harbor-landscaping-share-tails',
        'HLC', '87a6e699-3622-4869-8843-d0867456c0dd');
insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
 ('5ba5aa1e-0000-4a00-8a00-000000000a01', 'organization', '5ba5aa1e-0000-4a00-8a00-000000000a01',
  '87a6e699-3622-4869-8843-d0867456c0dd', 'owner', 'active'),
 ('5ba5aa1e-0000-4a00-8a00-000000000a01', 'organization', '5ba5aa1e-0000-4a00-8a00-000000000a01',
  '4060701e-706a-4c76-b3ca-0bbc69fa5a14', 'member', 'active');
insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
values ('custom', 'system_enabled', 'organization', '5ba5aa1e-0000-4a00-8a00-000000000a01',
        '5ba5aa1e-0000-4a00-8a00-000000000a01', 'true'::jsonb, 'SHARE-TAILS green suite');

create temp table st_probe (k text primary key, v uuid) on commit drop;
grant select on st_probe to authenticated;

do $t$
declare
  v_org constant uuid := '5ba5aa1e-0000-4a00-8a00-000000000a01';
  v_hq  constant uuid := '5ba5aa1e-0000-4a00-8a00-000000000101';
  v_adm constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  t uuid; b uuid;
begin
  insert into custom.record (id, organization_id, table_id, data_class, data, created_by)
  values (v_hq, v_org, '11111111-0000-4000-8000-000000000004', 'record', jsonb_build_object('name', 'Crew HQ'), v_adm);
  t := custom.table_declare(v_org, jsonb_build_object(
    'name', 'Irrigation bids', 'slug', 'irrigation_bids', 'label_singular', 'Bid', 'label_plural', 'Bids',
    'type', 'entity', 'display', 'list', 'ordered', false, 'weight', 'light', 'retention_days', 30,
    'default_sort', '[]'::jsonb, 'row_order', 'sorted', 'agent_writable', true,
    'fields', jsonb_build_array(jsonb_build_object('name', 'title', 'kind', 'text')),
    'title_field', 'title', 'parent_id', v_hq::text));
  update custom.record set created_by = v_adm where id = t;
  insert into custom.record (organization_id, table_id, data_class, data, created_by)
  values (v_org, t, 'record', jsonb_build_object('title', 'Dana Point HOA drip retrofit'), v_adm)
  returning id into b;
  insert into st_probe values ('tbl', t), ('bid', b);
end $t$;

-- ════════════ A — AN AVAILABILITY ROW NAMES AN ORGANIZATION; A SHARE NEVER CARRIES IT
-- (-v skip_a=1 skips part A, so part B's red can be shown on its own.)
\if :{?skip_a}
\else
do $t$
declare v_msg text;
begin
  -- A1: a person grant stamped availability is refused by name.
  begin
    insert into iam.permissions (resource_type, resource_id, granted_to_user_id, permission_level, created_by, status, granted_via)
    values ('record', (select v from st_probe where k = 'tbl'), '4060701e-706a-4c76-b3ca-0bbc69fa5a14',
            'viewer', '87a6e699-3622-4869-8843-d0867456c0dd', 'active', 'availability');
    raise exception 'A1 FAILED — a person grant was stamped availability.';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg <> 'Only an organization is made available; a person is shared with.' then
      raise exception 'A1 FAILED — the refusal does not say why: %', v_msg;
    end if;
  end;
  -- A2: a public row stamped availability is refused the same way.
  begin
    insert into iam.permissions (resource_type, resource_id, is_public, permission_level, created_by, status, granted_via)
    values ('record', (select v from st_probe where k = 'bid'), true, 'viewer',
            '87a6e699-3622-4869-8843-d0867456c0dd', 'active', 'availability');
    raise exception 'A2 FAILED — a public grant was stamped availability.';
  exception when check_violation then null;
  end;
  -- A3: every organization row that exists and is not archived says availability.
  if exists (select 1 from iam.permissions where granted_to_organization_id is not null
              and status <> 'archived' and granted_via is distinct from 'availability') then
    raise exception 'A3 FAILED — a live organization row does not say availability.';
  end if;
  raise notice 'PART A PASSED — availability names an organization and nothing else.';
end $t$;
\endif

-- ════════════ B — "MINE" MEANS ONLY THE OWNER AND THE PEOPLE NAMED
-- B1: before any choice, Dana (a plain member) reads the Table through the member default.
select set_config('request.jwt.claims', '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}', true);
set local role authenticated;
do $t$
declare n int;
begin
  perform custom.read_record('5ba5aa1e-0000-4a00-8a00-000000000a01', (select v from st_probe where k = 'tbl'), false);
  select count(*) into n from custom.read_records('5ba5aa1e-0000-4a00-8a00-000000000a01', (select v from st_probe where k = 'tbl'), true, 50, 0);
  if n <> 1 then raise exception 'B1 FAILED — Dana should read the one bid by the member default, read %', n; end if;
end $t$;
reset role;

-- admin: "Only people I share it with".
select set_config('request.jwt.claims', '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}', true);
set local role authenticated;
-- C1 (chair ruling 2026-09-25): a Table with NO lane row is the organization default, never "mine":
-- the lane door says organization and names the default, and the dialog lists the default row.
do $t$
declare d jsonb;
begin
  d := public.store_door_lane('record', (select v from st_probe where k = 'tbl'));
  if d ->> 'lane' is distinct from 'organization' or d ->> 'choice' is distinct from 'organization' then
    raise exception 'C1 FAILED — a Table with no lane row reads as %, not organization.', d ->> 'lane';
  end if;
  if d -> 'organization_default' ->> 'level' is distinct from 'viewer'
     or d -> 'organization_default' ->> 'organization_name' is distinct from 'Harbor Landscaping Crew' then
    raise exception 'C1 FAILED — the lane door does not name the organization default: %', d;
  end if;
  if not exists (select 1 from custom.share_access('5ba5aa1e-0000-4a00-8a00-000000000a01', (select v from st_probe where k = 'tbl')) a
                  where a.reason = 'organization default' and a.level = 'viewer') then
    raise exception 'C1 FAILED — the dialog does not list the organization-default row on a no-lane Table.';
  end if;
  raise notice 'C1 PASSED — no lane row reads as the organization default, and the dialog says so.';
end $t$;
select custom.share_lane_set('5ba5aa1e-0000-4a00-8a00-000000000a01', (select v from st_probe where k = 'tbl'), 'mine') ->> 'message' as said;
reset role;

-- B2: Dana is refused with the honest not-found, the list omits it, and its bid is not read.
select set_config('request.jwt.claims', '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}', true);
set local role authenticated;
do $t$
declare n int; v_state text; v_msg text;
begin
  begin
    perform custom.read_record('5ba5aa1e-0000-4a00-8a00-000000000a01', (select v from st_probe where k = 'tbl'), false);
    raise exception 'B2 FAILED — a member of the organization read a Table its owner set to "mine".';
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text;
    if v_msg like 'B2 FAILED%' then raise; end if;
    if v_state not in ('02000', '42501') then
      raise exception 'B2 FAILED — the refusal is not a not-found / no-access: % %', v_state, v_msg;
    end if;
    raise notice 'B2: Dana is told: [%] %', v_state, v_msg;
  end;
  select count(*) into n from custom.read_records('5ba5aa1e-0000-4a00-8a00-000000000a01', custom.table_kernel_id(), true, 500, 0) r
   where r.id = (select v from st_probe where k = 'tbl');
  if n <> 0 then raise exception 'B2 FAILED — the "mine" Table is still in Dana''s list of Tables.'; end if;
  begin
    select count(*) into n from custom.read_records('5ba5aa1e-0000-4a00-8a00-000000000a01', (select v from st_probe where k = 'tbl'), true, 50, 0);
    if n <> 0 then raise exception 'B2 FAILED — Dana read % bid(s) of a "mine" Table.', n; end if;
  exception when others then
    get stacked diagnostics v_msg = message_text;
    if v_msg like 'B2 FAILED%' then raise; end if;
  end;
end $t$;
reset role;
-- (the ladder itself, asked by the store owner about Dana)
do $t$
begin
  if custom.has_visibility('4060701e-706a-4c76-b3ca-0bbc69fa5a14', 'record', (select v from st_probe where k = 'bid'), 'viewer') then
    raise exception 'B2 FAILED — the ladder still lets Dana see a bid inside a "mine" Table.';
  end if;
end $t$;

-- B4: the owner still reads it all.
select set_config('request.jwt.claims', '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}', true);
set local role authenticated;
-- C2: after "mine" the lane door says mine and names no default.
do $t$
declare d jsonb;
begin
  d := public.store_door_lane('record', (select v from st_probe where k = 'tbl'));
  if d ->> 'lane' is distinct from 'mine' or d -> 'organization_default' <> 'null'::jsonb then
    raise exception 'C2 FAILED — after mine the lane door says %', d;
  end if;
end $t$;
-- B3: the Share dialog no longer says every member reaches it.
do $t$
begin
  if exists (select 1 from custom.share_access('5ba5aa1e-0000-4a00-8a00-000000000a01', (select v from st_probe where k = 'tbl')) a
              where a.reason = 'organization default') then
    raise exception 'B3 FAILED — the dialog still says every member reaches a "mine" Table.';
  end if;
end $t$;
do $t$
declare n int;
begin
  select count(*) into n from custom.read_records('5ba5aa1e-0000-4a00-8a00-000000000a01', (select v from st_probe where k = 'tbl'), true, 50, 0);
  if n <> 1 then raise exception 'B4 FAILED — the owner reads % bid(s) of their own "mine" Table.', n; end if;
end $t$;
-- B5: admin names Dana; she reads the Table and its bid.
select custom.share_grant('5ba5aa1e-0000-4a00-8a00-000000000a01', (select v from st_probe where k = 'tbl'),
                          'person', '4060701e-706a-4c76-b3ca-0bbc69fa5a14', 'viewer') is not null as named;
reset role;
select set_config('request.jwt.claims', '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}', true);
set local role authenticated;
do $t$
declare n int;
begin
  perform custom.read_record('5ba5aa1e-0000-4a00-8a00-000000000a01', (select v from st_probe where k = 'tbl'), false);
  select count(*) into n from custom.read_records('5ba5aa1e-0000-4a00-8a00-000000000a01', (select v from st_probe where k = 'tbl'), true, 50, 0);
  if n <> 1 then raise exception 'B5 FAILED — Dana, named on the Table, reads % bid(s).', n; end if;
end $t$;
reset role;

-- B6: the name taken back shuts her out again; "Everyone in this organization" opens it to members.
select set_config('request.jwt.claims', '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}', true);
set local role authenticated;
select custom.share_revoke('5ba5aa1e-0000-4a00-8a00-000000000a01', (select v from st_probe where k = 'tbl'),
                           'person', '4060701e-706a-4c76-b3ca-0bbc69fa5a14') is not null as unnamed;
reset role;
do $t$
begin
  if custom.has_visibility('4060701e-706a-4c76-b3ca-0bbc69fa5a14', 'record', (select v from st_probe where k = 'tbl'), 'viewer') then
    raise exception 'B6 FAILED — with her name taken back Dana still reaches the "mine" Table.';
  end if;
end $t$;
select set_config('request.jwt.claims', '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}', true);
set local role authenticated;
select custom.share_lane_set('5ba5aa1e-0000-4a00-8a00-000000000a01', (select v from st_probe where k = 'tbl'), 'organization') ->> 'message' as said;
reset role;
select set_config('request.jwt.claims', '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}', true);
set local role authenticated;
do $t$
declare n int;
begin
  select count(*) into n from custom.read_records('5ba5aa1e-0000-4a00-8a00-000000000a01', (select v from st_probe where k = 'tbl'), true, 50, 0);
  if n <> 1 then raise exception 'B6 FAILED — on the organization lane Dana reads % bid(s).', n; end if;
  raise notice 'PART B PASSED — mine is the owner and the people named; the organization lane is every member.';
end $t$;
reset role;
-- C3: the organization lane (a mine row plus an availability row) reads as organization; a record
-- with no lane row that its owner marked personal reads as mine.
do $t$
begin
  if iam.lane_of('record', (select v from st_probe where k = 'tbl')) is distinct from 'organization' then
    raise exception 'C3 FAILED — the organization lane reads as %', iam.lane_of('record', (select v from st_probe where k = 'tbl'));
  end if;
  update custom.record set visibility = 'personal' where id = (select v from st_probe where k = 'bid');
  if iam.lane_of('record', (select v from st_probe where k = 'bid')) is distinct from 'mine' then
    raise exception 'C3 FAILED — a personal record with no lane row reads as %', iam.lane_of('record', (select v from st_probe where k = 'bid'));
  end if;
  raise notice 'PART C PASSED — no lane row is the organization default; the lanes read as chosen.';
end $t$;

rollback;
