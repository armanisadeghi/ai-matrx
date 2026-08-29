-- hr_l1_66 — A REHIRE CARRIES ITS SERVICE DATES.
--
-- RECORD of a live change applied on 2026-08-29.
--
-- 🚨 WHAT WAS MISSING. SPEC-EMPLOYEES §4.6 says the second spell carries
-- `original_hire_date`, sets `prior_employment_id`, and gets an `adjusted_service_date`
-- "per the org rule" -- and §4.6 L says the rehired person's profile then shows "both spells with
-- a visible service-date line: original hire, adjusted service date, current hire".
-- `public.hr_employee_create` carried `original_hire_date` (min hire_date of the prior spells) and
-- nothing else: `adjusted_service_date` and `prior_employment_id` were read from the PAYLOAD only,
-- and the client (features/hr/people/new/HrNewEmployee.tsx) sends neither. So every rehire wrote
-- them NULL, `hr.employees.adjusted_service_date_rule` -- an org knob with a real default,
-- `carry_if_gap_under_months:12` -- was read by nothing in the database, and the profile's
-- "Adjusted service date" line (JobTab.tsx SpellRow) could never render.
--
-- 🚨 A DEFAULTING RULE BELONGS IN A BEFORE INSERT TRIGGER, not in one door. A rehire is a second
-- `hr.employment` row however it was written -- the create door today, an import or a correction
-- tomorrow -- and the org's service-date rule must hold for all of them. The trigger fills only
-- what the caller left NULL, so an HR admin who states an adjusted service date explicitly always
-- wins over the rule.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. The rule, in one function, reading the org's knob.

create or replace function hr.rehire_service_dates(
  p_employee_id uuid,
  p_hire_date date,
  p_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, hr, platform, pg_temp
as $fn$
-- What the NEW spell's service dates should be, given the spells that came before it.
-- Returns every part of the answer, including the gap the rule was applied to, because
-- "adjusted service date = 2024-03-01" is unreadable without "the gap was 4 months".
declare
  v_prior_id uuid; v_prior_end date; v_original date;
  v_rule text; v_months int; v_gap int; v_adjusted date; v_carried boolean := false;
begin
  select em.id, coalesce(em.termination_date, em.last_day_worked), null
    into v_prior_id, v_prior_end, v_original
    from hr.employment em
   where em.employee_id = p_employee_id and em.deleted_at is null
     and em.hire_date <= p_hire_date
   order by em.spell_number desc
   limit 1;

  select min(em.hire_date) into v_original
    from hr.employment em
   where em.employee_id = p_employee_id and em.deleted_at is null;

  if v_prior_id is null then
    return jsonb_build_object('prior_employment_id', null, 'original_hire_date', p_hire_date,
      'adjusted_service_date', p_hire_date, 'gap_months', null, 'rule', null, 'carried', false);
  end if;

  v_rule := coalesce(platform.knob_resolve('hr.employees','adjusted_service_date_rule',
                                           p_organization_id, null, null) #>> '{}',
                     'carry_if_gap_under_months:12');

  if v_prior_end is not null then
    v_gap := (date_part('year', age(p_hire_date, v_prior_end)) * 12
              + date_part('month', age(p_hire_date, v_prior_end)))::int;
  end if;

  if v_rule like 'carry_if_gap_under_months:%' then
    v_months := nullif(split_part(v_rule, ':', 2), '')::int;
    v_carried := v_gap is not null and v_months is not null and v_gap < v_months;
  elsif v_rule = 'never_carry' then
    v_carried := false;
  elsif v_rule = 'always_carry' then
    v_carried := true;
  else
    -- 🚨 LOUD, never silent. An unreadable rule must not quietly become "service restarts":
    -- that is a benefits and accrual answer, and getting it wrong invisibly is the worst outcome.
    raise warning 'hr.rehire_service_dates: org % has an unrecognised adjusted_service_date_rule %; service was NOT carried',
      p_organization_id, v_rule;
  end if;

  v_adjusted := case when v_carried then coalesce(v_original, p_hire_date) else p_hire_date end;

  return jsonb_build_object(
    'prior_employment_id', v_prior_id,
    'original_hire_date', coalesce(v_original, p_hire_date),
    'adjusted_service_date', v_adjusted,
    'prior_ended_on', v_prior_end,
    'gap_months', v_gap,
    'rule', v_rule,
    'carried', v_carried);
end
$fn$;

comment on function hr.rehire_service_dates(uuid,date,uuid) is
  'SPEC-EMPLOYEES §4.6: what the new spell''s service dates are, given the prior spells and the org''s hr.employees.adjusted_service_date_rule knob. The one place that rule is read.';

revoke execute on function hr.rehire_service_dates(uuid,date,uuid) from public;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. The defaulting trigger. Fills ONLY what the writer left null.

create or replace function hr._employment_service_dates_tg()
returns trigger
language plpgsql
security definer
set search_path = public, hr, platform, pg_temp
as $fn$
declare v jsonb;
begin
  if coalesce(new.spell_number, 1) <= 1 then
    -- A first spell has nothing to carry, and inventing an adjusted service date equal to the
    -- hire date would print a meaningless third line on every profile in the product. Untouched.
    return new;
  end if;

  v := hr.rehire_service_dates(new.employee_id, new.hire_date, new.organization_id);

  new.prior_employment_id := coalesce(new.prior_employment_id,
                                      nullif(v ->> 'prior_employment_id','')::uuid);
  new.original_hire_date := coalesce(new.original_hire_date,
                                     nullif(v ->> 'original_hire_date','')::date);
  new.adjusted_service_date := coalesce(new.adjusted_service_date,
                                        nullif(v ->> 'adjusted_service_date','')::date);
  new.is_rehire := coalesce(new.is_rehire, true);
  return new;
end
$fn$;

drop trigger if exists employment_service_dates on hr.employment;
create trigger employment_service_dates
  before insert on hr.employment
  for each row execute function hr._employment_service_dates_tg();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Contract pin.

insert into hr.function_contract
  (schema_name, function_name, home_migration, must_contain, must_not_contain, reason, must_be_definer)
select 'hr','rehire_service_dates','hr_l1_66_a_rehire_carries_its_service_dates.sql',
       array['adjusted_service_date_rule','knob_resolve'], array[]::text[],
       'SPEC-EMPLOYEES §4.6: the adjusted service date is the ORG''s rule, resolved from the '
       || 'hr.employees.adjusted_service_date_rule knob — never a constant in code. Before '
       || 'hr_l1_66 the knob existed and nothing read it, so every rehire wrote a NULL adjusted '
       || 'service date and the profile''s service-date line could not render.', true
where not exists (select 1 from hr.function_contract c
                   where c.schema_name = 'hr' and c.function_name = 'rehire_service_dates');

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Self-verification.
do $chk$
declare v_broken int;
begin
  if not exists (select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
                  join pg_namespace n on n.oid = c.relnamespace
                 where n.nspname = 'hr' and c.relname = 'employment'
                   and t.tgname = 'employment_service_dates' and not t.tgisinternal) then
    raise exception 'hr_l1_66: the service-date defaulting trigger is missing';
  end if;

  if (hr.rehire_service_dates('00000000-0000-0000-0000-000000000000'::uuid, current_date,
        '00000000-0000-0000-0000-000000000000'::uuid) ->> 'adjusted_service_date')
      is distinct from current_date::text then
    raise exception 'hr_l1_66: the no-prior-spell answer is not the hire date itself';
  end if;

  select count(*) into v_broken from hr.function_contracts_broken()
   where qname = 'hr.rehire_service_dates';
  if v_broken > 0 then
    raise exception 'hr_l1_66: % contract clause(s) broken', v_broken;
  end if;

  raise notice 'hr_l1_66: rehire service dates carry per the org rule';
end
$chk$;
