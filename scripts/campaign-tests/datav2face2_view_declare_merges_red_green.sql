-- LANE DATA-V2-FACE-2 — ONE PRESS ON A SAVED VIEW CHANGES ONE KEY, AND KEEPS THE VIEW'S NAME AND
-- ITS DEFAULT, measured GREEN then RED in ONE rolled-back transaction.
--
-- THE QUESTION (lane DATA-V2-FACE, 2026-09-24): on production a spec of {definition:{layout:…}}
-- with a view_id renamed admin's default "All records" view to "Saved view" and dropped its
-- is_default, and the page then seeded a second default. records-ui says the door "MERGES only the
-- keys this press changed" (TablePage.patchView, views.saveViewPatch). Which is right?
--
-- THE ANSWER THIS SUITE MEASURES. The door is MEANT to merge: lane S0 ONE-SAVED-VIEW's
-- oneview_a_saved_view_keeps_what_it_was_not_sent.sql (and S1-PRIME's body on top of it) merge, and
-- every records-ui caller is written for that door. Production still runs G7's body, which rebuilds
-- the whole definition and the name from what one press sent — so the store change is S0's file,
-- already in the 2026-09-25 window (row S1), not a new file and not a records-ui change.
--
-- THE USE CASE. Northgate Cycle Works (a two-bench bicycle repair shop in Portland) keeps Repair
-- tickets in the record store. Its default view "All records" is the grid. Priya at the counter
-- (test@test.com) presses Calendar on it — records-ui sends ONLY {layout, date_field}. The view must
-- still be called "All records" and still be the table's default. Every name and bike is synthesized.
--
-- GREEN on the database's current body (S0/S1' — the branch, the clone). RED is taken by putting
-- G7's body (production's today; S0's inverse, byte for byte) back INSIDE this transaction, which is
-- rolled back, so nothing is left behind.
--
-- RUN IT (the rehearsal branch):
--   psql "$SUPABASE_BRANCH_DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/datav2face2_view_declare_merges_red_green.sql

\set ON_ERROR_STOP on
\timing off
\set suite 'datav2face2_view_declare_merges_red_green.sql'
\set requires 'function:custom.view_declare|function:custom.views|function:custom.table_declare|function:custom.field_declare'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local lock_timeout = '10s';
set local statement_timeout = '120s';

create temp table dv (k text primary key, v uuid) on commit drop;
grant select, insert on dv to authenticated;

-- ── THE FIXTURE (asserts nothing) ─────────────────────────────────────────────────────────────
do $fixture$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_priya   constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';   -- test@test.com
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_org uuid := gen_random_uuid();
  v_home uuid; v_tickets uuid;
begin
  perform set_config('app.actor_system', 'campaign-test/datav2face2', true);
  perform set_config('request.jwt.claims', c_admin_j, true);
  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'Northgate Cycle Works ' || substr(v_org::text, 1, 8),
          'northgate-cycle-works-' || substr(v_org::text, 1, 8), 'NCW', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_org, 'organization', v_org, c_admin, 'owner',  'active'),
    (v_org, 'organization', v_org, c_priya, 'member', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note) values
    ('custom', 'system_enabled',       'organization', v_org, v_org, 'true'::jsonb,     'datav2face2 fixture'),
    ('custom', 'member_default_level', 'organization', v_org, v_org, '"editor"'::jsonb, 'datav2face2 fixture: the counter edits tickets');
  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name', 'Home')) returning id into v_home;
  v_tickets := custom.table_declare(v_org, jsonb_build_object(
    'name', 'Repair tickets', 'slug', 'repair_tickets', 'type', 'entity',
    'label_singular', 'Repair ticket', 'label_plural', 'Repair tickets',
    'title_field', 'bike', 'display', 'list', 'weight', 'light',
    'ordered', true, 'row_order', 'sorted', 'agent_writable', true, 'retention_days', 3650,
    'default_sort', jsonb_build_array(jsonb_build_object('field', 'promised_on', 'direction', 'asc')),
    'parent_id', v_home::text,
    'fields', jsonb_build_array(jsonb_build_object('name', 'bike'))));
  perform custom.field_declare(v_org, v_tickets, jsonb_build_object('key', 'bike', 'label', 'Bike', 'type', 'text', 'sort', 10, 'required', true));
  perform custom.field_declare(v_org, v_tickets, jsonb_build_object('key', 'promised_on', 'label', 'Promised', 'type', 'datetime', 'sort', 20));
  insert into dv values ('org', v_org), ('tickets', v_tickets);
end
$fixture$;

-- ── ONE PRESS, JUDGED. `expect_merge` true asserts the merge; false asserts the damage. ────────
create or replace function pg_temp.one_press(expect_merge boolean) returns text
language plpgsql as $f$
declare
  c_priya_j constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  v_org uuid; v_tickets uuid; v_view uuid; v_name text; v_def jsonb; v_kept boolean;
begin
  select v into v_org from dv where k = 'org'; select v into v_tickets from dv where k = 'tickets';
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', c_priya_j, true);
  -- The page's own seed of the default view (records-ui TablePage, `declareView`).
  v_view := custom.view_declare(v_org, v_tickets, jsonb_build_object(
    'name', 'All records',
    'definition', jsonb_build_object('layout', 'grid', 'is_default', true, 'sorts', '[]'::jsonb)));
  -- The Calendar's date pick: exactly what `saveViewPatch` sends — no name, only the changed keys.
  -- (VIEW-SWITCH-NOT-DESIGNATION, 2026-09-25: the layout itself is never saved onto the DEFAULT
  -- view by a press — that is custom.view_designate — so the press here is the date Field alone.)
  perform custom.view_declare(v_org, v_tickets, jsonb_build_object('view_id', v_view,
    'definition', jsonb_build_object('date_field', 'promised_on')));
  select name, definition into v_name, v_def from platform.saved_view where id = v_view;
  perform set_config('role', 'postgres', true);
  v_kept := v_name = 'All records' and v_def -> 'is_default' = 'true'::jsonb
            and coalesce(v_def ->> 'layout', 'grid') = 'grid' and v_def ->> 'date_field' = 'promised_on';
  if expect_merge and not v_kept then
    raise exception 'RED: one press did not keep the view''s name and default: name %, definition %', v_name, v_def;
  end if;
  if not expect_merge and v_kept then
    raise exception 'the replacing body was expected to damage the view and did not: name %, definition %', v_name, v_def;
  end if;
  return format('name %L, is_default %s, layout %s', v_name, coalesce(v_def ->> 'is_default', '(gone)'), v_def ->> 'layout');
end
$f$;

do $green$ begin
  raise notice 'GREEN on this database''s body — %', pg_temp.one_press(true);
end $green$;

-- A HOST LAYOUT WORD, ASKED OF THE CURRENT BODY (informational): lane DATA-V2-FACE designates the
-- Sheet with `layout: "sheet"`; S1-PRIME's view-key guard allows only grid·kanban·calendar·gallery.
do $sheet$
declare v_org uuid; v_tickets uuid; v_view uuid;
begin
  select v into v_org from dv where k = 'org'; select v into v_tickets from dv where k = 'tickets';
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}', true);
  begin
    v_view := custom.view_declare(v_org, v_tickets, jsonb_build_object('name', 'Sheet probe',
      'definition', jsonb_build_object('layout', 'sheet')));
    raise notice 'NOTE — this body keeps layout "sheet" (the DATA-V2-FACE designation word is writable here).';
  exception when others then
    raise notice 'NOTE — this body REFUSES layout "sheet": %', sqlerrm;
  end;
  perform set_config('role', 'postgres', true);
end $sheet$;

-- ── RED: production's body today (G7's; S0's inverse byte for byte), inside this transaction. ──
\i migrations/inverse/oneview_a_saved_view_keeps_what_it_was_not_sent_down.sql

do $red$ begin
  raise notice 'RED reproduced on G7''s body (production today) — %', pg_temp.one_press(false);
end $red$;

rollback;
\echo 'datav2face2_view_declare_merges_red_green.sql: GREEN on the current body, RED reproduced on G7''s; rolled back, nothing kept.'
