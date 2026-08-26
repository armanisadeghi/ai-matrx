-- HR domain, C5 / register item HRB-009, file 00 of 05.
--
-- Authority: /projects/hr-domain/specs/SPEC-JURISDICTION.md sections 1.2 (the class definition
-- table), 1.4 (the applicability-fact registry and the _unverified mechanism), 1.5 (THE 16 V1
-- RULE CLASSES), 2.7 (absence semantics, which live ON the class), 5.9 (the overdue view) and
-- 8 (the configuration register). Knob grammar per R-CORE-READINESS B1: feature = 'hr.<slug>'
-- with slug in snake_case from the published list, so 'hr.jurisdiction_rules' -- NOT section 8's
-- hyphenated 'hr.jurisdiction-rules', which B1 already ruled needs a one-line correction.
--
-- This file seeds NO legal values. It seeds the machinery the legal values are checked against.
--
-- Idempotent. Applied live as migration `hr_c5_00_rule_classes_and_registry`.

set local lock_timeout = '20s';

select set_config('hr.privileged_write', 'on', false);

-- ============================================================================
-- 1. hr.jurisdiction_rule's one-row-per-window exclusion constraint gains the
--    record-class discriminator that section 5.1's OWN SEED DATA requires.
-- ============================================================================
-- Section 5.1 seeds SIX federal `retention-period` rows (time_records, payroll_computation, i9,
-- personnel_hiring, candidate, eeo_self_id) at jurisdiction US over the same effective range.
-- The constraint file 01 built -- EXCLUDE (organization_id, rule_class_id, jurisdiction_key,
-- daterange) -- refuses the second of them. The constraint is right in spirit (section 2.5 needs
-- ties to be impossible) and one dimension short: for `retention-period` the unit of law is the
-- RECORD CLASS, which section 5.1 itself carries in parameters->>'record_class'. Adding that key
-- as an equality dimension keeps ties impossible for every other class (where the key is absent
-- and collapses to '') and lets the spec's own seed set land unchanged.
do $$ begin
  if exists (select 1 from pg_constraint where conname = 'jurisdiction_rule_one_per_window') then
    alter table hr.jurisdiction_rule drop constraint jurisdiction_rule_one_per_window;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'jurisdiction_rule_one_per_window_per_record_class') then
    alter table hr.jurisdiction_rule add constraint jurisdiction_rule_one_per_window_per_record_class
      exclude using gist (
        organization_id with =,
        rule_class_id with =,
        jurisdiction_key with =,
        (coalesce(parameters->>'record_class', '')) with =,
        daterange(effective_from, effective_to, '[)') with &&
      ) where (status <> 'superseded' and deleted_at is null);
  end if;
end $$;

comment on constraint jurisdiction_rule_one_per_window_per_record_class on hr.jurisdiction_rule is
  'SPEC-JURISDICTION 2.5: ties at one level are impossible. The record_class dimension exists '
  'because section 5.1 seeds six federal retention-period rows over one effective range -- for '
  'that class the unit of law is the record class, carried in parameters.record_class.';

-- ============================================================================
-- 2. The applicability-fact registry (section 1.4) -- platform.categories dimension
--    `hr_applicability_fact`, each row's metadata carrying the MEASURE DEFINITION.
-- ============================================================================
insert into platform.categories (organization_id, dimension, slug, name, is_system, visibility, metadata)
select '39c38960-d30c-4840-b0c1-c9960de95582'::uuid, 'hr_applicability_fact', v.slug, v.name, true,
       'public'::platform.visibility, v.meta::jsonb
from (values
  ('worker_class','Worker class',
   $j${"type":"enum","values":["employee","contractor","intern","seasonal","volunteer"],"measure":"AR 1.3 axis 1. The worker class on the effective-dated position assignment as of the date.","producer":"hr.position_assignment"}$j$),
  ('flsa_status','FLSA status',
   $j${"type":"enum","values":["exempt","non_exempt"],"measure":"AR 1.3 axis 2. exemption_basis is carried separately and is not this fact.","producer":"hr.position_assignment"}$j$),
  ('pay_basis','Pay basis',
   $j${"type":"enum","values":["hourly","salary","piece","other"],"measure":"The pay basis on the effective-dated position assignment.","producer":"hr.position_assignment"}$j$),
  ('schedule_class','Schedule class',
   $j${"type":"enum","values":["full_time","part_time","variable_hour","seasonal"],"measure":"The schedule class on the effective-dated position assignment.","producer":"hr.position_assignment"}$j$),
  ('is_supervisor','Is supervisor',
   $j${"type":"boolean","measure":"AR 1.19: holds one or more direct reports on the ORG-CHART relationship as of the date. The chart line, never approval authority.","producer":"reporting line, as-of-date"}$j$),
  ('worker_age_years','Worker age in years',
   $j${"type":"integer","measure":"Whole years from hr.employee.date_of_birth as of the WORK date, not as of today.","producer":"hr.employee"}$j$),
  ('industry_naics','Industry NAICS code',
   $j${"type":"string","measure":"The establishment NAICS code. Predicates use prefix match via op naics_prefix.","producer":"hr.employer_profile establishment"}$j$),
  ('employer_headcount_current','Employer headcount (current)',
   $j${"type":"integer","measure":"Count of active employments in the organization on the date.","producer":"derived, cached"}$j$),
  ('employer_headcount_current_or_prior_year_20plus_workweeks','Employer headcount (FMLA-50 measure)',
   $j${"type":"integer","measure":"THE FMLA-50 MEASURE: employees on payroll for 20 or more workweeks in the current or preceding calendar year. Not a headcount on a date.","producer":"derived, annual"}$j$),
  ('employer_fte_avg_prior_year','Employer average FTE (ACA-ALE measure)',
   $j${"type":"number","measure":"THE ACA-ALE MEASURE: average of full-time plus full-time-equivalent employees over the PRIOR calendar year.","producer":"derived, annual"}$j$),
  ('employer_headcount_at_establishment','Headcount at establishment',
   $j${"type":"integer","measure":"Headcount at the specific establishment. Fair Workweek ordinances are frequently establishment- or chain-scoped.","producer":"derived"}$j$),
  ('employer_locations_global','Employer locations (global)',
   $j${"type":"integer","measure":"Total locations of the chain INCLUDING franchisor-affiliated locations. The Fair Workweek chain test.","producer":"hr.employer_profile, declared"}$j$),
  ('union_covered','Union covered',
   $j${"type":"boolean","measure":"Position covered by a CBA. AR2: hooks only in v1, no union module.","producer":"hr.position_assignment hook"}$j$),
  ('is_new_hire','Is new hire',
   $j${"type":"boolean","measure":"Derived from the EMPLOYMENT SPELL, never the person (AR 1.1).","producer":"hr.employment"}$j$),
  ('days_since_hire','Days since hire',
   $j${"type":"integer","measure":"Days from the EMPLOYMENT SPELL hire_date to the as-of date. Never the person's first-ever hire (AR 1.1).","producer":"hr.employment"}$j$),
  ('days_since_promotion','Days since promotion',
   $j${"type":"integer","measure":"Days from the position assignment effective_from to the as-of date.","producer":"hr.position_assignment"}$j$)
) as v(slug, name, meta)
where not exists (
  select 1 from platform.categories c
   where c.dimension = 'hr_applicability_fact' and c.slug = v.slug and c.deleted_at is null);

-- ============================================================================
-- 3. THE 16 V1 RULE CLASSES (section 1.5), with the section 2.7 absence semantics
--    recorded on the class where the spec puts them.
-- ============================================================================
-- parameter_schema is JSON Schema 2020-12, validated by pg_jsonschema
-- (extensions.jsonschema_validation_errors) at write time in file 03's trigger. Every schema
-- admits the reserved `_unverified` array of section 1.4; the trigger -- not the schema --
-- enforces that each entry names a real key, because JSON Schema cannot express that.

create temporary table _c5_classes (
  slug text, label text, description text, precedence_mode text, comparator text,
  supports_preemption boolean, org_configurable text, absence_semantics text,
  consumer_engines text[], produces_money boolean, parameter_schema jsonb
) on commit drop;

insert into _c5_classes values
('overtime','Overtime',
 'Premium pay owed for hours beyond a statutory daily or weekly threshold.',
 'most_protective','greatest_premium_hours_per_hour_never_summed', false,'more_generous_only',
 'Impossible -- a federal row always exists. A zero result is a data defect and raises.',
 array['ot_engine','scheduler','payroll_export'], true,
 $s${"$schema":"https://json-schema.org/draft/2020-12/schema","type":"object","additionalProperties":false,
     "required":["unit"],
     "properties":{
       "unit":{"enum":["workweek","workday","workday_and_workweek"]},
       "threshold_hours":{"type":["number","null"],"minimum":0},
       "multiplier":{"type":["number","null"],"minimum":1},
       "daily_threshold_hours":{"type":["number","null"],"minimum":0},
       "daily_multiplier":{"type":["number","null"],"minimum":1},
       "weekly_threshold_hours":{"type":["number","null"],"minimum":0},
       "weekly_multiplier":{"type":["number","null"],"minimum":1},
       "seventh_day_rule":{"type":["object","null"]},
       "seventh_consecutive_day":{"type":["object","null"],"additionalProperties":false,
         "properties":{"in_workweek":{"type":["boolean","null"]},"first_hours":{"type":["number","null"]},
                       "multiplier":{"type":["number","null"]},"beyond_hours":{"type":["number","null"]}}},
       "workday_start_local_default":{"type":["string","null"]},
       "no_pyramiding":{"type":["boolean","null"]},
       "applies":{"type":["boolean","null"]},
       "_unverified":{"type":"array","items":{"type":"string"}}}}$s$::jsonb),

('double-time','Double time',
 'Premium pay owed at a 2x multiplier beyond a statutory threshold.',
 'most_protective','greatest_premium_hours_at_2x', false,'more_generous_only',
 'Impossible -- a federal row always exists. A zero result is a data defect and raises.',
 array['ot_engine','scheduler'], true,
 $s${"$schema":"https://json-schema.org/draft/2020-12/schema","type":"object","additionalProperties":false,
     "properties":{
       "applies":{"type":["boolean","null"]},
       "daily_threshold_hours":{"type":["number","null"],"minimum":0},
       "multiplier":{"type":["number","null"],"minimum":1},
       "seventh_consecutive_day":{"type":["object","null"],"additionalProperties":false,
         "properties":{"beyond_hours":{"type":["number","null"]},"multiplier":{"type":["number","null"]}}},
       "_unverified":{"type":"array","items":{"type":"string"}}}}$s$::jsonb),

('meal-break','Meal break',
 'Required unpaid meal periods: when they must start, how long, and on what conditions they may be waived.',
 'most_protective','earliest_trigger_longest_duration_strictest_waiver', false,'more_generous_only',
 'No statutory break obligation; org policy governs; no premium is owed.',
 array['punch_break_engine','scheduler','premium_engine'], false,
 $s${"$schema":"https://json-schema.org/draft/2020-12/schema","type":"object","additionalProperties":false,
     "properties":{
       "applies":{"type":["boolean","null"]},
       "first_meal":{"type":["object","null"],"additionalProperties":false,
         "properties":{"unpaid_minutes":{"type":["number","null"]},
                       "required_before_end_of_hour":{"type":["number","null"]},
                       "waivable_if_total_hours_lte":{"type":["number","null"]}}},
       "second_meal":{"type":["object","null"]},
       "on_duty_meal_agreement":{"type":["object","boolean","null"]},
       "_unverified":{"type":"array","items":{"type":"string"}}}}$s$::jsonb),

('rest-break','Rest break',
 'Required paid rest periods: frequency, duration, and whether they may be combined.',
 'most_protective','most_frequent_longest_most_strictly_paid', false,'more_generous_only',
 'No statutory break obligation; org policy governs; no premium is owed.',
 array['punch_break_engine','scheduler','premium_engine'], false,
 $s${"$schema":"https://json-schema.org/draft/2020-12/schema","type":"object","additionalProperties":false,
     "properties":{
       "applies":{"type":["boolean","null"]},
       "paid_minutes":{"type":["number","null"]},
       "per_hours_worked":{"type":["number","null"]},
       "major_fraction_rule":{"type":["object","boolean","null"]},
       "combinable":{"type":["boolean","null"]},
       "_unverified":{"type":"array","items":{"type":"string"}}}}$s$::jsonb),

('break-premium','Break premium',
 'The premium owed when a required meal or rest break was not provided.',
 'most_protective','greatest_premium_owed_caps_applied_per_rule', false,'no',
 'No statutory break obligation; org policy governs; no premium is owed.',
 array['premium_engine','payroll_export'], true,
 $s${"$schema":"https://json-schema.org/draft/2020-12/schema","type":"object","additionalProperties":false,
     "properties":{
       "applies":{"type":["boolean","null"]},
       "meal":{"type":["object","null"],"additionalProperties":false,
         "properties":{"hours_of_pay":{"type":["number","null"]},"rate":{"type":["string","null"]},
                       "max_per_day":{"type":["number","null"]}}},
       "rest":{"type":["object","null"],"additionalProperties":false,
         "properties":{"hours_of_pay":{"type":["number","null"]},"rate":{"type":["string","null"]},
                       "max_per_day":{"type":["number","null"]}}},
       "independent":{"type":["boolean","null"]},
       "earning_codes":{"type":"array","items":{"type":"string"}},
       "_unverified":{"type":"array","items":{"type":"string"}}}}$s$::jsonb),

('rounding-bounds','Rounding bounds',
 'The legality envelope for punch rounding: the largest permitted increment, the permitted modes, and the neutrality test.',
 'legality_constraint','tightest_increment_strictest_neutrality', false,'within_bounds',
 'No jurisdictional bound; the platform default bound still applies as a product floor.',
 array['config_validator','punch_pairing_engine'], false,
 $s${"$schema":"https://json-schema.org/draft/2020-12/schema","type":"object","additionalProperties":false,
     "properties":{
       "max_increment_minutes":{"type":["number","null"],"minimum":0},
       "allowed_modes":{"type":"array","items":{"enum":["nearest","up","down"]}},
       "neutrality_required":{"type":["boolean","null"]},
       "neutrality_test":{"type":["string","null"]},
       "max_cumulative_bias_minutes_per_100_intervals":{"type":["number","null"]},
       "rationale":{"type":["string","null"]},
       "_unverified":{"type":"array","items":{"type":"string"}}}}$s$::jsonb),

('sick-leave-floor','Statutory sick leave floor',
 'The statutory minimum sick-leave entitlement: accrual rate, when accrual begins, when time becomes usable, carryover, caps and mandated uses.',
 'most_protective','greatest_entitlement', false,'more_generous_only',
 'No statutory floor; the organization''s own leave policy governs unclamped.',
 array['accrual_engine','config_validator','leave_request'], false,
 $s${"$schema":"https://json-schema.org/draft/2020-12/schema","type":"object","additionalProperties":false,
     "properties":{
       "applies":{"type":["boolean","null"]},
       "accrual":{"type":["object","null"],"additionalProperties":false,
         "properties":{"method":{"enum":["per_hours_worked","per_pay_period","front_load",null]},
                       "hours_earned":{"type":["number","null"]},
                       "per_hours_worked":{"type":["number","null"]},
                       "front_load_hours":{"type":["number","null"]}}},
       "accrual_begins":{"type":["string","null"]},
       "use_permitted_after_days":{"type":["number","null"]},
       "carryover":{"type":["object","null"],"additionalProperties":false,
         "properties":{"required":{"type":["boolean","null"]},"cap_hours":{"type":["number","null"]}}},
       "annual_use_cap_hours":{"type":["number","null"]},
       "accrual_cap_hours":{"type":["number","null"]},
       "documentation_not_required_under_consecutive_days":{"type":["number","null"]},
       "permitted_uses":{"type":"array","items":{"type":"string"}},
       "rehire_reinstatement_within_months":{"type":["number","null"]},
       "_unverified":{"type":"array","items":{"type":"string"}}}}$s$::jsonb),

('pto-carryover-legality','PTO carryover legality',
 'Whether accrued paid time off may be forfeited at a plan-year boundary, and whether a cap is permitted instead.',
 'legality_constraint','any_level_forbidding_forfeiture_forbids_it_below', false,'within_bounds',
 'Forfeiture is not prohibited; the organization''s carryover configuration stands as written.',
 array['config_validator','carryover_engine'], false,
 $s${"$schema":"https://json-schema.org/draft/2020-12/schema","type":"object","additionalProperties":false,
     "properties":{
       "forfeiture_allowed":{"type":["boolean","null"]},
       "cap_allowed":{"type":["boolean","null"]},
       "cap_floor_multiplier":{"type":["number","null"]},
       "basis":{"type":["string","null"]},
       "_unverified":{"type":"array","items":{"type":"string"}}}}$s$::jsonb),

('pto-payout-at-termination','PTO payout at termination',
 'Whether accrued unused paid time off must be paid out when employment ends.',
 'most_protective','payout_required_if_any_level_requires_it', false,'more_generous_only',
 'No statutory payout obligation; the organization''s own policy governs. The engine still pays out if org policy promises it.',
 array['offboarding_payout_engine'], true,
 $s${"$schema":"https://json-schema.org/draft/2020-12/schema","type":"object","additionalProperties":false,
     "properties":{
       "required":{"type":["boolean","null"]},
       "scope":{"type":["string","null"]},
       "rate":{"type":["string","null"]},
       "excludes":{"type":"array","items":{"type":"string"}},
       "basis":{"type":["string","null"]},
       "_unverified":{"type":"array","items":{"type":"string"}}}}$s$::jsonb),

('final-pay-deadline','Final pay deadline',
 'When the last paycheck is due after employment ends, by separation reason, and the penalty exposure for missing it.',
 'most_protective','earliest_deadline', false,'no',
 'Falls back to the platform default rule, which is advisory, and raises an advisory flag on the offboarding task. Never "no deadline".',
 array['offboarding','hr_task_inbox'], false,
 $s${"$schema":"https://json-schema.org/draft/2020-12/schema","type":"object","additionalProperties":false,
     "$defs":{"leg":{"type":["object","null"],"additionalProperties":false,
       "properties":{"deadline":{"type":["string","null"]},"hours":{"type":["number","null"]},
                     "days":{"type":["number","null"]},"day_type":{"enum":["calendar","business",null]},
                     "at":{"type":["string","null"]},"notice_hours":{"type":["number","null"]}}}},
     "properties":{
       "fallback":{"type":["boolean","null"]},
       "deadline":{"type":["string","null"]},
       "involuntary":{"$ref":"#/$defs/leg"},
       "voluntary":{"$ref":"#/$defs/leg"},
       "voluntary_without_notice":{"$ref":"#/$defs/leg"},
       "voluntary_with_notice":{"$ref":"#/$defs/leg"},
       "voluntary_with_notice_hours_gte":{"$ref":"#/$defs/leg"},
       "layoff":{"$ref":"#/$defs/leg"},
       "death":{"$ref":"#/$defs/leg"},
       "includes_accrued_pto":{"type":["boolean","null"]},
       "penalty":{"type":["object","null"],"additionalProperties":false,
         "properties":{"type":{"type":["string","null"]},"max_days_of_wages":{"type":["number","null"]},
                       "per_day_amount":{"type":["number","null"]}}},
       "_unverified":{"type":"array","items":{"type":"string"}}}}$s$::jsonb),

('fair-workweek','Fair Workweek / predictive scheduling',
 'A complete predictive-scheduling regime: advance-notice window, predictability pay, good-faith estimate, right to rest, access to hours. Also carries a state''s preemption of local regimes.',
 'most_specific','n/a -- one surviving ordinance governs', true,'no',
 'The establishment is not covered. No notice window, no predictability pay.',
 array['scheduler','predictability_pay_calc'], true,
 $s${"$schema":"https://json-schema.org/draft/2020-12/schema","type":"object","additionalProperties":false,
     "properties":{
       "applies":{"type":["boolean","null"]},
       "mode":{"enum":["preempt_local","no_state_regime","local_regime",null]},
       "permits_local":{"type":["boolean","null"]},
       "advance_notice_days":{"type":["number","null"],"minimum":7,"maximum":14},
       "covered_industries_naics":{"type":"array","items":{"type":"string"}},
       "covered_employer_size":{"type":["object","null"],"additionalProperties":false,
         "properties":{"employees_min":{"type":["number","null"]},"locations_min":{"type":["number","null"]},
                       "measure":{"type":["string","null"]}}},
       "predictability_pay":{"type":["object","null"],"additionalProperties":false,
         "properties":{"schedule":{"type":"array"},"employer_initiated_only":{"type":["boolean","null"]},
                       "employee_consent_waives":{"type":["boolean","null"]}}},
       "good_faith_estimate_required":{"type":["boolean","null"]},
       "right_to_rest_hours_between_shifts":{"type":["number","null"]},
       "right_to_rest_premium":{"type":["number","object","null"]},
       "access_to_hours_offer_required":{"type":["boolean","null"]},
       "record_retention_years":{"type":["number","null"]},
       "_unverified":{"type":"array","items":{"type":"string"}}}}$s$::jsonb),

('minors-hours','Minors -- hours and windows',
 'Hour limits and permitted working windows for workers under 18, by age band.',
 'most_protective','fewest_hours_narrowest_window', false,'no',
 'INCOMPLETE, never "unrestricted". If worker_age_years is under 18 and no rule resolves, the scheduler raises a blocking warning.',
 array['scheduler_conflict_engine'], false,
 $s${"$schema":"https://json-schema.org/draft/2020-12/schema","type":"object","additionalProperties":false,
     "properties":{
       "seeded":{"type":["boolean","null"]},
       "age_bands":{"type":"array","items":{"type":"object","additionalProperties":false,
         "properties":{"min_age":{"type":["number","null"]},"max_age":{"type":["number","null"]},
                       "max_hours_school_day":{"type":["number","null"]},
                       "max_hours_school_week":{"type":["number","null"]},
                       "max_hours_non_school_day":{"type":["number","null"]},
                       "max_hours_non_school_week":{"type":["number","null"]},
                       "earliest_start_local":{"type":["string","null"]},
                       "latest_end_local":{"type":["string","null"]},
                       "latest_end_local_summer":{"type":["string","null"]},
                       "summer_window":{"type":["object","null"]}}}},
       "prohibited_occupations":{"type":"array"},
       "work_permit_required":{"type":["boolean","null"]},
       "_unverified":{"type":"array","items":{"type":"string"}}}}$s$::jsonb),

('training-mandate','Mandated training',
 'A training program an employer must provide: who must take it, for how long, and how often.',
 'additive','every_applicable_mandate_independently_owed', false,'more_generous_only',
 'No mandated training generated. Org-authored assignments are unaffected.',
 array['training_generator','compliance_dashboard'], false,
 $s${"$schema":"https://json-schema.org/draft/2020-12/schema","type":"object","additionalProperties":false,
     "required":["program"],
     "properties":{
       "program":{"type":"string"},
       "supervisor_hours":{"type":["number","null"]},
       "non_supervisor_hours":{"type":["number","null"]},
       "cadence_months":{"type":["number","null"]},
       "initial_due_within_months":{"type":["number","null"]},
       "initial_trigger":{"type":"array","items":{"type":"string"}},
       "employer_min_headcount":{"type":["number","null"]},
       "_unverified":{"type":"array","items":{"type":"string"}}}}$s$::jsonb),

('retention-period','Records retention period',
 'How long a class of record must be kept, from what trigger, and how fast a records request must be answered.',
 'most_protective','longest_retention_earliest_request_response', false,'more_generous_only',
 'Falls back to the federal floor rows. Absence NEVER authorizes destruction (section 4.6).',
 array['records_governance','disposition_engine','legal_hold'], false,
 $s${"$schema":"https://json-schema.org/draft/2020-12/schema","type":"object","additionalProperties":false,
     "properties":{
       "record_class":{"type":["string","null"]},
       "years":{"type":["number","null"],"minimum":0},
       "trigger":{"type":["string","null"]},
       "rule":{"enum":["later_of","earlier_of",null]},
       "terms":{"type":"array","items":{"type":"object","additionalProperties":false,
         "properties":{"years":{"type":["number","null"]},"trigger":{"type":["string","null"]}}}},
       "storage":{"type":["string","null"]},
       "description":{"type":["string","null"]},
       "note":{"type":["string","null"]},
       "same_as":{"type":["string","null"]},
       "segregated":{"type":["boolean","null"]},
       "involuntary_termination":{"type":["object","null"],"additionalProperties":false,
         "properties":{"years":{"type":["number","null"]},"trigger":{"type":["string","null"]}}},
       "covered_categories":{"type":["object","null"],"additionalProperties":false,
         "properties":{"years":{"type":["number","null"]},"applies_to":{"type":"array","items":{"type":"string"}}}},
       "records_request_response_days":{"type":["number","null"]},
       "pay_records_response_days":{"type":["number","null"]},
       "applies_to_former_employees":{"type":["boolean","null"]},
       "_unverified":{"type":"array","items":{"type":"string"}}}}$s$::jsonb),

('new-hire-report-deadline','New-hire reporting deadline',
 'When a new hire must be reported to the state directory of new hires, and what the report must carry.',
 'most_protective','earliest_deadline', false,'no',
 'Falls back to the federal PRWORA row.',
 array['onboarding_checklist'], false,
 $s${"$schema":"https://json-schema.org/draft/2020-12/schema","type":"object","additionalProperties":false,
     "properties":{
       "days":{"type":["number","null"],"minimum":0},
       "day_type":{"enum":["calendar","business",null]},
       "trigger":{"type":["string","null"]},
       "requires":{"type":"array","items":{"type":"string"}},
       "inherits":{"type":["string","null"]},
       "_unverified":{"type":"array","items":{"type":"string"}}}}$s$::jsonb),

('i9-section2-deadline','I-9 Section 1 / Section 2 deadline',
 'The federal I-9 clock: when Section 1 and Section 2 are due, the receipt window, and the rehire-reuse window.',
 'most_protective','earliest_deadline_strictest_windows', false,'no',
 'Impossible -- a federal row always exists, because the I-9 obligation reaches every US employer. A zero result is a data defect and raises.',
 array['onboarding_i9_tracker','compliance_dashboard'], false,
 $s${"$schema":"https://json-schema.org/draft/2020-12/schema","type":"object","additionalProperties":false,
     "properties":{
       "section1":{"type":["object","null"],"additionalProperties":false,
         "properties":{"deadline":{"type":["string","null"]},"day_type":{"enum":["calendar","business",null]}}},
       "section2":{"type":["object","null"],"additionalProperties":false,
         "properties":{"days":{"type":["number","null"]},"day_type":{"enum":["calendar","business",null]},
                       "trigger":{"type":["string","null"]},
                       "hire_date_counts_as_day_zero":{"type":["boolean","null"]},
                       "business_day_calendar":{"type":["string","null"]},
                       "short_term_employment_exception":{"type":["object","null"],"additionalProperties":false,
                         "properties":{"employment_days_lte":{"type":["number","null"]},
                                       "deadline":{"type":["string","null"]}}}}},
       "receipt_window":{"type":["object","null"],"additionalProperties":false,
         "properties":{"days":{"type":["number","null"]},"day_type":{"enum":["calendar","business",null]},
                       "trigger":{"type":["string","null"]},"applies_to":{"type":"array","items":{"type":"string"}}}},
       "rehire_reuse_window":{"type":["object","null"],"additionalProperties":false,
         "properties":{"years":{"type":["number","null"]},"trigger":{"type":["string","null"]},
                       "requires":{"type":"array","items":{"type":"string"}}}},
       "authorized_representative_permitted":{"type":["boolean","null"]},
       "remote_examination_permitted":{"type":["boolean","null"]},
       "form_version":{"type":["string","null"]},
       "_unverified":{"type":"array","items":{"type":"string"}}}}$s$::jsonb);

-- every schema must itself be a valid JSON Schema before anything is validated against it
do $$
declare r record;
begin
  for r in select slug, parameter_schema from _c5_classes loop
    if not extensions.jsonschema_is_valid(r.parameter_schema::json) then
      raise exception 'hr_c5_00: parameter_schema for class % is not a valid JSON Schema', r.slug;
    end if;
  end loop;
end $$;

insert into hr.jurisdiction_rule_class (
  organization_id, visibility, slug, label, description, parameter_schema, precedence_mode,
  comparator, supports_preemption, org_configurable, absence_semantics, consumer_engines,
  produces_money, is_active)
select '39c38960-d30c-4840-b0c1-c9960de95582'::uuid, 'public'::platform.visibility,
       c.slug, c.label, c.description, c.parameter_schema, c.precedence_mode, c.comparator,
       c.supports_preemption, c.org_configurable, c.absence_semantics, c.consumer_engines,
       c.produces_money, true
from _c5_classes c
where not exists (select 1 from hr.jurisdiction_rule_class x where x.slug = c.slug);

-- an idempotent re-run refreshes the definitional columns (a class definition is not user data)
update hr.jurisdiction_rule_class t set
  label = c.label, description = c.description, parameter_schema = c.parameter_schema,
  precedence_mode = c.precedence_mode, comparator = c.comparator,
  supports_preemption = c.supports_preemption, org_configurable = c.org_configurable,
  absence_semantics = c.absence_semantics, consumer_engines = c.consumer_engines,
  produces_money = c.produces_money
from _c5_classes c
where t.slug = c.slug and (
  t.label is distinct from c.label or t.description is distinct from c.description
  or t.parameter_schema is distinct from c.parameter_schema
  or t.precedence_mode is distinct from c.precedence_mode
  or t.comparator is distinct from c.comparator
  or t.supports_preemption is distinct from c.supports_preemption
  or t.org_configurable is distinct from c.org_configurable
  or t.absence_semantics is distinct from c.absence_semantics
  or t.consumer_engines is distinct from c.consumer_engines
  or t.produces_money is distinct from c.produces_money);

do $$
declare v_n integer; v_preempt integer; v_money integer;
begin
  select count(*) into v_n from hr.jurisdiction_rule_class where deleted_at is null;
  if v_n <> 16 then
    raise exception 'hr_c5_00: section 1.5 declares exactly 16 v1 rule classes, found %', v_n;
  end if;
  select count(*) into v_preempt from hr.jurisdiction_rule_class where supports_preemption;
  if v_preempt <> 1 then
    raise exception 'hr_c5_00: section 1.5 -- supports_preemption is true only for fair-workweek in v1, found % classes', v_preempt;
  end if;
  select count(*) into v_money from hr.jurisdiction_rule_class where produces_money;
  if v_money <> 5 then
    raise exception 'hr_c5_00: section 1.5 gives produces_money to exactly 5 classes (overtime, double-time, break-premium, pto-payout-at-termination, fair-workweek) -- found %', v_money;
  end if;
end $$;

-- ============================================================================
-- 4. The section 8 configuration register, jurisdiction-rules group.
-- ============================================================================
insert into platform.feature_knob (feature, key, label, description, value_type, value, default_value,
                                   allowed_values, min_value, max_value, unit, set_by, basis, review_due)
select 'hr.jurisdiction_rules', v.key, v.label, v.description, v.value_type,
       v.default_value::jsonb, v.default_value::jsonb, v.allowed::jsonb,
       v.min_value, v.max_value, v.unit, 'agent', v.basis, date '2027-02-26'
from (values
  ('resolution_cache_ttl_seconds','Resolver cache TTL',
   'How long a resolved rule set may be cached before it is resolved again.','integer','60',null,0::numeric,3600::numeric,'seconds',
   'SPEC-JURISDICTION section 8: mirrors the feature-knob reader own 60s TTL-only cache. Rules change rarely and an invalidation channel is a thing to forget to fire.'),
  ('missing_fact_behavior','Missing applicability fact behaviour',
   'What the resolver does when a rule applicability names a fact the caller did not supply.','enum','"fail"','["fail","flag"]',null,null,null,
   'SPEC-JURISDICTION section 1.4: a defaulted fact is how a compliance engine ships a confident wrong answer. An org running a pilot may relax it to flag.'),
  ('advisory_rules_block_money','Advisory rules never produce money',
   'Whether an advisory rule may contribute to a computed amount on a produces_money class.','boolean','true',null,null,null,null,
   'SPEC-JURISDICTION section 1.3. Deliberately platform-only and NOT org-overridable: an organization must not be able to opt into paying from unverified law.'),
  ('recompute_posture','Recompute posture',
   'Whether an open pay period recomputes automatically or always requires a batch.','enum','"open_period_auto"','["open_period_auto","always_manual"]',null,null,null,
   'SPEC-JURISDICTION section 4.5: an organization with a strict change-control process may require a batch even in an open period.'),
  ('config_violation_action','Config violation action',
   'Whether an organization configuration that conflicts with a rule is rejected or warned about.','enum','"reject"','["reject","warn"]',null,null,null,
   'SPEC-JURISDICTION section 3.2 rule 1. Org-overridable, but the override reaches only org-policy-only bounds -- it may never relax a statutory floor.'),
  ('prospective_snapshot_retention_days','Prospective snapshot retention',
   'How long prospective (non-evidence) calculation snapshots are kept.','integer','30',null,1::numeric,365::numeric,'days',
   'SPEC-JURISDICTION section 8: prospective snapshots are not evidence, and they are the highest-volume snapshot kind.'),
  ('verification_overdue_alert','Alert on an overdue advisory rule',
   'Whether an advisory rule past its verification_due raises a platform alert.','boolean','true',null,null,null,null,
   'SPEC-JURISDICTION section 5.9: an overdue advisory rule is a defect, and the alert is where it becomes visible.')
) as v(key, label, description, value_type, default_value, allowed, min_value, max_value, unit, basis)
where not exists (select 1 from platform.feature_knob k
                   where k.feature = 'hr.jurisdiction_rules' and k.key = v.key);

-- ============================================================================
-- 5. platform.v_hr_jurisdiction_rule_overdue (section 5.9)
-- ============================================================================
create or replace view platform.v_hr_jurisdiction_rule_overdue
with (security_invoker = true) as
select r.id            as rule_id,
       r.version       as rule_version,
       rc.slug         as rule_class,
       rc.label        as rule_class_label,
       r.jurisdiction_key,
       j.name          as jurisdiction_name,
       r.status,
       r.verification_due,
       (current_date - r.verification_due) as days_overdue,
       r.basis,
       r.citation,
       r.organization_id
from hr.jurisdiction_rule r
join hr.jurisdiction_rule_class rc on rc.id = r.rule_class_id
join hr.jurisdiction j on j.key = r.jurisdiction_key
where r.deleted_at is null
  and r.status in ('advisory','draft')
  and r.verification_due is not null
  and r.verification_due < current_date;

comment on view platform.v_hr_jurisdiction_rule_overdue is
  'SPEC-JURISDICTION 5.9: every rule still advisory past its verification_due. An overdue '
  'advisory rule is a defect; the admin surface renders this count in red.';

select set_config('hr.privileged_write', 'off', false);
