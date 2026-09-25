-- LANE VIEW-STATE-PERSONAL — A LOOK AT A VIEW IS YOURS UNTIL YOU SAVE IT (VERIFIER-23 item 1,
-- production 2026-09-25: the owner's board grouping became everyone's).
--
-- THE USE CASE. Harbor Street Duplex's owner (admin@admin.com, editor) keeps "Maintenance
-- requests", which opens as a Grid. The tenant liaison (test@test.com, viewer) looks at it as a
-- board grouped by Status and a calendar by Scheduled for. Her looks are hers: they persist for her,
-- and the shared view row stays byte for byte what the owner saved until the owner presses "Save
-- to view". Every name is synthesized; the fixture is rolled back.
--
-- CLAUSES
--   L1  the owner saves the table's default view (grid).
--   L2  the viewer's direct view_declare {view_id, group_field} is refused by name (42501) and the
--       view row is byte-identical (RED on VIEW-SWITCH's body: it merged).
--   L3  the viewer's group-field look (view_look_set) leaves the view row byte-identical, and her
--       look reads back (view_look_read) — it persists per person.
--   L4  the owner reads no look of hers; the owner's own look (date field) leaves the viewer's alone.
--   L5  a look refuses the designation and the digests' filters by name; a Field the table does not
--       have is refused by the registry; a cleared key (null) is kept as "none, for me".
--   L6  the owner's "Save to view" (view_declare, editor) changes the view row; the viewer's look is
--       still hers.
--   L7  "Reset to view": the viewer's look set to null reads back empty; the row is archived, never
--       deleted.
--   L8  a hand-set order is saved by the editor only (view_record_order_set 42501 for the viewer).
--   L9  the viewer still saves a NEW view, and changes her own view (not the default).
--
-- RUN IT (the dev clone):  psql <clone> -v ON_ERROR_STOP=1 -f scripts/campaign-tests/viewlook_green.sql

\set ON_ERROR_STOP on
\timing off
\set suite 'viewlook_green.sql'
\set requires 'function:custom.view_declare|function:custom.view_designate|function:custom.view_keys|function:custom.table_declare|function:custom.field_declare'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local lock_timeout = '10s';
set local statement_timeout = '120s';

create temp table vl (k text primary key, v uuid) on commit drop;
grant select, insert on vl to authenticated;

do $fixture$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_member  constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';   -- test@test.com
  v_org uuid := gen_random_uuid();
  v_home uuid; v_reqs uuid; v_r1 uuid; v_r2 uuid;
begin
  perform set_config('app.actor_system', 'campaign-test/viewlook', true);
  perform set_config('request.jwt.claims', '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}', true);
  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'Harbor Street Duplex ' || substr(v_org::text, 1, 8),
          'harbor-street-duplex-' || substr(v_org::text, 1, 8), 'HSD', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_org, 'organization', v_org, c_admin,  'owner',  'active'),
    (v_org, 'organization', v_org, c_member, 'member', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note) values
    ('custom', 'system_enabled',       'organization', v_org, v_org, 'true'::jsonb,     'viewlook fixture'),
    ('custom', 'member_default_level', 'organization', v_org, v_org, '"viewer"'::jsonb, 'viewlook fixture: the tenant liaison reads');
  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name', 'Home')) returning id into v_home;
  v_reqs := custom.table_declare(v_org, jsonb_build_object(
    'name', 'Maintenance requests', 'slug', 'maintenance_requests', 'type', 'entity',
    'label_singular', 'Maintenance request', 'label_plural', 'Maintenance requests',
    'title_field', 'unit', 'display', 'list', 'weight', 'light',
    'ordered', true, 'row_order', 'sorted', 'agent_writable', true, 'retention_days', 3650,
    'default_sort', jsonb_build_array(jsonb_build_object('field', 'unit', 'direction', 'asc')),
    'parent_id', v_home::text,
    'fields', jsonb_build_array(jsonb_build_object('name', 'unit'))));
  perform custom.field_declare(v_org, v_reqs, jsonb_build_object('key', 'unit', 'label', 'Unit', 'type', 'text', 'sort', 10, 'required', true));
  perform custom.field_declare(v_org, v_reqs, jsonb_build_object('key', 'status', 'label', 'Status', 'type', 'text', 'sort', 20));
  perform custom.field_declare(v_org, v_reqs, jsonb_build_object('key', 'scheduled_for', 'label', 'Scheduled for', 'type', 'datetime', 'sort', 30));
  insert into custom.record (organization_id, table_id, data) values
    (v_org, v_reqs, jsonb_build_object('unit', 'Unit A — kitchen sink drips', 'status', 'Open')) returning id into v_r1;
  insert into custom.record (organization_id, table_id, data) values
    (v_org, v_reqs, jsonb_build_object('unit', 'Unit B — smoke detector chirps', 'status', 'Scheduled')) returning id into v_r2;
  insert into vl values ('org', v_org), ('reqs', v_reqs), ('r1', v_r1), ('r2', v_r2);
end
$fixture$;

do $suite$
declare
  c_admin  constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_member constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  v_org uuid; v_reqs uuid; v_r1 uuid; v_r2 uuid; v_view uuid; v_mine uuid;
  v_before text; v_after text; v_look jsonb; v_def jsonb; v_n integer;
begin
  select v into v_org from vl where k = 'org'; select v into v_reqs from vl where k = 'reqs';
  select v into v_r1 from vl where k = 'r1'; select v into v_r2 from vl where k = 'r2';
  perform set_config('role', 'authenticated', true);

  -- L1
  perform set_config('request.jwt.claims', c_admin, true);
  v_view := custom.view_declare(v_org, v_reqs, jsonb_build_object('name', 'All records',
    'definition', jsonb_build_object('layout', 'grid', 'is_default', true)));
  raise notice 'L1 GREEN: the owner saved the default view (grid)';

  -- L2
  select sv::text into v_before from platform.saved_view sv where id = v_view;
  perform set_config('request.jwt.claims', c_member, true);
  begin
    perform custom.view_declare(v_org, v_reqs, jsonb_build_object('view_id', v_view,
      'definition', jsonb_build_object('group_field', 'status')));
    raise exception 'L2 RED: the viewer''s grouping was merged onto the shared view';
  exception when sqlstate '42501' then
    if sqlerrm not ilike '%Only someone who can edit this table%' then raise; end if;
  end;
  select sv::text into v_after from platform.saved_view sv where id = v_view;
  if v_after is distinct from v_before then raise exception 'L2 RED: the view row changed'; end if;
  raise notice 'L2 GREEN: the viewer''s direct save onto the shared view was refused by name; the row is byte-identical';

  -- L3
  v_look := custom.view_look_set(v_org, v_reqs, v_view, jsonb_build_object('layout', 'kanban', 'group_field', 'status'));
  select sv::text into v_after from platform.saved_view sv where id = v_view;
  if v_after is distinct from v_before then raise exception 'L3 RED: the viewer''s look changed the view row'; end if;
  v_look := custom.view_look_read(v_org, v_reqs) -> v_view::text -> 'look';
  if v_look ->> 'group_field' is distinct from 'status' or v_look ->> 'layout' is distinct from 'kanban' then
    raise exception 'L3 RED: the viewer''s look did not read back: %', v_look;
  end if;
  raise notice 'L3 GREEN: the viewer''s grouping is her own look (reads back), and the view row is byte-identical';

  -- L4
  perform set_config('request.jwt.claims', c_admin, true);
  if custom.view_look_read(v_org, v_reqs) <> '{}'::jsonb then
    raise exception 'L4 RED: the owner reads a look he never made: %', custom.view_look_read(v_org, v_reqs);
  end if;
  perform custom.view_look_set(v_org, v_reqs, v_view, jsonb_build_object('layout', 'calendar', 'date_field', 'scheduled_for'));
  perform set_config('request.jwt.claims', c_member, true);
  v_look := custom.view_look_read(v_org, v_reqs) -> v_view::text -> 'look';
  if v_look ? 'date_field' or v_look ->> 'group_field' is distinct from 'status' then
    raise exception 'L4 RED: the owner''s look reached the viewer''s: %', v_look;
  end if;
  raise notice 'L4 GREEN: a look is per person — the owner reads none of hers, and his leaves hers alone';

  -- L5
  begin
    perform custom.view_look_set(v_org, v_reqs, v_view, jsonb_build_object('is_default', true));
    raise exception 'L5 RED: a look took the designation';
  exception when sqlstate '22023' then
    if sqlerrm not ilike '%is not one of those settings%' then raise; end if;
  end;
  begin
    perform custom.view_look_set(v_org, v_reqs, v_view, jsonb_build_object('filters', jsonb_build_object('status', 'Open')));
    raise exception 'L5 RED: a look took the digests'' flat filters';
  exception when sqlstate '22023' then null;
  end;
  begin
    perform custom.view_look_set(v_org, v_reqs, v_view, jsonb_build_object('group_field', 'tenant_phone'));
    raise exception 'L5 RED: a look grouped by a Field the table does not have';
  exception when sqlstate '22023' or sqlstate '23503' or sqlstate '02000' then null;
  end;
  v_look := custom.view_look_read(v_org, v_reqs) -> v_view::text -> 'look';
  if v_look ->> 'group_field' is distinct from 'status' then
    raise exception 'L5 RED: a refused look changed the kept one: %', v_look;
  end if;
  v_look := custom.view_look_set(v_org, v_reqs, v_view, jsonb_build_object('layout', 'kanban', 'group_field', 'status', 'sorts', null));
  if not (v_look ? 'sorts') or jsonb_typeof(v_look -> 'sorts') <> 'null' then
    raise exception 'L5 RED: a cleared setting was not kept as none-for-me: %', v_look;
  end if;
  raise notice 'L5 GREEN: a look refuses the designation, the flat filters and a missing Field; a cleared key stays null';

  -- L6
  perform set_config('request.jwt.claims', c_admin, true);
  perform custom.view_declare(v_org, v_reqs, jsonb_build_object('view_id', v_view,
    'definition', jsonb_build_object('group_field', 'status')));
  select definition into v_def from platform.saved_view where id = v_view;
  if v_def ->> 'group_field' is distinct from 'status' or v_def ->> 'layout' is distinct from 'grid' then
    raise exception 'L6 RED: the owner''s Save to view did not land (or moved the designation): %', v_def;
  end if;
  perform set_config('request.jwt.claims', c_member, true);
  if (custom.view_look_read(v_org, v_reqs) -> v_view::text -> 'look' ->> 'group_field') is distinct from 'status' then
    raise exception 'L6 RED: the owner''s save took the viewer''s look';
  end if;
  raise notice 'L6 GREEN: the editor''s Save to view changed the view; the viewer''s look is still hers';

  -- L7
  if custom.view_look_set(v_org, v_reqs, v_view, null) is not null then
    raise exception 'L7 RED: a reset answered a look';
  end if;
  if custom.view_look_read(v_org, v_reqs) <> '{}'::jsonb then
    raise exception 'L7 RED: the viewer still reads a look after Reset to view';
  end if;
  select count(*) into v_n from platform.saved_view l
   where l.subject_id = v_view and l.surface_key = 'custom/records/look'
     and l.created_by = '4060701e-706a-4c76-b3ca-0bbc69fa5a14' and l.deleted_at is not null;
  if v_n <> 1 then raise exception 'L7 RED: the reset look was not archived (% archived rows)', v_n; end if;
  raise notice 'L7 GREEN: Reset to view returns to the view; the look row is archived, never deleted';

  -- L8
  select sv::text into v_before from platform.saved_view sv where id = v_view;
  begin
    perform custom.view_record_order_set(v_org, v_view, array[v_r2, v_r1]);
    raise exception 'L8 RED: the viewer put the shared view in her own hand order';
  exception when sqlstate '42501' then
    if sqlerrm not ilike '%Only someone who can edit this table%' then raise; end if;
  end;
  select sv::text into v_after from platform.saved_view sv where id = v_view;
  if v_after is distinct from v_before then raise exception 'L8 RED: the refused order changed the row'; end if;
  perform set_config('request.jwt.claims', c_admin, true);
  perform custom.view_record_order_set(v_org, v_view, array[v_r2, v_r1]);
  select definition into v_def from platform.saved_view where id = v_view;
  if v_def ->> 'order' is distinct from 'manual' then raise exception 'L8 RED: the editor''s order did not land: %', v_def; end if;
  raise notice 'L8 GREEN: a hand-set order is saved by the editor only';

  -- L9
  perform set_config('request.jwt.claims', c_member, true);
  v_mine := custom.view_declare(v_org, v_reqs, jsonb_build_object('name', 'Open requests by unit',
    'definition', jsonb_build_object('layout', 'kanban', 'group_field', 'status')));
  perform custom.view_declare(v_org, v_reqs, jsonb_build_object('view_id', v_mine,
    'definition', jsonb_build_object('date_field', 'scheduled_for')));
  select definition into v_def from platform.saved_view where id = v_mine;
  if v_def ->> 'date_field' is distinct from 'scheduled_for' then
    raise exception 'L9 RED: the viewer could not change her own view: %', v_def;
  end if;
  raise notice 'L9 GREEN: the viewer saves a new view and changes her own';
  perform set_config('role', 'postgres', true);
end $suite$;

rollback;
\echo 'viewlook_green.sql: GREEN (L1–L9); rolled back, nothing kept.'
