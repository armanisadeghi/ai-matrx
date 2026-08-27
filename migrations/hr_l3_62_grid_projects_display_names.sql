-- HR domain L3 — register item HRB-015, lane l3-punch-kiosk (BUILDER SQL-1).
--
-- The approval grid emitted department, location and manager as IDS only, so the columns an
-- approval screen exists to scope by rendered empty. The door now serves the three display names.
--
-- Authority: coordinator ruling (grid display names); SPEC-TIME §9 rule 7 — the renderer reads
-- these facts, so the door produces them.
--
-- Applied live as `hr_l3_62_grid_projects_display_names`. Idempotent.
--
-- ── RECORDED TECHNICAL DECISIONS ────────────────────────────────────────────────────────────
-- 1. THE MANAGER'S NAME GOES THROUGH `hr._subject_display_name`, THE SAME HELPER THE AUDIT READS
--    AND `subject_name` USE. One suppression rule, now four callers: an opted-out manager reads as
--    null to a peer and by name to HR and to themselves, exactly as everywhere else. A second
--    lookup here would be the place the two eventually disagree about one person.
-- 2. DEPARTMENT AND LOCATION ARE PLAIN STRUCTURE READS, NOT SUPPRESSED. `directory_opt_out` is a
--    property of a PERSON; a department has no privacy posture, and withholding its name would
--    withhold nothing about anybody. They are read straight from `hr.department` / `hr.location`.
-- 3. `manager_name: null` IS A LEGITIMATE VALUE HERE, UNLIKE hr_l3_59's MARKER. There, a JSON null
--    was mistaken for a disclosure and defeated a gate. Here null means precisely "no name to
--    show" — no manager, or a suppressed one — the client's `nstr()` treats absent and null alike,
--    and nothing keys off its presence. Recorded so the two cases are not confused later.
-- 4. SCALAR SUBQUERIES RATHER THAN NEW JOINS. `base` already carries a lateral for the position
--    assignment; adding two more joins would risk changing its cardinality, and the grid's row set
--    is now security-scoped (hr_l3_60). A subquery cannot duplicate a row.

do $mig$
declare v_def text;
begin
  v_def := pg_get_functiondef('hr.timesheet_period_grid(uuid,jsonb,jsonb)'::regprocedure);

  if position('''manager_name'', r ->> ''manager_name''' in v_def) > 0 then
    raise notice 'hr_l3_62: the grid already projects the display names';
    return;
  end if;

  ---------------------------------------------------------------- the names, in `base`
  if position('           pa.job_title_id, pa.flsa_status' in v_def) = 0 then
    raise exception 'hr_l3_62: the grid base select has moved; refusing to guess';
  end if;
  v_def := replace(v_def,
    '           pa.job_title_id, pa.flsa_status',
    '           pa.job_title_id, pa.flsa_status,' || E'\n' ||
    '           -- hr_l3_62: the names beside the ids. Decision 4: scalar subqueries, because the' || E'\n' ||
    '           -- row set is security-scoped and a join could change its cardinality.' || E'\n' ||
    '           (select d.name from hr.department d where d.id = pa.department_id) department_name,' || E'\n' ||
    '           (select l.name from hr.location   l where l.id = pa.location_id)   location_name,' || E'\n' ||
    '           -- decision 1: the SAME suppression helper the audit reads use, not a second lookup' || E'\n' ||
    '           hr._subject_display_name(pa.manager_employment_id, v_uid) manager_name');

  ---------------------------------------------------------------- the names, on the wire
  if position('           ''manager_employment_id'', r ->> ''manager_employment_id'',' in v_def) = 0 then
    raise exception 'hr_l3_62: the grid row projection has moved; refusing to guess';
  end if;
  v_def := replace(v_def,
    '           ''manager_employment_id'', r ->> ''manager_employment_id'',',
    '           ''manager_employment_id'', r ->> ''manager_employment_id'',' || E'\n' ||
    '           ''department_name'', r ->> ''department_name'',' || E'\n' ||
    '           ''location_name'', r ->> ''location_name'',' || E'\n' ||
    '           -- decision 3: null here means "no name to show" -- no manager, or a suppressed' || E'\n' ||
    '           -- one. Nothing keys off its presence, unlike hr_l3_59''''s split_pending marker.' || E'\n' ||
    '           ''manager_name'', r ->> ''manager_name'',');

  execute v_def;
end
$mig$;

-- ── self-assertions ─────────────────────────────────────────────────────────────────────────
do $chk$
declare v_src text;
begin
  select prosrc into v_src from pg_proc where oid='hr.timesheet_period_grid(uuid,jsonb,jsonb)'::regprocedure;

  if position('''department_name'', r ->> ''department_name''' in v_src) = 0
     or position('''location_name'', r ->> ''location_name''' in v_src) = 0
     or position('''manager_name'', r ->> ''manager_name''' in v_src) = 0 then
    raise exception 'hr_l3_62: a display name is missing from the wire';
  end if;

  -- decision 1: the manager name must route through the shared helper, not a local join
  if position('hr._subject_display_name(pa.manager_employment_id, v_uid)' in v_src) = 0 then
    raise exception 'hr_l3_62: the manager name does not use the shared suppression helper';
  end if;
  if v_src ~ 'join hr\.employee[^\n]*manager|manager[^\n]*join hr\.employee' then
    raise exception 'hr_l3_62: the grid grew its own manager-name lookup';
  end if;

  -- decision 2: structure names are not routed through a person-suppression rule
  if v_src ~ '_subject_display_name\([^)]*department|_subject_display_name\([^)]*location' then
    raise exception 'hr_l3_62: a structure name was run through the person suppression rule';
  end if;
end
$chk$;
