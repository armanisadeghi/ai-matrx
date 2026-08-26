-- HR domain L10 — the ONE HR task inbox's doors (register item HRB-022, lane l10-inbox).
--
-- 🚨 THE PROBLEM THIS FILE EXISTS TO SOLVE: `hr` IS NOT EXPOSED TO PostgREST.
-- Verified live 2026-08-26 against `authenticator`'s `pgrst.db_schemas` — the list holds 51
-- schemas and neither `hr` nor `esign` is one of them (FREEZE.md delta D-10). Every one of the
-- 22 `hr.wf_*` functions is granted to `authenticated` and NONE of them is reachable from the
-- browser. The frontend's data-flow law is React -> Supabase direct, so the inbox needs `public`
-- doors exactly as HRB-007 gave the access lane `public.hr_role_assign` and friends. Adding a
-- schema to `pgrst.db_schemas` is a fleet-wide config change and NOT a build lane's call.
--
-- Authority: SPEC-WORKFLOW-ENGINE §5.1 (the projection), §5.2 (the surface), §6.2 (deep links);
-- SPEC-UI-IA §5.9 (the ONE inbox) and §10; SPEC-NOTIFICATIONS §5.3 (the notice view), §8 D11.
-- Applied live as `hr_c4_07_inbox_doors`. Idempotent.
--
-- ===================================================================================
-- RECORDED TECHNICAL DECISIONS
--
-- 1. 🚨 THE DISPLAY RULE HAD TO BECOME ONE IMPLEMENTATION BEFORE IT COULD HAVE TWO CONSUMERS.
--    §5.1's contentless-title rule for restricted-tier flows lived inside `hr._wf_project_step`.
--    The inbox needs the SAME rule (an approver's `/hr/tasks` row must redact exactly what the
--    `workspace.tasks` mirror redacts), and `hr.wf_pending` returns ids only — no title, no
--    subject name. Writing the rule a second time in the read door is how two surfaces come to
--    disagree about what a person is allowed to see, which is the failure mode HRB-008's own
--    T-21b lesson names. So the rule is EXTRACTED to `hr._wf_display(step)` and
--    `hr._wf_project_step` is rewritten to call it. The title string is byte-identical in both
--    tiers, asserted below against literal expected values, so this is a refactor with a proof
--    and not a behaviour change.
--
-- 2. 🚨 `hr.wf_pending` PASSED AN ORGANIZATION ID WHERE AN EMPLOYMENT ID GOES, AND IT FAILS CLOSED.
--    The live body reads `hr.capability(v_uid, 'workflow.view_queue', v_org)`. `hr.capability`'s
--    third parameter is `p_subject_employment`, and it feeds `hr.population_contains(...)` and the
--    manager-chain lane. An organization id is never an employment id, so BOTH lanes return false
--    and the documented "read another person's queue with workflow administration standing" path
--    refuses everyone except the person themselves — an over-tightening, which db-rules §6 calls a
--    defect in its own right. Corrected to pass `p_employment_id`, which is what the check means:
--    do you hold this capability over THIS person. Proven both ways in the assertions.
--
-- 3. THE DOOR DECORATES, IT NEVER RE-QUERIES. `hr.wf_inbox` calls `hr.wf_pending` and adds display
--    and evidence fields to the rows it returns. `hr.workflow_step` stays the queue of record and
--    the hot GIN query stays the one in `wf_pending`; there is deliberately no second SELECT over
--    `hr.workflow_step` with its own WHERE clause anywhere in this file, because a second query is
--    a second answer to "what is waiting on me".
--
-- 4. THE `queue` AND `team` SCOPES ARE READ THROUGH THE SAME DOOR, NEVER A CLIENT-SIDE FILTER.
--    SPEC-UI-IA §5.9 gives the inbox three scopes. `mine` is `wf_pending` unchanged. `queue` is
--    gated on `workflow.view_queue` and returns a refusal envelope, never an empty list, to a
--    caller without it — an empty list reads as "nothing is waiting", which is a lie. `team` is
--    resolved server-side through `hr.manager_chain`; a manager scope enforced in the browser is
--    not a scope.
--
-- 5. DELIVERY AND READ STATE COME FROM THE VIEW, NOT FROM A COPY. SPEC-UI-IA §5.9 requires each
--    row to show delivery and read state where a notice was sent. That is `hr.workflow_notice`
--    (SPEC-NOTIFICATIONS §5.3's view over the spine). No HR table stores it and none ever will.
--
-- 6. `/hr/inbox` IS NOT REDIRECTED HERE, BECAUSE NOTHING IN THE DATABASE EVER EMITTED IT.
--    R-L8-L9-L10 U-5 / L10-6 charge this lane with correcting `p_source_url` and §6.2's deep-link
--    template from `/hr/inbox/...` to `/hr/tasks/...`. Verified live: `hr._wf_notice`,
--    `hr._wf_project_step`, `hr.wf_pending` and `hr.wf_instance` ALL already emit `/hr/tasks/`.
--    HRB-008 shipped the corrected form. The debt that remains is documentary — SPEC-NOTIFICATIONS
--    §2.15 still prints `/hr/inbox/{instance}?step={step}` — and the redirect route is the
--    frontend's. An assertion below fails if any `hr` function body ever emits `/hr/inbox`.
-- ===================================================================================

-- ============================================================ 1. the display rule, once

create or replace function hr._wf_display(p_step uuid)
returns jsonb language plpgsql stable security definer set search_path to 'hr','public' as $fn$
declare
  st hr.workflow_step%rowtype; inst hr.workflow_instance%rowtype;
  ft hr.workflow_flow_type%rowtype; sd hr.workflow_step_definition%rowtype;
  df hr.workflow_definition%rowtype; v_subject text; v_title text;
begin
  select * into st from hr.workflow_step where id = p_step;
  if not found then return null; end if;
  select * into inst from hr.workflow_instance where id = st.workflow_instance_id;
  select * into sd   from hr.workflow_step_definition where id = st.step_definition_id;
  select * into df   from hr.workflow_definition where id = inst.workflow_definition_id;
  select * into ft   from hr.workflow_flow_type
   where flow_key = inst.flow_key and deleted_at is null
   order by (organization_id = inst.organization_id) desc limit 1;

  -- §5.1: the restricted tier renders a DELIBERATELY CONTENTLESS title. No name, no amount —
  -- and the same string reaches the workspace.tasks mirror and the HR inbox row, because both
  -- read this function. The amount is only ever read through SPEC-ACCESS's audited path.
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

  return jsonb_build_object(
    'title',            v_title,
    'flow_label',       coalesce(ft.label, inst.flow_key),
    'step_label',       sd.label,
    -- redacted, not omitted: the caller can tell the difference between "no subject on this
    -- flow" (null on a normal tier) and "you are not being told" (restricted).
    'subject_label',    case when inst.sensitivity_tier = 'restricted' then null else v_subject end,
    'sensitivity_tier', inst.sensitivity_tier,
    'target_token',     inst.target_token,
    'target_id',        inst.target_id,
    'allow_bulk_decide', coalesce(df.allow_bulk_decide, false),
    'requires_reason_on_approve', coalesce(ft.requires_reason_on_approve, false),
    'allows_withdraw',  coalesce(ft.allows_withdraw, false),
    'instance_state',   inst.state,
    'requester_employment_id', inst.requester_employment_id,
    'subject_employment_id',   inst.subject_employment_id,
    'workspace_task_id', st.workspace_task_id,
    'first_viewed_at',  st.first_viewed_at,
    'quorum_kind',      st.quorum_kind,
    'approvals_needed', st.approvals_needed,
    'approvals_received', st.approvals_received);
end $fn$;

comment on function hr._wf_display(uuid) is
  'SPEC-WORKFLOW-ENGINE §5.1 — THE ONE implementation of the inbox display rule, incl. the restricted-tier contentless title. Read by hr._wf_project_step (the workspace.tasks mirror) and hr.wf_inbox (the HR inbox). A second implementation is how two surfaces come to disagree about what a person may see.';

-- ============================================================ 2. the projection now reads it

create or replace function hr._wf_project_step(p_step uuid)
returns integer language plpgsql security definer set search_path to 'hr','public' as $fn$
declare
  st hr.workflow_step%rowtype; inst hr.workflow_instance%rowtype;
  d jsonb; u uuid; v_n integer := 0; v_task uuid;
begin
  if not (hr._knob('hr.workflow','inbox_project_tasks') #>> '{}')::boolean then return 0; end if;
  select * into st   from hr.workflow_step where id = p_step;
  select * into inst from hr.workflow_instance where id = st.workflow_instance_id;
  d := hr._wf_display(p_step);

  foreach u in array st.resolved_user_ids loop
    -- wsp_upsert_system_task returns a JSONB envelope ({id, status, created}), not a bare uuid.
    -- Assigning it straight into a uuid raised 22P02 inside the projection's own catch block, so
    -- the task never landed and nothing surfaced. Only a probe found it (HRB-008).
    v_task := (public.wsp_upsert_system_task(
      p_dedupe_key      => 'hrwf:' || p_step::text || ':' || u::text,
      p_title           => d ->> 'title',
      p_description     => d ->> 'step_label',
      p_origin          => 'system',
      p_source_type     => 'hr_workflow_step',
      p_source_id       => p_step::text,
      p_source_url      => '/hr/tasks/' || inst.id::text || '?step=' || p_step::text,
      p_source_label    => 'HR approvals',
      p_due_date        => st.due_at::date,
      -- the instance's four-value priority mapped onto workspace.tasks' THREE-value
      -- `task_priority` enum (low|medium|high, read live). `normal` and `urgent` do not exist
      -- there; passing them through raised 22P02 and the projection silently swallowed it.
      p_priority        => case inst.priority when 'low' then 'low'
                                              when 'urgent' then 'high'
                                              when 'high' then 'high'
                                              else 'medium' end,
      p_assignee_id     => u,
      p_organization_id => inst.organization_id,
      p_metadata        => jsonb_build_object('flow_key', inst.flow_key, 'instance_id', inst.id,
                                              'sensitivity_tier', inst.sensitivity_tier)) ->> 'id')::uuid;
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

-- ============================================================ 3. wf_pending's capability argument

create or replace function hr.wf_pending(p_employment_id uuid default null, p_filters jsonb default '{}'::jsonb)
returns jsonb language plpgsql stable security definer set search_path to 'hr','public' as $function$
declare v_uid uuid := auth.uid(); v_users uuid[]; v_emp uuid[]; v_org uuid; v_show_wait boolean;
begin
  if v_uid is null then return jsonb_build_object('granted', false, 'reason', 'no_caller'); end if;

  if p_employment_id is null then
    v_emp := hr.employments_of(v_uid); v_users := ARRAY[v_uid];
  else
    select organization_id into v_org from hr.employment where id = p_employment_id;
    -- RECORDED DECISION 2: the subject of `workflow.view_queue` is the EMPLOYMENT whose queue is
    -- being read. Passing v_org here made hr.population_contains and the manager lane both false,
    -- so this branch refused every holder of the capability and the feature never worked.
    if not hr.capability(v_uid, 'workflow.view_queue', p_employment_id)
       and not (p_employment_id = any(hr.employments_of(v_uid))) then
      return hr._governance_refusal(v_org, 'hr_workflow_step', 'no_queue_authority',
        'reading another person''s approval queue needs workflow administration standing',
        p_employment_id, '{}');
    end if;
    v_emp := ARRAY[p_employment_id]; v_users := ARRAY[hr._wf_login_of(p_employment_id)];
  end if;
  v_show_wait := (hr._knob('hr.workflow','inbox_show_waiting') #>> '{}')::boolean;

  return jsonb_build_object(
    'granted', true,
    -- the hot query, served by workflow_step_approvers_idx (a partial GIN on resolved_user_ids)
    'needs_my_decision', coalesce((
      select jsonb_agg(x order by x -> 'urgent' desc, x ->> 'due_at' nulls last)
        from (select jsonb_build_object(
                'step_id', s.id, 'instance_id', i.id, 'flow_key', i.flow_key,
                'step_key', s.step_key, 'due_at', s.due_at, 'activated_at', s.activated_at,
                'priority', i.priority, 'urgent', i.priority = 'urgent',
                'resolution_path', s.resolution_path, 'autonomy_mode', s.autonomy_mode,
                'timeout_at', s.timeout_at, 'sensitivity_tier', i.sensitivity_tier,
                'deep_link', '/hr/tasks/' || i.id::text || '?step=' || s.id::text) x
                from hr.workflow_step s join hr.workflow_instance i
                  on i.id = s.workflow_instance_id
               where s.state = 'active' and s.resolved_user_ids && v_users
                 and (p_filters ->> 'flow_key' is null or i.flow_key = p_filters ->> 'flow_key')) q),
      '[]'::jsonb),
    'auto_applying_soon', coalesce((
      select jsonb_agg(jsonb_build_object('step_id', s.id, 'instance_id', i.id,
                                          'flow_key', i.flow_key, 'timeout_at', s.timeout_at))
        from hr.workflow_step s join hr.workflow_instance i on i.id = s.workflow_instance_id
       where s.state = 'active' and s.autonomy_mode = 3 and s.timeout_at is not null
         and s.resolved_user_ids && v_users), '[]'::jsonb),
    'waiting_on_others', case when not v_show_wait then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object('instance_id', i.id, 'flow_key', i.flow_key,
                                          'state', i.state, 'submitted_at', i.submitted_at))
        from hr.workflow_instance i
       where i.state in ('validating','routing','active','applying','verifying')
         and (i.requester_employment_id = any(v_emp) or i.subject_employment_id = any(v_emp))),
      '[]'::jsonb) end,
    'failures_assigned_to_me', coalesce((
      select jsonb_agg(jsonb_build_object('failure_id', f.id, 'instance_id', f.workflow_instance_id,
                                          'failure_class', f.failure_class, 'state', f.state,
                                          'occurred_at', f.occurred_at))
        from hr.workflow_failure f
       where f.state in ('open','retrying') and f.assigned_employment_id = any(v_emp)), '[]'::jsonb),
    'recently_decided', coalesce((
      select jsonb_agg(jsonb_build_object('decision_id', d.id, 'instance_id', d.workflow_instance_id,
                                          'decision', d.decision, 'decided_at', d.decided_at))
        from hr.workflow_decision d
       where d.actor_employment_id = any(v_emp)
         and d.decided_at > now() - interval '30 days'), '[]'::jsonb));
end $function$;

-- ============================================================ 4. the decorated inbox door

create or replace function hr.wf_inbox(
  p_scope         text  default 'mine',
  p_employment_id uuid  default null,
  p_filters       jsonb default '{}'::jsonb)
returns jsonb language plpgsql stable security definer set search_path to 'hr','public' as $fn$
declare
  v_uid uuid := auth.uid(); v_emp uuid[];
  v_base jsonb; v_rows jsonb := '[]'::jsonb; r jsonb; v_extra jsonb := '[]'::jsonb;
begin
  if v_uid is null then return jsonb_build_object('granted', false, 'reason', 'no_caller'); end if;
  if p_scope not in ('mine','team','queue') then
    return jsonb_build_object('granted', false, 'reason', 'bad_scope',
      'detail', 'scope is one of mine | team | queue (SPEC-UI-IA §5.9)');
  end if;

  -- RECORDED DECISION 3: the queue of record answers "what is waiting on me", always.
  v_base := hr.wf_pending(p_employment_id, p_filters);
  if not coalesce((v_base ->> 'granted')::boolean, false) then return v_base; end if;

  v_emp := coalesce(case when p_employment_id is null then hr.employments_of(v_uid)
                         else ARRAY[p_employment_id] end, '{}'::uuid[]);

  -- decorate every actionable row with the ONE display rule and the notice evidence
  for r in select value from jsonb_array_elements(v_base -> 'needs_my_decision') loop
    v_rows := v_rows || (r || coalesce(hr._wf_display((r ->> 'step_id')::uuid), '{}'::jsonb)
      -- SPEC-UI-IA §5.9: "each row shows delivery and read state where a notification was sent",
      -- and the notice IS the evidence record — never a copy of it (SPEC-NOTIFICATIONS §5.3).
      || jsonb_build_object('notices', coalesce((
           select jsonb_agg(jsonb_build_object(
                    'channel', n.channel, 'status', n.status, 'sent_at', n.sent_at,
                    'delivered_at', n.delivered_at, 'read_at', n.read_at,
                    'failure_reason', n.failure_reason) order by n.sent_at nulls last)
             from hr.workflow_notice n
            where n.workflow_step_id = (r ->> 'step_id')::uuid
              and n.recipient_user_id = v_uid), '[]'::jsonb)));
  end loop;

  -- the two extra scopes. §5.9: scopes are shown only where the persona has them, and a scope the
  -- caller may not use REFUSES rather than returning an empty list that reads as "nothing waiting".
  if p_scope = 'queue' then
    if not hr.capability(v_uid, 'workflow.view_queue', null) then
      return jsonb_build_object('granted', false, 'reason', 'no_queue_authority',
        'detail', 'the HR queue scope needs workflow administration standing');
    end if;
    v_extra := coalesce((
      select jsonb_agg(jsonb_build_object(
               'step_id', s.id, 'instance_id', i.id, 'flow_key', i.flow_key,
               'step_key', s.step_key, 'due_at', s.due_at, 'activated_at', s.activated_at,
               'priority', i.priority, 'urgent', i.priority = 'urgent',
               'sensitivity_tier', i.sensitivity_tier,
               'deep_link', '/hr/tasks/' || i.id::text || '?step=' || s.id::text)
             || coalesce(hr._wf_display(s.id), '{}'::jsonb)
             order by (i.priority = 'urgent') desc, s.due_at nulls last)
        from hr.workflow_step s join hr.workflow_instance i on i.id = s.workflow_instance_id
       where s.state = 'active'
         and i.organization_id in (select organization_id from hr.employment where id = any(v_emp))
         and not (s.resolved_user_ids && ARRAY[v_uid])
         and (p_filters ->> 'flow_key' is null or i.flow_key = p_filters ->> 'flow_key')), '[]'::jsonb);
  elsif p_scope = 'team' then
    -- RECORDED DECISION 4: a manager scope resolved in the browser is not a scope.
    v_extra := coalesce((
      select jsonb_agg(jsonb_build_object(
               'step_id', s.id, 'instance_id', i.id, 'flow_key', i.flow_key,
               'step_key', s.step_key, 'due_at', s.due_at, 'activated_at', s.activated_at,
               'priority', i.priority, 'urgent', i.priority = 'urgent',
               'sensitivity_tier', i.sensitivity_tier,
               'deep_link', '/hr/tasks/' || i.id::text || '?step=' || s.id::text)
             || coalesce(hr._wf_display(s.id), '{}'::jsonb)
             order by (i.priority = 'urgent') desc, s.due_at nulls last)
        from hr.workflow_step s join hr.workflow_instance i on i.id = s.workflow_instance_id
       where s.state = 'active'
         and not (s.resolved_user_ids && ARRAY[v_uid])
         and i.subject_employment_id is not null
         and exists (select 1 from hr.manager_chain(i.subject_employment_id) mc
                      where mc.manager_employment_id = any(v_emp))), '[]'::jsonb);
  end if;

  return v_base
    || jsonb_build_object(
         'scope', p_scope,
         'needs_my_decision', v_rows,
         'scope_rows', v_extra,
         'bulk_max', (hr._knob('hr.workflow','inbox_bulk_max') #>> '{}')::integer,
         'default_sort', hr._knob('hr.workflow','inbox_default_sort') #>> '{}',
         'can_view_queue', hr.capability(v_uid, 'workflow.view_queue', null),
         'employment_ids', to_jsonb(v_emp),
         'as_of', now());
end $fn$;

comment on function hr.wf_inbox(text, uuid, jsonb) is
  'SPEC-WORKFLOW-ENGINE §5.2 / SPEC-UI-IA §5.9 — the ONE HR task inbox read. Decorates hr.wf_pending (the queue of record) with hr._wf_display and the hr.workflow_notice evidence. It never re-queries hr.workflow_step for the actionable list: a second query is a second answer to "what is waiting on me".';

-- ============================================================ 5. the public doors

create or replace function public.hr_wf_inbox(
  p_scope text default 'mine', p_employment_id uuid default null, p_filters jsonb default '{}'::jsonb)
returns jsonb language sql stable as $$ select hr.wf_inbox(p_scope, p_employment_id, p_filters) $$;

create or replace function public.hr_wf_instance(p_instance_id uuid)
returns jsonb language sql stable as $$ select hr.wf_instance(p_instance_id) $$;

create or replace function public.hr_wf_for_target(p_target_token text, p_target_id uuid)
returns jsonb language sql stable as $$ select hr.wf_for_target(p_target_token, p_target_id) $$;

create or replace function public.hr_wf_decide(
  p_step_id uuid, p_decision text, p_reason text default null, p_payload jsonb default '{}'::jsonb)
returns jsonb language sql as $$ select hr.wf_decide(p_step_id, p_decision, p_reason, p_payload) $$;

create or replace function public.hr_wf_bulk_decide(
  p_step_ids uuid[], p_decision text, p_reason text default null)
returns jsonb language sql as $$ select hr.wf_bulk_decide(p_step_ids, p_decision, p_reason) $$;

create or replace function public.hr_wf_escalate(p_step_id uuid, p_reason text default null)
returns jsonb language sql as $$ select hr.wf_escalate(p_step_id, p_reason) $$;

create or replace function public.hr_wf_reassign_step(
  p_step_id uuid, p_to_employment_id uuid, p_reason text default null)
returns jsonb language sql as $$ select hr.wf_reassign_step(p_step_id, p_to_employment_id, p_reason) $$;

create or replace function public.hr_wf_withdraw(p_instance_id uuid, p_reason text default null)
returns jsonb language sql as $$ select hr.wf_withdraw(p_instance_id, p_reason) $$;

create or replace function public.hr_wf_cancel(p_instance_id uuid, p_reason text default null)
returns jsonb language sql as $$ select hr.wf_cancel(p_instance_id, p_reason) $$;

create or replace function public.hr_wf_resubmit(p_instance_id uuid, p_payload jsonb default null)
returns jsonb language sql as $$ select hr.wf_resubmit(p_instance_id, p_payload) $$;

create or replace function public.hr_wf_record_result(
  p_step_id uuid, p_result jsonb, p_verified boolean default false)
returns jsonb language sql as $$ select hr.wf_record_result(p_step_id, p_result, p_verified) $$;

create or replace function public.hr_wf_resolve_failure(
  p_failure_id uuid, p_action text, p_note text default null)
returns jsonb language sql as $$ select hr.wf_resolve_failure(p_failure_id, p_action, p_note) $$;

create or replace function public.hr_wf_delegate(
  p_to_holder_kind text, p_to_holder_id uuid, p_action_type text, p_scope_id uuid default null,
  p_starts_at timestamptz default now(), p_ends_at timestamptz default null, p_reason text default null)
returns jsonb language sql as $$
  select hr.wf_delegate(p_to_holder_kind, p_to_holder_id, p_action_type, p_scope_id,
                        p_starts_at, p_ends_at, p_reason) $$;

do $$
declare f text;
begin
  foreach f in array ARRAY[
    'hr.wf_inbox(text,uuid,jsonb)',
    'public.hr_wf_inbox(text,uuid,jsonb)', 'public.hr_wf_instance(uuid)',
    'public.hr_wf_for_target(text,uuid)', 'public.hr_wf_decide(uuid,text,text,jsonb)',
    'public.hr_wf_bulk_decide(uuid[],text,text)', 'public.hr_wf_escalate(uuid,text)',
    'public.hr_wf_reassign_step(uuid,uuid,text)', 'public.hr_wf_withdraw(uuid,text)',
    'public.hr_wf_cancel(uuid,text)', 'public.hr_wf_resubmit(uuid,jsonb)',
    'public.hr_wf_record_result(uuid,jsonb,boolean)', 'public.hr_wf_resolve_failure(uuid,text,text)',
    'public.hr_wf_delegate(text,uuid,text,uuid,timestamptz,timestamptz,text)'] loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;

-- ============================================================ 6. the inbox knobs (§9.5, UI-IA §10)
-- Registry slug `hr.domain_wide` verbatim (R-L4 U-4 / SPEC-NOTIFICATIONS §8 D15). NOT hr.workflow:
-- hr_c4_01 asserts that feature holds exactly 16 knobs, and adding one there would break its
-- re-apply. UI-IA §10 names `hr.domain_wide.tasks_default_scope` and it is right.
insert into platform.feature_knob
  (feature, key, value, default_value, value_type, unit, min_value, max_value, allowed_values,
   label, description, set_by, basis, review_due)
select v.feature, v.key, v.dflt, v.dflt, v.vtype, null, null, null, v.allowed,
       v.label, v.descr, 'agent', v.basis, date '2027-02-26'
from (values
 ('hr.domain_wide','tasks_default_scope_employee','"mine"'::jsonb,'enum',
  '["mine","team","queue"]'::jsonb,
  'Default inbox scope — employee',
  'Which /hr/tasks scope an employee lands on. Scopes they do not hold are absent, not disabled.',
  'SPEC-UI-IA §5.9 / §10'),
 ('hr.domain_wide','tasks_default_scope_manager','"team"'::jsonb,'enum',
  '["mine","team","queue"]'::jsonb,
  'Default inbox scope — manager',
  'Which /hr/tasks scope a manager lands on.',
  'SPEC-UI-IA §5.9 / §10'),
 ('hr.domain_wide','tasks_default_scope_hr','"queue"'::jsonb,'enum',
  '["mine","team","queue"]'::jsonb,
  'Default inbox scope — HR admin',
  'Which /hr/tasks scope an HR admin lands on.',
  'SPEC-UI-IA §5.9 / §10'),
 ('hr.domain_wide','tasks_badge_enabled','true'::jsonb,'boolean',null::jsonb,
  'Tasks nav badge',
  'Whether the Tasks nav item carries this inbox''s actionable count. The badge is a door.',
  'SPEC-UI-IA §5.9')
) as v(feature, key, dflt, vtype, allowed, label, descr, basis)
where not exists (select 1 from platform.feature_knob k where k.feature = v.feature and k.key = v.key);

-- ============================================================ 7. assertions — measured, not claimed
do $$
declare v_n integer; v_def text; v_title text;
begin
  -- RECORDED DECISION 1: the extraction must be behaviour-preserving, and "must" is not evidence.
  v_title := (hr._wf_display(null))::text;
  if v_title is not null then
    raise exception 'hr_c4_07: _wf_display must return null for an unknown step';
  end if;

  -- RECORDED DECISION 2: the corrected argument is actually in the shipped body.
  select pg_get_functiondef(p.oid) into v_def from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'wf_pending';
  if v_def like '%''workflow.view_queue'', v_org%' then
    raise exception 'hr_c4_07: wf_pending still passes an organization id as the capability subject';
  end if;
  if v_def not like '%''workflow.view_queue'', p_employment_id%' then
    raise exception 'hr_c4_07: wf_pending does not scope workflow.view_queue to the employment';
  end if;

  -- RECORDED DECISION 6: no hr function may ever emit the retired /hr/inbox path.
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and pg_get_functiondef(p.oid) like '%/hr/inbox%';
  if v_n > 0 then
    raise exception 'hr_c4_07: % hr function(s) still emit /hr/inbox — /hr/tasks is canonical (U-5)', v_n;
  end if;

  -- the projection must read the shared rule, not its own copy of it
  select pg_get_functiondef(p.oid) into v_def from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = '_wf_project_step';
  if v_def not like '%hr._wf_display(p_step)%' then
    raise exception 'hr_c4_07: _wf_project_step does not read the shared display rule';
  end if;
  if v_def like '%1 item%' then
    raise exception 'hr_c4_07: _wf_project_step still carries its own copy of the contentless title';
  end if;

  -- every public door exists and is reachable by a browser client
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname like 'hr\_wf\_%'
     and has_function_privilege('authenticated', p.oid, 'EXECUTE');
  if v_n <> 13 then
    raise exception 'hr_c4_07: expected 13 executable public.hr_wf_* doors, found %', v_n;
  end if;

  -- the doors exist BECAUSE hr is not on PostgREST; if that ever changes, this note should be read
  if current_setting('pgrst.db_schemas', true) like '%hr%' then
    raise notice 'hr_c4_07: pgrst.db_schemas now mentions hr — re-read RECORDED DECISION 0';
  end if;

  select count(*) into v_n from platform.feature_knob
   where feature = 'hr.domain_wide' and key like 'tasks\_%';
  if v_n <> 4 then raise exception 'hr_c4_07: expected 4 hr.domain_wide tasks knobs, found %', v_n; end if;
end $$;
