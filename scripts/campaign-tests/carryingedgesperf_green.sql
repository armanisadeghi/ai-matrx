-- CARRYING-EDGES-PERF — THE GREEN SUITE (lane CARRYING-EDGES-PERF, 2026-09-27), built on the
-- STORE-READ-PERF-2 parity harness (storereadperf2_green.sql: its fixture and its door dump, reused).
--
-- What it proves, in the order it proves it:
--   1  IDENTICAL OUTPUT. Every door the STORE-READ-PERF-2 harness dumps — read_record (by key and by
--      id), read_records, export_records, read_records_matching, read_records_by_ids,
--      read_records_archived, record_values_versioned, record_history, record_as_of,
--      computed_provenance, enrich_cells, resolve_context, record_card — for admin@admin.com and the
--      crew lead, on the fixture and live data, with the bodies before this lane (the inverse, \i'd
--      first) and then with the campaign file's body, in one transaction over the same rows: every
--      answer byte-identical. PLUS the carrying walks' own answers on live data, for every member and
--      every Table of every organization census 12 judges (and admin in AI Matrx):
--      custom.read_door_carried_ids, custom.table_has_a_visible_record, custom.visible_predicate_sql
--      (the read door's own predicate), and custom.has_visibility for every Table row.
--   2  THE PATH WHOSE MIDDLE IS NOT A RECORD is carried: the fixture's Kitchen CONTAINS a task that
--      CONTAINS a site note; the crew lead, named on the Kitchen, reads the note through the ladder
--      and the read door alike, and the new edge set keeps the task edge.
--   3  CENSUS 12 ITSELF (custom.shared_only_disagreements) answers the same rows before and after,
--      with both run times printed. Skip with `-v census=off` (the old body is the slow one).
--
-- PLANT (the guard must be seen failing): `-v plant=records_only` installs a body that keeps only the
-- edges whose ITEM is a record — the tempting, wrong prune — and clause 1 goes red (the site note
-- stops being carried to the crew lead through the task). With no plant every clause is green.
--
-- THE USE CASE (owner law, 2026-09-21: no fake test data): READ-MASK-ONCE's renovation general
-- contractor's job book, reused, plus the task "Order the Kitchen tile" holding the delivery-window
-- note.
--
-- Run (from matrx-frontend): psql -f scripts/campaign-tests/carryingedgesperf_green.sql   (dev clone)
\set ON_ERROR_STOP on
\set suite 'carryingedgesperf_green.sql'
\set expect 'clone'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif
\if :{?plant}
\else
\set plant none
\endif
begin;
set local statement_timeout = 0;
set local lock_timeout = '10s';

create temp table rmo (k text primary key, v uuid) on commit drop;
create temp table rmo_out (tag text, seat text, door text, args text, digest text, len int, body text) on commit drop;
grant select on rmo to authenticated;

-- THE BODY BEFORE THIS LANE, whatever the clone holds right now (the up may already be on it).
\i migrations/inverse/carryingedgesperf_a_record_walk_reads_only_the_edges_that_reach_a_record_down.sql

-- ══ THE FIXTURE ══════════════════════════════════════════════════════════════════════════════
do $fixture$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_dana    constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';   -- test@test.com
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_dana_j  constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  v_org  uuid := gen_random_uuid();
  v_org2 uuid := gen_random_uuid();
  v_home uuid; v_home2 uuid; v_rooms uuid; v_rooms2 uuid; v_quotes uuid; v_id uuid; v_row jsonb;
  v_def jsonb; v_notes uuid; v_task uuid;
begin
  perform set_config('app.actor_system', 'campaign-test/carryingedgesperf', true);

  insert into iam.organizations (id, name, slug, abbreviation, created_by) values
    (v_org,  'Birchwood Avenue Renovation ' || substr(v_org::text, 1, 8),
             'birchwood-srp-' || substr(v_org::text, 1, 8), 'BAR', c_admin),
    (v_org2, 'Coastline Tile & Stone ' || substr(v_org2::text, 1, 8),
             'coastline-srp-' || substr(v_org2::text, 1, 8), 'CTS', c_dana);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_org,  'organization', v_org,  c_admin, 'owner',  'active'),
    (v_org,  'organization', v_org,  c_dana,  'member', 'active'),
    (v_org2, 'organization', v_org2, c_dana,  'owner',  'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note) values
    ('custom', 'system_enabled',            'organization', v_org,  v_org,  'true'::jsonb, 'storereadperf2 fixture'),
    ('custom', 'member_default_visibility', 'organization', v_org,  v_org,  '"shared_only"'::jsonb, 'storereadperf2 fixture: the crew lead sees what she is shared'),
    ('custom', 'system_enabled',            'organization', v_org2, v_org2, 'true'::jsonb, 'storereadperf2 fixture');

  v_def := jsonb_build_object('type', 'entity', 'display', 'list', 'weight', 'light', 'ordered', true,
    'row_order', 'sorted', 'default_sort', jsonb_build_array(jsonb_build_object('field', 'created_at', 'direction', 'asc')),
    'agent_writable', true, 'retention_days', 3650);

  -- ── the general contractor's job book (admin owns it) ──
  perform set_config('request.jwt.claims', c_admin_j, true);
  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name', 'Home')) returning id into v_home;
  v_rooms := custom.table_declare(v_org, v_def || jsonb_build_object(
    'name', 'Rooms', 'slug', 'rooms', 'label_singular', 'Room', 'label_plural', 'Rooms',
    'title_field', 'room_name', 'parent_id', v_home::text, 'fields', jsonb_build_array(jsonb_build_object('name', 'room_name'))));
  v_quotes := custom.table_declare(v_org, v_def || jsonb_build_object(
    'name', 'Quotes', 'slug', 'quotes', 'label_singular', 'Quote', 'label_plural', 'Quotes',
    'title_field', 'contractor', 'parent_id', v_home::text, 'fields', jsonb_build_array(jsonb_build_object('name', 'contractor'))));
  perform custom.field_declare(v_org, v_rooms, jsonb_build_object('key', 'room_name', 'label', 'Room name', 'type', 'text', 'sort', 10, 'required', true));
  v_id := custom.field_declare(v_org, v_rooms, jsonb_build_object('key', 'status', 'label', 'Status', 'type', 'select', 'sort', 20,
    'options', jsonb_build_array('Planning', 'Quoting', 'In Progress', 'Complete')));
  insert into rmo values ('f_status', v_id);
  perform custom.field_declare(v_org, v_rooms, jsonb_build_object('key', 'budget', 'label', 'Budget', 'type', 'currency', 'unit', '$', 'sort', 30, 'sensitivity', 'confidential'));
  perform custom.field_declare(v_org, v_rooms, jsonb_build_object('key', 'budget_with_contingency', 'label', 'Budget with contingency',
    'type', 'formula', 'formula_text', '{Budget} * 1.1', 'sort', 40));
  perform custom.field_declare(v_org, v_rooms, jsonb_build_object('key', 'client_phone', 'label', 'Client phone', 'type', 'text', 'sort', 50, 'sensitivity', 'restricted'));
  perform custom.field_declare(v_org, v_quotes, jsonb_build_object('key', 'contractor', 'label', 'Contractor', 'type', 'text', 'sort', 10, 'required', true));
  perform custom.field_declare(v_org, v_quotes, jsonb_build_object('key', 'amount', 'label', 'Amount', 'type', 'currency', 'unit', '$', 'sort', 20, 'sensitivity', 'confidential'));

  for v_row in select e from jsonb_array_elements(jsonb_build_array(
    jsonb_build_object('room_name', 'Kitchen',      'status', 'Quoting',     'budget', 18000, 'client_phone', '(805) 555-0148'),
    jsonb_build_object('room_name', 'Primary bath', 'status', 'Planning',    'budget', 61000, 'client_phone', '(805) 555-0148'),
    jsonb_build_object('room_name', 'Garage',       'status', 'In Progress', 'budget', 9500,  'client_phone', '(805) 555-0148'),
    jsonb_build_object('room_name', 'Mudroom',      'status', 'Complete',    'budget', 4200,  'client_phone', '(805) 555-0148'))) e loop
    v_id := custom.record_write(v_org, v_rooms, v_row);
    insert into rmo values (v_row ->> 'room_name', v_id);
  end loop;
  v_id := custom.record_write(v_org, v_quotes, jsonb_build_object('contractor', 'Voltway Electric', 'amount', 7400));
  insert into rmo values ('q_voltway', v_id);
  v_id := custom.record_write(v_org, v_quotes, jsonb_build_object('contractor', 'Harbor Cabinetry', 'amount', 9950));
  insert into rmo values ('q_harbor', v_id);
  -- the Mudroom job closed: archived, so the archive door has a row to mask
  perform custom.record_delete(v_org, (select v from rmo where k = 'Mudroom'));

  -- the crew lead: the Rooms and Quotes Tables at viewer, and the Kitchen BY NAME at editor
  perform custom.share_grant(v_org, v_rooms,  'person', c_dana, 'viewer'::public.permission_level);
  perform custom.share_grant(v_org, v_quotes, 'person', c_dana, 'viewer'::public.permission_level);
  perform custom.share_grant(v_org, (select v from rmo where k = 'Kitchen'), 'person', c_dana, 'editor'::public.permission_level);

  -- ── her own tiling business (she owns it) ──
  perform set_config('request.jwt.claims', c_dana_j, true);
  insert into custom.record (organization_id, table_id, data)
  values (v_org2, null, jsonb_build_object('name', 'Home')) returning id into v_home2;
  v_rooms2 := custom.table_declare(v_org2, v_def || jsonb_build_object(
    'name', 'Rooms', 'slug', 'rooms', 'label_singular', 'Room', 'label_plural', 'Rooms',
    'title_field', 'room_name', 'parent_id', v_home2::text, 'fields', jsonb_build_array(jsonb_build_object('name', 'room_name'))));
  perform custom.field_declare(v_org2, v_rooms2, jsonb_build_object('key', 'room_name', 'label', 'Room name', 'type', 'text', 'sort', 10, 'required', true));
  perform custom.field_declare(v_org2, v_rooms2, jsonb_build_object('key', 'tile', 'label', 'Tile', 'type', 'text', 'sort', 20));
  perform custom.field_declare(v_org2, v_rooms2, jsonb_build_object('key', 'client_phone', 'label', 'Client phone', 'type', 'text', 'sort', 30, 'sensitivity', 'restricted'));
  v_id := custom.record_write(v_org2, v_rooms2, jsonb_build_object('room_name', 'Hall bath floor', 'tile', 'Porcelain 12x24, warm grey', 'client_phone', '(805) 555-0173'));
  insert into rmo values ('b_hall', v_id);
  v_id := custom.record_write(v_org2, v_rooms2, jsonb_build_object('room_name', 'Kitchen backsplash', 'tile', 'Zellige 4x4, sea glass', 'client_phone', '(805) 555-0173'));
  insert into rmo values ('b_backsplash', v_id);


  -- ── CARRYING-EDGES-PERF: a record carried THROUGH something that is not a record ──
  -- The general contractor's task "Order the Kitchen tile" hangs off the Kitchen (the Kitchen
  -- CONTAINS it) and holds the site note about the delivery window (it CONTAINS that). The crew
  -- lead is named on the Kitchen at editor and on nothing else of Site Notes, so the note reaches
  -- her only along Kitchen -> task -> note: the path whose middle is not a record.
  perform set_config('request.jwt.claims', c_admin_j, true);
  v_notes := custom.table_declare(v_org, v_def || jsonb_build_object(
    'name', 'Site Notes', 'slug', 'site_notes', 'label_singular', 'Site Note', 'label_plural', 'Site Notes',
    'title_field', 'note', 'parent_id', v_home::text, 'fields', jsonb_build_array(jsonb_build_object('name', 'note'))));
  perform custom.field_declare(v_org, v_notes, jsonb_build_object('key', 'note', 'label', 'Note', 'type', 'text', 'sort', 10, 'required', true));
  v_id := custom.record_write(v_org, v_notes, jsonb_build_object('note', 'Tile delivery window: Thursday 7-9 AM, side gate'));
  insert into rmo values ('n_delivery', v_id);
  insert into workspace.tasks (title, organization_id, created_by)
  values ('Order the Kitchen tile (Zellige 4x4, 62 sq ft + 10% overage)', v_org, c_admin) returning id into v_task;
  insert into rmo values ('task', v_task);
  insert into platform.associations (source_type, source_id, target_type, target_id, organization_id, role, created_by) values
    ('record', (select v from rmo where k = 'Kitchen'), 'task', v_task, v_org, 'contains', c_admin),
    ('task', v_task, 'record', v_id, v_org, 'contains', c_admin);

  insert into rmo values ('org', v_org), ('org2', v_org2), ('rooms', v_rooms), ('quotes', v_quotes), ('rooms2', v_rooms2), ('notes', v_notes);
end
$fixture$;

-- ══ THE LIVE SAMPLE: read-time derived Tables and whole values kept in files ═════════════════
create temp table srp_live (org uuid, tbl uuid, ids uuid[]) on commit drop;
insert into srp_live
select t.org, t.tbl, (select array_agg(x.id order by x.created_at desc, x.id) from (
          select x.id, x.created_at from custom.record x
           where x.organization_id = t.org and x.table_id = t.tbl and x.deleted_at is null
           order by x.created_at desc, x.id limit 12) x)
  from (select distinct f.organization_id as org, (f.data ->> 'entity_definition_id')::uuid as tbl
          from custom.record f
         where f.table_id = custom.field_kernel_id() and f.deleted_at is null
           and f.data ->> 'compute_on' = 'read') t
 where exists (select 1 from custom.record x where x.organization_id = t.org and x.table_id = t.tbl and x.deleted_at is null)
 order by md5(t.tbl::text) limit 14;
insert into srp_live
select x.organization_id, x.table_id, array_agg(x.id order by x.id)
  from custom.record x
 where x.data -> '_sources' @? '$.* ? (@.kind == "whole_value_in_file")' and x.deleted_at is null and x.table_id is not null
 group by 1, 2;
grant select on srp_live to authenticated;
select count(*) as live_tables, sum(cardinality(ids)) as live_records from srp_live;

-- ══ THE DUMP: every reader, every seat, into rmo_out under a tag ════════════════════════════
create function pg_temp.rmo_dump(p_tag text) returns int language plpgsql as $dump$
declare
  c_seats constant jsonb := jsonb_build_object(
    'admin', '87a6e699-3622-4869-8843-d0867456c0dd',
    'member', '4060701e-706a-4c76-b3ca-0bbc69fa5a14');
  v_boss text := current_user;
  v_seat text; v_uid uuid; v_out jsonb := '[]'::jsonb;
  v_org uuid; v_org2 uuid; v_rooms uuid; v_rooms2 uuid; v_quotes uuid;
  t record; r record; v_notes uuid; v_board uuid[]; v_ids uuid[]; v_all uuid[]; v_recs jsonb; v_tids jsonb; v_feat uuid[]; v_dup uuid[];
  c_feature constant uuid := '36c07712-b0f2-43f2-a1c8-712ae4a75739';
  c_feature_org constant uuid := '5dc930e9-bd65-44a1-8369-af773f6e1a5b';
  c_board constant uuid := '3260bbbe-aaa8-4148-a4d9-7ad880e7976d';
  c_board_org constant uuid := '57f2a22b-5875-46c6-80df-437076421c28';
  c_dup constant uuid := '6dddb7c1-82e4-4b78-b1e1-dc1a3c5a7789';
  c_ctx constant uuid := '00000000-0000-4000-8000-00000000c0de';
  v_n int := 0;

begin
  select v into v_org from rmo where k = 'org';   select v into v_org2 from rmo where k = 'org2';
  select v into v_rooms from rmo where k = 'rooms'; select v into v_rooms2 from rmo where k = 'rooms2';
  select v into v_quotes from rmo where k = 'quotes'; select v into v_notes from rmo where k = 'notes';
  select array_agg(v order by k) into v_all from rmo
   where k in ('Kitchen', 'Primary bath', 'Garage', 'Mudroom', 'q_voltway', 'q_harbor', 'b_hall', 'b_backsplash', 'n_delivery');
  -- every id the dump reads is gathered HERE, as the suite's own role: the seated person may not
  -- read custom.record directly, and must not need to — she only ever goes through the doors
  select jsonb_agg(jsonb_build_object('id', x.id, 'org', x.organization_id) order by x.id) into v_recs
    from custom.record x where x.id = any (v_all);
  select jsonb_object_agg(t2.tbl, (select jsonb_agg(x.id order by x.id) from custom.record x where x.table_id = t2.tbl))
    into v_tids from (values (v_rooms), (v_quotes), (v_rooms2), (v_notes)) t2(tbl);
  select array_agg(x.id order by x.created_at) into v_feat from custom.record x where x.table_id = c_feature and x.deleted_at is null;
  select array_agg(id) into v_board from (select x.id from custom.record x where x.table_id = c_board and x.organization_id = c_board_org and x.deleted_at is null order by x.created_at desc, x.id limit 200) s;
  select array_agg(x.id order by x.id) into v_dup from custom.record x where x.table_id = c_dup and x.deleted_at is null;

  for v_seat in select * from jsonb_object_keys(c_seats) loop
    v_uid := (c_seats ->> v_seat)::uuid;
    perform set_config('request.jwt.claims', jsonb_build_object('sub', v_uid, 'role', 'authenticated')::text, true);

    -- record_card is not a client door: asked as the store asks it, naming the viewer
    perform set_config('role', v_boss, true);
    for r in select (e ->> 'id')::uuid as id, (e ->> 'org')::uuid as org from jsonb_array_elements(v_recs) e loop
      v_out := v_out || jsonb_build_object('seat', v_seat, 'door', 'record_card', 'args', r.id,
        'body', custom.record_card(r.org, r.id, v_uid)::text);
    end loop;
    perform set_config('role', 'authenticated', true);

    -- per record
    for r in select (e ->> 'id')::uuid as id, (e ->> 'org')::uuid as org from jsonb_array_elements(v_recs) e loop
      v_out := v_out || jsonb_build_object('seat', v_seat, 'door', 'read_record', 'args', r.id || '/key',
        'body', pg_temp.rmo_try(format('select custom.read_record(%L::uuid, %L::uuid, false)::text', r.org, r.id)));
      v_out := v_out || jsonb_build_object('seat', v_seat, 'door', 'read_record', 'args', r.id || '/id',
        'body', pg_temp.rmo_try(format('select custom.read_record(%L::uuid, %L::uuid, true)::text', r.org, r.id)));
      v_out := v_out || jsonb_build_object('seat', v_seat, 'door', 'record_values_versioned', 'args', r.id,
        'body', pg_temp.rmo_try(format('select jsonb_agg(to_jsonb(v))::text from custom.record_values_versioned(%L::uuid, %L::uuid) v', r.org, r.id)));
      v_out := v_out || jsonb_build_object('seat', v_seat, 'door', 'record_history', 'args', r.id,
        'body', pg_temp.rmo_try(format('select jsonb_agg(to_jsonb(v))::text from custom.record_history(%L::uuid, %L::uuid, 50, 0) v', r.org, r.id)));
      v_out := v_out || jsonb_build_object('seat', v_seat, 'door', 'record_as_of', 'args', r.id,
        'body', pg_temp.rmo_try(format('select to_jsonb(custom.record_as_of(%L::uuid, %L::uuid, now()))::text', r.org, r.id)));
      v_out := v_out || jsonb_build_object('seat', v_seat, 'door', 'computed_provenance', 'args', r.id,
        'body', pg_temp.rmo_try(format('select to_jsonb(custom.computed_provenance(%L::uuid, %L::uuid))::text', r.org, r.id)));
    end loop;

    -- per Table
    for t in select * from (values (v_org, v_rooms, 'rooms'), (v_org, v_quotes, 'quotes'), (v_org2, v_rooms2, 'rooms2'), (v_org, v_notes, 'notes')) x(org, tbl, name) loop
      select array_agg(v::uuid) into v_ids from jsonb_array_elements_text(v_tids -> t.tbl::text) v;
      v_out := v_out || jsonb_build_object('seat', v_seat, 'door', 'read_records', 'args', t.name || '/key',
        'body', pg_temp.rmo_try(format('select jsonb_agg(to_jsonb(d))::text from custom.read_records(%L::uuid, %L::uuid, false, 200, 0) d', t.org, t.tbl)));
      v_out := v_out || jsonb_build_object('seat', v_seat, 'door', 'read_records', 'args', t.name || '/id',
        'body', pg_temp.rmo_try(format('select jsonb_agg(to_jsonb(d))::text from custom.read_records(%L::uuid, %L::uuid, true, 200, 0) d', t.org, t.tbl)));
      v_out := v_out || jsonb_build_object('seat', v_seat, 'door', 'read_records_matching', 'args', t.name || '/all',
        'body', pg_temp.rmo_try(format($q$select jsonb_agg(to_jsonb(d))::text from custom.read_records_matching(%L::uuid, %L::uuid, '{}'::jsonb, false, 200, 0) d$q$, t.org, t.tbl)));
      v_out := v_out || jsonb_build_object('seat', v_seat, 'door', 'read_records_matching', 'args', t.name || '/all-by-id',
        'body', pg_temp.rmo_try(format($q$select jsonb_agg(to_jsonb(d))::text from custom.read_records_matching(%L::uuid, %L::uuid, '{}'::jsonb, true, 200, 0) d$q$, t.org, t.tbl)));
      v_out := v_out || jsonb_build_object('seat', v_seat, 'door', 'read_records_by_ids', 'args', t.name || '/key',
        'body', pg_temp.rmo_try(format('select jsonb_agg(to_jsonb(d))::text from custom.read_records_by_ids(%L::uuid, %L::uuid, %L::uuid[], false) d', t.org, t.tbl, v_ids)));
      v_out := v_out || jsonb_build_object('seat', v_seat, 'door', 'read_records_by_ids', 'args', t.name || '/id',
        'body', pg_temp.rmo_try(format('select jsonb_agg(to_jsonb(d))::text from custom.read_records_by_ids(%L::uuid, %L::uuid, %L::uuid[], true) d', t.org, t.tbl, v_ids)));
      v_out := v_out || jsonb_build_object('seat', v_seat, 'door', 'read_records_archived', 'args', t.name,
        'body', pg_temp.rmo_try(format($q$select jsonb_agg(to_jsonb(d))::text from custom.read_records_archived(%L::uuid, %L::uuid, 'org', false, 200, 0) d$q$, t.org, t.tbl)));
      v_out := v_out || jsonb_build_object('seat', v_seat, 'door', 'enrich_cells', 'args', t.name,
        'body', pg_temp.rmo_try(format('select jsonb_agg(to_jsonb(d))::text from custom.enrich_cells(%L::uuid, %L::uuid, null, null) d', t.org, t.tbl)));
    end loop;
    -- a filter on a column she may read, and on one she may not (the refusal is the answer)
    v_out := v_out || jsonb_build_object('seat', v_seat, 'door', 'read_records_matching', 'args', 'rooms/status=Quoting',
      'body', pg_temp.rmo_try(format($q$select jsonb_agg(to_jsonb(d))::text from custom.read_records_matching(%L::uuid, %L::uuid, '{"status":"Quoting"}'::jsonb, false, 200, 0) d$q$, v_org, v_rooms)));
    v_out := v_out || jsonb_build_object('seat', v_seat, 'door', 'read_records_matching', 'args', 'rooms/budget=18000',
      'body', pg_temp.rmo_try(format($q$select jsonb_agg(to_jsonb(d))::text from custom.read_records_matching(%L::uuid, %L::uuid, '{"budget":18000}'::jsonb, false, 200, 0) d$q$, v_org, v_rooms)));
    v_out := v_out || jsonb_build_object('seat', v_seat, 'door', 'read_records_matching', 'args', 'rooms/client_phone',
      'body', pg_temp.rmo_try(format($q$select jsonb_agg(to_jsonb(d))::text from custom.read_records_matching(%L::uuid, %L::uuid, '{"client_phone":"(805) 555-0148"}'::jsonb, false, 200, 0) d$q$, v_org, v_rooms)));
    -- the context an agent is handed, over records of two organizations at three rungs
    v_out := v_out || jsonb_build_object('seat', v_seat, 'door', 'resolve_context', 'args', 'fixture',
      'body', pg_temp.rmo_try(format('select custom.resolve_context(%L, %L::uuid, %L::uuid[], null)::text', 'conversation', c_ctx, v_all)));

    -- live clone data, read as the owner of it
    if v_seat = 'admin' then
      v_ids := v_feat;
      v_out := v_out || jsonb_build_object('seat', v_seat, 'door', 'resolve_context', 'args', 'AI Matrx Feature 17',
        'body', pg_temp.rmo_try(format('select custom.resolve_context(%L, %L::uuid, %L::uuid[], null)::text', 'conversation', c_ctx, v_ids)));
      v_out := v_out || jsonb_build_object('seat', v_seat, 'door', 'read_records_by_ids', 'args', 'AI Matrx Feature 17',
        'body', pg_temp.rmo_try(format('select jsonb_agg(to_jsonb(d))::text from custom.read_records_by_ids(%L::uuid, %L::uuid, %L::uuid[], false) d', c_feature_org, c_feature, v_ids)));
      for r in select unnest(v_ids) as id loop
        v_out := v_out || jsonb_build_object('seat', v_seat, 'door', 'read_record', 'args', 'feature/' || r.id,
          'body', pg_temp.rmo_try(format('select custom.read_record(%L::uuid, %L::uuid, false)::text', c_feature_org, r.id)));
      end loop;
      v_out := v_out || jsonb_build_object('seat', v_seat, 'door', 'read_records_matching', 'args', 'service board 200',
        'body', pg_temp.rmo_try(format($q$select jsonb_agg(to_jsonb(d))::text from custom.read_records_matching(%L::uuid, %L::uuid, '{}'::jsonb, false, 200, 0) d$q$, c_board_org, c_board)));
      v_out := v_out || jsonb_build_object('seat', v_seat, 'door', 'read_records', 'args', 'two Fields one key (by id)',
        'body', pg_temp.rmo_try(format('select jsonb_agg(to_jsonb(d))::text from custom.read_records(%L::uuid, %L::uuid, true, 200, 0) d', c_board_org, c_dup)));
      for r in select unnest(v_dup) as id loop
        v_out := v_out || jsonb_build_object('seat', v_seat, 'door', 'read_record', 'args', 'dup/' || r.id,
          'body', pg_temp.rmo_try(format('select custom.read_record(%L::uuid, %L::uuid, true)::text', c_board_org, r.id)));
      end loop;
      v_out := v_out || jsonb_build_object('seat', v_seat, 'door', 'read_records_by_ids', 'args', 'service board 200',
        'body', pg_temp.rmo_try(format('select jsonb_agg(to_jsonb(d))::text from custom.read_records_by_ids(%L::uuid, %L::uuid, %L::uuid[], false) d', c_board_org, c_board, v_board)));
      v_out := v_out || jsonb_build_object('seat', v_seat, 'door', 'read_records', 'args', 'service board 200 (the export path)',
        'body', pg_temp.rmo_try(format('select jsonb_agg(to_jsonb(d))::text from custom.read_records(%L::uuid, %L::uuid, false, 200, 0) d', c_board_org, c_board)));
      v_out := v_out || jsonb_build_object('seat', v_seat, 'door', 'export_records', 'args', 'service board',
        'body', pg_temp.rmo_try(format('select jsonb_agg(to_jsonb(d))::text from custom.export_records(%L::uuid, %L::uuid, 300) d', c_board_org, c_board)));
      v_out := v_out || jsonb_build_object('seat', v_seat, 'door', 'read_records_by_ids', 'args', 'service board 200 (by id)',
        'body', pg_temp.rmo_try(format('select jsonb_agg(to_jsonb(d))::text from custom.read_records_by_ids(%L::uuid, %L::uuid, %L::uuid[], true) d', c_board_org, c_board, v_board)));
    end if;
    -- live Tables that carry a READ-TIME formula, lookup or rollup, and the records that keep a
    -- whole value in a file: every set door and the read door, for both seats (a refusal is an answer)
    for t in select * from srp_live loop
      v_out := v_out || jsonb_build_object('seat', v_seat, 'door', 'read_records_by_ids', 'args', 'live/' || t.tbl,
        'body', pg_temp.rmo_try(format('select jsonb_agg(to_jsonb(d))::text from custom.read_records_by_ids(%L::uuid, %L::uuid, %L::uuid[], false) d', t.org, t.tbl, t.ids)));
      v_out := v_out || jsonb_build_object('seat', v_seat, 'door', 'read_records_matching', 'args', 'live/' || t.tbl,
        'body', pg_temp.rmo_try(format($q$select jsonb_agg(to_jsonb(d))::text from custom.read_records_matching(%L::uuid, %L::uuid, '{}'::jsonb, false, 50, 0) d$q$, t.org, t.tbl)));
      v_out := v_out || jsonb_build_object('seat', v_seat, 'door', 'read_records', 'args', 'live/' || t.tbl,
        'body', pg_temp.rmo_try(format('select jsonb_agg(to_jsonb(d))::text from custom.read_records(%L::uuid, %L::uuid, false, 50, 0) d', t.org, t.tbl)));
      v_out := v_out || jsonb_build_object('seat', v_seat, 'door', 'read_record', 'args', 'live/' || t.ids[1],
        'body', pg_temp.rmo_try(format('select custom.read_record(%L::uuid, %L::uuid, false)::text', t.org, t.ids[1])));
      v_out := v_out || jsonb_build_object('seat', v_seat, 'door', 'resolve_context', 'args', 'live/' || t.tbl,
        'body', pg_temp.rmo_try(format('select custom.resolve_context(%L, %L::uuid, %L::uuid[], null)::text', 'conversation', c_ctx, t.ids)));
    end loop;
    if false then
    end if;
  end loop;

  perform set_config('role', v_boss, true);
  insert into rmo_out (tag, seat, door, args, digest, len, body)
  select p_tag, e ->> 'seat', e ->> 'door', e ->> 'args', md5(coalesce(e ->> 'body', '<null>')),
         length(coalesce(e ->> 'body', '')), e ->> 'body'
    from jsonb_array_elements(v_out) e;
  get diagnostics v_n = row_count;
  return v_n;
end $dump$;

create function pg_temp.rmo_try(p_sql text) returns text language plpgsql as $$
declare v text;
begin
  execute p_sql into v;
  return v;
exception when others then
  return 'REFUSED ' || sqlstate || ' ' || sqlerrm;
end $$;
grant execute on function pg_temp.rmo_try(text) to authenticated;
-- ══ 1. IDENTICAL OUTPUT: today's bodies, then the campaign file's, same rows, same transaction ══
\if :{?census}
\else
\set census on
\endif
select :'census' <> 'off' as run_census \gset

-- ══ THE WALKS' OWN ANSWERS, every member × Table of every organization census 12 judges ═════════
create temp table cep_scope (org uuid, member uuid) on commit drop;
insert into cep_scope
select o.id, m.user_id
  from iam.organizations o
  join iam.memberships m on m.organization_id = o.id and m.container_type = 'organization' and m.status = 'active'
 where custom.store_is_open(o.id) and not iam.member_lane_open(o.id);
insert into cep_scope values ('5dc930e9-bd65-44a1-8369-af773f6e1a5b', '87a6e699-3622-4869-8843-d0867456c0dd');   -- admin in AI Matrx
select count(distinct org) as walk_orgs, count(*) as walk_seats from cep_scope;

create function pg_temp.walk_dump(p_tag text) returns int language plpgsql as $w$
declare s record; t record; v_rdc record; v_n int := 0; v_body text;
begin
  for s in select * from cep_scope order by org, member loop
    for t in select distinct r.table_id as tbl from custom.record r
              where r.organization_id = s.org and r.deleted_at is null and r.table_id is not null order by 1 loop
      v_rdc := custom.read_door_carried_ids(s.member, s.org, t.tbl, 'viewer'::public.permission_level);
      v_body := coalesce(v_rdc.o_containers::text, '<null>') || '|'
             || coalesce((select array_agg(x order by x)::text from unnest(v_rdc.o_ids) x), '<null>');
      insert into rmo_out values (p_tag, s.member::text, 'read_door_carried_ids', s.org || '/' || t.tbl, md5(v_body), length(v_body), v_body);
      v_body := coalesce(custom.table_has_a_visible_record(s.member, s.org, t.tbl)::text, '<null>');
      insert into rmo_out values (p_tag, s.member::text, 'table_has_a_visible_record', s.org || '/' || t.tbl, md5(v_body), length(v_body), v_body);
      v_body := coalesce(custom.visible_predicate_sql(s.member, s.org, t.tbl, 'viewer'::public.permission_level, 'r'), '<null>');
      insert into rmo_out values (p_tag, s.member::text, 'visible_predicate_sql', s.org || '/' || t.tbl, md5(v_body), length(v_body), v_body);
      v_n := v_n + 3;
    end loop;
    for t in select r.id from custom.record r
              where r.organization_id = s.org and r.table_id = custom.table_kernel_id() and r.deleted_at is null order by 1 loop
      v_body := custom.has_visibility(s.member, 'record', t.id, 'viewer'::public.permission_level)::text;
      insert into rmo_out values (p_tag, s.member::text, 'has_visibility(Table row)', s.org || '/' || t.id, md5(v_body), length(v_body), v_body);
      v_n := v_n + 1;
    end loop;
  end loop;
  return v_n;
end $w$;

create temp table cep_c12 (tag text, secs numeric, rows int, body text) on commit drop;
create function pg_temp.census12(p_tag text) returns text language plpgsql as $c$
declare v_t timestamptz := clock_timestamp(); v_body text; v_rows int;
begin
  select coalesce(string_agg(x, E'\n' order by x), ''), count(*) into v_body, v_rows
    from (select to_jsonb(d)::text as x from custom.shared_only_disagreements(null) d) q;
  insert into cep_c12 values (p_tag, round(extract(epoch from clock_timestamp() - v_t)::numeric, 1), v_rows, v_body);
  return format('%s rows in %s s', v_rows, round(extract(epoch from clock_timestamp() - v_t)::numeric, 1));
end $c$;

select 'walks (old bodies)', pg_temp.walk_dump('old');
\if :run_census
select 'census 12 (old bodies)', pg_temp.census12('old');
\endif
select 'dumped (old bodies)', pg_temp.rmo_dump('old');

-- ══ THE CAMPAIGN FILE'S BODY ════════════════════════════════════════════════════════════════
\i migrations/campaign/carryingedgesperf_a_record_walk_reads_only_the_edges_that_reach_a_record.sql

select :'plant' = 'records_only' as plant_records_only \gset
\if :plant_records_only
-- PLANT: the tempting prune — keep only the edges whose ITEM is a record. It drops the Kitchen ->
-- task edge, so the site note under the task is no longer carried from the Kitchen.
select set_config('cep.plant', 'records_only', true);
create or replace function custom.carrying_edges_in(p_organization_id uuid)
 returns table(container_type text, container_id uuid, item_type text, item_id uuid, conveys_max permission_level)
 language plpgsql stable security definer set search_path to ''
as $function$
begin
  return query
    select case when cr.container_side = 'source' then a.source_type else a.target_type end,
           case when cr.container_side = 'source' then a.source_id   else a.target_id   end,
           case when cr.container_side = 'source' then a.target_type else a.source_type end,
           case when cr.container_side = 'source' then a.target_id   else a.source_id   end,
           cr.conveys_max
      from platform.associations a
      join custom.carrying_rule cr on cr.role = a.role and cr.is_active
     where a.deleted_at is null
       and (a.organization_id = p_organization_id or a.organization_id is null)
       and (case when cr.container_side = 'source' then a.target_type else a.source_type end) = 'record'
    union
    select 'record'::text, a.target_id, 'record'::text, a.source_id, pt.conveys_max
      from platform.associations a
      join custom.portal_table pt on pt.names_via_field_id = a.relation_field_id
      join custom.portal p on p.id = pt.portal_id and p.is_active
     where a.deleted_at is null and a.organization_id = p_organization_id
       and pt.organization_id = p_organization_id
       and a.source_type = 'record' and a.target_type = 'record';
end
$function$;
\endif

select 'dumped (new bodies)', pg_temp.rmo_dump('new');
select 'walks (new bodies)', pg_temp.walk_dump('new');
\if :run_census
select 'census 12 (new bodies)', pg_temp.census12('new');
\endif

do $one$
declare v_n int; v_old int; v_new int; v_bad record;
begin
  select count(*) into v_old from rmo_out where tag = 'old';
  select count(*) into v_new from rmo_out where tag = 'new';
  if v_old = 0 or v_old <> v_new then
    raise exception '1: the two dumps are not the same set of answers (% old, % new)', v_old, v_new;
  end if;
  for v_bad in
    select o.seat, o.door, o.args, o.len as old_len, n.len as new_len, left(o.body, 300) as old_body, left(n.body, 300) as new_body
      from rmo_out o join rmo_out n on n.tag = 'new' and n.seat = o.seat and n.door = o.door and n.args = o.args
     where o.tag = 'old' and o.digest <> n.digest
     limit 5
  loop
    raise warning '1: % % % moved (% -> % chars)% old: % % new: %', v_bad.seat, v_bad.door, v_bad.args,
      v_bad.old_len, v_bad.new_len, chr(10), v_bad.old_body, chr(10), v_bad.new_body;
  end loop;
  select count(*) into v_n
    from rmo_out o join rmo_out n on n.tag = 'new' and n.seat = o.seat and n.door = o.door and n.args = o.args
   where o.tag = 'old' and o.digest = n.digest;
  if v_n <> v_old then
    raise exception '1: % of % answers moved between the old bodies and the new', v_old - v_n, v_old;
  end if;
  raise notice '1 PASS — % answers byte-identical before and after (% door answers across % doors, % walk answers across % walks)',
    v_old,
    (select count(*) from rmo_out where tag = 'new' and door not in ('read_door_carried_ids', 'table_has_a_visible_record', 'visible_predicate_sql', 'has_visibility(Table row)')),
    (select count(distinct door) from rmo_out where tag = 'new' and door not in ('read_door_carried_ids', 'table_has_a_visible_record', 'visible_predicate_sql', 'has_visibility(Table row)')),
    (select count(*) from rmo_out where tag = 'new' and door in ('read_door_carried_ids', 'table_has_a_visible_record', 'visible_predicate_sql', 'has_visibility(Table row)')),
    (select count(distinct door) from rmo_out where tag = 'new' and door in ('read_door_carried_ids', 'table_has_a_visible_record', 'visible_predicate_sql', 'has_visibility(Table row)'));
end $one$;

do $two$
declare
  c_dana constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';
  v_org uuid; v_note uuid; v_task uuid; v_notes uuid; v_door text;
begin
  select v into v_org from rmo where k = 'org';  select v into v_note from rmo where k = 'n_delivery';
  select v into v_task from rmo where k = 'task'; select v into v_notes from rmo where k = 'notes';
  if not exists (select 1 from custom.carrying_edges_in(v_org) e
                  where e.item_type = 'task' and e.item_id = v_task and e.container_type = 'record') then
    raise exception '2: the new edge set dropped the Kitchen -> task edge, the middle of a path to a record';
  end if;
  if not custom.has_visibility(c_dana, 'record', v_note, 'viewer') then
    raise exception '2: the one ladder does not carry the site note to the crew lead through the task';
  end if;
  if not (v_note = any ((custom.read_door_carried_ids(c_dana, v_org, v_notes, 'viewer')).o_ids)) then
    raise exception '2: the read door does not carry the site note to the crew lead through the task';
  end if;
  select body into v_door from rmo_out where tag = 'new' and seat = 'member' and door = 'read_records' and args = 'notes/key';
  if v_door is null or strpos(v_door, v_note::text) = 0 then
    raise exception '2: custom.read_records on Site Notes did not hand the crew lead the delivery note: %', left(v_door, 300);
  end if;
  raise notice '2 PASS — Kitchen -> task -> note is carried: the edge set keeps the task edge; the ladder, the read door and read_records all hand the crew lead the note';
end $two$;

\if :run_census
do $three$
declare o record; n record;
begin
  select * into o from cep_c12 where tag = 'old';
  select * into n from cep_c12 where tag = 'new';
  if o.body is distinct from n.body then
    raise exception '3: census 12 answered differently before (% rows) and after (% rows)', o.rows, n.rows;
  end if;
  raise notice '3 PASS — census 12 answers the same % rows before and after: % s with the old body, % s with the new', n.rows, o.secs, n.secs;
end $three$;
\endif

select case when current_setting('cep.plant', true) = 'records_only'
            then 'PLANT records_only WAS NOT CAUGHT — the suite is not a guard'
            else 'carryingedgesperf_green: every clause green' end as verdict;
rollback;
