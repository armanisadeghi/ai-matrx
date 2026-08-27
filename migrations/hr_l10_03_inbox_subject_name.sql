-- HR domain L10 — the approver is asked to approve a raise for SOMEBODY (register item HRB-022).
--
-- 🚨 THE DEFECT, AND IT WAS MINE, INTRODUCED BY A REFACTOR THAT LOOKED LIKE A CLEANUP.
--
-- `hr_c4_07` extracted the §5.1 contentless-title rule out of `hr._wf_project_step` into
-- `hr._wf_display` so the `workspace.tasks` mirror and the HR inbox could not disagree about what
-- a person may see. That was the right instinct applied to the wrong invariant: **they are
-- SUPPOSED to disagree.** SPEC-WORKFLOW-ENGINE §5.1 makes the contentless title a property of the
-- PROJECTION — "`workspace.tasks` is `internal`-visibility machinery and the sensitivity split
-- must survive the projection... The amount is only ever read through SPEC-ACCESS's audited path,
-- **inside the HR inbox**" — and acceptance target T-L10-5 states the split in one sentence:
--
--     "A restricted-tier approval appears in the approver's general /tasks list with a
--      contentless title — no name, no amount — while /hr/tasks shows the FULL ITEM to that same
--      authorized approver, and nothing at all to a colleague without the capability."
--
-- One function serving both callers made `/hr/tasks` as blind as the mirror, so a pay-change
-- approver was shown "Pay change approval — 1 item" and asked to approve a raise for nobody in
-- particular. The proof suite then asserted the two strings were IDENTICAL and called it evidence.
-- **That assertion was the bug wearing a hi-vis jacket**, and it is inverted in the same commit.
--
-- THE FIX. `hr._wf_display` takes `p_contentless`. The projection passes `true` and is unchanged
-- byte for byte. The inbox passes `false` and resolves the subject through **hr_l3_41's**
-- `hr._subject_display_name` — the same suppression-aware helper the ER and verification queues
-- use, so the directory opt-out rule is honoured in exactly one place rather than re-implemented
-- here (re-implementing it is how two surfaces come to disagree, which is the whole lesson of
-- `hr_c4_07`).
--
-- Authority: SPEC-WORKFLOW-ENGINE §5.1, §5.2; SPEC-ACCESS §4.2; SPEC-EMPLOYEES §1.2 (opt-out);
-- R-L8-L9-L10 T-L10-5. Applied live as `hr_l10_03_inbox_subject_name`. Idempotent.
--
-- ── RECORDED TECHNICAL DECISIONS ────────────────────────────────────────────────────────────
-- 1. ENTITLEMENT IS TWO NAMED ARMS, AND NEITHER IS "YOU CAN SEE THE ROW".
--    (a) **You hold the decision.** A resolved approver on the step is being asked to decide;
--        deciding a compensation change without knowing whose it is is not a decision, it is a
--        signature. This is the arm T-L10-5 names.
--    (b) **The workflow-administration arm**, scoped to the SUBJECT's employment so it cannot be
--        satisfied by a capability held in some other organization.
--    Anything else gets the contentless title — including a `team`/`queue`-scope viewer who is
--    merely looking at the queue. Reaching a row and being told who it is about are different
--    permissions, and conflating them is how a restricted tier stops being restricted.
-- 2. SUPPRESSION IS NOT RE-IMPLEMENTED, IT IS CALLED. `hr._subject_display_name` already refuses
--    an opted-out subject's name to everyone but the subject and HR in that org. Layering this
--    entitlement ON TOP means a restricted flow can only ever be MORE private than the directory,
--    never less.
-- 3. THE TITLE FOLLOWS THE LABEL. If the viewer is not entitled — or suppression returns null —
--    the title stays exactly "<flow> — 1 item". A title that named the person while
--    `subject_label` was null would leak the very thing the label was withholding.

-- ── 1. one display rule, two audiences ──────────────────────────────────────────────────────
-- The single-argument form must GO, not sit beside the new one: leaving it would make
-- `hr._wf_display(step)` an ambiguous overload the moment a caller omitted the flag.
drop function if exists hr._wf_display(uuid);

create or replace function hr._wf_display(p_step uuid, p_contentless boolean default false)
returns jsonb language plpgsql stable security definer set search_path to 'hr','public' as $fn$
declare
  st hr.workflow_step%rowtype; inst hr.workflow_instance%rowtype;
  ft hr.workflow_flow_type%rowtype; sd hr.workflow_step_definition%rowtype;
  df hr.workflow_definition%rowtype;
  v_uid uuid := auth.uid(); v_entitled boolean; v_subject text; v_title text;
begin
  select * into st from hr.workflow_step where id = p_step;
  if not found then return null; end if;
  select * into inst from hr.workflow_instance where id = st.workflow_instance_id;
  select * into sd   from hr.workflow_step_definition where id = st.step_definition_id;
  select * into df   from hr.workflow_definition where id = inst.workflow_definition_id;
  select * into ft   from hr.workflow_flow_type
   where flow_key = inst.flow_key and deleted_at is null
   order by (organization_id = inst.organization_id) desc limit 1;

  -- DECISION 1: holding the decision, or holding workflow administration over THIS subject.
  v_entitled := (v_uid is not null and v_uid = any(coalesce(st.resolved_user_ids, '{}'::uuid[])))
             or (v_uid is not null
                 and hr.capability(v_uid, 'workflow.view_queue', inst.subject_employment_id));

  if inst.sensitivity_tier = 'restricted' and (p_contentless or not v_entitled) then
    -- §5.1: the mirror is `internal`-visibility machinery, and an unentitled reader of the queue
    -- is in the same position. No name, no amount.
    v_subject := null;
    v_title   := coalesce(ft.label, inst.flow_key) || ' — 1 item';
  else
    -- DECISION 2: hr_l3_41's helper, not a second copy of the opt-out rule.
    v_subject := hr._subject_display_name(inst.subject_employment_id, v_uid);
    -- DECISION 3: the title can never say more than the label does.
    v_title := coalesce(ft.label, inst.flow_key)
             || case when v_subject is not null then ' — ' || v_subject
                     when inst.sensitivity_tier = 'restricted' then ' — 1 item'
                     else '' end;
  end if;

  return jsonb_build_object(
    'title',            v_title,
    'flow_label',       coalesce(ft.label, inst.flow_key),
    'step_label',       sd.label,
    'subject_label',    v_subject,
    -- so a surface can say "restricted" rather than rendering a blank where a name would go
    'subject_withheld', (inst.sensitivity_tier = 'restricted' and v_subject is null),
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

comment on function hr._wf_display(uuid, boolean) is
  'SPEC-WORKFLOW-ENGINE §5.1 / T-L10-5 — the ONE display rule, with TWO audiences. p_contentless => true is the workspace.tasks mirror (internal-visibility machinery: no name, no amount). The default false is the HR inbox, which names the subject to the approver holding the decision or a workflow administrator over that subject, through hr_l3_41''s suppression-aware hr._subject_display_name.';

-- ── 2. the projection asks for the contentless form, explicitly ─────────────────────────────
create or replace function hr._wf_project_step(p_step uuid)
returns integer language plpgsql security definer set search_path to 'hr','public' as $fn$
declare
  st hr.workflow_step%rowtype; inst hr.workflow_instance%rowtype;
  d jsonb; u uuid; v_n integer := 0; v_task uuid;
begin
  if not (hr._knob('hr.workflow','inbox_project_tasks') #>> '{}')::boolean then return 0; end if;
  select * into st   from hr.workflow_step where id = p_step;
  select * into inst from hr.workflow_instance where id = st.workflow_instance_id;
  -- 🚨 `true` is load-bearing: workspace.tasks is internal-visibility machinery shared with the
  -- general /tasks list, and the sensitivity split has to survive the projection.
  d := hr._wf_display(p_step, true);

  foreach u in array st.resolved_user_ids loop
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
  perform hr._wf_event(st.workflow_instance_id, p_step, 'projection_failed', null, null,
                       'automation', null, null,
                       jsonb_build_object('sqlstate', sqlstate, 'detail', sqlerrm));
  return 0;
end $fn$;

-- ── 3. assertions — measured against the LIVE pay-change instances ──────────────────────────
do $$
declare
  v_step uuid; v_subject uuid; v_approver uuid; v_name text;
  d_inbox jsonb; d_mirror jsonb;
begin
  select s.id, i.subject_employment_id, s.resolved_user_ids[1]
    into v_step, v_subject, v_approver
    from hr.workflow_step s join hr.workflow_instance i on i.id = s.workflow_instance_id
   where i.flow_key = 'pay_change' and s.state = 'active'
     and cardinality(coalesce(s.resolved_user_ids,'{}')) > 0
   limit 1;

  if v_step is null then
    raise notice 'hr_l10_03: no live pay_change step with an approver — the shape assertions run, the live one does not';
  else
    select e.display_name into v_name
      from hr.employment em join hr.employee e on e.id = em.employee_id
     where em.id = v_subject;

    -- as the approver: the name is served
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_approver::text, 'role','authenticated')::text, true);
    d_inbox := hr._wf_display(v_step, false);
    if (d_inbox ->> 'subject_label') is distinct from v_name then
      raise exception 'hr_l10_03: the approver holding the decision sees subject_label %, expected %',
        d_inbox ->> 'subject_label', v_name;
    end if;
    if position(v_name in (d_inbox ->> 'title')) = 0 then
      raise exception 'hr_l10_03: the inbox title % does not name the subject', d_inbox ->> 'title';
    end if;

    -- the SAME step, projected to the mirror: still contentless
    d_mirror := hr._wf_display(v_step, true);
    if (d_mirror ->> 'subject_label') is not null then
      raise exception 'hr_l10_03: the workspace.tasks mirror leaked a subject_label';
    end if;
    if position(v_name in (d_mirror ->> 'title')) > 0 then
      raise exception 'hr_l10_03: the mirror title % names the subject', d_mirror ->> 'title';
    end if;
    if right(d_mirror ->> 'title', 9) <> ' — 1 item' then
      raise exception 'hr_l10_03: the mirror title % is not the contentless form', d_mirror ->> 'title';
    end if;

    -- 🚨 and the two MUST differ; the old assertion demanded they match
    if (d_inbox ->> 'title') = (d_mirror ->> 'title') then
      raise exception 'hr_l10_03: inbox and mirror titles are identical — the split did not survive';
    end if;

    -- a caller with no standing at all sees the contentless form
    perform set_config('request.jwt.claims', '', true);
    if (hr._wf_display(v_step, false) ->> 'subject_label') is not null then
      raise exception 'hr_l10_03: an unauthenticated reader was given the subject name';
    end if;
  end if;

  -- the one-argument overload must be gone, or a caller silently gets the wrong audience
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'hr' and p.proname = '_wf_display'
                and pg_get_function_identity_arguments(p.oid) = 'uuid') then
    raise exception 'hr_l10_03: the single-argument hr._wf_display still exists — it is ambiguous';
  end if;

  if (select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname='hr' and p.proname='_wf_project_step') not like '%_wf_display(p_step, true)%' then
    raise exception 'hr_l10_03: the projection does not ask for the contentless form';
  end if;
end $$;
