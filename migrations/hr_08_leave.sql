-- HR domain, migration 08 of 16 (register item HRB-006, core tranche 2).
--
-- Leave & PTO: the five tables of section 9 -- leave_policy, leave_enrollment, leave_request,
-- leave_ledger, leave_case -- plus the hr.work_interval.leave_request_id FK owed by file 06,
-- the hr.leave_request.leave_case_id FK, and hr._leave_policy_lawful.
--
-- Authority: SPEC-DATA-MODEL sections 9.1-9.5, 15, 17.7, 18.1 file 08.
--
-- 🚨 THE LEDGER IS THE AUTHORITY. hr.leave_enrollment's balance columns are a DERIVED CACHE of
-- hr.leave_ledger and never the truth -- the same rule as section 4.9's convenience columns. A
-- balance dispute is answered by replaying the ledger. The ledger is append-only and immutable:
-- an error is a `reversal` entry, never an edit and never a delete.
--
-- ONE CONF FLIP: hr.leave_case, created `entity` at p_visibility => 'personal' and reclassified
-- to `restricted` (section 1.4 item 3).
--
-- Idempotent. Applied live as migration `hr_08_leave`.
--
-- ===================================================================================
-- RECORDED TECHNICAL DECISIONS (EXECUTION section 8)
--
-- 1. hr._leave_policy_lawful() IS FAIL-CLOSED, NOT A STUB, and today it is a no-op for a
--    provable reason. Section 9.1 requires a `before insert or update` trigger that "asks
--    SPEC-JURISDICTION's evaluator for the floor in force and RAISEs a named error when the
--    org's value is below it" -- use-it-or-lose-it in a no-forfeiture state (CA/CO/MT/NE), a
--    sub-statutory accrual rate, a carryover cap below the mandated one, a waiting period past
--    the mandated usable-after date.
--
--    Verified live before writing this file: hr.jurisdiction_rule_class holds 0 rows and
--    hr.jurisdiction_rule holds 0 rows (52 jurisdictions are seeded; the 16 rule classes and the
--    federal/CA rule rows are HRB-009's JUR-SEED work, deliberately deferred out of tranche 1).
--    There is therefore NO floor in force for any leave class, and no evaluator function exists
--    in the hr schema to ask. Writing the comparison now would mean inventing the
--    rule-parameter key vocabulary that SPEC-JURISDICTION owns -- the "genuinely ambiguous"
--    stop condition -- so this file does not invent it.
--
--    What it does instead: RESOLVE the applicable rule set (unambiguous -- rule class by slug,
--    jurisdiction, effective window, active status) and then
--      * pass when the resolved set is EMPTY, which is correct rather than lenient: a policy
--        cannot be below a floor that does not exist; and
--      * RAISE a named error the moment a rule DOES exist for the class and no evaluator is
--        present to apply it.
--    So the day HRB-009 seeds a leave rule class, leave-policy writes stop until the evaluator
--    ships. The dependency becomes impossible to forget instead of silently unenforced, which
--    is the failure mode a stub would have had.
--    OWED TO HRB-009 / SPEC-JURISDICTION: hr.jurisdiction_evaluate(...) and the parameter-key
--    contract for the leave rule classes.
--
-- 2. Internal-consistency rules are CHECK CONSTRAINTS, not trigger logic. Only the statutory
--    floor belongs in hr._leave_policy_lawful; a policy that is self-contradictory (a carryover
--    cap with carryover forbidden, an accrual method with no rate) is a structural error the
--    database should refuse without consulting any jurisdiction. Keeping the two apart is what
--    lets decision 1 stay honest about what it does and does not enforce.
--
-- 3. FLAG DUTY (coordinator ruling, ratified from P3/HRB-003), and the ONE PLACE IT CANNOT BE
--    HONOURED YET. suppress_platform_admin_lane is set on hr_leave_case here. It is NOT set on
--    hr_leave_ledger, and the reason is a live platform gap, not a judgement call:
--
--      🚨 THE FLAG CANNOT CERTIFY ON A `component` VARIANT TODAY. Proven in a rolled-back probe
--      before this file was finalised: flag an existing HR component, re-run iam.apply_rls, and
--      iam.verify_canonical returns
--          privacy_wall = FAIL :: "suppress_platform_admin_lane=true but std_select still
--          carries a platform-staff arm — re-run iam.apply_rls"
--      even though apply_rls has just run. iam._apply_rls_unchecked empties v_admin, v_su_sel,
--      v_su_ins and v_sysorg_ins when the flag is set, but the component lane's std_select is
--      still emitted with an is_super_admin() system-org arm that none of those four strings
--      covers. Since iam.canonical_certify_ok is FALSE on a single FAIL, flagging
--      hr_leave_ledger would have made it permanently uncertifiable -- and "certified before the
--      next file" is the hard gate this tranche runs on.
--
--      hr_leave_ledger is D19's table by name (section 1.5.1a) for its `amount` and `rate`: a
--      payout or reinstatement entry carries a dollar figure and an hourly rate, which is
--      compensation reached through the leave lane. What IS in force meanwhile is section 9.4's
--      own wall -- both columns are in client_excluded_columns, so no generated client selects
--      them and the figures are read only through hr.read_confidential, which audits the read.
--      The missing half is the platform-staff RLS arm.
--
--      OWED TO THE PLATFORM (the flag is P3/HRB-003's, so this is not this lane's to change):
--      teach iam._apply_rls_unchecked to strip the component lane's system-org/super-admin arm
--      under the flag, then set it on hr_leave_ledger and on hr_payroll_export_line (file 06,
--      also a component, also named by D19, blocked for exactly the same reason).
--
--    Flagged and certifying: hr_leave_case -- Restricted tier AND medical (record class
--    `leave_case_medical`), and D19's customer promise covers medical alongside pay.
--    Not flagged, correctly: leave_policy, leave_enrollment and leave_request carry no pay
--    value, no medical content and no secret -- P3's criteria are a class test, not "every
--    restricted table".
-- ===================================================================================

set local lock_timeout = '20s';

-- ============================================================ 9.1 hr.leave_policy  (DIR)
-- AR 1.8, the collision the tree could not express: accrual_method='per_hours_worked' is a
-- FIRST-CLASS method wired to hr.work_interval (1 hour per 30 hours worked is the common
-- statutory rate), and statutory_basis_rule_class + statutory_jurisdiction_id mean the policy
-- pulls its floor from the jurisdiction engine -- the org cannot configure below it.
-- reinstate_on_rehire_within_days is the rehire-balance reinstatement that only works because
-- employment SPELLS exist (AR 1.1 + 1.8).
do $$ begin
  if to_regclass('hr.leave_policy') is null then
    perform platform.create_entity_table(
      p_schema => 'hr', p_table => 'leave_policy', p_token => 'hr_leave_policy',
      p_label => 'Leave policy',
      p_fields => ARRAY[
        'name text NOT NULL',
        $f$leave_kind text NOT NULL CHECK (leave_kind IN ('pto','vacation','sick','personal','bereavement','jury','parental','unpaid','floating_holiday','comp_time'))$f$,
        'statutory_basis_rule_class text',
        'statutory_jurisdiction_id uuid REFERENCES hr.jurisdiction(id)',
        $f$accrual_method text NOT NULL CHECK (accrual_method IN ('per_hours_worked','per_pay_period','per_month','annual_lump','anniversary_lump','unlimited','none'))$f$,
        'accrual_rate numeric(12,6)',
        'accrual_per_units numeric(12,4)',
        $f$accrual_unit text CHECK (accrual_unit IN ('hour','pay_period','month','year'))$f$,
        $f$accrual_starts text NOT NULL DEFAULT 'hire' CHECK (accrual_starts IN ('hire','after_waiting_period','policy_year_start'))$f$,
        'waiting_period_days integer NOT NULL DEFAULT 0',
        'usable_after_days integer NOT NULL DEFAULT 0',
        'annual_accrual_cap numeric(10,2)',
        'balance_cap numeric(10,2)',
        'carryover_allowed boolean NOT NULL DEFAULT true',
        'carryover_cap numeric(10,2)',
        'carryover_expires_after_days integer',
        'negative_balance_allowed boolean NOT NULL DEFAULT false',
        'negative_balance_floor numeric(10,2)',
        $f$payout_on_termination text NOT NULL DEFAULT 'jurisdiction' CHECK (payout_on_termination IN ('never','always','jurisdiction','policy'))$f$,
        'reinstate_on_rehire_within_days integer',
        'increment_minutes integer NOT NULL DEFAULT 15',
        'requires_approval boolean NOT NULL DEFAULT true',
        $f$blackout_rules jsonb NOT NULL DEFAULT '[]'::jsonb$f$,
        $f$mandated_uses jsonb NOT NULL DEFAULT '[]'::jsonb$f$,
        'documentation_required_after_days integer',
        'earning_code_id uuid REFERENCES hr.earning_code(id)',
        $f$schedule_class_scope text[] NOT NULL DEFAULT '{}'$f$,
        $f$worker_class_scope text[] NOT NULL DEFAULT '{}'$f$,
        'is_active boolean NOT NULL DEFAULT true',
        $f$custom jsonb NOT NULL DEFAULT '{}'::jsonb$f$
      ],
      p_variant => 'entity', p_versioned => true, p_soft_delete => true, p_visibility => 'personal',
      p_category => true, p_listed => true, p_org_default => false, p_gin_jsonb => false,
      p_parents => null);
  end if;
end $$;

-- RECORDED DECISION 2: structural self-consistency, refused without consulting a jurisdiction.
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'leave_policy_name_unique') then
    alter table hr.leave_policy add constraint leave_policy_name_unique unique (organization_id, name);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'leave_policy_accrual_rate_present') then
    alter table hr.leave_policy add constraint leave_policy_accrual_rate_present check (
      accrual_method in ('unlimited','none') or accrual_rate is not null);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'leave_policy_hours_worked_has_unit') then
    alter table hr.leave_policy add constraint leave_policy_hours_worked_has_unit check (
      accrual_method <> 'per_hours_worked'
      or (accrual_unit = 'hour' and accrual_per_units is not null and accrual_per_units > 0));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'leave_policy_carryover_coherent') then
    alter table hr.leave_policy add constraint leave_policy_carryover_coherent check (
      carryover_allowed or (carryover_cap is null and carryover_expires_after_days is null));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'leave_policy_negative_coherent') then
    alter table hr.leave_policy add constraint leave_policy_negative_coherent check (
      negative_balance_allowed or negative_balance_floor is null);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'leave_policy_periods_nonneg') then
    alter table hr.leave_policy add constraint leave_policy_periods_nonneg check (
      waiting_period_days >= 0 and usable_after_days >= 0 and increment_minutes > 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'leave_policy_caps_ordered') then
    alter table hr.leave_policy add constraint leave_policy_caps_ordered check (
      balance_cap is null or annual_accrual_cap is null or balance_cap >= annual_accrual_cap);
  end if;
end $$;

create index if not exists leave_policy_active_idx on hr.leave_policy (organization_id, is_active)
  where deleted_at is null;
create index if not exists leave_policy_kind_idx on hr.leave_policy (organization_id, leave_kind)
  where deleted_at is null;
create index if not exists leave_policy_custom_gin on hr.leave_policy using gin (custom jsonb_path_ops);

update platform.entity_types set
  title_column = 'name', reference_pickable = true,
  taxonomy_node_id = 'e69bbd72-3bca-474e-9d45-02cd934c9c40'
where token = 'hr_leave_policy';

-- ---------------------------------------------------------- the lawfulness wall
-- RECORDED DECISION 1 at the head of this file explains why this resolves but does not compare,
-- and why that is fail-closed rather than a stub.
create or replace function hr._leave_policy_lawful() returns trigger
language plpgsql as $fn$
declare
  v_rules integer;
begin
  -- Nothing to check when the policy declares no statutory basis: an org's own generous PTO
  -- plan has no floor to fall below.
  if new.statutory_basis_rule_class is null then
    return new;
  end if;

  -- Resolve the applicable rule set: the named class, in force on today's date, active, and
  -- either platform-wide or scoped to this policy's jurisdiction.
  select count(*) into v_rules
    from hr.jurisdiction_rule r
    join hr.jurisdiction_rule_class rc on rc.id = r.rule_class_id
   where rc.slug = new.statutory_basis_rule_class
     and rc.is_active
     and rc.deleted_at is null
     and r.deleted_at is null
     and r.status = 'active'
     and r.effective_from <= current_date
     and (r.effective_to is null or r.effective_to > current_date)
     and (new.statutory_jurisdiction_id is null
          or r.jurisdiction_key = (select j.key from hr.jurisdiction j
                                    where j.id = new.statutory_jurisdiction_id));

  if v_rules = 0 then
    -- No floor is in force for this class, so no configuration can be below it.
    return new;
  end if;

  -- A floor EXISTS and this build has no evaluator to apply it. Refuse rather than admit a
  -- policy nobody checked: an unlawful accrual rate or carryover cap is a wage claim.
  raise exception
    'hr.leave_policy: % jurisdiction rule(s) are in force for class % but no evaluator exists to apply them; SPEC-JURISDICTION / HRB-009 owes hr.jurisdiction_evaluate and the leave parameter-key contract',
    v_rules, new.statutory_basis_rule_class
    using errcode = 'P0001';
end
$fn$;

comment on function hr._leave_policy_lawful() is
  'SPEC-DATA-MODEL 9.1 unlawful-config rejection. Resolves the statutory rule set in force for the policy''s class and jurisdiction. Passes when the set is empty (no floor exists); refuses when a floor exists and no evaluator is present. HRB-009 owes the evaluator and the parameter-key contract.';

drop trigger if exists _zz_leave_policy_lawful on hr.leave_policy;
create trigger _zz_leave_policy_lawful before insert or update on hr.leave_policy
  for each row execute function hr._leave_policy_lawful();

-- ============================================================ 9.2 hr.leave_enrollment  (COMP of hr_employment)
-- THE BALANCE COLUMNS ARE A DERIVED CACHE OF hr.leave_ledger, NEVER THE AUTHORITY.
do $$ begin
  if to_regclass('hr.leave_enrollment') is null then
    perform platform.create_entity_table(
      p_schema => 'hr', p_table => 'leave_enrollment', p_token => 'hr_leave_enrollment',
      p_label => 'Leave enrollment',
      p_fields => ARRAY[
        'employment_id uuid NOT NULL REFERENCES hr.employment(id)',
        'leave_policy_id uuid NOT NULL REFERENCES hr.leave_policy(id)',
        'balance_hours numeric(10,2) NOT NULL DEFAULT 0',
        'accrued_ytd_hours numeric(10,2) NOT NULL DEFAULT 0',
        'used_ytd_hours numeric(10,2) NOT NULL DEFAULT 0',
        'pending_hours numeric(10,2) NOT NULL DEFAULT 0',
        'last_accrual_at timestamptz',
        'policy_year_start_on date',
        'reinstated_from_employment_id uuid REFERENCES hr.employment(id)',
        'reinstated_hours numeric(10,2)',
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
  if not exists (select 1 from pg_constraint where conname = 'leave_enrollment_window_ordered') then
    alter table hr.leave_enrollment add constraint leave_enrollment_window_ordered
      check (effective_to is null or effective_to > effective_from);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'leave_enrollment_supersedes_fk') then
    alter table hr.leave_enrollment add constraint leave_enrollment_supersedes_fk
      foreign key (supersedes_id) references hr.leave_enrollment(id);
  end if;
  -- One enrollment per (employment, policy) at a time.
  if not exists (select 1 from pg_constraint where conname = 'leave_enrollment_no_overlap') then
    alter table hr.leave_enrollment add constraint leave_enrollment_no_overlap
      exclude using gist (
        employment_id extensions.gist_uuid_ops with =,
        leave_policy_id extensions.gist_uuid_ops with =,
        effective_range with &&)
      where (deleted_at is null);
  end if;
end $$;

create index if not exists leave_enrollment_employment_idx
  on hr.leave_enrollment (employment_id, leave_policy_id) where deleted_at is null;

update platform.entity_types set taxonomy_node_id = 'e69bbd72-3bca-474e-9d45-02cd934c9c40'
where token = 'hr_leave_enrollment';

-- ============================================================ 9.3 hr.leave_request  (COMP of hr_employment)
-- conflict_check freezes the balance/blackout/schedule-conflict evaluation at SUBMIT time.
-- 🚨 leave_case_id is a plain FK to the CONF hr.leave_case and is NO-EDGE: an ordinary PTO
-- request must never convey access to a protected-leave case. The FK is added at the foot of
-- this file, once hr.leave_case exists.
do $$ begin
  if to_regclass('hr.leave_request') is null then
    perform platform.create_entity_table(
      p_schema => 'hr', p_table => 'leave_request', p_token => 'hr_leave_request',
      p_label => 'Leave request',
      p_fields => ARRAY[
        'employment_id uuid NOT NULL REFERENCES hr.employment(id)',
        'leave_policy_id uuid NOT NULL REFERENCES hr.leave_policy(id)',
        'leave_case_id uuid',
        'starts_on date NOT NULL',
        'ends_on date NOT NULL',
        'is_partial_day boolean NOT NULL DEFAULT false',
        $f$day_parts jsonb NOT NULL DEFAULT '[]'::jsonb$f$,
        'requested_hours numeric(10,2) NOT NULL',
        'approved_hours numeric(10,2)',
        $f$state text NOT NULL DEFAULT 'draft' CHECK (state IN ('draft','submitted','approved','denied','cancelled','taken','partially_taken'))$f$,
        'reason_category_id uuid REFERENCES platform.categories(id)',
        'reason_note text',
        'workflow_instance_id uuid',
        'decided_at timestamptz',
        'decided_by_employment_id uuid REFERENCES hr.employment(id)',
        'denial_reason text',
        'balance_at_request numeric(10,2)',
        $f$conflict_check jsonb NOT NULL DEFAULT '{}'::jsonb$f$,
        $f$affected_shift_ids uuid[] NOT NULL DEFAULT '{}'$f$,
        $f$custom jsonb NOT NULL DEFAULT '{}'::jsonb$f$,
        -- {{CALC}}
        $f$rule_version_ids uuid[] NOT NULL DEFAULT '{}'$f$,
        'engine_key text NOT NULL',
        'engine_version text NOT NULL',
        $f$calc jsonb NOT NULL DEFAULT '{}'::jsonb$f$,
        'computed_at timestamptz NOT NULL DEFAULT now()'
      ],
      p_variant => 'component', p_versioned => true, p_soft_delete => true, p_visibility => 'none',
      p_category => false, p_listed => false, p_org_default => false, p_gin_jsonb => false,
      p_parents => ARRAY['hr_employment:employment_id']);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'leave_request_dates_ordered') then
    alter table hr.leave_request add constraint leave_request_dates_ordered
      check (ends_on >= starts_on);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'leave_request_hours_positive') then
    alter table hr.leave_request add constraint leave_request_hours_positive
      check (requested_hours >= 0 and (approved_hours is null or approved_hours >= 0));
  end if;
end $$;

create index if not exists leave_request_employment_idx
  on hr.leave_request (employment_id, starts_on desc) where deleted_at is null;
create index if not exists leave_request_state_idx
  on hr.leave_request (organization_id, state, starts_on) where deleted_at is null;
create index if not exists leave_request_custom_gin on hr.leave_request using gin (custom jsonb_path_ops);

update platform.entity_types set taxonomy_node_id = 'e69bbd72-3bca-474e-9d45-02cd934c9c40'
where token = 'hr_leave_request';

-- ============================================================ 9.4 hr.leave_ledger  (COMP of hr_employment)
-- THE AUTHORITY. Append-only, immutable, no delete -- an error is a `reversal` entry, never an
-- edit. balance_after makes any point-in-time balance a single indexed lookup instead of a full
-- replay. source_workweek_id is what wires per-hours-worked statutory accrual to the timesheet.
--
-- 🚨 `amount` and `rate` go in client_excluded_columns. This is a COMPONENT of hr.employment, so
-- its access is the employee record's -- which meant a `payout` or `reinstatement` entry
-- carrying a dollar amount and an hourly rate leaked compensation through the leave lane,
-- straight past the `restricted` wall on hr.compensation. The columns stay (a PTO payout is a
-- real ledger fact and the export needs it) but no generated client selects them; the figures
-- are read through hr.read_confidential('hr_leave_ledger', id, ...) like any other compensation
-- value, which also puts the read in hr.access_audit.
do $$ begin
  if to_regclass('hr.leave_ledger') is null then
    perform platform.create_entity_table(
      p_schema => 'hr', p_table => 'leave_ledger', p_token => 'hr_leave_ledger',
      p_label => 'Leave ledger entry',
      p_fields => ARRAY[
        'employment_id uuid NOT NULL REFERENCES hr.employment(id)',
        'leave_policy_id uuid NOT NULL REFERENCES hr.leave_policy(id)',
        'leave_request_id uuid REFERENCES hr.leave_request(id)',
        $f$entry_kind text NOT NULL CHECK (entry_kind IN ('accrual','usage','adjustment','carryover','carryover_expiry','forfeiture','payout','reinstatement','opening_balance','reversal'))$f$,
        'occurred_on date NOT NULL',
        'hours_delta numeric(10,4) NOT NULL',
        'balance_after numeric(10,2) NOT NULL',
        'amount numeric(14,2)',
        'rate numeric(14,6)',
        'source_workweek_id uuid REFERENCES hr.workweek(id)',
        'source_work_interval_id uuid REFERENCES hr.work_interval(id)',
        'reverses_entry_id uuid',
        'note text',
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
      p_parents => ARRAY['hr_employment:employment_id']);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'leave_ledger_reverses_fk') then
    alter table hr.leave_ledger add constraint leave_ledger_reverses_fk
      foreign key (reverses_entry_id) references hr.leave_ledger(id);
  end if;
  -- A reversal names what it reverses; nothing else does.
  if not exists (select 1 from pg_constraint where conname = 'leave_ledger_reversal_targeted') then
    alter table hr.leave_ledger add constraint leave_ledger_reversal_targeted check (
      (entry_kind = 'reversal') = (reverses_entry_id is not null));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'leave_ledger_actor_identified') then
    alter table hr.leave_ledger add constraint leave_ledger_actor_identified check (
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

-- Section 9.4: "Append-only, immutable, no delete -- an error is a `reversal` entry, never an
-- edit." BOTH walls, not just the delete half. hr._reject_update() is file 06's shared
-- append-only trigger. Nothing legitimately updates a ledger row: it carries no {{RETAIN}}
-- block, so not even the retention stamper touches it.
-- NOTE: the update wall was applied separately as migration `hr_08a_leave_ledger_append_only`
-- because file 08 had already been applied when the gap was found in a behavioural probe. This
-- file is idempotent and carries both, so a re-run of hr_08 alone reproduces the full state.
drop trigger if exists _zz_leave_ledger_no_delete on hr.leave_ledger;
create trigger _zz_leave_ledger_no_delete before delete on hr.leave_ledger
  for each row execute function hr._reject_delete();
drop trigger if exists _zz_leave_ledger_no_update on hr.leave_ledger;
create trigger _zz_leave_ledger_no_update before update on hr.leave_ledger
  for each row execute function hr._reject_update();

create index if not exists leave_ledger_balance_idx
  on hr.leave_ledger (employment_id, leave_policy_id, occurred_on desc);
create index if not exists leave_ledger_request_idx on hr.leave_ledger (leave_request_id)
  where leave_request_id is not null;
create index if not exists leave_ledger_workweek_idx on hr.leave_ledger (source_workweek_id)
  where source_workweek_id is not null;

-- 🚨 hr_leave_ledger is NOT flagged suppress_platform_admin_lane, and that is a BLOCKED item,
-- not a decision to skip the ruling. See RECORDED TECHNICAL DECISION 3 at the head of this file.
-- What IS in force here is section 9.4's own wall: `amount` and `rate` are in
-- client_excluded_columns, so no generated client selects them and the figures are read only
-- through hr.read_confidential('hr_leave_ledger', id, ...), which writes an hr.access_audit row.
update platform.entity_types set
  client_excluded_columns = ARRAY['amount','rate'],
  taxonomy_node_id = 'e69bbd72-3bca-474e-9d45-02cd934c9c40'
where token = 'hr_leave_ledger';

-- ============================================================ 9.5 hr.leave_case  (CONF)
-- AR 1.7: the medical/restricted tier finally has a producer. Employment status stays a coarse
-- label; THE CASE IS THE OBJECT. Intermittent FMLA (three days a week for eight weeks) is
-- expressible; entitlement is tracked separately from the PTO balance; PTO running concurrently
-- with unpaid protected leave is a DECLARED RULE, not an accident.
-- eligibility_result freezes the FMLA 12-months-of-service / 1,250-hours-worked test with the
-- workweek rows that produced it -- hours_worked, NOT hours_of_service (AR 1.6).
--
-- 🚨 THE MEDICAL CERTIFICATION ITSELF, ITS NARRATIVE, AND ANY EXTRACTED VALUES LIVE ONLY IN
-- hr.restricted_note (section 10.3). There is deliberately NO certification_file_id column
-- here: a file id on a table whose access reaches ordinary HR staff is a pointer to a medical
-- document, and the point of the restricted lane is that no such pointer exists outside it.
-- certification_due_on and certification_received_on stay -- dates are scheduling facts, not
-- medical content.
do $$ begin
  if to_regclass('hr.leave_case') is null then
    perform platform.create_entity_table(
      p_schema => 'hr', p_table => 'leave_case', p_token => 'hr_leave_case', p_label => 'Leave case',
      p_fields => ARRAY[
        'employment_id uuid NOT NULL REFERENCES hr.employment(id)',
        $f$case_kind text NOT NULL CHECK (case_kind IN ('fmla','state_pfl','ada_accommodation','workers_comp','userra','parental','jury','personal_unpaid','medical_unpaid','other'))$f$,
        $f$continuity text NOT NULL CHECK (continuity IN ('continuous','intermittent','reduced_schedule'))$f$,
        'jurisdiction_id uuid REFERENCES hr.jurisdiction(id)',
        'entitlement_hours numeric(10,2)',
        'entitlement_used_hours numeric(10,2) NOT NULL DEFAULT 0',
        'entitlement_period_start_on date',
        'entitlement_period_end_on date',
        $f$entitlement_measure text CHECK (entitlement_measure IN ('calendar_year','rolling_forward','rolling_backward','fixed_period'))$f$,
        'runs_concurrent_with_pto boolean NOT NULL DEFAULT true',
        $f$concurrent_policy_ids uuid[] NOT NULL DEFAULT '{}'$f$,
        'starts_on date NOT NULL',
        'expected_return_on date',
        'actual_return_on date',
        $f$state text NOT NULL DEFAULT 'open' CHECK (state IN ('requested','open','on_leave','returned','extended','denied','closed'))$f$,
        'eligibility_evaluated_at timestamptz',
        $f$eligibility_result jsonb NOT NULL DEFAULT '{}'::jsonb$f$,
        'certification_due_on date',
        'certification_received_on date',
        'work_restrictions text',
        $f$schedule_impact jsonb NOT NULL DEFAULT '{}'::jsonb$f$,
        'provider_claim_ref text',
        $f$benefits_continuation jsonb NOT NULL DEFAULT '{}'::jsonb$f$,
        'incident_id uuid',
        -- {{CALC}}
        $f$rule_version_ids uuid[] NOT NULL DEFAULT '{}'$f$,
        'engine_key text NOT NULL',
        'engine_version text NOT NULL',
        $f$calc jsonb NOT NULL DEFAULT '{}'::jsonb$f$,
        'computed_at timestamptz NOT NULL DEFAULT now()',
        -- {{RETAIN}}
        $f$record_class_key text NOT NULL DEFAULT 'leave_case_medical' REFERENCES hr.record_class(class_key)$f$,
        'retention_trigger_at timestamptz',
        'legal_hold_count integer NOT NULL DEFAULT 0'
      ],
      p_variant => 'entity', p_versioned => true, p_soft_delete => true, p_visibility => 'personal',
      p_category => true, p_listed => false, p_org_default => false, p_gin_jsonb => false,
      p_parents => null);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'leave_case_dates_ordered') then
    alter table hr.leave_case add constraint leave_case_dates_ordered check (
      (expected_return_on is null or expected_return_on >= starts_on)
      and (actual_return_on is null or actual_return_on >= starts_on));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'leave_case_entitlement_window_ordered') then
    alter table hr.leave_case add constraint leave_case_entitlement_window_ordered check (
      entitlement_period_end_on is null or entitlement_period_start_on is null
      or entitlement_period_end_on >= entitlement_period_start_on);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'leave_case_entitlement_nonneg') then
    alter table hr.leave_case add constraint leave_case_entitlement_nonneg
      check (entitlement_used_hours >= 0);
  end if;
end $$;

create index if not exists leave_case_employment_idx on hr.leave_case (employment_id, starts_on desc)
  where deleted_at is null;
create index if not exists leave_case_open_idx on hr.leave_case (organization_id, state, expected_return_on)
  where deleted_at is null;
create index if not exists leave_case_certification_idx on hr.leave_case (organization_id, certification_due_on)
  where certification_due_on is not null and certification_received_on is null and deleted_at is null;

update platform.entity_types set
  suppress_platform_admin_lane = true,
  taxonomy_node_id = 'e69bbd72-3bca-474e-9d45-02cd934c9c40'
where token = 'hr_leave_case';

-- The CONF flip AND the privacy-wall flag both feed the generator, so apply_rls runs
-- unconditionally here rather than only on the first flip -- see the note on hr_leave_ledger.
do $$ begin
  update platform.entity_types set rls_variant = 'restricted'
   where token = 'hr_leave_case' and rls_variant is distinct from 'restricted';
  perform iam.apply_rls('hr','leave_case','hr_leave_case','restricted');
end $$;

-- ============================================================ the deferred FKs
-- hr.work_interval.leave_request_id is the one section 18.1 owes this file: leave USAGE
-- produces hr.work_interval rows, which is what makes the export grain one table.
-- hr.leave_request.leave_case_id is section 9.3's plain FK, added now that hr.leave_case
-- exists. BOTH ARE NO-EDGE -- no entity_relationships row, ever.
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'work_interval_leave_request_fk') then
    alter table hr.work_interval add constraint work_interval_leave_request_fk
      foreign key (leave_request_id) references hr.leave_request(id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'leave_request_leave_case_fk') then
    alter table hr.leave_request add constraint leave_request_leave_case_fk
      foreign key (leave_case_id) references hr.leave_case(id);
  end if;
end $$;

create index if not exists work_interval_leave_request_idx on hr.work_interval (leave_request_id)
  where leave_request_id is not null;

-- ============================================================ the write guard, per table
do $$
declare t text;
begin
  foreach t in array ARRAY['leave_policy','leave_enrollment','leave_request','leave_ledger','leave_case'] loop
    if not exists (select 1 from pg_trigger tg join pg_class c on c.oid = tg.tgrelid
                     join pg_namespace n on n.oid = c.relnamespace
                    where n.nspname = 'hr' and c.relname = t and tg.tgname = '_zz_guard_hr_write') then
      execute format(
        'create trigger _zz_guard_hr_write before insert or update or delete on hr.%I for each row execute function hr._guard_hr_write()', t);
    end if;
  end loop;
end $$;

-- ============================================================ DDL guard acknowledgement
-- Log-driven, scoped to the one rule section 1.3 sanctions in advance -- see file 07's note on
-- why a hardcoded table list is not sufficient (it missed hr.compensation, which P3's flag
-- migration had re-fired). Any unacked row under any other rule still fails, below.
do $$
declare r record;
begin
  for r in select distinct object_ref from platform.ddl_guard_log
            where acknowledged_at is null
              and object_ref like 'hr.%'
              and rule = 'org_not_null_no_backstop' loop
    perform platform.ddl_guard_ack(
      p_reason => 'HR is org-explicit by the 2026-08-21 NO-NULL-ORG ruling; no assignment trigger by design (SPEC-DATA-MODEL 1.3)',
      p_by     => 'hr-domain-migration hr_08',
      p_rule   => 'org_not_null_no_backstop',
      p_object_ref => r.object_ref);
  end loop;
end $$;

-- ============================================================ assertions
do $$
declare r record; v_bad integer; v_rules text;
begin
  for r in select unnest(ARRAY['leave_policy','leave_enrollment','leave_request','leave_ledger','leave_case']) as t loop
    select count(*), string_agg(to_jsonb(v)::text, E'\n')
      into v_bad, v_rules
      from iam.verify_canonical('hr', r.t, 'hr_' || r.t) v
     where status in ('FAIL','WARN');
    if v_bad > 0 then
      raise exception 'hr_08: hr.% has % FAIL/WARN conformance rows', r.t, v_bad
        using detail = v_rules;
    end if;
    if not iam.canonical_certify_ok('hr', r.t, 'hr_' || r.t) then
      raise exception 'hr_08: hr.% does not certify', r.t;
    end if;
    if not exists (select 1 from pg_trigger tg join pg_class c on c.oid = tg.tgrelid
                     join pg_namespace n on n.oid = c.relnamespace
                    where n.nspname = 'hr' and c.relname = r.t and tg.tgname = '_zz_guard_hr_write') then
      raise exception 'hr_08: hr.% is missing _zz_guard_hr_write', r.t;
    end if;
    if (select taxonomy_node_id from platform.entity_types where token = 'hr_' || r.t) is null then
      raise exception 'hr_08: hr_% has no taxonomy_node_id', r.t;
    end if;
  end loop;

  -- the CONF flip
  if (select rls_variant from platform.entity_types where token = 'hr_leave_case') <> 'restricted' then
    raise exception 'hr_08: hr_leave_case is not restricted';
  end if;

  -- FLAG DUTY (coordinator ruling, P3/HRB-003 criteria). hr_leave_ledger is excluded from this
  -- assertion by RECORDED TECHNICAL DECISION 3 -- the flag cannot certify on a component until
  -- the generator is taught to strip that lane's system-org arm.
  if not (select suppress_platform_admin_lane from platform.entity_types where token = 'hr_leave_case') then
    raise exception 'hr_08: hr_leave_case is medical and Restricted but lacks suppress_platform_admin_lane';
  end if;

  -- section 9.4: the ledger's money columns never reach a generated client
  if not (select client_excluded_columns @> ARRAY['amount','rate']
            from platform.entity_types where token = 'hr_leave_ledger') then
    raise exception 'hr_08: hr_leave_ledger does not exclude amount/rate from clients -- compensation would leak through the leave lane';
  end if;

  -- section 9.5: no medical-document pointer on the case row
  if exists (select 1 from information_schema.columns
              where table_schema='hr' and table_name='leave_case'
                and column_name like '%certification_file%') then
    raise exception 'hr_08: hr.leave_case carries a certification file pointer -- medical content belongs only in hr.restricted_note';
  end if;

  -- section 17.3 / the conveyance trap
  select count(*) into v_bad from platform.entity_relationships er
    join platform.entity_types c on c.token = er.child_type
   where c.schema_name = 'hr' and c.rls_variant = 'restricted';
  if v_bad > 0 then
    raise exception 'hr_08: % restricted hr table(s) carry an entity_relationships edge', v_bad;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'leave_enrollment_no_overlap' and contype = 'x') then
    raise exception 'hr_08: exclusion constraint leave_enrollment_no_overlap is missing';
  end if;
  if to_regprocedure('hr._leave_policy_lawful()') is null then
    raise exception 'hr_08: hr._leave_policy_lawful is missing';
  end if;
  select count(*) into v_bad from (values ('work_interval_leave_request_fk'), ('leave_request_leave_case_fk')) as w(c)
   where not exists (select 1 from pg_constraint where conname = w.c);
  if v_bad > 0 then
    raise exception 'hr_08: % deferred FK(s) missing', v_bad;
  end if;

  if exists (select 1 from information_schema.columns c
               join platform.entity_types e
                 on e.schema_name = c.table_schema and e.table_name = c.table_name
              where c.table_schema = 'hr'
                and c.column_name in ('user_id','owner_id','author_id','creator_id')) then
    raise exception 'hr_08: an hr table carries a legacy owner column; it can never certify';
  end if;

  select string_agg(distinct rule, ', ') into v_rules from platform.ddl_guard_log
   where acknowledged_at is null and object_ref like 'hr.%'
     and rule <> 'org_not_null_no_backstop';
  if v_rules is not null then
    raise exception 'hr_08: unacked DDL guard rows on hr.* under unsanctioned rule(s): %', v_rules;
  end if;

  select count(*) into v_bad from platform.ddl_guard_log
   where acknowledged_at is null and object_ref like 'hr.%';
  if v_bad > 0 then
    raise exception 'hr_08: % unacked DDL guard rows remain on hr.*', v_bad;
  end if;
end $$;
