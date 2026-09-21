-- lane: ARGS-RULED
--
-- chair-step: it REPLACES the live bodies of two inner HR functions and declares them. Inverse:
--   migrations/inverse/argsruled_three_more_second_ids_down.sql.
--
-- based-on: hr.leave_case_open(uuid, text, text, date, numeric, text, date, boolean, uuid[], uuid) 3347966495ada76e30f48b05c5990b3633623ee9a28bd4499b6c7f80cbab0dce
-- based-on: hr.wf_request(text, text, uuid, uuid, jsonb, uuid, boolean, text) ea0604fbfe7a2f97f05a9e2379387df8b8a3d30a1582161f0b6ad00bf1324f34
--
-- ARGS-RULED — THREE MORE SECOND IDS, IN THE TWO WRAPPERS THIS LANE HAD NOT READ.
--
-- `public.hr_leave_case_open` and `public.hr_wf_request` are one-line wrappers; this lane declared
-- so and left their arguments unruled rather than guess. Their inner bodies are read now, and both
-- carry the same class this lane already closed eight times.
--
--   hr.leave_case_open(p_leave_request_id)      another organization's leave request, pointed at
--                                               this case by `update hr.leave_request set
--                                               leave_case_id = … where id = $1` with no org in it
--   hr.leave_case_open(p_concurrent_policy_ids) another organization's policies, named on the case
--   hr.wf_request(p_subject_employment_id)      the person an approval is ABOUT, employed elsewhere
--
-- `hr.wf_request` is the instructive one: it ALREADY compares its target to the organization —
-- `if v_org <> p_organization_id then return …` — and then took the subject beside it as given.
-- One argument of a pair checked and the other not is the whole shape of this census.

set lock_timeout = '4s';

CREATE OR REPLACE FUNCTION hr.leave_case_open(p_employment_id uuid, p_case_kind text, p_continuity text, p_starts_on date, p_entitlement_hours numeric DEFAULT NULL::numeric, p_entitlement_measure text DEFAULT 'rolling_backward'::text, p_expected_return_on date DEFAULT NULL::date, p_runs_concurrent_with_pto boolean DEFAULT true, p_concurrent_policy_ids uuid[] DEFAULT '{}'::uuid[], p_leave_request_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'hr', 'public'
AS $function$
declare
  v_org uuid; v_rung text; v_case uuid; v_elig jsonb; v_months numeric; v_hours numeric;
  v_due integer;
begin
  select em.organization_id into v_org from hr.employment em
   where em.id = p_employment_id and em.deleted_at is null;
  if v_org is null then return jsonb_build_object('granted', false, 'reason','not_found'); end if;
  v_rung := hr._leave_admin_rung(v_org);
  if v_rung not in ('leave_administrator','hr_owner','hr_admin') then
    return jsonb_build_object('granted', false, 'reason','not_a_leave_administrator',
      'detail','A protected absence is opened and managed by HR.');
  end if;

  -- §9.8 / AR 1.6: 12 months of service AND 1,250 HOURS WORKED — hours_worked, never
  -- hours_of_service — computed from the workweek rows, and FROZEN with the ids that produced it.
  select extract(epoch from age(p_starts_on, em.hire_date)) / (30.44 * 86400) into v_months
    from hr.employment em where em.id = p_employment_id;
  select coalesce(sum(wi.hours), 0) into v_hours
    from hr.work_interval wi
    join hr.workweek w on w.id = wi.workweek_id
   where wi.employment_id = p_employment_id and wi.hours_category = 'worked'
     and w.week_start_local_date >= p_starts_on - 365 and w.week_start_local_date < p_starts_on;

  v_elig := jsonb_build_object(
    'evaluated_at', now(),
    'months_of_service', round(coalesce(v_months, 0), 2),
    'hours_worked_prior_12_months', round(coalesce(v_hours, 0), 2),
    'basis', 'hours_worked (AR 1.6) — never hours_of_service',
    'workweek_ids', coalesce((select jsonb_agg(distinct w.id)
                                from hr.work_interval wi join hr.workweek w on w.id = wi.workweek_id
                               where wi.employment_id = p_employment_id
                                 and wi.hours_category = 'worked'
                                 and w.week_start_local_date >= p_starts_on - 365
                                 and w.week_start_local_date < p_starts_on), '[]'::jsonb),
    'eligible', (coalesce(v_months, 0) >= 12 and coalesce(v_hours, 0) >= 1250),
    'test', '12 months of service and 1,250 hours worked in the preceding 12 months');

  v_due := (hr._hr_knob('hr.leave','case_certification_due_days', v_org, '15'::jsonb) #>> '{}')::integer;

  perform hr.arm_write();
  insert into hr.leave_case
    (employment_id, case_kind, continuity, starts_on, expected_return_on, entitlement_hours,
     entitlement_measure, runs_concurrent_with_pto, concurrent_policy_ids, state,
     eligibility_result, eligibility_evaluated_at, certification_due_on,
     schedule_impact, benefits_continuation, rule_version_ids, engine_key, engine_version, calc,
     record_class_key, organization_id)
  values
    (p_employment_id, p_case_kind, p_continuity, p_starts_on, p_expected_return_on,
     p_entitlement_hours, p_entitlement_measure, p_runs_concurrent_with_pto,
     coalesce(p_concurrent_policy_ids, '{}'::uuid[]),
     case when (v_elig ->> 'eligible')::boolean then 'open' else 'denied' end,
     v_elig, now(), p_starts_on + v_due,
     jsonb_build_object('mode', case p_continuity when 'continuous' then 'remove_from_schedule'
                                                  when 'reduced_schedule' then 'reduced_schedule'
                                                  else 'intermittent_ad_hoc' end,
                        'effective_from', p_starts_on, 'scheduler_summary', null),
     '{}'::jsonb, '{}'::uuid[], 'leave_case_engine', '1', '{}'::jsonb,
     'leave_case_medical', v_org)
  returning id into v_case;

  -- ARGS-RULED (2026-09-21). BOTH STORED REFERENCES BELONG TO THIS ORGANIZATION. `v_org` is
  -- taken off the employment and gates the caller; the leave request this case is attached to and
  -- the policies it is declared to run concurrently with were written in unasked, so a leave
  -- administrator of one organization could point another organization's leave request at their
  -- case, or name another organization's policies on it.
  if p_leave_request_id is not null
     and not exists (select 1 from hr.leave_request lr
                      where lr.id = p_leave_request_id and lr.organization_id = v_org
                        and lr.deleted_at is null) then
    return jsonb_build_object('granted', false, 'reason','leave_request_not_in_this_organization',
      'detail','A protected absence is attached to a leave request of the same organization.');
  end if;
  if coalesce(array_length(p_concurrent_policy_ids, 1), 0) > 0
     and exists (select 1 from unnest(p_concurrent_policy_ids) s(id)
                  where not exists (select 1 from hr.leave_policy lp
                                     where lp.id = s.id and lp.organization_id = v_org
                                       and lp.deleted_at is null)) then
    return jsonb_build_object('granted', false, 'reason','concurrent_policy_not_in_this_organization',
      'detail','Every policy a protected absence runs concurrently with belongs to the same organization.');
  end if;

  if p_leave_request_id is not null then
    perform hr.arm_write();
    update hr.leave_request set leave_case_id = v_case where id = p_leave_request_id;
  end if;

  return jsonb_build_object(
    'granted', true, 'case_id', v_case,
    'state', case when (v_elig ->> 'eligible')::boolean then 'open' else 'denied' end,
    'eligibility', v_elig,
    'certification_due_on', p_starts_on + v_due,
    -- §9.3: this is a PRODUCT DEFAULT, not a verified statutory deadline, and the control says so.
    'certification_due_basis', format('A product default of %s days. We seed no verified FMLA '
                                   || 'certification deadline, so this is our setting, not the law.',
                                      v_due),
    'notify', 'hr.leave.case_opened',
    'denied_statement', case when not (v_elig ->> 'eligible')::boolean
      then 'This absence is not eligible as protected leave under the test above. It may still be '
        || 'taken as ordinary leave.' end);
end
$function$

;
CREATE OR REPLACE FUNCTION hr.wf_request(p_flow_key text, p_target_token text, p_target_id uuid, p_organization_id uuid, p_payload jsonb DEFAULT '{}'::jsonb, p_subject_employment_id uuid DEFAULT NULL::uuid, p_as_draft boolean DEFAULT false, p_idempotency_key text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'hr', 'public'
AS $function$
declare
  ft hr.workflow_flow_type%rowtype; defn hr.workflow_definition%rowtype;
  v_uid uuid := auth.uid(); v_requester uuid; v_inst uuid; v_existing uuid;
  v_tbl text; v_subject uuid; v_digest text; v_version integer; sd record; v_org uuid;
  v_pf_action text; v_pf_step text; v_pf_any boolean;
  v_target_deleted boolean; v_target_soft_deletes boolean; v_target_noun text;
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
  -- 🚨 EXISTS INCLUDES "HAS NOT BEEN ARCHIVED". Whether this row can be soft-deleted at all is
  -- asked of platform.entity_types — the registry that already declares it — never of a second
  -- allowlist kept here, which would be one more thing to drift. `label` supplies the noun the
  -- refusal sentence uses, so the words a person reads come from the same registry row.
  select e.has_soft_delete,
         case when e.label ~ '^[A-Z][a-z]'
              then lower(left(e.label, 1)) || substr(e.label, 2)
              else e.label end
    into v_target_soft_deletes, v_target_noun
    from platform.entity_types e
   where e.token = p_target_token and e.is_active;

  execute format('select organization_id, version, %s from %I.%I where id = $1',
                 case when coalesce(v_target_soft_deletes, false)
                      then 'deleted_at is not null' else 'false' end,
                 split_part(v_tbl,'.',1), split_part(v_tbl,'.',2))
     into v_org, v_version, v_target_deleted using p_target_id;
  if v_org is null then
    return jsonb_build_object('granted', false, 'reason', 'target_missing',
                              'detail', format('no %s row with id %s', p_target_token, p_target_id));
  end if;
  if v_org <> p_organization_id then
    return jsonb_build_object('granted', false, 'reason', 'cross_org',
                              'detail', 'the target belongs to a different organization');
  end if;
  -- 🚨 hr_l1_77: A DELETED TARGET IS NAMED, NEVER SUBSTITUTED. This refusal is placed AFTER the
  -- cross-org check on purpose — another organization's archived row must read as cross_org, not
  -- as "no longer exists", which would confirm it once existed.
  --
  -- WHAT IT REPLACES: the row survives a soft delete, so `select organization_id` above found it
  -- and the door walked on. hr._approval_subject then returned NULL (its hr.employment branch
  -- requires `deleted_at is null`) and the subject seam below stamped THE REQUESTER as
  -- subject_employment_id — after which never-approve-yourself fired and the instance died
  -- `sole_actor_deadlock` with "is_subject" pointing at a person the request was never about.
  -- Reproduced twice in production (instances a7fd791c…, 4be6ae4f…), both terminations of an
  -- employment archived on 2026-08-28.
  if coalesce(v_target_deleted, false) then
    return jsonb_build_object('granted', false, 'reason', 'target_deleted',
      'detail', format('That %s no longer exists.',
                       coalesce(v_target_noun, replace(p_target_token, '_', ' '))),
      'flow_key', p_flow_key, 'target_token', p_target_token, 'target_id', p_target_id,
      'remedy', 'Nothing was submitted. If this record was archived by mistake, restore it first; '
             || 'otherwise pick a record that still exists.');
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

  -- 🚨 THE FIRST PLACE THE DOOR TOUCHES THE SUBJECT, AND IT MUST NOT THROW.
  -- hr._approval_subject RAISES for a target table it cannot map, so an unguarded call here threw
  -- an exception out of hr.wf_request for any registered flow whose target is off that allowlist —
  -- past the refusal-envelope law and past every caller. It now returns the SAME named refusal the
  -- resolver's RECORDED DECISION 5 gives, so all three layers tell one story.
  -- An explicit subject is honoured first and never needs the allowlist at all.
  -- ARGS-RULED (2026-09-21). THE SUBJECT IS EMPLOYED BY THIS ORGANIZATION. `p_target_id` IS
  -- compared to `p_organization_id` a few lines up ("if v_org <> p_organization_id"); the subject
  -- handed in beside it was taken as given, and the subject is who the whole approval is ABOUT.
  if p_subject_employment_id is not null
     and not exists (select 1 from hr.employment em
                      where em.id = p_subject_employment_id and em.organization_id = p_organization_id
                        and em.deleted_at is null) then
    return jsonb_build_object('granted', false, 'reason', 'subject_not_in_this_organization',
      'detail', 'the person an approval is about is employed by the organization it is raised in');
  end if;
  if p_subject_employment_id is not null then
    v_subject := p_subject_employment_id;
  else
    begin
      -- assigned INSIDE the block: a nested declare's variables die with the block, so reading one
      -- after `end;` is a scope trap that only shows up once some path actually gets past it.
      v_subject := hr._approval_subject(v_tbl, p_target_id);
      if v_subject is null then
        -- 🚨 hr_l1_82: TWO DIFFERENT FACTS WEAR ONE NULL, AND ONLY ONE OF THEM IS AN ERROR.
        -- hr._approval_subject_required names the targets whose subject is PROMISED — an
        -- employment, or a person and their spell. A NULL there is a FAILED RESOLUTION: the person
        -- exists but holds no live employment, so the request is about nobody, and standing the
        -- requester in produces hr_l1_77's exact ending one layer up (`sole_actor_deadlock` naming
        -- a person the request was never about). It is named instead.
        if hr._approval_subject_required(v_tbl) then
          return jsonb_build_object('granted', false, 'reason', 'subject_unresolved',
            'detail', case when v_tbl = 'hr.employment'
                           then 'That employment spell no longer exists.'
                           else format('That %s holds no current employment in this organization, '
                                    || 'so this request has nobody to be about.',
                                       coalesce(v_target_noun, replace(p_target_token, '_', ' '))) end,
            'flow_key', p_flow_key, 'target_token', p_target_token, 'target_id', p_target_id,
            'remedy', 'Nothing was submitted. If their employment was archived by mistake, restore '
                   || 'it first; otherwise this request cannot be made about them.');
        end if;
        -- 🚨 THE hr_l1_77 FALL-BACK-TO-SELF, DELIBERATELY KEPT. For a requisition, an offer, a
        -- schedule or an esign envelope the resolver maps NO subject column at all and returns
        -- NULL BY CONTRACT; and an OPEN SHIFT's employment_id is NULL exactly because nobody holds
        -- it yet. Standing the requester in is the correct reading of a request about nobody but
        -- themselves. "The resolver has nobody to name" and "the person you named has nobody to
        -- be" are two different facts, and only the second is an error.
        v_subject := v_requester;
      end if;
    exception when others then
      return jsonb_build_object('granted', false, 'reason', 'definition_invalid',
        'detail', format('approval_subject_unmapped: hr.can_approve cannot resolve a subject for %s (%s)',
                         v_tbl, sqlerrm),
        'flow_key', p_flow_key, 'target_token', p_target_token,
        'remedy', 'Add this target table to hr._approval_subject''s allowlist together with the column that names its subject employment, or pass p_subject_employment_id explicitly.');
    end;
  end if;

  -- ---- the definition: the org's latest published one, else the platform default (§1.2)
  select * into defn from hr.workflow_definition
   where flow_key = p_flow_key and status = 'published' and deleted_at is null
     and organization_id in (p_organization_id, '39c38960-d30c-4840-b0c1-c9960de95582'::uuid)
   order by (organization_id = p_organization_id) desc, definition_version desc limit 1;
  if not found then
    return jsonb_build_object('granted', false, 'reason', 'no_published_definition',
      'detail', format('flow %s has no published routing definition in this org or the platform default', p_flow_key));
  end if;

  -- ---- 🚨 PRE-FLIGHT (hr_c4_21): A REQUEST NOBODY COULD EVER APPROVE IS REFUSED AT THE FRONT
  -- DOOR, not minted and then failed `approver_ineligible` a moment later. The question is put to
  -- hr.can_approve — THE PREDICATE, never a re-derived copy of the resolver — for the first human
  -- step of the pinned definition. Self-steps and modes 1-2 are skipped on purpose: the subject is
  -- always the approver of the former, and the latter never resolve an approver at all (§7.1).
  -- The post-hoc machinery stays for concurrent revocation between submit and a later activation.
  select sd2.authority_action, sd2.step_key into v_pf_action, v_pf_step
    from hr.workflow_step_definition sd2
   where sd2.workflow_definition_id = defn.id and sd2.deleted_at is null
     and sd2.authority_action is not null
     and not sd2.allows_self
     and coalesce(sd2.autonomy_mode, 4) not in (1, 2)
   order by sd2.step_order, sd2.step_key
   limit 1;
  if v_pf_action is not null then
   -- 🚨 RECORDED DECISION 5 AT THE DOOR. hr.can_approve RAISES for a target table
   -- hr._approval_subject cannot map to a subject employment, and this pre-flight calls it
   -- DIRECTLY — before hr.wf_resolve_approvers, whose `begin … exception` block is where that
   -- guarantee used to live. Without this the raise escapes hr.wf_request entirely, which is a
   -- broken refusal-envelope law and is what hr_c4_21 accidentally introduced.
   begin
     select exists (
       select 1 from hr.employment em2
         join hr.employee e2 on e2.id = em2.employee_id
        where em2.organization_id = p_organization_id
          and em2.deleted_at is null and em2.status = 'active'
          and e2.login_user_id is not null
          -- §2.2 eligibility rule 2: where the flow type marks the requester an interested party,
          -- the resolver will strike them. A pre-flight that counted them would wave through
          -- exactly the case it exists to catch.
          and not (coalesce(ft.requester_is_interested_party, false)
                   and v_requester is not null
                   and em2.id = v_requester
                   and v_requester is distinct from v_subject)
          and hr.can_approve(e2.login_user_id, v_pf_action, v_tbl, p_target_id))
       into v_pf_any;
   exception when others then
     -- the resolver's EXACT reason and detail shape, so a caller cannot tell which layer caught
     -- it and the two can never drift into two stories about one condition. sqlerrm is carried,
     -- so nothing is swallowed — it is reported where a person can read it.
     return jsonb_build_object('granted', false, 'reason', 'definition_invalid',
       'detail', format('approval_subject_unmapped: hr.can_approve cannot resolve a subject for %s (%s)',
                        v_tbl, sqlerrm),
       'flow_key', p_flow_key, 'target_token', p_target_token, 'action_type', v_pf_action);
   end;
   if not v_pf_any then
    return jsonb_build_object(
      'granted', false, 'reason', 'WF_NO_POSSIBLE_APPROVER',
      -- 🚨 THE ARTICLE AGREES WITH THE NOUN. The flow key is substituted into this
      -- sentence, so a hard-coded "a %s" produced "a address change" the moment the noun
      -- began with a vowel. This string is not a log line — it is the sentence a person
      -- reads when their own edit will not go through, and broken grammar there reads as
      -- carelessness about their request.
      'detail', format('Nobody in this organization can approve %s yet. Grant the authority first, then submit again.',
                       (select case when noun ~* '^[aeiou]' then 'an ' else 'a ' end || noun
                          from (select replace(replace(p_flow_key, '_', ' '), ' request', '') as noun) q)),
      'action_type', v_pf_action, 'step_key', v_pf_step, 'flow_key', p_flow_key,
      'door', 'hr_authority_grant',
      'remedy', 'An organization owner or HR administrator grants this approval authority to somebody; the request can then be submitted and will route to them.');
   end if;
  end if;

  -- ---- 🚨 D275: THE EXCLUSIVE BINDING IS CHECKED BEFORE ANYTHING IS WRITTEN. A refusal must
  -- leave nothing behind, and a workflow instance is evidence that is never deleted (§1.3) — so an
  -- orphan `validating` row from a refused request could never be cleaned up afterwards.
  select b.workflow_instance_id into v_existing
    from hr.workflow_binding b
   where b.target_token = p_target_token and b.target_id = p_target_id
     and b.flow_key = p_flow_key and b.is_open and b.exclusive
   limit 1;
  if v_existing is not null then
    return jsonb_build_object('granted', false, 'reason', 'WF_BINDING_OPEN',
      'detail', format('an open %s already exists on this %s', p_flow_key, p_target_token),
      'existing_instance_id', v_existing);
  end if;

  v_digest := hr._wf_call_digest(p_flow_key, p_organization_id, p_target_token, p_target_id);

  perform hr.arm_write();
  -- 🚨 THE INSTANCE AND ITS BINDING SHARE ONE EXCEPTION BLOCK, so the binding's unique_violation
  -- rolls the instance row back with it. The pre-check above cannot answer two CONCURRENT requests
  -- — both read no open binding, both insert, one loses on the partial unique index — and the
  -- loser must not strand an instance either. §1.6 is unchanged: exclusivity is still enforced by
  -- the database, by the same index.
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

    insert into hr.workflow_binding (organization_id, workflow_instance_id, target_token, target_id,
                                     flow_key, is_open, exclusive)
    values (p_organization_id, v_inst, p_target_token, p_target_id, p_flow_key, true, true);
  exception when unique_violation then
    -- plpgsql variables are not transactional, so v_inst survives this block's rollback and tells
    -- the two collisions apart: NULL = the instance's idempotency index (a replay), non-NULL = the
    -- binding's exclusivity index (a refusal, whose instance row is already gone with it).
    if v_inst is null then
      select id into v_existing from hr.workflow_instance
       where organization_id = p_organization_id and flow_key = p_flow_key
         and idempotency_key = p_idempotency_key;
      if v_existing is not null then
        return jsonb_build_object('granted', true, 'instance_id', v_existing, 'replayed', true);
      end if;
      raise;
    end if;
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
end $function$

;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values
  ('hr', 'leave_case_open',
   'p_employment_id uuid, p_case_kind text, p_continuity text, p_starts_on date, p_entitlement_hours numeric, p_entitlement_measure text, p_expected_return_on date, p_runs_concurrent_with_pto boolean, p_concurrent_policy_ids uuid[], p_leave_request_id uuid',
   array['uuid'::regtype,'text'::regtype,'text'::regtype,'date'::regtype,'numeric'::regtype,'text'::regtype,'date'::regtype,'boolean'::regtype,'uuid[]'::regtype,'uuid'::regtype]::oid[],
   'p_employment_id: the employment is resolved, its organization becomes v_org, and hr._leave_admin_rung(v_org) must be leave_administrator, hr_owner or hr_admin. p_leave_request_id and p_concurrent_policy_ids: ARGS-RULED 2026-09-21 - each must belong to v_org, refused by name otherwise. NULL employment answers not_found; a NULL policy array is the empty array.',
   'argsruled_three_more_second_ids.sql',
   'server_only: no client role holds EXECUTE on it. The client reaches this through public.hr_leave_case_open, which is the declared door.',
   false, false),
  ('hr', 'wf_request',
   'p_flow_key text, p_target_token text, p_target_id uuid, p_organization_id uuid, p_payload jsonb, p_subject_employment_id uuid, p_as_draft boolean, p_idempotency_key text',
   array['text'::regtype,'text'::regtype,'uuid'::regtype,'uuid'::regtype,'jsonb'::regtype,'uuid'::regtype,'boolean'::regtype,'text'::regtype]::oid[],
   'p_organization_id: the caller must hold an employment in it (requester_not_employed) and the target''s own organization must equal it. p_target_id: the target row is read through the flow type''s declared table and its organization compared to p_organization_id. p_subject_employment_id: ARGS-RULED 2026-09-21 - must be a live employment of p_organization_id, refused by name otherwise; NULL means the subject is derived from the target by hr._approval_subject.',
   'argsruled_three_more_second_ids.sql',
   'server_only: no client role holds EXECUTE on it. The client reaches this through public.hr_wf_request, which is the declared door.',
   false, false)
on conflict do nothing;
