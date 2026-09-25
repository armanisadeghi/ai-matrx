-- LANE VIEW-SWITCH-NOT-DESIGNATION — A LOOK AT A TABLE NEVER CHANGES HOW IT OPENS; ONLY THE
-- EXPLICIT DESIGNATE DOOR DOES (VERIFIER-21, production 2026-09-25).
--
-- THE USE CASE. Rincon Plumbing Co's owner (admin@admin.com, editor) keeps "Service Calls", which
-- opens as the Sheet. The office member (test@test.com, commenter) opens it every morning. Either
-- of them pressing Kanban or Calendar must leave the table opening as the Sheet for both; only the
-- owner's "Make this the default" changes it. Every name is synthesized; the fixture is rolled back.
--
-- CLAUSES
--   V1  the owner saves the table's first default view as the Sheet (a first default is allowed).
--   V2  the owner's layout switch (view_declare {view_id, layout: kanban}) on the default view is
--       refused by name and the designation is untouched (RED on ORDER-FIX's body: it merged).
--   V3  a sort pressed on the default view still merges (the rest of a view is still the viewer's).
--   V4  the member's layout switch (calendar) on the default view is refused; designation untouched.
--   V5  a second view cannot be saved as the default through view_declare.
--   V6  the member cannot designate (custom.view_designate needs editor on the table).
--   V7  the owner designates the default as the Calendar: layout calendar, still the one default.
--   V8  the owner designates another view: it is the only default (row and definition), the old
--       one is not; a layout change on a view that is NOT the default still saves.
--
-- RUN IT (the dev clone):  psql <clone> -v ON_ERROR_STOP=1 -f scripts/campaign-tests/viewswitch_green.sql

\set ON_ERROR_STOP on
\timing off
\set suite 'viewswitch_green.sql'
\set requires 'function:custom.view_declare|function:custom.view_keys|function:custom.table_declare|function:custom.field_declare'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local lock_timeout = '10s';
set local statement_timeout = '120s';

create temp table vs (k text primary key, v uuid) on commit drop;
grant select, insert on vs to authenticated;

do $fixture$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_member  constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';   -- test@test.com
  v_org uuid := gen_random_uuid();
  v_home uuid; v_calls uuid;
begin
  perform set_config('app.actor_system', 'campaign-test/viewswitch', true);
  perform set_config('request.jwt.claims', '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}', true);
  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'Rincon Plumbing Co ' || substr(v_org::text, 1, 8),
          'rincon-plumbing-co-' || substr(v_org::text, 1, 8), 'RPC', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_org, 'organization', v_org, c_admin,  'owner',  'active'),
    (v_org, 'organization', v_org, c_member, 'member', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note) values
    ('custom', 'system_enabled',       'organization', v_org, v_org, 'true'::jsonb,        'viewswitch fixture'),
    ('custom', 'member_default_level', 'organization', v_org, v_org, '"commenter"'::jsonb, 'viewswitch fixture: the office member reads and comments');
  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name', 'Home')) returning id into v_home;
  v_calls := custom.table_declare(v_org, jsonb_build_object(
    'name', 'Service Calls', 'slug', 'service_calls', 'type', 'entity',
    'label_singular', 'Service call', 'label_plural', 'Service calls',
    'title_field', 'work_order', 'display', 'list', 'weight', 'light',
    'ordered', true, 'row_order', 'sorted', 'agent_writable', true, 'retention_days', 3650,
    'default_sort', jsonb_build_array(jsonb_build_object('field', 'promised_on', 'direction', 'asc')),
    'parent_id', v_home::text,
    'fields', jsonb_build_array(jsonb_build_object('name', 'work_order'))));
  perform custom.field_declare(v_org, v_calls, jsonb_build_object('key', 'work_order', 'label', 'Work order', 'type', 'text', 'sort', 10, 'required', true));
  perform custom.field_declare(v_org, v_calls, jsonb_build_object('key', 'promised_on', 'label', 'Promised', 'type', 'datetime', 'sort', 20));
  insert into vs values ('org', v_org), ('calls', v_calls);
end
$fixture$;

do $suite$
declare
  c_admin  constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_member constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  v_org uuid; v_calls uuid; v_view uuid; v_board uuid; v_def jsonb; v_row boolean; v_n integer;
begin
  select v into v_org from vs where k = 'org'; select v into v_calls from vs where k = 'calls';
  perform set_config('role', 'authenticated', true);

  -- V1
  perform set_config('request.jwt.claims', c_admin, true);
  v_view := custom.view_declare(v_org, v_calls, jsonb_build_object('name', 'All records',
    'definition', jsonb_build_object('layout', 'sheet', 'is_default', true)));
  select definition into v_def from platform.saved_view where id = v_view;
  if v_def ->> 'layout' is distinct from 'sheet' or v_def -> 'is_default' is distinct from 'true'::jsonb then
    raise exception 'V1 RED: the first default view was not stored as the Sheet: %', v_def;
  end if;
  raise notice 'V1 GREEN: the owner saved the default view as the Sheet';

  -- V2
  begin
    perform custom.view_declare(v_org, v_calls, jsonb_build_object('view_id', v_view,
      'definition', jsonb_build_object('layout', 'kanban')));
    raise exception 'V2 RED: the owner''s Kanban press was merged onto the default view';
  exception when sqlstate '22023' then
    if sqlerrm not ilike '%does not change how it opens%' then raise; end if;
  end;
  select definition into v_def from platform.saved_view where id = v_view;
  if v_def ->> 'layout' is distinct from 'sheet' then
    raise exception 'V2 RED: the designation moved to %', v_def ->> 'layout';
  end if;
  raise notice 'V2 GREEN: the owner''s switch was refused by name; the table still opens as the Sheet';

  -- V3
  perform custom.view_declare(v_org, v_calls, jsonb_build_object('view_id', v_view,
    'definition', jsonb_build_object('sorts', jsonb_build_array(jsonb_build_object('field', 'promised_on', 'direction', 'asc')))));
  select definition into v_def from platform.saved_view where id = v_view;
  if v_def -> 'sorts' -> 0 ->> 'field' is distinct from 'promised_on' or v_def ->> 'layout' <> 'sheet' then
    raise exception 'V3 RED: a sort on the default view did not merge: %', v_def;
  end if;
  raise notice 'V3 GREEN: a sort on the default view still merges';

  -- V4
  perform set_config('request.jwt.claims', c_member, true);
  begin
    perform custom.view_declare(v_org, v_calls, jsonb_build_object('view_id', v_view,
      'definition', jsonb_build_object('layout', 'calendar', 'date_field', 'promised_on')));
    raise exception 'V4 RED: the member''s Calendar press was merged onto the default view';
  exception when sqlstate '22023' then
    if sqlerrm not ilike '%does not change how it opens%' then raise; end if;
  end;
  select definition into v_def from platform.saved_view where id = v_view;
  if v_def ->> 'layout' is distinct from 'sheet' or v_def ? 'date_field' then
    raise exception 'V4 RED: the member''s switch changed the default view: %', v_def;
  end if;
  raise notice 'V4 GREEN: the member''s switch was refused; nothing was written';

  -- V5
  perform set_config('request.jwt.claims', c_admin, true);
  v_board := custom.view_declare(v_org, v_calls, jsonb_build_object('name', 'Dispatch board',
    'definition', jsonb_build_object('layout', 'kanban')));
  begin
    perform custom.view_declare(v_org, v_calls, jsonb_build_object('name', 'This week',
      'definition', jsonb_build_object('layout', 'calendar', 'is_default', true)));
    raise exception 'V5 RED: a second default view was saved through view_declare';
  exception when sqlstate '22023' then
    if sqlerrm not ilike '%already has a default view%' then raise; end if;
  end;
  begin
    perform custom.view_declare(v_org, v_calls, jsonb_build_object('view_id', v_board,
      'definition', jsonb_build_object('is_default', true)));
    raise exception 'V5 RED: an existing view was made the default through view_declare';
  exception when sqlstate '22023' then null;
  end;
  raise notice 'V5 GREEN: view_declare never makes a default when the table has one';

  -- V6
  perform set_config('request.jwt.claims', c_member, true);
  begin
    perform custom.view_designate(v_org, v_calls, v_view, 'calendar');
    raise exception 'V6 RED: the commenter designated the table';
  exception when sqlstate '42501' then null;
  end;
  select definition into v_def from platform.saved_view where id = v_view;
  if v_def ->> 'layout' is distinct from 'sheet' then raise exception 'V6 RED: moved to %', v_def ->> 'layout'; end if;
  raise notice 'V6 GREEN: the member may not designate';

  -- V7
  perform set_config('request.jwt.claims', c_admin, true);
  perform custom.view_designate(v_org, v_calls, v_view, 'calendar');
  select definition, is_default into v_def, v_row from platform.saved_view where id = v_view;
  if v_def ->> 'layout' is distinct from 'calendar' or v_def -> 'is_default' is distinct from 'true'::jsonb or not v_row then
    raise exception 'V7 RED: the explicit designation did not stand: row %, %', v_row, v_def;
  end if;
  raise notice 'V7 GREEN: the owner''s explicit designation made the table open as the Calendar';

  -- V8
  perform custom.view_designate(v_org, v_calls, v_board, null);
  select count(*) into v_n from platform.saved_view sv
   where sv.subject_id = v_calls and sv.deleted_at is null
     and (sv.is_default or (sv.definition -> 'is_default') = 'true'::jsonb);
  select is_default into v_row from platform.saved_view where id = v_board;
  if v_n <> 1 or not v_row then
    raise exception 'V8 RED: % default views after designating the board (board row default %)', v_n, v_row;
  end if;
  -- VIEW-LOOK (2026-09-25): a change onto an existing view is "Save to view" — editor on the table
  -- (viewlook_green L2) — so the owner saves it; the member's own look is custom.view_look_set.
  perform custom.view_declare(v_org, v_calls, jsonb_build_object('view_id', v_view,
    'definition', jsonb_build_object('layout', 'grid')));
  select definition into v_def from platform.saved_view where id = v_view;
  if v_def ->> 'layout' is distinct from 'grid' then
    raise exception 'V8 RED: a layout on a view that is not the default did not save: %', v_def;
  end if;
  raise notice 'V8 GREEN: one default after designating another view; a non-default view keeps its own layout';
  perform set_config('role', 'postgres', true);
end $suite$;

rollback;
\echo 'viewswitch_green.sql: GREEN (V1–V8); rolled back, nothing kept.'
