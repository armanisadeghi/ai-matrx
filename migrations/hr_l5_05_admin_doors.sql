-- HR domain L5 — migration 5 (register item HRB-017, lane L5 Leave & PTO).
--
-- THE HR AND MANAGER LANE: policy authoring with the unlawful-config REJECTION UX, enrollment,
-- the org balances list, the who's-out calendar with its disclosure ladder, and the balance
-- adjustment. Everything here is a `public.hr_*` door over a body in `hr`, because `hr` is not
-- exposed to PostgREST (FREEZE delta D-10).
--
-- Authority: SPEC-LEAVE §2, §2.5–§2.8, §5.1, §6, §10, §11, §16; SPEC-JURISDICTION §3.1–§3.3;
--            SPEC-ACCESS §4.1 THE VIEW LAW. R-L5 (a) A1–A10, C12, C13, E1–E5.
-- Applied live as `hr_l5_05_admin_doors`. Idempotent.
--
-- ===================================================================================
-- RECORDED TECHNICAL DECISIONS
--
-- 1. 🚨 THE PARAMETER-KEY CONTRACT NOW HAS EXACTLY ONE IMPLEMENTATION, AND IT USED TO HAVE ONE
--    AND A HALF. SPEC-LEAVE §2.6 has two enforcement points — a client twin that calls
--    `hr.validate_org_config` on blur, and the authoritative server trigger
--    `hr._leave_policy_lawful` — and *"one sentence"*: they must agree. The trigger (core C5's
--    `hr_c5_06`) carried the policy→parameters mapping INLINE, so a twin door written here would
--    have been a SECOND copy of it, and the first divergence would show up as a form that
--    validates clean and a save that refuses. The mapping is extracted verbatim into
--    `hr._leave_config_parameters` and the trigger is rewritten to call it. **No behaviour
--    changes** — the same three class branches, the same keys, the same values, the same
--    fall-through compliance exception. Cross-lane edit, recorded for the coordinator: the body
--    moved, the meaning did not.
--
-- 2. THE REFUSAL CARRIES EVERYTHING THE DIALOG NEEDS, OR THE DIALOG INVENTS IT. §2.6 requires the
--    blocking dialog to show the validator's `message` VERBATIM, the affected-employee count, a
--    "Why?" that expands to rule id / version / effective range / citation URL, and ONE PRIMARY
--    ACTION THAT FIXES IT. So `hr.leave_policy_save` returns the whole validator envelope on
--    refusal — violations with their `field`, `configured`, `required` and `citation` — plus a
--    `fix` per violation naming the field to focus and the lawful value to pre-fill. A dialog
--    whose only button is "OK" is a defect, and the door is where that is prevented.
--
-- 3. THE ADMIN'S INPUT IS NEVER APPLIED AND NEVER REWRITTEN. A violation is a REFUSAL, not a
--    clamp (SPEC-JURISDICTION §3.2 rule 1). `hr.leave_policy_save` runs inside a savepoint: on a
--    refusal the write is rolled back and the payload comes straight back to the caller so the
--    form can keep it in place.
--
-- 4. WARNINGS ARE NOT VIOLATIONS. An advisory rule may never block a customer's configuration
--    (§2.6). The door returns `warnings` separately with `save_anyway = true`, and the same call
--    with `p_accept_warnings => true` proceeds.
--
-- 5. 🚨 THE CALENDAR'S DISCLOSURE LADDER IS COMPUTED SERVER-SIDE, NOT FILTERED IN REACT. §10: a
--    peer sees "Out" and no type; a manager sees the type; a case-linked absence is an EXISTENCE
--    STATEMENT in worded prose and never a masked field or a lock icon. Sending a client the full
--    row and asking it to hide half is how the half arrives anyway — in a network tab, in an
--    export, in a screenshot. So each entry is rendered at the viewer's rung before it leaves.
-- ===================================================================================

-- -----------------------------------------------------------------------------------
-- 1. Decision 1: the ONE policy→validator parameter mapping
-- -----------------------------------------------------------------------------------

create or replace function hr._leave_config_parameters(p_class text, p_policy jsonb)
returns jsonb
language sql
immutable
as $function$
  select case p_class
    when 'pto-carryover-legality' then
      jsonb_build_object('carryover_policy',
        case when coalesce((p_policy ->> 'carryover_allowed')::boolean, true)
             then 'cap' else 'forfeit' end)
    when 'sick-leave-floor' then
      jsonb_build_object(
        'use_permitted_after_days', (p_policy ->> 'usable_after_days')::integer,
        'accrual', case when p_policy ->> 'accrual_method' = 'per_hours_worked'
                        then jsonb_build_object('method','per_hours_worked',
                               'hours_earned', (p_policy ->> 'accrual_rate')::numeric,
                               'per_hours_worked', (p_policy ->> 'accrual_per_units')::numeric)
                        else jsonb_build_object('method', p_policy ->> 'accrual_method') end,
        'carryover', jsonb_build_object('required',
                       coalesce((p_policy ->> 'carryover_allowed')::boolean, true)))
    else null end;
$function$;

comment on function hr._leave_config_parameters(text, jsonb) is
  'THE parameter-key contract between a leave policy and hr.validate_org_config. Extracted from '
  'hr._leave_policy_lawful so the client twin (SPEC-LEAVE §2.6 enforcement point 1) and the '
  'server trigger (point 2) cannot drift — a form that validates clean against a save that '
  'refuses is the exact failure §2.6 exists to prevent.';

create or replace function hr._leave_policy_lawful()
returns trigger
language plpgsql
as $function$
declare
  v_key text; v_keys text[]; v_params jsonb; v_res jsonb; v_v jsonb;
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
    -- §3.2: with no jurisdiction named, validate against EVERY jurisdiction the organization
    -- currently operates in. NULL makes the validator derive them itself.
    v_keys := null;
  end if;

  if new.statutory_basis_rule_class = 'pto-payout-at-termination' then
    -- The validator carries no predicate for this class, but hr._org_row_less_protective does,
    -- and reusing it is not a second validator — it is the same comparator the runtime clamp
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
  end if;

  -- decision 1: ONE mapping, shared with the client twin.
  v_params := hr._leave_config_parameters(new.statutory_basis_rule_class, to_jsonb(new));

  if v_params is null then
    -- §3.2 rule 6 is satisfied for the classes the validator compares. For any other class the
    -- honest answer is "we did not check", recorded where somebody sees it.
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
$function$;

-- -----------------------------------------------------------------------------------
-- 2. Who may author a policy or move a balance
-- -----------------------------------------------------------------------------------

create or replace function hr._leave_admin_rung(p_organization_id uuid)
returns text
language plpgsql
stable
security definer
set search_path to 'hr', 'public'
as $function$
declare v_uid uuid := auth.uid(); v_roles text[];
begin
  if v_uid is null then return 'none'; end if;
  select coalesce(array_agg(distinct ra.role_key), '{}'::text[]) into v_roles
    from hr.role_assignment ra
    join hr.employment em on em.id = ra.employment_id
    join hr.employee e on e.id = em.employee_id
   where e.login_user_id = v_uid and ra.organization_id = p_organization_id
     and ra.is_active and ra.revoked_at is null
     and ra.effective_from <= current_date
     and (ra.effective_to is null or ra.effective_to >= current_date);
  if 'hr_owner' = any(v_roles) then return 'hr_owner'; end if;
  if 'hr_admin' = any(v_roles) then return 'hr_admin'; end if;
  if 'leave_administrator' = any(v_roles) then return 'leave_administrator'; end if;
  if 'payroll_admin' = any(v_roles) then return 'payroll_admin'; end if;
  if 'manager' = any(v_roles) then return 'manager'; end if;
  -- The kernel's org-admin arm reads the working record org-wide but authors nothing here.
  if hr.capability(v_uid, 'working_record.write', null, current_date, p_organization_id) then
    return 'hr_admin';
  end if;
  return 'none';
end
$function$;

comment on function hr._leave_admin_rung(uuid) is
  'SPEC-LEAVE §16 in one predicate. Policy authoring is hr_admin; changing an active policy''s '
  'accrual method and adjusting below the negative floor are hr_owner ONLY; a manager never '
  'adjusts a balance and never authors a policy.';

-- -----------------------------------------------------------------------------------
-- 3. Policy authoring — list, the client twin, and save-or-refuse
-- -----------------------------------------------------------------------------------

create or replace function hr.leave_policy_list(p_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'hr', 'public'
as $function$
declare v_rung text; v_rows jsonb; v_juris jsonb;
begin
  v_rung := hr._leave_admin_rung(p_organization_id);
  if v_rung = 'none' then
    return jsonb_build_object('granted', false, 'reason','no_hr_role',
      'detail','Leave policies are configured by HR.');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('key', j.key, 'name', j.name) order by j.key), '[]'::jsonb)
    into v_juris
    from (select distinct e.jurisdiction_id from hr.establishment e
           where e.organization_id = p_organization_id and e.deleted_at is null) x
    join hr.jurisdiction j on j.id = x.jurisdiction_id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', p.id, 'name', p.name, 'leave_kind', p.leave_kind,
           'accrual_method', p.accrual_method, 'accrual_rate', p.accrual_rate,
           'accrual_per_units', p.accrual_per_units, 'accrual_unit', p.accrual_unit,
           'is_active', p.is_active, 'version', p.version,
           'statutory_basis_rule_class', p.statutory_basis_rule_class,
           'balance_cap', p.balance_cap, 'annual_accrual_cap', p.annual_accrual_cap,
           'carryover_allowed', p.carryover_allowed, 'carryover_cap', p.carryover_cap,
           'carryover_expires_after_days', p.carryover_expires_after_days,
           'negative_balance_allowed', p.negative_balance_allowed,
           'negative_balance_floor', p.negative_balance_floor,
           'payout_on_termination', p.payout_on_termination,
           'usable_after_days', p.usable_after_days, 'waiting_period_days', p.waiting_period_days,
           'accrual_starts', p.accrual_starts, 'increment_minutes', p.increment_minutes,
           'documentation_required_after_days', p.documentation_required_after_days,
           'reinstate_on_rehire_within_days', p.reinstate_on_rehire_within_days,
           'earning_code_id', p.earning_code_id,
           'blackout_rules', p.blackout_rules, 'mandated_uses', p.mandated_uses,
           'worker_class_scope', p.worker_class_scope, 'schedule_class_scope', p.schedule_class_scope,
           -- the enrolled headcount IS a door (§2.1)
           'enrolled_count', (select count(*) from hr.leave_enrollment en
                               where en.leave_policy_id = p.id and en.deleted_at is null
                                 and (en.effective_to is null or en.effective_to >= current_date)))
           order by p.leave_kind, p.name), '[]'::jsonb)
    into v_rows
    from hr.leave_policy p
   where p.organization_id = p_organization_id and p.deleted_at is null;

  return jsonb_build_object('granted', true, 'rung', v_rung,
                            'can_write', v_rung in ('hr_admin','hr_owner'),
                            'operating_jurisdictions', v_juris, 'policies', v_rows);
end
$function$;

create or replace function hr.leave_policy_validate(p_organization_id uuid, p_payload jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'hr', 'public'
as $function$
declare
  v_rung text; v_class text; v_params jsonb; v_res jsonb; v_out jsonb := '[]'::jsonb; v_v jsonb;
begin
  v_rung := hr._leave_admin_rung(p_organization_id);
  if v_rung not in ('hr_admin','hr_owner') then
    return jsonb_build_object('granted', false, 'reason','not_an_hr_admin');
  end if;

  v_class := p_payload ->> 'statutory_basis_rule_class';
  if v_class is null then
    return jsonb_build_object('granted', true, 'ok', true, 'violations','[]'::jsonb,
      'warnings','[]'::jsonb, 'checked', false,
      'detail','This policy claims no statutory basis, so there is no floor to compare it against.');
  end if;

  -- decision 1: THE SAME mapping the trigger uses.
  v_params := hr._leave_config_parameters(v_class, p_payload);
  if v_params is null then
    return jsonb_build_object('granted', true, 'ok', true, 'checked', false,
      'violations','[]'::jsonb, 'warnings','[]'::jsonb,
      'detail', format('We do not yet have a way to check a policy against the %s rule. It will '
                    || 'be saved without that check, and a compliance record is opened.', v_class));
  end if;

  v_res := hr.validate_org_config(p_organization_id, v_class, v_params, null, current_date);

  -- decision 2: every violation carries the action that FIXES it.
  for v_v in select jsonb_array_elements(coalesce(v_res -> 'violations','[]'::jsonb)) loop
    v_out := v_out || jsonb_build_array(v_v || jsonb_build_object('fix', case v_v ->> 'code'
      when 'forfeiture_unlawful' then jsonb_build_object(
        'label','Set a cap instead', 'focus_field','carryover_cap',
        'set', jsonb_build_object('carryover_allowed', true))
      when 'accrues_slower_than_floor' then jsonb_build_object(
        'label','Match the required rate', 'focus_field','accrual_per_units',
        'set', jsonb_build_object(
          'accrual_rate', v_v #> '{required,hours_earned}',
          'accrual_per_units', v_v #> '{required,per_hours_worked}'))
      when 'waiting_period_too_long' then jsonb_build_object(
        'label','Shorten the wait', 'focus_field','usable_after_days',
        'set', jsonb_build_object('usable_after_days', v_v -> 'required'))
      else jsonb_build_object('label','Review this setting',
                              'focus_field', v_v ->> 'field') end));
  end loop;

  return jsonb_build_object(
    'granted', true, 'checked', true,
    'ok', coalesce((v_res ->> 'ok')::boolean, false),
    'violations', v_out,
    'warnings', coalesce(v_res -> 'warnings','[]'::jsonb),
    'advisory_rules_consulted', coalesce(v_res -> 'advisory_rules_consulted','[]'::jsonb),
    'jurisdictions_checked', coalesce(v_res -> 'jurisdictions_checked','[]'::jsonb),
    'parameters_sent', v_params);
end
$function$;

comment on function hr.leave_policy_validate(uuid, jsonb) is
  'SPEC-LEAVE §2.6 enforcement point 1 — the client twin, called on blur and before submit. It '
  'calls the SAME hr.validate_org_config with the SAME parameters the authoritative trigger '
  'sends, and attaches to every violation the ONE primary action that fixes it, because a dialog '
  'whose only button is OK is a defect.';

create or replace function hr.leave_policy_save(
  p_organization_id uuid, p_payload jsonb, p_accept_warnings boolean default false
) returns jsonb
language plpgsql
security definer
set search_path to 'hr', 'public'
as $function$
declare
  v_rung text; v_id uuid; v_pre jsonb; v_row hr.leave_policy%rowtype; v_existing hr.leave_policy%rowtype;
begin
  v_rung := hr._leave_admin_rung(p_organization_id);
  if v_rung not in ('hr_admin','hr_owner') then
    return jsonb_build_object('granted', false, 'reason','not_an_hr_admin',
      'detail','Leave policies are authored by HR.');
  end if;

  v_id := nullif(p_payload ->> 'id','')::uuid;
  if v_id is not null then
    select * into v_existing from hr.leave_policy
     where id = v_id and organization_id = p_organization_id and deleted_at is null;
    if v_existing.id is null then
      return jsonb_build_object('granted', false, 'reason','not_found');
    end if;
    -- §2.7: changing an ACTIVE policy's accrual method is hr_owner only, and the caller must
    -- have seen the impact preview. The door refuses; it does not silently downgrade the change.
    if v_existing.is_active
       and (p_payload ->> 'accrual_method') is distinct from v_existing.accrual_method
       and v_rung <> 'hr_owner' then
      return jsonb_build_object('granted', false, 'reason','accrual_method_change_requires_owner',
        'detail','Changing how an active policy accrues is an owner decision, because it changes '
              || 'what every enrolled employee earns from here on. Past ledger entries are never '
              || 'touched either way.',
        'affected_enrollments', (select count(*) from hr.leave_enrollment en
                                  where en.leave_policy_id = v_id and en.deleted_at is null));
    end if;
  end if;

  v_pre := hr.leave_policy_validate(p_organization_id, p_payload);
  if coalesce((v_pre ->> 'checked')::boolean, false)
     and not coalesce((v_pre ->> 'ok')::boolean, true) then
    -- decision 3: a refusal, not a clamp. Nothing was written and the payload comes straight back.
    return jsonb_build_object('granted', false, 'reason','unlawful_configuration',
      'validation', v_pre, 'payload', p_payload);
  end if;
  -- decision 4: an advisory rule may never block a customer's configuration.
  if jsonb_array_length(coalesce(v_pre -> 'warnings','[]'::jsonb)) > 0 and not p_accept_warnings then
    return jsonb_build_object('granted', false, 'reason','warnings_unacknowledged',
      'validation', v_pre, 'payload', p_payload, 'save_anyway', true);
  end if;

  begin
    perform hr.arm_write();
    if v_id is null then
      insert into hr.leave_policy
        (name, leave_kind, statutory_basis_rule_class, statutory_jurisdiction_id, accrual_method,
         accrual_rate, accrual_per_units, accrual_unit, accrual_starts, waiting_period_days,
         usable_after_days, annual_accrual_cap, balance_cap, carryover_allowed, carryover_cap,
         carryover_expires_after_days, negative_balance_allowed, negative_balance_floor,
         payout_on_termination, reinstate_on_rehire_within_days, increment_minutes,
         requires_approval, blackout_rules, mandated_uses, documentation_required_after_days,
         earning_code_id, schedule_class_scope, worker_class_scope, is_active, organization_id)
      select p_payload ->> 'name', p_payload ->> 'leave_kind',
             nullif(p_payload ->> 'statutory_basis_rule_class',''),
             nullif(p_payload ->> 'statutory_jurisdiction_id','')::uuid,
             p_payload ->> 'accrual_method',
             nullif(p_payload ->> 'accrual_rate','')::numeric,
             nullif(p_payload ->> 'accrual_per_units','')::numeric,
             nullif(p_payload ->> 'accrual_unit',''),
             coalesce(nullif(p_payload ->> 'accrual_starts',''), 'hire'),
             coalesce(nullif(p_payload ->> 'waiting_period_days','')::integer, 0),
             coalesce(nullif(p_payload ->> 'usable_after_days','')::integer, 0),
             nullif(p_payload ->> 'annual_accrual_cap','')::numeric,
             nullif(p_payload ->> 'balance_cap','')::numeric,
             coalesce(nullif(p_payload ->> 'carryover_allowed','')::boolean, true),
             nullif(p_payload ->> 'carryover_cap','')::numeric,
             nullif(p_payload ->> 'carryover_expires_after_days','')::integer,
             coalesce(nullif(p_payload ->> 'negative_balance_allowed','')::boolean, false),
             nullif(p_payload ->> 'negative_balance_floor','')::numeric,
             coalesce(nullif(p_payload ->> 'payout_on_termination',''), 'jurisdiction'),
             nullif(p_payload ->> 'reinstate_on_rehire_within_days','')::integer,
             coalesce(nullif(p_payload ->> 'increment_minutes','')::integer, 15),
             coalesce(nullif(p_payload ->> 'requires_approval','')::boolean, true),
             coalesce(p_payload -> 'blackout_rules', '[]'::jsonb),
             coalesce(p_payload -> 'mandated_uses', '[]'::jsonb),
             nullif(p_payload ->> 'documentation_required_after_days','')::integer,
             nullif(p_payload ->> 'earning_code_id','')::uuid,
             coalesce((select array_agg(x) from jsonb_array_elements_text(p_payload -> 'schedule_class_scope') x), '{}'::text[]),
             coalesce((select array_agg(x) from jsonb_array_elements_text(p_payload -> 'worker_class_scope') x), '{}'::text[]),
             coalesce(nullif(p_payload ->> 'is_active','')::boolean, false),
             p_organization_id
      returning * into v_row;
    else
      update hr.leave_policy set
        name = coalesce(nullif(p_payload ->> 'name',''), name),
        leave_kind = coalesce(nullif(p_payload ->> 'leave_kind',''), leave_kind),
        statutory_basis_rule_class = nullif(p_payload ->> 'statutory_basis_rule_class',''),
        accrual_method = coalesce(nullif(p_payload ->> 'accrual_method',''), accrual_method),
        accrual_rate = nullif(p_payload ->> 'accrual_rate','')::numeric,
        accrual_per_units = nullif(p_payload ->> 'accrual_per_units','')::numeric,
        accrual_unit = nullif(p_payload ->> 'accrual_unit',''),
        accrual_starts = coalesce(nullif(p_payload ->> 'accrual_starts',''), accrual_starts),
        waiting_period_days = coalesce(nullif(p_payload ->> 'waiting_period_days','')::integer, waiting_period_days),
        usable_after_days = coalesce(nullif(p_payload ->> 'usable_after_days','')::integer, usable_after_days),
        annual_accrual_cap = nullif(p_payload ->> 'annual_accrual_cap','')::numeric,
        balance_cap = nullif(p_payload ->> 'balance_cap','')::numeric,
        carryover_allowed = coalesce(nullif(p_payload ->> 'carryover_allowed','')::boolean, carryover_allowed),
        carryover_cap = nullif(p_payload ->> 'carryover_cap','')::numeric,
        carryover_expires_after_days = nullif(p_payload ->> 'carryover_expires_after_days','')::integer,
        negative_balance_allowed = coalesce(nullif(p_payload ->> 'negative_balance_allowed','')::boolean, negative_balance_allowed),
        negative_balance_floor = nullif(p_payload ->> 'negative_balance_floor','')::numeric,
        payout_on_termination = coalesce(nullif(p_payload ->> 'payout_on_termination',''), payout_on_termination),
        reinstate_on_rehire_within_days = nullif(p_payload ->> 'reinstate_on_rehire_within_days','')::integer,
        increment_minutes = coalesce(nullif(p_payload ->> 'increment_minutes','')::integer, increment_minutes),
        blackout_rules = coalesce(p_payload -> 'blackout_rules', blackout_rules),
        mandated_uses = coalesce(p_payload -> 'mandated_uses', mandated_uses),
        documentation_required_after_days = nullif(p_payload ->> 'documentation_required_after_days','')::integer,
        earning_code_id = nullif(p_payload ->> 'earning_code_id','')::uuid,
        is_active = coalesce(nullif(p_payload ->> 'is_active','')::boolean, is_active)
       where id = v_id
      returning * into v_row;
    end if;
  exception when sqlstate '23514' then
    -- The authoritative trigger refused. Re-run the twin so the caller gets the full envelope
    -- (message, count, citation, fix) rather than a bare SQL error, and keep their input.
    return jsonb_build_object('granted', false, 'reason','unlawful_configuration',
      'detail', sqlerrm, 'validation', hr.leave_policy_validate(p_organization_id, p_payload),
      'payload', p_payload);
  end;

  return jsonb_build_object('granted', true, 'policy_id', v_row.id, 'version', v_row.version,
                            'is_active', v_row.is_active,
                            'validation', v_pre);
end
$function$;

comment on function hr.leave_policy_save(uuid, jsonb, boolean) is
  'SPEC-LEAVE §2.6/§2.7. Validates through the client twin, writes, and converts the '
  'authoritative trigger''s refusal back into the full validator envelope so the blocking dialog '
  'has the message, the affected count, the citation and the fix. The admin''s rejected input is '
  'returned untouched: we do not clear it and we do not apply it.';

-- -----------------------------------------------------------------------------------
-- 4. Enrollment (§2.8)
-- -----------------------------------------------------------------------------------

create or replace function hr.leave_enroll(
  p_leave_policy_id uuid, p_employment_ids uuid[], p_effective_from date default null
) returns jsonb
language plpgsql
security definer
set search_path to 'hr', 'public'
as $function$
declare
  pol hr.leave_policy%rowtype; v_rung text; v_from date; v_added integer := 0;
  v_skipped jsonb := '[]'::jsonb; v_emp uuid; v_class text;
begin
  pol := hr._leave_policy_at(p_leave_policy_id);
  if pol.id is null then return jsonb_build_object('granted', false, 'reason','not_found'); end if;
  v_rung := hr._leave_admin_rung(pol.organization_id);
  if v_rung not in ('hr_admin','hr_owner') then
    return jsonb_build_object('granted', false, 'reason','not_an_hr_admin');
  end if;
  v_from := coalesce(p_effective_from, current_date);

  foreach v_emp in array coalesce(p_employment_ids, '{}'::uuid[]) loop
    select pa.worker_class into v_class
      from hr.position_assignment pa
     where pa.employment_id = v_emp and pa.is_primary and pa.deleted_at is null
     order by pa.effective_from desc limit 1;

    -- D8: a contractor is NEVER auto-enrolled. Adding one is an explicit, reasoned override and
    -- it is not this door.
    if v_class = 'contractor' then
      v_skipped := v_skipped || jsonb_build_array(jsonb_build_object(
        'employment_id', v_emp, 'reason','contractor_not_auto_enrolled',
        'detail','Contractors are never enrolled automatically.'));
      continue;
    end if;
    if array_length(pol.worker_class_scope, 1) is not null
       and not (v_class = any(pol.worker_class_scope)) then
      v_skipped := v_skipped || jsonb_build_array(jsonb_build_object(
        'employment_id', v_emp, 'reason','outside_worker_class_scope',
        'worker_class', v_class));
      continue;
    end if;
    if exists (select 1 from hr.leave_enrollment e
                where e.employment_id = v_emp and e.leave_policy_id = p_leave_policy_id
                  and e.deleted_at is null
                  and (e.effective_to is null or e.effective_to >= v_from)) then
      v_skipped := v_skipped || jsonb_build_array(jsonb_build_object(
        'employment_id', v_emp, 'reason','already_enrolled'));
      continue;
    end if;

    perform hr.arm_write();
    insert into hr.leave_enrollment
      (employment_id, leave_policy_id, effective_from, policy_year_start_on, organization_id)
    values
      (v_emp, p_leave_policy_id, v_from,
       -- §2.8: stamped at enrollment and NEVER moved — moving it would re-cut a carryover
       -- boundary retroactively.
       date_trunc('year', v_from)::date, pol.organization_id);
    v_added := v_added + 1;
  end loop;

  return jsonb_build_object('granted', true, 'enrolled', v_added, 'skipped', v_skipped);
end
$function$;

-- -----------------------------------------------------------------------------------
-- 5. /hr/leave/balances (§5.1) — the org / team list
-- -----------------------------------------------------------------------------------

create or replace function hr.leave_balances(
  p_organization_id uuid, p_scope text default 'organization', p_filters jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
stable
security definer
set search_path to 'hr', 'public'
as $function$
declare
  v_rung text; v_uid uuid := auth.uid(); v_me uuid; v_rows jsonb := '[]'::jsonb; v_r record;
  v_fig jsonb; v_scope text;
begin
  v_rung := hr._leave_admin_rung(p_organization_id);
  select em.id into v_me
    from hr.employment em join hr.employee e on e.id = em.employee_id
   where e.login_user_id = v_uid and em.organization_id = p_organization_id
     and em.deleted_at is null limit 1;

  -- THE VIEW LAW (SPEC-ACCESS §4.1): every list declares its scope IN WORDS, and `mine` is the
  -- default. An org-wide list is a deliberate choice a role has to carry.
  v_scope := case
    when p_scope = 'organization' and v_rung in ('hr_admin','hr_owner','payroll_admin','leave_administrator')
      then 'organization'
    when p_scope in ('team','organization') and v_rung = 'manager' then 'team'
    else 'mine' end;

  for v_r in
    select en.employment_id, en.leave_policy_id, p.name as policy_name, p.leave_kind
      from hr.leave_enrollment en
      join hr.leave_policy p on p.id = en.leave_policy_id and p.deleted_at is null
      join hr.employment em on em.id = en.employment_id and em.deleted_at is null
     where en.organization_id = p_organization_id and en.deleted_at is null
       and (en.effective_to is null or en.effective_to >= current_date)
       and (
         (v_scope = 'organization')
         or (v_scope = 'mine' and en.employment_id = v_me)
         or (v_scope = 'team' and exists (
               select 1 from hr.reporting_line rl
                where rl.employment_id = en.employment_id
                  and rl.manager_employment_id = v_me and rl.deleted_at is null))
       )
       and (p_filters ->> 'leave_policy_id' is null
            or en.leave_policy_id = (p_filters ->> 'leave_policy_id')::uuid)
  loop
    v_fig := hr.leave_figures(v_r.employment_id, v_r.leave_policy_id, current_date);
    if coalesce((p_filters ->> 'negative_only')::boolean, false)
       and coalesce((v_fig ->> 'ledger_balance')::numeric, 0) >= 0 then
      continue;
    end if;
    v_rows := v_rows || jsonb_build_array(v_fig || jsonb_build_object(
      'employment_id', v_r.employment_id,
      'employee_name', hr._subject_display_name(v_r.employment_id, v_uid),
      'sentence', hr._leave_sentence(v_fig),
      'ledger_href', format('/hr/leave/balances/%s/%s', v_r.employment_id, v_r.leave_policy_id)));
  end loop;

  return jsonb_build_object(
    'granted', v_rung <> 'none' or v_me is not null,
    'scope', v_scope,
    'scope_label', case v_scope when 'organization' then 'Organization'
                                when 'team' then 'My team' else 'Mine' end,
    'rung', v_rung,
    'can_adjust', v_rung in ('hr_admin','hr_owner'),
    'rows', v_rows);
end
$function$;

-- -----------------------------------------------------------------------------------
-- 6. The who's-out calendar (§10) — the disclosure ladder, applied SERVER-SIDE
-- -----------------------------------------------------------------------------------

create or replace function hr.leave_calendar(
  p_organization_id uuid, p_from date, p_to date, p_filters jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
stable
security definer
set search_path to 'hr', 'public'
as $function$
declare
  v_uid uuid := auth.uid(); v_me uuid; v_rung text; v_rows jsonb := '[]'::jsonb; v_r record;
  v_peers boolean; v_shows_type boolean; v_case_visible boolean; v_rung_for text;
begin
  select em.id into v_me
    from hr.employment em join hr.employee e on e.id = em.employee_id
   where e.login_user_id = v_uid and em.organization_id = p_organization_id
     and em.deleted_at is null limit 1;
  if v_me is null and v_uid is null then
    return jsonb_build_object('granted', false, 'reason','no_authenticated_caller');
  end if;
  v_rung := hr._leave_admin_rung(p_organization_id);
  v_peers := coalesce((hr._hr_knob('hr.leave','who_is_out_visible_to_peers', p_organization_id,'true'::jsonb) #>> '{}')::boolean, true);
  v_shows_type := coalesce((hr._hr_knob('hr.leave','who_is_out_shows_type', p_organization_id,'false'::jsonb) #>> '{}')::boolean, false);
  v_case_visible := coalesce((hr._hr_knob('hr.leave','case_existence_visible_to_manager', p_organization_id,'true'::jsonb) #>> '{}')::boolean, true);

  for v_r in
    select r.id, r.employment_id, r.starts_on, r.ends_on, r.approved_hours, r.is_partial_day,
           r.leave_case_id, p.leave_kind, p.name as policy_name
      from hr.leave_request r
      join hr.leave_policy p on p.id = r.leave_policy_id
     where r.organization_id = p_organization_id and r.deleted_at is null
       and r.state in ('approved','taken','partially_taken')
       and daterange(r.starts_on, r.ends_on, '[]') && daterange(p_from, p_to, '[]')
     order by r.starts_on
  loop
    -- decision 5: the rung is decided HERE, and only what the rung permits leaves this function.
    v_rung_for := case
      when v_r.employment_id = v_me then 'self'
      when v_rung in ('hr_admin','hr_owner','leave_administrator') then 'admin'
      when exists (select 1 from hr.reporting_line rl
                    where rl.employment_id = v_r.employment_id
                      and rl.manager_employment_id = v_me and rl.deleted_at is null) then 'manager'
      else 'peer' end;

    if v_rung_for = 'peer' and not v_peers then
      continue;   -- the knob is off: the person does not appear at all
    end if;

    v_rows := v_rows || jsonb_build_array(jsonb_build_object(
      'employment_id', v_r.employment_id,
      'employee_name', hr._subject_display_name(v_r.employment_id, v_uid),
      'starts_on', v_r.starts_on, 'ends_on', v_r.ends_on,
      'partial_day', v_r.is_partial_day,
      'viewer_rung', v_rung_for,
      -- A peer learns only that somebody is out. A manager learns the type. Nobody but HR and
      -- the person learns that a protected absence is protected.
      'label', case
        when v_r.leave_case_id is not null and v_rung_for in ('manager')
          then case when v_case_visible then 'Out — approved leave' else 'Out' end
        when v_rung_for = 'peer'
          then case when v_shows_type then format('Out — %s', v_r.leave_kind) else 'Out' end
        when v_rung_for in ('self','admin','manager')
          then format('Out — %s', v_r.policy_name)
        else 'Out' end,
      'existence_statement', case
        when v_r.leave_case_id is not null and v_rung_for = 'manager' and v_case_visible
          then 'This person has an approved leave. Details are held by HR.'
        else null end,
      'hours', case when v_rung_for in ('self','admin','manager') then v_r.approved_hours end,
      -- every entry is a door, EXCEPT a peer's "Out" (§10)
      'href', case when v_rung_for = 'peer' then null
                   when v_rung_for = 'self' then '/hr/me/time-off'
                   else format('/hr/leave?request=%s', v_r.id) end,
      'case_linked', case when v_rung_for in ('admin','self') then (v_r.leave_case_id is not null) end));
  end loop;

  return jsonb_build_object(
    'granted', true, 'from', p_from, 'to', p_to, 'rung', v_rung,
    'entries', v_rows,
    -- empty is a STATE, not a blank (§10)
    'empty_statement', case when jsonb_array_length(v_rows) = 0
                            then 'Nobody is scheduled to be out.' end);
end
$function$;

-- -----------------------------------------------------------------------------------
-- 7. The balance adjustment (§6)
-- -----------------------------------------------------------------------------------

create or replace function hr.leave_adjust(
  p_employment_id uuid, p_leave_policy_id uuid, p_direction text, p_hours numeric,
  p_reason_category text, p_note text, p_confirm_below_floor boolean default false
) returns jsonb
language plpgsql
security definer
set search_path to 'hr', 'public'
as $function$
declare
  pol hr.leave_policy%rowtype; v_rung text; v_uid uuid := auth.uid(); v_me uuid;
  v_delta numeric; v_fig jsonb; v_after numeric; v_post jsonb; v_org uuid;
begin
  pol := hr._leave_policy_at(p_leave_policy_id);
  if pol.id is null then return jsonb_build_object('granted', false, 'reason','not_found'); end if;
  v_org := pol.organization_id;
  v_rung := hr._leave_admin_rung(v_org);
  if v_rung not in ('hr_admin','hr_owner') then
    return jsonb_build_object('granted', false, 'reason','not_an_hr_admin',
      'detail','A balance is adjusted by HR. A manager never adjusts one.');
  end if;

  select em.id into v_me
    from hr.employment em join hr.employee e on e.id = em.employee_id
   where e.login_user_id = v_uid and em.organization_id = v_org and em.deleted_at is null limit 1;
  -- the same never-self predicate the workflow uses
  if v_me = p_employment_id then
    return jsonb_build_object('granted', false, 'reason','never_adjust_your_own_balance',
      'detail','You cannot adjust your own balance.');
  end if;

  if p_direction not in ('add','remove') then
    return jsonb_build_object('granted', false, 'reason','direction_required',
      'detail','Choose Add or Remove. A balance never moves by a raw signed number.');
  end if;
  if coalesce(p_hours, 0) <= 0 then
    return jsonb_build_object('granted', false, 'reason','hours_required');
  end if;
  if p_reason_category is null then
    return jsonb_build_object('granted', false, 'reason','reason_required');
  end if;
  if length(coalesce(btrim(p_note),'')) < 20
     or (p_reason_category = 'other' and length(btrim(p_note)) < 60) then
    return jsonb_build_object('granted', false, 'reason','note_too_short',
      'detail', case when p_reason_category = 'other'
                     then 'An "other" adjustment needs at least 60 characters explaining it.'
                     else 'An adjustment needs at least 20 characters explaining it.' end);
  end if;

  v_delta := case p_direction when 'add' then p_hours else -p_hours end;
  v_fig := hr.leave_figures(p_employment_id, p_leave_policy_id, current_date);
  v_after := coalesce((v_fig ->> 'ledger_balance')::numeric, 0) + v_delta;

  if pol.negative_balance_floor is not null and v_after < pol.negative_balance_floor then
    if v_rung <> 'hr_owner' then
      return jsonb_build_object('granted', false, 'reason','below_negative_floor',
        'floor', pol.negative_balance_floor, 'resulting_balance', v_after,
        'detail', format('This would take the balance to %s hours, below the %s floor. Only an HR '
                      || 'owner can do that.', trim(to_char(v_after,'FM999999.99')),
                         trim(to_char(pol.negative_balance_floor,'FM999999.99'))));
    end if;
    if not p_confirm_below_floor then
      return jsonb_build_object('granted', false, 'reason','confirmation_required',
        'resulting_balance', v_after,
        'detail', format('Confirm: this leaves a balance of %s hours.',
                         trim(to_char(v_after,'FM999999.99'))));
    end if;
  end if;

  -- §6: clawing back statutory sick time is exactly the action that must leave a trail.
  if pol.statutory_basis_rule_class is not null and p_direction = 'remove' then
    if p_reason_category not in ('correction_of_error','over_accrual_recovery') then
      return jsonb_build_object('granted', false, 'reason','statutory_removal_reason',
        'detail','Time earned under a legal minimum can only be removed to correct an error or '
              || 'recover an over-accrual, and the removal is recorded for compliance.');
    end if;
    perform hr.raise_compliance_exception(
      v_org, coalesce(hr._leave_jurisdiction_key_or_federal(p_employment_id), 'US'),
      null, null, pol.statutory_basis_rule_class, 'statutory_balance_removed',
      format('%s hours were removed by hand from a statutory leave balance (%s).',
             trim(to_char(p_hours,'FM999999.99')), p_reason_category));
  end if;

  v_post := hr.leave_ledger_post(
    p_employment_id     => p_employment_id,
    p_leave_policy_id   => p_leave_policy_id,
    p_entry_kind        => 'adjustment',
    p_hours_delta       => v_delta,
    p_occurred_on       => current_date,
    p_note              => p_reason_category || ' — ' || btrim(p_note),
    p_engine_key        => 'manual_adjustment',
    p_actor_type        => 'hr_admin',
    p_actor_employment_id => v_me,
    p_actor_user_id     => v_uid,
    p_snapshot_inputs   => jsonb_build_object('reason_category', p_reason_category,
                                              'note', btrim(p_note),
                                              'prior_balance', v_fig -> 'ledger_balance'));
  if not coalesce((v_post ->> 'ok')::boolean, false) then
    return jsonb_build_object('granted', false, 'reason', coalesce(v_post ->> 'refused','post_refused'),
                              'detail', v_post ->> 'detail');
  end if;

  return jsonb_build_object('granted', true, 'entry_id', v_post ->> 'entry_id',
                            'balance_before', v_fig -> 'ledger_balance',
                            'balance_after', v_post -> 'balance_after',
                            'notify', 'hr.leave.balance_adjusted');
end
$function$;

-- the small jurisdiction reader the adjustment needs, sharing the writer's own fallback ladder
create or replace function hr._leave_jurisdiction_key_or_federal(p_employment_id uuid)
returns text
language plpgsql
stable
security definer
set search_path to 'hr', 'public'
as $function$
declare v_key text;
begin
  begin
    v_key := hr._subject_jurisdiction_key('hr_employment', p_employment_id);
  exception when others then v_key := null;
  end;
  if v_key is null then
    select j.key into v_key
      from hr.position_assignment pa
      join hr.location loc on loc.id = pa.location_id
      join hr.jurisdiction j on j.id = loc.jurisdiction_id
     where pa.employment_id = p_employment_id and pa.is_primary and pa.deleted_at is null
     order by pa.effective_from desc limit 1;
  end if;
  return coalesce(v_key, 'US');
end
$function$;

-- -----------------------------------------------------------------------------------
-- 8. Public wrappers
-- -----------------------------------------------------------------------------------

create or replace function public.hr_leave_policy_list(p_organization_id uuid)
returns jsonb language sql security definer set search_path to 'public','hr'
as $function$ select hr.leave_policy_list(p_organization_id); $function$;

create or replace function public.hr_leave_policy_validate(p_organization_id uuid, p_payload jsonb)
returns jsonb language sql security definer set search_path to 'public','hr'
as $function$ select hr.leave_policy_validate(p_organization_id, p_payload); $function$;

create or replace function public.hr_leave_policy_save(
  p_organization_id uuid, p_payload jsonb, p_accept_warnings boolean default false)
returns jsonb language sql security definer set search_path to 'public','hr'
as $function$ select hr.leave_policy_save(p_organization_id, p_payload, p_accept_warnings); $function$;

create or replace function public.hr_leave_enroll(
  p_leave_policy_id uuid, p_employment_ids uuid[], p_effective_from date default null)
returns jsonb language sql security definer set search_path to 'public','hr'
as $function$ select hr.leave_enroll(p_leave_policy_id, p_employment_ids, p_effective_from); $function$;

create or replace function public.hr_leave_balances(
  p_organization_id uuid, p_scope text default 'organization', p_filters jsonb default '{}'::jsonb)
returns jsonb language sql security definer set search_path to 'public','hr'
as $function$ select hr.leave_balances(p_organization_id, p_scope, p_filters); $function$;

create or replace function public.hr_leave_calendar(
  p_organization_id uuid, p_from date, p_to date, p_filters jsonb default '{}'::jsonb)
returns jsonb language sql security definer set search_path to 'public','hr'
as $function$ select hr.leave_calendar(p_organization_id, p_from, p_to, p_filters); $function$;

create or replace function public.hr_leave_adjust(
  p_employment_id uuid, p_leave_policy_id uuid, p_direction text, p_hours numeric,
  p_reason_category text, p_note text, p_confirm_below_floor boolean default false)
returns jsonb language sql security definer set search_path to 'public','hr'
as $function$ select hr.leave_adjust(p_employment_id, p_leave_policy_id, p_direction, p_hours,
                                     p_reason_category, p_note, p_confirm_below_floor); $function$;

grant execute on function public.hr_leave_policy_list(uuid) to authenticated;
grant execute on function public.hr_leave_policy_validate(uuid,jsonb) to authenticated;
grant execute on function public.hr_leave_policy_save(uuid,jsonb,boolean) to authenticated;
grant execute on function public.hr_leave_enroll(uuid,uuid[],date) to authenticated;
grant execute on function public.hr_leave_balances(uuid,text,jsonb) to authenticated;
grant execute on function public.hr_leave_calendar(uuid,date,date,jsonb) to authenticated;
grant execute on function public.hr_leave_adjust(uuid,uuid,text,numeric,text,text,boolean) to authenticated;

-- 🚨 THE DOOR SEAL (hr_l5_04). `grant ... to authenticated` does NOT remove the anon EXECUTE that
-- Supabase's default privileges hand every new public function, and `revoke from public` does not
-- either — anon holds its own explicit grant. Both revokes must be explicit and name anon. This
-- lane shipped five SECURITY DEFINER doors, one a WRITE, executable by anon. Replaying this file
-- re-seals rather than regressing.

select hr.leave_seal_door('hr_leave_policy_list');
select hr.leave_seal_door('hr_leave_policy_validate');
select hr.leave_seal_door('hr_leave_policy_save');
select hr.leave_seal_door('hr_leave_enroll');
select hr.leave_seal_door('hr_leave_balances');
select hr.leave_seal_door('hr_leave_calendar');
select hr.leave_seal_door('hr_leave_adjust');

do $$
declare v_anon text;
begin
  select string_agg(p.proname, ', ') into v_anon
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname in ('hr_leave_policy_list', 'hr_leave_policy_validate', 'hr_leave_policy_save', 'hr_leave_enroll', 'hr_leave_balances', 'hr_leave_calendar', 'hr_leave_adjust')
     and has_function_privilege('anon', p.oid, 'execute');
  if v_anon is not null then
    raise exception 'hr_l5_05: these doors are executable by anon: %', v_anon;
  end if;
end $$;

-- -----------------------------------------------------------------------------------
-- 9. Self-proof
-- -----------------------------------------------------------------------------------

do $$
declare v_missing text; v_p jsonb;
begin
  select string_agg(f, ', ') into v_missing from unnest(array[
    'hr._leave_config_parameters','hr._leave_admin_rung','hr.leave_policy_list',
    'hr.leave_policy_validate','hr.leave_policy_save','hr.leave_enroll','hr.leave_balances',
    'hr.leave_calendar','hr.leave_adjust','hr._leave_jurisdiction_key_or_federal',
    'public.hr_leave_policy_list','public.hr_leave_policy_validate','public.hr_leave_policy_save',
    'public.hr_leave_enroll','public.hr_leave_balances','public.hr_leave_calendar',
    'public.hr_leave_adjust']) f
   where not exists (
     select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = split_part(f,'.',1) and p.proname = split_part(f,'.',2));
  if v_missing is not null then
    raise exception 'hr_l5_05: these objects did not land: %', v_missing;
  end if;

  -- decision 1: the trigger must now CALL the shared mapping, not carry its own copy
  if (select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'hr' and p.proname = '_leave_policy_lawful')
     not like '%hr._leave_config_parameters%' then
    raise exception 'hr_l5_05: the lawfulness trigger still carries its own parameter mapping';
  end if;

  -- and the mapping must reproduce the contract byte for byte on the two compared classes
  v_p := hr._leave_config_parameters('pto-carryover-legality',
           jsonb_build_object('carryover_allowed', false));
  if v_p ->> 'carryover_policy' <> 'forfeit' then
    raise exception 'hr_l5_05: carryover mapping is wrong: %', v_p;
  end if;
  v_p := hr._leave_config_parameters('sick-leave-floor',
           jsonb_build_object('accrual_method','per_hours_worked','accrual_rate',1,
                              'accrual_per_units',40,'usable_after_days',90,
                              'carryover_allowed', true));
  if (v_p #>> '{accrual,per_hours_worked}') <> '40'
     or (v_p ->> 'use_permitted_after_days') <> '90' then
    raise exception 'hr_l5_05: sick-leave-floor mapping is wrong: %', v_p;
  end if;
end $$;
