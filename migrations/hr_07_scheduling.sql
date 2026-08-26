-- HR domain, migration 07 of 16 (register item HRB-006, core tranche 2).
--
-- Scheduling: eleven tables on the UNIVERSAL D17 grain -- hr.crew first (five tables plus
-- hr.position_assignment FK it), then schedule, shift, schedule_change, staffing_requirement,
-- labor_target, availability, shift_claim, schedule_template, schedule_template_shift and
-- schedule_guidance -- plus the four deferred shift/crew FKs owed by files 04 and 06, plus the
-- hr.v_my_week view.
--
-- Authority: SPEC-DATA-MODEL sections 8.1-8.10, 17.7, 18.1 file 07, 18.5 query H.
--
-- 🚨 D17 -- THE SCHEDULE GRAIN IS UNIVERSAL (re-cut 2026-08-25, pre-G1). Arman: "Build
-- universally to support moving crews and multi-site movement per person/week. Do not constrain
-- or hardcode to single-site per week." Four structural consequences this file implements:
--
--   1. THE SHIFT OWNS THE LOCATION, NOT THE SCHEDULE. hr.shift carries the full {{JURIS}} block
--      (work_location_id, jurisdiction_id, tz, local_work_date), all NOT NULL, stamped at write.
--      hr.schedule.primary_location_id is NULLABLE and is a display/filter hint only --
--      schedule_kind 'crew', 'route' and 'org' legitimately have none.
--   2. `display_tz` REPLACES `tz`, and `jurisdiction_id` IS REMOVED FROM hr.schedule ENTIRELY.
--      There is no defensible per-schedule value when the shifts span states. Nothing resolves a
--      jurisdiction, a timezone or an OT rule from a schedule row -- section 18.5 query H is the
--      standing conformance check and this file asserts it before it commits.
--   3. Crew/route is a first-class grouping dimension (hr.crew), not a department hack. Crew
--      MEMBERSHIP is effective-dated and lives on hr.position_assignment.crew_id -- so "who was
--      on this crew in March" is answered by the same as-of resolver as every other position
--      attribute. Rejected: an hr.crew_member table, which would be a second undated membership
--      truth competing with the position assignment.
--   4. A person's week spans schedules and locations, so the employee-facing week is
--      hr.v_my_week -- a union across every shift assigned to the employment in the window
--      regardless of which schedule or location it came from -- never "their location's
--      schedule".
--
-- Idempotent. Applied live as migration `hr_07_scheduling`.
--
-- ===================================================================================
-- RECORDED TECHNICAL DECISIONS (EXECUTION section 8)
--
-- 1. hr.schedule_guidance CARRIES `custom jsonb`, which its own field list (section 8.10) omits.
--    Section 17.6 enumerates the twenty-five tables that carry the column and names
--    `hr_schedule_guidance` explicitly in that list; section 8.10's p_fields does not. The other
--    four scheduling members of the 17.6 list (hr_crew, hr_schedule, hr_shift,
--    hr_schedule_template) all declare it in their own field lists, so 8.10 is the outlier and
--    17.6 is the enumerated authority. The column is inert storage either way (section 17.6:
--    "The column is not participation" -- reachability is a platform.custom_field_target row,
--    which v1 does not seed for this token), so adding it is a positive-add that costs nothing
--    and avoids a later ALTER on a live table.
--    OWED SPEC CORRECTION: one line on section 8.10's p_fields.
--
-- 2. FKs the spec declares BARE stay bare, even where the target now exists in this same file.
--    `hr.schedule.source_template_id` (hr.schedule_template is created later in this file) and
--    `hr.shift.baseline_shift_id` (a self-reference) are both plain uuids in their published
--    field lists and neither appears in section 18.1's deferred-FK schedule. This file adds
--    exactly the four FKs section 18.1 names for it and no others -- the same discipline file 06
--    applied to `hr.time_adjustment.work_interval_id`. Inventing an unlisted FK would constrain
--    a disposal/supersession path the spec has not ruled on.
--
-- 3. hr.v_my_week is created `with (security_invoker = true)`, following the tranche-1 precedent
--    for hr.v_position_current / hr.v_org_chart_current rather than section 8.1b's prose. A
--    plain view is checked as its OWNER -- here the table owner -- and would bypass RLS
--    entirely; security_invoker is what actually delivers the "inherits hr.shift's component
--    policy and hr.schedule's entity policy" the section describes. Section 18.4 probe 3
--    (iam.entity_read_equivalence) is the lane-level proof and belongs to HRB-016.
-- ===================================================================================

set local lock_timeout = '20s';

-- ============================================================ 8.1a hr.crew  (DIR)
-- A crew is a DURABLE SET OF PEOPLE WHO MOVE TOGETHER -- an install crew, a route, a travelling
-- team; its members' shifts may sit at a different work_location_id every day. It leads this
-- file because hr.schedule, hr.shift, hr.staffing_requirement, hr.labor_target and
-- hr.position_assignment all FK it.
-- route_definition is an untyped stop list for the route case; nothing computes against it in
-- v1, and live fleet telematics is explicitly out of scope (D24e).
do $$ begin
  if to_regclass('hr.crew') is null then
    perform platform.create_entity_table(
      p_schema => 'hr', p_table => 'crew', p_token => 'hr_crew', p_label => 'Crew',
      p_fields => ARRAY[
        'name text NOT NULL',
        'code text',
        $f$crew_kind text NOT NULL DEFAULT 'crew' CHECK (crew_kind IN ('crew','route','team','shift_team','project'))$f$,
        'home_location_id uuid REFERENCES hr.location(id)',
        'department_id uuid REFERENCES hr.department(id)',
        'lead_employment_id uuid REFERENCES hr.employment(id)',
        $f$default_job_title_ids uuid[] NOT NULL DEFAULT '{}'$f$,
        $f$required_credential_ids uuid[] NOT NULL DEFAULT '{}'$f$,
        $f$route_definition jsonb NOT NULL DEFAULT '{}'::jsonb$f$,
        'is_mobile boolean NOT NULL DEFAULT true',
        'is_active boolean NOT NULL DEFAULT true',
        $f$custom jsonb NOT NULL DEFAULT '{}'::jsonb$f$
      ],
      p_variant => 'entity', p_versioned => true, p_soft_delete => true, p_visibility => 'personal',
      p_category => true, p_listed => true, p_org_default => false, p_gin_jsonb => false,
      p_parents => null);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'crew_name_unique_per_org') then
    alter table hr.crew add constraint crew_name_unique_per_org unique (organization_id, name);
  end if;
end $$;

create index if not exists crew_active_idx on hr.crew (organization_id, is_active) where deleted_at is null;
create index if not exists crew_home_location_idx on hr.crew (home_location_id) where home_location_id is not null;
create index if not exists crew_custom_gin on hr.crew using gin (custom jsonb_path_ops);

update platform.entity_types set
  title_column = 'name', reference_pickable = true,
  taxonomy_node_id = '4e06056c-e157-41de-80ab-86880ee8ad77'
where token = 'hr_crew';

-- ============================================================ 8.1 hr.schedule  (DIR)
-- 🚨 NO jurisdiction_id AND NO tz ON THIS TABLE (D17 change 2). `display_tz` is the zone the
-- grid RENDERS in, nothing more, and is deliberately named so nobody mistakes it for the
-- operative timezone of any hour worked.
-- The published schedule is an IMMUTABLE BASELINE (AR2): at the `published` transition the full
-- shift set is frozen into `baseline` jsonb with a `baseline_sha256`; the baseline is never
-- rewritten and every later difference is an hr.schedule_change row.
-- horizon_label supports D17 part 2's arbitrary horizons -- a week, a fortnight, a healthcare
-- six-week block, a six-month construction programme. No CHECK constrains the window length.
do $$ begin
  if to_regclass('hr.schedule') is null then
    perform platform.create_entity_table(
      p_schema => 'hr', p_table => 'schedule', p_token => 'hr_schedule', p_label => 'Schedule',
      p_fields => ARRAY[
        'primary_location_id uuid REFERENCES hr.location(id)',
        'crew_id uuid REFERENCES hr.crew(id)',
        'department_id uuid REFERENCES hr.department(id)',
        $f$schedule_kind text NOT NULL DEFAULT 'site' CHECK (schedule_kind IN ('site','crew','route','mixed','org'))$f$,
        'name text',
        'period_start_on date NOT NULL',
        'period_end_on date NOT NULL',
        'horizon_label text',
        'display_tz text NOT NULL',
        $f$state text NOT NULL DEFAULT 'draft' CHECK (state IN ('draft','review','published','archived'))$f$,
        'published_at timestamptz',
        'published_by_employment_id uuid REFERENCES hr.employment(id)',
        $f$baseline jsonb NOT NULL DEFAULT '{}'::jsonb$f$,
        'baseline_sha256 text',
        'advance_notice_days integer',
        'fair_workweek_rule_version_id uuid REFERENCES hr.jurisdiction_rule(id)',
        'labor_budget_amount numeric(14,2)',
        'labor_target_percent numeric(6,3)',
        'projected_labor_amount numeric(14,2)',
        'ai_draft_evidence_id uuid',
        'source_template_id uuid',
        $f$custom jsonb NOT NULL DEFAULT '{}'::jsonb$f$
      ],
      p_variant => 'entity', p_versioned => true, p_soft_delete => true, p_visibility => 'personal',
      p_category => false, p_listed => true, p_org_default => false, p_gin_jsonb => false,
      p_parents => null);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'schedule_window_ordered') then
    alter table hr.schedule add constraint schedule_window_ordered
      check (period_end_on >= period_start_on);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'schedule_published_has_stamp') then
    alter table hr.schedule add constraint schedule_published_has_stamp
      check (state <> 'published' or published_at is not null);
  end if;
end $$;

create index if not exists schedule_org_period_idx on hr.schedule (organization_id, period_start_on desc);
create index if not exists schedule_crew_idx on hr.schedule (organization_id, crew_id, period_start_on desc)
  where crew_id is not null;
create index if not exists schedule_location_idx
  on hr.schedule (organization_id, primary_location_id, period_start_on desc)
  where primary_location_id is not null;
create index if not exists schedule_state_idx on hr.schedule (state, period_start_on) where deleted_at is null;
create index if not exists schedule_custom_gin on hr.schedule using gin (custom jsonb_path_ops);

update platform.entity_types set
  title_column = 'name', reference_pickable = true,
  taxonomy_node_id = '4e06056c-e157-41de-80ab-86880ee8ad77'
where token = 'hr_schedule';

-- ============================================================ 8.2 hr.shift  (COMP of hr_schedule)
-- 🚨 D17: THE SHIFT IS WHERE A LOCATION LIVES. The {{JURIS}} block is NOT NULL here and stamped
-- at write -- which is what makes a multi-site week, a travelling crew and a cross-state route
-- all ordinary data rather than special cases.
-- THE AR2 EDGE CASES ARE COLUMNS, NOT HOPES: crosses_midnight, dst_transition, local_start_date
-- and {{JURIS}} are computed once at write. A shift over a DST boundary is 23 or 25 hours and
-- scheduled_hours is the real elapsed figure, not end - start in wall-clock arithmetic.
-- crew_id denormalises the assignment's crew as of the shift date so the crew board is one index
-- scan; it is a HINT -- hr.position_assignment.crew_id as of local_work_date is the authority.
do $$ begin
  if to_regclass('hr.shift') is null then
    perform platform.create_entity_table(
      p_schema => 'hr', p_table => 'shift', p_token => 'hr_shift', p_label => 'Shift',
      p_fields => ARRAY[
        'schedule_id uuid NOT NULL REFERENCES hr.schedule(id)',
        'employment_id uuid REFERENCES hr.employment(id)',
        'position_assignment_id uuid REFERENCES hr.position_assignment(id)',
        'crew_id uuid REFERENCES hr.crew(id)',
        'job_title_id uuid REFERENCES hr.job_title(id)',
        'department_id uuid REFERENCES hr.department(id)',
        'starts_at timestamptz NOT NULL',
        'ends_at timestamptz NOT NULL',
        'local_start_date date NOT NULL',
        'crosses_midnight boolean NOT NULL DEFAULT false',
        'dst_transition boolean NOT NULL DEFAULT false',
        'scheduled_hours numeric(8,4) NOT NULL',
        $f$break_plan jsonb NOT NULL DEFAULT '[]'::jsonb$f$,
        'is_open boolean NOT NULL DEFAULT false',
        'is_on_call boolean NOT NULL DEFAULT false',
        'is_split_shift boolean NOT NULL DEFAULT false',
        'split_group_key text',
        $f$required_credential_ids uuid[] NOT NULL DEFAULT '{}'$f$,
        $f$status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','claimed','swapped','called_off','cancelled','completed','no_show'))$f$,
        'baseline_shift_id uuid',
        'published_starts_at timestamptz',
        'published_ends_at timestamptz',
        'premium_earning_code_id uuid REFERENCES hr.earning_code(id)',
        'note text',
        $f$custom jsonb NOT NULL DEFAULT '{}'::jsonb$f$,
        -- {{JURIS}}
        'work_location_id uuid NOT NULL REFERENCES hr.location(id)',
        'jurisdiction_id uuid NOT NULL REFERENCES hr.jurisdiction(id)',
        'tz text NOT NULL',
        'local_work_date date NOT NULL'
      ],
      p_variant => 'component', p_versioned => true, p_soft_delete => true, p_visibility => 'none',
      p_category => false, p_listed => false, p_org_default => false, p_gin_jsonb => false,
      p_parents => ARRAY['hr_schedule:schedule_id']);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'shift_ordered') then
    alter table hr.shift add constraint shift_ordered check (ends_at > starts_at);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'shift_open_has_no_employment') then
    alter table hr.shift add constraint shift_open_has_no_employment
      check (not is_open or employment_id is null);
  end if;
  -- Double-booking: one employee cannot hold two overlapping ASSIGNED shifts.
  if not exists (select 1 from pg_constraint where conname = 'shift_no_double_booking') then
    alter table hr.shift add constraint shift_no_double_booking
      exclude using gist (employment_id extensions.gist_uuid_ops with =,
                          tstzrange(starts_at, ends_at, '[)') with &&)
      where (employment_id is not null and deleted_at is null
             and status not in ('cancelled','called_off','swapped'));
  end if;
end $$;

create index if not exists shift_schedule_idx on hr.shift (schedule_id, starts_at);
create index if not exists shift_employment_time_idx on hr.shift (employment_id, starts_at desc)
  where employment_id is not null and deleted_at is null;
create index if not exists shift_open_idx on hr.shift (organization_id, starts_at)
  where is_open and deleted_at is null;
create index if not exists shift_location_day_idx on hr.shift (work_location_id, local_work_date);
create index if not exists shift_custom_gin on hr.shift using gin (custom jsonb_path_ops);

update platform.entity_types set taxonomy_node_id = '4e06056c-e157-41de-80ab-86880ee8ad77'
where token = 'hr_shift';

-- ============================================================ 8.3 hr.schedule_change  (COMP of hr_schedule)
-- Simultaneously the change log, the predictive-scheduling compliance evidence, and the
-- premium-pay trigger: AR2's "initiator, timestamp, reason, notice window, voluntary/
-- employer-driven, employee consent/decline, delivery/read evidence, affected hours, any
-- premium" in ONE row.
-- 🚨 FAIR-WORKWEEK NOTICE IS EVALUATED PER SHIFT, FROM THE SHIFT'S OWN JURISDICTION -- a
-- multi-site week can be subject to a city ordinance on Tuesday and to nothing on Thursday.
-- notice_minutes here is the operative per-shift figure; hr.schedule's advance_notice_days and
-- fair_workweek_rule_version_id record only the DOMINANT rule for the publish event.
do $$ begin
  if to_regclass('hr.schedule_change') is null then
    perform platform.create_entity_table(
      p_schema => 'hr', p_table => 'schedule_change', p_token => 'hr_schedule_change',
      p_label => 'Schedule change',
      p_fields => ARRAY[
        'schedule_id uuid NOT NULL REFERENCES hr.schedule(id)',
        'shift_id uuid REFERENCES hr.shift(id)',
        'employment_id uuid REFERENCES hr.employment(id)',
        $f$change_kind text NOT NULL CHECK (change_kind IN ('added','removed','time_changed','reassigned','location_changed','cancelled','called_off','covered','swapped','claimed'))$f$,
        'occurred_at timestamptz NOT NULL DEFAULT now()',
        'reason_category_id uuid REFERENCES platform.categories(id)',
        'reason_note text',
        'is_employer_driven boolean NOT NULL',
        'notice_minutes integer',
        $f$employee_consent_state text CHECK (employee_consent_state IN ('not_required','requested','consented','declined'))$f$,
        'employee_consent_at timestamptz',
        'affected_hours numeric(8,4)',
        'premium_earning_code_id uuid REFERENCES hr.earning_code(id)',
        'premium_amount numeric(14,2)',
        $f$before_values jsonb NOT NULL DEFAULT '{}'::jsonb$f$,
        $f$after_values jsonb NOT NULL DEFAULT '{}'::jsonb$f$,
        'notification_id uuid REFERENCES communication.notification(id)',
        'delivered_at timestamptz',
        'read_at timestamptz',
        -- {{CALC}}
        $f$rule_version_ids uuid[] NOT NULL DEFAULT '{}'$f$,
        'engine_key text NOT NULL',
        'engine_version text NOT NULL',
        $f$calc jsonb NOT NULL DEFAULT '{}'::jsonb$f$,
        'computed_at timestamptz NOT NULL DEFAULT now()',
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
      p_parents => ARRAY['hr_schedule:schedule_id']);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'schedule_change_actor_identified') then
    alter table hr.schedule_change add constraint schedule_change_actor_identified check (
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

-- Append-only: the evidence trail is immutable except for the delivery half, which is written
-- as the notification is delivered and read. Same shape as hr._punch_immutable (section 7.1).
create or replace function hr._schedule_change_immutable() returns trigger
language plpgsql as $fn$
begin
  if (to_jsonb(new) - 'delivered_at' - 'read_at' - 'updated_at' - 'updated_by' - 'version')
     is distinct from
     (to_jsonb(old) - 'delivered_at' - 'read_at' - 'updated_at' - 'updated_by' - 'version') then
    raise exception 'hr.schedule_change is fair-workweek evidence: only delivered_at and read_at may change'
      using errcode = 'P0001';
  end if;
  return new;
end
$fn$;

comment on function hr._schedule_change_immutable() is
  'The predictive-scheduling evidence trail is written once. Only the delivery half (delivered_at, read_at) may be updated afterwards (SPEC-DATA-MODEL 8.3).';

drop trigger if exists _zz_schedule_change_immutable on hr.schedule_change;
create trigger _zz_schedule_change_immutable before update on hr.schedule_change
  for each row execute function hr._schedule_change_immutable();
drop trigger if exists _zz_schedule_change_no_delete on hr.schedule_change;
create trigger _zz_schedule_change_no_delete before delete on hr.schedule_change
  for each row execute function hr._reject_delete();

create index if not exists schedule_change_schedule_idx on hr.schedule_change (schedule_id, occurred_at desc);
create index if not exists schedule_change_employment_idx on hr.schedule_change (employment_id, occurred_at desc);

update platform.entity_types set taxonomy_node_id = '4e06056c-e157-41de-80ab-86880ee8ad77'
where token = 'hr_schedule_change';

-- ============================================================ 8.4 hr.staffing_requirement  (COMP of hr_location)
-- AR 1.21 -- WITHOUT THIS THE FLAGSHIP SCHEDULING AI HAS NOTHING TO REASON OVER. The Provision
-- for a schedule draft is assembled from these rows plus hr.availability, hr.credential,
-- hr.leave_request and hr.compensation rates; with no demand side it comes up empty and the
-- headline feature is undeliverable for a DATA reason.
do $$ begin
  if to_regclass('hr.staffing_requirement') is null then
    perform platform.create_entity_table(
      p_schema => 'hr', p_table => 'staffing_requirement', p_token => 'hr_staffing_requirement',
      p_label => 'Staffing requirement',
      p_fields => ARRAY[
        'location_id uuid NOT NULL REFERENCES hr.location(id)',
        'crew_id uuid REFERENCES hr.crew(id)',
        'department_id uuid REFERENCES hr.department(id)',
        'job_title_id uuid REFERENCES hr.job_title(id)',
        $f$required_credential_ids uuid[] NOT NULL DEFAULT '{}'$f$,
        'day_of_week smallint CHECK (day_of_week between 0 and 6)',
        'specific_date date',
        'interval_start time NOT NULL',
        'interval_end time NOT NULL',
        'headcount integer NOT NULL CHECK (headcount >= 0)',
        'min_headcount integer',
        'max_headcount integer',
        $f$demand_basis jsonb NOT NULL DEFAULT '{}'::jsonb$f$,
        'is_template boolean NOT NULL DEFAULT false',
        'template_name text',
        'effective_from date NOT NULL',
        'effective_to date',
        $f$effective_range daterange GENERATED ALWAYS AS (daterange(effective_from, effective_to, '[)')) STORED$f$,
        'recorded_at timestamptz NOT NULL DEFAULT now()',
        'change_reason_category_id uuid REFERENCES platform.categories(id)',
        'supersedes_id uuid'
      ],
      p_variant => 'component', p_versioned => true, p_soft_delete => true, p_visibility => 'none',
      p_category => false, p_listed => false, p_org_default => false, p_gin_jsonb => false,
      p_parents => ARRAY['hr_location:location_id']);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'staffing_requirement_window_ordered') then
    alter table hr.staffing_requirement add constraint staffing_requirement_window_ordered
      check (effective_to is null or effective_to > effective_from);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'staffing_requirement_supersedes_fk') then
    alter table hr.staffing_requirement add constraint staffing_requirement_supersedes_fk
      foreign key (supersedes_id) references hr.staffing_requirement(id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'staffing_requirement_when') then
    alter table hr.staffing_requirement add constraint staffing_requirement_when
      check (day_of_week is not null or specific_date is not null);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'staffing_requirement_headcount_band') then
    alter table hr.staffing_requirement add constraint staffing_requirement_headcount_band
      check (min_headcount is null or max_headcount is null or max_headcount >= min_headcount);
  end if;
end $$;

create index if not exists staffing_requirement_location_idx
  on hr.staffing_requirement (location_id, day_of_week) where deleted_at is null;
create index if not exists staffing_requirement_range_gist
  on hr.staffing_requirement using gist (location_id extensions.gist_uuid_ops, effective_range)
  where deleted_at is null;

update platform.entity_types set taxonomy_node_id = '4e06056c-e157-41de-80ab-86880ee8ad77'
where token = 'hr_staffing_requirement';

-- ============================================================ 8.5 hr.labor_target  (COMP of hr_location)
-- The labour-cost view compares this against hr.shift.scheduled_hours x rate-at-time (AR 1.6).
-- 🚨 That rate NEVER comes from hr.compensation.amount directly -- it comes from
-- hr.blended_labor_rate(...), the one non-invertible way out of the compensation table
-- (section 4.6). No view, caller or Provision reads an individual's pay for a costing figure.
do $$ begin
  if to_regclass('hr.labor_target') is null then
    perform platform.create_entity_table(
      p_schema => 'hr', p_table => 'labor_target', p_token => 'hr_labor_target',
      p_label => 'Labor target',
      p_fields => ARRAY[
        'location_id uuid NOT NULL REFERENCES hr.location(id)',
        'crew_id uuid REFERENCES hr.crew(id)',
        $f$period_kind text NOT NULL CHECK (period_kind IN ('day','week','month','pay_period'))$f$,
        'period_start_on date NOT NULL',
        'target_labor_amount numeric(14,2)',
        'target_labor_percent numeric(6,3)',
        'projected_revenue numeric(14,2)',
        'basis text'
      ],
      p_variant => 'component', p_versioned => true, p_soft_delete => true, p_visibility => 'none',
      p_category => false, p_listed => false, p_org_default => false, p_gin_jsonb => false,
      p_parents => ARRAY['hr_location:location_id']);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'labor_target_unique') then
    alter table hr.labor_target add constraint labor_target_unique
      unique (location_id, period_kind, period_start_on);
  end if;
end $$;

create index if not exists labor_target_period_idx on hr.labor_target (organization_id, period_start_on desc);

update platform.entity_types set taxonomy_node_id = '4e06056c-e157-41de-80ab-86880ee8ad77'
where token = 'hr_labor_target';

-- ============================================================ 8.6 hr.availability  (COMP of hr_employment)
-- Effective-dated because "I'm unavailable Tuesdays" is true FOR A PERIOD, not forever.
do $$ begin
  if to_regclass('hr.availability') is null then
    perform platform.create_entity_table(
      p_schema => 'hr', p_table => 'availability', p_token => 'hr_availability',
      p_label => 'Availability',
      p_fields => ARRAY[
        'employment_id uuid NOT NULL REFERENCES hr.employment(id)',
        $f$availability_kind text NOT NULL CHECK (availability_kind IN ('available','preferred','unavailable'))$f$,
        'day_of_week smallint CHECK (day_of_week between 0 and 6)',
        'specific_date date',
        'starts_at_local time',
        'ends_at_local time',
        'is_all_day boolean NOT NULL DEFAULT false',
        'max_hours_per_week numeric(6,2)',
        'max_shifts_per_week integer',
        'note text',
        $f$approval_state text NOT NULL DEFAULT 'active' CHECK (approval_state IN ('proposed','active','declined'))$f$,
        'effective_from date NOT NULL',
        'effective_to date',
        $f$effective_range daterange GENERATED ALWAYS AS (daterange(effective_from, effective_to, '[)')) STORED$f$,
        'recorded_at timestamptz NOT NULL DEFAULT now()',
        'change_reason_category_id uuid REFERENCES platform.categories(id)',
        'supersedes_id uuid'
      ],
      p_variant => 'component', p_versioned => true, p_soft_delete => true, p_visibility => 'none',
      p_category => false, p_listed => false, p_org_default => false, p_gin_jsonb => false,
      p_parents => ARRAY['hr_employment:employment_id']);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'availability_window_ordered') then
    alter table hr.availability add constraint availability_window_ordered
      check (effective_to is null or effective_to > effective_from);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'availability_supersedes_fk') then
    alter table hr.availability add constraint availability_supersedes_fk
      foreign key (supersedes_id) references hr.availability(id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'availability_when') then
    alter table hr.availability add constraint availability_when
      check (day_of_week is not null or specific_date is not null);
  end if;
end $$;

create index if not exists availability_employment_dow_idx on hr.availability (employment_id, day_of_week)
  where deleted_at is null and approval_state = 'active';

update platform.entity_types set taxonomy_node_id = '4e06056c-e157-41de-80ab-86880ee8ad77'
where token = 'hr_availability';

-- ============================================================ 8.7 hr.shift_claim  (COMP of hr_shift)
-- ONE table for the whole claim/swap/call-off family, because they share the same conflict
-- re-check, the same approval route and the same evidence needs.
-- conflict_check freezes the FULL conflict set evaluated at decision time -- double-booking,
-- would-trigger-OT, rest period, certification, approved leave, minors' hour restrictions --
-- which is what "swaps re-checked against the full conflict set" means as data.
-- attendance_exception_id is AR2's call-off -> attendance link, so a call-off is not merely an
-- after-the-fact timesheet exception.
do $$ begin
  if to_regclass('hr.shift_claim') is null then
    perform platform.create_entity_table(
      p_schema => 'hr', p_table => 'shift_claim', p_token => 'hr_shift_claim',
      p_label => 'Shift claim',
      p_fields => ARRAY[
        'shift_id uuid NOT NULL REFERENCES hr.shift(id)',
        $f$request_kind text NOT NULL CHECK (request_kind IN ('claim_open','swap_offer','swap_accept','drop','cover_request','call_off'))$f$,
        'requester_employment_id uuid NOT NULL REFERENCES hr.employment(id)',
        'counterparty_employment_id uuid REFERENCES hr.employment(id)',
        'counterparty_shift_id uuid REFERENCES hr.shift(id)',
        $f$state text NOT NULL DEFAULT 'open' CHECK (state IN ('open','accepted','pending_approval','approved','rejected','withdrawn','expired'))$f$,
        'reason_category_id uuid REFERENCES platform.categories(id)',
        'reason_note text',
        $f$conflict_check jsonb NOT NULL DEFAULT '{}'::jsonb$f$,
        $f$conflict_state text NOT NULL DEFAULT 'unchecked' CHECK (conflict_state IN ('unchecked','clear','warned','blocked'))$f$,
        'workflow_instance_id uuid',
        'decided_at timestamptz',
        'decided_by_employment_id uuid REFERENCES hr.employment(id)',
        'expires_at timestamptz',
        'replacement_shift_id uuid REFERENCES hr.shift(id)',
        'attendance_exception_id uuid REFERENCES hr.attendance_exception(id)',
        -- {{CALC}}
        $f$rule_version_ids uuid[] NOT NULL DEFAULT '{}'$f$,
        'engine_key text NOT NULL',
        'engine_version text NOT NULL',
        $f$calc jsonb NOT NULL DEFAULT '{}'::jsonb$f$,
        'computed_at timestamptz NOT NULL DEFAULT now()'
      ],
      p_variant => 'component', p_versioned => true, p_soft_delete => true, p_visibility => 'none',
      p_category => false, p_listed => false, p_org_default => false, p_gin_jsonb => false,
      p_parents => ARRAY['hr_shift:shift_id']);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'shift_claim_swap_has_counterparty') then
    alter table hr.shift_claim add constraint shift_claim_swap_has_counterparty
      check (request_kind <> 'swap_offer' or counterparty_shift_id is not null);
  end if;
end $$;

create index if not exists shift_claim_shift_idx on hr.shift_claim (shift_id, state);
create index if not exists shift_claim_open_idx on hr.shift_claim (organization_id, state, expires_at)
  where deleted_at is null;
create index if not exists shift_claim_requester_idx on hr.shift_claim (requester_employment_id, created_at desc);

update platform.entity_types set taxonomy_node_id = '4e06056c-e157-41de-80ab-86880ee8ad77'
where token = 'hr_shift_claim';

-- ============================================================ 8.8 hr.schedule_template  (DIR)
do $$ begin
  if to_regclass('hr.schedule_template') is null then
    perform platform.create_entity_table(
      p_schema => 'hr', p_table => 'schedule_template', p_token => 'hr_schedule_template',
      p_label => 'Schedule template',
      p_fields => ARRAY[
        'name text NOT NULL',
        'location_id uuid REFERENCES hr.location(id)',
        'department_id uuid REFERENCES hr.department(id)',
        $f$pattern_kind text NOT NULL DEFAULT 'weekly' CHECK (pattern_kind IN ('weekly','rotating','fixed_dates'))$f$,
        'rotation_weeks integer NOT NULL DEFAULT 1 CHECK (rotation_weeks >= 1)',
        'is_active boolean NOT NULL DEFAULT true',
        $f$custom jsonb NOT NULL DEFAULT '{}'::jsonb$f$
      ],
      p_variant => 'entity', p_versioned => true, p_soft_delete => true, p_visibility => 'personal',
      p_category => false, p_listed => true, p_org_default => false, p_gin_jsonb => false,
      p_parents => null);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'schedule_template_name_unique') then
    alter table hr.schedule_template add constraint schedule_template_name_unique
      unique (organization_id, name);
  end if;
end $$;

create index if not exists schedule_template_active_idx on hr.schedule_template (organization_id, is_active)
  where deleted_at is null;
create index if not exists schedule_template_custom_gin on hr.schedule_template using gin (custom jsonb_path_ops);

update platform.entity_types set
  title_column = 'name', reference_pickable = true,
  taxonomy_node_id = '4e06056c-e157-41de-80ab-86880ee8ad77'
where token = 'hr_schedule_template';

-- ============================================================ 8.9 hr.schedule_template_shift  (COMP of hr_schedule_template)
do $$ begin
  if to_regclass('hr.schedule_template_shift') is null then
    perform platform.create_entity_table(
      p_schema => 'hr', p_table => 'schedule_template_shift', p_token => 'hr_schedule_template_shift',
      p_label => 'Schedule template shift',
      p_fields => ARRAY[
        'schedule_template_id uuid NOT NULL REFERENCES hr.schedule_template(id)',
        'rotation_week integer NOT NULL DEFAULT 1',
        'day_of_week smallint NOT NULL CHECK (day_of_week between 0 and 6)',
        'starts_at_local time NOT NULL',
        'ends_at_local time NOT NULL',
        'crosses_midnight boolean NOT NULL DEFAULT false',
        'job_title_id uuid REFERENCES hr.job_title(id)',
        'default_employment_id uuid REFERENCES hr.employment(id)',
        'headcount integer NOT NULL DEFAULT 1',
        $f$break_plan jsonb NOT NULL DEFAULT '[]'::jsonb$f$,
        'is_on_call boolean NOT NULL DEFAULT false',
        'position integer'
      ],
      p_variant => 'component', p_versioned => true, p_soft_delete => true, p_visibility => 'none',
      p_category => false, p_listed => false, p_org_default => false, p_gin_jsonb => false,
      p_parents => ARRAY['hr_schedule_template:schedule_template_id']);
  end if;
end $$;

create index if not exists schedule_template_shift_template_idx
  on hr.schedule_template_shift (schedule_template_id, rotation_week, day_of_week)
  where deleted_at is null;

update platform.entity_types set taxonomy_node_id = '4e06056c-e157-41de-80ab-86880ee8ad77'
where token = 'hr_schedule_template_shift';

-- ============================================================ 8.10 hr.schedule_guidance  (DIR)
-- D24(b): multi-layer AI scheduling inputs. This is the table that makes "don't put Marco and
-- Dana on the same close" or "the Tuesday route always needs a Class-B driver" durable,
-- addressable and reviewable, instead of living in a manager's head or a Slack thread.
--
-- Three properties that keep it honest:
--  1. IT IS GUIDANCE, NOT A RULE. is_hard_constraint exists for the rare case an org means it
--     absolutely, but the conflict engine (8.7's conflict_check) reads only the deterministic
--     rule set -- a guidance row NEVER silently blocks a shift. Where a hard constraint is
--     genuinely needed the answer is an hr.staffing_requirement row or a required_credential_ids
--     entry.
--  2. include_in_ai_provision + sensitivity_ceiling ARE THE AI GATE. A guidance row is free text
--     a human wrote and nothing stops a manager typing something confidential into it, so the
--     Provision assembler filters on both columns -- and the ceiling can never be `restricted`
--     (AR B2.20: no Provision reads EEO, medical or investigation data). The CHECK enumerates
--     only public/internal/confidential, which is what enforces that.
--  3. IT RESOLVES AS A LAYERED SET, NOT A SINGLE VALUE. guidance_level + priority order the
--     rows and the Provision carries ALL applicable rows, most-specific first. scope_id is
--     intentionally an untyped uuid -- guidance_level names the token -- because a typed FK per
--     level would be eight nullable columns and seven CHECK arms.
do $$ begin
  if to_regclass('hr.schedule_guidance') is null then
    perform platform.create_entity_table(
      p_schema => 'hr', p_table => 'schedule_guidance', p_token => 'hr_schedule_guidance',
      p_label => 'Schedule guidance',
      p_fields => ARRAY[
        $f$guidance_level text NOT NULL CHECK (guidance_level IN ('organization','location','crew','department','job_title','position_assignment','shift','schedule'))$f$,
        'scope_id uuid',
        $f$guidance_kind text NOT NULL DEFAULT 'policy' CHECK (guidance_kind IN ('policy','manager_note','preference','constraint','context'))$f$,
        'title text',
        'body text NOT NULL',
        'author_employment_id uuid REFERENCES hr.employment(id)',
        'priority integer NOT NULL DEFAULT 0',
        'applies_from date',
        'applies_to date',
        'is_hard_constraint boolean NOT NULL DEFAULT false',
        'include_in_ai_provision boolean NOT NULL DEFAULT true',
        $f$sensitivity_ceiling text NOT NULL DEFAULT 'internal' CHECK (sensitivity_ceiling IN ('public','internal','confidential'))$f$,
        'is_active boolean NOT NULL DEFAULT true',
        -- section 17.6 enumerates this token among the 25 that carry `custom`; 8.10's own field
        -- list omits it. See RECORDED TECHNICAL DECISION 1 at the head of this file.
        $f$custom jsonb NOT NULL DEFAULT '{}'::jsonb$f$
      ],
      p_variant => 'entity', p_versioned => true, p_soft_delete => true, p_visibility => 'personal',
      p_category => false, p_listed => true, p_org_default => false, p_gin_jsonb => false,
      p_parents => null);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'schedule_guidance_scoped') then
    alter table hr.schedule_guidance add constraint schedule_guidance_scoped
      check (guidance_level = 'organization' or scope_id is not null);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'schedule_guidance_window_ordered') then
    alter table hr.schedule_guidance add constraint schedule_guidance_window_ordered
      check (applies_to is null or applies_from is null or applies_to >= applies_from);
  end if;
end $$;

create index if not exists schedule_guidance_scope_idx
  on hr.schedule_guidance (organization_id, guidance_level, scope_id)
  where is_active and deleted_at is null;
create index if not exists schedule_guidance_custom_gin
  on hr.schedule_guidance using gin (custom jsonb_path_ops);

update platform.entity_types set
  title_column = 'title',
  taxonomy_node_id = '4e06056c-e157-41de-80ab-86880ee8ad77'
where token = 'hr_schedule_guidance';

-- ============================================================ the deferred FKs owed by files 04 and 06
-- Section 18.1 names exactly these four for file 07. Each is a PLAIN FK and gets NO
-- entity_relationships row: hr.shift is the scheduled-vs-actual join AR 1.9 found missing, not a
-- parentage, and hr.crew is a grouping dimension, not an access parent.
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'position_assignment_crew_fk') then
    alter table hr.position_assignment add constraint position_assignment_crew_fk
      foreign key (crew_id) references hr.crew(id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'punch_shift_fk') then
    alter table hr.punch add constraint punch_shift_fk
      foreign key (shift_id) references hr.shift(id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'work_interval_shift_fk') then
    alter table hr.work_interval add constraint work_interval_shift_fk
      foreign key (shift_id) references hr.shift(id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'attendance_exception_shift_fk') then
    alter table hr.attendance_exception add constraint attendance_exception_shift_fk
      foreign key (shift_id) references hr.shift(id);
  end if;
end $$;

create index if not exists position_assignment_crew_idx on hr.position_assignment (crew_id)
  where crew_id is not null and deleted_at is null;

-- ============================================================ 8.1b hr.v_my_week
-- 🚨 THIS VIEW, NOT THE SCHEDULE ROW, is what the employee's "my week", the manager's team view
-- and the conflict engine read -- every one of them must work when the seven shifts in a week
-- sit at five different locations under three jurisdictions.
create or replace view hr.v_my_week with (security_invoker = true) as
select sh.employment_id, sh.id as shift_id, sh.schedule_id, s.schedule_kind, s.crew_id,
       sh.work_location_id, l.name as location_name, sh.jurisdiction_id, sh.tz,
       sh.local_work_date, sh.starts_at, sh.ends_at, sh.scheduled_hours, sh.status,
       sh.job_title_id, sh.is_on_call, sh.crosses_midnight
  from hr.shift sh
  join hr.schedule s on s.id = sh.schedule_id
  join hr.location l on l.id = sh.work_location_id
 where sh.deleted_at is null and s.state = 'published';

comment on view hr.v_my_week is
  'D17: a person''s week spans schedules and locations. The union of every published shift assigned to an employment in a window, regardless of which schedule or location it came from (SPEC-DATA-MODEL 8.1b).';

grant select on hr.v_my_week to authenticated, service_role;

-- ============================================================ the write guard, per table
do $$
declare t text;
begin
  foreach t in array ARRAY['crew','schedule','shift','schedule_change','staffing_requirement',
                           'labor_target','availability','shift_claim','schedule_template',
                           'schedule_template_shift','schedule_guidance'] loop
    if not exists (select 1 from pg_trigger tg join pg_class c on c.oid = tg.tgrelid
                     join pg_namespace n on n.oid = c.relnamespace
                    where n.nspname = 'hr' and c.relname = t and tg.tgname = '_zz_guard_hr_write') then
      execute format(
        'create trigger _zz_guard_hr_write before insert or update or delete on hr.%I for each row execute function hr._guard_hr_write()', t);
    end if;
  end loop;
end $$;

-- ============================================================ DDL guard acknowledgement
-- Files 04-06 acked from a hardcoded table list. THIS FILE ACKS FROM THE LOG ITSELF, and the
-- change is deliberate: a first attempt at this migration rolled back on "1 unacked DDL guard
-- row" because org_not_null_no_backstop fires on more objects than the eleven created plus the
-- four explicitly ALTERed for their deferred FKs -- the provisioner's own internal ALTERs reach
-- objects a hand-maintained list cannot predict, and every file that ALTERs an earlier table
-- will hit the same wall.
--
-- 🚨 THIS IS NOT A BLANKET ACK, which platform.ddl_guard_ack refuses anyway. It is scoped to
-- ONE rule -- org_not_null_no_backstop, the single advisory WARN section 1.3 sanctions in
-- advance for every HR table -- and it acks each object_ref individually with that rule's
-- reason. Any unacked row under ANY OTHER rule still fails this migration, in the assertion
-- block below: a genuinely new guard finding must never be swallowed by this loop.
do $$
declare r record;
begin
  for r in select distinct object_ref from platform.ddl_guard_log
            where acknowledged_at is null
              and object_ref like 'hr.%'
              and rule = 'org_not_null_no_backstop' loop
    perform platform.ddl_guard_ack(
      p_reason => 'HR is org-explicit by the 2026-08-21 NO-NULL-ORG ruling; no assignment trigger by design (SPEC-DATA-MODEL 1.3)',
      p_by     => 'hr-domain-migration hr_07',
      p_rule   => 'org_not_null_no_backstop',
      p_object_ref => r.object_ref);
  end loop;
end $$;

-- ============================================================ assertions
do $$
declare r record; v_bad integer;
begin
  for r in select unnest(ARRAY['crew','schedule','shift','schedule_change','staffing_requirement',
                               'labor_target','availability','shift_claim','schedule_template',
                               'schedule_template_shift','schedule_guidance']) as t loop
    select count(*) into v_bad from iam.verify_canonical('hr', r.t, 'hr_' || r.t) where status in ('FAIL','WARN');
    if v_bad > 0 then
      raise exception 'hr_07: hr.% has % FAIL/WARN conformance rows', r.t, v_bad;
    end if;
    if not iam.canonical_certify_ok('hr', r.t, 'hr_' || r.t) then
      raise exception 'hr_07: hr.% does not certify', r.t;
    end if;
    if not exists (select 1 from pg_trigger tg join pg_class c on c.oid = tg.tgrelid
                     join pg_namespace n on n.oid = c.relnamespace
                    where n.nspname = 'hr' and c.relname = r.t and tg.tgname = '_zz_guard_hr_write') then
      raise exception 'hr_07: hr.% is missing _zz_guard_hr_write', r.t;
    end if;
    if (select taxonomy_node_id from platform.entity_types where token = 'hr_' || r.t) is null then
      raise exception 'hr_07: hr_% has no taxonomy_node_id', r.t;
    end if;
  end loop;

  -- 🚨 D17 / section 18.5 QUERY H: nothing resolves a jurisdiction or timezone from a SCHEDULE row.
  if exists (select 1 from information_schema.columns
              where table_schema='hr' and table_name='schedule'
                and column_name in ('jurisdiction_id','tz')) then
    raise exception 'hr_07: hr.schedule carries jurisdiction_id or tz -- D17 forbids a per-schedule jurisdiction or operative timezone';
  end if;
  -- and the shift really does own the location, NOT NULL
  select count(*) into v_bad from information_schema.columns
   where table_schema='hr' and table_name='shift'
     and column_name in ('work_location_id','jurisdiction_id','tz','local_work_date')
     and is_nullable = 'YES';
  if v_bad > 0 then
    raise exception 'hr_07: % of hr.shift''s {{JURIS}} columns are nullable -- D17 requires all four NOT NULL', v_bad;
  end if;

  -- section 17.3 / the conveyance trap
  select count(*) into v_bad from platform.entity_relationships er
    join platform.entity_types c on c.token = er.child_type
   where c.schema_name = 'hr' and c.rls_variant = 'restricted';
  if v_bad > 0 then
    raise exception 'hr_07: % restricted hr table(s) carry an entity_relationships edge', v_bad;
  end if;

  -- the double-booking exclusion constraint AR2 rests on
  if not exists (select 1 from pg_constraint where conname = 'shift_no_double_booking' and contype = 'x') then
    raise exception 'hr_07: exclusion constraint shift_no_double_booking is missing';
  end if;

  -- the four deferred FKs section 18.1 owes this file
  select count(*) into v_bad from (values ('position_assignment_crew_fk'), ('punch_shift_fk'),
                                          ('work_interval_shift_fk'), ('attendance_exception_shift_fk')) as w(c)
   where not exists (select 1 from pg_constraint where conname = w.c);
  if v_bad > 0 then
    raise exception 'hr_07: % deferred FK(s) missing', v_bad;
  end if;

  if to_regclass('hr.v_my_week') is null then
    raise exception 'hr_07: hr.v_my_week is missing -- the multi-site week has no reader';
  end if;

  if exists (select 1 from information_schema.columns c
               join platform.entity_types e
                 on e.schema_name = c.table_schema and e.table_name = c.table_name
              where c.table_schema = 'hr'
                and c.column_name in ('user_id','owner_id','author_id','creator_id')) then
    raise exception 'hr_07: an hr table carries a legacy owner column; it can never certify';
  end if;

  -- A guard finding under any rule OTHER than the one section 1.3 sanctions is a real defect
  -- and must never be swallowed by the ack loop above. Name it in the failure.
  declare v_rules text;
  begin
    select string_agg(distinct rule, ', ') into v_rules from platform.ddl_guard_log
     where acknowledged_at is null and object_ref like 'hr.%'
       and rule <> 'org_not_null_no_backstop';
    if v_rules is not null then
      raise exception 'hr_07: unacked DDL guard rows on hr.* under unsanctioned rule(s): %', v_rules;
    end if;
  end;

  select count(*) into v_bad from platform.ddl_guard_log
   where acknowledged_at is null and object_ref like 'hr.%';
  if v_bad > 0 then
    raise exception 'hr_07: % unacked DDL guard rows remain on hr.*', v_bad;
  end if;
end $$;
