-- lane: PAGE-SPEED-1
--
-- based-on: public.hr_my_context(uuid) 6bff9fdca180e1b70da50cb0e030ddb357a9bbc51969598765ce48e00f45ade4
--
-- public.hr_my_context: 3.7 s / 351 kB for a member of 1.5k organizations, now set-based. Payload and
-- every key unchanged (employers[].{organization_id,name,slug,module_enabled,is_activated,org_role,persona}
-- and the whole `active` block are read by features/hr; nothing is trimmed or renamed).
-- ROOT CAUSE (EXPLAIN ANALYZE as the member seat): the planner drove the employer list from a seq scan of ALL
-- iam.organizations, evaluating the SECURITY DEFINER helpers (module_enabled, org_role) on every org in the
-- system before the membership test; 572k buffers. Each helper was also called 2-3x per surviving org.
-- Inverse: migrations/inverse/pagespeed1_hr_my_context_plans_from_the_members_orgs_down.sql

set local lock_timeout = '2s';


CREATE OR REPLACE FUNCTION public.hr_my_context(p_organization_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'hr'
AS $function$
declare v_uid uuid := auth.uid(); v_today date := current_date; v_orgs jsonb; v_active jsonb; v_org uuid;
        v_standing uuid[];
begin
  if v_uid is null then
    raise exception 'hr_my_context: no authenticated caller' using errcode = '42501';
  end if;

  -- 🚨 DD-206. THE EMPLOYERS THIS PERSON HAS STANDING IN, ASKED BEFORE MEMBERSHIP.
  -- This list was scoped to `iam.memberships` alone, so an HR admin whose standing is an
  -- employment saw NO employer here at all — every other HR door could admit them and they
  -- still had no way to reach it, which is a dead end, not a refusal. An employment is the
  -- substrate `hr.capability` itself rests on (`hr.employments_of` → `hr.role_assignment`),
  -- so resolving it here asks the capability question at its root, once, for the whole list.
  select coalesce(array_agg(distinct em.organization_id), '{}'::uuid[])
    into v_standing
    from hr.employment em
   where em.id = any(hr.employments_of(v_uid, v_today));

  -- PAGE-SPEED-1: the planner drove this query from EVERY organization (3.5k rows) and ran
  -- the helper functions on all of them before the membership test (EXPLAIN: 572k buffers, 4.3 s for
  -- a 1.5k-org member). Now it starts from the person's own organizations, computes each helper
  -- ONCE per row (it used to run module_enabled 3x and org_role 2x per org), and runs the
  -- persona only on the rows that survive. module_enabled and org_role are the bodies of
  -- hr._l1_module_enabled / hr._l1_org_role(.., false), read set-based; the active-employer block
  -- below still calls those helpers directly.
  with mem as (
    select m.organization_id as id,
           (array_agg(m.role order by case m.role when 'owner' then 0 when 'admin' then 1 else 2 end))[1] as org_role
      from iam.memberships m
     where m.user_id = v_uid
       and m.container_type = 'organization' and m.deleted_at is null
       and coalesce(m.status,'active') = 'active'
     group by m.organization_id),
  prof as (
    select distinct ep.organization_id as id
      from hr.employer_profile ep where ep.deleted_at is null),
  cand as (
    select o.id, o.name, o.slug, mem.org_role,
           (prof.id is not null) as is_activated,
           coalesce((o.settings #>> '{hr,module_enabled}')::boolean, prof.id is not null) as module_enabled
      from iam.organizations o
      left join mem  on mem.id  = o.id
      left join prof on prof.id = o.id
     where o.id = any(v_standing)                               -- DD-206: capability's own root
        or mem.id is not null)
  select coalesce(jsonb_agg(x order by x ->> 'name'), '[]'::jsonb) into v_orgs from (
    select jsonb_build_object(
             'organization_id', c.id, 'name', c.name, 'slug', c.slug,
             'module_enabled', c.module_enabled,
             'is_activated', c.is_activated,
             'org_role', c.org_role,
             'persona', hr._l1_persona(v_uid, c.id, v_today)) as x
      from cand c
       -- An owner/admin sees an org whose module is OFF, because they are the one person who
       -- can turn it on — R-L1 §D: "/hr?org=<thatOrg> renders a single enable-door for
       -- owner/admin and a plain not-enabled page for everyone else." Filtering them out here
       -- is how a freshly created org becomes unreachable and unactivatable.
     where (c.module_enabled
            or coalesce(c.org_role in ('owner','admin'), false)
            or exists (select 1 from hr.employee e
                        where e.organization_id = c.id and e.login_user_id = v_uid
                          and e.deleted_at is null))
  ) s;

  v_org := p_organization_id;
  if v_org is null and jsonb_array_length(v_orgs) = 1 then
    v_org := (v_orgs -> 0 ->> 'organization_id')::uuid;
  end if;
  -- 🚨 DEFAULT TO THE EMPLOYER WHERE HR IS ACTUALLY ON. A person with one real HR
  -- workplace plus their own (module-off) workspace has two employers but one HR
  -- context; leaving active null hands every surface an empty capability set and hides
  -- every control from a full admin. Exactly one module-enabled employer is unambiguous;
  -- zero or many stays null and the picker decides.
  if v_org is null then
    with enabled as (
      select (e ->> 'organization_id')::uuid as oid
        from jsonb_array_elements(v_orgs) e
       where coalesce((e -> 'module_enabled')::boolean, false))
    select oid into v_org from enabled
     where (select count(*) from enabled) = 1;
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
      'org_role', hr._l1_org_role(v_uid, v_org, false),
      'persona', hr._l1_persona(v_uid, v_org, v_today),
      'capabilities', to_jsonb(hr._l1_capabilities(v_uid, v_org, v_today)),
      'employee_id', (select e.id from hr.employee e
                       where e.organization_id = v_org and e.login_user_id = v_uid
                         and e.deleted_at is null limit 1),
      'employment_id', hr._l1_self_employment(v_uid, v_org, v_today),
      -- 🚨 NAV CANNOT BE HONEST ABOUT A WORKER CLASS IT CANNOT SEE.
      -- The shell builds the self-service nav from this payload, and it had no worker
      -- class in it — so a contractor was offered a Time entry whose destination the
      -- server then correctly refuses, and the profile drops the matching tab. The nav
      -- and the tab bar disagreed about the same person because only one of them had
      -- been told what she is. This is the caller's own class, on their own employment,
      -- in the org they are looking at: it is not somebody else's sensitive field, and
      -- withholding it does not protect anyone — it just makes the menu lie.
      'worker_class', (select pa.worker_class
                         from hr.position_assignment pa
                         join hr.employment em on em.id = pa.employment_id
                        where em.id = hr._l1_self_employment(v_uid, v_org, v_today)
                          and pa.is_primary and pa.deleted_at is null
                          and pa.effective_from <= v_today
                          and (pa.effective_to is null or pa.effective_to >= v_today)
                        order by pa.effective_from desc limit 1),
      -- 🚨 NAV VISIBILITY FOR LEAVE IS AN ENROLMENT FACT, NOT A CLASS FACT (hr_l5_30).
      -- A static per-class list cannot express a per-person exception, and §2.8's override
      -- door creates exactly that person: a contractor with a legitimate, reasoned leave
      -- enrolment. She could hold a balance, file a request and have it approved, and still
      -- not find the page. Same justification as 'worker_class' directly above: the
      -- caller's own fact, about themselves, in the org they are looking at.
      'has_active_leave_enrolment', exists (
        select 1 from hr.leave_enrollment le
          join hr.leave_policy lp on lp.id = le.leave_policy_id
                                 and lp.deleted_at is null and lp.is_active
         where le.employment_id = hr._l1_self_employment(v_uid, v_org, v_today)
           and le.deleted_at is null
           and le.effective_from <= v_today
           and (le.effective_to is null or le.effective_to >= v_today)),
      'employee_count', (select count(*) from hr.employee e
                          where e.organization_id = v_org and e.deleted_at is null),
      'can_activate', coalesce(hr._l1_org_role(v_uid, v_org, false) in ('owner','admin'), false)
                      and not exists (select 1 from hr.role_assignment ra
                                       where ra.organization_id = v_org and ra.role_key = 'hr_owner'),
      -- RECORDED DECISION 28: every settings surface needs this and nothing returned it.
      'employer_profile_id', (select ep.id from hr.employer_profile ep
                               where ep.organization_id = v_org and ep.deleted_at is null limit 1));
  end if;

  return jsonb_build_object('employers', v_orgs, 'active', v_active, 'as_of', v_today);
end
$function$;
