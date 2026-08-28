-- HR domain L5 — migration 18 (register item HRB-017, lane L5 Leave & PTO).
--
-- TWO GAPS THE COORDINATOR'S REVIEW NAMED.
--
-- **(2) A refusal with an empty `violations[]`.** `hr.leave_policy_save` caught SQLSTATE 23514 and
-- reported `unlawful_configuration` — correct for the jurisdiction trigger, and WRONG for the
-- eleven CHECK constraints on `hr.leave_policy`, which raise the same SQLSTATE. Saving a policy
-- with `balance_cap` below `annual_accrual_cap` came back as *an unlawful configuration with no
-- violations listed*: a dialog with nothing to render and no field to focus. The client caught
-- those at its own controls, which means the door was only correct as long as the client was
-- perfect — the §4.1 no-raw-SQL law's cousin, and the same failure L1 hit when a NOT NULL reached
-- a user as a stack trace. **The constraint is now a first-class violation entry** with the same
-- shape a jurisdiction violation has: `code`, `field`, a sentence written for an administrator,
-- and the `fix` that focuses the offending control.
--
-- The discriminator is exact rather than guessed: a table CHECK carries a `CONSTRAINT_NAME` in
-- its stacked diagnostics; the jurisdiction trigger's bare `raise ... using errcode='23514'` does
-- not. Empty name → the jurisdiction lane. Named → ours.
--
-- **(3) §2.7's dispositions had no door.** *"Deactivate | Requires a disposition choice for
-- existing balances: `freeze` / `pay_out` / `migrate_to <policy>` → ledger entries for the chosen
-- disposition; enrollments end-dated."* There was no way to deactivate a policy at all, so the
-- balances of everyone on it had no defined fate.
--
-- Authority: SPEC-LEAVE §2.6, §2.7; SPEC-UI-IA §4.1 (a refusal renders in words, never the
-- database's). Applied live as `hr_l5_18_constraint_violations_and_dispositions`. Idempotent.

-- -----------------------------------------------------------------------------------
-- 1. Every CHECK on hr.leave_policy, as a sentence and a fix
-- -----------------------------------------------------------------------------------

create or replace function hr._leave_policy_constraint_violation(p_constraint text, p_payload jsonb)
returns jsonb
language sql
immutable
as $function$
  select case p_constraint
    when 'leave_policy_caps_ordered' then jsonb_build_object(
      'code','caps_out_of_order', 'field','balance_cap',
      'message','The most an employee can hold has to be at least as large as the most they can '
             || 'earn in a year — otherwise they would hit the ceiling partway through and stop '
             || 'earning time they are owed.',
      'fix', jsonb_build_object('label','Raise the holding cap','focus_field','balance_cap'))
    when 'leave_policy_carryover_coherent' then jsonb_build_object(
      'code','carryover_settings_contradict', 'field','carryover_allowed',
      'message','This policy says unused time cannot carry over, but it also sets a carryover cap '
             || 'or an expiry. Turn carryover on, or clear those two settings.',
      'fix', jsonb_build_object('label','Turn carryover on','focus_field','carryover_allowed'))
    when 'leave_policy_negative_coherent' then jsonb_build_object(
      'code','negative_floor_without_negatives', 'field','negative_balance_allowed',
      'message','A floor for negative balances only means something if negative balances are '
             || 'allowed. Allow them, or clear the floor.',
      'fix', jsonb_build_object('label','Allow negative balances','focus_field','negative_balance_allowed'))
    when 'leave_policy_hours_worked_has_unit' then jsonb_build_object(
      'code','hours_worked_needs_a_rate', 'field','accrual_per_units',
      'message','Earning time by hours worked needs both halves of the rate — how much is earned, '
             || 'and per how many hours worked. Say both.',
      'fix', jsonb_build_object('label','Set the hours worked','focus_field','accrual_per_units'))
    when 'leave_policy_accrual_rate_present' then jsonb_build_object(
      'code','accrual_rate_missing', 'field','accrual_rate',
      'message','Every accrual method except Unlimited and Grant-only needs a rate. How much time '
             || 'is earned each period?',
      'fix', jsonb_build_object('label','Set the rate','focus_field','accrual_rate'))
    when 'leave_policy_periods_nonneg' then jsonb_build_object(
      'code','period_is_negative', 'field','increment_minutes',
      'message','Waiting periods cannot be negative and time has to be booked in increments of at '
             || 'least one minute.',
      'fix', jsonb_build_object('label','Fix the increment','focus_field','increment_minutes'))
    when 'leave_policy_accrual_method_check' then jsonb_build_object(
      'code','unknown_accrual_method', 'field','accrual_method',
      'message','That is not an accrual method this product knows.',
      'fix', jsonb_build_object('label','Choose a method','focus_field','accrual_method'))
    when 'leave_policy_accrual_unit_check' then jsonb_build_object(
      'code','unknown_accrual_unit', 'field','accrual_unit',
      'message','Time is earned per hour, per pay period, per month or per year.',
      'fix', jsonb_build_object('label','Choose a unit','focus_field','accrual_unit'))
    when 'leave_policy_accrual_starts_check' then jsonb_build_object(
      'code','unknown_accrual_start', 'field','accrual_starts',
      'message','Earning starts at hire, after a waiting period, or at the policy-year start.',
      'fix', jsonb_build_object('label','Choose when earning starts','focus_field','accrual_starts'))
    when 'leave_policy_leave_kind_check' then jsonb_build_object(
      'code','unknown_leave_kind', 'field','leave_kind',
      'message','That is not a kind of leave this product knows.',
      'fix', jsonb_build_object('label','Choose a leave type','focus_field','leave_kind'))
    when 'leave_policy_payout_on_termination_check' then jsonb_build_object(
      'code','unknown_payout_posture', 'field','payout_on_termination',
      'message','Payout at termination is never, always, whatever the law requires, or a written '
             || 'policy decision.',
      'fix', jsonb_build_object('label','Choose a payout rule','focus_field','payout_on_termination'))
    when 'leave_policy_name_unique' then jsonb_build_object(
      'code','name_already_used', 'field','name',
      'message','Another leave policy in this organization already has that name. People pick '
             || 'their leave type by name, so two cannot share one.',
      'fix', jsonb_build_object('label','Rename this policy','focus_field','name'))
    else jsonb_build_object(
      'code','policy_rule_violated', 'field', null,
      -- The honest fallback: name the rule that refused rather than pretend to explain it, and
      -- NEVER hand the caller the database's own message.
      'message','This policy breaks one of the rules a leave policy has to satisfy, and this '
             || 'screen does not yet have wording for that one. HR can see which rule it was.',
      'constraint', p_constraint,
      'fix', jsonb_build_object('label','Review the settings','focus_field', null))
  end;
$function$;

comment on function hr._leave_policy_constraint_violation(text, jsonb) is
  'Turns a CHECK-constraint name into the §2.6 violation shape — code, field, an administrator''s '
  'sentence, and the fix that focuses the control. The fallback names the constraint for HR and '
  'still never shows the caller the database''s own message (SPEC-UI-IA §4.1).';

-- -----------------------------------------------------------------------------------
-- 2. leave_policy_save: distinguish OUR checks from the jurisdiction trigger
-- -----------------------------------------------------------------------------------

do $$
declare v_def text; v_new text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'leave_policy_save';

  v_new := replace(v_def,
    E'  exception when sqlstate ''23514'' then',
    E'  exception when sqlstate ''23514'' or sqlstate ''23505'' then\n'
 || E'    -- A table CHECK carries a CONSTRAINT_NAME in its stacked diagnostics; the jurisdiction\n'
 || E'    -- trigger''s bare `raise ... using errcode=''23514''` does not. Named => ours, and it\n'
 || E'    -- becomes a first-class violation entry instead of an empty violations[].\n'
 || E'    get stacked diagnostics v_constraint = CONSTRAINT_NAME;\n'
 || E'    if coalesce(v_constraint, '''') <> '''' then\n'
 || E'      return jsonb_build_object(''granted'', false, ''reason'',''policy_rule_violated'',\n'
 || E'        ''validation'', jsonb_build_object(\n'
 || E'          ''granted'', true, ''checked'', true, ''ok'', false,\n'
 || E'          ''violations'', jsonb_build_array(\n'
 || E'            hr._leave_policy_constraint_violation(v_constraint, p_payload)),\n'
 || E'          ''warnings'', ''[]''::jsonb),\n'
 || E'        ''payload'', p_payload);\n'
 || E'    end if;');
  if v_new = v_def then
    raise exception 'hr_l5_18: the leave_policy_save exception block did not match — re-derive it';
  end if;

  v_new := replace(v_new,
    E'  v_rung text; v_id uuid; v_pre jsonb; v_row hr.leave_policy%rowtype; v_existing hr.leave_policy%rowtype;',
    E'  v_rung text; v_id uuid; v_pre jsonb; v_row hr.leave_policy%rowtype; v_existing hr.leave_policy%rowtype;\n  v_constraint text;');
  execute v_new;
end $$;

-- -----------------------------------------------------------------------------------
-- 3. §2.7's deactivate, with its disposition
-- -----------------------------------------------------------------------------------

create or replace function hr.leave_policy_deactivate(
  p_leave_policy_id uuid, p_disposition text, p_migrate_to_policy_id uuid default null,
  p_note text default null
) returns jsonb
language plpgsql
security definer
set search_path to 'hr', 'public'
as $function$
declare
  pol hr.leave_policy%rowtype; v_rung text; v_r record; v_bal numeric; v_post jsonb;
  v_target hr.leave_policy%rowtype; v_moved integer := 0; v_frozen integer := 0;
  v_paid integer := 0; v_hours numeric := 0; v_uid uuid := auth.uid(); v_me uuid;
begin
  pol := hr._leave_policy_at(p_leave_policy_id);
  if pol.id is null then
    return jsonb_build_object('granted', false, 'reason','not_found');
  end if;
  v_rung := hr._leave_admin_rung(pol.organization_id);
  if v_rung not in ('hr_admin','hr_owner') then
    return jsonb_build_object('granted', false, 'reason','not_an_hr_admin',
      'detail','Deactivating a policy decides what happens to every balance on it, so it is an HR action.');
  end if;
  if p_disposition not in ('freeze','pay_out','migrate_to') then
    return jsonb_build_object('granted', false, 'reason','disposition_required',
      'detail','Choose what happens to the balances people already hold: freeze them (no more is '
            || 'earned, what they have stays spendable), pay them out, or move them to another policy.',
      'choices', jsonb_build_array('freeze','pay_out','migrate_to'));
  end if;
  if p_disposition = 'migrate_to' then
    v_target := hr._leave_policy_at(p_migrate_to_policy_id);
    if v_target.id is null or v_target.organization_id <> pol.organization_id
       or not v_target.is_active then
      return jsonb_build_object('granted', false, 'reason','migration_target_invalid',
        'detail','Moving balances needs an active policy in this organization to move them to.');
    end if;
    if v_target.accrual_method = 'unlimited' then
      return jsonb_build_object('granted', false, 'reason','migration_target_unlimited',
        'detail','An unlimited policy has no balance, so there is nowhere for these hours to land. '
              || 'Pay them out or freeze them instead.');
    end if;
  end if;

  select em.id into v_me from hr.employment em join hr.employee e on e.id = em.employee_id
   where e.login_user_id = v_uid and em.organization_id = pol.organization_id
     and em.deleted_at is null limit 1;

  for v_r in
    select en.id, en.employment_id from hr.leave_enrollment en
     where en.leave_policy_id = p_leave_policy_id and en.deleted_at is null
       and (en.effective_to is null or en.effective_to >= current_date)
  loop
    v_bal := coalesce((hr.leave_figures(v_r.employment_id, p_leave_policy_id, current_date)
                       ->> 'ledger_balance')::numeric, 0);

    if p_disposition = 'pay_out' and v_bal > 0 then
      -- 🚨 HOURS, NEVER AN AMOUNT. A deactivation payout is not §7's termination computation: no
      -- jurisdiction rule was resolved and no rate was read, so the money is WITHHELD rather than
      -- rendered as a confident figure. Payroll computes it from these hours.
      v_post := hr.leave_ledger_post(
        p_employment_id => v_r.employment_id, p_leave_policy_id => p_leave_policy_id,
        p_entry_kind => 'payout', p_hours_delta => -v_bal, p_occurred_on => current_date,
        p_note => coalesce(nullif(p_note,''), 'Policy deactivated — balance paid out'),
        p_engine_key => 'policy_disposition', p_actor_type => 'hr_admin',
        p_actor_employment_id => v_me, p_actor_user_id => v_uid,
        p_period_key => 'deactivate:' || p_leave_policy_id::text,
        p_snapshot_inputs => jsonb_build_object('disposition','pay_out',
          'money_withheld', true,
          'money_withheld_reason','a deactivation payout resolves no jurisdiction rule and reads '
            || 'no rate; payroll computes the amount from these hours'));
      if coalesce((v_post ->> 'ok')::boolean, false) then
        v_paid := v_paid + 1; v_hours := v_hours + v_bal;
      end if;

    elsif p_disposition = 'migrate_to' and v_bal <> 0 then
      v_post := hr.leave_ledger_post(
        p_employment_id => v_r.employment_id, p_leave_policy_id => p_leave_policy_id,
        p_entry_kind => 'adjustment', p_hours_delta => -v_bal, p_occurred_on => current_date,
        p_note => format('Moved to %s', v_target.name),
        p_engine_key => 'policy_disposition', p_actor_type => 'hr_admin',
        p_actor_employment_id => v_me, p_actor_user_id => v_uid,
        p_snapshot_inputs => jsonb_build_object('disposition','migrate_to',
                                                'to_policy_id', v_target.id));
      if coalesce((v_post ->> 'ok')::boolean, false) then
        perform hr.arm_write();
        insert into hr.leave_enrollment
          (employment_id, leave_policy_id, effective_from, policy_year_start_on, organization_id)
        select v_r.employment_id, v_target.id, current_date,
               date_trunc('year', current_date)::date, pol.organization_id
         where not exists (select 1 from hr.leave_enrollment e2
                            where e2.employment_id = v_r.employment_id
                              and e2.leave_policy_id = v_target.id and e2.deleted_at is null);
        perform hr.leave_ledger_post(
          p_employment_id => v_r.employment_id, p_leave_policy_id => v_target.id,
          p_entry_kind => 'adjustment', p_hours_delta => v_bal, p_occurred_on => current_date,
          p_note => format('Moved from %s', pol.name),
          p_engine_key => 'policy_disposition', p_actor_type => 'hr_admin',
          p_actor_employment_id => v_me, p_actor_user_id => v_uid,
          p_snapshot_inputs => jsonb_build_object('disposition','migrate_to',
                                                  'from_policy_id', pol.id));
        v_moved := v_moved + 1;
      end if;
    else
      v_frozen := v_frozen + 1;   -- freeze: the balance stays exactly where it is, and spendable
    end if;

    -- §2.7: enrollments are end-dated. `freeze` keeps the enrollment OPEN, because a frozen
    -- balance is still spendable and an ended enrollment would make it unreachable.
    if p_disposition <> 'freeze' then
      perform hr.arm_write();
      update hr.leave_enrollment set effective_to = current_date where id = v_r.id;
    end if;
  end loop;

  perform hr.arm_write();
  update hr.leave_policy set is_active = false where id = p_leave_policy_id;

  return jsonb_build_object(
    'granted', true, 'policy_id', p_leave_policy_id, 'disposition', p_disposition,
    'enrollments_frozen', v_frozen, 'enrollments_migrated', v_moved,
    'enrollments_paid_out', v_paid, 'hours_paid_out', v_hours,
    'amount', null,
    'money_withheld', (p_disposition = 'pay_out'),
    'statement', case p_disposition
      when 'freeze' then 'No more time is earned on this policy. What people already hold stays '
                      || 'exactly where it is and can still be booked.'
      when 'pay_out' then format('%s hours across %s people were closed out for payroll to pay. '
                              || 'We recorded the hours, not an amount — no rate was read and no '
                              || 'law was resolved here.', hr._leave_hours_text(v_hours), v_paid)
      else format('Balances moved to %s. Each move is two ledger entries, so both policies still '
               || 'explain themselves.', v_target.name) end);
end
$function$;

create or replace function public.hr_leave_policy_deactivate(
  p_leave_policy_id uuid, p_disposition text, p_migrate_to_policy_id uuid default null,
  p_note text default null)
returns jsonb language sql security definer set search_path to 'public','hr'
as $function$ select hr.leave_policy_deactivate(p_leave_policy_id, p_disposition,
                                                p_migrate_to_policy_id, p_note); $function$;

grant execute on function public.hr_leave_policy_deactivate(uuid,text,uuid,text) to authenticated;

-- 🚨 THE DOOR SEAL (hr_l5_04). `grant ... to authenticated` does NOT remove the anon EXECUTE that
-- Supabase's default privileges hand every new public function, and `revoke from public` does not
-- either — anon holds its own explicit grant. Both revokes must be explicit and name anon. This
-- lane shipped five SECURITY DEFINER doors, one a WRITE, executable by anon. Replaying this file
-- re-seals rather than regressing.

select hr.leave_seal_door('hr_leave_policy_deactivate');

do $$
declare v_anon text;
begin
  select string_agg(p.proname, ', ') into v_anon
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname in ('hr_leave_policy_deactivate')
     and has_function_privilege('anon', p.oid, 'execute');
  if v_anon is not null then
    raise exception 'hr_l5_18: these doors are executable by anon: %', v_anon;
  end if;
end $$;

do $$
declare v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'leave_policy_save';
  if v_def not like '%CONSTRAINT_NAME%' then
    raise exception 'hr_l5_18: leave_policy_save still cannot tell a CHECK from the jurisdiction trigger';
  end if;
  if hr._leave_policy_constraint_violation('leave_policy_caps_ordered','{}'::jsonb) ->> 'field'
     <> 'balance_cap' then
    raise exception 'hr_l5_18: the constraint map does not name the field to focus';
  end if;
  if hr._leave_policy_constraint_violation('something_new_nobody_worded','{}'::jsonb) ->> 'code'
     <> 'policy_rule_violated' then
    raise exception 'hr_l5_18: an unworded constraint does not fall back honestly';
  end if;
  -- the audit added a door; it must still check its caller
  if (select count(*) from hr.leave_door_grant_audit() where verdict like 'DEFECT%') > 0 then
    raise exception 'hr_l5_18: the new deactivate door is reachable and checks nobody';
  end if;
end $$;
