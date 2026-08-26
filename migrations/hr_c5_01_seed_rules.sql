-- HR domain, C5 / register item HRB-009, file 01 of 05.
--
-- Authority: /projects/hr-domain/specs/SPEC-JURISDICTION.md section 5 IN FULL -- 5.1 federal,
-- 5.2 California, 5.3 no-forfeiture states, 5.4 the honest final-pay gap, 5.5 Fair Workweek
-- localities and the eleven preemption states, 5.6 sick leave, 5.7 training mandates, 5.8 the
-- minors slot, 5.9 the verification pass. Plus section 1.4's _unverified mechanism and 1.2's
-- write-time parameter validation.
--
-- 🚨 EVERY VALUE IN THIS FILE IS TRANSCRIBED FROM SECTION 5. Nothing was researched, inferred or
-- remembered here. A value section 5 marks with a warning ships status='advisory' and therefore
-- can never produce money on a produces_money class (section 1.3). A value section 5 leaves
-- partly verified ships with the exact `_unverified` key list section 5 gives it.
--
-- 🚨 effective_from IS A SEED FLOOR, NOT A STATUTE'S EFFECTIVE DATE. Section 5 supplies no
-- effective dates and this program did no research into when each rule took effect, so every
-- seeded row carries 1900-01-01 and metadata.effective_from_is_seed_floor = true. That is the
-- conservative direction (we never assert a rule did NOT exist on a past work date, which would
-- silently drop an obligation from a recomputed historical result) and it is findable: the
-- JUR-SEED pass replaces it with the statutory date. SPEC-JURISDICTION section 5 owes one line
-- saying what effective_from is seeded to.
--
-- Idempotent. Applied live as migration `hr_c5_01_seed_rules`.

set local lock_timeout = '20s';

select set_config('hr.privileged_write', 'on', false);

-- ============================================================================
-- 1. The county/city geography section 5.5 needs (file 01 seeded federal + 50 states + DC only).
-- ============================================================================
-- A city inside a COVERED county lists that county as parent_key so the chain walk reaches both
-- (section 1.1); a city in an uncovered county parents directly to the state.
insert into hr.jurisdiction (organization_id, key, level, parent_key, name, iso_code, visibility)
select '39c38960-d30c-4840-b0c1-c9960de95582'::uuid, 'US-CA-LOS_ANGELES_COUNTY', 'county', 'US-CA',
       'Los Angeles County', null, 'public'::platform.visibility
where not exists (select 1 from hr.jurisdiction j where j.key = 'US-CA-LOS_ANGELES_COUNTY');

insert into hr.jurisdiction (organization_id, key, level, parent_key, name, iso_code, visibility)
select '39c38960-d30c-4840-b0c1-c9960de95582'::uuid, v.key, v.level, v.parent_key, v.name, null,
       'public'::platform.visibility
from (values
  ('US-CA-LOS_ANGELES','city','US-CA-LOS_ANGELES_COUNTY','Los Angeles'),
  ('US-CA-SAN_FRANCISCO','city','US-CA','San Francisco'),
  ('US-CA-BERKELEY','city','US-CA','Berkeley'),
  ('US-CA-EMERYVILLE','city','US-CA','Emeryville'),
  ('US-NY-NEW_YORK','city','US-NY','New York'),
  ('US-WA-SEATTLE','city','US-WA','Seattle'),
  ('US-PA-PHILADELPHIA','city','US-PA','Philadelphia'),
  ('US-IL-CHICAGO','city','US-IL','Chicago'),
  ('US-IL-EVANSTON','city','US-IL','Evanston')
) as v(key, level, parent_key, name)
where not exists (select 1 from hr.jurisdiction j where j.key = v.key);

-- ============================================================================
-- 2. Write-time parameter validation (section 1.2) + the _unverified naming rule (section 1.4).
-- ============================================================================
-- Section 1.2 says parameter_schema is enforced at write time by the AD-5 validator contract and
-- that THIS SPEC ADDS NO SECOND VALIDATOR. It does not: the schema half delegates to
-- pg_jsonschema (extensions.jsonschema_validation_errors), which is the JSON Schema engine
-- already installed in this database. The _unverified half is a rule JSON Schema cannot express
-- -- "every entry names a real key IN THE SAME OBJECT" -- and section 1.4 states it explicitly,
-- so it is enforced here rather than in a schema.
create or replace function hr._jurisdiction_rule_parameters_valid()
returns trigger
language plpgsql
as $fn$
declare
  v_schema jsonb;
  v_slug   text;
  v_errors text[];
  v_path   text;
  v_parts  text[];
begin
  select rc.parameter_schema, rc.slug into v_schema, v_slug
    from hr.jurisdiction_rule_class rc
   where rc.id = new.rule_class_id;

  if v_schema is null then
    raise exception 'hr.jurisdiction_rule: rule_class_id % does not resolve to a rule class', new.rule_class_id
      using errcode = '23503';
  end if;

  if v_schema <> '{}'::jsonb then
    v_errors := extensions.jsonschema_validation_errors(v_schema::json, new.parameters::json);
    if v_errors is not null and cardinality(v_errors) > 0 then
      raise exception 'hr.jurisdiction_rule: parameters fail the % class schema: %',
        v_slug, array_to_string(v_errors, '; ')
        using errcode = '22000',
              hint = 'SPEC-JURISDICTION 1.2: a rule row whose parameters fail its class schema is refused at write time. There is no advisory mode for a malformed parameter block.';
    end if;
  end if;

  -- section 1.4: an _unverified entry that does not name a real key cannot rot away from the
  -- parameters it describes, because it is refused.
  if jsonb_typeof(new.parameters -> '_unverified') = 'array' then
    for v_path in select jsonb_array_elements_text(new.parameters -> '_unverified') loop
      v_parts := string_to_array(v_path, '.');
      if (new.parameters #> v_parts) is null then
        raise exception 'hr.jurisdiction_rule: _unverified names "%", which is not a key in this row''s parameters', v_path
          using errcode = '22000',
                hint = 'SPEC-JURISDICTION 1.4: the validator rejects an _unverified entry that does not name a real key in the same object.';
      end if;
    end loop;
  end if;

  return new;
end
$fn$;

drop trigger if exists _zz_jurisdiction_rule_parameters_valid on hr.jurisdiction_rule;
create trigger _zz_jurisdiction_rule_parameters_valid
  before insert or update of parameters, rule_class_id on hr.jurisdiction_rule
  for each row execute function hr._jurisdiction_rule_parameters_valid();

-- ============================================================================
-- 3. THE SEEDS. One staging table, one insert, so every row is visibly one line of section 5.
-- ============================================================================
create temporary table _c5_rules (
  class_slug text, jurisdiction_key text, status text, parameters jsonb, applicability jsonb,
  basis text, citation jsonb, verification_due date
) on commit drop;

-- Citation shorthand. Section 5: "The citation column names the internal source; the build-time
-- pass replaces each with a primary legal citation."
create temporary table _cite on commit drop as
select
  $c${"authority":"AI Matrx HR program research","title":"CAPABILITY-SCOPE 3 (per-area capability findings)","url":"/projects/hr-domain/CAPABILITY-SCOPE.md","retrieved_at":"2026-08-26","verified_by":null,"verified_at":null,"confidence":"program_research"}$c$::jsonb as cs3,
  $c${"authority":"AI Matrx HR program research","title":"CAPABILITY-SCOPE 4 (the retention / state-law ledger)","url":"/projects/hr-domain/CAPABILITY-SCOPE.md","retrieved_at":"2026-08-26","verified_by":null,"verified_at":null,"confidence":"program_research"}$c$::jsonb as cs4,
  $c${"authority":"AI Matrx HR adversarial review 1","title":"AR 1 (adversarial review, numbered findings)","url":"/projects/hr-domain/","retrieved_at":"2026-08-26","verified_by":null,"verified_at":null,"confidence":"program_research"}$c$::jsonb as ar1,
  $c${"authority":"AI Matrx HR adversarial review 2","title":"AR2 (second adversarial review, numbered findings)","url":"/projects/hr-domain/","retrieved_at":"2026-08-26","verified_by":null,"verified_at":null,"confidence":"program_research"}$c$::jsonb as ar2,
  $c${"authority":"NOT CARRIED BY PROGRAM RESEARCH","title":"SPEC-JURISDICTION 5 marks this value unverified; no primary legal source has been read","url":"/projects/hr-domain/specs/SPEC-JURISDICTION.md","retrieved_at":"2026-08-26","verified_by":null,"verified_at":null,"confidence":"unverified"}$c$::jsonb as none;

-- ---------------------------------------------------------------- 5.1 FEDERAL (US)
insert into _c5_rules
select * from (values
('overtime','US','active',
 $p${"unit":"workweek","threshold_hours":40,"multiplier":1.5,"daily_threshold_hours":null,"seventh_day_rule":null}$p$::jsonb,
 $a$[{"fact":"flsa_status","op":"eq","value":"non_exempt"},{"fact":"worker_class","op":"in","value":["employee","intern","seasonal"]}]$a$::jsonb,
 'Federal FLSA overtime is a WEEKLY-40 rule only. There is no federal daily threshold, which is why daily_threshold_hours is an explicit null rather than an absent key: an engine reading this row must be able to see that the question was answered, not skipped.',
 (select cs3 from _cite), null::date),

('double-time','US','active', $p${"applies":false}$p$::jsonb, '[]'::jsonb,
 'Seeded explicitly with applies=false so the resolution trace can say CONSIDERED, NOT APPLICABLE. There is no federal mandated double-time; an absent row would be indistinguishable from an unseeded gap.',
 (select cs3 from _cite), null),

('meal-break','US','active', $p${"applies":false}$p$::jsonb, '[]'::jsonb,
 'No federal meal-period requirement for adults. CAPABILITY-SCOPE lists meal and rest periods as a CALIFORNIA requirement, not a federal one. Seeded explicitly so the trace records that the federal rule was consulted.',
 (select cs3 from _cite), null),

('rest-break','US','active', $p${"applies":false}$p$::jsonb, '[]'::jsonb,
 'No federal rest-period requirement. Same reasoning as the federal meal-break row.',
 (select cs3 from _cite), null),

('break-premium','US','active', $p${"applies":false}$p$::jsonb, '[]'::jsonb,
 'No federal break exists, so no federal break premium can be owed. Seeded so a premium engine gets an explicit answer rather than an absence.',
 (select cs3 from _cite), null),

('rounding-bounds','US','advisory',
 $p${"max_increment_minutes":15,"allowed_modes":["nearest"],"neutrality_required":true,"neutrality_test":"symmetric_midpoint","max_cumulative_bias_minutes_per_100_intervals":0}$p$::jsonb,
 '[]'::jsonb,
 'ADVISORY, JUR-SEED-4. The program research says federally permitted increments are TYPICALLY 15 minutes or less and that a fixed always-round-down rule is never permitted. "Typically" is a description of practice, not a citation of a regulation. The regulatory basis (29 CFR 785.48(b)) and the current enforcement posture are both unread. Until this row is active, rounding configuration validates against the value here as a PRODUCT bound, never as a stated legal maximum.',
 (select cs3 from _cite), date '2026-11-26'),

('retention-period','US','active',
 $p${"record_class":"time_records","years":2,"trigger":"record_created","description":"records used to compute wages"}$p$::jsonb,
 '[]'::jsonb,
 'The retention ledger the program research compiled gives 2 years from record creation for the records used to compute wages.',
 (select cs4 from _cite), null),

('retention-period','US','active',
 $p${"record_class":"payroll_computation","years":3,"trigger":"record_created"}$p$::jsonb, '[]'::jsonb,
 'The retention ledger gives 3 years for payroll computation records under the FLSA.',
 (select cs4 from _cite), null),

('retention-period','US','active',
 $p${"record_class":"i9","rule":"later_of","terms":[{"years":3,"trigger":"hire_date"},{"years":1,"trigger":"termination_date"}],"storage":"separate_from_personnel_file"}$p$::jsonb,
 '[]'::jsonb,
 'The I-9 clock is a LATER-OF of two terms, which is why this row carries a rule and a terms array rather than a single years value. Storage separate from the personnel file is part of the obligation, not a filing preference.',
 (select cs4 from _cite), null),

('retention-period','US','active',
 $p${"record_class":"personnel_hiring","years":1,"trigger":"record_created","involuntary_termination":{"years":1,"trigger":"termination_date"},"covered_categories":{"years":2,"applies_to":["state_local_government","federal_contractor","education"]}}$p$::jsonb,
 '[]'::jsonb,
 'The EEOC personnel/hiring floor, with the two carve-outs the ledger records: an involuntary termination restarts a one-year clock from the termination date, and three categories of covered employer carry two years instead of one.',
 (select cs4 from _cite), null),

('retention-period','US','active',
 $p${"record_class":"candidate","years":1,"trigger":"record_created","note":"clock starts at creation regardless of outcome","covered_categories":{"years":2}}$p$::jsonb,
 '[]'::jsonb,
 'Applicant records run one year from CREATION regardless of hiring outcome -- a rejected candidate is not a shorter clock. Covered categories carry two.',
 (select cs4 from _cite), null),

('retention-period','US','active',
 $p${"record_class":"eeo_self_id","same_as":"candidate","segregated":true}$p$::jsonb, '[]'::jsonb,
 'EEO self-identification records follow the candidate clock and must be kept segregated. Expressed as same_as rather than a copied number so the two cannot drift apart when the candidate clock is verified.',
 (select cs4 from _cite), null),

('new-hire-report-deadline','US','advisory',
 $p${"days":20,"day_type":"calendar","trigger":"hire_date","requires":["employee_name","address","ssn","hire_date","employer_name","employer_address","ein"]}$p$::jsonb,
 '[]'::jsonb,
 'ADVISORY. The program research says "within ~20 days (PRWORA); some states faster". The tilde is the problem: the exact PRWORA wording and whether the 20 days are calendar or business days are both unread, and this feeds a filing deadline.',
 (select ar1 from _cite), date '2026-11-26'),

('final-pay-deadline','US','advisory',
 $p${"fallback":true,"deadline":"next_regular_payday","involuntary":{"deadline":"next_regular_payday"},"voluntary":{"deadline":"next_regular_payday"}}$p$::jsonb,
 '[]'::jsonb,
 'ADVISORY, JUR-SEED-1. THERE IS NO FEDERAL FINAL-PAY DEADLINE. This row exists only so the class never returns "no deadline" (section 2.7) -- it is the customary fallback, not a legal finding, and it is not carried by program research at all. A state whose own row is not yet active shows this value WITH an unverified banner, never as a confident date.',
 (select none from _cite), date '2026-11-26'),

('sick-leave-floor','US','active', $p${"applies":false}$p$::jsonb, '[]'::jsonb,
 'There is no federal paid-sick-leave mandate for private employers; the program research treats statutory sick leave as a state and city matter throughout. Seeded explicitly so the accrual engine gets an answer.',
 (select cs3 from _cite), null),

('pto-carryover-legality','US','active',
 $p${"forfeiture_allowed":true,"cap_allowed":true}$p$::jsonb, '[]'::jsonb,
 'No federal rule prohibits forfeiture of accrued paid time off. The research names only STATE no-forfeiture rules, so at the federal level the org policy stands as written.',
 (select cs3 from _cite), null),

('pto-payout-at-termination','US','active',
 $p${"required":false}$p$::jsonb, '[]'::jsonb,
 'Payout of accrued unused PTO at termination is a per-state requirement, not a federal one.',
 (select cs3 from _cite), null),

('fair-workweek','US','active',
 $p${"applies":false}$p$::jsonb, '[]'::jsonb,
 'Predictive-scheduling regimes are city and state ordinances. No federal Fair Workweek obligation exists.',
 (select cs3 from _cite), null),

('i9-section2-deadline','US','active',
 $p${"section1":{"deadline":"first_day_of_employment","day_type":"calendar"},
     "section2":{"days":3,"day_type":"business","trigger":"hire_date","hire_date_counts_as_day_zero":null,"business_day_calendar":"federal","short_term_employment_exception":{"employment_days_lte":null,"deadline":null}},
     "receipt_window":{"days":null,"day_type":"calendar","trigger":null,"applies_to":["lost_stolen_damaged_document"]},
     "rehire_reuse_window":{"years":null,"trigger":"original_form_completion_date","requires":["supplement_b","work_authorization_still_valid"]},
     "authorized_representative_permitted":null,
     "remote_examination_permitted":null,
     "form_version":null,
     "_unverified":["section2.hire_date_counts_as_day_zero","section2.business_day_calendar","section2.short_term_employment_exception","receipt_window","rehire_reuse_window","authorized_representative_permitted","remote_examination_permitted","form_version"]}$p$::jsonb,
 $a$[{"fact":"worker_class","op":"eq","value":"employee"}]$a$::jsonb,
 'ACTIVE for the two timings the research carries verbatim: Section 1 no later than the first day of employment, Section 2 within 3 business days of the hire date. EVERYTHING ELSE IS UNVERIFIED AND LISTED (JUR-SEED-8): whether the hire date counts as day zero, which calendar defines a business day, the receipt window, the rehire-reuse window, the short-term-employment exception, authorized-representative and remote-examination rules, and the current form version. A consumer reading any listed key flags it; it never asserts it. Applicability excludes contractors (D8).',
 (select cs3 from _cite), date '2026-11-26'),

('minors-hours','US','draft',
 $p${"seeded":true,
     "age_bands":[{"min_age":14,"max_age":15,"max_hours_school_day":null,"max_hours_school_week":null,"max_hours_non_school_day":null,"max_hours_non_school_week":null,"earliest_start_local":null,"latest_end_local":null,"latest_end_local_summer":null,"summer_window":{"from":null,"to":null}}],
     "prohibited_occupations":[],
     "work_permit_required":null}$p$::jsonb,
 '[]'::jsonb,
 'DRAFT, JUR-SEED-7, and draft is load-bearing: a draft row is NEVER resolved, so a minor with no rule produces zero surviving candidates, which section 2.7 defines as INCOMPLETE and the scheduler turns into a blocking warning. The parameter SHAPE is final so the conflict engine can be built against it; not one value is seeded, because the downside of a guessed child-labor hour limit is a child-labor violation.',
 (select none from _cite), null)
) as v;

-- ---------------------------------------------------------------- 5.2 CALIFORNIA (US-CA)
insert into _c5_rules
select * from (values
('overtime','US-CA','active',
 $p${"unit":"workday_and_workweek","daily_threshold_hours":8,"daily_multiplier":1.5,"weekly_threshold_hours":40,"weekly_multiplier":1.5,"seventh_consecutive_day":{"in_workweek":true,"first_hours":8,"multiplier":1.5},"workday_start_local_default":"00:00","no_pyramiding":true,"_unverified":["workday_start_local_default","no_pyramiding"]}$p$::jsonb,
 $a$[{"fact":"flsa_status","op":"eq","value":"non_exempt"},{"fact":"worker_class","op":"in","value":["employee","intern","seasonal"]}]$a$::jsonb,
 'ACTIVE for the thresholds the research carries verbatim: daily overtime after 8 hours, and after 8 hours on a 7th consecutive workday. TWO KEYS ARE UNVERIFIED AND LISTED (JUR-SEED-4): the workday-start construction (which 24-hour period daily OT is measured over) and the anti-pyramiding citation. Anti-pyramiding is the standard construction and the engine applies it, but the citation is not carried by this program''s research, so the key is flagged rather than asserted.',
 (select cs3 from _cite), date '2026-11-26'),

('double-time','US-CA','active',
 $p${"daily_threshold_hours":12,"multiplier":2.0,"seventh_consecutive_day":{"beyond_hours":8,"multiplier":2.0}}$p$::jsonb,
 $a$[{"fact":"flsa_status","op":"eq","value":"non_exempt"},{"fact":"worker_class","op":"in","value":["employee","intern","seasonal"]}]$a$::jsonb,
 'Double time after 12 hours in a workday, or after 8 hours on a 7th consecutive workday. Both figures are carried verbatim by the program research.',
 (select cs3 from _cite), null),

('meal-break','US-CA','active',
 $p${"first_meal":{"unpaid_minutes":30,"required_before_end_of_hour":5,"waivable_if_total_hours_lte":null},"second_meal":null,"on_duty_meal_agreement":null,"_unverified":["first_meal.waivable_if_total_hours_lte","second_meal","on_duty_meal_agreement"]}$p$::jsonb,
 '[]'::jsonb,
 'ACTIVE for the first meal period only: an unpaid 30-minute break before the end of hour 5, which the research carries verbatim. The second meal period over 10 hours, the waiver for short shifts, and on-duty meal agreements are all UNVERIFIED AND LISTED (JUR-SEED-6). The waiver slot exists because the product already captures meal waivers; it holds null rather than a guessed threshold.',
 (select cs3 from _cite), date '2026-11-26'),

('rest-break','US-CA','active',
 $p${"paid_minutes":10,"per_hours_worked":4,"major_fraction_rule":null,"combinable":false,"_unverified":["major_fraction_rule"]}$p$::jsonb,
 '[]'::jsonb,
 'ACTIVE for the base rule the research carries: a paid 10-minute rest break every 4 hours. The major-fraction rule is UNVERIFIED AND LISTED (JUR-SEED-6).',
 (select cs3 from _cite), date '2026-11-26'),

('break-premium','US-CA','active',
 $p${"meal":{"hours_of_pay":1,"rate":"regular_rate","max_per_day":1},"rest":{"hours_of_pay":1,"rate":"regular_rate","max_per_day":1},"independent":true,"earning_codes":["meal_premium","rest_premium"]}$p$::jsonb,
 '[]'::jsonb,
 'One hour of pay at the regular rate for each day a compliant meal break was not provided, PLUS a separate hour for rest breaks -- independent, each capped at one per day. The independence is the whole point: merging them into one premium underpays by an hour on a day both were missed.',
 (select ar1 from _cite), null),

('rounding-bounds','US-CA','advisory',
 $p${"max_increment_minutes":0,"allowed_modes":[],"neutrality_required":true,"rationale":"conservative default: California case law disfavors rounding; no rounding is always lawful"}$p$::jsonb,
 '[]'::jsonb,
 'ADVISORY, JUR-SEED-4, AND THIS IS A PRODUCT DEFAULT, NOT A LEGAL FINDING. The program research gives only the federal neutrality rule and says nothing about California rounding. Zero increment is chosen because not rounding is lawful everywhere, so the conservative default cannot be wrong in the direction that costs a worker money. Because the row is advisory it WARNS on an org rounding configuration; it does not reject one (section 3.2 rule 5).',
 (select none from _cite), date '2026-11-26'),

('sick-leave-floor','US-CA','active',
 $p${"accrual":{"method":"per_hours_worked","hours_earned":1,"per_hours_worked":30},"accrual_begins":"day_1","use_permitted_after_days":90,"carryover":{"required":true,"cap_hours":null},"annual_use_cap_hours":null,"accrual_cap_hours":null,"documentation_not_required_under_consecutive_days":3,"permitted_uses":["own_illness","family_care","safe_time"],"rehire_reinstatement_within_months":12,"_unverified":["carryover.cap_hours","annual_use_cap_hours","accrual_cap_hours"]}$p$::jsonb,
 '[]'::jsonb,
 'ACTIVE for everything the research states: 1 hour per 30 hours worked, accrual from day 1, use permitted at day 90, mandated carryover, the mandated permitted uses including family care and safe time, no documentation under 3 consecutive days, and reinstatement of an unused balance on rehire within 12 months. THE THREE CAPS ARE UNVERIFIED AND LISTED (JUR-SEED-2): California''s annual use cap and accrual cap are real numbers we have not read, and a wrong cap silently stops an accrual.',
 (select ar1 from _cite), date '2026-11-26'),

('pto-carryover-legality','US-CA','active',
 $p${"forfeiture_allowed":false,"cap_allowed":true,"cap_floor_multiplier":null,"basis":"accrued vacation is earned wages"}$p$::jsonb,
 '[]'::jsonb,
 'California is one of the four no-forfeiture jurisdictions the research names: use-it-or-lose-it is unlawful and only a cap is permitted. cap_floor_multiplier is DELIBERATELY NULL -- the 1.5x to 2x pattern in the research is described as a common INDUSTRY pattern, not a legal minimum, and seeding it as law would invent a floor that no statute states.',
 (select cs3 from _cite), null),

('pto-payout-at-termination','US-CA','active',
 $p${"required":true,"scope":"accrued_unused_vacation_and_pto","rate":"final_rate","excludes":["statutory_sick_leave"],"basis":"earned wages","_unverified":["excludes"]}$p$::jsonb,
 '[]'::jsonb,
 'ACTIVE for the requirement itself, which follows directly from the earned-wages doctrine the research states for California. The EXCLUDES list is unverified and listed: whether statutory sick leave is outside the payout obligation is a real question we have not read the answer to, and it changes a dollar figure.',
 (select cs3 from _cite), date '2026-11-26'),

('final-pay-deadline','US-CA','active',
 $p${"involuntary":{"deadline":"immediately","at":"time_of_termination"},"voluntary_without_notice":{"hours":72},"voluntary_with_notice_hours_gte":{"notice_hours":72,"deadline":"last_day"},"penalty":{"type":"waiting_time","max_days_of_wages":30},"_unverified":["voluntary_with_notice_hours_gte"]}$p$::jsonb,
 '[]'::jsonb,
 'ACTIVE for the three terms the research carries verbatim: immediately on involuntary termination, 72 hours on a quit without notice, and waiting-time penalties up to 30 days of wages. The with-notice leg is unverified and listed -- the research does not state it, and the 72-hour notice threshold in the parameter is the shape, not a finding.',
 (select ar1 from _cite), date '2026-11-26'),

('training-mandate','US-CA','active',
 $p${"program":"harassment_prevention","supervisor_hours":2,"non_supervisor_hours":1,"cadence_months":24,"initial_due_within_months":6,"initial_trigger":["hire","promotion_to_supervisor"],"employer_min_headcount":null,"_unverified":["employer_min_headcount"]}$p$::jsonb,
 '[]'::jsonb,
 'ACTIVE for the hours, the biennial cadence and the 6-month initial trigger the research carries (CA SB1343: 2 hours supervisors, 1 hour staff, biennial, within 6 months of hire or promotion). The employer headcount threshold is unverified and listed (JUR-SEED-5): generating an assignment for an employer the mandate does not reach is a smaller harm than missing one, so the null means "assume covered and flag".',
 (select ar2 from _cite), date '2026-11-26'),

('retention-period','US-CA','active',
 $p${"record_class":"personnel_file","records_request_response_days":30,"pay_records_response_days":21,"applies_to_former_employees":true}$p$::jsonb,
 '[]'::jsonb,
 'California records-REQUEST response deadlines, which the research carries with statute references: 30 days for the personnel file and 21 days for pay records, and the duty reaches former employees. This is a response clock, not a retention length, which is why it carries no years value.',
 (select ar1 from _cite), null),

('fair-workweek','US-CA','active',
 $p${"applies":false,"mode":"no_state_regime","permits_local":true}$p$::jsonb,
 '[]'::jsonb,
 'California has NO statewide Fair Workweek regime and is NOT on the preemption list, so its local ordinances survive. This row is what makes that explicit: permits_local=true tells the preemption pass to leave the LA city, LA county, Berkeley, Emeryville and San Francisco rows standing.',
 (select cs3 from _cite), null),

('new-hire-report-deadline','US-CA','advisory',
 $p${"days":null,"day_type":null,"trigger":"hire_date","inherits":"US","_unverified":["days","day_type"]}$p$::jsonb,
 '[]'::jsonb,
 'ADVISORY, and deliberately EMPTY of numbers. The research says "some states faster" without naming which, so whether California is faster than the federal ~20 days is unknown. The row exists rather than being omitted so the state is visibly unanswered rather than silently defaulted; inherits=US records that the federal row governs until this one is verified.',
 (select ar1 from _cite), date '2026-11-26'),

('minors-hours','US-CA','draft',
 $p${"seeded":true,"age_bands":[],"prohibited_occupations":[],"work_permit_required":null}$p$::jsonb,
 '[]'::jsonb,
 'DRAFT, JUR-SEED-7. Same reasoning as the federal minors row: the slot exists, no value is seeded, and a draft row never resolves, so a minor scheduled in California produces a blocking warning rather than a silent pass.',
 (select none from _cite), null)
) as v;

-- ---------------------------------------------------------------- 5.3 NO-FORFEITURE STATES
insert into _c5_rules
select v.class_slug, v.jk, v.status, v.params::jsonb, '[]'::jsonb, v.basis,
       (select case when v.cite = 'cs3' then cs3 else none end from _cite), v.vdue::date
from (values
('pto-carryover-legality','US-CO','active', $p${"forfeiture_allowed":false,"cap_allowed":true}$p$,
 'Colorado is named in the research''s enumerated no-forfeiture list (CA, CO, MT, NE): use-it-or-lose-it is unlawful and only a cap is permitted. An enumerated list is a finding, not an inference, which is why this ships active.','cs3',null),
('pto-carryover-legality','US-MT','active', $p${"forfeiture_allowed":false,"cap_allowed":true}$p$,
 'Montana is named in the research''s enumerated no-forfeiture list (CA, CO, MT, NE).','cs3',null),
('pto-carryover-legality','US-NE','active', $p${"forfeiture_allowed":false,"cap_allowed":true}$p$,
 'Nebraska is named in the research''s enumerated no-forfeiture list (CA, CO, MT, NE).','cs3',null),
('pto-payout-at-termination','US-CO','advisory', $p${"required":true,"basis":"earned wages doctrine"}$p$,
 'ADVISORY, JUR-SEED-1. The no-forfeiture finding and the payout-at-termination finding are logically adjacent but the research states them SEPARATELY, and treats payout as a per-state boolean it does not enumerate. Inferring the payout obligation from the forfeiture ban is reasoning, not research, so it ships advisory -- and because this class produces money, an advisory row can flag a termination payout but can never compute one.','none','2026-11-26'),
('pto-payout-at-termination','US-MT','advisory', $p${"required":true,"basis":"earned wages doctrine"}$p$,
 'ADVISORY, JUR-SEED-1. Same inference as Colorado: adjacent to the no-forfeiture finding, not stated by it.','none','2026-11-26'),
('pto-payout-at-termination','US-NE','advisory', $p${"required":true,"basis":"earned wages doctrine"}$p$,
 'ADVISORY, JUR-SEED-1. Same inference as Colorado: adjacent to the no-forfeiture finding, not stated by it.','none','2026-11-26')
) as v(class_slug, jk, status, params, basis, cite, vdue);

-- ---------------------------------------------------------------- 5.5 FAIR WORKWEEK LOCALITIES
-- All eleven ship ADVISORY. fair-workweek has produces_money=true, so per section 1.3 an advisory
-- row FLAGS a late schedule change and CANNOT compute a predictability-pay amount. That is the
-- truthful product behaviour and is far better than a fabricated dollar figure.
insert into _c5_rules
select 'fair-workweek', v.jk, 'advisory',
 $p${"advance_notice_days":null,
     "covered_industries_naics":[],
     "covered_employer_size":{"employees_min":null,"locations_min":null,"measure":null},
     "predictability_pay":{"schedule":[],"employer_initiated_only":null,"employee_consent_waives":null},
     "good_faith_estimate_required":null,
     "right_to_rest_hours_between_shifts":null,
     "right_to_rest_premium":null,
     "access_to_hours_offer_required":null,
     "record_retention_years":null}$p$::jsonb,
 '[]'::jsonb,
 'ADVISORY, JUR-SEED-3, with EVERY parameter null. The program research gives only the range -- schedules posted 7 to 14 days in advance, late changes trigger predictability pay -- and no per-locality notice window, coverage threshold or premium schedule. The row exists so the scheduler can say "this change is within the notice window for ' || v.name || ' -- predictability pay may be owed; the amount is not yet configured for this jurisdiction" and raise a compliance exception. It cannot say a dollar figure, and the class schema constrains advance_notice_days to 7..14 so a verification pass cannot enter a value the research contradicts without also changing the schema.',
 (select none from _cite), date '2026-11-26'
from (values
 ('US-NY-NEW_YORK','New York City'), ('US-CA-SAN_FRANCISCO','San Francisco'),
 ('US-WA-SEATTLE','Seattle'), ('US-PA-PHILADELPHIA','Philadelphia'),
 ('US-IL-CHICAGO','Chicago'), ('US-CA-LOS_ANGELES','Los Angeles city'),
 ('US-CA-LOS_ANGELES_COUNTY','Los Angeles County'), ('US-CA-BERKELEY','Berkeley'),
 ('US-CA-EMERYVILLE','Emeryville'), ('US-IL-EVANSTON','Evanston'),
 ('US-OR','Oregon (statewide)')
) as v(jk, name);

-- ---------------------------------------------------------------- 5.5 PREEMPTION STATES
-- ACTIVE rather than advisory because the finding is a named, ENUMERATED list in the research and
-- its effect is RESTRICTIVE OF OUR OWN FLAGGING: a preemption row can only ever cause us to stop
-- warning about a local ordinance. It can never cause us to compute money.
insert into _c5_rules
select 'fair-workweek', v.jk, 'active',
 $p${"applies":false,"mode":"preempt_local","permits_local":false}$p$::jsonb, '[]'::jsonb,
 'One of the eleven states the research enumerates as preempting local predictive-scheduling ordinances. The preemption pass (section 2.4) removes every county and city fair-workweek candidate below this state BEFORE precedence runs, so a preempted city ordinance can never win a specificity contest. Michigan and Wisconsin have no seeded covered localities; their rows exist to block any future city row.',
 (select cs3 from _cite), null
from (values ('US-AL'),('US-AR'),('US-FL'),('US-GA'),('US-IN'),('US-IA'),('US-KS'),('US-MI'),
             ('US-OH'),('US-TN'),('US-WI')) as v(jk);

-- ---------------------------------------------------------------- 5.7 TRAINING MANDATES
insert into _c5_rules
select 'training-mandate', v.jk, 'advisory', v.params::jsonb, '[]'::jsonb, v.basis,
       (select ar2 from _cite), date '2026-11-26'
from (values
('US-NY', $p${"program":"harassment_prevention","supervisor_hours":null,"non_supervisor_hours":null,"cadence_months":12,"initial_due_within_months":null,"initial_trigger":["hire"],"employer_min_headcount":null,"_unverified":["supervisor_hours","non_supervisor_hours","initial_due_within_months","initial_trigger","employer_min_headcount"]}$p$,
 'ADVISORY, JUR-SEED-5. The research names New York and Illinois as ANNUAL harassment-prevention mandates and gives no hours and no initial trigger. training-mandate does not produce money, so an advisory row here is genuinely useful: the generator creates the annual assignment with the cadence it knows and flags the unverified hours ON the assignment, rather than generating nothing.'),
('US-IL', $p${"program":"harassment_prevention","supervisor_hours":null,"non_supervisor_hours":null,"cadence_months":12,"initial_due_within_months":null,"initial_trigger":["hire"],"employer_min_headcount":null,"_unverified":["supervisor_hours","non_supervisor_hours","initial_due_within_months","initial_trigger","employer_min_headcount"]}$p$,
 'ADVISORY, JUR-SEED-5. Illinois is the second of the two the research names as annual. Same behaviour as New York: annual assignment generated, hours flagged.'),
('US-CT', $p${"program":"harassment_prevention","supervisor_hours":null,"non_supervisor_hours":null,"cadence_months":null,"initial_due_within_months":null,"initial_trigger":[],"employer_min_headcount":null,"_unverified":["supervisor_hours","non_supervisor_hours","cadence_months","initial_due_within_months","employer_min_headcount"]}$p$,
 'ADVISORY, JUR-SEED-5, WITH A NULL CADENCE, WHICH MEANS NO ASSIGNMENT IS GENERATED. The research names Connecticut only in a list ("plus CT/DE/ME/WA") with no hours and no cadence. A null cadence generates nothing and instead raises ONE compliance exception telling the organization a mandate exists and is not yet configured -- which is honest, where inventing an annual cadence would be a fabricated legal obligation.'),
('US-DE', $p${"program":"harassment_prevention","supervisor_hours":null,"non_supervisor_hours":null,"cadence_months":null,"initial_due_within_months":null,"initial_trigger":[],"employer_min_headcount":null,"_unverified":["supervisor_hours","non_supervisor_hours","cadence_months","initial_due_within_months","employer_min_headcount"]}$p$,
 'ADVISORY, JUR-SEED-5, null cadence. Named only in the research''s CT/DE/ME/WA list. Raises one compliance exception; generates no assignment.'),
('US-ME', $p${"program":"harassment_prevention","supervisor_hours":null,"non_supervisor_hours":null,"cadence_months":null,"initial_due_within_months":null,"initial_trigger":[],"employer_min_headcount":null,"_unverified":["supervisor_hours","non_supervisor_hours","cadence_months","initial_due_within_months","employer_min_headcount"]}$p$,
 'ADVISORY, JUR-SEED-5, null cadence. Named only in the research''s CT/DE/ME/WA list. Raises one compliance exception; generates no assignment.'),
('US-WA', $p${"program":"harassment_prevention","supervisor_hours":null,"non_supervisor_hours":null,"cadence_months":null,"initial_due_within_months":null,"initial_trigger":[],"employer_min_headcount":null,"_unverified":["supervisor_hours","non_supervisor_hours","cadence_months","initial_due_within_months","employer_min_headcount"]}$p$,
 'ADVISORY, JUR-SEED-5, null cadence. Named only in the research''s CT/DE/ME/WA list. Raises one compliance exception; generates no assignment.')
) as v(jk, params, basis);

-- ---------------------------------------------------------------- THE INSERT
insert into hr.jurisdiction_rule (
  organization_id, visibility, rule_class_id, jurisdiction_key, effective_from, effective_to,
  applicability, parameters, status, basis, citation, verification_due, source_scope)
select '39c38960-d30c-4840-b0c1-c9960de95582'::uuid, 'public'::platform.visibility,
       rc.id, s.jurisdiction_key, date '1900-01-01', null,
       s.applicability,
       s.parameters,
       s.status, s.basis, s.citation, s.verification_due, 'statutory'
from _c5_rules s
join hr.jurisdiction_rule_class rc on rc.slug = s.class_slug
where not exists (
  select 1 from hr.jurisdiction_rule r
   where r.rule_class_id = rc.id
     and r.jurisdiction_key = s.jurisdiction_key
     and r.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'::uuid
     and coalesce(r.parameters->>'record_class','') = coalesce(s.parameters->>'record_class','')
     and r.deleted_at is null);

update hr.jurisdiction_rule
   set metadata = metadata || '{"effective_from_is_seed_floor": true}'::jsonb
 where organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'::uuid
   and effective_from = date '1900-01-01'
   and not (metadata ? 'effective_from_is_seed_floor');

-- ============================================================================
-- 4. ASSERTIONS -- this file refuses to commit unless section 5 landed exactly.
-- ============================================================================
do $$
declare v_n integer; v_bad integer; v_txt text;
begin
  select count(*) into v_n from hr.jurisdiction_rule
   where deleted_at is null and organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'::uuid;
  if v_n <> 69 then
    raise exception 'hr_c5_01: section 5 seeds exactly 69 rule rows, found %', v_n;
  end if;

  -- every advisory or draft row that section 5 marks unverified carries a verification_due,
  -- or it can never appear on platform.v_hr_jurisdiction_rule_overdue and the defect is invisible.
  select count(*) into v_bad
    from hr.jurisdiction_rule r
   where r.status = 'advisory' and r.verification_due is null and r.deleted_at is null
     and r.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'::uuid;
  if v_bad > 0 then
    raise exception 'hr_c5_01: % advisory rule(s) carry no verification_due -- section 5.9 requires one', v_bad;
  end if;

  -- 🚨 THE STRUCTURAL INVARIANT: an advisory rule can never produce money. Proven here as data
  -- (no advisory row exists on a produces_money class except fair-workweek, which section 5.5
  -- ships advisory ON PURPOSE precisely because section 1.3 stops it computing an amount).
  select count(*) into v_bad
    from hr.jurisdiction_rule r
    join hr.jurisdiction_rule_class rc on rc.id = r.rule_class_id
   where r.status = 'advisory' and rc.produces_money and rc.slug not in ('fair-workweek','pto-payout-at-termination')
     and r.deleted_at is null;
  if v_bad > 0 then
    raise exception 'hr_c5_01: % advisory row(s) on an unexpected produces_money class', v_bad;
  end if;

  -- every citation names a source and a confidence
  select count(*) into v_bad from hr.jurisdiction_rule
   where deleted_at is null and organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'::uuid
     and (citation->>'authority' is null or citation->>'confidence' is null);
  if v_bad > 0 then
    raise exception 'hr_c5_01: % rule row(s) carry no citation authority/confidence', v_bad;
  end if;

  -- every basis is a real sentence, not a placeholder
  select count(*) into v_bad from hr.jurisdiction_rule
   where deleted_at is null and organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'::uuid
     and length(basis) < 40;
  if v_bad > 0 then
    raise exception 'hr_c5_01: % rule row(s) carry a basis under 40 characters', v_bad;
  end if;

  select string_agg(distinct rc.slug, ', ') into v_txt
    from hr.jurisdiction_rule_class rc
   where not exists (select 1 from hr.jurisdiction_rule r where r.rule_class_id = rc.id and r.deleted_at is null);
  if v_txt is not null then
    raise exception 'hr_c5_01: rule class(es) with no seeded row at all: %', v_txt;
  end if;
end $$;

select set_config('hr.privileged_write', 'off', false);
