-- HR domain L10 — the DECISION PANEL names the subject too (register item HRB-022).
--
-- 🚨 `hr_l10_03` fixed the inbox ROW and left the surface the row LINKS TO still anonymous.
--
-- Verified in the browser immediately after applying it: `/hr/tasks` now names the subject on a
-- pay-change row, and clicking that row opens `/hr/tasks/{instance}?step={step}` — which renders
-- "pay_change", "About hr_position_assignment 7feb4c50-…", an Approve button, and **no human
-- being anywhere on the page**. The approver is still being asked to approve a raise for nobody
-- in particular; the defect simply moved one click to the right.
--
-- The panel reads `public.hr_wf_instance`, which passes `hr.wf_instance` straight through, and
-- that function returns raw `to_jsonb(row)` — `subject_employment_id` and nothing that names a
-- person. `hr.employment` is not PostgREST-reachable, so the client cannot resolve the uuid
-- either. Same shape as hr_l3_41's finding: nothing errors, the door reports success, and the
-- surface states nothing.
--
-- THE FIX, and where it belongs. `hr.wf_instance` is the ENGINE's function (C4 / HRB-008) and is
-- not this lane's to edit. `public.hr_wf_instance` is this lane's door, and the pattern is already
-- established by `hr.wf_inbox`: **the door decorates, it never re-queries.** So the door calls the
-- engine's read unchanged and merges `hr._wf_display(step, false)` onto each step — the same
-- entitlement and the same suppression as the inbox row, because a name that appears in the queue
-- and vanishes on the detail page would be its own bug (hr_l3_41 decision, restated).
--
-- Authority: SPEC-WORKFLOW-ENGINE §5.1/§5.2; R-L8-L9-L10 T-L10-5; SPEC-EMPLOYEES §1.2.
-- Applied live as `hr_l10_04_instance_door_display`. Idempotent.
--
-- ── RECORDED TECHNICAL DECISIONS ────────────────────────────────────────────────────────────
-- 1. THE DOOR DECORATES, THE ENGINE READ IS UNTOUCHED. No second SELECT over hr.workflow_step
--    and no copy of the read's authorization: if `hr.wf_instance` refuses, the refusal is returned
--    verbatim and nothing is decorated. A door that could answer where the engine refused would
--    be a second, weaker authorization path.
-- 2. THE INSTANCE GETS THE SUBJECT FROM ITS OWN STEPS, NOT FROM A SEPARATE LOOKUP. `subject_label`
--    is lifted onto the envelope from whichever step the caller is actually entitled on. An
--    instance-level name resolved independently would be a THIRD implementation of the
--    entitlement rule, and this lane has already been bitten once by having two.

create or replace function public.hr_wf_instance(p_instance_id uuid)
returns jsonb language plpgsql stable security definer set search_path to 'hr','public' as $fn$
declare v_base jsonb; v_steps jsonb; v_subject text;
begin
  v_base := hr.wf_instance(p_instance_id);
  -- DECISION 1: a refusal passes through untouched.
  if not coalesce((v_base ->> 'granted')::boolean, false) then return v_base; end if;

  select coalesce(jsonb_agg(
           s || coalesce(hr._wf_display((s ->> 'id')::uuid, false), '{}'::jsonb)
           order by (s ->> 'step_order')::int nulls last, s ->> 'step_key'), '[]'::jsonb)
    into v_steps
    from jsonb_array_elements(coalesce(v_base -> 'steps', '[]'::jsonb)) s;

  -- DECISION 2: the instance's own subject label comes from the steps just decorated, so there is
  -- exactly one place that decides whether this caller may be told the name.
  select x ->> 'subject_label' into v_subject
    from jsonb_array_elements(v_steps) x
   where x ->> 'subject_label' is not null
   limit 1;

  return v_base || jsonb_build_object(
    'steps', v_steps,
    'subject_label', v_subject,
    'subject_withheld', (v_base -> 'instance' ->> 'sensitivity_tier') = 'restricted'
                        and v_subject is null);
end $fn$;

do $$
begin
  revoke all on function public.hr_wf_instance(uuid) from public;
  grant execute on function public.hr_wf_instance(uuid) to authenticated, service_role;
end $$;

comment on function public.hr_wf_instance(uuid) is
  'SPEC-WORKFLOW-ENGINE §5.2 — the decision panel''s read. Passes hr.wf_instance through unchanged (including its refusals) and DECORATES each step with hr._wf_display, so the panel names the subject under exactly the same entitlement and suppression as the inbox row. A name that appears in the queue and vanishes on the detail page would be its own bug.';

-- ── assertions — measured against the LIVE pay-change instance ──────────────────────────────
do $$
declare
  v_inst uuid; v_approver uuid; v_name text; v_env jsonb;
begin
  select i.id, s.resolved_user_ids[1],
         (select e.display_name from hr.employment em join hr.employee e on e.id = em.employee_id
           where em.id = i.subject_employment_id)
    into v_inst, v_approver, v_name
    from hr.workflow_instance i join hr.workflow_step s on s.workflow_instance_id = i.id
   where i.flow_key = 'pay_change' and s.state = 'active'
     and cardinality(coalesce(s.resolved_user_ids,'{}')) > 0
   limit 1;

  if v_inst is null then
    raise notice 'hr_l10_04: no live pay_change instance with an approver — shape assertions only';
  else
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_approver::text, 'role','authenticated')::text, true);
    v_env := public.hr_wf_instance(v_inst);
    if not coalesce((v_env ->> 'granted')::boolean, false) then
      raise exception 'hr_l10_04: the approver cannot read their own instance: %', v_env ->> 'reason';
    end if;
    if (v_env ->> 'subject_label') is distinct from v_name then
      raise exception 'hr_l10_04: the panel gives the approver subject_label %, expected %',
        v_env ->> 'subject_label', v_name;
    end if;
    if (v_env ->> 'subject_withheld')::boolean then
      raise exception 'hr_l10_04: subject_withheld is true for the entitled approver';
    end if;
    if not exists (select 1 from jsonb_array_elements(v_env -> 'steps') s
                    where s ->> 'subject_label' = v_name) then
      raise exception 'hr_l10_04: no decorated step carries the subject name';
    end if;

    -- an unauthenticated caller is refused by the ENGINE, and the door adds nothing to that
    perform set_config('request.jwt.claims', '', true);
    v_env := public.hr_wf_instance(v_inst);
    if coalesce((v_env ->> 'granted')::boolean, false)
       and (v_env ->> 'subject_label') is not null then
      raise exception 'hr_l10_04: an unauthenticated caller was given the subject name';
    end if;
  end if;

  -- the door must not have grown its own query over the engine's tables
  if (select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'hr_wf_instance') like '%from hr.workflow_step%' then
    raise exception 'hr_l10_04: the door re-queries hr.workflow_step — it must decorate, not re-read';
  end if;
end $$;
