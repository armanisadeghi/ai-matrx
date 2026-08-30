-- hr_l1_77 — A DELETED TARGET IS NAMED, NEVER SUBSTITUTED.
--
-- RECORD of a live change applied on 2026-08-29 to db.matrxserver.com.
--
-- 🚨 THE DEFECT, VERIFIED ON PRODUCTION v0.4.1474 AND REPRODUCED TWICE HERE. A termination
-- requested against an employment that had been SOFT-DELETED did not refuse. It was accepted,
-- and along the way it quietly made THE REQUESTER the subject of the request:
--
--   hr.workflow_instance a7fd791c-ce61-4e97-bbfc-8d5d7f55aaf5  (target f2d21728…, deleted 2026-08-28)
--   hr.workflow_instance 4be6ae4f-7541-42cc-891c-e2d8a0f8571f  (target 94815332…, deleted 2026-08-28)
--
-- Both carry requester_employment_id = subject_employment_id = 9c0b1d0c… — an employment that has
-- nothing to do with either target — and both died `failed` with a `sole_actor_deadlock` whose
-- explanation is "is_subject" ON THE REQUESTER. Every word of that outcome is false: the request
-- was not deadlocked, and the requester was not its subject. The truth is much simpler and was
-- never said out loud — the employment being terminated no longer exists.
--
-- ── WHY IT HAPPENED ───────────────────────────────────────────────────────────────────────────
--
-- hr.wf_request proves the target exists with `select organization_id … where id = $1`. A soft
-- delete leaves that row in place, so the check passed. hr._approval_subject's hr.employment
-- branch, correctly, requires `deleted_at is null` and so returned NULL — and the
-- `coalesce(hr._approval_subject(…), v_requester)` beneath it read that NULL as "this flow has no
-- subject of its own, so the requester is the subject" and stamped them in.
--
-- ── THE FIX, AND THE LINE IT DRAWS ────────────────────────────────────────────────────────────
--
-- The refusal is raised where the question belongs: at the target-existence check, which now
-- means "exists AND has not been archived". Soft-deletability is read from platform.entity_types
-- (`has_soft_delete`), and the noun in the sentence from the same row's `label`, so no allowlist
-- is duplicated into this function and no wording is invented here. It lands AFTER the cross-org
-- check so that another organization's archived row still reads `cross_org` — "no longer exists"
-- would confirm it once did.
--
-- 🚨 THE COALESCE IS DELIBERATELY UNTOUCHED, because its other use is not this bug. For a
-- requisition, an offer, a schedule or an esign envelope hr._approval_subject maps NO subject
-- column at all and returns NULL BY CONTRACT; standing the requester in there is the correct
-- reading of a request about nobody but themselves. This migration separates that legitimate
-- fall-back-to-self from a TARGET THAT FAILED TO RESOLVE, and refuses only the second.
--
-- Nothing is staged on a refusal: the return happens before hr.arm_write(), before the instance
-- insert, before the binding, before any step row — the D275 rule this door already keeps.
--
-- 🚨 NO CLIENT CHANGE IS NEEDED, verified by reading rather than assumed: the surfaces render the
-- server's `detail` and `remedy` verbatim (ProposePayChange's OutcomeLine puts both on screen
-- under a neutral icon, and isRefusalEnvelope routes {granted:false} inline), so the new sentence
-- reaches the person who typed the request without a new branch anywhere.
--
-- 🚨 NUMBERED 77, NOT 75: the ledger's slot guard refused hr_l1_75 mid-apply — that number is
-- already held by hr_l1_75_an_employee_can_report_and_the_reporter_is_told.sql, and 76 by
-- hr_l1_76_the_reason_category_had_no_reader.sql. The guard did exactly its job.
--
-- IDEMPOTENT: CREATE OR REPLACE plus a post-condition assertion. Re-running changes nothing.
-- ──────────────────────────────────────────────────────────────────────────────────────────────

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
  -- requires `deleted_at is null`) and the coalesce below stamped THE REQUESTER as
  -- subject_employment_id — after which never-approve-yourself fired and the instance died
  -- `sole_actor_deadlock` with "is_subject" pointing at a person the request was never about.
  -- Reproduced twice in production (instances a7fd791c…, 4be6ae4f…), both terminations of an
  -- employment archived on 2026-08-28.
  --
  -- The coalesce is DELIBERATELY LEFT ALONE. Its other use is legitimate and different in kind:
  -- for a requisition, an offer, a schedule or an esign envelope, hr._approval_subject maps no
  -- subject column at all and returns NULL BY CONTRACT, and standing the requester in as the
  -- subject is the correct reading (it is their own request). "The resolver has nobody to name"
  -- and "the thing you named is gone" are two different facts, and only the second is an error.
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
  if p_subject_employment_id is not null then
    v_subject := p_subject_employment_id;
  else
    begin
      -- assigned INSIDE the block: a nested declare's variables die with the block, so reading one
      -- after `end;` is a scope trap that only shows up once some path actually gets past it.
      v_subject := coalesce(hr._approval_subject(v_tbl, p_target_id), v_requester);
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
end $function$;


-- ──────────────────────────────────────────────────────────────────────────────────────────────
-- POST-CONDITION. The clause has to be IN the deployed body, not merely in this file.
-- ──────────────────────────────────────────────────────────────────────────────────────────────
do $post$
begin
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'hr' and p.proname = 'wf_request'
       and p.prosrc like '%target_deleted%'
       and p.prosrc like '%platform.entity_types%')
  then
    raise exception 'hr_l1_77 did not take: hr.wf_request has no target_deleted refusal';
  end if;
end
$post$;
