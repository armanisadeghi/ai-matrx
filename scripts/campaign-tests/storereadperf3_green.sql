-- STORE-READ-PERF-3 — THE GREEN SUITE (lane STORE-READ-PERF-3, 2026-09-25).
--
-- What it proves, in the order it proves it:
--   1  IDENTICAL OUTPUT. The doors the file re-bodies — custom.resolve_context and
--      custom.context_resolve(jsonb) — are dumped for admin@admin.com and for the crew lead (a member
--      of the contractor's organization with a Table shared at viewer and one record shared BY NAME at
--      editor, and the owner of her own tiling business), first with the bodies that were live before
--      the file (the inverse, \i'd, when the up is already live), then with the campaign file's
--      (\i'd), in one transaction over the same rows; every (seat, door, arguments) answer must be
--      byte-identical. Candidates: the fixture's records of two organizations at three rungs, an
--      archived one, a Table id, a Field id, a record with no Table, a record id nobody holds, one
--      live id of every OTHER kind custom.where_id_opens knows (a merged id, a form, a booking page,
--      a portal, a rendered document, a dashboard, a digest rule — each asked through the single
--      door), the active-Tables argument, and live data: AI Matrx -> Feature (17 scopes) and the
--      READ-MASK/STORE-READ-PERF-2 live sample of read-time-derived Tables.
--   2  THE ORACLE, id by id, in ONE statement: custom._where_ids_open_with(ids) — and with the
--      levels custom.levels_of answered for the same person handed in — equals
--      custom.where_id_opens(id) for every id of the whole candidate set, for three seats (admin, the
--      crew lead, and somebody a record is shared with by name on this database), plus 400 live ids
--      drawn from every organization.
--
-- PLANT (the guard must be seen failing): `-v plant=viewer` — the set arm forgets the ladder's
-- viewer answer and admits every row of an organization the person may reach — goes red at
-- clause 1 and clause 2. With no plant every clause is green.
--
-- THE USE CASE (owner law, 2026-09-21: no fake test data): STORE-READ-PERF-2's renovation general
-- contractor's job book, reused verbatim — Rooms carry a confidential Budget and a restricted Client
-- phone; the crew lead is shared the Rooms Table at viewer and the Kitchen by name at editor; she owns
-- her own small tiling business. An agent working a conversation tagged with those rooms is handed
-- their context.
--
-- Run (from matrx-frontend): psql -f scripts/campaign-tests/storereadperf3_green.sql   (dev clone)
\set ON_ERROR_STOP on
\set suite 'storereadperf3_green.sql'
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
  perform set_config('app.actor_system', 'campaign-test/storereadperf3', true);

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
    ('custom', 'system_enabled',            'organization', v_org,  v_org,  'true'::jsonb, 'storereadperf3 fixture'),
    ('custom', 'member_default_visibility', 'organization', v_org,  v_org,  '"shared_only"'::jsonb, 'storereadperf3 fixture: the crew lead sees what she is shared'),
    ('custom', 'system_enabled',            'organization', v_org2, v_org2, 'true'::jsonb, 'storereadperf3 fixture');

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

-- ══ ONE LIVE ID OF EVERY OTHER KIND custom.where_id_opens KNOWS ═════════════════════════════
create temp table srp3_kinds (kind text, id uuid) on commit drop;
insert into srp3_kinds
select 'merged', (select a.old_id from custom.record_alias a where a.revoked_at is null order by a.old_id limit 1)
union all select 'form', (select f.id from custom.anon_form f where not coalesce(f.presentation ? 'booking', false) order by f.id limit 1)
union all select 'booking', (select f.id from custom.anon_form f where coalesce(f.presentation ? 'booking', false) order by f.id limit 1)
union all select 'portal', (select p.id from custom.portal p order by p.id limit 1)
union all select 'rendered_document', (select d.id from custom.doc_render d order by d.id limit 1)
union all select 'dashboard', (select r.id from custom.record r where r.table_id = custom.presentation_kernel_id() and r.data_class = custom.dashboard_class() order by r.id limit 1)
union all select 'digest', (select r.id from custom.record r where r.data_class = 'rule' and r.data ? 'subscription' order by r.id limit 1)
union all select 'field', (select r.id from custom.record r where r.table_id = custom.field_kernel_id() and r.organization_id = (select v from rmo where k = 'org') order by r.id limit 1)
union all select 'no_table', (select r.id from custom.record r where r.table_id is null and r.organization_id = (select v from rmo where k = 'org') order by r.id limit 1)
union all select 'nobody', '00000000-0000-4000-8000-0000000fee01'::uuid;
grant select on srp3_kinds to authenticated;
select string_agg(kind || case when id is null then ' (none on this database)' else '' end, ', ' order by kind) as other_kinds from srp3_kinds;

create function pg_temp.rmo_try(p_sql text) returns text language plpgsql as $$
declare v text;
begin
  execute p_sql into v;
  return v;
exception when others then
  return 'REFUSED ' || sqlstate || ' ' || sqlerrm;
end $$;
grant execute on function pg_temp.rmo_try(text) to authenticated;

-- ══ THE DUMP: the two re-bodied doors, every seat, into rmo_out under a tag ═══════════════════
create function pg_temp.rmo_dump(p_tag text) returns int language plpgsql as $dump$
declare
  c_seats constant jsonb := jsonb_build_object(
    'admin', '87a6e699-3622-4869-8843-d0867456c0dd',
    'member', '4060701e-706a-4c76-b3ca-0bbc69fa5a14');
  c_feature constant uuid := '36c07712-b0f2-43f2-a1c8-712ae4a75739';
  c_ctx constant uuid := '00000000-0000-4000-8000-00000000c0de';
  v_boss text := current_user;
  v_seat text; v_uid uuid; v_out jsonb := '[]'::jsonb; t record;
  v_all uuid[]; v_kinds uuid[]; v_feat uuid[]; v_tables uuid[]; v_bind jsonb; v_n int;
begin
  select array_agg(v order by k) into v_all from rmo
   where k in ('Kitchen', 'Primary bath', 'Garage', 'Mudroom', 'q_voltway', 'q_harbor', 'b_hall', 'b_backsplash');
  select array_agg(id order by kind) into v_kinds from srp3_kinds where id is not null;
  select array_agg(x.id order by x.created_at) into v_feat from custom.record x where x.table_id = c_feature and x.deleted_at is null;
  v_tables := array[(select v from rmo where k = 'rooms'), (select v from rmo where k = 'quotes'), (select v from rmo where k = 'rooms2'),
                    c_feature] || v_kinds;
  select jsonb_agg(jsonb_build_object('key', 'room', 'record_id', i, 'field_key', 'room_name')) into v_bind
    from unnest(v_all || v_kinds || v_feat) i;

  for v_seat in select * from jsonb_object_keys(c_seats) loop
    v_uid := (c_seats ->> v_seat)::uuid;
    perform set_config('request.jwt.claims', jsonb_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);
    v_out := v_out || jsonb_build_object('seat', v_seat, 'door', 'resolve_context', 'args', 'fixture',
      'body', pg_temp.rmo_try(format('select custom.resolve_context(%L, %L::uuid, %L::uuid[], null)::text', 'conversation', c_ctx, v_all)));
    v_out := v_out || jsonb_build_object('seat', v_seat, 'door', 'resolve_context', 'args', 'fixture + every other kind + active Tables',
      'body', pg_temp.rmo_try(format('select custom.resolve_context(%L, %L::uuid, %L::uuid[], %L::uuid[])::text', 'conversation', c_ctx, v_all || v_kinds || v_all, v_tables)));
    v_out := v_out || jsonb_build_object('seat', v_seat, 'door', 'resolve_context', 'args', 'active Tables only',
      'body', pg_temp.rmo_try(format('select custom.resolve_context(%L, %L::uuid, null, %L::uuid[])::text', 'conversation', c_ctx, v_tables)));
    v_out := v_out || jsonb_build_object('seat', v_seat, 'door', 'resolve_context', 'args', 'AI Matrx Feature 17',
      'body', pg_temp.rmo_try(format('select custom.resolve_context(%L, %L::uuid, %L::uuid[], null)::text', 'conversation', c_ctx, v_feat)));
    v_out := v_out || jsonb_build_object('seat', v_seat, 'door', 'context_resolve', 'args', 'fixture + every other kind + Feature 17',
      'body', pg_temp.rmo_try(format('select custom.context_resolve(%L::jsonb)::text', v_bind)));
    for t in select * from srp_live loop
      v_out := v_out || jsonb_build_object('seat', v_seat, 'door', 'resolve_context', 'args', 'live/' || t.tbl,
        'body', pg_temp.rmo_try(format('select custom.resolve_context(%L, %L::uuid, %L::uuid[], null)::text', 'conversation', c_ctx, t.ids)));
    end loop;
    perform set_config('role', v_boss, true);
  end loop;

  insert into rmo_out (tag, seat, door, args, digest, len, body)
  select p_tag, e ->> 'seat', e ->> 'door', e ->> 'args', md5(coalesce(e ->> 'body', '<null>')),
         length(coalesce(e ->> 'body', '')), e ->> 'body'
    from jsonb_array_elements(v_out) e;
  get diagnostics v_n = row_count;
  return v_n;
end $dump$;

-- ══ 1. IDENTICAL OUTPUT: the bodies live before the file, then the file's, same rows ════════════
select exists (select 1 from pg_proc where proname = '_where_ids_open_with'
                 and pronamespace = 'custom'::regnamespace) as up_is_live \gset
\if :up_is_live
\echo 'the up is live on this database: the inverse is \\i''d first, so "old" is the body the file replaced'
\i migrations/inverse/storereadperf3_where_ids_open_once_per_candidate_set_down.sql
\endif
select 'dumped (old bodies)', pg_temp.rmo_dump('old');
\i migrations/campaign/storereadperf3_where_ids_open_once_per_candidate_set.sql

select :'plant' = 'viewer' as plant_viewer \gset
\if :plant_viewer
-- PLANT: the set arm admits every row of an organization the person may reach.
select set_config('srp.plant', 'viewer', true);
do $plant$
declare v text := pg_get_functiondef('custom._where_ids_open_with(uuid[], uuid, jsonb)'::regprocedure);
begin
  if position('coalesce((v_levels -> r.key ->> ''s'')::boolean, false)' in v) = 0 then
    raise exception 'plant: the line it replaces is not in the body';
  end if;
  execute replace(v, 'coalesce((v_levels -> r.key ->> ''s'')::boolean, false)', 'true');
end $plant$;
\endif

select 'dumped (new bodies)', pg_temp.rmo_dump('new');

do $one$
declare v_old int; v_new int; v_n int; v_bad record;
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
  raise notice '1 PASS — % answers byte-identical before and after (% of them a refusal, identical too), across % doors, % admitted scope checks',
    v_old, v_n, (select count(distinct door) from rmo_out where tag = 'new'),
    (select count(*) from rmo_out o, jsonb_array_elements(case when o.body like '{%' then (o.body::jsonb -> 'checks') end) c
      where o.tag = 'new' and o.door = 'resolve_context' and (c ->> 'admitted')::boolean);
end $one$;

-- ══ 2. THE ORACLE: the set answer equals the single door, id by id, in ONE statement ═══════════
-- The set door is server_only (no client EXECUTE). To ask it FROM THE SEAT — so custom.caller_role
-- is the member's, exactly as inside custom.resolve_context — this rolled-back transaction lets the
-- seat call it for the length of the suite; nothing of it survives the rollback.
update platform.client_callable_door set signed_in_callers = true, non_client_lane = null
 where schema_name = 'custom' and function_name = '_where_ids_open_with';
grant execute on function custom._where_ids_open_with(uuid[], uuid, jsonb) to authenticated;
do $two$
declare
  c_admin constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  c_dana  constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';
  v_boss text := current_user;
  v_third uuid; v_u uuid; v_ids uuid[]; v_set jsonb; v_set2 jsonb; v_one jsonb; v_lv jsonb; r record;
  v_n int := 0; v_open int := 0; v_kinds jsonb := '{}'::jsonb;
begin
  select array_agg(distinct i) into v_ids from (
    select v as i from rmo
    union all select id from srp3_kinds where id is not null
    union all select x.id from custom.record x where x.table_id = '36c07712-b0f2-43f2-a1c8-712ae4a75739'
    union all select unnest(ids) from srp_live
    union all select s.id from (select y.id from custom.record y order by md5(y.id::text || 'srp3') limit 400) s) q
   where i is not null;
  select p.granted_to_user_id into v_third from iam.permissions p
   where p.resource_type = 'record' and p.granted_to_user_id is not null
     and p.granted_to_user_id not in (c_admin, c_dana)
   order by p.created_at desc limit 1;

  foreach v_u in array array_remove(array[c_admin, c_dana, v_third], null) loop
    perform set_config('request.jwt.claims', jsonb_build_object('sub', v_u, 'role', 'authenticated')::text, true);
    v_lv := custom.levels_of(v_u, v_ids);             -- server_only: asked as the store asks it
    perform set_config('role', 'authenticated', true);
    v_set := custom._where_ids_open_with(v_ids);
    v_set2 := custom._where_ids_open_with(v_ids, v_u, v_lv);
    for r in select unnest(v_ids) as id loop
      v_one := custom.where_id_opens(r.id);
      if (v_set -> r.id::text) is distinct from v_one or (v_set2 -> r.id::text) is distinct from v_one then
        perform set_config('role', v_boss, true);
        raise exception '2: for % (seat %) the set door says % / % (levels handed in) but custom.where_id_opens says %',
          r.id, v_u, v_set -> r.id::text, v_set2 -> r.id::text, v_one;
      end if;
      v_n := v_n + 1;
      if v_one is not null then
        v_open := v_open + 1;
        v_kinds := v_kinds || jsonb_build_object(v_one ->> 'kind', coalesce((v_kinds ->> (v_one ->> 'kind'))::int, 0) + 1);
      end if;
    end loop;
    perform set_config('role', v_boss, true);
  end loop;
  raise notice '2 PASS — the set door equals custom.where_id_opens on % id×seat pairs (% open: %), with and without the levels handed in, one statement',
    v_n, v_open, v_kinds;
end $two$;

select case when current_setting('srp.plant', true) = 'viewer'
            then 'PLANT viewer WAS NOT CAUGHT — the suite is not a guard'
            else 'storereadperf3_green: every clause green' end as verdict;
rollback;
