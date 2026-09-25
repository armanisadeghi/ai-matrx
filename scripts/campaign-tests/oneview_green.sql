-- LANE S0 ONE-SAVED-VIEW — ONE SAVED-VIEW STORE, AND A VIEW KEEPS WHAT IT WAS NOT SENT.
--
-- THE USE CASE. Northgate Cycle Works, a two-bench bicycle repair shop in Portland, keeps its
-- Repair tickets table in the record store: the bike, the service stage (Checked in → Waiting on
-- parts → In the stand → Ready for pickup → Picked up), the mechanic, the quote and the day the
-- bike was promised. Priya Raman runs the front counter (test@test.com); the owner, Tomás Ruiz,
-- is admin@admin.com. Priya saves a "Workshop board" from the view bar (a kanban by stage, sorted
-- by promise date, the quote column hidden), gives it compact rows (G1/G7's grid choices), drags
-- two rush jobs to the top (G13's hand-set order), then switches it to a calendar and later clears
-- its grouping. Tomás's older "Rush jobs" view of the table is carried in by the mover. Every
-- name, bike and price below is synthesized.
--
-- WHAT MAKES IT FAIL:
--   A  a view saved the way the view bar saves it is not listed, whole, by custom.views — the
--      reader the digests, the notify rules and the mover's world use;
--   B  a view the mover carried in (moved_from, hidden columns by KEY) is not listed for the bar;
--   C  a partial update drops G7's grid, G13's order, the mover's provenance, the board's other
--      keys, the view's filters or its name; a key sent as null is not removed; a caller can
--      overwrite a server-owned key (table_id, order, moved_from);
--   D  a view of another Table can be rewritten through this Table's rung;
--   E  anywhere in this database, a records_ui_view Table is still live, or a view the bar kept
--      there has no platform.saved_view row under the same id.
-- RED on G7's view_declare (C) and before the repair move (E); GREEN after both files.

\set ON_ERROR_STOP on
\timing off
\set suite 'oneview_green.sql'
\set requires 'function:custom.view_declare|function:custom.views|function:custom.view_record_order_set|function:custom.grid_layout_check'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local lock_timeout = '10s';
set local statement_timeout = '180s';

do $g$ begin
  if not has_function_privilege('authenticated', 'custom.view_declare(uuid, uuid, jsonb)', 'execute')
     or not has_function_privilege('authenticated', 'custom.views(uuid, uuid)', 'execute') then
    raise exception 'S0-grant: a signed-in person holds no EXECUTE on custom.view_declare / custom.views';
  end if;
end $g$;

create temp table ov (k text primary key, v uuid) on commit drop;
grant select on ov to authenticated;

-- ── THE FIXTURE (asserts nothing) ─────────────────────────────────────────────────────────────
do $fixture$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_priya   constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';   -- test@test.com
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_org uuid := gen_random_uuid();
  v_home uuid; v_tickets uuid; v_parts uuid; v_row jsonb; v_n integer := 0;
begin
  perform set_config('app.actor_system', 'campaign-test/oneview', true);
  perform set_config('request.jwt.claims', c_admin_j, true);
  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'Northgate Cycle Works ' || substr(v_org::text, 1, 8),
          'northgate-cycle-works-' || substr(v_org::text, 1, 8), 'NCW', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_org, 'organization', v_org, c_admin, 'owner',  'active'),
    (v_org, 'organization', v_org, c_priya, 'member', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note) values
    ('custom', 'system_enabled',       'organization', v_org, v_org, 'true'::jsonb,     'oneview fixture'),
    ('custom', 'member_default_level', 'organization', v_org, v_org, '"editor"'::jsonb, 'oneview fixture: the counter edits tickets');
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
  insert into ov values ('org', v_org), ('tickets', v_tickets);
  perform custom.field_declare(v_org, v_tickets, jsonb_build_object('key', 'bike', 'label', 'Bike', 'type', 'text', 'sort', 10, 'required', true));
  perform custom.field_declare(v_org, v_tickets, jsonb_build_object('key', 'service_stage', 'label', 'Service stage', 'type', 'select', 'sort', 20,
    'options', jsonb_build_array('Checked in', 'Waiting on parts', 'In the stand', 'Ready for pickup', 'Picked up')));
  perform custom.field_declare(v_org, v_tickets, jsonb_build_object('key', 'mechanic', 'label', 'Mechanic', 'type', 'text', 'sort', 30));
  insert into ov values ('f_quote', custom.field_declare(v_org, v_tickets, jsonb_build_object(
    'key', 'quote', 'label', 'Quote', 'type', 'currency', 'unit', '$', 'sort', 40)));
  perform custom.field_declare(v_org, v_tickets, jsonb_build_object('key', 'promised_on', 'label', 'Promised', 'type', 'datetime', 'sort', 50));
  for v_row in select e from jsonb_array_elements(jsonb_build_array(
    jsonb_build_object('bike', 'Trek Domane SL5 — Okonkwo',     'service_stage', 'In the stand',     'mechanic', 'Dev', 'quote', 185,  'promised_on', '2026-09-24'),
    jsonb_build_object('bike', 'Specialized Sirrus — Haverford', 'service_stage', 'Waiting on parts', 'mechanic', 'Mae', 'quote', 312.5,'promised_on', '2026-09-26'),
    jsonb_build_object('bike', 'Surly Long Haul — Brennan',     'service_stage', 'Checked in',       'mechanic', 'Dev', 'quote', 95,   'promised_on', '2026-09-25'),
    jsonb_build_object('bike', 'Cannondale Topstone — Liu',     'service_stage', 'Ready for pickup', 'mechanic', 'Mae', 'quote', 140,  'promised_on', '2026-09-23'),
    jsonb_build_object('bike', 'Rad Power RadCity — Esposito',  'service_stage', 'Checked in',       'mechanic', 'Dev', 'quote', 260,  'promised_on', '2026-09-27'),
    jsonb_build_object('bike', 'Brompton C Line — Achterberg',  'service_stage', 'In the stand',     'mechanic', 'Mae', 'quote', 75,   'promised_on', '2026-09-24')
  )) e loop
    v_n := v_n + 1;
    insert into ov values ('r' || v_n, custom.record_write(v_org, v_tickets, v_row));
  end loop;
  v_parts := custom.table_declare(v_org, jsonb_build_object(
    'name', 'Parts on order', 'slug', 'parts_on_order', 'type', 'entity',
    'label_singular', 'Part', 'label_plural', 'Parts on order', 'title_field', 'part',
    'display', 'list', 'weight', 'light', 'ordered', true, 'row_order', 'sorted', 'agent_writable', true,
    'retention_days', 3650, 'default_sort', jsonb_build_array(jsonb_build_object('field', 'part', 'direction', 'asc')),
    'parent_id', v_home::text, 'fields', jsonb_build_array(jsonb_build_object('name', 'part'))));
  perform custom.field_declare(v_org, v_parts, jsonb_build_object('key', 'part', 'label', 'Part', 'type', 'text', 'sort', 10));
  insert into ov values ('parts', v_parts);
end
$fixture$;

do $t$
declare
  c_priya_j constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  v_org uuid; v_tickets uuid; v_parts uuid; v_r1 uuid; v_r5 uuid; v_quote uuid;
  v_board uuid; v_rush uuid; v_weekend uuid; v_def jsonb; v_row record; v_n integer; v_bad integer;
begin
  select v into v_org from ov where k = 'org'; select v into v_tickets from ov where k = 'tickets';
  select v into v_parts from ov where k = 'parts'; select v into v_r1 from ov where k = 'r1';
  select v into v_r5 from ov where k = 'r5'; select v into v_quote from ov where k = 'f_quote';

  -- ── A. THE BAR'S SAVE, READ BY THE ONE READER ───────────────────────────────────────────────
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', c_priya_j, true);
  -- Exactly what records-ui `declareView` sends (views.ts viewDocument), plus the filter a digest adds.
  v_board := custom.view_declare(v_org, v_tickets, jsonb_build_object(
    'name', 'Workshop board',
    'filters', jsonb_build_object('mechanic', 'Dev'),
    'definition', jsonb_build_object(
      'layout', 'kanban', 'group_field', 'service_stage',
      'sorts', jsonb_build_array(jsonb_build_object('field', 'promised_on', 'direction', 'asc')),
      'is_default', false,
      'presentation', jsonb_build_object('hiddenFields', jsonb_build_array('quote')))));
  select * into v_row from custom.views(v_org, v_tickets) where view_id = v_board;
  if v_row.view_id is null or v_row.name <> 'Workshop board'
     or v_row.definition ->> 'layout' <> 'kanban' or v_row.definition ->> 'group_field' <> 'service_stage'
     or v_row.definition -> 'sorts' -> 0 ->> 'field' <> 'promised_on'
     or v_row.definition -> 'presentation' -> 'hiddenFields' <> '["quote"]'::jsonb
     or v_row.filters <> '{"mechanic": "Dev"}'::jsonb or v_row.table_id <> v_tickets then
    raise exception 'A: the view the bar saved did not come back whole from custom.views: %', to_jsonb(v_row);
  end if;
  raise notice 'A PASS — the bar''s "Workshop board" is listed by custom.views with its kind, grouping, sort, hidden column and filter.';

  -- ── B. THE MOVER'S VIEW, READ BY THE BAR ────────────────────────────────────────────────────
  -- The mover runs on the server lane (no person's seat) and writes through the same door.
  perform set_config('role', 'postgres', true);
  v_rush := custom.view_declare(v_org, v_tickets, jsonb_build_object(
    'name', 'Rush jobs',
    'definition', jsonb_build_object(
      'moved_from', jsonb_build_object('view_id', gen_random_uuid(), 'surface_key', 'matrx-user/data-tables',
                                       'hidden_fields', jsonb_build_array(v_quote)),
      'presentation', jsonb_build_object('hiddenFields', jsonb_build_array('quote')))));
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', c_priya_j, true);
  select * into v_row from custom.views(v_org, v_tickets) where view_id = v_rush;
  if v_row.view_id is null or v_row.definition -> 'moved_from' ->> 'surface_key' <> 'matrx-user/data-tables'
     or v_row.definition -> 'presentation' -> 'hiddenFields' <> '["quote"]'::jsonb then
    raise exception 'B: the mover''s view is not listed for the bar the way the mover wrote it: %', to_jsonb(v_row);
  end if;
  -- The mover as it writes today (movers/attributes.py): hidden columns by Field ID, top level.
  perform set_config('role', 'postgres', true);
  v_weekend := custom.view_declare(v_org, v_tickets, jsonb_build_object(
    'name', 'Weekend pickups',
    'definition', jsonb_build_object(
      'moved_from', jsonb_build_object('view_id', gen_random_uuid(), 'surface_key', 'matrx-user/data-tables'),
      'hidden_fields', jsonb_build_array(v_quote))));
  select definition into v_def from platform.saved_view where id = v_weekend;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', c_priya_j, true);
  if v_def ? 'hidden_fields' or v_def -> 'presentation' -> 'hiddenFields' is distinct from '["quote"]'::jsonb
     or v_def -> 'moved_from' -> 'hidden_fields' is distinct from jsonb_build_array(v_quote) then
    raise exception 'B2: hidden columns sent by Field id did not become the one hidden list by key: %', v_def;
  end if;
  select count(*) into v_n from custom.views(v_org, v_tickets);
  if v_n <> 3 then raise exception 'B: the bar should list 3 views of Repair tickets, listed %', v_n; end if;
  raise notice 'B PASS — the mover''s views are the table''s views; hidden columns sent by id land in the one list, by key.';

  -- ── C. A PARTIAL UPDATE KEEPS WHAT IT WAS NOT SENT ──────────────────────────────────────────
  perform custom.view_declare(v_org, v_tickets, jsonb_build_object('view_id', v_board,
    'definition', jsonb_build_object('grid', jsonb_build_object('row_height', 'compact'))));       -- G7
  perform custom.view_declare(v_org, v_tickets, jsonb_build_object('view_id', v_board,
    'definition', jsonb_build_object('grid', jsonb_build_object('wrap', true))));                  -- a second grid choice
  perform custom.view_record_order_set(v_org, v_board, array[v_r5, v_r1]);                         -- G13
  -- The bar's layout press: only what changed.
  perform custom.view_declare(v_org, v_tickets, jsonb_build_object('view_id', v_board,
    'definition', jsonb_build_object('layout', 'calendar', 'date_field', 'promised_on')));
  select definition into v_def from platform.saved_view where id = v_board;
  if v_def ->> 'layout' <> 'calendar' or v_def ->> 'date_field' <> 'promised_on' then
    raise exception 'C1: the change sent was not kept: %', v_def;
  end if;
  if v_def -> 'grid' ->> 'row_height' is distinct from 'compact' or (v_def -> 'grid' ->> 'wrap')::boolean is distinct from true then
    raise exception 'C2: G7''s grid choices were dropped by an update that did not send them: %', v_def;
  end if;
  if v_def ->> 'order' is distinct from 'manual' then
    raise exception 'C3: G13''s hand-set order was dropped by an update that did not send it: %', v_def;
  end if;
  -- ORDER-FIX (2026-09-25): placing the rows makes the hand-set order the view's sort, so the
  -- promised-on sort it replaced is gone — a view is ordered by its sort OR by hand, never both.
  if v_def ->> 'group_field' is distinct from 'service_stage' or v_def ? 'sorts'
     or v_def -> 'presentation' -> 'hiddenFields' is distinct from '["quote"]'::jsonb
     or v_def -> 'filters' is distinct from '{"mechanic": "Dev"}'::jsonb then
    raise exception 'C4: the view''s other keys or its filter were dropped by an update that did not send them: %', v_def;
  end if;
  if (select name from platform.saved_view where id = v_board) <> 'Workshop board' then
    raise exception 'C5: an update that sent no name renamed the view';
  end if;
  -- Clearing "Group by" is sending it as null.
  perform custom.view_declare(v_org, v_tickets, jsonb_build_object('view_id', v_board,
    'definition', jsonb_build_object('group_field', null)));
  select definition into v_def from platform.saved_view where id = v_board;
  if v_def ? 'group_field' or v_def ->> 'layout' <> 'calendar' then
    raise exception 'C6: a key sent as null was not removed, or the rest moved: %', v_def;
  end if;
  -- A caller cannot overwrite what the server owns. ORDER-FIX: an `order` word other than
  -- "sorted" is refused by name (it used to be dropped without a word); the rest are ignored.
  begin
    perform custom.view_declare(v_org, v_tickets, jsonb_build_object('view_id', v_rush,
      'definition', jsonb_build_object('order', 'sort', 'layout', 'gallery')));
    raise exception 'C7a: a caller''s order word "sort" was accepted or dropped without a word';
  exception when invalid_parameter_value then null;
  end;
  perform custom.view_declare(v_org, v_tickets, jsonb_build_object('view_id', v_rush,
    'definition', jsonb_build_object('table_id', v_parts, 'moved_from', null, 'layout', 'gallery')));
  select definition into v_def from platform.saved_view where id = v_rush;
  if v_def ->> 'table_id' <> v_tickets::text or v_def ? 'order'
     or v_def -> 'moved_from' ->> 'surface_key' is distinct from 'matrx-user/data-tables' or v_def ->> 'layout' <> 'gallery' then
    raise exception 'C7: a caller overwrote a server-owned key (table_id / order / moved_from): %', v_def;
  end if;
  -- The filter changes only when the key is sent.
  perform custom.view_declare(v_org, v_tickets, jsonb_build_object('view_id', v_board, 'filters', null));
  if (select definition -> 'filters' from platform.saved_view where id = v_board) <> '{}'::jsonb then
    raise exception 'C8: sending filters: null did not clear the view''s filter';
  end if;
  raise notice 'C PASS — a layout press kept the grid choices, the hand-set order (which replaced the sort), the grouping, hidden column, filter and name; null cleared Group by; server-owned keys held.';

  -- ── D. A VIEW OF ANOTHER TABLE IS NOT REWRITTEN THROUGH THIS ONE ────────────────────────────
  begin
    perform custom.view_declare(v_org, v_parts, jsonb_build_object('view_id', v_board,
      'definition', jsonb_build_object('layout', 'grid')));
    raise exception 'D: a view of Repair tickets was rewritten through Parts on order';
  exception when foreign_key_violation then null;
  end;
  raise notice 'D PASS — a view of another table is refused like an invented id.';

  -- ── E. THE OTHER STORE IS EMPTY (database-wide) ─────────────────────────────────────────────
  perform set_config('role', 'postgres', true);
  select count(*) into v_n from custom.record r
   where r.table_id = custom.table_kernel_id() and r.data_class = 'table'
     and r.data ->> 'slug' = 'records_ui_view' and r.deleted_at is null;
  if v_n > 0 then
    raise exception 'E1: % records_ui_view table(s) are still live — the view bar''s second store has not been moved', v_n;
  end if;
  select count(*) into v_bad
    from custom.record v
    join custom.record t on t.organization_id = v.organization_id and t.id = v.table_id
                        and t.data_class = 'table' and t.data ->> 'slug' = 'records_ui_view'
   where v.data_class = 'record'
     and (v.data ->> 'subject') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     and not exists (select 1 from platform.saved_view sv
                      where sv.id = v.id and sv.surface_key = 'custom/records'
                        and sv.subject_id = (v.data ->> 'subject')::uuid
                        and sv.definition ->> 'layout' = coalesce(nullif(v.data ->> 'layout', ''), 'grid'));
  if v_bad > 0 then
    raise exception 'E2: % view(s) the bar kept in records_ui_view have no platform.saved_view row under the same id', v_bad;
  end if;
  raise notice 'E PASS — no records_ui_view table is live, and every view it held is in platform.saved_view under its own id.';
  raise notice 'S0 ONE-SAVED-VIEW GREEN — every part passed.';
end $t$;
rollback;
