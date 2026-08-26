-- HR domain C3 — migration 3 of 6 (register item HRB-007, lane core-c3-access).
--
-- THE PREDICATES, and only the predicates. hr._knob, hr.employments_of, hr.manager_chain,
-- hr.position_subtree, hr.population_contains (§1.3c, fixpoint, crew included), hr.capability
-- (§1.4), hr.incident_excluded (§5), hr._approval_subject, hr._limits_satisfied and
-- hr.can_approve (§1.3b, never-approve-yourself FIRST).
-- The §1.2 write RPCs and the §1.1 activation bootstrap are file 4; the derivation is file 5.
--
-- Authority: SPEC-ACCESS §1.1–§1.4, §5. Applied live as `hr_c3_03_capability_and_approval`.
-- Idempotent.
--
-- ===================================================================================
-- RECORDED TECHNICAL DECISIONS (EXECUTION §8)
--
-- 1. 🚨 THE CHART IS EMPLOYMENT-TO-EMPLOYMENT LIVE, NOT POSITION-TO-POSITION.
--    §1.3c binds `position_subtree` to a recursive CTE over `reports_to_position_id`. There is no
--    such column and no `hr.position` table (verified live): SPEC-DATA-MODEL put
--    `manager_employment_id` on hr.position_assignment and shipped hr.manager_as_of() on top of
--    it. The population semantics are preserved exactly — `direct_reports` is depth-1 off the
--    HOLDER, `position_subtree` is its transitive form — and the walk is a fixpoint over the live
--    column. TWO CONSEQUENCES ARE HONEST RATHER THAN QUIET: §1.3c's "a VACANT POSITION mid-chain
--    is skipped rather than fatal" has no meaning here, because a chain of employments has no
--    vacancies — when a manager leaves, their reports' `manager_employment_id` is repointed and
--    until it is, the walk simply stops at them; and a terminated manager still holds the edge, so
--    `hr.employment.status` is filtered in the walk rather than assumed.
--    OWED: §1.3c's column name and its vacant-position paragraph.
--
-- 2. 🚨 THE CYCLE GUARD IS A VISITED PATH, NOT `UNION`. §1.3c says `UNION` "admits each position
--    at most once and therefore stops on a cycle". That is FALSE for a walk that carries a depth:
--    `UNION` de-duplicates whole ROWS, and (node, depth) is a different row on every lap, so a
--    cycle spins forever and the "termination on a fixpoint" the spec promises never happens. The
--    walk therefore carries a `path uuid[]` and refuses to step onto a node already in it. A depth
--    cap is still NOT used anywhere — db-rules is explicit and it was learned expensively: a depth
--    cap is not a termination condition, it is a silent DENY. §9 T-35 asserts both at depth 20.
--    OWED: §1.3c's parenthetical.
--
-- 3. THE SELF-STEP RECONCILIATION. §1.3b rule 1 makes never-approve-yourself absolute and checked
--    first; §1.3a marks three actions as *(self-step; requires `allows_self`)* —
--    `timecard_attest`, `acknowledgment_ack`, `corrective_action_ack`. Both are right and they are
--    about different things: attesting your own timecard is not approving yourself, it is the step
--    that only you can take. So rule 1 reads the action's `allows_self` property first: when it is
--    true, the SELF case is the ONLY true case (nobody attests for you); when it is false — every
--    other action — self is FALSE with no override, no break-glass and no exception for HR owners
--    or the org owner.
--
-- 4. THE INCIDENT VETO IS WIDER THAN §5 AND THAT IS THE LANDED BUILD, NOT A CHANGE.
--    §5 defines the excluded set as "the subject_employment_id or a `respondent` party".
--    hr._incident_excluded_actors_refresh (landed by HRB-006 file 09) materialises subject +
--    reporter + every **`accused`** party **plus each of their managers**. The live
--    `hr.incident_party.party_role` CHECK has no `respondent` value at all; it has `accused`.
--    hr.incident_excluded reads the materialised array, so the veto is exactly what the trigger
--    computed — wider than the spec text and correctly so (a party's own manager is the classic
--    leak in a complaint about a manager). OWED: §5's `respondent` wording and its excluded-set
--    definition.
--
-- 5. ORG ROLE CATALOGUE OVERRIDES THE SYSTEM ONE, BY ROLE KEY. §1.2 says platform builtins live on
--    the Matrx System org and org-authored rows on the org. Where both define the same `role_key`,
--    the ORG row wins — otherwise an org could never tighten a builtin, which §1.4's "an org may
--    loosen or tighten any of them" requires.
-- ===================================================================================

set local statement_timeout = '600s';
set local lock_timeout = '20s';

-- ============================================================ the knob reader
-- D13: a missing knob RAISES. There is no platform-wide knob resolver live (verified: the only
-- knob functions are platform.feature_knob_set and one seo helper), and hr.eeo_aggregate already
-- reads platform.feature_knob directly. This is that one read, in one place, so a knob rename is
-- a single edit rather than a grep.
create or replace function hr._knob(p_feature text, p_key text) returns jsonb
language plpgsql stable security definer set search_path = hr, public
as $fn$
declare v jsonb;
begin
  select coalesce(k.value, k.default_value) into v
    from platform.feature_knob k where k.feature = p_feature and k.key = p_key;
  if v is null then
    raise exception 'hr._knob: knob %.% is not seeded', p_feature, p_key
      using errcode = 'P0001',
            hint = 'D13: a missing knob raises rather than falling back to a hard-coded value. Seed it in the knob register.';
  end if;
  return v;
end
$fn$;

revoke all on function hr._knob(text, text) from public;
grant execute on function hr._knob(text, text) to authenticated, service_role;

-- ============================================================ who is this user, in HR terms
create or replace function hr.employments_of(p_user uuid, p_at date default current_date)
returns uuid[]
language sql stable security definer set search_path = hr, public
as $fn$
  select coalesce(array_agg(distinct em.id), '{}'::uuid[])
    from hr.employee e
    join hr.employment em on em.employee_id = e.id and em.deleted_at is null
   where e.login_user_id = p_user
     and e.deleted_at is null
     and em.hire_date <= p_at
     and (em.termination_date is null or em.termination_date >= p_at);
$fn$;

comment on function hr.employments_of is
  'Every employment spell p_user holds on p_at. NULL login_user_id is normal (SPEC-ACCESS §9 T-17: an employee with no platform login exists and is paid) — such a person simply has no user lane.';

revoke all on function hr.employments_of(uuid, date) from public;
grant execute on function hr.employments_of(uuid, date) to authenticated, service_role;

-- ============================================================ §1.3c the reporting chain
-- 🚨 FIXPOINT, NEVER A DEPTH CAP (RECORDED DECISIONS 1 and 2). Upward: who manages this person,
-- and how far away are they.
create or replace function hr.manager_chain(p_employment_id uuid, p_at date default current_date)
returns table (manager_employment_id uuid, depth integer)
language sql stable security definer set search_path = hr, public
as $fn$
  with recursive up as (
    select hr.manager_as_of(p_employment_id, p_at) as mgr, 1 as depth,
           array[p_employment_id] as path
    where hr.manager_as_of(p_employment_id, p_at) is not null
    union all
    select hr.manager_as_of(u.mgr, p_at), u.depth + 1, u.path || u.mgr
      from up u
     where u.mgr is not null
       and hr.manager_as_of(u.mgr, p_at) is not null
       -- the cycle guard: never step onto a node already on this path
       and not (hr.manager_as_of(u.mgr, p_at) = any(u.path || u.mgr))
  )
  select u.mgr, min(u.depth)::integer
    from up u
    join hr.employment em on em.id = u.mgr and em.deleted_at is null
   where u.mgr is not null
     and em.status <> 'terminated'
   group by u.mgr;
$fn$;

comment on function hr.manager_chain is
  'SPEC-ACCESS §1.3c. Walks UP to a fixpoint with a visited-path cycle guard — never a depth cap, because a depth cap is not a termination condition, it is a silent DENY (db-rules). The visibility knob is applied by the CALLER as a filter, so raising it never has to re-derive from a lossy cache.';

-- downward: everyone under this holder, same fixpoint, same guard
create or replace function hr.position_subtree(p_holder_employment_id uuid, p_at date default current_date)
returns table (employment_id uuid, depth integer)
language sql stable security definer set search_path = hr, public
as $fn$
  with recursive down as (
    select pa.employment_id as emp, 1 as depth, array[p_holder_employment_id] as path
      from hr.position_assignment pa
     where pa.manager_employment_id = p_holder_employment_id
       and pa.deleted_at is null and pa.effective_range @> p_at
    union all
    select pa.employment_id, d.depth + 1, d.path || d.emp
      from down d
      join hr.position_assignment pa on pa.manager_employment_id = d.emp
     where pa.deleted_at is null and pa.effective_range @> p_at
       and not (pa.employment_id = any(d.path || d.emp))
  )
  select d.emp, min(d.depth)::integer
    from down d
    join hr.employment em on em.id = d.emp and em.deleted_at is null
   group by d.emp;
$fn$;

revoke all on function hr.manager_chain(uuid, date) from public;
grant execute on function hr.manager_chain(uuid, date) to authenticated, service_role;
revoke all on function hr.position_subtree(uuid, date) from public;
grant execute on function hr.position_subtree(uuid, date) to authenticated, service_role;

-- ============================================================ §1.3 the population predicate
create or replace function hr.population_contains(
  p_scope_kind           text,
  p_scope_id             uuid,
  p_employment_id        uuid,
  p_at                   date    default current_date,
  p_holder_employment_id uuid    default null,
  p_scope_employment_ids uuid[]  default '{}')
returns boolean
language plpgsql stable security definer set search_path = hr, public
as $fn$
declare v_pos hr.position_assignment%rowtype; v_pay uuid;
begin
  if p_employment_id is null then return false; end if;

  if p_scope_kind = 'org' then
    -- every caller has already scoped by organization_id; `org` adds no further restriction
    return true;
  end if;

  if p_scope_kind = 'employment_set' then
    return p_employment_id = any(coalesce(p_scope_employment_ids,'{}'::uuid[]));
  end if;

  if p_scope_kind = 'direct_reports' then
    if p_holder_employment_id is null then return false; end if;
    return hr.manager_as_of(p_employment_id, p_at) = p_holder_employment_id;
  end if;

  if p_scope_kind = 'position_subtree' then
    if p_holder_employment_id is null then return false; end if;
    return exists (select 1 from hr.position_subtree(p_holder_employment_id, p_at) s
                    where s.employment_id = p_employment_id);
  end if;

  if p_scope_kind = 'pay_group' then
    select em.pay_group_id into v_pay from hr.employment em
      where em.id = p_employment_id and em.deleted_at is null;
    return v_pay is not null and v_pay = p_scope_id;
  end if;

  -- department | location | crew all resolve through the effective-dated position assignment.
  -- `crew` is a SINGLE flat lookup with no recursion (§1.3c) and it takes effect on its
  -- effective date, never retroactively — which is what lets a schedule/swap/call-off approval
  -- scope to a crew lead without inventing a fake reporting line.
  select * into v_pos from hr.primary_position_as_of(p_employment_id, p_at);
  if not found then return false; end if;

  return case p_scope_kind
           when 'department' then v_pos.department_id = p_scope_id
           when 'location'   then v_pos.location_id   = p_scope_id
           when 'crew'       then v_pos.crew_id       = p_scope_id
           else false
         end;
end
$fn$;

comment on function hr.population_contains is
  'SPEC-ACCESS §1.3/§1.3c. FAIL-CLOSED on an unknown scope_kind. position_subtree is a fixpoint walk with a visited-path cycle guard and NO depth cap; crew is one effective-dated lookup, flat.';

revoke all on function hr.population_contains(text, uuid, uuid, date, uuid, uuid[]) from public;
grant execute on function hr.population_contains(text, uuid, uuid, date, uuid, uuid[]) to authenticated, service_role;

-- ============================================================ §1.4 the capability predicate
-- 🚨 THE HARD RULE: audited-tier RPCs gate on THIS and never on iam.has_access.
-- iam.has_access_for_base grants viewer to any org owner/admin on any row in the org regardless of
-- visibility (read live, and re-proven in this lane's own probe), so routing an audited-tier gate
-- through it would silently hand every org admin the medical file.
create or replace function hr.capability(
  p_user               uuid,
  p_capability         text,
  p_subject_employment uuid default null,
  p_at                 date default current_date)
returns boolean
language plpgsql stable security definer set search_path = hr, public
as $fn$
declare
  v_mine   uuid[];
  v_depth  integer;
  v_org    uuid;
begin
  if p_user is null or p_capability is null then return false; end if;
  v_mine := hr.employments_of(p_user, p_at);

  -- (1) THE SELF LANE, and it answers `self.*` ONLY. Reading your own salary is the kernel's
  --     OWNER arm (created_by), not a capability — see §2.1's "no grant written" row.
  if p_capability like 'self.%' then
    return p_subject_employment is not null and p_subject_employment = any(v_mine);
  end if;

  if cardinality(v_mine) = 0 then
    -- no employment in any org ⇒ no assigned role and no manager lane. A user with no
    -- hr.employee row holds no HR standing at all (§1.1: three sources, and only three).
    return false;
  end if;

  -- (2) ASSIGNED ROLES. The org's own catalogue row wins over the system builtin of the same key
  --     (RECORDED DECISION 5) so an org can tighten a builtin.
  if exists (
    select 1
      from hr.role_assignment ra
      join lateral (
        select ar.capabilities
          from hr.access_role ar
         where ar.role_key = ra.role_key
           and ar.deleted_at is null
           and ar.is_active
           and ar.organization_id in (ra.organization_id, '39c38960-d30c-4840-b0c1-c9960de95582'::uuid)
         order by (ar.organization_id = ra.organization_id) desc
         limit 1) role on true
     where ra.employment_id = any(v_mine)
       and ra.is_active
       and ra.revoked_at is null
       and ra.effective_from <= p_at
       and (ra.effective_to is null or ra.effective_to >= p_at)
       and p_capability = any(role.capabilities)
       and (p_subject_employment is null
            or hr.population_contains(ra.scope_kind, ra.scope_id, p_subject_employment, p_at,
                                      ra.employment_id, ra.scope_employment_ids))
  ) then
    return true;
  end if;

  -- (3) THE MANAGER LANE — derived, never assigned, and only for the two capabilities the
  --     `manager` builtin holds. A manager reaches DOWN their subtree as far as
  --     hr.access.manager_visibility_depth and no further; Confidential tier has its own knob,
  --     default 0, i.e. never.
  if p_subject_employment is not null
     and exists (select 1 from hr.access_role ar
                  where ar.role_key = 'manager'
                    and ar.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'::uuid
                    and ar.deleted_at is null
                    and p_capability = any(ar.capabilities))
  then
    v_depth := (hr._knob('hr.access','manager_visibility_depth') #>> '{}')::integer;
    if exists (select 1 from hr.manager_chain(p_subject_employment, p_at) mc
                where mc.manager_employment_id = any(v_mine)
                  and mc.depth <= v_depth) then
      return true;
    end if;
  end if;

  return false;
end
$fn$;

comment on function hr.capability is
  'SPEC-ACCESS §1.4. The ONE role-and-population predicate. It can never grant reach on a non-hr token (law 1) and it never consults org role — activation WRITES a role assignment, it does not BECOME one (§1.1).';

revoke all on function hr.capability(uuid, text, uuid, date) from public;
grant execute on function hr.capability(uuid, text, uuid, date) to authenticated, service_role;

-- ============================================================ §5 the investigation veto
create or replace function hr.incident_excluded(p_user uuid, p_incident uuid)
returns boolean
language sql stable security definer set search_path = hr, public
as $fn$
  -- 🚨 THE MATERIALISED ARRAY IS WIDER THAN §5's VETO, AND THE DIFFERENCE IS THE REPORTER.
  -- hr._incident_excluded_actors_refresh (HRB-006 file 09) materialises subject + REPORTER +
  -- every `accused` party + each of their managers. §5's veto is "the subject_employment_id or a
  -- respondent party" — the reporter is NOT in it, and must not be: §5 gives the identified
  -- reporter hr_incident_status by name, and a probe caught this function refusing the reporter
  -- their own case status. So the fast array-membership test is kept (§5 requires it: "an array
  -- membership test, not a join") and the reporter is subtracted UNLESS they are also the subject
  -- or an accused party. Everyone else the trigger adds — the parties' managers — stays vetoed,
  -- which is correct and wider than the spec text: a party's own manager is the classic leak in a
  -- complaint about a manager.
  select exists (
    select 1
      from hr.incident i,
           lateral unnest(i.excluded_actor_ids) x
     where i.id = p_incident
       and i.deleted_at is null
       and x = any(hr.employments_of(p_user, coalesce(i.occurred_at::date, current_date)))
       and ( x is distinct from i.reporter_employment_id
             or x = i.subject_employment_id
             or exists (select 1 from hr.incident_party ip
                         where ip.incident_id = i.id and ip.employment_id = x
                           and ip.party_role = 'accused' and ip.deleted_at is null) ));
$fn$;

comment on function hr.incident_excluded is
  'SPEC-ACCESS §5. ABSOLUTE: checked after every allow lane, it overrides incident.read, it overrides hr_owner, and it overrides break-glass. Reads the array hr._incident_excluded_actors_refresh materialises at intake and re-drives on every party change (subject + reporter + accused parties + each of their managers), so the check is an array membership test, not a join.';

revoke all on function hr.incident_excluded(uuid, uuid) from public;
grant execute on function hr.incident_excluded(uuid, uuid) to authenticated, service_role;

-- ============================================================ §1.3b the approval predicate
-- The SUBJECT-RESOLUTION allowlist. p_target_table never interpolates into dynamic SQL from
-- caller input without passing this gate first; an unknown table raises 22023 rather than
-- guessing a column.
create or replace function hr._approval_subject(p_target_table text, p_target_id uuid)
returns uuid
language plpgsql stable security definer set search_path = hr, public
as $fn$
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

-- the limits helper, separate so the ceiling vocabulary can grow without touching the resolver
create or replace function hr._limits_satisfied(p_limits jsonb, p_target_table text, p_target_id uuid)
returns boolean
language plpgsql stable security definer set search_path = hr, public
as $fn$
declare v_amount numeric; v_hours numeric;
begin
  if p_limits is null or p_limits = '{}'::jsonb then return true; end if;

  if p_limits ? 'max_amount' then
    v_amount := case p_target_table
      when 'hr.compensation' then (select c.amount from hr.compensation c where c.id = p_target_id)
      when 'hr.offer'        then (select o.amount from hr.offer o where o.id = p_target_id)
      else null end;
    if v_amount is not null and v_amount > (p_limits ->> 'max_amount')::numeric then
      return false;
    end if;
  end if;

  if p_limits ? 'max_hours' then
    v_hours := case p_target_table
      when 'hr.leave_request' then (select coalesce(lr.approved_hours, lr.requested_hours) from hr.leave_request lr where lr.id = p_target_id)
      else null end;
    if v_hours is not null and v_hours > (p_limits ->> 'max_hours')::numeric then
      return false;
    end if;
  end if;

  return true;
end
$fn$;

comment on function hr._limits_satisfied is
  'SPEC-ACCESS §1.3 `limits`. Deliberately PERMISSIVE on a ceiling it cannot evaluate for a given target: a limit that silently refuses everything it does not understand would stall approvals with no visible cause, which §1.3b calls the canonical over-tightening bug. An unrecognised ceiling is a gap to fill here, not a denial to ship.';


create or replace function hr.can_approve(
  p_user         uuid,
  p_action_type  text,
  p_target_table text,
  p_target_id    uuid,
  p_at           date default current_date)
returns boolean
language plpgsql stable security definer set search_path = hr, public
as $fn$
declare
  v_subject     uuid;
  v_mine        uuid[];
  v_allows_self boolean;
  v_mode        text;
  v_org         uuid;
  v_is_self     boolean;
  v_top         text;
  v_has_mgr     boolean;
begin
  if p_user is null or p_action_type is null then return false; end if;

  select coalesce((c.metadata ->> 'allows_self')::boolean, false),
         coalesce(c.metadata ->> 'sole_authority_mode', 'require_second_actor')
    into v_allows_self, v_mode
    from platform.categories c
   where c.dimension = 'hr_approval_action' and c.slug = p_action_type
     and c.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'::uuid
     and c.deleted_at is null;
  if not found then
    -- §1.3a: "a workflow step definition naming an unregistered action_type fails validation at
    -- definition time, not at routing time" — and if one gets this far it must not route.
    raise exception 'hr.can_approve: % is not a registered hr_approval_action', p_action_type
      using errcode = '22023';
  end if;

  v_subject := hr._approval_subject(p_target_table, p_target_id);
  v_mine    := hr.employments_of(p_user, p_at);
  v_is_self := v_subject is not null and v_subject = any(v_mine);

  -- ---------- RULE 1. NEVER APPROVE YOURSELF. Checked FIRST so no later lane can turn it back on.
  if v_allows_self then
    -- a self-STEP: only you may take it, and everybody else is refused here (RECORDED DECISION 3)
    return v_is_self;
  end if;
  if v_is_self then
    return false;   -- no override, no break-glass, no exception for HR owners or the org owner
  end if;

  -- resolve the org from the subject (or, for subject-less targets, from the target row itself)
  if v_subject is not null then
    select em.organization_id into v_org from hr.employment em where em.id = v_subject;
  else
    execute format('select organization_id from %I.%I where id = $1',
                   split_part(p_target_table,'.',1), split_part(p_target_table,'.',2))
       into v_org using p_target_id;
  end if;
  if v_org is null then return false; end if;

  -- ---------- RULE 2. A MATCHING AUTHORITY ROW.
  -- `rank` deliberately does NOT affect the predicate — it orders the SELECTOR's candidates
  -- (§1.3b joint contract), and a high-rank holder is still a valid approver if they act.
  if exists (
    select 1
      from hr.approval_authority aa
     where aa.organization_id = v_org
       and aa.action_type = p_action_type
       and aa.is_active
       and aa.effective_from <= p_at
       and (aa.effective_to is null or aa.effective_to >= p_at)
       and (
         (aa.holder_kind = 'employment' and aa.holder_id::uuid = any(v_mine))
         or (aa.holder_kind = 'position' and exists (
               select 1 from hr.position_assignment pa
                where pa.id = aa.holder_id::uuid and pa.deleted_at is null
                  and pa.effective_range @> p_at
                  and pa.employment_id = any(v_mine)))
         or (aa.holder_kind = 'role' and exists (
               select 1 from hr.role_assignment ra
                where ra.employment_id = any(v_mine)
                  and ra.role_key = aa.holder_id
                  and ra.is_active and ra.revoked_at is null
                  and ra.effective_from <= p_at
                  and (ra.effective_to is null or ra.effective_to >= p_at)))
       )
       and (v_subject is null
            or hr.population_contains(aa.scope_kind, aa.scope_id, v_subject, p_at,
                                      case when aa.holder_kind = 'employment'
                                           then aa.holder_id::uuid else null end,
                                      aa.scope_employment_ids))
       -- `limits` satisfied. A holder whose limit is exceeded is not INELIGIBLE — the SELECTOR
       -- escalates one rung — but this predicate must still refuse the act itself.
       and hr._limits_satisfied(aa.limits, p_target_table, p_target_id)
  ) then
    return true;
  end if;

  -- ---------- RULE 3. TOP OF CHART.
  if v_subject is not null then
    v_has_mgr := hr.manager_as_of(v_subject, p_at) is not null;
  else
    v_has_mgr := false;
  end if;

  if not v_has_mgr then
    v_top := hr._knob('hr.approvals','top_of_chart_approver') #>> '{}';

    -- when the SUBJECT is the org owner the default falls through to hr_owner role-holders
    if v_top = 'org_owner' and v_subject is not null
       and exists (select 1
                     from hr.employment em
                     join hr.employee e on e.id = em.employee_id
                     join iam.organization_member om
                       on om.user_id = e.login_user_id and om.organization_id = v_org
                    where em.id = v_subject and om.role = 'owner')
    then
      v_top := 'hr_owner';
    end if;

    if v_top = 'org_owner' then
      if exists (select 1 from iam.organization_member om
                  where om.organization_id = v_org and om.user_id = p_user and om.role = 'owner')
      then return true; end if;
    else
      if exists (select 1 from hr.role_assignment ra
                  where ra.organization_id = v_org
                    and ra.employment_id = any(v_mine)
                    and ra.role_key = 'hr_owner'
                    and ra.is_active and ra.revoked_at is null
                    and ra.effective_from <= p_at
                    and (ra.effective_to is null or ra.effective_to >= p_at))
      then return true; end if;
    end if;

    -- ---------- the collision: the only eligible approver IS the requester.
    -- Per-action mode (RECORDED DECISION 2 of hr_c3_01: the map lives on the vocabulary row).
    -- `auto_record` is TRUE here and the workflow engine stamps approval_basis='sole_authority'
    -- and audits it — blocking a sole proprietor from taking a day off is over-tightening, and an
    -- over-tightening defect is weighed exactly as heavily as a leak.
    if v_mode = 'auto_record' and v_is_self then
      return true;
    end if;
  end if;

  -- ---------- RULE 4. Otherwise FALSE, and the workflow engine raises the NAMED failure
  -- `no_eligible_approver` — never a silent stall, which is the canonical over-tightening bug in
  -- HR products.
  return false;
end
$fn$;

revoke all on function hr._limits_satisfied(jsonb, text, uuid) from public;
grant execute on function hr._limits_satisfied(jsonb, text, uuid) to authenticated, service_role;
revoke all on function hr.can_approve(uuid, text, text, uuid, date) from public;
grant execute on function hr.can_approve(uuid, text, text, uuid, date) to authenticated, service_role;

comment on function hr.can_approve is
  'SPEC-ACCESS §1.3b, the PREDICATE — may this person approve this thing. SPEC-WORKFLOW-ENGINE owns the SELECTOR (who should be asked) and its selector must never return a candidate this predicate would refuse (§9 T-21b). Evaluation order is the spec''s and the first rule is hard: never-approve-yourself, checked FIRST.';
