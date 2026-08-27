-- HR domain L3 — register item HRB-015, lane l3-punch-kiosk (BUILDER SQL-1).
--
-- 🚨 THE DIRECTORY SUPPRESSED THE OPTED-OUT PERSON'S OWN ROW AND THEN PRINTED THEIR NAME ANYWAY,
--    ONE COLUMN OVER, AS SOMEBODY ELSE'S MANAGER.
--
-- `hr_directory_list` already honours `directory_opt_out` — in its WHERE clause, which drops the
-- opted-out person's ROW for peers. What it did NOT honour it in is the manager column:
--
--     case when v_shows_mgr then mgr.display_name end       as manager_name
--
-- a raw read of `hr.employee.display_name` with no viewer in it at all. So an opted-out manager
-- vanished from the directory as a person and reappeared, by full name, on every one of their
-- reports' rows — served to any peer with directory standing. The suppression was not weak here;
-- it was absent, and the row-level suppression is what made the leak invisible, because the person
-- testing "is the opted-out employee hidden?" gets a correct YES.
--
-- The helper already answers NULL for exactly this viewer. This door simply was not asking it.
--
-- Authority: coordinator ruling (round 18 P1, "six callers, one rule"); SPEC-ACCESS §4.2;
-- `hr._subject_display_name` as built in hr_l3_41 and extended to the chart in hr_l3_63.
--
-- Applied live as `hr_l3_64_directory_manager_name_uses_the_one_rule`. Idempotent.
--
-- ── RECORDED TECHNICAL DECISIONS ────────────────────────────────────────────────────────────
-- 1. 🚨 TWO ENTRY POINTS, ONE IMPLEMENTATION — BECAUSE THE DIRECTORY HOLDS AN *EMPLOYEE*, NOT AN
--    EMPLOYMENT. `hr._subject_display_name` takes an `employment_id`; the directory's `mgr` alias
--    is an `hr.employee`, resolved as `coalesce(e.current_manager_employee_id, mem.employee_id)`.
--    Passing it an employment id it does not have would have meant re-deriving one per row, and
--    re-deriving is how two callers come to disagree about one person. So the RULE moves down into
--    `hr._employee_display_name(employee_id, uid)` and `hr._subject_display_name` becomes a
--    delegating wrapper that resolves the employee and calls it. Same pattern as
--    `_punch_open_chain` / `_punch_open_chain_as_of` in hr_l3_40: two doors, one body, and the
--    arms — self, HR-in-this-org, everyone else — exist in exactly one place. The six callers are
--    now six callers of one rule, which is the thing that was ruled.
-- 2. THE WRAPPER KEEPS ITS SIGNATURE, SO NOTHING ELSE MOVES. `hr._subject_display_name(uuid,uuid)`
--    is replaced in place, not dropped: five live callers (`hr._project_row`, `hr.punch_register`,
--    `hr.timesheet_get`, `hr.timesheet_period_grid`, `public.hr_org_chart`) keep working and keep
--    their ACLs. A dropped-and-recreated function would have discarded the ACL — the defect this
--    lane already paid for once.
-- 3. THE HELPER'S HR ARM IS CAPABILITY-BASED; THE DIRECTORY'S ROW FILTER IS PERSONA-BASED. They are
--    not identical predicates (`identity.write` / `working_record.write` vs `v_persona =
--    'hr_admin'`), and this migration deliberately does NOT reconcile them. The ruling was to route
--    the NAME through the one rule, and the one rule is the helper. Making the row filter agree is
--    a separate change with its own blast radius, and is reported rather than smuggled in here.
-- 4. NOT A NEW SUPPRESSION FOR THE SUBJECT'S OWN NAME. `e.display_name` on the row itself stays a
--    raw read, and correctly so: an opted-out person's row is already excluded for peers by the
--    WHERE clause, so the only viewers who reach that column are the subject and HR — the same two
--    the helper would have admitted. Routing it through the helper too would cost a per-row call
--    to prove something the WHERE clause already proved.

begin;

-- ── 1. the rule, keyed by employee ──────────────────────────────────────────────────────────
create or replace function hr._employee_display_name(p_employee_id uuid, p_uid uuid)
returns text
language plpgsql
stable
security definer
set search_path = hr, public
as $fn$
declare v_name text; v_optout boolean; v_org uuid; v_login uuid;
begin
  if p_employee_id is null or p_uid is null then return null; end if;

  select e.display_name, e.directory_opt_out, e.organization_id, e.login_user_id
    into v_name, v_optout, v_org, v_login
    from hr.employee e
   where e.id = p_employee_id and e.deleted_at is null;

  if v_name is null then return null; end if;
  if not coalesce(v_optout, false) then return v_name; end if;

  -- opted out: only the subject themselves, and HR in THIS organization, still see the name
  if v_login is not distinct from p_uid then return v_name; end if;
  if hr._punch_capability(p_uid, 'identity.write',        null, current_date, v_org)
     or hr._punch_capability(p_uid, 'working_record.write', null, current_date, v_org) then
    return v_name;
  end if;
  return null;
end
$fn$;

revoke all on function hr._employee_display_name(uuid, uuid) from public;
revoke all on function hr._employee_display_name(uuid, uuid) from anon;

-- ── 2. the employment-keyed entry point now delegates ───────────────────────────────────────
create or replace function hr._subject_display_name(p_employment_id uuid, p_uid uuid)
returns text
language plpgsql
stable
security definer
set search_path = hr, public
as $fn$
declare v_employee uuid;
begin
  if p_employment_id is null or p_uid is null then return null; end if;

  select em.employee_id into v_employee
    from hr.employment em
   where em.id = p_employment_id;

  return hr._employee_display_name(v_employee, p_uid);
end
$fn$;

revoke all on function hr._subject_display_name(uuid, uuid) from public;
revoke all on function hr._subject_display_name(uuid, uuid) from anon;

-- ── 3. the sixth caller ─────────────────────────────────────────────────────────────────────
do $mig$
declare
  v_def  text := pg_get_functiondef('public.hr_directory_list(uuid,jsonb,integer,integer,text,text)'::regprocedure);
  v_from text := 'case when v_shows_mgr then mgr.display_name end       as manager_name';
  v_to   text := 'case when v_shows_mgr then hr._employee_display_name(mgr.id, v_uid) end as manager_name';
begin
  if position(v_to in v_def) > 0 then
    return;                                    -- already routed; replay is a no-op
  end if;
  if position(v_from in v_def) = 0 then
    raise exception 'hr_l3_64: the manager_name projection was not found in hr_directory_list — refusing to guess';
  end if;
  execute replace(v_def, v_from, v_to);
end
$mig$;

-- ── 4. prove it, in the same transaction that changed it ────────────────────────────────────
do $chk$
declare v_src text; v_raw text := 'mgr.' || 'display_name';
begin
  select prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_directory_list';

  if position('hr._employee_display_name(mgr.id, v_uid)' in v_src) = 0 then
    raise exception 'hr_l3_64: hr_directory_list does not route manager_name through the helper';
  end if;
  if position(v_raw in v_src) > 0 then
    raise exception 'hr_l3_64: hr_directory_list still projects the raw manager display_name';
  end if;
  if hr._employee_display_name(null, null) is not null then
    raise exception 'hr_l3_64: the employee-keyed helper must answer NULL on a null subject';
  end if;
end
$chk$;

commit;
