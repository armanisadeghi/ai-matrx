-- HR domain L1 — migration 2a of 6 (register item HRB-013, lane l1-employees).
--
-- THE 21 CONFIGURATION KEYS SPEC-EMPLOYEES §10 INTRODUCES, seeded with a real `basis` and a
-- `review_due` 90 days out. Applied live as `hr_l1_02a_knob_seeds`. Idempotent.
--
-- Authority: SPEC-EMPLOYEES §10; SPEC-DATA-MODEL §19.1; R-L1 items A13, U1.
--
-- ===================================================================================
-- 🚨 RECORDED TECHNICAL DECISION 7 — THE SLUGS, SETTLED AGAINST THE LIVE REGISTER.
--
-- R-L1 U1 recorded that three specs use three knob grammars and the seeder rejects two of them:
-- SPEC-DATA-MODEL §19.1 rules `hr.<taxonomy_node_slug>.<key>` and explicitly retires
-- `hr.identity`, `hr.time`, `hr.governance`, `hr.ai`; SPEC-EMPLOYEES §10 then introduces 21 keys
-- under `identity` / `relations` / `verification` / `settings` / `ai`; SPEC-UI-IA §10 uses fifteen
-- more. Live 2026-08-26 the register holds **128 `hr.*` knobs across exactly 15 slugs**:
-- access · approvals · contracts · domain_wide · employees · hiring · jurisdiction_rules · leave ·
-- onboarding · records · relations · scheduling · time_and_attendance · training · workflow.
--
-- **`identity`, `verification`, `settings` and `ai` are not among them.** So, per U1's resolution
-- (SPEC-DATA-MODEL owns the ladder, the resolver and the seeder, therefore its grammar governs):
--   · everything in §1 and §1b lands on **`hr.employees`**, key names unchanged except that a
--     dotted UI prefix becomes part of the key (`hr.profile.default_tab` → `profile_default_tab`,
--     `hr.directory.default_view` → `directory_default_view`), because a four-segment key cannot
--     exist in a two-column primary key;
--   · everything in §1a lands on **`hr.relations`**, which already holds
--     `incident_escalation_target`;
--   · the four AI rows land on **`hr.domain_wide`**, which already holds `ai_*`.
-- Route 67 renders whatever the store holds rather than a hard-coded list, so a later rename is a
-- data change and not a UI change.
-- **→ coordinator: SPEC-EMPLOYEES §10, SPEC-ACCESS §10 and SPEC-UI-IA §10 owe one amendment
-- renaming their slugs. Sibling lanes read the same keys and a rename after G1 is a contract
-- change.**
--
-- 🚨 RECORDED TECHNICAL DECISION 8 — FOUR KEYS ARE ARRAYS AND `value_type` CANNOT SAY SO.
-- The live CHECK admits `number|integer|boolean|string|enum` and nothing else — the same blocker
-- FREEZE D-5 hit on `hr.contracts.provider_retry_policy` and HRB-004 hit on
-- `hr.employees.self_service_field_policy`. `duplicate_scan_fields`,
-- `rehire_ineligible_override_roles`, `incident_intake_channels` and `activation_seeds` are
-- genuinely list-valued. They are seeded with `value_type = 'string'` and a **jsonb array**
-- `default_value`, which is what every consumer already reads (`hr._knob` returns jsonb and the
-- callers unnest it). The behaviour is configurable today; only the declared TYPE is deferred,
-- and it is deferred to the knob-store owner exactly as D-5 deferred its composite.
--
-- 🚨 RECORDED TECHNICAL DECISION 9 — `incident_intake_channels` DEFAULTS TO `["in_app"]`, NOT
-- SPEC-EMPLOYEES §10's `["in_app","anonymous_token"]`. R-L1 U2 found that the two outsider-token
-- purposes §1a depends on — `anonymous_report` (anonymous complaint intake) and
-- `investigation_external` (the accused-`hr_owner` escalation) — were replaced in SPEC-ESIGN §5.6
-- by `candidate_portal` and `referee`, leaving both lanes unimplementable. **Half of that has
-- since been fixed:** `public.hr_mint_investigation_token(p_incident_id, …)` IS live, so the
-- escalation lane works and `incident_escalation_target` keeps its full value set. The ANONYMOUS
-- lane still has no purpose family, so its channel is not offered — **a door with no lane behind
-- it is worse than an absent door.** The value set still admits it, so enabling the channel is a
-- knob change the day the family lands.
-- ===================================================================================

set local statement_timeout = '600s';
set local lock_timeout = '20s';

do $$
declare r record;
begin
  for r in
    select * from (values
      -- ---------------------------------------------------------------- hr.employees (§1, §1b)
      ('hr.employees','display_name_rule','enum','"preferred_first_legal_last"'::jsonb,
       'Preferred-first + legal-last is how a workplace actually addresses people while keeping the surname that matches payroll and I-9. `legal_full` exists for orgs whose payroll vendor drives the directory; `preferred_full` for orgs that treat the whole name as the person''s to choose.'),
      ('hr.employees','name_change_requires_document','boolean','false'::jsonb,
       'A document requirement is a KNOB, never a hard rule (§4.10) — demanding a court order before someone can correct their own legal name is a policy an org may choose and a platform may not impose.'),
      ('hr.employees','notify_employee_on_pay_change','boolean','true'::jsonb,
       'The person whose pay changed is the one party who must not learn it from a payslip. Orgs running a synchronised comp cycle turn it off for the cycle window.'),
      ('hr.employees','duplicate_scan_fields','string',
       '["name_trgm","work_email","personal_email","ssn_hmac"]'::jsonb,
       'All four legs on by default: a duplicate person record is the defect that quietly splits somebody''s tenure, PTO and I-9 across two files. The SSN leg only runs when aidream supplies the HMAC, because the key never enters the database (SPEC-ACCESS §4.5), and the scan envelope names the legs that actually ran.'),
      ('hr.employees','rehire_ineligible_override_roles','string','["hr_owner"]'::jsonb,
       '`rehire_eligible = false` is a decision somebody made with a reason attached; overriding it should cost a named person''s standing, not a checkbox. hr_owner is the narrowest role that can be answerable for it.'),
      ('hr.employees','adjusted_service_date_rule','string','"carry_if_gap_under_months:12"'::jsonb,
       'Twelve months is the common bridging window and matches the sick-leave reinstatement window CA already imposes, so the two do not disagree inside one rehire.'),
      ('hr.employees','future_dated_change_max_days','integer','365'::jsonb,
       'A change scheduled more than a year out is almost always a typo in the year. The ceiling is a guard against a fat finger, not a policy — and it is a knob because a 2-year fixed-term contract legitimately needs 730.'),
      ('hr.employees','position_change_requires_approval','boolean','true'::jsonb,
       'TRUE when the initiator is a manager (§4.2 node D). An HR admin with position_change authority is already the approver, so routing their own write through a queue is ceremony; a manager proposing a change to their own report is exactly what the flow exists for.'),
      ('hr.employees','contractor_directory_visible','boolean','true'::jsonb,
       'D8 puts contractors fully in scope and §1.4 gates only the employment-only MACHINERY off. A person who does the work and appears on the schedule belongs in the directory; hiding them is how misclassification stays invisible.'),
      ('hr.employees','directory_default_view','enum','"cards"'::jsonb,
       'Arman''s Q2 answer, R-L1 §F: a spreadsheet of eleven people is a worse answer than eleven faces. Cards for a small org, table one click away, and the choice is remembered PER USER (a preference, never a config key) so this default only ever decides the first visit.'),
      ('hr.employees','directory_visible_to_employees','boolean','true'::jsonb,
       'Knowing who your colleagues are is the directory''s whole job. `directory_opt_out` is the per-person answer; this is the org-wide one and switching it off should be a deliberate act.'),
      ('hr.employees','orgchart_visible_to_employees','boolean','true'::jsonb,
       'The reporting graph is already org-readable through the directory''s manager column; hiding the chart hides structure from the people inside it without hiding any fact.'),
      ('hr.employees','profile_default_tab','enum','"personal"'::jsonb,
       'The records-first landing SPEC-EMPLOYEES §2.2 specifies. A viewer with no access to Personal is redirected to the first tab they CAN see by the §2.3.1 matrix, so this default can never produce a blank page. (Arman''s Q1 — whether an Overview tab becomes the default — is answered by adding `overview` to this value set, not by changing code.)'),
      ('hr.employees','profile_tab_visibility','string','{}'::jsonb,
       'The §2.3.1 matrix is the ceiling and this map overrides DOWNWARD ONLY. Empty means "the matrix as written"; a key here can hide a tab from a persona and can never reveal one.'),
      ('hr.employees','disclosure_existence_statements','string','{}'::jsonb,
       '§1.3''s ONE permitted disclosure: a worded statement that a record exists without showing it ("This person has an approved leave. Details are held by HR."). Empty by default because a statement nobody wrote is not a statement, and a masked field is never the answer.'),
      ('hr.employees','verification_letter_default_kind','enum','"employment"'::jsonb,
       'Employment-only needs no consent and answers most requests. Defaulting to the income variant would put a consent gate in front of every routine landlord letter and train people to click through it.'),
      ('hr.employees','verification_consent_expiry_days','integer','14'::jsonb,
       'Two weeks is long enough for someone to see the request and short enough that a stale consent cannot be spent months later on a letter that asserts a salary they no longer earn.'),
      ('hr.employees','verification_third_party_self_serve_enabled','boolean','false'::jsonb,
       'OFF by default. A self-serve lane that lets an unknown third party pull an employment record on demand is the exact shape of a pretexting attack; an org that wants it should have to say so.'),
      ('hr.employees','activation_seeds','string',
       '["earning_codes","deduction_codes","categories_dimensions","holiday_calendar"]'::jsonb,
       'All four on: an employer activated with no earning codes cannot record an hour, and discovering that on the first payroll is the worst possible moment. An org migrating from another system turns individual seeds off so its own codes are not shadowed.'),
      -- ---------------------------------------------------------------- hr.relations (§1a)
      ('hr.relations','corrective_action_ack_due_days','integer','5'::jsonb,
       'One working week: long enough for someone to read a document that may end their job and get advice, short enough that "unacknowledged" still means something when it is read back in a hearing.'),
      ('hr.relations','corrective_action_ladder_skip','enum','"warn"'::jsonb,
       'WARN, never block. Skipping the ladder is sometimes exactly right (a first offence that is gross misconduct) and sometimes the thing that loses the unemployment claim — so the surface shows the prior chain and lets a human decide. `block` exists for orgs whose CBA requires progression.'),
      ('hr.relations','complaint_subject_excluded_default','boolean','true'::jsonb,
       'PLATFORM-LOCKED true for harassment, discrimination and ethics; overridable only for the other kinds. A complaint the subject can read is not a complaint, it is a warning shot — and §4.9b''s veto is what makes the intake safe to use at all.'),
      ('hr.relations','incident_intake_channels','string','["in_app"]'::jsonb,
       'RECORDED DECISION 9 above: the anonymous channel has no outsider-token purpose family behind it yet, and a door with no lane is worse than an absent door. `anonymous_token` is a permitted value the day the family lands.'),
      -- ---------------------------------------------------------------- hr.domain_wide (§8 AI)
      ('hr.domain_wide','employees_org_chart_query_posture','enum','"recommend"'::jsonb,
       'It HIGHLIGHTS NODES ON A CHART THE HUMAN IS ALREADY LOOKING AT and returns no chat reply, so there is nothing for it to decide. `off` is the only other value because there is no lower posture than not running.'),
      ('hr.domain_wide','employees_verification_letter_draft_posture','enum','"review_and_comment"'::jsonb,
       'A letter is an assertion the org is held to. The mandate drafts the BODY; what is disclosed and whether consent exists are settled before it is called, and a human approves before the PDF is rendered. `apply_final` is deliberately not a permitted value.'),
      ('hr.domain_wide','employees_record_anomaly_scan_posture','enum','"recommend"'::jsonb,
       'Every finding it surfaces is a fact a human must act on — an expiring work permit, an exempt position under the salary threshold, a spell with no compensation row. The deterministic checks are plain queries (D6: a rule-checkable fact is never routed through a model); the mandate ranks, clusters and explains them.'),
      ('hr.domain_wide','employees_record_anomaly_scan_cadence','enum','"daily"'::jsonb,
       'Daily, because the things it finds have deadlines — a work authorization expiring inside 90 days is a countdown, not a status. Weekly for orgs small enough that daily would be noise.')
    ) as t(feature, key, value_type, default_value, basis)
  loop
    -- `value` is NOT NULL and is the PLATFORM value in force; `default_value` is the shipped
    -- default it can be reset to. `hr._knob` coalesces the two, so a seed must set both — and on
    -- re-run it refreshes the DEFAULT and the basis while leaving a platform value somebody
    -- deliberately changed alone. A seeder that stomps a tuned value is how a knob silently
    -- becomes a constant again.
    insert into platform.feature_knob (feature, key, value_type, value, default_value, basis,
                                       set_by, review_due, label, description)
    values (r.feature, r.key, r.value_type, r.default_value, r.default_value, r.basis,
            'agent', (current_date + 90),
            -- a human-readable label is NOT NULL; derive it from the key so no row ships with a
            -- placeholder, and route 67's search has something to match on besides the raw key.
            initcap(replace(r.key, '_', ' ')), r.basis)
    on conflict (feature, key) do update
      set value_type    = excluded.value_type,
          default_value = excluded.default_value,
          label         = excluded.label,
          description   = excluded.description,
          basis         = excluded.basis,
          review_due    = excluded.review_due,
          updated_at    = now();
  end loop;
end $$;

-- ============================================================ assertions

do $$
declare v_n integer; v_bad text;
begin
  select count(*) into v_n from platform.feature_knob
   where (feature, key) in (
     ('hr.employees','display_name_rule'), ('hr.employees','name_change_requires_document'),
     ('hr.employees','notify_employee_on_pay_change'), ('hr.employees','duplicate_scan_fields'),
     ('hr.employees','rehire_ineligible_override_roles'), ('hr.employees','adjusted_service_date_rule'),
     ('hr.employees','future_dated_change_max_days'), ('hr.employees','position_change_requires_approval'),
     ('hr.employees','contractor_directory_visible'), ('hr.employees','directory_default_view'),
     ('hr.employees','directory_visible_to_employees'), ('hr.employees','orgchart_visible_to_employees'),
     ('hr.employees','profile_default_tab'), ('hr.employees','profile_tab_visibility'),
     ('hr.employees','disclosure_existence_statements'),
     ('hr.employees','verification_letter_default_kind'),
     ('hr.employees','verification_consent_expiry_days'),
     ('hr.employees','verification_third_party_self_serve_enabled'),
     ('hr.employees','activation_seeds'),
     ('hr.relations','corrective_action_ack_due_days'), ('hr.relations','corrective_action_ladder_skip'),
     ('hr.relations','complaint_subject_excluded_default'), ('hr.relations','incident_intake_channels'),
     ('hr.domain_wide','employees_org_chart_query_posture'),
     ('hr.domain_wide','employees_verification_letter_draft_posture'),
     ('hr.domain_wide','employees_record_anomaly_scan_posture'),
     ('hr.domain_wide','employees_record_anomaly_scan_cadence'));
  if v_n <> 27 then
    raise exception 'hr_l1_02a: expected 27 seeded L1 knobs, found %', v_n;
  end if;

  -- FREEZE precondition 10: every seeded knob's `feature` is drawn from the live slug list. A knob
  -- on a slug that does not exist resolves to nothing and becomes a constant by accident.
  select string_agg(distinct feature, ', ') into v_bad from platform.feature_knob
   where feature like 'hr.%'
     and split_part(feature,'.',2) not in (
       'access','approvals','contracts','domain_wide','employees','hiring','jurisdiction_rules',
       'leave','onboarding','records','relations','scheduling','time_and_attendance','training',
       'workflow');
  if v_bad is not null then
    raise exception 'hr_l1_02a: knobs on off-list slug(s): %', v_bad;
  end if;

  -- D13: every key this lane reads must resolve, or the surface that reads it raises at runtime.
  perform hr._knob('hr.employees','contractor_directory_visible');
  perform hr._knob('hr.employees','duplicate_scan_fields');
  perform hr._knob('hr.employees','display_name_rule');
  perform hr._knob('hr.employees','future_dated_change_max_days');
  perform hr._knob('hr.relations','corrective_action_ack_due_days');
  perform hr._knob('hr.domain_wide','employees_record_anomaly_scan_cadence');
end $$;
