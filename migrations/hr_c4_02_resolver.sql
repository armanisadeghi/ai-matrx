-- HR domain C4 — migration 2 of 7 (register item HRB-008, lane core-c4-workflow).
--
-- THE SELECTOR. `hr.wf_resolve_approvers` (SPEC-WORKFLOW-ENGINE §2.2) and the small predicates it
-- needs: target-table resolution, holder dereferencing (§2.2 table), absence (§2.3), eligibility
-- (§2.2 `eligible()`), and the condition evaluator (§2.4).
--
-- 🚨 THE DIVISION OF LABOUR (SPEC-ACCESS §1.3b joint contract): SPEC-ACCESS owns the PREDICATE
-- (`hr.can_approve` — may this person approve this thing), this file owns the SELECTOR (who should
-- be asked). **The selector must never return a candidate the predicate would refuse.** That is
-- T-21b, whose selector half HRB-007 recorded as a blocking obligation of THIS lane; it is proven
-- in file 7 across all 26 action tokens.
--
-- Authority: SPEC-WORKFLOW-ENGINE §2; SPEC-ACCESS §1.3/§1.3a/§1.3b/§1.3c.
-- Applied live as `hr_c4_02_resolver`. Idempotent.
--
-- ===================================================================================
-- RECORDED TECHNICAL DECISIONS (EXECUTION §8)
--
-- 1. 🚨 THE SELECTOR ENDS WITH A PREDICATE FILTER, AND THAT IS WHAT MAKES T-21b TRUE BY
--    CONSTRUCTION RATHER THAN BY LUCK. §2.2's pseudocode walks the fallback chain and returns
--    candidates; §1.3b says the selector "must never return a candidate the predicate would
--    refuse". Two independent implementations of the same rules drift on the first spec change, so
--    the last thing the selector does is call `hr.can_approve` for every surviving candidate and
--    drop any it refuses — the predicate is the authority on eligibility and the selector is the
--    authority on ORDER and on WHICH RUNG. A candidate dropped at this stage is recorded in
--    `resolution_evidence.predicate_refused` rather than silently vanishing, because a rung that
--    looked full and then emptied is exactly the invisible-stall bug §1.3b names.
--
-- 2. THE `top_of_chart` RUNG READS THE PREDICATE, NOT A SECOND COPY OF ITS RULES.
--    §2.6 defines `top_of_chart` as "holders of `action` with scope_kind='org'". But
--    `hr.can_approve` RULE 3 also implements a top-of-chart lane of its own — the
--    `hr.approvals.top_of_chart_approver` knob (`org_owner`, falling through to `hr_owner` when the
--    SUBJECT is the owner) and the per-action `sole_authority_mode`. Those two are not the same set
--    and re-deriving the knob logic here would be a second implementation of a live rule. So this
--    rung yields BOTH: org-scoped authority holders (§2.6's set) AND the knob-resolved
--    org-owner/hr_owner employments (`hr.can_approve`'s set), then lets decision 1's predicate
--    filter settle it. The union is never wider than the predicate allows, because the predicate
--    runs last.
--
-- 3. A DELEGATED ROW SUPERSEDES ITS PRINCIPAL BY EXCLUSION AT THE AUTHORITY RUNG, EXACTLY AS §2.1
--    SAYS — and the `hr.workflow.delegation_principal_retains` knob turns it off. There is NO
--    delegation-specific code path anywhere else: the resolver reads `hr.approval_authority` only
--    (§2.1's ruling), and a delegated authority is just a row that happens to carry
--    `source='delegated'`. `resolution_path` becomes `delegated` — not `authority` — when the
--    matched row carries it, so the inbox and the history both say plainly that a substitute acts.
--    LIVE CORRECTION: the built column value is `source='assigned'`, not §2.1's `'direct'`.
--
-- 4. VACANT SEATS FALL THROUGH, THEY ARE NOT REFUSED. §2.2: a `position` holder with no employment
--    as of the evaluation date "contributes no candidate at all (it is dereferenced away before
--    eligibility, not rejected by it)". `hr._wf_holder_employments` returns an empty array and the
--    walk continues to the next rung — which is the difference between `unroutable` (nobody holds
--    the authority) and `approver_ineligible` (holders exist but every one is disqualified), and
--    those two failures have different fixes.
--
-- 5. 🚨 `hr.can_approve` RAISES 22023 FOR SIX OF THE ROSTER'S TARGET TABLES, AND THE ENGINE DOES NOT
--    GUESS. `hr._approval_subject`'s allowlist (SPEC-ACCESS-owned, HRB-007) covers 20 target
--    tables. The §1.1 flow roster targets three more that resolve MECHANICALLY and unambiguously —
--    `hr.employment` (the row IS the subject), `hr.shift` and `hr.asset_assignment` (both carry a
--    plain `employment_id`) — and the function's own HINT sanctions exactly this extension ("Add it
--    to hr._approval_subject's allowlist together with the column that names its subject
--    employment"). Those three are added below; the extension is strictly additive and can only
--    make MORE targets approvable, never fewer.
--    THE OTHER THREE ARE NOT GUESSED AND ARE NAMED INSTEAD:
--      · `hr.employee` (`profile_edit_request`, `address_change`) — an employee has MANY
--        employments, so the never-self veto for it is "p_user holds ANY employment whose
--        employee_id is this row", which a function returning ONE uuid cannot express. Extending it
--        with a guess (say, `current_employment_id`) would silently under-veto a person with a
--        second spell. This needs a `hr.can_approve` shape change, which is SPEC-ACCESS's to make.
--      · `hr.acknowledgment` and `esign_envelope` — the TABLES DO NOT EXIST (verified live). Owned
--        by the docs-and-forms lane and HRB-011 respectively.
--    Consequence, fail-closed and visible: those flow types are seeded `is_active = false` with an
--    `inactive_reason` (file 6), `hr.wf_request` refuses an inactive flow type, and if one is ever
--    activated before its blocker clears, `wf_activate_step` catches the raise and opens a
--    `definition_invalid` failure naming `approval_subject_unmapped`. Nothing routes on a guess.
--    OWED: SPEC-ACCESS §1.3b — `hr.can_approve`'s subject resolution for a multi-employment target.
--
-- 6. ABSENCE IS FOUR QUERIES, NOT §2.3's ONE, AND THE FOURTH IS NOT BUILDABLE YET. §2.3 lists an
--    approved leave request covering now(), an open `leave_case` with `status='on_leave'` (the live
--    column is `state`, and the value is `on_leave`), a future-dated termination, and "an explicit
--    out-of-office window in their HR settings". There is no out-of-office store live — no table,
--    no knob shape that could hold a per-user window (`platform.feature_knob` has no
--    `organization_id`, let alone a user key). The first three are implemented; the fourth reads
--    `hr.employment.metadata->'out_of_office'` if a lane ever writes it, which costs nothing and
--    means the check is present rather than forgotten. The employment `status` values `on_leave`
--    and `suspended` are also treated as absent — they are live, they mean exactly this, and
--    ignoring them would route work to someone the system already knows is away.
--    OWED: SPEC-WORKFLOW-ENGINE §2.3's fourth bullet (name the store or drop it).
--
-- 7. A SELF-STEP WHOSE ACTOR IS THE SUBJECT (NOT THE REQUESTER) IS EXPRESSED AS CONFIG ON AN
--    EXISTING RUNG, NOT AS A NEW RUNG. §2.2's rung vocabulary has `requester` for self-steps, and
--    that is right for `timecard_attestation` (the engine opens one instance per employment, so
--    subject = requester). It is WRONG for `corrective_action_ack`, where the manager files and the
--    SUBJECT acknowledges — the actor is neither an authority holder nor the requester, and §1.3a
--    marks `corrective_action_ack` and `acknowledgment_ack` as self-steps all the same. Rather than
--    coin an eighth rung the spec does not have, `fixed_user` reads
--    `resolver_config = {"employment_source":"subject"}` (also `"manager_of_subject"`), which is
--    exactly what `resolver_config jsonb` is for. `allows_self` still governs whether the subject
--    survives eligibility, so the never-self law is untouched.
--    OWED: SPEC-WORKFLOW-ENGINE §2.2 — record `employment_source` in the `fixed_user` row.
-- ===================================================================================

-- ============================================================ 1. target-table resolution
create or replace function hr._wf_target_table(p_token text)
returns text language sql stable security definer set search_path to 'hr','public' as $fn$
  select e.schema_name || '.' || e.table_name
    from platform.entity_types e where e.token = p_token and e.is_active
$fn$;

comment on function hr._wf_target_table is
  'Registered token -> "schema.table", the shape hr.can_approve and hr._approval_subject take. NULL for an unregistered or retired token, which every caller treats as fail-closed.';

-- ============================================================ 2. the three mechanical additions to
-- hr._approval_subject's allowlist (RECORDED DECISION 5). Additive only: every existing branch is
-- reproduced byte-for-byte from the live HRB-007 body and three rows are added.
create or replace function hr._approval_subject(p_target_table text, p_target_id uuid)
returns uuid language plpgsql stable security definer set search_path to 'hr','public' as $fn$
declare v_col text; v_sub uuid;
begin
  v_col := case p_target_table
    when 'hr.leave_request'        then 'employment_id'
    when 'hr.leave_case'           then 'employment_id'
    when 'hr.pay_period_employment' then 'employment_id'
    when 'hr.time_adjustment'      then 'employment_id'
    when 'hr.overtime_preapproval' then 'employment_id'
    when 'hr.shift_claim'          then 'requester_employment_id'
    when 'hr.schedule_change'      then 'employment_id'
    when 'hr.availability'         then 'employment_id'
    when 'hr.compensation'         then 'employment_id'
    when 'hr.position_assignment'  then 'employment_id'
    when 'hr.corrective_action'    then 'employment_id'
    when 'hr.separation'           then 'employment_id'
    when 'hr.training_assignment'  then 'employment_id'
    when 'hr.checklist_item'       then 'assignee_employment_id'
    when 'hr.requisition'          then null
    when 'hr.offer'                then null
    when 'hr.background_check'     then 'employment_id'
    when 'hr.employee_private'     then null
    when 'hr.tax_withholding'      then 'employment_id'
    when 'hr.schedule'             then null
    -- ---- HRB-008 additions (SPEC-WORKFLOW-ENGINE §1.1 roster targets, mechanical mappings only)
    when 'hr.employment'           then 'id'              -- the row IS the subject (termination)
    when 'hr.shift'                then 'employment_id'   -- open_shift_claim, calloff_replacement
    when 'hr.asset_assignment'     then 'employment_id'   -- expense_or_asset_recovery
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
$fn$;

revoke all on function hr._approval_subject(text, uuid) from public;
grant execute on function hr._approval_subject(text, uuid) to authenticated, service_role;

-- ============================================================ 3. employment -> login
create or replace function hr._wf_login_of(p_employment_id uuid)
returns uuid language sql stable security definer set search_path to 'hr','public' as $fn$
  select e.login_user_id
    from hr.employment em join hr.employee e on e.id = em.employee_id
   where em.id = p_employment_id and em.deleted_at is null
$fn$;

-- ============================================================ 4. holder dereferencing (§2.2)
create or replace function hr._wf_holder_employments(p_holder_kind text, p_holder_id text,
                                                     p_org uuid, p_at date)
returns uuid[] language plpgsql stable security definer set search_path to 'hr','public' as $fn$
declare v uuid[];
begin
  if p_holder_kind = 'employment' then
    -- a named individual whose authority is personal, not positional
    select coalesce(array_agg(em.id), '{}'::uuid[]) into v
      from hr.employment em
     where em.id = p_holder_id::uuid and em.organization_id = p_org and em.deleted_at is null;

  elsif p_holder_kind = 'position' then
    -- every employment holding that position assignment AS OF the evaluation date — normally one,
    -- possibly several (job share, acting cover), possibly NONE (a vacant seat), in which case the
    -- rung yields nothing and the walk continues (RECORDED DECISION 4).
    select coalesce(array_agg(distinct pa.employment_id), '{}'::uuid[]) into v
      from hr.position_assignment pa
     where pa.id = p_holder_id::uuid and pa.deleted_at is null
       and pa.effective_range @> p_at;

  elsif p_holder_kind = 'role' then
    select coalesce(array_agg(distinct ra.employment_id), '{}'::uuid[]) into v
      from hr.role_assignment ra
     where ra.organization_id = p_org and ra.role_key = p_holder_id
       and ra.is_active and ra.revoked_at is null
       and ra.effective_from <= p_at
       and (ra.effective_to is null or ra.effective_to >= p_at);
  else
    v := '{}'::uuid[];
  end if;

  return coalesce(v, '{}'::uuid[]);
exception when others then
  -- a malformed holder_id (a role key in a uuid column, say) yields nobody rather than exploding
  -- the whole resolution: the rung falls through and the failure is named, not a crash.
  return '{}'::uuid[];
end
$fn$;

-- ============================================================ 5. absence (§2.3, RECORDED DECISION 6)
create or replace function hr._wf_absent(p_employment_id uuid, p_at date default current_date)
returns boolean language plpgsql stable security definer set search_path to 'hr','public' as $fn$
declare em hr.employment%rowtype;
begin
  select * into em from hr.employment where id = p_employment_id and deleted_at is null;
  if not found then return true; end if;

  -- (a) the employment itself already says so, and it is live data
  if em.status in ('on_leave','suspended') then return true; end if;

  -- (b) a future-dated termination whose last day has passed
  if em.scheduled_last_day is not null and em.scheduled_last_day < p_at then return true; end if;
  if em.termination_date is not null and em.termination_date <= p_at then return true; end if;

  -- (c) an approved leave request covering the date — this engine's own data
  if exists (select 1 from hr.leave_request lr
              where lr.employment_id = p_employment_id and lr.deleted_at is null
                and lr.state in ('approved','taken','partially_taken')
                and lr.starts_on <= p_at and coalesce(lr.ends_on, lr.starts_on) >= p_at) then
    return true;
  end if;

  -- (d) an open leave case that is actually on leave
  if exists (select 1 from hr.leave_case lc
              where lc.employment_id = p_employment_id and lc.deleted_at is null
                and lc.state = 'on_leave'
                and lc.starts_on <= p_at
                and (lc.actual_return_on is null or lc.actual_return_on > p_at)) then
    return true;
  end if;

  -- (e) an explicit out-of-office window, if any lane ever writes one. There is no out-of-office
  -- store live (RECORDED DECISION 6) — this reads the only place one could go today.
  if em.metadata ? 'out_of_office'
     and (em.metadata #>> '{out_of_office,from}')::date <= p_at
     and (em.metadata #>> '{out_of_office,to}')::date   >= p_at then
    return true;
  end if;

  return false;
exception when others then
  return false;   -- a malformed out_of_office blob must not make someone permanently absent
end
$fn$;

-- ============================================================ 6. the condition evaluator (§2.4)
-- Deliberately NOT a scripting language. Operators: = != > >= < <= in not_in between is_null exists.
create or replace function hr._wf_condition_met(p_condition jsonb, p_ctx jsonb)
returns boolean language plpgsql immutable as $fn$
declare
  k text; v jsonb; f text; op text; val jsonb; actual jsonb; e jsonb; ok boolean;
begin
  if p_condition is null or p_condition = '{}'::jsonb then return true; end if;

  if p_condition ? 'all' then
    for e in select * from jsonb_array_elements(p_condition -> 'all') loop
      if not hr._wf_condition_met(e, p_ctx) then return false; end if;
    end loop;
    return true;
  end if;

  if p_condition ? 'any' then
    ok := false;
    for e in select * from jsonb_array_elements(p_condition -> 'any') loop
      if hr._wf_condition_met(e, p_ctx) then ok := true; end if;
    end loop;
    return ok;
  end if;

  if p_condition ? 'not' then
    return not hr._wf_condition_met(p_condition -> 'not', p_ctx);
  end if;

  f   := p_condition ->> 'field';
  op  := coalesce(p_condition ->> 'op', '=');
  val := p_condition -> 'value';
  if f is null then return true; end if;

  actual := p_ctx #> string_to_array(f, '.');

  return case op
    when 'is_null'  then actual is null or actual = 'null'::jsonb
    when 'exists'   then actual is not null and actual <> 'null'::jsonb
    when '='        then actual = val
    when '!='       then actual is distinct from val
    when '>'        then (actual #>> '{}')::numeric >  (val #>> '{}')::numeric
    when '>='       then (actual #>> '{}')::numeric >= (val #>> '{}')::numeric
    when '<'        then (actual #>> '{}')::numeric <  (val #>> '{}')::numeric
    when '<='       then (actual #>> '{}')::numeric <= (val #>> '{}')::numeric
    when 'in'       then val @> jsonb_build_array(actual)
    when 'not_in'   then not (val @> jsonb_build_array(actual))
    when 'between'  then (actual #>> '{}')::numeric between (val -> 0 #>> '{}')::numeric
                                                        and (val -> 1 #>> '{}')::numeric
    else false        -- an unknown operator is FALSE, never TRUE: an unreadable condition must not
  end;                -- silently activate a step nobody meant to run.
exception when others then
  return false;
end
$fn$;

-- ============================================================ 7. THE SELECTOR (§2.2)
create or replace function hr.wf_resolve_approvers(p_step_id uuid, p_exclude_employment_ids uuid[] default '{}')
returns jsonb language plpgsql security definer set search_path to 'hr','public' as $fn$
declare
  st          hr.workflow_step%rowtype;
  sd          hr.workflow_step_definition%rowtype;
  inst        hr.workflow_instance%rowtype;
  defn        hr.workflow_definition%rowtype;
  v_at        date;
  v_subject   uuid;
  v_target_tbl text;
  v_action    text;
  v_action_id uuid;
  v_rung      text;
  v_cands     uuid[] := '{}';
  v_path      text;
  v_rows      uuid[] := '{}';        -- matched hr.approval_authority ids
  v_holders   jsonb  := '[]'::jsonb;
  v_refused   jsonb  := '[]'::jsonb;
  v_absent    jsonb  := '[]'::jsonb;
  v_users     uuid[] := '{}';
  v_delegated boolean := false;
  v_retains   boolean;
  v_had_holders boolean := false;    -- distinguishes unroutable from approver_ineligible
  aa          record;
  emp         uuid;
  v_uid       uuid;
  v_mgr       uuid;
  v_guard     integer;
  v_seen      uuid[];
  v_requester_interested boolean;
begin
  select * into st from hr.workflow_step where id = p_step_id;
  if not found then
    return jsonb_build_object('granted', false, 'reason', 'step_not_found',
                              'detail', format('no hr.workflow_step with id %s', p_step_id));
  end if;
  select * into sd   from hr.workflow_step_definition where id = st.step_definition_id;
  select * into inst from hr.workflow_instance        where id = st.workflow_instance_id;
  select * into defn from hr.workflow_definition      where id = inst.workflow_definition_id;

  -- effective dating is resolved AS-OF the request's submission, never "current" (§2.2)
  v_at        := coalesce(inst.submitted_at, inst.created_at, now())::date;
  v_subject   := inst.subject_employment_id;
  v_target_tbl := hr._wf_target_table(inst.target_token);
  v_action    := sd.authority_action;
  v_retains   := (hr._knob('hr.workflow','delegation_principal_retains') #>> '{}')::boolean;
  select f.requester_is_interested_party into v_requester_interested
    from hr.workflow_flow_type f
   where f.flow_key = inst.flow_key and f.deleted_at is null
   order by (f.organization_id = inst.organization_id) desc limit 1;

  if v_target_tbl is null then
    return jsonb_build_object('granted', false, 'reason', 'definition_invalid',
      'detail', format('target token %s is not a registered active entity type', inst.target_token));
  end if;

  -- §2.1: the action slug is resolved against the hr_approval_action dimension ONCE, here, and the
  -- resolved category id is recorded in resolution_evidence. An unresolvable slug is
  -- definition_invalid — a definition problem, never a routing problem.
  if v_action is not null then
    select c.id into v_action_id from platform.categories c
     where c.dimension = 'hr_approval_action' and c.slug = v_action
       and c.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'::uuid and c.deleted_at is null;
    if v_action_id is null then
      return jsonb_build_object('granted', false, 'reason', 'definition_invalid',
        'detail', format('authority_action %s is not a registered hr_approval_action', v_action));
    end if;
  end if;

  -- ---------------------------------------------------------------- walk the fallback chain
  foreach v_rung in array (
    case
      when sd.resolver_kind = 'authority' then sd.fallback_chain
      -- a non-authority resolver_kind IS the chain: §2.2's rung list and the resolver_kind
      -- enumeration are the same vocabulary, and a fixed_user step has no fallback by definition.
      else ARRAY[sd.resolver_kind]
    end
  ) loop
    v_cands := '{}'; v_rows := '{}'; v_holders := '[]'::jsonb; v_delegated := false;

    if v_rung in ('authority','substitute','fixed_authority_scope') then
      if v_action is null then continue; end if;
      for aa in
        select a.* from hr.approval_authority a
         where a.organization_id = inst.organization_id
           and a.action_type = v_action
           and a.is_active
           and a.effective_from <= v_at
           and (a.effective_to is null or a.effective_to >= v_at)
           and (v_subject is null
                or hr.population_contains(a.scope_kind, a.scope_id, v_subject, v_at,
                                          case when a.holder_kind = 'employment'
                                               then a.holder_id::uuid else null end,
                                          a.scope_employment_ids))
           and hr._limits_satisfied(a.limits, v_target_tbl, inst.target_id)
           -- §2.1: a delegated row SUPERSEDES the row it substitutes for, for the window. The
           -- principal reclaims by ending the delegation early, not by racing the delegate.
           and (v_retains or not exists (
                 select 1 from hr.approval_authority d
                  where d.organization_id = a.organization_id
                    and d.source = 'delegated' and d.delegated_from_id = a.id
                    and d.is_active and d.effective_from <= v_at
                    and (d.effective_to is null or d.effective_to >= v_at)))
           -- 🚨 THE `authority` RUNG YIELDS ONLY THE BEST RANK, AND `substitute` YIELDS THE REST.
           -- §2.2's pseudocode reads `order by rank` and returns every match, but that makes the
           -- `substitute` rung — "the NEXT-RANK holder in the same scope for the same action, used
           -- when every rank-0 holder is ineligible or absent" — unreachable, because its holders
           -- are already in the rung above it. Worse, with the default `all` quorum it would make
           -- every org-scoped backstop holder a MANDATORY co-approver of every ordinary request.
           -- SPEC-ACCESS §1.3 settles it in the same words from the other side: "the rank+1 holder
           -- in the same population is a holder's implicit standing substitute". So: authority =
           -- min rank, substitute = strictly greater. OWED: SPEC-WORKFLOW-ENGINE §2.2's `authority`
           -- rung records the rank restriction.
           and (v_rung not in ('authority','fixed_authority_scope')
                or a.rank = (select min(b.rank) from hr.approval_authority b
                              where b.organization_id = a.organization_id
                                and b.action_type = a.action_type and b.is_active
                                and b.effective_from <= v_at
                                and (b.effective_to is null or b.effective_to >= v_at)
                                and (v_subject is null
                                     or hr.population_contains(b.scope_kind, b.scope_id, v_subject, v_at,
                                          case when b.holder_kind = 'employment'
                                               then b.holder_id::uuid else null end,
                                          b.scope_employment_ids))))
           and (v_rung <> 'substitute'
                or a.rank > (select min(b.rank) from hr.approval_authority b
                              where b.organization_id = a.organization_id
                                and b.action_type = a.action_type and b.is_active))
           and (v_rung <> 'fixed_authority_scope'
                or (sd.resolver_config ->> 'scope_kind' is null
                    or a.scope_kind = sd.resolver_config ->> 'scope_kind'))
         order by a.rank, a.created_at
      loop
        foreach emp in array hr._wf_holder_employments(aa.holder_kind, aa.holder_id,
                                                       aa.organization_id, v_at) loop
          v_had_holders := true;
          if not (emp = any(v_cands)) then v_cands := v_cands || emp; end if;
        end loop;
        v_rows := v_rows || aa.id;
        if aa.source = 'delegated' then v_delegated := true; end if;
        v_holders := v_holders || jsonb_build_object(
          'authority_id', aa.id, 'holder_kind', aa.holder_kind, 'holder_id', aa.holder_id,
          'scope_kind', aa.scope_kind, 'scope_id', aa.scope_id, 'rank', aa.rank,
          'source', aa.source, 'delegated_from_id', aa.delegated_from_id,
          'limits', aa.limits);
      end loop;
      v_path := case when v_delegated then 'delegated'
                     when v_rung = 'substitute' then 'substitute'
                     else 'authority' end;

    elsif v_rung = 'reporting_line' then
      -- climb manager-to-manager until an eligible employment is found. Arbitrary depth (D24f):
      -- nothing counts levels; the walk carries a visited path so a cycle terminates (§1.3c).
      v_mgr := v_subject; v_seen := '{}'; v_guard := 0;
      loop
        exit when v_mgr is null;
        exit when v_mgr = any(v_seen);
        v_seen := v_seen || v_mgr;
        v_guard := v_guard + 1;
        v_mgr := hr.manager_as_of(v_mgr, v_at);
        exit when v_mgr is null;
        v_had_holders := true;
        v_cands := ARRAY[v_mgr];
        exit;                       -- one rung per pass; escalation calls us again to climb further
      end loop;
      -- honour an explicit climb depth for escalation re-resolution
      if (sd.escalation_config ->> 'climb_to') is not null and v_cands <> '{}' then
        for v_guard in 2 .. (sd.escalation_config ->> 'climb_to')::integer loop
          v_mgr := hr.manager_as_of(v_cands[1], v_at);
          exit when v_mgr is null or v_mgr = any(v_seen);
          v_seen := v_seen || v_mgr; v_cands := ARRAY[v_mgr];
        end loop;
      end if;
      v_path := 'reporting_line';

    elsif v_rung = 'top_of_chart' then
      -- RECORDED DECISION 2: §2.6's org-scoped holders UNION hr.can_approve's own knob-resolved
      -- top-of-chart set. The predicate filter below settles which of them may actually act.
      for aa in
        select a.* from hr.approval_authority a
         where a.organization_id = inst.organization_id and a.action_type = v_action
           and a.is_active and a.scope_kind = 'org'
           and a.effective_from <= v_at
           and (a.effective_to is null or a.effective_to >= v_at)
         order by a.rank, a.created_at
      loop
        foreach emp in array hr._wf_holder_employments(aa.holder_kind, aa.holder_id,
                                                       aa.organization_id, v_at) loop
          v_had_holders := true;
          if not (emp = any(v_cands)) then v_cands := v_cands || emp; end if;
        end loop;
        v_rows := v_rows || aa.id;
        v_holders := v_holders || jsonb_build_object('authority_id', aa.id, 'scope_kind', 'org',
                                                     'rank', aa.rank, 'source', aa.source);
      end loop;
      for emp in
        select em.id from hr.employment em
          join hr.employee e on e.id = em.employee_id
         where em.organization_id = inst.organization_id and em.deleted_at is null
           and em.status = 'active'
           and (exists (select 1 from iam.organization_member om
                         where om.organization_id = em.organization_id
                           and om.user_id = e.login_user_id and om.role = 'owner')
                or exists (select 1 from hr.role_assignment ra
                            where ra.organization_id = em.organization_id
                              and ra.employment_id = em.id and ra.role_key = 'hr_owner'
                              and ra.is_active and ra.revoked_at is null
                              and ra.effective_from <= v_at
                              and (ra.effective_to is null or ra.effective_to >= v_at)))
      loop
        v_had_holders := true;
        if not (emp = any(v_cands)) then v_cands := v_cands || emp; end if;
      end loop;
      v_path := 'top_of_chart';

    elsif v_rung = 'fixed_user' then
      -- RECORDED DECISION 7: `{"employment_source":"subject"}` names the SUBJECT of the instance.
      -- This is CONFIG, not a new rung — §2.2's rung vocabulary is untouched.
      if sd.resolver_config ->> 'employment_source' = 'subject' then
        v_cands := case when v_subject is null then '{}'::uuid[] else ARRAY[v_subject] end;
      elsif sd.resolver_config ->> 'employment_source' = 'manager_of_subject' then
        v_cands := case when hr.manager_as_of(v_subject, v_at) is null then '{}'::uuid[]
                        else ARRAY[hr.manager_as_of(v_subject, v_at)] end;
      else
        select coalesce(array_agg((x)::uuid), '{}'::uuid[]) into v_cands
          from jsonb_array_elements_text(coalesce(sd.resolver_config -> 'employment_ids', '[]'::jsonb)) x;
      end if;
      if v_cands <> '{}' then v_had_holders := true; end if;
      v_path := 'fixed';

    elsif v_rung = 'requester' then
      -- self-steps only. §2.5's allows_self is checked in eligibility, not here.
      v_cands := case when inst.requester_employment_id is null then '{}'::uuid[]
                      else ARRAY[inst.requester_employment_id] end;
      if v_cands <> '{}' then v_had_holders := true; end if;
      v_path := 'requester';

    elsif v_rung = 'system' then
      v_cands := '{}'; v_path := 'system';

    elsif v_rung = 'external_result' then
      -- §0 law 5: no human approver. The step closes on result_fn, never on an event.
      return jsonb_build_object(
        'granted', true, 'resolution_path', 'external_result',
        'candidates', '[]'::jsonb, 'user_ids', '[]'::jsonb,
        'evidence', jsonb_build_object('rung', 'external_result', 'as_of', v_at,
                                       'note', 'no human approver; this step closes on a recorded, inspectable result'));
    end if;

    -- ------------------------------------------------------ eligible(c), in §2.2's exact order
    if v_cands <> '{}' then
      declare keep uuid[] := '{}'; c uuid; v_ok boolean;
      begin
        foreach c in array v_cands loop
          -- 1. the subject — unless the step definition allows self
          if v_subject is not null and c = v_subject and not sd.allows_self then
            v_refused := v_refused || jsonb_build_object('employment_id', c, 'why', 'is_subject');
            continue;
          end if;
          -- 2. the requester, when requester <> subject AND THE FLOW TYPE MARKS THE REQUESTER AS
          -- AN INTERESTED PARTY (§2.2 rule 2 — `pay_change` proposed by a manager). Applying this
          -- unconditionally is an over-tightening defect: the HR owner who FILES a termination is
          -- then struck off the only rung holding termination_approve. Proven by probe.
          if inst.requester_employment_id is not null and c = inst.requester_employment_id
             and inst.requester_employment_id is distinct from v_subject
             and coalesce(v_requester_interested, false)
             and v_rung <> 'requester' and not sd.allows_self then
            v_refused := v_refused || jsonb_build_object('employment_id', c, 'why', 'is_requester');
            continue;
          end if;
          -- an explicit exclusion (escalation moving off the previous holder)
          if c = any(coalesce(p_exclude_employment_ids, '{}'::uuid[])) then
            v_refused := v_refused || jsonb_build_object('employment_id', c, 'why', 'excluded_by_caller');
            continue;
          end if;
          -- 3. terminated / inactive employments AT now()
          if not exists (select 1 from hr.employment em
                          where em.id = c and em.deleted_at is null
                            and em.status in ('active','on_leave','suspended','pending')) then
            v_refused := v_refused || jsonb_build_object('employment_id', c, 'why', 'not_active');
            continue;
          end if;
          -- 4. absent approvers, when the definition says to skip them (§2.3)
          if defn.skip_absent_approver and hr._wf_absent(c) then
            v_absent := v_absent || jsonb_build_object('employment_id', c, 'why', 'absent');
            continue;
          end if;
          -- 5. vacant seats never reach here: they were dereferenced away (RECORDED DECISION 4).

          -- 🚨 RECORDED DECISION 1 — THE PREDICATE HAS THE LAST WORD. This is T-21b by
          -- construction: nothing this function returns can be something hr.can_approve refuses.
          v_uid := hr._wf_login_of(c);
          if v_uid is null then
            -- a kiosk-only employment with no login cannot be granted reach and cannot decide.
            v_refused := v_refused || jsonb_build_object('employment_id', c, 'why', 'no_login');
            continue;
          end if;
          if v_action is not null then
            begin
              v_ok := hr.can_approve(v_uid, v_action, v_target_tbl, inst.target_id, v_at);
            exception when others then
              -- the six unmapped target tables (RECORDED DECISION 5) land here. Fail closed and
              -- name it; never route on a guess.
              return jsonb_build_object('granted', false, 'reason', 'definition_invalid',
                'detail', format('approval_subject_unmapped: hr.can_approve cannot resolve a subject for %s (%s)',
                                 v_target_tbl, sqlerrm));
            end;
            if not v_ok then
              v_refused := v_refused || jsonb_build_object('employment_id', c, 'why', 'predicate_refused');
              continue;
            end if;
          end if;
          keep := keep || c;
        end loop;
        v_cands := keep;
      end;
    end if;

    exit when v_cands <> '{}';
  end loop;

  -- ---------------------------------------------------------------- the two named failures
  if v_cands = '{}' then
    -- §2.2: holders existed but every one was disqualified -> approver_ineligible (name a
    -- substitute); nobody held the authority at all -> unroutable (grant somebody authority).
    -- The fixes differ, which is the whole reason the distinction is drawn.
    return jsonb_build_object(
      'granted', false,
      'reason', case when v_had_holders then 'approver_ineligible' else 'unroutable' end,
      'detail', case when v_had_holders
                     then 'every candidate the fallback chain produced was disqualified'
                     else 'the fallback chain was exhausted and nobody holds this authority' end,
      'evidence', jsonb_build_object('as_of', v_at, 'action_type', v_action,
                                     'action_type_id', v_action_id,
                                     'fallback_chain', sd.fallback_chain,
                                     'refused', v_refused, 'absent', v_absent));
  end if;

  select coalesce(array_agg(u), '{}'::uuid[]) into v_users
    from (select distinct hr._wf_login_of(c) u from unnest(v_cands) c) s where u is not null;

  return jsonb_build_object(
    'granted', true,
    'resolution_path', v_path,
    'candidates', to_jsonb(v_cands),
    'user_ids', to_jsonb(v_users),
    'evidence', jsonb_build_object(
      'rung', v_path, 'as_of', v_at,
      'action_type', v_action, 'action_type_id', v_action_id,
      'authority_ids', to_jsonb(v_rows), 'holders', v_holders,
      'fallback_chain', sd.fallback_chain,
      'predicate_refused', v_refused, 'absent', v_absent,
      'delegation_principal_retains', v_retains));
end
$fn$;

comment on function hr.wf_resolve_approvers is
  'SPEC-WORKFLOW-ENGINE §2.2, the SELECTOR — who should be asked. Walks fallback_chain and stops at the first rung yielding an eligible employment. THE LAST FILTER IS hr.can_approve ITSELF (SPEC-ACCESS §1.3b joint contract, §9 T-21b): the selector can never return a candidate the predicate would refuse. Returns a refusal ENVELOPE (granted:false + reason), never a raise.';

revoke all on function hr._wf_target_table(text) from public;
revoke all on function hr._wf_login_of(uuid) from public;
revoke all on function hr._wf_holder_employments(text, text, uuid, date) from public;
revoke all on function hr._wf_absent(uuid, date) from public;
revoke all on function hr._wf_condition_met(jsonb, jsonb) from public;
revoke all on function hr.wf_resolve_approvers(uuid, uuid[]) from public;
grant execute on function hr._wf_target_table(text) to authenticated, service_role;
grant execute on function hr._wf_login_of(uuid) to authenticated, service_role;
grant execute on function hr._wf_holder_employments(text, text, uuid, date) to authenticated, service_role;
grant execute on function hr._wf_absent(uuid, date) to authenticated, service_role;
grant execute on function hr._wf_condition_met(jsonb, jsonb) to authenticated, service_role;
grant execute on function hr.wf_resolve_approvers(uuid, uuid[]) to authenticated, service_role;

-- ============================================================ assertions
do $$
declare v_n integer;
begin
  -- the three additions landed and the twenty originals survived
  if hr._approval_subject('hr.employment', '00000000-0000-0000-0000-000000000000') is not null then
    raise exception 'hr_c4_02: hr.employment subject resolution returned a row that does not exist';
  end if;
  begin
    perform hr._approval_subject('hr.nonexistent_table', gen_random_uuid());
    raise exception 'hr_c4_02: _approval_subject accepted an unknown target table';
  exception when sqlstate '22023' then null;
  end;

  -- the condition evaluator's closed operator set, including the unknown-operator FALSE
  if not hr._wf_condition_met('{}'::jsonb, '{}'::jsonb) then
    raise exception 'hr_c4_02: an empty condition must always run';
  end if;
  if not hr._wf_condition_met('{"field":"payload.h","op":">","value":40}'::jsonb,
                              '{"payload":{"h":41}}'::jsonb) then
    raise exception 'hr_c4_02: > operator failed';
  end if;
  if hr._wf_condition_met('{"field":"payload.h","op":">","value":40}'::jsonb,
                          '{"payload":{"h":40}}'::jsonb) then
    raise exception 'hr_c4_02: > operator is inclusive';
  end if;
  if hr._wf_condition_met('{"field":"payload.h","op":"squiggle","value":1}'::jsonb,
                          '{"payload":{"h":1}}'::jsonb) then
    raise exception 'hr_c4_02: an unknown operator must be FALSE, never TRUE';
  end if;
  if not hr._wf_condition_met(
        '{"all":[{"field":"a","op":"=","value":1},{"any":[{"field":"b","op":"in","value":["x"]}]}]}'::jsonb,
        '{"a":1,"b":"x"}'::jsonb) then
    raise exception 'hr_c4_02: all/any nesting failed';
  end if;

  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname in
     ('_wf_target_table','_wf_login_of','_wf_holder_employments','_wf_absent',
      '_wf_condition_met','wf_resolve_approvers');
  if v_n <> 6 then raise exception 'hr_c4_02: expected 6 resolver functions, found %', v_n; end if;
end $$;
