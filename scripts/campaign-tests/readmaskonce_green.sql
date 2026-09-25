-- READ-MASK-ONCE — THE GREEN SUITE (lane READ-MASK-ONCE, 2026-09-25).
--
-- What it proves, in the order it proves it:
--   0  the seat is real, and the fixture produced what the proof needs: the member holds TWO
--      different rungs on records of the SAME Table (a Table share at viewer, one record shared to
--      her by name at editor), and she belongs to TWO organizations (member in one, owner of the
--      other) that each keep a Rooms Table
--   1  IDENTICAL OUTPUT. Every reader the file touches is dumped — for admin@admin.com, for the
--      member and for the named-people share — with the OLD bodies (the inverse, \i'd here), then
--      with the NEW bodies (the campaign file, \i'd here), in the same transaction over the same
--      rows, and every (seat, door, arguments) answer must be byte-identical (md5 of its text).
--      Doors: read_record (by key and by id), read_records (both keys), read_records_matching
--      (no filter, a visible-column filter, a hidden-column filter — the refusal is the answer),
--      read_records_by_ids (both keys), read_records_archived, record_values_versioned,
--      record_history, record_as_of, computed_provenance, enrich_cells, resolve_context,
--      record_card. Plus live clone data for admin: AI Matrx -> Feature (17 scopes, resolve_context
--      and read_record each), the September service board page, and a Table with two Fields
--      under one key (jsonb_object_agg's last-wins order is part of the answer).
--   2  THE ORACLE, record by record: custom.read_mask (new) equals the pre-lane read_mask body
--      (kept here as pg_temp.old_read_mask) for every fixture record and every seat, all asked in
--      ONE statement so the memo is warm and shared across Tables, organizations and rungs.
--   3  ONE TABLE, TWO RUNGS, ONE STATEMENT: the record shared to her at editor shows the
--      confidential Budget and the one she reads at viewer withholds it.
--   4  TWO ORGANIZATIONS, ONE STATEMENT: her own organization's Rooms shows the restricted
--      column, the other organization's withholds it.
--   5  A FIELD CHANGES MID-STATEMENT and the memo does not serve the old mask: inside ONE DO block
--      she reads a row (Status visible), the owner makes Status restricted, she reads it again
--      (Status withheld), and the answer equals the oracle both times. The same across two
--      statements.
--   6  the memo is actually used: after a read, the slot for (her, org, Table, rung, read) is held.
--
-- PLANTS (the guard must be seen failing; measured 2026-09-25 on the clone). `-v plant=level` —
-- read_mask_for's memo key drops the rung — goes red at clause 1 (9 of 192 answers move: the
-- crew lead's Primary bath is handed the Kitchen's editor mask). `-v plant=stale` — the memo slot
-- is read without its stamp — goes red at clause 5 (the same statement serves Status after it
-- became restricted). With no plant every clause is green. Clause order is 1, 5, 0, 3, 4, 2, 6.
--
-- THE USE CASE (owner law, 2026-09-21: no fake test data): a renovation general contractor's
-- job book. Rooms carry a confidential Budget and a restricted Client phone; the crew lead is shared
-- the Rooms Table at viewer and the Kitchen by name at editor, because she runs that job. She also
-- owns her own small tiling business, which keeps a Rooms Table of its own.
--
-- Run (from matrx-frontend): psql -f scripts/campaign-tests/readmaskonce_green.sql   (dev clone)
\set ON_ERROR_STOP on
\set suite 'readmaskonce_green.sql'
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
  v_def jsonb;
begin
  perform set_config('app.actor_system', 'campaign-test/readmaskonce', true);

  insert into iam.organizations (id, name, slug, abbreviation, created_by) values
    (v_org,  'Birchwood Avenue Renovation ' || substr(v_org::text, 1, 8),
             'birchwood-rmo-' || substr(v_org::text, 1, 8), 'BAR', c_admin),
    (v_org2, 'Coastline Tile & Stone ' || substr(v_org2::text, 1, 8),
             'coastline-rmo-' || substr(v_org2::text, 1, 8), 'CTS', c_dana);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_org,  'organization', v_org,  c_admin, 'owner',  'active'),
    (v_org,  'organization', v_org,  c_dana,  'member', 'active'),
    (v_org2, 'organization', v_org2, c_dana,  'owner',  'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note) values
    ('custom', 'system_enabled',            'organization', v_org,  v_org,  'true'::jsonb, 'readmaskonce fixture'),
    ('custom', 'member_default_visibility', 'organization', v_org,  v_org,  '"shared_only"'::jsonb, 'readmaskonce fixture: the crew lead sees what she is shared'),
    ('custom', 'system_enabled',            'organization', v_org2, v_org2, 'true'::jsonb, 'readmaskonce fixture');

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

  insert into rmo values ('org', v_org), ('org2', v_org2), ('rooms', v_rooms), ('quotes', v_quotes), ('rooms2', v_rooms2);
end
$fixture$;

-- ══ THE PRE-LANE MASK, AS THE ORACLE ════════════════════════════════════════════════════════
-- custom.read_mask's body exactly as it stood before this lane (2026-09-25), under another name.
create function pg_temp.old_read_mask(p_organization_id uuid, p_record_id uuid, p_action text default 'read')
returns jsonb language plpgsql stable security definer set search_path to '' as $function$
declare
  v_me uuid := auth.uid(); v_table uuid; v_level public.permission_level;
  v_visible text[]; v_declared text[]; v_notices jsonb; v_key_ids jsonb; v_org uuid;
begin
  select r.table_id, r.organization_id into v_table, v_org from custom.record r where r.id = p_record_id;
  if v_table is null then
    return jsonb_build_object('table_id', null, 'level', null, 'visible', '[]'::jsonb, 'declared', '[]'::jsonb,
                              'notices', '{}'::jsonb, 'key_ids', '{}'::jsonb, 'undeclared_ride_along', true);
  end if;
  v_level := custom.effective_level(v_me, v_org, p_record_id);
  select coalesce(array_agg(f.field_key), '{}'::text[]) into v_visible
    from iam.visible_field_ids(v_me, v_org, v_table, v_level, p_action) f;
  select coalesce(array_agg(f.data ->> 'key'), '{}'::text[]) into v_declared
    from custom.record f
   where f.organization_id = v_org and f.table_id = custom.field_kernel_id() and f.deleted_at is null
     and (f.data ->> 'entity_definition_id')::uuid = v_table;
  select coalesce(jsonb_object_agg(f.data ->> 'key', custom.hidden_field_notice(f, p_action)), '{}'::jsonb),
         coalesce(jsonb_object_agg(f.data ->> 'key', f.id::text), '{}'::jsonb)
    into v_notices, v_key_ids
    from custom.record f
   where f.organization_id = v_org and f.table_id = custom.field_kernel_id() and f.deleted_at is null
     and (f.data ->> 'entity_definition_id')::uuid = v_table
     and not (f.data ->> 'key' = any (v_visible));
  return jsonb_build_object('table_id', v_table, 'level', v_level, 'visible', to_jsonb(v_visible),
    'declared', to_jsonb(v_declared), 'notices', v_notices, 'key_ids', v_key_ids, 'undeclared_ride_along', true);
end $function$;
grant execute on function pg_temp.old_read_mask(uuid, uuid, text) to authenticated;

-- ══ THE DUMP: every reader, every seat, into rmo_out under a tag ════════════════════════════
create function pg_temp.rmo_dump(p_tag text) returns int language plpgsql as $dump$
declare
  c_seats constant jsonb := jsonb_build_object(
    'admin', '87a6e699-3622-4869-8843-d0867456c0dd',
    'member', '4060701e-706a-4c76-b3ca-0bbc69fa5a14');
  v_boss text := current_user;
  v_seat text; v_uid uuid; v_out jsonb := '[]'::jsonb;
  v_org uuid; v_org2 uuid; v_rooms uuid; v_rooms2 uuid; v_quotes uuid;
  t record; r record; v_ids uuid[]; v_all uuid[]; v_recs jsonb; v_tids jsonb; v_feat uuid[]; v_dup uuid[];
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
  select v into v_quotes from rmo where k = 'quotes';
  select array_agg(v order by k) into v_all from rmo
   where k in ('Kitchen', 'Primary bath', 'Garage', 'Mudroom', 'q_voltway', 'q_harbor', 'b_hall', 'b_backsplash');
  -- every id the dump reads is gathered HERE, as the suite's own role: the seated person may not
  -- read custom.record directly, and must not need to — she only ever goes through the doors
  select jsonb_agg(jsonb_build_object('id', x.id, 'org', x.organization_id) order by x.id) into v_recs
    from custom.record x where x.id = any (v_all);
  select jsonb_object_agg(t2.tbl, (select jsonb_agg(x.id order by x.id) from custom.record x where x.table_id = t2.tbl))
    into v_tids from (values (v_rooms), (v_quotes), (v_rooms2)) t2(tbl);
  select array_agg(x.id order by x.created_at) into v_feat from custom.record x where x.table_id = c_feature and x.deleted_at is null;
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
    for t in select * from (values (v_org, v_rooms, 'rooms'), (v_org, v_quotes, 'quotes'), (v_org2, v_rooms2, 'rooms2')) x(org, tbl, name) loop
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

-- ══ 1. IDENTICAL OUTPUT: old bodies, then new bodies, same rows, same transaction ═══════════
\i migrations/inverse/readmaskonce_the_field_mask_is_asked_once_per_table_down.sql
select 'dumped (old bodies)', pg_temp.rmo_dump('old');
\i migrations/campaign/readmaskonce_the_field_mask_is_asked_once_per_table.sql

select :'plant' = 'level' as plant_level, :'plant' = 'stale' as plant_stale \gset
\if :plant_level
-- PLANT: the memo key forgets the rung, so every record of a Table gets the first rung's mask.
select set_config('rmo.plant', 'level', true);
create or replace function custom.read_mask_for(p_user_id uuid, p_organization_id uuid, p_table_id uuid,
    p_level public.permission_level, p_action text default 'read')
returns jsonb language plpgsql stable security definer set search_path to '' as $function$
declare v_key text; v_hit text; v_visible text[]; v_declared text[]; v_notices jsonb; v_key_ids jsonb; v_all_ids jsonb; v_out jsonb;
begin
  if p_table_id is null then return jsonb_build_object('table_id', null, 'level', null, 'visible', '[]'::jsonb, 'declared', '[]'::jsonb, 'notices', '{}'::jsonb, 'key_ids', '{}'::jsonb, 'all_key_ids', '{}'::jsonb, 'undeclared_ride_along', true); end if;
  v_key := 'rmf:' || coalesce(p_user_id::text, '-') || ':' || coalesce(p_organization_id::text, '-') || ':' || p_table_id::text || ':' || coalesce(p_action, '-');
  v_hit := platform.memo_k_get(v_key);
  if v_hit is not null then return v_hit::jsonb; end if;
  select coalesce(array_agg(f.field_key), '{}'::text[]) into v_visible from iam.visible_field_ids(p_user_id, p_organization_id, p_table_id, p_level, p_action) f;
  select coalesce(array_agg(f.data ->> 'key'), '{}'::text[]), coalesce(jsonb_object_agg(f.data ->> 'key', f.id::text), '{}'::jsonb) into v_declared, v_all_ids
    from custom.record f where f.organization_id = p_organization_id and f.table_id = custom.field_kernel_id() and f.deleted_at is null and (f.data ->> 'entity_definition_id')::uuid = p_table_id;
  select coalesce(jsonb_object_agg(f.data ->> 'key', custom.hidden_field_notice(f, p_action)), '{}'::jsonb), coalesce(jsonb_object_agg(f.data ->> 'key', f.id::text), '{}'::jsonb) into v_notices, v_key_ids
    from custom.record f where f.organization_id = p_organization_id and f.table_id = custom.field_kernel_id() and f.deleted_at is null and (f.data ->> 'entity_definition_id')::uuid = p_table_id and not (f.data ->> 'key' = any (v_visible));
  v_out := jsonb_build_object('table_id', p_table_id, 'level', p_level, 'visible', to_jsonb(v_visible), 'declared', to_jsonb(v_declared), 'notices', v_notices, 'key_ids', v_key_ids, 'all_key_ids', v_all_ids, 'undeclared_ride_along', true);
  perform platform.memo_k_put(v_key, v_out::text);
  return v_out;
end $function$;
\endif
\if :plant_stale
-- PLANT: the memo ignores its stamp — a slot written once is served for the rest of the transaction.
select set_config('rmo.plant', 'stale', true);
create or replace function custom.read_mask_for(p_user_id uuid, p_organization_id uuid, p_table_id uuid,
    p_level public.permission_level, p_action text default 'read')
returns jsonb language plpgsql stable security definer set search_path to '' as $function$
declare v_key text; v_hit text; v_visible text[]; v_declared text[]; v_notices jsonb; v_key_ids jsonb; v_all_ids jsonb; v_out jsonb;
begin
  if p_table_id is null then return jsonb_build_object('table_id', null, 'level', null, 'visible', '[]'::jsonb, 'declared', '[]'::jsonb, 'notices', '{}'::jsonb, 'key_ids', '{}'::jsonb, 'all_key_ids', '{}'::jsonb, 'undeclared_ride_along', true); end if;
  v_key := 'rmf:' || coalesce(p_user_id::text, '-') || ':' || coalesce(p_organization_id::text, '-') || ':' || p_table_id::text || ':' || coalesce(p_level::text, '-') || ':' || coalesce(p_action, '-');
  -- the SAME slot the real door writes, read WITHOUT its stamp: whatever was put there is served
  v_hit := nullif(current_setting('mx_memo.k' || md5(v_key), true), '');
  if v_hit is not null then return substr(v_hit, strpos(v_hit, chr(1)) + 1)::jsonb; end if;
  select coalesce(array_agg(f.field_key), '{}'::text[]) into v_visible from iam.visible_field_ids(p_user_id, p_organization_id, p_table_id, p_level, p_action) f;
  select coalesce(array_agg(f.data ->> 'key'), '{}'::text[]), coalesce(jsonb_object_agg(f.data ->> 'key', f.id::text), '{}'::jsonb) into v_declared, v_all_ids
    from custom.record f where f.organization_id = p_organization_id and f.table_id = custom.field_kernel_id() and f.deleted_at is null and (f.data ->> 'entity_definition_id')::uuid = p_table_id;
  select coalesce(jsonb_object_agg(f.data ->> 'key', custom.hidden_field_notice(f, p_action)), '{}'::jsonb), coalesce(jsonb_object_agg(f.data ->> 'key', f.id::text), '{}'::jsonb) into v_notices, v_key_ids
    from custom.record f where f.organization_id = p_organization_id and f.table_id = custom.field_kernel_id() and f.deleted_at is null and (f.data ->> 'entity_definition_id')::uuid = p_table_id and not (f.data ->> 'key' = any (v_visible));
  v_out := jsonb_build_object('table_id', p_table_id, 'level', p_level, 'visible', to_jsonb(v_visible), 'declared', to_jsonb(v_declared), 'notices', v_notices, 'key_ids', v_key_ids, 'all_key_ids', v_all_ids, 'undeclared_ride_along', true);
  perform platform.memo_k_put(v_key, v_out::text);
  return v_out;
end $function$;
\endif

select 'dumped (new bodies)', pg_temp.rmo_dump('new');

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
  select count(*) into v_n from rmo_out where tag = 'new' and body like 'REFUSED%';
  raise notice '1 PASS — % answers byte-identical before and after (% of them a refusal, identical too), across % doors',
    v_old, v_n, (select count(distinct door) from rmo_out where tag = 'new');
end $one$;

-- ══ 5. A FIELD CHANGES MID-STATEMENT ════════════════════════════════════════════════════════
do $five$
declare
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_dana_j  constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  v_org uuid; v_rooms uuid; v_bath uuid; v_before jsonb; v_after jsonb;
begin
  select v into v_org from rmo where k = 'org'; select v into v_rooms from rmo where k = 'rooms';
  select v into v_bath from rmo where k = 'Primary bath';
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', c_dana_j, true);
  v_before := custom.read_record(v_org, v_bath, false);
  if v_before ->> 'status' is distinct from 'Planning' then
    raise exception '5: before the change she should read Status Planning: %', v_before;
  end if;

  -- the owner decides the job's status is for the office only
  perform set_config('request.jwt.claims', c_admin_j, true);
  perform custom.field_update(v_org, (select v from rmo where k = 'f_status'), jsonb_build_object('sensitivity', 'restricted'));

  perform set_config('request.jwt.claims', c_dana_j, true);
  v_after := custom.read_record(v_org, v_bath, false);
  if not (v_after -> '_hidden' ? 'status') or jsonb_typeof(v_after -> 'status') <> 'null' then
    raise exception '5: the SAME statement served the mask from before Status became restricted: %', v_after;
  end if;
  perform set_config('role', 'postgres', true);
  if custom.read_mask(v_org, v_bath) is distinct from pg_temp.old_read_mask(v_org, v_bath) then
    raise exception '5: after the change the mask and the oracle disagree';
  end if;
  raise notice '5 PASS — inside one statement: Status read Planning, the owner made it restricted, the next read withholds it';
end $five$;

-- 5b. and across statements: the next statement sees the change as well
select set_config('request.jwt.claims', '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}', true) \g /dev/null
do $fiveb$
declare v_doc jsonb;
begin
  perform set_config('role', 'authenticated', true);
  v_doc := custom.read_record((select v from rmo where k = 'org'), (select v from rmo where k = 'Garage'), false);
  if not (v_doc -> '_hidden' ? 'status') then
    raise exception '5b: a later statement reads the Garage''s Status although it is restricted: %', v_doc;
  end if;
  perform set_config('role', 'postgres', true);
  raise notice '5b PASS — a later statement withholds Status too';
end $fiveb$;

-- ══ 2–4, 6. THE ORACLE, TWO RUNGS, TWO ORGANIZATIONS — all in ONE statement ════════════════
do $t$
declare
  c_dana    constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_dana_j  constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  v_org uuid; v_org2 uuid; v_rooms uuid; v_rooms2 uuid; r record; v_new jsonb; v_old jsonb;
  v_kitchen jsonb; v_bath jsonb; v_own jsonb; v_lk text; v_lb text; v_n int := 0; v_seat text;
begin
  select v into v_org from rmo where k = 'org';   select v into v_org2 from rmo where k = 'org2';
  select v into v_rooms from rmo where k = 'rooms'; select v into v_rooms2 from rmo where k = 'rooms2';
  perform set_config('role', 'authenticated', true);

  -- 0. the seat and the fixture's two rungs
  if current_user <> 'authenticated' then
    raise exception '0: this suite did not take the seat — current_user is %', current_user;
  end if;
  perform set_config('request.jwt.claims', c_dana_j, true);
  v_kitchen := custom.read_record(v_org, (select v from rmo where k = 'Kitchen'), false);
  v_bath    := custom.read_record(v_org, (select v from rmo where k = 'Primary bath'), false);
  v_own     := custom.read_record(v_org2, (select v from rmo where k = 'b_hall'), false);
  perform set_config('role', 'postgres', true);
  v_lk := custom.effective_level(c_dana, v_org, (select v from rmo where k = 'Kitchen'))::text;
  v_lb := custom.effective_level(c_dana, v_org, (select v from rmo where k = 'Primary bath'))::text;
  perform set_config('role', 'authenticated', true);
  if v_lk is not distinct from v_lb then
    raise exception '0: the fixture gave the crew lead ONE rung on Rooms (% and %) — the proof needs two', v_lk, v_lb;
  end if;
  raise notice '0 PASS — seated; the crew lead holds % on the Kitchen and % on the Primary bath, and owns a second organization', v_lk, v_lb;

  -- 3. one Table, two rungs, one statement
  if v_kitchen -> 'budget' is null or jsonb_typeof(v_kitchen -> 'budget') = 'null'
     or v_kitchen -> '_hidden' ? 'budget' then
    raise exception '3: the Kitchen, shared to her at %, withholds the confidential Budget: %', v_lk, v_kitchen;
  end if;
  if not (v_bath -> '_hidden' ? 'budget') or jsonb_typeof(v_bath -> 'budget') <> 'null' then
    raise exception '3: the Primary bath, which she reads at %, shows the confidential Budget: %', v_lb, v_bath;
  end if;
  raise notice '3 PASS — one statement, one Table: the Kitchen (%) shows Budget %, the Primary bath (%) withholds it', v_lk, v_kitchen ->> 'budget', v_lb;

  -- 4. two organizations, one statement
  if v_own ->> 'client_phone' is distinct from '(805) 555-0173' then
    raise exception '4: her own organization''s Hall bath floor withholds her own client''s phone: %', v_own;
  end if;
  if not (v_kitchen -> '_hidden' ? 'client_phone') then
    raise exception '4: the other organization''s Kitchen shows the restricted Client phone at %: %', v_lk, v_kitchen;
  end if;
  raise notice '4 PASS — one statement, two organizations: her own Rooms shows the client phone, the contractor''s withholds it';

  -- 2. the oracle, every record, both seats, one statement
  for v_seat in select unnest(array[c_admin_j, c_dana_j]) loop
    perform set_config('request.jwt.claims', v_seat, true);
    perform set_config('role', 'postgres', true);
    for r in select x.id, x.organization_id as org from custom.record x
              where x.id in (select v from rmo where k in ('Kitchen', 'Primary bath', 'Garage', 'Mudroom', 'q_voltway', 'q_harbor', 'b_hall', 'b_backsplash'))
                 or x.table_id in ('36c07712-b0f2-43f2-a1c8-712ae4a75739'::uuid, '6dddb7c1-82e4-4b78-b1e1-dc1a3c5a7789'::uuid) loop
      v_new := custom.read_mask(r.org, r.id, 'read');
      v_old := pg_temp.old_read_mask(r.org, r.id, 'read');
      if v_new is distinct from v_old then
        raise exception '2: read_mask for record % (seat %) moved:% new: % % old: %', r.id, v_seat ->> 'sub', chr(10), v_new, chr(10), v_old;
      end if;
      -- and the edit mask, which the history doors never ask but the door takes
      if custom.read_mask(r.org, r.id, 'edit') is distinct from pg_temp.old_read_mask(r.org, r.id, 'edit') then
        raise exception '2: the edit mask for record % (seat %) moved', r.id, v_seat ->> 'sub';
      end if;
      v_n := v_n + 1;
    end loop;
  end loop;
  raise notice '2 PASS — custom.read_mask equals the pre-lane body on % record×seat pairs (read and edit), all in one statement', v_n;

  -- 6. the memo is held for her, for the Primary bath's Table at her rung
  perform set_config('request.jwt.claims', c_dana_j, true);
  if platform.memo_k_get('rmf:' || c_dana || ':' || v_org || ':' || v_rooms || ':' || v_lb || ':read') is null then
    raise exception '6: no memo slot is held for (crew lead, Birchwood, Rooms, %, read) after she read it in this statement', v_lb;
  end if;
  raise notice '6 PASS — the mask for (crew lead, Birchwood, Rooms, %, read) is held once for the statement', v_lb;
  perform set_config('role', 'postgres', true);
end $t$;

select case when current_setting('rmo.plant', true) in ('level', 'stale')
            then 'PLANT ' || current_setting('rmo.plant', true) || ' WAS NOT CAUGHT — the suite is not a guard'
            else 'readmaskonce_green: every clause green' end as verdict;
rollback;
