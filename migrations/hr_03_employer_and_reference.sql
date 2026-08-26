-- HR domain, migration 03 of 16 (register item HRB-005) -- employer of record and the eleven
-- reference tables the triad holds NOT NULL FKs to.
--
-- Authority: /projects/hr-domain/specs/SPEC-DATA-MODEL.md section 6 (6.1-6.11), section 1.1
-- (the restricted two-step), section 1.4 (DIR/CONF/COMP patterns), section 18.1 file 03.
--
-- These tables carry NO BEHAVIOUR. They sit before the triad only because hr.employment and
-- hr.position_assignment hold NOT NULL FKs to employer_profile, job_title, department and
-- location. Nothing here depends on the triad, so AR 1.23 is honoured: the triad is still the
-- first behavioural object the schema creates.
--
-- Idempotent. Applied live as migration `hr_03_employer_and_reference`.
--
-- RECORDED DEVIATION: the CONF pattern in section 1.4's table says p_visibility => 'none'.
-- Live, that shape WARNs ("no visibility enum") on iam.verify_canonical and therefore cannot
-- certify -- proven in a rolled-back probe. Section 1.1's own worked two-step already says
-- `p_variant => 'entity', p_visibility => 'personal'` then flip, and every live restricted
-- table (ai.api, ai.endpoint, ai.offering, browser.profile_checkpoint, chat.coding_session)
-- has a visibility column. Section 1.1 and the live precedent win; the column defaults to
-- `personal`, nothing ever sets it to `public`, and the generated pub_read policy is therefore
-- inert. Recorded on the HR register.

set local lock_timeout = '20s';

-- ============================================================ 6.1 hr.employer_profile  (CONF)
do $$ begin
  if to_regclass('hr.employer_profile') is null then
    perform platform.create_entity_table(
      p_schema => 'hr', p_table => 'employer_profile', p_token => 'hr_employer_profile',
      p_label => 'Employer profile',
      p_fields => ARRAY[
        'legal_name text NOT NULL',
        'dba_name text',
        'careers_slug text',
        'ein text NOT NULL',
        $f$entity_form text CHECK (entity_form IN ('c_corp','s_corp','llc','partnership','sole_prop','nonprofit','other'))$f$,
        'formation_state text',
        $f$primary_address jsonb NOT NULL DEFAULT '{}'::jsonb$f$,
        $f$workers_comp_policy jsonb NOT NULL DEFAULT '{}'::jsonb$f$,
        'headcount_asof_date date',
        'headcount_total integer',
        'is_fmla_covered boolean',
        'is_aca_ale boolean',
        'is_eeo1_filer boolean',
        'is_federal_contractor boolean',
        $f$everify_required_states text[] NOT NULL DEFAULT '{}'$f$,
        $f$applicability_basis jsonb NOT NULL DEFAULT '{}'::jsonb$f$,
        $f$settings jsonb NOT NULL DEFAULT '{}'::jsonb$f$
      ],
      p_variant => 'entity', p_versioned => true, p_soft_delete => true, p_visibility => 'personal',
      p_category => false, p_listed => false, p_org_default => false, p_gin_jsonb => false,
      p_parents => null);
  end if;
end $$;

do $$ begin
  -- One org = one employer of record = one EIN (AR 1.20). This is what makes a transfer between
  -- two orgs of the same owner correctly a termination plus a hire.
  if not exists (select 1 from pg_constraint where conname = 'employer_profile_one_per_org') then
    alter table hr.employer_profile add constraint employer_profile_one_per_org unique (organization_id);
  end if;
  -- careers_slug is the employer's ONE public URL identity (/careers/{slug}) and is unique
  -- PLATFORM-WIDE, not per org, because it is a URL segment.
  if not exists (select 1 from pg_constraint where conname = 'employer_profile_careers_slug_unique') then
    alter table hr.employer_profile add constraint employer_profile_careers_slug_unique unique (careers_slug);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'employer_profile_careers_slug_urlsafe') then
    alter table hr.employer_profile add constraint employer_profile_careers_slug_urlsafe
      check (careers_slug is null or careers_slug ~ '^[a-z0-9](?:[a-z0-9-]{1,60}[a-z0-9])$');
  end if;
end $$;

update platform.entity_types set
  title_column = 'legal_name',
  taxonomy_node_id = '394893a0-be07-4b4a-9b50-3a0cd984bc80',
  client_excluded_columns = ARRAY['ein'],
  governed_columns = ARRAY['created_by','organization_id','deleted_at','ein','careers_slug','legal_name']
where token = 'hr_employer_profile';

do $$ begin
  if (select rls_variant from platform.entity_types where token = 'hr_employer_profile') <> 'restricted' then
    update platform.entity_types set rls_variant = 'restricted' where token = 'hr_employer_profile';
    perform iam.apply_rls('hr','employer_profile','hr_employer_profile','restricted');
  end if;
end $$;

-- ============================================================ 6.2 hr.establishment  (COMP)
do $$ begin
  if to_regclass('hr.establishment') is null then
    perform platform.create_entity_table(
      p_schema => 'hr', p_table => 'establishment', p_token => 'hr_establishment',
      p_label => 'Establishment',
      p_fields => ARRAY[
        'employer_profile_id uuid NOT NULL REFERENCES hr.employer_profile(id)',
        'name text NOT NULL',
        $f$address jsonb NOT NULL DEFAULT '{}'::jsonb$f$,
        'jurisdiction_id uuid NOT NULL REFERENCES hr.jurisdiction(id)',
        'naics_code text',
        'eeo1_establishment_id text',
        'is_headquarters boolean NOT NULL DEFAULT false',
        'osha_establishment_name text',
        'annual_average_employees integer',
        'total_hours_worked numeric(12,2)'
      ],
      p_variant => 'component', p_versioned => true, p_soft_delete => true, p_visibility => 'none',
      p_category => false, p_listed => false, p_org_default => false, p_gin_jsonb => false,
      p_parents => ARRAY['hr_employer_profile:employer_profile_id']);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'establishment_name_unique_per_employer') then
    alter table hr.establishment add constraint establishment_name_unique_per_employer
      unique (employer_profile_id, name);
  end if;
end $$;

create index if not exists establishment_employer_idx on hr.establishment (employer_profile_id) where deleted_at is null;
create index if not exists establishment_jurisdiction_idx on hr.establishment (jurisdiction_id);

update platform.entity_types set title_column = 'name',
  taxonomy_node_id = '394893a0-be07-4b4a-9b50-3a0cd984bc80'
where token = 'hr_establishment';

-- ============================================================ 6.3 hr.tax_registration  (COMP)
do $$ begin
  if to_regclass('hr.tax_registration') is null then
    perform platform.create_entity_table(
      p_schema => 'hr', p_table => 'tax_registration', p_token => 'hr_tax_registration',
      p_label => 'Tax registration',
      p_fields => ARRAY[
        'employer_profile_id uuid NOT NULL REFERENCES hr.employer_profile(id)',
        'jurisdiction_id uuid NOT NULL REFERENCES hr.jurisdiction(id)',
        $f$registration_kind text NOT NULL CHECK (registration_kind IN ('withholding','unemployment','disability','paid_family_leave','local','other'))$f$,
        'account_number text',
        'registered_on date',
        $f$status text NOT NULL DEFAULT 'active' CHECK (status IN ('pending','active','closed'))$f$,
        'rate numeric(8,5)',
        'rate_effective_on date',
        'new_hire_report_endpoint text'
      ],
      p_variant => 'component', p_versioned => true, p_soft_delete => true, p_visibility => 'none',
      p_category => false, p_listed => false, p_org_default => false, p_gin_jsonb => false,
      p_parents => ARRAY['hr_employer_profile:employer_profile_id']);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'tax_registration_unique_per_kind') then
    alter table hr.tax_registration add constraint tax_registration_unique_per_kind
      unique (employer_profile_id, jurisdiction_id, registration_kind);
  end if;
end $$;

create index if not exists tax_registration_employer_idx on hr.tax_registration (employer_profile_id) where deleted_at is null;

update platform.entity_types set taxonomy_node_id = '394893a0-be07-4b4a-9b50-3a0cd984bc80'
where token = 'hr_tax_registration';

-- ============================================================ 6.5 hr.holiday_calendar  (DIR)
do $$ begin
  if to_regclass('hr.holiday_calendar') is null then
    perform platform.create_entity_table(
      p_schema => 'hr', p_table => 'holiday_calendar', p_token => 'hr_holiday_calendar',
      p_label => 'Holiday calendar',
      p_fields => ARRAY[
        'name text NOT NULL',
        'jurisdiction_id uuid REFERENCES hr.jurisdiction(id)',
        'is_default boolean NOT NULL DEFAULT false',
        'holiday_pay_counts_toward_ot boolean NOT NULL DEFAULT false',
        $f$settings jsonb NOT NULL DEFAULT '{}'::jsonb$f$
      ],
      p_variant => 'entity', p_versioned => true, p_soft_delete => true, p_visibility => 'personal',
      p_category => false, p_listed => true, p_org_default => false, p_gin_jsonb => false,
      p_parents => null);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'holiday_calendar_name_unique_per_org') then
    alter table hr.holiday_calendar add constraint holiday_calendar_name_unique_per_org
      unique (organization_id, name);
  end if;
end $$;

update platform.entity_types set title_column = 'name', reference_pickable = true,
  taxonomy_node_id = '394893a0-be07-4b4a-9b50-3a0cd984bc80'
where token = 'hr_holiday_calendar';

-- ============================================================ 6.10 hr.earning_code  (DIR)
do $$ begin
  if to_regclass('hr.earning_code') is null then
    perform platform.create_entity_table(
      p_schema => 'hr', p_table => 'earning_code', p_token => 'hr_earning_code',
      p_label => 'Earning code',
      p_fields => ARRAY[
        'code text NOT NULL',
        'name text NOT NULL',
        $f$hours_category text NOT NULL CHECK (hours_category IN ('worked','paid_leave','unpaid_leave','holiday','on_call','premium','bonus','reimbursement'))$f$,
        'is_overtime boolean NOT NULL DEFAULT false',
        'multiplier numeric(6,4)',
        'flat_amount numeric(14,2)',
        'counts_toward_ot boolean NOT NULL DEFAULT true',
        'counts_toward_hours_of_service boolean NOT NULL DEFAULT true',
        'counts_toward_sick_accrual boolean NOT NULL DEFAULT true',
        'is_statutory_premium boolean NOT NULL DEFAULT false',
        'jurisdiction_rule_class text',
        $f$external_code_map jsonb NOT NULL DEFAULT '{}'::jsonb$f$,
        'is_seeded boolean NOT NULL DEFAULT false',
        'is_active boolean NOT NULL DEFAULT true'
      ],
      p_variant => 'entity', p_versioned => true, p_soft_delete => true, p_visibility => 'personal',
      p_category => true, p_listed => true, p_org_default => false, p_gin_jsonb => false,
      p_parents => null);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'earning_code_unique_per_org') then
    alter table hr.earning_code add constraint earning_code_unique_per_org unique (organization_id, code);
  end if;
end $$;

update platform.entity_types set title_column = 'name', reference_pickable = true,
  taxonomy_node_id = '394893a0-be07-4b4a-9b50-3a0cd984bc80'
where token = 'hr_earning_code';

-- ============================================================ 6.11 hr.deduction_code  (DIR)
do $$ begin
  if to_regclass('hr.deduction_code') is null then
    perform platform.create_entity_table(
      p_schema => 'hr', p_table => 'deduction_code', p_token => 'hr_deduction_code',
      p_label => 'Deduction code',
      p_fields => ARRAY[
        'code text NOT NULL',
        'name text NOT NULL',
        $f$deduction_kind text NOT NULL CHECK (deduction_kind IN ('pretax','posttax','garnishment','employer_contribution'))$f$,
        'provider_ref text',
        $f$external_code_map jsonb NOT NULL DEFAULT '{}'::jsonb$f$,
        'is_active boolean NOT NULL DEFAULT true'
      ],
      p_variant => 'entity', p_versioned => true, p_soft_delete => true, p_visibility => 'personal',
      p_category => true, p_listed => true, p_org_default => false, p_gin_jsonb => false,
      p_parents => null);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'deduction_code_unique_per_org') then
    alter table hr.deduction_code add constraint deduction_code_unique_per_org unique (organization_id, code);
  end if;
end $$;

update platform.entity_types set title_column = 'name', reference_pickable = true,
  taxonomy_node_id = '394893a0-be07-4b4a-9b50-3a0cd984bc80'
where token = 'hr_deduction_code';

-- ============================================================ 6.6 hr.holiday  (COMP)
do $$ begin
  if to_regclass('hr.holiday') is null then
    perform platform.create_entity_table(
      p_schema => 'hr', p_table => 'holiday', p_token => 'hr_holiday', p_label => 'Holiday',
      p_fields => ARRAY[
        'holiday_calendar_id uuid NOT NULL REFERENCES hr.holiday_calendar(id)',
        'name text NOT NULL',
        'observed_on date NOT NULL',
        'actual_on date',
        'is_paid boolean NOT NULL DEFAULT true',
        'earning_code_id uuid REFERENCES hr.earning_code(id)',
        $f$applies_to_schedule_class text[] NOT NULL DEFAULT '{}'$f$,
        $f$location_ids uuid[] NOT NULL DEFAULT '{}'$f$
      ],
      p_variant => 'component', p_versioned => false, p_soft_delete => true, p_visibility => 'none',
      p_category => false, p_listed => false, p_org_default => false, p_gin_jsonb => false,
      p_parents => ARRAY['hr_holiday_calendar:holiday_calendar_id']);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'holiday_unique_per_calendar_date') then
    alter table hr.holiday add constraint holiday_unique_per_calendar_date
      unique (holiday_calendar_id, observed_on, name);
  end if;
end $$;

create index if not exists holiday_calendar_date_idx on hr.holiday (holiday_calendar_id, observed_on);

update platform.entity_types set title_column = 'name',
  taxonomy_node_id = '394893a0-be07-4b4a-9b50-3a0cd984bc80'
where token = 'hr_holiday';

-- ============================================================ 6.7 hr.location  (DIR)
-- This table is where every punch and shift learns its {{JURIS}} block (AR 1.4): tz and
-- jurisdiction_id are both required, so a location with no jurisdiction cannot be scheduled
-- against. is_remote locations still carry a jurisdiction.
do $$ begin
  if to_regclass('hr.location') is null then
    perform platform.create_entity_table(
      p_schema => 'hr', p_table => 'location', p_token => 'hr_location', p_label => 'Location',
      p_fields => ARRAY[
        'establishment_id uuid REFERENCES hr.establishment(id)',
        'name text NOT NULL',
        'code text',
        $f$address jsonb NOT NULL DEFAULT '{}'::jsonb$f$,
        'tz text NOT NULL',
        'jurisdiction_id uuid NOT NULL REFERENCES hr.jurisdiction(id)',
        'geo_lat numeric(9,6)',
        'geo_lng numeric(9,6)',
        'geofence_radius_m integer',
        'is_remote boolean NOT NULL DEFAULT false',
        'is_active boolean NOT NULL DEFAULT true',
        $f$custom jsonb NOT NULL DEFAULT '{}'::jsonb$f$,
        $f$settings jsonb NOT NULL DEFAULT '{}'::jsonb$f$
      ],
      p_variant => 'entity', p_versioned => true, p_soft_delete => true, p_visibility => 'personal',
      p_category => false, p_listed => true, p_org_default => false, p_gin_jsonb => false,
      p_parents => null);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'location_name_unique_per_org') then
    alter table hr.location add constraint location_name_unique_per_org unique (organization_id, name);
  end if;
end $$;

create index if not exists location_org_active_idx on hr.location (organization_id, is_active) where deleted_at is null;
create index if not exists location_establishment_idx on hr.location (establishment_id) where establishment_id is not null;
create index if not exists location_custom_gin on hr.location using gin (custom jsonb_path_ops);

update platform.entity_types set title_column = 'name', reference_pickable = true,
  taxonomy_node_id = '394893a0-be07-4b4a-9b50-3a0cd984bc80'
where token = 'hr_location';

-- ============================================================ 6.8 hr.department  (DIR)
do $$ begin
  if to_regclass('hr.department') is null then
    perform platform.create_entity_table(
      p_schema => 'hr', p_table => 'department', p_token => 'hr_department', p_label => 'Department',
      p_fields => ARRAY[
        'name text NOT NULL',
        'code text',
        'parent_department_id uuid',
        'head_employment_id uuid',
        'cost_center text',
        'is_active boolean NOT NULL DEFAULT true',
        $f$custom jsonb NOT NULL DEFAULT '{}'::jsonb$f$
      ],
      p_variant => 'entity', p_versioned => true, p_soft_delete => true, p_visibility => 'personal',
      p_category => true, p_listed => true, p_org_default => false, p_gin_jsonb => false,
      p_parents => null);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'department_parent_fk') then
    alter table hr.department add constraint department_parent_fk
      foreign key (parent_department_id) references hr.department(id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'department_no_self_parent') then
    alter table hr.department add constraint department_no_self_parent check (parent_department_id <> id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'department_name_unique_per_org') then
    alter table hr.department add constraint department_name_unique_per_org unique (organization_id, name);
  end if;
end $$;

create index if not exists department_parent_idx on hr.department (parent_department_id) where parent_department_id is not null;
create index if not exists department_custom_gin on hr.department using gin (custom jsonb_path_ops);

-- head_employment_id gains its FK in file 04, once hr.employment exists.
update platform.entity_types set title_column = 'name', reference_pickable = true,
  taxonomy_node_id = '394893a0-be07-4b4a-9b50-3a0cd984bc80'
where token = 'hr_department';

-- ============================================================ 6.9 hr.job_title  (DIR)
do $$ begin
  if to_regclass('hr.job_title') is null then
    perform platform.create_entity_table(
      p_schema => 'hr', p_table => 'job_title', p_token => 'hr_job_title', p_label => 'Job title',
      p_fields => ARRAY[
        'title text NOT NULL',
        'code text',
        'job_family text',
        'job_level text',
        'grade text',
        $f$eeo1_job_category text NOT NULL CHECK (eeo1_job_category IN ('executive_senior_officials','first_mid_officials','professionals','technicians','sales_workers','administrative_support','craft_workers','operatives','laborers_helpers','service_workers'))$f$,
        $f$default_flsa_status text CHECK (default_flsa_status IN ('exempt','nonexempt'))$f$,
        $f$default_pay_basis text CHECK (default_pay_basis IN ('hourly','salary','piece','commission','contract'))$f$,
        'pay_range_min numeric(14,2)',
        'pay_range_max numeric(14,2)',
        'is_supervisor boolean NOT NULL DEFAULT false',
        'description text',
        'is_active boolean NOT NULL DEFAULT true',
        $f$custom jsonb NOT NULL DEFAULT '{}'::jsonb$f$
      ],
      p_variant => 'entity', p_versioned => true, p_soft_delete => true, p_visibility => 'personal',
      p_category => false, p_listed => true, p_org_default => false, p_gin_jsonb => false,
      p_parents => null);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'job_title_unique_per_org') then
    alter table hr.job_title add constraint job_title_unique_per_org unique (organization_id, title);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'job_title_range_ordered') then
    alter table hr.job_title add constraint job_title_range_ordered
      check (pay_range_min is null or pay_range_max is null or pay_range_max >= pay_range_min);
  end if;
end $$;

create index if not exists job_title_org_active_idx on hr.job_title (organization_id, is_active) where deleted_at is null;
create index if not exists job_title_custom_gin on hr.job_title using gin (custom jsonb_path_ops);

update platform.entity_types set title_column = 'title', reference_pickable = true,
  taxonomy_node_id = '394893a0-be07-4b4a-9b50-3a0cd984bc80'
where token = 'hr_job_title';

-- ============================================================ 6.4 hr.pay_group  (DIR)
-- AR 1.5: pay GROUPS, not one org-level frequency, and the workweek is the OT unit independent
-- of the pay period. workweek_start_dow + workweek_effective_from are the currently-in-force
-- setting; the rule in force is stamped onto every hr.workweek row at creation, so changing it
-- here affects only workweeks created after the change. Back-updating existing ones is a defect.
do $$ begin
  if to_regclass('hr.pay_group') is null then
    perform platform.create_entity_table(
      p_schema => 'hr', p_table => 'pay_group', p_token => 'hr_pay_group', p_label => 'Pay group',
      p_fields => ARRAY[
        'employer_profile_id uuid NOT NULL REFERENCES hr.employer_profile(id)',
        'name text NOT NULL',
        $f$pay_frequency text NOT NULL CHECK (pay_frequency IN ('weekly','biweekly','semimonthly','monthly'))$f$,
        'first_period_start_on date NOT NULL',
        $f$pay_date_rule jsonb NOT NULL DEFAULT '{}'::jsonb$f$,
        'workweek_start_dow smallint NOT NULL DEFAULT 0 CHECK (workweek_start_dow between 0 and 6)',
        $f$workweek_start_time time NOT NULL DEFAULT '00:00'$f$,
        'workweek_effective_from date NOT NULL',
        'holiday_calendar_id uuid REFERENCES hr.holiday_calendar(id)',
        'default_earning_code_id uuid REFERENCES hr.earning_code(id)',
        'timesheet_required boolean NOT NULL DEFAULT true',
        'is_active boolean NOT NULL DEFAULT true',
        $f$settings jsonb NOT NULL DEFAULT '{}'::jsonb$f$
      ],
      p_variant => 'entity', p_versioned => true, p_soft_delete => true, p_visibility => 'personal',
      p_category => false, p_listed => true, p_org_default => false, p_gin_jsonb => false,
      p_parents => null);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'pay_group_name_unique_per_employer') then
    alter table hr.pay_group add constraint pay_group_name_unique_per_employer
      unique (employer_profile_id, name);
  end if;
end $$;

create index if not exists pay_group_employer_idx on hr.pay_group (employer_profile_id) where deleted_at is null;

update platform.entity_types set title_column = 'name', reference_pickable = true,
  taxonomy_node_id = '394893a0-be07-4b4a-9b50-3a0cd984bc80'
where token = 'hr_pay_group';

-- ============================================================ the write guard, per table
do $$
declare t text;
begin
  foreach t in array ARRAY['employer_profile','establishment','tax_registration','holiday_calendar',
                           'earning_code','deduction_code','holiday','location','department',
                           'job_title','pay_group'] loop
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
declare t text;
begin
  foreach t in array ARRAY['employer_profile','establishment','tax_registration','holiday_calendar',
                           'earning_code','deduction_code','holiday','location','department',
                           'job_title','pay_group'] loop
    perform platform.ddl_guard_ack(
      p_reason => 'HR is org-explicit by the 2026-08-21 NO-NULL-ORG ruling; no assignment trigger by design (SPEC-DATA-MODEL 1.3)',
      p_by     => 'hr-domain-migration hr_03',
      p_rule   => 'org_not_null_no_backstop',
      p_object_ref => 'hr.' || t);
  end loop;
end $$;

-- ============================================================ assertions
do $$
declare r record; v_bad integer;
begin
  for r in select unnest(ARRAY['employer_profile','establishment','tax_registration','holiday_calendar',
                               'earning_code','deduction_code','holiday','location','department',
                               'job_title','pay_group']) as t loop
    select count(*) into v_bad from iam.verify_canonical('hr', r.t, 'hr_' || r.t) where status in ('FAIL','WARN');
    if v_bad > 0 then
      raise exception 'hr_03: hr.% has % FAIL/WARN conformance rows', r.t, v_bad;
    end if;
    if not exists (select 1 from pg_trigger tg join pg_class c on c.oid = tg.tgrelid
                     join pg_namespace n on n.oid = c.relnamespace
                    where n.nspname = 'hr' and c.relname = r.t and tg.tgname = '_zz_guard_hr_write') then
      raise exception 'hr_03: hr.% is missing _zz_guard_hr_write', r.t;
    end if;
    if (select taxonomy_node_id from platform.entity_types where token = 'hr_' || r.t) is null then
      raise exception 'hr_03: hr_% has no taxonomy_node_id', r.t;
    end if;
  end loop;

  if (select rls_variant from platform.entity_types where token = 'hr_employer_profile') <> 'restricted' then
    raise exception 'hr_03: hr_employer_profile did not flip to restricted';
  end if;

  -- THE CONVEYANCE TRAP (section 1.4 / 17.3): a restricted HR table may never be a composition
  -- or containment CHILD. hr_employer_profile is a parent here, never a child.
  if exists (select 1 from platform.entity_relationships er
               join platform.entity_types c on c.token = er.child_type
              where c.schema_name = 'hr' and c.rls_variant = 'restricted') then
    raise exception 'hr_03: a restricted hr table is a composition/containment child (conformance query A)';
  end if;

  select count(*) into v_bad from platform.ddl_guard_log
   where acknowledged_at is null and object_ref like 'hr.%';
  if v_bad > 0 then
    raise exception 'hr_03: % unacked DDL guard rows remain on hr.*', v_bad;
  end if;
end $$;
