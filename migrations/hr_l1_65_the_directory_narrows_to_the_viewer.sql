-- HR domain L1 — migration 64 (lane l1-employees).
--
-- 🚨 THE DIRECTORY DOOR RESOLVED A PERSONA AND THEN NARROWED NOTHING WITH IT.
--
-- Applied live to db.matrxserver.com as `hr_l1_65_the_directory_narrows_to_the_viewer`.
-- Idempotent (CREATE OR REPLACE + a delete/insert of this migration's contract rows).
-- Authority: SPEC-ACCESS §3.1 (the table → tier map) + §3.2 (the role × table grant matrix);
--            SPEC-EMPLOYEES §2.2 route 10 (Role variations, Edge behavior) + §5.1.
--
-- ===================================================================================
-- WHAT WAS MEASURED, BEFORE THIS RAN, THROUGH POSTGREST WITH FOUR REAL MINTED SESSIONS
-- against `Write Target Sandbox` (2643e470-b275-47f3-95f3-ae275ad3ca47, 20 people):
--
--   viewer                          persona   total  row keys  caps
--   admin@admin.com (org owner)     hr_admin     17        24  36 capabilities
--   admin+g2v.priya (hr_admin)      hr_admin     17        24  21 capabilities
--   zzz.l3.punch.employee           employee     17        24  {} — NONE
--   zzz.l5.plain.contractor         employee     17        24  {} — NONE
--
-- Byte-identical. A contractor with an EMPTY capability set received the same 24 fields as
-- the HR owner of the employer: `employee_number`, `work_email`, `work_phone`, `fte`,
-- `flsa_status`, `worker_class`, `schedule_class`, `hire_date`, `employment_id`, `row_basis`.
-- `v_persona` was computed on every call and read in exactly ONE place — the
-- `directory_opt_out` arm. It decided who was in the list and never what the list said.
--
-- Worse, and separately: the contractor could REQUEST the withheld categories and get them.
--   p_filter => {"status":["prehire"]}     → 3 rows: three people who have not started, WITH
--                                             their start dates. Route 10 gives that filter to
--                                             the HR admin and to nobody else.
--   p_filter => {"status":["terminated"]}  → 3 rows: three former colleagues.
--   p_filter => {"worker_class":"contractor"} → 2 rows: a per-person classification probe.
--
-- ── AND THE THIRD DEFECT, ON THE SAME LINE OF CODE ──────────────────────────────────
-- `v_statuses` defaulted to `['active','on_leave','prehire']` for EVERY caller, and the
-- table header's "All" item CLEARS the filter — so "All" sent no status key, landed on that
-- default, and returned 17 of 20 people. A control labelled All that silently withholds the
-- three former employees is the same species of defect as the one above: the label promises
-- something the data does not deliver. `{"status":["all"]}` returned 0 rows, because `all`
-- was not a status and matched nothing.
--
-- ===================================================================================
-- THE FIX — THE PATTERN `hr_employee_profile` ALREADY USES, NOT A SECOND MECHANISM
-- ===================================================================================
--
-- A render verifier confirmed the leak on screen AND handed over the decisive clue:
-- the PROFILE door is already correctly tiered for the same contractor (one Personal
-- tab, preferred name and work email, no legal name, no Compensation/Job/Time-off),
-- while the directory table was the one surface that was not. So this is that door's
-- mechanism applied here, read out of its live body rather than invented:
--
--   `hr_employee_profile`                        `hr_directory_list` (this migration)
--   ------------------------------------------   ------------------------------------------
--   reach from a CAPABILITY —                    reach from a CAPABILITY —
--     hr.capability(v_uid,'comp.read',…)           'working_record.read' = any(v_caps)
--   the payload is built so an unreachable       the payload has the unreachable keys
--     section's keys are simply NOT in it —        REMOVED — (to_jsonb(r) - 'rn') - v_strip
--     v_personal := v_personal || …
--   the door publishes a MANIFEST of what        the door publishes a MANIFEST of what
--     this viewer got — 'tabs', to_jsonb(…) —      this viewer got — 'columns' + 'statuses' —
--     and the client renders only that            and the client renders only that
--
-- 🚨 THE ONE DELIBERATE DIFFERENCE, STATED SO NOBODY "FIXES" IT INTO A THIRD PATTERN:
-- the profile ADDS sections and this door SUBTRACTS keys. The observable contract is
-- identical (the key is absent either way), and subtraction is required here for two
-- reasons the profile does not have: this is ONE CTE that must still compute
-- `hire_date` and `worker_class` to COUNT, SORT and FILTER by them for the viewers who
-- may have them; and `jsonb - '{}'::text[]` is the identity operation, which is what
-- makes "an HR admin's row is byte-identical to yesterday" provable rather than
-- asserted. It was proven that way: 72 comparisons of this body against the previous
-- one (2 HR admins x 9 filters x 4 sorts), zero differences.
--
-- ── THREE DECISIONS, EACH TRACEABLE TO A SPEC LINE ─────────────────────────────────
--
-- 1. THE TIER IS A CAPABILITY, NEVER A PERSONA STRING. SPEC-ACCESS §3.2's `hr_employment`
--    row is **G** for manager / hr_admin / payroll_admin / leave_administrator /
--    employee_relations / hr_owner and **—** for `Org member`. Read against the live
--    `hr.access_role` seed that column IS the capability `working_record.read`: every role
--    with G holds it, and `employee`, `recruiter` and `compliance_officer` — the three roles
--    §3.2 gives no `hr_employment` lane — do not. So the door asks for the capability.
--
--    🚨 THIS IS NOT A STYLE PREFERENCE, IT IS THE ONLY VERSION THAT DOES NOT BREAK FIVE
--    SURFACES. `_l1_persona` answers `hr_admin` only for `identity.write` /
--    `working_record.write`, so an `employee_relations` investigator and a
--    `leave_administrator` both come back `employee` — and `EmploymentPicker`,
--    `IncidentPartiesPanel`, `LeaveEnrollmentSurface`, `LeaveReassignDialog` and
--    `EmployeeSearchSelect` all read `employment_id` off these very rows. A persona test
--    would have silently emptied every one of those pickers.
--
--    Three tiers, resolved once per call, uniform across every row of the answer:
--      · `full`      — `working_record.read`, or persona `hr_admin`, or the org's
--                      owner/admin (route 10: *"Org owner/admin: same as HR admin for
--                      directory data by the kernel's org-admin arm"*). All 24 fields.
--      · `team`      — an IMPLICIT manager (people report to them; no HR role row, so no
--                      capability) who is asking with `my_team`. Every row in that answer is
--                      one of their reports, which is exactly the reach §3.2 grants them, so
--                      they get all 24 there and the directory tier outside it.
--      · `directory` — everyone else, including every contractor and every plain employee.
--                      Route 10: *"Employee: … columns limited to directory tier."*
--
-- 2. THE DIRECTORY TIER IS SPEC-ACCESS §3.1's `hr.employee` ROW, AND NOTHING ELSE.
--    *"display/preferred name, work email/phone, employee number, photo, status, party_id,
--    login_user_id. **Nothing else.**"* — plus the DIR-tier structure tables §3.3 names
--    (`hr.department`, `hr.location`, `hr.job_title`) and the manager column route 10's data
--    read carries. Seven keys therefore leave the payload for a directory-tier viewer, and
--    every one of them is a `hr.employment` / `hr.position_assignment` fact — Working-record
--    tier, `Org member` = **—**:
--
--      employment_id · worker_class · flsa_status · schedule_class · fte · hire_date · row_basis
--
--    🚨 ABSENT, NOT MASKED, NOT EMPTY-STRINGED. `jsonb - text[]` removes the keys; nothing
--    ships a null placeholder that announces the field exists and that this viewer is not
--    getting it. `v_strip` is `'{}'` for `full`/`team`, and `jsonb - '{}'::text[]` is the
--    identity — which is why an HR admin's rows are byte-identical to the day before.
--
--    🚨 `employee_number` STAYS, FOR EVERYONE. It is Directory tier in §3.1's own list, and
--    `hr_l1_24` ruled it explicitly when it put the same field on the CRM party card:
--    *"IT IS DIRECTORY TIER… an internal reference, not a confidential fact."* Removing it
--    here would contradict two rulings and break the directory's own number search.
--
-- 3. "ALL" MEANS EVERY STATUS THIS VIEWER MAY SEE — and the withheld ones are refused, not
--    quietly dropped. `{"status":["all"]}` now resolves to the viewer's allowed set (four
--    statuses for `full`, `active`+`on_leave` otherwise), so the HR admin's All is 20 of 20.
--    The NO-KEY default is untouched and still excludes `terminated`, because route 10 says
--    *"Terminated people are excluded by default and reachable through the status filter"* —
--    the default and All are two different requests and now say two different things.
--
--    A directory-tier viewer who NAMES `prehire` or `terminated` gets `42501`, not an empty
--    list. An empty list would be a lie about the population; the refusal is the honest
--    answer to a filter that is not theirs, and this surface already renders refusals as
--    refusals (`service.ts`: *"A REFUSAL IS DATA"*). The same rule covers `worker_class`,
--    which is a per-person probe of a Working-record fact, and the `hire_date` SORT, which
--    orders the list by a column the viewer no longer receives — that one CLAMPS to
--    `display_name` rather than raising, because the door already clamps every sort it does
--    not recognise and an ordering is not a request for a field.
--
-- ── WHAT THIS DELIBERATELY DOES NOT CHANGE ─────────────────────────────────────────
-- The `directory_opt_out` arm still reads `v_persona = 'hr_admin'` exactly as before. Route
-- 10's edge behavior is *"absent from the directory for peers and present for HR"*, and
-- widening it to the org-admin arm would change WHO IS IN THE LIST for a persona this
-- migration is not about. One defect, one migration.
-- ===================================================================================

set local statement_timeout = '600s';
set local lock_timeout = '20s';

create or replace function public.hr_directory_list(
  p_organization_id uuid,
  p_filter jsonb default '{}'::jsonb,
  p_limit integer default 50,
  p_offset integer default 0,
  p_sort text default 'display_name',
  p_direction text default 'asc')
returns jsonb
language plpgsql
stable security definer
set search_path to 'public', 'hr'
as $function$
declare
  v_uid uuid := auth.uid(); v_today date := current_date;
  v_persona text; v_caps text[]; v_mine uuid[]; v_total bigint; v_rows jsonb;
  v_search text; v_statuses text[]; v_manager uuid; v_sort text; v_dir text;
  v_shows_hire boolean; v_shows_mgr boolean; v_contractors boolean;
  v_org_role text; v_tier text; v_worker_class text;
  v_allowed text[]; v_default text[]; v_requested text[]; v_refused text[];
  v_strip text[];
begin
  if v_uid is null then
    raise exception 'hr_directory_list: no authenticated caller' using errcode = '42501';
  end if;
  v_org_role := hr._l1_org_role(v_uid, p_organization_id);
  if v_org_role is null
     and not exists (select 1 from hr.employee e
                      where e.organization_id = p_organization_id and e.login_user_id = v_uid
                        and e.deleted_at is null) then
    raise exception 'hr_directory_list: no standing in this employer' using errcode = '42501';
  end if;

  v_persona := hr._l1_persona(v_uid, p_organization_id, v_today);
  v_caps    := hr._l1_capabilities(v_uid, p_organization_id, v_today);
  v_mine    := hr.employments_of(v_uid, v_today);

  -- ── THE VIEWER'S TIER (SPEC-ACCESS §3.2's hr_employment row = working_record.read) ──
  -- The same shape hr_employee_profile uses to decide its tab list: reach comes from a
  -- CAPABILITY, never from the persona string. Resolved ONCE and applied to every row of the
  -- answer, so no column is ragged — a ragged column would itself disclose which of these
  -- people the viewer has a lane onto.
  v_tier := case
    when v_persona = 'hr_admin'
      or 'working_record.read' = any(v_caps)
      or coalesce(v_org_role, '') in ('owner', 'admin')            then 'full'
    when v_persona = 'manager'
      and nullif(p_filter ->> 'my_team', '') is not null           then 'team'
    else                                                                'directory'
  end;

  v_shows_hire := (hr._knob('hr.employees','directory_shows_hire_date') #>> '{}')::boolean;
  v_shows_mgr  := (hr._knob('hr.employees','directory_shows_manager') #>> '{}')::boolean;
  v_contractors := coalesce((hr._knob('hr.employees','contractor_directory_visible') #>> '{}')::boolean, true);

  v_search   := nullif(trim(coalesce(p_filter ->> 'search','')), '');
  v_manager  := nullif(p_filter ->> 'manager_employee_id','')::uuid;
  v_worker_class := nullif(p_filter ->> 'worker_class','');

  -- ── WHICH STATUSES ARE THIS VIEWER'S (route 10 Role variations) ───────────────────
  -- HR admin: "full, plus status filters that include terminated and prehire". Everyone
  -- else: the two statuses that describe somebody who is here now.
  v_allowed := case when v_tier = 'full'
                    then array['active','on_leave','prehire','terminated']
                    else array['active','on_leave'] end;
  v_default := case when v_tier = 'full'
                    then array['active','on_leave','prehire']
                    else array['active','on_leave'] end;

  select coalesce(array_agg(value #>> '{}'), '{}'::text[]) into v_requested
    from jsonb_array_elements(coalesce(p_filter -> 'status', '[]'::jsonb));

  if cardinality(v_requested) = 0 then
    -- No status key at all: route 10's default view. Terminated people are excluded here
    -- and reachable through the filter — which is a DIFFERENT request from "all".
    v_statuses := v_default;
  elsif 'all' = any(v_requested) then
    -- "All" means every status this viewer may see. Never "the default set".
    v_statuses := v_allowed;
  else
    select coalesce(array_agg(s), '{}'::text[]) into v_refused
      from unnest(v_requested) s where s <> all(v_allowed);
    if cardinality(v_refused) > 0 then
      raise exception 'hr_directory_list: the % status filter is not yours in this directory',
        array_to_string(v_refused, ', ') using errcode = '42501';
    end if;
    v_statuses := v_requested;
  end if;

  -- Worker class is a hr.position_assignment fact. Offering the filter without the column
  -- would let a directory-tier viewer probe one person at a time for the answer the
  -- projection below withholds.
  if v_worker_class is not null and v_tier = 'directory' then
    raise exception 'hr_directory_list: the worker-class filter is not yours in this directory'
      using errcode = '42501';
  end if;

  -- Sorting by a column this viewer does not receive is that column, said as an ordering.
  v_sort := case when p_sort in ('display_name','directory_status','employee_number')
                 then p_sort
                 when p_sort = 'hire_date' and v_tier <> 'directory'
                 then 'hire_date'
                 else 'display_name' end;
  v_dir  := case when lower(coalesce(p_direction,'asc')) = 'desc' then 'desc' else 'asc' end;

  -- ── THE PROJECTION, PER TIER. ABSENT, NEVER MASKED (SPEC-ACCESS §3.1) ─────────────
  -- Every key here is a hr.employment / hr.position_assignment fact, and `Org member` is
  -- `—` for that table in §3.2's matrix. `'{}'` for the other two tiers makes the strip the
  -- identity operation, which is what keeps an HR admin's row byte-identical.
  v_strip := case when v_tier = 'directory'
                  then array['employment_id','worker_class','flsa_status','schedule_class',
                             'fte','hire_date','row_basis']
                  else '{}'::text[] end;

  -- ONE query: the scan is counted and paged from the same CTE, so `total` is the size of the
  -- FULL result set and never "showing first 100" (§5.1 rule 1). The sort is a CASE ladder over
  -- four clamped literal column names rather than dynamic SQL — a static plan a reviewer reads.
  with scoped as (
    select e.id                                as employee_id,
           coalesce(e.current_employment_id, em.id)              as employment_id,
           e.display_name, e.employee_number, e.work_email, e.work_phone,
           e.photo_file_id, ds.status as directory_status,
           coalesce(pa.job_title_id, e.current_job_title_id)     as job_title_id,
           jt.title                                              as job_title,
           coalesce(pa.department_id, e.current_department_id)   as department_id,
           d.name                                                as department,
           coalesce(pa.location_id, e.primary_location_id)       as location_id,
           l.name                                                as location,
           l.tz                                                  as timezone,
           coalesce(e.current_manager_employee_id, mgr.id)       as manager_employee_id,
           case when v_shows_mgr then hr._employee_display_name(mgr.id, v_uid) end as manager_name,
           pa.worker_class, pa.flsa_status, pa.schedule_class, pa.fte,
           case when v_shows_hire then em.hire_date end          as hire_date,
           case when e.current_employment_id is not null then 'current'
                when em.id is null then 'no_spell'
                when em.hire_date > v_today then 'upcoming'
                else 'no_primary_assignment' end                 as row_basis,
           e.custom
      from hr.employee e
      -- 🚨 THE STATUS IS DERIVED, NEVER STORED (D4). The dropped column was
      -- written once at creation and by nothing else ever again: every
      -- terminated person in this list read "Active" and was counted as one. It is also a fact about
      -- TODAY — route 10's status filter promises "terminated on or before
      -- today" — which no stored value can keep across a day boundary.
      left join lateral (select hr.employee_directory_status(e.id, v_today) as status) ds on true
      -- current first (§1.2), then the fallback of RECORDED DECISION 3b
      left join lateral (
        select em2.* from hr.employment em2
         where em2.deleted_at is null
           and (em2.id = e.current_employment_id
                or (e.current_employment_id is null and em2.employee_id = e.id
                    and (em2.termination_date is null or em2.termination_date >= v_today)))
         order by (em2.id = e.current_employment_id) desc, em2.hire_date asc
         limit 1) em on true
      left join lateral (
        select pa2.* from hr.position_assignment pa2
         where pa2.deleted_at is null
           and (pa2.id = e.current_position_assignment_id
                or (e.current_position_assignment_id is null and pa2.employment_id = em.id
                    and pa2.is_primary
                    and (pa2.effective_to is null or pa2.effective_to >= v_today)))
         order by (pa2.id = e.current_position_assignment_id) desc, pa2.effective_from asc
         limit 1) pa on true
      left join hr.job_title jt on jt.id = coalesce(pa.job_title_id, e.current_job_title_id)
      left join hr.department d on d.id = coalesce(pa.department_id, e.current_department_id)
      left join hr.location  l on l.id = coalesce(pa.location_id, e.primary_location_id)
      left join hr.employment mem on mem.id = pa.manager_employment_id and mem.deleted_at is null
      left join hr.employee mgr on mgr.id = coalesce(e.current_manager_employee_id, mem.employee_id)
     where e.organization_id = p_organization_id
       and e.deleted_at is null
       and ds.status = any(v_statuses)
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
       and (v_worker_class is null or pa.worker_class = v_worker_class)
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
         coalesce((select jsonb_agg((to_jsonb(r) - 'rn') - v_strip order by r.rn) from ranked r
                    where r.rn >  greatest(coalesce(p_offset,0),0)
                      and r.rn <= greatest(coalesce(p_offset,0),0)
                                  + greatest(coalesce(p_limit,50),1)), '[]'::jsonb)
    into v_total, v_rows;

  return jsonb_build_object(
    'rows', v_rows, 'total', v_total,
    'limit', greatest(coalesce(p_limit,50),1), 'offset', greatest(coalesce(p_offset,0),0),
    'persona', v_persona, 'capabilities', to_jsonb(v_caps),
    -- `columns` is the door's own statement of which optional columns exist for THIS viewer.
    -- The client renders from it, so a field the payload no longer carries cannot render as a
    -- blank cell. `hire_date` and `manager` keep their exact prior meaning for `full`.
    'columns', jsonb_build_object(
      'hire_date',         v_shows_hire and v_tier <> 'directory',
      'manager',           v_shows_mgr,
      'worker_class',      v_tier <> 'directory',
      'employment_detail', v_tier <> 'directory'),
    -- Which statuses this viewer may ask for, and what they get when they ask for nothing.
    -- The client offers exactly `allowed` and shows `default` as an explicit selection, so
    -- "All" is never the unlabelled state that quietly means something narrower.
    'statuses', jsonb_build_object(
      'allowed', to_jsonb(v_allowed),
      'default', to_jsonb(v_default)),
    'tier', v_tier,
    'as_of', v_today);
end
$function$;

-- The definer guard (platform.enforce_definer_client_grants) revokes client EXECUTE on any
-- undeclared SECURITY DEFINER function it sees created. Re-asserted, because a directory that
-- 404s for every user is not a subtle failure.
grant execute on function public.hr_directory_list(uuid, jsonb, integer, integer, text, text)
  to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- THE CONTRACT MOVES WITH THE FIX (hr_l3_79). A later lane that re-emits this body from its
-- own source discards the narrowing; `hr.function_contracts_broken()` turns that from a silent
-- loss into a red blocking check, because the tokens below ARE the fix.
--
-- The hr_l1_60 row (`ds.status = any(v_statuses)`, no `e.directory_status`) and the hr_l3_64
-- row (`_employee_display_name`, no raw manager projection) are untouched and still enforced;
-- this body satisfies both.
-- 🚨 THE NUMBER MOVED, AND A CONTRACT ROW POINTING AT A FILE THAT NO LONGER EXISTS IS A
-- COMMENT THAT NAMES THE WRONG MIGRATION — the exact defect hr_l1_64's own restamp block
-- was written to correct. This file was first applied as `hr_l1_64_the_directory_narrows_
-- to_the_viewer.sql` and collided, minutes later, with another agent's in-flight
-- `hr_l1_64_the_write_gate_asks_the_population_it_refused_the_read_for.sql` in this shared
-- checkout. That one claimed 64 first and is already ledgered under it, so THIS one moved to
-- 65. The delete below names the old filename EXACTLY — never a LIKE 'hr_l1_64%', which
-- would take the other lane's rows with it.
delete from hr.function_contract
 where home_migration in ('hr_l1_65_the_directory_narrows_to_the_viewer.sql',
                          'hr_l1_64_the_directory_narrows_to_the_viewer.sql');

insert into hr.function_contract
  (schema_name, function_name, home_migration, must_contain, must_not_contain,
   must_be_definer, reason)
values
  ('public', 'hr_directory_list',
   'hr_l1_65_the_directory_narrows_to_the_viewer.sql',
   array[
     -- the tier exists and is a capability, not a persona string
     '''working_record.read'' = any(v_caps)',
     -- the projection is actually narrowed, and by removal
     'v_strip',
     ') - v_strip order by r.rn',
     -- the withheld statuses are refused rather than defaulted away
     'status filter is not yours in this directory',
     'worker-class filter is not yours in this directory',
     -- "All" resolves to the viewer's allowed set
     '''all'' = any(v_requested)',
     -- the client is told what it may render and may ask for
     '''employment_detail'', v_tier <> ''directory'''],
   array[
     -- the pre-fix shape: one default status set for every caller on earth
     'array[''active'',''on_leave'',''prehire''])'],
   true,
   'SPEC-ACCESS 3.1/3.2 + SPEC-EMPLOYEES route 10: hr_directory_list resolved a persona and '
   || 'narrowed NOTHING with it. Measured live before the fix, a contractor with an EMPTY '
   || 'capability set received the SAME 24 fields as the employer''s HR owner (fte, flsa_status, '
   || 'worker_class, schedule_class, hire_date, employment_id, row_basis) and could REQUEST '
   || 'prehire and terminated rows — three not-yet-started hires with their start dates, and '
   || 'three former colleagues. The seven Working-record keys must be REMOVED from the payload '
   || 'for a directory-tier viewer (absent, never masked), the tier must come from '
   || 'working_record.read rather than the persona string (an employee_relations investigator '
   || 'and a leave_administrator are BOTH persona=employee, and five live pickers read '
   || 'employment_id off these rows), a withheld status or worker-class filter must be refused '
   || 'rather than silently emptied, and "all" must mean every status this viewer may see — '
   || 'the header''s All item cleared the filter and returned 17 of 20 people.');

-- ─────────────────────────────────────────────────────────────────────────────
-- Self-verification. A migration that cannot fail is not a check.
do $chk$
declare
  v_broken integer;
  v_src    text := (select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                     where n.nspname = 'public' and p.proname = 'hr_directory_list');
begin
  if v_src is null then
    raise exception 'hr_l1_65: public.hr_directory_list is missing after the replace';
  end if;
  if position('v_strip' in v_src) = 0 then
    raise exception 'hr_l1_65: the narrowing did not land';
  end if;
  select count(*) into v_broken from hr.function_contracts_broken()
   where qname = 'public.hr_directory_list';
  if v_broken > 0 then
    raise exception 'hr_l1_65: this body breaks % contract clause(s) on its own door: %',
      v_broken,
      (select string_agg(clause || ' ' || missing_or_present, '; ')
         from hr.function_contracts_broken() where qname = 'public.hr_directory_list');
  end if;
  if not exists (select 1 from information_schema.routine_privileges
                  where routine_name = 'hr_directory_list' and grantee = 'authenticated'
                    and privilege_type = 'EXECUTE') then
    raise exception 'hr_l1_65: authenticated lost EXECUTE on the directory door';
  end if;
  raise notice 'hr_l1_65: directory door narrowed; contracts hold';
end
$chk$;
