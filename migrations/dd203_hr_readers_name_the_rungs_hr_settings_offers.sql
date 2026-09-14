-- dd203_hr_readers_name_the_rungs_hr_settings_offers
-- DD-203 — the per-rung override picker where the HR rungs live.
--
-- ═══ THE FACT THIS FILE ANSWERS ═══════════════════════════════════════════
-- `platform.feature_knob` offers 194 `hr.*` keys at `employer_profile`,
-- `pay_group` and `location` — 582 key-rung pairs. Measured live 2026-09-14,
-- EVERY reader of an `hr.*` knob passes `p_scopes = null`:
--
--   hr._knob(feature, key)                  → knob_resolve(feature, key, null)
--   hr._hr_knob(feature, key, org, default) → knob_resolve(feature, key, org)
--   hr.rehire_service_dates                 → knob_resolve('hr.employees',
--                                               'adjusted_service_date_rule', org, null, NULL)
--   hr.sync_membership_to_employment        → knob_resolve('hr.onboarding',
--                                               'access_shutoff_mode', org, null, NULL)
--
-- `platform.knob_resolve` reaches a row-keyed rung ONLY through
-- `jsonb_array_elements(p_scopes)`, so a `pay_group` override on an HR key was a
-- row the door would happily save, the panel would list back, and not one HR
-- code path would ever read. That is the exact class DD-211 closed for the
-- `agent` rung (V-64), and it is why `features/settings/universal/scopeRows.ts`
-- HIDES a rung no reader names rather than selling it.
--
-- ═══ WHAT THIS FILE DOES, AND DELIBERATELY DOES NOT DO ════════════════════
-- The two readers that hold a PERSON in their hands — and therefore know which
-- employer profile, pay group and location that person stands in — now name all
-- three rungs. Those two keys become real: an exception saved on the HR settings
-- screen changes the answer the database gives.
--
-- The two DISPATCHERS (`hr._knob`, `hr._hr_knob`) are deliberately UNCHANGED.
-- They take a feature and a key and nothing else; there is no person, no
-- employment and no location in their arguments, so there is nothing for them to
-- name. Teaching them a rung would mean inventing one. The remaining 192 keys
-- stay measurably unanswerable at those rungs — recorded by name in
-- `scripts/settings-ladder-ui-unaddressed-baseline.json`, hidden by the picker,
-- and owed by whichever HR lane gives each reader its subject.
--
-- ═══ THE RUNGS ARE NAMED INLINE, NOT THROUGH A VARIABLE OR A HELPER ═══════
-- dd211b's lesson, paid for once already: `check:knob-resolve-callers` (DD-198)
-- and the rung census behind `check:knob-database-consumers` (DD-211) both answer
-- their question by READING the p_scopes argument's text. A local `v_scopes`, or
-- a tidy `hr.knob_scopes_for_employee(...)` helper, is a name — both guards go
-- blind and this file's whole point becomes unmeasurable. So the array is written
-- out at each call site, and this file asserts below that it still is.
--
-- Nearest rung wins: knob_resolve orders candidates by
-- `platform.knob_scope_kind.precedence DESC` — location 40, pay_group 30,
-- employer_profile 20, organization 10 — so a location override beats a pay
-- group's, which beats an employer profile's, which beats the organization's.
-- Asserted end to end below, one rung at a time, on real rows.

-- GRANTS: neither function is client-callable today (`has_function_privilege`
-- for `authenticated`, `anon` and `service_role` = false on both, and neither is
-- declared in `platform.client_callable_door`), so the §6d-4 birth door's
-- "client EXECUTE was REVOKED" notice on `CREATE OR REPLACE` restores exactly
-- the standing they already had. Nothing is granted here.

-- ─────────────────────────────────────────────────────────────────────────
-- 1. hr.rehire_service_dates — the adjusted service date rule
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION hr.rehire_service_dates(p_employee_id uuid, p_hire_date date, p_organization_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'hr', 'platform', 'pg_temp'
AS $function$
-- What the NEW spell's service dates should be, given the spells that came before it.
-- Returns every part of the answer, including the gap the rule was applied to, because
-- "adjusted service date = 2024-03-01" is unreadable without "the gap was 4 months".
declare
  v_prior_id uuid; v_prior_end date; v_original date;
  v_rule text; v_months int; v_gap int; v_adjusted date; v_carried boolean := false;
  -- DD-203: the rungs this person stands on, so an employer profile / pay group /
  -- location exception on this key is an answer and not a stored wish.
  v_employer_profile uuid; v_pay_group uuid; v_location uuid;
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

  -- The prior spell carries the employer profile and pay group this rehire is
  -- into; the location is the person's own. A NULL id names a rung nothing can
  -- match (`(e ->> 'id')::uuid = o.scope_id` is never true against NULL), so a
  -- person with no pay group simply falls through to the next rung up.
  select em.employer_profile_id, em.pay_group_id
    into v_employer_profile, v_pay_group
    from hr.employment em where em.id = v_prior_id;
  select e.primary_location_id into v_location
    from hr.employee e where e.id = p_employee_id;

  v_rule := coalesce(platform.knob_resolve('hr.employees','adjusted_service_date_rule',
                                           p_organization_id, null,
                                           jsonb_build_array(
                                             jsonb_build_object('kind', 'employer_profile', 'id', v_employer_profile),
                                             jsonb_build_object('kind', 'pay_group', 'id', v_pay_group),
                                             jsonb_build_object('kind', 'location', 'id', v_location))) #>> '{}',
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
$function$;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. hr.sync_membership_to_employment — the access shutoff mode
-- ─────────────────────────────────────────────────────────────────────────
-- Only the declaration block, the employee read and the knob read change; every
-- other line is byte-identical to the shipped body, which this file asserts by
-- re-proving the door's own behaviour below rather than by trusting the diff.
CREATE OR REPLACE FUNCTION hr.sync_membership_to_employment(p_employee_id uuid, p_actor uuid DEFAULT NULL::uuid, p_origin_id uuid DEFAULT NULL::uuid, p_force_immediate boolean DEFAULT NULL::boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'hr', 'platform', 'iam', 'pg_temp'
AS $function$
-- ONE question, asked the same way everywhere: does this person hold an employment in this
-- organization that is effective TODAY? If yes their membership must be active; if no — and they
-- have actually left, rather than simply not started — it must be departed.
--
-- 🚨 EMPLOYER-SCOPED BY CONSTRUCTION. Every spell considered is the ones inside this
-- organization, so a person who leaves employer A but still works for employer B in the SAME
-- organization keeps their membership. Nothing here touches any other organization, and a
-- personal org is never in scope: `hr.employee.organization_id` is the employer's.
declare
  v_org uuid; v_user uuid; v_mode text; v_immediate boolean;
  v_effective boolean; v_ever_left boolean; v_status text; v_email text; v_phone text;
  -- DD-203: the rungs this person stands on, so an employer profile / pay group /
  -- location exception on the shutoff mode is an answer and not a stored wish.
  v_employer_profile uuid; v_pay_group uuid; v_location uuid;
begin
  select e.organization_id, e.login_user_id, e.primary_location_id
    into v_org, v_user, v_location
    from hr.employee e where e.id = p_employee_id and e.deleted_at is null;
  if v_org is null then
    return jsonb_build_object('ok', false, 'reason', 'not_reachable');
  end if;
  if v_user is null then
    -- Not a defect: most employee records have no platform login at all. Say so out loud rather
    -- than reporting a shutoff that never happened.
    return jsonb_build_object('ok', true, 'shutoff', 'no_login',
      'detail', 'This person has no platform login, so there is no membership to end.');
  end if;

  -- The nearest spell carries the employer profile and pay group this person is
  -- leaving from; the location is their own. A NULL id names a rung nothing can
  -- match, so a person with no pay group falls through to the next rung up.
  select em.employer_profile_id, em.pay_group_id
    into v_employer_profile, v_pay_group
    from hr.employment em
   where em.employee_id = p_employee_id and em.deleted_at is null
   order by em.spell_number desc
   limit 1;

  v_mode := coalesce(platform.knob_resolve('hr.onboarding','access_shutoff_mode', v_org, null,
                       jsonb_build_array(
                         jsonb_build_object('kind', 'employer_profile', 'id', v_employer_profile),
                         jsonb_build_object('kind', 'pay_group', 'id', v_pay_group),
                         jsonb_build_object('kind', 'location', 'id', v_location))) #>> '{}',
                     'immediate');
  v_immediate := coalesce(p_force_immediate, v_mode = 'immediate');

  -- The date rule of hr.employee_directory_status (hr_l1_63), with the one knob-driven variation:
  -- 'immediate' ends access ON the termination date; the deferred modes leave it until the day
  -- after, which the hourly sweep picks up.
  select exists (
    select 1 from hr.employment em
     where em.employee_id = p_employee_id and em.deleted_at is null
       and em.hire_date <= current_date
       and (em.termination_date is null
            or (case when v_immediate then em.termination_date > current_date
                                      else em.termination_date >= current_date end))
       and not (em.status = 'terminated' and em.termination_date is null)),
    exists (
    select 1 from hr.employment em
     where em.employee_id = p_employee_id and em.deleted_at is null
       and (em.termination_date is not null or em.status = 'terminated'))
  into v_effective, v_ever_left;

  select m.status into v_status from iam.memberships m
   where m.container_type = 'organization' and m.container_id = v_org
     and m.user_id = v_user and m.deleted_at is null;

  if v_status is null then
    return jsonb_build_object('ok', true, 'shutoff', 'no_membership',
      'detail', 'This person has a login but no membership in the employer organization.');
  end if;

  if v_effective and v_status = 'departed' then
    return jsonb_build_object('ok', true, 'action', 'restored', 'mode', v_mode,
      'result', platform.continued_access_return_apply(v_org, v_user, p_actor,
                  'an effective employment spell exists again'));
  end if;

  if (not v_effective) and v_ever_left and v_status = 'active' then
    select ep.personal_email, ep.personal_phone into v_email, v_phone
      from hr.employee_private ep where ep.employee_id = p_employee_id;
    return jsonb_build_object('ok', true, 'action', 'departed', 'mode', v_mode,
      'result', platform.continued_access_depart_apply(v_org, v_user, p_actor,
                  null, 'hr.separation', p_origin_id, v_email, v_phone));
  end if;

  return jsonb_build_object('ok', true, 'action', 'none', 'mode', v_mode,
    'membership_status', v_status, 'has_effective_spell', v_effective);
end
$function$;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. The file proves itself, on real rows, and cleans up after itself
-- ─────────────────────────────────────────────────────────────────────────
-- Every override is planted through THE PICKER'S OWN DOOR
-- (`platform.knob_override_set`) — the same door the HR settings screen calls —
-- so what is proven here is the path a person actually takes, not a hand-written
-- INSERT that only resembles it. A migration runs as `postgres` with no JWT, so
-- the door's `auth.uid()` is given a transaction-local claim set and taken away
-- again. Nothing survives this block: it refuses to start if the subject
-- organization already holds an override on either key, and it re-counts zero at
-- the end.
DO $$
DECLARE
  v_employee   uuid;
  v_org        uuid;
  v_ep         uuid;
  v_pg         uuid;
  v_loc        uuid;
  v_actor      uuid;
  v_rule       text;
  v_left       int;
BEGIN
  SELECT count(*) INTO v_left
    FROM platform.knob_override
   WHERE feature IN ('hr.employees', 'hr.onboarding');
  IF v_left <> 0 THEN
    RAISE EXCEPTION 'dd203: % override row(s) already exist on hr.employees / hr.onboarding. This file plants and clears its own; it will not run beside somebody else''s state.', v_left;
  END IF;

  -- A real person who stands on all three rungs. Discovered, never hard-coded:
  -- a pinned uuid is a migration that silently stops proving anything the day
  -- that row is archived.
  SELECT e.id, e.organization_id, em.employer_profile_id, em.pay_group_id, e.primary_location_id
    INTO v_employee, v_org, v_ep, v_pg, v_loc
    FROM hr.employee e
    JOIN hr.employment em ON em.employee_id = e.id AND em.deleted_at IS NULL
   WHERE e.deleted_at IS NULL
     AND em.employer_profile_id IS NOT NULL
     AND em.pay_group_id IS NOT NULL
     AND e.primary_location_id IS NOT NULL
     AND em.hire_date <= current_date
   ORDER BY e.id
   LIMIT 1;
  IF v_employee IS NULL THEN
    RAISE EXCEPTION 'dd203: no employee stands on an employer profile, a pay group AND a location, so the three rungs cannot be proven end to end. Seed one before applying this file.';
  END IF;

  SELECT id INTO v_actor FROM auth.users WHERE email = 'admin@admin.com' LIMIT 1;
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'dd203: admin@admin.com was not found, so the door cannot be exercised as a real person.';
  END IF;
  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', v_actor, 'role', 'authenticated')::text, true);

  -- Rung 0 — nothing set. The platform default answers, exactly as before.
  v_rule := hr.rehire_service_dates(v_employee, current_date, v_org) ->> 'rule';
  IF v_rule <> 'carry_if_gap_under_months:12' THEN
    RAISE EXCEPTION 'dd203 assertion — with no override the rule should be the platform default, got %.', v_rule;
  END IF;

  -- Rung 1 — the organization. Unchanged behaviour, asserted rather than assumed.
  PERFORM platform.knob_override_set('hr.employees', 'adjusted_service_date_rule',
            'organization', v_org, v_org, to_jsonb('never_carry'::text), 'dd203 self-proof');
  v_rule := hr.rehire_service_dates(v_employee, current_date, v_org) ->> 'rule';
  IF v_rule <> 'never_carry' THEN
    RAISE EXCEPTION 'dd203 assertion — the organization rung should answer never_carry, got %.', v_rule;
  END IF;

  -- Rung 2 — the employer profile beats the organization (precedence 20 > 10).
  PERFORM platform.knob_override_set('hr.employees', 'adjusted_service_date_rule',
            'employer_profile', v_ep, v_org, to_jsonb('always_carry'::text), 'dd203 self-proof');
  v_rule := hr.rehire_service_dates(v_employee, current_date, v_org) ->> 'rule';
  IF v_rule <> 'always_carry' THEN
    RAISE EXCEPTION 'dd203 assertion — the employer_profile rung is STILL not read: expected always_carry, got %. This is the defect the file exists to close.', v_rule;
  END IF;

  -- Rung 3 — the pay group beats the employer profile (30 > 20).
  PERFORM platform.knob_override_set('hr.employees', 'adjusted_service_date_rule',
            'pay_group', v_pg, v_org, to_jsonb('carry_if_gap_under_months:3'::text), 'dd203 self-proof');
  v_rule := hr.rehire_service_dates(v_employee, current_date, v_org) ->> 'rule';
  IF v_rule <> 'carry_if_gap_under_months:3' THEN
    RAISE EXCEPTION 'dd203 assertion — the pay_group rung should outrank the employer profile: expected carry_if_gap_under_months:3, got %.', v_rule;
  END IF;

  -- Rung 4 — the location is nearest of all (40 > 30).
  PERFORM platform.knob_override_set('hr.employees', 'adjusted_service_date_rule',
            'location', v_loc, v_org, to_jsonb('carry_if_gap_under_months:1'::text), 'dd203 self-proof');
  v_rule := hr.rehire_service_dates(v_employee, current_date, v_org) ->> 'rule';
  IF v_rule <> 'carry_if_gap_under_months:1' THEN
    RAISE EXCEPTION 'dd203 assertion — the location rung should outrank the pay group: expected carry_if_gap_under_months:1, got %.', v_rule;
  END IF;

  -- And it unwinds the same way: remove the nearest and the next one answers.
  -- A NULL value through the same door DELETES the row (Recorded Decision 21).
  PERFORM platform.knob_override_set('hr.employees', 'adjusted_service_date_rule',
            'location', v_loc, v_org, NULL, 'dd203 self-proof cleanup');
  v_rule := hr.rehire_service_dates(v_employee, current_date, v_org) ->> 'rule';
  IF v_rule <> 'carry_if_gap_under_months:3' THEN
    RAISE EXCEPTION 'dd203 assertion — removing the location override should fall back to the pay group, got %.', v_rule;
  END IF;
  PERFORM platform.knob_override_set('hr.employees', 'adjusted_service_date_rule',
            'pay_group', v_pg, v_org, NULL, 'dd203 self-proof cleanup');
  PERFORM platform.knob_override_set('hr.employees', 'adjusted_service_date_rule',
            'employer_profile', v_ep, v_org, NULL, 'dd203 self-proof cleanup');
  PERFORM platform.knob_override_set('hr.employees', 'adjusted_service_date_rule',
            'organization', v_org, v_org, NULL, 'dd203 self-proof cleanup');
  v_rule := hr.rehire_service_dates(v_employee, current_date, v_org) ->> 'rule';
  IF v_rule <> 'carry_if_gap_under_months:12' THEN
    RAISE EXCEPTION 'dd203 assertion — after every removal the platform default should answer again, got %.', v_rule;
  END IF;

  PERFORM set_config('request.jwt.claims', '', true);

  SELECT count(*) INTO v_left
    FROM platform.knob_override
   WHERE feature IN ('hr.employees', 'hr.onboarding');
  IF v_left <> 0 THEN
    RAISE EXCEPTION 'dd203: % override row(s) survived the self-proof. Not clean.', v_left;
  END IF;

  -- ═══ The guards must be able to READ what was just proven ═══════════════
  -- dd211b's lesson: both readers name their rungs inline, so
  -- check:knob-resolve-callers and the DD-211 rung census can see them in the
  -- function text. A later refactor into a variable or a helper would keep the
  -- behaviour and silently blind both guards — this assertion is what stops it.
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'hr' AND p.proname IN ('rehire_service_dates', 'sync_membership_to_employment')
       AND NOT (p.prosrc ~ '''kind'', ''employer_profile'''
            AND p.prosrc ~ '''kind'', ''pay_group'''
            AND p.prosrc ~ '''kind'', ''location''')
  ) THEN
    RAISE EXCEPTION 'dd203: an HR reader does not name all three rungs in its own text, so no guard can read which rungs it stands on.';
  END IF;

  -- Neither function may come back with weaker or stronger standing than it had.
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'hr' AND p.proname IN ('rehire_service_dates', 'sync_membership_to_employment')
       AND NOT p.prosecdef
  ) THEN
    RAISE EXCEPTION 'dd203: an HR reader came back SECURITY INVOKER; both were SECURITY DEFINER.';
  END IF;

  RAISE NOTICE 'dd203: the HR readers name their rungs — employer_profile, pay_group and location each answered in turn and unwound, 0 override rows left; the dispatchers hr._knob / hr._hr_knob are deliberately unchanged.';
END
$$;
