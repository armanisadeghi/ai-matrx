-- LANE GRID-PRIMITIVES, G3 + the G5 column kinds — THE GREEN SUITE. A person types a formula
-- in the older grid's language; the store parses it, keeps the text, works it out on every
-- read; the column says how it is drawn; the store numbers records and stamps their times.
--
-- THE USE CASE (scripts/campaign-tests/_gridprim_clinic.sql): Dr. Ana Whitfield
-- (admin@admin.com) adds columns to Cedar Ridge Veterinary Clinic's Appointments day sheet;
-- Marisol Vega (test@test.com) books and reads visits.
--
-- The formula LANGUAGE's parity with the older evaluator is proved separately, over the same
-- rows, by scripts/campaign-tests/gridprim_g3_formula_parity.ts. This suite proves the doors.
--
-- WHAT MAKES IT FAIL — one production change per part:
--   1  formula_text dropped (a person would have to write JSON), or the expression not stored.
--   2  a formula the parser refuses stored anyway, or refused without the parser's words.
--   3  the formula not worked out on read by the store (the grid would show an empty cell).
--   4  field_update keeping a stale formula_text beside a hand-written expr.
--   5  a display format outside the grid's 34 stored, or display_format dropped on read.
--   6  autonumber typed by hand, reused, or renumbered on a later write.
--   7  created_time / modified_time not the record's own stamps.
--   8  a stranger parsing against the clinic's columns.
--
-- FAILING-THEN-PASSING: before gridprim_a_formula_is_typed_and_the_store_works_it_out.sql is
-- applied, part 1 fails ("A column has no setting called ..." / formula_text ignored).

\set ON_ERROR_STOP on
\timing off

\set suite 'gridprim_g3_green.sql'
\set requires 'function:custom.field_declare|function:custom.read_record'
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
  c_stranger_j constant text := '{"sub":"000eaa28-cf5d-402a-8f01-5e2c24191323","role":"authenticated"}';
  v_org uuid; v_appts uuid; r1 uuid; r7 uuid; r9 uuid;
  f_balance uuid; f_call uuid; f_number uuid; f_created uuid; f_modified uuid;
  v_doc jsonb; v_rec jsonb; v_caught text; v_new uuid; v_new2 uuid; v_n numeric; v_ver integer;
  v_created timestamptz; v_updated timestamptz;
begin
  select v into v_org from gp where k = 'org'; select v into v_appts from gp where k = 'appts';
  select v into r1 from gp where k = 'r1'; select v into r7 from gp where k = 'r7'; select v into r9 from gp where k = 'r9';

  perform set_config('request.jwt.claims', c_admin_j, true);
  perform set_config('role', 'authenticated', true);
  if current_user is distinct from 'authenticated' then raise exception '0: not seated'; end if;
  raise notice '0 PASS — seated as Dr. Whitfield (admin@admin.com) through authenticated.';

  -- ══ PART 1 — A TYPED FORMULA, KEPT AS TEXT AND AS AN EXPRESSION. ══════════════════════
  f_balance := custom.field_declare(v_org, v_appts, jsonb_build_object(
    'key', 'balance_due', 'label', 'Balance due', 'type', 'formula', 'sort', 90,
    'formula_text', '{Visit fee} - {Deposit taken}',
    'display_format', jsonb_build_object('id', 'currency', 'options', jsonb_build_object('currency', 'USD'))));
  perform set_config('role', 'postgres', true);
  select f.data into v_doc from custom.record f where f.id = f_balance;
  perform set_config('role', 'authenticated', true);
  if v_doc -> 'config' ->> 'formula_text' is distinct from '{Visit fee} - {Deposit taken}'
     or v_doc -> 'config' -> 'expr' ->> 'op' is distinct from 'fx.sub' then
    raise exception '1: the typed formula was not kept as text AND expression: %', v_doc -> 'config';
  end if;
  f_call := custom.field_declare(v_org, v_appts, jsonb_build_object(
    'key', 'desk_action', 'label', 'Desk action', 'type', 'formula', 'sort', 95,
    'formula_text', 'IF({Visit status} = "No-show", "Call " & {Owner phone}, "")'));
  raise notice '1 PASS — "Balance due" = {Visit fee} - {Deposit taken} stored as text and as %.', v_doc -> 'config' -> 'expr';

  -- ══ PART 2 — THE PARSER'S REFUSAL, IN ITS OWN WORDS. ═════════════════════════════════
  begin
    perform custom.field_declare(v_org, v_appts, jsonb_build_object(
      'key', 'recheck', 'label', 'Recheck', 'type', 'formula', 'formula_text', 'DATEADD({Visit date}, 14)'));
    raise exception '2a: a formula with too few values for DATEADD was stored';
  exception when check_violation then
    get stacked diagnostics v_caught = message_text;
    if v_caught not like '%`DATEADD` was given 2 values. Use DATEADD(date, count, ''days'' | ''months'' | ''years'')%' then
      raise exception '2a: refused, but not in the parser''s words: %', v_caught;
    end if;
  end;
  begin
    perform custom.field_declare(v_org, v_appts, jsonb_build_object(
      'key', 'chart', 'label', 'Chart', 'type', 'formula', 'formula_text', '{Chart number} + 1'));
    raise exception '2b: a formula over a column that does not exist was stored';
  exception when check_violation then
    get stacked diagnostics v_caught = message_text;
    if v_caught not like '%There is no column called {Chart number}.%' then raise exception '2b: %', v_caught; end if;
  end;
  raise notice '2 PASS — refused as the older grid refuses: "%".', v_caught;

  -- ══ PART 3 — THE STORE WORKS IT OUT ON READ, FROM MARISOL'S SEAT. ═════════════════════
  perform set_config('request.jwt.claims', c_dana_j, true);
  v_rec := custom.read_record(v_org, r1, false);
  if (v_rec ->> 'balance_due')::numeric is distinct from 135 or coalesce(v_rec ->> 'desk_action', '') is distinct from '' then
    raise exception '3a: Biscuit''s balance is not 185 - 50 = 135 on read: %', v_rec;
  end if;
  v_rec := custom.read_record(v_org, r7, false);
  if v_rec ->> 'desk_action' is distinct from 'Call (541) 912-4470' or (v_rec ->> 'balance_due')::numeric is distinct from 135 then
    raise exception '3b: Rocco''s no-show does not read "Call (541) 912-4470": %', v_rec;
  end if;
  v_rec := custom.read_record(v_org, r9, false);
  if (v_rec ->> 'balance_due')::numeric is distinct from 0 then
    raise exception '3c: Ziggy has no fee and no deposit; blank is 0 in arithmetic, so the balance is 0: %', v_rec ->> 'balance_due';
  end if;
  begin
    perform custom.record_update(v_org, r1, jsonb_build_object('balance_due', 99));
    raise exception '3d: a worked-out column was typed over';
  exception when check_violation then null;
  end;
  raise notice '3 PASS — Biscuit 135, Rocco "Call (541) 912-4470", Ziggy 0 (blank is 0); typing over the formula refused.';

  -- ══ PART 4 — field_update: text replaces text; a bare expression drops the text. ════════
  perform set_config('request.jwt.claims', c_admin_j, true);
  perform custom.field_update(v_org, f_balance, jsonb_build_object('formula_text', 'ROUND(({Visit fee} - {Deposit taken}) * 1.03, 2)'));
  perform set_config('role', 'postgres', true);
  select f.data into v_doc from custom.record f where f.id = f_balance;
  perform set_config('role', 'authenticated', true);
  if coalesce(v_doc -> 'config' ->> 'formula_text', '') not like 'ROUND(%' or v_doc -> 'config' -> 'expr' ->> 'op' is distinct from 'fx.round' then
    raise exception '4a: the edited text did not replace the formula: %', v_doc -> 'config';
  end if;
  v_rec := custom.read_record(v_org, r1, false);
  if (v_rec ->> 'balance_due')::numeric is distinct from 139.05 then
    raise exception '4b: (185 - 50) × 1.03 is 139.05, read %', v_rec ->> 'balance_due';
  end if;
  perform custom.field_update(v_org, f_balance, jsonb_build_object('expr',
    jsonb_build_object('op', 'fx.sub', 'args', jsonb_build_array(
      jsonb_build_object('field', (select v from gp where k = 'f_fee')),
      jsonb_build_object('field', (select v from gp where k = 'f_deposit'))))));
  perform set_config('role', 'postgres', true);
  select f.data into v_doc from custom.record f where f.id = f_balance;
  perform set_config('role', 'authenticated', true);
  if v_doc -> 'config' ? 'formula_text' then
    raise exception '4c: a hand-written expression kept the old text beside it: %', v_doc -> 'config';
  end if;
  raise notice '4 PASS — the edited text reads 139.05 on Biscuit; a hand-written expression drops the text it no longer matches.';

  -- ══ PART 5 — THE DISPLAY FORMAT: 34 ids, stored, read back, refused by name. ════════════
  if v_doc -> 'display_format' ->> 'id' is distinct from 'currency' then
    raise exception '5a: the display format did not survive two updates: %', v_doc -> 'display_format';
  end if;
  begin
    perform custom.field_update(v_org, f_balance, jsonb_build_object('display_format', jsonb_build_object('id', 'sparkline')));
    raise exception '5b: a display format the grid cannot draw was stored';
  exception when check_violation then
    get stacked diagnostics v_caught = message_text;
    if v_caught not like '%sparkline%' then raise exception '5b: %', v_caught; end if;
  end;
  perform custom.field_update(v_org, (select v from gp where k = 'f_phone'), jsonb_build_object('display_format', 'phone'));
  perform set_config('role', 'postgres', true);
  select count(*) into v_n from unnest(custom.display_format_ids());
  select f.data into v_doc from custom.record f where f.id = (select v from gp where k = 'f_phone');
  perform set_config('role', 'authenticated', true);
  if v_n is distinct from 34 or v_doc -> 'display_format' ->> 'id' is distinct from 'phone' then
    raise exception '5c: % formats, and Owner phone reads %', v_n, v_doc -> 'display_format';
  end if;
  raise notice '5 PASS — currency survives two formula edits; "sparkline" refused by name; Owner phone is drawn as a phone; the grid''s 34 formats.';

  -- ══ PART 6 — AUTONUMBER: the store's, once, never typed, never reused. ═══════════════════
  f_number := custom.field_declare(v_org, v_appts, jsonb_build_object('key', 'visit_number', 'label', 'Visit number', 'type', 'autonumber', 'sort', 5));
  perform set_config('request.jwt.claims', c_dana_j, true);
  v_new := custom.record_write(v_org, v_appts, jsonb_build_object('patient', 'Clementine (Osei)', 'species', 'Cat',
             'visit_status', 'Scheduled', 'visit_on', '2026-09-23', 'visit_fee', 142.5, 'owner_phone', '(541) 290-5518'));
  v_new2 := custom.record_write(v_org, v_appts, jsonb_build_object('patient', 'Duke (Marchetti)', 'species', 'Dog',
             'visit_status', 'Scheduled', 'visit_on', '2026-09-23', 'visit_fee', 185, 'owner_phone', '(541) 774-0391'));
  if (custom.read_record(v_org, v_new, false) ->> 'visit_number')::integer is distinct from 1
     or (custom.read_record(v_org, v_new2, false) ->> 'visit_number')::integer is distinct from 2 then
    raise exception '6a: two new visits were not numbered 1 and 2: % %',
      custom.read_record(v_org, v_new, false) ->> 'visit_number', custom.read_record(v_org, v_new2, false) ->> 'visit_number';
  end if;
  perform custom.record_update(v_org, v_new, jsonb_build_object('visit_status', 'Checked in'));
  if (custom.read_record(v_org, v_new, false) ->> 'visit_number')::integer is distinct from 1 then
    raise exception '6b: checking Clementine in renumbered her visit';
  end if;
  begin
    perform custom.record_update(v_org, v_new, jsonb_build_object('visit_number', 7));
    raise exception '6c: an autonumber was typed over';
  exception when check_violation then null;
  end;
  perform custom.record_delete(v_org, v_new2);
  v_new2 := custom.record_write(v_org, v_appts, jsonb_build_object('patient', 'Winnie (Adeyemi)', 'species', 'Dog',
             'visit_status', 'Scheduled', 'visit_on', '2026-09-24', 'visit_fee', 98, 'owner_phone', '(541) 612-8840'));
  if (custom.read_record(v_org, v_new2, false) ->> 'visit_number')::integer is distinct from 3 then
    raise exception '6d: after Duke''s visit was archived, the next visit took number % instead of 3', custom.read_record(v_org, v_new2, false) ->> 'visit_number';
  end if;
  raise notice '6 PASS — Clementine 1, Duke 2, Clementine still 1 after check-in, typing 7 refused, Duke archived and Winnie gets 3 (never 2 again).';

  -- ══ PART 7 — CREATED / MODIFIED TIME: the record's own stamps. ═══════════════════════════
  perform set_config('request.jwt.claims', c_admin_j, true);
  f_created  := custom.field_declare(v_org, v_appts, jsonb_build_object('key', 'booked_at',  'label', 'Booked at',  'type', 'created_time', 'sort', 200));
  f_modified := custom.field_declare(v_org, v_appts, jsonb_build_object('key', 'changed_at', 'label', 'Last changed', 'type', 'modified_time', 'sort', 210));
  perform set_config('role', 'postgres', true);
  select r.created_at, r.updated_at into v_created, v_updated from custom.record r where r.id = v_new;
  select f.data into v_doc from custom.record f where f.id = f_created;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', c_dana_j, true);
  v_rec := custom.read_record(v_org, v_new, false);
  if (v_rec ->> 'booked_at')::timestamptz is distinct from date_trunc('milliseconds', v_created)
     or (v_rec ->> 'changed_at')::timestamptz is distinct from date_trunc('milliseconds', v_updated)
     or v_doc -> 'display_format' ->> 'id' is distinct from 'created_time' then
    raise exception '7: the stamps are not the record''s own: booked % vs %, changed % vs %, format %',
      v_rec ->> 'booked_at', v_created, v_rec ->> 'changed_at', v_updated, v_doc -> 'display_format';
  end if;
  raise notice '7 PASS — Booked at % and Last changed % are Clementine''s own stamps, drawn as created_time.', v_rec ->> 'booked_at', v_rec ->> 'changed_at';

  -- ══ PART 8 — THE PARSE DOOR, AND NOBODY OUTSIDE THE CLINIC. ═════════════════════════════
  v_doc := custom.formula_parse(v_org, v_appts, 'DATEDIFF({Booked at}, TODAY(), ''days'')');
  if not (v_doc ->> 'ok')::boolean or v_doc ->> 'result_type' is distinct from 'number' or jsonb_array_length(v_doc -> 'references') is distinct from 1 then
    raise exception '8a: Marisol cannot preview a formula over the day sheet: %', v_doc;
  end if;
  perform set_config('request.jwt.claims', c_stranger_j, true);
  begin
    perform custom.formula_parse(v_org, v_appts, '{Visit fee}');
    raise exception '8b: a stranger learned the clinic''s column names through the parser';
  exception when insufficient_privilege then null;
  end;
  raise notice '8 PASS — Marisol previews DATEDIFF({Booked at}, TODAY(), ''days'') as a number over one column; a stranger is refused (42501).';

  raise notice 'GRIDPRIM G3 GREEN — every part passed.';
end
$t$;

rollback;
