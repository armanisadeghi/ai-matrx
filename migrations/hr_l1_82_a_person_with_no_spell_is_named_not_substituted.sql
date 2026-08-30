-- hr_l1_82 — A PERSON WITH NO SPELL IS NAMED, NEVER SUBSTITUTED.
--
-- RECORD of a live change applied on 2026-08-30 to db.matrxserver.com.
-- Ledger: public._schema_migrations (source 'matrx-frontend') + supabase_migrations.schema_migrations.
-- Slot: hr_l1 #0082 (re-checked against both ledgers and both migration directories at commit).
--
-- 🚨 THE SAME CLASS hr_l1_77 CLOSED, ONE RESOLUTION LAYER UP. hr_l1_77 caught a request naming an
-- employment that had been archived. This is the request naming a PERSON — `address_change`,
-- `profile_edit_request`, both live, both targeting `hr_employee` — whose employments have ALL
-- been archived. The employee row itself is not deleted, so hr_l1_77's `target_deleted` refusal
-- does not fire. hr._approval_subject's person branch then maps the person to their current spell
-- with `deleted_at is null`, finds none, and returns NULL — and the coalesce beneath it read that
-- NULL as "this flow has no subject of its own" and stamped THE REQUESTER as the subject. Same
-- ending as hr_l1_77: never-approve-yourself fires on a person the request was never about.
--
-- ── THE LINE, AND WHY IT IS NOT DRAWN WHERE IT LOOKS LIKE IT SHOULD BE ────────────────────────
--
-- hr_l1_77 deliberately left the coalesce alone because a NULL from the resolver is sometimes the
-- CONTRACT: a requisition, an offer, a schedule or an esign envelope has no subject employment at
-- all, and standing the requester in is the correct reading. So the fix cannot be "a NULL subject
-- always refuses". It has to know WHICH KIND of NULL it is holding.
--
-- 🚨 AND THE OBVIOUS BROADER RULE — "if the resolver maps a column, a NULL in it is an error" —
-- IS WRONG, MEASURED, NOT GUESSED. Four of the mapped columns are nullable, and one of them is
-- nullable ON PURPOSE with a live flow riding on it: `open_shift_claim` targets `hr.shift`, and an
-- OPEN shift is precisely a shift whose `employment_id` is NULL. Refusing there would break the
-- claiming of open shifts, which is the entire feature. `hr.checklist_item.assignee_employment_id`,
-- `hr.schedule_change.employment_id` and `hr.background_check.employment_id` are nullable too.
-- "Nobody holds this yet" and "the person you named has nobody to be" are different facts.
--
-- So the line is drawn exactly where the resolver's own contract puts it, in ONE new place:
--
--   hr._approval_subject_required(target_table) → true for hr.employment and the person-scoped
--   family (hr.employee, hr.employee_private, hr.emergency_contact). For those, and only those,
--   the resolver PROMISES a subject: the target IS a person or a spell, so a NULL means the
--   resolution FAILED. Everywhere else a NULL is either impossible (a NOT NULL column) or means
--   "unassigned", and the hr_l1_77 fall-back-to-self stays exactly as it was.
--
-- hr._approval_subject is re-emitted with its two early branches UNDER that same predicate, so
-- there is one list, not two that can drift. A fifth table added to the predicate without an inner
-- branch falls through to the `!unknown` raise — loud, not silent.
--
-- hr.employment is included even though hr_l1_77 already refuses an archived employment earlier:
-- that check reads `has_soft_delete` off platform.entity_types, and if that registry row is ever
-- wrong the old substitution comes straight back. This is the second line, at the seam itself.
--
-- ── WHAT A PERSON READS ───────────────────────────────────────────────────────────────────────
--
--   reason `subject_unresolved`, and the sentence names the fact:
--   "That employee holds no current employment in this organization, so this request has nobody
--    to be about."  + a remedy. Nothing is staged: the return happens before hr.arm_write(),
--   before the instance, the binding and every step row, exactly as hr_l1_77's does.
--
-- No client change: the surfaces render `detail` and `remedy` verbatim through the refusal
-- envelope (isRefusalEnvelope routes {granted:false} inline), so this reaches the person who typed
-- the request without a new branch anywhere.
--
-- IDEMPOTENT: CREATE OR REPLACE plus post-condition assertions over the deployed bodies.
-- ══════════════════════════════════════════════════════════════════════════════════════════════


-- ──────────────────────────────────────────────────────────────────────────────────────────────
-- THE ONE PLACE THAT SAYS WHICH TARGETS MUST RESOLVE A SUBJECT.
-- ──────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION hr._approval_subject_required(p_target_table text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
AS $function$
  -- 🚨 hr_l1_82. TRUE means: for this target, hr._approval_subject PROMISES a subject employment,
  -- so a NULL from it is a FAILED RESOLUTION and must be named, never substituted with the
  -- requester. The target here IS a person (or their spell) — there is somebody it is about by
  -- construction, and if the resolver cannot find them, the request is about nobody.
  --
  -- FALSE means one of two legitimate NULLs, and hr_l1_77's fall-back-to-self keeps both:
  --   · no subject column at all, BY CONTRACT — a requisition, an offer, a schedule, an esign
  --     envelope: a request about nobody but the requester themselves.
  --   · a mapped column that is legitimately empty — an OPEN SHIFT (`open_shift_claim` targets
  --     hr.shift, whose employment_id is NULL exactly because nobody holds it yet), an unassigned
  --     checklist item, a schedule change or background check with no employment named yet.
  --
  -- hr._approval_subject reads this predicate to choose its own branch, so this is the ONLY list.
  select p_target_table in ('hr.employment', 'hr.employee', 'hr.employee_private',
                            'hr.emergency_contact')
$function$;


-- ──────────────────────────────────────────────────────────────────────────────────────────────
-- THE RESOLVER, re-emitted whole from the live body with its two early branches placed under the
-- shared predicate. Behaviour is unchanged; the branching now has one source.
-- ──────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION hr._approval_subject(p_target_table text, p_target_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'hr', 'public'
AS $function$
declare v_col text; v_sub uuid; v_emp uuid;
begin
  -- 🚨 hr_l1_82: the targets that PROMISE a subject, gated on the one predicate that says so. A
  -- table named there without a branch here falls through to the `!unknown` raise below — loud.
  if hr._approval_subject_required(p_target_table) then
    -- 🚨 THE SPELL ITSELF. `termination_approve` targets hr.employment, so the subject IS the row.
    -- Looked up rather than echoed back: a phantom id would give hr.can_approve a subject that can
    -- never match any caller's employments, and never-approve-yourself would silently pass.
    if p_target_table = 'hr.employment' then
      select em.id into v_sub from hr.employment em
       where em.id = p_target_id and em.deleted_at is null;
      return v_sub;
    end if;

    -- the PERSON-scoped targets: resolve the employee, then their current spell
    if p_target_table = 'hr.employee' then
      v_emp := p_target_id;
    else
      execute format('select employee_id from %I.%I where id = $1',
                     'hr', split_part(p_target_table,'.',2)) into v_emp using p_target_id;
    end if;
    if v_emp is null then return null; end if;
    select em.id into v_sub
      from hr.employment em
     where em.employee_id = v_emp and em.deleted_at is null
     order by em.hire_date desc limit 1;
    return v_sub;
  end if;

  v_col := case p_target_table
    when 'hr.leave_request'         then 'employment_id'
    when 'hr.leave_case'            then 'employment_id'
    when 'hr.pay_period_employment' then 'employment_id'
    when 'hr.time_adjustment'       then 'employment_id'
    when 'hr.overtime_preapproval'  then 'employment_id'
    when 'hr.shift_claim'           then 'requester_employment_id'
    when 'hr.schedule_change'       then 'employment_id'
    when 'hr.availability'          then 'employment_id'
    when 'hr.compensation'          then 'employment_id'
    when 'hr.position_assignment'   then 'employment_id'
    when 'hr.corrective_action'     then 'employment_id'
    when 'hr.separation'            then 'employment_id'
    when 'hr.training_assignment'   then 'employment_id'
    when 'hr.checklist_item'        then 'assignee_employment_id'
    when 'hr.requisition'           then null
    when 'hr.offer'                 then null
    when 'hr.background_check'      then 'employment_id'
    when 'hr.tax_withholding'       then 'employment_id'
    when 'hr.schedule'              then null
    -- 🚨 AN ENVELOPE HAS NO SUBJECT EMPLOYMENT, AND THAT IS THE CONTRACT, NOT A GAP. Zero of its
    -- columns FK to an employment; its signers live on a child table that holds MANY per envelope
    -- and whose own subject pointer is polymorphic and un-FK'd. The esign lane asserts exactly this
    -- in hrb011_proof.py section I ("THE WORKFLOW HOOK DOES NOT FORGE A SIGNATURE"):
    -- `hr._approval_subject('esign.envelope', …) is null`, without raising. Same group as
    -- requisition / offer / schedule above: there is nobody to be, so rule 1 cannot fire.
    when 'esign.envelope'           then null
    -- exactly ONE FK into hr.employment on this table, so there is nothing to choose between
    when 'hr.shift'                 then 'employment_id'
    -- 🚨 THE TEST FOR A TABLE WITH TWO EMPLOYMENT FKs, and it decides this one:
    -- THE SUBJECT IS WHOM THE ACTION IS ABOUT, NEVER WHO PERFORMED IT.
    -- hr.asset_assignment has both `employment_id` (the worker holding the asset) and
    -- `assigned_by_employment_id` (who issued it). An actor column can never be the subject: this
    -- engine's whole subject/actor distinction rests on it — never-approve-yourself tests the
    -- SUBJECT (§2.2 rule 1) and authority resolves over the SUBJECT's scope and chain (§2.1). Point
    -- one at the issuer and the person who handed out a laptop becomes the person whose recovery is
    -- being approved, judged by THEIR manager. Same test already chose hr.checklist_item's
    -- `assignee_employment_id` over its actor columns. (Coordinator ruling, 2026-08-28.)
    when 'hr.asset_assignment'      then 'employment_id'
    else '!unknown'
  end;

  if v_col = '!unknown' then
    raise exception 'hr.can_approve: % is not an approvable target table', p_target_table
      using errcode = '22023',
            hint = 'Add it to hr._approval_subject''s allowlist together with the column that names its subject employment.';
  end if;

  if v_col is null then
    -- a target with no subject employment at all (a requisition, a schedule, an offer to an
    -- outsider). There is nobody to be, so rule 1 cannot fire and the resolver returns NULL.
    return null;
  end if;

  execute format('select %I from %I.%I where id = $1',
                 v_col, split_part(p_target_table,'.',1), split_part(p_target_table,'.',2))
     into v_sub using p_target_id;
  return v_sub;
end
$function$;


-- ──────────────────────────────────────────────────────────────────────────────────────────────
-- THE DOOR. Only the subject seam changes; every other clause is the deployed body verbatim.
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
end $function$;


-- ──────────────────────────────────────────────────────────────────────────────────────────────
-- CONTRACT PINS for the new seam. The hr_c4_29 pin on hr.wf_request stays exactly as it is; these
-- are additional clauses under this migration's own home, so neither is silenced by the other.
-- ──────────────────────────────────────────────────────────────────────────────────────────────
insert into hr.function_contract
  (schema_name, function_name, home_migration, must_contain, must_not_contain, reason, must_be_definer)
values
  ('hr','wf_request','hr_l1_82',
   array['subject_unresolved','hr._approval_subject_required'],
   array[]::text[],
   'hr_l1_82: the seam that tells a CONTRACT null (a requisition/offer/schedule/esign envelope has '
   || 'no subject employment, and an open shift has nobody holding it) apart from a FAILED '
   || 'RESOLUTION (the person you named holds no live employment). Delete either token and the door '
   || 'goes back to stamping the requester as the subject of a request that was never about them — '
   || 'hr_l1_77''s defect, one resolution layer up.', true),
  ('hr','_approval_subject','hr_l1_82',
   array['hr._approval_subject_required'],
   array[]::text[],
   'hr_l1_82: the resolver reads the SAME predicate the door reads, so which targets promise a '
   || 'subject is stated in one place. Inline the list back here and the two can drift, which is '
   || 'how a person-scoped target starts resolving to nobody without anything saying so.', true)
on conflict (schema_name, function_name, home_migration) do nothing;


-- ──────────────────────────────────────────────────────────────────────────────────────────────
-- POST-CONDITIONS.
-- ──────────────────────────────────────────────────────────────────────────────────────────────
do $post$
declare v_t text;
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname='hr' and p.proname='wf_request'
                    and p.prosrc like '%subject_unresolved%'
                    and p.prosrc like '%hr._approval_subject_required%') then
    raise exception 'hr_l1_82 did not take: hr.wf_request has no subject_unresolved refusal';
  end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname='hr' and p.proname='_approval_subject'
                    and p.prosrc like '%hr._approval_subject_required%') then
    raise exception 'hr_l1_82 did not take: hr._approval_subject does not read the shared predicate';
  end if;

  -- the predicate says exactly what it is meant to say
  foreach v_t in array array['hr.employment','hr.employee','hr.employee_private','hr.emergency_contact']
  loop
    if not hr._approval_subject_required(v_t) then
      raise exception 'hr_l1_82: % must require a subject', v_t;
    end if;
  end loop;
  foreach v_t in array array['hr.requisition','hr.offer','hr.schedule','esign.envelope',
                             'hr.shift','hr.leave_request','hr.checklist_item']
  loop
    if hr._approval_subject_required(v_t) then
      raise exception 'hr_l1_82: % must NOT require a subject (an open shift has nobody holding it)', v_t;
    end if;
  end loop;

  if (select count(*) from hr.function_contracts_broken()) <> 0 then
    raise exception 'hr_l1_82: a function contract is broken';
  end if;
end
$post$;
