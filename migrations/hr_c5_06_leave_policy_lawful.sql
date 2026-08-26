-- HR domain, C5 / register item HRB-009, file 06 -- hr._leave_policy_lawful GETS ITS COMPARISON.
--
-- Authority: /projects/hr-domain/specs/SPEC-JURISDICTION.md sections 3.1 (what an organization
-- may and may never configure), 3.2 (the config-validation contract) and 2.7 (absence semantics).
-- Discharges the debt core-tranche-2 recorded on HRB-006 decision 6 and the coordinator carried
-- to this row: "Owed to HRB-009 / SPEC-JURISDICTION: hr.jurisdiction_evaluate(...) and the leave
-- parameter-key contract."
--
-- WHAT THE STUB DID, AND WHY IT WAS RIGHT TO. Tranche 2 shipped a trigger that RESOLVED the
-- applicable rule set, PASSED when that set was empty, and RAISED the moment a rule existed with
-- no evaluator to apply it. That was the correct fail-closed posture: writing the comparison then
-- would have meant inventing the rule-parameter key vocabulary this spec owns. The vocabulary now
-- exists, so the trigger stops raising and starts comparing.
--
-- 🚨 THE LEAVE PARAMETER-KEY CONTRACT -- the thing that was actually missing. A leave policy is
-- stored as COLUMNS and a jurisdiction rule is stored as PARAMETERS, and nothing connected the
-- two. This is that map, and it is deliberately the only one:
--
--   hr.leave_policy column          rule class                  rule parameter key
--   ------------------------------  --------------------------  ----------------------------
--   carryover_allowed = false       pto-carryover-legality      forfeiture_allowed
--   accrual_rate / accrual_per_units sick-leave-floor           accrual.hours_earned /
--                                                                accrual.per_hours_worked
--   usable_after_days               sick-leave-floor            use_permitted_after_days
--   carryover_allowed               sick-leave-floor            carryover.required
--   payout_on_termination = never   pto-payout-at-termination   required
--
-- 🚨 AND IT VALIDATES THROUGH hr.validate_org_config, NOT THROUGH A SECOND PREDICATE. Settings-
-- ladder rule 6 says one validation predicate at every rung. A leave policy is an organization
-- configuring against a statutory floor -- exactly what the config validator already refuses --
-- so the trigger TRANSLATES the row into the class's parameter shape and calls the one validator.
-- The HR administrator sees the same sentence whether they hit it from the settings screen or by
-- saving a leave policy, because it is literally the same sentence.
--
-- A class with no comparator in the validator is NOT silently passed and is NOT blocked either:
-- it raises a compliance exception naming the gap, so an uncompared policy is visible rather
-- than assumed lawful.
--
-- Idempotent. Applied live as migration `hr_c5_06_leave_policy_lawful`.

set local lock_timeout = '20s';

create or replace function hr._leave_policy_lawful()
returns trigger
language plpgsql
as $fn$
declare
  v_key text; v_keys text[]; v_params jsonb; v_res jsonb; v_v jsonb;
  v_sys constant uuid := '39c38960-d30c-4840-b0c1-c9960de95582';
  v_stat jsonb; v_bad jsonb;
begin
  if new.statutory_basis_rule_class is null then
    -- The policy claims no statutory basis, so there is no floor to be below. Internal
    -- consistency (caps ordered, carryover coherent, non-negative periods) is enforced by this
    -- table's own CHECK constraints, which is why this trigger does not re-check any of it.
    return new;
  end if;

  if not exists (select 1 from hr.jurisdiction_rule_class
                  where slug = new.statutory_basis_rule_class and deleted_at is null) then
    raise exception 'hr.leave_policy: statutory_basis_rule_class "%" is not a rule class',
      new.statutory_basis_rule_class using errcode = '23514';
  end if;

  if new.statutory_jurisdiction_id is not null then
    select j.key into v_key from hr.jurisdiction j where j.id = new.statutory_jurisdiction_id;
    v_keys := array[v_key];
  else
    -- section 3.2: with no jurisdiction named, validate against EVERY jurisdiction the
    -- organization currently operates in. NULL makes the validator derive them itself.
    v_keys := null;
  end if;

  -- ------------------------------------------------------------------ the parameter-key contract
  if new.statutory_basis_rule_class = 'pto-carryover-legality' then
    v_params := jsonb_build_object('carryover_policy',
                  case when new.carryover_allowed then 'cap' else 'forfeit' end);

  elsif new.statutory_basis_rule_class = 'sick-leave-floor' then
    v_params := jsonb_build_object(
      'use_permitted_after_days', new.usable_after_days,
      'accrual', case when new.accrual_method = 'per_hours_worked'
                      then jsonb_build_object('method','per_hours_worked',
                             'hours_earned', new.accrual_rate,
                             'per_hours_worked', new.accrual_per_units)
                      else jsonb_build_object('method', new.accrual_method) end,
      'carryover', jsonb_build_object('required', new.carryover_allowed));

  elsif new.statutory_basis_rule_class = 'pto-payout-at-termination' then
    -- The validator carries no predicate for this class, but hr._org_row_less_protective does,
    -- and reusing it is not a second validator -- it is the same comparator the runtime clamp
    -- uses. 'jurisdiction' and 'always' can never be below the floor; only 'never' can.
    if new.payout_on_termination = 'never' then
      for v_stat in
        select x from jsonb_array_elements(
          coalesce(hr.resolve_rules(null, null, current_date,
            array['pto-payout-at-termination'], '{}'::jsonb, new.organization_id,
            coalesce(v_key, 'US'))#>'{resolved,pto-payout-at-termination,rules}', '[]'::jsonb)) x
      loop
        if (v_stat->>'status') = 'active' then
          v_bad := hr._org_row_less_protective('pto-payout-at-termination',
                     '{"required":false}'::jsonb, v_stat->'parameters');
          if jsonb_array_length(v_bad) > 0 then
            raise exception E'%',
              format('%s requires accrued time to be paid out when employment ends, so a policy '
                  || 'that never pays it out is not allowed. Set payout to "jurisdiction" so the '
                  || 'law decides, or to "always".', v_stat->>'jurisdiction_key')
              using errcode = '23514', hint = 'SPEC-JURISDICTION 3.1 / 3.2';
          end if;
        end if;
      end loop;
    end if;
    return new;

  else
    -- section 3.2 rule 6 is satisfied for the classes the validator compares. For any other
    -- class the honest answer is "we did not check", recorded where somebody sees it.
    perform hr.raise_compliance_exception(
      new.organization_id, coalesce(v_key, 'US'), null, null, new.statutory_basis_rule_class,
      'leave_policy_uncompared',
      format('The leave policy "%s" says it follows the %s rule, but we do not yet have a way to '
          || 'check a policy against that rule. It was saved without that check.',
             new.name, new.statutory_basis_rule_class));
    return new;
  end if;

  v_res := hr.validate_org_config(new.organization_id, new.statutory_basis_rule_class,
                                  v_params, v_keys, current_date);

  if (v_res->>'ok')::boolean is false then
    v_v := v_res#>'{violations,0}';
    raise exception E'%', v_v->>'message'
      using errcode = '23514',
            hint = format('SPEC-JURISDICTION 3.2: %s (rule %s, %s affected employee(s)). A violation '
                       || 'is a refusal, not a clamp -- telling an admin their policy is one thing '
                       || 'while the system does another is the worst of the three outcomes.',
                          v_v->>'code', v_v->>'rule_id', v_v->>'affected_employees');
  end if;

  return new;
end
$fn$;

-- ============================================================================
-- The probe that proves it, and its fixture row.
-- ============================================================================
create or replace function hr._leave_policy_probe(p_case text)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'hr', 'public'
as $fn$
declare
  v_org constant uuid := '5dc930e9-bd65-44a1-8369-af773f6e1a5b';
  v_obs jsonb := '{}'::jsonb; v_ca uuid; v_tx uuid; v_id uuid;
begin
  perform set_config('hr.privileged_write','on', true);
  select id into v_ca from hr.jurisdiction where key = 'US-CA';
  select id into v_tx from hr.jurisdiction where key = 'US-TX';
  begin
    -- 1. California + use-it-or-lose-it -> REFUSED, with the section 3.2 sentence
    begin
      insert into hr.leave_policy (organization_id, name, leave_kind, statutory_basis_rule_class,
        statutory_jurisdiction_id, accrual_method, accrual_rate, accrual_per_units, accrual_unit,
        carryover_allowed, payout_on_termination)
      values (v_org,'Probe CA forfeiture policy','vacation','pto-carryover-legality', v_ca,
        'per_hours_worked', 1, 30, 'hour', false, 'jurisdiction');
      v_obs := v_obs || '{"ca_forfeiture_refused": false}'::jsonb;
    exception when others then
      v_obs := v_obs || jsonb_build_object(
        'ca_forfeiture_refused', true,
        'message_is_the_canonical_sentence', sqlerrm = 'California does not allow a use-it-or-lose-it '
          || 'vacation policy — accrued vacation is earned wages that cannot be forfeited. You can cap '
          || 'how much an employee accrues (accrual stops at the cap until they use time), but unused '
          || 'time cannot expire. Set a cap instead of forfeiture.');
    end;

    -- 2. California + a cap -> ACCEPTED (a cap is lawful where forfeiture is not)
    begin
      insert into hr.leave_policy (organization_id, name, leave_kind, statutory_basis_rule_class,
        statutory_jurisdiction_id, accrual_method, accrual_rate, accrual_per_units, accrual_unit,
        carryover_allowed, carryover_cap, payout_on_termination)
      values (v_org,'Probe CA capped policy','vacation','pto-carryover-legality', v_ca,
        'per_hours_worked', 1, 30, 'hour', true, 80, 'jurisdiction')
      returning id into v_id;
      v_obs := v_obs || jsonb_build_object('ca_cap_accepted', v_id is not null);
    exception when others then
      v_obs := v_obs || jsonb_build_object('ca_cap_accepted', false, 'ca_cap_error', sqlerrm);
    end;

    -- 3. Texas + use-it-or-lose-it -> ACCEPTED (no rule forbids it)
    begin
      insert into hr.leave_policy (organization_id, name, leave_kind, statutory_basis_rule_class,
        statutory_jurisdiction_id, accrual_method, accrual_rate, accrual_per_units, accrual_unit,
        carryover_allowed, payout_on_termination)
      values (v_org,'Probe TX forfeiture policy','vacation','pto-carryover-legality', v_tx,
        'per_hours_worked', 1, 30, 'hour', false, 'jurisdiction')
      returning id into v_id;
      v_obs := v_obs || jsonb_build_object('tx_forfeiture_accepted', v_id is not null);
    exception when others then
      v_obs := v_obs || jsonb_build_object('tx_forfeiture_accepted', false, 'tx_error', sqlerrm);
    end;

    -- 4. California sick leave accruing SLOWER than the floor -> REFUSED
    begin
      insert into hr.leave_policy (organization_id, name, leave_kind, statutory_basis_rule_class,
        statutory_jurisdiction_id, accrual_method, accrual_rate, accrual_per_units, accrual_unit,
        usable_after_days, carryover_allowed, payout_on_termination)
      values (v_org,'Probe CA slow sick policy','sick','sick-leave-floor', v_ca,
        'per_hours_worked', 1, 40, 'hour', 90, true, 'jurisdiction');
      v_obs := v_obs || '{"ca_slow_accrual_refused": false}'::jsonb;
    exception when others then
      v_obs := v_obs || jsonb_build_object('ca_slow_accrual_refused', sqlerrm like '%at least as fast%');
    end;

    -- 5. A policy claiming NO statutory basis is never blocked by this trigger
    begin
      insert into hr.leave_policy (organization_id, name, leave_kind, accrual_method, accrual_rate,
        accrual_per_units, accrual_unit, carryover_allowed, payout_on_termination)
      values (v_org,'Probe unbasis policy','personal','per_hours_worked', 1, 30, 'hour', false, 'never')
      returning id into v_id;
      v_obs := v_obs || jsonb_build_object('no_basis_accepted', v_id is not null);
    exception when others then
      v_obs := v_obs || jsonb_build_object('no_basis_accepted', false, 'no_basis_error', sqlerrm);
    end;

    raise exception '__ROLLBACK_PROBE__';
  exception when others then
    if sqlerrm <> '__ROLLBACK_PROBE__' then
      v_obs := v_obs || jsonb_build_object('probe_error', sqlerrm);
    end if;
  end;
  return v_obs;
end
$fn$;

select set_config('hr.privileged_write', 'on', false);

insert into hr.jurisdiction_rule_test (
  organization_id, rule_class_id, code, title, jurisdiction_key, as_of_date,
  facts, input, expected, expected_status, assertion_mode)
select '39c38960-d30c-4840-b0c1-c9960de95582'::uuid, rc.id,
  'LP-CA-01',
  'A leave policy configuring use-it-or-lose-it in California is REFUSED by hr._leave_policy_lawful with the section 3.2 sentence -- and a cap, a Texas forfeiture policy and a policy with no statutory basis are all accepted',
  'US-CA', date '2026-03-16', '{}'::jsonb,
  '{"harness":"leave_policy_probe","probe":"all"}'::jsonb,
  $e${"ca_forfeiture_refused":true,"message_is_the_canonical_sentence":true,"ca_cap_accepted":true,
      "tx_forfeiture_accepted":true,"ca_slow_accrual_refused":true,"no_basis_accepted":true}$e$::jsonb,
  'asserted','exact'
from hr.jurisdiction_rule_class rc where rc.slug = 'pto-carryover-legality'
  and not exists (select 1 from hr.jurisdiction_rule_test t where t.code = 'LP-CA-01');

-- the runner learns the one new harness
create or replace function hr.run_rule_fixtures(p_codes text[] default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'hr', 'public'
as $fn$
declare
  v_f record; v_actual jsonb; v_pass boolean; v_err text;
  v_results jsonb := '[]'::jsonb; v_pass_n integer := 0; v_fail_n integer := 0; v_pend integer := 0;
  v_ev jsonb; v_harness text;
begin
  for v_f in
    select t.*, rc.slug as class_slug
      from hr.jurisdiction_rule_test t
      join hr.jurisdiction_rule_class rc on rc.id = t.rule_class_id
     where t.deleted_at is null and (p_codes is null or t.code = any(p_codes))
     order by t.code
  loop
    v_actual := null; v_err := null; v_harness := coalesce(v_f.input->>'harness','calc');
    begin
      if v_harness = 'calc' then
        v_ev := hr.jurisdiction_evaluate(v_f.input->>'kind', v_f.jurisdiction_key, v_f.as_of_date,
                  v_f.facts, v_f.input, coalesce((v_f.input->>'organization_id')::uuid,
                  '39c38960-d30c-4840-b0c1-c9960de95582'::uuid));
        v_actual := coalesce(v_ev->'result','{}'::jsonb) || jsonb_build_object(
          'flags', v_ev->'flags', 'no_rule', v_ev->'no_rule', 'advisory', v_ev->'advisory',
          'incomplete', v_ev->'incomplete', 'money_withheld', v_ev->'money_withheld',
          'rules_applied', v_ev->'rules_applied');
      elsif v_harness = 'elapsed' then
        v_actual := jsonb_build_object('elapsed_hours', hr.elapsed_hours(
          (v_f.input->>'start_local')::timestamp, (v_f.input->>'end_local')::timestamp,
          v_f.input->>'tz'));
      elsif v_harness = 'resolve' then
        v_ev := hr.resolve_rules(null, null, v_f.as_of_date,
                  (select array_agg(x) from jsonb_array_elements_text(v_f.input->'classes') x),
                  v_f.facts, '39c38960-d30c-4840-b0c1-c9960de95582'::uuid, v_f.jurisdiction_key);
        v_actual := v_ev || jsonb_build_object(
          'chain_length', jsonb_array_length(v_ev->'chain'),
          'classes_accounted', (
            select count(distinct c) from (
              select jsonb_object_keys(v_ev->'resolved') c
              union all select jsonb_array_elements_text(v_ev->'no_rule')
              union all select x->>'class' from jsonb_array_elements(v_ev->'incomplete') x) s),
          'outcomes', (select jsonb_object_agg(t->>'jurisdiction_key', t->>'outcome')
                         from jsonb_array_elements(v_ev->'trace') t));
      elsif v_harness = 'config' then
        v_actual := hr.validate_org_config(
          coalesce((v_f.input->>'organization_id')::uuid,'5dc930e9-bd65-44a1-8369-af773f6e1a5b'::uuid),
          v_f.class_slug, v_f.input->'parameters',
          (select array_agg(x) from jsonb_array_elements_text(v_f.input->'jurisdiction_keys') x),
          v_f.as_of_date);
      elsif v_harness = 'probe' then
        v_actual := hr._run_fixture_probe(v_f.input->>'probe', v_f.input);
      elsif v_harness = 'leave_policy_probe' then
        v_actual := hr._leave_policy_probe(v_f.input->>'probe');
      else
        raise exception 'unknown_harness: %', v_harness;
      end if;
    exception when others then
      v_err := sqlerrm;
    end;

    if v_err is not null then v_pass := false; else v_pass := v_actual @> v_f.expected; end if;
    if v_pass then v_pass_n := v_pass_n + 1; else v_fail_n := v_fail_n + 1; end if;
    if v_f.expected_status = 'pending_verification' then v_pend := v_pend + 1; end if;

    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'code', v_f.code, 'title', v_f.title, 'class', v_f.class_slug,
      'jurisdiction_key', v_f.jurisdiction_key, 'passed', v_pass,
      'expected_status', v_f.expected_status, 'assertion_mode', v_f.assertion_mode,
      'expected', case when v_pass then null else v_f.expected end,
      'actual', case when v_pass then null else v_actual end,
      'error', v_err));
  end loop;

  return jsonb_build_object(
    'total', v_pass_n + v_fail_n, 'passed', v_pass_n, 'failed', v_fail_n,
    'pending_verification', v_pend, 'green', v_fail_n = 0,
    'ran_at', now(), 'results', v_results);
end
$fn$;

-- ============================================================================
-- 🚨 THE BLOCKING GATE, RE-RUN. 65 fixtures, and this file does not commit on a red suite.
-- ============================================================================
do $$
declare v_n integer; v_run jsonb; v_red text;
begin
  select count(*) into v_n from hr.jurisdiction_rule_test where deleted_at is null;
  if v_n <> 65 then
    raise exception 'hr_c5_06: expected 65 fixtures after LP-CA-01, found %', v_n;
  end if;

  v_run := hr.run_rule_fixtures();
  if (v_run->>'green')::boolean is not true then
    select string_agg(format('%s: %s', r->>'code',
                             coalesce(r->>'error','expected ' || (r->>'expected') || ' got ' || (r->>'actual'))),
                      E'\n  ' order by r->>'code')
      into v_red from jsonb_array_elements(v_run->'results') r where (r->>'passed')::boolean is false;
    raise exception E'hr_c5_06: THE FIXTURE SUITE IS RED (% of % failed):\n  %',
      v_run->>'failed', v_run->>'total', v_red;
  end if;
  raise notice 'hr_c5_06: fixture suite GREEN -- %/% passed, % pending_verification',
    v_run->>'passed', v_run->>'total', v_run->>'pending_verification';
end $$;

select set_config('hr.privileged_write', 'off', false);
