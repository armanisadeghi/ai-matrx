-- HR domain, migration 11 of 16 (register item HRB-006, core tranche 3).
--
-- Onboarding & Offboarding: eighteen tables -- the original 13, plus hr_asset (D24e) and the
-- four-table survey family (D24d). Plus hr.asset_assignment.asset_id, declared inline because
-- hr_asset is created first in this file.
--
-- Authority: SPEC-DATA-MODEL sections 12.1-12.18, 15, 17.6, 17.7, 18.1 file 11, 18.1a.
--
-- 🚨 AR2's SHARPEST ONBOARDING FINDING, MADE STRUCTURAL: "a failed access shutoff cannot be
-- marked complete merely because an event was emitted." hr.checklist_item.state='complete' is
-- NOT sufficient on its own -- a CHECK constraint requires result_state='verified_success' AND a
-- verification_source other than 'none'. An item whose provisioning fired but was never verified
-- sits at `awaiting_verification` with result_state='claimed_only', which is exactly the state an
-- offboarding audit needs to see.
--
-- 🚨 D24(d): EXIT INTERVIEWS ARE A FIRST-CLASS SURVEY MODULE. An earlier readiness note
-- (R-L6-L7 U-16) reasoned the exit interview collapses to
-- hr.separation.exit_interview_completed_at plus a form checklist item. That reasoning is
-- SUPERSEDED and is recorded here so nobody re-derives it: a completion timestamp cannot answer
-- "what did the last forty leavers say about their manager", which is the entire point.
-- allow_outsider_response is why it matters structurally -- a leaver answers AFTER access
-- shutoff, through the outsider token lane, so the response cannot key on auth.uid().
--
-- 🚨 SPEC-DOMAIN-WIDE's engagement-lite pulse half CONSUMES these four survey tables with
-- survey_kind='pulse' rather than creating a parallel family. Two survey engines in one schema is
-- exactly the duplication the maintenance laws forbid.
--
-- Idempotent. Applied live as migration `hr_11_onboarding`.
--
-- ===================================================================================
-- RECORDED TECHNICAL DECISIONS (EXECUTION section 8)
--
-- 1. hr_i9 TAKES p_soft_delete => true, and section 12.8 says `false` **with a stated reason**:
--    "an I-9 is destroyed under the retention rule with a hr.disposition_event, never
--    soft-deleted by a user." That intent is preserved exactly -- nothing in this build writes
--    hr.i9.deleted_at, and hr._guard_hr_write blocks every client write to the table regardless.
--    But hr_i9 is a non-component, non-ledger `entity` variant, and iam.verify_canonical's
--    soft_delete check WARNs on that shape with no deleted_at; a single WARN makes
--    canonical_certify_ok FALSE, so the table could never certify as specified. Same positive-add
--    precedent as hr.employment_pin / hr.kiosk_session (tranche 2) and hr.eeo_response /
--    hr.ai_evidence (file 10). The retention lane in file 13 remains the only destroyer.
--    OWED SPEC CORRECTION: section 12.8's soft-delete line, keeping its reasoning and noting that
--    the column exists but is never written.
--
-- 2. hr_asset_assignment CARRIES `custom jsonb`, which section 12.6's field list omits. Section
--    17.6 enumerates the 25 tables that carry the column and names `hr_asset_assignment`
--    explicitly (as it does `hr_asset`, whose own field list DOES declare it). Same call, same
--    reasoning as hr_schedule_guidance in file 07 and hr_incident in file 09: 17.6 is the
--    enumerated authority, the column is inert storage until a
--    platform.custom_field_target row exists, and adding it now avoids an ALTER on a live table.
--    OWED SPEC CORRECTION: one line on section 12.6's p_fields.
--
-- 3. APPEND-ONLY WALLS ARE DELETE-ONLY WHERE THE TABLE CARRIES {{RETAIN}}. hr.provisioning_result
--    and hr.survey_response get hr._reject_delete() -- section 12.18 names it for the latter --
--    but NOT hr._reject_update(). Neither carries {{RETAIN}}, so an update wall would have been
--    safe on both; the reason to stop at delete is that the spec names only the delete wall for
--    them, unlike section 7.9's hr.payroll_export_line ("no update, no delete") and section 9.4's
--    ledger ("immutable ... never an edit"), where the text is explicit. 🚨 The rule this
--    establishes for later files: a table carrying {{RETAIN}} must NEVER get an update wall --
--    hr.stamp_retention_triggers (file 13) writes retention_trigger_at, and
--    hr.legal_hold_item's trigger maintains legal_hold_count, on exactly those tables.
--
-- 4. hr.checklist_template_item.course_id IS CARRIED BARE. Section 12.2 declares
--    `REFERENCES hr.course(id)` inline and hr.course is file 12 -- section 18.1's file-11 row says
--    so in as many words ("hr.checklist_template_item.course_id FK is deferred to 12"). File 12
--    adds it.
--
-- 5. hr.survey_aggregate(...) IS NOT BUILT HERE. Section 12.18 names it as where anonymity is
--    enforced ("on the read, not by dropping the link"), and it is genuinely implementable --
--    hr.survey.anonymity_threshold is a COLUMN, not a knob, so unlike hr.eeo_aggregate it has no
--    seeding dependency. It is not built because section 18.1's file-11 contents do not list it,
--    and this lane has followed the file plan exactly throughout. 🚨 OWED, and it is not
--    cosmetic: until it exists, an anonymous survey's responses are reachable through the
--    invitation lane with no small-cell suppression in front of them. Recorded for the survey
--    lane (HRB-019 / HRB-021).
-- ===================================================================================

set local lock_timeout = '20s';

-- ============================================================ 12.1 hr.checklist_template  (DIR)
do $$ begin
  if to_regclass('hr.checklist_template') is null then
    perform platform.create_entity_table(
      p_schema => 'hr', p_table => 'checklist_template', p_token => 'hr_checklist_template',
      p_label => 'Checklist template',
      p_fields => ARRAY[
        'name text NOT NULL',
        $f$lifecycle_event text NOT NULL CHECK (lifecycle_event IN ('joiner','mover','leaver','rehire','custom'))$f$,
        $f$applies_to_worker_class text[] NOT NULL DEFAULT '{}'$f$,
        $f$applies_to_job_title_ids uuid[] NOT NULL DEFAULT '{}'$f$,
        $f$applies_to_department_ids uuid[] NOT NULL DEFAULT '{}'$f$,
        $f$applies_to_location_ids uuid[] NOT NULL DEFAULT '{}'$f$,
        'is_default boolean NOT NULL DEFAULT false',
        'version_label text',
        'is_active boolean NOT NULL DEFAULT true',
        $f$custom jsonb NOT NULL DEFAULT '{}'::jsonb$f$
      ],
      p_variant => 'entity', p_versioned => true, p_soft_delete => true, p_visibility => 'personal',
      p_category => true, p_listed => true, p_org_default => false, p_gin_jsonb => false,
      p_parents => null);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'checklist_template_name_unique') then
    alter table hr.checklist_template add constraint checklist_template_name_unique
      unique (organization_id, name);
  end if;
end $$;

create index if not exists checklist_template_event_idx
  on hr.checklist_template (organization_id, lifecycle_event) where is_active and deleted_at is null;
create index if not exists checklist_template_custom_gin
  on hr.checklist_template using gin (custom jsonb_path_ops);

update platform.entity_types set
  title_column = 'name', reference_pickable = true,
  taxonomy_node_id = '0940b7f9-d72a-4b56-84fd-4bb4fafd7dbe'
where token = 'hr_checklist_template';

-- ============================================================ 12.2 hr.checklist_template_item  (COMP)
-- suppress_when_deceased implements bucket-2 item 18 (no exit interview, no acknowledgment
-- e-sign for a deceased employee); suppress_when_worker_class gates I-9/W-4/PTO items off for
-- contractors (D8). course_id is bare -- hr.course is file 12 (RECORDED DECISION 4).
do $$ begin
  if to_regclass('hr.checklist_template_item') is null then
    perform platform.create_entity_table(
      p_schema => 'hr', p_table => 'checklist_template_item', p_token => 'hr_checklist_template_item',
      p_label => 'Checklist template item',
      p_fields => ARRAY[
        'checklist_template_id uuid NOT NULL REFERENCES hr.checklist_template(id)',
        'position integer NOT NULL',
        'title text NOT NULL',
        'description text',
        $f$item_kind text NOT NULL CHECK (item_kind IN ('task','form','signature','document_upload','training','provisioning','asset','meeting','external_filing','acknowledgement'))$f$,
        $f$assignee_role text NOT NULL CHECK (assignee_role IN ('employee','manager','hr','it','payroll','facilities','automation'))$f$,
        'due_offset_days integer',
        $f$due_anchor text NOT NULL DEFAULT 'start_date' CHECK (due_anchor IN ('start_date','offer_accepted','first_day','last_day','termination_date','run_created'))$f$,
        'is_blocking boolean NOT NULL DEFAULT false',
        'is_statutory boolean NOT NULL DEFAULT false',
        'statutory_rule_class text',
        'target_kind text',
        'target_ref text',
        $f$provisioning_systems text[] NOT NULL DEFAULT '{}'$f$,
        'form_template_ref text',
        'course_id uuid',
        'suppress_when_deceased boolean NOT NULL DEFAULT false',
        $f$suppress_when_worker_class text[] NOT NULL DEFAULT '{}'$f$
      ],
      p_variant => 'component', p_versioned => true, p_soft_delete => true, p_visibility => 'none',
      p_category => false, p_listed => false, p_org_default => false, p_gin_jsonb => false,
      p_parents => ARRAY['hr_checklist_template:checklist_template_id']);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'checklist_template_item_position_unique') then
    alter table hr.checklist_template_item add constraint checklist_template_item_position_unique
      unique (checklist_template_id, position);
  end if;
end $$;

update platform.entity_types set taxonomy_node_id = '0940b7f9-d72a-4b56-84fd-4bb4fafd7dbe'
where token = 'hr_checklist_template_item';

-- ============================================================ 12.3 hr.checklist_run  (COMP of hr_employment)
-- template_snapshot FREEZES THE TEMPLATE AS IT WAS WHEN THE RUN OPENED (AR2 LOCK 10). A later
-- template edit never rewrites a completed onboarding.
do $$ begin
  if to_regclass('hr.checklist_run') is null then
    perform platform.create_entity_table(
      p_schema => 'hr', p_table => 'checklist_run', p_token => 'hr_checklist_run',
      p_label => 'Checklist run',
      p_fields => ARRAY[
        'employment_id uuid NOT NULL REFERENCES hr.employment(id)',
        'checklist_template_id uuid REFERENCES hr.checklist_template(id)',
        $f$template_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb$f$,
        $f$lifecycle_event text NOT NULL CHECK (lifecycle_event IN ('joiner','mover','leaver','rehire','custom'))$f$,
        'anchor_date date NOT NULL',
        $f$state text NOT NULL DEFAULT 'open' CHECK (state IN ('pending','open','blocked','completed','cancelled','reopened'))$f$,
        'opened_at timestamptz NOT NULL DEFAULT now()',
        'completed_at timestamptz',
        'reopened_at timestamptz',
        'reopen_reason text',
        'items_total integer NOT NULL DEFAULT 0',
        'items_complete integer NOT NULL DEFAULT 0',
        'items_failed integer NOT NULL DEFAULT 0',
        $f$custom jsonb NOT NULL DEFAULT '{}'::jsonb$f$
      ],
      p_variant => 'component', p_versioned => true, p_soft_delete => true, p_visibility => 'none',
      p_category => false, p_listed => false, p_org_default => false, p_gin_jsonb => false,
      p_parents => ARRAY['hr_employment:employment_id']);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'checklist_run_reopen_reasoned') then
    alter table hr.checklist_run add constraint checklist_run_reopen_reasoned
      check (state <> 'reopened' or reopen_reason is not null);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'checklist_run_counts_sane') then
    alter table hr.checklist_run add constraint checklist_run_counts_sane
      check (items_complete >= 0 and items_failed >= 0 and items_total >= 0
             and items_complete + items_failed <= items_total);
  end if;
end $$;

create index if not exists checklist_run_employment_idx on hr.checklist_run (employment_id, lifecycle_event)
  where deleted_at is null;
create index if not exists checklist_run_open_idx on hr.checklist_run (organization_id, state, anchor_date)
  where deleted_at is null;
create index if not exists checklist_run_custom_gin on hr.checklist_run using gin (custom jsonb_path_ops);

update platform.entity_types set taxonomy_node_id = '0940b7f9-d72a-4b56-84fd-4bb4fafd7dbe'
where token = 'hr_checklist_run';

-- ============================================================ 12.4 hr.checklist_item  (COMP of hr_checklist_run)
do $$ begin
  if to_regclass('hr.checklist_item') is null then
    perform platform.create_entity_table(
      p_schema => 'hr', p_table => 'checklist_item', p_token => 'hr_checklist_item',
      p_label => 'Checklist item',
      p_fields => ARRAY[
        'checklist_run_id uuid NOT NULL REFERENCES hr.checklist_run(id)',
        'template_item_id uuid REFERENCES hr.checklist_template_item(id)',
        'position integer NOT NULL',
        'title text NOT NULL',
        'item_kind text NOT NULL',
        'assignee_role text NOT NULL',
        'assignee_employment_id uuid REFERENCES hr.employment(id)',
        'due_on date',
        'is_blocking boolean NOT NULL DEFAULT false',
        'is_statutory boolean NOT NULL DEFAULT false',
        $f$state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','in_progress','awaiting_verification','complete','failed','waived','not_applicable'))$f$,
        $f$result_state text CHECK (result_state IN ('unknown','verified_success','verified_failure','claimed_only'))$f$,
        $f$result_evidence jsonb NOT NULL DEFAULT '{}'::jsonb$f$,
        'verified_at timestamptz',
        'verified_by_employment_id uuid REFERENCES hr.employment(id)',
        $f$verification_source text CHECK (verification_source IN ('human','system_probe','provider_callback','none'))$f$,
        'completed_at timestamptz',
        'waiver_reason text',
        'workspace_task_id uuid REFERENCES workspace.tasks(id)',
        'esign_request_id uuid',
        'document_file_id uuid REFERENCES files.files(id)',
        'related_token text',
        'related_id uuid',
        -- {{ACTOR}} -- an outsider-writable table (SPEC-ESIGN 5.5)
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
      p_parents => ARRAY['hr_checklist_run:checklist_run_id']);
  end if;
end $$;

do $$ begin
  -- 🚨 AR2: "a failed access shutoff cannot be marked complete merely because an event was
  -- emitted." This is the constraint that makes that structural.
  --
  -- 🚨 BUILD-PROVEN CORRECTION (core tranche 3, caught by a rolled-back probe). Section 12.4's
  -- literal DDL is
  --     check (state <> 'complete' or (result_state = 'verified_success' and verification_source <> 'none'))
  -- and it DOES NOT HOLD. Both columns are nullable, and an item created and then updated to
  -- `complete` with neither set evaluates:
  --     state <> 'complete'          -> false
  --     result_state = '...'         -> NULL   (NULL = anything is NULL)
  --     verification_source <> 'none'-> NULL
  --     false OR (NULL AND NULL)     -> NULL
  -- A CHECK constraint fails only on FALSE, never on NULL -- so the row is ACCEPTED and exactly
  -- the thing AR2 called the sharpest onboarding finding sails through. Proven live: the probe
  -- marked a `Revoke SSO` item complete with no result and no verification, and it was accepted.
  -- coalesce() closes it. OWED SPEC CORRECTION: section 12.4's constraint body.
  if exists (select 1 from pg_constraint where conname = 'checklist_item_complete_needs_result'
               and pg_get_constraintdef(oid) not like '%COALESCE%') then
    alter table hr.checklist_item drop constraint checklist_item_complete_needs_result;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'checklist_item_complete_needs_result') then
    alter table hr.checklist_item add constraint checklist_item_complete_needs_result
      check (state <> 'complete'
             or (coalesce(result_state, '') = 'verified_success'
                 and coalesce(verification_source, 'none') <> 'none'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'checklist_item_waiver_reasoned') then
    alter table hr.checklist_item add constraint checklist_item_waiver_reasoned
      check (state <> 'waived' or waiver_reason is not null);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'checklist_item_actor_identified') then
    alter table hr.checklist_item add constraint checklist_item_actor_identified check (
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

create index if not exists checklist_item_run_idx on hr.checklist_item (checklist_run_id, position);
create index if not exists checklist_item_open_idx on hr.checklist_item (organization_id, state, due_on)
  where state in ('pending','in_progress','awaiting_verification');
create index if not exists checklist_item_assignee_idx on hr.checklist_item (assignee_employment_id, due_on)
  where assignee_employment_id is not null;

update platform.entity_types set taxonomy_node_id = '0940b7f9-d72a-4b56-84fd-4bb4fafd7dbe'
where token = 'hr_checklist_item';

-- ============================================================ 12.5 hr.provisioning_result  (COMP of hr_checklist_item)
-- One item can touch several systems (email, SSO, payroll, badge, VPN), which is why this is its
-- own append-only table rather than columns on the item. `immediacy` is AR 1.16's
-- immediate-vs-end-of-day access-shutoff mode split.
do $$ begin
  if to_regclass('hr.provisioning_result') is null then
    perform platform.create_entity_table(
      p_schema => 'hr', p_table => 'provisioning_result', p_token => 'hr_provisioning_result',
      p_label => 'Provisioning result',
      p_fields => ARRAY[
        'checklist_item_id uuid NOT NULL REFERENCES hr.checklist_item(id)',
        'employment_id uuid NOT NULL REFERENCES hr.employment(id)',
        'system_key text NOT NULL',
        'system_display_name text',
        $f$action text NOT NULL CHECK (action IN ('create','grant','modify','suspend','revoke','delete','transfer'))$f$,
        'account_ref text',
        'requested_at timestamptz NOT NULL DEFAULT now()',
        'completed_at timestamptz',
        'verified_at timestamptz',
        $f$verification_method text CHECK (verification_method IN ('api_readback','provider_webhook','human_attestation','screenshot','none'))$f$,
        $f$outcome text NOT NULL DEFAULT 'pending' CHECK (outcome IN ('pending','success','failure','partial','skipped'))$f$,
        'failure_reason text',
        'retry_count integer NOT NULL DEFAULT 0',
        $f$evidence jsonb NOT NULL DEFAULT '{}'::jsonb$f$,
        $f$immediacy text CHECK (immediacy IN ('immediate','end_of_day','scheduled'))$f$,
        'scheduled_for timestamptz',
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
      p_parents => ARRAY['hr_checklist_item:checklist_item_id']);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'provisioning_result_actor_identified') then
    alter table hr.provisioning_result add constraint provisioning_result_actor_identified check (
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

drop trigger if exists _zz_provisioning_result_no_delete on hr.provisioning_result;
create trigger _zz_provisioning_result_no_delete before delete on hr.provisioning_result
  for each row execute function hr._reject_delete();

create index if not exists provisioning_result_system_idx
  on hr.provisioning_result (employment_id, system_key, requested_at desc);
create index if not exists provisioning_result_open_idx
  on hr.provisioning_result (organization_id, outcome) where outcome in ('pending','failure');

update platform.entity_types set taxonomy_node_id = '0940b7f9-d72a-4b56-84fd-4bb4fafd7dbe'
where token = 'hr_provisioning_result';

-- ============================================================ 12.14 hr.asset  (DIR, D24e)
-- Created before hr.asset_assignment so asset_id can carry its FK inline.
-- 🚨 VEHICLES ARE AN ORDINARY ASSET CLASS -- Arman's words, and the reason asset_class is a flat
-- CHECK rather than a vehicle table: a vehicle differs from a laptop by make/model/year/identifier
-- (VIN, IMEI, plate), which are four columns every asset class can use, not a subtype.
-- LIVE FLEET TELEMATICS IS EXPLICITLY A FUTURE MODULE, NOT v1 -- nothing here stores a position,
-- a trip or a diagnostic, and adding one later is a new table beside this one, not a re-key.
do $$ begin
  if to_regclass('hr.asset') is null then
    perform platform.create_entity_table(
      p_schema => 'hr', p_table => 'asset', p_token => 'hr_asset', p_label => 'Asset',
      p_fields => ARRAY[
        'name text NOT NULL',
        'asset_tag text',
        'serial_number text',
        $f$asset_class text NOT NULL DEFAULT 'equipment' CHECK (asset_class IN ('laptop','desktop','phone','tablet','vehicle','badge','key','uniform','tools','safety_equipment','software_seat','equipment','other'))$f$,
        'make text',
        'model text',
        'year integer',
        'identifier text',
        'location_id uuid REFERENCES hr.location(id)',
        'crew_id uuid REFERENCES hr.crew(id)',
        $f$owned_or_leased text CHECK (owned_or_leased IN ('owned','leased','rented'))$f$,
        'acquired_on date',
        'purchase_amount numeric(14,2)',
        'replacement_cost numeric(14,2)',
        'warranty_expires_on date',
        'compliance_due_on date',
        'external_system_key text',
        'external_asset_ref text',
        $f$status text NOT NULL DEFAULT 'available' CHECK (status IN ('available','assigned','in_repair','lost','stolen','retired','disposed'))$f$,
        'retired_on date',
        'notes text',
        $f$custom jsonb NOT NULL DEFAULT '{}'::jsonb$f$
      ],
      p_variant => 'entity', p_versioned => true, p_soft_delete => true, p_visibility => 'personal',
      p_category => true, p_listed => true, p_org_default => false, p_gin_jsonb => false,
      p_parents => null);
  end if;
end $$;

create unique index if not exists asset_tag_unique on hr.asset (organization_id, asset_tag)
  where asset_tag is not null and deleted_at is null;
create unique index if not exists asset_serial_unique on hr.asset (organization_id, serial_number)
  where serial_number is not null and deleted_at is null;
create index if not exists asset_status_idx on hr.asset (organization_id, status, asset_class)
  where deleted_at is null;
create index if not exists asset_compliance_idx on hr.asset (organization_id, compliance_due_on)
  where compliance_due_on is not null and deleted_at is null;
create index if not exists asset_custom_gin on hr.asset using gin (custom jsonb_path_ops);

update platform.entity_types set
  title_column = 'name', reference_pickable = true,
  taxonomy_node_id = '0940b7f9-d72a-4b56-84fd-4bb4fafd7dbe'
where token = 'hr_asset';

-- ============================================================ 12.6 hr.asset_assignment  (COMP of hr_employment)
-- AR2: "stable records even if external IT tools perform the actual work." AI Matrx is explicitly
-- NOT an MDM platform (v1 anti-goals); this is the lifecycle handoff record, nothing more.
-- 🚨 The free-text asset_name/asset_tag/serial_number columns STAY alongside asset_id: an
-- assignment must remain readable after an asset row is retired or corrected -- the same
-- frozen-identifier rule as hr.payroll_export_line (section 7.9). asset_id is nullable, because
-- the lifecycle record for a one-off item that was never registered is still worth having.
do $$ begin
  if to_regclass('hr.asset_assignment') is null then
    perform platform.create_entity_table(
      p_schema => 'hr', p_table => 'asset_assignment', p_token => 'hr_asset_assignment',
      p_label => 'Asset assignment',
      p_fields => ARRAY[
        'employment_id uuid NOT NULL REFERENCES hr.employment(id)',
        'asset_id uuid REFERENCES hr.asset(id)',
        'asset_name text NOT NULL',
        'asset_tag text',
        'serial_number text',
        'external_system_key text',
        'external_asset_ref text',
        'assigned_on date NOT NULL',
        'assigned_by_employment_id uuid REFERENCES hr.employment(id)',
        'due_back_on date',
        'returned_on date',
        $f$return_condition text CHECK (return_condition IN ('good','damaged','lost','not_returned'))$f$,
        $f$return_evidence jsonb NOT NULL DEFAULT '{}'::jsonb$f$,
        'replacement_cost numeric(12,2)',
        'checklist_item_id uuid REFERENCES hr.checklist_item(id)',
        -- section 17.6 enumerates this token among the 25 carrying `custom`; 12.6's field list
        -- omits it. RECORDED DECISION 2.
        $f$custom jsonb NOT NULL DEFAULT '{}'::jsonb$f$
      ],
      p_variant => 'component', p_versioned => true, p_soft_delete => true, p_visibility => 'none',
      p_category => true, p_listed => false, p_org_default => false, p_gin_jsonb => false,
      p_parents => ARRAY['hr_employment:employment_id']);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'asset_assignment_dates_ordered') then
    alter table hr.asset_assignment add constraint asset_assignment_dates_ordered
      check (returned_on is null or returned_on >= assigned_on);
  end if;
end $$;

create index if not exists asset_assignment_employment_idx on hr.asset_assignment (employment_id, assigned_on desc)
  where deleted_at is null;
create index if not exists asset_assignment_outstanding_idx on hr.asset_assignment (organization_id, due_back_on)
  where returned_on is null and deleted_at is null;
create index if not exists asset_assignment_asset_idx on hr.asset_assignment (asset_id)
  where asset_id is not null and deleted_at is null;
create index if not exists asset_assignment_custom_gin on hr.asset_assignment using gin (custom jsonb_path_ops);

update platform.entity_types set taxonomy_node_id = '0940b7f9-d72a-4b56-84fd-4bb4fafd7dbe'
where token = 'hr_asset_assignment';

-- ============================================================ 12.7 hr.tax_withholding  (CONF, pay)
-- Bucket-2 item 1 in full: TYPED per-jurisdiction, per-tax-year records plus the signed artifact
-- -- not custom fields on the employee. The post-2020 federal W-4 is dollar amounts, CA DE-4 and
-- NY IT-2104 still use allowances, and payload_kind + payload carry whatever a certificate has
-- that the typed columns do not. THE TYPED COLUMNS EXIST BECAUSE THE PAYROLL EXPORT MUST READ
-- THEM WITHOUT PARSING JSONB PER STATE.
-- 🚨 We never compute a withholding amount and never file a return (v1 anti-goals). This record
-- exists so the payroll provider gets a correct, signed, dated artifact.
do $$ begin
  if to_regclass('hr.tax_withholding') is null then
    perform platform.create_entity_table(
      p_schema => 'hr', p_table => 'tax_withholding', p_token => 'hr_tax_withholding',
      p_label => 'Tax withholding certificate',
      p_fields => ARRAY[
        'employment_id uuid NOT NULL REFERENCES hr.employment(id)',
        'jurisdiction_id uuid NOT NULL REFERENCES hr.jurisdiction(id)',
        'tax_year integer NOT NULL',
        $f$form_kind text NOT NULL CHECK (form_kind IN ('w4_federal','state_certificate','local_certificate','w9','w4p','other'))$f$,
        'form_code text',
        'form_version text NOT NULL',
        'payload_kind text NOT NULL',
        $f$payload jsonb NOT NULL DEFAULT '{}'::jsonb$f$,
        'filing_status text',
        'multiple_jobs boolean',
        'dependents_amount numeric(12,2)',
        'other_income_amount numeric(12,2)',
        'deductions_amount numeric(12,2)',
        'extra_withholding_amount numeric(12,2)',
        'allowances integer',
        'exempt boolean NOT NULL DEFAULT false',
        'exempt_expires_on date',
        'effective_from date NOT NULL',
        'effective_to date',
        $f$effective_range daterange GENERATED ALWAYS AS (daterange(effective_from, effective_to, '[)')) STORED$f$,
        'recorded_at timestamptz NOT NULL DEFAULT now()',
        'change_reason_category_id uuid REFERENCES platform.categories(id)',
        'supersedes_id uuid',
        'signed_document_file_id uuid REFERENCES files.files(id)',
        'esign_request_id uuid',
        'signed_at timestamptz',
        -- {{RETAIN}}
        $f$record_class_key text NOT NULL DEFAULT 'tax_withholding' REFERENCES hr.record_class(class_key)$f$,
        'retention_trigger_at timestamptz',
        'legal_hold_count integer NOT NULL DEFAULT 0'
      ],
      p_variant => 'entity', p_versioned => true, p_soft_delete => true, p_visibility => 'personal',
      p_category => false, p_listed => false, p_org_default => false, p_gin_jsonb => false,
      p_parents => null);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'tax_withholding_unique') then
    alter table hr.tax_withholding add constraint tax_withholding_unique
      unique (employment_id, jurisdiction_id, tax_year, form_kind, effective_from);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tax_withholding_window_ordered') then
    alter table hr.tax_withholding add constraint tax_withholding_window_ordered
      check (effective_to is null or effective_to > effective_from);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tax_withholding_supersedes_fk') then
    alter table hr.tax_withholding add constraint tax_withholding_supersedes_fk
      foreign key (supersedes_id) references hr.tax_withholding(id);
  end if;
end $$;

create index if not exists tax_withholding_employment_idx
  on hr.tax_withholding (employment_id, tax_year desc) where deleted_at is null;
create index if not exists tax_withholding_exempt_expiry_idx
  on hr.tax_withholding (organization_id, exempt_expires_on)
  where exempt and exempt_expires_on is not null and deleted_at is null;

-- section 18.1a: PAY (D19).
update platform.entity_types set
  suppress_platform_admin_lane = true,
  taxonomy_node_id = '0940b7f9-d72a-4b56-84fd-4bb4fafd7dbe'
where token = 'hr_tax_withholding';

do $$ begin
  update platform.entity_types set rls_variant = 'restricted'
   where token = 'hr_tax_withholding' and rls_variant is distinct from 'restricted';
  perform iam.apply_rls('hr','tax_withholding','hr_tax_withholding','restricted');
end $$;

-- ============================================================ 12.8 hr.i9  (CONF, stored separately by law)
-- AR 1.14 + AR2's full I-9. reverification_due_on and section1_work_auth_expires_on are THE
-- FINE-BEARING HALF of I-9 and are invisible without these columns; the compliance dashboard
-- reads them. receipt_used/receipt_expires_on handle the receipt rule; `corrections` keeps the
-- audit trail of amendments rather than overwriting.
-- Storage separation is enforced BY THE FILE LANE, NOT BY HOPE: the form file lives in a files
-- folder registered to record class `i9` and never appears in the general personnel-file list.
-- destroy_eligible_on is greatest(hire_date + 3y, termination_date + 1y), written by the
-- retention engine (file 13).
do $$ begin
  if to_regclass('hr.i9') is null then
    perform platform.create_entity_table(
      p_schema => 'hr', p_table => 'i9', p_token => 'hr_i9', p_label => 'Form I-9',
      p_fields => ARRAY[
        'employment_id uuid NOT NULL REFERENCES hr.employment(id)',
        'form_edition text NOT NULL',
        'section1_completed_at timestamptz',
        $f$section1_attestation text CHECK (section1_attestation IN ('citizen','noncitizen_national','lawful_permanent_resident','authorized_alien'))$f$,
        'section1_uscis_number text',
        'section1_work_auth_expires_on date',
        'section2_completed_at timestamptz',
        'section2_first_day_of_employment date',
        'section2_completed_by_employment_id uuid REFERENCES hr.employment(id)',
        $f$authorized_representative jsonb NOT NULL DEFAULT '{}'::jsonb$f$,
        'is_remote_verification boolean NOT NULL DEFAULT false',
        'alternative_procedure_used boolean NOT NULL DEFAULT false',
        $f$supplement_a jsonb NOT NULL DEFAULT '{}'::jsonb$f$,
        $f$supplement_b jsonb NOT NULL DEFAULT '[]'::jsonb$f$,
        'reverification_due_on date',
        'reverification_completed_at timestamptz',
        'receipt_used boolean NOT NULL DEFAULT false',
        'receipt_expires_on date',
        $f$corrections jsonb NOT NULL DEFAULT '[]'::jsonb$f$,
        'everify_required boolean NOT NULL DEFAULT false',
        'everify_case_number text',
        'everify_case_status text',
        'everify_submitted_at timestamptz',
        $f$state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','section1_complete','complete','reverification_due','reverified','expired','void'))$f$,
        'esign_request_id uuid',
        'form_file_id uuid REFERENCES files.files(id)',
        'destroy_eligible_on date',
        -- {{RETAIN}}
        $f$record_class_key text NOT NULL DEFAULT 'i9' REFERENCES hr.record_class(class_key)$f$,
        'retention_trigger_at timestamptz',
        'legal_hold_count integer NOT NULL DEFAULT 0'
      ],
      -- p_soft_delete => true against section 12.8's `false`: RECORDED DECISION 1. Nothing writes
      -- deleted_at; file 13's retention lane remains the only destroyer.
      p_variant => 'entity', p_versioned => true, p_soft_delete => true, p_visibility => 'personal',
      p_category => false, p_listed => false, p_org_default => false, p_gin_jsonb => false,
      p_parents => null);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'i9_one_per_employment') then
    alter table hr.i9 add constraint i9_one_per_employment unique (employment_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'i9_receipt_dated') then
    alter table hr.i9 add constraint i9_receipt_dated
      check (not receipt_used or receipt_expires_on is not null);
  end if;
end $$;

-- the fine-bearing half: the compliance dashboard's whole query
create index if not exists i9_reverification_idx on hr.i9 (organization_id, reverification_due_on)
  where reverification_due_on is not null and deleted_at is null;
create index if not exists i9_work_auth_expiry_idx on hr.i9 (organization_id, section1_work_auth_expires_on)
  where section1_work_auth_expires_on is not null and deleted_at is null;

update platform.entity_types set taxonomy_node_id = '0940b7f9-d72a-4b56-84fd-4bb4fafd7dbe'
where token = 'hr_i9';

do $$ begin
  if (select rls_variant from platform.entity_types where token = 'hr_i9') is distinct from 'restricted' then
    update platform.entity_types set rls_variant = 'restricted' where token = 'hr_i9';
    perform iam.apply_rls('hr','i9','hr_i9','restricted');
  end if;
end $$;

-- ============================================================ 12.9 hr.i9_document  (COMP of hr_i9)
do $$ begin
  if to_regclass('hr.i9_document') is null then
    perform platform.create_entity_table(
      p_schema => 'hr', p_table => 'i9_document', p_token => 'hr_i9_document',
      p_label => 'I-9 document',
      p_fields => ARRAY[
        'i9_id uuid NOT NULL REFERENCES hr.i9(id)',
        $f$list_group text NOT NULL CHECK (list_group IN ('A','B','C'))$f$,
        'document_title text NOT NULL',
        'issuing_authority text',
        'document_number text',
        'expires_on date',
        'is_receipt boolean NOT NULL DEFAULT false',
        'presented_at timestamptz',
        'supplement_b_round integer',
        'image_file_id uuid REFERENCES files.files(id)'
      ],
      p_variant => 'component', p_versioned => true, p_soft_delete => false, p_visibility => 'none',
      p_category => false, p_listed => false, p_org_default => false, p_gin_jsonb => false,
      p_parents => ARRAY['hr_i9:i9_id']);
  end if;
end $$;

create index if not exists i9_document_i9_idx on hr.i9_document (i9_id, list_group);

update platform.entity_types set taxonomy_node_id = '0940b7f9-d72a-4b56-84fd-4bb4fafd7dbe'
where token = 'hr_i9_document';

-- ============================================================ 12.10 hr.new_hire_report  (COMP of hr_employment)
-- AR 1.20: every US employer must report each new hire to the state directory within ~20 days
-- (PRWORA). SMBs normally get this from their payroll provider -- AND WE ARE EXPLICITLY NOT THE
-- PAYROLL PROVIDER, so the onboarding checklist is its natural home.
do $$ begin
  if to_regclass('hr.new_hire_report') is null then
    perform platform.create_entity_table(
      p_schema => 'hr', p_table => 'new_hire_report', p_token => 'hr_new_hire_report',
      p_label => 'New hire report',
      p_fields => ARRAY[
        'employment_id uuid NOT NULL REFERENCES hr.employment(id)',
        'jurisdiction_id uuid NOT NULL REFERENCES hr.jurisdiction(id)',
        'tax_registration_id uuid REFERENCES hr.tax_registration(id)',
        'due_on date NOT NULL',
        'rule_version_id uuid REFERENCES hr.jurisdiction_rule(id)',
        $f$state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','submitted','acknowledged','failed','not_required'))$f$,
        'submitted_at timestamptz',
        $f$submission_method text CHECK (submission_method IN ('portal','file_upload','mail','provider'))$f$,
        'confirmation_ref text',
        'artifact_file_id uuid REFERENCES files.files(id)',
        'failure_reason text',
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
      p_parents => ARRAY['hr_employment:employment_id']);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'new_hire_report_actor_identified') then
    alter table hr.new_hire_report add constraint new_hire_report_actor_identified check (
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

create index if not exists new_hire_report_due_idx on hr.new_hire_report (organization_id, due_on)
  where state = 'pending';

update platform.entity_types set taxonomy_node_id = '0940b7f9-d72a-4b56-84fd-4bb4fafd7dbe'
where token = 'hr_new_hire_report';

-- ============================================================ 12.11 hr.benefits_event  (COMP of hr_employment)
-- AR2 stage-two "lock now only" for benefits. NOTHING COMPUTES A BENEFIT IN v1. This table exists
-- because the COBRA qualifying event is GENERATED BY v1 OFFBOARDING and is date-sensitive
-- (employer->plan within 30 days), and because election_metadata + deduction_code_ids +
-- hours_of_service_basis are hooks the later benefits module cannot reconstruct.
-- AI MATRX DOES NOT BECOME A BENEFITS OR COBRA ADMINISTRATOR (v1 anti-goals).
do $$ begin
  if to_regclass('hr.benefits_event') is null then
    perform platform.create_entity_table(
      p_schema => 'hr', p_table => 'benefits_event', p_token => 'hr_benefits_event',
      p_label => 'Benefits event',
      p_fields => ARRAY[
        'employment_id uuid NOT NULL REFERENCES hr.employment(id)',
        $f$event_kind text NOT NULL CHECK (event_kind IN ('eligibility_gained','eligibility_lost','qualifying_event','cobra_qualifying','coverage_end','leave_start','leave_end','rehire'))$f$,
        'occurred_on date NOT NULL',
        'cobra_event_kind text',
        'benefits_end_on date',
        'provider_key text',
        'provider_notified_at timestamptz',
        'provider_confirmation_ref text',
        'notification_due_on date',
        $f$election_metadata jsonb NOT NULL DEFAULT '{}'::jsonb$f$,
        $f$deduction_code_ids uuid[] NOT NULL DEFAULT '{}'$f$,
        $f$hours_of_service_basis jsonb NOT NULL DEFAULT '{}'::jsonb$f$,
        'note text'
      ],
      p_variant => 'component', p_versioned => true, p_soft_delete => true, p_visibility => 'none',
      p_category => false, p_listed => false, p_org_default => false, p_gin_jsonb => false,
      p_parents => ARRAY['hr_employment:employment_id']);
  end if;
end $$;

create index if not exists benefits_event_employment_idx on hr.benefits_event (employment_id, occurred_on desc)
  where deleted_at is null;
create index if not exists benefits_event_cobra_due_idx on hr.benefits_event (organization_id, notification_due_on)
  where event_kind = 'cobra_qualifying' and provider_notified_at is null and deleted_at is null;

update platform.entity_types set taxonomy_node_id = '0940b7f9-d72a-4b56-84fd-4bb4fafd7dbe'
where token = 'hr_benefits_event';

-- ============================================================ 12.12 hr.records_request  (CONF)
-- AR 1.16. A terminated employee's access is revoked automatically, AND THEY STILL HOLD A
-- STATUTORY RIGHT to inspect and copy their personnel file and pay records (CA Labor Code 1198.5
-- -- 30 days; section 226 -- 21 days). The ruled answer is the TOKEN-LINK RECORDS-DELIVERY FLOW,
-- reusing the outsider token lane rather than a post-employment login mode. The revocation rule
-- is written once, and this table is why it does not have to be re-opened later.
do $$ begin
  if to_regclass('hr.records_request') is null then
    perform platform.create_entity_table(
      p_schema => 'hr', p_table => 'records_request', p_token => 'hr_records_request',
      p_label => 'Records request',
      p_fields => ARRAY[
        'employee_id uuid REFERENCES hr.employee(id)',
        'employment_id uuid REFERENCES hr.employment(id)',
        $f$requester_kind text NOT NULL CHECK (requester_kind IN ('former_employee','current_employee','legal_representative','agency'))$f$,
        'requester_name text NOT NULL',
        'requester_email text',
        'requester_verified_at timestamptz',
        'verification_method text',
        'statutory_basis text',
        'jurisdiction_id uuid REFERENCES hr.jurisdiction(id)',
        'rule_version_id uuid REFERENCES hr.jurisdiction_rule(id)',
        'requested_at timestamptz NOT NULL DEFAULT now()',
        'due_on date NOT NULL',
        $f$scope text NOT NULL CHECK (scope IN ('personnel_file','pay_records','both','specific'))$f$,
        $f$scope_detail jsonb NOT NULL DEFAULT '{}'::jsonb$f$,
        $f$state text NOT NULL DEFAULT 'received' CHECK (state IN ('received','verifying','preparing','delivered','denied','partially_delivered'))$f$,
        'delivered_at timestamptz',
        $f$delivery_method text CHECK (delivery_method IN ('token_link','email','mail','in_person'))$f$,
        'outsider_token_ref text',
        'delivered_file_id uuid REFERENCES files.files(id)',
        'denial_basis text',
        -- {{RETAIN}}
        $f$record_class_key text NOT NULL DEFAULT 'records_request' REFERENCES hr.record_class(class_key)$f$,
        'retention_trigger_at timestamptz',
        'legal_hold_count integer NOT NULL DEFAULT 0'
      ],
      p_variant => 'entity', p_versioned => true, p_soft_delete => true, p_visibility => 'personal',
      p_category => false, p_listed => false, p_org_default => false, p_gin_jsonb => false,
      p_parents => null);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'records_request_subject_present') then
    alter table hr.records_request add constraint records_request_subject_present
      check (employee_id is not null or employment_id is not null);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'records_request_denial_reasoned') then
    alter table hr.records_request add constraint records_request_denial_reasoned
      check (state <> 'denied' or denial_basis is not null);
  end if;
end $$;

create index if not exists records_request_due_idx on hr.records_request (organization_id, due_on)
  where state in ('received','verifying','preparing') and deleted_at is null;

update platform.entity_types set taxonomy_node_id = '0940b7f9-d72a-4b56-84fd-4bb4fafd7dbe'
where token = 'hr_records_request';

do $$ begin
  if (select rls_variant from platform.entity_types where token = 'hr_records_request') is distinct from 'restricted' then
    update platform.entity_types set rls_variant = 'restricted' where token = 'hr_records_request';
    perform iam.apply_rls('hr','records_request','hr_records_request','restricted');
  end if;
end $$;

-- ============================================================ 12.13 hr.verification_letter_request  (CONF)
-- 🚨 Node hr-employees, NOT hr-onboarding -- the one table in this file classified elsewhere
-- (section 12's header and section 17.7 both say so).
-- `snapshot` freezes exactly what the letter asserted, BECAUSE A LETTER IS AN ASSERTION THE ORG
-- WILL BE HELD TO.
do $$ begin
  if to_regclass('hr.verification_letter_request') is null then
    perform platform.create_entity_table(
      p_schema => 'hr', p_table => 'verification_letter_request', p_token => 'hr_verification_letter_request',
      p_label => 'Verification letter request',
      p_fields => ARRAY[
        'employment_id uuid NOT NULL REFERENCES hr.employment(id)',
        $f$request_source text NOT NULL CHECK (request_source IN ('employee','third_party','agency','lender'))$f$,
        'requester_name text',
        'requester_organization text',
        'requester_email text',
        $f$verification_kind text NOT NULL CHECK (verification_kind IN ('employment','employment_and_income','income_only'))$f$,
        'includes_compensation boolean NOT NULL DEFAULT false',
        'employee_consent_at timestamptz',
        $f$employee_consent_evidence jsonb NOT NULL DEFAULT '{}'::jsonb$f$,
        'requested_at timestamptz NOT NULL DEFAULT now()',
        $f$state text NOT NULL DEFAULT 'received' CHECK (state IN ('received','awaiting_consent','generated','delivered','denied','expired'))$f$,
        'generated_at timestamptz',
        'letter_file_id uuid REFERENCES files.files(id)',
        'delivered_at timestamptz',
        'delivery_method text',
        'outsider_token_ref text',
        $f$snapshot jsonb NOT NULL DEFAULT '{}'::jsonb$f$,
        -- {{RETAIN}}
        $f$record_class_key text NOT NULL DEFAULT 'records_request' REFERENCES hr.record_class(class_key)$f$,
        'retention_trigger_at timestamptz',
        'legal_hold_count integer NOT NULL DEFAULT 0'
      ],
      p_variant => 'entity', p_versioned => true, p_soft_delete => true, p_visibility => 'personal',
      p_category => false, p_listed => false, p_org_default => false, p_gin_jsonb => false,
      p_parents => null);
  end if;
end $$;

do $$ begin
  -- income disclosure requires the employee's consent, structurally
  if not exists (select 1 from pg_constraint where conname = 'verification_letter_consent_for_comp') then
    alter table hr.verification_letter_request add constraint verification_letter_consent_for_comp
      check (not includes_compensation or employee_consent_at is not null);
  end if;
end $$;

create index if not exists verification_letter_employment_idx
  on hr.verification_letter_request (employment_id, requested_at desc) where deleted_at is null;

update platform.entity_types set taxonomy_node_id = '394893a0-be07-4b4a-9b50-3a0cd984bc80'
where token = 'hr_verification_letter_request';

do $$ begin
  if (select rls_variant from platform.entity_types where token = 'hr_verification_letter_request') is distinct from 'restricted' then
    update platform.entity_types set rls_variant = 'restricted' where token = 'hr_verification_letter_request';
    perform iam.apply_rls('hr','verification_letter_request','hr_verification_letter_request','restricted');
  end if;
end $$;

-- ============================================================ 12.15 hr.survey  (DIR, D24d)
do $$ begin
  if to_regclass('hr.survey') is null then
    perform platform.create_entity_table(
      p_schema => 'hr', p_table => 'survey', p_token => 'hr_survey', p_label => 'Survey',
      p_fields => ARRAY[
        'name text NOT NULL',
        $f$survey_kind text NOT NULL CHECK (survey_kind IN ('exit_interview','stay_interview','onboarding_check','pulse','engagement','custom'))$f$,
        'description text',
        'intro_text text',
        'closing_text text',
        'is_anonymous boolean NOT NULL DEFAULT false',
        'anonymity_threshold integer NOT NULL DEFAULT 5',
        $f$trigger_kind text NOT NULL DEFAULT 'manual' CHECK (trigger_kind IN ('manual','separation','hire_plus_days','cadence','checklist_item'))$f$,
        'trigger_offset_days integer',
        'due_offset_days integer NOT NULL DEFAULT 14',
        $f$reminder_offsets_days integer[] NOT NULL DEFAULT '{7,3,1}'$f$,
        'allow_outsider_response boolean NOT NULL DEFAULT true',
        $f$state text NOT NULL DEFAULT 'draft' CHECK (state IN ('draft','published','retired'))$f$,
        'published_at timestamptz',
        'retired_at timestamptz',
        $f$custom jsonb NOT NULL DEFAULT '{}'::jsonb$f$
      ],
      p_variant => 'entity', p_versioned => true, p_soft_delete => true, p_visibility => 'personal',
      p_category => true, p_listed => true, p_org_default => false, p_gin_jsonb => false,
      p_parents => null);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'survey_name_unique') then
    alter table hr.survey add constraint survey_name_unique unique (organization_id, name);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'survey_anonymity_threshold_sane') then
    alter table hr.survey add constraint survey_anonymity_threshold_sane
      check (anonymity_threshold >= 1);
  end if;
end $$;

create index if not exists survey_kind_idx on hr.survey (organization_id, survey_kind, state)
  where deleted_at is null;
create index if not exists survey_custom_gin on hr.survey using gin (custom jsonb_path_ops);

update platform.entity_types set
  title_column = 'name', reference_pickable = true,
  taxonomy_node_id = '0940b7f9-d72a-4b56-84fd-4bb4fafd7dbe'
where token = 'hr_survey';

-- ============================================================ 12.16 hr.survey_question  (COMP of hr_survey)
-- A REAL TABLE, not a `questions jsonb` blob (the choice hr.interview_kit made the other way),
-- because survey answers are AGGREGATED ACROSS RESPONDENTS BY QUESTION -- "average rating on
-- question 4 across forty exits" needs a stable question identity that survives a wording edit,
-- and a jsonb array index does not provide one.
do $$ begin
  if to_regclass('hr.survey_question') is null then
    perform platform.create_entity_table(
      p_schema => 'hr', p_table => 'survey_question', p_token => 'hr_survey_question',
      p_label => 'Survey question',
      p_fields => ARRAY[
        'survey_id uuid NOT NULL REFERENCES hr.survey(id)',
        'position integer NOT NULL',
        'prompt text NOT NULL',
        'help_text text',
        $f$question_kind text NOT NULL CHECK (question_kind IN ('single_select','multi_select','rating','nps','free_text','boolean','ranking'))$f$,
        $f$options jsonb NOT NULL DEFAULT '[]'::jsonb$f$,
        'scale_min integer',
        'scale_max integer',
        'is_required boolean NOT NULL DEFAULT false',
        'category_key text',
        $f$show_if jsonb NOT NULL DEFAULT '{}'::jsonb$f$
      ],
      p_variant => 'component', p_versioned => true, p_soft_delete => true, p_visibility => 'none',
      p_category => false, p_listed => false, p_org_default => false, p_gin_jsonb => false,
      p_parents => ARRAY['hr_survey:survey_id']);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'survey_question_position_unique') then
    alter table hr.survey_question add constraint survey_question_position_unique
      unique (survey_id, position);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'survey_question_scale_ordered') then
    alter table hr.survey_question add constraint survey_question_scale_ordered
      check (scale_max is null or scale_min is null or scale_max > scale_min);
  end if;
end $$;

update platform.entity_types set taxonomy_node_id = '0940b7f9-d72a-4b56-84fd-4bb4fafd7dbe'
where token = 'hr_survey_question';

-- ============================================================ 12.17 hr.survey_invitation  (COMP of hr_survey)
-- separation_id IS WHAT MAKES THE EXIT-INTERVIEW TRIGGER AUTOMATIC: the separation writes the
-- invitation, and the invitation reaches the leaver by token link after access shutoff
-- (AR 1.16's lane, reused).
do $$ begin
  if to_regclass('hr.survey_invitation') is null then
    perform platform.create_entity_table(
      p_schema => 'hr', p_table => 'survey_invitation', p_token => 'hr_survey_invitation',
      p_label => 'Survey invitation',
      p_fields => ARRAY[
        'survey_id uuid NOT NULL REFERENCES hr.survey(id)',
        'employment_id uuid REFERENCES hr.employment(id)',
        'employee_id uuid REFERENCES hr.employee(id)',
        'separation_id uuid REFERENCES hr.separation(id)',
        'checklist_item_id uuid REFERENCES hr.checklist_item(id)',
        'invited_at timestamptz NOT NULL DEFAULT now()',
        'due_on date',
        $f$delivery_channel text NOT NULL DEFAULT 'email' CHECK (delivery_channel IN ('email','sms','in_app','token_link'))$f$,
        'delivery_address text',
        'outsider_token_ref text',
        'notification_id uuid REFERENCES communication.notification(id)',
        'reminder_count integer NOT NULL DEFAULT 0',
        'last_reminder_at timestamptz',
        'opened_at timestamptz',
        $f$state text NOT NULL DEFAULT 'invited' CHECK (state IN ('invited','opened','in_progress','completed','declined','expired','bounced'))$f$,
        'completed_at timestamptz',
        'declined_reason text'
      ],
      p_variant => 'component', p_versioned => true, p_soft_delete => true, p_visibility => 'none',
      p_category => false, p_listed => false, p_org_default => false, p_gin_jsonb => false,
      p_parents => ARRAY['hr_survey:survey_id']);
  end if;
end $$;

create unique index if not exists survey_invitation_one_per_employment
  on hr.survey_invitation (survey_id, employment_id)
  where employment_id is not null and deleted_at is null;
create index if not exists survey_invitation_open_idx
  on hr.survey_invitation (organization_id, state, due_on) where deleted_at is null;
create index if not exists survey_invitation_separation_idx
  on hr.survey_invitation (separation_id) where separation_id is not null;

update platform.entity_types set taxonomy_node_id = '0940b7f9-d72a-4b56-84fd-4bb4fafd7dbe'
where token = 'hr_survey_invitation';

-- ============================================================ 12.18 hr.survey_response  (COMP of hr_survey_invitation)
-- Append-only: AN EDITED ANSWER IS A NEW INVITATION, NOT A REWRITTEN RESPONSE -- an exit
-- interview that can be quietly reworded after the fact is not evidence of anything.
--
-- 🚨 ANONYMITY IS ENFORCED ON THE READ, NOT BY DROPPING THE LINK. hr.survey.is_anonymous
-- suppresses respondent identity in every aggregate below anonymity_threshold inside
-- hr.survey_aggregate(...) -- the same small-cell pattern as hr.eeo_aggregate (11.6) and
-- hr.blended_labor_rate (4.6). The invitation FK STAYS because reminders, completion tracking and
-- retention all need it: an anonymous survey with no invitation row cannot chase a non-responder,
-- and the platform has no other way to know who was asked.
-- ⚠️ hr.survey_aggregate is NOT built here -- see RECORDED DECISION 5. Until it ships, nothing
-- stands between an invitation-lane reader and an anonymous respondent's answers.
do $$ begin
  if to_regclass('hr.survey_response') is null then
    perform platform.create_entity_table(
      p_schema => 'hr', p_table => 'survey_response', p_token => 'hr_survey_response',
      p_label => 'Survey response',
      p_fields => ARRAY[
        'survey_invitation_id uuid NOT NULL REFERENCES hr.survey_invitation(id)',
        'survey_question_id uuid NOT NULL REFERENCES hr.survey_question(id)',
        'answer_text text',
        'answer_number numeric(12,4)',
        'answer_boolean boolean',
        $f$answer_option_keys text[] NOT NULL DEFAULT '{}'$f$,
        'answered_at timestamptz NOT NULL DEFAULT now()',
        'skipped boolean NOT NULL DEFAULT false',
        -- {{ACTOR}} -- an outsider-writable table (SPEC-ESIGN 5.5): a leaver answers after access
        -- shutoff, so auth.uid() is NULL and created_by would have no attributable author.
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
      p_parents => ARRAY['hr_survey_invitation:survey_invitation_id']);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'survey_response_one_per_question') then
    alter table hr.survey_response add constraint survey_response_one_per_question
      unique (survey_invitation_id, survey_question_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'survey_response_actor_identified') then
    alter table hr.survey_response add constraint survey_response_actor_identified check (
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

drop trigger if exists _zz_survey_response_no_delete on hr.survey_response;
create trigger _zz_survey_response_no_delete before delete on hr.survey_response
  for each row execute function hr._reject_delete();

create index if not exists survey_response_invitation_idx on hr.survey_response (survey_invitation_id);
create index if not exists survey_response_question_idx on hr.survey_response (survey_question_id);

update platform.entity_types set taxonomy_node_id = '0940b7f9-d72a-4b56-84fd-4bb4fafd7dbe'
where token = 'hr_survey_response';

-- ============================================================ the write guard, per table
do $$
declare t text;
begin
  foreach t in array ARRAY['checklist_template','checklist_template_item','checklist_run',
                           'checklist_item','provisioning_result','asset','asset_assignment',
                           'tax_withholding','i9','i9_document','new_hire_report','benefits_event',
                           'records_request','verification_letter_request','survey',
                           'survey_question','survey_invitation','survey_response'] loop
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
            where acknowledged_at is null and object_ref like 'hr.%'
              and rule = 'org_not_null_no_backstop' loop
    perform platform.ddl_guard_ack(
      p_reason => 'HR is org-explicit by the 2026-08-21 NO-NULL-ORG ruling; no assignment trigger by design (SPEC-DATA-MODEL 1.3)',
      p_by     => 'hr-domain-migration hr_11',
      p_rule   => 'org_not_null_no_backstop',
      p_object_ref => r.object_ref);
  end loop;
end $$;

-- ============================================================ assertions
do $$
declare r record; v_bad integer; v_rules text;
begin
  for r in select unnest(ARRAY['checklist_template','checklist_template_item','checklist_run',
                               'checklist_item','provisioning_result','asset','asset_assignment',
                               'tax_withholding','i9','i9_document','new_hire_report','benefits_event',
                               'records_request','verification_letter_request','survey',
                               'survey_question','survey_invitation','survey_response']) as t loop
    select count(*) into v_bad from iam.verify_canonical('hr', r.t, 'hr_' || r.t) where status in ('FAIL','WARN');
    if v_bad > 0 then
      raise exception 'hr_11: hr.% has % FAIL/WARN conformance rows', r.t, v_bad;
    end if;
    if not iam.canonical_certify_ok('hr', r.t, 'hr_' || r.t) then
      raise exception 'hr_11: hr.% does not certify', r.t;
    end if;
    if not exists (select 1 from pg_trigger tg join pg_class c on c.oid = tg.tgrelid
                     join pg_namespace n on n.oid = c.relnamespace
                    where n.nspname = 'hr' and c.relname = r.t and tg.tgname = '_zz_guard_hr_write') then
      raise exception 'hr_11: hr.% is missing _zz_guard_hr_write', r.t;
    end if;
    if (select taxonomy_node_id from platform.entity_types where token = 'hr_' || r.t) is null then
      raise exception 'hr_11: hr_% has no taxonomy_node_id', r.t;
    end if;
  end loop;

  -- the four CONF flips
  select count(*) into v_bad from platform.entity_types
   where token in ('hr_tax_withholding','hr_i9','hr_records_request','hr_verification_letter_request')
     and rls_variant <> 'restricted';
  if v_bad > 0 then
    raise exception 'hr_11: % onboarding CONF table(s) are not restricted', v_bad;
  end if;

  -- section 18.1a: hr_tax_withholding is the one pay-class token in this file
  if not (select suppress_platform_admin_lane from platform.entity_types where token = 'hr_tax_withholding') then
    raise exception 'hr_11: hr_tax_withholding carries pay data but lacks suppress_platform_admin_lane';
  end if;

  -- AR2's access-shutoff evidence rule, made structural
  if not exists (select 1 from pg_constraint where conname = 'checklist_item_complete_needs_result') then
    raise exception 'hr_11: checklist_item_complete_needs_result is missing -- a failed shutoff could be marked complete';
  end if;

  -- hr.verification_letter_request is the one table here classified to hr-employees
  if (select taxonomy_node_id from platform.entity_types where token = 'hr_verification_letter_request')
     <> '394893a0-be07-4b4a-9b50-3a0cd984bc80' then
    raise exception 'hr_11: hr_verification_letter_request is not classified to hr-employees';
  end if;

  -- section 17.3 / the conveyance trap
  select count(*) into v_bad from platform.entity_relationships er
    join platform.entity_types c on c.token = er.child_type
   where c.schema_name = 'hr' and c.rls_variant = 'restricted';
  if v_bad > 0 then
    raise exception 'hr_11: % restricted hr table(s) carry an entity_relationships edge', v_bad;
  end if;

  if exists (select 1 from information_schema.columns c
               join platform.entity_types e
                 on e.schema_name = c.table_schema and e.table_name = c.table_name
              where c.table_schema = 'hr'
                and c.column_name in ('user_id','owner_id','author_id','creator_id')) then
    raise exception 'hr_11: an hr table carries a legacy owner column; it can never certify';
  end if;

  select string_agg(distinct rule, ', ') into v_rules from platform.ddl_guard_log
   where acknowledged_at is null and object_ref like 'hr.%'
     and rule <> 'org_not_null_no_backstop';
  if v_rules is not null then
    raise exception 'hr_11: unacked DDL guard rows on hr.* under unsanctioned rule(s): %', v_rules;
  end if;

  select count(*) into v_bad from platform.ddl_guard_log
   where acknowledged_at is null and object_ref like 'hr.%';
  if v_bad > 0 then
    raise exception 'hr_11: % unacked DDL guard rows remain on hr.*', v_bad;
  end if;
end $$;
