-- HR domain, migration 05 of 16 (register item HRB-006, core tranche 2).
--
-- The identity satellites: the sensitivity tiers that split off the triad. Eight tables --
-- hr.employee_private, hr.separation, hr.compensation, hr.reporting_line,
-- hr.external_identity, hr.emergency_contact, hr.credential, hr.engagement -- plus the
-- hr.employment.separation_id FK that file 04 left bare, plus hr.compensation_as_of and
-- hr.v_compensation_current (section 4.10 owed them to this file).
--
-- Authority: /projects/hr-domain/specs/SPEC-DATA-MODEL.md sections 4.2, 4.5, 4.6, 4.7, 4.8,
-- 4.10, 18.1 file 05.
--
-- FOUR CONF FLIPS in this file: employee_private, separation, compensation, emergency_contact.
-- Each is created through the provisioner as `entity` at p_visibility => 'personal' and then
-- reclassified to `restricted` -- the tranche-1 build-proven correction now published as
-- section 1.4 item 3. `p_visibility => 'none'` (which sections 4.2/4.5/4.6 still show in their
-- literal calls) WARNs on `no visibility enum` and can never certify.
--
-- 🚨 THE CONVEYANCE TRAP (section 1.4 / section 17.3). Four of these tables hold an FK to a
-- DIR-tier row and NONE of them may ever gain a platform.entity_relationships row:
--   hr.employee_private.employee_id, hr.emergency_contact.employee_id,
--   hr.separation.employment_id, hr.compensation.employment_id + .position_assignment_id.
-- A composition or containment edge on any of them publishes the SSN, the home address, the
-- termination reason or the salary to every member of the organization, because
-- iam.has_access_for_base walks parents and hr.employee carries an org-audience viewer grant.
-- The assertion block at the foot of this file fails the migration if one ever appears.
--
-- Idempotent. Applied live as migration `hr_05_identity_satellites`.

set local lock_timeout = '20s';

-- ============================================================ 4.2 hr.employee_private  (CONF, NO-EDGE)
-- Separate table, not columns on hr.employee, because field-level sensitivity is not
-- expressible in RLS and hr.employee must stay org-readable.
do $$ begin
  if to_regclass('hr.employee_private') is null then
    perform platform.create_entity_table(
      p_schema => 'hr', p_table => 'employee_private', p_token => 'hr_employee_private',
      p_label => 'Employee private record',
      p_fields => ARRAY[
        'employee_id uuid NOT NULL REFERENCES hr.employee(id)',
        'date_of_birth date',
        $f$ssn_last4 text CHECK (ssn_last4 ~ '^[0-9]{4}$')$f$,
        'ssn_ciphertext bytea',
        'ssn_key_id text',
        'ssn_hmac bytea',
        'national_id_kind text',
        'national_id_ciphertext bytea',
        $f$home_address jsonb NOT NULL DEFAULT '{}'::jsonb$f$,
        'home_address_effective_from date',
        $f$mailing_address jsonb NOT NULL DEFAULT '{}'::jsonb$f$,
        'personal_email text',
        'personal_phone text',
        'work_authorization_kind text',
        'work_authorization_expires_on date',
        'gender_self_id_category_id uuid REFERENCES platform.categories(id)',
        'ethnicity_self_id_category_id uuid REFERENCES platform.categories(id)',
        'veteran_status_category_id uuid REFERENCES platform.categories(id)',
        'disability_self_id_category_id uuid REFERENCES platform.categories(id)',
        'self_id_collected_at timestamptz',
        $f$record_class_key text NOT NULL DEFAULT 'personnel_file' REFERENCES hr.record_class(class_key)$f$,
        'retention_trigger_at timestamptz',
        'legal_hold_count integer NOT NULL DEFAULT 0'
      ],
      p_variant => 'entity', p_versioned => true, p_soft_delete => true, p_visibility => 'personal',
      p_category => false, p_listed => false, p_org_default => false, p_gin_jsonb => false,
      p_parents => null);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'employee_private_one_per_employee') then
    alter table hr.employee_private add constraint employee_private_one_per_employee unique (employee_id);
  end if;
end $$;

create index if not exists employee_private_employee_idx on hr.employee_private (employee_id);
create index if not exists employee_private_work_auth_exp_idx on hr.employee_private (work_authorization_expires_on)
  where work_authorization_expires_on is not null and deleted_at is null;
-- ssn_hmac ships WITH the table or not at all: once SSNs are ciphertext-only there is no way to
-- backfill a keyed HMAC without decrypting every row, which is the operation this design exists
-- to avoid. SPEC-EMPLOYEES' duplicate scan and SPEC-ACCESS 4.5 both read it.
create index if not exists employee_private_ssn_hmac_idx on hr.employee_private (organization_id, ssn_hmac)
  where ssn_hmac is not null and deleted_at is null;

update platform.entity_types set
  taxonomy_node_id = '394893a0-be07-4b4a-9b50-3a0cd984bc80',
  client_excluded_columns = ARRAY['ssn_ciphertext','ssn_key_id','ssn_hmac','national_id_ciphertext'],
  governed_columns = ARRAY['created_by','organization_id','deleted_at','employee_id','ssn_ciphertext','ssn_key_id']
where token = 'hr_employee_private';

do $$ begin
  if (select rls_variant from platform.entity_types where token = 'hr_employee_private') is distinct from 'restricted' then
    update platform.entity_types set rls_variant = 'restricted' where token = 'hr_employee_private';
    perform iam.apply_rls('hr','employee_private','hr_employee_private','restricted');
  end if;
end $$;

-- ============================================================ 4.5 hr.separation  (CONF, NO-EDGE)
-- AR 1.13: without this the turnover dashboard is fictional and can never be backfilled.
-- NOT a component of hr.employment -- a component would inherit the employee's org-audience
-- viewer grant and publish "involuntary -- performance" to every colleague.
do $$ begin
  if to_regclass('hr.separation') is null then
    perform platform.create_entity_table(
      p_schema => 'hr', p_table => 'separation', p_token => 'hr_separation', p_label => 'Separation',
      p_fields => ARRAY[
        'employment_id uuid NOT NULL REFERENCES hr.employment(id)',
        $f$separation_category text NOT NULL CHECK (separation_category IN ('voluntary','involuntary','other'))$f$,
        'reason_category_id uuid NOT NULL REFERENCES platform.categories(id)',
        $f$initiator text NOT NULL CHECK (initiator IN ('employee','employer','mutual','third_party'))$f$,
        'initiated_by_employment_id uuid REFERENCES hr.employment(id)',
        'notice_given_on date',
        'last_day_worked date NOT NULL',
        'termination_date date NOT NULL',
        'rehire_eligible boolean',
        'rehire_eligible_note text',
        'is_deceased boolean NOT NULL DEFAULT false',
        $f$beneficiary_contact jsonb NOT NULL DEFAULT '{}'::jsonb$f$,
        'layoff_batch_id uuid',
        'final_pay_due_at timestamptz',
        'final_pay_rule_version_id uuid REFERENCES hr.jurisdiction_rule(id)',
        'pto_payout_required boolean',
        'pto_payout_rule_version_id uuid REFERENCES hr.jurisdiction_rule(id)',
        'cobra_qualifying_event_kind text',
        'cobra_qualifying_event_on date',
        'benefits_end_on date',
        'corrective_action_id uuid',
        'exit_interview_completed_at timestamptz',
        $f$unemployment_response jsonb NOT NULL DEFAULT '{}'::jsonb$f$,
        $f$record_class_key text NOT NULL DEFAULT 'separation_record' REFERENCES hr.record_class(class_key)$f$,
        'retention_trigger_at timestamptz',
        'legal_hold_count integer NOT NULL DEFAULT 0'
      ],
      p_variant => 'entity', p_versioned => true, p_soft_delete => true, p_visibility => 'personal',
      p_category => false, p_listed => false, p_org_default => false, p_gin_jsonb => false,
      p_parents => null);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'separation_one_per_employment') then
    alter table hr.separation add constraint separation_one_per_employment unique (employment_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'separation_dates_ordered') then
    alter table hr.separation add constraint separation_dates_ordered
      check (termination_date >= last_day_worked);
  end if;
  -- is_deceased suppresses every employee-action checklist item; the offboarding run reads it.
  if not exists (select 1 from pg_constraint where conname = 'separation_deceased_no_employee_tasks') then
    alter table hr.separation add constraint separation_deceased_no_employee_tasks
      check (not is_deceased or initiator = 'third_party');
  end if;
end $$;

create index if not exists separation_org_date_idx on hr.separation (organization_id, termination_date desc)
  where deleted_at is null;
create index if not exists separation_batch_idx on hr.separation (layoff_batch_id) where layoff_batch_id is not null;
create index if not exists separation_reason_idx on hr.separation (reason_category_id);

update platform.entity_types set taxonomy_node_id = '394893a0-be07-4b4a-9b50-3a0cd984bc80'
where token = 'hr_separation';

do $$ begin
  if (select rls_variant from platform.entity_types where token = 'hr_separation') is distinct from 'restricted' then
    update platform.entity_types set rls_variant = 'restricted' where token = 'hr_separation';
    perform iam.apply_rls('hr','separation','hr_separation','restricted');
  end if;
end $$;

-- ============================================================ 4.6 hr.compensation  (CONF, NO-EDGE, effective-dated)
-- D19: the privacy wall extends to PAY. Multiple concurrent rates are first-class (AR 1.6) --
-- the FLSA regular rate for a multi-rate week is the weighted average of every rate actually
-- worked that week, which is why `base` and `differential` rows coexist by design.
do $$ begin
  if to_regclass('hr.compensation') is null then
    perform platform.create_entity_table(
      p_schema => 'hr', p_table => 'compensation', p_token => 'hr_compensation',
      p_label => 'Compensation record',
      p_fields => ARRAY[
        'employment_id uuid NOT NULL REFERENCES hr.employment(id)',
        'position_assignment_id uuid REFERENCES hr.position_assignment(id)',
        $f$component_kind text NOT NULL CHECK (component_kind IN ('base','differential','variable_plan','allowance','contract_rate','piece_rate'))$f$,
        $f$pay_basis text NOT NULL CHECK (pay_basis IN ('hourly','salary','piece','commission','contract'))$f$,
        'amount numeric(14,4) NOT NULL',
        $f$currency text NOT NULL DEFAULT 'USD'$f$,
        $f$per_unit text CHECK (per_unit IN ('hour','year','month','week','piece','engagement'))$f$,
        'fte numeric(5,4)',
        'annualized_amount numeric(14,2)',
        'earning_code_id uuid REFERENCES hr.earning_code(id)',
        'variable_plan_ref text',
        'pay_range_min numeric(14,2)',
        'pay_range_max numeric(14,2)',
        'workflow_instance_id uuid',
        'approved_at timestamptz',
        'approved_by_employment_id uuid REFERENCES hr.employment(id)',
        'effective_from date NOT NULL',
        'effective_to date',
        $f$effective_range daterange GENERATED ALWAYS AS (daterange(effective_from, effective_to, '[)')) STORED$f$,
        'recorded_at timestamptz NOT NULL DEFAULT now()',
        'change_reason_category_id uuid REFERENCES platform.categories(id)',
        'supersedes_id uuid',
        $f$record_class_key text NOT NULL DEFAULT 'payroll_computation' REFERENCES hr.record_class(class_key)$f$,
        'retention_trigger_at timestamptz',
        'legal_hold_count integer NOT NULL DEFAULT 0'
      ],
      p_variant => 'entity', p_versioned => true, p_soft_delete => true, p_visibility => 'personal',
      p_category => false, p_listed => false, p_org_default => false, p_gin_jsonb => false,
      p_parents => null);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'compensation_window_ordered') then
    alter table hr.compensation add constraint compensation_window_ordered
      check (effective_to is null or effective_to > effective_from);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'compensation_supersedes_fk') then
    alter table hr.compensation add constraint compensation_supersedes_fk
      foreign key (supersedes_id) references hr.compensation(id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'compensation_range_ordered') then
    alter table hr.compensation add constraint compensation_range_ordered
      check (pay_range_max is null or pay_range_min is null or pay_range_max >= pay_range_min);
  end if;
  -- One BASE component per (employment, position) at a time; differentials may overlap.
  if not exists (select 1 from pg_constraint where conname = 'compensation_one_base_at_a_time') then
    alter table hr.compensation add constraint compensation_one_base_at_a_time
      exclude using gist (
        employment_id extensions.gist_uuid_ops with =,
        (coalesce(position_assignment_id, employment_id)) extensions.gist_uuid_ops with =,
        effective_range with &&)
      where (component_kind = 'base' and deleted_at is null);
  end if;
end $$;

create index if not exists compensation_employment_range_gist
  on hr.compensation using gist (employment_id extensions.gist_uuid_ops, effective_range)
  where deleted_at is null;
create index if not exists compensation_position_idx on hr.compensation (position_assignment_id, effective_from desc);

update platform.entity_types set
  taxonomy_node_id = '394893a0-be07-4b4a-9b50-3a0cd984bc80',
  governed_columns = ARRAY['created_by','organization_id','deleted_at','amount','effective_from','approved_at']
where token = 'hr_compensation';

do $$ begin
  if (select rls_variant from platform.entity_types where token = 'hr_compensation') is distinct from 'restricted' then
    update platform.entity_types set rls_variant = 'restricted' where token = 'hr_compensation';
    perform iam.apply_rls('hr','compensation','hr_compensation','restricted');
  end if;
end $$;

-- ============================================================ 4.7 hr.reporting_line  (COMP of hr_employment)
-- Only the lines the primary column cannot express. A dotted line grants VISIBILITY, never
-- approval authority (AR 1.19) -- the approval router reads hr.approval_authority, and neither
-- this table nor position_assignment.manager_employment_id is an approval right.
do $$ begin
  if to_regclass('hr.reporting_line') is null then
    perform platform.create_entity_table(
      p_schema => 'hr', p_table => 'reporting_line', p_token => 'hr_reporting_line',
      p_label => 'Reporting line',
      p_fields => ARRAY[
        'employment_id uuid NOT NULL REFERENCES hr.employment(id)',
        'manager_employment_id uuid NOT NULL REFERENCES hr.employment(id)',
        $f$line_kind text NOT NULL CHECK (line_kind IN ('dotted','functional','project','interim'))$f$,
        'scope_note text',
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
  if not exists (select 1 from pg_constraint where conname = 'reporting_line_window_ordered') then
    alter table hr.reporting_line add constraint reporting_line_window_ordered
      check (effective_to is null or effective_to > effective_from);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'reporting_line_not_self') then
    alter table hr.reporting_line add constraint reporting_line_not_self
      check (manager_employment_id <> employment_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'reporting_line_supersedes_fk') then
    alter table hr.reporting_line add constraint reporting_line_supersedes_fk
      foreign key (supersedes_id) references hr.reporting_line(id);
  end if;
end $$;

create index if not exists reporting_line_manager_gist
  on hr.reporting_line using gist (manager_employment_id extensions.gist_uuid_ops, effective_range)
  where deleted_at is null;

update platform.entity_types set taxonomy_node_id = '394893a0-be07-4b4a-9b50-3a0cd984bc80'
where token = 'hr_reporting_line';

-- ============================================================ 4.8 (8) hr.external_identity  (COMP of hr_employee)
-- QuickBooks needs its own employee id and so will every later integration.
do $$ begin
  if to_regclass('hr.external_identity') is null then
    perform platform.create_entity_table(
      p_schema => 'hr', p_table => 'external_identity', p_token => 'hr_external_identity',
      p_label => 'External identity',
      p_fields => ARRAY[
        'employee_id uuid NOT NULL REFERENCES hr.employee(id)',
        'system_key text NOT NULL',
        'external_id text NOT NULL',
        'external_url text',
        'synced_at timestamptz',
        $f$payload jsonb NOT NULL DEFAULT '{}'::jsonb$f$
      ],
      p_variant => 'component', p_versioned => true, p_soft_delete => true, p_visibility => 'none',
      p_category => false, p_listed => false, p_org_default => false, p_gin_jsonb => false,
      p_parents => ARRAY['hr_employee:employee_id']);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'external_identity_unique_per_system') then
    alter table hr.external_identity add constraint external_identity_unique_per_system
      unique (organization_id, system_key, external_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'external_identity_one_per_employee_system') then
    alter table hr.external_identity add constraint external_identity_one_per_employee_system
      unique (employee_id, system_key);
  end if;
end $$;

create index if not exists external_identity_employee_idx on hr.external_identity (employee_id)
  where deleted_at is null;

update platform.entity_types set taxonomy_node_id = '394893a0-be07-4b4a-9b50-3a0cd984bc80'
where token = 'hr_external_identity';

-- ============================================================ 4.8 (9) hr.emergency_contact  (CONF, NO-EDGE)
-- CONF because a colleague has no business reading a home phone number. The employee holds an
-- editor grant on their OWN rows -- the one self-service field class that is `free` (D13).
do $$ begin
  if to_regclass('hr.emergency_contact') is null then
    perform platform.create_entity_table(
      p_schema => 'hr', p_table => 'emergency_contact', p_token => 'hr_emergency_contact',
      p_label => 'Emergency contact',
      p_fields => ARRAY[
        'employee_id uuid NOT NULL REFERENCES hr.employee(id)',
        'relationship_category_id uuid REFERENCES platform.categories(id)',
        'full_name text NOT NULL',
        'phone text',
        'alt_phone text',
        'email text',
        $f$address jsonb NOT NULL DEFAULT '{}'::jsonb$f$,
        'is_primary boolean NOT NULL DEFAULT false',
        'position integer'
      ],
      p_variant => 'entity', p_versioned => true, p_soft_delete => true, p_visibility => 'personal',
      p_category => false, p_listed => false, p_org_default => false, p_gin_jsonb => false,
      p_parents => null);
  end if;
end $$;

create index if not exists emergency_contact_employee_idx on hr.emergency_contact (employee_id, position)
  where deleted_at is null;

update platform.entity_types set taxonomy_node_id = '394893a0-be07-4b4a-9b50-3a0cd984bc80'
where token = 'hr_emergency_contact';

do $$ begin
  if (select rls_variant from platform.entity_types where token = 'hr_emergency_contact') is distinct from 'restricted' then
    update platform.entity_types set rls_variant = 'restricted' where token = 'hr_emergency_contact';
    perform iam.apply_rls('hr','emergency_contact','hr_emergency_contact','restricted');
  end if;
end $$;

-- ============================================================ 4.8 (10) hr.credential  (COMP of hr_employee)
-- ONE table for licenses, certifications and external credentials. Rejected: separate
-- hr.license and hr.certification -- same fields, same consumers, two places to forget an
-- expiry. training_assignment_id is a plain FK carried BARE here (hr.training_assignment is
-- file 12) and is NO-EDGE when its FK lands.
do $$ begin
  if to_regclass('hr.credential') is null then
    perform platform.create_entity_table(
      p_schema => 'hr', p_table => 'credential', p_token => 'hr_credential', p_label => 'Credential',
      p_fields => ARRAY[
        'employee_id uuid NOT NULL REFERENCES hr.employee(id)',
        $f$credential_kind text NOT NULL CHECK (credential_kind IN ('license','certification','registration','clearance'))$f$,
        'name text NOT NULL',
        'credential_category_id uuid REFERENCES platform.categories(id)',
        'issuer_name text',
        $f$issuer_kind text NOT NULL DEFAULT 'external_issuer' CHECK (issuer_kind IN ('external_issuer','internal_training','self_reported'))$f$,
        'issuer_ref text',
        'credential_number text',
        'issued_on date',
        'expires_on date',
        $f$verification_state text NOT NULL DEFAULT 'unverified' CHECK (verification_state IN ('unverified','verified','revoked','expired'))$f$,
        'verified_at timestamptz',
        'verified_by_employment_id uuid REFERENCES hr.employment(id)',
        'revoked_on date',
        'revocation_reason text',
        'renewal_of_id uuid',
        'training_assignment_id uuid',
        'document_file_id uuid REFERENCES files.files(id)'
      ],
      p_variant => 'component', p_versioned => true, p_soft_delete => true, p_visibility => 'none',
      p_category => false, p_listed => false, p_org_default => false, p_gin_jsonb => false,
      p_parents => ARRAY['hr_employee:employee_id']);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'credential_renewal_fk') then
    alter table hr.credential add constraint credential_renewal_fk
      foreign key (renewal_of_id) references hr.credential(id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'credential_dates_ordered') then
    alter table hr.credential add constraint credential_dates_ordered
      check (expires_on is null or issued_on is null or expires_on >= issued_on);
  end if;
end $$;

-- THIS index is what the pre-lapse reminder and the scheduling conflict check read.
create index if not exists credential_expiry_idx on hr.credential (organization_id, expires_on)
  where expires_on is not null and deleted_at is null;
create index if not exists credential_employee_idx on hr.credential (employee_id) where deleted_at is null;

update platform.entity_types set taxonomy_node_id = '394893a0-be07-4b4a-9b50-3a0cd984bc80'
where token = 'hr_credential';

-- ============================================================ 4.8 (11) hr.engagement  (COMP of hr_employment)
-- D8 contractors. The RATE is an hr.compensation row with component_kind='contract_rate' --
-- never duplicated here. Employee-only machinery gates on position_assignment.worker_class,
-- not on the presence of this row.
do $$ begin
  if to_regclass('hr.engagement') is null then
    perform platform.create_entity_table(
      p_schema => 'hr', p_table => 'engagement', p_token => 'hr_engagement', p_label => 'Engagement',
      p_fields => ARRAY[
        'employment_id uuid NOT NULL REFERENCES hr.employment(id)',
        $f$platform_of_record text NOT NULL DEFAULT 'direct' CHECK (platform_of_record IN ('direct','upwork','fiverr','toptal','agency','other_marketplace'))$f$,
        'platform_external_id text',
        'platform_url text',
        $f$engagement_terms jsonb NOT NULL DEFAULT '{}'::jsonb$f$,
        'sow_file_id uuid REFERENCES files.files(id)',
        'w9_file_id uuid REFERENCES files.files(id)',
        'agreement_file_id uuid REFERENCES files.files(id)',
        'starts_on date',
        'ends_on date',
        'auto_renew boolean NOT NULL DEFAULT false',
        $f$status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','paused','ended'))$f$
      ],
      p_variant => 'component', p_versioned => true, p_soft_delete => true, p_visibility => 'none',
      p_category => false, p_listed => false, p_org_default => false, p_gin_jsonb => false,
      p_parents => ARRAY['hr_employment:employment_id']);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'engagement_dates_ordered') then
    alter table hr.engagement add constraint engagement_dates_ordered
      check (ends_on is null or starts_on is null or ends_on >= starts_on);
  end if;
end $$;

create index if not exists engagement_employment_idx on hr.engagement (employment_id) where deleted_at is null;

update platform.entity_types set taxonomy_node_id = '394893a0-be07-4b4a-9b50-3a0cd984bc80'
where token = 'hr_engagement';

-- ============================================================ the deferred FK owed by file 04
-- hr.employment.separation_id -> hr.separation(id). Plain FK, NO-EDGE, so the reason never
-- conveys through the spell.
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'employment_separation_fk') then
    alter table hr.employment add constraint employment_separation_fk
      foreign key (separation_id) references hr.separation(id);
  end if;
end $$;

-- ============================================================ 4.10 the compensation resolvers
-- Section 4.10 owed these to this file: hr.compensation did not exist when file 04 shipped the
-- other resolvers. STABLE and SECURITY INVOKER (the default) so RLS still applies -- a resolver
-- must never become a second access authority, and on a `restricted` table that means a caller
-- who is not the row's author gets nothing, which is the intended wall.
create or replace function hr.compensation_as_of(p_employment_id uuid, p_on date)
returns setof hr.compensation language sql stable as $fn$
  select * from hr.compensation
   where employment_id = p_employment_id and deleted_at is null
     and effective_range @> p_on
   order by component_kind, effective_from desc
$fn$;

comment on function hr.compensation_as_of(uuid, date) is
  'Every rate in force for a spell on a date -- ALL components, because the FLSA regular rate for a multi-rate week is the weighted average of every rate actually worked (AR 1.6). No engine reads a current_* column for pay.';

create or replace view hr.v_compensation_current with (security_invoker = true) as
  select * from hr.compensation
   where deleted_at is null and effective_range @> current_date;

grant select on hr.v_compensation_current to authenticated, service_role;

-- ============================================================ the write guard, per table
do $$
declare t text;
begin
  foreach t in array ARRAY['employee_private','separation','compensation','reporting_line',
                           'external_identity','emergency_contact','credential','engagement'] loop
    if not exists (select 1 from pg_trigger tg join pg_class c on c.oid = tg.tgrelid
                     join pg_namespace n on n.oid = c.relnamespace
                    where n.nspname = 'hr' and c.relname = t and tg.tgname = '_zz_guard_hr_write') then
      execute format(
        'create trigger _zz_guard_hr_write before insert or update or delete on hr.%I for each row execute function hr._guard_hr_write()', t);
    end if;
  end loop;
end $$;

-- ============================================================ DDL guard acknowledgement
-- `employment` is in the list because this file ALTERs it to add separation_id's FK, and
-- org_not_null_no_backstop fires on ALTER TABLE as well as CREATE TABLE.
do $$
declare t text;
begin
  foreach t in array ARRAY['employee_private','separation','compensation','reporting_line',
                           'external_identity','emergency_contact','credential','engagement',
                           'employment'] loop
    perform platform.ddl_guard_ack(
      p_reason => 'HR is org-explicit by the 2026-08-21 NO-NULL-ORG ruling; no assignment trigger by design (SPEC-DATA-MODEL 1.3)',
      p_by     => 'hr-domain-migration hr_05',
      p_rule   => 'org_not_null_no_backstop',
      p_object_ref => 'hr.' || t);
  end loop;
end $$;

-- ============================================================ assertions
do $$
declare r record; v_bad integer;
begin
  for r in select unnest(ARRAY['employee_private','separation','compensation','reporting_line',
                               'external_identity','emergency_contact','credential','engagement']) as t loop
    select count(*) into v_bad from iam.verify_canonical('hr', r.t, 'hr_' || r.t) where status in ('FAIL','WARN');
    if v_bad > 0 then
      raise exception 'hr_05: hr.% has % FAIL/WARN conformance rows', r.t, v_bad;
    end if;
    if not iam.canonical_certify_ok('hr', r.t, 'hr_' || r.t) then
      raise exception 'hr_05: hr.% does not certify', r.t;
    end if;
    if not exists (select 1 from pg_trigger tg join pg_class c on c.oid = tg.tgrelid
                     join pg_namespace n on n.oid = c.relnamespace
                    where n.nspname = 'hr' and c.relname = r.t and tg.tgname = '_zz_guard_hr_write') then
      raise exception 'hr_05: hr.% is missing _zz_guard_hr_write', r.t;
    end if;
    if (select taxonomy_node_id from platform.entity_types where token = 'hr_' || r.t) is null then
      raise exception 'hr_05: hr_% has no taxonomy_node_id', r.t;
    end if;
  end loop;

  -- the four CONF flips actually landed
  select count(*) into v_bad from platform.entity_types
   where token in ('hr_employee_private','hr_separation','hr_compensation','hr_emergency_contact')
     and rls_variant <> 'restricted';
  if v_bad > 0 then
    raise exception 'hr_05: % CONF table(s) are not restricted', v_bad;
  end if;

  -- 🚨 THE CONVEYANCE TRAP: no restricted hr table may be a composition/containment child
  select count(*) into v_bad from platform.entity_relationships er
    join platform.entity_types c on c.token = er.child_type
   where c.schema_name = 'hr' and c.rls_variant = 'restricted';
  if v_bad > 0 then
    raise exception 'hr_05: % restricted hr table(s) carry an entity_relationships edge -- confidential data would convey to every org member', v_bad;
  end if;

  -- the exclusion constraint AR 1.6 rests on
  if not exists (select 1 from pg_constraint where conname = 'compensation_one_base_at_a_time' and contype = 'x') then
    raise exception 'hr_05: exclusion constraint compensation_one_base_at_a_time is missing';
  end if;
  if to_regprocedure('hr.compensation_as_of(uuid,date)') is null then
    raise exception 'hr_05: hr.compensation_as_of is missing';
  end if;
  if not exists (select 1 from pg_constraint where conname = 'employment_separation_fk') then
    raise exception 'hr_05: hr.employment.separation_id never got its FK';
  end if;

  -- section 3 / the live legacy_owner_col gate
  if exists (select 1 from information_schema.columns c
               join platform.entity_types e
                 on e.schema_name = c.table_schema and e.table_name = c.table_name
              where c.table_schema = 'hr'
                and c.column_name in ('user_id','owner_id','author_id','creator_id')) then
    raise exception 'hr_05: an hr table carries a legacy owner column; it can never certify';
  end if;

  select count(*) into v_bad from platform.ddl_guard_log
   where acknowledged_at is null and object_ref like 'hr.%';
  if v_bad > 0 then
    raise exception 'hr_05: % unacked DDL guard rows remain on hr.*', v_bad;
  end if;
end $$;
