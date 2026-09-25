-- LANE GRID-PRIMITIVES, G2 — THE GREEN SUITE. A row action is declared once and runs on a whole
-- selection in one transaction; a refusal names the record and the field, and then nothing moved.
--
-- THE USE CASE (scripts/campaign-tests/_gridprim_clinic.sql): Marisol Vega (test@test.com), front
-- desk at Cedar Ridge Veterinary Clinic, keeps three buttons on the Appointments day sheet —
-- "Check in" (Visit status → Checked in, clear the desk note), "Take full payment" (Deposit taken
-- := the visit fee, worked out by the store) and "Ask Dr. Whitfield" (hands the visit to an agent
-- through the record chat). The clinic's card reader caps a deposit at $300.
--
-- WHAT MAKES IT FAIL — one production change per part:
--   1  custom.action_declare storing a step on a worked-out column, a duplicate name, an agent
--      with nothing to ask, or a formula the store cannot parse.
--   2  action_run leaving part of a selection changed when one record refuses — the older grid's
--      defect this door exists to close.
--   3  a refusal that does not name the record and the field.
--   4  a formula step worked out by the browser instead of the store (the value would not match
--      the record it ran on).
--   5  an agent action "run" as a fixed change.
--   6  a record of another table, or a stranger, reaching the run.
--
-- FAILING-THEN-PASSING: before gridprim_a_row_action_runs_the_whole_selection_at_once.sql is
-- applied, part 1 fails (`function custom.action_declare(...) does not exist`).

\set ON_ERROR_STOP on
\timing off

\set suite 'gridprim_g2_green.sql'
\set requires 'function:custom.record_update|function:custom.formula_eval'
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
  v_org uuid; v_appts uuid; f_status uuid; f_notes uuid; f_deposit uuid; f_fee uuid; f_patient uuid;
  r1 uuid; r3 uuid; r5 uuid; r6 uuid; r8 uuid; s1 uuid;
  f_balance uuid;
  v_list jsonb; v_res jsonb; v_caught text; v_detail text; v_hint text;
  a_checkin uuid; a_pay uuid; a_ask uuid; a_blank uuid; v_rec jsonb;
begin
  select v into v_org from gp where k = 'org';        select v into v_appts from gp where k = 'appts';
  select v into f_status from gp where k = 'f_status'; select v into f_notes from gp where k = 'f_notes';
  select v into f_deposit from gp where k = 'f_deposit'; select v into f_fee from gp where k = 'f_fee';
  select v into f_patient from gp where k = 'f_patient';
  select v into r1 from gp where k = 'r1'; select v into r3 from gp where k = 'r3'; select v into r5 from gp where k = 'r5';
  select v into r6 from gp where k = 'r6'; select v into r8 from gp where k = 'r8'; select v into s1 from gp where k = 's1';

  perform set_config('request.jwt.claims', c_admin_j, true);
  perform set_config('role', 'authenticated', true);
  if current_user is distinct from 'authenticated' then raise exception '0: not seated'; end if;
  -- The practice manager's two settings: the card reader's cap, and a worked-out Balance column.
  perform custom.field_update(v_org, f_deposit, jsonb_build_object('rules', jsonb_build_array(jsonb_build_object('kind', 'max', 'value', 300))));
  f_balance := custom.field_declare(v_org, v_appts, jsonb_build_object('key', 'balance_due', 'label', 'Balance due',
                 'type', 'formula', 'formula_text', '{Visit fee} - {Deposit taken}', 'sort', 90));
  perform set_config('request.jwt.claims', c_dana_j, true);
  raise notice '0 PASS — seated as Marisol (test@test.com); the clinic caps a deposit at $300.';

  -- ══ PART 1 — THE LIST, JUDGED WHOLE. ═══════════════════════════════════════════════════
  begin
    perform custom.action_declare(v_org, v_appts, jsonb_build_array(jsonb_build_object('name', 'Zero the balance',
      'steps', jsonb_build_array(jsonb_build_object('field', f_balance, 'set', 'value', 'value', 0)))));
    raise exception '1a: a step that sets a worked-out column was stored';
  exception when invalid_parameter_value then
    get stacked diagnostics v_caught = message_text;
    if v_caught not like '%Balance due%worked out by the store%' then raise exception '1a: %', v_caught; end if;
  end;
  begin
    perform custom.action_declare(v_org, v_appts, jsonb_build_array(
      jsonb_build_object('name', 'Check in', 'steps', jsonb_build_array(jsonb_build_object('field', f_notes, 'set', 'clear'))),
      jsonb_build_object('name', 'check in', 'steps', jsonb_build_array(jsonb_build_object('field', f_notes, 'set', 'clear')))));
    raise exception '1b: two buttons called "Check in" were stored';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform custom.action_declare(v_org, v_appts, jsonb_build_array(jsonb_build_object('name', 'Ask Dr. Whitfield', 'kind', 'agent')));
    raise exception '1c: an agent action with nothing to ask was stored';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform custom.action_declare(v_org, v_appts, jsonb_build_array(jsonb_build_object('name', 'Take full payment',
      'steps', jsonb_build_array(jsonb_build_object('field', f_deposit, 'set', 'compute', 'formula_text', '{Visit fee} *')))));
    raise exception '1d: a formula the store cannot read was stored';
  exception when invalid_parameter_value then
    get stacked diagnostics v_caught = message_text;
    if v_caught not like '%The formula stops before it is finished.%' then raise exception '1d: %', v_caught; end if;
  end;
  v_list := custom.action_declare(v_org, v_appts, jsonb_build_array(
    jsonb_build_object('name', 'Check in', 'color', 'green', 'icon', 'LogIn', 'steps', jsonb_build_array(
      jsonb_build_object('field', f_status, 'set', 'value', 'value', 'Checked in'),
      jsonb_build_object('field', f_notes, 'set', 'clear'))),
    jsonb_build_object('name', 'Take full payment', 'confirm', true, 'steps', jsonb_build_array(
      jsonb_build_object('field', f_deposit, 'set', 'compute', 'formula_text', '{Visit fee}'))),
    jsonb_build_object('name', 'Clear the patient', 'steps', jsonb_build_array(
      jsonb_build_object('field', f_patient, 'set', 'clear'))),
    jsonb_build_object('name', 'Ask Dr. Whitfield', 'kind', 'agent',
      'prompt', 'Review this visit and draft the discharge instructions for the owner.')));
  select (a ->> 'id')::uuid into a_checkin from jsonb_array_elements(v_list) a where a ->> 'name' = 'Check in';
  select (a ->> 'id')::uuid into a_pay     from jsonb_array_elements(v_list) a where a ->> 'name' = 'Take full payment';
  select (a ->> 'id')::uuid into a_blank   from jsonb_array_elements(v_list) a where a ->> 'name' = 'Clear the patient';
  select (a ->> 'id')::uuid into a_ask     from jsonb_array_elements(v_list) a where a ->> 'name' = 'Ask Dr. Whitfield';
  if a_checkin is null or a_pay is null or a_ask is null
     or (select a -> 'steps' -> 0 ->> 'formula_text' from jsonb_array_elements(v_list) a where a ->> 'name' = 'Take full payment') is distinct from '{Visit fee}' then
    raise exception '1e: the four buttons were not stored with ids and the formula text: %', v_list;
  end if;
  v_res := custom.row_actions(v_org, v_appts);
  if jsonb_array_length(v_res -> 'actions') <> 4 or jsonb_array_length(v_res -> 'stale') <> 0
     or (select (a ->> 'runnable')::boolean from jsonb_array_elements(v_res -> 'actions') a where a ->> 'name' = 'Ask Dr. Whitfield') then
    raise exception '1f: the read does not give back four buttons with the agent one not runnable here: %', v_res;
  end if;
  raise notice '1 PASS — a worked-out column, two "Check in"s, an agent with nothing to ask and "{Visit fee} *" all refused; four buttons stored.';

  -- ══ PART 2 — "CHECK IN" ON THREE ARRIVALS: ONE TRANSACTION, ALL THREE. ═══════════════════
  v_res := custom.action_run(v_org, a_checkin, array[r5, r6, r8]);
  if (v_res ->> 'ran')::integer is distinct from 3 then raise exception '2a: three arrivals, % checked in: %', v_res ->> 'ran', v_res; end if;
  if custom.read_record(v_org, r5, false) ->> 'visit_status' is distinct from 'Checked in'
     or custom.read_record(v_org, r8, false) ->> 'visit_status' is distinct from 'Checked in'
     or custom.read_record(v_org, r8, false) ? 'desk_notes' and custom.read_record(v_org, r8, false) ->> 'desk_notes' is not null then
    raise exception '2b: Tango and Maple are not checked in with their desk note cleared: % / %',
      custom.read_record(v_org, r5, false), custom.read_record(v_org, r8, false);
  end if;
  raise notice '2 PASS — Tango, Olive and Maple checked in by one call; Maple''s "Post-op check, TPLO" note cleared.';

  -- ══ PART 3 — A FORMULA STEP, WORKED OUT BY THE STORE ON EACH RECORD. ═════════════════════
  v_res := custom.action_run(v_org, a_pay, array[r1, (select v from gp where k = 'r4')]);
  if (custom.read_record(v_org, r1, false) ->> 'deposit')::numeric is distinct from 185
     or (custom.read_record(v_org, (select v from gp where k = 'r4'), false) ->> 'deposit')::numeric is distinct from 98
     or (custom.read_record(v_org, r1, false) ->> 'balance_due')::numeric is distinct from 0 then
    raise exception '3: "Take full payment" did not set each deposit to that visit''s own fee: %', custom.read_record(v_org, r1, false);
  end if;
  raise notice '3 PASS — Biscuit''s deposit is his $185 and Pepper''s her $98, each worked out on its own record; Balance due reads 0.';

  -- ══ PART 4 — ONE REFUSES, NOTHING MOVES, AND THE REFUSAL NAMES RECORD AND FIELD. ═════════
  -- Moose's visit is $365 and the card reader caps a deposit at $300; Juniper's is $142.50.
  begin
    perform custom.action_run(v_org, a_pay, array[(select v from gp where k = 'r2'), r3]);
    raise exception '4a: a selection with a refused record ran';
  exception when check_violation then
    get stacked diagnostics v_caught = message_text, v_detail = pg_exception_detail, v_hint = pg_exception_hint;
  end;
  if (custom.read_record(v_org, (select v from gp where k = 'r2'), false) ->> 'deposit')::numeric is distinct from 50 then
    raise exception '4b: Juniper''s deposit moved although Moose''s refused — the selection was not one transaction';
  end if;
  if v_caught not like '%Take full payment%changed nothing%1 of the 2%Moose (Delgado)%Deposit taken%'
     or jsonb_array_length(v_detail::jsonb) is distinct from 1
     or (v_detail::jsonb -> 0 ->> 'record_id')::uuid is distinct from r3
     or (v_detail::jsonb -> 0 ->> 'field_id')::uuid is distinct from f_deposit then
    raise exception '4c: the refusal does not name Moose and Deposit taken: % / %', v_caught, v_detail;
  end if;
  -- Every refusal of the selection is listed, not only the first.
  begin
    perform custom.action_run(v_org, a_blank, array[r1, r3, s1]);
    raise exception '4d: clearing a required column ran';
  exception when check_violation then
    get stacked diagnostics v_caught = message_text, v_detail = pg_exception_detail;
  end;
  if jsonb_array_length(v_detail::jsonb) is distinct from 3
     or not exists (select 1 from jsonb_array_elements(v_detail::jsonb) d where d ->> 'record_id' = s1::text and d ->> 'says' like '%not a live record of Appointments%')
     or not exists (select 1 from jsonb_array_elements(v_detail::jsonb) d where d ->> 'record' = 'Biscuit (Hollis)' and d ->> 'field' = 'Patient') then
    raise exception '4e: three refusals (two required patients, one Supplier) were not all named: %', v_detail;
  end if;
  if custom.read_record(v_org, r1, false) ->> 'patient' is distinct from 'Biscuit (Hollis)' then
    raise exception '4f: Biscuit lost his name although the selection refused';
  end if;
  raise notice '4 PASS — Moose''s $365 refused on Deposit taken and Juniper''s deposit untouched; clearing Patient on two visits and a Supplier names all three and changes none. First: "%".', v_caught;

  -- ══ PART 5 — AN AGENT ACTION IS THE RECORD CHAT'S, NOT A FIXED CHANGE. ═══════════════════
  begin
    perform custom.action_run(v_org, a_ask, array[r1]);
    raise exception '5: an agent action ran as a fixed change';
  exception when invalid_parameter_value then
    get stacked diagnostics v_caught = message_text, v_hint = pg_exception_hint;
    if v_hint not like '%record''s chat%' then raise exception '5: refused without saying where it goes: %', v_hint; end if;
  end;
  raise notice '5 PASS — "Ask Dr. Whitfield" is refused here and sent to the record chat: "%".', v_hint;

  -- ══ PART 6 — NOBODY OUTSIDE THE CLINIC. ═══════════════════════════════════════════════════
  perform set_config('request.jwt.claims', c_stranger_j, true);
  begin
    perform custom.action_run(v_org, a_checkin, array[r1]);
    raise exception '6a: a stranger ran the clinic''s button';
  exception when insufficient_privilege then null;
  end;
  begin
    perform custom.row_actions(v_org, v_appts);
    raise exception '6b: a stranger read the clinic''s buttons';
  exception when insufficient_privilege then null;
  end;
  begin
    perform custom.action_declare(v_org, v_appts, '[]'::jsonb);
    raise exception '6c: a stranger removed the clinic''s buttons';
  exception when insufficient_privilege then null;
  end;
  raise notice '6 PASS — a person in no organization with the clinic is refused all three doors (42501).';

  raise notice 'GRIDPRIM G2 GREEN — every part passed.';
end
$t$;

rollback;
