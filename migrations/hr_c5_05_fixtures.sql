-- HR domain, C5 / register item HRB-009, file 05 of 05 -- THE FIXTURE SET.
--
-- Authority: /projects/hr-domain/specs/SPEC-JURISDICTION.md section 6.2 IN FULL. Every fixture
-- below is one row of section 6.2's tables, transcribed. The `expected` column carries what that
-- row's Expected column states, expressed against the engine's actual output shape.
--
-- ASSERTION SEMANTICS: hr.run_rule_fixtures compares with jsonb containment -- the fixture names
-- the keys it cares about and the engine may return more. That is why several fixtures also
-- assert a COUNT (premium_count, assignment_count, violation_count): containment can never prove
-- an array is EMPTY, because [] is contained in every array. A fixture that only said
-- "premiums": [] would pass against a result that produced two premiums.
--
-- `expected_status = 'pending_verification'` marks a fixture whose EXPECTED VALUES depend on a
-- seed section 5 flags unverified. Section 6.1: the fixture ships anyway -- its shape and inputs
-- are correct and reviewed -- and flips to `asserted` in the same commit that promotes its rule.
-- It is not a failing test; it is a passing test whose expectation is provisional. The promotion
-- gate reads exactly this column.
--
-- Idempotent. Applied live as migration `hr_c5_05_fixtures`.

set local lock_timeout = '20s';

select set_config('hr.privileged_write', 'on', false);

create temporary table _c5_fx (
  code text, cls text, jk text, as_of date, title text,
  facts jsonb, input jsonb, expected jsonb, expected_status text, assertion_mode text
) on commit drop;

-- ---------------------------------------------------------------- OVERTIME / DOUBLE-TIME
insert into _c5_fx values
('OT-FED-01','overtime','US-TX', date '2026-03-16',
 'US-TX, non-exempt, 45 hours in one workweek, no day over 8',
 '{"flsa_status":"non_exempt","worker_class":"employee"}',
 $i${"harness":"calc","kind":"overtime","workdays":[{"hours":8},{"hours":8},{"hours":8},{"hours":8},{"hours":8},{"hours":5}]}$i$,
 '{"hours":{"regular":40,"ot_1_5":5,"dt_2_0":0}}','asserted','exact'),

('OT-FED-02','overtime','US-TX', date '2026-03-16',
 'US-TX, a single 13-hour day, 38 hours in the week -- a long day creates no federal obligation',
 '{"flsa_status":"non_exempt","worker_class":"employee"}',
 $i${"harness":"calc","kind":"overtime","workdays":[{"hours":13},{"hours":8},{"hours":8},{"hours":9}]}$i$,
 '{"hours":{"regular":38,"ot_1_5":0,"dt_2_0":0}}','asserted','exact'),

('OT-CA-01','overtime','US-CA', date '2026-03-16',
 'US-CA, one 13-hour day',
 '{"flsa_status":"non_exempt","worker_class":"employee"}',
 $i${"harness":"calc","kind":"overtime","workdays":[{"hours":13,"consecutive_day_index":1}],"regular_rate":25}$i$,
 '{"hours":{"regular":8,"ot_1_5":4,"dt_2_0":1}}','asserted','exact'),

('OT-CA-02','overtime','US-CA', date '2026-03-16',
 'US-CA, 7th consecutive day in the workweek, 10 hours -- zero hours at straight time',
 '{"flsa_status":"non_exempt","worker_class":"employee"}',
 $i${"harness":"calc","kind":"overtime","workdays":[{"hours":10,"consecutive_day_index":7}]}$i$,
 '{"hours":{"regular":0,"ot_1_5":8,"dt_2_0":2}}','asserted','exact'),

('OT-CA-03','overtime','US-CA', date '2026-03-16',
 'US-CA, EXEMPT employee, 13-hour day -- no OT, no DT, and the trace says why',
 '{"flsa_status":"exempt","worker_class":"employee"}',
 $i${"harness":"calc","kind":"overtime","workdays":[{"hours":13,"consecutive_day_index":1}]}$i$,
 '{"hours":{"regular":13,"ot_1_5":0,"dt_2_0":0},"no_rule":["overtime","double-time"]}','asserted','exact'),

('OT-CA-04','overtime','US-CA', date '2026-03-16',
 'US-CA, four 10-hour days = 40 hours -- 8 daily OT and NO additional weekly OT (no pyramiding)',
 '{"flsa_status":"non_exempt","worker_class":"employee"}',
 $i${"harness":"calc","kind":"overtime","workdays":[{"hours":10,"consecutive_day_index":1},{"hours":10,"consecutive_day_index":2},{"hours":10,"consecutive_day_index":3},{"hours":10,"consecutive_day_index":4}]}$i$,
 '{"hours":{"regular":32,"ot_1_5":8,"dt_2_0":0}}','pending_verification','exact'),

('OT-CA-05','overtime','US-CA', date '2026-03-16',
 'US-CA, a 10-hour shift 20:00-06:00 split at the workday boundary -- daily OT is evaluated PER WORKDAY, not per shift',
 '{"flsa_status":"non_exempt","worker_class":"employee"}',
 $i${"harness":"calc","kind":"overtime","workday_start_local":"00:00","workdays":[{"date":"2026-03-16","hours":4},{"date":"2026-03-17","hours":6}]}$i$,
 '{"hours":{"regular":10,"ot_1_5":0,"dt_2_0":0},"total_hours":10}','pending_verification','exact'),

('OT-MULTI-01','overtime','US-TX', date '2026-03-16',
 'Two concurrent positions at different rates, 46 hours -- OT on the WEIGHTED-AVERAGE regular rate',
 '{"flsa_status":"non_exempt","worker_class":"employee"}',
 $i${"harness":"calc","kind":"overtime","positions":[{"hours":30,"rate":20},{"hours":16,"rate":30}],
     "workdays":[{"hours":8},{"hours":8},{"hours":8},{"hours":8},{"hours":8},{"hours":6}]}$i$,
 '{"regular_rate":23.4783,"hours":{"regular":40,"ot_1_5":6}}','asserted','exact'),

('OT-BOUND-01','overtime','US-TX', date '2026-03-29',
 'Semimonthly boundary week -- OT computed on the WHOLE workweek and attributed to the period containing the workweek END date',
 '{"flsa_status":"non_exempt","worker_class":"employee"}',
 $i${"harness":"calc","kind":"overtime",
     "workdays":[{"date":"2026-03-29","hours":8},{"date":"2026-03-30","hours":8},{"date":"2026-03-31","hours":4},
                 {"date":"2026-04-01","hours":8},{"date":"2026-04-02","hours":8},{"date":"2026-04-03","hours":8},
                 {"date":"2026-04-04","hours":2}],
     "workweek_end_date":"2026-04-04",
     "pay_periods":[{"key":"mar-16-eom","from":"2026-03-16","to":"2026-03-31"},
                    {"key":"apr-1-15","from":"2026-04-01","to":"2026-04-15"}]}$i$,
 '{"hours":{"regular":40,"ot_1_5":6},"attributed_pay_period_key":"apr-1-15"}','asserted','exact'),

('OT-DST-01','overtime','US-CA', date '2026-03-07',
 'DST spring-forward night shift 22:00-06:00 -- 7 elapsed hours, not 8',
 '{}',
 $i${"harness":"elapsed","start_local":"2026-03-07 22:00","end_local":"2026-03-08 06:00","tz":"America/Los_Angeles"}$i$,
 '{"elapsed_hours":7}','asserted','exact'),

('OT-DST-02','overtime','US-CA', date '2026-10-31',
 'DST fall-back night shift 22:00-06:00 -- 9 elapsed hours',
 '{}',
 $i${"harness":"elapsed","start_local":"2026-10-31 22:00","end_local":"2026-11-01 06:00","tz":"America/Los_Angeles"}$i$,
 '{"elapsed_hours":9}','asserted','exact'),

('OT-JUR-01','overtime','US-CA', date '2026-03-16',
 'Employee moves CA to TX mid-year; a March workweek recomputed in October resolves the STAMPED key and refuses a disagreeing caller (AR 1.4)',
 '{}', $i${"harness":"probe","probe":"jurisdiction_mismatch"}$i$,
 '{"refused":true,"error":"jurisdiction_key_mismatch","stamped_key_used":"US-CA"}','asserted','exact');

-- ---------------------------------------------------------------- BREAKS AND PREMIUMS
insert into _c5_fx values
('MB-CA-01','break-premium','US-CA', date '2026-03-16',
 'US-CA, 6-hour shift, no meal punch before the end of hour 5 -- one hour of meal premium at the regular rate',
 '{}',
 $i${"harness":"calc","kind":"break-premium","shift_hours":6,"meal_taken":false,"regular_rate":25}$i$,
 '{"premium_count":1,"premiums":[{"code":"meal_premium","hours":1,"amount":25.00,"rate_basis":"regular_rate"}]}',
 'asserted','exact'),

('MB-CA-02','break-premium','US-CA', date '2026-03-16',
 'US-CA, 6-hour shift, compliant 30-minute unpaid meal taken at hour 4 -- no premium',
 '{}',
 $i${"harness":"calc","kind":"break-premium","shift_hours":6,"meal_taken":true,"meal_start_hour":4,"meal_minutes":30,"regular_rate":25}$i$,
 '{"premium_count":0}','asserted','exact'),

('MB-CA-03','break-premium','US-CA', date '2026-03-16',
 'US-CA, employee works THROUGH the meal break -- the minutes count as hours worked AND the premium is still owed',
 '{}',
 $i${"harness":"calc","kind":"break-premium","shift_hours":6,"meal_taken":false,"worked_through_meal":true,"meal_minutes":30,"regular_rate":25}$i$,
 '{"premium_count":1,"hours_worked":6,"meal_minutes_count_as_worked":true,"premiums":[{"code":"meal_premium","hours":1}]}',
 'asserted','exact'),

('RB-CA-01','break-premium','US-CA', date '2026-03-16',
 'US-CA, 8-hour shift, TWO rest breaks missed -- ONE rest premium (per-day cap 1)',
 '{}',
 $i${"harness":"calc","kind":"break-premium","shift_hours":8,"meal_taken":true,"meal_start_hour":4,"meal_minutes":30,"rest_breaks_missed":2,"regular_rate":25}$i$,
 '{"premium_count":1,"premiums":[{"code":"rest_premium","hours":1,"amount":25.00}]}','asserted','exact'),

('RB-CA-02','break-premium','US-CA', date '2026-03-16',
 'US-CA, meal premium and rest premium both owed the same day -- two separate lines, two earning codes, NOT merged',
 '{}',
 $i${"harness":"calc","kind":"break-premium","shift_hours":8,"meal_taken":false,"rest_breaks_missed":1,"regular_rate":25}$i$,
 '{"premium_count":2,"premiums":[{"code":"meal_premium","hours":1},{"code":"rest_premium","hours":1}]}',
 'asserted','exact'),

('MB-FED-01','break-premium','US-TX', date '2026-03-16',
 'US-TX, no meal break in a 10-hour shift -- no premium, no violation, and the trace records the federal rule as not_applicable',
 '{}',
 $i${"harness":"calc","kind":"break-premium","shift_hours":10,"meal_taken":false,"regular_rate":25}$i$,
 '{"premium_count":0,"no_rule":["meal-break","rest-break","break-premium"]}','asserted','exact');

-- ---------------------------------------------------------------- ROUNDING
insert into _c5_fx values
('RND-01','rounding-bounds','US', date '2026-03-16',
 '1,000 uniformly-distributed punch pairs at 15-minute nearest rounding -- bounded error and no systematic negative bias',
 '{}',
 $i${"harness":"calc","kind":"rounding","n":1000,"increment_minutes":15}$i$,
 '{"within_tolerance":true,"biased_negative":false}','asserted','property'),

('RND-02','rounding-bounds','US-TX', date '2026-03-16',
 'An organization configures mode=down -- REJECTED by the neutrality predicate with the human-readable sentence',
 '{}',
 $i${"harness":"config","jurisdiction_keys":["US-TX"],"parameters":{"mode":"down","increment_minutes":15}}$i$,
 $e${"ok":false,"violation_count":1,"violations":[{"code":"rounding_mode_not_neutral","field":"mode",
     "message":"Rounding must not systematically favour the employer. \"down\" always moves time in one direction, so it fails that test. Use \"nearest\", which rounds up and down equally."}]}$e$,
 'asserted','exact'),

('RND-03','rounding-bounds','US-TX', date '2026-03-16',
 'An organization configures increment_minutes=30 under the federal 15-minute bound -- REJECTED, naming the bound and the rule id',
 '{}',
 $i${"harness":"config","jurisdiction_keys":["US-TX"],"parameters":{"mode":"nearest","increment_minutes":30}}$i$,
 $e${"ok":false,"violation_count":1,"violations":[{"code":"increment_exceeds_bound","field":"increment_minutes",
     "required":{"max_increment_minutes":15}}]}$e$,'asserted','exact'),

('RND-04','rounding-bounds','US-CA', date '2026-03-16',
 'A US-CA organization configures rounding while the CALIFORNIA bound is advisory -- WARNING, not a rejection (section 3.2 rule 5)',
 '{}',
 $i${"harness":"config","jurisdiction_keys":["US-CA"],"parameters":{"mode":"nearest","increment_minutes":10}}$i$,
 '{"ok":true,"violation_count":0,"warning_count":1,"warnings":[{"code":"increment_exceeds_unverified_bound"}]}',
 'asserted','exact');

-- ---------------------------------------------------------------- LEAVE
insert into _c5_fx values
('SL-CA-01','sick-leave-floor','US-CA', date '2026-03-31',
 'US-CA, 173 hours worked in a month -- 5.7666... accrued, stored at full decimal precision',
 '{}', $i${"harness":"calc","kind":"sick-leave-accrual","hours_worked":173}$i$,
 '{"accrued_hours":5.7667}','asserted','exact'),

('SL-CA-02','sick-leave-floor','US-CA', date '2026-03-16',
 'US-CA, day 45 of employment -- the balance HAS accrued since day 1, but USE is refused until day 90',
 '{}', $i${"harness":"calc","kind":"sick-leave-accrual","hours_worked":300,"days_since_hire":45,"requested_hours":4}$i$,
 '{"accrued_hours":10.0000,"use_permitted":false,"refusal_reason":"use_permitted_after_days","accrual_began":"day_1"}',
 'asserted','exact'),

('SL-CA-03','sick-leave-floor','US-CA', date '2026-03-16',
 'US-CA, terminated and rehired 8 months later -- the unused statutory balance is reinstated ONTO THE SECOND SPELL',
 '{}', $i${"harness":"calc","kind":"sick-leave-accrual","months_since_termination":8,"unused_balance":12}$i$,
 '{"reinstated":true,"balance":12,"reinstated_onto":"second_employment_spell"}','asserted','exact'),

('SL-CA-04','sick-leave-floor','US-CA', date '2026-03-16',
 'US-CA, rehired 14 months later -- not reinstated',
 '{}', $i${"harness":"calc","kind":"sick-leave-accrual","months_since_termination":14,"unused_balance":12}$i$,
 '{"reinstated":false,"balance":0}','asserted','exact'),

('PTO-CA-01','pto-carryover-legality','US-CA', date '2026-03-16',
 'An organization configures use-it-or-lose-it while operating in California -- REJECTED with the section 3.2 sentence verbatim',
 '{}',
 $i${"harness":"config","jurisdiction_keys":["US-CA"],"parameters":{"carryover_policy":"forfeit"}}$i$,
 $e${"ok":false,"violation_count":1,"violations":[{"code":"forfeiture_unlawful","field":"carryover_policy",
     "jurisdiction_key":"US-CA","configured":"forfeit","affected_employees":0,
     "message":"California does not allow a use-it-or-lose-it vacation policy — accrued vacation is earned wages that cannot be forfeited. You can cap how much an employee accrues (accrual stops at the cap until they use time), but unused time cannot expire. Set a cap instead of forfeiture."}]}$e$,
 'asserted','exact'),

('PTO-CA-02','pto-carryover-legality','US-CA', date '2026-03-16',
 'An organization configures a 1.5x accrual cap in California -- ACCEPTED, because a cap is lawful where forfeiture is not',
 '{}',
 $i${"harness":"config","jurisdiction_keys":["US-CA"],"parameters":{"carryover_policy":"cap","accrual_cap_multiplier":1.5}}$i$,
 '{"ok":true,"violation_count":0}','asserted','exact'),

('PTO-TX-01','pto-carryover-legality','US-TX', date '2026-03-16',
 'An organization operating only in Texas configures use-it-or-lose-it -- ACCEPTED; no rule forbids it',
 '{}',
 $i${"harness":"config","jurisdiction_keys":["US-TX"],"parameters":{"carryover_policy":"forfeit"}}$i$,
 '{"ok":true,"violation_count":0}','asserted','exact'),

('PTO-MOVE-01','pto-carryover-legality','US-CA', date '2026-03-16',
 'The Texas organization opens a California establishment -- the hire-time re-validation raises the violation BEFORE the first CA employee accrues',
 '{}',
 $i${"harness":"config","jurisdiction_keys":["US-TX","US-CA"],"parameters":{"carryover_policy":"forfeit"}}$i$,
 '{"ok":false,"violation_count":1,"violations":[{"jurisdiction_key":"US-CA","code":"forfeiture_unlawful"}]}',
 'asserted','exact'),

('PAY-CA-01','pto-payout-at-termination','US-CA', date '2026-03-16',
 'CA termination, 40 accrued vacation hours, final rate $25 -- $1,000 payout citing the CA rule',
 '{}', $i${"harness":"calc","kind":"termination-payout","accrued_hours":40,"final_rate":25}$i$,
 '{"statutory_required":true,"payout_amount":1000.00,"rate_basis":"final_rate"}','asserted','exact'),

('PAY-TX-01','pto-payout-at-termination','US-TX', date '2026-03-16',
 'TX termination, 40 accrued hours, org policy silent -- $0, and the snapshot records that we CHECKED',
 '{}', $i${"harness":"calc","kind":"termination-payout","accrued_hours":40,"final_rate":25}$i$,
 '{"statutory_required":false,"payout_amount":0,"basis":"no statutory payout obligation; org policy governs"}',
 'asserted','exact');

-- ------------------------------- FINAL PAY, RETENTION, NEW HIRE, TRAINING, FAIR WORKWEEK, MINORS
insert into _c5_fx values
('FP-CA-01','final-pay-deadline','US-CA', date '2026-03-20',
 'CA involuntary termination Friday 14:00 -- final pay due IMMEDIATELY, at the termination timestamp',
 '{}',
 $i${"harness":"calc","kind":"final-pay-deadline","termination_type":"involuntary","termination_at":"2026-03-20T14:00:00-07:00"}$i$,
 '{"confident":true,"deadline_basis":"immediately","deadline_offset_hours":0}','asserted','exact'),

('FP-CA-02','final-pay-deadline','US-CA', date '2026-03-20',
 'CA voluntary quit without notice Friday 14:00 -- due Monday 14:00 (+72 hours)',
 '{}',
 $i${"harness":"calc","kind":"final-pay-deadline","termination_type":"voluntary_no_notice","termination_at":"2026-03-20T14:00:00-07:00"}$i$,
 '{"confident":true,"deadline_offset_hours":72}','asserted','exact'),

('FP-XX-01','final-pay-deadline','US-NV', date '2026-03-20',
 'Termination in a state whose row is still advisory -- the federal fallback shows WITH the unverified banner and NO confident date',
 '{}',
 $i${"harness":"calc","kind":"final-pay-deadline","termination_type":"involuntary","termination_at":"2026-03-20T14:00:00-07:00"}$i$,
 '{"confident":false,"banner":"unverified_jurisdiction","deadline_at":null,"fallback_deadline":"next_regular_payday"}',
 'asserted','exact'),

('RET-I9-01','retention-period','US', date '2024-03-01',
 'Hired 2024-03-01, terminated 2024-06-01 -- I-9 destruction eligible 2027-03-01 (later of hire+3y and term+1y)',
 '{}',
 $i${"harness":"calc","kind":"retention-due","record_class":"i9","hire_date":"2024-03-01","termination_date":"2024-06-01"}$i$,
 '{"due_date":"2027-03-01","rule":"later_of","storage":"separate_from_personnel_file"}','asserted','exact'),

('RET-I9-02','retention-period','US', date '2018-01-01',
 'Hired 2018-01-01, terminated 2024-06-01 -- eligible 2025-06-01, because term+1y is later',
 '{}',
 $i${"harness":"calc","kind":"retention-due","record_class":"i9","hire_date":"2018-01-01","termination_date":"2024-06-01"}$i$,
 '{"due_date":"2025-06-01","rule":"later_of"}','asserted','exact'),

('RET-HOLD-01','retention-period','US', date '2020-01-01',
 'Retention clock expired, legal hold present -- disposition REFUSED and the hold is named',
 '{}',
 $i${"harness":"calc","kind":"retention-due","record_class":"time_records","record_created":"2020-01-01","legal_hold":true,"legal_hold_ref":"LH-PROBE-1"}$i$,
 '{"disposition_permitted":false,"refusal_reason":"legal_hold","legal_hold_ref":"LH-PROBE-1"}','asserted','exact'),

('RET-SHORT-01','retention-period','US', date '2024-01-01',
 'A retention rule shortened -- the existing LONGER clock stands (section 4.6 ratchet); no destruction authorized',
 '{}',
 $i${"harness":"calc","kind":"retention-due","record_class":"time_records","record_created":"2024-01-01","existing_due":"2030-01-01"}$i$,
 '{"disposition_permitted":false,"refusal_reason":"retention_ratchet","effective_due_date":"2030-01-01"}','asserted','exact'),

('NHR-01','new-hire-report-deadline','US', date '2026-04-01',
 'Hire date 2026-04-01 -- new-hire report due 2026-04-21 (20 calendar days)',
 '{}', $i${"harness":"calc","kind":"new-hire-report-due","hire_date":"2026-04-01"}$i$,
 '{"due_date":"2026-04-21","day_type":"calendar","confident":false}','pending_verification','exact'),

('TR-CA-01','training-mandate','US-CA', date '2026-03-01',
 'Non-supervisor hired US-CA 2026-03-01 -- a 1-hour harassment-prevention assignment due 2026-09-01, next due 2028-09-01',
 '{"is_supervisor":false}',
 $i${"harness":"calc","kind":"training-mandate-generation","event":"hire","event_date":"2026-03-01"}$i$,
 '{"assignment_count":1,"exception_count":0,"assignments":[{"jurisdiction_key":"US-CA","hours":1,"due_date":"2026-09-01","next_due_date":"2028-09-01","cadence_months":24}]}',
 'asserted','exact'),

('TR-CA-02','training-mandate','US-CA', date '2027-01-15',
 'The same person PROMOTED TO SUPERVISOR 2027-01-15 -- a new 2-hour assignment due 2027-07-15; the biennial clock restarts from the promotion',
 '{"is_supervisor":true}',
 $i${"harness":"calc","kind":"training-mandate-generation","event":"promotion_to_supervisor","event_date":"2027-01-15"}$i$,
 '{"assignment_count":1,"assignments":[{"jurisdiction_key":"US-CA","hours":2,"due_date":"2027-07-15","next_due_date":"2029-07-15"}]}',
 'asserted','exact'),

('TR-NY-01','training-mandate','US-NY', date '2026-03-01',
 'Employee in US-NY while the NY row is advisory with cadence 12 -- the ANNUAL assignment is generated and the hours are flagged unverified',
 '{"is_supervisor":false}',
 $i${"harness":"calc","kind":"training-mandate-generation","event":"hire","event_date":"2026-03-01"}$i$,
 '{"assignment_count":1,"exception_count":0,"assignments":[{"jurisdiction_key":"US-NY","cadence_months":12,"hours":null,"hours_unverified":true,"due_date":"2027-03-01"}]}',
 'asserted','exact'),

('TR-CT-01','training-mandate','US-CT', date '2026-03-01',
 'Employee in US-CT, row advisory with a NULL cadence -- NO assignment, and one compliance exception naming the jurisdiction',
 '{"is_supervisor":false}',
 $i${"harness":"calc","kind":"training-mandate-generation","event":"hire","event_date":"2026-03-01"}$i$,
 '{"assignment_count":0,"exception_count":1,"compliance_exceptions":[{"code":"training_mandate_unconfigured","jurisdiction_key":"US-CT"}]}',
 'asserted','exact'),

('FW-CHI-01','fair-workweek','US-IL-CHICAGO', date '2026-03-16',
 'Chicago establishment, a published shift changed 3 days out -- the ordinance resolves (IL is not a preemption state), the change is FLAGGED, and predictability pay is NOT computed',
 '{}', $i${"harness":"calc","kind":"predictability-pay","days_notice":3}$i$,
 '{"covered":true,"change_flagged":true,"predictability_pay_amount":null,"ordinance_jurisdiction":"US-IL-CHICAGO","money_withheld":true}',
 'asserted','exact'),

('FW-PRE-01','fair-workweek','US-MI', date '2026-03-16',
 'A hypothetical Michigan city fair-workweek row -- REMOVED by the preemption pass, with the Michigan rule named in the trace',
 '{}', $i${"harness":"probe","probe":"preemption"}$i$,
 '{"preempted":true,"city_outcome":"preempted","reason_names_state_rule":true}','asserted','exact'),

('FW-LA-01','fair-workweek','US-CA-LOS_ANGELES', date '2026-03-16',
 'Los Angeles CITY establishment -- the chain reaches city and county; most_specific selects the city rule and records the county rule as less_specific',
 '{}', $i${"harness":"resolve","classes":["fair-workweek"]}$i$,
 '{"chain_length":4,"outcomes":{"US-CA-LOS_ANGELES":"applied","US-CA-LOS_ANGELES_COUNTY":"less_specific"}}',
 'asserted','exact'),

('MIN-01','minors-hours','US-CA', date '2026-03-16',
 'A 16-year-old scheduled with no minors rule seeded -- the scheduler raises a BLOCKING warning, never a silent pass',
 '{"worker_age_years":16}',
 $i${"harness":"calc","kind":"minors-restriction-check"}$i$,
 '{"blocking_warning":true,"reason":"no_minors_rule_seeded"}','asserted','exact');

-- ---------------------------------------------------------------- I-9
insert into _c5_fx values
('I9-FED-01','i9-section2-deadline','US', date '2026-04-06',
 'Hire date Monday 2026-04-06 -- Section 1 due that Monday, Section 2 due Thursday 2026-04-09',
 '{"worker_class":"employee"}',
 $i${"harness":"calc","kind":"i9-section2-due","hire_date":"2026-04-06"}$i$,
 '{"applies":true,"section1_due_date":"2026-04-06","section2_due_date":"2026-04-09","section2_day_type":"business"}',
 'pending_verification','exact'),

('I9-FED-02','i9-section2-deadline','US', date '2026-04-09',
 'Hire date Thursday 2026-04-09 with a weekend intervening -- Section 2 due Tuesday 2026-04-14 (BUSINESS days, never calendar)',
 '{"worker_class":"employee"}',
 $i${"harness":"calc","kind":"i9-section2-due","hire_date":"2026-04-09"}$i$,
 '{"section2_due_date":"2026-04-14"}','asserted','exact'),

('I9-FED-03','i9-section2-deadline','US', date '2026-04-09',
 'A FEDERAL holiday inside the Section 2 window extends it -- and the employer''s own closure does NOT',
 '{"worker_class":"employee"}',
 $i${"harness":"calc","kind":"i9-section2-due","hire_date":"2026-04-09","federal_holidays":["2026-04-10"],"org_holidays":["2026-04-13"]}$i$,
 '{"section2_due_date":"2026-04-15","org_holiday_calendar_consulted":false,"business_day_calendar":"federal"}',
 'pending_verification','exact'),

('I9-FED-04','i9-section2-deadline','US', date '2026-04-06',
 'A contractor engagement -- no I-9 obligation; the rule''s applicability excludes them and the trace says so (D8)',
 '{"worker_class":"contractor"}',
 $i${"harness":"calc","kind":"i9-section2-due","hire_date":"2026-04-06"}$i$,
 '{"applies":false,"no_rule":["i9-section2-deadline"]}','asserted','exact'),

('I9-RH-01','i9-section2-deadline','US', date '2026-04-06',
 'Terminated and rehired 14 months later -- the rehire-reuse window is unverified, so Supplement-B reuse is FLAGGED, not asserted, against the SECOND spell',
 '{"worker_class":"employee"}',
 $i${"harness":"calc","kind":"i9-section2-due","hire_date":"2026-04-06","rehire":true,"months_since_termination":14}$i$,
 '{"rehire_flagged":true,"rehire_reuse_eligible":null,"checked_against":"second_employment_spell"}','asserted','exact'),

('I9-RCPT-01','i9-section2-deadline','US', date '2026-04-06',
 'A receipt recorded for a lost document -- the replacement deadline is FLAGGED, not computed',
 '{"worker_class":"employee"}',
 $i${"harness":"calc","kind":"i9-section2-due","hire_date":"2026-04-06","receipt_recorded":true}$i$,
 '{"receipt_flagged":true,"receipt_replacement_due_date":null}','asserted','exact'),

('I9-SNAP-01','i9-section2-deadline','US', date '2026-04-06',
 'A computed Section 2 due date writes a snapshot citing rule id + version, and a later amendment leaves it untouched',
 '{}', $i${"harness":"probe","probe":"snapshot_i9"}$i$,
 '{"snapshot_written":true,"cites_rule_id":true,"cited_version_unchanged":true,"section2_due_unchanged":true}',
 'asserted','exact');

-- ---------------------------------------------------------------- RESOLUTION MECHANICS
insert into _c5_fx values
('RES-01','overtime','US-CA-LOS_ANGELES', date '2026-03-16',
 'Resolve US-CA-LOS_ANGELES for ALL 16 classes -- a chain of 4, and every class returns resolved, advisory, incomplete or no_rule. Never an empty response.',
 '{"flsa_status":"non_exempt","worker_class":"employee","worker_age_years":30}',
 $i${"harness":"resolve","classes":["overtime","double-time","meal-break","rest-break","break-premium",
     "rounding-bounds","sick-leave-floor","pto-carryover-legality","pto-payout-at-termination",
     "final-pay-deadline","fair-workweek","minors-hours","training-mandate","retention-period",
     "new-hire-report-deadline","i9-section2-deadline"]}$i$,
 '{"chain_length":4,"classes_accounted":16}','asserted','exact'),

('RES-02','training-mandate','US-CA', date '2026-03-16',
 'A rule''s applicability names employer_fte_avg_prior_year and the caller omits it -- it lands in incomplete[] and is NEVER silently treated as unmet',
 '{}', $i${"harness":"probe","probe":"missing_fact"}$i$,
 '{"raised_under_fail":true,"named_fact":true,"incomplete_under_flag":true,"silently_unmet":false}','asserted','exact'),

('RES-03','sick-leave-floor','US-CA', date '2026-03-16',
 'An org override MORE generous than the California floor -- the org row is applied and the system row is recorded overridden_by_org',
 '{}', $i${"harness":"probe","probe":"org_override_more_generous"}$i$,
 '{"org_rule_applied":true,"system_row_outcome":"overridden_by_org","clamp_count":0,"applied_per_hours_worked":20}',
 'asserted','exact'),

('RES-04','sick-leave-floor','US-CA', date '2026-03-16',
 'An org override LESS generous (the rule was amended after the config was written) -- CLAMPED to the statutory value, clamps[] populated, compliance exception raised',
 '{}', $i${"harness":"probe","probe":"org_override_clamped"}$i$,
 '{"clamp_count":1,"applied_per_hours_worked":30,"snapshot_clamps_recorded":1,"compliance_exception_raised":true}',
 'asserted','exact'),

('RES-05','training-mandate','US-NV', date '2026-06-15',
 'A rule amended effective 2026-07-01 -- a 2026-06-15 work date still resolves the OLD row, byte-identically, from its retained version',
 '{}', $i${"harness":"probe","probe":"amendment_as_of"}$i$,
 '{"before_amendment_cadence":12,"after_amendment_cadence":24,"old_row_retained":true}','asserted','exact'),

('SNAP-01','overtime','US-CA', date '2026-03-16',
 'An OT result, then the rule is CORRECTED -- the original snapshot is untouched, affected snapshots are enumerated, a proposed batch is opened, and nothing is superseded without approval',
 '{}', $i${"harness":"probe","probe":"snapshot_correction"}$i$,
 '{"affected_snapshots_found":1,"batch_state":"proposed","nothing_superseded":true,"original_outputs_untouched":true}',
 'asserted','exact'),

('SNAP-02','overtime','US-CA', date '2026-03-16',
 'Recompute inside an OPEN pay period -- a new snapshot with supersedes_id; the old one is retained and unchanged',
 '{}', $i${"harness":"probe","probe":"snapshot_supersede"}$i$,
 '{"old_retained":true,"old_superseded_by_new":true,"old_outputs_unchanged":true,"new_supersedes":true}',
 'asserted','exact'),

('SNAP-03','overtime','US-CA', date '2026-03-16',
 'Recompute AFTER export/lock -- the in-place recompute is refused and the correction becomes an adjustment tagged to the original period, with its own snapshot',
 '{}', $i${"harness":"probe","probe":"snapshot_locked"}$i$,
 '{"in_place_refused":true,"adjustment_written":true,"adjustment_tagged_to_original_period":true,"original_unchanged":true}',
 'asserted','exact'),

('SNAP-04','overtime','US-CA', date '2026-03-16',
 'Any UPDATE on a snapshot other than superseded_by_id NULL-to-value raises -- and so does a DELETE',
 '{}', $i${"harness":"probe","probe":"snapshot_immutable"}$i$,
 '{"raised":true,"delete_raised":true}','asserted','exact');

-- ---------------------------------------------------------------- THE INSERT
insert into hr.jurisdiction_rule_test (
  organization_id, rule_class_id, code, title, jurisdiction_key, as_of_date,
  facts, input, expected, expected_status, assertion_mode)
select '39c38960-d30c-4840-b0c1-c9960de95582'::uuid, rc.id, f.code, f.title, f.jk, f.as_of,
       f.facts, f.input, f.expected, f.expected_status, f.assertion_mode
from _c5_fx f
join hr.jurisdiction_rule_class rc on rc.slug = f.cls
where not exists (select 1 from hr.jurisdiction_rule_test t where t.code = f.code);

-- ============================================================================
-- ASSERTIONS -- 🚨 THE BLOCKING GATE. This migration does not commit on a red suite.
-- ============================================================================
do $$
declare v_n integer; v_run jsonb; v_red text;
begin
  select count(*) into v_n from hr.jurisdiction_rule_test where deleted_at is null;
  if v_n <> 64 then
    raise exception 'hr_c5_05: expected 64 section 6.2 fixtures, found %', v_n;
  end if;

  v_run := hr.run_rule_fixtures();

  if (v_run->>'green')::boolean is not true then
    select string_agg(format('%s: %s', r->>'code',
                             coalesce(r->>'error', 'expected ' || (r->>'expected') || ' got ' || (r->>'actual'))),
                      E'\n  ' order by r->>'code')
      into v_red from jsonb_array_elements(v_run->'results') r where (r->>'passed')::boolean is false;
    raise exception E'hr_c5_05: THE FIXTURE SUITE IS RED (% of % failed):\n  %',
      v_run->>'failed', v_run->>'total', v_red;
  end if;

  raise notice 'hr_c5_05: fixture suite GREEN -- %/% passed, % pending_verification',
    v_run->>'passed', v_run->>'total', v_run->>'pending_verification';
end $$;

-- ============================================================================
-- The promotion gate, proven live: a rule whose class+jurisdiction still has a
-- pending_verification fixture cannot be promoted advisory -> active.
-- ============================================================================
do $$
declare v_rule uuid; v_blocked boolean := false;
begin
  perform set_config('hr.privileged_write','on', true);
  -- US new-hire-report-deadline is advisory and NHR-01 (its class, its jurisdiction) is pending.
  select r.id into v_rule from hr.jurisdiction_rule r
    join hr.jurisdiction_rule_class rc on rc.id = r.rule_class_id
   where rc.slug = 'new-hire-report-deadline' and r.jurisdiction_key = 'US' and r.status = 'advisory';
  begin
    update hr.jurisdiction_rule set status = 'active' where id = v_rule;
  exception when others then
    v_blocked := sqlerrm like 'rule_promotion_blocked%';
  end;
  if not v_blocked then
    raise exception 'hr_c5_05: the section 6.1 promotion gate did not block a rule with a pending fixture';
  end if;
  raise notice 'hr_c5_05: promotion gate proven -- an advisory rule with a pending fixture cannot go active';
end $$;

select set_config('hr.privileged_write', 'off', false);
