-- HR domain C3 — migration 5 of 7 (register item HRB-007, lane core-c3-access).
--
-- THE DERIVED-GRANT MACHINERY. hr._desired_grants (§2.1's four roots), the three declarative
-- reconcilers + hr.derive_grants_bulk, the §2.4 write-driven triggers, §2.5's eager expiry,
-- §2.6's drift check and self-heal, the boundary sweep the D23 schedule will call, and
-- hr.access_explain — §2.3's anti-over-tightening instrument.
--
-- 🚨 G-EXPIRES IS GREEN AND THIS FILE IS WHY IT HAD TO RUN FIRST. Proven live before a line of
-- derivation was written, in a rolled-back transaction with a REAL grant carrying a REAL past
-- `expires_at` (SPEC-ACCESS §9 T-24; `iam.permissions` held 3,212 rows and 0 had ever used the
-- column). 13 assertions, all green: a grant expired yesterday is refused by
-- `public.has_permission_for` AND by `iam.has_access_for`; moved to tomorrow both admit it; a NULL
-- expiry (the shape all 3,212 live rows use) admits it; the ORG-AUDIENCE arm honours expiry
-- identically; and as a real `authenticated` JWT the expired grant yields 0 rows from
-- `iam.accessible_entity_ids` and 0 rows through the generated `std_select`. The §2.5 fallback
-- (revocation as a grant DELETE plus `status='rejected'`) is therefore NOT needed and is not built.
--
-- Authority: SPEC-ACCESS §2.1–§2.6, §9 T-9/T-10/T-12/T-19/T-20/T-24/T-25/T-31.
-- Applied live as `hr_c3_05_grant_derivation`. Idempotent.
--
-- ===================================================================================
-- RECORDED TECHNICAL DECISIONS (EXECUTION §8)
--
-- 1. 🚨 THE FOURTH ROOT MOVED, BECAUSE THE THIRD ONE DID. §2.1 names four entity-root tokens:
--    hr_employee, hr_employment, hr_requisition, hr_candidate. `hr_employment` was landed as a
--    COMPONENT of `hr_employee` and file 2 of this lane made it the entity root §2.1 and §3.1
--    always said it was — see that file's header for the leak that forced it. Derivation writes
--    grants on all four roots as specified; nothing here works around the old shape.
--
-- 2. THE `hr_employee` DIR ROW IS DERIVED FROM THE **PERSON**, NOT THE SPELL, so it survives a
--    termination and a rehire. §3.3 makes DIR one org-audience viewer row per RECORD; the
--    directory card of a terminated colleague is governed by `hr.employee.directory_status`, not
--    by whether a spell is open. Deriving it from the spell would have deleted the card the day
--    someone left and re-created it on rehire, churning a row for no reason.
--
-- 3. `expires_at` IS COMPUTED IN THE EMPLOYMENT'S STAMPED IANA TIMEZONE, never the server's
--    (§2.5). `end_of_day` resolves to the local end of the last day; `immediate` to the later of
--    now() and the termination instant, so recording a FUTURE-dated termination does not revoke
--    access today, and recording a BACK-dated one revokes immediately rather than retroactively
--    pretending it already had.
--
-- 4. AN ORG-SCOPED ROLE ASSIGNMENT DERIVES EVERY EMPLOYMENT IN THE ORG, SYNCHRONOUSLY, WITH NO
--    INLINE BUDGET CAP. §2.4 permits a writer RPC to call hr.derive_grants_bulk explicitly when a
--    reorg "exceeds a sane inline budget", but it is explicit that a queue is not allowed —
--    "a manager who cannot see their new team on Monday morning is a defect". At the observed
--    scale (§2.1 sizes a 500-person tenant at ~2,700–3,000 grant rows in total) synchronous is
--    right. THE BUDGET QUESTION IS RECORDED, NOT ANSWERED: if a tenant ever makes one org-scoped
--    role assignment slow, the fix is a bulk call from the RPC, never a background job.
--
-- 5. `ops.system_error` IS WRITTEN ONLY IF IT EXISTS, and the kind string is registered as a
--    KNOWN DEBT rather than assumed. §2.6 requires `kind='hr_grant_drift_detected'` to be in
--    aidream's `admin_persistence._patrol_priority()` urgent set — an unregistered kind falls to
--    `other` and is filtered out of priority triage (the exact trap the reachability work hit).
--    That is an aidream code change in another repo; this file files the incident correctly and
--    the registration is ROUTED on the register row.
-- ===================================================================================

set local statement_timeout = '600s';
set local lock_timeout = '20s';

-- ============================================================ §2.5 the eager expiry clock
create or replace function hr._employment_expiry(p_employment_id uuid)
returns timestamptz
language plpgsql stable security definer set search_path = hr, public
as $fn$
declare v_term date; v_tz text; v_mode text;
begin
  select em.termination_date into v_term from hr.employment em where em.id = p_employment_id;
  if v_term is null then return null; end if;

  select coalesce(l.tz, 'UTC') into v_tz
    from hr.primary_position_as_of(p_employment_id, v_term) pa
    left join hr.location l on l.id = pa.location_id;
  v_tz := coalesce(v_tz, 'UTC');

  v_mode := hr._knob('hr.onboarding','access_shutoff_mode') #>> '{}';
  if v_mode = 'end_of_day' then
    -- the local end of the last day, in the employment's stamped zone, never the server's
    return ((v_term + 1)::timestamp) at time zone v_tz;
  end if;
  -- `immediate`: the moment it is RECORDED, but never before the termination instant itself
  return greatest(now(), (v_term::timestamp) at time zone v_tz);
end
$fn$;

revoke all on function hr._employment_expiry(uuid) from public;
grant execute on function hr._employment_expiry(uuid) to service_role;

-- ============================================================ §2.1 the DESIRED set
-- Declarative: what SHOULD exist, computed from hr.role_assignment, the reporting line and the
-- requisition team, resolved as of p_at with effective dating. Nothing here reads iam.permissions.
create or replace function hr._desired_grants_for_employment(p_employment_id uuid, p_at date default current_date)
returns table (resource_type text, resource_id uuid, grantee_user_id uuid,
               grantee_organization_id uuid, permission_level text, expires_at timestamptz,
               reason text, basis_kind text, basis_id uuid, subject_employment_id uuid)
language plpgsql stable security definer set search_path = hr, public
as $fn$
declare
  v_org uuid; v_employee uuid; v_exp timestamptz; v_depth integer; v_status text;
begin
  select em.organization_id, em.employee_id, em.status
    into v_org, v_employee, v_status
    from hr.employment em where em.id = p_employment_id and em.deleted_at is null;
  if v_org is null then return; end if;

  v_exp   := hr._employment_expiry(p_employment_id);
  v_depth := (hr._knob('hr.access','manager_visibility_depth') #>> '{}')::integer;

  -- ---------- ROOT 1: hr_employee, THE DIR PATTERN (§3.3)
  -- Exactly ONE row per record with granted_to_organization_id, level viewer. has_permission_for
  -- resolves the org audience through iam.organization_member, so the cost is one row per record
  -- and not one per (record × member) — and the level is viewer: read, never edit.
  -- 🚨 It is NOT `internal` visibility, because the org-internal lane confers up to EDITOR to
  -- every active member (THE EDITOR-CAP RULING) and that would hand every employee edit rights on
  -- a colleague's directory record.
  if exists (select 1 from hr.employee e where e.id = v_employee and e.deleted_at is null) then
    return query select 'hr_employee'::text, v_employee, null::uuid, v_org, 'viewer'::text,
                        null::timestamptz, 'directory'::text, 'employee'::text, v_employee,
                        p_employment_id;
  end if;

  -- a deleted or terminated spell confers nothing further; the DIR card is the person's (DECISION 2)
  if v_status is null then return; end if;

  -- ---------- ROOT 2a: hr_employment to every holder of working_record.read over the population
  return query
    select 'hr_employment'::text, p_employment_id, e2.login_user_id, null::uuid, 'viewer'::text,
           -- eager: the EARLIER of the spell's own end and the role assignment's own end
           (select min(x) from (values
              (v_exp),
              (case when ra.effective_to is null then null
                    else ((ra.effective_to + 1)::timestamp at time zone 'UTC') end)) as t(x)),
           'hr_role:' || ra.role_key, 'role_assignment'::text, ra.id, p_employment_id
      from hr.role_assignment ra
      join hr.employment hem on hem.id = ra.employment_id and hem.deleted_at is null
      join hr.employee   e2  on e2.id = hem.employee_id and e2.deleted_at is null
      join lateral (
        select ar.capabilities from hr.access_role ar
         where ar.role_key = ra.role_key and ar.deleted_at is null and ar.is_active
           and ar.organization_id in (ra.organization_id, '39c38960-d30c-4840-b0c1-c9960de95582'::uuid)
         order by (ar.organization_id = ra.organization_id) desc limit 1) role on true
     where ra.organization_id = v_org
       and ra.is_active and ra.revoked_at is null
       and ra.effective_from <= p_at
       and (ra.effective_to is null or ra.effective_to >= p_at)
       and 'working_record.read' = any(role.capabilities)
       and e2.login_user_id is not null
       -- the subject needs no grant: the kernel's owner arm answers first and costs nothing
       and hem.id is distinct from p_employment_id
       and hr.population_contains(ra.scope_kind, ra.scope_id, p_employment_id, p_at,
                                  ra.employment_id, ra.scope_employment_ids);

  -- ---------- ROOT 2b: hr_employment to every manager within the visibility depth
  -- 🚨 TRUE CHAIN FIRST, TRUNCATION SECOND (§1.3c): manager_chain walks to a FIXPOINT and the
  -- depth knob is applied here as a filter, so raising the knob never has to re-derive from a
  -- lossy cache.
  return query
    select 'hr_employment'::text, p_employment_id, e3.login_user_id, null::uuid, 'viewer'::text,
           v_exp,
           case when mc.depth = 1 then 'manager:direct' else 'manager:depth' || mc.depth end,
           'manager_chain'::text, mc.manager_employment_id, p_employment_id
      from hr.manager_chain(p_employment_id, p_at) mc
      join hr.employment mem on mem.id = mc.manager_employment_id and mem.deleted_at is null
      join hr.employee   e3  on e3.id = mem.employee_id and e3.deleted_at is null
     where mc.depth <= v_depth
       and e3.login_user_id is not null
       and mem.id is distinct from p_employment_id;
end
$fn$;

-- ---------------------------------------------------------------- the requisition side
create or replace function hr._desired_grants_for_requisition(p_requisition_id uuid, p_at date default current_date)
returns table (resource_type text, resource_id uuid, grantee_user_id uuid,
               grantee_organization_id uuid, permission_level text, expires_at timestamptz,
               reason text, basis_kind text, basis_id uuid, subject_employment_id uuid)
language plpgsql stable security definer set search_path = hr, public
as $fn$
declare v_org uuid; v_state text; v_closed timestamptz; v_cand_exp timestamptz; v_req_exp timestamptz;
begin
  select r.organization_id, r.state, r.closed_at into v_org, v_state, v_closed
    from hr.requisition r where r.id = p_requisition_id and r.deleted_at is null;
  if v_org is null then return; end if;

  -- §2.1: candidate reach DIES WITH THE REQUISITION; the interviewer wall expires at close.
  v_req_exp  := v_closed;
  v_cand_exp := case when v_closed is null then null
                     else v_closed + make_interval(months =>
                            coalesce((select rc.default_retention_months from hr.record_class rc
                                       where rc.class_key = 'applicant_record'), 12)) end;

  -- the requisition itself: recruiter + hiring manager (R1 — this is the ONLY reach; the token is
  -- `entity` at visibility `personal`, so there is no org lane and no fallback)
  return query
    select 'hr_requisition'::text, p_requisition_id, e.login_user_id, null::uuid, 'viewer'::text,
           v_req_exp, 'requisition_team'::text, 'requisition'::text, p_requisition_id, em.id
      from hr.requisition r
      join lateral (values (r.recruiter_employment_id), (r.hiring_manager_employment_id)) as t(emp) on true
      join hr.employment em on em.id = t.emp and em.deleted_at is null
      join hr.employee   e  on e.id = em.employee_id and e.deleted_at is null
     where r.id = p_requisition_id and e.login_user_id is not null;

  -- the candidates: recruiter and hiring owner ONLY — never an interviewer
  return query
    select 'hr_candidate'::text, a.candidate_id, e.login_user_id, null::uuid, 'viewer'::text,
           v_cand_exp, 'requisition_team'::text, 'requisition'::text, p_requisition_id, em.id
      from hr.opening o
      join hr.application a on a.opening_id = o.id and a.deleted_at is null
      join hr.requisition r on r.id = o.requisition_id
      join lateral (values (r.recruiter_employment_id), (r.hiring_manager_employment_id)) as t(emp) on true
      join hr.employment em on em.id = t.emp and em.deleted_at is null
      join hr.employee   e  on e.id = em.employee_id and e.deleted_at is null
     where o.requisition_id = p_requisition_id and o.deleted_at is null
       and e.login_user_id is not null;

  -- 🚨 THE INTERVIEWER WALL. A direct grant on the COMPONENT token hr_interview — direct lanes
  -- apply to every registered row including components — so an interviewer reaches their own
  -- panels and the structured kit WITHOUT a grant on the candidate, and therefore has no path to
  -- the EEO, accommodation, reference or background-result rows hanging off it.
  return query
    select 'hr_interview'::text, i.id, e.login_user_id, null::uuid, 'viewer'::text,
           v_req_exp, 'interview_panel'::text, 'requisition'::text, p_requisition_id, em.id
      from hr.opening o
      join hr.application a on a.opening_id = o.id and a.deleted_at is null
      join hr.interview   i on i.application_id = a.id and i.deleted_at is null
      join lateral unnest(i.interviewer_employment_ids) as t(emp) on true
      join hr.employment em on em.id = t.emp and em.deleted_at is null
      join hr.employee   e  on e.id = em.employee_id and e.deleted_at is null
     where o.requisition_id = p_requisition_id and o.deleted_at is null
       and e.login_user_id is not null;
end
$fn$;

revoke all on function hr._desired_grants_for_employment(uuid, date) from public;
grant execute on function hr._desired_grants_for_employment(uuid, date) to service_role;
revoke all on function hr._desired_grants_for_requisition(uuid, date) from public;
grant execute on function hr._desired_grants_for_requisition(uuid, date) to service_role;

-- ============================================================ §2.2 the declarative reconcile
-- 🚨 NEVER AN INCREMENTAL DELTA. Compute DESIRED, compare against ACTUAL identified through
-- hr.derived_grant, write the difference, and refresh the mapping in the SAME transaction.
-- IDEMPOTENCY IS BY CONSTRUCTION: run it twice and the second run performs zero writes (§9 T-31).
create or replace function hr._reconcile_grants(p_scope_kind text, p_scope_id uuid, p_at date)
returns jsonb
language plpgsql security definer set search_path = hr, public
as $fn$
declare
  v_ins int := 0; v_upd int := 0; v_del int := 0; v_same int := 0;
  d record; v_perm uuid; v_changed boolean;
begin
  perform set_config('hr.privileged_write','on',true);

  create temp table _hr_desired (
    resource_type text, resource_id uuid, grantee_user_id uuid, grantee_organization_id uuid,
    permission_level text, expires_at timestamptz, reason text, basis_kind text, basis_id uuid,
    subject_employment_id uuid) on commit drop;

  if p_scope_kind = 'employment' then
    insert into _hr_desired select * from hr._desired_grants_for_employment(p_scope_id, p_at);
  elsif p_scope_kind = 'requisition' then
    insert into _hr_desired select * from hr._desired_grants_for_requisition(p_scope_id, p_at);
  else
    raise exception 'hr._reconcile_grants: unknown scope kind %', p_scope_kind using errcode = '22023';
  end if;

  -- ---------- upsert every desired row
  for d in select * from _hr_desired loop
    if d.grantee_user_id is not null then
      select p.id,
             (p.permission_level::text is distinct from d.permission_level
              or p.expires_at is distinct from d.expires_at
              or coalesce(p.status,'active') = 'rejected')
        into v_perm, v_changed
        from iam.permissions p
       where p.resource_type = d.resource_type and p.resource_id = d.resource_id
         and p.granted_to_user_id = d.grantee_user_id;

      if v_perm is null then
        insert into iam.permissions (resource_type, resource_id, granted_to_user_id,
                                     permission_level, status, expires_at)
        values (d.resource_type, d.resource_id, d.grantee_user_id,
                d.permission_level::public.permission_level, 'active', d.expires_at)
        returning id into v_perm;
        v_ins := v_ins + 1;
      elsif v_changed then
        update iam.permissions
           set permission_level = d.permission_level::public.permission_level,
               expires_at = d.expires_at, status = 'active'
         where id = v_perm;
        v_upd := v_upd + 1;
      else
        v_same := v_same + 1;
      end if;
    else
      select p.id,
             (p.permission_level::text is distinct from d.permission_level
              or p.expires_at is distinct from d.expires_at)
        into v_perm, v_changed
        from iam.permissions p
       where p.resource_type = d.resource_type and p.resource_id = d.resource_id
         and p.granted_to_organization_id = d.grantee_organization_id;

      if v_perm is null then
        insert into iam.permissions (resource_type, resource_id, granted_to_organization_id,
                                     permission_level, status, expires_at)
        values (d.resource_type, d.resource_id, d.grantee_organization_id,
                d.permission_level::public.permission_level, 'active', d.expires_at)
        returning id into v_perm;
        v_ins := v_ins + 1;
      elsif v_changed then
        update iam.permissions
           set permission_level = d.permission_level::public.permission_level, expires_at = d.expires_at
         where id = v_perm;
        v_upd := v_upd + 1;
      else
        v_same := v_same + 1;
      end if;
    end if;

    -- the mapping row: this is what makes reconciliation SAFE — HR only ever deletes grants IT
    -- created, so a hand-made grant from the sharing UI is never clobbered.
    insert into hr.derived_grant
      (organization_id, permission_id, subject_employment_id, grantee_user_id,
       grantee_organization_id, resource_type, resource_id, permission_level, expires_at,
       reason, basis_kind, basis_id, derived_at)
    select coalesce(
             (select em.organization_id from hr.employment em where em.id = d.subject_employment_id),
             d.grantee_organization_id),
           v_perm, d.subject_employment_id, d.grantee_user_id, d.grantee_organization_id,
           d.resource_type, d.resource_id, d.permission_level, d.expires_at,
           d.reason, d.basis_kind, d.basis_id, now()
    on conflict (permission_id) do update
       set subject_employment_id = excluded.subject_employment_id,
           expires_at = excluded.expires_at, reason = excluded.reason,
           basis_kind = excluded.basis_kind, basis_id = excluded.basis_id,
           derived_at = now()
     where hr.derived_grant.reason is distinct from excluded.reason
        or hr.derived_grant.expires_at is distinct from excluded.expires_at
        or hr.derived_grant.basis_id is distinct from excluded.basis_id;
  end loop;

  -- ---------- retire every mapping that is no longer desired
  -- 🚨 THE PARENTHESES ARE LOAD-BEARING AND A PROBE CAUGHT THEM MISSING. `and` binds tighter than
  -- `or`, so without the outer brackets the first disjunct carried NO `not exists` guard and the
  -- reconcile DELETED every row it had just written — the first live run reported
  -- `inserted=2, deleted=2` and left nothing behind. A reconciler that silently undoes itself
  -- passes any test that only asserts "the wrong person cannot read", which is exactly why the
  -- idempotency assertion (§9 T-31) is written as "the second run performs ZERO writes".
  for d in
    select dg.id, dg.permission_id
      from hr.derived_grant dg
     where ( (p_scope_kind = 'employment' and dg.subject_employment_id = p_scope_id
              and dg.reason <> 'break_glass')
             or (p_scope_kind = 'requisition' and dg.basis_kind = 'requisition'
                 and dg.basis_id = p_scope_id) )
       and not exists (
         select 1 from _hr_desired x
          where x.resource_type = dg.resource_type and x.resource_id = dg.resource_id
            and x.grantee_user_id is not distinct from dg.grantee_user_id
            and x.grantee_organization_id is not distinct from dg.grantee_organization_id)
  loop
    -- deleting the permission cascades the mapping (FK ON DELETE CASCADE)
    delete from iam.permissions where id = d.permission_id;
    v_del := v_del + 1;
  end loop;

  drop table if exists _hr_desired;

  return jsonb_build_object('scope', p_scope_kind, 'id', p_scope_id, 'as_of', p_at,
                            'inserted', v_ins, 'updated', v_upd, 'deleted', v_del,
                            'unchanged', v_same);
end
$fn$;

create or replace function hr.derive_grants_for_employment(p_employment_id uuid, p_at date default current_date)
returns jsonb language sql security definer set search_path = hr, public
as $fn$ select hr._reconcile_grants('employment', p_employment_id, p_at); $fn$;

create or replace function hr.derive_grants_for_requisition(p_requisition_id uuid, p_at date default current_date)
returns jsonb language sql security definer set search_path = hr, public
as $fn$ select hr._reconcile_grants('requisition', p_requisition_id, p_at); $fn$;

-- the reverse direction: everything this person should reach
create or replace function hr.derive_grants_for_actor(p_user_id uuid, p_at date default current_date)
returns jsonb
language plpgsql security definer set search_path = hr, public
as $fn$
declare v_emps uuid[]; v_targets uuid[]; v_out jsonb := '[]'::jsonb; e uuid;
begin
  v_emps := hr.employments_of(p_user_id, p_at);
  -- their own spells, everyone in the populations their roles cover, and everyone below them
  select coalesce(array_agg(distinct t), '{}'::uuid[]) into v_targets from (
    select unnest(v_emps) as t
    union
    select s.employment_id from unnest(v_emps) h, lateral hr.position_subtree(h, p_at) s
    union
    select em.id from hr.employment em
     where em.deleted_at is null
       and exists (
         select 1 from hr.role_assignment ra
          where ra.employment_id = any(v_emps) and ra.is_active and ra.revoked_at is null
            and ra.organization_id = em.organization_id
            and ra.effective_from <= p_at
            and (ra.effective_to is null or ra.effective_to >= p_at)
            and hr.population_contains(ra.scope_kind, ra.scope_id, em.id, p_at,
                                       ra.employment_id, ra.scope_employment_ids))
  ) s;

  foreach e in array v_targets loop
    v_out := v_out || hr.derive_grants_for_employment(e, p_at);
  end loop;
  return jsonb_build_object('user_id', p_user_id, 'employments', cardinality(v_targets), 'runs', v_out);
end
$fn$;

create or replace function hr.derive_grants_bulk(p_employment_ids uuid[], p_at date default current_date)
returns jsonb
language plpgsql security definer set search_path = hr, public
as $fn$
declare e uuid; v_ins int := 0; v_upd int := 0; v_del int := 0; v_same int := 0; r jsonb;
begin
  foreach e in array coalesce(p_employment_ids, '{}'::uuid[]) loop
    r := hr.derive_grants_for_employment(e, p_at);
    v_ins := v_ins + (r ->> 'inserted')::int;
    v_upd := v_upd + (r ->> 'updated')::int;
    v_del := v_del + (r ->> 'deleted')::int;
    v_same := v_same + (r ->> 'unchanged')::int;
  end loop;
  return jsonb_build_object('employments', cardinality(coalesce(p_employment_ids,'{}'::uuid[])),
                            'inserted', v_ins, 'updated', v_upd, 'deleted', v_del, 'unchanged', v_same);
end
$fn$;

-- ============================================================ §2.5 the boundary sweep
-- 🚨 THE FUNCTION ONLY. No cron job is created here and none may be created without Arman's named
-- approval of the schedule and its interval (no-unapproved-schedules). §2.6 proposes
-- `hr-grant-boundary-derive` hourly and `hr-grant-drift-selfheal` daily; until they are approved,
-- boundary conferral runs on first touch and REVOCATION IS NEVER AFFECTED, because revocations are
-- eager (§2.5) — that is the whole reason G-EXPIRES had to be green before this shipped.
create or replace function hr.derive_grants_due(p_window interval default '25 hours')
returns jsonb
language plpgsql security definer set search_path = hr, public
as $fn$
declare v_emps uuid[]; v_reqs uuid[]; v_out jsonb; v_from date; v_to date; r uuid;
begin
  v_from := (now() - p_window)::date;
  v_to   := (now() + p_window)::date;

  select coalesce(array_agg(distinct e), '{}'::uuid[]) into v_emps from (
    select em.id as e from hr.employment em
     where em.deleted_at is null
       and (em.hire_date between v_from and v_to or em.termination_date between v_from and v_to)
    union
    select pa.employment_id from hr.position_assignment pa
     where pa.deleted_at is null
       and (pa.effective_from between v_from and v_to or pa.effective_to between v_from and v_to)
    union
    select em2.id from hr.role_assignment ra
      join hr.employment em2 on em2.organization_id = ra.organization_id and em2.deleted_at is null
     where (ra.effective_from between v_from and v_to or ra.effective_to between v_from and v_to)
       and hr.population_contains(ra.scope_kind, ra.scope_id, em2.id, current_date,
                                  ra.employment_id, ra.scope_employment_ids)
  ) s;

  select coalesce(array_agg(distinct rq.id), '{}'::uuid[]) into v_reqs
    from hr.requisition rq
   where rq.deleted_at is null
     and (rq.closed_at between (now() - p_window) and (now() + p_window)
          or rq.approved_at between (now() - p_window) and (now() + p_window));

  v_out := hr.derive_grants_bulk(v_emps);
  foreach r in array v_reqs loop
    perform hr.derive_grants_for_requisition(r);
  end loop;

  return v_out || jsonb_build_object('requisitions', cardinality(v_reqs), 'window', p_window::text);
end
$fn$;

-- ============================================================ §2.6 drift and self-heal
create or replace function hr.grant_drift()
returns table (kind text, resource_type text, resource_id uuid, grantee_user_id uuid,
               grantee_organization_id uuid, detail text)
language plpgsql security definer set search_path = hr, public
as $fn$
begin
  -- ORPHAN MAPPING: a hr.derived_grant whose permission row is gone. (The FK cascades, so this
  -- can only appear if someone deletes through a path that bypasses it — which is exactly why it
  -- is measured rather than assumed impossible.)
  return query
    select 'orphan_mapping'::text, dg.resource_type, dg.resource_id, dg.grantee_user_id,
           dg.grantee_organization_id, 'mapping row has no iam.permissions row'::text
      from hr.derived_grant dg
     where not exists (select 1 from iam.permissions p where p.id = dg.permission_id);

  -- EXPIRY MISMATCH: the mapping and the grant disagree about when access ends. This is the
  -- quiet one — a grant that outlives its mapping's expiry is live access nobody meant to keep.
  return query
    select 'expiry_mismatch'::text, dg.resource_type, dg.resource_id, dg.grantee_user_id,
           dg.grantee_organization_id,
           format('mapping says %s, grant says %s', dg.expires_at, p.expires_at)
      from hr.derived_grant dg
      join iam.permissions p on p.id = dg.permission_id
     where p.expires_at is distinct from dg.expires_at;

  -- LEVEL MISMATCH: every derived grant is `viewer` by §2.1; anything else was changed elsewhere.
  return query
    select 'level_mismatch'::text, dg.resource_type, dg.resource_id, dg.grantee_user_id,
           dg.grantee_organization_id,
           format('mapping says %s, grant says %s', dg.permission_level, p.permission_level)
      from hr.derived_grant dg
      join iam.permissions p on p.id = dg.permission_id
     where p.permission_level::text is distinct from dg.permission_level;

  -- 🚨 EXTRA IS THE URGENT KIND — it means someone held access they were never granted: an
  -- hr_* grant with no mapping at all, which no derivation in this schema would ever produce.
  return query
    select 'extra'::text, p.resource_type, p.resource_id, p.granted_to_user_id,
           p.granted_to_organization_id,
           'iam.permissions row on an hr token with no hr.derived_grant mapping'::text
      from iam.permissions p
     where p.resource_type like 'hr\_%'
       and not exists (select 1 from hr.derived_grant dg where dg.permission_id = p.id);

  -- MISSING: derivation would produce a row that does not exist.
  return query
    select 'missing'::text, d.resource_type, d.resource_id, d.grantee_user_id,
           d.grantee_organization_id, 'derivation wants this grant and it is absent'::text
      from hr.employment em
      cross join lateral hr._desired_grants_for_employment(em.id, current_date) d
     where em.deleted_at is null
       and not exists (
         select 1 from iam.permissions p
          where p.resource_type = d.resource_type and p.resource_id = d.resource_id
            and p.granted_to_user_id is not distinct from d.grantee_user_id
            and p.granted_to_organization_id is not distinct from d.grantee_organization_id);
end
$fn$;

create or replace function hr.heal_grant_drift()
returns jsonb
language plpgsql security definer set search_path = hr, public
as $fn$
declare
  v_before jsonb; v_after jsonb; v_count int; v_sample jsonb; v_emps uuid[];
begin
  -- ---------- evidence FIRST: count, per-kind breakdown and a 25-row sample, captured before
  -- anything is touched. A heal that cannot say what it healed is a heal nobody can audit.
  select count(*)::int, jsonb_object_agg(kind, n)
    into v_count, v_before
    from (select kind, count(*)::int as n from hr.grant_drift() group by kind) s;
  v_count := coalesce(v_count, 0);
  select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) into v_sample
    from (select * from hr.grant_drift() limit 25) x;

  if v_count = 0 then
    return jsonb_build_object('drift', 0, 'healed', false);
  end if;

  -- ---------- re-derive
  select coalesce(array_agg(id), '{}'::uuid[]) into v_emps
    from hr.employment where deleted_at is null;
  perform hr.derive_grants_bulk(v_emps);

  -- ---------- re-measure to CONFIRM convergence rather than assume it
  select jsonb_object_agg(kind, n) into v_after
    from (select kind, count(*)::int as n from hr.grant_drift() group by kind) s;

  -- ---------- file the incident (RECORDED DECISION 5)
  if to_regclass('ops.system_error') is not null then
    begin
      execute $q$insert into ops.system_error (kind, message, context)
                 values ('hr_grant_drift_detected', $1, $2)$q$
        using format('HR derived-grant drift: %s rows', v_count),
              jsonb_build_object('before', coalesce(v_before,'{}'::jsonb),
                                 'after', coalesce(v_after,'{}'::jsonb),
                                 'sample', v_sample);
    exception when others then
      -- the incident lane must never be able to fail the heal
      null;
    end;
  end if;

  return jsonb_build_object('drift', v_count, 'healed', true,
                            'before', coalesce(v_before,'{}'::jsonb),
                            'after', coalesce(v_after,'{}'::jsonb), 'sample', v_sample);
end
$fn$;

-- §2.6: definer, REVOKE ALL FROM PUBLIC, EXECUTE to service_role only
do $$
declare f text;
begin
  foreach f in array ARRAY[
    'hr._reconcile_grants(text, uuid, date)',
    'hr.derive_grants_for_employment(uuid, date)',
    'hr.derive_grants_for_requisition(uuid, date)',
    'hr.derive_grants_for_actor(uuid, date)',
    'hr.derive_grants_bulk(uuid[], date)',
    'hr.derive_grants_due(interval)',
    'hr.grant_drift()',
    'hr.heal_grant_drift()'] loop
    execute format('revoke all on function %s from public', f);
    execute format('revoke all on function %s from anon', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

-- the super-admin mirror §2.6 asks for
create or replace function public.admin_heal_hr_grant_drift()
returns jsonb
language plpgsql security definer set search_path = public, hr
as $fn$
begin
  if not public.is_super_admin() then
    raise exception 'admin_heal_hr_grant_drift: super admin only' using errcode = '42501';
  end if;
  return hr.heal_grant_drift();
end
$fn$;

revoke all on function public.admin_heal_hr_grant_drift() from public;
revoke all on function public.admin_heal_hr_grant_drift() from anon;
grant execute on function public.admin_heal_hr_grant_drift() to authenticated, service_role;

-- ============================================================ §2.3 hr.access_explain
-- 🚨 THE ANTI-OVER-TIGHTENING INSTRUMENT. When someone says "I can't see my team", this answers it
-- in one call instead of a debugging session — and §9 T-25 asserts that every denial in T-3, T-5
-- and T-9 comes back with a SPECIFIC, human-readable reason, never "no access".
create or replace function hr.access_explain(p_user uuid, p_token text, p_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = hr, public
as $fn$
declare
  v_schema text; v_table text; v_org uuid; v_owner uuid; v_reasons jsonb := '[]'::jsonb;
  v_allowed boolean := false; d record; v_exists boolean;
begin
  select e.schema_name, e.table_name into v_schema, v_table
    from platform.entity_types e where e.token = p_token and e.is_active;
  if v_schema is null then
    raise exception 'hr.access_explain: unknown token %', p_token using errcode = '22023';
  end if;

  execute format('select organization_id, %s from %I.%I where id = $1',
                 case when exists (select 1 from information_schema.columns
                                    where table_schema = v_schema and table_name = v_table
                                      and column_name = 'created_by')
                      then 'created_by' else 'null::uuid' end,
                 v_schema, v_table)
     into v_org, v_owner using p_id;

  if v_org is null then
    return jsonb_build_object('allowed', false, 'token', p_token, 'id', p_id,
                              'reasons', jsonb_build_array(jsonb_build_object(
                                'lane','none','verdict','denied',
                                'why','no such row, or it carries no organization')));
  end if;

  -- ---- the owner lane
  if v_owner is not null and v_owner = p_user then
    v_allowed := true;
    v_reasons := v_reasons || jsonb_build_object('lane','owner','verdict','allowed',
      'why','created_by names this user — for a working-record or confidential row that means they are the SUBJECT (SPEC-ACCESS §3)');
  end if;

  -- ---- the org owner/admin arm (viewer only, and NOT present on a `restricted` variant)
  if public.is_org_admin_for(p_user, v_org) then
    if (select rls_variant from platform.entity_types where token = p_token) = 'restricted' then
      v_reasons := v_reasons || jsonb_build_object('lane','org_admin','verdict','denied',
        'why','this token is the `restricted` variant, which has no org lane at all — the platform''s otherwise-universal org-admin arm cannot reach it');
    else
      v_allowed := true;
      v_reasons := v_reasons || jsonb_build_object('lane','org_admin','verdict','allowed',
        'why','the kernel grants viewer to an org owner/admin on any non-restricted row in the org, regardless of visibility (§9 T-8b asserts this is INTENDED)');
    end if;
  end if;

  -- ---- derived grants, with the reason chain §2.3 promises
  for d in
    select dg.reason, dg.basis_kind, dg.basis_id, dg.expires_at, dg.permission_level,
           p.expires_at as perm_expires, p.granted_to_organization_id
      from hr.derived_grant dg
      join iam.permissions p on p.id = dg.permission_id
     where dg.resource_type = p_token and dg.resource_id = p_id
       and (dg.grantee_user_id = p_user
            or (dg.grantee_organization_id is not null
                and exists (select 1 from iam.organization_member om
                             where om.organization_id = dg.grantee_organization_id
                               and om.user_id = p_user)))
  loop
    if d.perm_expires is not null and d.perm_expires <= now() then
      -- §9 T-9 asserts this exact verdict for a terminated user the day after their expiry
      v_reasons := v_reasons || jsonb_build_object('lane','derived_grant','verdict','grant_expired',
        'reason', d.reason, 'basis_kind', d.basis_kind, 'basis_id', d.basis_id,
        'expired_at', d.perm_expires,
        'why', format('a %s grant existed and expired at %s; revocation is eager, so this needed no job to run', d.reason, d.perm_expires));
    else
      v_allowed := true;
      v_reasons := v_reasons || jsonb_build_object('lane','derived_grant','verdict','allowed',
        'reason', d.reason, 'basis_kind', d.basis_kind, 'basis_id', d.basis_id,
        'expires_at', d.perm_expires,
        'audience', case when d.granted_to_organization_id is not null then 'organization' else 'user' end);
    end if;
  end loop;

  -- ---- would derivation WANT a grant that is not there? (the "I can't see my team" case)
  if not v_allowed and p_token = 'hr_employment' then
    select exists (select 1 from hr._desired_grants_for_employment(p_id, current_date) x
                    where x.grantee_user_id = p_user) into v_exists;
    if v_exists then
      v_reasons := v_reasons || jsonb_build_object('lane','derivation','verdict','drift',
        'why','derivation says this user SHOULD hold a grant here and no grant exists — run hr.derive_grants_for_employment, and hr.grant_drift() will already be reporting it as `missing`');
    end if;
  end if;

  -- ---- the capability lane, for the audited doors
  if not v_allowed then
    v_reasons := v_reasons || jsonb_build_object('lane','capability','verdict','info',
      'working_record_read', hr.capability(p_user,'working_record.read', case when p_token='hr_employment' then p_id else null end),
      'comp_read', hr.capability(p_user,'comp.read'),
      'medical_read', hr.capability(p_user,'medical.read'),
      'incident_read', hr.capability(p_user,'incident.read'),
      'why','audited-tier reads never go through RLS at all — they go through the hr_confidential_* / hr_restricted_* doors, which gate on hr.capability() and never on iam.has_access');
  end if;

  if jsonb_array_length(v_reasons) = 0 then
    v_reasons := jsonb_build_array(jsonb_build_object('lane','none','verdict','denied',
      'why','no owner lane, no org-admin lane, no derived grant and no capability reaches this row'));
  end if;

  return jsonb_build_object('allowed', v_allowed, 'token', p_token, 'id', p_id,
                            'user', p_user, 'organization_id', v_org, 'reasons', v_reasons);
end
$fn$;

revoke all on function hr.access_explain(uuid, text, uuid) from public;
revoke all on function hr.access_explain(uuid, text, uuid) from anon;
grant execute on function hr.access_explain(uuid, text, uuid) to authenticated, service_role;

-- ============================================================ §2.4 the write-driven half
-- AFTER, FOR EACH ROW, calling the matching derive function SYNCHRONOUSLY. A manager who cannot
-- see their new team in the same session is a defect (§9 T-19), so there is no queue anywhere.
create or replace function hr._derive_on_employment() returns trigger
language plpgsql security definer set search_path = hr, public
as $fn$
begin
  perform hr.derive_grants_for_employment(coalesce(NEW.id, OLD.id));
  return null;
end
$fn$;

create or replace function hr._derive_on_position() returns trigger
language plpgsql security definer set search_path = hr, public
as $fn$
declare v_emp uuid; v_old_mgr uuid; v_new_mgr uuid; v_targets uuid[];
begin
  v_emp := coalesce(NEW.employment_id, OLD.employment_id);
  v_old_mgr := case when TG_OP <> 'INSERT' then OLD.manager_employment_id end;
  v_new_mgr := case when TG_OP <> 'DELETE' then NEW.manager_employment_id end;

  -- that employment AND every employment in the affected position subtree: a reorg that moves a
  -- whole department is one UPDATE and therefore one bounded cascade per affected employment.
  select coalesce(array_agg(distinct t), '{}'::uuid[]) into v_targets from (
    select v_emp as t
    union select s.employment_id from hr.position_subtree(v_emp, current_date) s
    union select s.employment_id from hr.position_subtree(coalesce(v_old_mgr, v_emp), current_date) s
    union select s.employment_id from hr.position_subtree(coalesce(v_new_mgr, v_emp), current_date) s
  ) x where t is not null;

  perform hr.derive_grants_bulk(v_targets);
  return null;
end
$fn$;

create or replace function hr._derive_on_role_assignment() returns trigger
language plpgsql security definer set search_path = hr, public
as $fn$
declare r hr.role_assignment%rowtype; v_targets uuid[];
begin
  r := coalesce(NEW, OLD);
  -- every employment in the population, AND the holder (authority to read implies their own
  -- record is re-derived too)
  select coalesce(array_agg(distinct em.id), '{}'::uuid[]) into v_targets
    from hr.employment em
   where em.organization_id = r.organization_id and em.deleted_at is null
     and (em.id = r.employment_id
          or hr.population_contains(r.scope_kind, r.scope_id, em.id, current_date,
                                    r.employment_id, r.scope_employment_ids));
  perform hr.derive_grants_bulk(v_targets);
  return null;
end
$fn$;

create or replace function hr._derive_on_authority() returns trigger
language plpgsql security definer set search_path = hr, public
as $fn$
declare a hr.approval_authority%rowtype;
begin
  a := coalesce(NEW, OLD);
  -- authority to approve implies reach to read what you approve
  if a.holder_kind = 'employment' then
    perform hr.derive_grants_for_employment(a.holder_id::uuid);
  elsif a.holder_kind = 'position' then
    perform hr.derive_grants_for_employment(
      (select pa.employment_id from hr.position_assignment pa where pa.id = a.holder_id::uuid));
  end if;
  return null;
end
$fn$;

create or replace function hr._derive_on_employee_login() returns trigger
language plpgsql security definer set search_path = hr, public
as $fn$
declare v_targets uuid[];
begin
  -- the login was linked or unlinked: every spell this person holds changes owner lane
  select coalesce(array_agg(id), '{}'::uuid[]) into v_targets
    from hr.employment where employee_id = NEW.id and deleted_at is null;
  perform hr.derive_grants_bulk(v_targets);
  return null;
end
$fn$;

create or replace function hr._derive_on_requisition() returns trigger
language plpgsql security definer set search_path = hr, public
as $fn$
begin
  perform hr.derive_grants_for_requisition(coalesce(NEW.id, OLD.id));
  return null;
end
$fn$;

create or replace function hr._derive_on_interview() returns trigger
language plpgsql security definer set search_path = hr, public
as $fn$
declare v_req uuid;
begin
  select o.requisition_id into v_req
    from hr.application a join hr.opening o on o.id = a.opening_id
   where a.id = coalesce(NEW.application_id, OLD.application_id);
  if v_req is not null then perform hr.derive_grants_for_requisition(v_req); end if;
  return null;
end
$fn$;

do $$ begin
  drop trigger if exists _zzz_derive_grants on hr.employment;
  create trigger _zzz_derive_grants after insert or delete or
    update of status, hire_date, termination_date, employee_id, deleted_at on hr.employment
    for each row execute function hr._derive_on_employment();

  drop trigger if exists _zzz_derive_grants on hr.position_assignment;
  create trigger _zzz_derive_grants after insert or delete or
    update of manager_employment_id, employment_id, department_id, location_id, crew_id,
              effective_from, effective_to, deleted_at on hr.position_assignment
    for each row execute function hr._derive_on_position();

  drop trigger if exists _zzz_derive_grants on hr.role_assignment;
  create trigger _zzz_derive_grants after insert or delete or update on hr.role_assignment
    for each row execute function hr._derive_on_role_assignment();

  drop trigger if exists _zzz_derive_grants on hr.approval_authority;
  create trigger _zzz_derive_grants after insert or delete or update on hr.approval_authority
    for each row execute function hr._derive_on_authority();

  drop trigger if exists _zzz_derive_grants on hr.employee;
  create trigger _zzz_derive_grants after update of login_user_id on hr.employee
    for each row execute function hr._derive_on_employee_login();

  drop trigger if exists _zzz_derive_grants on hr.requisition;
  create trigger _zzz_derive_grants after insert or delete or
    update of recruiter_employment_id, hiring_manager_employment_id, state, closed_at on hr.requisition
    for each row execute function hr._derive_on_requisition();

  drop trigger if exists _zzz_derive_grants on hr.interview;
  create trigger _zzz_derive_grants after insert or delete or
    update of interviewer_employment_ids, deleted_at on hr.interview
    for each row execute function hr._derive_on_interview();
end $$;

-- ============================================================ DDL guard acknowledgement
do $$
declare r record;
begin
  for r in select distinct object_ref from platform.ddl_guard_log
            where acknowledged_at is null and object_ref like 'hr.%'
              and rule = 'org_not_null_no_backstop' loop
    perform platform.ddl_guard_ack(
      p_reason => 'HR is org-explicit by the 2026-08-21 NO-NULL-ORG ruling; no assignment trigger by design (SPEC-DATA-MODEL 1.3)',
      p_by     => 'hr-domain-migration hr_c3_05',
      p_rule   => 'org_not_null_no_backstop',
      p_object_ref => r.object_ref);
  end loop;
end $$;

-- ============================================================ assertions
do $$
declare v_bad integer; v_rules text;
begin
  select count(*) into v_bad from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr'
     and p.proname in ('_employment_expiry','_desired_grants_for_employment',
                       '_desired_grants_for_requisition','_reconcile_grants',
                       'derive_grants_for_employment','derive_grants_for_requisition',
                       'derive_grants_for_actor','derive_grants_bulk','derive_grants_due',
                       'grant_drift','heal_grant_drift','access_explain');
  if v_bad <> 12 then
    raise exception 'hr_c3_05: expected 12 derivation functions, found %', v_bad;
  end if;

  -- §2.4: every watched table carries its trigger
  foreach v_rules in array ARRAY['employment','position_assignment','role_assignment',
                                 'approval_authority','employee','requisition','interview'] loop
    if not exists (select 1 from pg_trigger tg join pg_class c on c.oid = tg.tgrelid
                     join pg_namespace n on n.oid = c.relnamespace
                    where n.nspname = 'hr' and c.relname = v_rules
                      and tg.tgname = '_zzz_derive_grants') then
      raise exception 'hr_c3_05: hr.% is missing its derivation trigger', v_rules;
    end if;
  end loop;

  -- 🚨 NO CRON. The schedule is proposed in §2.6 and requires Arman's approval by name and
  -- interval before it may be created (no-unapproved-schedules). This asserts we created none.
  if to_regclass('cron.job') is not null then
    execute $q$select count(*) from cron.job where jobname like 'hr-grant%'$q$ into v_bad;
    if v_bad > 0 then
      raise exception 'hr_c3_05: % hr-grant cron job(s) exist and none was approved', v_bad;
    end if;
  end if;

  -- the whole schema still certifies
  select count(*) into v_bad from platform.entity_types e
   where e.schema_name = 'hr' and not iam.canonical_certify_ok(e.schema_name, e.table_name, e.token);
  if v_bad > 0 then
    raise exception 'hr_c3_05: % hr tokens no longer certify', v_bad;
  end if;

  select count(*), string_agg(distinct rule, ', ') into v_bad, v_rules
    from platform.ddl_guard_log where acknowledged_at is null and object_ref like 'hr.%';
  if v_bad > 0 then
    raise exception 'hr_c3_05: % unacked hr.%% DDL guard rows under rule(s): %', v_bad, v_rules;
  end if;
end $$;
