-- HR domain L3 — migration 17 (register item HRB-015, lane L3 punch + kiosk).
--
-- 🚨 THE ORG-RUNG FORM OF `hr._punch_capability` STILL LEAKED ACROSS ORGANIZATIONS. Found by
-- execution while verifying the device-admin lane: a caller with NO role in the target org listed
-- its kiosk devices.
--
-- hr_l3_09 defended the SUBJECT form (`p_subject_employment` set) by requiring the caller to hold
-- an employment in the subject's organization. The ORG-RUNG form (`p_subject_employment => null`,
-- used by the org-wide punch register and by every device-admin door) was not defended, and it is
-- the weaker of the two: with a NULL subject, `hr.capability` skips its population check entirely
-- and returns true if the caller holds the capability through ANY role assignment in ANY
-- organization. So "a role in org A plus an employment in org B" resolved to full administrative
-- reach in org B. Measured: an `hr_owner` in `2643e470-…`, with only a plain employment in the
-- target org and no role there, passed the gate.
--
-- THE FIX: for the org-rung form, the capability must come from a role assignment IN THAT
-- ORGANIZATION. This narrowly mirrors `hr.capability` arm 2 - the same role/catalogue join, with the
-- org's own row winning over the system builtin - with an added `ra.organization_id` predicate that
-- arm 2 is missing. It is an ADDITIONAL narrowing layered after `hr.capability`, never a
-- replacement: the platform predicate still runs first and this can only ever turn a TRUE into a
-- FALSE. When Core C3 fixes arm 2, this becomes redundant rather than divergent.
--
-- Applied live as `hr_l3_17_org_rung_tenancy_defence`. Idempotent.

create or replace function hr._punch_capability(
  p_user uuid, p_capability text, p_subject_employment uuid, p_at date,
  p_organization_id uuid default null)
returns boolean
language plpgsql
stable
security definer
set search_path to 'hr', 'public'
as $$
declare v_org uuid; v_mine uuid[];
begin
  if p_user is null then return false; end if;

  -- the platform predicate first: this wrapper may only ever NARROW it, never widen it
  if not hr.capability(p_user, p_capability, p_subject_employment, p_at) then
    return false;
  end if;

  v_org := p_organization_id;
  if v_org is null and p_subject_employment is not null then
    select em.organization_id into v_org from hr.employment em where em.id = p_subject_employment;
  end if;
  if v_org is null then
    -- no organization to check against: refuse rather than inherit the platform-wide TRUE
    return false;
  end if;

  v_mine := hr.employments_of(p_user, p_at);

  -- (1) the caller must hold an employment in the subject's organization (hr_l3_09)
  if not exists (
    select 1 from hr.employment em
     where em.id = any(v_mine) and em.organization_id = v_org
       and em.deleted_at is null and em.status <> 'terminated') then
    return false;
  end if;

  -- (2) 🚨 THE ORG-RUNG FORM (hr_l3_17): with a NULL subject, hr.capability skips its population
  -- check, so the capability may have come from a role in a DIFFERENT organization. Require that it
  -- comes from a role assignment in THIS one. The self lane is exempt - `self.*` is about the
  -- caller, not about an organization's population.
  if p_subject_employment is null and p_capability not like 'self.%' then
    return exists (
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
         and ra.organization_id = v_org          -- the predicate hr.capability arm 2 is missing
         and ra.is_active
         and ra.revoked_at is null
         and ra.effective_from <= p_at
         and (ra.effective_to is null or ra.effective_to >= p_at)
         and p_capability = any(role.capabilities));
  end if;

  return true;
end
$$;

comment on function hr._punch_capability(uuid, text, uuid, date, uuid) is
  'L3 tenancy defence over hr.capability: (1) the caller holds an employment in the subject org, and (2) for the org-rung form (null subject) the capability comes from a role assignment IN THAT ORG. Narrows only. Defect owner of the underlying leak: Core C3.';

do $$
begin
  if pg_get_functiondef('hr._punch_capability(uuid,text,uuid,date,uuid)'::regprocedure)
     not like '%ra.organization_id = v_org%' then
    raise exception 'hr_l3_17: the org-rung predicate did not land';
  end if;
  -- the punch lane still routes through it, and the gate is still green
  if pg_get_functiondef('hr.punch_register(jsonb,jsonb)'::regprocedure) not like '%_punch_capability%' then
    raise exception 'hr_l3_17: punch_register no longer uses the defended predicate';
  end if;
end $$;
