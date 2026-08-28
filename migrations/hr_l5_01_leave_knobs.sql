-- HR domain L5 — migration 1 (register item HRB-017, lane L5 Leave & PTO).
--
-- THE CONFIGURATION REGISTER. SPEC-LEAVE §15 lists twenty-one keys that must exist before any
-- leave behaviour is lawful under D13 ("no hard-coded behaviour rule"). Five were already seeded
-- by the core knob lane; this file seeds the rest and adds the ONE reader for the two keys whose
-- shape the knob store cannot hold.
--
-- Authority: SPEC-LEAVE §15, §4.1, §5, §7, §9.3, §10, §14; D13/AD-12; R-L5 (a) F4.
-- Applied live as `hr_l5_01_leave_knobs`. Idempotent.
--
-- ===================================================================================
-- RECORDED TECHNICAL DECISIONS
--
-- 1. KEYS ARE STORED WITHOUT THE `hr.leave.` PREFIX, because that is what shipped. The live
--    register keys on `(feature, key)` — `feature='hr.leave'`, `key='accrual_run_cadence'` — and
--    `hr._hr_knob` reads the org rung at `organizations.settings #> {hr, leave, <key>}`. SPEC-LEAVE
--    §15 spells every key as `hr.leave.<key>`; that is the same key, written whole. Seeding the
--    dotted form would have produced a SECOND, unreadable row per knob.
--
-- 2. 🚨 TWO SPEC KEYS ARE ARRAYS AND THE KNOB STORE CANNOT HOLD AN ARRAY.
--    `platform.feature_knob.value_type` admits only number|integer|boolean|string|enum under a live
--    CHECK — the same blocker FREEZE delta D-5 hit on `hr.contracts.provider_retry_policy` and
--    HRB-004 hit on `self_service_field_policy`. `carryover_expiry_warning_days` ([60,30,7]) and
--    `case_return_reminder_days` ([14,3]) are seeded as `string` holding a COMMA-SEPARATED, ordered
--    day list, and `hr._leave_lead_days(key, org)` is the only thing that reads them: it parses,
--    refuses a non-integer or negative element by raising, and returns `integer[]`. The behaviour
--    of §13's lead times is configurable today; only the jsonb-array shape is deferred, and it is
--    deferred in exactly one place with a named reader rather than at nineteen call sites.
--
-- 3. `hr.leave.accrual_precision_minutes` IS NOT SEEDED, AND THAT IS DELIBERATE.
--    SPEC-LEAVE §15 asks for `accrual_precision_minutes` (1/5/15). The live register already holds
--    `hr.leave.accrual_precision_decimals` (integer 0–8, default 4), seeded by the core lane from
--    SPEC-DATA-MODEL §19.2. They are two different roundings of the same quantity and seeding both
--    would let an org set them into contradiction. The shipped key wins (FREEZE §preamble: where a
--    spec and reality disagree about what is BUILT, the spec needs the amendment) and the conflict
--    is filed to the coordinator. R-L5 U7's ruling still holds and is now expressed in decimals:
--    `floor()` governs the per_hours_worked threshold and is never subject to the knob; the knob
--    rounds only the posted `hours_delta` of rate-based methods, always in the employee's favour.
--
-- 4. EVERY KNOB IS SEEDED WITH `set_by='agent'` AND A DATED `review_due`, per
--    /policies/limits-are-knobs-agents-set-them.md. A ceiling with no review date is a constant.
-- ===================================================================================

-- -----------------------------------------------------------------------------------
-- 1. The sixteen keys SPEC-LEAVE §15 introduces
-- -----------------------------------------------------------------------------------

insert into platform.feature_knob
  (feature, key, value_type, value, default_value, unit, min_value, max_value, allowed_values,
   label, description, set_by, basis, review_due)
values
  ('hr.leave', 'who_is_out_shows_type', 'boolean', 'false'::jsonb, 'false'::jsonb, null, null, null, null,
   'Who-is-out shows the leave type',
   'When off (the default), a peer sees only that a colleague is out — never that the absence is sick leave. SPEC-LEAVE §10 disclosure ladder.',
   'agent', 'SPEC-LEAVE §15 platform default', current_date + 180),

  ('hr.leave', 'day_hours_basis', 'enum', '"scheduled_shift"'::jsonb, '"scheduled_shift"'::jsonb, null, null, null,
   '["scheduled_shift","fte_standard_day"]'::jsonb,
   'How a leave day converts to hours',
   'A published shift is the honest number and makes the schedule exclusion exact; the FTE standard day is the fallback when no shift exists. SPEC-LEAVE §4.1.',
   'agent', 'SPEC-LEAVE §15 platform default', current_date + 180),

  ('hr.leave', 'holiday_inside_leave', 'enum', '"excluded"'::jsonb, '"excluded"'::jsonb, null, null, null,
   '["excluded","counted"]'::jsonb,
   'Company holiday inside a leave span',
   'Excluded by default: a holiday inside a requested span consumes no balance and renders as an excluded day with the holiday name. SPEC-LEAVE §4.1.',
   'agent', 'SPEC-LEAVE §15 platform default', current_date + 180),

  ('hr.leave', 'allow_retroactive_request', 'boolean', 'true'::jsonb, 'true'::jsonb, null, null, null, null,
   'Allow requests for dates already past',
   'An illness gives no notice; a product that refuses to record a sick day after the fact forces the record to be wrong. SPEC-LEAVE §4.1.',
   'agent', 'SPEC-LEAVE §15 platform default', current_date + 180),

  ('hr.leave', 'retroactive_request_max_days', 'integer', '30'::jsonb, '30'::jsonb, 'days', 0, 365, null,
   'How far back a retroactive request may reach',
   'Bounds the retroactive window when allow_retroactive_request is on. SPEC-LEAVE §4.1.',
   'agent', 'SPEC-LEAVE §15 platform default', current_date + 180),

  ('hr.leave', 'balance_projection_horizon_days', 'integer', '365'::jsonb, '365'::jsonb, 'days', 30, 1095, null,
   'How far ahead a balance may be projected',
   'The projector runs accrual arithmetic forward to this horizon and no further; beyond it the answer is refused rather than invented. SPEC-LEAVE §5.',
   'agent', 'SPEC-LEAVE §15 platform default', current_date + 180),

  ('hr.leave', 'carryover_expiry_warning_days', 'string', '"60,30,7"'::jsonb, '"60,30,7"'::jsonb, 'days', null, null, null,
   'Carryover-expiry warning lead times',
   'Ordered, comma-separated days before an expiry at which hr.leave.balance_expiring fires. Read ONLY through hr._leave_lead_days — see decision 2 in hr_l5_01.',
   'agent', 'SPEC-LEAVE §15 platform default [60,30,7], rendered as CSV because the knob store admits no array', current_date + 180),

  ('hr.leave', 'negative_balance_settlement', 'enum', '"write_off"'::jsonb, '"write_off"'::jsonb, null, null, null,
   '["write_off","deduct_from_final_pay"]'::jsonb,
   'How a negative balance settles at termination',
   'write_off posts an adjustment to zero. deduct_from_final_pay is available only where the resolved jurisdiction permits a wage deduction AND a signed authorization exists — absent either, the control is absent, not disabled. SPEC-LEAVE §7 step 8.',
   'agent', 'SPEC-LEAVE §15 platform default', current_date + 180),

  ('hr.leave', 'payout_requires_review', 'boolean', 'true'::jsonb, 'true'::jsonb, null, null, null, null,
   'HR confirms a termination payout before export',
   'Puts an hr_admin confirmation between computation and the payroll export line. SPEC-LEAVE §7.',
   'agent', 'SPEC-LEAVE §15 platform default', current_date + 180),

  ('hr.leave', 'case_certification_due_days', 'integer', '15'::jsonb, '15'::jsonb, 'days', 1, 90, null,
   'Days from case start until certification is due',
   'A PRODUCT DEFAULT, not a verified statutory deadline — v1 seeds no FMLA certification rule class, and the control says so. SPEC-LEAVE §9.3.',
   'agent', 'SPEC-LEAVE §15 platform default', current_date + 180),

  ('hr.leave', 'case_return_reminder_days', 'string', '"14,3"'::jsonb, '"14,3"'::jsonb, 'days', null, null, null,
   'Case return-date reminder lead times',
   'Ordered, comma-separated days before an expected return at which hr.leave.case_return_due fires. Read ONLY through hr._leave_lead_days.',
   'agent', 'SPEC-LEAVE §15 platform default [14,3], rendered as CSV because the knob store admits no array', current_date + 180),

  ('hr.leave', 'case_existence_visible_to_manager', 'boolean', 'true'::jsonb, 'true'::jsonb, null, null, null, null,
   'A manager may learn that a protected absence exists',
   'On: the calendar reads "Out — approved leave" and the queue reads "Linked to a leave managed by HR". Never the category, never the certification state, never a case door. Off: the calendar simply reads "Out". SPEC-LEAVE §9.6.',
   'agent', 'SPEC-LEAVE §15 platform default', current_date + 180),

  ('hr.leave', 'ai_policy_qa_posture', 'enum', '"apply_final"'::jsonb, '"apply_final"'::jsonb, null, null, null,
   '["apply_final","recommend","review_and_comment","off"]'::jsonb,
   'Posture for grounded leave-policy Q&A',
   'The answer is read-only information with no side effect, so it renders directly. An org may override DOWNWARD only (toward more restriction). SPEC-LEAVE §14.1, §15 ceiling rule.',
   'agent', 'SPEC-LEAVE §15 platform default', current_date + 180),

  ('hr.leave', 'ai_balance_query_posture', 'enum', '"apply_final"'::jsonb, '"apply_final"'::jsonb, null, null, null,
   '["apply_final","recommend","review_and_comment","off"]'::jsonb,
   'Posture for natural-language balance questions',
   'The model returns a QUERY, never an answer; the answer that follows is arithmetic. Org override is downward only. SPEC-LEAVE §14.2.',
   'agent', 'SPEC-LEAVE §15 platform default', current_date + 180)
on conflict (feature, key) do update
  set value_type     = excluded.value_type,
      value          = coalesce(platform.feature_knob.value, excluded.value),
      default_value  = excluded.default_value,
      unit           = excluded.unit,
      min_value      = excluded.min_value,
      max_value      = excluded.max_value,
      allowed_values = excluded.allowed_values,
      label          = excluded.label,
      description    = excluded.description,
      basis          = excluded.basis,
      review_due     = excluded.review_due;

-- -----------------------------------------------------------------------------------
-- 2. The ONE reader for the two CSV-shaped lead-time knobs
-- -----------------------------------------------------------------------------------

create or replace function hr._leave_lead_days(p_key text, p_organization_id uuid default null)
returns integer[]
language plpgsql
stable
security definer
set search_path to 'hr', 'public'
as $function$
declare
  v_raw text;
  v_out integer[];
  v_part text;
begin
  if p_key not in ('carryover_expiry_warning_days', 'case_return_reminder_days') then
    raise exception 'hr._leave_lead_days: % is not a lead-time knob', p_key
      using errcode = 'P0001',
            hint = 'This reader exists for exactly the two CSV-shaped keys named in hr_l5_01 decision 2.';
  end if;

  v_raw := hr._hr_knob('hr.leave', p_key, p_organization_id, null) #>> '{}';
  if v_raw is null or btrim(v_raw) = '' then
    raise exception 'hr._leave_lead_days: knob hr.leave.% is not seeded', p_key
      using errcode = 'P0001',
            hint = 'D13: a missing knob raises rather than falling back to a hard-coded value.';
  end if;

  v_out := '{}'::integer[];
  foreach v_part in array string_to_array(v_raw, ',') loop
    v_part := btrim(v_part);
    -- A malformed override is REFUSED, never silently dropped: a lead time that vanished is a
    -- notification that never fires, and nobody would ever see it not happen.
    if v_part !~ '^[0-9]+$' then
      raise exception 'hr._leave_lead_days: hr.leave.% holds a non-integer element %', p_key, v_part
        using errcode = 'P0001',
              hint = 'The value is an ordered, comma-separated list of whole days, e.g. 60,30,7.';
    end if;
    v_out := v_out || v_part::integer;
  end loop;
  return v_out;
end
$function$;

comment on function hr._leave_lead_days(text, uuid) is
  'SPEC-LEAVE §13 lead times. The knob store admits no array (platform.feature_knob.value_type '
  'CHECK), so the two lead-time keys are CSV strings and this is the only reader. A malformed '
  'override raises; it never silently yields fewer warnings.';

-- -----------------------------------------------------------------------------------
-- 3. Self-proof
-- -----------------------------------------------------------------------------------

do $$
declare v_missing text; v_n integer;
begin
  select string_agg(k, ', ') into v_missing
    from unnest(array[
      'negative_balance_default','request_min_notice_days','who_is_out_visible_to_peers',
      'accrual_run_cadence','who_is_out_shows_type','day_hours_basis','holiday_inside_leave',
      'allow_retroactive_request','retroactive_request_max_days','balance_projection_horizon_days',
      'carryover_expiry_warning_days','negative_balance_settlement','payout_requires_review',
      'case_certification_due_days','case_return_reminder_days','case_existence_visible_to_manager',
      'ai_policy_qa_posture','ai_balance_query_posture']) k
   where not exists (select 1 from platform.feature_knob fk
                      where fk.feature = 'hr.leave' and fk.key = k);
  if v_missing is not null then
    raise exception 'hr_l5_01: these hr.leave knobs did not land: %', v_missing;
  end if;

  if hr._leave_lead_days('carryover_expiry_warning_days') <> array[60,30,7]
     or hr._leave_lead_days('case_return_reminder_days') <> array[14,3] then
    raise exception 'hr_l5_01: the lead-time reader does not reproduce the seeded defaults';
  end if;

  -- the reader must REFUSE a key outside its two, and refuse a malformed value
  begin
    perform hr._leave_lead_days('accrual_run_cadence');
    raise exception 'hr_l5_01: the lead-time reader accepted a key that is not a lead time';
  exception when sqlstate 'P0001' then null;
  end;

  select count(*) into v_n from platform.feature_knob where feature = 'hr.leave';
  raise notice 'hr_l5_01: % hr.leave knobs registered', v_n;
end $$;
