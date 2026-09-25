-- LANE VIEW-KEYS-SHEET — "THIS TABLE OPENS AS THE SHEET" IS ONE THING: `layout: "sheet"` ON THE
-- TABLE'S DEFAULT VIEW, A LAYOUT THE VIEW-KEYS REGISTRY DECLARES; AND A TABLE HAS ONE DEFAULT VIEW.
--
-- THE USE CASE. Rincon Plumbing Co's office manager opens her copied "Service Calls" table and must
-- see the Sheet (owner, 2026-09-24: "predetermined with a default view of 'Sheet'"). The dispatcher
-- then sorts it by the promised date; it must still be the Sheet and still the default. Every name
-- in this suite is synthesized; the fixture is rolled back.
--
-- CLAUSES
--   K1  custom.view_keys() declares "sheet" among the layouts (the registry is the one list).
--   K2  the owner (admin@admin.com) saves the default view with layout "sheet" through
--       custom.view_declare and it is stored so (RED on S1-PRIME's body: refused as "none of them").
--   K3  the dispatcher (test@test.com) presses a sort on it; layout "sheet", the name and the
--       default are kept (the merge).
--   K4  a word that is not a layout ("spreadsheet") is still refused by name.
--   K5  on THIS database, no live copy's default view says the Sheet only by the mover's mark
--       (moved_from.kind = default_view with no layout) — the one representation holds.
--   K6  on THIS database, no table has two live default views where one came from the view bar's
--       older store (moved_from.store = records_ui_view).
--
-- RUN IT (the dev clone):  psql <clone> -v ON_ERROR_STOP=1 -f scripts/campaign-tests/viewkeyssheet_green.sql

\set ON_ERROR_STOP on
\timing off
\set suite 'viewkeyssheet_green.sql'
\set requires 'function:custom.view_declare|function:custom.view_keys|function:custom.table_declare|function:custom.field_declare'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local lock_timeout = '10s';
set local statement_timeout = '120s';

create temp table vk (k text primary key, v uuid) on commit drop;
grant select, insert on vk to authenticated;

do $fixture$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_disp    constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';   -- test@test.com
  v_org uuid := gen_random_uuid();
  v_home uuid; v_calls uuid;
begin
  perform set_config('app.actor_system', 'campaign-test/viewkeyssheet', true);
  perform set_config('request.jwt.claims', '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}', true);
  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'Rincon Plumbing Co ' || substr(v_org::text, 1, 8),
          'rincon-plumbing-co-' || substr(v_org::text, 1, 8), 'RPC', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_org, 'organization', v_org, c_admin, 'owner',  'active'),
    (v_org, 'organization', v_org, c_disp,  'member', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note) values
    ('custom', 'system_enabled',       'organization', v_org, v_org, 'true'::jsonb,     'viewkeyssheet fixture'),
    ('custom', 'member_default_level', 'organization', v_org, v_org, '"editor"'::jsonb, 'viewkeyssheet fixture: the dispatcher edits calls');
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
  insert into vk values ('org', v_org), ('calls', v_calls);
end
$fixture$;

do $k2k3k4$
declare
  v_org uuid; v_calls uuid; v_view uuid; v_name text; v_def jsonb;
begin
  select v into v_org from vk where k = 'org'; select v into v_calls from vk where k = 'calls';
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}', true);
  begin
    v_view := custom.view_declare(v_org, v_calls, jsonb_build_object('name', 'All records',
      'definition', jsonb_build_object('layout', 'sheet', 'is_default', true)));
  exception when others then
    raise exception 'K2 RED: the store refuses layout "sheet" on the default view: %', sqlerrm;
  end;
  select definition into v_def from platform.saved_view where id = v_view;
  if v_def ->> 'layout' is distinct from 'sheet' then
    raise exception 'K2 RED: layout "sheet" was not stored: %', v_def;
  end if;
  raise notice 'K2 GREEN: the owner designated the Sheet with layout "sheet"';

  perform set_config('request.jwt.claims', '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}', true);
  perform custom.view_declare(v_org, v_calls, jsonb_build_object('view_id', v_view,
    'definition', jsonb_build_object('sorts', jsonb_build_array(jsonb_build_object('field', 'promised_on', 'direction', 'asc')))));
  select name, definition into v_name, v_def from platform.saved_view where id = v_view;
  if v_name <> 'All records' or v_def ->> 'layout' <> 'sheet' or v_def -> 'is_default' <> 'true'::jsonb
     or v_def -> 'sorts' -> 0 ->> 'field' <> 'promised_on' then
    raise exception 'K3 RED: the dispatcher''s sort did not keep the Sheet default: name %, definition %', v_name, v_def;
  end if;
  raise notice 'K3 GREEN: a sort press kept layout "sheet", the name and the default';

  begin
    perform custom.view_declare(v_org, v_calls, jsonb_build_object('view_id', v_view,
      'definition', jsonb_build_object('layout', 'spreadsheet')));
    raise exception 'K4 RED: layout "spreadsheet" was accepted';
  exception when sqlstate '22023' then
    if sqlerrm not like '%spreadsheet%' then raise exception 'K4 RED: refused without naming the word: %', sqlerrm; end if;
    raise notice 'K4 GREEN: refused — %', sqlerrm;
  end;
  perform set_config('role', 'postgres', true);
end $k2k3k4$;

do $k1$ begin
  if not exists (select 1 from custom.view_keys() k where k.path = 'layout' and k.sentence ilike '%sheet%') then
    raise exception 'K1: custom.view_keys() does not name "sheet" among the layouts';
  end if;
  raise notice 'K1 GREEN: the registry names the Sheet among the layouts';
end $k1$;

do $k5$
declare v_n integer;
begin
  select count(*) into v_n from platform.saved_view v
   where v.surface_key = 'custom/records' and v.deleted_at is null
     and v.definition -> 'moved_from' ->> 'kind' = 'default_view' and not (v.definition ? 'layout');
  if v_n > 0 then
    raise exception 'K5 RED: % copied default view(s) say the Sheet only by the mover''s mark, not layout "sheet"', v_n;
  end if;
  raise notice 'K5 GREEN: every copied default view names layout "sheet"';
end $k5$;

do $k6$
declare v_n integer; v_eg text;
begin
  with d as (
    select v.subject_id, v.id, v.definition -> 'moved_from' ->> 'store' as store
      from platform.saved_view v
     where v.surface_key = 'custom/records' and v.deleted_at is null
       and (v.is_default or v.definition -> 'is_default' = 'true'::jsonb
            or v.definition -> 'moved_from' ->> 'kind' = 'default_view')
  ), t as (
    select subject_id from d group by subject_id
    having count(*) > 1 and bool_or(store = 'records_ui_view')
  )
  select count(*), min(subject_id::text) into v_n, v_eg from t;
  if v_n > 0 then
    raise exception 'K6 RED: % table(s) have two live default views, one moved in from the view bar''s older store (e.g. %)', v_n, v_eg;
  end if;
  raise notice 'K6 GREEN: no table has a second default view from the older store';
end $k6$;

rollback;
\echo 'viewkeyssheet_green.sql: GREEN (K1–K6); rolled back, nothing kept.'
