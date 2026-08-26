-- HR domain C3 — migration 1 of 6 (register item HRB-007, lane core-c3-access).
--
-- ROLES AS DATA. The six tables SPEC-DATA-MODEL §17 hands to SPEC-ACCESS and that the 16-file
-- schema build deliberately did NOT create: hr.access_role, hr.role_assignment,
-- hr.approval_authority, hr.approval_delegation, hr.derived_grant, hr.field_policy — plus the
-- two controlled vocabularies (hr_approval_action, hr_access_purpose), the builtin role
-- capabilities, the §8 self-service field policy defaults, and the §10 knobs this spec owns.
--
-- Authority: SPEC-ACCESS §§1.1–1.4, §2.3, §3.1a, §8, §10. Applied live as `hr_c3_01_role_model`.
-- Idempotent.
--
-- ===================================================================================
-- RECORDED TECHNICAL DECISIONS (EXECUTION §8) — each proven live, none a design change.
--
-- 1. 🚨 THERE IS NO DURABLE `position` OBJECT LIVE, so §1.3's default `holder_kind='position'`
--    ("authority survives the person leaving") cannot mean what it says. SPEC-DATA-MODEL built
--    the chart employment-to-employment: hr.position_assignment is a per-employment,
--    effective-dated row carrying `manager_employment_id`, and there is no `hr.position` table
--    and no `reports_to_position_id` column anywhere (verified live). The joint contract with
--    SPEC-WORKFLOW-ENGINE §2.1 pins the COLUMN SET (`holder_kind` + `holder_id`), so the columns
--    and the three-value vocabulary are kept exactly; what changes is the resolution and the
--    default. `holder_kind='position'` resolves holder_id as a hr.position_assignment id and
--    yields whoever holds that assignment at the evaluation date; the platform DEFAULT is
--    `employment`, because a position row that is deleted with its holder cannot outlive them.
--    OWED: SPEC-ACCESS §1.3's `holder_kind` default line and §1.3c's "position-to-position" wording.
--
-- 2. §10's MAP-VALUED KNOB `hr.approvals.sole_authority_mode` IS NOT SEEDABLE and is expressed as
--    per-action metadata on the vocabulary it keys off. `platform.feature_knob.value_type` has a
--    live CHECK admitting only number|integer|boolean|string|enum (the same blocker HRB-004 and
--    HRB-006 recorded, now with a sixth instance), and seeding a map as a `string` would lie about
--    the type and break the Limits & Knobs page. A per-action property belongs on the per-action
--    row: each `hr_approval_action` category carries
--    metadata = {"sole_authority_mode": …, "allows_self": …}. No new table, no new mechanism, and
--    `hr.can_approve` reads exactly one place. OWED: §10's row for that knob.
--
-- 3. TWO §10 ARRAY KNOBS ARE SUPERSEDED BY ROLES-AS-DATA, not blocked.
--    `hr.access.break_glass_enabled_roles` is `hr.access_role.break_glass_allowed` (§1.2 declares
--    that column); `hr.access.ssn_reveal_roles` is "the roles holding the `ssn.reveal` capability"
--    (§1.4 declares them). Keeping both would be two places to change one fact — AD-12 says a role
--    is data, and this is that. OWED: §10 drops both rows.
--    Still genuinely BLOCKED on the value_type CHECK and left unseeded, with no substitute:
--    `hr.access.hr_admin_excluded_populations` (org-level array, empty default — nothing to seed)
--    and `hr.records.request_scope` (two class lists; `hr_records_request_grant` takes the scope
--    explicitly per §7 step 2, so the lane is buildable without it).
--
-- 4. `hr.restricted_note`'s access-deciding column is `note_kind`, NOT §3.1a's `note_class`, and
--    the live CHECK admits SEVEN values, not five: investigation | witness_statement |
--    medical_certification | accommodation_detail | background_result | legal_advice |
--    executive_only. §3.1a's `reference` class has NO live value at all. The reach map below is
--    written against the live seven and is FAIL-CLOSED on anything else; `legal_advice` and
--    `executive_only` (which §3.1a never contemplated) are hr_owner-only with no break-glass,
--    because a class nobody assigned a reader to must not fall through to the widest lane.
--    OWED: §3.1a's class list and its five-row table.
--
-- 5. `governed_columns` IS INERT FOR THE `hr` SCHEMA and cannot be what makes `note_kind`
--    immutable. `iam._guard_governance_columns` returns immediately unless
--    `current_user = 'authenticated'` (read live), and SPEC-ACCESS law 2 routes every hr write
--    through a SECURITY DEFINER RPC, where current_user is the definer. The column set is still
--    registered — it is the declared truth and the generated client reads it — and the actual
--    enforcement is a plain BEFORE UPDATE trigger, `hr._restricted_note_kind_immutable`.
--    OWED: §3.1a's "registered in governed_columns so no editor-tier write can reclassify".
-- ===================================================================================

set local statement_timeout = '600s';
set local lock_timeout = '20s';

-- ============================================================ §1.2 hr.access_role — the catalogue
-- `system` variant + `internal` visibility + the Matrx System org (global_readable) is what makes
-- the builtins readable by every org while an org's own rows stay its own. Adding a role is DATA
-- (AD-12): no code branch anywhere reads a role key — every gate reads a CAPABILITY.
do $$ begin
  if to_regclass('hr.access_role') is null then
    perform platform.create_entity_table(
      p_schema => 'hr', p_table => 'access_role', p_token => 'hr_access_role',
      p_label => 'HR access role',
      p_fields => ARRAY[
        'role_key text NOT NULL',
        'label text NOT NULL',
        'description text',
        $f$capabilities text[] NOT NULL DEFAULT '{}'$f$,
        $f$default_scope_kind text NOT NULL DEFAULT 'org' CHECK (default_scope_kind IN ('org','department','location','pay_group','crew','direct_reports','position_subtree','employment_set'))$f$,
        'is_builtin boolean NOT NULL DEFAULT false',
        'is_assignable boolean NOT NULL DEFAULT true',
        'break_glass_allowed boolean NOT NULL DEFAULT false',
        'is_active boolean NOT NULL DEFAULT true'
      ],
      p_variant => 'system', p_versioned => true, p_soft_delete => true, p_visibility => 'internal',
      p_category => false, p_listed => false, p_org_default => false, p_gin_jsonb => false,
      p_parents => null);
  end if;
end $$;

create unique index if not exists access_role_key_unique
  on hr.access_role (organization_id, role_key) where deleted_at is null;

update platform.entity_types set title_column = 'label',
  taxonomy_node_id = '394893a0-be07-4b4a-9b50-3a0cd984bc80'
where token = 'hr_access_role';

-- ============================================================ §1.2 hr.role_assignment
-- 🚨 `ledger` IS THE WHOLE POINT. An `entity` at `internal` visibility would let any org member
-- UPDATE themselves into hr_owner, because the org-internal lane confers EDITOR to every member
-- (THE EDITOR-CAP RULING). The ledger lane grants `authenticated` SELECT only and no write grant
-- exists at all. Org-wide readability is deliberate and correct: who HR is, and who may approve
-- your leave, is directory-grade information.
do $$ begin
  if to_regclass('hr.role_assignment') is null then
    perform platform.create_entity_table(
      p_schema => 'hr', p_table => 'role_assignment', p_token => 'hr_role_assignment',
      p_label => 'HR role assignment',
      p_fields => ARRAY[
        'employment_id uuid NOT NULL REFERENCES hr.employment(id)',
        'role_key text NOT NULL',
        $f$scope_kind text NOT NULL DEFAULT 'org' CHECK (scope_kind IN ('org','department','location','pay_group','crew','direct_reports','position_subtree','employment_set'))$f$,
        'scope_id uuid',
        $f$scope_employment_ids uuid[] NOT NULL DEFAULT '{}'$f$,
        'effective_from date NOT NULL DEFAULT current_date',
        'effective_to date',
        'is_active boolean NOT NULL DEFAULT true',
        'granted_by_employment_id uuid REFERENCES hr.employment(id)',
        'granted_by_user_id uuid REFERENCES auth.users(id)',
        'reason text',
        'revoked_at timestamptz',
        'revoked_reason text'
      ],
      p_variant => 'ledger', p_versioned => false, p_soft_delete => false, p_visibility => 'none',
      p_category => false, p_listed => false, p_org_default => false, p_gin_jsonb => false,
      p_parents => null);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'role_assignment_scope_shaped') then
    alter table hr.role_assignment add constraint role_assignment_scope_shaped check (
      case scope_kind
        when 'org'             then scope_id is null and cardinality(scope_employment_ids) = 0
        when 'direct_reports'  then scope_id is null and cardinality(scope_employment_ids) = 0
        when 'employment_set'  then scope_id is null and cardinality(scope_employment_ids) > 0
        else scope_id is not null and cardinality(scope_employment_ids) = 0
      end);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'role_assignment_dates_ordered') then
    alter table hr.role_assignment add constraint role_assignment_dates_ordered
      check (effective_to is null or effective_to >= effective_from);
  end if;
end $$;

create index if not exists role_assignment_lookup_idx
  on hr.role_assignment (organization_id, employment_id, role_key) where is_active;
create index if not exists role_assignment_role_idx
  on hr.role_assignment (organization_id, role_key, effective_from desc) where is_active;

update platform.entity_types set taxonomy_node_id = '394893a0-be07-4b4a-9b50-3a0cd984bc80'
where token = 'hr_role_assignment';

-- ============================================================ §1.3 hr.approval_authority
-- The joint contract with SPEC-WORKFLOW-ENGINE §2.1: this exact column set moves in one session
-- with that spec's routing resolver. This spec owns the PREDICATE (may this person approve this
-- thing); that spec owns the SELECTOR (who should be asked). See RECORDED DECISION 1 on
-- `holder_kind`.
do $$ begin
  if to_regclass('hr.approval_authority') is null then
    perform platform.create_entity_table(
      p_schema => 'hr', p_table => 'approval_authority', p_token => 'hr_approval_authority',
      p_label => 'Approval authority',
      p_fields => ARRAY[
        $f$holder_kind text NOT NULL DEFAULT 'employment' CHECK (holder_kind IN ('position','employment','role'))$f$,
        'holder_id text NOT NULL',
        'action_type text NOT NULL',
        $f$scope_kind text NOT NULL DEFAULT 'org' CHECK (scope_kind IN ('org','department','location','pay_group','crew','direct_reports','position_subtree','employment_set'))$f$,
        'scope_id uuid',
        $f$scope_employment_ids uuid[] NOT NULL DEFAULT '{}'$f$,
        $f$limits jsonb NOT NULL DEFAULT '{}'::jsonb$f$,
        'rank integer NOT NULL DEFAULT 100',
        'is_active boolean NOT NULL DEFAULT true',
        'effective_from date NOT NULL DEFAULT current_date',
        'effective_to date',
        $f$source text NOT NULL DEFAULT 'assigned' CHECK (source IN ('assigned','delegated'))$f$,
        'delegated_from_id uuid',
        'delegation_id uuid',
        'granted_by_user_id uuid REFERENCES auth.users(id)',
        'reason text'
      ],
      p_variant => 'ledger', p_versioned => false, p_soft_delete => false, p_visibility => 'none',
      p_category => false, p_listed => false, p_org_default => false, p_gin_jsonb => false,
      p_parents => null);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'approval_authority_self_fk') then
    alter table hr.approval_authority add constraint approval_authority_self_fk
      foreign key (delegated_from_id) references hr.approval_authority(id);
  end if;
  -- §1.3b: a delegated row REQUIRES an end. A delegation with no expiry is an assignment nobody
  -- decided to make.
  if not exists (select 1 from pg_constraint where conname = 'approval_authority_delegation_bounded') then
    alter table hr.approval_authority add constraint approval_authority_delegation_bounded check (
      source <> 'delegated' or (effective_to is not null and delegated_from_id is not null));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'approval_authority_scope_shaped') then
    alter table hr.approval_authority add constraint approval_authority_scope_shaped check (
      case scope_kind
        when 'org'            then scope_id is null and cardinality(scope_employment_ids) = 0
        when 'direct_reports' then scope_id is null and cardinality(scope_employment_ids) = 0
        when 'employment_set' then scope_id is null and cardinality(scope_employment_ids) > 0
        else scope_id is not null and cardinality(scope_employment_ids) = 0
      end);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'approval_authority_dates_ordered') then
    alter table hr.approval_authority add constraint approval_authority_dates_ordered
      check (effective_to is null or effective_to >= effective_from);
  end if;
end $$;

create index if not exists approval_authority_lookup_idx
  on hr.approval_authority (organization_id, action_type, rank) where is_active;
create index if not exists approval_authority_holder_idx
  on hr.approval_authority (organization_id, holder_kind, holder_id) where is_active;

update platform.entity_types set taxonomy_node_id = '394893a0-be07-4b4a-9b50-3a0cd984bc80'
where token = 'hr_approval_authority';

-- ============================================================ §1.3b hr.approval_delegation
-- 🚨 THE RESOLVER NEVER READS THIS TABLE. It is the request/intent record — who wants to hand
-- which authority to whom, over what window, why, and whether the delegate accepted. Acceptance
-- MATERIALISES an ordinary hr.approval_authority row with source='delegated'. So a delegation that
-- was never accepted, or was revoked, grants exactly nothing, and there is no second code path in
-- which a delegated right could be evaluated differently from an assigned one.
do $$ begin
  if to_regclass('hr.approval_delegation') is null then
    perform platform.create_entity_table(
      p_schema => 'hr', p_table => 'approval_delegation', p_token => 'hr_approval_delegation',
      p_label => 'Approval delegation',
      p_fields => ARRAY[
        'authority_id uuid NOT NULL REFERENCES hr.approval_authority(id)',
        'delegator_employment_id uuid NOT NULL REFERENCES hr.employment(id)',
        'delegate_employment_id uuid NOT NULL REFERENCES hr.employment(id)',
        'effective_from date NOT NULL DEFAULT current_date',
        'effective_to date NOT NULL',
        'reason text NOT NULL',
        $f$state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','accepted','declined','revoked','expired'))$f$,
        'responded_at timestamptz',
        'response_note text',
        'materialized_authority_id uuid REFERENCES hr.approval_authority(id)',
        'revoked_at timestamptz',
        'revoked_reason text'
      ],
      p_variant => 'ledger', p_versioned => false, p_soft_delete => false, p_visibility => 'none',
      p_category => false, p_listed => false, p_org_default => false, p_gin_jsonb => false,
      p_parents => null);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'approval_delegation_dates_ordered') then
    alter table hr.approval_delegation add constraint approval_delegation_dates_ordered
      check (effective_to >= effective_from);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'approval_delegation_accepted_materialized') then
    alter table hr.approval_delegation add constraint approval_delegation_accepted_materialized
      check (state <> 'accepted' or materialized_authority_id is not null);
  end if;
  -- a delegate is never the delegator: that is not a delegation, it is a no-op that hides a bug
  if not exists (select 1 from pg_constraint where conname = 'approval_delegation_not_self') then
    alter table hr.approval_delegation add constraint approval_delegation_not_self
      check (delegate_employment_id <> delegator_employment_id);
  end if;
end $$;

create index if not exists approval_delegation_state_idx
  on hr.approval_delegation (organization_id, state, effective_to);

update platform.entity_types set taxonomy_node_id = '394893a0-be07-4b4a-9b50-3a0cd984bc80'
where token = 'hr_approval_delegation';

-- ============================================================ §2.3 hr.derived_grant
-- 🚨 WHY THIS TABLE EXISTS AT ALL: iam.permissions has FOURTEEN columns and not one of them is
-- `metadata`, `source` or `is_derived` (verified live), so HR cannot mark its own rows there.
-- This mapping buys three things the design would otherwise lack: safe reconciliation (HR only
-- ever deletes grants IT created — a hand-made grant from the sharing UI is never clobbered), an
-- answer to "why does this person have this access", and the input to the drift check.
do $$ begin
  if to_regclass('hr.derived_grant') is null then
    perform platform.create_entity_table(
      p_schema => 'hr', p_table => 'derived_grant', p_token => 'hr_derived_grant',
      p_label => 'Derived grant',
      p_fields => ARRAY[
        'permission_id uuid NOT NULL REFERENCES iam.permissions(id) ON DELETE CASCADE',
        'subject_employment_id uuid REFERENCES hr.employment(id)',
        'grantee_user_id uuid REFERENCES auth.users(id)',
        'grantee_organization_id uuid',
        'resource_type text NOT NULL',
        'resource_id uuid NOT NULL',
        $f$permission_level text NOT NULL DEFAULT 'viewer'$f$,
        'expires_at timestamptz',
        'reason text NOT NULL',
        'basis_kind text',
        'basis_id uuid',
        'derived_at timestamptz NOT NULL DEFAULT now()'
      ],
      p_variant => 'ledger', p_versioned => false, p_soft_delete => false, p_visibility => 'none',
      p_category => false, p_listed => false, p_org_default => false, p_gin_jsonb => false,
      p_parents => null);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'derived_grant_permission_unique') then
    alter table hr.derived_grant add constraint derived_grant_permission_unique unique (permission_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'derived_grant_audience_shaped') then
    alter table hr.derived_grant add constraint derived_grant_audience_shaped
      check ((grantee_user_id is null) <> (grantee_organization_id is null));
  end if;
end $$;

create index if not exists derived_grant_resource_idx
  on hr.derived_grant (resource_type, resource_id);
create index if not exists derived_grant_subject_idx
  on hr.derived_grant (organization_id, subject_employment_id);
create index if not exists derived_grant_grantee_idx
  on hr.derived_grant (organization_id, grantee_user_id) where grantee_user_id is not null;

update platform.entity_types set taxonomy_node_id = '394893a0-be07-4b4a-9b50-3a0cd984bc80'
where token = 'hr_derived_grant';

-- ============================================================ §8 hr.field_policy
do $$ begin
  if to_regclass('hr.field_policy') is null then
    perform platform.create_entity_table(
      p_schema => 'hr', p_table => 'field_policy', p_token => 'hr_field_policy',
      p_label => 'Self-service field policy',
      p_fields => ARRAY[
        'target_token text NOT NULL',
        'column_name text NOT NULL',
        $f$policy text NOT NULL CHECK (policy IN ('self_free','self_request_approval','hr_only','read_only'))$f$,
        'approver_action_type text',
        'notes text',
        'is_active boolean NOT NULL DEFAULT true'
      ],
      p_variant => 'system', p_versioned => true, p_soft_delete => true, p_visibility => 'internal',
      p_category => false, p_listed => false, p_org_default => false, p_gin_jsonb => false,
      p_parents => null);
  end if;
end $$;

do $$ begin
  -- a field that needs approval must say WHICH approval; a silent route is how a request stalls
  if not exists (select 1 from pg_constraint where conname = 'field_policy_approval_routed') then
    alter table hr.field_policy add constraint field_policy_approval_routed
      check (policy <> 'self_request_approval' or approver_action_type is not null);
  end if;
end $$;

create unique index if not exists field_policy_unique
  on hr.field_policy (organization_id, target_token, column_name) where deleted_at is null;

update platform.entity_types set taxonomy_node_id = '394893a0-be07-4b4a-9b50-3a0cd984bc80'
where token = 'hr_field_policy';

-- ============================================================ the write guard on all six
do $$
declare t text;
begin
  foreach t in array ARRAY['access_role','role_assignment','approval_authority',
                           'approval_delegation','derived_grant','field_policy'] loop
    if not exists (select 1 from pg_trigger tg join pg_class c on c.oid = tg.tgrelid
                     join pg_namespace n on n.oid = c.relnamespace
                    where n.nspname = 'hr' and c.relname = t and tg.tgname = '_zz_guard_hr_write') then
      execute format('create trigger _zz_guard_hr_write before insert or update or delete on hr.%I '
                     'for each row execute function hr._guard_hr_write()', t);
    end if;
  end loop;
end $$;

-- ============================================================ §1.3a the ONE action vocabulary
-- 26 tokens over 23 flows (the arithmetic is settled in §1.3a and other specs cite it rather than
-- recounting). Underscore grammar is canonical. RECORDED DECISION 2: `sole_authority_mode` and
-- `allows_self` ride on the row rather than in a map-valued knob the live value_type CHECK cannot
-- hold.
select set_config('hr.privileged_write', 'on', false);

insert into platform.categories (organization_id, dimension, name, slug, is_system, position, metadata, visibility)
select '39c38960-d30c-4840-b0c1-c9960de95582'::uuid, 'hr_approval_action', v.label, v.slug, true,
       v.pos, v.meta, 'internal'::platform.visibility
from (values
 ('leave_approve','Approve leave',10,'{"sole_authority_mode":"auto_record","allows_self":false}'::jsonb),
 ('leave_cancellation_approve','Approve leave cancellation',20,'{"sole_authority_mode":"auto_record","allows_self":false}'::jsonb),
 ('timecard_attest','Attest timecard',30,'{"sole_authority_mode":"auto_record","allows_self":true}'::jsonb),
 ('timecard_approve','Approve timecard',40,'{"sole_authority_mode":"auto_record","allows_self":false}'::jsonb),
 ('timecard_correction_approve','Approve timecard correction',50,'{"sole_authority_mode":"require_second_actor","allows_self":false}'::jsonb),
 ('swap_approve','Approve shift swap',60,'{"sole_authority_mode":"auto_record","allows_self":false}'::jsonb),
 ('open_shift_claim_approve','Approve open-shift claim',70,'{"sole_authority_mode":"auto_record","allows_self":false}'::jsonb),
 ('calloff_replacement_approve','Approve call-off replacement',80,'{"sole_authority_mode":"auto_record","allows_self":false}'::jsonb),
 ('schedule_change_approve','Approve schedule change',90,'{"sole_authority_mode":"auto_record","allows_self":false}'::jsonb),
 ('schedule_publish','Publish schedule',100,'{"sole_authority_mode":"auto_record","allows_self":false}'::jsonb),
 ('availability_change_approve','Approve availability change',110,'{"sole_authority_mode":"auto_record","allows_self":false}'::jsonb),
 ('profile_change_approve','Approve profile change',120,'{"sole_authority_mode":"require_second_actor","allows_self":false}'::jsonb),
 ('address_change_approve','Approve address change',130,'{"sole_authority_mode":"require_second_actor","allows_self":false}'::jsonb),
 ('pay_change_approve','Approve pay change',140,'{"sole_authority_mode":"require_second_actor","allows_self":false}'::jsonb),
 ('position_change_approve','Approve position change',150,'{"sole_authority_mode":"require_second_actor","allows_self":false}'::jsonb),
 ('requisition_approve','Approve requisition',160,'{"sole_authority_mode":"require_second_actor","allows_self":false}'::jsonb),
 ('offer_approve','Approve offer',170,'{"sole_authority_mode":"require_second_actor","allows_self":false}'::jsonb),
 ('adverse_action_approve','Approve adverse action',180,'{"sole_authority_mode":"require_second_actor","allows_self":false}'::jsonb),
 ('signature_request','Send signature request',190,'{"sole_authority_mode":"auto_record","allows_self":false}'::jsonb),
 ('signature_countersign','Countersign for the organization',200,'{"sole_authority_mode":"require_second_actor","allows_self":false}'::jsonb),
 ('acknowledgment_ack','Acknowledge',210,'{"sole_authority_mode":"auto_record","allows_self":true}'::jsonb),
 ('asset_recovery_approve','Approve asset or expense recovery',220,'{"sole_authority_mode":"require_second_actor","allows_self":false}'::jsonb),
 ('termination_approve','Approve termination',230,'{"sole_authority_mode":"require_second_actor","allows_self":false}'::jsonb),
 ('training_waiver_approve','Approve training waiver',240,'{"sole_authority_mode":"auto_record","allows_self":false}'::jsonb),
 ('corrective_action_issue','Issue corrective action',250,'{"sole_authority_mode":"require_second_actor","allows_self":false}'::jsonb),
 ('corrective_action_ack','Acknowledge corrective action',260,'{"sole_authority_mode":"auto_record","allows_self":true}'::jsonb)
) as v(slug,label,pos,meta)
where not exists (select 1 from platform.categories c
                   where c.dimension = 'hr_approval_action' and c.slug = v.slug
                     and c.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'::uuid);

update platform.categories c set metadata = v.meta
from (values
 ('leave_approve','{"sole_authority_mode":"auto_record","allows_self":false}'::jsonb),
 ('timecard_attest','{"sole_authority_mode":"auto_record","allows_self":true}'::jsonb),
 ('acknowledgment_ack','{"sole_authority_mode":"auto_record","allows_self":true}'::jsonb),
 ('corrective_action_ack','{"sole_authority_mode":"auto_record","allows_self":true}'::jsonb)
) as v(slug,meta)
where c.dimension = 'hr_approval_action' and c.slug = v.slug
  and c.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'::uuid
  and c.metadata is distinct from v.meta;

-- ============================================================ §4.3 the access-purpose vocabulary
-- `p_purpose` on every audited door comes from here, not from free text: an audit log whose
-- purpose column is prose cannot be reviewed, only read.
insert into platform.categories (organization_id, dimension, name, slug, is_system, position, visibility)
select '39c38960-d30c-4840-b0c1-c9960de95582'::uuid, 'hr_access_purpose', v.label, v.slug, true, v.pos,
       'internal'::platform.visibility
from (values
 ('operational','Day-to-day HR operation',10),
 ('payroll','Payroll preparation or correction',20),
 ('employee_request','The employee asked for it',30),
 ('benefits','Benefits administration',40),
 ('leave_administration','Leave or accommodation administration',50),
 ('investigation','Employee-relations investigation',60),
 ('legal','Legal, litigation or legal hold',70),
 ('compliance_report','Statutory or regulatory reporting',80),
 ('audit','Audit or access review',90),
 ('security_incident','Security or fraud incident',100),
 ('support','Support troubleshooting on behalf of the org',110)
) as v(slug,label,pos)
where not exists (select 1 from platform.categories c
                   where c.dimension = 'hr_access_purpose' and c.slug = v.slug
                     and c.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'::uuid);

-- ============================================================ §1.4 the builtin capability vocabulary
-- 🚨 THE SEPARATION OF DUTIES IS THE POINT: no builtin role except hr_owner holds comp AND medical
-- AND investigations. `manager` and `employee` are catalogued but NOT assignable — they are
-- derived, never granted, and hr_role_assign refuses them by name.
insert into hr.access_role
  (organization_id, role_key, label, description, capabilities, default_scope_kind,
   is_builtin, is_assignable, break_glass_allowed, visibility)
select '39c38960-d30c-4840-b0c1-c9960de95582'::uuid, v.role_key, v.label, v.descr,
       v.caps::text[], v.scope, true, v.assignable, v.bg, 'internal'::platform.visibility
from (values
 ('hr_owner','HR owner','Every HR capability, plus the authority to hand roles and approval authority out. The one builtin that holds comp AND medical AND investigations.',
  array['directory.read','working_record.read','working_record.write','identity.read','identity.write',
        'comp.read','comp.write','ssn.reveal','candidate.read','candidate.write','requisition.manage',
        'medical.read','medical.write','incident.read','incident.investigate','corrective_action.issue',
        'eeo.aggregate','background_check.adjudicate','audit.read','records.govern','payroll.export',
        'role.assign','authority.grant','break_glass'],'org',true,true),
 ('hr_admin','HR administrator','The everyday HR operator: the working record, identity, compensation and candidates. NO medical, NO investigations.',
  array['directory.read','working_record.read','working_record.write','identity.read','identity.write',
        'comp.read','comp.write','ssn.reveal','candidate.read','audit.read','break_glass'],'org',true,true),
 ('payroll_admin','Payroll administrator','Pay and the records pay is computed from. No identity writes, no medical, no investigations.',
  array['working_record.read','comp.read','ssn.reveal','payroll.export'],'org',true,false),
 ('leave_administrator','Leave administrator','Leave cases, certifications, accommodations and restrictions. Explicitly NO comp.read.',
  array['working_record.read','medical.read','medical.write'],'org',true,false),
 ('employee_relations','Employee relations','Incidents, investigations and corrective action. Explicitly NO comp.read and NO medical.read.',
  array['incident.read','incident.investigate','corrective_action.issue','working_record.read'],'org',true,false),
 ('recruiter','Recruiter','Candidates and requisitions, requisition-scoped by default.',
  array['candidate.read','candidate.write','requisition.manage'],'org',true,false),
 ('compliance_officer','Compliance officer','Aggregate EEO, background-check adjudication, the access audit and records governance.',
  array['eeo.aggregate','background_check.adjudicate','audit.read','records.govern'],'org',true,false),
 ('manager','Manager (derived)','DERIVED, NEVER ASSIGNED. Held by whoever the reporting line resolves to, over their reports only.',
  array['directory.read','working_record.read'],'direct_reports',false,false),
 ('employee','Employee (derived)','DERIVED, NEVER ASSIGNED. The self lane; every hr.capability() call with a self-scoped capability resolves here.',
  array['self.read','self.write'],'org',false,false)
) as v(role_key,label,descr,caps,scope,assignable,bg)
where not exists (select 1 from hr.access_role r
                   where r.role_key = v.role_key
                     and r.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'::uuid
                     and r.deleted_at is null);

-- keep the builtin capability sets current if this file is re-applied after a spec correction
update hr.access_role r set capabilities = v.caps::text[], break_glass_allowed = v.bg,
                            is_assignable = v.assignable
from (values
 ('hr_owner',array['directory.read','working_record.read','working_record.write','identity.read','identity.write',
        'comp.read','comp.write','ssn.reveal','candidate.read','candidate.write','requisition.manage',
        'medical.read','medical.write','incident.read','incident.investigate','corrective_action.issue',
        'eeo.aggregate','background_check.adjudicate','audit.read','records.govern','payroll.export',
        'role.assign','authority.grant','break_glass'],true,true),
 ('hr_admin',array['directory.read','working_record.read','working_record.write','identity.read','identity.write',
        'comp.read','comp.write','ssn.reveal','candidate.read','audit.read','break_glass'],true,true),
 ('payroll_admin',array['working_record.read','comp.read','ssn.reveal','payroll.export'],false,true),
 ('leave_administrator',array['working_record.read','medical.read','medical.write'],false,true),
 ('employee_relations',array['incident.read','incident.investigate','corrective_action.issue','working_record.read'],false,true),
 ('recruiter',array['candidate.read','candidate.write','requisition.manage'],false,true),
 ('compliance_officer',array['eeo.aggregate','background_check.adjudicate','audit.read','records.govern'],false,true),
 ('manager',array['directory.read','working_record.read'],false,false),
 ('employee',array['self.read','self.write'],false,false)
) as v(role_key,caps,bg,assignable)
where r.role_key = v.role_key
  and r.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'::uuid
  and r.deleted_at is null
  and (r.capabilities is distinct from v.caps::text[]
       or r.break_glass_allowed is distinct from v.bg
       or r.is_assignable is distinct from v.assignable);

-- ============================================================ §8 the seeded field policy
-- Three enforcement points and all three are required; this table is the second one's input.
-- 🚨 home address is `self_request_approval`, NOT `self_free`: it changes JURISDICTION, and
-- jurisdiction is stamped at write on every downstream record (AR 1.4 / AR2 LOCK 4).
insert into hr.field_policy
  (organization_id, target_token, column_name, policy, approver_action_type, notes, visibility)
select '39c38960-d30c-4840-b0c1-c9960de95582'::uuid, v.tok, v.col, v.pol, v.act, v.note,
       'internal'::platform.visibility
from (values
 ('hr_employee','preferred_first_name','self_free',null,null),
 ('hr_employee','preferred_last_name','self_free',null,null),
 ('hr_employee','pronouns','self_free',null,null),
 ('hr_employee','photo_file_id','self_free',null,null),
 ('hr_employee','directory_opt_out','self_free',null,null),
 ('hr_employee','work_phone','self_free',null,null),
 ('hr_employee_private','personal_phone','self_free',null,null),
 ('hr_employee_private','personal_email','self_free',null,null),
 ('hr_emergency_contact','full_name','self_free',null,'The one self-service field class that is free (D13).'),
 ('hr_emergency_contact','phone','self_free',null,null),
 ('hr_emergency_contact','alt_phone','self_free',null,null),
 ('hr_emergency_contact','email','self_free',null,null),
 ('hr_emergency_contact','address','self_free',null,null),
 ('hr_availability','organization_id','read_only',null,'Availability content is self_free; the org stamp is never a self-service field.'),
 ('hr_employee_private','home_address','self_request_approval','address_change_approve',
   'Changes jurisdiction, and jurisdiction is stamped at write on every downstream record (AR 1.4 / AR2 LOCK 4). Routed to hr_admin, not the manager: home address is Confidential tier and a manager holds no identity.read.'),
 ('hr_employee_private','mailing_address','self_request_approval','address_change_approve',null),
 ('hr_employee','legal_first_name','self_request_approval','profile_change_approve',null),
 ('hr_employee','legal_last_name','self_request_approval','profile_change_approve',null),
 ('hr_employee','legal_middle_name','self_request_approval','profile_change_approve',null),
 ('hr_employee_private','date_of_birth','self_request_approval','profile_change_approve',null),
 ('hr_employee_private','work_authorization_kind','self_request_approval','profile_change_approve',null),
 ('hr_employee_private','work_authorization_expires_on','self_request_approval','profile_change_approve',null),
 ('hr_tax_withholding','filing_status','self_request_approval','profile_change_approve',
   'Marital-status-driven tax fields: self-submitted, HR-recorded.'),
 ('hr_employee_private','ssn_ciphertext','hr_only',null,'The highest-sensitivity field in the schema.'),
 ('hr_employee_private','ssn_last4','hr_only',null,null),
 ('hr_employee','employee_number','hr_only',null,null),
 ('hr_employment','hire_date','hr_only',null,null),
 ('hr_employment','termination_date','hr_only',null,null),
 ('hr_employment','status','hr_only',null,null),
 ('hr_position_assignment','job_title_id','hr_only',null,null),
 ('hr_position_assignment','department_id','hr_only',null,null),
 ('hr_position_assignment','location_id','hr_only',null,null),
 ('hr_position_assignment','flsa_status','hr_only',null,null),
 ('hr_position_assignment','worker_class','hr_only',null,null),
 ('hr_position_assignment','manager_employment_id','hr_only',null,null),
 ('hr_compensation','amount','hr_only',null,'Even a client that bypasses the RPC entirely cannot raise its own salary — law 2''s write guard is the wall; this is the routing decision on top of it.'),
 ('hr_leave_ledger','balance_after','read_only',null,'Computed balances and accrual ledgers are never editable by anyone.'),
 ('hr_work_interval','duration_minutes','read_only',null,null),
 ('hr_workweek','overtime_hours','read_only',null,null)
) as v(tok,col,pol,act,note)
where not exists (select 1 from hr.field_policy f
                   where f.target_token = v.tok and f.column_name = v.col
                     and f.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'::uuid
                     and f.deleted_at is null);

-- ============================================================ §10 the knobs this spec owns
-- RECORDED DECISIONS 2 and 3 explain the four §10 rows that are deliberately absent.
insert into platform.feature_knob
  (feature, key, value, default_value, value_type, unit, min_value, max_value, allowed_values,
   label, description, set_by, basis, review_due)
values
('hr.access','manager_visibility_depth','2'::jsonb,'2'::jsonb,'integer',null,0,10,null,
 'Manager visibility depth','How far DOWN a manager may read their subtree. Direct + skip-level by default.','agent',
 'This is the ONE depth limit in the access design that is a deliberate cap rather than a bug: a VP does not need every timesheet nine levels below, and materialising that grant set is the one place this design would not scale. Approval ROUTING depth is a different number and is unbounded (§1.3c).',current_date+90),
('hr.access','manager_visibility_depth_confidential','0'::jsonb,'0'::jsonb,'integer',null,0,3,null,
 'Manager visibility depth (confidential)','How far down a manager may reach Confidential-tier rows. Zero means never.','agent',
 'A manager never reads pay, identity or medical. Zero is the default and the only value we would defend; the knob exists because AD-12 forbids a hard-coded ceiling, not because we expect anyone to raise it.',current_date+90),
('hr.access','comp_visibility_for_managers','"none"'::jsonb,'"none"'::jsonb,'enum',null,null,null,'["none","band_only"]'::jsonb,
 'Compensation visibility for managers','What a manager may see of a report''s pay.','agent',
 '`full` IS NOT A PERMITTED VALUE and the allowed set is what enforces it — a manager who can read exact pay makes every comp conversation in the org a negotiation over a number they were never given. `band_only` exists for orgs that run manager-led compensation planning.',current_date+90),
('hr.access','review_visibility_skip_level','true'::jsonb,'true'::jsonb,'boolean',null,null,null,null,
 'Skip-level review visibility','Whether a manager''s manager may read a performance review.','agent',
 'The skip-level is who a review escalation actually goes to; hiding it from them makes calibration impossible. Orgs with a stricter review confidentiality posture turn it off.',current_date+90),
('hr.access','break_glass_grant_ttl_minutes','60'::jsonb,'60'::jsonb,'integer','minutes',5,480,null,
 'Break-glass grant TTL','How long a break-glass grant lives before iam.permissions.expires_at kills it.','agent',
 'Break-glass writes a REAL time-boxed grant, not a one-shot read, because a one-shot that forces twelve more break-glass calls is over-tightening dressed as rigour. An hour is one working session.',current_date+90),
('hr.access','ssn_reveal_daily_alert_threshold','5'::jsonb,'5'::jsonb,'integer',null,1,100,null,
 'SSN reveal daily alert threshold','Reveals by one actor in one day before an alert fires.','agent',
 'Legitimate payroll work reveals a handful; a script reveals hundreds. Five separates them without paging anyone doing their job.',current_date+90),
('hr.access','employee_can_see_own_access_log','true'::jsonb,'true'::jsonb,'boolean',null,null,null,null,
 'Employee can see their own access log','Whether an employee may read who looked at their record.','agent',
 'No competitor does this. It is the right default for a platform whose owner insists the right people get in without blinking — and the fastest way an over-tightened or over-loose grant gets noticed is the person it is about seeing it.',current_date+90),
('hr.approvals','top_of_chart_approver','"org_owner"'::jsonb,'"org_owner"'::jsonb,'enum',null,null,null,'["org_owner","hr_owner"]'::jsonb,
 'Top-of-chart approver','Who approves for someone with no manager above them.','agent',
 'When the SUBJECT is the org owner the resolver falls through to hr_owner holders on its own; this knob picks the first rung only.',current_date+90),
('hr.approvals','sole_authority_mode_default','"require_second_actor"'::jsonb,'"require_second_actor"'::jsonb,'enum',null,null,null,'["auto_record","require_second_actor"]'::jsonb,
 'Sole-authority mode (default)','What happens when the only eligible approver is the requester. Per-action overrides live on the hr_approval_action vocabulary.','agent',
 'The DEFAULT is the strict one, and the per-action row loosens it where blocking would be absurd (a sole proprietor taking a day off). §10 specifies this as a map keyed by action; the live feature_knob value_type CHECK cannot hold a map, so the per-action half is metadata on the per-action category row — RECORDED DECISION 2.',current_date+90),
('hr.approvals','delegation_max_horizon_days','90'::jsonb,'90'::jsonb,'integer','days',1,365,null,
 'Delegation maximum horizon','Longest window a delegated authority may cover.','agent',
 'A delegation longer than a quarter is a reassignment nobody made explicit. Ninety days covers a sabbatical without becoming permanent by neglect.',current_date+90),
('hr.approvals','delegation_max_depth','1'::jsonb,'1'::jsonb,'integer',null,0,3,null,
 'Delegation maximum depth','How many times an authority may be re-delegated.','agent',
 'Re-delegation is how an authority ends up somewhere nobody chose. One hop keeps the delegator answerable for who holds it.',current_date+90),
('hr.approvals','escalation_hours','72'::jsonb,'72'::jsonb,'integer','hours',1,720,null,
 'Approval escalation window','Hours before an unanswered approval escalates.','agent',
 'Three days spans a weekend, which is when most approvals sit. Shorter escalates noise; longer is how a request quietly dies.',current_date+90),
('hr.approvals','address_change_approver','"hr_admin"'::jsonb,'"hr_admin"'::jsonb,'enum',null,null,null,'["hr_admin","hr_owner","manager"]'::jsonb,
 'Address change approver','Who approves an employee''s home-address change.','agent',
 'NOT the manager by default: home address is Confidential tier and a manager holds no identity.read, so routing it to them would be asking someone to approve a value they may not read.',current_date+90),
('hr.records','request_window_days','30'::jsonb,'30'::jsonb,'integer','days',7,365,null,
 'Records request window','How long a former employee''s records token lives.','agent',
 'CA Labor Code 1198.5 is a 30-day duty and §226 a 21-day duty, so the default must be at least the tightest statutory window. An org in a longer-window state raises it.',current_date+90),
('hr.records','request_max_uses','10'::jsonb,'10'::jsonb,'integer',null,1,100,null,
 'Records request maximum uses','How many verified sessions one records token may open.','agent',
 'A former employee downloading their file over several sittings is normal; ten sessions is generous without being an unbounded credential.',current_date+90),
('hr.relations','incident_escalation_target','"org_owner"'::jsonb,'"org_owner"'::jsonb,'enum',null,null,null,'["org_owner","named_employment","external_investigator"]'::jsonb,
 'Incident escalation target','Where a case goes when the §5 veto empties its reachable set.','agent',
 'The accused-HR-owner case is not hypothetical and it must never leave a report unroutable. The external investigator arrives through the outsider-token lane, scoped to one incident, expiring and fully audited.',current_date+90)
on conflict (feature, key) do update set
  default_value = excluded.default_value, value_type = excluded.value_type, unit = excluded.unit,
  min_value = excluded.min_value, max_value = excluded.max_value,
  allowed_values = excluded.allowed_values, label = excluded.label,
  description = excluded.description, basis = excluded.basis;

-- ============================================================ §3.1a note_kind is access-deciding
-- RECORDED DECISION 5: governed_columns is the DECLARED truth (and what the generated client
-- reads); the ENFORCEMENT is this trigger, because iam._guard_governance_columns returns
-- immediately unless current_user = 'authenticated' and every hr write is a definer call.
update platform.entity_types
set governed_columns = array['created_by','organization_id','deleted_at','note_kind','subject_token','subject_id']
where token = 'hr_restricted_note'
  and governed_columns is distinct from
      array['created_by','organization_id','deleted_at','note_kind','subject_token','subject_id'];

create or replace function hr._restricted_note_kind_immutable() returns trigger
language plpgsql
as $fn$
begin
  if NEW.note_kind is distinct from OLD.note_kind then
    raise exception 'hr.restricted_note.note_kind is immutable: reclassification is a delete-and-rewrite by the owner, audited as both'
      using errcode = '42501',
            detail = 'note_kind decides WHO may read this row (SPEC-ACCESS 3.1a). Allowing an UPDATE to weaken it would turn a merged table into a merged permission.',
            hint = 'Write a new note in the correct class and dispose of this one through the owner path.';
  end if;
  if NEW.subject_token is distinct from OLD.subject_token or NEW.subject_id is distinct from OLD.subject_id then
    raise exception 'hr.restricted_note subject is immutable' using errcode = '42501';
  end if;
  return NEW;
end
$fn$;

drop trigger if exists _zz_note_kind_immutable on hr.restricted_note;
create trigger _zz_note_kind_immutable before update on hr.restricted_note
  for each row execute function hr._restricted_note_kind_immutable();

-- ============================================================ DDL guard acknowledgement
-- Log-driven, not list-driven (the shape tranche 2 established after a hand-maintained list missed
-- an object): scoped to the ONE rule, so a genuinely new finding under any other rule still fails.
do $$
declare r record;
begin
  for r in select distinct object_ref from platform.ddl_guard_log
            where acknowledged_at is null and object_ref like 'hr.%'
              and rule = 'org_not_null_no_backstop' loop
    perform platform.ddl_guard_ack(
      p_reason => 'HR is org-explicit by the 2026-08-21 NO-NULL-ORG ruling; no assignment trigger by design (SPEC-DATA-MODEL 1.3)',
      p_by     => 'hr-domain-migration hr_c3_01',
      p_rule   => 'org_not_null_no_backstop',
      p_object_ref => r.object_ref);
  end loop;
end $$;

-- ============================================================ assertions
do $$
declare r record; v_bad integer; v_n integer;
begin
  for r in select unnest(ARRAY['access_role','role_assignment','approval_authority',
                               'approval_delegation','derived_grant','field_policy']) as t loop
    select count(*) into v_bad from iam.verify_canonical('hr', r.t, 'hr_' || r.t) where status in ('FAIL','WARN');
    if v_bad > 0 then
      raise exception 'hr_c3_01: hr.% has % FAIL/WARN conformance rows', r.t, v_bad;
    end if;
    if not iam.canonical_certify_ok('hr', r.t, 'hr_' || r.t) then
      raise exception 'hr_c3_01: hr.% does not certify', r.t;
    end if;
    if not exists (select 1 from pg_trigger tg join pg_class c on c.oid = tg.tgrelid
                     join pg_namespace n on n.oid = c.relnamespace
                    where n.nspname = 'hr' and c.relname = r.t and tg.tgname = '_zz_guard_hr_write') then
      raise exception 'hr_c3_01: hr.% is missing _zz_guard_hr_write', r.t;
    end if;
    if (select taxonomy_node_id from platform.entity_types where token = 'hr_' || r.t) is null then
      raise exception 'hr_c3_01: hr_% has no taxonomy_node_id', r.t;
    end if;
  end loop;

  -- §1.3a: the count is settled at 26 and other specs cite it rather than recounting
  select count(*) into v_n from platform.categories
   where dimension = 'hr_approval_action' and deleted_at is null
     and organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'::uuid;
  if v_n <> 26 then
    raise exception 'hr_c3_01: hr_approval_action holds % tokens, not the settled 26', v_n;
  end if;

  -- every action carries the per-action properties RECORDED DECISION 2 moved onto it
  select count(*) into v_n from platform.categories
   where dimension = 'hr_approval_action' and deleted_at is null
     and organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'::uuid
     and (metadata ->> 'sole_authority_mode') is null;
  if v_n > 0 then
    raise exception 'hr_c3_01: % approval actions carry no sole_authority_mode', v_n;
  end if;

  -- §1.4: the separation of duties, asserted rather than trusted
  if exists (select 1 from hr.access_role
              where role_key <> 'hr_owner' and deleted_at is null
                and capabilities @> array['comp.read'] and capabilities @> array['medical.read']) then
    raise exception 'hr_c3_01: a non-owner builtin holds both comp.read and medical.read';
  end if;
  if exists (select 1 from hr.access_role
              where role_key = 'employee_relations' and deleted_at is null
                and (capabilities @> array['comp.read'] or capabilities @> array['medical.read'])) then
    raise exception 'hr_c3_01: employee_relations must hold neither comp.read nor medical.read';
  end if;
  if exists (select 1 from hr.access_role
              where role_key = 'leave_administrator' and deleted_at is null
                and capabilities @> array['comp.read']) then
    raise exception 'hr_c3_01: leave_administrator must not hold comp.read';
  end if;
  if exists (select 1 from hr.access_role
              where role_key in ('manager','employee') and is_assignable and deleted_at is null) then
    raise exception 'hr_c3_01: manager/employee are DERIVED and must never be assignable';
  end if;

  -- §8: a field needing approval must name the approval
  if exists (select 1 from hr.field_policy
              where policy = 'self_request_approval' and approver_action_type is null
                and deleted_at is null) then
    raise exception 'hr_c3_01: a self_request_approval field routes nowhere';
  end if;
  if not exists (select 1 from hr.field_policy
                  where target_token = 'hr_employee_private' and column_name = 'home_address'
                    and policy = 'self_request_approval' and deleted_at is null) then
    raise exception 'hr_c3_01: home_address must be self_request_approval (AR 1.4 / AR2 LOCK 4)';
  end if;

  select count(*) into v_bad from platform.ddl_guard_log
   where acknowledged_at is null and object_ref like 'hr.%';
  if v_bad > 0 then
    raise exception 'hr_c3_01: % unacked hr.%% DDL guard rows remain', v_bad;
  end if;
end $$;
