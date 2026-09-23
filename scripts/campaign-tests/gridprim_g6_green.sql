-- LANE GRID-PRIMITIVES, G6 — A RULE SPEAKS THE FORMULA LANGUAGE.
--
-- THE USE CASE (_gridprim_clinic.sql): Dr. Ana Whitfield (admin@admin.com) sets the rule Cedar
-- Ridge Veterinary Clinic's front desk already follows by hand — "a visit of $300 or more needs a
-- deposit before it is booked" — as a Rule written in the formula language
-- (OR(fee < 300, NOT(ISBLANK(deposit)))). Marisol Vega (test@test.com) books visits.
--
-- WHAT MAKES IT FAIL:
--   1  _rule_shape_guard refusing to STORE a Rule with fx.* nodes (rule_node_kinds lacks them).
--   2  custom.rule_eval refusing an fx.* node at evaluation ("does not know how").
--   3  the Rule not stopping a $410 booking with no deposit, or stopping one that has it.
-- RED before gridprim_a_rule_speaks_the_formula_language.sql (part 1: "asks the system to fx.or").

\set ON_ERROR_STOP on
\timing off
\set suite 'gridprim_g6_green.sql'
\set requires 'function:custom.formula_eval|function:custom.rule_declare'
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
  v_org uuid; v_appts uuid; f_fee uuid; f_dep uuid; v_rule uuid; v_expr jsonb; v_ok uuid; v_caught text; v_ans jsonb;
begin
  select v into v_org from gp where k = 'org'; select v into v_appts from gp where k = 'appts';
  select v into f_fee from gp where k = 'f_fee'; select v into f_dep from gp where k = 'f_deposit';
  v_expr := jsonb_build_object('op', 'fx.or', 'args', jsonb_build_array(
              jsonb_build_object('op', 'fx.lt', 'args', jsonb_build_array(jsonb_build_object('field', f_fee), jsonb_build_object('const', 300))),
              jsonb_build_object('op', 'fx.not', 'args', jsonb_build_array(
                jsonb_build_object('op', 'fx.isblank', 'args', jsonb_build_array(jsonb_build_object('field', f_dep)))))));
  perform set_config('request.jwt.claims', c_admin_j, true);
  perform set_config('role', 'authenticated', true);
  if current_user is distinct from 'authenticated' then raise exception '0: not seated'; end if;

  -- PART 1 — the Rule is STORED.
  v_rule := custom.rule_declare(v_org, jsonb_build_object(
    'name', 'A visit of $300 or more needs a deposit', 'kind', 'predicate',
    'uses', jsonb_build_array('validate'), 'scope_table_id', v_appts,
    'applies_to_types', '[]'::jsonb, 'expr', v_expr), null);
  raise notice '1 PASS — the deposit Rule, written in the formula language, is stored (%).', v_rule;

  -- PART 2 — rule_eval answers it, through formula_eval (the store's own evaluator, not a client door).
  perform set_config('role', 'postgres', true);
  v_ans := custom.rule_eval(v_org, v_expr, jsonb_build_object('visit_fee', 410, 'deposit', null), '{}'::jsonb);
  if v_ans is distinct from 'false'::jsonb then raise exception '2a: a $410 visit with no deposit read %', v_ans; end if;
  v_ans := custom.rule_eval(v_org, v_expr, jsonb_build_object('visit_fee', 410, 'deposit', 150), '{}'::jsonb);
  if v_ans is distinct from 'true'::jsonb then raise exception '2b: a $410 visit with a $150 deposit read %', v_ans; end if;
  v_ans := custom.rule_eval(v_org, v_expr, jsonb_build_object('visit_fee', 142.5), '{}'::jsonb);
  if v_ans is distinct from 'true'::jsonb then raise exception '2c: a $142.50 visit read %', v_ans; end if;
  perform set_config('role', 'authenticated', true);
  raise notice '2 PASS — custom.rule_eval: $410 with no deposit false, with $150 true, $142.50 true.';

  -- PART 3 — the store enforces it on Marisol's booking.
  perform set_config('request.jwt.claims', c_dana_j, true);
  begin
    perform custom.record_write(v_org, v_appts, jsonb_build_object('patient', 'Duke (Marchetti)', 'species', 'Dog',
      'visit_status', 'Scheduled', 'visit_on', '2026-09-24', 'visit_fee', 410, 'owner_phone', '(541) 774-0391'));
    raise exception '3a: a $410 booking with no deposit was accepted';
  exception when check_violation then
    get stacked diagnostics v_caught = message_text;
  end;
  v_ok := custom.record_write(v_org, v_appts, jsonb_build_object('patient', 'Duke (Marchetti)', 'species', 'Dog',
    'visit_status', 'Scheduled', 'visit_on', '2026-09-24', 'visit_fee', 410, 'deposit', 150, 'owner_phone', '(541) 774-0391'));
  raise notice '3 PASS — Duke''s $410 booking is refused without a deposit ("%") and booked with $150.', v_caught;
  raise notice 'GRIDPRIM G6 GREEN — every part passed.';
end $t$;
rollback;
