-- HR domain L10 — the reason label told the opposite of the truth (register item HRB-022).
--
-- 🚨 THE VERIFIER'S FIRST CLICK WAS REFUSED BESIDE A LABEL SAYING IT WOULD NOT BE.
--
-- The panel's field read "Reason — required to reject or return", so an approver typed nothing and
-- pressed Approve. `hr.wf_decide` answered `WF_REASON_REQUIRED` / "this step requires a reason on
-- approval". Both statements were about the same click and only one of them was true.
--
-- The door's rule is a DISJUNCTION over two levels:
--
--     if p_decision = 'approved'
--        and (sd.requires_reason or ft.requires_reason_on_approve)
--        and coalesce(btrim(p_reason),'') = '' then  -> WF_REASON_REQUIRED
--
-- `hr._wf_display` surfaced only the FLOW-TYPE half (`ft.requires_reason_on_approve`) and dropped
-- the STEP-DEFINITION half (`sd.requires_reason`). Measured live on the two active pay_change
-- steps at the moment of the finding:
--
--     step_def_requires = true · flow_requires = false · door requires = TRUE · UI was told FALSE
--
-- So the field was not merely unhelpful, it was **inverted** on every step that carries the
-- requirement at the step level — which, on this flow, is every step there is.
--
-- THE FIX. `requires_reason_on_approve` becomes the door's own expression, written once, in the
-- one place both the inbox row and the decision panel already read. The client renders that value
-- instead of a sentence somebody typed, so the label cannot disagree with the refusal again — and
-- when a future flow sets the flag at the flow-type level instead, the same field is already right
-- without anybody remembering to look.
--
-- Authority: SPEC-WORKFLOW-ENGINE §9.1 (the reason rules), §5.2 (the decision surface).
-- Applied live as `hr_l10_05_requires_reason_is_the_doors`. Idempotent.
--
-- ── RECORDED TECHNICAL DECISION ─────────────────────────────────────────────────────────────
-- THE FIELD KEEPS ITS NAME, AND THAT IS DELIBERATE. `requires_reason_on_approve` now answers
-- "does THIS STEP require a reason to approve", which is the question every caller was already
-- asking of it. Renaming it to something like `step_requires_reason` would have been more precise
-- about its sources and would have quietly broken every reader mid-round for no gain in truth.
-- The value is what was wrong, not the name.

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

  v_entitled := (v_uid is not null and v_uid = any(coalesce(st.resolved_user_ids, '{}'::uuid[])))
             or (v_uid is not null
                 and hr.capability(v_uid, 'workflow.view_queue', inst.subject_employment_id));

  if inst.sensitivity_tier = 'restricted' and (p_contentless or not v_entitled) then
    v_subject := null;
    v_title   := coalesce(ft.label, inst.flow_key) || ' — 1 item';
  else
    v_subject := hr._subject_display_name(inst.subject_employment_id, v_uid);
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
    'subject_withheld', (inst.sensitivity_tier = 'restricted' and v_subject is null),
    'sensitivity_tier', inst.sensitivity_tier,
    'target_token',     inst.target_token,
    'target_id',        inst.target_id,
    'allow_bulk_decide', coalesce(df.allow_bulk_decide, false),
    -- 🚨 THE DOOR'S OWN DISJUNCTION, not half of it. `hr.wf_decide` refuses an empty reason on
    -- approval when EITHER the step definition or the flow type asks for one; reading only the
    -- flow type told the panel "optional" on a step that required it.
    'requires_reason_on_approve',
        (coalesce(sd.requires_reason, false) or coalesce(ft.requires_reason_on_approve, false)),
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

-- ── assertions — measured against the STEPS THAT REFUSED ────────────────────────────────────
do $$
declare r record; v_n integer := 0; v_bad text;
begin
  for r in
    select s.id,
           (coalesce(sd.requires_reason,false) or coalesce(ft.requires_reason_on_approve,false)) as door,
           (hr._wf_display(s.id, false) ->> 'requires_reason_on_approve')::boolean as ui
      from hr.workflow_step s
      join hr.workflow_instance i  on i.id = s.workflow_instance_id
      join hr.workflow_step_definition sd on sd.id = s.step_definition_id
      join hr.workflow_flow_type ft on ft.flow_key = i.flow_key and ft.deleted_at is null
     where s.state = 'active'
  loop
    v_n := v_n + 1;
    if r.door is distinct from r.ui then
      v_bad := coalesce(v_bad || ', ', '') || r.id::text
               || ' (door=' || r.door || ' ui=' || r.ui || ')';
    end if;
  end loop;

  if v_bad is not null then
    raise exception 'hr_l10_05: the display still disagrees with the door on: %', v_bad;
  end if;
  raise notice 'hr_l10_05: % active step(s) agree with the door on requires_reason_on_approve', v_n;

  -- and the step-definition arm is genuinely exercised, not merely present in the source: at
  -- least one live step must require a reason via sd.requires_reason with the flow type saying no
  if not exists (
    select 1 from hr.workflow_step s
      join hr.workflow_instance i on i.id = s.workflow_instance_id
      join hr.workflow_step_definition sd on sd.id = s.step_definition_id
      join hr.workflow_flow_type ft on ft.flow_key = i.flow_key and ft.deleted_at is null
     where s.state = 'active' and sd.requires_reason
       and not coalesce(ft.requires_reason_on_approve, false)
       and (hr._wf_display(s.id, false) ->> 'requires_reason_on_approve')::boolean)
  then
    raise notice 'hr_l10_05: no live step exercises the step-definition arm alone right now — the shape is fixed, the live witness is not present';
  end if;
end $$;
