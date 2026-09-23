-- LANE GRID-PRIMITIVES, G7 — A VIEW KEEPS ITS KIND; THE GRID KEEPS ITS CHOICES.
--
-- THE USE CASE (_gridprim_clinic.sql): Dr. Ana Whitfield saves Cedar Ridge Veterinary Clinic's
-- Appointments as a board grouped by Visit status — exactly what matrx-records'
-- pipeline_propose sends ({"layout": "kanban", "group_field": "visit_status"}) — and Marisol
-- Vega saves "Busy morning", a grid view with compact rows and a 220px Visit status column.
--
-- WHAT MAKES IT FAIL:
--   1  the board refused ("A grid layout is a set of choices, and what was sent is a string") —
--      G1 alone, the defect RECORDS-SUITE-3 found; or its kind stored as anything but "kanban".
--   2  the grid's choices under `definition.grid` not honoured, or a bad choice kept.
--   3  a G1-shaped settings object under `layout` refused or lost instead of moved to `grid`.
-- RED with G1 alone (part 1), GREEN with G7.

\set ON_ERROR_STOP on
\timing off
\set suite 'gridprim_g7_green.sql'
\set requires 'function:custom.grid_layout|function:custom.view_declare'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local lock_timeout = '10s';
set local statement_timeout = '120s';
\i scripts/campaign-tests/_gridprim_clinic.sql

do $t$
declare
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_dana_j  constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  v_org uuid; v_appts uuid; f_status uuid; v_board uuid; v_busy uuid; v_old uuid; v_def jsonb; v_res jsonb; v_caught text;
begin
  select v into v_org from gp where k = 'org'; select v into v_appts from gp where k = 'appts';
  select v into f_status from gp where k = 'f_status';
  perform set_config('request.jwt.claims', c_admin_j, true);
  perform set_config('role', 'authenticated', true);
  if current_user is distinct from 'authenticated' then raise exception '0: not seated'; end if;

  -- PART 1 — the board, as pipeline_propose writes it.
  v_board := custom.view_declare(v_org, v_appts, jsonb_build_object('name', 'Appointments by visit status',
    'definition', jsonb_build_object('layout', 'kanban', 'group_field', 'visit_status')));
  select definition into v_def from custom.views(v_org, v_appts) where view_id = v_board;
  if v_def ->> 'layout' is distinct from 'kanban' or v_def ->> 'group_field' is distinct from 'visit_status' then
    raise exception '1: the board was not kept as a kanban grouped by visit_status: %', v_def;
  end if;
  v_res := custom.grid_layout(v_org, v_appts, v_board);
  if jsonb_array_length(v_res -> 'refused') <> 0 or v_res -> 'source' ->> 'row_height' is distinct from 'platform' then
    raise exception '1b: the board''s kind was read as a grid setting: %', v_res;
  end if;
  raise notice '1 PASS — the board is kept as {"layout": "kanban", "group_field": "visit_status"} and custom.views hands it back unchanged.';

  -- PART 2 — the grid's choices live under `grid`.
  perform set_config('request.jwt.claims', c_dana_j, true);
  v_busy := custom.view_declare(v_org, v_appts, jsonb_build_object('name', 'Busy morning',
    'definition', jsonb_build_object('layout', 'grid', 'grid', jsonb_build_object(
      'row_height', 'compact', 'widths', jsonb_build_object(f_status::text, 220)))));
  v_res := custom.grid_layout(v_org, v_appts, v_busy);
  if v_res -> 'layout' ->> 'row_height' is distinct from 'compact' or v_res -> 'source' ->> 'row_height' is distinct from 'view'
     or (v_res -> 'layout' -> 'widths' ->> f_status::text)::integer is distinct from 220 then
    raise exception '2a: the grid choices under definition.grid were not honoured: %', v_res;
  end if;
  begin
    perform custom.view_declare(v_org, v_appts, jsonb_build_object('name', 'Zebra rows',
      'definition', jsonb_build_object('layout', 'grid', 'grid', jsonb_build_object('stripes', true))));
    raise exception '2b: a grid choice the grid ignores was stored';
  exception when invalid_parameter_value then
    get stacked diagnostics v_caught = message_text;
  end;
  raise notice '2 PASS — "Busy morning" opens compact with Visit status at 220px; "stripes" refused (%).', v_caught;

  -- PART 3 — G1's shape (settings under `layout`) is moved to `grid`, not refused.
  v_old := custom.view_declare(v_org, v_appts, jsonb_build_object('name', 'Wall monitor',
    'definition', jsonb_build_object('layout', jsonb_build_object('row_height', 'tall', 'freeze_first_column', true))));
  select definition into v_def from custom.views(v_org, v_appts) where view_id = v_old;
  if v_def ? 'layout' or v_def -> 'grid' ->> 'row_height' is distinct from 'tall' then
    raise exception '3: a G1-shaped view was not moved under grid: %', v_def;
  end if;
  raise notice '3 PASS — a settings object sent as layout is kept as grid {"row_height":"tall", …}.';
  raise notice 'GRIDPRIM G7 GREEN — every part passed.';
end $t$;
rollback;
