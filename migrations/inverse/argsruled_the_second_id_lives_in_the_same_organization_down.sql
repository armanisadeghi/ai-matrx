-- INVERSE of migrations/campaign/argsruled_the_second_id_lives_in_the_same_organization.sql.
--
-- It restores all eight bodies exactly as they stood before that file — each checking its first
-- id and writing its second one into the row unasked. With this applied, the red suite
-- scripts/campaign-tests/argsruled_second_id_red.sql passes again.
--
-- chair-step: it replaces eight live client-door bodies.

set lock_timeout = '2s';

CREATE OR REPLACE FUNCTION hr.attendance_exception_resolve(p_exception_id uuid, p_resolution_state text, p_note text DEFAULT NULL::text, p_premium_earning_code_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'hr', 'public'
AS $function$
declare
  v_uid      uuid := auth.uid();
  v_ae       hr.attendance_exception%rowtype;
  v_allowed  text[];
  v_actor    uuid;
  v_lock     jsonb;
  v_wants    boolean;
  v_code     hr.earning_code%rowtype;
  v_want     text;
  v_ww       uuid;
  v_existing uuid;
  v_why      text;
  v_new      uuid;
  v_written  jsonb := '[]'::jsonb;
  v_capped   boolean := false;
  v_note     text;
begin
  if v_uid is null then
    return hr._time_refusal('hr_no_authenticated_caller',
      'Resolving an exception is always an act by somebody. Sign in and try again.');
  end if;
  if p_exception_id is null or coalesce(btrim(p_resolution_state), '') = '' then
    return hr._time_refusal('hr_arguments_incomplete',
      'Both the exception and the resolution are required.');
  end if;

  select * into v_ae from hr.attendance_exception where id = p_exception_id;
  if not found then
    return hr._time_refusal('hr_exception_not_found',
      'No attendance exception with that id is readable.',
      jsonb_build_object('exception_id', p_exception_id));
  end if;

  v_allowed := hr._time_exception_allowed_resolutions(v_ae.severity);

  if not hr.capability(v_uid, 'time.read', v_ae.employment_id, v_ae.local_work_date) then
    return hr._time_refusal('hr_no_exception_authority',
      'Resolving an attendance exception is a manager or HR act. An employee can read their own exceptions and comment on them, but not resolve them. You hold no reach over this employment as of this work date.',
      jsonb_build_object('capability_required', 'time.read',
                         'subject_employment_id', v_ae.employment_id,
                         'as_of', v_ae.local_work_date,
                         'allowedResolutions', to_jsonb(v_allowed)));
  end if;
  v_actor := hr._time_actor_employment(v_uid, v_ae.organization_id);
  if v_actor is null then
    return hr._time_refusal('hr_actor_not_employed',
      'You hold no employment in this organization, so this resolution cannot be attributed to anybody.');
  end if;

  if p_resolution_state = 'excused' and v_ae.severity = 'violation' then
    return hr._time_refusal('hr_statutory_premium_not_excusable',
      'This is a statutory violation, and a statutory violation cannot be excused. The premium is owed whether or not anybody agrees it should have happened. Resolve it as corrected — which writes the premium line — or acknowledge it. There is no configuration that changes this.',
      jsonb_build_object('exception_id', v_ae.id, 'exception_kind', v_ae.exception_kind,
                         'severity', v_ae.severity,
                         'allowedResolutions', to_jsonb(v_allowed),
                         'is_a_knob', false));
  end if;
  if not (p_resolution_state = any (v_allowed)) then
    return hr._time_refusal('hr_exception_resolution_unknown',
      format('%s is not a resolution this exception accepts.', p_resolution_state),
      jsonb_build_object('exception_id', v_ae.id, 'severity', v_ae.severity,
                         'allowedResolutions', to_jsonb(v_allowed)));
  end if;
  if p_resolution_state = 'excused' and coalesce(btrim(p_note), '') = '' then
    return hr._time_refusal('hr_exception_note_required',
      'Excusing an exception requires a written reason. Acknowledging one does not — that is the difference between the two.',
      jsonb_build_object('allowedResolutions', to_jsonb(v_allowed)));
  end if;

  v_lock := hr._punch_period_lock(v_ae.employment_id, v_ae.local_work_date);
  if coalesce((v_lock ->> 'locked')::boolean, false) then
    return hr._time_refusal('hr_period_locked',
      format('The pay period covering %s is %s. Nothing in it is editable in place, and that includes writing a premium line. File a correction instead — it rides the next export, tagged to this period.',
             v_ae.local_work_date, v_lock ->> 'state'),
      jsonb_build_object('pay_period_id', v_lock -> 'pay_period_id', 'state', v_lock -> 'state',
                         'door', 'hr_time_adjustment_create',
                         'allowedResolutions', to_jsonb(v_allowed)));
  end if;

  v_wants := v_ae.exception_kind in ('meal_not_provided','rest_not_provided')
             and p_resolution_state in ('acknowledged','corrected','closed');

  if v_wants then
    v_want := case v_ae.exception_kind when 'meal_not_provided' then 'MEAL_PREMIUM'
                                       else 'REST_PREMIUM' end;
    if p_premium_earning_code_id is not null then
      select * into v_code from hr.earning_code
       where id = p_premium_earning_code_id and deleted_at is null;
    else
      -- hr_l3_19: the org own code wins; otherwise the SYSTEM-org platform set, which is where
      -- the seeded MEAL_PREMIUM / REST_PREMIUM actually live. Same shared resolver as
      -- hr.recompute_apply, so the two premium writers cannot disagree about the code.
      select * into v_code from hr.earning_code
       where id = hr._earning_code_id(v_ae.organization_id, v_want);
    end if;

    if v_code.id is null then
      return hr._time_refusal('hr_premium_earning_code_missing',
        format('Neither this organization nor the platform earning-code set has a %s code, so the premium this violation owes cannot be written. The premium is still owed - this needs a platform administrator, not an organization setting.', v_want),
        jsonb_build_object('expected_code', v_want, 'organization_id', v_ae.organization_id,
                           'door', 'platform earning-code seed', 'premium_still_owed', true,
                           'allowedResolutions', to_jsonb(v_allowed)));
    end if;
    if v_code.code <> v_want or not v_code.is_statutory_premium or not v_code.is_active then
      return hr._time_refusal('hr_premium_earning_code_mismatch',
        format('A %s exception is paid on %s. The code supplied was %s (active=%s, statutory=%s).',
               v_ae.exception_kind, v_want, v_code.code, v_code.is_active, v_code.is_statutory_premium),
        jsonb_build_object('expected_code', v_want, 'supplied_code', v_code.code,
                           'allowedResolutions', to_jsonb(v_allowed)));
    end if;

    -- 🚨 THE DOUBLE-WRITE GUARD, READING BOTH WRITERS' LINK KEYS. hr.recompute_apply may already
    -- have written this premium; a superseded row never counts; the key stays per EARNING CODE so
    -- a meal premium and a rest premium on one day remain TWO lines.
    select wi.id,
           case when wi.earning_code_id = v_code.id then 'same_earning_code_same_day'
                when wi.calc ->> 'premium_for_exception_id' = v_ae.id::text
                     then 'already_written_by_the_recompute_lane_for_this_exception'
                else 'already_written_for_this_exception' end
      into v_existing, v_why
      from hr.work_interval wi
     where wi.employment_id = v_ae.employment_id
       and wi.is_current
       and wi.interval_kind = 'premium_only'
       and wi.local_work_date = v_ae.local_work_date
       and (wi.earning_code_id = v_code.id
            or wi.calc ->> 'premium_for_exception_id'  = v_ae.id::text
            or wi.calc ->> 'premium_from_exception_id' = v_ae.id::text
            or wi.id = v_ae.work_interval_id)
     order by case when wi.earning_code_id = v_code.id then 0 else 1 end
     limit 1;

    if v_existing is not null then
      v_capped := true;
    else
      select wi.workweek_id into v_ww
        from hr.work_interval wi
       where wi.employment_id = v_ae.employment_id
         and wi.local_work_date = v_ae.local_work_date and wi.is_current
       limit 1;
      if v_ww is null then
        select ww.id into v_ww from hr.workweek ww
         where ww.employment_id = v_ae.employment_id
           and v_ae.local_work_date between ww.week_start_local_date
                                        and (ww.week_start_local_date + 6)
         order by ww.week_start_local_date desc limit 1;
      end if;
      if v_ww is null then
        return hr._time_refusal('hr_no_workweek_for_premium',
          format('There is no computed workweek covering %s for this employment, so a premium line has nowhere to attach. The premium is still owed — run the recompute for this period first, then resolve this exception again.', v_ae.local_work_date),
          jsonb_build_object('employment_id', v_ae.employment_id,
                             'local_work_date', v_ae.local_work_date,
                             'door', 'E-11 POST /hr/time/recompute',
                             'premium_still_owed', true,
                             'allowedResolutions', to_jsonb(v_allowed)));
      end if;

      perform hr.arm_write();
      insert into hr.work_interval
        (organization_id, employment_id, workweek_id, pay_period_id,
         interval_kind, hours_category, earning_code_id,
         started_at, ended_at, hours, rate, amount, is_overtime,
         source_punch_ids, rounding_applied_minutes, is_current,
         work_location_id, jurisdiction_id, tz, local_work_date,
         rule_version_ids, engine_key, engine_version, calc)
      values (v_ae.organization_id, v_ae.employment_id, v_ww,
              nullif(v_lock ->> 'pay_period_id','')::uuid,
              'premium_only', 'premium', v_code.id,
              null, null, 1.0, null,
              null, false,
              case when v_ae.punch_id is not null then ARRAY[v_ae.punch_id] else '{}'::uuid[] end,
              0, true,
              v_ae.work_location_id, v_ae.jurisdiction_id, v_ae.tz, v_ae.local_work_date,
              v_ae.rule_version_ids, v_ae.engine_key, v_ae.engine_version,
              jsonb_build_object(
                'premium_from_exception_id', v_ae.id,
                'premium_for_exception_id', v_ae.id,
                'written_by', 'hr.attendance_exception_resolve',
                'exception_kind', v_ae.exception_kind,
                'severity', v_ae.severity,
                'hours', 1.0,
                'statutory_hours', 1.0,
                'rounding_not_applicable', true,
                'amount_absent', jsonb_build_object(
                  'absent', true, 'advisory', false, 'money_withheld', false,
                  'incomplete', to_jsonb(ARRAY['regular_rate_of_pay_for_the_workweek']),
                  'note', 'No amount is shown because one hour of statutory premium is one hour AT THE REGULAR RATE, and that rate is computed by the recompute engine. This is not zero, and the premium is owed.'),
                'rest_premium_daily_cap', v_ae.exception_kind = 'rest_not_provided',
                'never_merged_with', 'A meal premium and a rest premium on the same day are two separate lines.'))
      returning id into v_new;
      v_written := v_written || hr._time_interval_json(v_new);
      -- hr_l3_44 (S6, decision 8): this premium just changed the employment's current
      -- intervals, so the pay-period rollup is stale as of this statement. Same single
      -- writer as hr.recompute_apply, same transaction as the interval write.
      perform hr._ppe_rollup_refresh(
        coalesce(nullif(v_lock ->> 'pay_period_id','')::uuid,
                 hr._period_for_day(v_ae.employment_id, v_ae.local_work_date)),
        v_ae.employment_id,
        coalesce(v_ae.engine_key, 'hr.time_engine'),
        coalesce(v_ae.engine_version, 'unversioned'), null);
    end if;
  end if;

  v_note := nullif(btrim(coalesce(p_note, '')), '');
  perform hr.arm_write();
  update hr.attendance_exception
     set resolution_state = p_resolution_state,
         resolution_note = coalesce(v_note, resolution_note),
         resolved_at = case when p_resolution_state in ('open') then null else now() end,
         resolved_by_employment_id = case when p_resolution_state in ('open') then null else v_actor end,
         premium_earning_code_id = coalesce(v_code.id, premium_earning_code_id),
         work_interval_id = coalesce(v_new, v_existing, work_interval_id)
   where id = p_exception_id;

  perform hr._recompute_enqueue(v_ae.employment_id, v_ae.local_work_date, v_ae.organization_id, 'attendance_exception_resolve');
  return hr._time_ok(jsonb_build_object(
    'exception', hr._time_exception_json(p_exception_id),
    'intervalsWritten', v_written,
    'premiumAlreadyPresent', v_capped,
    'premiumAlreadyPresentReason', v_why,
    'existingPremiumIntervalId', v_existing,
    'notice', case
      when v_capped and v_why like 'already_written_by_the_recompute_lane%'
        then 'The recompute lane had already written this premium for this exception, so no second line was added. The premium is paid once.'
      when v_capped and v_ae.exception_kind = 'rest_not_provided'
        then 'A rest premium was already written for this day. The rest premium is capped at one per day, so no second line was added — the existing one stands.'
      when v_capped
        then 'A meal premium for this day already exists, so no duplicate was written.'
      when v_new is not null and v_ae.exception_kind = 'meal_not_provided'
        then 'A meal premium line was written for this day. If a rest premium is also owed today it is a SEPARATE line — the two are never merged.'
      when v_new is not null
        then 'A rest premium line was written for this day. It is capped at one per day, and it is never merged with a meal premium.'
      when p_resolution_state = 'escalated'
        then 'This exception is marked escalated and surfaces to HR. There is no workflow step behind an attendance exception today, so nothing was routed through the approval engine.'
      else null end,
    'allowedResolutions', to_jsonb(v_allowed)));
end $function$

;
CREATE OR REPLACE FUNCTION hr.kiosk_pairing_code_create(p_organization_id uuid, p_device_name text, p_location_id uuid, p_device_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'hr', 'public'
AS $function$
declare
  v_gate jsonb; v_code text; v_ttl int; v_id uuid; v_exp timestamptz; v_emp uuid;
begin
  v_gate := hr._kiosk_admin_gate(p_organization_id);
  if not coalesce((v_gate ->> 'ok')::boolean, false) then return v_gate; end if;

  if p_device_id is null and coalesce(btrim(p_device_name), '') = '' then
    return hr._punch_refusal('hr_kiosk_device_name_required',
      'Give the tablet a name an administrator will recognise on a list - "Break room tablet", not a serial number.');
  end if;
  if p_device_id is null and p_location_id is null then
    return hr._punch_refusal('hr_kiosk_location_required',
      'A kiosk belongs to a work location: that is what its punches are checked against and what '
      || 'cross-location flagging compares to.');
  end if;

  v_ttl  := (hr._punch_knob('pairing_code_ttl_minutes', '15'::jsonb, p_organization_id) #>> '{}')::integer;
  v_exp  := now() + make_interval(mins => v_ttl);
  -- unambiguous alphabet: no O/0, no I/1
  v_code := 'PAIR-' || upper(substr(translate(encode(extensions.gen_random_bytes(8), 'base64'),
                                              '+/=OI01lo', 'ABCDEFGHJ'), 1, 6));
  select em.id into v_emp from hr.employment em
    join hr.employee e on e.id = em.employee_id
   where e.login_user_id = auth.uid() and em.organization_id = p_organization_id limit 1;

  perform hr.arm_write();
  if p_device_id is not null then
    -- decision 2: regenerating replaces the old code; it stops working immediately
    update hr.kiosk_device
       set pairing_code_hash = extensions.crypt(v_code, extensions.gen_salt('bf')),
           pairing_code_expires_at = v_exp,
           pairing_claimed_at = null
     where id = p_device_id and organization_id = p_organization_id and deleted_at is null
    returning id into v_id;
    if v_id is null then
      return hr._punch_refusal('hr_kiosk_device_not_found',
        'That device does not exist in this organization.',
        jsonb_build_object('device_id', p_device_id));
    end if;
  else
    insert into hr.kiosk_device (organization_id, location_id, device_name, device_secret_hash,
      pairing_code_hash, pairing_code_expires_at, trust_state, registered_by_employment_id)
    values (p_organization_id, p_location_id, btrim(p_device_name),
            '!unpaired',   -- replaced by hr_kiosk_claim_pairing; NOT NULL, never a usable secret
            extensions.crypt(v_code, extensions.gen_salt('bf')), v_exp, 'pending', v_emp)
    returning id into v_id;
  end if;

  -- decision 2: the code is returned ONCE. Only its hash is stored.
  return jsonb_build_object('ok', true, 'device_id', v_id, 'code', v_code, 'expires_at', v_exp,
    'code_is_shown_once', true,
    'device', hr._kiosk_device_row(v_id));
end
$function$

;
CREATE OR REPLACE FUNCTION hr.leave_enroll(p_leave_policy_id uuid, p_employment_ids uuid[], p_effective_from date DEFAULT NULL::date, p_override_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'hr', 'public'
AS $function$
declare
  pol hr.leave_policy%rowtype; v_rung text; v_from date; v_added integer := 0;
  v_skipped jsonb := '[]'::jsonb; v_emp uuid; v_chk jsonb; v_override text;
  v_overridden integer := 0;
begin
  pol := hr._leave_policy_at(p_leave_policy_id);
  if pol.id is null then return jsonb_build_object('granted', false, 'reason','not_found'); end if;
  v_rung := hr._leave_admin_rung(pol.organization_id);
  if v_rung not in ('hr_admin','hr_owner') then
    return jsonb_build_object('granted', false, 'reason','not_an_hr_admin');
  end if;
  v_from := coalesce(p_effective_from, current_date);
  v_override := nullif(btrim(coalesce(p_override_reason, '')), '');

  -- §2.8: an override is a DECISION, so it must carry enough of one to be worth recording.
  if v_override is not null and length(v_override) < 20 then
    return jsonb_build_object('granted', false, 'reason','override_reason_too_short',
      'detail','Enrolling somebody outside a policy''s worker class is a deliberate exception. '
            || 'Say why in at least 20 characters — it is recorded against every row it creates.');
  end if;

  foreach v_emp in array coalesce(p_employment_ids, '{}'::uuid[]) loop
    -- ONE predicate (hr_l5_25/26), the same one the table's gate and the request submit use.
    v_chk := hr._leave_worker_class_ok(v_emp, p_leave_policy_id, v_from);

    if not coalesce((v_chk ->> 'ok')::boolean, true) then
      if v_override is null then
        -- D8 and §2.8: never AUTO-enrolled. Named and skipped, never silently dropped, because a
        -- bulk apply reports per-row outcomes — 47 enrolled and 3 named is the correct result.
        v_skipped := v_skipped || jsonb_build_array(jsonb_build_object(
          'employment_id', v_emp,
          'reason', case when (v_chk ->> 'worker_class') = 'contractor'
                         then 'contractor_not_auto_enrolled'
                         else 'outside_worker_class_scope' end,
          'worker_class', v_chk -> 'worker_class',
          'policy_scope', v_chk -> 'scope',
          'detail','Enrol this person deliberately by giving a reason — it is recorded against the row.'));
        continue;
      end if;
      v_overridden := v_overridden + 1;
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
      (employment_id, leave_policy_id, effective_from, policy_year_start_on, organization_id,
       metadata)
    values
      (v_emp, p_leave_policy_id, v_from,
       -- §2.8: stamped at enrollment and NEVER moved — moving it would re-cut a carryover
       -- boundary retroactively.
       date_trunc('year', v_from)::date, pol.organization_id,
       case when v_override is not null and not coalesce((v_chk ->> 'ok')::boolean, true)
            then jsonb_build_object('worker_class_override_reason', v_override)
            else '{}'::jsonb end);
    v_added := v_added + 1;
  end loop;

  return jsonb_build_object('granted', true, 'enrolled', v_added, 'skipped', v_skipped,
                            'enrolled_by_override', v_overridden,
                            'override_reason', v_override);
end
$function$

;
CREATE OR REPLACE FUNCTION provider.attach_credential(p_account_id uuid, p_credential_item_id uuid, p_credential_role text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'provider'
AS $function$
DECLARE v_org uuid; v_id uuid;
BEGIN
  SELECT organization_id INTO v_org FROM provider.account WHERE id = p_account_id AND deleted_at IS NULL;
  IF v_org IS NULL THEN RAISE EXCEPTION 'provider account not found' USING ERRCODE = 'P0002'; END IF;
  PERFORM provider._assert_org_admin(v_org);
  INSERT INTO provider.account_credential (organization_id, account_id, credential_item_id, credential_role)
  VALUES (v_org, p_account_id, p_credential_item_id, p_credential_role) RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$

;
CREATE OR REPLACE FUNCTION provider.set_account_status(p_account_id uuid, p_status text, p_external_account_id text DEFAULT NULL::text, p_last_verified_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_duplicate_of_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'provider'
AS $function$
DECLARE v_org uuid;
BEGIN
  SELECT organization_id INTO v_org FROM provider.account WHERE id = p_account_id AND deleted_at IS NULL;
  IF v_org IS NULL THEN RAISE EXCEPTION 'provider account not found' USING ERRCODE = 'P0002'; END IF;
  PERFORM provider._assert_org_admin(v_org);
  UPDATE provider.account SET status = p_status, external_account_id = coalesce(p_external_account_id, external_account_id),
    last_verified_at = coalesce(p_last_verified_at, last_verified_at), last_verified_by = auth.uid(),
    duplicate_of_id = p_duplicate_of_id WHERE id = p_account_id;
END;
$function$

;
CREATE OR REPLACE FUNCTION public.hr_authority_delegation_request(p_authority_id uuid, p_delegate_employment_id uuid, p_effective_from date, p_effective_to date, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'hr', 'public'
AS $function$
declare
  v_uid uuid := auth.uid(); v_org uuid; v_kind text; v_hid text; v_holder_emp uuid;
  v_id uuid; v_audit uuid; v_horizon integer; v_depth integer; v_source text;
begin
  if v_uid is null then
    raise exception 'hr_authority_delegation_request: no authenticated caller' using errcode = '42501';
  end if;
  select aa.organization_id, aa.holder_kind, aa.holder_id, aa.source
    into v_org, v_kind, v_hid, v_source
    from hr.approval_authority aa where aa.id = p_authority_id and aa.is_active;
  if v_org is null then
    raise exception 'hr_authority_delegation_request: no active hr.approval_authority with id %', p_authority_id
      using errcode = 'P0002';
  end if;
  if v_kind = 'employment' then v_holder_emp := v_hid::uuid; end if;

  -- only the HOLDER hands their own authority on
  if v_holder_emp is null or not (v_holder_emp = any(hr.employments_of(v_uid))) then
    return hr._governance_refusal(v_org, 'hr_approval_delegation', 'not_the_holder',
      'only the holder of an authority may delegate it', v_holder_emp, ARRAY[p_authority_id]);
  end if;

  -- §1.3b: depth ≤ hr.approvals.delegation_max_depth, so materialising from an already-delegated
  -- row is refused (default depth 1)
  v_depth := (hr._hr_knob('hr.approvals','delegation_max_depth', v_org, null) #>> '{}')::integer;
  if v_source = 'delegated' and v_depth < 2 then
    return hr._governance_refusal(v_org, 'hr_approval_delegation', 'redelegation_too_deep',
      format('re-delegation depth exceeds hr.approvals.delegation_max_depth (%s)', v_depth),
      v_holder_emp, ARRAY[p_authority_id]);
  end if;

  -- expiry is mandatory and bounded
  v_horizon := (hr._hr_knob('hr.approvals','delegation_max_horizon_days', v_org, null) #>> '{}')::integer;
  if p_effective_to is null or p_effective_to > p_effective_from + v_horizon then
    return hr._governance_refusal(v_org, 'hr_approval_delegation', 'horizon_exceeded',
      format('a delegation must end, and no later than %s days after it starts', v_horizon),
      v_holder_emp, ARRAY[p_authority_id]);
  end if;

  perform hr.arm_write();
  insert into hr.approval_delegation
    (organization_id, authority_id, delegator_employment_id, delegate_employment_id,
     effective_from, effective_to, reason)
  values (v_org, p_authority_id, v_holder_emp, p_delegate_employment_id,
          p_effective_from, p_effective_to, p_reason)
  returning id into v_id;

  v_audit := hr._record_access_audit(
    p_organization_id => v_org, p_action => 'write', p_target_token => 'hr_approval_delegation',
    p_purpose => 'governance', p_basis => 'authority', p_granted => true,
    p_target_ids => ARRAY[v_id], p_sensitivity_tier => 'directory',
    p_subject_employment_id => p_delegate_employment_id, p_justification => p_reason);

  return jsonb_build_object('granted', true, 'delegation_id', v_id, 'state', 'pending',
                            'audit_id', v_audit);
end
$function$

;
CREATE OR REPLACE FUNCTION public.hr_incident_assign(p_incident_id uuid, p_employment_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'hr'
AS $function$
declare v_uid uuid := auth.uid(); v_org uuid; v_gate jsonb; v_excluded boolean; v_login uuid;
        v_subject uuid;
begin
  select i.organization_id, i.subject_employment_id into v_org, v_subject from hr.incident i
   where i.id = p_incident_id and i.deleted_at is null;
  if v_org is null then return jsonb_build_object('ok', false, 'reason', 'not_reachable'); end if;
  if hr.incident_excluded(v_uid, p_incident_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_reachable');
  end if;
  -- 🚨 THE CASE IS ABOUT SOMEBODY, AND THE GATE MUST ASK ABOUT THEM (hr_l1_64). The population
  -- question is about the SUBJECT of the case, never about the assignee being routed to it.
  v_gate := hr._l1_write_gate(v_org, 'incident.investigate', v_subject, 'hr_incident', 'update',
                              'investigation');
  if v_gate is not null then return v_gate; end if;

  -- §4.9b F: assigning an EXCLUDED person is refused and the escalation target is named, so the
  -- report is never left unroutable. The accused-hr_owner case is not hypothetical.
  select e.login_user_id into v_login from hr.employment em
    join hr.employee e on e.id = em.employee_id where em.id = p_employment_id;
  v_excluded := v_login is not null and hr.incident_excluded(v_login, p_incident_id);
  if v_excluded then
    return jsonb_build_object('ok', false, 'reason', 'assignee_excluded',
      'detail', 'That person is a party to this case and cannot investigate it.',
      'escalation_target', hr._hr_knob('hr.relations','incident_escalation_target', v_org, null) #>> '{}',
      'external_investigator_rpc', 'hr_mint_investigation_token');
  end if;

  perform hr.arm_write();
  update hr.incident set assigned_to_employment_id = p_employment_id,
         state = case when state = 'intake' then 'investigating' else state end
   where id = p_incident_id;

  return jsonb_build_object('ok', true, 'incident_id', p_incident_id,
    'assigned_to_employment_id', p_employment_id,
    'audit_id', hr._l1_write_audit(v_org, 'hr_incident', 'update', ARRAY[p_incident_id],
                                   p_employment_id, 'investigation', 'restricted'));
end
$function$

;
CREATE OR REPLACE FUNCTION public.hr_role_assign(p_employment_id uuid, p_role_key text, p_scope_kind text DEFAULT 'org'::text, p_scope_id uuid DEFAULT NULL::uuid, p_scope_employment_ids uuid[] DEFAULT '{}'::uuid[], p_effective_from date DEFAULT CURRENT_DATE, p_effective_to date DEFAULT NULL::date, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'hr', 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
  v_id  uuid;
  v_audit uuid;
  v_assignable boolean;
  v_actor_emp uuid;
begin
  if v_uid is null then
    raise exception 'hr_role_assign: no authenticated caller' using errcode = '42501';
  end if;

  select em.organization_id into v_org from hr.employment em
   where em.id = p_employment_id and em.deleted_at is null;
  if v_org is null then
    raise exception 'hr_role_assign: no hr.employment with id %', p_employment_id using errcode = 'P0002';
  end if;

  select ar.is_assignable into v_assignable from hr.access_role ar
   where ar.role_key = p_role_key and ar.deleted_at is null and ar.is_active
     and ar.organization_id in (v_org, '39c38960-d30c-4840-b0c1-c9960de95582'::uuid)
   order by (ar.organization_id = v_org) desc limit 1;
  if v_assignable is null then
    raise exception 'hr_role_assign: % is not a registered hr.access_role', p_role_key using errcode = '22023';
  end if;
  if not v_assignable then
    -- `manager` and `employee` are DERIVED, never assigned (§1.4). Refusing by name is what stops
    -- someone "granting" a lane that is computed.
    return hr._governance_refusal(v_org, 'hr_role_assignment', 'role_not_assignable',
      format('%s is a derived role and is never assigned; it is resolved from the reporting line or the login on the person row (SPEC-ACCESS §1.4)', p_role_key),
      p_employment_id);
  end if;

  -- §1.2's gate: the role.assign capability, or org owner
  if not (hr.capability(v_uid, 'role.assign', p_employment_id)
          or exists (select 1 from iam.organization_member om
                      where om.organization_id = v_org and om.user_id = v_uid and om.role = 'owner')) then
    return hr._governance_refusal(v_org, 'hr_role_assignment', 'no_capability',
      'the caller holds neither the role.assign capability over this population nor org ownership',
      p_employment_id);
  end if;

  select em.id into v_actor_emp from hr.employment em
    join hr.employee e on e.id = em.employee_id
   where e.login_user_id = v_uid and em.organization_id = v_org and em.deleted_at is null limit 1;

  perform hr.arm_write();
  insert into hr.role_assignment
    (organization_id, employment_id, role_key, scope_kind, scope_id, scope_employment_ids,
     effective_from, effective_to, granted_by_employment_id, granted_by_user_id, reason)
  values (v_org, p_employment_id, p_role_key, p_scope_kind, p_scope_id, coalesce(p_scope_employment_ids,'{}'),
          p_effective_from, p_effective_to, v_actor_emp, v_uid, p_reason)
  returning id into v_id;

  v_audit := hr._record_access_audit(
    p_organization_id => v_org, p_action => 'write', p_target_token => 'hr_role_assignment',
    p_purpose => 'governance', p_basis => 'role', p_granted => true,
    p_target_ids => ARRAY[v_id], p_sensitivity_tier => 'directory',
    p_subject_employment_id => p_employment_id, p_access_role_key => p_role_key,
    p_justification => p_reason, p_actor_employment_id => v_actor_emp,
    p_request_context => jsonb_build_object('scope_kind', p_scope_kind, 'scope_id', p_scope_id));

  -- the derivation trigger on hr.role_assignment does the grant work synchronously (§2.4)
  return jsonb_build_object('granted', true, 'assignment_id', v_id, 'audit_id', v_audit);
end
$function$

;
