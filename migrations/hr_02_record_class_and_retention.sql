-- HR domain, migration 02 of 16 (register item HRB-005) -- the records-governance substrate.
--
-- Authority: /projects/hr-domain/specs/SPEC-DATA-MODEL.md sections 14.1, 14.2, 15, and 18.1
-- file 02. This file must precede the triad because every {{RETAIN}} block, including
-- hr.employee's, carries `record_class_key text NOT NULL REFERENCES hr.record_class(class_key)`
-- -- a table whose class is missing from the seed cannot accept an insert at all.
--
-- Idempotent. Applied live as migration `hr_02_record_class_and_retention`.
--
-- TWO RECORDED DEVIATIONS FROM THE PUBLISHED SPEC TEXT, both forced by the live gate:
--
--  1. p_soft_delete => TRUE on both tables, where sections 14.1/14.2 say soft-delete `false`.
--     `iam.verify_canonical`'s `soft_delete` check returns WARN ("no deleted_at") for every
--     non-component, non-ledger variant that has no deleted_at column, and
--     `iam.canonical_certify_ok` is false on a single WARN -- proven in a rolled-back probe
--     before this file was written. Closing a conformance gap that is an ADD is the standing
--     platform answer (db-rules changelog, 2026-08-21: 17 tables closed exactly this way).
--
--  2. `hr.retention_rule` is created EMPTY. Section 15's periods are federal floors, and
--     section 14.2 makes `source_citation` and `authority` NOT NULL because "a retention rule
--     with no citation is not a rule, it is a guess". Seeding cited legal values is C5 /
--     HRB-009 (the JUR-SEED verification tasks), not this file. `hr.record_class` IS seeded --
--     it is structural (the NOT NULL FK above, and conformance query G).

set local lock_timeout = '20s';

-- ============================================================ 1. hr.record_class  (SYS)
do $$ begin
  if to_regclass('hr.record_class') is null then
    perform platform.create_entity_table(
      p_schema => 'hr', p_table => 'record_class', p_token => 'hr_record_class',
      p_label => 'Record class',
      p_fields => ARRAY[
        'class_key text NOT NULL',
        'label text NOT NULL',
        'description text',
        $f$sensitivity_tier text NOT NULL CHECK (sensitivity_tier IN ('directory','internal','confidential','restricted'))$f$,
        $f$trigger_event text NOT NULL CHECK (trigger_event IN ('record_created','hire_date','termination_date','last_day_worked','form_completed','case_closed','period_end','decision_recorded','max_hire_plus_term'))$f$,
        'default_retention_months integer',
        'storage_note text',
        'separate_storage_required boolean NOT NULL DEFAULT false',
        'export_representation text',
        'hard_delete_blocked boolean NOT NULL DEFAULT true',
        $f$entity_tokens text[] NOT NULL DEFAULT '{}'$f$,
        'is_active boolean NOT NULL DEFAULT true'
      ],
      p_variant => 'system', p_versioned => true, p_soft_delete => true, p_visibility => 'internal',
      p_category => false, p_listed => false, p_org_default => false, p_gin_jsonb => false,
      p_parents => null);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'record_class_key_unique') then
    alter table hr.record_class add constraint record_class_key_unique unique (class_key);
  end if;
end $$;

update platform.entity_types set
  title_column = 'label', reference_pickable = true,
  taxonomy_node_id = '394893a0-be07-4b4a-9b50-3a0cd984bc80',
  governed_columns = ARRAY['created_by','organization_id','deleted_at','class_key','sensitivity_tier','trigger_event','hard_delete_blocked']
where token = 'hr_record_class';

-- ============================================================ 2. hr.retention_rule  (SYS)
do $$ begin
  if to_regclass('hr.retention_rule') is null then
    perform platform.create_entity_table(
      p_schema => 'hr', p_table => 'retention_rule', p_token => 'hr_retention_rule',
      p_label => 'Retention rule',
      p_fields => ARRAY[
        'class_key text NOT NULL REFERENCES hr.record_class(class_key)',
        'jurisdiction_id uuid REFERENCES hr.jurisdiction(id)',
        'retention_months integer',
        'retention_expression text',
        'minimum_wins boolean NOT NULL DEFAULT true',
        'source_citation text NOT NULL',
        'source_url text',
        'authority text NOT NULL',
        'effective_from date NOT NULL',
        'effective_to date',
        $f$effective_range daterange GENERATED ALWAYS AS (daterange(effective_from, effective_to, '[)')) STORED$f$,
        'supersedes_id uuid',
        'notes text'
      ],
      p_variant => 'system', p_versioned => true, p_soft_delete => true, p_visibility => 'internal',
      p_category => false, p_listed => false, p_org_default => false, p_gin_jsonb => false,
      p_parents => null);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'retention_rule_window_ordered') then
    alter table hr.retention_rule add constraint retention_rule_window_ordered
      check (effective_to is null or effective_to > effective_from);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'retention_rule_supersedes_fk') then
    alter table hr.retention_rule add constraint retention_rule_supersedes_fk
      foreign key (supersedes_id) references hr.retention_rule(id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'retention_rule_unique_per_window') then
    alter table hr.retention_rule add constraint retention_rule_unique_per_window
      unique (class_key, jurisdiction_id, effective_from);
  end if;
  -- Section 14.2: a rule is a month count OR an expression, never neither.
  if not exists (select 1 from pg_constraint where conname = 'retention_rule_has_a_period') then
    alter table hr.retention_rule add constraint retention_rule_has_a_period
      check (retention_months is not null or retention_expression is not null);
  end if;
end $$;

create index if not exists retention_rule_class_range_gist
  on hr.retention_rule using gist (class_key extensions.gist_text_ops, effective_range)
  where deleted_at is null;
create index if not exists retention_rule_jurisdiction_idx
  on hr.retention_rule (jurisdiction_id) where jurisdiction_id is not null;

update platform.entity_types set
  taxonomy_node_id = '394893a0-be07-4b4a-9b50-3a0cd984bc80',
  governed_columns = ARRAY['created_by','organization_id','deleted_at','class_key','jurisdiction_id','source_citation','authority','effective_from','effective_to']
where token = 'hr_retention_rule';

-- ============================================================ 3. the write guard, per table
do $$
declare t text;
begin
  foreach t in array ARRAY['record_class','retention_rule'] loop
    if not exists (select 1 from pg_trigger tg join pg_class c on c.oid = tg.tgrelid
                     join pg_namespace n on n.oid = c.relnamespace
                    where n.nspname = 'hr' and c.relname = t and tg.tgname = '_zz_guard_hr_write') then
      execute format(
        'create trigger _zz_guard_hr_write before insert or update or delete on hr.%I for each row execute function hr._guard_hr_write()', t);
    end if;
  end loop;
end $$;

-- ============================================================ 4. the section 15 register seed
-- Twenty-one classes, verbatim from section 15's table: class_key, trigger event, the federal
-- floor in months, the token list, and the storage note. `sensitivity_tier` is not a column of
-- that table; it is read off SPEC-ACCESS section 3.1's tier assignment (the Restricted tier is
-- restricted_note, eeo_response, incident, incident_party, kiosk_device, kiosk_session,
-- employment_pin, access_audit and the structured-medical tables), with CONF tables
-- `confidential` and everything else `internal`.
--
-- `governance_log` has no trigger event in section 15 ("--", never disposed). `trigger_event`
-- is NOT NULL with a closed CHECK, so it carries `record_created` with a NULL retention period
-- and hard_delete_blocked -- the never-disposed posture, expressed in the columns that exist.

select set_config('hr.privileged_write', 'on', false);

insert into hr.record_class
  (organization_id, class_key, label, description, sensitivity_tier, trigger_event,
   default_retention_months, storage_note, separate_storage_required, hard_delete_blocked,
   entity_tokens, visibility)
select '39c38960-d30c-4840-b0c1-c9960de95582'::uuid,
       v.class_key, v.label, v.description, v.sensitivity_tier, v.trigger_event,
       v.months, v.storage_note, v.separate_storage, true, v.tokens, 'internal'::platform.visibility
from (values
 ('personnel_file','Personnel file','The employment record proper: directory identity, private person facts, the spell and the positions held.','confidential','termination_date',12,
  'Confidential tier; I-9 and medical are excluded by construction.',false,
  array['hr_employee','hr_employee_private','hr_employment','hr_position_assignment']::text[]),
 ('separation_record','Separation record','The structured end of an employment spell; feeds the unemployment response.','confidential','termination_date',12,
  'Restricted variant. Involuntary terminations start the EEOC clock at the termination date.',false,
  array['hr_separation']),
 ('payroll_computation','Payroll computation','Pay components, workweeks and the export artifacts generated from them.','confidential','period_end',36,
  'FLSA payroll-computation floor. Export artifacts are retained with the file; the grain is frozen at generation.',false,
  array['hr_compensation','hr_workweek','hr_payroll_export','hr_payroll_export_line']),
 ('time_record','Time record','Raw punches and every computed interval, adjustment and exception derived from them.','internal','period_end',24,
  'FLSA "records used to compute wages". Raw punches and computed intervals are disposed together, never apart.',false,
  array['hr_punch','hr_work_interval','hr_time_adjustment','hr_attendance_exception','hr_pay_period_employment','hr_overtime_preapproval','hr_overtime_alert']),
 ('schedule_record','Schedule record','The published schedule baseline and its change trail.','internal','period_end',36,
  'Fair-workweek ordinances commonly require three years. The published baseline is retained with the change trail.',false,
  array['hr_schedule','hr_shift','hr_schedule_change','hr_crew','hr_schedule_guidance']),
 ('leave_record','Leave record','Ordinary PTO: requests, the balance ledger and enrollments.','internal','termination_date',36,
  'FMLA recordkeeping floor where applicable. Medical certifications are NOT here -- they are leave_case_medical.',false,
  array['hr_leave_request','hr_leave_ledger','hr_leave_enrollment']),
 ('leave_case_medical','Protected leave case','Protected and extended leave cases carrying medical facts.','restricted','case_closed',null,
  'Restricted variant, separate from the personnel file (ADA/FMLA confidentiality). Period is jurisdiction-resolved, never a single hard-coded number.',false,
  array['hr_leave_case']),
 ('i9','Form I-9','Employment eligibility verification and its supporting documents.','confidential','max_hire_plus_term',null,
  'SEPARATE STORAGE REQUIRED. Own inspection export. Destroyed on schedule, never soft-deleted. Rule: max(hire_date + 36 months, termination_date + 12 months).',true,
  array['hr_i9','hr_i9_document']),
 ('tax_withholding','Tax withholding','Withholding elections and the signed artifact behind them.','confidential','period_end',48,
  'IRS employment-tax floor, counted from the tax year. The signed artifact is retained with the record.',false,
  array['hr_tax_withholding']),
 ('applicant_record','Applicant record','Everything an application generates, from first contact to conversion or rejection.','confidential','record_created',12,
  'The clock starts at creation, not at rejection. A rejected candidate is never deleted early. 24 months for federal contractors and other covered categories.',false,
  array['hr_candidate','hr_application','hr_interview','hr_interview_kit','hr_scorecard','hr_reference_check','hr_offer','hr_accommodation_request','hr_candidate_message','hr_candidate_conversion']),
 ('eeo_response','EEO self-identification','Candidate-side EEO self-identification, segregated from the application.','restricted','record_created',12,
  'Segregated; aggregate-only read; never joined to a person by a client.',false,
  array['hr_eeo_response']),
 ('requisition_record','Requisition record','The approved opening, its budget and its range.','confidential','record_created',36,
  'Matches the EEOC posting-record floor. Budget and range never leave the row.',false,
  array['hr_requisition']),
 ('ai_evidence','AI evidence','An AI suggestion and the human decision recorded against it.','confidential','record_created',36,
  'Suggestion and human decision are retained together or not at all. The org value is the hr.domain_wide.ai_evidence_retention_months knob; this is the class floor.',false,
  array['hr_ai_evidence']),
 ('background_check','Background check','Adjudication status and the adverse-action decision.','confidential','decision_recorded',24,
  'FCRA/EEOC practice. Raw results live in hr_restricted_note; only status and adjudication are in the tracked record.',false,
  array['hr_background_check']),
 ('employee_relations','Employee relations','Corrective actions, incidents and the parties to them.','restricted','case_closed',12,
  'Twelve months minimum. OSHA injury/illness records are retained 5 years following the covered year, even when the ER clock is shorter.',false,
  array['hr_corrective_action','hr_incident','hr_incident_party']),
 ('restricted_note','Restricted note','The owner-only investigation and medical narrative lane.','restricted','case_closed',null,
  'Inherits the longest rule of its subject class. Owner-only variant; disposition requires the owner or a platform super-admin.',false,
  array['hr_restricted_note']),
 ('training_record','Training record','Assignments, the immutable transcript and the credentials they produce.','internal','termination_date',36,
  'Life of employment plus 36 months; regulator-facing mandates may exceed. The transcript is insert-only; disposal is by disposition event, never delete.',false,
  array['hr_training_assignment','hr_transcript_entry','hr_credential']),
 ('onboarding_record','Onboarding record','Checklist runs, provisioning results, assets and the new-hire report.','internal','termination_date',36,
  'SOC2/ISO audit expectation for access-provisioning evidence. Access-shutoff results are the audit-critical subset.',false,
  array['hr_checklist_run','hr_checklist_item','hr_provisioning_result','hr_asset','hr_asset_assignment','hr_new_hire_report','hr_survey','hr_survey_question','hr_survey_invitation','hr_survey_response']),
 ('benefits_event','Benefits event','Benefit lifecycle events; metadata only.','confidential','termination_date',72,
  'ERISA-adjacent practice. Metadata only; no plan data is stored in v1.',false,
  array['hr_benefits_event']),
 ('records_request','Records request','Post-employment records and verification-letter requests.','confidential','record_created',36,
  'Delivery evidence is retained; the delivered artifact follows its source class clock.',false,
  array['hr_records_request','hr_verification_letter_request']),
 ('governance_log','Governance log','The evidence of governance itself: disposition events, audited reads and legal holds.','restricted','record_created',null,
  'NEVER DISPOSED. The evidence of governance outlives the records it governed. No retention rule applies and hard delete is blocked unconditionally.',false,
  array['hr_disposition_event','hr_access_audit','hr_legal_hold','hr_legal_hold_item'])
) as v(class_key, label, description, sensitivity_tier, trigger_event, months, storage_note, separate_storage, tokens)
where not exists (select 1 from hr.record_class rc where rc.class_key = v.class_key);

select set_config('hr.privileged_write', 'off', false);

-- ============================================================ 5. DDL guard acknowledgement
do $$
declare t text;
begin
  foreach t in array ARRAY['record_class','retention_rule'] loop
    perform platform.ddl_guard_ack(
      p_reason => 'HR is org-explicit by the 2026-08-21 NO-NULL-ORG ruling; no assignment trigger by design (SPEC-DATA-MODEL 1.3)',
      p_by     => 'hr-domain-migration hr_02',
      p_rule   => 'org_not_null_no_backstop',
      p_object_ref => 'hr.' || t);
  end loop;
end $$;

-- ============================================================ 6. assertions
do $$
declare r record; v_bad integer; v_classes integer;
begin
  for r in select unnest(ARRAY['record_class','retention_rule']) as t loop
    select count(*) into v_bad from iam.verify_canonical('hr', r.t, 'hr_' || r.t) where status in ('FAIL','WARN');
    if v_bad > 0 then
      raise exception 'hr_02: hr.% has % FAIL/WARN conformance rows', r.t, v_bad;
    end if;
    if not exists (select 1 from pg_trigger tg join pg_class c on c.oid = tg.tgrelid
                     join pg_namespace n on n.oid = c.relnamespace
                    where n.nspname = 'hr' and c.relname = r.t and tg.tgname = '_zz_guard_hr_write') then
      raise exception 'hr_02: hr.% is missing _zz_guard_hr_write', r.t;
    end if;
  end loop;

  select count(*) into v_classes from hr.record_class;
  if v_classes < 21 then
    raise exception 'hr_02: expected 21 seeded record classes, found %', v_classes;
  end if;

  -- the class every {{RETAIN}} block defaults to must exist, or file 04 cannot insert at all
  if not exists (select 1 from hr.record_class where class_key = 'personnel_file') then
    raise exception 'hr_02: record class personnel_file is missing';
  end if;

  select count(*) into v_bad from platform.ddl_guard_log
   where acknowledged_at is null and object_ref like 'hr.%';
  if v_bad > 0 then
    raise exception 'hr_02: % unacked DDL guard rows remain on hr.*', v_bad;
  end if;
end $$;
