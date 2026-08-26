-- HR domain, migration 04 of 16 (register item HRB-005) -- THE AR 1.23 GATE (G-TRIAD).
--
-- hr.employee -> hr.employment -> hr.position_assignment, the effective-dating constraints, the
-- three exclusion constraints, hr._refresh_current_position, and the section 4.10 as-of
-- resolvers and views.
--
-- Authority: /projects/hr-domain/specs/SPEC-DATA-MODEL.md sections 4.1, 4.3, 4.4, 4.9, 4.10,
-- 18.1 file 04, 18.2.
--
-- NOTHING DOWNSTREAM OF THIS FILE MAY MERGE until it is applied and every one of the three
-- tokens returns iam.canonical_certify_ok = true, and the performance-reviews node's step-3
-- persistence migration is blocked on the same gate: its snapshot kinds resolve title,
-- department and manager through hr.primary_position_as_of(employment_id, cycle_start), never
-- from a current_* column and never authored independently.
--
-- Idempotent. Applied live as migration `hr_04_identity_triad`.
--
-- ===================================================================================
-- RECORDED TECHNICAL DECISION (EXECUTION section 8: a new unknown becomes a recorded
-- decision, never a stop) -- hr.employee's login column is `login_user_id`, NOT `user_id`.
--
--   Section 4.1's field list declares `user_id uuid REFERENCES auth.users(id)`. Section 3 of
--   the SAME document forbids it: "No org_id, no is_deleted, no is_public, no owner_id/user_id
--   on an entity." The live gate agrees with section 3 and not with section 4.1:
--   `iam.verify_canonical`'s `legacy_owner_col` check returns WARN for any non-`personal`
--   variant carrying user_id/owner_id/author_id/creator_id, and `iam.canonical_certify_ok` is
--   FALSE on a single WARN. Proven before writing this file, in a rolled-back probe: a table
--   created through the provisioner with a `user_id` column returns exactly that WARN, and 30+
--   live tokens are uncertified for the same reason. There is no exemption mechanism.
--
--   So hr.employee could not have carried `user_id` and certified. The column keeps its exact
--   meaning -- "the platform login on the person row", nullable, NOT an access key (kiosk-only
--   hourly staff have no login; a login need not be an employee) -- under a domain-qualified
--   name in the same family as the {{ACTOR}} block's `actor_user_id`.
--
--   CONSEQUENCE FOR OTHER LANES: every doc that names `hr.employee.user_id` (SPEC-DATA-MODEL
--   4.1, SPEC-ACCESS 1.1's "Employee self" row, and any SPEC-EMPLOYEES reference) needs a
--   one-line correction to `login_user_id`. Recorded on the HR register under HRB-005.
-- ===================================================================================

set local lock_timeout = '20s';

-- ============================================================ 4.1 hr.employee  (DIR)
-- The directory tier. Identity a colleague may see and nothing else. It NEVER holds a current
-- title, department, manager, pay or status as an authoritative value -- those are the derived
-- convenience columns of section 4.9, and no engine reads them.
do $$ begin
  if to_regclass('hr.employee') is null then
    perform platform.create_entity_table(
      p_schema => 'hr', p_table => 'employee', p_token => 'hr_employee', p_label => 'Employee',
      p_fields => ARRAY[
        'party_id uuid NOT NULL REFERENCES crm.party(id)',
        'login_user_id uuid REFERENCES auth.users(id)',
        'employee_number text NOT NULL',
        'legal_first_name text NOT NULL',
        'legal_middle_name text',
        'legal_last_name text NOT NULL',
        'legal_name_suffix text',
        'preferred_first_name text',
        'preferred_last_name text',
        'display_name text NOT NULL',
        $f$former_names jsonb NOT NULL DEFAULT '[]'::jsonb$f$,
        'pronouns text',
        'work_email text',
        'work_phone text',
        'photo_file_id uuid REFERENCES files.files(id)',
        'directory_opt_out boolean NOT NULL DEFAULT false',
        'primary_location_id uuid REFERENCES hr.location(id)',
        'current_employment_id uuid',
        'current_position_assignment_id uuid',
        'current_job_title_id uuid REFERENCES hr.job_title(id)',
        'current_department_id uuid REFERENCES hr.department(id)',
        'current_manager_employee_id uuid',
        $f$directory_status text NOT NULL DEFAULT 'active' CHECK (directory_status IN ('prehire','active','on_leave','terminated'))$f$,
        $f$custom jsonb NOT NULL DEFAULT '{}'::jsonb$f$,
        $f$record_class_key text NOT NULL DEFAULT 'personnel_file' REFERENCES hr.record_class(class_key)$f$,
        'retention_trigger_at timestamptz',
        'legal_hold_count integer NOT NULL DEFAULT 0'
      ],
      p_variant => 'entity', p_versioned => true, p_soft_delete => true, p_visibility => 'personal',
      p_category => false, p_listed => true, p_org_default => false, p_gin_jsonb => false,
      p_parents => null);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'employee_number_unique_per_org') then
    alter table hr.employee add constraint employee_number_unique_per_org
      unique (organization_id, employee_number);
  end if;
  -- AD-1: 1:1 with the CRM party, per org.
  if not exists (select 1 from pg_constraint where conname = 'employee_party_unique_per_org') then
    alter table hr.employee add constraint employee_party_unique_per_org
      unique (organization_id, party_id);
  end if;
end $$;

create index if not exists employee_org_status_idx on hr.employee (organization_id, directory_status)
  where deleted_at is null;
create index if not exists employee_display_name_trgm_idx on hr.employee using gin (display_name public.gin_trgm_ops);
create index if not exists employee_login_user_idx on hr.employee (login_user_id) where login_user_id is not null;
create index if not exists employee_party_idx on hr.employee (party_id);
create index if not exists employee_dept_idx on hr.employee (current_department_id) where deleted_at is null;
create index if not exists employee_manager_idx on hr.employee (current_manager_employee_id) where deleted_at is null;
create index if not exists employee_custom_gin on hr.employee using gin (custom jsonb_path_ops);

-- governed_columns widens the default {created_by, organization_id, deleted_at} so an `editor`
-- grantee cannot rewrite the party link, the employee number or the login binding --
-- iam._guard_governance_columns enforces it automatically for entity variants.
update platform.entity_types set
  title_column = 'display_name', content_role = 'container', reference_pickable = true,
  taxonomy_node_id = '394893a0-be07-4b4a-9b50-3a0cd984bc80',
  governed_columns = ARRAY['created_by','organization_id','deleted_at','party_id','employee_number','login_user_id']
where token = 'hr_employee';

-- ============================================================ 4.3 hr.employment  (COMP of hr_employee)
-- A rehire is a SECOND ROW, never an edit. Every downstream operational record FKs
-- employment_id (or position_assignment_id), never employee_id -- AR 1.1.
do $$ begin
  if to_regclass('hr.employment') is null then
    perform platform.create_entity_table(
      p_schema => 'hr', p_table => 'employment', p_token => 'hr_employment',
      p_label => 'Employment spell',
      p_fields => ARRAY[
        'employee_id uuid NOT NULL REFERENCES hr.employee(id)',
        'employer_profile_id uuid NOT NULL REFERENCES hr.employer_profile(id)',
        'pay_group_id uuid REFERENCES hr.pay_group(id)',
        'spell_number integer NOT NULL DEFAULT 1',
        'hire_date date NOT NULL',
        'adjusted_service_date date',
        'original_hire_date date',
        'probation_end_date date',
        'scheduled_last_day date',
        'last_day_worked date',
        'termination_date date',
        'separation_id uuid',
        $f$status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','on_leave','suspended','terminated'))$f$,
        'is_rehire boolean NOT NULL DEFAULT false',
        'prior_employment_id uuid',
        'current_position_assignment_id uuid',
        'current_manager_employment_id uuid',
        $f$custom jsonb NOT NULL DEFAULT '{}'::jsonb$f$,
        $f$record_class_key text NOT NULL DEFAULT 'personnel_file' REFERENCES hr.record_class(class_key)$f$,
        'retention_trigger_at timestamptz',
        'legal_hold_count integer NOT NULL DEFAULT 0'
      ],
      p_variant => 'component', p_versioned => true, p_soft_delete => true, p_visibility => 'none',
      p_category => false, p_listed => false, p_org_default => false, p_gin_jsonb => false,
      p_parents => ARRAY['hr_employee:employee_id']);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'employment_spell_unique') then
    alter table hr.employment add constraint employment_spell_unique unique (employee_id, spell_number);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'employment_prior_fk') then
    alter table hr.employment add constraint employment_prior_fk
      foreign key (prior_employment_id) references hr.employment(id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'employment_dates_ordered') then
    alter table hr.employment add constraint employment_dates_ordered check (
      (termination_date is null or termination_date >= hire_date)
      and (last_day_worked is null or last_day_worked >= hire_date));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'employment_terminated_has_date') then
    alter table hr.employment add constraint employment_terminated_has_date check (
      status <> 'terminated' or termination_date is not null);
  end if;
  -- One open spell per employee: a person cannot hold two concurrent employments with one
  -- employer. This is why a "transfer between two orgs of the same owner" is correctly a
  -- termination plus a hire -- they are different employers of record (AR 1.20).
  if not exists (select 1 from pg_constraint where conname = 'employment_no_overlapping_spells') then
    alter table hr.employment add constraint employment_no_overlapping_spells
      exclude using gist (
        employee_id extensions.gist_uuid_ops with =,
        daterange(hire_date, termination_date, '[]') with &&)
      where (deleted_at is null);
  end if;
end $$;

create index if not exists employment_employee_idx on hr.employment (employee_id) where deleted_at is null;
create index if not exists employment_status_idx on hr.employment (organization_id, status) where deleted_at is null;
create index if not exists employment_hire_idx on hr.employment (organization_id, hire_date desc);
create index if not exists employment_custom_gin on hr.employment using gin (custom jsonb_path_ops);

update platform.entity_types set taxonomy_node_id = '394893a0-be07-4b4a-9b50-3a0cd984bc80'
where token = 'hr_employment';

-- ============================================================ 4.4 hr.position_assignment  (COMP)
-- Three orthogonal classification axes, never one enum (AR 1.3 / AR2 LOCK 3). NO PAY RATE HERE
-- -- compensation is confidential and lands in file 05.
do $$ begin
  if to_regclass('hr.position_assignment') is null then
    perform platform.create_entity_table(
      p_schema => 'hr', p_table => 'position_assignment', p_token => 'hr_position_assignment',
      p_label => 'Position assignment',
      p_fields => ARRAY[
        'employment_id uuid NOT NULL REFERENCES hr.employment(id)',
        'requisition_id uuid',
        'job_title_id uuid NOT NULL REFERENCES hr.job_title(id)',
        'department_id uuid NOT NULL REFERENCES hr.department(id)',
        'location_id uuid NOT NULL REFERENCES hr.location(id)',
        'manager_employment_id uuid REFERENCES hr.employment(id)',
        'crew_id uuid',
        'is_primary boolean NOT NULL DEFAULT true',
        $f$worker_class text NOT NULL CHECK (worker_class IN ('employee','contractor','intern','seasonal','volunteer'))$f$,
        $f$flsa_status text NOT NULL CHECK (flsa_status IN ('exempt','nonexempt'))$f$,
        $f$flsa_exemption_basis text CHECK (flsa_exemption_basis IN ('executive','administrative','professional','computer','outside_sales','highly_compensated','other'))$f$,
        $f$pay_basis text NOT NULL CHECK (pay_basis IN ('hourly','salary','piece','commission','contract'))$f$,
        $f$schedule_class text NOT NULL CHECK (schedule_class IN ('full_time','part_time','variable_hour','seasonal','per_diem'))$f$,
        'fte numeric(5,4) NOT NULL DEFAULT 1.0 CHECK (fte > 0 and fte <= 2.0)',
        'standard_hours_per_week numeric(6,2)',
        'is_supervisor boolean NOT NULL DEFAULT false',
        'cost_center text',
        'eeo1_job_category text',
        'effective_from date NOT NULL',
        'effective_to date',
        $f$effective_range daterange GENERATED ALWAYS AS (daterange(effective_from, effective_to, '[)')) STORED$f$,
        'recorded_at timestamptz NOT NULL DEFAULT now()',
        'change_reason_category_id uuid REFERENCES platform.categories(id)',
        'supersedes_id uuid',
        $f$custom jsonb NOT NULL DEFAULT '{}'::jsonb$f$
      ],
      p_variant => 'component', p_versioned => true, p_soft_delete => true, p_visibility => 'none',
      p_category => false, p_listed => false, p_org_default => false, p_gin_jsonb => false,
      p_parents => ARRAY['hr_employment:employment_id']);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'position_window_ordered') then
    alter table hr.position_assignment add constraint position_window_ordered
      check (effective_to is null or effective_to > effective_from);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'position_supersedes_fk') then
    alter table hr.position_assignment add constraint position_supersedes_fk
      foreign key (supersedes_id) references hr.position_assignment(id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'position_exemption_basis_required') then
    alter table hr.position_assignment add constraint position_exemption_basis_required
      check (flsa_status = 'nonexempt' or flsa_exemption_basis is not null);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'position_no_self_manager') then
    alter table hr.position_assignment add constraint position_no_self_manager
      check (manager_employment_id is null or manager_employment_id <> employment_id);
  end if;
  -- Exactly one PRIMARY assignment at any instant; concurrent secondary assignments allowed.
  if not exists (select 1 from pg_constraint where conname = 'position_one_primary_at_a_time') then
    alter table hr.position_assignment add constraint position_one_primary_at_a_time
      exclude using gist (
        employment_id extensions.gist_uuid_ops with =,
        effective_range with &&)
      where (is_primary and deleted_at is null);
  end if;
end $$;

create index if not exists position_employment_range_gist
  on hr.position_assignment using gist (employment_id extensions.gist_uuid_ops, effective_range)
  where deleted_at is null;
create index if not exists position_manager_idx on hr.position_assignment (manager_employment_id, effective_from desc)
  where deleted_at is null;
create index if not exists position_dept_idx on hr.position_assignment (department_id, effective_from desc);
create index if not exists position_location_idx on hr.position_assignment (location_id, effective_from desc);
create index if not exists position_custom_gin on hr.position_assignment using gin (custom jsonb_path_ops);

update platform.entity_types set taxonomy_node_id = '394893a0-be07-4b4a-9b50-3a0cd984bc80'
where token = 'hr_position_assignment';

-- ============================================================ the deferred FKs
-- Circular within the triad, plus two owed from earlier files (hr.department.head_employment_id
-- from file 03 and hr.calculation_snapshot.employment_id from file 01).
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'employee_current_employment_fk') then
    alter table hr.employee add constraint employee_current_employment_fk
      foreign key (current_employment_id) references hr.employment(id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'employee_current_position_fk') then
    alter table hr.employee add constraint employee_current_position_fk
      foreign key (current_position_assignment_id) references hr.position_assignment(id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'employee_current_manager_fk') then
    alter table hr.employee add constraint employee_current_manager_fk
      foreign key (current_manager_employee_id) references hr.employee(id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'employment_current_position_fk') then
    alter table hr.employment add constraint employment_current_position_fk
      foreign key (current_position_assignment_id) references hr.position_assignment(id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'employment_current_manager_fk') then
    alter table hr.employment add constraint employment_current_manager_fk
      foreign key (current_manager_employment_id) references hr.employment(id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'department_head_employment_fk') then
    alter table hr.department add constraint department_head_employment_fk
      foreign key (head_employment_id) references hr.employment(id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'calculation_snapshot_employment_fk') then
    alter table hr.calculation_snapshot add constraint calculation_snapshot_employment_fk
      foreign key (employment_id) references hr.employment(id);
  end if;
end $$;

-- ============================================================ 4.9 the convenience refresher
-- hr.employee.current_* and hr.employment.current_* exist so a directory list does not need a
-- lateral as-of join per row. THEY ARE NEVER READ BY AN ENGINE (section 4.10's engine contract).
--
-- Two implementation notes on the published body:
--  * v_pos is declared %ROWTYPE rather than `record`, so "no current primary assignment" is a
--    row of NULLs -- which is exactly the intended behaviour when the last position is deleted
--    or ends -- instead of an unassigned-record error.
--  * TG_OP decides which tuple carries employment_id. NEW is unassigned in an AFTER DELETE
--    trigger, so `coalesce(new.employment_id, old.employment_id)` raises there.
-- The `is distinct from` guard makes the update a NO-OP when nothing changed, so _touch_row does
-- not bump `version` and _version_capture writes no history row. Without it every position write
-- would produce two junk version rows.
create or replace function hr._refresh_current_position() returns trigger
language plpgsql security definer set search_path = hr, public
as $fn$
declare
  v_emp uuid;
  v_pos hr.position_assignment%rowtype;
begin
  if tg_op = 'DELETE' then v_emp := old.employment_id; else v_emp := new.employment_id; end if;
  if v_emp is null then return null; end if;

  select pa.* into v_pos from hr.position_assignment pa
   where pa.employment_id = v_emp and pa.is_primary and pa.deleted_at is null
     and pa.effective_range @> current_date
   order by pa.effective_from desc limit 1;

  update hr.employment e set
      current_position_assignment_id = v_pos.id,
      current_manager_employment_id  = v_pos.manager_employment_id
   where e.id = v_emp
     and (e.current_position_assignment_id, e.current_manager_employment_id)
         is distinct from (v_pos.id, v_pos.manager_employment_id);

  update hr.employee em set
      current_employment_id          = v_emp,
      current_position_assignment_id = v_pos.id,
      current_job_title_id           = v_pos.job_title_id,
      current_department_id          = v_pos.department_id,
      current_manager_employee_id    = (select employee_id from hr.employment
                                         where id = v_pos.manager_employment_id)
   from hr.employment e2
   where e2.id = v_emp and em.id = e2.employee_id
     and (em.current_position_assignment_id, em.current_job_title_id, em.current_department_id)
         is distinct from (v_pos.id, v_pos.job_title_id, v_pos.department_id);
  return null;
end
$fn$;

comment on function hr._refresh_current_position() is
  'Maintains the non-authoritative current_* convenience columns on hr.employee and hr.employment. SECURITY DEFINER because an HR admin editing a position must not need an editor grant on the directory row. No engine may read what this maintains (SPEC-DATA-MODEL 4.10).';

drop trigger if exists _refresh_current_position on hr.position_assignment;
create trigger _refresh_current_position
  after insert or update or delete on hr.position_assignment
  for each row execute function hr._refresh_current_position();

-- ============================================================ 4.10 the as-of resolvers
-- One resolver per concern, all STABLE and all SECURITY INVOKER (the default) so RLS still
-- applies -- a resolver must never become a second access authority.
--
-- hr.compensation_as_of and hr.v_compensation_current are NOT here: hr.compensation is created
-- in file 05 and they land with it.
--
-- THE ENGINE CONTRACT, binding on every consumer: no HR engine may read a current_* column,
-- hr.employee.directory_status, or a v_*_current view. Every calculation resolves its inputs AS
-- OF THE DATE OF THE FACT BEING CALCULATED -- the work date for OT, the accrual date for leave,
-- the cycle start for a review snapshot, the separation date for final pay. A code review that
-- finds `current_` in an engine is a defect.

create or replace function hr.position_as_of(p_employment_id uuid, p_on date)
returns setof hr.position_assignment language sql stable as $fn$
  select * from hr.position_assignment
   where employment_id = p_employment_id and deleted_at is null
     and effective_range @> p_on
   order by is_primary desc, effective_from desc, recorded_at desc
$fn$;

create or replace function hr.primary_position_as_of(p_employment_id uuid, p_on date)
returns hr.position_assignment language sql stable as $fn$
  select * from hr.position_as_of(p_employment_id, p_on) where is_primary limit 1
$fn$;

create or replace function hr.employment_as_of(p_employee_id uuid, p_on date)
returns hr.employment language sql stable as $fn$
  select * from hr.employment
   where employee_id = p_employee_id and deleted_at is null
     and hire_date <= p_on
     and (termination_date is null or termination_date >= p_on)
   order by spell_number desc limit 1
$fn$;

create or replace function hr.manager_as_of(p_employment_id uuid, p_on date)
returns uuid language sql stable as $fn$
  select manager_employment_id from hr.primary_position_as_of(p_employment_id, p_on)
$fn$;

create or replace function hr.org_chart_as_of(p_organization_id uuid, p_on date)
returns table(employment_id uuid, employee_id uuid, display_name text, job_title_id uuid,
              department_id uuid, location_id uuid, manager_employment_id uuid, fte numeric)
language sql stable as $fn$
  select e.id, em.id, em.display_name, pa.job_title_id, pa.department_id, pa.location_id,
         pa.manager_employment_id, pa.fte
    from hr.employment e
    join hr.employee em on em.id = e.employee_id
    join lateral hr.primary_position_as_of(e.id, p_on) pa on true
   where e.organization_id = p_organization_id
     and e.deleted_at is null
     and e.hire_date <= p_on
     and (e.termination_date is null or e.termination_date >= p_on)
$fn$;

comment on function hr.primary_position_as_of(uuid, date) is
  'The one resolver every consumer uses for "what job did this spell hold on this date". The performance-reviews node''s employment snapshot kind derives title, department and manager through this call at cycle start -- never from a current_* column (SPEC-DATA-MODEL 18.2).';

-- Companion views for the common "today" case so client code never writes current_date itself.
-- security_invoker so the caller's RLS applies: a plain view is checked as its OWNER, which here
-- is the table owner, and would bypass RLS entirely. 20 of the platform's 23 views in these
-- schemas already carry the option; this follows that convention, not the spec's prose.
create or replace view hr.v_position_current with (security_invoker = true) as
  select * from hr.position_assignment
   where deleted_at is null and effective_range @> current_date;

create or replace view hr.v_org_chart_current with (security_invoker = true) as
  select e.id as employment_id, em.id as employee_id, em.display_name, pa.job_title_id,
         pa.department_id, pa.location_id, pa.manager_employment_id, pa.fte, e.organization_id
    from hr.employment e
    join hr.employee em on em.id = e.employee_id
    join hr.position_assignment pa
      on pa.employment_id = e.id and pa.is_primary and pa.deleted_at is null
     and pa.effective_range @> current_date
   where e.deleted_at is null
     and e.hire_date <= current_date
     and (e.termination_date is null or e.termination_date >= current_date);

grant select on hr.v_position_current, hr.v_org_chart_current to authenticated, service_role;

-- ============================================================ the write guard, per table
do $$
declare t text;
begin
  foreach t in array ARRAY['employee','employment','position_assignment'] loop
    if not exists (select 1 from pg_trigger tg join pg_class c on c.oid = tg.tgrelid
                     join pg_namespace n on n.oid = c.relnamespace
                    where n.nspname = 'hr' and c.relname = t and tg.tgname = '_zz_guard_hr_write') then
      execute format(
        'create trigger _zz_guard_hr_write before insert or update or delete on hr.%I for each row execute function hr._guard_hr_write()', t);
    end if;
  end loop;
end $$;

-- ============================================================ DDL guard acknowledgement
-- `department` and `calculation_snapshot` are here because this file ALTERs them to add the
-- FKs they were owed (head_employment_id, employment_id), and org_not_null_no_backstop fires
-- on ALTER TABLE as well as CREATE TABLE -- one fresh WARN row per altered table.
do $$
declare t text;
begin
  foreach t in array ARRAY['employee','employment','position_assignment',
                           'department','calculation_snapshot'] loop
    perform platform.ddl_guard_ack(
      p_reason => 'HR is org-explicit by the 2026-08-21 NO-NULL-ORG ruling; no assignment trigger by design (SPEC-DATA-MODEL 1.3)',
      p_by     => 'hr-domain-migration hr_04',
      p_rule   => 'org_not_null_no_backstop',
      p_object_ref => 'hr.' || t);
  end loop;
end $$;

-- ============================================================ assertions (THE G-TRIAD GATE)
do $$
declare r record; v_bad integer; c_name text;
begin
  for r in select unnest(ARRAY['employee','employment','position_assignment']) as t loop
    select count(*) into v_bad from iam.verify_canonical('hr', r.t, 'hr_' || r.t) where status in ('FAIL','WARN');
    if v_bad > 0 then
      raise exception 'hr_04 G-TRIAD: hr.% has % FAIL/WARN conformance rows', r.t, v_bad;
    end if;
    if not exists (select 1 from pg_trigger tg join pg_class c on c.oid = tg.tgrelid
                     join pg_namespace n on n.oid = c.relnamespace
                    where n.nspname = 'hr' and c.relname = r.t and tg.tgname = '_zz_guard_hr_write') then
      raise exception 'hr_04: hr.% is missing _zz_guard_hr_write', r.t;
    end if;
    if (select taxonomy_node_id from platform.entity_types where token = 'hr_' || r.t) is null then
      raise exception 'hr_04: hr_% has no taxonomy_node_id', r.t;
    end if;
  end loop;

  -- the three exclusion constraints AR 1.2/1.3 rest on
  foreach c_name in array ARRAY['employment_no_overlapping_spells','position_one_primary_at_a_time'] loop
    if not exists (select 1 from pg_constraint where conname = c_name and contype = 'x') then
      raise exception 'hr_04: exclusion constraint % is missing', c_name;
    end if;
  end loop;

  if to_regprocedure('hr.primary_position_as_of(uuid,date)') is null then
    raise exception 'hr_04: hr.primary_position_as_of is missing -- the performance-reviews snapshot kinds depend on it';
  end if;
  if to_regclass('hr.v_org_chart_current') is null then
    raise exception 'hr_04: hr.v_org_chart_current is missing';
  end if;

  -- section 3 / the live legacy_owner_col gate: no HR table may carry a legacy owner column
  if exists (select 1 from information_schema.columns c
               join platform.entity_types e
                 on e.schema_name = c.table_schema and e.table_name = c.table_name
              where c.table_schema = 'hr'
                and c.column_name in ('user_id','owner_id','author_id','creator_id')) then
    raise exception 'hr_04: an hr table carries a legacy owner column; it can never certify';
  end if;

  select count(*) into v_bad from platform.ddl_guard_log
   where acknowledged_at is null and object_ref like 'hr.%';
  if v_bad > 0 then
    raise exception 'hr_04: % unacked DDL guard rows remain on hr.*', v_bad;
  end if;
end $$;
