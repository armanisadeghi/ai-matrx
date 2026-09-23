-- LANE GRID-PRIMITIVES, G1 — THE GREEN SUITE. A table wears its colors and its layout, and
-- its summary bar says all nine things the older grid's did.
--
-- THE USE CASE (scripts/campaign-tests/_gridprim_clinic.sql): Marisol Vega, front desk at
-- Cedar Ridge Veterinary Clinic (test@test.com), on the practice's Appointments day sheet.
--
-- THE SEAT. Every asserted clause runs as `authenticated` with Marisol's (or a stranger's)
-- claims, through the doors a browser calls. The fixture is written before the seat is taken.
-- It ends in ROLLBACK.
--
-- RUN IT (clone or branch; the preamble refuses anything else):
--   "$PSQL" "<clone or branch DSN>" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/gridprim_g1_green.sql
--
-- WHAT MAKES IT FAIL — one production change per part:
--   1  custom.table_decorate absent, or storing a highlight on a record of ANOTHER table.
--   2  a color outside the palette, or a rule test the grid cannot paint, stored silently.
--   3  clearing a cell highlight leaving an empty husk behind.
--   4  the Table record's change not reaching custom.io_outbox (the realtime port) — every
--      other screen would keep yesterday's colors.
--   5  a rule over a column that is gone painting nothing SILENTLY (no `stale` entry).
--   6  custom.grid_layout not naming where a choice came from, or view_declare keeping a
--      layout key the grid ignores.
--   7  record_aggregate missing median / filled / empty / unique, or answering them
--      differently from the older grid's summary bar on the same rows.
--   8  a person outside the clinic reaching any of it.
--
-- FAILING-THEN-PASSING: before gridprim_a_table_wears_its_colors_and_its_layout.sql is applied
-- this suite fails at part 1 (`function custom.table_decorate(...) does not exist`).

\set ON_ERROR_STOP on
\timing off

\set suite 'gridprim_g1_green.sql'
\set requires 'function:custom.table_declare|function:custom.field_declare|function:custom.record_aggregate'
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
  c_dana_j  constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  -- keith.watanabe@comtech.com has an account here and is in no organization with the clinic.
  c_stranger_j constant text := '{"sub":"000eaa28-cf5d-402a-8f01-5e2c24191323","role":"authenticated"}';
  v_org uuid; v_appts uuid; v_sup uuid;
  f_status uuid; f_fee uuid; f_deposit uuid; f_notes uuid; f_phone uuid; f_supplier uuid;
  r1 uuid; r3 uuid; r7 uuid; s1 uuid;
  v_doc jsonb; v_res jsonb; v_caught text; v_code text; v_n integer; v_view uuid;
  v_m jsonb; v_before integer;
begin
  select v into v_org from gp where k = 'org';          select v into v_appts from gp where k = 'appts';
  select v into v_sup from gp where k = 'other_table';  select v into f_status from gp where k = 'f_status';
  select v into f_fee from gp where k = 'f_fee';        select v into f_deposit from gp where k = 'f_deposit';
  select v into f_notes from gp where k = 'f_notes';    select v into f_phone from gp where k = 'f_phone';
  select v into f_supplier from gp where k = 'f_supplier';
  select v into r1 from gp where k = 'r1'; select v into r3 from gp where k = 'r3';
  select v into r7 from gp where k = 'r7'; select v into s1 from gp where k = 's1';

  -- ══ PART 0 — THE SEAT. ═══════════════════════════════════════════════════════════════
  perform set_config('request.jwt.claims', c_dana_j, true);
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then raise exception '0: not seated (current_user %)', current_user; end if;
  begin
    perform 1 from custom.record limit 1;
    raise exception '0: this seat can SELECT custom.record directly, so it is not a client seat';
  exception when insufficient_privilege then null;
  end;
  raise notice '0 PASS — seated as Marisol (test@test.com), and the seat cannot read custom.record directly.';

  perform set_config('role', 'postgres', true);
  select count(*) into v_before from custom.io_outbox o
   where o.organization_id = v_org and o.record_id = v_appts and o.operation = 'updated';
  perform set_config('role', 'authenticated', true);

  -- ══ PART 1 — COLOR BY A CHOICE COLUMN; HIGHLIGHT A ROW. ═══════════════════════════════
  v_doc := custom.table_decorate(v_org, v_appts, array['color_by'],
             jsonb_build_object('field', f_status, 'target', 'row'));
  if v_doc -> 'color_by' ->> 'field' <> f_status::text then
    raise exception '1a: color_by not stored: %', v_doc;
  end if;
  v_doc := custom.table_decorate(v_org, v_appts, array['rows', r7::text], '"red"'::jsonb);
  if v_doc -> 'rows' ->> r7::text <> 'red' then raise exception '1b: row highlight not stored: %', v_doc; end if;
  -- …and a highlight on a record of ANOTHER table of the same clinic is refused.
  begin
    perform custom.table_decorate(v_org, v_appts, array['rows', s1::text], '"red"'::jsonb);
    raise exception '1c: a Supplier record was highlighted on the Appointments grid';
  exception when foreign_key_violation then
    get stacked diagnostics v_caught = message_text;
    if v_caught not like '%not in this table%' then raise exception '1c: refused, but not in words: %', v_caught; end if;
  end;
  raise notice '1 PASS — colored by Visit status; Rocco''s no-show row is red; a Supplier cannot be highlighted here (%).', v_caught;

  -- ══ PART 2 — RULES: ordered, judged whole. ════════════════════════════════════════════
  v_doc := custom.table_decorate(v_org, v_appts, array['rules'], jsonb_build_array(
    jsonb_build_object('field', f_fee, 'op', 'gte', 'value', '300', 'color', 'amber', 'target', 'cell'),
    jsonb_build_object('field', f_deposit, 'op', 'is_empty', 'color', 'violet', 'target', 'row')));
  if jsonb_array_length(v_doc -> 'rules') <> 2 or (v_doc -> 'rules' -> 0 ->> 'id') is null
     or (v_doc -> 'rules' -> 1) ? 'value' then
    raise exception '2a: rules not stored as sent (each with an id; no value on is_empty): %', v_doc -> 'rules';
  end if;
  begin
    perform custom.table_decorate(v_org, v_appts, array['rules'], jsonb_build_array(
      jsonb_build_object('field', f_fee, 'op', 'gte', 'value', '300', 'color', 'pink', 'target', 'cell')));
    raise exception '2b: a color outside the palette was stored';
  exception when invalid_parameter_value then
    get stacked diagnostics v_caught = message_text;
    if v_caught not like '%pink%' then raise exception '2b: refused without naming the color: %', v_caught; end if;
  end;
  begin
    perform custom.table_decorate(v_org, v_appts, array['rules'], jsonb_build_array(
      jsonb_build_object('field', f_fee, 'op', 'between', 'value', '300', 'color', 'amber', 'target', 'cell')));
    raise exception '2c: a rule test the grid cannot paint was stored';
  exception when invalid_parameter_value then
    get stacked diagnostics v_caught = message_text;
    if v_caught not like '%between%' or v_caught not like '%is at least%' then
      raise exception '2c: refused without the list of tests: %', v_caught;
    end if;
  end;
  begin
    perform custom.table_decorate(v_org, v_appts, array['rules'], jsonb_build_array(
      jsonb_build_object('field', f_supplier, 'op', 'is_empty', 'color', 'amber', 'target', 'row')));
    raise exception '2d: a rule over another table''s column was stored';
  exception when foreign_key_violation then null;
  end;
  begin
    perform custom.table_decorate(v_org, v_appts, array['rules'], jsonb_build_array(
      jsonb_build_object('field', 'visit_fee', 'op', 'gte', 'value', '300', 'color', 'amber', 'target', 'cell')));
    raise exception '2e: a rule naming its column by NAME was stored';
  exception when foreign_key_violation then null;
  end;
  raise notice '2 PASS — two rules kept in order; pink, "between", a Supplier column and a column named by name all refused by name.';

  -- ══ PART 3 — A CELL HIGHLIGHT, THEN CLEARED, LEAVES NO HUSK. ══════════════════════════
  v_doc := custom.table_decorate(v_org, v_appts, array['cells', r3::text, f_fee::text], '"blue"'::jsonb);
  if v_doc -> 'cells' -> r3::text ->> f_fee::text <> 'blue' then raise exception '3a: cell highlight not stored: %', v_doc; end if;
  v_doc := custom.table_decorate(v_org, v_appts, array['cells', r3::text, f_fee::text], null);
  if v_doc ? 'cells' then raise exception '3b: clearing the only cell highlight left a husk: %', v_doc -> 'cells'; end if;
  v_doc := custom.table_decorate(v_org, v_appts, array['columns', f_phone::text], '"teal"'::jsonb);
  raise notice '3 PASS — Moose''s fee cell went blue and back with no husk left; Owner phone column is teal.';

  -- ══ PART 4 — EVERY OPEN SCREEN HEARS IT (the realtime port). ══════════════════════════
  perform set_config('role', 'postgres', true);
  select count(*) into v_n from custom.io_outbox o
   where o.organization_id = v_org and o.record_id = v_appts and o.operation = 'updated';
  perform set_config('role', 'authenticated', true);
  -- Parts 1–3 made five successful writes (color_by, a row, the rules, a cell set, a cell
  -- clear, a column = six); each is one version of the Table record and one outbox line.
  if v_n - v_before <> 6 then
    raise exception '4: six color writes produced % records.changed line(s) on the Table record, not six', v_n - v_before;
  end if;
  raise notice '4 PASS — six color writes, six records.changed lines on the Appointments Table record: every open grid repaints.';

  -- ══ PART 5 — THE READ, AND A RULE OVER A GONE COLUMN SAYS SO. ════════════════════════
  v_res := custom.table_decorations(v_org, v_appts);
  if jsonb_array_length(v_res -> 'rules') <> 2 or v_res -> 'rows' ->> r7::text <> 'red'
     or v_res -> 'columns' ->> f_phone::text <> 'teal' or jsonb_array_length(v_res -> 'stale') <> 0
     or not (v_res -> 'colors' ? 'teal') or jsonb_array_length(v_res -> 'rule_ops') <> 11 then
    raise exception '5a: the read does not give back what was written: %', v_res;
  end if;
  -- The practice manager retires the Deposit column; the rule over it stops painting AND says so.
  perform set_config('request.jwt.claims', '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}', true);
  perform custom.field_retire(v_org, f_deposit);
  perform set_config('request.jwt.claims', c_dana_j, true);
  v_res := custom.table_decorations(v_org, v_appts);
  if jsonb_array_length(v_res -> 'rules') <> 1 or jsonb_array_length(v_res -> 'stale') <> 1
     or v_res -> 'stale' -> 0 ->> 'part' <> 'rules' then
    raise exception '5b: a rule over a retired column went quiet instead of saying so: %', v_res;
  end if;
  raise notice '5 PASS — the read gives back both rules, the red row and the teal column; retiring Deposit leaves one rule painting and names the other under stale: "%".', v_res -> 'stale' -> 0 ->> 'says';

  -- ══ PART 6 — LAYOUT: platform, organization, view; every choice says where it came from. ═
  v_res := custom.grid_layout(v_org, v_appts, null);
  if v_res -> 'layout' ->> 'row_height' <> 'normal' or v_res -> 'source' ->> 'row_height' <> 'platform' then
    raise exception '6a: the platform default is not the answer: %', v_res;
  end if;
  perform set_config('role', 'postgres', true);
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  values ('custom', 'grid_layout', 'organization', v_org, v_org,
          '{"mode":"auto","fit_max_columns":8,"row_height":"tall","freeze_first_column":true,"wrap":false}'::jsonb,
          'gridprim G1: the clinic reads the day sheet on a wall monitor');
  perform set_config('role', 'authenticated', true);
  v_res := custom.grid_layout(v_org, v_appts, null);
  if v_res -> 'layout' ->> 'row_height' <> 'tall' or v_res -> 'source' ->> 'row_height' <> 'organization'
     or v_res -> 'source' ->> 'mode' <> 'platform' then
    raise exception '6b: the organization default is not named as the organization''s: %', v_res;
  end if;
  v_view := custom.view_declare(v_org, v_appts, jsonb_build_object('name', 'Busy morning',
              'definition', jsonb_build_object('layout', jsonb_build_object(
                'row_height', 'compact', 'widths', jsonb_build_object(f_status::text, 220)))));
  v_res := custom.grid_layout(v_org, v_appts, v_view);
  if v_res -> 'layout' ->> 'row_height' <> 'compact' or v_res -> 'source' ->> 'row_height' <> 'view'
     or (v_res -> 'layout' -> 'widths' ->> f_status::text)::integer <> 220
     or v_res -> 'layout' ->> 'freeze_first_column' <> 'true' then
    raise exception '6c: the view''s layout does not win where it chose and yield where it did not: %', v_res;
  end if;
  begin
    perform custom.view_declare(v_org, v_appts, jsonb_build_object('name', 'Zebra rows',
              'definition', jsonb_build_object('layout', jsonb_build_object('stripes', true))));
    raise exception '6d: a layout choice the grid ignores was stored';
  exception when invalid_parameter_value then
    get stacked diagnostics v_caught = message_text;
    if v_caught not like '%stripes%' then raise exception '6d: refused without naming the choice: %', v_caught; end if;
  end;
  begin
    perform custom.view_declare(v_org, v_appts, jsonb_build_object('name', 'By name',
              'definition', jsonb_build_object('layout', jsonb_build_object('widths', jsonb_build_object('visit_status', 220)))));
    raise exception '6e: a width kept by column NAME was stored';
  exception when invalid_parameter_value then null;
  end;
  raise notice '6 PASS — normal (platform) → tall (organization) → compact (view "Busy morning"), freeze from the organization, Visit status 220px; "stripes" and a width by name refused.';

  -- ══ PART 7 — THE NINE SUMMARIES, AGAINST THE OLDER GRID'S OWN ARITHMETIC. ═════════════
  -- The older grid (column-summaries.ts) on these ten rows:
  --   Visit fee: 9 numbers, sorted 98, 120, 142.5, 142.5, 185, 185, 185, 365, 410 → median 185
  --   filled 9 / empty 1 (Ziggy) / unique 6 (98, 120, 142.5, 185, 365, 410)
  --   Desk notes: filled 5 (Moose's "" is blank, three rows carry none), empty 5, unique 5.
  select measures into v_m from custom.record_aggregate(v_org, v_appts, '[]'::jsonb,
    jsonb_build_array(
      jsonb_build_object('op', 'median', 'key', 'visit_fee'),
      jsonb_build_object('op', 'filled', 'key', 'visit_fee'),
      jsonb_build_object('op', 'empty',  'key', 'visit_fee'),
      jsonb_build_object('op', 'unique', 'key', 'visit_fee'),
      jsonb_build_object('op', 'sum',    'key', 'visit_fee'),
      jsonb_build_object('op', 'filled', 'key', 'desk_notes'),
      jsonb_build_object('op', 'empty',  'key', 'desk_notes'),
      jsonb_build_object('op', 'unique', 'key', 'desk_notes'),
      jsonb_build_object('op', 'count')));
  if (v_m ->> 'median_visit_fee')::numeric <> 185 or (v_m ->> 'filled_visit_fee')::numeric <> 9
     or (v_m ->> 'empty_visit_fee')::numeric <> 1 or (v_m ->> 'unique_visit_fee')::numeric <> 6
     or (v_m ->> 'sum_visit_fee')::numeric <> 1833 or (v_m ->> 'filled_desk_notes')::numeric <> 5
     or (v_m ->> 'empty_desk_notes')::numeric <> 5 or (v_m ->> 'unique_desk_notes')::numeric <> 5
     or (v_m ->> 'count')::numeric <> 10 then
    raise exception '7: the summaries disagree with the older grid on the same ten rows: %', v_m;
  end if;
  perform set_config('role', 'postgres', true);
  if not ('median' = any (custom.agg_operations())) or not ('unique' = any (custom.agg_operations())) then
    raise exception '7b: the store''s measure list does not offer the new four';
  end if;
  perform set_config('role', 'authenticated', true);
  raise notice '7 PASS — median $185, 9 filled / 1 empty / 6 unique fees, sum $1,833; notes 5 / 5 / 5; exactly the older grid''s bar.';

  -- ══ PART 8 — NOBODY OUTSIDE THE CLINIC. ═══════════════════════════════════════════════
  perform set_config('request.jwt.claims', c_stranger_j, true);
  begin
    perform custom.table_decorations(v_org, v_appts);
    raise exception '8a: a stranger read the clinic''s colors';
  exception when insufficient_privilege then null;
  end;
  begin
    perform custom.table_decorate(v_org, v_appts, array['rows', r1::text], '"green"'::jsonb);
    raise exception '8b: a stranger painted the clinic''s day sheet';
  exception when insufficient_privilege then null;
  end;
  begin
    perform custom.grid_layout(v_org, v_appts, null);
    raise exception '8c: a stranger read the clinic''s layout';
  exception when insufficient_privilege then null;
  end;
  raise notice '8 PASS — a person in no organization with the clinic is refused all three doors (42501).';

  raise notice 'GRIDPRIM G1 GREEN — every part passed.';
end
$t$;

rollback;
