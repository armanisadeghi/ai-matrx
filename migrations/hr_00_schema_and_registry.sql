-- HR domain, migration 00 of 16 (register item HRB-005) -- the `hr` schema, the write guard,
-- the shared delete refusal, and the categories dimensions every later file's category_id FKs.
--
-- Authority: /projects/hr-domain/specs/SPEC-DATA-MODEL.md section 18.1 file 00, section 17.5,
-- SPEC-ACCESS law 2, and /projects/hr-domain/readiness/R-CORE-READINESS.md B4 (which is why the
-- write guard is homed here rather than nowhere).
--
-- Idempotent; re-running is a no-op. Applied live as migration `hr_00_schema_and_registry`.
--
-- NOT DONE HERE, deliberately: section 18.1 tells this file to promote the seven HR feature
-- nodes to `canonical`. /policies/feature-registry.md forbids an agent flipping any node to
-- canonical -- that is Arman's, batched by the docs-steward. Nothing in the schema reads a
-- node's status, so the omission costs nothing. Recorded on the HR register (HRB-005).

set local lock_timeout = '20s';

-- ============================================================ 1. the schema
create schema if not exists hr;

comment on schema hr is
  'AI Matrx Human Resources domain. Employer of record, the identity triad (employee -> employment -> position assignment), time, scheduling, leave, hiring, onboarding, training and the compliance substrate. Every table is provisioned through platform.create_entity_table, is organization-explicit (no org-assignment trigger anywhere), and carries the hr._guard_hr_write BEFORE trigger: no client writes an hr.* table through PostgREST.';

grant usage on schema hr to authenticated, service_role;

-- ============================================================ 2. the write wall (SPEC-ACCESS law 2)
-- Reads are RLS-direct where the tier allows. WRITES ARE ALWAYS MEDIATED: a SECURITY DEFINER
-- RPC (or aidream under acting_as_user) sets `hr.privileged_write` for the duration of its work
-- and this trigger refuses every other session. Effective dating, jurisdiction stamping,
-- workflow routing, evidence capture and rule-version snapshots all need server logic, and one
-- write path is what makes the self-service field policy enforceable at all.
--
-- Attached per table, in the same migration that creates the table, as
--   create trigger _zz_guard_hr_write before insert or update or delete on hr.<t>
--     for each row execute function hr._guard_hr_write();
-- `_zz_` so it fires last among BEFORE triggers, after the platform stampers have run.
-- Conformance query F (section 18.5) asserts every hr base table carries it.

create or replace function hr._guard_hr_write() returns trigger
language plpgsql
as $fn$
begin
  if coalesce(current_setting('hr.privileged_write', true), '') in ('on','true','1','yes') then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;
  raise exception 'hr_write_forbidden: % on %.% has no privileged HR write path', tg_op, tg_table_schema, tg_table_name
    using errcode = '42501',
          hint = 'SPEC-ACCESS law 2: every hr.* write goes through a SECURITY DEFINER RPC (or aidream under acting_as_user) that sets hr.privileged_write. No client writes an hr table through PostgREST.';
end
$fn$;

comment on function hr._guard_hr_write() is
  'SPEC-ACCESS law 2. BEFORE INSERT/UPDATE/DELETE wall on every hr.* base table: refuses any session that has not set hr.privileged_write. Attached as trigger _zz_guard_hr_write by each table''s own migration.';

-- The shared refusal for immutable-evidence tables (punch, work_interval, both ledgers,
-- transcript entries, disposition events, the access audit). A mistake there is corrected by a
-- REVERSING ROW, never by a delete. Attached only where a table is declared immutable.
create or replace function hr._reject_delete() returns trigger
language plpgsql
as $fn$
begin
  raise exception 'hr_delete_forbidden: %.% is immutable evidence', tg_table_schema, tg_table_name
    using errcode = '42501',
          hint = 'Correct an immutable HR record with a reversing row; disposal happens only through hr.dispose_records with a disposition event.';
end
$fn$;

comment on function hr._reject_delete() is
  'Shared DELETE refusal for HR immutable-evidence tables. Corrections are reversing rows; disposal is hr.dispose_records with a disposition event.';

-- ============================================================ 3. categories dimensions (17.5)
-- Growing vocabularies only -- closed statutory sets are inline CHECKs (section 1.7). Seeded as
-- system rows on the Matrx System org so every org reads them; orgs add their own rows beside.
-- The five hr_eeo_* dimensions are NOT seeded here: section 17.5 names them but does not
-- enumerate the EEO-1 / VETS-4212 / Section 503 value sets, and inventing a federal reporting
-- vocabulary is the hiring lane's job (file 10), not a guess this file makes.

insert into platform.categories (organization_id, dimension, name, slug, is_system, position)
select '39c38960-d30c-4840-b0c1-c9960de95582'::uuid,
       d.dimension,
       initcap(replace(s.slug, '_', ' ')),
       s.slug,
       true,
       s.ord::integer
from (values
  ('hr_department_kind',          array['operations','sales','engineering','finance','people','support']::text[]),
  ('hr_separation_reason',        array['voluntary_resignation','involuntary_cause','involuntary_performance','layoff_rif','end_of_assignment','retirement','death','job_abandonment','mutual']),
  ('hr_change_reason',            array['new_hire','promotion','transfer','merit_increase','market_adjustment','demotion','reclassification','correction','backdated_correction','reorg']),
  ('hr_leave_type',               array['vacation','sick','statutory_sick','personal','bereavement','jury_duty','parental','floating_holiday','unpaid']),
  ('hr_leave_case_category',      array['fmla','state_pfl','ada','workers_comp','userra','parental','medical']),
  ('hr_leave_request_reason',     array['planned_time_off','illness','family_care','safe_time','appointment','other']),
  ('hr_earning_code_group',       array['base','overtime','premium','leave','holiday','differential','allowance','tips']),
  ('hr_incident_category',        array['injury','illness','near_miss','harassment','discrimination','retaliation','safety','ethics','policy_violation']),
  ('hr_corrective_action_reason', array['attendance','performance','conduct','safety','policy_violation','insubordination']),
  ('hr_application_stage',        array['new','screening','phone_screen','interview','onsite','reference','offer','hired','rejected']),
  ('hr_rejection_reason',         array['qualifications','experience','skills_assessment','culture_fit_role','compensation_mismatch','withdrew','position_closed','other_candidate_selected']),
  ('hr_candidate_source',         array['job_board','referral','agency','direct','career_site','event','sourced','rehire']),
  ('hr_offer_decline_reason',     array['compensation','other_offer','location','role_scope','timing','personal']),
  ('hr_schedule_change_reason',   array['business_need','employee_request','call_off','weather','coverage_gap','error_correction']),
  ('hr_shift_claim_reason',       array['illness','personal','transportation','schedule_conflict','coverage_offer']),
  ('hr_asset_kind',               array['laptop','phone','badge','vehicle','uniform','tools','keys']),
  ('hr_crew_kind',                array['install_crew','route','service_team','shift_team','project_team']),
  ('hr_interview_kit_category',   array['screening','technical','behavioural','leadership','practical']),
  ('hr_survey_category',          array['exit','stay','onboarding','engagement','pulse']),
  ('hr_overtime_reason',          array['coverage_gap','seasonal_peak','project_deadline','emergency','call_out_cover']),
  ('hr_checklist_category',       array['onboarding','offboarding','role_change','compliance','seasonal']),
  ('hr_course_category',          array['compliance','safety','harassment_prevention','role_skills','leadership','product','onboarding']),
  ('hr_credential_kind',          array['professional_license','safety_certification','food_handler','driver','security_clearance','first_aid']),
  ('hr_relationship_kind',        array['spouse','partner','parent','child','sibling','friend','other']),
  ('hr_requisition_state_reason', array['budget_freeze','reorg','filled_internally','no_longer_needed','headcount_reduced'])
) as d(dimension, slugs)
cross join lateral unnest(d.slugs) with ordinality as s(slug, ord)
where not exists (
  select 1 from platform.categories c
   where c.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'::uuid
     and c.dimension = d.dimension and c.slug = s.slug and c.deleted_at is null);

-- ============================================================ 4. assertions
do $$
declare v_dims integer;
begin
  if to_regprocedure('hr._guard_hr_write()') is null then
    raise exception 'hr_00: hr._guard_hr_write() missing';
  end if;
  if to_regprocedure('hr._reject_delete()') is null then
    raise exception 'hr_00: hr._reject_delete() missing';
  end if;

  select count(distinct dimension) into v_dims from platform.categories
   where dimension like 'hr\_%' and organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'::uuid
     and deleted_at is null;
  if v_dims < 25 then
    raise exception 'hr_00: expected >= 25 seeded hr categories dimensions, found %', v_dims;
  end if;

  -- the guard must actually refuse: a session with the flag off cannot write hr.*
  if coalesce(current_setting('hr.privileged_write', true), '') in ('on','true','1','yes') then
    raise exception 'hr_00: hr.privileged_write is set in the migration session; the guard would be inert';
  end if;
end $$;
