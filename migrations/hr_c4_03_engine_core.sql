-- HR domain C4 — migration 3 of 7 (register item HRB-008, lane core-c4-workflow).
--
-- THE ENGINE'S SPINE: the ledger writers, the hook invokers, the fail-closed hook stubs, the
-- notification emitter, the workspace.tasks projection (§5), the iam.permissions grant lane (§1.3),
-- step activation with its routing call, and the two entry RPCs `hr.wf_request` / `hr.wf_submit`.
-- `hr.wf_decide` and the versioned-target machinery are file 4.
--
-- Authority: SPEC-WORKFLOW-ENGINE §1.3, §3, §4, §5, §6, §7. Applied live as `hr_c4_03_engine_core`.
-- Idempotent.
--
-- ===================================================================================
-- RECORDED TECHNICAL DECISIONS (EXECUTION §8)
--
-- 1. 🚨 THE HOOK STUBS ARE FAIL-CLOSED, AND WHICH HOOK GETS A STUB IS NOT ARBITRARY.
--    §4.1 says a pillar ships its own hooks. Nine of the 23 pillars have not been built, so the
--    roster (file 6) needs values for the two NOT NULL hook columns. The rule applied:
--      · `apply_fn` -> `hr.wf_apply_unimplemented`, which RETURNS a failure naming
--        `pillar_lane_not_built`. The instance goes `applying -> failed` with an `apply_failed`
--        row. A no-op apply stub that returned success would record "leave approved and applied"
--        while the leave ledger stayed empty — a silent lie, and the single worst thing this file
--        could contain.
--      · `result_fn` -> `hr.wf_result_unimplemented`, which RETURNS `verified:false`. §0 law 5:
--        a step whose real-world effect is external completes on a recorded, inspectable RESULT.
--        A stub returning `verified:true` is precisely the failed-access-shutoff-self-completes
--        defect AR2 exists to prevent. This stub is also what §8.3's deliberately-failed shutoff
--        proof exercises.
--      · `digest_fn` -> `hr.wf_digest_whole_row`, a digest over EVERY column of the target except
--        the audit trio. This is not a permissive stub, it is the STRICTEST possible digest: a
--        pillar's own `digest_fn` narrows it to the decision-relevant fields, so the generic one
--        can only over-trigger `on_target_change`, never under-trigger it. Fail-closed for a digest
--        means "treat every change as material", and that is what it does.
--      · `validate_fn` / `conflict_fn` / `compensate_fn` are NULLABLE in §1.1. An unbuilt pillar
--        declares NULL — the spec's own "this flow declares no such hook" — rather than a stub.
--        A refusing validate stub would make every flow permanently un-submittable and a refusing
--        conflict stub would make every step permanently un-decidable, which is not fail-closed,
--        it is fail-dead. NULL is the honest value and it is visible in the roster.
--
-- 2. THE ENGINE ENQUEUES NOTIFICATIONS, IT DOES NOT SEND THEM (§6.1, "no feature builds its own
--    notifier"). `hr._wf_notify` inserts `communication.notification` rows in `pending` with
--    `target_kind='hr_workflow_step'` + `target_id` + `deep_link` (the columns HRB-001 landed) and
--    the §1.7 payload keys, one row per resolved channel from the event's `default_channels`
--    overlaid by the flow type's `channel_policy` (SPEC-NOTIFICATIONS §8 D2). aidream's dispatcher
--    claims and sends them. The engine never touches an adapter and never writes a notice table.
--
-- 3. THE APPROVER GRANT IS A BYTE-FOR-BYTE COPY OF `workspace._sync_task_assignee_grant` (§1.3).
--    `iam.permissions(resource_type='hr_workflow_instance', granted_to_user_id, permission_level=
--    'editor', review_note='auto:wf_step:<step_id>')`, inserted on activation and DELETED on close.
--    This is not a new access primitive; AD-2 is satisfied because the mechanism already exists and
--    is already the live pattern for exactly this problem. G-EXPIRES being green (HRB-007) is what
--    makes it safe to lean on `iam.permissions` for timed reach at all.
--
-- 4. THE RESTRICTED-TIER PROJECTION IS CONTENTLESS AND THE ENGINE, NOT THE CALLER, DECIDES.
--    §5.1: a `restricted` flow type projects a title with no name and no amount. That is computed
--    here from `flow_type.sensitivity_tier`, so a future caller cannot pass a leaky title. The
--    contentful title never exists outside `hr.workflow_step`.
--
-- 5. `wf_activate_step` RAISES-EQUIVALENT (opens `definition_invalid` and leaves the step
--    `unroutable`) RATHER THAN DEFAULTING TO APPLY WHEN THE AUTONOMY LADDER RESOLVES TO NOTHING.
--    Autonomy policy rule 8, §7.3, §10 test 9. Concretely: a step whose `autonomy_mode` exceeds its
--    flow type's `ai_ceiling` (mode 1/2 under an `advisory` ceiling) is a definition defect and the
--    step never activates. It does not silently drop to mode 4 either — a definition that says
--    something impossible is fixed, not reinterpreted.
--
-- 6. A MODE-1/2 STEP NEVER RESOLVES AN APPROVER, AND A RULE THAT DOES NOT FIRE SKIPS THE STEP.
--    §7.1 modes 1 and 2 are *deterministic rule evaluation, not a model call*. Nobody is being
--    asked anything, so routing such a step would issue a grant and an inbox row for a decision
--    that will never be taken. Fired -> `auto_approved` with a REAL decision row carrying
--    `actor_type='automation'`, `rule_key`, `rule_version` and a `calculation_snapshot`. Not fired
--    -> `skipped` with `state_reason='auto_rule_not_met'`, and the flow continues to the human step
--    behind it, which is exactly §8.1's "any condition false -> manager approval". A rule with no
--    predicate at all does NOT fire (autonomy policy rule 8: the ladder resolving to nothing never
--    means apply).
-- ===================================================================================

-- ============================================================ 1. the ledger writers
create or replace function hr._wf_event(p_instance uuid, p_step uuid, p_kind text,
                                        p_from text default null, p_to text default null,
                                        p_actor_type text default 'automation',
                                        p_actor_user uuid default null,
                                        p_actor_emp uuid default null,
                                        p_detail jsonb default '{}')
returns uuid language plpgsql security definer set search_path to 'hr','public' as $fn$
declare v_id uuid; v_org uuid;
begin
  select organization_id into v_org from hr.workflow_instance where id = p_instance;
  perform set_config('hr.privileged_write','on',true);
  insert into hr.workflow_event (organization_id, workflow_instance_id, workflow_step_id, event_kind,
                                 from_state, to_state, actor_type, actor_user_id, actor_employment_id,
                                 detail)
  values (v_org, p_instance, p_step, p_kind, p_from, p_to, p_actor_type, p_actor_user, p_actor_emp,
          coalesce(p_detail,'{}'::jsonb))
  returning id into v_id;
  return v_id;
end $fn$;

create or replace function hr._wf_failure(p_instance uuid, p_step uuid, p_class text,
                                          p_detail jsonb default '{}')
returns uuid language plpgsql security definer set search_path to 'hr','public' as $fn$
declare v_id uuid; v_org uuid; v_assignee uuid;
begin
  select organization_id into v_org from hr.workflow_instance where id = p_instance;
  -- default assignee: the first hr_owner / hr_admin role holder in the org. A failure with no
  -- assignee is an unworked queue, which §1.8 says is not what this table is.
  select ra.employment_id into v_assignee
    from hr.role_assignment ra
   where ra.organization_id = v_org and ra.is_active and ra.revoked_at is null
     and ra.role_key in ('hr_owner','hr_admin')
   order by case ra.role_key when 'hr_owner' then 0 else 1 end, ra.created_at
   limit 1;

  perform set_config('hr.privileged_write','on',true);
  insert into hr.workflow_failure (organization_id, workflow_instance_id, workflow_step_id,
                                   failure_class, detail, assigned_employment_id)
  values (v_org, p_instance, p_step, p_class, coalesce(p_detail,'{}'::jsonb), v_assignee)
  returning id into v_id;

  perform hr._wf_event(p_instance, p_step, 'failed', null, null, 'automation', null, null,
                       jsonb_build_object('failure_id', v_id, 'failure_class', p_class,
                                          'detail', p_detail));
  perform hr._wf_notify(p_instance, p_step, 'hr.workflow.failure_raised', 'failure',
                        hr._wf_login_of(v_assignee), v_assignee,
                        jsonb_build_object('failure_class', p_class, 'failure_id', v_id));
  return v_id;
end $fn$;

-- ============================================================ 2. the notification emitter (§6)
create or replace function hr._wf_notify(p_instance uuid, p_step uuid, p_event_key text,
                                         p_notice_kind text, p_user uuid, p_employment uuid,
                                         p_extra jsonb default '{}')
returns integer language plpgsql security definer set search_path to 'hr','public' as $fn$
declare
  inst hr.workflow_instance%rowtype; ft hr.workflow_flow_type%rowtype;
  v_channels jsonb; v_policy jsonb; ch text; v_n integer := 0; v_link text; v_payload jsonb;
begin
  if p_user is null then return 0; end if;
  select * into inst from hr.workflow_instance where id = p_instance;
  if not found then return 0; end if;
  select * into ft from hr.workflow_flow_type
   where flow_key = inst.flow_key and deleted_at is null
   order by (organization_id = inst.organization_id) desc limit 1;

  -- the event's platform default, overlaid by the org rung, overlaid by the flow type's
  -- channel_policy (SPEC-NOTIFICATIONS §8 D2 / RECORDED DECISION 2)
  select coalesce(o.default_channels, t.default_channels, '["in_app"]'::jsonb) into v_channels
    from communication.notification_event_type t
    left join communication.notification_event_override o
           on o.event_key = t.event_key and o.organization_id = inst.organization_id
          and o.deleted_at is null
   where t.event_key = p_event_key and t.deleted_at is null
   limit 1;
  if v_channels is null then v_channels := '["in_app"]'::jsonb; end if;
  v_policy := coalesce(ft.channel_policy, '{}'::jsonb);

  -- §6.2: the deep link resolves to THE EXACT ACTIONABLE OBJECT, not a module landing page.
  v_link := '/hr/tasks/' || p_instance::text || coalesce('?step=' || p_step::text, '');

  v_payload := coalesce(p_extra,'{}'::jsonb) || jsonb_build_object(
    'instance_id', p_instance, 'step_id', p_step, 'flow_key', inst.flow_key,
    'target_token', inst.target_token, 'target_id', inst.target_id,
    'notice_kind', p_notice_kind, 'deep_link', v_link,
    'employment_id', p_employment, 'sensitivity_tier', inst.sensitivity_tier);

  for ch in select jsonb_array_elements_text(v_channels) loop
    -- deny wins over the event default; that is how "a pay change should not arrive by text"
    -- becomes data instead of prose.
    continue when coalesce(v_policy ->> ch, 'default') = 'deny';
    insert into communication.notification
      (organization_id, event_key, recipient_user_id, recipient_kind, channel, payload,
       target_kind, target_id, deep_link, dedupe_key, visibility)
    values (inst.organization_id, p_event_key, p_user, 'user', ch, v_payload,
            'hr_workflow_step', p_step, v_link,
            'hrwf:' || coalesce(p_step::text, p_instance::text) || ':' || p_user::text
                    || ':' || p_notice_kind || ':' || ch,
            'personal'::platform.visibility)
    on conflict do nothing;
    v_n := v_n + 1;
  end loop;

  -- a channel the policy explicitly ALLOWS but the event default omits
  for ch in select k from jsonb_each_text(v_policy) e(k,val) where val = 'allow' loop
    continue when v_channels @> to_jsonb(ch);
    insert into communication.notification
      (organization_id, event_key, recipient_user_id, recipient_kind, channel, payload,
       target_kind, target_id, deep_link, dedupe_key, visibility)
    values (inst.organization_id, p_event_key, p_user, 'user', ch, v_payload,
            'hr_workflow_step', p_step, v_link,
            'hrwf:' || coalesce(p_step::text, p_instance::text) || ':' || p_user::text
                    || ':' || p_notice_kind || ':' || ch,
            'personal'::platform.visibility)
    on conflict do nothing;
    v_n := v_n + 1;
  end loop;

  return v_n;
end $fn$;

-- ============================================================ 3. the fail-closed hook stubs (RD 1)
create or replace function hr.wf_digest_whole_row(p_target_token text, p_target_id uuid)
returns text language plpgsql stable security definer set search_path to 'hr','public' as $fn$
declare v_tbl text; v_row jsonb;
begin
  v_tbl := hr._wf_target_table(p_target_token);
  if v_tbl is null then return null; end if;
  execute format('select to_jsonb(t) from %I.%I t where t.id = $1',
                 split_part(v_tbl,'.',1), split_part(v_tbl,'.',2))
     into v_row using p_target_id;
  if v_row is null then return null; end if;
  -- audit/bookkeeping columns are not material: a `_touch_row` bump is not a change of substance.
  v_row := v_row - 'updated_at' - 'updated_by' - 'version' - 'created_at' - 'created_by'
                 - 'workflow_instance_id';
  return encode(digest(convert_to(jsonb_pretty(v_row), 'UTF8'), 'sha256'), 'hex');
end $fn$;

comment on function hr.wf_digest_whole_row is
  'SPEC-WORKFLOW-ENGINE §3.4 generic digest — every column of the target except the audit trio. The STRICTEST possible digest_fn: a pillar narrows it to its decision-relevant fields, so this one can only over-trigger on_target_change, never under-trigger it.';

create or replace function hr.wf_apply_unimplemented(p_instance_id uuid)
returns jsonb language plpgsql security definer set search_path to 'hr','public' as $fn$
declare v_flow text;
begin
  select flow_key into v_flow from hr.workflow_instance where id = p_instance_id;
  return jsonb_build_object(
    'ok', false, 'failure_class', 'apply_failed',
    'reason', 'pillar_lane_not_built',
    'detail', format('flow %s has no apply_fn: its owning pillar lane has not been built. The engine refuses to record an effect that did not happen.', v_flow));
end $fn$;

comment on function hr.wf_apply_unimplemented is
  'FAIL-CLOSED apply stub for a flow whose pillar lane is not built. RETURNS a named failure so the instance goes applying -> failed with an apply_failed row. It never returns success: recording an effect that did not happen is the worst failure this engine could have.';

create or replace function hr.wf_result_unimplemented(p_step_id uuid)
returns jsonb language plpgsql security definer set search_path to 'hr','public' as $fn$
begin
  return jsonb_build_object(
    'verified', false, 'reason', 'pillar_lane_not_built',
    'detail', 'no result probe is declared for this step; an external effect is never assumed (§0 law 5)');
end $fn$;

comment on function hr.wf_result_unimplemented is
  'FAIL-CLOSED result probe. Always verified:false, so an external-effect step can never self-complete because an event fired (AR2 / §0 law 5).';

-- ============================================================ 4. hook invocation
create or replace function hr._wf_call_digest(p_flow_key text, p_org uuid,
                                              p_target_token text, p_target_id uuid)
returns text language plpgsql security definer set search_path to 'hr','public' as $fn$
declare v_fn regprocedure; v_out text;
begin
  select digest_fn into v_fn from hr.workflow_flow_type
   where flow_key = p_flow_key and deleted_at is null
   order by (organization_id = p_org) desc limit 1;
  if v_fn is null then return hr.wf_digest_whole_row(p_target_token, p_target_id); end if;
  execute format('select %s($1,$2)', v_fn::regproc::text) into v_out
    using p_target_token, p_target_id;
  return v_out;
end $fn$;

create or replace function hr._wf_call_hook(p_fn regprocedure, p_arg uuid)
returns jsonb language plpgsql security definer set search_path to 'hr','public' as $fn$
declare v_out jsonb;
begin
  if p_fn is null then return null; end if;
  execute format('select %s($1)', p_fn::regproc::text) into v_out using p_arg;
  return v_out;
exception when others then
  -- §1.8: `validate_fn` RAISED rather than returning findings is its own failure class. Every hook
  -- that raises is converted here into a structured result so no caller has to guess.
  return jsonb_build_object('ok', false, 'raised', true, 'sqlstate', sqlstate, 'detail', sqlerrm);
end $fn$;

-- ============================================================ 5. grants + task projection (§1.3, §5)
create or replace function hr._wf_grant_step(p_step uuid)
returns integer language plpgsql security definer set search_path to 'hr','public' as $fn$
declare st hr.workflow_step%rowtype; u uuid; v_n integer := 0;
begin
  select * into st from hr.workflow_step where id = p_step;
  foreach u in array st.resolved_user_ids loop
    insert into iam.permissions (resource_type, resource_id, granted_to_user_id, permission_level,
                                 status, review_note)
    select 'hr_workflow_instance', st.workflow_instance_id, u, 'editor'::permission_level,
           'active', 'auto:wf_step:' || p_step::text
     where not exists (select 1 from iam.permissions p
                        where p.resource_type = 'hr_workflow_instance'
                          and p.resource_id = st.workflow_instance_id
                          and p.granted_to_user_id = u
                          and p.review_note = 'auto:wf_step:' || p_step::text);
    v_n := v_n + 1;
  end loop;
  return v_n;
end $fn$;

create or replace function hr._wf_revoke_step(p_step uuid)
returns integer language plpgsql security definer set search_path to 'hr','public' as $fn$
declare v_n integer;
begin
  delete from iam.permissions
   where resource_type = 'hr_workflow_instance' and review_note = 'auto:wf_step:' || p_step::text;
  get diagnostics v_n = row_count;
  return v_n;
end $fn$;

create or replace function hr._wf_project_step(p_step uuid)
returns integer language plpgsql security definer set search_path to 'hr','public' as $fn$
declare
  st hr.workflow_step%rowtype; inst hr.workflow_instance%rowtype; ft hr.workflow_flow_type%rowtype;
  sd hr.workflow_step_definition%rowtype;
  u uuid; v_n integer := 0; v_title text; v_subject text; v_task uuid;
begin
  if not (hr._knob('hr.workflow','inbox_project_tasks') #>> '{}')::boolean then return 0; end if;
  select * into st   from hr.workflow_step where id = p_step;
  select * into inst from hr.workflow_instance where id = st.workflow_instance_id;
  select * into sd   from hr.workflow_step_definition where id = st.step_definition_id;
  select * into ft   from hr.workflow_flow_type where flow_key = inst.flow_key and deleted_at is null
   order by (organization_id = inst.organization_id) desc limit 1;

  -- RECORDED DECISION 4: the restricted tier projects a DELIBERATELY CONTENTLESS title. No name,
  -- no amount — workspace.tasks is internal-visibility machinery and the sensitivity split must
  -- survive the projection.
  if inst.sensitivity_tier = 'restricted' then
    v_title := coalesce(ft.label, inst.flow_key) || ' — 1 item';
  else
    select coalesce(e.display_name, e.preferred_first_name || ' ' || e.legal_last_name,
                    e.legal_first_name || ' ' || e.legal_last_name)
      into v_subject
      from hr.employment em join hr.employee e on e.id = em.employee_id
     where em.id = inst.subject_employment_id;
    v_title := coalesce(ft.label, inst.flow_key) || coalesce(' — ' || v_subject, '');
  end if;

  foreach u in array st.resolved_user_ids loop
    v_task := public.wsp_upsert_system_task(
      p_dedupe_key      => 'hrwf:' || p_step::text || ':' || u::text,
      p_title           => v_title,
      p_description     => sd.label,
      p_origin          => 'system',
      p_source_type     => 'hr_workflow_step',
      p_source_id       => p_step::text,
      p_source_url      => '/hr/tasks/' || inst.id::text || '?step=' || p_step::text,
      p_source_label    => 'HR approvals',
      p_due_date        => st.due_at::date,
      p_priority        => inst.priority,
      p_assignee_id     => u,
      p_organization_id => inst.organization_id,
      p_metadata        => jsonb_build_object('flow_key', inst.flow_key, 'instance_id', inst.id,
                                              'sensitivity_tier', inst.sensitivity_tier));
    v_n := v_n + 1;
    if st.workspace_task_id is null and v_task is not null then
      perform set_config('hr.privileged_write','on',true);
      update hr.workflow_step set workspace_task_id = v_task where id = p_step;
    end if;
  end loop;
  return v_n;
exception when others then
  -- the projection is DISPOSABLE and regenerable from hr.workflow_step at any time (§5.1). It must
  -- never be able to block an approval; a broken projection is a defect, not a stall.
  perform hr._wf_event(st.workflow_instance_id, p_step, 'projection_failed', null, null,
                       'automation', null, null,
                       jsonb_build_object('sqlstate', sqlstate, 'detail', sqlerrm));
  return 0;
end $fn$;

create or replace function hr._wf_unproject_step(p_step uuid, p_outcome text default 'completed')
returns integer language plpgsql security definer set search_path to 'hr','public' as $fn$
declare st hr.workflow_step%rowtype; u uuid; v_n integer := 0; v_org uuid;
begin
  select * into st from hr.workflow_step where id = p_step;
  if not found then return 0; end if;
  v_org := st.organization_id;
  foreach u in array st.resolved_user_ids loop
    begin
      perform public.wsp_resolve_system_task('hrwf:' || p_step::text || ':' || u::text,
                                             p_outcome, v_org);
      v_n := v_n + 1;
    exception when others then null;
    end;
  end loop;
  return v_n;
end $fn$;

-- ============================================================ 5a. deterministic auto-decision (§7.1)
-- 🚨 THE AUTO-DECIDE RULE IS THE SAME DECLARATIVE PREDICATE `condition` USES, PLUS A VERSIONED KEY.
-- §9.4 lists the leave rule as dotted knobs (`auto_decide_rule.max_hours`, `.min_notice_days`,
-- `.leave_types`, `.min_coverage_pct`). Teaching the engine what `max_hours` MEANS for leave and
-- something else for scheduling is per-flow code, and §0 law 3 forbids exactly that ("there is no
-- IF flow_type = 'leave' THEN ... anywhere in code"). So those knob names become LEAVES of the
-- §2.4 predicate — `{"rule_key":..,"rule_version":..,"when":{"all":[{"field":"payload.total_hours",
-- "op":"<=","value":8}, ...]}}` — evaluated by the one evaluator, over the one context, with the
-- evaluated context stored as the decision's `calculation_snapshot` (AR2 LOCK 6). Configuration
-- stays configuration and the engine stays flow-agnostic.
-- OWED: SPEC-WORKFLOW-ENGINE §9.4's four `auto_decide_rule.*` rows record the predicate shape.
create or replace function hr._wf_auto_decide(p_step uuid, p_ctx jsonb)
returns jsonb language plpgsql security definer set search_path to 'hr','public' as $fn$
declare sd hr.workflow_step_definition%rowtype; v_rule jsonb; v_when jsonb; v_fired boolean;
begin
  select sd2.* into sd from hr.workflow_step_definition sd2
    join hr.workflow_step s on s.step_definition_id = sd2.id where s.id = p_step;
  v_rule := coalesce(sd.auto_decide_rule, '{}'::jsonb);
  if v_rule = '{}'::jsonb then
    -- autonomy policy rule 8: the ladder resolving to NOTHING never means "apply".
    return jsonb_build_object('fired', false, 'reason', 'no_rule_declared');
  end if;
  v_when := coalesce(v_rule -> 'when', '{}'::jsonb);
  if v_when = '{}'::jsonb then
    return jsonb_build_object('fired', false, 'reason', 'rule_has_no_predicate');
  end if;
  v_fired := hr._wf_condition_met(v_when, p_ctx);
  return jsonb_build_object(
    'fired', v_fired,
    'rule_key', coalesce(v_rule ->> 'rule_key', sd.step_key || '_auto'),
    'rule_version', coalesce(v_rule ->> 'rule_version', sd.auto_decide_rule_version, '1'),
    'snapshot', jsonb_build_object('predicate', v_when, 'context', p_ctx, 'result', v_fired));
end $fn$;

-- ============================================================ 6. step activation (§3.2, §7.3)
create or replace function hr.wf_activate_step(p_step uuid, p_exclude uuid[] default '{}')
returns jsonb language plpgsql security definer set search_path to 'hr','public' as $fn$
declare
  st hr.workflow_step%rowtype; sd hr.workflow_step_definition%rowtype;
  inst hr.workflow_instance%rowtype; defn hr.workflow_definition%rowtype;
  ft hr.workflow_flow_type%rowtype;
  v_res jsonb; v_ctx jsonb; v_sla integer; v_needed integer; v_users uuid[]; v_cands uuid[];
  v_mode integer; v_lead integer; u uuid;
begin
  select * into st from hr.workflow_step where id = p_step;
  if not found then
    return jsonb_build_object('granted', false, 'reason', 'step_not_found');
  end if;
  if st.state not in ('pending','unroutable') then
    return jsonb_build_object('granted', false, 'reason', 'WF_STEP_CLOSED',
                              'detail', format('step is %s, not pending', st.state));
  end if;
  select * into sd   from hr.workflow_step_definition where id = st.step_definition_id;
  select * into inst from hr.workflow_instance        where id = st.workflow_instance_id;
  select * into defn from hr.workflow_definition      where id = inst.workflow_definition_id;
  select * into ft   from hr.workflow_flow_type where flow_key = inst.flow_key and deleted_at is null
   order by (organization_id = inst.organization_id) desc limit 1;

  perform set_config('hr.privileged_write','on',true);

  -- ---- §2.4 conditional routing. A false condition SKIPS the step but leaves the row, so the
  -- history shows what did NOT apply and why.
  v_ctx := jsonb_build_object(
    'payload', inst.payload, 'rule_snapshot', inst.rule_snapshot,
    'subject', coalesce((select jsonb_build_object(
                            'employment_id', em.id, 'status', em.status,
                            'pay_group_id', em.pay_group_id,
                            'department_id', pa.department_id, 'location_id', pa.location_id,
                            'crew_id', pa.crew_id)
                          from hr.employment em
                          left join hr.primary_position_as_of(em.id, current_date) pa on true
                         where em.id = inst.subject_employment_id), '{}'::jsonb),
    'computed', jsonb_build_object('sensitivity_tier', inst.sensitivity_tier));

  if not hr._wf_condition_met(sd.condition, v_ctx) then
    update hr.workflow_step
       set state = 'skipped', state_reason = 'condition_false', closed_at = now()
     where id = p_step;
    perform hr._wf_event(inst.id, p_step, 'step_skipped', 'pending', 'skipped', 'automation',
                         null, null, jsonb_build_object('condition', sd.condition));
    return jsonb_build_object('granted', true, 'state', 'skipped', 'reason', 'condition_false');
  end if;

  -- ---- RECORDED DECISION 5 / autonomy policy rule 8: the ladder must resolve to something legal.
  v_mode := sd.autonomy_mode;
  if ft.ai_ceiling = 'advisory' and v_mode in (1,2) then
    update hr.workflow_step set state = 'unroutable',
           state_reason = 'autonomy_mode_exceeds_ai_ceiling' where id = p_step;
    perform hr._wf_failure(inst.id, p_step, 'definition_invalid',
      jsonb_build_object('autonomy_mode', v_mode, 'ai_ceiling', ft.ai_ceiling,
        'detail', 'a step may not auto-decide under an advisory AI ceiling; the definition is wrong and is not reinterpreted'));
    return jsonb_build_object('granted', false, 'reason', 'definition_invalid',
                              'detail', 'autonomy_mode exceeds the flow type''s ai_ceiling');
  end if;
  if ft.ai_ceiling = 'none' and sd.recommend_mandate_key is not null then
    update hr.workflow_step set state = 'unroutable',
           state_reason = 'recommendation_under_none_ceiling' where id = p_step;
    perform hr._wf_failure(inst.id, p_step, 'definition_invalid',
      jsonb_build_object('ai_ceiling','none','recommend_mandate_key', sd.recommend_mandate_key));
    return jsonb_build_object('granted', false, 'reason', 'definition_invalid',
                              'detail', 'a recommendation Mandate is declared under an ai_ceiling of none');
  end if;
  if v_mode = 5 then
    update hr.workflow_step set state = 'skipped', state_reason = 'autonomy_mode_off',
           closed_at = now() where id = p_step;
    perform hr._wf_event(inst.id, p_step, 'step_skipped', 'pending', 'skipped');
    return jsonb_build_object('granted', true, 'state', 'skipped', 'reason', 'autonomy_mode_off');
  end if;

  -- ---- RECORDED DECISION 6: modes 1 and 2 are DETERMINISTIC RULE EVALUATION and never resolve an
  -- approver at all. A rule that fires closes the step `auto_approved` with a real decision row; a
  -- rule that does not fire SKIPS the step and the flow continues to the human step behind it
  -- (§8.1's "any condition false -> manager approval"). Neither outcome asks anybody anything, so
  -- routing a mode-1/2 step would open a grant and an inbox row for a decision that is not needed.
  if v_mode in (1,2) then
    declare v_auto jsonb;
    begin
      v_auto := hr._wf_auto_decide(p_step, v_ctx);
      if coalesce((v_auto ->> 'fired')::boolean, false) then
        insert into hr.workflow_decision
          (organization_id, workflow_instance_id, workflow_step_id, step_key, decision, reason,
           actor_type, approval_basis, autonomy_mode, rule_key, rule_version, calculation_snapshot)
        values (inst.organization_id, inst.id, p_step, st.step_key, 'approved',
                'the organisation''s auto-approval rule was satisfied',
                'automation', 'auto_rule', v_mode,
                v_auto ->> 'rule_key', v_auto ->> 'rule_version',
                coalesce(v_auto -> 'snapshot','{}'::jsonb));
        update hr.workflow_step set activated_at = now(), approvals_needed = 0,
               approvals_received = 0 where id = p_step;
        perform hr._wf_event(inst.id, p_step, 'auto_decided', 'pending', 'auto_approved',
                             'automation', null, null, v_auto);
        perform hr._wf_close_step(p_step, 'auto_approved', v_auto ->> 'rule_key');
        return jsonb_build_object('granted', true, 'state', 'auto_approved', 'rule', v_auto);
      end if;
      update hr.workflow_step set state = 'skipped', state_reason = 'auto_rule_not_met',
             closed_at = now() where id = p_step;
      perform hr._wf_event(inst.id, p_step, 'step_skipped', 'pending', 'skipped', 'automation',
                           null, null, v_auto);
      return jsonb_build_object('granted', true, 'state', 'skipped', 'reason', 'auto_rule_not_met',
                                'rule', v_auto);
    end;
  end if;

  -- ---- resolve the approvers (§2.2)
  v_res := hr.wf_resolve_approvers(p_step, p_exclude);
  if not (v_res ->> 'granted')::boolean then
    update hr.workflow_step set state = 'unroutable', state_reason = v_res ->> 'reason',
           resolution_evidence = coalesce(v_res -> 'evidence','{}'::jsonb)
     where id = p_step;
    perform hr._wf_failure(inst.id, p_step, v_res ->> 'reason',
                           coalesce(v_res -> 'evidence','{}'::jsonb) ||
                           jsonb_build_object('detail', v_res ->> 'detail'));
    return v_res;
  end if;

  select coalesce(array_agg((x)::uuid),'{}'::uuid[]) into v_cands
    from jsonb_array_elements_text(v_res -> 'candidates') x;
  select coalesce(array_agg((x)::uuid),'{}'::uuid[]) into v_users
    from jsonb_array_elements_text(v_res -> 'user_ids') x;

  v_needed := case sd.quorum_kind
                when 'all'    then greatest(cardinality(v_cands), 1)
                when 'any'    then 1
                when 'n_of_m' then coalesce(sd.quorum_n, 1)
                else 1 end;

  v_sla := coalesce(sd.sla_hours, defn.sla_hours,
                    (hr._knob('hr.workflow','default_step_sla_hours') #>> '{}')::integer);
  v_lead := (hr._knob('hr.workflow','timeout_warning_lead_hours') #>> '{}')::integer;

  update hr.workflow_step
     set state                 = case when (v_res ->> 'resolution_path') = 'external_result'
                                      then 'awaiting_result' else 'active' end,
         state_reason          = null,
         quorum_kind           = sd.quorum_kind,
         quorum_n              = sd.quorum_n,
         approvals_needed      = v_needed,
         resolved_approver_ids = v_cands,
         resolved_user_ids     = v_users,
         resolution_path       = v_res ->> 'resolution_path',
         resolution_evidence   = coalesce(v_res -> 'evidence','{}'::jsonb),
         activated_at          = now(),
         due_at                = now() + make_interval(hours => v_sla),
         autonomy_mode         = v_mode,
         -- mode 3: the timeout moment is set AND displayed. Policy rule 4 — a timeout must be
         -- visible before it fires, which is why the warning lead is stored as a real column.
         timeout_at            = case when v_mode = 3
                                      then now() + make_interval(hours => v_sla) else null end,
         result_due_at         = case when (v_res ->> 'resolution_path') = 'external_result'
                                      then now() + make_interval(hours =>
                                           coalesce(sd.result_window_hours,
                                                    (hr._knob('hr.workflow','failure_result_window_hours') #>> '{}')::integer))
                                      else null end
   where id = p_step;

  select * into st from hr.workflow_step where id = p_step;

  perform hr._wf_grant_step(p_step);
  perform hr._wf_project_step(p_step);
  perform hr._wf_event(inst.id, p_step, 'step_activated', 'pending', st.state, 'automation',
                       null, null, jsonb_build_object('resolution_path', st.resolution_path,
                                                      'approvers', to_jsonb(v_cands),
                                                      'quorum_needed', v_needed));
  foreach u in array v_users loop
    perform hr._wf_notify(inst.id, p_step, 'hr.workflow.step_assigned', 'assigned', u, null,
                          jsonb_build_object('due_at', st.due_at, 'timeout_at', st.timeout_at,
                                             'timeout_warning_lead_hours', v_lead));
  end loop;

  return jsonb_build_object('granted', true, 'state', st.state, 'step_id', p_step,
                            'resolution_path', st.resolution_path,
                            'approvers', to_jsonb(v_cands), 'user_ids', to_jsonb(v_users),
                            'due_at', st.due_at, 'timeout_at', st.timeout_at);
end $fn$;

-- ============================================================ 7. routing — open the next wave (§3.2)
create or replace function hr._wf_route(p_instance uuid)
returns jsonb language plpgsql security definer set search_path to 'hr','public' as $fn$
declare
  inst hr.workflow_instance%rowtype; v_next integer; r record; v_opened integer := 0;
  v_res jsonb; v_any_active boolean := false;
begin
  select * into inst from hr.workflow_instance where id = p_instance;
  perform set_config('hr.privileged_write','on',true);

  loop
    select min(step_order) into v_next from hr.workflow_step
     where workflow_instance_id = p_instance and state = 'pending';
    if v_next is null then
      -- nothing left to open: the instance's fate is the join of its closed steps
      return hr._wf_join(p_instance);
    end if;

    -- ALL steps sharing a parallel_group at the same step_order activate together (§3.2)
    for r in select id from hr.workflow_step
              where workflow_instance_id = p_instance and state = 'pending' and step_order = v_next
              order by step_key
    loop
      v_res := hr.wf_activate_step(r.id);
      v_opened := v_opened + 1;
      if (v_res ->> 'granted')::boolean
         and coalesce(v_res ->> 'state','') in ('active','awaiting_result') then
        v_any_active := true;
      elsif not (v_res ->> 'granted')::boolean then
        -- an unroutable/invalid step blocks the instance; the failure row is already open
        update hr.workflow_instance
           set state = 'failed', state_reason = v_res ->> 'reason' where id = p_instance;
        return v_res;
      end if;
    end loop;

    update hr.workflow_instance set current_step_order = v_next, state = 'active'
     where id = p_instance;

    -- every step in this wave skipped (condition false / mode 5) -> immediately try the next wave
    exit when v_any_active;
  end loop;

  return jsonb_build_object('granted', true, 'state', 'active', 'step_order', v_next,
                            'steps_opened', v_opened);
end $fn$;

-- forward declaration satisfied in file 4; a stub here keeps _wf_route creatable and is REPLACED,
-- not shadowed, by the real join.
create or replace function hr._wf_join(p_instance uuid)
returns jsonb language plpgsql security definer set search_path to 'hr','public' as $fn$
begin
  return jsonb_build_object('granted', false, 'reason', 'join_not_installed',
    'detail', 'hr_c4_04 installs the real join; this placeholder must never be the live body');
end $fn$;

-- ============================================================ 8. hr.wf_request (§4.2)
create or replace function hr.wf_request(p_flow_key text, p_target_token text, p_target_id uuid,
                                         p_organization_id uuid, p_payload jsonb default '{}',
                                         p_subject_employment_id uuid default null,
                                         p_as_draft boolean default false,
                                         p_idempotency_key text default null)
returns jsonb language plpgsql security definer set search_path to 'hr','public' as $fn$
declare
  ft hr.workflow_flow_type%rowtype; defn hr.workflow_definition%rowtype;
  v_uid uuid := auth.uid(); v_requester uuid; v_inst uuid; v_existing uuid;
  v_tbl text; v_subject uuid; v_digest text; v_version integer; sd record; v_org uuid;
begin
  if v_uid is null then
    return jsonb_build_object('granted', false, 'reason', 'no_caller',
                              'detail', 'hr.wf_request requires an authenticated caller');
  end if;
  if p_organization_id is null then
    return jsonb_build_object('granted', false, 'reason', 'no_organization',
                              'detail', 'organization_id is explicit on every HR write (NO-NULL-ORG)');
  end if;

  -- ---- the flow type, nearest-wins (org row, else the platform row in the system org)
  select * into ft from hr.workflow_flow_type
   where flow_key = p_flow_key and deleted_at is null
   order by (organization_id = p_organization_id) desc limit 1;
  if not found then
    return jsonb_build_object('granted', false, 'reason', 'unknown_flow_type',
                              'detail', format('no flow type %s is declared', p_flow_key));
  end if;
  if not ft.is_active then
    return jsonb_build_object('granted', false, 'reason', 'flow_type_inactive',
      'detail', coalesce(ft.inactive_reason, format('flow type %s is not active', p_flow_key)));
  end if;
  if ft.target_token <> p_target_token then
    return jsonb_build_object('granted', false, 'reason', 'target_token_mismatch',
      'detail', format('flow %s targets %s, not %s', p_flow_key, ft.target_token, p_target_token));
  end if;

  -- ---- idempotency: a replay RETURNS the existing instance, it does not error (§4.2)
  if p_idempotency_key is not null then
    select id into v_existing from hr.workflow_instance
     where organization_id = p_organization_id and flow_key = p_flow_key
       and idempotency_key = p_idempotency_key;
    if v_existing is not null then
      return jsonb_build_object('granted', true, 'instance_id', v_existing, 'replayed', true);
    end if;
  end if;

  v_tbl := hr._wf_target_table(p_target_token);
  if v_tbl is null then
    return jsonb_build_object('granted', false, 'reason', 'definition_invalid',
      'detail', format('%s is not a registered active entity type', p_target_token));
  end if;

  -- ---- the target must exist, and its org must be the caller's org
  execute format('select organization_id, version from %I.%I where id = $1',
                 split_part(v_tbl,'.',1), split_part(v_tbl,'.',2))
     into v_org, v_version using p_target_id;
  if v_org is null then
    return jsonb_build_object('granted', false, 'reason', 'target_missing',
                              'detail', format('no %s row with id %s', p_target_token, p_target_id));
  end if;
  if v_org <> p_organization_id then
    return jsonb_build_object('granted', false, 'reason', 'cross_org',
                              'detail', 'the target belongs to a different organization');
  end if;

  -- ---- the requester is an EMPLOYMENT, never a bare person (§0.1 seam)
  select em.id into v_requester from hr.employment em
    join hr.employee e on e.id = em.employee_id
   where e.login_user_id = v_uid and em.organization_id = p_organization_id
     and em.deleted_at is null
   order by case em.status when 'active' then 0 else 1 end, em.created_at desc limit 1;
  if v_requester is null and ft.requester_kind = 'employment' then
    return jsonb_build_object('granted', false, 'reason', 'requester_not_employed',
      'detail', 'the caller holds no employment in this organization');
  end if;

  v_subject := coalesce(p_subject_employment_id,
                        hr._approval_subject(v_tbl, p_target_id),
                        v_requester);

  -- ---- the definition: the org's latest published one, else the platform default (§1.2)
  select * into defn from hr.workflow_definition
   where flow_key = p_flow_key and status = 'published' and deleted_at is null
     and organization_id in (p_organization_id, '39c38960-d30c-4840-b0c1-c9960de95582'::uuid)
   order by (organization_id = p_organization_id) desc, definition_version desc limit 1;
  if not found then
    return jsonb_build_object('granted', false, 'reason', 'no_published_definition',
      'detail', format('flow %s has no published routing definition in this org or the platform default', p_flow_key));
  end if;

  v_digest := hr._wf_call_digest(p_flow_key, p_organization_id, p_target_token, p_target_id);

  perform set_config('hr.privileged_write','on',true);
  begin
    insert into hr.workflow_instance
      (organization_id, flow_key, workflow_definition_id, definition_version,
       target_token, target_id, target_version, target_digest,
       requester_employment_id, subject_employment_id, requester_actor_type,
       state, payload, idempotency_key, sensitivity_tier, created_by, updated_by)
    values (p_organization_id, p_flow_key, defn.id, defn.definition_version,
            p_target_token, p_target_id, v_version, v_digest,
            v_requester, v_subject, 'employee',
            case when p_as_draft then 'draft' else 'validating' end,
            coalesce(p_payload,'{}'::jsonb), p_idempotency_key, ft.sensitivity_tier, v_uid, v_uid)
    returning id into v_inst;
  exception when unique_violation then
    select id into v_existing from hr.workflow_instance
     where organization_id = p_organization_id and flow_key = p_flow_key
       and idempotency_key = p_idempotency_key;
    if v_existing is not null then
      return jsonb_build_object('granted', true, 'instance_id', v_existing, 'replayed', true);
    end if;
    raise;
  end;

  -- ---- the exclusive binding. §1.6: a second open instance on the same (target, flow_key) fails
  -- at the DATABASE, not in application logic.
  begin
    insert into hr.workflow_binding (organization_id, workflow_instance_id, target_token, target_id,
                                     flow_key, is_open, exclusive)
    values (p_organization_id, v_inst, p_target_token, p_target_id, p_flow_key, true, true);
  exception when unique_violation then
    return jsonb_build_object('granted', false, 'reason', 'WF_BINDING_OPEN',
      'detail', format('an open %s already exists on this %s', p_flow_key, p_target_token),
      'existing_instance_id', (select workflow_instance_id from hr.workflow_binding
                                where target_token = p_target_token and target_id = p_target_id
                                  and flow_key = p_flow_key and is_open and exclusive));
  end;

  -- ---- materialise the steps from the pinned definition version (§1.2 publishing rule)
  for sd in select * from hr.workflow_step_definition
             where workflow_definition_id = defn.id and deleted_at is null
             order by step_order, step_key
  loop
    insert into hr.workflow_step
      (organization_id, workflow_instance_id, step_definition_id, step_key, step_order,
       parallel_group, state, quorum_kind, quorum_n, autonomy_mode)
    values (p_organization_id, v_inst, sd.id, sd.step_key, sd.step_order, sd.parallel_group,
            'pending', sd.quorum_kind, sd.quorum_n, sd.autonomy_mode);
  end loop;

  perform hr._wf_event(v_inst, null, 'created', null,
                       case when p_as_draft then 'draft' else 'validating' end,
                       'employee', v_uid, v_requester,
                       jsonb_build_object('definition_id', defn.id,
                                          'definition_version', defn.definition_version,
                                          'target_digest', v_digest));

  if p_as_draft then
    return jsonb_build_object('granted', true, 'instance_id', v_inst, 'state', 'draft');
  end if;
  return hr.wf_submit(v_inst);
end $fn$;

-- ============================================================ 9. hr.wf_submit (§3.1, §4.4)
create or replace function hr.wf_submit(p_instance_id uuid)
returns jsonb language plpgsql security definer set search_path to 'hr','public' as $fn$
declare
  inst hr.workflow_instance%rowtype; ft hr.workflow_flow_type%rowtype;
  v_uid uuid := auth.uid(); v_find jsonb; v_hard jsonb; v_res jsonb; v_mine uuid[];
begin
  select * into inst from hr.workflow_instance where id = p_instance_id;
  if not found then
    return jsonb_build_object('granted', false, 'reason', 'not_found');
  end if;
  if inst.state not in ('draft','validating') then
    return jsonb_build_object('granted', false, 'reason', 'WF_STEP_CLOSED',
      'detail', format('instance is %s; only a draft may be submitted', inst.state));
  end if;
  if inst.state = 'draft' and v_uid is not null then
    v_mine := hr.employments_of(v_uid);
    if not (inst.requester_employment_id = any(v_mine)) then
      return hr._governance_refusal(inst.organization_id, 'hr_workflow_instance', 'not_the_requester',
        'only the requester may submit their own draft', inst.subject_employment_id,
        ARRAY[p_instance_id]);
    end if;
  end if;

  select * into ft from hr.workflow_flow_type where flow_key = inst.flow_key and deleted_at is null
   order by (organization_id = inst.organization_id) desc limit 1;

  perform set_config('hr.privileged_write','on',true);
  update hr.workflow_instance
     set state = 'validating', submitted_at = coalesce(submitted_at, now())
   where id = p_instance_id;

  -- ---- §4.4 validate_fn: runs ONCE, at submit
  v_find := hr._wf_call_hook(ft.validate_fn, p_instance_id);
  if v_find is not null and coalesce((v_find ->> 'raised')::boolean, false) then
    update hr.workflow_instance set state = 'failed', state_reason = 'validate_fn_raised',
           validation_findings = v_find where id = p_instance_id;
    perform hr._wf_failure(p_instance_id, null, 'validation_error', v_find);
    return jsonb_build_object('granted', false, 'reason', 'validation_error', 'detail', v_find ->> 'detail');
  end if;

  if v_find is not null then
    update hr.workflow_instance set validation_findings = v_find where id = p_instance_id;
    v_hard := v_find -> 'hard';
    if v_hard is not null and jsonb_array_length(v_hard) > 0 then
      -- §4.4 / AD-11: the reason a request was NEVER ROUTED is itself evidence, and it is retained.
      update hr.workflow_instance
         set state = 'rejected_at_intake', state_reason = 'hard_validation_findings',
             decided_at = now(), closed_at = now()
       where id = p_instance_id;
      update hr.workflow_binding set is_open = false where workflow_instance_id = p_instance_id;
      perform hr._wf_event(p_instance_id, null, 'validated', 'validating', 'rejected_at_intake',
                           'automation', null, null, v_find);
      perform hr._wf_notify(p_instance_id, null, 'hr.workflow.request_decided', 'outcome',
                            hr._wf_login_of(inst.requester_employment_id),
                            inst.requester_employment_id,
                            jsonb_build_object('outcome', 'rejected_at_intake', 'findings', v_hard));
      return jsonb_build_object('granted', true, 'instance_id', p_instance_id,
                                'state', 'rejected_at_intake', 'findings', v_find);
    end if;
  end if;

  perform hr._wf_event(p_instance_id, null, 'submitted', 'draft', 'validating', 'employee', v_uid,
                       inst.requester_employment_id);
  perform hr._wf_event(p_instance_id, null, 'validated', 'validating', 'routing');
  update hr.workflow_instance set state = 'routing' where id = p_instance_id;

  perform hr._wf_notify(p_instance_id, null, 'hr.workflow.request_submitted', 'receipt',
                        hr._wf_login_of(inst.requester_employment_id), inst.requester_employment_id);

  v_res := hr._wf_route(p_instance_id);
  return jsonb_build_object('granted', coalesce((v_res ->> 'granted')::boolean, false),
                            'instance_id', p_instance_id,
                            'state', (select state from hr.workflow_instance where id = p_instance_id),
                            'routing', v_res);
end $fn$;

-- ============================================================ grants
do $$
declare f text;
begin
  foreach f in array ARRAY[
    'hr._wf_event(uuid,uuid,text,text,text,text,uuid,uuid,jsonb)',
    'hr._wf_failure(uuid,uuid,text,jsonb)',
    'hr._wf_notify(uuid,uuid,text,text,uuid,uuid,jsonb)',
    'hr.wf_digest_whole_row(text,uuid)',
    'hr.wf_apply_unimplemented(uuid)',
    'hr.wf_result_unimplemented(uuid)',
    'hr._wf_call_digest(text,uuid,text,uuid)',
    'hr._wf_call_hook(regprocedure,uuid)',
    'hr._wf_grant_step(uuid)', 'hr._wf_revoke_step(uuid)',
    'hr._wf_project_step(uuid)', 'hr._wf_unproject_step(uuid,text)',
    'hr._wf_auto_decide(uuid,jsonb)',
    'hr.wf_activate_step(uuid,uuid[])', 'hr._wf_route(uuid)', 'hr._wf_join(uuid)',
    'hr.wf_request(text,text,uuid,uuid,jsonb,uuid,boolean,text)',
    'hr.wf_submit(uuid)'] loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;

-- ============================================================ assertions
do $$
declare v_n integer; v_out jsonb;
begin
  -- the fail-closed stubs are fail-closed
  v_out := hr.wf_apply_unimplemented(gen_random_uuid());
  if (v_out ->> 'ok')::boolean then
    raise exception 'hr_c4_03: the apply stub returned success — it must never';
  end if;
  if v_out ->> 'reason' <> 'pillar_lane_not_built' then
    raise exception 'hr_c4_03: the apply stub did not name its reason';
  end if;
  v_out := hr.wf_result_unimplemented(gen_random_uuid());
  if (v_out ->> 'verified')::boolean then
    raise exception 'hr_c4_03: the result stub returned verified — an external effect is never assumed';
  end if;

  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname like 'wf%' or (n.nspname='hr' and p.proname like '\_wf%');
  if v_n < 15 then raise exception 'hr_c4_03: only % wf functions installed', v_n; end if;
end $$;
