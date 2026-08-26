-- HR domain L1 — migration 1 of 6 (register item HRB-013, lane l1-employees).
--
-- THE WORKING-RECORD READ DOORS. hr_my_context, hr_directory_list, hr_org_chart,
-- hr_employee_profile, hr_employment_history, hr_pending_changes, hr_structure_list,
-- hr_knob_index — the `public.hr_*` surface SPEC-EMPLOYEES §2.2/§2.3/§2.4 and SPEC-UI-IA §3.2
-- render from.
--
-- Authority: SPEC-EMPLOYEES §1.3, §2.2 r10/r11, §2.3, §2.4, §5; SPEC-ACCESS §2, §3.1, §4.1;
-- SPEC-UI-IA §4.1, §4.2. Applied live as `hr_l1_01_working_record_doors`. Idempotent.
--
-- ===================================================================================
-- 🚨 RECORDED TECHNICAL DECISION 1 — THE "DIRECT" LANE HAD NO LANE.
--
-- SPEC-CONTRACTS §2.2's decision table routes every ordinary HR read and write "direct" —
-- `supabase-js` under RLS, `hr.org_chart_as_of()`, `hr.v_*_current` views, `.rpc('hr_wf_decide')`.
-- Verified live 2026-08-26 against `authenticator`'s `pgrst.db_schemas`: the exposed list is
--
--   api,public,graphql_public,rag,scraper,workflow,files,legal,knowledge,agent,ai,app,chat,
--   context,skill,tool,workspace,work,admin,billing,browser,canvas,code,communication,content_ir,
--   crm,dictionary,docproc,education,extend,graveyard,growth,hindsight,history,iam,interview,
--   marketing,meta,ops,pdf,plan,platform,podcast,research,runtime,scheduler,seo,transcripts,ui,
--   users,web,workbench,assignment,audit,batch
--
-- `hr` IS NOT IN IT, and neither is `esign`. FREEZE.md D-10 already recorded this for `esign` and
-- ruled that adding a schema to that list is a fleet-wide config change and NOT a build lane's
-- call — a dropped name is an instant platform-wide PGRST002 outage. The same fact is true of
-- `hr` and nobody had written it down.
--
-- CONSEQUENCE, and it is not small: a browser can call `public.hr_confidential_get` (it is in
-- `public`) and CANNOT read one row of `hr.employee`, cannot call `hr.org_chart_as_of`, cannot
-- call `hr.wf_decide`. Every "direct" row in §2.2's table that names an `hr.*` table or an
-- `hr.*` function is unreachable as written.
--
-- THIS LANE'S CALL: the direct lane stays direct — it is served by `public.hr_*` SECURITY DEFINER
-- doors in exactly the shape core C3 already established for the audited tier
-- (`hr_confidential_get`, `hr_restricted_get`, `hr_break_glass`). No aidream hop is added for
-- ordinary CRUD, so the workspace rule (clients never route DB reads/writes through the Python
-- server) still holds, and the audit stays inside the definer function where §2.1 wants it.
-- OWED, routed to the coordinator: SPEC-CONTRACTS §2.2 owes a mechanism column saying so, and
-- every sibling lane (L3 punches, L5 leave, L10 the inbox) needs the same doors for its own
-- tables — this file is the pattern, not the whole surface.
--
-- 🚨 RECORDED TECHNICAL DECISION 2 — THE SENSITIVITY RULE IS COMPUTED SERVER-SIDE.
--
-- SPEC-UI-IA §4.2 / SPEC-EMPLOYEES §1.3: a field the viewer cannot access is ABSENT FROM THE DOM.
-- A client that receives the full row and then hides fields has already leaked it to anyone with
-- devtools, so `hr_employee_profile` returns ONLY the keys this viewer may see, plus an explicit
-- `tabs` list and `sections` list. "Absent from the DOM" is therefore absent from the WIRE first;
-- the client's `<SensitiveField>` renders what it was given and can add nothing.
--
-- 🚨 RECORDED TECHNICAL DECISION 3 — THE DIRECTORY IS THE ONE SANCTIONED `current_*` CONSUMER.
--
-- SPEC-EMPLOYEES §1.2 / §5.1: `hr.employee.current_*` and `directory_status` exist so the LIST
-- avoids a lateral join per row, and no calculation may read them. `hr_directory_list` reads
-- them; `hr_employee_profile`'s header resolves `hr.employment_as_of` / `hr.primary_position_as_of`
-- and never touches them. The two functions are deliberately asymmetric and this is why.
-- ===================================================================================

set local statement_timeout = '600s';
set local lock_timeout = '20s';

-- ============================================================ shared helpers

-- The org membership fact, without assuming an HR standing. `hr.capability()` never consults org
-- role (SPEC-ACCESS §1.1); this is only used to decide whether an employer is VISIBLE to the
-- caller at all, and for the two places org standing is the gate by ruling (activation, D1).
create or replace function hr._l1_org_role(p_user uuid, p_org uuid)
returns text
language sql stable security definer set search_path = hr, public
as $fn$
  select m.role from iam.memberships m
   where m.user_id = p_user and m.organization_id = p_org
     and m.container_type = 'organization' and m.deleted_at is null
     and coalesce(m.status, 'active') = 'active'
   order by case m.role when 'owner' then 0 when 'admin' then 1 else 2 end
   limit 1;
$fn$;

-- Is the HR module on for this org? Absent, not disabled (R-L1 §D): with the module off the nav
-- item is absent and every door renders its absent state. An org that has an employer profile has
-- the module on unless it was explicitly turned off — a profile cannot exist without activation.
create or replace function hr._l1_module_enabled(p_org uuid)
returns boolean
language sql stable security definer set search_path = hr, public
as $fn$
  select coalesce(
    (select (o.settings #>> '{hr,module_enabled}')::boolean
       from iam.organizations o where o.id = p_org),
    exists (select 1 from hr.employer_profile ep
             where ep.organization_id = p_org and ep.deleted_at is null));
$fn$;

-- The caller's persona for one employer, derived from capabilities and never stored twice
-- (SPEC-UI-IA §2.2). hr_admin > manager > employee; a caller with no employment at all is null.
create or replace function hr._l1_persona(p_user uuid, p_org uuid, p_at date)
returns text
language plpgsql stable security definer set search_path = hr, public
as $fn$
declare v_mine uuid[]; v_has_emp boolean;
begin
  select array_agg(em.id) into v_mine
    from hr.employment em join hr.employee e on e.id = em.employee_id
   where e.login_user_id = p_user and em.organization_id = p_org and em.deleted_at is null;
  v_has_emp := coalesce(cardinality(v_mine), 0) > 0;

  if hr.capability(p_user, 'identity.write', null, p_at)
     or hr.capability(p_user, 'working_record.write', null, p_at) then
    return 'hr_admin';
  end if;
  if v_has_emp and exists (
    select 1 from hr.position_assignment pa
     where pa.manager_employment_id = any(v_mine) and pa.deleted_at is null
       and pa.effective_from <= p_at and (pa.effective_to is null or pa.effective_to >= p_at)) then
    return 'manager';
  end if;
  if v_has_emp then return 'employee'; end if;
  return null;
end
$fn$;

-- The capability set this caller actually holds in this employer, as a text[]. Nav visibility is
-- capability-driven, never role-string-driven (SPEC-UI-IA §2.2), so the client gets the set and
-- decides from it — it never re-derives a role name.
create or replace function hr._l1_capabilities(p_user uuid, p_org uuid, p_at date)
returns text[]
language sql stable security definer set search_path = hr, public
as $fn$
  select coalesce(array_agg(distinct c order by c), '{}'::text[])
    from (
      select unnest(role.capabilities) as c
        from hr.role_assignment ra
        join lateral (
          select ar.capabilities from hr.access_role ar
           where ar.role_key = ra.role_key and ar.deleted_at is null and ar.is_active
             and ar.organization_id in (ra.organization_id, '39c38960-d30c-4840-b0c1-c9960de95582'::uuid)
           order by (ar.organization_id = ra.organization_id) desc limit 1) role on true
       where ra.organization_id = p_org and ra.is_active and ra.revoked_at is null
         and ra.effective_from <= p_at and (ra.effective_to is null or ra.effective_to >= p_at)
         and ra.employment_id = any(hr.employments_of(p_user, p_at))
    ) s;
$fn$;

-- The caller's own employment in this employer as of a date, or null. Used by every self lane.
create or replace function hr._l1_self_employment(p_user uuid, p_org uuid, p_at date)
returns uuid
language sql stable security definer set search_path = hr, public
as $fn$
  select em.id from hr.employment em join hr.employee e on e.id = em.employee_id
   where e.login_user_id = p_user and em.organization_id = p_org and em.deleted_at is null
     and em.hire_date <= p_at
     and (em.termination_date is null or em.termination_date >= p_at)
   order by em.spell_number desc limit 1;
$fn$;

-- Is the viewer in this subject's management chain, inside the visibility depth knob?
create or replace function hr._l1_is_manager_of(p_user uuid, p_subject_employment uuid, p_at date)
returns boolean
language plpgsql stable security definer set search_path = hr, public
as $fn$
declare v_depth integer;
begin
  if p_subject_employment is null then return false; end if;
  v_depth := (hr._knob('hr.access','manager_visibility_depth') #>> '{}')::integer;
  return exists (select 1 from hr.manager_chain(p_subject_employment, p_at) mc
                  where mc.manager_employment_id = any(hr.employments_of(p_user, p_at))
                    and mc.depth <= v_depth);
end
$fn$;

-- The viewer relationship for one subject: 'self' | 'manager' | 'hr_admin' | 'org_admin' | 'none'.
-- ONE resolver, so §2.3.1's matrix is computed in exactly one place.
create or replace function hr._l1_viewer(p_user uuid, p_employee_id uuid, p_at date)
returns jsonb
language plpgsql stable security definer set search_path = hr, public
as $fn$
declare v_org uuid; v_login uuid; v_emp uuid; v_kind text; v_org_role text;
begin
  select e.organization_id, e.login_user_id into v_org, v_login
    from hr.employee e where e.id = p_employee_id and e.deleted_at is null;
  if v_org is null then return null; end if;

  v_emp := (hr.employment_as_of(p_employee_id, p_at)).id;
  v_org_role := hr._l1_org_role(p_user, v_org);

  if v_login is not null and v_login = p_user then
    v_kind := 'self';
  elsif hr.capability(p_user, 'identity.read', v_emp, p_at)
        or hr.capability(p_user, 'working_record.write', v_emp, p_at) then
    v_kind := 'hr_admin';
  elsif hr._l1_is_manager_of(p_user, v_emp, p_at) then
    v_kind := 'manager';
  elsif v_org_role in ('owner','admin') then
    -- SPEC-ACCESS §9 / EXECUTION §6 item 4, stated so nobody "fixes" it later: an org
    -- owner/admin CAN read the working employee record (directory + jobs). Never comp,
    -- never medical, never relations.
    v_kind := 'org_admin';
  elsif hr.capability(p_user, 'directory.read', v_emp, p_at) or v_org_role is not null then
    v_kind := 'peer';
  else
    v_kind := 'none';
  end if;

  return jsonb_build_object(
    'kind', v_kind, 'organization_id', v_org, 'subject_employment_id', v_emp,
    'subject_login_user_id', v_login,
    'caps', to_jsonb(hr._l1_capabilities(p_user, v_org, p_at)));
end
$fn$;

-- ============================================================ hr_my_context

-- The one call every /hr/* shell makes on mount: which employers this caller can open, which one
-- resolves, what persona and capability set they hold there, and whether the org is activated.
-- SPEC-UI-IA §1's resolution order (?org= -> active selection -> the single HR-enabled org ->
-- the picker as the page) is CLIENT logic; this returns the facts it needs and never picks.
create or replace function public.hr_my_context(p_organization_id uuid default null)
returns jsonb
language plpgsql stable security definer set search_path = public, hr
as $fn$
declare v_uid uuid := auth.uid(); v_today date := current_date; v_orgs jsonb; v_active jsonb; v_org uuid;
begin
  if v_uid is null then
    raise exception 'hr_my_context: no authenticated caller' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(x order by x ->> 'name'), '[]'::jsonb) into v_orgs from (
    select jsonb_build_object(
             'organization_id', o.id, 'name', o.name, 'slug', o.slug,
             'module_enabled', hr._l1_module_enabled(o.id),
             'is_activated', exists (select 1 from hr.employer_profile ep
                                      where ep.organization_id = o.id and ep.deleted_at is null),
             'org_role', hr._l1_org_role(v_uid, o.id),
             'persona', hr._l1_persona(v_uid, o.id, v_today)) as x
      from iam.organizations o
     where exists (select 1 from iam.memberships m
                    where m.user_id = v_uid and m.organization_id = o.id
                      and m.container_type = 'organization' and m.deleted_at is null
                      and coalesce(m.status,'active') = 'active')
       -- An owner/admin sees an org whose module is OFF, because they are the one person who
       -- can turn it on — R-L1 §D: "/hr?org=<thatOrg> renders a single enable-door for
       -- owner/admin and a plain not-enabled page for everyone else." Filtering them out here
       -- is how a freshly created org becomes unreachable and unactivatable.
       and (hr._l1_module_enabled(o.id)
            or hr._l1_org_role(v_uid, o.id) in ('owner','admin')
            or exists (select 1 from hr.employee e
                        where e.organization_id = o.id and e.login_user_id = v_uid
                          and e.deleted_at is null))
  ) s;

  v_org := p_organization_id;
  if v_org is null and jsonb_array_length(v_orgs) = 1 then
    v_org := (v_orgs -> 0 ->> 'organization_id')::uuid;
  end if;

  if v_org is not null then
    if not exists (select 1 from jsonb_array_elements(v_orgs) e
                    where (e ->> 'organization_id')::uuid = v_org) then
      -- not a member, or the module is off and they have no record: the employer is ABSENT,
      -- not refused. The client renders the picker, not a wall.
      v_org := null;
    end if;
  end if;

  if v_org is not null then
    v_active := jsonb_build_object(
      'organization_id', v_org,
      'module_enabled', hr._l1_module_enabled(v_org),
      'is_activated', exists (select 1 from hr.employer_profile ep
                               where ep.organization_id = v_org and ep.deleted_at is null),
      'org_role', hr._l1_org_role(v_uid, v_org),
      'persona', hr._l1_persona(v_uid, v_org, v_today),
      'capabilities', to_jsonb(hr._l1_capabilities(v_uid, v_org, v_today)),
      'employee_id', (select e.id from hr.employee e
                       where e.organization_id = v_org and e.login_user_id = v_uid
                         and e.deleted_at is null limit 1),
      'employment_id', hr._l1_self_employment(v_uid, v_org, v_today),
      'employee_count', (select count(*) from hr.employee e
                          where e.organization_id = v_org and e.deleted_at is null),
      'can_activate', coalesce(hr._l1_org_role(v_uid, v_org) in ('owner','admin'), false)
                      and not exists (select 1 from hr.role_assignment ra
                                       where ra.organization_id = v_org and ra.role_key = 'hr_owner'));
  end if;

  return jsonb_build_object('employers', v_orgs, 'active', v_active, 'as_of', v_today);
end
$fn$;

-- ============================================================ hr_directory_list

-- Route 10. One query, real pagination over the FULL result set (SPEC-EMPLOYEES §5.1 rule 1),
-- the only sanctioned reader of `current_*` (RECORDED DECISION 3), honouring directory_opt_out
-- by suppressing the ROW for peers (the grant suppression itself is core C3's).
create or replace function public.hr_directory_list(
  p_organization_id uuid,
  p_filter jsonb default '{}'::jsonb,
  p_limit int default 50,
  p_offset int default 0,
  p_sort text default 'display_name',
  p_direction text default 'asc')
returns jsonb
language plpgsql stable security definer set search_path = public, hr
as $fn$
declare
  v_uid uuid := auth.uid(); v_today date := current_date;
  v_persona text; v_caps text[]; v_mine uuid[]; v_total bigint; v_rows jsonb;
  v_search text; v_statuses text[]; v_manager uuid; v_sort text; v_dir text;
  v_shows_hire boolean; v_shows_mgr boolean; v_contractors boolean;
begin
  if v_uid is null then
    raise exception 'hr_directory_list: no authenticated caller' using errcode = '42501';
  end if;
  if hr._l1_org_role(v_uid, p_organization_id) is null
     and not exists (select 1 from hr.employee e
                      where e.organization_id = p_organization_id and e.login_user_id = v_uid
                        and e.deleted_at is null) then
    raise exception 'hr_directory_list: no standing in this employer' using errcode = '42501';
  end if;

  v_persona := hr._l1_persona(v_uid, p_organization_id, v_today);
  v_caps    := hr._l1_capabilities(v_uid, p_organization_id, v_today);
  v_mine    := hr.employments_of(v_uid, v_today);

  v_shows_hire := (hr._knob('hr.employees','directory_shows_hire_date') #>> '{}')::boolean;
  v_shows_mgr  := (hr._knob('hr.employees','directory_shows_manager') #>> '{}')::boolean;
  v_contractors := coalesce((hr._knob('hr.employees','contractor_directory_visible') #>> '{}')::boolean, true);

  v_search   := nullif(trim(coalesce(p_filter ->> 'search','')), '');
  v_manager  := nullif(p_filter ->> 'manager_employee_id','')::uuid;
  select coalesce(array_agg(value #>> '{}'), array['active','on_leave','prehire'])
    into v_statuses from jsonb_array_elements(coalesce(p_filter -> 'status', '[]'::jsonb))
   where jsonb_array_length(coalesce(p_filter -> 'status','[]'::jsonb)) > 0;
  if v_statuses is null then v_statuses := array['active','on_leave','prehire']; end if;

  v_sort := case when p_sort in ('display_name','hire_date','directory_status','employee_number')
                 then p_sort else 'display_name' end;
  v_dir  := case when lower(coalesce(p_direction,'asc')) = 'desc' then 'desc' else 'asc' end;

  -- ONE query: the scan is counted and paged from the same CTE, so `total` is the size of the
  -- FULL result set and never "showing first 100" (§5.1 rule 1). The sort is a CASE ladder over
  -- four clamped literal column names rather than dynamic SQL — a static plan a reviewer reads.
  with scoped as (
    select e.id                                as employee_id,
           e.current_employment_id             as employment_id,
           e.display_name, e.employee_number, e.work_email, e.work_phone,
           e.photo_file_id, e.directory_status,
           coalesce(pa.job_title_id, e.current_job_title_id)     as job_title_id,
           jt.title                                              as job_title,
           coalesce(pa.department_id, e.current_department_id)   as department_id,
           d.name                                                as department,
           coalesce(pa.location_id, e.primary_location_id)       as location_id,
           l.name                                                as location,
           l.tz                                                  as timezone,
           e.current_manager_employee_id       as manager_employee_id,
           case when v_shows_mgr then mgr.display_name end       as manager_name,
           pa.worker_class, pa.flsa_status, pa.schedule_class, pa.fte,
           case when v_shows_hire then em.hire_date end          as hire_date,
           e.custom
      from hr.employee e
      left join hr.employment em on em.id = e.current_employment_id and em.deleted_at is null
      left join hr.position_assignment pa
             on pa.id = e.current_position_assignment_id and pa.deleted_at is null
      left join hr.job_title jt on jt.id = coalesce(pa.job_title_id, e.current_job_title_id)
      left join hr.department d on d.id = coalesce(pa.department_id, e.current_department_id)
      left join hr.location  l on l.id = coalesce(pa.location_id, e.primary_location_id)
      left join hr.employee mgr on mgr.id = e.current_manager_employee_id
     where e.organization_id = p_organization_id
       and e.deleted_at is null
       and e.directory_status = any(v_statuses)
       and (v_contractors or coalesce(pa.worker_class,'employee') <> 'contractor')
       -- directory_opt_out suppresses the ROW for peers and never for HR or the subject
       and (not e.directory_opt_out or v_persona = 'hr_admin' or e.login_user_id = v_uid)
       and (v_search is null
            or e.display_name ilike '%' || v_search || '%'
            or coalesce(e.work_email,'') ilike '%' || v_search || '%'
            or coalesce(e.employee_number,'') ilike '%' || v_search || '%')
       and (v_manager is null or e.current_manager_employee_id = v_manager)
       and (nullif(p_filter ->> 'department_id','') is null
            or coalesce(pa.department_id, e.current_department_id) = (p_filter ->> 'department_id')::uuid)
       and (nullif(p_filter ->> 'location_id','') is null
            or coalesce(pa.location_id, e.primary_location_id) = (p_filter ->> 'location_id')::uuid)
       and (nullif(p_filter ->> 'job_title_id','') is null
            or coalesce(pa.job_title_id, e.current_job_title_id) = (p_filter ->> 'job_title_id')::uuid)
       and (nullif(p_filter ->> 'worker_class','') is null
            or pa.worker_class = p_filter ->> 'worker_class')
       and (nullif(p_filter ->> 'my_team','') is null
            or e.current_manager_employee_id in (
                 select em2.employee_id from hr.employment em2 where em2.id = any(v_mine)))
  ), ranked as (
    select s.*, row_number() over (
             order by
               case when v_dir = 'asc' then
                 case v_sort when 'display_name'     then s.display_name
                             when 'directory_status' then s.directory_status
                             when 'employee_number'  then s.employee_number end end asc nulls last,
               case when v_dir = 'desc' then
                 case v_sort when 'display_name'     then s.display_name
                             when 'directory_status' then s.directory_status
                             when 'employee_number'  then s.employee_number end end desc nulls last,
               case when v_sort = 'hire_date' and v_dir = 'asc'  then s.hire_date end asc  nulls last,
               case when v_sort = 'hire_date' and v_dir = 'desc' then s.hire_date end desc nulls last,
               s.display_name asc) as rn
      from scoped s)
  select (select count(*) from scoped),
         coalesce((select jsonb_agg(to_jsonb(r) - 'rn' order by r.rn) from ranked r
                    where r.rn >  greatest(coalesce(p_offset,0),0)
                      and r.rn <= greatest(coalesce(p_offset,0),0)
                                  + greatest(coalesce(p_limit,50),1)), '[]'::jsonb)
    into v_total, v_rows;

  return jsonb_build_object(
    'rows', v_rows, 'total', v_total,
    'limit', greatest(coalesce(p_limit,50),1), 'offset', greatest(coalesce(p_offset,0),0),
    'persona', v_persona, 'capabilities', to_jsonb(v_caps),
    'columns', jsonb_build_object('hire_date', v_shows_hire, 'manager', v_shows_mgr),
    'as_of', v_today);
end
$fn$;

-- ============================================================ hr_org_chart

-- Route 11 / §5.2. ONE call, one round trip, as of a date. Nobody is silently dropped: an
-- employment with no primary assignment or no manager on the date comes back in `unplaced`.
-- A cycle in the manager graph comes back named in `cycles` so the client renders a badge
-- instead of looping the layout for ever.
create or replace function public.hr_org_chart(
  p_organization_id uuid, p_on date default null)
returns jsonb
language plpgsql stable security definer set search_path = public, hr
as $fn$
declare
  v_uid uuid := auth.uid(); v_on date := coalesce(p_on, current_date);
  v_persona text; v_history boolean; v_nodes jsonb; v_unplaced jsonb; v_dotted jsonb;
  v_earliest date; v_cycles jsonb;
begin
  if v_uid is null then
    raise exception 'hr_org_chart: no authenticated caller' using errcode = '42501';
  end if;
  if hr._l1_org_role(v_uid, p_organization_id) is null then
    raise exception 'hr_org_chart: no standing in this employer' using errcode = '42501';
  end if;

  v_persona := hr._l1_persona(v_uid, p_organization_id, current_date);
  v_history := coalesce((hr._knob('hr.employees','org_chart_history_enabled') #>> '{}')::boolean, true);

  -- history is HR/manager only by default (§5.2 edges); an employee asking for a past date gets
  -- today, and the envelope says so rather than pretending.
  if v_on <> current_date and (not v_history or v_persona = 'employee') then
    v_on := current_date;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'employment_id', c.employment_id, 'employee_id', c.employee_id,
           'display_name', c.display_name, 'job_title_id', c.job_title_id,
           'job_title', jt.title, 'department_id', c.department_id, 'department', d.name,
           'location_id', c.location_id, 'location', l.name,
           'manager_employment_id', c.manager_employment_id, 'fte', c.fte,
           'worker_class', pa.worker_class,
           'photo_file_id', e.photo_file_id) order by c.display_name), '[]'::jsonb)
    into v_nodes
    from hr.org_chart_as_of(p_organization_id, v_on) c
    left join hr.job_title  jt on jt.id = c.job_title_id
    left join hr.department d  on d.id = c.department_id
    left join hr.location   l  on l.id = c.location_id
    left join hr.employee   e  on e.id = c.employee_id
    left join hr.position_assignment pa on pa.employment_id = c.employment_id
         and pa.is_primary and pa.deleted_at is null
         and pa.effective_from <= v_on and (pa.effective_to is null or pa.effective_to >= v_on);

  -- everyone employed on the date who is not a node, or who is a node with no manager
  select coalesce(jsonb_agg(jsonb_build_object(
           'employment_id', em.id, 'employee_id', e.id, 'display_name', e.display_name,
           'reason', case when pa.id is null then 'no_primary_assignment' else 'no_manager' end)
         order by e.display_name), '[]'::jsonb)
    into v_unplaced
    from hr.employment em
    join hr.employee e on e.id = em.employee_id
    left join hr.position_assignment pa on pa.employment_id = em.id and pa.is_primary
         and pa.deleted_at is null and pa.effective_from <= v_on
         and (pa.effective_to is null or pa.effective_to >= v_on)
   where em.organization_id = p_organization_id and em.deleted_at is null
     and em.hire_date <= v_on
     and (em.termination_date is null or em.termination_date >= v_on)
     and (pa.id is null or pa.manager_employment_id is null);

  select coalesce(jsonb_agg(jsonb_build_object(
           'employment_id', rl.employment_id, 'manager_employment_id', rl.manager_employment_id,
           'line_kind', rl.line_kind, 'scope_note', rl.scope_note) order by rl.line_kind), '[]'::jsonb)
    into v_dotted
    from hr.reporting_line rl
   where rl.organization_id = p_organization_id and rl.deleted_at is null
     and rl.effective_from <= v_on and (rl.effective_to is null or rl.effective_to >= v_on);

  select min(em.hire_date) into v_earliest from hr.employment em
   where em.organization_id = p_organization_id and em.deleted_at is null;

  -- A→B→A is reachable through concurrent secondary assignments. Name it; never loop.
  with recursive edges as (
    select (n ->> 'employment_id')::uuid as child, (n ->> 'manager_employment_id')::uuid as parent
      from jsonb_array_elements(v_nodes) n
     where n ->> 'manager_employment_id' is not null),
  walk as (
    select child as root, parent as at, 1 as depth from edges
    union all
    select w.root, e.parent, w.depth + 1 from walk w join edges e on e.child = w.at
     where w.depth < 25)
  select coalesce(jsonb_agg(distinct to_jsonb(root)), '[]'::jsonb) into v_cycles
    from walk where at = root;

  return jsonb_build_object(
    'as_of', v_on, 'requested_on', coalesce(p_on, current_date),
    'history_available', v_history and v_persona <> 'employee',
    'earliest_known_on', v_earliest,
    'nodes', v_nodes, 'unplaced', v_unplaced, 'dotted_lines', v_dotted,
    'cycles', v_cycles, 'persona', v_persona);
end
$fn$;

-- ============================================================ hr_employee_profile

-- Routes 13/14 and route 2 (/hr/me is this function with the caller's own employee id).
-- §1.3 IS ENFORCED HERE: the returned object contains only the tabs and only the fields this
-- viewer may see. There is nothing on the wire for a client to leak.
create or replace function public.hr_employee_profile(
  p_employee_id uuid, p_as_of date default null)
returns jsonb
language plpgsql stable security definer set search_path = public, hr
as $fn$
declare
  v_uid uuid := auth.uid(); v_on date := coalesce(p_as_of, current_date);
  v_v jsonb; v_kind text; v_org uuid; v_emp uuid; v_e hr.employee%rowtype;
  v_em hr.employment%rowtype; v_pa hr.position_assignment%rowtype;
  v_tabs text[] := '{}'; v_header jsonb; v_personal jsonb; v_worker_class text;
  v_comp_mgr text; v_pending int; v_priv jsonb;
begin
  if v_uid is null then
    raise exception 'hr_employee_profile: no authenticated caller' using errcode = '42501';
  end if;

  v_v := hr._l1_viewer(v_uid, p_employee_id, v_on);
  if v_v is null then
    -- the record does not exist, or is deleted. Never leak which (§2 universal no-access state).
    return jsonb_build_object('granted', false, 'reason', 'not_reachable');
  end if;
  v_kind := v_v ->> 'kind';
  v_org  := (v_v ->> 'organization_id')::uuid;
  v_emp  := nullif(v_v ->> 'subject_employment_id','')::uuid;

  if v_kind = 'none' then
    perform hr._record_access_audit(
      p_organization_id => v_org, p_action => 'denied', p_target_token => 'hr_employee',
      p_purpose => 'profile', p_basis => 'refused', p_granted => false,
      p_target_ids => ARRAY[p_employee_id], p_row_count => 0,
      p_sensitivity_tier => 'internal', p_subject_employment_id => v_emp,
      p_denial_reason => 'no_lane');
    return jsonb_build_object('granted', false, 'reason', 'not_reachable');
  end if;

  select * into v_e from hr.employee where id = p_employee_id;
  select * into v_em from hr.employment_as_of(p_employee_id, v_on);
  if v_em.id is not null then
    select * into v_pa from hr.primary_position_as_of(v_em.id, v_on);
  end if;
  v_worker_class := v_pa.worker_class;

  -- ---------------------------------------------------------------- the tab set (§2.3.1)
  -- Every tab below is present ONLY when this viewer has at least one accessible field in it.
  v_tabs := v_tabs || 'personal';
  v_tabs := v_tabs || 'job';

  if v_kind = 'self' or hr.capability(v_uid, 'comp.read', v_emp, v_on) then
    v_tabs := v_tabs || 'compensation';
  elsif v_kind = 'manager' then
    v_comp_mgr := hr._knob('hr.access','comp_visibility_for_managers') #>> '{}';
    if v_comp_mgr = 'band_only' then v_tabs := v_tabs || 'compensation'; end if;
  end if;

  -- The four hosted tabs (§2.3.9) are owned by sibling pillars. They are offered when the
  -- viewer has a working-record lane AND the worker class actually has that machinery (§1.4) —
  -- a contractor has no Time off tab at all, and nothing says why.
  if v_kind in ('self','manager','hr_admin','org_admin') then
    if coalesce(v_worker_class,'employee') <> 'contractor' then
      v_tabs := v_tabs || 'time-off';
    end if;
    v_tabs := v_tabs || 'time';
    v_tabs := v_tabs || 'training';
  end if;
  if v_kind in ('self','manager','hr_admin') then
    v_tabs := v_tabs || 'performance';
  end if;

  if v_kind in ('self','hr_admin') then
    v_tabs := v_tabs || 'emergency';
    v_tabs := v_tabs || 'documents';
  end if;
  if v_kind in ('manager','hr_admin') then
    v_tabs := v_tabs || 'notes';
  end if;
  if hr.capability(v_uid, 'incident.read', v_emp, v_on)
     or hr.capability(v_uid, 'corrective_action.issue', v_emp, v_on) then
    v_tabs := v_tabs || 'relations';
  end if;

  -- ---------------------------------------------------------------- the header (§2.3.0)
  -- Status resolves from hr.employment_as_of, NEVER from directory_status.
  select count(*) into v_pending from (
    select 1 from hr.position_assignment pa where pa.employment_id = v_em.id
       and pa.deleted_at is null and pa.effective_from > v_on
    union all
    select 1 from hr.compensation c where c.employment_id = v_em.id
       and c.deleted_at is null and c.effective_from > v_on
       and (v_kind = 'self' or hr.capability(v_uid, 'comp.read', v_emp, v_on))
    union all
    select 1 from hr.reporting_line rl where rl.employment_id = v_em.id
       and rl.deleted_at is null and rl.effective_from > v_on) p;

  v_header := jsonb_build_object(
    'employee_id', v_e.id, 'employment_id', v_em.id,
    'display_name', v_e.display_name,
    'legal_name', case when v_kind in ('self','hr_admin')
                       then trim(concat_ws(' ', v_e.legal_first_name, v_e.legal_middle_name,
                                                v_e.legal_last_name, v_e.legal_name_suffix)) end,
    'pronouns', v_e.pronouns,
    'photo_file_id', v_e.photo_file_id,
    'employee_number', v_e.employee_number,
    'party_id', v_e.party_id,
    'login_user_id', case when v_kind in ('self','hr_admin') then v_e.login_user_id end,
    'status', v_em.status,
    'spell_number', v_em.spell_number,
    'hire_date', v_em.hire_date,
    'worker_class', v_worker_class,
    'job_title_id', v_pa.job_title_id,
    'job_title', (select title from hr.job_title where id = v_pa.job_title_id),
    'department_id', v_pa.department_id,
    'department', (select name from hr.department where id = v_pa.department_id),
    'location_id', v_pa.location_id,
    'location', (select name from hr.location where id = v_pa.location_id),
    'manager_employment_id', v_pa.manager_employment_id,
    'manager_employee_id', (select em2.employee_id from hr.employment em2
                             where em2.id = v_pa.manager_employment_id),
    'manager_name', (select e2.display_name from hr.employment em2
                       join hr.employee e2 on e2.id = em2.employee_id
                      where em2.id = v_pa.manager_employment_id),
    'direct_report_count', (select count(*) from hr.position_assignment pa2
                             where pa2.manager_employment_id = v_em.id and pa2.is_primary
                               and pa2.deleted_at is null and pa2.effective_from <= v_on
                               and (pa2.effective_to is null or pa2.effective_to >= v_on)),
    'pending_change_count', v_pending);

  -- ---------------------------------------------------------------- the Personal tab
  -- Directory fields are on hr.employee. The Confidential half lives on hr.employee_private and
  -- is reached through the AUDITED door, never read here — so a manager's payload does not
  -- contain it and a self/HR payload carries an audit row for having looked.
  v_personal := jsonb_build_object(
    'preferred_first_name', v_e.preferred_first_name,
    'preferred_last_name', v_e.preferred_last_name,
    'pronouns', v_e.pronouns,
    'work_email', v_e.work_email,
    'work_phone', v_e.work_phone,
    'directory_opt_out', v_e.directory_opt_out,
    'photo_file_id', v_e.photo_file_id,
    'custom', case when v_kind in ('self','hr_admin') then v_e.custom else null end);

  if v_kind in ('self','hr_admin') then
    v_personal := v_personal || jsonb_build_object(
      'legal_first_name', v_e.legal_first_name,
      'legal_middle_name', v_e.legal_middle_name,
      'legal_last_name', v_e.legal_last_name,
      'legal_name_suffix', v_e.legal_name_suffix,
      'former_names', v_e.former_names);

    -- one audited confidential read for the private block; SSN comes back as last-4 only and
    -- the ciphertext columns are client-excluded, so there is nothing to strip client-side.
    select hr._door_get('hr_employee_private',
                        (select ep.id from hr.employee_private ep
                          where ep.employee_id = p_employee_id and ep.deleted_at is null limit 1),
                        'profile', null, false, 'confidential')
      into v_priv;
    if coalesce((v_priv ->> 'granted')::boolean, false) then
      v_personal := v_personal || jsonb_build_object(
        'private', (v_priv -> 'row') - 'ssn_ciphertext' - 'ssn_key_id' - 'ssn_hmac'
                                     - 'national_id_ciphertext',
        'private_audit_id', v_priv ->> 'audit_id');
    else
      -- not collected vs not reachable are different facts and the UI says different things
      v_personal := v_personal || jsonb_build_object(
        'private', null,
        'private_state', case when exists (select 1 from hr.employee_private ep
                                            where ep.employee_id = p_employee_id
                                              and ep.deleted_at is null)
                              then 'not_reachable' else 'not_collected' end);
    end if;
  end if;

  return jsonb_build_object(
    'granted', true,
    'as_of', v_on,
    'viewer', v_kind,
    'capabilities', v_v -> 'caps',
    'organization_id', v_org,
    'tabs', to_jsonb(v_tabs),
    'header', v_header,
    'personal', v_personal,
    'comp_visibility', coalesce(v_comp_mgr,
      case when v_kind = 'self' or hr.capability(v_uid,'comp.read', v_emp, v_on)
           then 'full' else 'none' end),
    'worker_class_machinery', jsonb_build_object(
      'i9',        coalesce(v_worker_class,'employee') <> 'contractor',
      'w4',        coalesce(v_worker_class,'employee') not in ('contractor','volunteer'),
      'pto',       coalesce(v_worker_class,'employee') not in ('contractor','volunteer'),
      'overtime',  coalesce(v_worker_class,'employee') not in ('contractor','volunteer')
                   and coalesce(v_pa.flsa_status,'nonexempt') = 'nonexempt',
      'payroll',   coalesce(v_worker_class,'employee') not in ('contractor','volunteer')));
end
$fn$;

-- ============================================================ hr_employment_history

-- The Job & reporting tab (§2.3.3): every spell, every assignment ordered effective_from desc,
-- the dotted lines, the external ids, the engagement where the class is contractor — plus the
-- SYSTEM-TIME line (§6.4) with the actor taxonomy resolved, because "changed by user" is
-- insufficient.
create or replace function public.hr_employment_history(p_employee_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public, hr
as $fn$
declare v_uid uuid := auth.uid(); v_v jsonb; v_kind text; v_on date := current_date;
begin
  if v_uid is null then
    raise exception 'hr_employment_history: no authenticated caller' using errcode = '42501';
  end if;
  v_v := hr._l1_viewer(v_uid, p_employee_id, v_on);
  if v_v is null or (v_v ->> 'kind') in ('none') then
    return jsonb_build_object('granted', false, 'reason', 'not_reachable');
  end if;
  v_kind := v_v ->> 'kind';
  if v_kind = 'peer' then
    return jsonb_build_object('granted', false, 'reason', 'not_reachable');
  end if;

  return jsonb_build_object(
    'granted', true,
    'spells', (select coalesce(jsonb_agg(jsonb_build_object(
        'employment_id', em.id, 'spell_number', em.spell_number, 'status', em.status,
        'hire_date', em.hire_date, 'original_hire_date', em.original_hire_date,
        'adjusted_service_date', em.adjusted_service_date,
        'probation_end_date', em.probation_end_date,
        'last_day_worked', em.last_day_worked, 'termination_date', em.termination_date,
        'is_rehire', em.is_rehire, 'prior_employment_id', em.prior_employment_id,
        'pay_group_id', em.pay_group_id,
        'employer_profile_id', em.employer_profile_id,
        'separation_id', case when v_kind = 'hr_admin' then em.separation_id end
      ) order by em.spell_number desc), '[]'::jsonb)
      from hr.employment em where em.employee_id = p_employee_id and em.deleted_at is null),
    'assignments', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', pa.id, 'employment_id', pa.employment_id,
        'job_title_id', pa.job_title_id, 'job_title', jt.title,
        'department_id', pa.department_id, 'department', d.name,
        'location_id', pa.location_id, 'location', l.name, 'timezone', l.tz,
        'jurisdiction_id', l.jurisdiction_id,
        'manager_employment_id', pa.manager_employment_id,
        'manager_name', mgr.display_name,
        'is_primary', pa.is_primary, 'worker_class', pa.worker_class,
        'flsa_status', pa.flsa_status, 'flsa_exemption_basis', pa.flsa_exemption_basis,
        'pay_basis', pa.pay_basis, 'schedule_class', pa.schedule_class,
        'fte', pa.fte, 'standard_hours_per_week', pa.standard_hours_per_week,
        'is_supervisor', pa.is_supervisor, 'cost_center', pa.cost_center,
        'eeo1_job_category', pa.eeo1_job_category,
        'effective_from', pa.effective_from, 'effective_to', pa.effective_to,
        'supersedes_id', pa.supersedes_id,
        'change_reason', cat.name,
        'recorded_at', pa.recorded_at,
        'recorded_by', act.display_name,
        'actor_type', coalesce(pa.metadata ->> 'actor_type', 'hr_admin'),
        'workflow_instance_id', pa.metadata ->> 'workflow_instance_id',
        'is_pending', pa.effective_from > v_on
      ) order by pa.effective_from desc, pa.recorded_at desc), '[]'::jsonb)
      from hr.position_assignment pa
      join hr.employment em on em.id = pa.employment_id and em.employee_id = p_employee_id
      left join hr.job_title jt on jt.id = pa.job_title_id
      left join hr.department d on d.id = pa.department_id
      left join hr.location l on l.id = pa.location_id
      left join hr.employment mem on mem.id = pa.manager_employment_id
      left join hr.employee mgr on mgr.id = mem.employee_id
      left join platform.categories cat on cat.id = pa.change_reason_category_id
      left join hr.employee act on act.login_user_id = pa.created_by
                               and act.organization_id = em.organization_id
     where pa.deleted_at is null),
    'reporting_lines', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', rl.id, 'employment_id', rl.employment_id,
        'manager_employment_id', rl.manager_employment_id, 'line_kind', rl.line_kind,
        'scope_note', rl.scope_note, 'effective_from', rl.effective_from,
        'effective_to', rl.effective_to, 'is_pending', rl.effective_from > v_on)
      order by rl.effective_from desc), '[]'::jsonb)
      from hr.reporting_line rl
      join hr.employment em on em.id = rl.employment_id and em.employee_id = p_employee_id
     where rl.deleted_at is null),
    'external_identities', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', xi.id, 'system_key', xi.system_key, 'external_id', xi.external_id,
        'external_url', xi.external_url, 'synced_at', xi.synced_at) order by xi.system_key), '[]'::jsonb)
      from hr.external_identity xi
     where xi.employee_id = p_employee_id and xi.deleted_at is null),
    'engagements', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', g.id, 'employment_id', g.employment_id,
        'platform_of_record', g.platform_of_record,
        'platform_external_id', g.platform_external_id, 'platform_url', g.platform_url,
        'engagement_terms', g.engagement_terms, 'starts_on', g.starts_on, 'ends_on', g.ends_on,
        'auto_renew', g.auto_renew, 'status', g.status,
        'sow_file_id', g.sow_file_id, 'w9_file_id', g.w9_file_id,
        'agreement_file_id', g.agreement_file_id) order by g.starts_on desc), '[]'::jsonb)
      from hr.engagement g
      join hr.employment em on em.id = g.employment_id and em.employee_id = p_employee_id
     where g.deleted_at is null));
end
$fn$;

-- ============================================================ hr_pending_changes

-- §6.2's pending panel: every future-dated row across position, compensation and reporting line
-- for this employment, with what changes from what to what, who requested it, its approval state
-- and — for anything still in flight — its current approver.
create or replace function public.hr_pending_changes(p_employment_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public, hr
as $fn$
declare
  v_uid uuid := auth.uid(); v_on date := current_date; v_emp_id uuid; v_v jsonb; v_kind text;
  v_comp boolean;
begin
  if v_uid is null then
    raise exception 'hr_pending_changes: no authenticated caller' using errcode = '42501';
  end if;
  select em.employee_id into v_emp_id from hr.employment em where em.id = p_employment_id;
  if v_emp_id is null then
    return jsonb_build_object('granted', false, 'reason', 'not_reachable');
  end if;
  v_v := hr._l1_viewer(v_uid, v_emp_id, v_on);
  v_kind := coalesce(v_v ->> 'kind', 'none');
  if v_kind in ('none','peer') then
    return jsonb_build_object('granted', false, 'reason', 'not_reachable');
  end if;
  v_comp := v_kind = 'self' or hr.capability(v_uid, 'comp.read', p_employment_id, v_on);

  return jsonb_build_object(
    'granted', true,
    'positions', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', pa.id, 'kind', 'position', 'effective_from', pa.effective_from,
        'job_title', jt.title, 'department', d.name, 'location', l.name,
        'manager_employment_id', pa.manager_employment_id,
        'fte', pa.fte, 'worker_class', pa.worker_class, 'flsa_status', pa.flsa_status,
        'change_reason', cat.name,
        'supersedes_id', pa.supersedes_id,
        'requested_by', req.display_name,
        'can_cancel', true) order by pa.effective_from), '[]'::jsonb)
      from hr.position_assignment pa
      left join hr.job_title jt on jt.id = pa.job_title_id
      left join hr.department d on d.id = pa.department_id
      left join hr.location l on l.id = pa.location_id
      left join platform.categories cat on cat.id = pa.change_reason_category_id
      left join hr.employee req on req.login_user_id = pa.created_by
     where pa.employment_id = p_employment_id and pa.deleted_at is null
       and pa.effective_from > v_on),
    'compensation', case when v_comp then (select coalesce(jsonb_agg(jsonb_build_object(
        'id', c.id, 'kind', 'compensation', 'effective_from', c.effective_from,
        'component_kind', c.component_kind, 'amount', c.amount, 'currency', c.currency,
        'per_unit', c.per_unit, 'pay_basis', c.pay_basis,
        'change_reason', cat.name, 'approved_at', c.approved_at,
        'can_cancel', true) order by c.effective_from), '[]'::jsonb)
      from hr.compensation c
      left join platform.categories cat on cat.id = c.change_reason_category_id
     where c.employment_id = p_employment_id and c.deleted_at is null
       and c.effective_from > v_on) else '[]'::jsonb end,
    'reporting_lines', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', rl.id, 'kind', 'reporting_line', 'effective_from', rl.effective_from,
        'line_kind', rl.line_kind, 'manager_employment_id', rl.manager_employment_id,
        'can_cancel', true) order by rl.effective_from), '[]'::jsonb)
      from hr.reporting_line rl
     where rl.employment_id = p_employment_id and rl.deleted_at is null
       and rl.effective_from > v_on),
    'in_flight', (select coalesce(jsonb_agg(jsonb_build_object(
        'instance_id', wi.id, 'flow_key', wi.flow_key, 'state', wi.state,
        'target_token', wi.target_token, 'target_id', wi.target_id,
        'submitted_at', wi.submitted_at, 'due_at', wi.due_at,
        'payload', case when v_comp or wi.flow_key <> 'pay_change' then wi.payload end,
        'current_step', (select ws.step_key from hr.workflow_step ws
                          where ws.workflow_instance_id = wi.id and ws.state = 'active'
                          order by ws.step_order limit 1))
      order by wi.created_at desc), '[]'::jsonb)
      from hr.workflow_instance wi
     where wi.subject_employment_id = p_employment_id
       and wi.state in ('draft','submitted','in_review','conflict')
       and wi.deleted_at is null));
end
$fn$;

-- ============================================================ hr_structure_list

-- Routes 68–72's read half, and every picker on route 12 / the Job tab. One call so a form does
-- not make seven.
create or replace function public.hr_structure_list(p_organization_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public, hr
as $fn$
declare v_uid uuid := auth.uid(); v_admin boolean;
begin
  if v_uid is null then
    raise exception 'hr_structure_list: no authenticated caller' using errcode = '42501';
  end if;
  if hr._l1_org_role(v_uid, p_organization_id) is null then
    raise exception 'hr_structure_list: no standing in this employer' using errcode = '42501';
  end if;
  v_admin := hr.capability(v_uid, 'identity.write', null, current_date)
             or hr._l1_org_role(v_uid, p_organization_id) in ('owner','admin');

  return jsonb_build_object(
    'is_admin', v_admin,
    'departments', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', d.id, 'name', d.name, 'code', d.code, 'parent_department_id', d.parent_department_id,
        'head_employment_id', d.head_employment_id, 'cost_center', d.cost_center,
        'is_active', d.is_active,
        'assignment_count', (select count(*) from hr.position_assignment pa
                              where pa.department_id = d.id and pa.deleted_at is null
                                and (pa.effective_to is null or pa.effective_to >= current_date)))
      order by d.name), '[]'::jsonb)
      from hr.department d where d.organization_id = p_organization_id and d.deleted_at is null),
    'locations', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', l.id, 'name', l.name, 'code', l.code, 'address', l.address, 'tz', l.tz,
        'jurisdiction_id', l.jurisdiction_id, 'jurisdiction_key', j.key,
        'jurisdiction_name', j.name,
        'establishment_id', l.establishment_id, 'is_remote', l.is_remote,
        'geo_lat', l.geo_lat, 'geo_lng', l.geo_lng, 'geofence_radius_m', l.geofence_radius_m,
        'is_active', l.is_active,
        'assignment_count', (select count(*) from hr.position_assignment pa
                              where pa.location_id = l.id and pa.deleted_at is null
                                and (pa.effective_to is null or pa.effective_to >= current_date)))
      order by l.name), '[]'::jsonb)
      from hr.location l
      left join hr.jurisdiction j on j.id = l.jurisdiction_id
     where l.organization_id = p_organization_id and l.deleted_at is null),
    'job_titles', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', t.id, 'title', t.title, 'code', t.code, 'job_family', t.job_family,
        'job_level', t.job_level, 'grade', t.grade, 'eeo1_job_category', t.eeo1_job_category,
        'default_flsa_status', t.default_flsa_status, 'default_pay_basis', t.default_pay_basis,
        'pay_range_min', case when v_admin or hr.capability(v_uid,'comp.read',null,current_date)
                              then t.pay_range_min end,
        'pay_range_max', case when v_admin or hr.capability(v_uid,'comp.read',null,current_date)
                              then t.pay_range_max end,
        'is_supervisor', t.is_supervisor, 'is_active', t.is_active,
        'assignment_count', (select count(*) from hr.position_assignment pa
                              where pa.job_title_id = t.id and pa.deleted_at is null
                                and (pa.effective_to is null or pa.effective_to >= current_date)))
      order by t.title), '[]'::jsonb)
      from hr.job_title t where t.organization_id = p_organization_id and t.deleted_at is null),
    'pay_groups', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', pg.id, 'name', pg.name, 'pay_frequency', pg.pay_frequency,
        'first_period_start_on', pg.first_period_start_on, 'pay_date_rule', pg.pay_date_rule,
        'workweek_start_dow', pg.workweek_start_dow, 'workweek_start_time', pg.workweek_start_time,
        'workweek_effective_from', pg.workweek_effective_from,
        'holiday_calendar_id', pg.holiday_calendar_id,
        'default_earning_code_id', pg.default_earning_code_id,
        'timesheet_required', pg.timesheet_required, 'is_active', pg.is_active)
      order by pg.name), '[]'::jsonb)
      from hr.pay_group pg where pg.organization_id = p_organization_id and pg.deleted_at is null),
    'holiday_calendars', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', hc.id, 'name', hc.name, 'jurisdiction_id', hc.jurisdiction_id,
        'is_default', hc.is_default,
        'holiday_pay_counts_toward_ot', hc.holiday_pay_counts_toward_ot,
        'holidays', (select coalesce(jsonb_agg(jsonb_build_object(
            'id', h.id, 'name', h.name, 'observed_on', h.observed_on, 'actual_on', h.actual_on,
            'is_paid', h.is_paid, 'earning_code_id', h.earning_code_id,
            'applies_to_schedule_class', h.applies_to_schedule_class,
            'location_ids', h.location_ids) order by h.observed_on), '[]'::jsonb)
          from hr.holiday h where h.holiday_calendar_id = hc.id and h.deleted_at is null))
      order by hc.name), '[]'::jsonb)
      from hr.holiday_calendar hc
     where hc.organization_id = p_organization_id and hc.deleted_at is null),
    'earning_codes', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', ec.id, 'code', ec.code, 'name', ec.name, 'hours_category', ec.hours_category,
        'is_overtime', ec.is_overtime, 'multiplier', ec.multiplier, 'flat_amount', ec.flat_amount,
        'counts_toward_ot', ec.counts_toward_ot,
        'counts_toward_hours_of_service', ec.counts_toward_hours_of_service,
        'counts_toward_sick_accrual', ec.counts_toward_sick_accrual,
        'is_statutory_premium', ec.is_statutory_premium,
        'external_code_map', ec.external_code_map,
        'is_seeded', ec.is_seeded, 'is_active', ec.is_active) order by ec.code), '[]'::jsonb)
      from hr.earning_code ec
     where ec.organization_id = p_organization_id and ec.deleted_at is null),
    'deduction_codes', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', dc.id, 'code', dc.code, 'name', dc.name, 'deduction_kind', dc.deduction_kind,
        'provider_ref', dc.provider_ref, 'external_code_map', dc.external_code_map,
        'is_active', dc.is_active) order by dc.code), '[]'::jsonb)
      from hr.deduction_code dc
     where dc.organization_id = p_organization_id and dc.deleted_at is null),
    'establishments', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', es.id, 'name', es.name, 'address', es.address,
        'jurisdiction_id', es.jurisdiction_id, 'naics_code', es.naics_code,
        'eeo1_establishment_id', es.eeo1_establishment_id,
        'is_headquarters', es.is_headquarters,
        'osha_establishment_name', es.osha_establishment_name,
        'annual_average_employees', es.annual_average_employees,
        'total_hours_worked', es.total_hours_worked) order by es.name), '[]'::jsonb)
      from hr.establishment es
     where es.organization_id = p_organization_id and es.deleted_at is null),
    'jurisdictions', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', j.id, 'jurisdiction_key', j.key, 'name', j.name, 'level', j.level)
      order by j.key), '[]'::jsonb)
      from hr.jurisdiction j where j.deleted_at is null and j.is_active));
end
$fn$;

-- ============================================================ hr_knob_index

-- Route 67. A searchable index of EVERY configuration key with its effective value and its
-- ORIGIN. §10's edge is load-bearing: a key with a missing platform knob RAISES rather than
-- defaulting, because a silent fallback is how a knob becomes a constant — so this function
-- reports `origin = 'missing'` and the hub renders a hard error naming the key.
create or replace function public.hr_knob_index(
  p_organization_id uuid, p_overridden_only boolean default false)
returns jsonb
language plpgsql stable security definer set search_path = public, hr
as $fn$
declare v_uid uuid := auth.uid(); v_org_settings jsonb;
begin
  if v_uid is null then
    raise exception 'hr_knob_index: no authenticated caller' using errcode = '42501';
  end if;
  if not (hr.capability(v_uid, 'identity.write', null, current_date)
          or hr._l1_org_role(v_uid, p_organization_id) in ('owner','admin')) then
    raise exception 'hr_knob_index: settings are HR-admin only' using errcode = '42501';
  end if;

  select coalesce(o.settings -> 'hr', '{}'::jsonb) into v_org_settings
    from iam.organizations o where o.id = p_organization_id;

  return jsonb_build_object(
    'organization_id', p_organization_id,
    'keys', (select coalesce(jsonb_agg(x order by x ->> 'feature', x ->> 'key'), '[]'::jsonb)
      from (
        select jsonb_build_object(
          'feature', k.feature,
          'slug', split_part(k.feature, '.', 2),
          'key', k.key,
          'full_key', k.feature || '.' || k.key,
          'value_type', k.value_type,
          'platform_default', coalesce(k.value, k.default_value),
          'org_override', v_org_settings #> array[split_part(k.feature,'.',2), k.key],
          'effective_value', coalesce(
             v_org_settings #> array[split_part(k.feature,'.',2), k.key],
             k.value, k.default_value),
          'origin', case
             when v_org_settings #> array[split_part(k.feature,'.',2), k.key] is not null
               then 'org_override'
             when coalesce(k.value, k.default_value) is not null then 'platform_default'
             else 'missing' end,
          'basis', k.basis,
          'is_overridden', v_org_settings #> array[split_part(k.feature,'.',2), k.key] is not null
        ) as x
        from platform.feature_knob k
        where k.feature like 'hr.%'
      ) s
      where not p_overridden_only or (x ->> 'is_overridden')::boolean));
end
$fn$;

-- ============================================================ grants

do $$ declare f text; begin
  foreach f in array ARRAY[
    'public.hr_my_context(uuid)',
    'public.hr_directory_list(uuid, jsonb, int, int, text, text)',
    'public.hr_org_chart(uuid, date)',
    'public.hr_employee_profile(uuid, date)',
    'public.hr_employment_history(uuid)',
    'public.hr_pending_changes(uuid)',
    'public.hr_structure_list(uuid)',
    'public.hr_knob_index(uuid, boolean)'] loop
    execute format('revoke all on function %s from public', f);
    execute format('revoke all on function %s from anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
  foreach f in array ARRAY[
    'hr._l1_org_role(uuid, uuid)',
    'hr._l1_module_enabled(uuid)',
    'hr._l1_persona(uuid, uuid, date)',
    'hr._l1_capabilities(uuid, uuid, date)',
    'hr._l1_self_employment(uuid, uuid, date)',
    'hr._l1_is_manager_of(uuid, uuid, date)',
    'hr._l1_viewer(uuid, uuid, date)'] loop
    execute format('revoke all on function %s from public', f);
    execute format('revoke all on function %s from anon', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

-- ============================================================ assertions

do $$
declare v_bad integer;
begin
  select count(*) into v_bad from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('hr_my_context','hr_directory_list','hr_org_chart','hr_employee_profile',
                       'hr_employment_history','hr_pending_changes','hr_structure_list',
                       'hr_knob_index');
  if v_bad <> 8 then
    raise exception 'hr_l1_01: expected 8 public working-record doors, found %', v_bad;
  end if;

  -- §9 T-34: no anon EXECUTE on any HR door, ever
  select count(*) into v_bad from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('hr_my_context','hr_directory_list','hr_org_chart','hr_employee_profile',
                       'hr_employment_history','hr_pending_changes','hr_structure_list',
                       'hr_knob_index')
     and has_function_privilege('anon', p.oid, 'execute');
  if v_bad > 0 then
    raise exception 'hr_l1_01: % working-record doors are executable by anon (§9 T-34)', v_bad;
  end if;

  -- RECORDED DECISION 3: the profile header must never read a convenience column.
  -- the dot matters: the prose above the header explains WHY it is absent, and must not trip
  -- the guard that proves it is absent.
  if (select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname='public' and p.proname='hr_employee_profile') like '%.directory_status%' then
    raise exception 'hr_l1_01: hr_employee_profile reads directory_status; §2.3.0 forbids it';
  end if;

  -- Scoped to THIS file's objects on purpose. The core migrations gated on every unacked
  -- `hr.%` guard row, which made each file hostage to whichever concurrent lane was mid-DDL —
  -- verified 2026-08-26, when a live `hr.payroll_export_line` row from the export lane failed
  -- this file twice. A guard you cannot green by fixing your own work is not a guard.
  select count(*) into v_bad
    from platform.ddl_guard_log
   where acknowledged_at is null
     and (object_ref like 'hr.\_l1%' or object_ref like 'public.hr\_%');
  if v_bad > 0 then
    raise exception 'hr_l1_01: % unacked DDL guard row(s) on this file''s objects', v_bad;
  end if;
end $$;
