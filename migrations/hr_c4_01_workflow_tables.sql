-- HR domain C4 — migration 1 of 7 (register item HRB-008, lane core-c4-workflow).
--
-- THE NINE TABLES of SPEC-WORKFLOW-ENGINE §1, the `hr.workflow_notice` VIEW (§1.7 as superseded by
-- SPEC-NOTIFICATIONS §5.3), the `hr.workflow` knob register (§9), and the failure-class vocabulary
-- (§1.8). No functions here — the resolver is file 2, the engine is files 3–5, the roster is file 6.
--
-- Authority: SPEC-WORKFLOW-ENGINE §1, §9; SPEC-NOTIFICATIONS §5.1/§5.3/§8 D1/D2; SPEC-ACCESS §1.3.
-- Applied live as `hr_c4_01_workflow_tables`. Idempotent.
--
-- ===================================================================================
-- RECORDED TECHNICAL DECISIONS (EXECUTION §8)
--
-- 1. 🚨 THE OPEN ITEM IS RULED: `hr.workflow_instance` TAKES `p_soft_delete => true`.
--    SPEC-WORKFLOW-ENGINE §1.3 left this OPEN for this lane ("an instance is evidence; it is
--    cancelled, never deleted" — AD-11 — vs. the gate's `soft_delete` WARN, which makes
--    `iam.canonical_certify_ok` false, which SPEC-ACCESS §9 T-27 forbids for any hr.* table).
--    RULING: take the column. The two horns are not actually in tension, because THE COLUMN IS NOT
--    WHAT PROTECTS THE EVIDENCE — the write guard is. All 118 live `hr.*` tables carry
--    `_zz_guard_hr_write` (verified: 118/118), which refuses INSERT/UPDATE/DELETE outright unless
--    `hr.privileged_write` is set, and no engine RPC ever sets `deleted_at`. So a client cannot
--    soft-delete an instance AND cannot hard-delete one either; without the column the entity
--    variant's generated `std_delete` would still admit the owner, so declaring
--    `p_soft_delete => false` protects strictly LESS than declaring it true. The column is present,
--    is never written by any code in this lane, and certification is clean. This is the same call
--    SPEC-DATA-MODEL §14.1 made for `hr.record_class` / `hr.retention_rule`, now with a reason
--    stronger than precedent. OWED: SPEC-WORKFLOW-ENGINE §1.3 note 2 records the ruling.
--
-- 2. `hr.workflow_notice` IS THE SPEC-NOTIFICATIONS §5.3 VIEW, NOT §1.7's.
--    SPEC-WORKFLOW-ENGINE §1.7 keys the view off `payload->>'instance_id'` / `payload->>'step_id'`.
--    SPEC-NOTIFICATIONS §5.1 later ruled the spine gains first-class `target_kind` / `target_id` /
--    `deep_link` / `delivered_at` / `read_at` / `acted_at` / `outcome` columns (landed by HRB-001,
--    verified live today), and §5.3 rewrites the view to key off `target_kind='hr_workflow_step'`.
--    The later, landed, indexed form wins (`notification_target_idx`); a payload-key scan of the
--    whole notification table would be unindexed. The §1.7 payload keys are still emitted by the
--    engine (file 5) because the view still reads `notice_kind` and `instance_id` from the payload.
--    OWED: SPEC-WORKFLOW-ENGINE §1.7's view body.
--
-- 3. `channel_policy` IS A COLUMN ON `hr.workflow_flow_type` (SPEC-NOTIFICATIONS §8 D2).
--    §6.1 of the engine spec declares SMS "for schedule/time flows" and "never for compensation and
--    relations flows", but `default_channels` lives on the EVENT and all 23 flow types share the
--    same 11 events — the per-flow variation has nowhere to live. D2's correction is a
--    `channel_policy jsonb` overlay on the flow type, applied over the event default before the
--    notify call. It is added here, as data, so the prose stops being prose.
--
-- 4. `authority_action` STAYS A TEXT SLUG AND SO DOES `hr.approval_authority.action_type`.
--    §2.1 describes `action_type` as "FK → platform.categories in the hr_approval_action
--    dimension". AS BUILT by HRB-007 it is `text` holding the slug, and `hr.can_approve` resolves
--    the slug against the dimension itself. The engine conforms to the LIVE column, not to the
--    spec sentence: `workflow_step_definition.authority_action` is the same text slug, resolved
--    once at step activation, with the resolved category id recorded in `resolution_evidence`
--    exactly as §2.1 requires. OWED: SPEC-WORKFLOW-ENGINE §2.1's `action_type` row.
--
-- 5. NO `p_org_default` ANYWHERE. §1.5 declares `p_org_default => true` for the two ledgers.
--    `p_org_default => true` attaches `_stamp_org_default`, the personal-org backstop the
--    2026-08-21 NO-NULL-ORG ruling forbids — the same call HRB-005 made on all 22 tranche-1 tables
--    and HRB-007 made on all ten of its own. Every engine write supplies `organization_id`
--    explicitly. The resulting `org_not_null_no_backstop` guard rows are acknowledged below with
--    that reason. OWED: SPEC-WORKFLOW-ENGINE §1.5's two `p_org_default` arguments.
--
-- 6. THE CLOSED STATE SETS ARE `text` + CHECK, THE GROWING ONE IS `platform.categories`.
--    §1's own rule. `failure_class` is a `hr_workflow_failure_class` dimension (9 seeded rows);
--    instance/step states, decisions, quorum kinds and resolver kinds are CHECKed text because they
--    are engine mechanics with code branches on every value — a new one is a deployment, not
--    configuration, and a CHECK is what makes that true.
-- ===================================================================================

-- ============================================================ 0. schema guard
do $$ begin
  if not exists (select 1 from pg_namespace where nspname = 'hr') then
    raise exception 'hr_c4_01: the hr schema does not exist — HRB-005/006 must land first';
  end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'hr' and p.proname = 'can_approve') then
    raise exception 'hr_c4_01: hr.can_approve is absent — HRB-007 (C3 access machinery) must land first';
  end if;
end $$;

-- ============================================================ 1. hr.workflow_flow_type  (§1.1)
do $$ begin
  if not exists (select 1 from platform.entity_types where token = 'hr_workflow_flow_type') then
    perform platform.create_entity_table(
      p_schema => 'hr', p_table => 'workflow_flow_type', p_token => 'hr_workflow_flow_type',
      p_label => 'HR Workflow Flow Type',
      p_fields => ARRAY[
        'flow_key text NOT NULL',
        'label text NOT NULL',
        $f$description text NOT NULL DEFAULT ''$f$,
        'target_token text NOT NULL',
        $f$requester_kind text NOT NULL DEFAULT 'employment' CHECK (requester_kind IN ('employment','outsider_token','system'))$f$,
        $f$sensitivity_tier text NOT NULL DEFAULT 'confidential' CHECK (sensitivity_tier IN ('directory','internal','confidential','restricted'))$f$,
        $f$ai_ceiling text NOT NULL DEFAULT 'advisory' CHECK (ai_ceiling IN ('none','advisory','auto_allowed'))$f$,
        'validate_fn regprocedure',
        'digest_fn regprocedure NOT NULL',
        'conflict_fn regprocedure',
        'apply_fn regprocedure NOT NULL',
        'compensate_fn regprocedure',
        'result_fn regprocedure',
        $f$on_target_change text NOT NULL DEFAULT 'restart' CHECK (on_target_change IN ('revalidate','restart','supersede'))$f$,
        $f$on_reject text NOT NULL DEFAULT 'terminate' CHECK (on_reject IN ('terminate','return_to_requester'))$f$,
        'allows_withdraw boolean NOT NULL DEFAULT true',
        'allows_resubmit boolean NOT NULL DEFAULT true',
        'requires_reason_on_approve boolean NOT NULL DEFAULT false',
        $f$channel_policy jsonb NOT NULL DEFAULT '{}'$f$,
        'default_definition_id uuid',
        'is_active boolean NOT NULL DEFAULT true',
        'inactive_reason text'
      ],
      p_variant => 'system', p_versioned => true, p_soft_delete => true, p_visibility => 'public',
      p_category => false, p_listed => true, p_org_default => false, p_gin_jsonb => false,
      p_parents => null);
  end if;
end $$;

create unique index if not exists workflow_flow_type_key_uq
  on hr.workflow_flow_type (organization_id, flow_key) where deleted_at is null;

-- ============================================================ 2. hr.workflow_definition  (§1.2)
do $$ begin
  if not exists (select 1 from platform.entity_types where token = 'hr_workflow_definition') then
    perform platform.create_entity_table(
      p_schema => 'hr', p_table => 'workflow_definition', p_token => 'hr_workflow_definition',
      p_label => 'HR Workflow Definition',
      p_fields => ARRAY[
        'flow_key text NOT NULL',
        'name text NOT NULL',
        'definition_version integer NOT NULL DEFAULT 1',
        $f$status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','retired'))$f$,
        'effective_from timestamptz',
        'effective_to timestamptz',
        'published_at timestamptz',
        'retired_at timestamptz',
        'notes text',
        'sla_hours integer',
        'reminder_cadence_hours integer NOT NULL DEFAULT 24',
        'reminder_max integer NOT NULL DEFAULT 3',
        $f$on_expiry text NOT NULL DEFAULT 'escalate' CHECK (on_expiry IN ('escalate','expire','auto_approve','hold'))$f$,
        'skip_absent_approver boolean NOT NULL DEFAULT true',
        'allow_bulk_decide boolean NOT NULL DEFAULT true'
      ],
      p_variant => 'entity', p_versioned => true, p_soft_delete => true, p_visibility => 'internal',
      p_category => false, p_listed => true, p_org_default => false, p_gin_jsonb => false,
      p_parents => null);
  end if;
end $$;

create unique index if not exists workflow_definition_version_uq
  on hr.workflow_definition (organization_id, flow_key, definition_version) where deleted_at is null;
-- ONE published definition per (org, flow_key) — the "nearest wins" resolution in §1.2 is only
-- deterministic if this holds, and it is cheaper to make it impossible than to order by guess.
create unique index if not exists workflow_definition_published_uq
  on hr.workflow_definition (organization_id, flow_key)
  where deleted_at is null and status = 'published';

-- ============================================================ 3. hr.workflow_step_definition (§1.2)
do $$ begin
  if not exists (select 1 from platform.entity_types where token = 'hr_workflow_step_definition') then
    perform platform.create_entity_table(
      p_schema => 'hr', p_table => 'workflow_step_definition', p_token => 'hr_workflow_step_definition',
      p_label => 'HR Workflow Step Definition',
      p_fields => ARRAY[
        'workflow_definition_id uuid NOT NULL REFERENCES hr.workflow_definition(id) ON DELETE CASCADE',
        'step_key text NOT NULL',
        'label text NOT NULL',
        'step_order integer NOT NULL',
        'parallel_group text',
        $f$quorum_kind text NOT NULL DEFAULT 'all' CHECK (quorum_kind IN ('all','any','n_of_m'))$f$,
        'quorum_n integer',
        $f$condition jsonb NOT NULL DEFAULT '{}'$f$,
        'is_optional boolean NOT NULL DEFAULT false',
        'allows_self boolean NOT NULL DEFAULT false',
        'requires_reason boolean NOT NULL DEFAULT false',
        $f$resolver_kind text NOT NULL CHECK (resolver_kind IN ('authority','reporting_line','fixed_user','fixed_authority_scope','requester','system','external_result'))$f$,
        'authority_action text',
        $f$resolver_config jsonb NOT NULL DEFAULT '{}'$f$,
        $f$fallback_chain text[] NOT NULL DEFAULT ARRAY['authority','substitute','reporting_line','top_of_chart']$f$,
        'sla_hours integer',
        'reminder_cadence_hours integer',
        'escalate_after_hours integer',
        'escalation_resolver_kind text',
        $f$escalation_config jsonb NOT NULL DEFAULT '{}'$f$,
        'autonomy_mode integer NOT NULL DEFAULT 4 CHECK (autonomy_mode BETWEEN 1 AND 5)',
        $f$auto_decide_rule jsonb NOT NULL DEFAULT '{}'$f$,
        'auto_decide_rule_version text',
        'recommend_mandate_key text',
        $f$timeout_action text NOT NULL DEFAULT 'escalate' CHECK (timeout_action IN ('apply','escalate'))$f$,
        'result_window_hours integer'
      ],
      p_variant => 'component', p_versioned => true, p_soft_delete => true, p_visibility => 'none',
      p_category => false, p_listed => false, p_org_default => false, p_gin_jsonb => true,
      p_parents => ARRAY['hr_workflow_definition:workflow_definition_id']);
  end if;
end $$;

create unique index if not exists workflow_step_definition_key_uq
  on hr.workflow_step_definition (workflow_definition_id, step_key) where deleted_at is null;
create index if not exists workflow_step_definition_order_idx
  on hr.workflow_step_definition (workflow_definition_id, step_order);

-- ============================================================ 4. hr.workflow_instance  (§1.3)
do $$ begin
  if not exists (select 1 from platform.entity_types where token = 'hr_workflow_instance') then
    perform platform.create_entity_table(
      p_schema => 'hr', p_table => 'workflow_instance', p_token => 'hr_workflow_instance',
      p_label => 'HR Workflow Instance',
      p_fields => ARRAY[
        'flow_key text NOT NULL',
        'workflow_definition_id uuid NOT NULL REFERENCES hr.workflow_definition(id)',
        'definition_version integer NOT NULL',
        'target_token text NOT NULL',
        'target_id uuid NOT NULL',
        'target_version integer',
        'target_digest text',
        'requester_employment_id uuid REFERENCES hr.employment(id)',
        'subject_employment_id uuid REFERENCES hr.employment(id)',
        $f$requester_actor_type text NOT NULL DEFAULT 'employee'$f$,
        'outsider_token_id uuid',
        $f$state text NOT NULL DEFAULT 'draft' CHECK (state IN ('draft','validating','rejected_at_intake','routing','active','approved','rejected','returned','withdrawn','cancelled','expired','superseded','applying','verifying','completed','failed','closed'))$f$,
        'state_reason text',
        'current_step_order integer',
        'submitted_at timestamptz',
        'due_at timestamptz',
        'decided_at timestamptz',
        'applied_at timestamptz',
        'closed_at timestamptz',
        $f$payload jsonb NOT NULL DEFAULT '{}'$f$,
        $f$validation_findings jsonb NOT NULL DEFAULT '{}'$f$,
        $f$rule_snapshot jsonb NOT NULL DEFAULT '{}'$f$,
        'supersedes_instance_id uuid REFERENCES hr.workflow_instance(id)',
        'superseded_by_instance_id uuid REFERENCES hr.workflow_instance(id)',
        'idempotency_key text',
        $f$priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent'))$f$,
        $f$sensitivity_tier text NOT NULL DEFAULT 'confidential' CHECK (sensitivity_tier IN ('directory','internal','confidential','restricted'))$f$
      ],
      -- p_soft_delete => true is RECORDED DECISION 1, resolving the §1.3 OPEN item.
      p_variant => 'entity', p_versioned => true, p_soft_delete => true, p_visibility => 'personal',
      p_category => false, p_listed => true, p_org_default => false, p_gin_jsonb => true,
      p_parents => null);
  end if;
end $$;

create unique index if not exists workflow_instance_idem_uq
  on hr.workflow_instance (organization_id, flow_key, idempotency_key)
  where idempotency_key is not null;
create index if not exists workflow_instance_target_idx
  on hr.workflow_instance (target_token, target_id, state);
create index if not exists workflow_instance_subject_idx
  on hr.workflow_instance (organization_id, subject_employment_id, state);
create index if not exists workflow_instance_requester_idx
  on hr.workflow_instance (organization_id, requester_employment_id, state);

-- ============================================================ 5. hr.workflow_step  (§1.4)
do $$ begin
  if not exists (select 1 from platform.entity_types where token = 'hr_workflow_step') then
    perform platform.create_entity_table(
      p_schema => 'hr', p_table => 'workflow_step', p_token => 'hr_workflow_step',
      p_label => 'HR Workflow Step',
      p_fields => ARRAY[
        'workflow_instance_id uuid NOT NULL REFERENCES hr.workflow_instance(id) ON DELETE CASCADE',
        'step_definition_id uuid NOT NULL REFERENCES hr.workflow_step_definition(id)',
        'step_key text NOT NULL',
        'step_order integer NOT NULL',
        'parallel_group text',
        $f$state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','active','approved','auto_approved','rejected','returned','skipped','expired','cancelled','unroutable','awaiting_result'))$f$,
        'state_reason text',
        $f$quorum_kind text NOT NULL DEFAULT 'all'$f$,
        'quorum_n integer',
        'approvals_needed integer NOT NULL DEFAULT 1',
        'approvals_received integer NOT NULL DEFAULT 0',
        $f$resolved_approver_ids uuid[] NOT NULL DEFAULT '{}'$f$,
        $f$resolved_user_ids uuid[] NOT NULL DEFAULT '{}'$f$,
        'resolution_path text',
        $f$resolution_evidence jsonb NOT NULL DEFAULT '{}'$f$,
        'activated_at timestamptz',
        'due_at timestamptz',
        'first_viewed_at timestamptz',
        'closed_at timestamptz',
        'reminders_sent integer NOT NULL DEFAULT 0',
        'last_reminder_at timestamptz',
        'escalated_at timestamptz',
        'escalated_from_employment_id uuid REFERENCES hr.employment(id)',
        'autonomy_mode integer NOT NULL DEFAULT 4',
        'timeout_at timestamptz',
        'timeout_warned_at timestamptz',
        $f$recommendation jsonb NOT NULL DEFAULT '{}'$f$,
        'result_due_at timestamptz',
        'result_verified_at timestamptz',
        $f$result_evidence jsonb NOT NULL DEFAULT '{}'$f$,
        'workspace_task_id uuid REFERENCES workspace.tasks(id)'
      ],
      p_variant => 'component', p_versioned => true, p_soft_delete => false, p_visibility => 'none',
      p_category => false, p_listed => false, p_org_default => false, p_gin_jsonb => true,
      p_parents => ARRAY['hr_workflow_instance:workflow_instance_id']);
  end if;
end $$;

create index if not exists workflow_step_open_idx
  on hr.workflow_step (organization_id, state, due_at) where state = 'active';
create index if not exists workflow_step_approvers_idx
  on hr.workflow_step using gin (resolved_user_ids) where state = 'active';
create index if not exists workflow_step_instance_idx
  on hr.workflow_step (workflow_instance_id, step_order);
create index if not exists workflow_step_result_idx
  on hr.workflow_step (result_due_at) where state = 'awaiting_result';

-- ============================================================ 6. hr.workflow_decision  (§1.5)
do $$ begin
  if not exists (select 1 from platform.entity_types where token = 'hr_workflow_decision') then
    perform platform.create_entity_table(
      p_schema => 'hr', p_table => 'workflow_decision', p_token => 'hr_workflow_decision',
      p_label => 'HR Workflow Decision',
      p_fields => ARRAY[
        'workflow_instance_id uuid NOT NULL',
        'workflow_step_id uuid NOT NULL',
        'step_key text NOT NULL',
        $f$decision text NOT NULL CHECK (decision IN ('approved','rejected','returned','abstained','attested','attested_with_exception','acknowledged'))$f$,
        'reason text',
        'reason_category_id uuid REFERENCES platform.categories(id)',
        'actor_type text NOT NULL',
        'actor_user_id uuid REFERENCES auth.users(id)',
        'actor_employment_id uuid REFERENCES hr.employment(id)',
        'actor_device_id uuid',
        'actor_agent_key text',
        'actor_agent_version text',
        'on_behalf_of_employment_id uuid REFERENCES hr.employment(id)',
        'delegation_id uuid',
        'authority_id uuid',
        'approval_basis text',
        'autonomy_mode integer NOT NULL DEFAULT 4',
        'rule_key text',
        'rule_version text',
        $f$calculation_snapshot jsonb NOT NULL DEFAULT '{}'$f$,
        $f$recommendation_snapshot jsonb NOT NULL DEFAULT '{}'$f$,
        'overrode_recommendation boolean NOT NULL DEFAULT false',
        'superseded_by_target_change boolean NOT NULL DEFAULT false',
        'target_digest text',
        $f$client_context jsonb NOT NULL DEFAULT '{}'$f$,
        'decided_at timestamptz NOT NULL DEFAULT now()'
      ],
      p_variant => 'ledger', p_versioned => false, p_soft_delete => false, p_visibility => 'none',
      p_category => false, p_listed => false, p_org_default => false, p_gin_jsonb => false,
      p_parents => null);
  end if;
end $$;

create index if not exists workflow_decision_instance_idx on hr.workflow_decision (workflow_instance_id, decided_at);
create index if not exists workflow_decision_step_idx on hr.workflow_decision (workflow_step_id);
create index if not exists workflow_decision_actor_idx on hr.workflow_decision (organization_id, actor_employment_id, decided_at desc);

-- ============================================================ 7. hr.workflow_event  (§1.5)
do $$ begin
  if not exists (select 1 from platform.entity_types where token = 'hr_workflow_event') then
    perform platform.create_entity_table(
      p_schema => 'hr', p_table => 'workflow_event', p_token => 'hr_workflow_event',
      p_label => 'HR Workflow Event',
      p_fields => ARRAY[
        'workflow_instance_id uuid NOT NULL',
        'workflow_step_id uuid',
        'event_kind text NOT NULL',
        'from_state text',
        'to_state text',
        $f$actor_type text NOT NULL DEFAULT 'automation'$f$,
        'actor_user_id uuid',
        'actor_employment_id uuid',
        'actor_agent_key text',
        $f$detail jsonb NOT NULL DEFAULT '{}'$f$,
        'occurred_at timestamptz NOT NULL DEFAULT now()'
      ],
      p_variant => 'ledger', p_versioned => false, p_soft_delete => false, p_visibility => 'none',
      p_category => false, p_listed => false, p_org_default => false, p_gin_jsonb => false,
      p_parents => null);
  end if;
end $$;

create index if not exists workflow_event_instance_idx on hr.workflow_event (workflow_instance_id, occurred_at);
create index if not exists workflow_event_kind_idx on hr.workflow_event (organization_id, event_kind, occurred_at desc);

-- ============================================================ 8. hr.workflow_failure  (§1.8)
do $$ begin
  if not exists (select 1 from platform.entity_types where token = 'hr_workflow_failure') then
    perform platform.create_entity_table(
      p_schema => 'hr', p_table => 'workflow_failure', p_token => 'hr_workflow_failure',
      p_label => 'HR Workflow Failure',
      p_fields => ARRAY[
        'workflow_instance_id uuid NOT NULL REFERENCES hr.workflow_instance(id) ON DELETE CASCADE',
        'workflow_step_id uuid',
        'failure_class text NOT NULL',
        $f$detail jsonb NOT NULL DEFAULT '{}'$f$,
        'occurred_at timestamptz NOT NULL DEFAULT now()',
        'attempt_count integer NOT NULL DEFAULT 1',
        'next_retry_at timestamptz',
        $f$state text NOT NULL DEFAULT 'open' CHECK (state IN ('open','retrying','resolved','abandoned'))$f$,
        'assigned_employment_id uuid REFERENCES hr.employment(id)',
        'resolved_at timestamptz',
        'resolved_by uuid',
        'resolution_note text'
      ],
      p_variant => 'component', p_versioned => true, p_soft_delete => false, p_visibility => 'none',
      p_category => false, p_listed => false, p_org_default => false, p_gin_jsonb => true,
      p_parents => ARRAY['hr_workflow_instance:workflow_instance_id']);
  end if;
end $$;

create index if not exists workflow_failure_open_idx
  on hr.workflow_failure (organization_id, failure_class, occurred_at desc) where state in ('open','retrying');
create index if not exists workflow_failure_instance_idx on hr.workflow_failure (workflow_instance_id);

-- ============================================================ 9. hr.workflow_binding  (§1.6)
do $$ begin
  if not exists (select 1 from platform.entity_types where token = 'hr_workflow_binding') then
    perform platform.create_entity_table(
      p_schema => 'hr', p_table => 'workflow_binding', p_token => 'hr_workflow_binding',
      p_label => 'HR Workflow Binding',
      p_fields => ARRAY[
        'workflow_instance_id uuid NOT NULL REFERENCES hr.workflow_instance(id) ON DELETE CASCADE',
        'target_token text NOT NULL',
        'target_id uuid NOT NULL',
        'flow_key text NOT NULL',
        'is_open boolean NOT NULL DEFAULT true',
        'exclusive boolean NOT NULL DEFAULT true'
      ],
      p_variant => 'component', p_versioned => true, p_soft_delete => false, p_visibility => 'none',
      p_category => false, p_listed => false, p_org_default => false, p_gin_jsonb => false,
      p_parents => ARRAY['hr_workflow_instance:workflow_instance_id']);
  end if;
end $$;

-- THE one-open-instance-per-target mechanism: a second open exclusive binding on the same
-- (target, flow_key) fails at the DATABASE, not in application logic (§1.6).
create unique index if not exists workflow_binding_exclusive_uq
  on hr.workflow_binding (target_token, target_id, flow_key)
  where is_open and exclusive;
create index if not exists workflow_binding_target_idx
  on hr.workflow_binding (target_token, target_id) where is_open;

-- ============================================================ 10. the write guard on all nine
-- Not part of apply_rls, and it must survive a regeneration. Same shape as every other hr table.
do $$
declare t text;
begin
  foreach t in array ARRAY['workflow_flow_type','workflow_definition','workflow_step_definition',
                           'workflow_instance','workflow_step','workflow_decision','workflow_event',
                           'workflow_failure','workflow_binding'] loop
    if not exists (select 1 from pg_trigger tg join pg_class c on c.oid = tg.tgrelid
                     join pg_namespace n on n.oid = c.relnamespace
                    where n.nspname = 'hr' and c.relname = t and tg.tgname = '_zz_guard_hr_write') then
      execute format('create trigger _zz_guard_hr_write before insert or update or delete on hr.%I '
                     'for each row execute function hr._guard_hr_write()', t);
    end if;
  end loop;
end $$;

-- ============================================================ 11. hr.workflow_notice — a VIEW
-- SPEC-NOTIFICATIONS §5.3 (RECORDED DECISION 2). There is no hr_workflow_notice token and nothing
-- to certify. The engine writes no notice rows; it emits notifications and reads them back here.
create or replace view hr.workflow_notice as
select n.id,
       n.organization_id,
       n.target_id                              as workflow_step_id,
       (n.payload ->> 'instance_id')::uuid      as workflow_instance_id,
       n.id                                     as notification_id,
       n.event_key,
       n.payload ->> 'flow_key'                 as flow_key,
       n.payload ->> 'notice_kind'              as notice_kind,
       n.recipient_user_id,
       (n.payload ->> 'employment_id')::uuid    as recipient_employment_id,
       n.channel,
       n.deep_link,
       n.status,
       n.attempt_count,
       n.sent_at,
       n.delivered_at,
       n.read_at,
       n.acted_at,
       n.outcome,
       n.error_code,
       n.error_message,
       coalesce(n.error_message, n.error_code)  as failure_reason
  from communication.notification n
 where n.target_kind = 'hr_workflow_step';

comment on view hr.workflow_notice is
  'SPEC-WORKFLOW-ENGINE §1.7 as superseded by SPEC-NOTIFICATIONS §5.3 — a READ-ONLY view over the notification spine keyed on target_kind = ''hr_workflow_step''. HR owns no notice table and writes no notice rows; delivery/read/outcome all live on communication.notification.';

grant select on hr.workflow_notice to authenticated, service_role;

-- ============================================================ 12. the failure-class vocabulary (§1.8)
select set_config('hr.privileged_write', 'on', false);

insert into platform.categories (organization_id, dimension, name, slug, is_system, position, metadata, visibility)
select '39c38960-d30c-4840-b0c1-c9960de95582'::uuid, 'hr_workflow_failure_class', v.label, v.slug, true,
       v.pos, v.meta, 'internal'::platform.visibility
from (values
 ('unroutable','Unroutable',10,
   '{"default_assignee":"hr_admin","blocks_instance":true}'::jsonb),
 ('approver_ineligible','Approver ineligible',20,
   '{"default_assignee":"hr_admin","blocks_instance":true}'::jsonb),
 ('validation_error','Validation error',30,
   '{"default_assignee":"hr_admin","blocks_instance":true}'::jsonb),
 ('conflict_at_decision','Conflict at decision',40,
   '{"default_assignee":"requester_and_approver","blocks_instance":false}'::jsonb),
 ('apply_failed','Apply failed',50,
   '{"default_assignee":"hr_admin","blocks_instance":true}'::jsonb),
 ('result_unverified','Result unverified',60,
   '{"default_assignee":"hr_admin","blocks_instance":true,"note":"the AR2 access-shutoff case — a failed external effect can never self-complete"}'::jsonb),
 ('notification_undeliverable','Notification undeliverable',70,
   '{"default_assignee":"hr_admin","blocks_instance":false}'::jsonb),
 ('target_missing','Target missing',80,
   '{"default_assignee":"hr_admin","blocks_instance":true}'::jsonb),
 ('definition_invalid','Definition invalid',90,
   '{"default_assignee":"platform_admin","blocks_instance":true}'::jsonb)
) as v(slug, label, pos, meta)
where not exists (
  select 1 from platform.categories c
   where c.dimension = 'hr_workflow_failure_class' and c.slug = v.slug and c.deleted_at is null);

-- the CHECK is the closed set; the categories rows carry the assignee metadata (§1.8, §9.6)
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'workflow_failure_class_registered') then
    alter table hr.workflow_failure add constraint workflow_failure_class_registered check (
      failure_class in ('unroutable','approver_ineligible','validation_error','conflict_at_decision',
                        'apply_failed','result_unverified','notification_undeliverable',
                        'target_missing','definition_invalid'));
  end if;
end $$;

-- ============================================================ 13. the hr.workflow knob register (§9)
-- D13: a missing knob RAISES (hr._knob) rather than falling back to a hard-coded value, so every
-- value the engine reads at runtime is seeded here with an agent-chosen default and a review date.
insert into platform.feature_knob
  (feature, key, value, default_value, value_type, unit, min_value, max_value, allowed_values,
   label, description, set_by, basis, review_due)
select v.feature, v.key, v.dflt, v.dflt, v.vtype, v.unit, v.minv, v.maxv, v.allowed,
       v.label, v.descr, 'agent', v.basis, date '2027-02-26'
from (values
 ('hr.workflow','sla_business_hours_only','true'::jsonb,'boolean',null,null,null,null::jsonb,
  'SLA math uses business hours only',
  'Step and instance due dates are computed against the org holiday calendar in the subject''s location timezone rather than wall-clock hours.',
  'SPEC-WORKFLOW-ENGINE §9.2'),
 ('hr.workflow','timeout_warning_lead_hours','4'::jsonb,'integer','hours',0,168,null::jsonb,
  'Mode-3 timeout warning lead',
  'How long before an autonomy-mode-3 step auto-applies that the warning notice fires. The autonomy policy requires the timeout be visible BEFORE it fires.',
  'SPEC-WORKFLOW-ENGINE §9.2 / autonomy-modes policy rule 4'),
 ('hr.workflow','delegation_max_days','90'::jsonb,'integer','days',1,365,null::jsonb,
  'Maximum delegation length',
  'Upper bound on a delegation window. Mirrors hr.approvals.delegation_max_horizon_days, which is the knob the materialising RPC actually enforces.',
  'SPEC-WORKFLOW-ENGINE §9.3'),
 ('hr.workflow','delegation_reason_required','true'::jsonb,'boolean',null,null,null,null::jsonb,
  'Delegation requires a reason',
  'A delegation request without a reason is refused.',
  'SPEC-WORKFLOW-ENGINE §9.3'),
 ('hr.workflow','delegation_allow_subdelegation','false'::jsonb,'boolean',null,null,null,null::jsonb,
  'Sub-delegation permitted',
  'Platform rung only, never org-overridable. Enforced by hr.approvals.delegation_max_depth.',
  'SPEC-WORKFLOW-ENGINE §9.3'),
 ('hr.workflow','delegation_principal_retains','false'::jsonb,'boolean',null,null,null,null::jsonb,
  'Principal keeps authority while delegated',
  'When false (the default), a source=delegated authority row supersedes the row named by its delegated_from_id for the window — "while I am out, they act".',
  'SPEC-WORKFLOW-ENGINE §2.1 / §9.3'),
 ('hr.workflow','route_absent_approver_action','"delegated,substitute,climb,route_and_escalate"'::jsonb,'string',null,null,null,null::jsonb,
  'Absent-approver action order',
  'Ordered, comma-separated response when a resolved approver is absent. The last rung routes anyway with escalate_after_hours forced to 0, so a request never sits silently behind an out-of-office.',
  'SPEC-WORKFLOW-ENGINE §2.3 / §9.3'),
 ('hr.workflow','inbox_bulk_max','50'::jsonb,'integer','steps',1,500,null::jsonb,
  'Bulk decide batch cap',
  'Maximum number of steps one hr.wf_bulk_decide call may act on.',
  'SPEC-WORKFLOW-ENGINE §9.5'),
 ('hr.workflow','inbox_project_tasks','true'::jsonb,'boolean',null,null,null,null::jsonb,
  'Project steps into workspace.tasks',
  'Whether an activating step also upserts a mirror row through wsp_upsert_system_task. The projection is disposable and regenerable; the queue of record is always hr.workflow_step.',
  'SPEC-WORKFLOW-ENGINE §5.1 / §9.5'),
 ('hr.workflow','inbox_default_sort','"due_at asc"'::jsonb,'enum',null,null,null,'["due_at asc","activated_at asc","priority desc"]'::jsonb,
  'Inbox default sort',
  'Default ordering of the one HR approval inbox.',
  'SPEC-WORKFLOW-ENGINE §9.5'),
 ('hr.workflow','inbox_show_waiting','true'::jsonb,'boolean',null,null,null,null::jsonb,
  'Show the waiting-on-others section',
  'Whether hr.wf_pending returns the requester-side section alongside the decide-side one.',
  'SPEC-WORKFLOW-ENGINE §9.5'),
 ('hr.workflow','failure_apply_retries','3'::jsonb,'integer','attempts',0,10,null::jsonb,
  'Apply-hook retry attempts',
  'How many times an apply_failed failure may be retried before it must be resolved by hand.',
  'SPEC-WORKFLOW-ENGINE §9.6'),
 ('hr.workflow','failure_result_window_hours','24'::jsonb,'integer','hours',1,720,null::jsonb,
  'External result window',
  'How long an external_result step waits for hr.wf_record_result before a result_unverified failure opens. It never self-completes.',
  'SPEC-WORKFLOW-ENGINE §0 law 5 / §9.6'),
 ('hr.workflow','failure_auto_abandon_days','0'::jsonb,'integer','days',0,365,null::jsonb,
  'Auto-abandon unresolved failures',
  '0 means never. A failure queue that quietly empties itself is not a worked queue.',
  'SPEC-WORKFLOW-ENGINE §9.6'),
 ('hr.workflow','tick_batch_max','500'::jsonb,'integer','steps',1,5000,null::jsonb,
  'Tick batch cap',
  'Maximum steps one hr.wf_tick() pass touches, so a single sweep can never become an unbounded transaction.',
  'SPEC-WORKFLOW-ENGINE §1.9 — agent-chosen, no spec value'),
 ('hr.workflow','default_step_sla_hours','48'::jsonb,'integer','hours',1,2160,null::jsonb,
  'Default step SLA',
  'Used when neither the step definition nor the definition declares one. §9.2 says the step inherits the instance SLA, and §9.2 leaves the instance SLA NULL — so without this a step would have no due date at all and nothing to remind against.',
  'SPEC-WORKFLOW-ENGINE §9.2 — agent-chosen, fills a NULL-cascade gap')
) as v(feature, key, dflt, vtype, unit, minv, maxv, allowed, label, descr, basis)
where not exists (select 1 from platform.feature_knob k where k.feature = v.feature and k.key = v.key);

-- ============================================================ 14. DDL guard acknowledgement
do $$
declare r record;
begin
  for r in select distinct object_ref, rule from platform.ddl_guard_log
            where acknowledged_at is null and object_ref like 'hr.workflow%' loop
    perform platform.ddl_guard_ack(
      p_reason => 'HR is org-explicit by the 2026-08-21 NO-NULL-ORG ruling; the workflow engine supplies organization_id on every write and attaches no assignment trigger by design (SPEC-WORKFLOW-ENGINE §1)',
      p_by     => 'hr-domain-migration hr_c4_01',
      p_rule   => r.rule,
      p_object_ref => r.object_ref);
  end loop;
end $$;

-- ============================================================ 15. assertions — nothing is asserted that is not measured
do $$
declare t text; v_tok text; v_n integer;
begin
  foreach t in array ARRAY['workflow_flow_type','workflow_definition','workflow_step_definition',
                           'workflow_instance','workflow_step','workflow_decision','workflow_event',
                           'workflow_failure','workflow_binding'] loop
    v_tok := 'hr_' || t;
    if not iam.canonical_certify_ok('hr', t, v_tok) then
      raise exception 'hr_c4_01: hr.% does not certify (token %) — see iam.verify_canonical', t, v_tok;
    end if;
    if not exists (select 1 from pg_trigger tg join pg_class c on c.oid = tg.tgrelid
                     join pg_namespace n on n.oid = c.relnamespace
                    where n.nspname = 'hr' and c.relname = t and tg.tgname = '_zz_guard_hr_write') then
      raise exception 'hr_c4_01: hr.% has no _zz_guard_hr_write trigger', t;
    end if;
  end loop;

  -- the two ledgers must be SELECT-only to authenticated, or the immutability claim is false (§10)
  select count(*) into v_n from information_schema.role_table_grants
   where table_schema = 'hr' and table_name in ('workflow_decision','workflow_event')
     and grantee = 'authenticated' and privilege_type <> 'SELECT';
  if v_n > 0 then
    raise exception 'hr_c4_01: the decision/event ledgers grant % non-SELECT privileges to authenticated', v_n;
  end if;

  -- there is no hr_workflow_notice token and there must never be one
  if exists (select 1 from platform.entity_types where token = 'hr_workflow_notice') then
    raise exception 'hr_c4_01: hr_workflow_notice is registered as a token — §1.7 makes it a VIEW';
  end if;

  select count(*) into v_n from platform.categories
   where dimension = 'hr_workflow_failure_class' and deleted_at is null;
  if v_n <> 9 then raise exception 'hr_c4_01: expected 9 failure classes, found %', v_n; end if;

  select count(*) into v_n from platform.feature_knob where feature = 'hr.workflow';
  if v_n <> 16 then raise exception 'hr_c4_01: expected 16 hr.workflow knobs, found %', v_n; end if;
end $$;
