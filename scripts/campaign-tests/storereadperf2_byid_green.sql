-- STORE-READ-PERF-2 — ONE BY-ID SHAPE (lane STORE-READ-PERF-2, 2026-09-25).
--
-- DOOR-N-5: the read door is "name-keyed by default, id-keyed on request". What it proves:
--   1  THE DEFECT, SEEN: with the bodies production holds before the file, the same record asked
--      for by id answers with DIFFERENT keys from custom.read_record and from the page door
--      custom.read_records (the single-record door renamed only the hidden Fields).
--   2  NAME-KEYED ANSWERS DO NOT MOVE: every door asked by key (read_record, read_records,
--      read_records_matching, read_records_by_ids) for both seats is byte-identical before and
--      after the file.
--   3  ONE SHAPE AFTER: for every record either seat may read, custom.read_record(…, true) and
--      custom.read_records_by_ids(…, true) answer exactly the document custom.read_records(…, true)
--      answers for that record, and every declared Field's key is its id.
-- Clause 1 is the red half: run against the new bodies it cannot hold, and run against the old it
-- does. Fixture: READ-MASK-ONCE's renovation job book (no fake data).
--
-- Run (from matrx-frontend): psql -f scripts/campaign-tests/storereadperf2_byid_green.sql   (dev clone)
\set ON_ERROR_STOP on
\set suite 'storereadperf2_byid_green.sql'
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
  perform set_config('app.actor_system', 'campaign-test/storereadperf2', true);

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

  insert into rmo values ('org', v_org), ('org2', v_org2), ('rooms', v_rooms), ('quotes', v_quotes), ('rooms2', v_rooms2);
end
$fixture$;

create function pg_temp.byid_dump(p_tag text) returns int language plpgsql as $dump$
declare
  c_seats constant uuid[] := array['87a6e699-3622-4869-8843-d0867456c0dd', '4060701e-706a-4c76-b3ca-0bbc69fa5a14']::uuid[];
  v_boss text := current_user; v_uid uuid; t record; r record; v_ids uuid[]; v_n int := 0; v_doc jsonb; v_page jsonb;
begin
  foreach v_uid in array c_seats loop
    perform set_config('request.jwt.claims', jsonb_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
    for t in select o.v as org, x.v as tbl from rmo x join rmo o on o.k = case when x.k = 'rooms2' then 'org2' else 'org' end
              where x.k in ('rooms', 'quotes', 'rooms2') loop
      perform set_config('role', v_boss, true);
      select array_agg(y.id order by y.id) into v_ids from custom.record y where y.table_id = t.tbl;
      perform set_config('role', 'authenticated', true);
      begin
      insert into byid_out select p_tag, v_uid, 'read_records key', t.tbl, null,
        (select jsonb_agg(to_jsonb(d))::text from custom.read_records(t.org, t.tbl, false, 200, 0) d);
      insert into byid_out select p_tag, v_uid, 'read_records_matching key', t.tbl, null,
        (select jsonb_agg(to_jsonb(d))::text from custom.read_records_matching(t.org, t.tbl, '{}'::jsonb, false, 200, 0) d);
      insert into byid_out select p_tag, v_uid, 'read_records_by_ids key', t.tbl, null,
        (select jsonb_agg(to_jsonb(d))::text from custom.read_records_by_ids(t.org, t.tbl, v_ids, false) d);
      for r in select d.id, d.document, d.level from custom.read_records(t.org, t.tbl, true, 200, 0) d loop
        insert into byid_out values (p_tag, v_uid, 'read_record key', t.tbl, r.id, custom.read_record(t.org, r.id, false)::text);
        insert into byid_out values (p_tag, v_uid, 'page by id', t.tbl, r.id, r.document::text, r.level::text);
        insert into byid_out values (p_tag, v_uid, 'read_record by id', t.tbl, r.id, custom.read_record(t.org, r.id, true)::text);
        insert into byid_out select p_tag, v_uid, 'by_ids by id', t.tbl, r.id, d.document::text, d.level::text
          from custom.read_records_by_ids(t.org, t.tbl, array[r.id], true) d;
        v_n := v_n + 1;
      end loop;
      exception when insufficient_privilege then
        -- a Table this seat may not know (the admin is no member of the crew lead's own
        -- organization): the refusal is the same before and after, and there is nothing to compare
        insert into byid_out values (p_tag, v_uid, 'refused key', t.tbl, null, sqlerrm);
      end;
    end loop;
  end loop;
  perform set_config('role', v_boss, true);
  return v_n;
end $dump$;
create temp table byid_out (tag text, seat uuid, door text, tbl uuid, rid uuid, body text, lvl text) on commit drop;
grant insert, select on byid_out to authenticated;

select 'dumped (old bodies)', pg_temp.byid_dump('old');
\i migrations/campaign/storereadperf2_by_id_renames_every_declared_key.sql
select 'dumped (new bodies)', pg_temp.byid_dump('new');

do $c$
declare v_n int; v_bad record; v_keys int;
begin
  -- 1. the defect, seen on the old bodies
  select count(*) into v_n from byid_out a join byid_out b
      on b.tag = 'old' and b.seat = a.seat and b.rid = a.rid and b.door = 'page by id'
   where a.tag = 'old' and a.door = 'read_record by id' and a.body::jsonb is distinct from b.body::jsonb;
  if v_n = 0 then
    raise exception '1: the old bodies already agreed by id — there is no defect to fix here, so this suite proves nothing';
  end if;
  raise notice '1 PASS (red half) — before the file, % record×seat answers by id differed between custom.read_record and custom.read_records', v_n;

  -- 2. name-keyed answers do not move
  select count(*) into v_n from byid_out o join byid_out n
      on n.tag = 'new' and n.seat = o.seat and n.door = o.door and n.tbl = o.tbl and n.rid is not distinct from o.rid
   where o.tag = 'old' and o.door like '% key' and md5(coalesce(o.body, '<null>')) <> md5(coalesce(n.body, '<null>'));
  if v_n > 0 then
    raise exception '2: % name-keyed answers moved', v_n;
  end if;
  select count(*) into v_n from byid_out where tag = 'new' and door like '% key';
  raise notice '2 PASS — % name-keyed answers byte-identical before and after', v_n;

  -- 3. one shape after
  for v_bad in
    select a.seat, a.rid, a.door, left(a.body, 300) as got, left(b.body, 300) as page
      from byid_out a join byid_out b on b.tag = 'new' and b.seat = a.seat and b.rid = a.rid and b.door = 'page by id'
     where a.tag = 'new' and a.door in ('read_record by id', 'by_ids by id') and a.body::jsonb is distinct from b.body::jsonb
       -- a record shared to her above the Table's rung is read at ITS rung by the record doors and
       -- at the Table's by the page door (a different mask, not a different shape): compared on keys below
       and (select l.lvl from byid_out l where l.tag = 'new' and l.seat = a.seat and l.rid = a.rid and l.door = 'by_ids by id')
           is not distinct from b.lvl
     limit 3
  loop
    raise exception '3: % for record % (seat %) differs from the page door:% got:  % % page: %', v_bad.door, v_bad.rid, v_bad.seat, chr(10), v_bad.got, chr(10), v_bad.page;
  end loop;
  select count(*) into v_keys
    from byid_out a cross join lateral jsonb_object_keys(a.body::jsonb) k
   where a.tag = 'new' and a.door in ('read_record by id', 'by_ids by id') and left(k, 1) <> '_'
     and k !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  if v_keys > 0 then
    raise exception '3: % keys of custom.read_record(…, true) are still names, not Field ids', v_keys;
  end if;
  select count(*) into v_n from byid_out a join byid_out b on b.tag = 'new' and b.seat = a.seat and b.rid = a.rid and b.door = 'page by id'
   where a.tag = 'new' and a.door = 'by_ids by id' and a.lvl is distinct from b.lvl;
  if v_n = 0 then
    raise exception '3: the fixture held no record read above its Table''s rung, so the key-only comparison was never exercised';
  end if;
  raise notice '3: % record×seat answers are at a rung above the Table''s (the named share), compared on key shape only', v_n;
  select count(*) into v_n from byid_out where tag = 'new' and door = 'read_record by id';
  raise notice '3 PASS — % record×seat answers by id: custom.read_record and custom.read_records_by_ids answer the page door''s document, every declared key an id', v_n;
end $c$;
select 'storereadperf2_byid_green: every clause green' as verdict;
rollback;
