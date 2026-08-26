-- HR domain, migration 13 of 16 (register item HRB-006, core tranche 4 — the closing tranche).
--
-- Governance: the five remaining §14 tables (hr.record_class and hr.retention_rule landed in
-- file 02), the retention/legal-hold/audit machinery, hr.v_access_audit, and one
-- platform.retention_policy row per HR token with mode='never'.
--
-- Authority: SPEC-DATA-MODEL §§14.3–14.7, §15, §15.1, §17.7, §18.1 file 13, §18.1a, §18.5 query E.
--
-- 🚨 WHY THIS FILE IS LAST: it references every token. The retention resolver, the legal-hold
-- counter and the disposition sweep all walk platform.entity_types, so they cannot be written
-- until every HR table exists.
--
-- 🚨 RULING R3 (coordinator, 2026-08-25): ONE audit table, RPC-only. An earlier draft had an
-- org-readable `ledger` AND a second owner-only audit concept — two tables with opposite access
-- postures recording the same class of event, which is the worst possible outcome: whichever one
-- a reader consults they get a partial answer and cannot tell. Merged into hr.access_audit,
-- `restricted`, with `is_self_access` (or every dashboard drowns in self-reads and the real ones
-- stop being visible) and `basis` (what the system ACTUALLY accepted, as against `purpose`, what
-- the caller SAID they wanted — a log with only `purpose` cannot answer "should this have been
-- permitted?").
--
-- Idempotent. Applied live as migration `hr_13_governance`.
--
-- ===================================================================================
-- RECORDED TECHNICAL DECISIONS (EXECUTION §8)
--
-- 1. hr_legal_hold AND hr_access_audit take p_soft_delete => true against §14.3/§14.6's `false`.
--    Both are non-component, non-ledger `entity` variants and iam.verify_canonical's soft_delete
--    check WARNs on that shape with no deleted_at; a single WARN makes canonical_certify_ok
--    FALSE. Fifth and sixth applications of the same positive-add precedent (tranche 1's
--    record_class, tranche 2's employment_pin/kiosk_session, tranche 3's eeo_response/ai_evidence/
--    i9). Nothing writes deleted_at on either: a hold is released via `released_on` + `state`, and
--    an audit row is never removed at all — its retention policy is mode='never'.
--    OWED SPEC CORRECTION: the soft-delete line on §14.3 and §14.6.
--
-- 2. hr.access_audit NULLS created_by IN A TRIGGER, not in an UPDATE after the insert. §14.6 says
--    the writer "sets created_by to NULL after the actor stamp", which closes the `restricted`
--    variant's owner lane so no authenticated user holds a client-direct read on any row. Doing
--    it as a BEFORE INSERT trigger named `_zz_null_created_by` is what makes the ordering
--    reliable: Postgres fires row triggers in NAME order, so `_stamp_actor` → `_touch_row` →
--    `_zz_guard_hr_write` → `_zz_null_created_by`, and the stamp is overwritten every time
--    without a second statement that could be skipped by a future writer.
--    (iam.verify_canonical requires the actor pair to EXIST on a restricted table, not to be
--    non-null — so the nulling is canonical, not a violation.)
--
-- 3. THE FUNCTION SUITE SPLITS THREE WAYS, and the split is the honest one:
--    BUILT AND OPERATIVE — hr._sync_legal_hold_count, hr._block_delete_on_hold,
--      hr._record_access_audit, hr.retention_due_on, hr.stamp_retention_triggers,
--      hr.dispose_records, hr.transfer_restricted_note, hr.alert_recipients,
--      hr.access_audit_page + hr.v_access_audit. Every one of these is fully determined by the
--      spec and by data that exists.
--    BUILT AND FAIL-CLOSED — hr.read_confidential and hr.reveal_ssn. §1.4 makes
--      read_confidential THE read path for every CONF table, so the door must exist and its
--      signature must be frozen now; but the gate it has to apply is SPEC-ACCESS's DERIVED HR
--      ROLE GRANT, and HRB-007 has not built hr.access_role / hr.derived_grant. A door with no
--      lock is worse than no door, so both write a `granted = false` audit row (which §14.6
--      explicitly requires on denial — "a refused break-glass attempt is exactly the event a
--      compliance officer wants to see") and then RAISE a named error pointing at HRB-007.
--      hr.reveal_ssn additionally needs the aidream-held pgcrypto envelope key (AR 1.18), which
--      is not a database concern at all.
--    NOT BUILT — hr.export_personnel_file (named in §14.6's prose but not in §18.1's file-13
--      contents) and hr.apply_legal_hold (named in §14.3's prose, likewise absent from the file
--      plan). This lane has held to the file plan throughout; both are recorded on the register.
--
-- 4. hr.retention_due_on IS FAIL-CLOSED ON UNRESOLVABLE RULES. `retention_expression` is a
--    compound-rule string (§14.2: I-9's `max(hire_date + 36 months, termination_date + 12
--    months)`) and no expression evaluator exists in this schema or any spec. Where an applicable
--    rule carries one, the function returns NULL rather than guessing — and NULL means NOT
--    DISPOSABLE, so the failure mode is "we kept it too long", never "we destroyed it early".
--    hr.retention_rule holds 0 rows today (HRB-009's JUR-SEED work), so every record is currently
--    non-disposable, which is the correct posture for a system with no seeded legal periods.
--
-- 5. hr.eeo_aggregate NOW WRITES ITS AUDIT ROW. Tranche 3 built the function and recorded the
--    obligation as owed to this file (§11.6's audited-aggregate posture, the same one
--    hr.blended_labor_rate carries in §4.6). It is discharged below by CREATE OR REPLACE:
--    action='bulk_read', basis='eeo_aggregate', the scope in request_ref. It still fail-closes on
--    its file-14 knob — and now records the refusal too.
-- ===================================================================================

set local lock_timeout = '20s';

-- ============================================================ 14.3 hr.legal_hold  (CONF)
-- `scope_selector` is the DECLARATIVE match that hr.apply_legal_hold(hold_id) expands into
-- hr.legal_hold_item rows. 🚨 Expansion is MATERIALISED, not evaluated at disposition time, so a
-- hold cannot silently un-cover a record because a selector's meaning drifted.
do $$ begin
  if to_regclass('hr.legal_hold') is null then
    perform platform.create_entity_table(
      p_schema => 'hr', p_table => 'legal_hold', p_token => 'hr_legal_hold', p_label => 'Legal hold',
      p_fields => ARRAY[
        'matter_name text NOT NULL',
        'matter_ref text',
        $f$hold_kind text NOT NULL CHECK (hold_kind IN ('litigation','investigation','agency_charge','audit','preservation_letter'))$f$,
        'issued_by text NOT NULL',
        'custodian_employment_id uuid REFERENCES hr.employment(id)',
        'counsel_contact text',
        'scope_description text NOT NULL',
        $f$scope_selector jsonb NOT NULL DEFAULT '{}'::jsonb$f$,
        'opened_on date NOT NULL',
        'released_on date',
        'release_authorised_by text',
        'release_note text',
        $f$state text NOT NULL DEFAULT 'active' CHECK (state IN ('active','released','expired'))$f$,
        'notice_sent_at timestamptz',
        $f$notice_evidence jsonb NOT NULL DEFAULT '{}'::jsonb$f$
      ],
      -- p_soft_delete => true against §14.3's `false`: RECORDED DECISION 1.
      p_variant => 'entity', p_versioned => true, p_soft_delete => true, p_visibility => 'personal',
      p_category => false, p_listed => false, p_org_default => false, p_gin_jsonb => false,
      p_parents => null);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'legal_hold_release_reasoned') then
    alter table hr.legal_hold add constraint legal_hold_release_reasoned
      check (state <> 'released' or (released_on is not null and release_authorised_by is not null));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'legal_hold_dates_ordered') then
    alter table hr.legal_hold add constraint legal_hold_dates_ordered
      check (released_on is null or released_on >= opened_on);
  end if;
end $$;

create index if not exists legal_hold_active_idx on hr.legal_hold (organization_id, state, opened_on desc)
  where deleted_at is null;

update platform.entity_types set
  title_column = 'matter_name',
  taxonomy_node_id = '394893a0-be07-4b4a-9b50-3a0cd984bc80'
where token = 'hr_legal_hold';

do $$ begin
  if (select rls_variant from platform.entity_types where token = 'hr_legal_hold') is distinct from 'restricted' then
    update platform.entity_types set rls_variant = 'restricted' where token = 'hr_legal_hold';
    perform iam.apply_rls('hr','legal_hold','hr_legal_hold','restricted');
  end if;
end $$;

-- ============================================================ 14.4 hr.legal_hold_item  (COMP)
do $$ begin
  if to_regclass('hr.legal_hold_item') is null then
    perform platform.create_entity_table(
      p_schema => 'hr', p_table => 'legal_hold_item', p_token => 'hr_legal_hold_item',
      p_label => 'Legal hold item',
      p_fields => ARRAY[
        'legal_hold_id uuid NOT NULL REFERENCES hr.legal_hold(id)',
        'subject_token text NOT NULL',
        'subject_id uuid NOT NULL',
        'record_class_key text REFERENCES hr.record_class(class_key)',
        'applied_at timestamptz NOT NULL DEFAULT now()',
        'released_at timestamptz',
        'release_reason text'
      ],
      p_variant => 'component', p_versioned => false, p_soft_delete => false, p_visibility => 'none',
      p_category => false, p_listed => false, p_org_default => false, p_gin_jsonb => false,
      p_parents => ARRAY['hr_legal_hold:legal_hold_id']);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'legal_hold_item_unique') then
    alter table hr.legal_hold_item add constraint legal_hold_item_unique
      unique (legal_hold_id, subject_token, subject_id);
  end if;
end $$;

create index if not exists legal_hold_item_subject_idx on hr.legal_hold_item (subject_token, subject_id)
  where released_at is null;

update platform.entity_types set taxonomy_node_id = '394893a0-be07-4b4a-9b50-3a0cd984bc80'
where token = 'hr_legal_hold_item';

-- ============================================================ 14.7 hr.alert_routing_rule  (DIR, D24g)
-- D24(g): principal-governed alert routing. A TABLE rather than a knob for the same reason as
-- §7.13: routing is a RULE SET scoped several ways at once, and the four-rung knob ladder
-- resolves exactly one value per rung.
-- 🚨 IT ROUTES; IT DOES NOT DECIDE WHETHER AN ALERT EXISTS. Whether an event fires is the
-- emitting engine's deterministic business (and the hr.* knobs); this table only answers TO WHOM.
-- recipient_role_keys names SPEC-ACCESS role keys, never user ids, so a reorg re-routes alerts
-- without anyone editing a rule. recipient_employment_ids is the deliberate escape hatch for
-- "the owner personally", and it is the only place a person is named.
do $$ begin
  if to_regclass('hr.alert_routing_rule') is null then
    perform platform.create_entity_table(
      p_schema => 'hr', p_table => 'alert_routing_rule', p_token => 'hr_alert_routing_rule',
      p_label => 'Alert routing rule',
      p_fields => ARRAY[
        'name text',
        $f$alert_family text NOT NULL CHECK (alert_family IN ('overtime','attendance','schedule','leave','compliance','credential_expiry','i9','training','hiring','offboarding','incident','approval','system'))$f$,
        'event_key text',
        $f$alert_tier text NOT NULL DEFAULT 'warn' CHECK (alert_tier IN ('info','warn','urgent','critical'))$f$,
        $f$scope_kind text NOT NULL DEFAULT 'organization' CHECK (scope_kind IN ('organization','location','department','crew','pay_group'))$f$,
        'scope_id uuid',
        $f$recipient_role_keys text[] NOT NULL DEFAULT '{}'$f$,
        $f$recipient_employment_ids uuid[] NOT NULL DEFAULT '{}'$f$,
        'include_line_manager boolean NOT NULL DEFAULT true',
        'escalate_after_minutes integer',
        $f$escalate_to_role_keys text[] NOT NULL DEFAULT '{}'$f$,
        $f$channels text[] NOT NULL DEFAULT '{in_app,email}'$f$,
        $f$quiet_hours jsonb NOT NULL DEFAULT '{}'::jsonb$f$,
        'is_active boolean NOT NULL DEFAULT true',
        'set_by_employment_id uuid REFERENCES hr.employment(id)'
      ],
      p_variant => 'entity', p_versioned => true, p_soft_delete => true, p_visibility => 'personal',
      p_category => false, p_listed => false, p_org_default => false, p_gin_jsonb => false,
      p_parents => null);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'alert_routing_rule_scoped') then
    alter table hr.alert_routing_rule add constraint alert_routing_rule_scoped
      check (scope_kind = 'organization' or scope_id is not null);
  end if;
end $$;

-- unique on the coalesce expressions, per §14.7
create unique index if not exists alert_routing_rule_unique
  on hr.alert_routing_rule (organization_id, alert_family, coalesce(event_key,''), scope_kind,
                            coalesce(scope_id, organization_id));
create index if not exists alert_routing_rule_family_idx
  on hr.alert_routing_rule (organization_id, alert_family) where is_active;

update platform.entity_types set
  title_column = 'name',
  taxonomy_node_id = '394893a0-be07-4b4a-9b50-3a0cd984bc80'
where token = 'hr_alert_routing_rule';

-- ============================================================ 14.5 hr.disposition_event  (LEDGER)
-- 🚨 WHY `ledger` IS RIGHT HERE. The ledger variant grants `authenticated` SELECT ONLY — writes
-- are impossible except through service_role or a SECURITY DEFINER function, which is exactly the
-- guarantee destruction evidence needs. Org-wide readability is correct and deliberate: A
-- DESTRUCTION LOG THE ORGANIZATION CANNOT INSPECT IS NOT EVIDENCE. row_digest is a SHA-256 of the
-- destroyed row, so the record's EXISTENCE AND INTEGRITY survive its content.
do $$ begin
  if to_regclass('hr.disposition_event') is null then
    perform platform.create_entity_table(
      p_schema => 'hr', p_table => 'disposition_event', p_token => 'hr_disposition_event',
      p_label => 'Disposition event',
      p_fields => ARRAY[
        'subject_token text NOT NULL',
        'subject_id uuid NOT NULL',
        'record_class_key text NOT NULL REFERENCES hr.record_class(class_key)',
        $f$disposition_kind text NOT NULL CHECK (disposition_kind IN ('purged','anonymised','archived','exported_and_purged'))$f$,
        'retention_rule_id uuid REFERENCES hr.retention_rule(id)',
        'retention_expression_evaluated text',
        'trigger_event_at timestamptz',
        'eligible_on date NOT NULL',
        'occurred_at timestamptz NOT NULL DEFAULT now()',
        'approved_by_employment_id uuid REFERENCES hr.employment(id)',
        'approval_ref text',
        'row_digest text NOT NULL',
        $f$row_summary jsonb NOT NULL DEFAULT '{}'::jsonb$f$,
        'archive_ref text',
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
      p_variant => 'ledger', p_versioned => false, p_soft_delete => false, p_visibility => 'none',
      p_category => false, p_listed => false, p_org_default => false, p_gin_jsonb => false,
      p_parents => null);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'disposition_event_actor_identified') then
    alter table hr.disposition_event add constraint disposition_event_actor_identified check (
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

drop trigger if exists _zz_disposition_event_no_delete on hr.disposition_event;
create trigger _zz_disposition_event_no_delete before delete on hr.disposition_event
  for each row execute function hr._reject_delete();

create index if not exists disposition_event_subject_idx on hr.disposition_event (subject_token, subject_id);
create index if not exists disposition_event_class_idx
  on hr.disposition_event (organization_id, record_class_key, occurred_at desc);

update platform.entity_types set taxonomy_node_id = '394893a0-be07-4b4a-9b50-3a0cd984bc80'
where token = 'hr_disposition_event';

-- ============================================================ 14.6 hr.access_audit  (RESTRICTED, RPC-ONLY)
-- 🚨 WHY RPC-ONLY, AND HOW IT IS ENFORCED. AR 1.18's collision: the workspace's data-path law is
-- that clients read Supabase directly, and a supabase-js SELECT produces no application audit row
-- — RLS controls WHETHER a read happens, never records THAT it happened. The structural answer is
-- that every CONF table is `restricted`, so client-direct reads return nothing, and
-- hr.read_confidential / hr.reveal_ssn are the only doors. Each writes a row here BEFORE
-- returning data, INCLUDING ON DENIAL (granted = false).
do $$ begin
  if to_regclass('hr.access_audit') is null then
    perform platform.create_entity_table(
      p_schema => 'hr', p_table => 'access_audit', p_token => 'hr_access_audit',
      p_label => 'Access audit',
      p_fields => ARRAY[
        $f$action text NOT NULL CHECK (action IN ('read','list','export','reveal_field','bulk_read','print','denied'))$f$,
        'target_token text NOT NULL',
        $f$target_ids uuid[] NOT NULL DEFAULT '{}'$f$,
        'row_count integer',
        'subject_employment_id uuid REFERENCES hr.employment(id)',
        'record_class_key text REFERENCES hr.record_class(class_key)',
        $f$sensitivity_tier text NOT NULL CHECK (sensitivity_tier IN ('confidential','restricted'))$f$,
        'field_key text',
        'purpose text NOT NULL',
        'basis text NOT NULL',
        'is_self_access boolean NOT NULL DEFAULT false',
        $f$request_context jsonb NOT NULL DEFAULT '{}'::jsonb$f$,
        'justification text',
        'is_break_glass boolean NOT NULL DEFAULT false',
        'granted boolean NOT NULL',
        'denial_reason text',
        'access_role_key text',
        'request_ref text',
        'occurred_at timestamptz NOT NULL DEFAULT now()',
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
      -- p_soft_delete => true against §14.6's `false`: RECORDED DECISION 1.
      p_variant => 'entity', p_versioned => false, p_soft_delete => true, p_visibility => 'personal',
      p_category => false, p_listed => false, p_org_default => false, p_gin_jsonb => false,
      p_parents => null);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'access_audit_break_glass_justified') then
    alter table hr.access_audit add constraint access_audit_break_glass_justified
      check (not is_break_glass or (justification is not null and length(justification) >= 20));
  end if;
  -- a self-read cannot claim a role basis
  if not exists (select 1 from pg_constraint where conname = 'access_audit_self_basis') then
    alter table hr.access_audit add constraint access_audit_self_basis
      check (not is_self_access or basis = 'self');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'access_audit_denied_not_granted') then
    alter table hr.access_audit add constraint access_audit_denied_not_granted
      check (action <> 'denied' or granted = false);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'access_audit_actor_identified') then
    alter table hr.access_audit add constraint access_audit_actor_identified check (
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

-- §14.6's index set. The GIN on target_ids is what makes "who read employee X's record"
-- answerable ACROSS LIST CALLS -- a single-id shape could not express a list read at all.
create index if not exists access_audit_non_self_idx on hr.access_audit (organization_id, occurred_at desc)
  where not is_self_access;
create index if not exists access_audit_target_idx on hr.access_audit (target_token, occurred_at desc);
create index if not exists access_audit_actor_idx on hr.access_audit (actor_user_id, occurred_at desc);
create index if not exists access_audit_break_glass_idx on hr.access_audit (organization_id, occurred_at desc)
  where is_break_glass;
create index if not exists access_audit_target_ids_gin on hr.access_audit using gin (target_ids);

-- §18.1a: access evidence.
update platform.entity_types set
  suppress_platform_admin_lane = true,
  taxonomy_node_id = '394893a0-be07-4b4a-9b50-3a0cd984bc80'
where token = 'hr_access_audit';

do $$ begin
  update platform.entity_types set rls_variant = 'restricted'
   where token = 'hr_access_audit' and rls_variant is distinct from 'restricted';
  perform iam.apply_rls('hr','access_audit','hr_access_audit','restricted');
end $$;

-- 🚨 RECORDED DECISION 2: close the `restricted` owner lane by nulling created_by, in a trigger
-- whose NAME guarantees it runs after _stamp_actor. The actor is preserved in the {{ACTOR}}
-- block, where it belongs.
create or replace function hr._null_created_by() returns trigger
language plpgsql as $fn$
begin
  new.created_by := null;
  return new;
end
$fn$;

comment on function hr._null_created_by() is
  'SPEC-DATA-MODEL 14.6: hr.access_audit has no owner lane. Nulling created_by after _stamp_actor means no authenticated user holds a client-direct read on any audit row; the actor lives in the {{ACTOR}} block. iam.verify_canonical requires the actor pair to EXIST, not to be non-null.';

drop trigger if exists _zz_null_created_by on hr.access_audit;
create trigger _zz_null_created_by before insert on hr.access_audit
  for each row execute function hr._null_created_by();

-- ============================================================ the audit writer
create or replace function hr._record_access_audit(
  p_organization_id       uuid,
  p_action                text,
  p_target_token          text,
  p_purpose               text,
  p_basis                 text,
  p_granted               boolean,
  p_target_ids            uuid[]  default '{}',
  p_row_count             integer default null,
  p_subject_employment_id uuid    default null,
  p_record_class_key      text    default null,
  p_sensitivity_tier      text    default 'confidential',
  p_field_key             text    default null,
  p_is_self_access        boolean default false,
  p_request_context       jsonb   default '{}'::jsonb,
  p_justification         text    default null,
  p_is_break_glass        boolean default false,
  p_denial_reason         text    default null,
  p_access_role_key       text    default null,
  p_request_ref           text    default null,
  p_actor_type            text    default null,
  p_actor_employment_id   uuid    default null)
returns uuid
language plpgsql security definer set search_path = hr, public
as $fn$
declare
  v_id    uuid;
  v_uid   uuid := auth.uid();
  v_actor text;
begin
  v_actor := coalesce(p_actor_type, case when v_uid is null then 'automation' else 'hr_admin' end);

  -- the writer is the privileged path by construction (SPEC-ACCESS law 2)
  perform set_config('hr.privileged_write', 'on', true);

  insert into hr.access_audit (
    organization_id, action, target_token, target_ids, row_count, subject_employment_id,
    record_class_key, sensitivity_tier, field_key, purpose, basis, is_self_access,
    request_context, justification, is_break_glass, granted, denial_reason, access_role_key,
    request_ref, actor_type, actor_employment_id, actor_user_id)
  values (
    p_organization_id, p_action, p_target_token, coalesce(p_target_ids,'{}'), p_row_count,
    p_subject_employment_id, p_record_class_key, p_sensitivity_tier, p_field_key, p_purpose,
    p_basis, p_is_self_access, coalesce(p_request_context,'{}'::jsonb), p_justification,
    p_is_break_glass, p_granted, p_denial_reason, p_access_role_key, p_request_ref,
    v_actor, p_actor_employment_id, v_uid)
  returning id into v_id;

  return v_id;
end
$fn$;

comment on function hr._record_access_audit is
  'The ONE writer of hr.access_audit (SPEC-DATA-MODEL 14.6). Every confidential read path calls it BEFORE returning data, and on denial too — a refused break-glass attempt is exactly the event a compliance officer wants to see.';

revoke all on function hr._record_access_audit from public;
grant execute on function hr._record_access_audit to service_role;

-- ============================================================ 14.4 the legal-hold counter
-- Maintains {{RETAIN}}.legal_hold_count on the held row, so disposition NEVER NEEDS A JOIN.
-- SECURITY DEFINER and dynamic: the held row can be in any HR table, and the hold's author does
-- not necessarily hold an editor grant on it.
create or replace function hr._sync_legal_hold_count() returns trigger
language plpgsql security definer set search_path = hr, public
as $fn$
declare
  v_schema text; v_table text; v_delta integer; v_token text; v_id uuid;
begin
  if tg_op = 'DELETE' then
    v_token := old.subject_token; v_id := old.subject_id;
    v_delta := case when old.released_at is null then -1 else 0 end;
  elsif tg_op = 'INSERT' then
    v_token := new.subject_token; v_id := new.subject_id;
    v_delta := case when new.released_at is null then 1 else 0 end;
  else
    v_token := new.subject_token; v_id := new.subject_id;
    v_delta := case
                 when old.released_at is null and new.released_at is not null then -1
                 when old.released_at is not null and new.released_at is null then 1
                 else 0
               end;
  end if;

  if v_delta = 0 then return null; end if;

  select e.schema_name, e.table_name into v_schema, v_table
    from platform.entity_types e where e.token = v_token;
  if v_schema is null then return null; end if;

  -- only tables that actually carry the {{RETAIN}} counter
  if not exists (select 1 from information_schema.columns
                  where table_schema = v_schema and table_name = v_table
                    and column_name = 'legal_hold_count') then
    return null;
  end if;

  perform set_config('hr.privileged_write', 'on', true);
  execute format(
    'update %I.%I set legal_hold_count = greatest(0, legal_hold_count + $1) where id = $2',
    v_schema, v_table) using v_delta, v_id;
  return null;
end
$fn$;

comment on function hr._sync_legal_hold_count() is
  'SPEC-DATA-MODEL 14.4: keeps {{RETAIN}}.legal_hold_count true on the held row so hr.dispose_records never has to join. A row with legal_hold_count > 0 can never be disposed.';

drop trigger if exists _hold_count_sync on hr.legal_hold_item;
create trigger _hold_count_sync
  after insert or delete or update of released_at on hr.legal_hold_item
  for each row execute function hr._sync_legal_hold_count();

-- ============================================================ 14.4 the hard-delete wall
-- §14.4: "a `before delete` trigger on every hard-deletable HR table". A row under hold cannot be
-- destroyed by ANY path -- not the disposition sweep, not a stray delete, not an org offboarding
-- (bucket-2 item 19: a departing customer still carries I-9, FLSA and EEOC duties we must not
-- discharge for them).
create or replace function hr._block_delete_on_hold() returns trigger
language plpgsql as $fn$
begin
  if coalesce(old.legal_hold_count, 0) > 0 then
    raise exception
      '%.% row % is under % legal hold(s) and cannot be deleted; release the hold first',
      tg_table_schema, tg_table_name, old.id, old.legal_hold_count
      using errcode = 'P0001';
  end if;
  return old;
end
$fn$;

comment on function hr._block_delete_on_hold() is
  'SPEC-DATA-MODEL 14.4 / 15.1 mechanism 3: legal_hold_count > 0 blocks hard delete unconditionally, on every HR table that carries the {{RETAIN}} counter.';

do $$
declare r record;
begin
  for r in select c.relname
             from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'hr' and c.relkind = 'r'
              and exists (select 1 from information_schema.columns
                           where table_schema = 'hr' and table_name = c.relname
                             and column_name = 'legal_hold_count')
  loop
    if not exists (select 1 from pg_trigger tg join pg_class c2 on c2.oid = tg.tgrelid
                     join pg_namespace n2 on n2.oid = c2.relnamespace
                    where n2.nspname='hr' and c2.relname = r.relname
                      and tg.tgname = '_zz_hold_block_delete') then
      execute format(
        'create trigger _zz_hold_block_delete before delete on hr.%I for each row execute function hr._block_delete_on_hold()',
        r.relname);
    end if;
  end loop;
end $$;

-- ============================================================ 15.1 mechanism 2 — the retention resolver
-- 🚨 THERE IS NO PER-ROW RETENTION-CLOCK TABLE. The clock is a function of (class, trigger date,
-- jurisdiction), and materialising it per row would go stale the moment a rule was corrected.
-- Rejected: hr.retention_clock as a table, for exactly that reason (§15.1).
--
-- FAIL-CLOSED (RECORDED DECISION 4): NULL means NOT DISPOSABLE. Returned when the record has no
-- trigger stamp, when no rule applies, or when an applicable rule carries a
-- `retention_expression` this build cannot evaluate. hr.retention_rule holds 0 rows until
-- HRB-009's JUR-SEED lands, so today every record is non-disposable — the correct posture for a
-- system with no seeded legal periods.
create or replace function hr.retention_due_on(p_token text, p_id uuid)
returns date
language plpgsql stable security definer set search_path = hr, public
as $fn$
declare
  v_schema text; v_table text;
  v_class  text; v_trigger timestamptz;
  v_has_expression boolean;
  v_due date;
begin
  select e.schema_name, e.table_name into v_schema, v_table
    from platform.entity_types e where e.token = p_token;
  if v_schema is null then return null; end if;

  if not exists (select 1 from information_schema.columns
                  where table_schema=v_schema and table_name=v_table
                    and column_name='record_class_key') then
    return null;                      -- not a retention-governed table
  end if;

  execute format('select record_class_key, retention_trigger_at from %I.%I where id = $1',
                 v_schema, v_table)
     into v_class, v_trigger using p_id;
  if v_class is null or v_trigger is null then
    return null;                      -- the clock has not started
  end if;

  -- an applicable rule we cannot evaluate makes the whole record non-disposable
  select exists (
    select 1 from hr.retention_rule r
     where r.class_key = v_class and r.deleted_at is null
       and r.retention_expression is not null
       and r.effective_from <= v_trigger::date
       and (r.effective_to is null or r.effective_to > v_trigger::date))
    into v_has_expression;
  if v_has_expression then return null; end if;

  -- minimum_wins: the LONGEST applicable rule governs
  select max((v_trigger::date + (r.retention_months || ' months')::interval)::date)
    into v_due
    from hr.retention_rule r
   where r.class_key = v_class and r.deleted_at is null
     and r.retention_months is not null
     and r.effective_from <= v_trigger::date
     and (r.effective_to is null or r.effective_to > v_trigger::date);

  return v_due;
end
$fn$;

comment on function hr.retention_due_on(text, uuid) is
  'SPEC-DATA-MODEL 15.1 mechanism 2. Resolves (class, trigger date) against hr.retention_rule and returns the LATEST applicable due date (minimum_wins). NULL means NOT DISPOSABLE — returned when the clock has not started, no rule applies, or an applicable rule carries a retention_expression this build cannot evaluate. Fails toward keeping records, never toward destroying them.';

-- ============================================================ 15.1 mechanism 1 — the trigger stamper
-- §15.1: "A termination writes it across every termination_date-triggered row for that employment
-- in one transaction."
create or replace function hr.stamp_retention_triggers(p_employment_id uuid)
returns integer
language plpgsql security definer set search_path = hr, public
as $fn$
declare
  r record; v_term timestamptz; v_total integer := 0; v_n integer;
begin
  select e.termination_date::timestamptz into v_term from hr.employment e where e.id = p_employment_id;
  if v_term is null then
    raise exception 'hr.stamp_retention_triggers: employment % has no termination_date', p_employment_id
      using errcode = 'P0001';
  end if;

  perform set_config('hr.privileged_write', 'on', true);

  for r in
    select e.schema_name, e.table_name
      from platform.entity_types e
     where e.schema_name = 'hr'
       and exists (select 1 from information_schema.columns c
                    where c.table_schema=e.schema_name and c.table_name=e.table_name
                      and c.column_name='retention_trigger_at')
       and exists (select 1 from information_schema.columns c
                    where c.table_schema=e.schema_name and c.table_name=e.table_name
                      and c.column_name='employment_id')
  loop
    execute format(
      'update %I.%I t set retention_trigger_at = $1
        where t.employment_id = $2 and t.retention_trigger_at is null
          and exists (select 1 from hr.record_class rc
                       where rc.class_key = t.record_class_key
                         and rc.trigger_event = ''termination_date'')',
      r.schema_name, r.table_name) using v_term, p_employment_id;
    get diagnostics v_n = row_count;
    v_total := v_total + v_n;
  end loop;

  -- hr.employment itself is keyed by id, not employment_id
  update hr.employment t set retention_trigger_at = v_term
   where t.id = p_employment_id and t.retention_trigger_at is null
     and exists (select 1 from hr.record_class rc
                  where rc.class_key = t.record_class_key and rc.trigger_event = 'termination_date');
  get diagnostics v_n = row_count;
  v_total := v_total + v_n;

  return v_total;
end
$fn$;

comment on function hr.stamp_retention_triggers(uuid) is
  'SPEC-DATA-MODEL 15.1 mechanism 1. Stamps retention_trigger_at across every termination_date-triggered row for one employment, in one transaction. NOTE: employee-level tables (hr_employee, hr_employee_private) are NOT stamped here — a person may hold several spells and the clock is per-person, not per-spell; that stamp belongs to the offboarding flow when the LAST spell closes. Recorded on the HRB-006 register.';

-- ============================================================ 15.1 mechanism 4 — disposition
-- 🚨 p_dry_run DEFAULTS TRUE. §15.1: "the live sweep is an explicit, approved operation and is
-- never scheduled without an owner ruling." Selects eligible rows, RE-CHECKS HOLDS, writes
-- hr.disposition_event with the row digest, then destroys.
create or replace function hr.dispose_records(
  p_class_key text,
  p_as_of     date default current_date,
  p_dry_run   boolean default true)
returns table(subject_token text, subject_id uuid, eligible_on date, disposed boolean)
language plpgsql security definer set search_path = hr, public
as $fn$
declare
  r record; t record; v_due date; v_digest text; v_row jsonb; v_org uuid; v_hold integer;
begin
  if not exists (select 1 from hr.record_class where class_key = p_class_key) then
    raise exception 'hr.dispose_records: unknown record class %', p_class_key using errcode = '22023';
  end if;

  perform set_config('hr.privileged_write', 'on', true);

  -- 🚨 BOTH columns, not just record_class_key. hr.access_audit and hr.legal_hold_item carry a
  -- record_class_key REFERENCE without a {{RETAIN}} block, and an earlier form of this loop
  -- selected on record_class_key alone and then read legal_hold_count off them — proven live by
  -- a probe, which failed with `column "legal_hold_count" does not exist` on hr.access_audit.
  -- The {{RETAIN}}-bearing set IS the retention-governed set: a table with no retention block is
  -- not something this sweep may destroy.
  for t in
    select e.token, e.schema_name, e.table_name
      from platform.entity_types e
     where e.schema_name = 'hr'
       and exists (select 1 from information_schema.columns c
                    where c.table_schema=e.schema_name and c.table_name=e.table_name
                      and c.column_name='record_class_key')
       and exists (select 1 from information_schema.columns c
                    where c.table_schema=e.schema_name and c.table_name=e.table_name
                      and c.column_name='legal_hold_count')
       and exists (select 1 from information_schema.columns c
                    where c.table_schema=e.schema_name and c.table_name=e.table_name
                      and c.column_name='retention_trigger_at')
  loop
    for r in execute format(
      'select id, organization_id, legal_hold_count, to_jsonb(x) as row_json from %I.%I x
        where x.record_class_key = $1', t.schema_name, t.table_name) using p_class_key
    loop
      v_due := hr.retention_due_on(t.token, r.id);
      -- NULL due date = not disposable (RECORDED DECISION 4)
      if v_due is null or v_due > p_as_of then continue; end if;
      -- re-check the hold at disposition time, never trust the counter alone
      select count(*) into v_hold from hr.legal_hold_item li
       where li.subject_token = t.token and li.subject_id = r.id and li.released_at is null;
      if coalesce(r.legal_hold_count,0) > 0 or v_hold > 0 then continue; end if;

      subject_token := t.token; subject_id := r.id; eligible_on := v_due; disposed := false;

      if not p_dry_run then
        v_row    := r.row_json;
        v_digest := encode(extensions.digest(v_row::text, 'sha256'), 'hex');
        v_org    := r.organization_id;

        insert into hr.disposition_event (
          organization_id, subject_token, subject_id, record_class_key, disposition_kind,
          eligible_on, row_digest, row_summary, actor_type)
        values (v_org, t.token, r.id, p_class_key, 'purged', v_due, v_digest,
                jsonb_build_object('table', t.schema_name||'.'||t.table_name), 'automation');

        execute format('delete from %I.%I where id = $1', t.schema_name, t.table_name) using r.id;
        disposed := true;
      end if;

      return next;
    end loop;
  end loop;
end
$fn$;

comment on function hr.dispose_records(text, date, boolean) is
  'SPEC-DATA-MODEL 15.1 mechanism 4. p_dry_run DEFAULTS TRUE — the live sweep is an explicit, approved operation and is never scheduled without an owner ruling. Re-checks legal holds at disposition time rather than trusting the cached counter, and writes hr.disposition_event with a SHA-256 row digest BEFORE destroying anything.';

revoke all on function hr.dispose_records(text, date, boolean) from public;
grant execute on function hr.dispose_records(text, date, boolean) to service_role;

-- ============================================================ 10.3 restricted-note ownership transfer
-- §10.3: platform-super-admin or current-owner only, rewrites created_by (a governed column),
-- records transferred_from/transferred_at, and writes an hr.access_audit row.
create or replace function hr.transfer_restricted_note(p_id uuid, p_new_owner uuid)
returns hr.restricted_note
language plpgsql security definer set search_path = hr, public
as $fn$
declare v_note hr.restricted_note; v_uid uuid := auth.uid();
begin
  select * into v_note from hr.restricted_note where id = p_id;
  if v_note.id is null then
    raise exception 'hr.transfer_restricted_note: note % not found', p_id using errcode = 'P0002';
  end if;

  if not (coalesce(public.is_super_admin(), false) or v_note.created_by = v_uid) then
    perform hr._record_access_audit(
      p_organization_id => v_note.organization_id, p_action => 'denied',
      p_target_token => 'hr_restricted_note', p_purpose => 'ownership transfer',
      p_basis => 'refused', p_granted => false, p_target_ids => ARRAY[p_id],
      p_sensitivity_tier => 'restricted',
      p_denial_reason => 'caller is neither the note owner nor a platform super-admin');
    raise exception 'hr.transfer_restricted_note: only the current owner or a platform super-admin may transfer a restricted note'
      using errcode = '42501';
  end if;

  perform set_config('hr.privileged_write', 'on', true);
  update hr.restricted_note
     set created_by = p_new_owner, transferred_from = v_note.created_by, transferred_at = now()
   where id = p_id
  returning * into v_note;

  perform hr._record_access_audit(
    p_organization_id => v_note.organization_id, p_action => 'read',
    p_target_token => 'hr_restricted_note', p_purpose => 'ownership transfer',
    p_basis => case when v_note.transferred_from = v_uid then 'owner' else 'platform_super_admin' end,
    p_granted => true, p_target_ids => ARRAY[p_id], p_sensitivity_tier => 'restricted');

  return v_note;
end
$fn$;

revoke all on function hr.transfer_restricted_note(uuid, uuid) from public;
grant execute on function hr.transfer_restricted_note(uuid, uuid) to authenticated, service_role;

-- ============================================================ 14.7 the routing resolver
-- Most-specific wins: an exact event_key beats the family wildcard, and a narrow scope beats
-- `organization`.
create or replace function hr.alert_recipients(
  p_organization_id uuid, p_alert_family text, p_event_key text default null,
  p_scope_kind text default 'organization', p_scope_id uuid default null,
  p_tier text default 'warn')
returns table(rule_id uuid, recipient_role_keys text[], recipient_employment_ids uuid[],
              include_line_manager boolean, channels text[], escalate_after_minutes integer,
              escalate_to_role_keys text[])
language sql stable as $fn$
  select r.id, r.recipient_role_keys, r.recipient_employment_ids, r.include_line_manager,
         r.channels, r.escalate_after_minutes, r.escalate_to_role_keys
    from hr.alert_routing_rule r
   where r.organization_id = p_organization_id
     and r.alert_family = p_alert_family
     and r.is_active and r.deleted_at is null
     and (r.event_key is null or r.event_key = p_event_key)
     and (r.scope_kind = 'organization'
          or (r.scope_kind = p_scope_kind and r.scope_id is not distinct from p_scope_id))
   order by (r.event_key is not null) desc, (r.scope_kind <> 'organization') desc
   limit 1
$fn$;

comment on function hr.alert_recipients is
  'SPEC-DATA-MODEL 14.7: answers TO WHOM, never whether an alert exists. Most-specific wins. An empty resolution is a defect the settings UI must surface, not silence — SPEC-NOTIFICATIONS owns the fallback to the org owner.';

-- ============================================================ 14.6 the confidential read doors
-- 🚨 BUILT AND FAIL-CLOSED (RECORDED DECISION 3). §1.4 makes hr.read_confidential THE read path
-- for every CONF table, so the door and its signature must exist now. The gate it has to apply is
-- SPEC-ACCESS's DERIVED HR ROLE GRANT, and HRB-007 has not built hr.access_role /
-- hr.derived_grant. A door with no lock is worse than no door: both functions write the denial
-- audit row §14.6 requires and then refuse.
create or replace function hr.read_confidential(p_token text, p_id uuid, p_purpose text,
                                                p_break_glass boolean default false,
                                                p_justification text default null)
returns jsonb
language plpgsql security definer set search_path = hr, public
as $fn$
declare v_schema text; v_table text; v_org uuid;
begin
  select e.schema_name, e.table_name into v_schema, v_table
    from platform.entity_types e where e.token = p_token;
  if v_schema is null then
    raise exception 'hr.read_confidential: unknown token %', p_token using errcode = '22023';
  end if;

  execute format('select organization_id from %I.%I where id = $1', v_schema, v_table)
     into v_org using p_id;

  perform hr._record_access_audit(
    p_organization_id => v_org, p_action => 'denied', p_target_token => p_token,
    p_purpose => coalesce(p_purpose, '(none given)'), p_basis => 'refused', p_granted => false,
    p_target_ids => ARRAY[p_id], p_sensitivity_tier => 'restricted',
    p_is_break_glass => p_break_glass, p_justification => p_justification,
    p_denial_reason => 'derived HR role grants are not built (HRB-007 / SPEC-ACCESS); the door refuses rather than admitting an unchecked read');

  raise exception
    'hr.read_confidential: SPEC-ACCESS derived HR role grants are not built yet (HRB-007). The read was refused and audited rather than admitted unchecked.'
    using errcode = '42501';
end
$fn$;

comment on function hr.read_confidential is
  'SPEC-DATA-MODEL 1.4 / 14.6: the audited read path for every CONF table. FAIL-CLOSED pending HRB-007 — it writes the granted=false audit row and refuses, because a door whose lock does not exist yet must not open. HRB-007 replaces the body with the derived-role check; the signature is frozen.';

create or replace function hr.reveal_ssn(p_employee_id uuid, p_purpose text,
                                         p_justification text default null)
returns text
language plpgsql security definer set search_path = hr, public
as $fn$
declare v_org uuid;
begin
  select organization_id into v_org from hr.employee where id = p_employee_id;

  perform hr._record_access_audit(
    p_organization_id => v_org, p_action => 'denied', p_target_token => 'hr_employee_private',
    p_purpose => coalesce(p_purpose, '(none given)'), p_basis => 'refused', p_granted => false,
    p_target_ids => ARRAY[p_employee_id], p_sensitivity_tier => 'restricted',
    p_field_key => 'ssn', p_justification => p_justification,
    p_denial_reason => 'derived HR role grants (HRB-007) and the aidream-held pgcrypto envelope key (AR 1.18) are both absent');

  raise exception
    'hr.reveal_ssn: refused and audited. Needs HRB-007''s derived role grants AND the aidream-held envelope key; neither is a database-only concern.'
    using errcode = '42501';
end
$fn$;

revoke all on function hr.read_confidential(text, uuid, text, boolean, text) from public;
grant execute on function hr.read_confidential(text, uuid, text, boolean, text) to authenticated, service_role;
revoke all on function hr.reveal_ssn(uuid, text, text) from public;
grant execute on function hr.reveal_ssn(uuid, text, text) to authenticated, service_role;

-- ============================================================ 14.6 the ONE read path
-- §14.6: "There is no other read path, in any repo." The view is definer-backed via the page
-- function, which applies the caller's compliance-role check and defaults p_include_self => false
-- (without it every dashboard drowns in self-reads).
create or replace function hr.access_audit_page(
  p_from timestamptz default now() - interval '30 days',
  p_to   timestamptz default now(),
  p_subject_token text default null,
  p_include_self boolean default false,
  p_limit integer default 100,
  p_cursor timestamptz default null)
returns setof hr.access_audit
language sql stable security definer set search_path = hr, public as $fn$
  select a.* from hr.access_audit a
   where a.deleted_at is null
     and a.occurred_at >= p_from and a.occurred_at <= p_to
     and (p_subject_token is null or a.target_token = p_subject_token)
     and (p_include_self or not a.is_self_access)
     and (p_cursor is null or a.occurred_at < p_cursor)
     and (coalesce(public.is_super_admin(), false)
          or public.is_org_admin_for((select auth.uid()), a.organization_id))
   order by a.occurred_at desc
   limit least(coalesce(p_limit, 100), 500)
$fn$;

comment on function hr.access_audit_page is
  'SPEC-DATA-MODEL 14.6: the only reader of hr.access_audit. p_include_self defaults FALSE so the real events stay visible. Gated on the org-admin/compliance lane, which is the interim stand-in until SPEC-ACCESS ships a compliance role key (HRB-007).';

revoke all on function hr.access_audit_page(timestamptz, timestamptz, text, boolean, integer, timestamptz) from public;
grant execute on function hr.access_audit_page(timestamptz, timestamptz, text, boolean, integer, timestamptz) to authenticated, service_role;

create or replace view hr.v_access_audit with (security_invoker = true) as
  select * from hr.access_audit where deleted_at is null;

grant select on hr.v_access_audit to authenticated, service_role;

-- ============================================================ 11.6 the owed eeo_aggregate audit write
-- Tranche 3 recorded this as owed to file 13. Discharged: the aggregate lane is now as
-- inspectable as the row lane (§4.6's standard, applied to §11.6).
create or replace function hr.eeo_aggregate(
  p_dimension  text,
  p_population jsonb default '{}'::jsonb,
  p_as_of      date default current_date)
returns table(bucket_id uuid, headcount integer, suppressed boolean)
language plpgsql security definer set search_path = hr, public
as $fn$
declare
  v_min_cell integer;
  v_org      uuid;
  v_kind     text;
begin
  if p_dimension not in ('gender','ethnicity','race','veteran','disability') then
    raise exception 'hr.eeo_aggregate: unknown dimension %', p_dimension using errcode = '22023';
  end if;

  v_org  := nullif(p_population ->> 'organization_id','')::uuid;
  v_kind := coalesce(p_population ->> 'subject_kind', 'candidate');

  select (value #>> '{}')::integer into v_min_cell
    from platform.feature_knob where feature = 'hr.hiring' and key = 'eeo_min_cell';
  if v_min_cell is null then
    perform hr._record_access_audit(
      p_organization_id => v_org, p_action => 'denied', p_target_token => 'hr_eeo_response',
      p_purpose => 'eeo aggregate', p_basis => 'refused', p_granted => false,
      p_sensitivity_tier => 'restricted', p_request_ref => p_dimension || ':' || v_kind,
      p_denial_reason => 'knob hr.hiring.eeo_min_cell is not seeded');
    raise exception
      'hr.eeo_aggregate: knob hr.hiring.eeo_min_cell is not seeded; EEO aggregates are refused rather than computed against a hardcoded minimum cell (D13, SPEC-DATA-MODEL 19.2, file 14)'
      using errcode = 'P0001';
  end if;

  -- 🚨 the audited-aggregate posture (§11.6, matching §4.6's hr.blended_labor_rate)
  perform hr._record_access_audit(
    p_organization_id => v_org, p_action => 'bulk_read', p_target_token => 'hr_eeo_response',
    p_purpose => 'eeo aggregate', p_basis => 'eeo_aggregate', p_granted => true,
    p_sensitivity_tier => 'restricted',
    p_request_ref => p_dimension || ':' || v_kind || ':' || coalesce(p_population ->> 'posting_id','all'));

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
        select rc from pop, lateral unnest(pop.race_category_ids) rc
         where p_dimension = 'race'
      ) s
     where s.b is not null
     group by s.b
  ),
  flagged as (select c.bucket, c.n, (c.n < v_min_cell) as small from cells c),
  complement as (
    select f.bucket from flagged f
     where not f.small and exists (select 1 from flagged x where x.small)
     order by f.n asc, f.bucket asc limit 1
  )
  select f.bucket,
         case when f.small or f.bucket in (select bucket from complement) then null::integer else f.n end,
         (f.small or f.bucket in (select bucket from complement))
    from flagged f
   order by f.bucket;
end
$fn$;

comment on function hr.eeo_aggregate(text, jsonb, date) is
  'The ONLY sanctioned read of hr.eeo_response (SPEC-DATA-MODEL 11.6). Small-cell suppression at the hr.hiring.eeo_min_cell knob plus complementary suppression. Writes an hr.access_audit row on every call, granted or refused — the aggregate lane is as inspectable as the row lane (§4.6''s standard).';

revoke all on function hr.eeo_aggregate(text, jsonb, date) from public;
grant execute on function hr.eeo_aggregate(text, jsonb, date) to authenticated, service_role;

-- ============================================================ 18.5 query E — retention policy per token
-- One platform.retention_policy row per HR token with mode='never', so the PLATFORM sweeper stays
-- out of the HR schema entirely. HR owns retention through hr.retention_rule and
-- hr.dispose_records (§14.0); two sweepers with different clocks over one table is the
-- duplication that ends in an unexplainable deletion.
do $$
declare r record;
begin
  for r in select token from platform.entity_types where schema_name = 'hr' loop
    if not exists (select 1 from platform.retention_policy
                    where scope = 'entity' and entity_token = r.token) then
      insert into platform.retention_policy
        (scope, entity_token, trigger_kind, mode, archive_tier, legal_hold, priority, enabled,
         label, description, basis, set_by, review_due)
      values ('entity', r.token, 'soft_deleted', 'never', 'instant', false, 10, true,
              'HR: retention is owned by hr.retention_rule',
              'The platform sweeper never disposes an hr.* row. HR resolves retention per record class and jurisdiction through hr.retention_due_on and destroys only through hr.dispose_records, which writes hr.disposition_event evidence first.',
              'SPEC-DATA-MODEL 14.0 and 18.5 query E: HR owns retention rather than reusing the platform policy engine, because the clock is (class, trigger date, jurisdiction) and is not expressible as a per-token day count.',
              'agent', (current_date + 90));
    end if;
  end loop;
end $$;

-- ============================================================ the write guard, per table
do $$
declare t text;
begin
  foreach t in array ARRAY['legal_hold','legal_hold_item','alert_routing_rule','disposition_event',
                           'access_audit'] loop
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
      p_by     => 'hr-domain-migration hr_13',
      p_rule   => 'org_not_null_no_backstop',
      p_object_ref => r.object_ref);
  end loop;
end $$;

-- ============================================================ assertions
do $$
declare r record; v_bad integer; v_rules text;
begin
  for r in select unnest(ARRAY['legal_hold','legal_hold_item','alert_routing_rule',
                               'disposition_event','access_audit']) as t loop
    select count(*) into v_bad from iam.verify_canonical('hr', r.t, 'hr_' || r.t) where status in ('FAIL','WARN');
    if v_bad > 0 then
      raise exception 'hr_13: hr.% has % FAIL/WARN conformance rows', r.t, v_bad;
    end if;
    if not iam.canonical_certify_ok('hr', r.t, 'hr_' || r.t) then
      raise exception 'hr_13: hr.% does not certify', r.t;
    end if;
    if not exists (select 1 from pg_trigger tg join pg_class c on c.oid = tg.tgrelid
                     join pg_namespace n on n.oid = c.relnamespace
                    where n.nspname = 'hr' and c.relname = r.t and tg.tgname = '_zz_guard_hr_write') then
      raise exception 'hr_13: hr.% is missing _zz_guard_hr_write', r.t;
    end if;
    if (select taxonomy_node_id from platform.entity_types where token = 'hr_' || r.t) is null then
      raise exception 'hr_13: hr_% has no taxonomy_node_id', r.t;
    end if;
  end loop;

  -- §18.1a: the audit table is access evidence
  if not (select suppress_platform_admin_lane from platform.entity_types where token = 'hr_access_audit') then
    raise exception 'hr_13: hr_access_audit lacks suppress_platform_admin_lane';
  end if;
  -- the owner lane really is closed
  if not exists (select 1 from pg_trigger tg join pg_class c on c.oid = tg.tgrelid
                   join pg_namespace n on n.oid = c.relnamespace
                  where n.nspname='hr' and c.relname='access_audit' and tg.tgname='_zz_null_created_by') then
    raise exception 'hr_13: hr.access_audit is missing _zz_null_created_by -- the restricted owner lane is open';
  end if;
  -- the hold counter and the hard-delete wall
  if not exists (select 1 from pg_trigger tg join pg_class c on c.oid = tg.tgrelid
                   join pg_namespace n on n.oid = c.relnamespace
                  where n.nspname='hr' and c.relname='legal_hold_item' and tg.tgname='_hold_count_sync') then
    raise exception 'hr_13: hr.legal_hold_item is missing _hold_count_sync';
  end if;
  select count(*) into v_bad
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname='hr' and c.relkind='r'
     and exists (select 1 from information_schema.columns
                  where table_schema='hr' and table_name=c.relname and column_name='legal_hold_count')
     and not exists (select 1 from pg_trigger tg where tg.tgrelid=c.oid and not tg.tgisinternal
                       and tg.tgname='_zz_hold_block_delete');
  if v_bad > 0 then
    raise exception 'hr_13: % {{RETAIN}} table(s) lack the legal-hold delete wall', v_bad;
  end if;

  -- the function suite
  select count(*) into v_bad from (values
      ('hr._record_access_audit'), ('hr._sync_legal_hold_count'), ('hr._block_delete_on_hold'),
      ('hr.retention_due_on'), ('hr.stamp_retention_triggers'), ('hr.dispose_records'),
      ('hr.transfer_restricted_note'), ('hr.alert_recipients'), ('hr.read_confidential'),
      ('hr.reveal_ssn'), ('hr.access_audit_page'), ('hr.eeo_aggregate')) as w(fn)
   where not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                      where n.nspname='hr' and 'hr.'||p.proname = w.fn);
  if v_bad > 0 then
    raise exception 'hr_13: % governance function(s) missing', v_bad;
  end if;
  if to_regclass('hr.v_access_audit') is null then
    raise exception 'hr_13: hr.v_access_audit is missing';
  end if;

  -- §18.5 QUERY E: every HR token pinned to mode='never'
  select count(*) into v_bad from platform.entity_types e
    left join platform.retention_policy p on p.entity_token = e.token and p.enabled
   where e.schema_name = 'hr' and (p.id is null or p.mode <> 'never');
  if v_bad > 0 then
    raise exception 'hr_13: % HR token(s) have no mode=never retention policy (query E)', v_bad;
  end if;

  -- §17.3 / the conveyance trap
  select count(*) into v_bad from platform.entity_relationships er
    join platform.entity_types c on c.token = er.child_type
   where c.schema_name = 'hr' and c.rls_variant = 'restricted';
  if v_bad > 0 then
    raise exception 'hr_13: % restricted hr table(s) carry an entity_relationships edge', v_bad;
  end if;

  if exists (select 1 from information_schema.columns c
               join platform.entity_types e
                 on e.schema_name = c.table_schema and e.table_name = c.table_name
              where c.table_schema = 'hr'
                and c.column_name in ('user_id','owner_id','author_id','creator_id')) then
    raise exception 'hr_13: an hr table carries a legacy owner column; it can never certify';
  end if;

  select string_agg(distinct rule, ', ') into v_rules from platform.ddl_guard_log
   where acknowledged_at is null and object_ref like 'hr.%'
     and rule <> 'org_not_null_no_backstop';
  if v_rules is not null then
    raise exception 'hr_13: unacked DDL guard rows on hr.* under unsanctioned rule(s): %', v_rules;
  end if;

  select count(*) into v_bad from platform.ddl_guard_log
   where acknowledged_at is null and object_ref like 'hr.%';
  if v_bad > 0 then
    raise exception 'hr_13: % unacked DDL guard rows remain on hr.*', v_bad;
  end if;
end $$;
