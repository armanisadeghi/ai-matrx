-- HR domain, migration 10 of 16 (register item HRB-006, core tranche 3).
--
-- Hiring: eighteen tables -- the original 15, plus hr_interview_kit (U-14, the L6/L7 readiness
-- review's one genuine schema blocker), plus hr_careers_portal and hr_posting_publication (D21).
-- Also: the schema's ONE containment edge (section 17.2), the
-- hr.position_assignment.requisition_id FK, and hr.eeo_aggregate.
--
-- Authority: SPEC-DATA-MODEL sections 11.1-11.18, 15, 17.2, 17.3, 17.7, 18.1 file 10, 18.1a.
--
-- 🚨 RULING R1 (coordinator adjudication 2026-08-25) governs two of these tables.
-- hr.requisition and hr.candidate are **`entity` at visibility `personal` with derived per-user
-- grants, NOT `restricted`**. The wave-2 hiring behaviour spec proved the earlier classification
-- killed the pipeline board: `restricted` has NO iam.has_access lane at all, so a recruiter who
-- did not create the row saw nothing, and an ATS whose only read path is a per-row audited RPC
-- is not an ATS. hr.application, hr.interview and hr.scorecard are COMPONENTS of those two and
-- inherit that access -- which is the whole point. No org-audience grant is ever written for a
-- requisition or a candidate.
-- The genuinely segregated classes stay `restricted` exactly as specified: hr_eeo_response,
-- hr_accommodation_request, hr_reference_check, hr_background_check, hr_offer, hr_ai_evidence.
--
-- 🚨 THE TWO PUBLIC TABLES. hr.posting and hr.careers_portal are the only `public`-visibility
-- tables in the whole `hr` schema, and they must be: AR 1.15 -- without a candidate-facing apply
-- surface every candidate is hand-entered and EEO SELF-ID HAS NO PRODUCER. Neither carries
-- candidate data or requisition figures; the posting exposes `pay_range_display` (a string a
-- recruiter writes), never budget or range.
--
-- Idempotent. Applied live as migration `hr_10_hiring`.
--
-- ===================================================================================
-- RECORDED TECHNICAL DECISIONS (EXECUTION section 8)
--
-- 1. hr_eeo_response AND hr_ai_evidence take p_soft_delete => true where sections 11.6 and 11.15
--    say `false`. Both are non-component, non-ledger `entity` variants, and iam.verify_canonical's
--    soft_delete check WARNs on exactly that shape with no deleted_at -- a single WARN makes
--    canonical_certify_ok FALSE. This is the SAME positive-add precedent core tranche 2 applied
--    to hr.employment_pin and hr.kiosk_session, and core tranche 1 to hr.record_class. Nothing
--    ever sets deleted_at on either: an EEO response is never withdrawn (the EEOC disposition
--    record survives even a candidate anonymisation, section 11.4) and an AI suggestion is never
--    deleted (AD-11: the suggestion and the human decision are retained together or not at all).
--    OWED SPEC CORRECTION: the soft-delete line on sections 11.6 and 11.15.
--
-- 2. hr.eeo_aggregate IS BUILT AND IS FAIL-CLOSED ON ITS KNOB. Section 11.6 makes it the ONLY
--    sanctioned read of hr.eeo_response -- "even the compliance role has no row-level lane" -- so
--    the door has to exist the moment the table does, or someone will invent a second one. It
--    suppresses any cell below `hr.hiring.eeo_min_cell`, and section 19.2 places that knob in
--    file 14. Per D13 a missing knob RAISES rather than falling back to a constant, so this
--    function refuses with a named error until file 14 seeds it. That is correct, not a stub:
--    an EEO report that silently used a hardcoded minimum cell would be a re-identification risk
--    wearing a compliance label.
--    🚨 OWED TO FILE 13: hr.eeo_aggregate must also write an hr.access_audit row (section 11.6's
--    audited-aggregate posture, the same obligation hr.blended_labor_rate carries in section 4.6).
--    hr.access_audit is file 13, so the call site is marked and the write lands there.
--
-- 3. FLAG AS YOU LAND (section 18.1a): hr_eeo_response (federal protected-class self-ID),
--    hr_offer (pay) and hr_accommodation_request (medical/accommodation) are flagged and
--    regenerated in this file. NOT flagged, correctly: hr_reference_check, hr_background_check
--    and hr_ai_evidence are `restricted` but are not on section 18.1a's list -- raw reference
--    impressions and raw background results live in hr.restricted_note, which IS flagged, and
--    over-flagging is the over-tightening defect db-rules section 6 weighs equally with a leak.
--
-- 4. FKs the spec declares BARE stay bare, as in tranches 2 and 3 throughout:
--    hr.opening.filled_by_application_id, hr.application.accommodation_request_id,
--    hr.interview.rescheduled_from_id, hr.offer.supersedes_offer_id. Section 18.1 enumerates the
--    deferred FKs each file adds and none of these is among them. hr.interview.kit_id is the
--    exception the spec DOES name (section 11.16: "gains references hr.interview_kit(id) in the
--    same file"), so hr_interview_kit is created before hr_interview and the FK is declared
--    inline rather than bolted on afterwards.
-- ===================================================================================

set local lock_timeout = '20s';

-- ============================================================ 11.1 hr.requisition  (WORK, ruling R1)
do $$ begin
  if to_regclass('hr.requisition') is null then
    perform platform.create_entity_table(
      p_schema => 'hr', p_table => 'requisition', p_token => 'hr_requisition',
      p_label => 'Requisition',
      p_fields => ARRAY[
        'requisition_number text NOT NULL',
        'job_title_id uuid NOT NULL REFERENCES hr.job_title(id)',
        'department_id uuid NOT NULL REFERENCES hr.department(id)',
        'location_id uuid REFERENCES hr.location(id)',
        'hiring_manager_employment_id uuid REFERENCES hr.employment(id)',
        'recruiter_employment_id uuid REFERENCES hr.employment(id)',
        'approved_headcount integer NOT NULL DEFAULT 1 CHECK (approved_headcount >= 0)',
        'filled_count integer NOT NULL DEFAULT 0',
        'is_replacement boolean NOT NULL DEFAULT false',
        'replacing_employment_id uuid REFERENCES hr.employment(id)',
        'budget_amount numeric(14,2)',
        'pay_range_min numeric(14,2)',
        'pay_range_max numeric(14,2)',
        $f$pay_basis text CHECK (pay_basis IN ('hourly','salary','piece','commission','contract'))$f$,
        'cost_center text',
        $f$worker_class text NOT NULL DEFAULT 'employee' CHECK (worker_class IN ('employee','contractor','intern','seasonal','volunteer'))$f$,
        'target_start_on date',
        $f$state text NOT NULL DEFAULT 'draft' CHECK (state IN ('draft','pending_approval','approved','open','on_hold','frozen','filled','cancelled','closed'))$f$,
        'state_reason_category_id uuid REFERENCES platform.categories(id)',
        'state_reason_note text',
        'workflow_instance_id uuid',
        'approved_at timestamptz',
        'approved_by_employment_id uuid REFERENCES hr.employment(id)',
        'closed_at timestamptz',
        $f$custom jsonb NOT NULL DEFAULT '{}'::jsonb$f$,
        -- {{RETAIN}}
        $f$record_class_key text NOT NULL DEFAULT 'requisition_record' REFERENCES hr.record_class(class_key)$f$,
        'retention_trigger_at timestamptz',
        'legal_hold_count integer NOT NULL DEFAULT 0'
      ],
      p_variant => 'entity', p_versioned => true, p_soft_delete => true, p_visibility => 'personal',
      p_category => false, p_listed => true, p_org_default => false, p_gin_jsonb => false,
      p_parents => null);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'requisition_number_unique') then
    alter table hr.requisition add constraint requisition_number_unique
      unique (organization_id, requisition_number);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'requisition_range_ordered') then
    alter table hr.requisition add constraint requisition_range_ordered
      check (pay_range_max is null or pay_range_min is null or pay_range_max >= pay_range_min);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'requisition_filled_within_headcount') then
    alter table hr.requisition add constraint requisition_filled_within_headcount
      check (filled_count >= 0 and filled_count <= approved_headcount);
  end if;
end $$;

create index if not exists requisition_state_idx on hr.requisition (organization_id, state)
  where deleted_at is null;
create index if not exists requisition_manager_idx on hr.requisition (hiring_manager_employment_id)
  where deleted_at is null;
create index if not exists requisition_custom_gin on hr.requisition using gin (custom jsonb_path_ops);

update platform.entity_types set
  title_column = 'requisition_number', reference_pickable = true,
  taxonomy_node_id = '36aec4a5-c270-4d84-a0e1-979245677d1e'
where token = 'hr_requisition';

-- ============================================================ 11.2 hr.opening  (COMP of hr_requisition)
-- One requisition with approved_headcount = 3 has three openings; each is filled independently,
-- which is what makes "2 of 3 filled" answerable.
do $$ begin
  if to_regclass('hr.opening') is null then
    perform platform.create_entity_table(
      p_schema => 'hr', p_table => 'opening', p_token => 'hr_opening', p_label => 'Opening',
      p_fields => ARRAY[
        'requisition_id uuid NOT NULL REFERENCES hr.requisition(id)',
        'opening_number integer NOT NULL',
        $f$state text NOT NULL DEFAULT 'open' CHECK (state IN ('open','offer_out','filled','cancelled'))$f$,
        'filled_by_application_id uuid',
        'filled_by_employment_id uuid REFERENCES hr.employment(id)',
        'filled_on date',
        'target_start_on date'
      ],
      p_variant => 'component', p_versioned => true, p_soft_delete => true, p_visibility => 'none',
      p_category => false, p_listed => false, p_org_default => false, p_gin_jsonb => false,
      p_parents => ARRAY['hr_requisition:requisition_id']);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'opening_number_unique') then
    alter table hr.opening add constraint opening_number_unique unique (requisition_id, opening_number);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'opening_filled_dated') then
    alter table hr.opening add constraint opening_filled_dated
      check (state <> 'filled' or filled_on is not null);
  end if;
end $$;

create index if not exists opening_requisition_idx on hr.opening (requisition_id, state)
  where deleted_at is null;

update platform.entity_types set taxonomy_node_id = '36aec4a5-c270-4d84-a0e1-979245677d1e'
where token = 'hr_opening';

-- ============================================================ 11.17 hr.careers_portal  (entity, public)
-- Created before hr.posting_publication, which FKs it. D21: the hosted branded careers portal AND
-- the embeddable widget, from ONE row. WordPress and Shopify plugins are fast-follows that WRAP
-- the widget, so they need no schema of their own.
-- 🚨 The portal has NO SLUG OF ITS OWN -- the public URL segment is
-- hr.employer_profile.careers_slug, so there is one identity, one uniqueness constraint, and no
-- way for the two to disagree about what /careers/acme resolves to.
-- widget_key is a PUBLIC, ROTATABLE IDENTIFIER, not a secret: the embed presents it and the
-- server answers only with rows already readable by anon. An EMPTY widget_allowed_origins means
-- "any origin", which the settings UI must state plainly rather than defaulting silently.
do $$ begin
  if to_regclass('hr.careers_portal') is null then
    perform platform.create_entity_table(
      p_schema => 'hr', p_table => 'careers_portal', p_token => 'hr_careers_portal',
      p_label => 'Careers portal',
      p_fields => ARRAY[
        'employer_profile_id uuid NOT NULL REFERENCES hr.employer_profile(id)',
        'display_name text NOT NULL',
        'tagline text',
        'about_html text',
        'logo_file_id uuid REFERENCES files.files(id)',
        'hero_file_id uuid REFERENCES files.files(id)',
        $f$brand jsonb NOT NULL DEFAULT '{}'::jsonb$f$,
        'custom_domain text',
        'custom_domain_verified_at timestamptz',
        $f$locale text NOT NULL DEFAULT 'en-US'$f$,
        'widget_key text NOT NULL',
        $f$widget_allowed_origins text[] NOT NULL DEFAULT '{}'$f$,
        'widget_enabled boolean NOT NULL DEFAULT true',
        'show_locations boolean NOT NULL DEFAULT true',
        'show_departments boolean NOT NULL DEFAULT true',
        'eeo_statement text',
        'applicant_privacy_notice text',
        'accommodation_notice text',
        'ai_use_notice text',
        $f$analytics jsonb NOT NULL DEFAULT '{}'::jsonb$f$,
        $f$state text NOT NULL DEFAULT 'draft' CHECK (state IN ('draft','live','paused'))$f$,
        'published_at timestamptz'
      ],
      p_variant => 'entity', p_versioned => true, p_soft_delete => true, p_visibility => 'public',
      p_category => false, p_listed => true, p_org_default => false, p_gin_jsonb => false,
      p_parents => null);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'careers_portal_one_per_org') then
    alter table hr.careers_portal add constraint careers_portal_one_per_org unique (organization_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'careers_portal_one_per_employer') then
    alter table hr.careers_portal add constraint careers_portal_one_per_employer unique (employer_profile_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'careers_portal_widget_key_unique') then
    alter table hr.careers_portal add constraint careers_portal_widget_key_unique unique (widget_key);
  end if;
end $$;

update platform.entity_types set
  title_column = 'display_name', reference_pickable = true,
  taxonomy_node_id = '36aec4a5-c270-4d84-a0e1-979245677d1e'
where token = 'hr_careers_portal';

-- ============================================================ 11.3 hr.posting  (entity, public)
-- 🚨 list_on_portal and allow_widget are PER-POSTING LISTING SWITCHES and are deliberately
-- booleans on this row, not a table: they answer "should this appear in the two surfaces we
-- host", which is a property of the posting. Per-channel STATE -- published, paused, expired,
-- failed, with counts and an external id -- is hr.posting_publication (section 11.18), which
-- exists because a job board or an agency has a lifecycle these booleans cannot carry. A posting
-- with list_on_portal = false is still `public` and still reachable by direct link; it is simply
-- not enumerated by the portal index or the widget.
-- pay_transparency_rule_version_id is DEFERRED TO v2: SPEC-JURISDICTION defines no
-- pay-transparency rule class, and a FK to a rule class that does not exist is a column nothing
-- can ever populate. The boolean records that the disclosure was required and shown.
do $$ begin
  if to_regclass('hr.posting') is null then
    perform platform.create_entity_table(
      p_schema => 'hr', p_table => 'posting', p_token => 'hr_posting', p_label => 'Job posting',
      p_fields => ARRAY[
        'requisition_id uuid NOT NULL REFERENCES hr.requisition(id)',
        'slug text NOT NULL',
        'title text NOT NULL',
        'summary text',
        'description_html text',
        'location_display text',
        'is_remote boolean NOT NULL DEFAULT false',
        'employment_type_display text',
        'pay_range_display text',
        'pay_transparency_required boolean NOT NULL DEFAULT false',
        'apply_url text',
        'list_on_portal boolean NOT NULL DEFAULT true',
        'allow_widget boolean NOT NULL DEFAULT true',
        $f$application_form jsonb NOT NULL DEFAULT '{}'::jsonb$f$,
        'collects_eeo_self_id boolean NOT NULL DEFAULT true',
        'accommodation_notice text',
        'ai_use_notice text',
        $f$channels jsonb NOT NULL DEFAULT '[]'::jsonb$f$,
        'published_at timestamptz',
        'closes_at timestamptz',
        $f$state text NOT NULL DEFAULT 'draft' CHECK (state IN ('draft','published','paused','closed'))$f$,
        'view_count integer NOT NULL DEFAULT 0'
      ],
      p_variant => 'entity', p_versioned => true, p_soft_delete => true, p_visibility => 'public',
      p_category => false, p_listed => true, p_org_default => false, p_gin_jsonb => false,
      p_parents => null);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'posting_slug_unique') then
    alter table hr.posting add constraint posting_slug_unique unique (organization_id, slug);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'posting_published_dated') then
    alter table hr.posting add constraint posting_published_dated
      check (state <> 'published' or published_at is not null);
  end if;
end $$;

create index if not exists posting_requisition_idx on hr.posting (requisition_id) where deleted_at is null;
create index if not exists posting_live_idx on hr.posting (organization_id, state, published_at desc)
  where deleted_at is null;

update platform.entity_types set
  title_column = 'title', reference_pickable = true,
  taxonomy_node_id = '36aec4a5-c270-4d84-a0e1-979245677d1e'
where token = 'hr_posting';

-- ============================================================ 11.4 hr.candidate  (WORK, ruling R1)
-- A candidate is a SEPARATE ENTITY WITH ITS OWN RETENTION CLOCK: the clock starts at record
-- creation regardless of outcome, and a rejected candidate is never deleted early.
-- anonymised_at is the deletion-request answer that does NOT destroy the EEOC-mandated
-- disposition record: identifiers are nulled, hr.application and hr.eeo_response survive.
do $$ begin
  if to_regclass('hr.candidate') is null then
    perform platform.create_entity_table(
      p_schema => 'hr', p_table => 'candidate', p_token => 'hr_candidate', p_label => 'Candidate',
      p_fields => ARRAY[
        'party_id uuid REFERENCES crm.party(id)',
        'legal_first_name text',
        'legal_last_name text',
        'preferred_name text',
        'email text',
        'phone text',
        'location_text text',
        'resume_file_id uuid REFERENCES files.files(id)',
        'linkedin_url text',
        'portfolio_url text',
        'source_category_id uuid REFERENCES platform.categories(id)',
        'source_detail text',
        'referred_by_employment_id uuid REFERENCES hr.employment(id)',
        $f$consent_basis text NOT NULL DEFAULT 'application' CHECK (consent_basis IN ('application','talent_pool_opt_in','referral','sourced','agency'))$f$,
        'consent_at timestamptz',
        'talent_pool_opt_in boolean NOT NULL DEFAULT false',
        $f$privacy_request_state text CHECK (privacy_request_state IN ('none','access_requested','export_delivered','deletion_requested','anonymised'))$f$,
        'privacy_request_at timestamptz',
        'anonymised_at timestamptz',
        'do_not_contact boolean NOT NULL DEFAULT false',
        'converted_to_employee_id uuid REFERENCES hr.employee(id)',
        $f$custom jsonb NOT NULL DEFAULT '{}'::jsonb$f$,
        -- {{ACTOR}} -- an outsider-writable table (SPEC-ESIGN 5.5): auth.uid() is NULL for an
        -- applicant, so created_by would have no attributable author at all.
        $f$actor_type text NOT NULL CHECK (actor_type IN ('employee','manager','hr_admin','kiosk_device','external_signer','integration','automation','ai_agent','platform_admin'))$f$,
        'actor_employment_id uuid REFERENCES hr.employment(id)',
        'actor_user_id uuid REFERENCES auth.users(id)',
        'actor_device_id uuid REFERENCES hr.kiosk_device(id)',
        'actor_agent_id uuid',
        'actor_external_ref text',
        'actor_token_id uuid',
        'actor_note text',
        -- {{RETAIN}}
        $f$record_class_key text NOT NULL DEFAULT 'applicant_record' REFERENCES hr.record_class(class_key)$f$,
        'retention_trigger_at timestamptz',
        'legal_hold_count integer NOT NULL DEFAULT 0'
      ],
      p_variant => 'entity', p_versioned => true, p_soft_delete => true, p_visibility => 'personal',
      p_category => false, p_listed => true, p_org_default => false, p_gin_jsonb => false,
      p_parents => null);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'candidate_actor_identified') then
    alter table hr.candidate add constraint candidate_actor_identified check (
      case actor_type
        when 'kiosk_device'    then actor_device_id is not null
        when 'external_signer' then actor_external_ref is not null
        when 'ai_agent'        then actor_agent_id is not null
        when 'integration'     then actor_external_ref is not null
        when 'automation'      then true
        else actor_user_id is not null or actor_employment_id is not null
      end);
  end if;
end $$;

create index if not exists candidate_email_idx on hr.candidate (organization_id, lower(email))
  where deleted_at is null;
create index if not exists candidate_converted_idx on hr.candidate (converted_to_employee_id)
  where converted_to_employee_id is not null;
create index if not exists candidate_custom_gin on hr.candidate using gin (custom jsonb_path_ops);

update platform.entity_types set
  title_column = 'preferred_name', reference_pickable = true,
  taxonomy_node_id = '36aec4a5-c270-4d84-a0e1-979245677d1e'
where token = 'hr_candidate';

-- ============================================================ 11.5 hr.application  (COMP of hr_candidate)
-- rejection_reason_category_id is enforced NOT NULL for a rejected disposition by a CHECK -- the
-- EEOC recordkeeping requirement, made STRUCTURAL rather than a UI validation.
-- consideration_evidence freezes what was actually reviewed at each stage transition.
-- stage_bucket is the closed reporting rollup so an org's custom stage names never break the
-- time-to-hire dashboard.
do $$ begin
  if to_regclass('hr.application') is null then
    perform platform.create_entity_table(
      p_schema => 'hr', p_table => 'application', p_token => 'hr_application',
      p_label => 'Application',
      p_fields => ARRAY[
        'candidate_id uuid NOT NULL REFERENCES hr.candidate(id)',
        'opening_id uuid NOT NULL REFERENCES hr.opening(id)',
        'posting_id uuid REFERENCES hr.posting(id)',
        'applied_at timestamptz NOT NULL DEFAULT now()',
        'stage_category_id uuid REFERENCES platform.categories(id)',
        $f$stage_bucket text NOT NULL DEFAULT 'applied' CHECK (stage_bucket IN ('applied','screening','interviewing','offer','hired','rejected','withdrawn'))$f$,
        'stage_entered_at timestamptz NOT NULL DEFAULT now()',
        $f$disposition text CHECK (disposition IN ('hired','rejected','withdrawn','position_cancelled'))$f$,
        'disposition_at timestamptz',
        'rejection_reason_category_id uuid REFERENCES platform.categories(id)',
        'rejection_reason_note text',
        'rejected_by_employment_id uuid REFERENCES hr.employment(id)',
        $f$screening_answers jsonb NOT NULL DEFAULT '{}'::jsonb$f$,
        $f$consideration_evidence jsonb NOT NULL DEFAULT '{}'::jsonb$f$,
        'accommodation_request_id uuid',
        $f$custom jsonb NOT NULL DEFAULT '{}'::jsonb$f$,
        -- {{ACTOR}}
        $f$actor_type text NOT NULL CHECK (actor_type IN ('employee','manager','hr_admin','kiosk_device','external_signer','integration','automation','ai_agent','platform_admin'))$f$,
        'actor_employment_id uuid REFERENCES hr.employment(id)',
        'actor_user_id uuid REFERENCES auth.users(id)',
        'actor_device_id uuid REFERENCES hr.kiosk_device(id)',
        'actor_agent_id uuid',
        'actor_external_ref text',
        'actor_token_id uuid',
        'actor_note text',
        -- {{RETAIN}}
        $f$record_class_key text NOT NULL DEFAULT 'applicant_record' REFERENCES hr.record_class(class_key)$f$,
        'retention_trigger_at timestamptz',
        'legal_hold_count integer NOT NULL DEFAULT 0'
      ],
      p_variant => 'component', p_versioned => true, p_soft_delete => true, p_visibility => 'none',
      p_category => false, p_listed => false, p_org_default => false, p_gin_jsonb => false,
      p_parents => ARRAY['hr_candidate:candidate_id']);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'application_candidate_opening_unique') then
    alter table hr.application add constraint application_candidate_opening_unique
      unique (candidate_id, opening_id);
  end if;
  -- THE EEOC RECORDKEEPING REQUIREMENT, MADE STRUCTURAL.
  if not exists (select 1 from pg_constraint where conname = 'application_rejection_reasoned') then
    alter table hr.application add constraint application_rejection_reasoned
      check (disposition <> 'rejected' or rejection_reason_category_id is not null);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'application_disposition_dated') then
    alter table hr.application add constraint application_disposition_dated
      check (disposition is null or disposition_at is not null);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'application_actor_identified') then
    alter table hr.application add constraint application_actor_identified check (
      case actor_type
        when 'kiosk_device'    then actor_device_id is not null
        when 'external_signer' then actor_external_ref is not null
        when 'ai_agent'        then actor_agent_id is not null
        when 'integration'     then actor_external_ref is not null
        when 'automation'      then true
        else actor_user_id is not null or actor_employment_id is not null
      end);
  end if;
end $$;

create index if not exists application_opening_idx on hr.application (opening_id, stage_bucket)
  where deleted_at is null;
create index if not exists application_candidate_idx on hr.application (candidate_id, applied_at desc)
  where deleted_at is null;
create index if not exists application_pipeline_idx on hr.application (organization_id, stage_bucket, stage_entered_at)
  where deleted_at is null;
create index if not exists application_custom_gin on hr.application using gin (custom jsonb_path_ops);

update platform.entity_types set taxonomy_node_id = '36aec4a5-c270-4d84-a0e1-979245677d1e'
where token = 'hr_application';

-- ============================================================ 11.6 hr.eeo_response  (CONF, NO-EDGE, aggregate-only)
-- 🚨 THE ONE WALLED HOME FOR SELF-ID, IN BOTH CONTEXTS (ruling 2026-08-26, from P3's build
-- finding). subject_kind discriminates the applicant response from the post-hire employee
-- response. The four self-ID columns an earlier draft placed on hr.employee_private were removed
-- by core tranche 2 and land HERE instead, because platform staff hold ADM on hr_employee_private
-- (SPEC-ACCESS 3.2) and hold NOTHING on this token.
--
-- 🚨 NO entity_relationships edge to hr.application, hr.candidate or hr.employment. If one
-- existed, every recruiter who can read an application -- or every holder of a directory grant --
-- would read the self-ID, which is the exact leak AR 1.15 and bucket-2 item 7 warn about. The
-- employment_id addition makes this NO-EDGE entry twice as load-bearing as before.
--
-- A rehire collects again, which is correct: CONSENT DOES NOT CARRY ACROSS SPELLS.
do $$ begin
  if to_regclass('hr.eeo_response') is null then
    perform platform.create_entity_table(
      p_schema => 'hr', p_table => 'eeo_response', p_token => 'hr_eeo_response',
      p_label => 'EEO self-identification response',
      p_fields => ARRAY[
        $f$subject_kind text NOT NULL DEFAULT 'candidate' CHECK (subject_kind IN ('candidate','employee'))$f$,
        'application_id uuid REFERENCES hr.application(id)',
        'posting_id uuid REFERENCES hr.posting(id)',
        'employment_id uuid REFERENCES hr.employment(id)',
        'gender_category_id uuid REFERENCES platform.categories(id)',
        'ethnicity_category_id uuid REFERENCES platform.categories(id)',
        $f$race_category_ids uuid[] NOT NULL DEFAULT '{}'$f$,
        'veteran_status_category_id uuid REFERENCES platform.categories(id)',
        'disability_status_category_id uuid REFERENCES platform.categories(id)',
        'declined_to_answer boolean NOT NULL DEFAULT false',
        'collected_at timestamptz NOT NULL DEFAULT now()',
        $f$collection_surface text NOT NULL DEFAULT 'apply_form'$f$,
        -- {{ACTOR}}
        $f$actor_type text NOT NULL CHECK (actor_type IN ('employee','manager','hr_admin','kiosk_device','external_signer','integration','automation','ai_agent','platform_admin'))$f$,
        'actor_employment_id uuid REFERENCES hr.employment(id)',
        'actor_user_id uuid REFERENCES auth.users(id)',
        'actor_device_id uuid REFERENCES hr.kiosk_device(id)',
        'actor_agent_id uuid',
        'actor_external_ref text',
        'actor_token_id uuid',
        'actor_note text',
        -- {{RETAIN}}
        $f$record_class_key text NOT NULL DEFAULT 'eeo_response' REFERENCES hr.record_class(class_key)$f$,
        'retention_trigger_at timestamptz',
        'legal_hold_count integer NOT NULL DEFAULT 0'
      ],
      -- p_soft_delete => true: see RECORDED TECHNICAL DECISION 1. Nothing sets deleted_at; the
      -- EEOC disposition record survives even a candidate anonymisation.
      p_variant => 'entity', p_versioned => false, p_soft_delete => true, p_visibility => 'personal',
      p_category => false, p_listed => false, p_org_default => false, p_gin_jsonb => false,
      p_parents => null);
  end if;
end $$;

do $$ begin
  -- Exactly one of the two subject links is set.
  if not exists (select 1 from pg_constraint where conname = 'eeo_response_candidate_link') then
    alter table hr.eeo_response add constraint eeo_response_candidate_link
      check ((subject_kind = 'candidate') = (application_id is not null));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'eeo_response_employee_link') then
    alter table hr.eeo_response add constraint eeo_response_employee_link
      check ((subject_kind = 'employee') = (employment_id is not null));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'eeo_response_actor_identified') then
    alter table hr.eeo_response add constraint eeo_response_actor_identified check (
      case actor_type
        when 'kiosk_device'    then actor_device_id is not null
        when 'external_signer' then actor_external_ref is not null
        when 'ai_agent'        then actor_agent_id is not null
        when 'integration'     then actor_external_ref is not null
        when 'automation'      then true
        else actor_user_id is not null or actor_employment_id is not null
      end);
  end if;
end $$;

-- One response per application, one per employment SPELL.
create unique index if not exists eeo_response_one_per_application
  on hr.eeo_response (application_id) where application_id is not null and deleted_at is null;
create unique index if not exists eeo_response_one_per_employment
  on hr.eeo_response (employment_id) where employment_id is not null and deleted_at is null;
create index if not exists eeo_response_population_idx
  on hr.eeo_response (organization_id, subject_kind, collected_at);

-- 🚨 client_excluded_columns so a generated client cannot join a response back to a person even
-- if it somehow reaches a row. Plus section 18.1a's flag -- without it the platform-admin lane
-- reaches the rows and the move off hr.employee_private buys nothing.
update platform.entity_types set
  client_excluded_columns = ARRAY['application_id','posting_id','employment_id'],
  suppress_platform_admin_lane = true,
  taxonomy_node_id = '36aec4a5-c270-4d84-a0e1-979245677d1e'
where token = 'hr_eeo_response';

do $$ begin
  update platform.entity_types set rls_variant = 'restricted'
   where token = 'hr_eeo_response' and rls_variant is distinct from 'restricted';
  perform iam.apply_rls('hr','eeo_response','hr_eeo_response','restricted');
end $$;

-- ============================================================ 11.16 hr.interview_kit  (DIR)
-- Created before hr.interview so kit_id can carry its FK inline (section 11.16).
-- ONE table, following hr.reference_check.questions's precedent exactly: `questions jsonb`, NO
-- QUESTION TABLE, because a kit is authored and read as a whole and no consumer queries an
-- individual question row.
-- NO VERSION TABLE EITHER. Platform versioning supplies it: the token is is_versioned, so
-- hr.interview_kit.version is bumped by _touch_row and every prior state is in
-- history.row_versions. hr.scorecard.kit_version freezes that integer at submission, which is
-- what makes a two-year-old scorecard still interpretable after the kit was rewritten.
do $$ begin
  if to_regclass('hr.interview_kit') is null then
    perform platform.create_entity_table(
      p_schema => 'hr', p_table => 'interview_kit', p_token => 'hr_interview_kit',
      p_label => 'Interview kit',
      p_fields => ARRAY[
        'name text NOT NULL',
        'job_title_id uuid REFERENCES hr.job_title(id)',
        $f$interview_kind text CHECK (interview_kind IN ('phone_screen','technical','panel','onsite','final','culture','practical'))$f$,
        'purpose text',
        $f$competencies jsonb NOT NULL DEFAULT '[]'::jsonb$f$,
        $f$questions jsonb NOT NULL DEFAULT '[]'::jsonb$f$,
        $f$rating_scale jsonb NOT NULL DEFAULT '{}'::jsonb$f$,
        'guidance_for_interviewer text',
        'estimated_minutes integer',
        'is_active boolean NOT NULL DEFAULT true',
        $f$custom jsonb NOT NULL DEFAULT '{}'::jsonb$f$
      ],
      p_variant => 'entity', p_versioned => true, p_soft_delete => true, p_visibility => 'personal',
      p_category => true, p_listed => true, p_org_default => false, p_gin_jsonb => false,
      p_parents => null);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'interview_kit_name_unique') then
    alter table hr.interview_kit add constraint interview_kit_name_unique unique (organization_id, name);
  end if;
end $$;

create index if not exists interview_kit_active_idx on hr.interview_kit (organization_id, is_active)
  where deleted_at is null;
create index if not exists interview_kit_custom_gin on hr.interview_kit using gin (custom jsonb_path_ops);

update platform.entity_types set
  title_column = 'name', reference_pickable = true,
  taxonomy_node_id = '36aec4a5-c270-4d84-a0e1-979245677d1e'
where token = 'hr_interview_kit';

-- ============================================================ 11.7 hr.interview  (COMP of hr_application)
-- AR2's interview logistics in full: self-scheduling with the CANDIDATE'S timezone retained,
-- interviewer replacement kept as HISTORY rather than overwritten, structured kits, blind
-- feedback, and an overdue clock (feedback_due_at drives the reminder).
do $$ begin
  if to_regclass('hr.interview') is null then
    perform platform.create_entity_table(
      p_schema => 'hr', p_table => 'interview', p_token => 'hr_interview', p_label => 'Interview',
      p_fields => ARRAY[
        'application_id uuid NOT NULL REFERENCES hr.application(id)',
        'round_number integer NOT NULL DEFAULT 1',
        $f$interview_kind text NOT NULL DEFAULT 'panel' CHECK (interview_kind IN ('phone_screen','technical','panel','onsite','final','culture','practical'))$f$,
        'kit_id uuid REFERENCES hr.interview_kit(id)',
        'scheduled_start_at timestamptz',
        'scheduled_end_at timestamptz',
        'candidate_tz text',
        $f$interviewer_employment_ids uuid[] NOT NULL DEFAULT '{}'$f$,
        $f$replaced_interviewer_employment_ids uuid[] NOT NULL DEFAULT '{}'$f$,
        'self_scheduled boolean NOT NULL DEFAULT false',
        'self_schedule_token_ref text',
        'location_text text',
        'meeting_url text',
        $f$state text NOT NULL DEFAULT 'proposed' CHECK (state IN ('proposed','scheduled','rescheduled','completed','no_show_candidate','no_show_interviewer','cancelled'))$f$,
        'rescheduled_from_id uuid',
        'feedback_due_at timestamptz',
        'feedback_blind_until_submitted boolean NOT NULL DEFAULT true',
        'debrief_note text',
        'debrief_at timestamptz'
      ],
      p_variant => 'component', p_versioned => true, p_soft_delete => true, p_visibility => 'none',
      p_category => false, p_listed => false, p_org_default => false, p_gin_jsonb => false,
      p_parents => ARRAY['hr_application:application_id']);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'interview_round_unique') then
    alter table hr.interview add constraint interview_round_unique unique (application_id, round_number);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'interview_window_ordered') then
    alter table hr.interview add constraint interview_window_ordered
      check (scheduled_end_at is null or scheduled_start_at is null or scheduled_end_at > scheduled_start_at);
  end if;
end $$;

create index if not exists interview_application_idx on hr.interview (application_id, round_number)
  where deleted_at is null;
create index if not exists interview_feedback_due_idx on hr.interview (organization_id, feedback_due_at)
  where feedback_due_at is not null and state = 'completed' and deleted_at is null;

update platform.entity_types set taxonomy_node_id = '36aec4a5-c270-4d84-a0e1-979245677d1e'
where token = 'hr_interview';

-- ============================================================ 11.8 hr.scorecard  (COMP of hr_interview)
-- BLIND UNTIL SUBMITTED is enforced by the read RPC, not by RLS: it returns other interviewers'
-- rows only when the caller's OWN row has submitted_at is not null, and the client never queries
-- the table directly for a scorecard it did not write.
do $$ begin
  if to_regclass('hr.scorecard') is null then
    perform platform.create_entity_table(
      p_schema => 'hr', p_table => 'scorecard', p_token => 'hr_scorecard', p_label => 'Scorecard',
      p_fields => ARRAY[
        'interview_id uuid NOT NULL REFERENCES hr.interview(id)',
        'interviewer_employment_id uuid NOT NULL REFERENCES hr.employment(id)',
        'kit_version text',
        $f$responses jsonb NOT NULL DEFAULT '{}'::jsonb$f$,
        $f$overall_rating text CHECK (overall_rating IN ('strong_no','no','mixed','yes','strong_yes'))$f$,
        $f$recommendation text CHECK (recommendation IN ('advance','hold','reject'))$f$,
        'strengths text',
        'concerns text',
        'submitted_at timestamptz',
        'is_draft boolean NOT NULL DEFAULT true'
      ],
      p_variant => 'component', p_versioned => true, p_soft_delete => true, p_visibility => 'none',
      p_category => false, p_listed => false, p_org_default => false, p_gin_jsonb => false,
      p_parents => ARRAY['hr_interview:interview_id']);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'scorecard_one_per_interviewer') then
    alter table hr.scorecard add constraint scorecard_one_per_interviewer
      unique (interview_id, interviewer_employment_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'scorecard_submitted_not_draft') then
    alter table hr.scorecard add constraint scorecard_submitted_not_draft
      check (submitted_at is null or not is_draft);
  end if;
end $$;

create index if not exists scorecard_interview_idx on hr.scorecard (interview_id) where deleted_at is null;

update platform.entity_types set taxonomy_node_id = '36aec4a5-c270-4d84-a0e1-979245677d1e'
where token = 'hr_scorecard';

-- ============================================================ 11.9 hr.offer  (CONF, pay)
-- The full AR2 lifecycle INCLUDING the four states that are usually missing -- countered,
-- withdrawn, rescinded, expired -- plus revision chaining, the range guardrail with a reasoned
-- exception, and the start-date change kept as history.
do $$ begin
  if to_regclass('hr.offer') is null then
    perform platform.create_entity_table(
      p_schema => 'hr', p_table => 'offer', p_token => 'hr_offer', p_label => 'Offer',
      p_fields => ARRAY[
        'application_id uuid NOT NULL REFERENCES hr.application(id)',
        'opening_id uuid NOT NULL REFERENCES hr.opening(id)',
        'revision_number integer NOT NULL DEFAULT 1',
        'supersedes_offer_id uuid',
        'job_title_id uuid NOT NULL REFERENCES hr.job_title(id)',
        'department_id uuid REFERENCES hr.department(id)',
        'location_id uuid REFERENCES hr.location(id)',
        'manager_employment_id uuid REFERENCES hr.employment(id)',
        $f$worker_class text NOT NULL CHECK (worker_class IN ('employee','contractor','intern','seasonal','volunteer'))$f$,
        $f$flsa_status text CHECK (flsa_status IN ('exempt','nonexempt'))$f$,
        $f$pay_basis text NOT NULL CHECK (pay_basis IN ('hourly','salary','piece','commission','contract'))$f$,
        'amount numeric(14,4) NOT NULL',
        $f$currency text NOT NULL DEFAULT 'USD'$f$,
        'per_unit text',
        'fte numeric(5,4) NOT NULL DEFAULT 1.0',
        $f$variable_pay jsonb NOT NULL DEFAULT '{}'::jsonb$f$,
        'signing_bonus numeric(14,2)',
        $f$range_guardrail_state text NOT NULL DEFAULT 'within' CHECK (range_guardrail_state IN ('within','above','below','no_range'))$f$,
        'range_exception_reason text',
        'start_on date',
        'start_on_changed_from date',
        'is_conditional boolean NOT NULL DEFAULT false',
        $f$conditions jsonb NOT NULL DEFAULT '[]'::jsonb$f$,
        'expires_at timestamptz',
        $f$state text NOT NULL DEFAULT 'draft' CHECK (state IN ('draft','pending_approval','approved','sent','viewed','countered','revised','accepted','declined','withdrawn','rescinded','expired'))$f$,
        $f$counter_offer jsonb NOT NULL DEFAULT '{}'::jsonb$f$,
        'workflow_instance_id uuid',
        'approved_at timestamptz',
        'approved_by_employment_id uuid REFERENCES hr.employment(id)',
        'sent_at timestamptz',
        'responded_at timestamptz',
        'decline_reason_category_id uuid REFERENCES platform.categories(id)',
        'rescind_reason text',
        'esign_request_id uuid',
        'offer_letter_file_id uuid REFERENCES files.files(id)',
        -- {{RETAIN}}
        $f$record_class_key text NOT NULL DEFAULT 'applicant_record' REFERENCES hr.record_class(class_key)$f$,
        'retention_trigger_at timestamptz',
        'legal_hold_count integer NOT NULL DEFAULT 0'
      ],
      p_variant => 'entity', p_versioned => true, p_soft_delete => true, p_visibility => 'personal',
      p_category => false, p_listed => false, p_org_default => false, p_gin_jsonb => false,
      p_parents => null);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'offer_revision_unique') then
    alter table hr.offer add constraint offer_revision_unique unique (application_id, revision_number);
  end if;
  -- A guardrail exception must be reasoned, or it is not a guardrail.
  if not exists (select 1 from pg_constraint where conname = 'offer_range_exception_reasoned') then
    alter table hr.offer add constraint offer_range_exception_reasoned
      check (range_guardrail_state in ('within','no_range') or range_exception_reason is not null);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'offer_rescind_reasoned') then
    alter table hr.offer add constraint offer_rescind_reasoned
      check (state <> 'rescinded' or rescind_reason is not null);
  end if;
end $$;

create index if not exists offer_application_idx on hr.offer (application_id, revision_number desc)
  where deleted_at is null;
create index if not exists offer_state_idx on hr.offer (organization_id, state, expires_at)
  where deleted_at is null;

-- section 18.1a: PAY (D19).
update platform.entity_types set
  suppress_platform_admin_lane = true,
  taxonomy_node_id = '36aec4a5-c270-4d84-a0e1-979245677d1e'
where token = 'hr_offer';

do $$ begin
  update platform.entity_types set rls_variant = 'restricted'
   where token = 'hr_offer' and rls_variant is distinct from 'restricted';
  perform iam.apply_rls('hr','offer','hr_offer','restricted');
end $$;

-- ============================================================ 11.10 hr.reference_check  (CONF)
-- The referee answers through the outsider token lane. Free-text impressions that must not reach
-- the hiring manager go to hr.restricted_note.
do $$ begin
  if to_regclass('hr.reference_check') is null then
    perform platform.create_entity_table(
      p_schema => 'hr', p_table => 'reference_check', p_token => 'hr_reference_check',
      p_label => 'Reference check',
      p_fields => ARRAY[
        'application_id uuid NOT NULL REFERENCES hr.application(id)',
        'referee_name text NOT NULL',
        'referee_relationship text',
        'referee_company text',
        'referee_email text',
        'referee_phone text',
        'candidate_consent_at timestamptz',
        $f$candidate_consent_evidence jsonb NOT NULL DEFAULT '{}'::jsonb$f$,
        'requested_at timestamptz',
        'reminder_count integer NOT NULL DEFAULT 0',
        'last_reminder_at timestamptz',
        'responded_at timestamptz',
        $f$response_channel text CHECK (response_channel IN ('form','email','phone','written'))$f$,
        $f$questions jsonb NOT NULL DEFAULT '[]'::jsonb$f$,
        $f$responses jsonb NOT NULL DEFAULT '{}'::jsonb$f$,
        'restricted_note_id uuid REFERENCES hr.restricted_note(id)',
        $f$state text NOT NULL DEFAULT 'requested' CHECK (state IN ('draft','requested','reminded','completed','declined','unreachable','waived'))$f$,
        'outsider_token_ref text',
        -- {{ACTOR}}
        $f$actor_type text NOT NULL CHECK (actor_type IN ('employee','manager','hr_admin','kiosk_device','external_signer','integration','automation','ai_agent','platform_admin'))$f$,
        'actor_employment_id uuid REFERENCES hr.employment(id)',
        'actor_user_id uuid REFERENCES auth.users(id)',
        'actor_device_id uuid REFERENCES hr.kiosk_device(id)',
        'actor_agent_id uuid',
        'actor_external_ref text',
        'actor_token_id uuid',
        'actor_note text',
        -- {{RETAIN}}
        $f$record_class_key text NOT NULL DEFAULT 'applicant_record' REFERENCES hr.record_class(class_key)$f$,
        'retention_trigger_at timestamptz',
        'legal_hold_count integer NOT NULL DEFAULT 0'
      ],
      p_variant => 'entity', p_versioned => true, p_soft_delete => true, p_visibility => 'personal',
      p_category => false, p_listed => false, p_org_default => false, p_gin_jsonb => false,
      p_parents => null);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'reference_check_actor_identified') then
    alter table hr.reference_check add constraint reference_check_actor_identified check (
      case actor_type
        when 'kiosk_device'    then actor_device_id is not null
        when 'external_signer' then actor_external_ref is not null
        when 'ai_agent'        then actor_agent_id is not null
        when 'integration'     then actor_external_ref is not null
        when 'automation'      then true
        else actor_user_id is not null or actor_employment_id is not null
      end);
  end if;
end $$;

create index if not exists reference_check_application_idx on hr.reference_check (application_id, state)
  where deleted_at is null;

-- NOT flagged: not on section 18.1a's list. Raw impressions live in hr.restricted_note, which is.
update platform.entity_types set taxonomy_node_id = '36aec4a5-c270-4d84-a0e1-979245677d1e'
where token = 'hr_reference_check';

do $$ begin
  if (select rls_variant from platform.entity_types where token = 'hr_reference_check') is distinct from 'restricted' then
    update platform.entity_types set rls_variant = 'restricted' where token = 'hr_reference_check';
    perform iam.apply_rls('hr','reference_check','hr_reference_check','restricted');
  end if;
end $$;

-- ============================================================ 11.11 hr.background_check  (CONF, D12)
-- D12's plumbing, complete, WITH THE PROVIDER AS A DECLARED BLACK BOX. outbound_* is the edge
-- out; inbound_* is the edge in; path='manual' lets an org run its own service today and record
-- the confirmations. Filling the box later is a provider_key and an adapter, nothing
-- schema-shaped. 🚨 THIS SEAM PATTERN IS THE TEMPLATE FOR EVERY PROVIDER INTEGRATION -- payroll
-- processors, benefits carriers, E-Verify.
-- The FCRA adverse-action sequence is A WORKFLOW, NOT A CHECKBOX: standalone disclosure,
-- authorization, pre-adverse notice with the report copy and summary of rights, the waiting
-- period, then the adverse notice -- each with its own timestamp and evidence blob. Raw results
-- live in hr.restricted_note, never in a column a recruiter can read.
do $$ begin
  if to_regclass('hr.background_check') is null then
    perform platform.create_entity_table(
      p_schema => 'hr', p_table => 'background_check', p_token => 'hr_background_check',
      p_label => 'Background check',
      p_fields => ARRAY[
        'application_id uuid REFERENCES hr.application(id)',
        'employment_id uuid REFERENCES hr.employment(id)',
        $f$package_kind text NOT NULL CHECK (package_kind IN ('identity','criminal','employment_verification','education','credit','mvr','drug_screen','sanctions','custom'))$f$,
        'package_name text',
        $f$path text NOT NULL DEFAULT 'manual' CHECK (path IN ('manual','provider'))$f$,
        'provider_key text',
        'provider_account_ref text',
        'disclosure_document_file_id uuid REFERENCES files.files(id)',
        'disclosure_presented_at timestamptz',
        'authorization_esign_request_id uuid',
        'authorized_at timestamptz',
        $f$authorization_evidence jsonb NOT NULL DEFAULT '{}'::jsonb$f$,
        'outbound_sent_at timestamptz',
        'outbound_request_ref text',
        $f$outbound_payload_summary jsonb NOT NULL DEFAULT '{}'::jsonb$f$,
        'inbound_received_at timestamptz',
        'inbound_result_ref text',
        'inbound_result_file_id uuid REFERENCES files.files(id)',
        'restricted_note_id uuid REFERENCES hr.restricted_note(id)',
        $f$status text NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started','disclosure_sent','authorized','requested','in_progress','completed','cancelled','failed'))$f$,
        $f$result_summary text CHECK (result_summary IN ('clear','consider','ineligible','incomplete'))$f$,
        $f$adjudication text CHECK (adjudication IN ('pending','engaged','cleared','adverse'))$f$,
        'adjudicated_at timestamptz',
        'adjudicated_by_employment_id uuid REFERENCES hr.employment(id)',
        'pre_adverse_sent_at timestamptz',
        $f$pre_adverse_evidence jsonb NOT NULL DEFAULT '{}'::jsonb$f$,
        'candidate_response_deadline_at timestamptz',
        'candidate_response_at timestamptz',
        'candidate_response_note text',
        'adverse_action_sent_at timestamptz',
        $f$adverse_action_evidence jsonb NOT NULL DEFAULT '{}'::jsonb$f$,
        -- {{RETAIN}}
        $f$record_class_key text NOT NULL DEFAULT 'background_check' REFERENCES hr.record_class(class_key)$f$,
        'retention_trigger_at timestamptz',
        'legal_hold_count integer NOT NULL DEFAULT 0'
      ],
      p_variant => 'entity', p_versioned => true, p_soft_delete => true, p_visibility => 'personal',
      p_category => false, p_listed => false, p_org_default => false, p_gin_jsonb => false,
      p_parents => null);
  end if;
end $$;

do $$ begin
  -- background checks also run post-hire for role changes
  if not exists (select 1 from pg_constraint where conname = 'background_check_subject_present') then
    alter table hr.background_check add constraint background_check_subject_present
      check (application_id is not null or employment_id is not null);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'background_check_provider_keyed') then
    alter table hr.background_check add constraint background_check_provider_keyed
      check (path <> 'provider' or provider_key is not null);
  end if;
end $$;

create index if not exists background_check_application_idx on hr.background_check (application_id)
  where application_id is not null and deleted_at is null;
create index if not exists background_check_adverse_idx
  on hr.background_check (organization_id, candidate_response_deadline_at)
  where pre_adverse_sent_at is not null and adverse_action_sent_at is null and deleted_at is null;

update platform.entity_types set taxonomy_node_id = '36aec4a5-c270-4d84-a0e1-979245677d1e'
where token = 'hr_background_check';

do $$ begin
  if (select rls_variant from platform.entity_types where token = 'hr_background_check') is distinct from 'restricted' then
    update platform.entity_types set rls_variant = 'restricted' where token = 'hr_background_check';
    perform iam.apply_rls('hr','background_check','hr_background_check','restricted');
  end if;
end $$;

-- ============================================================ 11.12 hr.candidate_message  (COMP)
-- Append-only. AR2's candidate communication ledger, riding the platform email/SMS spine rather
-- than a bespoke mailer.
do $$ begin
  if to_regclass('hr.candidate_message') is null then
    perform platform.create_entity_table(
      p_schema => 'hr', p_table => 'candidate_message', p_token => 'hr_candidate_message',
      p_label => 'Candidate message',
      p_fields => ARRAY[
        'candidate_id uuid NOT NULL REFERENCES hr.candidate(id)',
        'application_id uuid REFERENCES hr.application(id)',
        $f$direction text NOT NULL CHECK (direction IN ('outbound','inbound'))$f$,
        $f$channel text NOT NULL CHECK (channel IN ('email','sms','portal','phone_log'))$f$,
        $f$message_kind text NOT NULL CHECK (message_kind IN ('acknowledgement','screening_invite','interview_invite','reschedule','reminder','offer','rejection','status_update','reference_request','background_notice','other'))$f$,
        'template_key text',
        'template_version text',
        'subject text',
        'body_preview text',
        'notification_id uuid REFERENCES communication.notification(id)',
        'external_message_ref text',
        'sent_at timestamptz',
        'delivered_at timestamptz',
        'opened_at timestamptz',
        'replied_at timestamptz',
        'bounced_at timestamptz',
        'failure_reason text',
        'no_show_flag boolean NOT NULL DEFAULT false',
        -- {{ACTOR}}
        $f$actor_type text NOT NULL CHECK (actor_type IN ('employee','manager','hr_admin','kiosk_device','external_signer','integration','automation','ai_agent','platform_admin'))$f$,
        'actor_employment_id uuid REFERENCES hr.employment(id)',
        'actor_user_id uuid REFERENCES auth.users(id)',
        'actor_device_id uuid REFERENCES hr.kiosk_device(id)',
        'actor_agent_id uuid',
        'actor_external_ref text',
        'actor_token_id uuid',
        'actor_note text'
      ],
      p_variant => 'component', p_versioned => false, p_soft_delete => false, p_visibility => 'none',
      p_category => false, p_listed => false, p_org_default => false, p_gin_jsonb => false,
      p_parents => ARRAY['hr_candidate:candidate_id']);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'candidate_message_actor_identified') then
    alter table hr.candidate_message add constraint candidate_message_actor_identified check (
      case actor_type
        when 'kiosk_device'    then actor_device_id is not null
        when 'external_signer' then actor_external_ref is not null
        when 'ai_agent'        then actor_agent_id is not null
        when 'integration'     then actor_external_ref is not null
        when 'automation'      then true
        else actor_user_id is not null or actor_employment_id is not null
      end);
  end if;
end $$;

drop trigger if exists _zz_candidate_message_no_delete on hr.candidate_message;
create trigger _zz_candidate_message_no_delete before delete on hr.candidate_message
  for each row execute function hr._reject_delete();

create index if not exists candidate_message_candidate_idx on hr.candidate_message (candidate_id, sent_at desc);
create index if not exists candidate_message_bounced_idx on hr.candidate_message (organization_id, bounced_at)
  where bounced_at is not null;

update platform.entity_types set taxonomy_node_id = '36aec4a5-c270-4d84-a0e1-979245677d1e'
where token = 'hr_candidate_message';

-- ============================================================ 11.13 hr.accommodation_request  (CONF)
-- AR2: APPLICANT ACCOMMODATION INTAKE THAT NEVER REACHES INTERVIEWERS. SPEC-ACCESS's derivation
-- grants the accommodation coordinator role only; interviewers get nothing, and the medical basis
-- is in hr.restricted_note.
do $$ begin
  if to_regclass('hr.accommodation_request') is null then
    perform platform.create_entity_table(
      p_schema => 'hr', p_table => 'accommodation_request', p_token => 'hr_accommodation_request',
      p_label => 'Accommodation request',
      p_fields => ARRAY[
        $f$subject_kind text NOT NULL CHECK (subject_kind IN ('applicant','employee'))$f$,
        'application_id uuid REFERENCES hr.application(id)',
        'employment_id uuid REFERENCES hr.employment(id)',
        'requested_at timestamptz NOT NULL DEFAULT now()',
        'request_summary text NOT NULL',
        $f$interactive_process_log jsonb NOT NULL DEFAULT '[]'::jsonb$f$,
        'restricted_note_id uuid REFERENCES hr.restricted_note(id)',
        $f$state text NOT NULL DEFAULT 'received' CHECK (state IN ('received','in_process','granted','partially_granted','denied','withdrawn','expired'))$f$,
        'accommodation_provided text',
        'effective_from date',
        'effective_to date',
        'review_on date',
        'decided_at timestamptz',
        'decided_by_employment_id uuid REFERENCES hr.employment(id)',
        'denial_basis text',
        'leave_case_id uuid REFERENCES hr.leave_case(id)',
        -- {{RETAIN}}
        $f$record_class_key text NOT NULL DEFAULT 'applicant_record' REFERENCES hr.record_class(class_key)$f$,
        'retention_trigger_at timestamptz',
        'legal_hold_count integer NOT NULL DEFAULT 0'
      ],
      p_variant => 'entity', p_versioned => true, p_soft_delete => true, p_visibility => 'personal',
      p_category => false, p_listed => false, p_org_default => false, p_gin_jsonb => false,
      p_parents => null);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'accommodation_request_applicant_link') then
    alter table hr.accommodation_request add constraint accommodation_request_applicant_link
      check ((subject_kind = 'applicant') = (application_id is not null));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'accommodation_request_window_ordered') then
    alter table hr.accommodation_request add constraint accommodation_request_window_ordered
      check (effective_to is null or effective_from is null or effective_to >= effective_from);
  end if;
end $$;

create index if not exists accommodation_request_state_idx
  on hr.accommodation_request (organization_id, state, review_on) where deleted_at is null;

-- section 18.1a: medical / accommodation.
update platform.entity_types set
  suppress_platform_admin_lane = true,
  taxonomy_node_id = '36aec4a5-c270-4d84-a0e1-979245677d1e'
where token = 'hr_accommodation_request';

do $$ begin
  update platform.entity_types set rls_variant = 'restricted'
   where token = 'hr_accommodation_request' and rls_variant is distinct from 'restricted';
  perform iam.apply_rls('hr','accommodation_request','hr_accommodation_request','restricted');
end $$;

-- ============================================================ 11.14 hr.candidate_conversion  (COMP)
-- AR B2.7 / bucket-2 item 7, MADE A RECORD RATHER THAN A PROMISE. The conversion runs
-- hr.convert_candidate(...) with a versioned field map whose DENY LIST IS COMPILED INTO THE
-- FUNCTION, NOT CONFIGURED: interview notes, scorecards, EEO self-ID, accommodation data,
-- background-check results, reference notes and rejection history. Every conversion writes this
-- row showing exactly what crossed and what was refused, so an audit can prove the wall held.
do $$ begin
  if to_regclass('hr.candidate_conversion') is null then
    perform platform.create_entity_table(
      p_schema => 'hr', p_table => 'candidate_conversion', p_token => 'hr_candidate_conversion',
      p_label => 'Candidate conversion',
      p_fields => ARRAY[
        'candidate_id uuid NOT NULL REFERENCES hr.candidate(id)',
        'application_id uuid NOT NULL REFERENCES hr.application(id)',
        'offer_id uuid REFERENCES hr.offer(id)',
        'employee_id uuid NOT NULL REFERENCES hr.employee(id)',
        'employment_id uuid NOT NULL REFERENCES hr.employment(id)',
        'field_map_version text NOT NULL',
        $f$copied_fields jsonb NOT NULL DEFAULT '{}'::jsonb$f$,
        $f$denied_fields text[] NOT NULL DEFAULT '{}'$f$,
        'converted_at timestamptz NOT NULL DEFAULT now()',
        -- {{ACTOR}}
        $f$actor_type text NOT NULL CHECK (actor_type IN ('employee','manager','hr_admin','kiosk_device','external_signer','integration','automation','ai_agent','platform_admin'))$f$,
        'actor_employment_id uuid REFERENCES hr.employment(id)',
        'actor_user_id uuid REFERENCES auth.users(id)',
        'actor_device_id uuid REFERENCES hr.kiosk_device(id)',
        'actor_agent_id uuid',
        'actor_external_ref text',
        'actor_token_id uuid',
        'actor_note text'
      ],
      p_variant => 'component', p_versioned => true, p_soft_delete => false, p_visibility => 'none',
      p_category => false, p_listed => false, p_org_default => false, p_gin_jsonb => false,
      p_parents => ARRAY['hr_candidate:candidate_id']);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'candidate_conversion_one_per_application') then
    alter table hr.candidate_conversion add constraint candidate_conversion_one_per_application
      unique (application_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'candidate_conversion_actor_identified') then
    alter table hr.candidate_conversion add constraint candidate_conversion_actor_identified check (
      case actor_type
        when 'kiosk_device'    then actor_device_id is not null
        when 'external_signer' then actor_external_ref is not null
        when 'ai_agent'        then actor_agent_id is not null
        when 'integration'     then actor_external_ref is not null
        when 'automation'      then true
        else actor_user_id is not null or actor_employment_id is not null
      end);
  end if;
end $$;

create index if not exists candidate_conversion_employment_idx on hr.candidate_conversion (employment_id);

update platform.entity_types set taxonomy_node_id = '36aec4a5-c270-4d84-a0e1-979245677d1e'
where token = 'hr_candidate_conversion';

-- ============================================================ 11.15 hr.ai_evidence  (CONF, polymorphic)
-- 🚨 THE SUGGESTION AND THE HUMAN DECISION ARE SEPARATE COLUMNS AND THE SUGGESTION IS NEVER
-- OVERWRITTEN (AD-11). Polymorphic subject_token/subject_id with NO entity_relationships edge;
-- access is the derived grant set of the subject. Rejected: a `component` with multiple
-- p_parents -- multi-parent component policy generation is unproven on this platform and the
-- subject set will grow.
-- sensitivity_ceiling is AR B2.20's AI ceiling, stored per suggestion so an audit can see what
-- the Provision was allowed to read. NO PROVISION MAY INCLUDE EEO, MEDICAL OR INVESTIGATION
-- DATA; `confidential` is the highest value the CHECK permits and there is deliberately no
-- `restricted` value.
-- 🚨 CANDIDATE AUTO-REJECTION NEVER EXISTS UNDER ANY autonomy_mode -- enforced in
-- hr.application's transition trigger (SPEC-AI / L12), which refuses a `rejected` disposition
-- whose {{ACTOR}} is ai_agent or automation.
do $$ begin
  if to_regclass('hr.ai_evidence') is null then
    perform platform.create_entity_table(
      p_schema => 'hr', p_table => 'ai_evidence', p_token => 'hr_ai_evidence',
      p_label => 'AI evidence',
      p_fields => ARRAY[
        'subject_token text NOT NULL',
        'subject_id uuid NOT NULL',
        'mandate_key text NOT NULL',
        'surface text NOT NULL',
        'criteria_version text',
        $f$criteria_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb$f$,
        $f$candidates_considered jsonb NOT NULL DEFAULT '[]'::jsonb$f$,
        $f$suggestion jsonb NOT NULL DEFAULT '{}'::jsonb$f$,
        'explanation text',
        'output_kind text',
        'model_ref text',
        'agent_ref text',
        'agent_version text',
        $f$autonomy_mode text NOT NULL CHECK (autonomy_mode IN ('apply_final','recommend','review_and_comment','off'))$f$,
        $f$sensitivity_ceiling text NOT NULL DEFAULT 'internal' CHECK (sensitivity_ceiling IN ('public','internal','confidential'))$f$,
        $f$human_decision text CHECK (human_decision IN ('accepted','modified','rejected','ignored'))$f$,
        'human_decision_at timestamptz',
        'human_decision_by_employment_id uuid REFERENCES hr.employment(id)',
        'override_note text',
        'suggested_at timestamptz NOT NULL DEFAULT now()',
        -- {{RETAIN}}
        $f$record_class_key text NOT NULL DEFAULT 'ai_evidence' REFERENCES hr.record_class(class_key)$f$,
        'retention_trigger_at timestamptz',
        'legal_hold_count integer NOT NULL DEFAULT 0'
      ],
      -- p_soft_delete => true: RECORDED TECHNICAL DECISION 1. AD-11 keeps the suggestion and the
      -- human decision together or not at all; nothing sets deleted_at.
      p_variant => 'entity', p_versioned => false, p_soft_delete => true, p_visibility => 'personal',
      p_category => false, p_listed => false, p_org_default => false, p_gin_jsonb => false,
      p_parents => null);
  end if;
end $$;

create index if not exists ai_evidence_subject_idx on hr.ai_evidence (subject_token, subject_id)
  where deleted_at is null;
create index if not exists ai_evidence_mandate_idx on hr.ai_evidence (organization_id, mandate_key, suggested_at desc);

update platform.entity_types set taxonomy_node_id = '36aec4a5-c270-4d84-a0e1-979245677d1e'
where token = 'hr_ai_evidence';

do $$ begin
  if (select rls_variant from platform.entity_types where token = 'hr_ai_evidence') is distinct from 'restricted' then
    update platform.entity_types set rls_variant = 'restricted' where token = 'hr_ai_evidence';
    perform iam.apply_rls('hr','ai_evidence','hr_ai_evidence','restricted');
  end if;
end $$;

-- ============================================================ 11.18 hr.posting_publication  (COMP of hr_posting)
-- Publication state is PER CHANNEL, because "published" is not one fact: a posting can be live on
-- the hosted portal, paused on the widget, expired on a board and never sent to an agency.
-- Without this table hr.posting.state would have to mean all of them at once, and source-of-hire
-- reporting would have nothing to reconcile against.
do $$ begin
  if to_regclass('hr.posting_publication') is null then
    perform platform.create_entity_table(
      p_schema => 'hr', p_table => 'posting_publication', p_token => 'hr_posting_publication',
      p_label => 'Posting publication',
      p_fields => ARRAY[
        'posting_id uuid NOT NULL REFERENCES hr.posting(id)',
        $f$channel text NOT NULL CHECK (channel IN ('careers_portal','widget','job_board','social','internal','referral','agency'))$f$,
        'channel_ref text',
        'careers_portal_id uuid REFERENCES hr.careers_portal(id)',
        'external_url text',
        'external_posting_id text',
        $f$state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','published','paused','expired','removed','failed'))$f$,
        'published_at timestamptz',
        'expires_at timestamptz',
        'removed_at timestamptz',
        'failure_reason text',
        'view_count integer NOT NULL DEFAULT 0',
        'apply_start_count integer NOT NULL DEFAULT 0',
        'application_count integer NOT NULL DEFAULT 0',
        'last_synced_at timestamptz'
      ],
      p_variant => 'component', p_versioned => true, p_soft_delete => true, p_visibility => 'none',
      p_category => false, p_listed => false, p_org_default => false, p_gin_jsonb => false,
      p_parents => ARRAY['hr_posting:posting_id']);
  end if;
end $$;

-- unique (posting_id, channel, coalesce(channel_ref,'')) via a unique index on the expression
create unique index if not exists posting_publication_channel_unique
  on hr.posting_publication (posting_id, channel, coalesce(channel_ref, ''));
create index if not exists posting_publication_state_idx
  on hr.posting_publication (organization_id, state, published_at desc);

update platform.entity_types set taxonomy_node_id = '36aec4a5-c270-4d84-a0e1-979245677d1e'
where token = 'hr_posting_publication';

-- ============================================================ 17.2 THE ONE CONTAINMENT EDGE
-- Safe because conveyance runs CHILD -> PARENT: requisition-access reaches the posting (which is
-- already public), never the reverse. hr_posting must NOT be a composition child.
insert into platform.entity_relationships (parent_type, child_type, fk_column, kind, note)
values ('hr_requisition','hr_posting','requisition_id','containment',
        'a posting is published from a requisition but is public and owns its own access')
on conflict do nothing;

-- ============================================================ the deferred FK owed by file 04
-- hr.position_assignment.requisition_id -- the workforce-planning hook that closes the
-- plan-versus-filled loop (AR2 stage-two "positions distinct from people"). Plain FK, NO-EDGE.
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'position_assignment_requisition_fk') then
    alter table hr.position_assignment add constraint position_assignment_requisition_fk
      foreign key (requisition_id) references hr.requisition(id);
  end if;
end $$;

create index if not exists position_assignment_requisition_idx on hr.position_assignment (requisition_id)
  where requisition_id is not null and deleted_at is null;

-- ============================================================ 11.6 hr.eeo_aggregate
-- 🚨 THE ONLY SANCTIONED READ OF hr.eeo_response. Even the compliance role has no row-level lane,
-- so this door has to exist the moment the table does or someone will invent a second one.
--
-- Three properties, all load-bearing:
--  1. SMALL-CELL SUPPRESSION at hr.hiring.eeo_min_cell (default 5, section 19.2, seeded in file
--     14). Per D13 a missing knob RAISES rather than falling back to a constant -- an EEO report
--     that silently used a hardcoded minimum would be a re-identification risk wearing a
--     compliance label. See RECORDED TECHNICAL DECISION 2.
--  2. COMPLEMENTARY SUPPRESSION. Suppressing only the small cells leaks them anyway: if the total
--     is known, one suppressed cell is a subtraction away. So whenever any cell is suppressed,
--     the smallest surviving cell is suppressed too.
--  3. POPULATION-PARAMETERISED, serving BOTH subject_kind values -- which is what makes the EEO-1
--     employee report runnable from the same door as the applicant-flow report.
--
-- 🚨 OWED TO FILE 13: this function must also write an hr.access_audit row (`bulk_read`), the
-- same obligation hr.blended_labor_rate carries in section 4.6. hr.access_audit is file 13; the
-- call site is marked below.
create or replace function hr.eeo_aggregate(
  p_dimension  text,
  p_population jsonb default '{}'::jsonb,
  p_as_of      date default current_date)
returns table(bucket_id uuid, headcount integer, suppressed boolean)
language plpgsql stable security definer set search_path = hr, public
as $fn$
declare
  v_min_cell integer;
  v_org      uuid;
  v_kind     text;
begin
  if p_dimension not in ('gender','ethnicity','race','veteran','disability') then
    raise exception 'hr.eeo_aggregate: unknown dimension %', p_dimension using errcode = '22023';
  end if;

  -- D13: a missing knob RAISES. This function is inert until file 14 seeds hr.hiring.
  select (value #>> '{}')::integer into v_min_cell
    from platform.feature_knob where feature = 'hr.hiring' and key = 'eeo_min_cell';
  if v_min_cell is null then
    raise exception
      'hr.eeo_aggregate: knob hr.hiring.eeo_min_cell is not seeded; EEO aggregates are refused rather than computed against a hardcoded minimum cell (D13, SPEC-DATA-MODEL 19.2, file 14)'
      using errcode = 'P0001';
  end if;

  v_org  := nullif(p_population ->> 'organization_id','')::uuid;
  v_kind := coalesce(p_population ->> 'subject_kind', 'candidate');

  return query
  with pop as (
    select r.*
      from hr.eeo_response r
     where r.deleted_at is null
       and r.subject_kind = v_kind
       and (v_org is null or r.organization_id = v_org)
       and r.collected_at::date <= p_as_of
       and (p_population ->> 'posting_id' is null
            or r.posting_id = (p_population ->> 'posting_id')::uuid)
       and not r.declined_to_answer
  ),
  cells as (
    select s.b as bucket, count(*)::integer as n
      from (
        select case p_dimension
                 when 'gender'     then gender_category_id
                 when 'ethnicity'  then ethnicity_category_id
                 when 'veteran'    then veteran_status_category_id
                 when 'disability' then disability_status_category_id
               end as b
          from pop
         where p_dimension <> 'race'
        union all
        select rc
          from pop, lateral unnest(pop.race_category_ids) rc
         where p_dimension = 'race'
      ) s
     where s.b is not null
     group by s.b
  ),
  flagged as (
    select c.bucket, c.n, (c.n < v_min_cell) as small from cells c
  ),
  -- complementary suppression: if anything is suppressed, take the smallest survivor with it
  complement as (
    select f.bucket
      from flagged f
     where not f.small
       and exists (select 1 from flagged x where x.small)
     order by f.n asc, f.bucket asc
     limit 1
  )
  select f.bucket,
         case when f.small or f.bucket in (select bucket from complement) then null::integer else f.n end,
         (f.small or f.bucket in (select bucket from complement))
    from flagged f
   order by f.bucket;

  -- OWED TO FILE 13: insert into hr.access_audit (action='bulk_read', basis='eeo_aggregate', ...)
end
$fn$;

comment on function hr.eeo_aggregate(text, jsonb, date) is
  'The ONLY sanctioned read of hr.eeo_response (SPEC-DATA-MODEL 11.6). Small-cell suppression at the hr.hiring.eeo_min_cell knob plus complementary suppression so a suppressed cell cannot be recovered by subtraction. Serves both subject_kind values. RAISES until file 14 seeds the knob (D13). File 13 owes the hr.access_audit write.';

revoke all on function hr.eeo_aggregate(text, jsonb, date) from public;
grant execute on function hr.eeo_aggregate(text, jsonb, date) to authenticated, service_role;

-- ============================================================ the write guard, per table
do $$
declare t text;
begin
  foreach t in array ARRAY['requisition','opening','posting','careers_portal','candidate',
                           'application','eeo_response','interview_kit','interview','scorecard',
                           'offer','reference_check','background_check','candidate_message',
                           'accommodation_request','candidate_conversion','ai_evidence',
                           'posting_publication'] loop
    if not exists (select 1 from pg_trigger tg join pg_class c on c.oid = tg.tgrelid
                     join pg_namespace n on n.oid = c.relnamespace
                    where n.nspname = 'hr' and c.relname = t and tg.tgname = '_zz_guard_hr_write') then
      execute format(
        'create trigger _zz_guard_hr_write before insert or update or delete on hr.%I for each row execute function hr._guard_hr_write()', t);
    end if;
  end loop;
end $$;

-- ============================================================ DDL guard acknowledgement
do $$
declare r record;
begin
  for r in select distinct object_ref from platform.ddl_guard_log
            where acknowledged_at is null
              and object_ref like 'hr.%'
              and rule = 'org_not_null_no_backstop' loop
    perform platform.ddl_guard_ack(
      p_reason => 'HR is org-explicit by the 2026-08-21 NO-NULL-ORG ruling; no assignment trigger by design (SPEC-DATA-MODEL 1.3)',
      p_by     => 'hr-domain-migration hr_10',
      p_rule   => 'org_not_null_no_backstop',
      p_object_ref => r.object_ref);
  end loop;
end $$;

-- ============================================================ assertions
do $$
declare r record; v_bad integer; v_rules text;
begin
  for r in select unnest(ARRAY['requisition','opening','posting','careers_portal','candidate',
                               'application','eeo_response','interview_kit','interview','scorecard',
                               'offer','reference_check','background_check','candidate_message',
                               'accommodation_request','candidate_conversion','ai_evidence',
                               'posting_publication']) as t loop
    select count(*) into v_bad from iam.verify_canonical('hr', r.t, 'hr_' || r.t) where status in ('FAIL','WARN');
    if v_bad > 0 then
      raise exception 'hr_10: hr.% has % FAIL/WARN conformance rows', r.t, v_bad;
    end if;
    if not iam.canonical_certify_ok('hr', r.t, 'hr_' || r.t) then
      raise exception 'hr_10: hr.% does not certify', r.t;
    end if;
    if not exists (select 1 from pg_trigger tg join pg_class c on c.oid = tg.tgrelid
                     join pg_namespace n on n.oid = c.relnamespace
                    where n.nspname = 'hr' and c.relname = r.t and tg.tgname = '_zz_guard_hr_write') then
      raise exception 'hr_10: hr.% is missing _zz_guard_hr_write', r.t;
    end if;
    if (select taxonomy_node_id from platform.entity_types where token = 'hr_' || r.t) is null then
      raise exception 'hr_10: hr_% has no taxonomy_node_id', r.t;
    end if;
  end loop;

  -- RULING R1: requisition and candidate must NOT be restricted, or the pipeline board dies
  select count(*) into v_bad from platform.entity_types
   where token in ('hr_requisition','hr_candidate') and rls_variant <> 'entity';
  if v_bad > 0 then
    raise exception 'hr_10: ruling R1 violated -- % of (hr_requisition, hr_candidate) is not the entity variant', v_bad;
  end if;

  -- the six segregated classes ARE restricted
  select count(*) into v_bad from platform.entity_types
   where token in ('hr_eeo_response','hr_offer','hr_reference_check','hr_background_check',
                   'hr_accommodation_request','hr_ai_evidence')
     and rls_variant <> 'restricted';
  if v_bad > 0 then
    raise exception 'hr_10: % segregated hiring table(s) are not restricted', v_bad;
  end if;

  -- section 18.1a for the three this file flags
  select count(*) into v_bad from platform.entity_types
   where token in ('hr_eeo_response','hr_offer','hr_accommodation_request')
     and not suppress_platform_admin_lane;
  if v_bad > 0 then
    raise exception 'hr_10: % walled hiring token(s) lack suppress_platform_admin_lane', v_bad;
  end if;

  -- 🚨 the NO-EDGE list: eeo_response must never gain a registry edge, and no restricted hr
  -- table may be a composition/containment child (section 17.3)
  select count(*) into v_bad from platform.entity_relationships er
    join platform.entity_types c on c.token = er.child_type
   where c.schema_name = 'hr' and c.rls_variant = 'restricted';
  if v_bad > 0 then
    raise exception 'hr_10: % restricted hr table(s) carry an entity_relationships edge', v_bad;
  end if;
  if exists (select 1 from platform.entity_relationships where child_type = 'hr_eeo_response') then
    raise exception 'hr_10: hr_eeo_response has an entity_relationships edge -- self-ID would convey to every recruiter';
  end if;
  if not (select client_excluded_columns @> ARRAY['application_id','posting_id','employment_id']
            from platform.entity_types where token = 'hr_eeo_response') then
    raise exception 'hr_10: hr_eeo_response does not exclude its subject links from clients';
  end if;

  -- the one containment edge, and hr_posting must NOT be a composition child
  if not exists (select 1 from platform.entity_relationships
                  where parent_type='hr_requisition' and child_type='hr_posting' and kind='containment') then
    raise exception 'hr_10: the requisition->posting containment edge is missing';
  end if;
  if exists (select 1 from platform.entity_relationships
              where child_type='hr_posting' and kind='composition') then
    raise exception 'hr_10: hr_posting is a composition child -- section 17.3 forbids it';
  end if;

  -- the two public tables, and ONLY those two
  select count(*) into v_bad from platform.entity_types
   where schema_name='hr' and default_visibility = 'public'
     and token not in ('hr_posting','hr_careers_portal');
  if v_bad > 0 then
    raise exception 'hr_10: % hr table(s) beyond posting/careers_portal are public', v_bad;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'position_assignment_requisition_fk') then
    raise exception 'hr_10: hr.position_assignment.requisition_id never got its FK';
  end if;
  if to_regprocedure('hr.eeo_aggregate(text,jsonb,date)') is null then
    raise exception 'hr_10: hr.eeo_aggregate is missing -- hr.eeo_response would have no sanctioned read path';
  end if;

  if exists (select 1 from information_schema.columns c
               join platform.entity_types e
                 on e.schema_name = c.table_schema and e.table_name = c.table_name
              where c.table_schema = 'hr'
                and c.column_name in ('user_id','owner_id','author_id','creator_id')) then
    raise exception 'hr_10: an hr table carries a legacy owner column; it can never certify';
  end if;

  select string_agg(distinct rule, ', ') into v_rules from platform.ddl_guard_log
   where acknowledged_at is null and object_ref like 'hr.%'
     and rule <> 'org_not_null_no_backstop';
  if v_rules is not null then
    raise exception 'hr_10: unacked DDL guard rows on hr.* under unsanctioned rule(s): %', v_rules;
  end if;

  select count(*) into v_bad from platform.ddl_guard_log
   where acknowledged_at is null and object_ref like 'hr.%';
  if v_bad > 0 then
    raise exception 'hr_10: % unacked DDL guard rows remain on hr.*', v_bad;
  end if;
end $$;
