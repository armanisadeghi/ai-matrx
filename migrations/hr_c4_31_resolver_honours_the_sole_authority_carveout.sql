-- HR domain C4 — migration 31 (register item HRB-008; found by the Leave lane's end-to-end probe).
--
-- 🚨 THE SELECTOR AND THE PREDICATE DISAGREE ABOUT THE SAME PERSON, AND THE REQUEST DIES.
--
-- Measured on a fresh single-person org (rolled back), driving the real door as a non-admin:
--
--   hr.can_approve(Pat, 'leave_approve', <Pat's own request>)      → TRUE
--   hr.wf_resolve_approvers(...)  refused: [{"why":"is_subject"}]  → sole_actor_deadlock
--   instance state = failed
--
-- `hr_c4_20` made SPEC-ACCESS §1.4 rule 3's sole-proprietor carve-out REACHABLE in the predicate:
-- for an `auto_record` action, where the subject is top of the chart and there is genuinely no
-- second actor, they may take their own request — *"blocking a sole proprietor from taking a day
-- off is over-tightening"*, stamped `approval_basis='sole_authority'` and audited.
--
-- But `hr.wf_resolve_approvers`' `eligible()` rule 1 strikes the subject **before the predicate is
-- ever consulted**. So the predicate grants what the selector has already thrown away, and a sole
-- proprietor's own leave request fails `sole_actor_deadlock` in a fresh org — the exact case the
-- spec says must not be blocked.
--
-- This is the mirror of the defect hr_c4_20 fixed. There, the predicate could not speak a rung the
-- resolver walked. Here, the resolver cannot speak a carve-out the predicate grants. Same disease,
-- opposite direction, same cure: **make the two read one rule.**
--
-- ===================================================================================
-- RECORDED TECHNICAL DECISIONS
--
-- 1. 🚨 RULE 1 ASKS THE PREDICATE INSTEAD OF PRE-EMPTING IT. Never-approve-yourself is not weakened
--    by one inch: `hr.can_approve`'s OWN RULE 1 is that rule, and it returns FALSE for self in every
--    case except `allows_self` (a self-step) and §1.4 rule 3's carve-out. Deferring to it makes the
--    predicate the single source of truth for "may this person act on this", which is what
--    RECORDED DECISION 1 already says about the END of the selector — this applies the same
--    philosophy at the start of it. A subject who is not covered by the carve-out is struck exactly
--    as before, with the same `is_subject` reason.
--
-- 2. ONLY THE `auto_record` TIER, SO A PAY CHANGE IS UNREACHABLE THIS WAY. The helper refuses
--    outright for any `require_second_actor` action, so no amount of predicate behaviour can let
--    somebody approve their own pay change, termination or offer through this path. The tier test is
--    `hr._wf_two_actor_action`, the same one hr_c4_22 uses — one spelling, one place.
--
-- 3. A HELPER, NOT A NESTED `declare … begin … end` IN THE RESOLVER. hr_c4_25 and hr_c4_26 each shipped
--    a P0 by declaring a variable inside such a block and reading it after the block closed. The
--    lesson is one migration old, so the guarded logic goes in `hr._wf_subject_may_self_act`, which
--    has its own exception handler and returns a plain boolean. Nothing new is scoped inside the
--    resolver's loop.
--
-- 4. IT IS RECORDED, NOT SILENT. A subject kept under the carve-out is written to
--    `resolution_evidence.sole_authority`, so the step says plainly WHY the person the rule normally
--    strikes was allowed to stand — and `hr.wf_decide` stamps `approval_basis` when they act.
--
-- Authority: SPEC-ACCESS §1.4 rule 3 (the carve-out and its three conditions), SPEC-WORKFLOW-ENGINE
-- §2.2 eligible() rule 1 and RECORDED DECISION 1 (the predicate has the last word).
-- Applied live as `hr_c4_31_resolver_honours_the_sole_authority_carveout`. Idempotent.

set local statement_timeout = '600s';
set local lock_timeout = '120s';

do $$
declare v_bad integer;
begin
  select count(*) into v_bad
    from platform.entity_types e, lateral iam.canonical_certify('hr', e.table_name, e.token) c
   where e.schema_name = 'hr' and c.category <> 'broken_dependent_fn' and c.status in ('FAIL','WARN');
  perform set_config('matrx.hr_c4_31_conf_before', v_bad::text, true);
end $$;

-- ============================================================ 1. the helper (RD 2 / RD 3)
create or replace function hr._wf_subject_may_self_act(p_employment uuid,
                                                       p_action_type text,
                                                       p_target_table text,
                                                       p_target_id uuid,
                                                       p_at date)
returns boolean
language plpgsql stable security definer set search_path = hr, public
as $fn$
declare v_uid uuid;
begin
  if p_employment is null or p_action_type is null then
    return false;
  end if;
  -- RD 2: a require_second_actor action can NEVER be taken by its own subject this way.
  if hr._wf_two_actor_action(p_action_type) then
    return false;
  end if;
  v_uid := hr._wf_login_of(p_employment);
  if v_uid is null then
    return false;   -- nobody to be; the carve-out is about a person who can actually act
  end if;
  -- RD 1: the PREDICATE decides. Its own RULE 1 is never-approve-yourself, and it says yes here
  -- only under §1.4 rule 3's three conditions (auto_record, top of chart, no second actor).
  begin
    return coalesce(hr.can_approve(v_uid, p_action_type, p_target_table, p_target_id, p_at), false);
  exception when others then
    return false;   -- an unmapped subject or any other raise: fail closed, strike as before
  end;
end
$fn$;

revoke all on function hr._wf_subject_may_self_act(uuid, text, text, uuid, date)
  from public, anon, authenticated;

comment on function hr._wf_subject_may_self_act is
  'SPEC-ACCESS §1.4 rule 3 — may this SUBJECT take their own request? True only for an auto_record action whose subject is top of the chart with no second actor, as decided by hr.can_approve itself. Exists so hr.wf_resolve_approvers'' eligible() rule 1 asks the predicate instead of pre-empting it: before this, the predicate granted a sole proprietor their own leave and the selector had already struck them, failing the instance sole_actor_deadlock.';

-- ============================================================ 2. rule 1 asks it
do $mig$
declare
  v_oid oid; v_def text; v_new text;
  v_dec_old constant text := $o$  v_noreach   jsonb  := '[]'::jsonb;$o$;
  v_dec_new constant text := $o$  v_noreach   jsonb  := '[]'::jsonb;
  v_sole      jsonb  := '[]'::jsonb;   -- subjects kept under §1.4 rule 3's carve-out$o$;
  v_r1_old constant text := $o$          if v_subject is not null and c = v_subject and not sd.allows_self then
            v_refused := v_refused || jsonb_build_object('employment_id', c, 'why', 'is_subject');
            continue;
          end if;$o$;
  v_r1_new constant text := $o$          -- 🚨 RULE 1 ASKS THE PREDICATE INSTEAD OF PRE-EMPTING IT (§1.4 rule 3). Never-approve-
          -- yourself is untouched: hr.can_approve's own RULE 1 IS that rule, and it says yes for a
          -- subject only under `allows_self` or the sole-proprietor carve-out — auto_record, top of
          -- the chart, no second actor. Striking first meant the predicate granted a sole
          -- proprietor their own leave while the selector had already thrown them away, and the
          -- instance died sole_actor_deadlock in every fresh single-person org.
          if v_subject is not null and c = v_subject and not sd.allows_self then
            if hr._wf_subject_may_self_act(c, v_action, v_target_tbl, inst.target_id, v_at) then
              v_sole := v_sole || jsonb_build_object('employment_id', c, 'why', 'sole_authority');
            else
              v_refused := v_refused || jsonb_build_object('employment_id', c, 'why', 'is_subject');
              continue;
            end if;
          end if;$o$;
  v_evs_old constant text := $o$      'predicate_refused', v_refused, 'absent', v_absent, 'no_reach', v_noreach,$o$;
  v_evs_new constant text := $o$      'predicate_refused', v_refused, 'absent', v_absent, 'no_reach', v_noreach,
      'sole_authority', v_sole,$o$;
begin
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'wf_resolve_approvers';
  v_def := pg_get_functiondef(v_oid);
  if position($chk$_wf_subject_may_self_act$chk$ in v_def) > 0 then
    raise notice 'hr_c4_31: rule 1 already asks the predicate';
  else
    if position(v_dec_old in v_def) = 0 or position(v_r1_old in v_def) = 0
       or position(v_evs_old in v_def) = 0 then
      raise exception 'hr_c4_31: hr.wf_resolve_approvers does not carry the expected rule 1 — refusing to half-apply';
    end if;
    v_new := replace(v_def, v_dec_old, v_dec_new);
    v_new := replace(v_new, v_r1_old,  v_r1_new);
    v_new := replace(v_new, v_evs_old, v_evs_new);
    execute v_new;
    raise notice 'hr_c4_31: eligible() rule 1 now defers to the predicate for the sole-authority carve-out';
  end if;
end
$mig$;

-- ============================================================ 3. post-conditions
do $$
declare v_src text; v_bad integer; v_before integer; v_res jsonb;
begin
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'wf_resolve_approvers';
  if v_src !~ '_wf_subject_may_self_act' then
    raise exception 'hr_c4_31: rule 1 still pre-empts the predicate';
  end if;
  -- RD 1: the strike is still there for everybody the carve-out does not cover
  if v_src !~ '''why'', ''is_subject''' then
    raise exception 'hr_c4_31: never-approve-yourself was removed rather than deferred';
  end if;
  -- RD 4: kept subjects are recorded
  if v_src !~ 'sole_authority' then
    raise exception 'hr_c4_31: a subject kept under the carve-out is not recorded in the evidence';
  end if;
  -- RD 3: no new nested declare inside the resolver (the P0 lesson)
  if v_src ~ 'declare v_self' then
    raise exception 'hr_c4_31: a block-scoped variable was introduced into the resolver';
  end if;

  -- RD 2: a require_second_actor action is refused outright, whatever the predicate would say
  if hr._wf_subject_may_self_act(
       (select id from hr.employment limit 1), 'pay_change_approve', 'hr.employment',
       (select id from hr.employment limit 1), current_date) then
    raise exception 'hr_c4_31: the carve-out admits a require_second_actor action';
  end if;

  -- the door still returns envelopes (hr_c4_30's guard)
  v_res := hr._wf_door_smoke();
  if not coalesce((v_res ->> 'ok')::boolean, false) then
    raise exception 'hr_c4_31: the door smoke test failed: %', v_res;
  end if;
  select coalesce(count(*), 0) into v_bad from hr.function_contracts_broken();
  if v_bad > 0 then
    raise exception 'hr_c4_31: % function contract(s) broken', v_bad;
  end if;

  select count(*) into v_bad
    from platform.entity_types e, lateral iam.canonical_certify('hr', e.table_name, e.token) c
   where e.schema_name = 'hr' and c.category <> 'broken_dependent_fn' and c.status in ('FAIL','WARN');
  v_before := current_setting('matrx.hr_c4_31_conf_before')::integer;
  if v_bad > v_before then
    raise exception 'hr_c4_31: hr conformance findings rose from % to %', v_before, v_bad;
  end if;
end $$;
