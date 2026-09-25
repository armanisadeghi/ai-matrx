-- STORE-READ-PERF-2 — THE GREEN SUITE (lane STORE-READ-PERF-2, 2026-09-25).
--
-- What it proves, in the order it proves it:
--   0  the seat is real, and the fixture holds what the proof needs: the crew lead holds TWO rungs
--      on records of ONE Table (Rooms shared to her at viewer, the Kitchen shared to her BY NAME at
--      editor — a record the rung-once-per-class shortcut must ask on its own) and belongs to two
--      organizations (member of the contractor's, owner of her own).
--   1  IDENTICAL OUTPUT. Every door the file touches is dumped — for admin@admin.com and for the
--      crew lead — with the bodies production holds today, then with the campaign file's bodies
--      (\i'd here), in one transaction over the same rows, and every (seat, door, arguments) answer
--      must be byte-identical (md5 of its text). Doors: read_record (by key and by id), read_records
--      (both keys; the export path), export_records, read_records_matching (no filter, a visible
--      filter, a hidden filter), read_records_by_ids (both keys), read_records_archived,
--      record_values_versioned, record_history, record_as_of, computed_provenance, enrich_cells,
--      resolve_context, record_card. Plus live clone data: AI Matrx -> Feature (17 scopes), the
--      September service board (200 rows: the matching page, by_ids by key and by id, read_records,
--      export_records), a Table with two Fields under one key, and every live Table that declares a
--      READ-TIME formula/lookup/rollup and every record that keeps a whole value in a file (set
--      doors, the read door and resolve_context, both seats).
--   2  THE ORACLES, record by record, in ONE statement: custom.levels_of equals
--      custom.effective_level and custom.has_visibility(viewer) for every fixture and live record
--      and three seats; custom.record_values_step (the plan carried across Tables, organizations
--      and record types) equals custom.record_values_of; custom.choice_render_with with the plan
--      equals the pre-lane custom.choice_render; the new custom.with_whole_value_pointers equals
--      the pre-lane body.
--   3  THE NAMED RECORD IS ASKED ON ITS OWN: in one custom.levels_of call over all four Rooms the
--      Kitchen answers editor and the Primary bath viewer.
--
-- PLANTS (the guard must be seen failing; measured 2026-09-25 on the clone). `-v plant=class` —
-- custom.levels_of forgets that a grant NAMES a record, so the Kitchen is answered by its class —
-- goes red at clause 1. `-v plant=values` — custom.record_values_step drops the read-time Fields
-- from its plan — goes red at clause 1. With no plant every clause is green.
--
-- THE USE CASE (owner law, 2026-09-21: no fake test data): READ-MASK-ONCE's renovation general
-- contractor's job book, reused — Rooms carry a confidential Budget and a restricted Client phone;
-- the crew lead is shared the Rooms Table at viewer and the Kitchen by name at editor; she owns her
-- own small tiling business.
--
-- Run (from matrx-frontend): psql -f scripts/campaign-tests/storereadperf2_green.sql   (dev clone)
\set ON_ERROR_STOP on
\set suite 'storereadperf2_green.sql'
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

-- ══ THE PRE-LANE HELPERS, AS ORACLES ════════════════════════════════════════════════════════
create function pg_temp.old_choice_render(p_organization_id uuid, p_table_id uuid, p_doc jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_map   jsonb;
  v_out   jsonb;
  v_notes jsonb := '{}'::jsonb;
  v_note  jsonb;
  v_at    text;
  e       record;
begin
  if p_doc is null or jsonb_typeof(p_doc) <> 'object' or p_table_id is null then
    return p_doc;
  end if;
  -- SC-R / P12: an entity reference is rendered here too — {token, id} gains the thing's own
  -- label — because this is the one step every read door takes after masking (read_record,
  -- read_records*, value_read, record_aggregate, query_across_homes, query_by_coordinates).
  p_doc := pg_temp.old_entity_reference_render(p_organization_id, p_table_id, p_doc);
  v_map := custom.choice_field_map(p_organization_id, p_table_id);
  if v_map = '{}'::jsonb then
    return p_doc;                       -- no list Field on this Table: nothing to say.
  end if;

  v_out := p_doc;
  for e in select key as k, value as v from jsonb_each(v_map) loop
    -- THE COLUMN, UNDER WHICHEVER NAME THIS DOCUMENT USES. `custom.mask_document` re-keys the
    -- whole document by field id when the caller asks for it, and every list surface does.
    v_at := case when p_doc ? e.k then e.k
                 when p_doc ? (e.v ->> 'field_id') then e.v ->> 'field_id'
            end;
    if v_at is null then
      continue;
    end if;
    v_note := custom.choice_render_note(e.v, p_doc -> v_at);
    if v_note is null then
      continue;                         -- a notice, or a token that names no choice: untouched.
    end if;
    v_out   := v_out   || jsonb_build_object(v_at, custom.choice_render_value(e.v, p_doc -> v_at));
    v_notes := v_notes || jsonb_build_object(v_at, v_note);
  end loop;

  if v_notes <> '{}'::jsonb then
    v_out := v_out || jsonb_build_object('_choices', v_notes);
  end if;
  return v_out;
end;
$function$
;

create function pg_temp.old_entity_reference_render(p_organization_id uuid, p_table_id uuid, p_doc jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_fields jsonb;
  v_out    jsonb;
  v_at     text;
  v_val    jsonb;
  v_items  jsonb;
  e        record;
begin
  if p_doc is null or jsonb_typeof(p_doc) <> 'object' or p_table_id is null then
    return p_doc;
  end if;
  v_fields := custom.entity_reference_fields(p_organization_id, p_table_id);
  if v_fields = '{}'::jsonb then
    return p_doc;
  end if;
  v_out := p_doc;
  for e in select key as k, value as v from jsonb_each(v_fields) loop
    v_at := case when p_doc ? e.k then e.k
                 when p_doc ? (e.v ->> 'field_id') then e.v ->> 'field_id' end;
    if v_at is null then
      continue;
    end if;
    v_val := p_doc -> v_at;
    if jsonb_typeof(v_val) not in ('array', 'object')
       or (jsonb_typeof(v_val) = 'object' and not (v_val ? 'token' and v_val ? 'id')) then
      continue;   -- a masking notice, or something the validator would refuse: untouched
    end if;
    select coalesce(jsonb_agg(
             case when jsonb_typeof(x) = 'object' and x ? 'token' and x ? 'id'
                       and (x ->> 'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                  then jsonb_build_object(
                         'token', x ->> 'token',
                         'id',    x ->> 'id',
                         'label', platform.relation_label(p_organization_id, x ->> 'token', (x ->> 'id')::uuid))
                  else x end order by o), '[]'::jsonb)
      into v_items
      from jsonb_array_elements(case when jsonb_typeof(v_val) = 'array' then v_val
                                     else jsonb_build_array(v_val) end) with ordinality as a(x, o);
    v_out := v_out || jsonb_build_object(v_at,
               case when jsonb_typeof(v_val) = 'array' then v_items else v_items -> 0 end);
  end loop;
  return v_out;
end
$function$
;

create function pg_temp.old_wvp(p_document jsonb, p_values jsonb, p_sources jsonb, p_visible text[], p_by_id boolean DEFAULT false, p_key_ids jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
  with p as (
    select case when p_by_id then coalesce(p_key_ids ->> e.key, e.key) else e.key end as k,
           e.value ->> 'src' as ptr,
           custom.whole_value_pointer_of(p_values, p_sources, e.key) as pointer
      from jsonb_each(case when jsonb_typeof(p_values) = 'object' then p_values else '{}'::jsonb end) e
     where e.key = any (coalesce(p_visible, '{}'::text[]))
  ), w as (
    select jsonb_object_agg(k, jsonb_build_object('src', ptr)) as vals,
           jsonb_object_agg(ptr, pointer) as srcs
      from p where pointer is not null
  )
  select case
           when w.vals is null then p_document
           else p_document || jsonb_build_object(
             '_values', coalesce(p_document -> '_values', '{}'::jsonb) || w.vals,
             -- a pointer merges INTO an entry the door already carries (GRID-TAILS' unresolved half)
             '_sources', coalesce(p_document -> '_sources', '{}'::jsonb) || (
               select jsonb_object_agg(s.key, coalesce(p_document -> '_sources' -> s.key, '{}'::jsonb) || s.value)
                 from jsonb_each(w.srcs) s))
         end
    from w;
$function$
;

-- ══ THE DUMP: every reader, every seat, into rmo_out under a tag ════════════════════════════
create function pg_temp.rmo_dump(p_tag text) returns int language plpgsql as $dump$
declare
  c_seats constant jsonb := jsonb_build_object(
    'admin', '87a6e699-3622-4869-8843-d0867456c0dd',
    'member', '4060701e-706a-4c76-b3ca-0bbc69fa5a14');
  v_boss text := current_user;
  v_seat text; v_uid uuid; v_out jsonb := '[]'::jsonb;
  v_org uuid; v_org2 uuid; v_rooms uuid; v_rooms2 uuid; v_quotes uuid;
  t record; r record; v_board uuid[]; v_ids uuid[]; v_all uuid[]; v_recs jsonb; v_tids jsonb; v_feat uuid[]; v_dup uuid[];
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
select 'dumped (old bodies)', pg_temp.rmo_dump('old');
\i migrations/campaign/storereadperf2_the_rung_is_asked_once_per_class.sql

select :'plant' = 'class' as plant_class, :'plant' = 'values' as plant_values \gset
\if :plant_class
-- PLANT: a record NAMED by a grant is answered by its class.
select set_config('srp.plant', 'class', true);
create or replace function custom.levels_of(p_user_id uuid, p_ids uuid[])
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
-- STORE-READ-PERF-2 (2026-09-25). THE RUNG, ONCE PER CLASS, FOR A SET OF RECORDS.
--
-- Answers, for each id, exactly what the one ladder answers about it for this person:
--   l = custom.effective_level(p_user_id, <its organization>, id)   (the rung the mask needs)
--   s = custom.has_visibility(p_user_id, 'record', id, 'viewer')   (the read door's own check)
-- as {"<id>": {"l": <level or null>, "s": <bool>}}.
--
-- WHY IT MAY ASK ONCE PER CLASS. Every input the ladder reads about ONE record is either a
-- column of that record — its organization, its Table, its `visibility`, whether it is live,
-- whether this person created it (`iam.owner_of` reads `created_by`) — or a row somewhere else
-- that NAMES that record by id: a grant (`iam.permissions`), a membership held on it
-- (`iam.memberships`, record or scope), a library grant (`platform.entity_grants`), a closure
-- row (`platform.reachability`), a carrying edge (`custom.carrying_edges_of` arms 1a/1b/2a/2b/4
-- — every arm but the Table the record lives in), or an assignment to a scope
-- (`public._edu_can_read_via_assignment`). Everything else the ladder reads — the organization's
-- lanes and knobs, the Table's own grants and carrying, whether this person is an admin, owns a
-- record in the organization, or holds any grant anywhere — is the same for every record that
-- shares those columns. So two records with the same columns and NO row naming either of them
-- get the same answer at every rung, and the ladder is asked once for the class.
--
-- A record that is NAMED by any such row, a row of the kernel Table (arm 4 of has_visibility
-- reads the Table's contents), a record with no Table, an id that is not a record, and every
-- record while `record` has a registered FK containment parent (custom.visible_set's first stop)
-- is asked on its own, exactly as before. The class memo lives in this one call and nowhere
-- else, so it can never outlive the snapshot it was answered in.
declare
  v_out    jsonb := '{}'::jsonb;
  v_memo   jsonb := '{}'::jsonb;
  v_fk     boolean;
  v_kernel uuid := custom.table_kernel_id();
  v_key    text;
  v_l      public.permission_level;
  v_s      boolean;
  r        record;
begin
  if p_user_id is null or p_ids is null or cardinality(p_ids) = 0 then
    return v_out;
  end if;

  v_fk := exists (select 1 from platform.entity_relationships er
                   where er.child_type = 'record' and er.kind in ('composition', 'containment'));

  for r in
    select u.id, x.organization_id, x.table_id, x.visibility, x.deleted_at is null as live,
           x.created_by is not distinct from p_user_id as own, x.id is not null as found,
           ( exists (select 1 from iam.permissions p
                      where p.resource_type = 'record' and p.resource_id = u.id)
          or exists (select 1 from iam.memberships m
                      where m.container_type in ('record', 'scope') and m.container_id = u.id)
          or exists (select 1 from platform.entity_grants g
                      where g.entity_type = 'record' and g.entity_id = u.id)
          or exists (select 1 from platform.reachability rr
                      where rr.item_type = 'record' and rr.item_id = u.id)
          or exists (select 1 from platform.associations a
                      where a.deleted_at is null and a.target_type = 'record' and a.target_id = u.id)
          or exists (select 1 from platform.associations a
                      where a.deleted_at is null and a.source_type = 'record' and a.source_id = u.id
                        and ( a.target_type = 'scope'
                           or a.relation_field_id is not null and exists (
                                select 1 from custom.portal_table pt where pt.names_via_field_id = a.relation_field_id)
                           or exists (select 1 from platform.association_types t
                                       where t.source_type = a.source_type and t.target_type = a.target_type
                                         and (t.label is null or t.label = a.label)
                                         and t.is_active and t.container_side = 'target')
                           or exists (select 1 from custom.carrying_rule cr
                                       where cr.role = a.role and cr.is_active and cr.container_side = 'target'))) ) as named
      from (select distinct unnest(p_ids) as id) u
      left join custom.record x on x.id = u.id
     where u.id is not null
  loop
    if not r.found or v_fk or r.table_id is null or r.table_id = v_kernel then
      v_key := null;
    else
      v_key := r.organization_id::text || ':' || r.table_id::text || ':' || r.visibility::text || ':'
            || r.live::text || ':' || r.own::text;
    end if;

    if v_key is not null and v_memo ? v_key then
      v_out := v_out || jsonb_build_object(r.id::text, v_memo -> v_key);
      continue;
    end if;

    v_l := custom.effective_level(p_user_id, r.organization_id, r.id);
    v_s := custom.has_visibility(p_user_id, 'record', r.id, 'viewer'::public.permission_level);
    v_out := v_out || jsonb_build_object(r.id::text, jsonb_build_object('l', v_l, 's', v_s));
    if v_key is not null then
      v_memo := v_memo || jsonb_build_object(v_key, jsonb_build_object('l', v_l, 's', v_s));
    end if;
  end loop;
  return v_out;
end;
$function$;
\endif
\if :plant_values
-- PLANT: the value plan forgets the read-time Fields.
select set_config('srp.plant', 'values', true);
create or replace function custom.record_values_step(p_row custom.record, p_cache jsonb default '{}'::jsonb,
                                          out o_doc jsonb, out o_cache jsonb)
language plpgsql
stable
set search_path to 'pg_catalog'
as $function$
declare
  v_base  jsonb;
  v_out   jsonb;
  v_plain jsonb;
  v_tf    text;
  v_rtype text;
  v_tk    text;
  v_pk    text;
  v_plan  jsonb;
  f       jsonb;
begin
  o_cache := coalesce(p_cache, '{}'::jsonb);
  v_base := (p_row.data - '_computed' - '_retired' - '_values' - '_sources' - '_derived')
            || custom.computed_block(p_row.data -> '_computed');

  -- custom.derived_values_of's own first line, exactly.
  if p_row.id is null or p_row.table_id is null
     or p_row.data_class in ('kernel', 'relation') then
    o_doc := v_base || '{}'::jsonb;
    return;
  end if;

  v_out := custom.computed_block(p_row.data -> '_derived');
  v_plain := v_base || v_out;

  v_tk := 'tf:' || coalesce(p_row.organization_id::text, '-') || ':' || p_row.table_id::text;
  if not (o_cache ? v_tk) then
    o_cache := o_cache || jsonb_build_object(v_tk,
                 to_jsonb(custom.table_type_field(p_row.organization_id, p_row.table_id)));
  end if;
  v_tf := o_cache ->> v_tk;
  if v_tf is not null then
    v_rtype := p_row.data ->> v_tf;
  end if;

  v_pk := 'af:' || coalesce(p_row.organization_id::text, '-') || ':' || p_row.table_id::text || ':'
       || case when v_rtype is null then 'n' else 'v:' || v_rtype end;
  if not (o_cache ? v_pk) then
    select coalesce(jsonb_agg(a.data order by a.ordinality), '[]'::jsonb) into v_plan
      from custom.applicable_fields(p_row.organization_id, p_row.table_id, v_rtype) with ordinality as a
     where custom.parity_type(a.data) in ('lookup', 'rollup', 'formula')
       and coalesce(a.data ->> 'compute_on', '') = 'read';
    o_cache := o_cache || jsonb_build_object(v_pk, v_plan);
  end if;

  for f in select e from jsonb_array_elements('[]'::jsonb) e loop
    v_out := v_out || jsonb_build_object(f ->> 'key',
                        custom.derived_value(p_row.organization_id, p_row.id, f, v_plain));
  end loop;
  o_doc := v_base || coalesce(v_out, '{}'::jsonb);
end;
$function$;
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

-- ══ 0, 2, 3. THE SEAT, THE ORACLES AND THE NAMED RECORD — in ONE statement ═══════════════════
do $t$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  c_dana    constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';
  v_org uuid; v_org2 uuid; v_rooms uuid; v_ids uuid[]; v_map jsonb; v_u uuid; r record;
  v_cache jsonb := '{}'::jsonb; v_vs record; v_n int := 0; v_nl int := 0; v_nc int := 0; v_nw int := 0;
  v_third uuid; v_plan jsonb; v_doc jsonb; v_row custom.record;
begin
  select v into v_org from rmo where k = 'org';   select v into v_org2 from rmo where k = 'org2';
  select v into v_rooms from rmo where k = 'rooms';

  -- 0. the seat takes, and the fixture holds two rungs on one Table
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception '0: this suite did not take the seat — current_user is %', current_user;
  end if;
  perform set_config('role', 'postgres', true);
  if custom.effective_level(c_dana, v_org, (select v from rmo where k = 'Kitchen'))
     is not distinct from custom.effective_level(c_dana, v_org, (select v from rmo where k = 'Primary bath')) then
    raise exception '0: the fixture gave the crew lead ONE rung on Rooms — the proof needs two';
  end if;
  raise notice '0 PASS — seated; the crew lead holds two rungs on Rooms and belongs to two organizations';

  -- the records: the fixture, AI Matrx -> Feature, the service board page, the live sample
  select array_agg(distinct x.id) into v_ids from custom.record x
   where x.id in (select v from rmo where k in ('Kitchen', 'Primary bath', 'Garage', 'Mudroom', 'q_voltway', 'q_harbor', 'b_hall', 'b_backsplash'))
      or x.table_id in ('36c07712-b0f2-43f2-a1c8-712ae4a75739'::uuid, '6dddb7c1-82e4-4b78-b1e1-dc1a3c5a7789'::uuid)
      or x.id in (select unnest(ids) from srp_live)
      or x.id in (select s.id from (select y.id from custom.record y where y.table_id = '3260bbbe-aaa8-4148-a4d9-7ad880e7976d'
                                     and y.organization_id = '57f2a22b-5875-46c6-80df-437076421c28' and y.deleted_at is null
                                   order by y.created_at desc, y.id limit 200) s);
  -- a third seat: somebody a record is shared with by name on this database
  select p.granted_to_user_id into v_third from iam.permissions p
   where p.resource_type = 'record' and p.granted_to_user_id is not null
     and p.granted_to_user_id not in (c_admin, c_dana)
   order by p.created_at desc limit 1;

  -- 2a. the rung and the viewer answer, for the whole set in one call, against the ladder per record
  foreach v_u in array array_remove(array[c_admin, c_dana, v_third], null) loop
    v_map := custom.levels_of(v_u, v_ids);
    for r in select unnest(v_ids) as id loop
      if (v_map -> r.id::text ->> 'l') is distinct from custom.effective_level(v_u, null, r.id)::text
         or (v_map -> r.id::text ->> 's')::boolean is distinct from custom.has_visibility(v_u, 'record', r.id, 'viewer') then
        raise exception '2: custom.levels_of for record % (seat %) says % but the ladder says % / %', r.id, v_u,
          v_map -> r.id::text, custom.effective_level(v_u, null, r.id), custom.has_visibility(v_u, 'record', r.id, 'viewer');
      end if;
      v_nl := v_nl + 1;
    end loop;
  end loop;

  -- 2b. the values, the plan carried across every Table, organization and record type at once
  for v_row in select x.* from custom.record x where x.id = any (v_ids) order by md5(x.id::text) loop
    select * into v_vs from custom.record_values_step(v_row, v_cache);
    v_cache := v_vs.o_cache;
    if v_vs.o_doc is distinct from custom.record_values_of(v_row) then
      raise exception '2: custom.record_values_step for record % differs from custom.record_values_of:% step: % % of: %',
        v_row.id, chr(10), left(v_vs.o_doc::text, 400), chr(10), left(custom.record_values_of(v_row)::text, 400);
    end if;
    -- 2c. the choice words and entity labels, with the plan, against the pre-lane body
    v_plan := custom.choice_render_plan(v_row.organization_id, v_row.table_id);
    v_doc := v_vs.o_doc;
    if custom.choice_render_with(v_row.organization_id, v_row.table_id, v_doc, v_plan)
       is distinct from pg_temp.old_choice_render(v_row.organization_id, v_row.table_id, v_doc) then
      raise exception '2: custom.choice_render_with for record % differs from the pre-lane custom.choice_render', v_row.id;
    end if;
    -- 2d. the whole-value pointers, both keys, against the pre-lane body
    if custom.with_whole_value_pointers(v_doc, v_row.data -> '_values', v_row.data -> '_sources', array(select jsonb_object_keys(v_doc)), false, '{}'::jsonb)
       is distinct from pg_temp.old_wvp(v_doc, v_row.data -> '_values', v_row.data -> '_sources', array(select jsonb_object_keys(v_doc)), false, '{}'::jsonb)
       or custom.with_whole_value_pointers(v_doc, v_row.data -> '_values', v_row.data -> '_sources', array(select jsonb_object_keys(v_doc)), true, jsonb_build_object('title', 'f-title'))
       is distinct from pg_temp.old_wvp(v_doc, v_row.data -> '_values', v_row.data -> '_sources', array(select jsonb_object_keys(v_doc)), true, jsonb_build_object('title', 'f-title')) then
      raise exception '2: custom.with_whole_value_pointers for record % differs from the pre-lane body', v_row.id;
    end if;
    if v_row.data -> '_sources' @? '$.* ? (@.kind == "whole_value_in_file")' then v_nw := v_nw + 1; end if;
    v_n := v_n + 1;
  end loop;
  select count(*) into v_nc from jsonb_object_keys(v_cache) k where k like 'af:%';
  if v_nw = 0 then
    raise notice '2: no record on this database keeps a whole value in a file, so 2d compared only the untouched answer';
  end if;
  raise notice '2 PASS — levels_of equals the ladder on % record×seat pairs; record_values_step, choice_render_with and with_whole_value_pointers equal the pre-lane answers on % records (% value plans, % records with a whole value in a file), one statement',
    v_nl, v_n, v_nc, v_nw;

  -- 3. the named record is asked on its own: one call, four Rooms, two rungs
  v_map := custom.levels_of(c_dana, array(select v from rmo where k in ('Kitchen', 'Primary bath', 'Garage', 'Mudroom')));
  if v_map -> (select v from rmo where k = 'Kitchen')::text ->> 'l' is not distinct from
     v_map -> (select v from rmo where k = 'Primary bath')::text ->> 'l' then
    raise exception '3: one custom.levels_of call answered the Kitchen (shared to her by name) with the Primary bath''s rung: %', v_map;
  end if;
  raise notice '3 PASS — one call over four Rooms: the Kitchen answers %, the Primary bath %',
    v_map -> (select v from rmo where k = 'Kitchen')::text ->> 'l', v_map -> (select v from rmo where k = 'Primary bath')::text ->> 'l';
end $t$;

select case when current_setting('srp.plant', true) in ('class', 'values')
            then 'PLANT ' || current_setting('srp.plant', true) || ' WAS NOT CAUGHT — the suite is not a guard'
            else 'storereadperf2_green: every clause green' end as verdict;
rollback;
