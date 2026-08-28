-- HR domain C4 — migration 33 (register item HRB-008; ruled by the coordinator from L1's fixture
-- work, recorded in the AMENDMENT-QUEUE).
--
-- 🚨 DIGEST WITHHOLDING GATES ON ENTITLEMENT TO THE STEP, NOT TO THE FIELD.
--
-- Measured live, in `hr._wf_display`:
--
--     v_entitled := (v_uid = any(st.resolved_user_ids))
--                or hr.capability(v_uid, 'workflow.view_queue', inst.subject_employment_id);
--
-- That is *"are you on this step"*, and it is the ONLY gate in front of the change block that
-- renders `payload -> 'patch'` for a decider. So an approver who has been routed a change to
-- `hr_employee_private` — Confidential tier, `identity.read`, live door — is shown that person's
-- home address because they were assigned the step, never because they may read the field.
--
-- Nothing was leaking today only because ROUTING CONVENTION happens to send address changes to an
-- hr_admin. The convention is written down as prose in the seed:
--
--     hr.field_policy(hr_employee_private, home_address).notes =
--       "Routed to hr_admin, not the manager: home address is Confidential tier and a manager
--        holds no identity.read."
--
-- A comment is not an enforcement. Any org that grants `address_change_approve` to a manager — the
-- ordinary thing to do — routes a Confidential field to somebody with no `identity.read`, and the
-- engine has nothing to say about it.
--
-- ===================================================================================
-- THE RULING: DECIDING REQUIRES SEEING, SO ENFORCEMENT MOVES TO ROUTING TIME.
--
-- The fix is NEVER to blind the decider — a person asked to approve a change they cannot see is
-- being asked to rubber-stamp, which is worse than no review at all (hr_l1_39 already fixed the
-- opposite failure: a legal name change approved without the name ever reaching the screen).
--
-- So the ineligibility is decided BEFORE the assignment, not after it: a candidate approver who
-- holds no read entitlement to the fields in this request's change is NOT A CANDIDATE for the
-- step. They are skipped exactly as the subject is skipped — recorded, named, and the fallback
-- chain keeps climbing. If nobody entitled exists anywhere on the chain, the step fails CLOSED to
-- the HR admin queue with its own failure class, rather than routing to somebody who would then be
-- shown a field they may not read.
--
-- ===================================================================================
-- RECORDED TECHNICAL DECISIONS
--
-- 1. 🚨 THE GATE IS DERIVED FROM THE REQUEST'S CHANGE CONTENT, AND MOST FLOWS DERIVE NOTHING.
--    `hr._wf_change_entitlement(instance)` returns NULL — costing one jsonb `?` test — unless ALL
--    of these hold:
--      · the payload carries an object `patch` (a field-change flow; `hr_self_update`'s shape),
--      · at least one patch key is a governed column of that token in `hr.field_policy`
--        (the ruling's words: *the patch's field policies*), and
--      · `hr._door_spec(token)` yields a tier — i.e. that table is behind an audited door.
--    Measured against the live seed, that is the whole of the discrimination we need:
--      hr_employee_private → confidential {identity.read}   ARMED  (home_address, mailing_address,
--                                                                   date_of_birth, work_auth_*)
--      hr_tax_withholding  → confidential {identity.read,payroll.export}  ARMED (filing_status)
--      hr_employee         → no door                        NOT ARMED (legal_first/middle/last_name)
--    A legal name change therefore routes exactly as it did yesterday, because a legal name is
--    directory-tier and there is no door to hold anybody to. Over-tightening is this engine's
--    recorded textbook defect and it is not repeated here: a flow with no confidential change
--    content pays one `payload ? 'patch'` test and is otherwise byte-identical, evidence included.
--
-- 2. TABLE-LEVEL IS THE ONLY HONEST GRANULARITY, AND SPEC-ACCESS SAYS SO FIRST. §0 law 3:
--    *"RLS is row-level; field-level sensitivity inside one table is not expressible. Confidential
--    and Restricted facts live in their own tables (AD-2)."* So the sensitivity unit of a changed
--    field IS the table that holds it, and `hr.field_policy.target_token` is that table by
--    construction. Live, no `column_name` appears under two tokens, so the derivation is unambiguous.
--
-- 3. 🚨 ROUTING AND READING ASK THE SAME DOOR, OR THEY WILL DRIFT. The entitlement test is
--    `hr._door_verdict(user, token, row_id, false)` — the very function the audited read path uses,
--    STABLE, SECURITY DEFINER, writing nothing. And the (token, row_id) pair is resolved with the
--    IDENTICAL coalesce that `hr._wf_display` uses to decide what to render:
--        coalesce(payload ->> 'token', target_token) / coalesce(payload ->> 'row_id', target_id).
--    The thing gated and the thing shown are therefore the same thing, by construction rather than
--    by two hopefully-matching derivations.
--
-- 4. FAIL CLOSED, AND SAY WHICH FAILURE IT IS. `hr._wf_may_see_change` returns FALSE on any raise —
--    `hr._door_verdict` raises P0002 for a row that no longer exists, and an unanswerable door is a
--    closed door. When the chain is exhausted and the strikes were entitlement strikes, the reason
--    is `approver_not_entitled`, not the generic `approver_ineligible`: the fixes differ (grant the
--    capability, or route the action to a role that holds it), and a queue that cannot say which
--    problem it has cannot offer the right way out. The class is registered in
--    `platform.categories` AND admitted by the hardcoded CHECK in this same file — hr_c4_15 shipped
--    a class the CHECK rejected and made a live hazard of it; that lesson is applied here and the
--    CHECK is proven by a real insert, not by reading it.
--
-- 5. NO NEW `declare` INSIDE THE RESOLVER (the hr_c4_25/26 P0, one lane old). Both helpers own
--    their guarded logic and return a plain value; the two new resolver variables are hoisted into
--    the function's OWN declare block, and the `hr.function_contract` row in this file bans the
--    block-scoped spellings so the next editor cannot reintroduce the fault.
--
-- 6. A SKIPPED CANDIDATE IS EVIDENCE, EXACTLY LIKE `sole_authority`. Each strike is written to
--    `resolution_evidence.not_entitled` with the person, the token, the tier, the capabilities the
--    door wants and the fields that armed it; `change_entitlement` records what was required. Both
--    keys are emitted ONLY when the gate armed, so an unarmed flow's returned jsonb is unchanged
--    byte for byte.
--
-- ===================================================================================
-- OUT OF SCOPE AND REPORTED, NOT IMPROVISED: `pay_change` carries its proposal FLAT (`amount`,
-- `pay_basis`) under `target_token = 'hr_position_assignment'`, which has NO door, and
-- `hr._wf_pay_change_digest` shows that amount to any assigned approver. The same disease. But the
-- cure is not derivable: SPEC-EMPLOYEES §4.4 routes `pay_change` to the *manager of record*, and
-- SPEC-ACCESS §1.4 gives the derived `manager` role *"directory.read, working_record.read over
-- reports, time.read; nothing else"* — no `comp.read`. Gating pay_change on the `hr_compensation`
-- door would strand all 12 live pay_change steps and contradict a spec that no text reconciles.
-- The ruling names *the patch's field policies for field-change flows*; pay_change is not one, so
-- it is left exactly as it was and raised to the coordinator instead of guessed at.
--
-- Authority: the coordinator's ruling (AMENDMENT-QUEUE); SPEC-ACCESS §0 law 3, §1.4, §3, §8;
-- SPEC-WORKFLOW-ENGINE §1.3, §2.2 eligible(), §5.1 and RECORDED DECISION 1.
-- Applied live as `hr_c4_33_a_decider_who_cannot_see_is_not_a_candidate`. Idempotent.

set local statement_timeout = '600s';
set local lock_timeout = '120s';

do $$
declare v_bad integer;
begin
  select count(*) into v_bad
    from platform.entity_types e, lateral iam.canonical_certify('hr', e.table_name, e.token) c
   where e.schema_name = 'hr' and c.category <> 'broken_dependent_fn' and c.status in ('FAIL','WARN');
  perform set_config('matrx.hr_c4_33_conf_before', v_bad::text, true);
end $$;

-- ============================================================ 1. what does this change require?
create or replace function hr._wf_change_entitlement(p_instance uuid)
returns jsonb
language plpgsql stable security definer set search_path = hr, public
as $fn$
declare
  inst    hr.workflow_instance%rowtype;
  v_token text;
  v_row   uuid;
  v_tier  text;
  v_caps  text[];
  v_fields text[];
begin
  select * into inst from hr.workflow_instance where id = p_instance;
  if not found then return null; end if;

  -- RD 1: a flow that does not carry a patch is a flow with nothing to derive. One jsonb test.
  if not (inst.payload ? 'patch') or jsonb_typeof(inst.payload -> 'patch') <> 'object' then
    return null;
  end if;

  -- RD 3: the SAME pair hr._wf_display renders the change from, so the gate and the render can
  -- never describe different rows. The cast is guarded rather than bare: a malformed row_id must
  -- fall back, never take routing down.
  v_token := coalesce(nullif(inst.payload ->> 'token', ''), inst.target_token);
  if (inst.payload ->> 'row_id') ~
     '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    v_row := (inst.payload ->> 'row_id')::uuid;
  else
    v_row := inst.target_id;
  end if;
  if v_token is null or v_row is null then return null; end if;

  -- RD 1/RD 2: is the table holding those fields behind a door at all? hr._door_spec is IMMUTABLE
  -- and returns ZERO ROWS for a token with no door (verified live for hr_employee,
  -- hr_position_assignment and for a nonsense token) — it does not raise, so an ordinary flow is
  -- never taxed with a lookup that could fail.
  select ds.tier, ds.caps into v_tier, v_caps from hr._door_spec(v_token) ds;
  if v_tier is null then return null; end if;

  -- the ruling's words: the PATCH'S FIELD POLICIES. Only keys the org actually governs on this
  -- token count as change content.
  select coalesce(array_agg(distinct k order by k), '{}'::text[]) into v_fields
    from jsonb_object_keys(inst.payload -> 'patch') k
   where exists (select 1 from hr.field_policy fp
                  where fp.target_token = v_token and fp.column_name = k and fp.is_active);
  if v_fields = '{}'::text[] then return null; end if;

  return jsonb_build_object('token', v_token, 'row_id', v_row, 'tier', v_tier,
                            'caps', to_jsonb(v_caps), 'fields', to_jsonb(v_fields));
end
$fn$;

revoke all on function hr._wf_change_entitlement(uuid) from public, anon, authenticated;

comment on function hr._wf_change_entitlement is
  'The read entitlement this request''s CHANGE CONTENT requires, or NULL when it requires nothing. Non-null only for a field-change flow (payload carries an object `patch`) whose patch keys are governed columns in hr.field_policy on a token that hr._door_spec puts behind an audited door. Resolves (token, row_id) with the identical coalesce hr._wf_display uses to RENDER the change, so what is gated and what is shown are the same thing. hr_c4_33.';

-- ============================================================ 2. may this person see it?
create or replace function hr._wf_may_see_change(p_user uuid, p_entitlement jsonb)
returns boolean
language plpgsql stable security definer set search_path = hr, public
as $fn$
begin
  if p_entitlement is null then return true; end if;   -- nothing is required of anybody
  if p_user is null then return false; end if;
  -- RD 3: the AUDITED DOOR'S OWN VERDICT — never a re-derived capability test, so routing time and
  -- read time cannot disagree. Break-glass is deliberately NOT offered: break-glass is a reasoned,
  -- audited act by a person in front of a record, not a routing default.
  begin
    return coalesce((hr._door_verdict(p_user, p_entitlement ->> 'token',
                                      (p_entitlement ->> 'row_id')::uuid, false) ->> 'allowed')::boolean,
                    false);
  exception when others then
    -- RD 4: hr._door_verdict raises P0002 for a row that is gone. An unanswerable door is a closed
    -- door — this fails CLOSED, and the candidate is recorded as struck, never silently kept.
    return false;
  end;
end
$fn$;

revoke all on function hr._wf_may_see_change(uuid, jsonb) from public, anon, authenticated;

comment on function hr._wf_may_see_change is
  'May this login read the change content hr._wf_change_entitlement described? Asks hr._door_verdict — the same audited door the read path uses — and fails CLOSED on any raise. A null entitlement means nothing is required and everybody passes. hr_c4_33.';

-- ============================================================ 3. the failure class, both halves
do $$
begin
  if not exists (select 1 from platform.categories
                  where dimension = 'hr_workflow_failure_class' and slug = 'approver_not_entitled'
                    and organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'::uuid) then
    insert into platform.categories (organization_id, dimension, name, slug, is_system, position,
                                     visibility, metadata)
    values ('39c38960-d30c-4840-b0c1-c9960de95582'::uuid, 'hr_workflow_failure_class',
            'Nobody who may approve this may also read it', 'approver_not_entitled', true, 28,
            'internal',
            jsonb_build_object(
              'detail', 'Every candidate the routing plan produced for this step is barred from READING the fields this request proposes to change, so none of them can be shown the change they would be deciding. Deciding requires seeing, so they are not eligible. Retrying re-runs the same routing over the same people. Either grant the read capability the door names to somebody who already holds the approval authority, or move this approval action to a role that holds both.',
              'retryable', false,
              'resolutions', jsonb_build_array('reassign', 'abandon'),
              'blocks_instance', true,
              'default_assignee', 'hr_admin'));
    raise notice 'hr_c4_33: registered failure class approver_not_entitled';
  end if;
end $$;

-- 🚨 THE CLASS AND THE CHECK MOVE TOGETHER. hr_c4_15 registered a class the hardcoded CHECK still
-- rejected, so the engine could name a failure it could not store. Same file, or not at all.
do $$
begin
  if exists (select 1 from pg_constraint
              where conrelid = 'hr.workflow_failure'::regclass
                and conname = 'workflow_failure_class_registered'
                and pg_get_constraintdef(oid) !~ 'approver_not_entitled') then
    alter table hr.workflow_failure drop constraint workflow_failure_class_registered;
    alter table hr.workflow_failure add constraint workflow_failure_class_registered
      check (failure_class = any (array[
        'unroutable', 'approver_ineligible', 'validation_error', 'conflict_at_decision',
        'apply_failed', 'result_unverified', 'notification_undeliverable', 'target_missing',
        'definition_invalid', 'unactionable_no_reach', 'sole_actor_deadlock',
        'distinct_actor_required', 'approver_not_entitled']));
    raise notice 'hr_c4_33: CHECK workflow_failure_class_registered now admits approver_not_entitled';
  end if;
end $$;

-- ============================================================ 4. the resolver
do $mig$
declare
  v_oid oid; v_def text; v_new text;

  v_dec_old constant text := $o$  v_requester_interested boolean;$o$;
  v_dec_new constant text := $o$  v_requester_interested boolean;
  -- hr_c4_33 — hoisted into the FUNCTION's declare, never a nested one (the hr_c4_25/26 P0).
  v_ent       jsonb;                   -- what READ entitlement this request's change content needs
  v_unentitled jsonb := '[]'::jsonb;   -- candidates struck because they could not see that change$o$;

  v_der_old constant text := $o$  if v_target_tbl is null then
    return jsonb_build_object('granted', false, 'reason', 'definition_invalid',
      'detail', format('target token %s is not a registered active entity type', inst.target_token));
  end if;$o$;
  v_der_new constant text := $o$  if v_target_tbl is null then
    return jsonb_build_object('granted', false, 'reason', 'definition_invalid',
      'detail', format('target token %s is not a registered active entity type', inst.target_token));
  end if;

  -- 🚨 WHAT WOULD A DECIDER HAVE TO BE ABLE TO READ TO DECIDE THIS? Derived ONCE, before the
  -- chain is walked, and NULL for everything that carries no confidential change content — a
  -- leave request pays a single `payload ? 'patch'` test and nothing else changes about it,
  -- evidence included. Over-tightening is this engine's recorded textbook defect.
  v_ent := hr._wf_change_entitlement(inst.id);$o$;

  v_gate_old constant text := $o$            if not v_ok then
              v_refused := v_refused || jsonb_build_object('employment_id', c, 'why', 'predicate_refused');
              continue;
            end if;
          end if;
          keep := keep || c;$o$;
  v_gate_new constant text := $o$            if not v_ok then
              v_refused := v_refused || jsonb_build_object('employment_id', c, 'why', 'predicate_refused');
              continue;
            end if;
          end if;
          -- 🚨 DECIDING REQUIRES SEEING, SO A CANDIDATE WHO CANNOT SEE IS NOT A CANDIDATE.
          -- hr._wf_display withholds the change from a reader who is not entitled — but its
          -- entitlement test is "are you on this step", so being ASSIGNED the step was itself the
          -- entitlement, and an approver with no identity.read was shown a Confidential home
          -- address because somebody routed it to them. The answer is never to blind the decider:
          -- an approval taken without sight of the change is a rubber stamp the record then
          -- reports as a review. So the ineligibility is decided HERE, before the assignment
          -- exists — struck exactly as the subject is struck, recorded, and the fallback chain
          -- climbs on. If nobody entitled exists at all, the step fails closed to the HR admin
          -- queue as approver_not_entitled rather than routing to somebody who may not look.
          if v_ent is not null then
            v_ok := hr._wf_may_see_change(v_uid, v_ent);
            if not v_ok then
              v_unentitled := v_unentitled || jsonb_build_object(
                'employment_id', c, 'why', 'not_entitled_to_change',
                'token', v_ent ->> 'token', 'tier', v_ent ->> 'tier',
                'caps', v_ent -> 'caps', 'fields', v_ent -> 'fields');
              continue;
            end if;
          end if;
          keep := keep || c;$o$;

  v_rsn_old constant text := $o$        when v_had_holders then 'approver_ineligible'$o$;
  v_rsn_new constant text := $o$        -- 🚨 "everybody who may act is barred from LOOKING at it" has its own fix — grant the
        -- read capability the door names, or move the action to a role that holds both — so it
        -- gets its own name. approver_ineligible would send an admin hunting for a substitute
        -- who does not exist.
        when v_unentitled <> '[]'::jsonb then 'approver_not_entitled'
        when v_had_holders then 'approver_ineligible'$o$;

  v_fev_old constant text := $o$                                     'refused', v_refused, 'absent', v_absent,
                                     'no_reach', v_noreach));$o$;
  v_fev_new constant text := $o$                                     'refused', v_refused, 'absent', v_absent,
                                     'no_reach', v_noreach)
        || case when v_ent is null then '{}'::jsonb
                else jsonb_build_object('change_entitlement', v_ent,
                                        'not_entitled', v_unentitled) end);$o$;

  v_sev_old constant text := $o$      'delegation_principal_retains', v_retains));$o$;
  v_sev_new constant text := $o$      'delegation_principal_retains', v_retains)
    -- RD 6: emitted ONLY when the gate armed, so an unarmed flow's evidence is byte-identical.
    || case when v_ent is null then '{}'::jsonb
            else jsonb_build_object('change_entitlement', v_ent,
                                    'not_entitled', v_unentitled) end);$o$;
begin
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'wf_resolve_approvers';
  v_def := pg_get_functiondef(v_oid);

  if position($chk$_wf_change_entitlement$chk$ in v_def) > 0 then
    raise notice 'hr_c4_33: the resolver already gates on read entitlement to the change';
  else
    if position(v_dec_old  in v_def) = 0 or position(v_der_old in v_def) = 0
       or position(v_gate_old in v_def) = 0 or position(v_rsn_old in v_def) = 0
       or position(v_fev_old in v_def) = 0 or position(v_sev_old in v_def) = 0 then
      raise exception 'hr_c4_33: hr.wf_resolve_approvers does not carry the expected text — refusing to half-apply';
    end if;
    v_new := replace(v_def, v_dec_old,  v_dec_new);
    v_new := replace(v_new, v_der_old,  v_der_new);
    v_new := replace(v_new, v_gate_old, v_gate_new);
    v_new := replace(v_new, v_rsn_old,  v_rsn_new);
    v_new := replace(v_new, v_fev_old,  v_fev_new);
    v_new := replace(v_new, v_sev_old,  v_sev_new);
    execute v_new;
    raise notice 'hr_c4_33: eligible() now strikes a candidate who may not read the change';
  end if;
end
$mig$;

-- ============================================================ 5. the standing contract (RD 5)
do $$
begin
  delete from hr.function_contract
   where schema_name = 'hr' and function_name = 'wf_resolve_approvers' and home_migration = 'hr_c4_33';
  insert into hr.function_contract (schema_name, function_name, home_migration,
                                    must_contain, must_not_contain, reason)
  values ('hr', 'wf_resolve_approvers', 'hr_c4_33',
    array['_wf_change_entitlement', '_wf_may_see_change', 'not_entitled_to_change',
          'v_ent       jsonb;'],
    array['declare v_ent', 'declare v_unentitled'],
    'hr_c4_33: routing-time read entitlement. The resolver must keep DERIVING what the change requires (_wf_change_entitlement) and keep ASKING the audited door (_wf_may_see_change) — deleting either returns the engine to gating digest withholding on "are you on this step", which is what let a Confidential home address reach an approver holding no identity.read. The two variables must stay in the FUNCTION''s declare: hr_c4_25/26 each declared one inside a nested declare/begin/exception block, read it after the block closed, and PL/pgSQL resolved it as a column — 42703 took hr.wf_request down for four lanes.');
end $$;

-- ============================================================ 6. post-conditions that EXECUTE
do $$
declare
  v_src text; v_bad integer; v_before integer; v_res jsonb; v_ent jsonb;
  v_inst uuid; v_org uuid;
begin
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'wf_resolve_approvers';
  if v_src !~ '_wf_change_entitlement' or v_src !~ '_wf_may_see_change' then
    raise exception 'hr_c4_33: the resolver does not gate on read entitlement';
  end if;
  -- RD 5 / the P0 lesson: nothing block-scoped was introduced
  if v_src ~ 'declare v_ent' or v_src ~ 'declare v_unentitled' then
    raise exception 'hr_c4_33: a block-scoped variable was introduced into the resolver';
  end if;
  -- nothing that already worked was removed
  if v_src !~ '''why'', ''is_subject''' or v_src !~ 'sole_authority'
     or v_src !~ 'is_prior_decider' then
    raise exception 'hr_c4_33: an existing eligible() rule was lost';
  end if;

  -- RD 1, EXECUTED both ways on the live rows, not read out of the source.
  select id into v_inst from hr.workflow_instance
   where flow_key = 'address_change' and payload ? 'patch' order by created_at limit 1;
  if v_inst is not null then
    v_ent := hr._wf_change_entitlement(v_inst);
    if v_ent is null or v_ent ->> 'token' <> 'hr_employee_private'
       or v_ent ->> 'tier' <> 'confidential' then
      raise exception 'hr_c4_33: a Confidential address change derives no entitlement: %', v_ent;
    end if;
  end if;
  -- the no-collateral-narrowing half: hr_employee has no door, so a legal name change requires
  -- nothing extra and its routing is untouched.
  select id into v_inst from hr.workflow_instance
   where flow_key = 'profile_edit_request' and payload ->> 'token' = 'hr_employee'
   order by created_at limit 1;
  if v_inst is not null and hr._wf_change_entitlement(v_inst) is not null then
    raise exception 'hr_c4_33: a directory-tier name change was narrowed — over-tightening';
  end if;
  -- an ordinary leave request derives nothing at all
  select id into v_inst from hr.workflow_instance where flow_key = 'leave_request'
   order by created_at limit 1;
  if v_inst is not null and hr._wf_change_entitlement(v_inst) is not null then
    raise exception 'hr_c4_33: a leave request was taxed with an entitlement it does not need';
  end if;
  -- fail-closed: a null login can never see confidential change content
  if hr._wf_may_see_change(null, jsonb_build_object('token','hr_employee_private',
       'row_id','00000000-0000-0000-0000-000000000000')) then
    raise exception 'hr_c4_33: the entitlement test does not fail closed';
  end if;
  -- ... and neither can a real login asking about a row that is gone (hr._door_verdict raises P0002)
  if hr._wf_may_see_change((select login_user_id from hr.employee
                             where login_user_id is not null limit 1),
       jsonb_build_object('token','hr_employee_private',
                          'row_id','00000000-0000-0000-0000-000000000000')) then
    raise exception 'hr_c4_33: an unanswerable door was treated as an open one';
  end if;

  -- RD 4: the CHECK is proven by a REAL INSERT, rolled back. hr_c4_15's lesson.
  select i.id, i.organization_id into v_inst, v_org
    from hr.workflow_instance i order by i.created_at limit 1;
  if v_inst is not null then
    begin
      perform hr.arm_write();
      insert into hr.workflow_failure (organization_id, workflow_instance_id, failure_class, detail)
      values (v_org, v_inst, 'approver_not_entitled', '{"probe":"hr_c4_33"}'::jsonb);
      raise exception 'hr_c4_33_rollback_marker';
    exception
      when sqlstate '23514' then
        raise exception 'hr_c4_33: the CHECK still rejects approver_not_entitled';
      when others then
        if sqlerrm !~ 'hr_c4_33_rollback_marker' then raise; end if;
    end;
  end if;

  -- the door still returns envelopes (hr_c4_30's guard — an execution, not a grep)
  v_res := hr._wf_door_smoke();
  if not coalesce((v_res ->> 'ok')::boolean, false) then
    raise exception 'hr_c4_33: the door smoke test failed: %', v_res;
  end if;
  select coalesce(count(*), 0) into v_bad from hr.function_contracts_broken();
  if v_bad > 0 then
    raise exception 'hr_c4_33: % function contract(s) broken', v_bad;
  end if;

  select count(*) into v_bad
    from platform.entity_types e, lateral iam.canonical_certify('hr', e.table_name, e.token) c
   where e.schema_name = 'hr' and c.category <> 'broken_dependent_fn' and c.status in ('FAIL','WARN');
  v_before := current_setting('matrx.hr_c4_33_conf_before')::integer;
  if v_bad > v_before then
    raise exception 'hr_c4_33: hr conformance findings rose from % to %', v_before, v_bad;
  end if;
end $$;
