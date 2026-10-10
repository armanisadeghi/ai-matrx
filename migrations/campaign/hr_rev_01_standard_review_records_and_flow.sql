-- chair-step: lane HR-REVIEWS (standard performance reviews, wave 1). Creates four NEW tables through platform.create_entity_table (hr.review_template, hr.review_cycle, hr.review, hr.review_response), each certified by iam.canonical_certify_ok inside this file; adds the HR capability performance.manage to the two system HR roles that already hold identity.write (hr_owner, hr_admin) with an UPDATE of hr.access_role; declares the NEW workflow flow type performance_review with a published definition (INSERTs into hr.workflow_flow_type / workflow_definition / workflow_step_definition) and two NEW hr functions (digest + apply). Non-additive shapes (DO blocks, UPDATE, INSERT into hr workflow registries) are why it takes this route. No DROP, no REVOKE, no existing function body replaced, no existing row other than the two role rows changed.
-- lane: HR-REVIEWS
--
-- hr_rev_01 — STANDARD PERFORMANCE REVIEWS: the records and the routing.
--
-- Plan: common-docs/systems/human-resources/employee-performance-reviews/PLAN-STANDARD.md (the
-- "Changes after the plan attack" section governs). The 360 review is a SEPARATE trial and nothing
-- here reads, writes or routes through it.
--
-- ── CLASS, AND WHAT THE DATABASE REFUSED ─────────────────────────────────────────────────────
-- The plan asked for hr.review / hr.review_response as `restricted` (readers named by doors) with
-- data class Confidential. Probed on production 2026-10-09 (rolled back):
--   create_entity_table(..., 'restricted', ..., 'confidential', 'mine')  -> REFUSED (42501):
--     "Refused: hr_review_probe_x would become Confidential (rls_variant restricted) ... only Arman
--      approves it ... platform.set_table_confidential_arman_explicitly_approved(...)"
--   create_entity_table(..., 'restricted', ..., 'organization', 'mine') -> REFUSED, same sentence:
--     the RESTRICTED VARIANT itself counts as Confidential (platform.strict_class_refusal).
--   create_entity_table(..., 'entity', ..., 'organization', 'mine')     -> accepted.
-- No words of Arman's approving these two tokens exist, and none are invented. So both ship as
-- `entity` / data class `organization` / default list scope `mine` — the most closed shape the
-- database takes without his approval. The blind rule does NOT rest on row security: schema `hr`
-- is absent from pgrst.db_schemas, so no client reaches these rows except through the
-- public.hr_review_* doors (hr_rev_02), which name every reader. When Arman approves, the class
-- moves with platform.set_table_confidential_arman_explicitly_approved and nothing else changes.
--
-- ── WHY THE DIGEST IS THE REVIEW'S IDENTITY ONLY ─────────────────────────────────────────────
-- The engine re-checks the target digest at every decision and restarts on change. A review's
-- status, timestamps and overall rating move DURING the flow (each submit writes them), so a
-- digest over them would make every submit restart the other party's step. Answers live in
-- hr.review_response and are never on the target at all, so autosave cannot touch the instance.
-- The digest is therefore the review's identity — which cycle, which employment, which person,
-- which organization: change one of those and it is a different review.
--
-- ── THE ROUTING ──────────────────────────────────────────────────────────────────────────────
--   step_order 10, parallel group "blind": self    (fixed_user / subject, allows_self)
--                                          manager (fixed_user / manager_of_subject)
--   step_order 20: share        (fixed_user / manager_of_subject) — opens once BOTH submitted
--   step_order 30: acknowledge  (fixed_user / subject, allows_self) — opens once the manager shares
-- self carries condition `payload.reopened != true`: a reopened review re-runs manager -> share ->
-- acknowledge only (the employee's submitted self review stands). Submit closes a step with the
-- engine's existing `attested` decision (already in hr.workflow_decision's check — no new value),
-- share with `approved`, acknowledge with `acknowledged`; hr.review_wf_apply is the ONE writer of
-- acknowledged_at, as hr.corrective_ack_wf_apply is for corrective actions.
-- authority_action is NULL on every non-self step so hr.wf_request's pre-flight never asks
-- hr.can_approve about a target hr._approval_subject does not map; the doors pass the subject
-- explicitly and authorise the caller from the frozen manager on the row.

-- ============================================================ 1. the four tables
select platform.create_entity_table(
  'hr', 'review_template', 'hr_review_template', 'Review template',
  array[
    'name text NOT NULL',
    'description text',
    'sections jsonb NOT NULL DEFAULT ''[]''::jsonb',
    'rating_scale jsonb NOT NULL DEFAULT ''{}''::jsonb',
    'is_default boolean NOT NULL DEFAULT false'
  ],
  'entity', true, true, 'none', false, false, false, false, null, 'organization', 'organization');

select platform.create_entity_table(
  'hr', 'review_cycle', 'hr_review_cycle', 'Review cycle',
  array[
    'name text NOT NULL',
    'period_start date NOT NULL',
    'period_end date NOT NULL',
    'self_due_on date',
    'manager_due_on date',
    'share_due_on date',
    'template_id uuid REFERENCES hr.review_template(id)',
    'template_snapshot jsonb',
    'status text NOT NULL DEFAULT ''draft'' CHECK (status IN (''draft'',''open'',''closed'',''archived''))',
    'launched_at timestamptz',
    'launched_by uuid',
    'closed_at timestamptz',
    'closed_by uuid',
    'CONSTRAINT review_cycle_period_ck CHECK (period_start <= period_end)'
  ],
  'entity', false, true, 'none', false, false, false, false, null, 'organization', 'organization');

select platform.create_entity_table(
  'hr', 'review', 'hr_review', 'Performance review',
  array[
    'cycle_id uuid NOT NULL REFERENCES hr.review_cycle(id)',
    'employment_id uuid NOT NULL REFERENCES hr.employment(id)',
    'employee_id uuid NOT NULL REFERENCES hr.employee(id)',
    'employee_user_id uuid',
    'manager_employment_id uuid REFERENCES hr.employment(id)',
    'manager_user_id uuid',
    'status text NOT NULL DEFAULT ''not_started'' CHECK (status IN (''not_started'',''in_progress'',''self_submitted'',''manager_submitted'',''both_submitted'',''shared'',''acknowledged'',''reopened'',''cancelled''))',
    'self_submitted_at timestamptz',
    'manager_submitted_at timestamptz',
    'shared_at timestamptz',
    'shared_by uuid',
    'acknowledged_at timestamptz',
    'acknowledgment_comment text',
    'overall_rating text',
    'calibrated_rating text',
    'calibration_note text',
    'workflow_instance_id uuid',
    'reopen_history jsonb NOT NULL DEFAULT ''[]''::jsonb',
    'cancelled_at timestamptz',
    'cancel_reason text'
  ],
  'entity', false, true, 'none', false, false, false, false, null, 'organization', 'mine');

select platform.create_entity_table(
  'hr', 'review_response', 'hr_review_response', 'Performance review response',
  array[
    'review_id uuid NOT NULL REFERENCES hr.review(id)',
    'role text NOT NULL CHECK (role IN (''self'',''manager'',''peer''))',
    'respondent_user_id uuid',
    'recorded_by uuid',
    'answers jsonb NOT NULL DEFAULT ''{}''::jsonb',
    'status text NOT NULL DEFAULT ''draft'' CHECK (status IN (''draft'',''submitted''))',
    'submitted_at timestamptz'
  ],
  'entity', false, true, 'none', false, false, false, false, null, 'organization', 'mine');

create unique index review_template_one_default_uq on hr.review_template (organization_id)
  where is_default and deleted_at is null;
create unique index review_one_per_cycle_uq on hr.review (cycle_id, employment_id)
  where deleted_at is null;
create index review_cycle_template_idx on hr.review_cycle (template_id);
create index review_employment_idx on hr.review (employment_id);
create index review_employee_idx on hr.review (employee_id);
create index review_manager_employment_idx on hr.review (manager_employment_id);
create index review_manager_user_idx on hr.review (manager_user_id);
create index review_employee_user_idx on hr.review (employee_user_id);
create index review_cycle_idx on hr.review (cycle_id);
create unique index review_response_one_per_respondent_uq
  on hr.review_response (review_id, role, respondent_user_id) nulls not distinct
  where deleted_at is null;
create index review_response_review_idx on hr.review_response (review_id);

-- every foreign key into a tenant-scoped table refuses another organization's row (validation only)
create trigger trg_same_org_hr_review_cycle_template_id before insert or update of template_id on hr.review_cycle
  for each row execute function platform.assert_same_org('template_id', 'hr.review_template');
create trigger trg_same_org_hr_review_cycle_id before insert or update of cycle_id on hr.review
  for each row execute function platform.assert_same_org('cycle_id', 'hr.review_cycle');
create trigger trg_same_org_hr_review_employment_id before insert or update of employment_id on hr.review
  for each row execute function platform.assert_same_org('employment_id', 'hr.employment');
create trigger trg_same_org_hr_review_employee_id before insert or update of employee_id on hr.review
  for each row execute function platform.assert_same_org('employee_id', 'hr.employee');
create trigger trg_same_org_hr_review_manager_employment_id before insert or update of manager_employment_id on hr.review
  for each row execute function platform.assert_same_org('manager_employment_id', 'hr.employment');
create trigger trg_same_org_hr_review_response_review_id before insert or update of review_id on hr.review_response
  for each row execute function platform.assert_same_org('review_id', 'hr.review');

do $$
declare r record;
begin
  for r in select * from (values ('review_template','hr_review_template'), ('review_cycle','hr_review_cycle'),
                                 ('review','hr_review'), ('review_response','hr_review_response')) v(t, tok)
  loop
    if not iam.canonical_certify_ok('hr', r.t, r.tok) then
      raise exception 'hr_rev_01: hr.% is not certified (iam.canonical_certify_ok = false)', r.t;
    end if;
  end loop;
end $$;

-- ============================================================ 2. the capability
do $$
begin
  perform hr.arm_write();
  update hr.access_role
     set capabilities = capabilities || array['performance.manage']
   where role_key in ('hr_owner','hr_admin') and deleted_at is null
     and organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'::uuid
     and not ('performance.manage' = any(capabilities));
  if (select count(*) from hr.access_role
       where role_key in ('hr_owner','hr_admin') and deleted_at is null
         and organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'::uuid
         and 'performance.manage' = any(capabilities)) <> 2 then
    raise exception 'hr_rev_01: performance.manage did not land on both system HR roles';
  end if;
end $$;

-- ============================================================ 3. digest + apply
create function hr.review_wf_digest(p_target_token text, p_target_id uuid)
 returns text
 language plpgsql
 stable security definer
 set search_path to 'hr', 'public'
as $function$
declare v text;
begin
  -- The review's IDENTITY only (see the file header): status, dates and ratings move during the
  -- flow by design, and answers are never on this row.
  select concat_ws('|', r.organization_id, r.cycle_id, r.employment_id, r.employee_id)
    into v from hr.review r where r.id = p_target_id;
  if v is null then return null; end if;
  return encode(sha256(convert_to(v, 'UTF8')), 'hex');
end
$function$;

create function hr.review_wf_apply(p_instance_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'hr', 'public'
as $function$
declare inst hr.workflow_instance%rowtype; v_at timestamptz;
begin
  select * into inst from hr.workflow_instance where id = p_instance_id;
  if inst.id is null then return jsonb_build_object('ok', false, 'reason', 'instance_missing'); end if;
  -- THE ONE WRITER of the acknowledgment. The door stages the employee's comment on the instance
  -- payload; only this function moves it onto the review, and only onto a shared review.
  update hr.review
     set acknowledged_at = now(),
         acknowledgment_comment = nullif(btrim(coalesce(inst.payload ->> 'acknowledgment_comment','')), ''),
         status = 'acknowledged'
   where id = inst.target_id and status = 'shared' and deleted_at is null
  returning acknowledged_at into v_at;
  if v_at is null then
    return jsonb_build_object('ok', false, 'failure_class', 'apply_failed',
      'reason', 'review_not_shared',
      'detail', 'The review is not in the shared state, so there is nothing to acknowledge.');
  end if;
  return jsonb_build_object('ok', true, 'review_id', inst.target_id, 'outcome', 'acknowledged',
                            'acknowledged_at', v_at);
end
$function$;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by, non_client_lane,
   signed_in_callers, anonymous_callers)
values
  ('hr', 'review_wf_digest', 'p_target_token text, p_target_id uuid', array['text'::regtype, 'uuid'::regtype]::oid[],
   'Reads one hr.review row by id and hashes its identity (organization, cycle, employment, employee); checked against nothing a caller supplies because no client calls it.',
   'matrx-frontend/migrations/campaign/hr_rev_01_standard_review_records_and_flow.sql (HR-REVIEWS)',
   'server_only: the performance_review flow type''s digest_fn, called only by the HR workflow engine (hr._wf_call_digest); no client role holds EXECUTE.',
   false, false),
  ('hr', 'review_wf_apply', 'p_instance_id uuid', array['uuid'::regtype]::oid[],
   'Writes acknowledged_at / acknowledgment_comment / status on the hr.review a workflow instance targets, only when that review is shared; checked against nothing a caller supplies because no client calls it.',
   'matrx-frontend/migrations/campaign/hr_rev_01_standard_review_records_and_flow.sql (HR-REVIEWS)',
   'server_only: the performance_review flow type''s apply_fn, called only by the HR workflow engine (hr._wf_apply) after the acknowledge step closes; no client role holds EXECUTE.',
   false, false);

-- ============================================================ 4. the flow type + published routing
do $$
declare
  v_sys constant uuid := '39c38960-d30c-4840-b0c1-c9960de95582';
  v_def uuid;
begin
  perform hr.arm_write();
  insert into hr.workflow_flow_type
    (flow_key, label, description, target_token, requester_kind, sensitivity_tier, ai_ceiling,
     digest_fn, apply_fn, on_target_change, on_reject, allows_withdraw, allows_resubmit,
     requires_reason_on_approve, channel_policy, is_active, organization_id)
  values
    ('performance_review', 'Performance review',
     'A standard performance review: the employee''s self review and the manager''s review, blind '
     || 'to each other until both submit; the manager shares; the employee acknowledges.',
     'hr_review', 'employment', 'confidential', 'advisory',
     'hr.review_wf_digest(text,uuid)'::regprocedure, 'hr.review_wf_apply(uuid)'::regprocedure,
     'revalidate', 'terminate', false, false, false, '{"sms":"deny"}'::jsonb, true, v_sys);

  insert into hr.workflow_definition
    (flow_key, name, definition_version, status, effective_from, published_at, notes, sla_hours,
     reminder_cadence_hours, reminder_max, on_expiry, skip_absent_approver, allow_bulk_decide,
     organization_id, metadata)
  values
    ('performance_review', 'Performance review (platform default)', 1, 'published', current_date, now(),
     'Self and manager in parallel (blind), then share, then acknowledge. Step deadlines come from '
     || 'the cycle''s dates (set by public.hr_review_cycle_launch / submit / share); the 336-hour '
     || 'SLA is only the fallback when a cycle names no date. See migration hr_rev_01.',
     336, 72, 3, 'escalate', false, false, v_sys, '{}'::jsonb)
  returning id into v_def;

  insert into hr.workflow_step_definition
    (workflow_definition_id, step_key, label, step_order, parallel_group, quorum_kind, condition,
     is_optional, allows_self, requires_reason, resolver_kind, authority_action, resolver_config,
     fallback_chain, autonomy_mode, timeout_action, organization_id)
  values
    (v_def, 'self', 'Self review', 10, 'blind', 'all',
     '{"field":"payload.reopened","op":"!=","value":true}'::jsonb,
     false, true, false, 'fixed_user', 'performance_review_self',
     '{"employment_source":"subject"}'::jsonb, array[]::text[], 4, 'escalate', v_sys),
    (v_def, 'manager', 'Manager review', 10, 'blind', 'all', '{}'::jsonb,
     false, false, false, 'fixed_user', null,
     '{"employment_source":"manager_of_subject"}'::jsonb, array[]::text[], 4, 'escalate', v_sys),
    (v_def, 'share', 'Share the review', 20, null, 'all', '{}'::jsonb,
     false, false, false, 'fixed_user', null,
     '{"employment_source":"manager_of_subject"}'::jsonb, array[]::text[], 4, 'escalate', v_sys),
    (v_def, 'acknowledge', 'Employee acknowledgment', 30, null, 'all', '{}'::jsonb,
     false, true, false, 'fixed_user', 'performance_review_ack',
     '{"employment_source":"subject"}'::jsonb, array[]::text[], 4, 'escalate', v_sys);

  -- Published directly, exactly as hr_l1_74 published corrective_action_ack v2:
  -- hr.wf_publish_definition refuses a caller-less session ("requires an authenticated caller"),
  -- and a migration has no caller. No earlier definition of this flow exists to retire.
  if not exists (select 1 from hr.workflow_definition where id = v_def and status = 'published') then
    raise exception 'hr_rev_01: the performance_review definition is not published';
  end if;

  update hr.workflow_flow_type set default_definition_id = v_def
   where flow_key = 'performance_review' and organization_id = v_sys;
end $$;
