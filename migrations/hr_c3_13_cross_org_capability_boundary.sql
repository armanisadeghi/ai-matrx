-- HR domain C3 — migration 13 (register item HRB-007, lane core-c3-access). 🚨 SECURITY.
--
-- 🚨 CROSS-TENANT AUTHORITY LEAK IN `hr.capability`, proven live by the L3 punch builder and
-- reproduced here before anything was touched. An `hr_owner` whose ONLY role assignment is in org A
-- held every capability over org B's employments:
--
--   working_record.read=t  working_record.write=t  comp.read=t  comp.write=t  medical.read=t
--   ssn.reveal=t  identity.read=t  incident.read=t  role.assign=t
--   hr.population_contains('org', …) across tenants = t
--   🚨 hr_confidential_get('hr_compensation', <ORG B row>) granted = TRUE
--
-- THE MECHANISM, and it is the exact shape this lane already killed once in the outsider scope
-- matcher: **trust the caller.** `hr.population_contains` returned TRUE unconditionally for
-- `scope_kind='org'` on the stated assumption that *"every caller has already scoped by
-- organization_id"* — and `hr.capability` arm 2, the single most important caller, had not. It
-- selected `hr.role_assignment` rows by `ra.employment_id = any(v_mine)` with **no comparison
-- between the role's organization and the subject's**, then asked a predicate that answered "yes"
-- by construction. Two halves each assuming the other did the work, which is how a boundary
-- disappears without any line of code looking wrong.
--
-- ===================================================================================
-- THE FIX — the boundary is ENFORCED INSIDE, never assumed of callers
--
-- 1. `hr.capability` arm 2 now resolves the SUBJECT's organization and requires the role
--    assignment to belong to it. That alone kills all eleven reproduced leaks, because every one
--    of them passed a subject.
-- 2. `hr.population_contains` no longer returns TRUE for `org` on faith. It resolves the
--    employment's organization and compares it against the population's — taking that organization
--    from an explicit new `p_organization_id` when given, and otherwise **deriving it from the
--    HOLDER's own employment**, which is data it already receives (`hr.capability` passes
--    `ra.employment_id`, whose org IS `ra.organization_id`). With neither available for an `org`
--    scope it FAILS CLOSED. This is why 9 existing call sites across four lanes needed no edit to
--    become safe: the function stopped needing them to be careful.
-- 3. Every non-`org` scope is also org-checked, so a department, location, crew, pay-group or
--    employment-set id can never reach across a tenant boundary either.
--
-- 🚨 THE RESIDUAL, STATED RATHER THAN GLOSSED: a call with **no subject and no organization** —
-- `hr.capability(uid,'audit.read')` — still answers "does this user hold it in ANY org", because
-- there is nothing in the arguments to scope it to. That is the ambient form, it is used by ~20
-- call sites across L1/L3/C4 that scope their own queries by org separately, and tightening it to
-- false here would break every one of them at once. This lane's own two ambient callers are
-- converted below to pass the org explicitly. **The remaining ambient call sites are enumerated on
-- the register row and ROUTED to their lanes** — the fix in each is one argument.
--
-- Authority: SPEC-ACCESS §1.3 (population), §1.4 (the capability predicate), §0 law 1.
-- Applied live as `hr_c3_13_cross_org_capability_boundary`. Idempotent. **This gates G2.**
-- ===================================================================================

set local statement_timeout = '600s';
set local lock_timeout = '30s';

-- ============================================================ §1.3 the population predicate
create or replace function hr.population_contains(
  p_scope_kind           text,
  p_scope_id             uuid,
  p_employment_id        uuid,
  p_at                   date    default current_date,
  p_holder_employment_id uuid    default null,
  p_scope_employment_ids uuid[]  default '{}',
  p_organization_id      uuid    default null)
returns boolean
language plpgsql stable security definer set search_path = hr, public
as $fn$
declare
  v_pos hr.position_assignment%rowtype;
  v_pay uuid; v_emp_org uuid; v_pop_org uuid; v_scope_org uuid;
begin
  if p_employment_id is null then return false; end if;

  -- 🚨 THE TENANT BOUNDARY, RESOLVED HERE AND NOT ASSUMED OF THE CALLER.
  select em.organization_id into v_emp_org
    from hr.employment em where em.id = p_employment_id and em.deleted_at is null;
  if v_emp_org is null then return false; end if;

  -- the population's organization: explicit if given, else the HOLDER's own — which is data this
  -- function already receives, and is why nine existing call sites became safe without an edit
  v_pop_org := p_organization_id;
  if v_pop_org is null and p_holder_employment_id is not null then
    select em.organization_id into v_pop_org
      from hr.employment em where em.id = p_holder_employment_id;
  end if;

  if v_pop_org is not null and v_pop_org <> v_emp_org then
    return false;                       -- different tenants: no scope kind can bridge them
  end if;

  if p_scope_kind = 'org' then
    -- FAIL CLOSED when the population's organization cannot be established at all. The old code
    -- returned TRUE here, on the assumption the caller had already scoped by org.
    return v_pop_org is not null and v_pop_org = v_emp_org;
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
    if v_pay is null or v_pay <> p_scope_id then return false; end if;
    select pg.organization_id into v_scope_org from hr.pay_group pg where pg.id = p_scope_id;
    return v_scope_org = v_emp_org;
  end if;

  -- department | location | crew all resolve through the effective-dated position assignment.
  -- `crew` is a SINGLE flat lookup with no recursion (§1.3c) and it takes effect on its effective
  -- date, never retroactively.
  select * into v_pos from hr.primary_position_as_of(p_employment_id, p_at);
  if not found then return false; end if;

  if p_scope_kind = 'department' then
    if v_pos.department_id is distinct from p_scope_id then return false; end if;
    select d.organization_id into v_scope_org from hr.department d where d.id = p_scope_id;
  elsif p_scope_kind = 'location' then
    if v_pos.location_id is distinct from p_scope_id then return false; end if;
    select l.organization_id into v_scope_org from hr.location l where l.id = p_scope_id;
  elsif p_scope_kind = 'crew' then
    if v_pos.crew_id is distinct from p_scope_id then return false; end if;
    select c.organization_id into v_scope_org from hr.crew c where c.id = p_scope_id;
  else
    return false;                        -- unknown scope kind: fail closed
  end if;

  -- even a matching id must belong to the same tenant
  return v_scope_org is not null and v_scope_org = v_emp_org;
end
$fn$;

-- The 6-argument form is retired FIRST: while both overloads exist the bare name is ambiguous,
-- and leaving it would let a caller reach the pre-boundary shape.
drop function if exists hr.population_contains(text, uuid, uuid, date, uuid, uuid[]);

comment on function hr.population_contains(text, uuid, uuid, date, uuid, uuid[], uuid) is
  'SPEC-ACCESS 1.3/1.3c. FAIL-CLOSED on an unknown scope_kind AND on a tenant boundary: it resolves the employment''s organization itself rather than assuming the caller scoped by it (the assumption that produced a live cross-org authority leak). position_subtree is a fixpoint walk with a visited-path cycle guard and NO depth cap; crew is one effective-dated lookup, flat.';

revoke all on function hr.population_contains(text, uuid, uuid, date, uuid, uuid[], uuid) from public;
revoke all on function hr.population_contains(text, uuid, uuid, date, uuid, uuid[], uuid) from anon;
grant execute on function hr.population_contains(text, uuid, uuid, date, uuid, uuid[], uuid) to authenticated, service_role;

-- ============================================================ §1.4 the capability predicate
create or replace function hr.capability(
  p_user               uuid,
  p_capability         text,
  p_subject_employment uuid default null,
  p_at                 date default current_date,
  p_organization_id    uuid default null)
returns boolean
language plpgsql stable security definer set search_path = hr, public
as $fn$
declare
  v_mine   uuid[];
  v_depth  integer;
  v_org    uuid := p_organization_id;
begin
  if p_user is null or p_capability is null then return false; end if;
  v_mine := hr.employments_of(p_user, p_at);

  -- (1) THE SELF LANE, and it answers `self.*` ONLY.
  if p_capability like 'self.%' then
    return p_subject_employment is not null and p_subject_employment = any(v_mine);
  end if;

  if cardinality(v_mine) = 0 then
    return false;
  end if;

  -- 🚨 THE SUBJECT'S ORGANIZATION IS AUTHORITATIVE. A role assignment in another tenant confers
  -- nothing here — the leak this migration exists to close was exactly the absence of this line.
  if p_subject_employment is not null then
    select em.organization_id into v_org
      from hr.employment em where em.id = p_subject_employment and em.deleted_at is null;
    if v_org is null then return false; end if;
  end if;

  -- (2) ASSIGNED ROLES. The org's own catalogue row wins over the system builtin of the same key
  -- so an org can tighten a builtin.
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
       -- the tenant boundary: the role must live in the organization being asked about
       and (v_org is null or ra.organization_id = v_org)
       and p_capability = any(role.capabilities)
       and (p_subject_employment is null
            or hr.population_contains(ra.scope_kind, ra.scope_id, p_subject_employment, p_at,
                                      ra.employment_id, ra.scope_employment_ids,
                                      ra.organization_id))
  ) then
    return true;
  end if;

  -- (3) THE MANAGER LANE — derived, never assigned, and only for the two capabilities the
  -- `manager` builtin holds.
  if p_subject_employment is not null
     and exists (select 1 from hr.access_role ar
                  where ar.role_key = 'manager'
                    and ar.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'::uuid
                    and ar.deleted_at is null
                    and p_capability = any(ar.capabilities))
  then
    v_depth := (hr._knob('hr.access','manager_visibility_depth') #>> '{}')::integer;
    if exists (select 1
                 from hr.manager_chain(p_subject_employment, p_at) mc
                 join hr.employment mem on mem.id = mc.manager_employment_id
                where mc.manager_employment_id = any(v_mine)
                  and mc.depth <= v_depth
                  -- a chain cannot cross tenants, but the boundary is asserted, not assumed
                  and mem.organization_id = v_org) then
      return true;
    end if;
  end if;

  return false;
end
$fn$;

drop function if exists hr.capability(uuid, text, uuid, date);

comment on function hr.capability(uuid, text, uuid, date, uuid) is
  'SPEC-ACCESS 1.4. The ONE role-and-population predicate. It can never grant reach on a non-hr token (law 1), never consults org role, and NEVER lets a role assignment in one tenant answer for an employment in another - the subject''s organization is authoritative. With neither a subject nor p_organization_id it answers the ambient question (does this user hold it in ANY org); pass p_organization_id whenever the answer is about a particular tenant.';

revoke all on function hr.capability(uuid, text, uuid, date, uuid) from public;
revoke all on function hr.capability(uuid, text, uuid, date, uuid) from anon;
grant execute on function hr.capability(uuid, text, uuid, date, uuid) to authenticated, service_role;

-- ============================================================ this lane's own ambient callers
-- Both already resolve an organization; they now say so to the predicate instead of asking the
-- ambient question and scoping separately.
do $$
declare v_def text; v_new text; v_n int := 0;
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_access_audit_query';
  if v_def is not null then
    v_new := replace(v_def, $q$hr.capability(v_uid, 'audit.read')$q$,
                            $q$hr.capability(v_uid, 'audit.read', null, current_date, v_org)$q$);
    if v_new <> v_def then execute v_new; v_n := v_n + 1; end if;
  end if;

  select pg_get_functiondef(p.oid) into v_def from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_incident_status';
  if v_def is not null then
    v_new := replace(v_def, $q$hr.capability(v_uid,'incident.read')$q$,
                            $q$hr.capability(v_uid,'incident.read', null, current_date, i.organization_id)$q$);
    if v_new <> v_def then execute v_new; v_n := v_n + 1; end if;
  end if;
  raise notice 'hr_c3_13: scoped % of this lane''s own ambient capability calls', v_n;
end $$;

-- ============================================================ this lane's remaining ambient calls
-- 🚨 A SECOND REAL CROSS-ORG HOLE, found by auditing every caller as the coordinator asked rather
-- than stopping at the reported one: `hr_mint_investigation_token` gated on
-- `hr.capability(v_uid,'incident.investigate') or hr.capability(v_uid,'role.assign')` with NO
-- subject and NO organization — so an employee-relations owner in org A could escalate ORG B's
-- incident to an external investigator, minting the most privileged outsider token in the system
-- (§5.6(H)) against a tenant they have no standing in. Both calls are now scoped to the incident's
-- own organization. `hr.access_explain` is scoped for the same reason: a diagnostic that reports
-- capabilities from the wrong tenant is a diagnostic that lies.
do $$
declare v_def text; v_new text; v_n int := 0;
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_mint_investigation_token';
  if v_def is not null then
    v_new := replace(v_def,
      $q$hr.capability(v_uid,'incident.investigate') or hr.capability(v_uid,'role.assign')$q$,
      $q$hr.capability(v_uid,'incident.investigate', null, current_date, i.organization_id)
          or hr.capability(v_uid,'role.assign', null, current_date, i.organization_id)$q$);
    if v_new <> v_def then execute v_new; v_n := v_n + 1; end if;
  end if;

  select pg_get_functiondef(p.oid) into v_def from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'access_explain';
  if v_def is not null then
    v_new := v_def;
    for v_new in select replace(v_new, $q$hr.capability(p_user,'comp.read')$q$,
                                       $q$hr.capability(p_user,'comp.read', null, current_date, v_org)$q$) loop exit; end loop;
    v_new := replace(v_new, $q$hr.capability(p_user,'medical.read')$q$,
                            $q$hr.capability(p_user,'medical.read', null, current_date, v_org)$q$);
    v_new := replace(v_new, $q$hr.capability(p_user,'incident.read')$q$,
                            $q$hr.capability(p_user,'incident.read', null, current_date, v_org)$q$);
    if v_new <> v_def then execute v_new; v_n := v_n + 1; end if;
  end if;
  raise notice 'hr_c3_13: scoped % more of this lane''s ambient capability call sites', v_n;
end $$;

-- ============================================================ the NULL-holder callers
-- 🚨 FAIL-CLOSED CUTS BOTH WAYS, AND THIS HALF SHOWS UP AS A ROUTING OUTAGE, NOT A LEAK.
-- `population_contains` derives the tenant from the HOLDER when no organization is passed, which
-- is why five of the nine call sites needed no edit at all — they pass `ra.employment_id` and the
-- org comes with it. But TWO pass `case when holder_kind = 'employment' then … else null end`, so
-- a `role`- or `position`-kind authority hands over a NULL holder and there is nothing left to
-- derive from: an `org`-scoped authority held by a ROLE resolved to nobody. hrb008_proof caught it
-- as two lost routing assertions ("a VACANT position seat … falls to `substitute`" and "the ONLY
-- v1 allows_self step routes to the employee themselves"). Both queries ALREADY filter the
-- authority by organization — the value was known and simply not handed over.
-- `hr.can_approve` is this lane's; `hr.wf_resolve_approvers` is C4's and is rewritten
-- programmatically from its live definition so nothing but the argument list changes.
do $$
declare v_def text; v_new text; v_n int := 0;
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'can_approve';
  if v_def is not null then
    v_new := replace(v_def, 'aa.scope_employment_ids)', 'aa.scope_employment_ids, aa.organization_id)');
    if v_new <> v_def then execute v_new; v_n := v_n + 1; end if;
  end if;

  select pg_get_functiondef(p.oid) into v_def from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'wf_resolve_approvers';
  if v_def is not null then
    v_new := replace(v_def, 'a.scope_employment_ids)', 'a.scope_employment_ids, a.organization_id)');
    v_new := replace(v_new, 'b.scope_employment_ids)', 'b.scope_employment_ids, b.organization_id)');
    if v_new <> v_def then execute v_new; v_n := v_n + 1; end if;
  end if;
  raise notice 'hr_c3_13: threaded the organization through % NULL-holder resolver(s)', v_n;
end $$;

-- ============================================================ assertions
do $$
declare v_bad int;
begin
  -- the pre-boundary signatures must be gone, or a caller could reach the leaking shape
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'hr' and p.proname = 'population_contains'
                and pg_get_function_identity_arguments(p.oid) = 'text, uuid, uuid, date, uuid, uuid[]') then
    raise exception 'hr_c3_13: the 6-argument population_contains survives';
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'hr' and p.proname = 'capability'
                and pg_get_function_identity_arguments(p.oid) = 'uuid, text, uuid, date') then
    raise exception 'hr_c3_13: the 4-argument capability survives';
  end if;

  -- the unconditional TRUE for `org` must be gone
  if (select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'hr' and p.proname = 'population_contains')
     ~ 'p_scope_kind = ''org'' then\s*\n\s*(--[^\n]*\n\s*)*return true;' then
    raise exception 'hr_c3_13: population_contains still returns TRUE unconditionally for org scope';
  end if;

  -- capability must compare the role's organization against the subject's
  if (select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'hr' and p.proname = 'capability') not like '%ra.organization_id = v_org%' then
    raise exception 'hr_c3_13: capability does not bind a role assignment to the subject''s tenant';
  end if;

  -- every caller still resolves (a dropped overload would surface as a missing function)
  select count(*) into v_bad from pg_proc p
   where p.prosrc like '%population_contains%' and p.proname <> 'population_contains';
  if v_bad < 9 then
    raise exception 'hr_c3_13: only % callers of population_contains remain; expected at least 9', v_bad;
  end if;

  -- the investigation minter must never ask the ambient question again
  if (select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'hr_mint_investigation_token')
     ~ 'hr\.capability\(v_uid,''(incident\.investigate|role\.assign)''\)' then
    raise exception 'hr_c3_13: hr_mint_investigation_token still gates on an unscoped capability';
  end if;

  -- 🚨 no caller may reach population_contains without a way to establish the tenant: either an
  -- explicit organization or a holder to derive it from. A 6-argument call with a NULL holder and
  -- an `org` scope now resolves to nobody, which is a routing outage, not a leak — but it is still
  -- a defect, and this is where it gets caught.
  -- 🚨 A caller may omit the organization ONLY if it always supplies a holder to derive it from.
  -- The `else null end` shape can supply neither, so it must pass the organization explicitly —
  -- otherwise an org-scoped authority held by a ROLE silently resolves to nobody.
  select count(*) into v_bad from pg_proc p
   where p.proname <> 'population_contains'
     and p.prosrc like '%population_contains%'
     and p.prosrc ~ 'else null end,\s*[a-z_]+\.scope_employment_ids\s*\)';
  if v_bad > 0 then
    raise exception 'hr_c3_13: % caller(s) can pass a NULL holder with no organization', v_bad;
  end if;

  select count(*) into v_bad from platform.entity_types e
   where e.schema_name = 'hr' and not iam.canonical_certify_ok(e.schema_name, e.table_name, e.token);
  if v_bad > 0 then
    raise exception 'hr_c3_13: % hr tokens no longer certify', v_bad;
  end if;
end $$;
