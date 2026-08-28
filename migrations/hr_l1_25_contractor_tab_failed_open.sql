-- HR domain L1 — migration 25 (register item HRB-013, lane l1-employees).
--
-- 🚨 THE CONTRACTOR GUARD EXISTED AND FAILED OPEN — on exactly the population it
-- was written to catch.
--
-- Applied live as `hr_l1_25_contractor_tab_failed_open`. Idempotent.
-- Authority: SPEC-EMPLOYEES §4.7 (contractors: no I-9, no W-4, no PTO, no OT), §4.2.
--
-- ===================================================================================
-- `hr_employee_profile` already had the branch, and it reads correctly:
--
--     if coalesce(v_worker_class,'employee') <> 'contractor' then
--       v_tabs := array_append(v_tabs, 'time-off');
--     end if;
--
-- What it reads is the problem. `v_worker_class` comes from
-- `hr.primary_position_as_of(v_em.id, v_on)`, and `v_em` from
-- `hr.employment_as_of(employee, today)` — so for a person whose engagement has not
-- STARTED yet, both are null, `coalesce(null,'employee')` answers `'employee'`, and
-- the Time Off tab is appended to a contractor.
--
-- Verified live on UPW-77421 (G2K-Rafael Nakamura, EMP-00003, a prehire contractor):
-- the door returned `worker_class: null`, `employment_id: null`, and `time-off` in
-- the tab list.
--
-- 🚨 A DEFAULT THAT DECIDES A RULE IS NOT A DEFAULT. `coalesce(…, 'employee')` looks
-- like a harmless fallback and is in fact the whole decision for every prehire: the
-- guard is strongest precisely where it never runs, because a contractor is most
-- likely to be a prehire on the day somebody first opens their record.
--
-- THE FIX USES THIS LANE'S OWN EXISTING PATTERN rather than inventing one.
-- `hr_directory_list` already faces this — RECORDED DECISION 3b: "`current_*` is NULL
-- for every prehire → bounded lateral fallback with `row_basis`" — and resolves the
-- worker class from the nearest primary position on any live employment. The profile
-- now resolves it the same way, so the two surfaces cannot disagree about whether
-- somebody is a contractor.
--
-- And an engagement row is itself the answer when there is no position at all: §4.7's
-- branch is about engagements, so a person with one IS a contractor even before their
-- first assignment exists.
--
-- Fixing the resolution also fills `header.worker_class`, which was null for the same
-- reason — so the contractor chip now renders where the directory already showed one.
-- ===================================================================================

set local statement_timeout = '600s';
set local lock_timeout = '20s';

do $$
declare v_def text; v_new text;
begin
  v_def := pg_get_functiondef('public.hr_employee_profile(uuid,date)'::regprocedure);

  if position('A DEFAULT THAT DECIDES A RULE' in v_def) > 0 then
    raise notice 'hr_l1_25: already applied';
    return;
  end if;

  v_new := replace(v_def,
    '  v_worker_class := v_pa.worker_class;',
    '  v_worker_class := v_pa.worker_class;' || chr(10) ||
    '' || chr(10) ||
    '  -- 🚨 A DEFAULT THAT DECIDES A RULE IS NOT A DEFAULT. `coalesce(v_worker_class,''employee'')`' || chr(10) ||
    '  -- gates the Time Off tab (§4.7), and for a prehire BOTH `employment_as_of` and' || chr(10) ||
    '  -- `primary_position_as_of` are null — so the guard answered ''employee'' for exactly the' || chr(10) ||
    '  -- population it exists to catch, and a contractor got a Time Off tab (UPW-77421).' || chr(10) ||
    '  --' || chr(10) ||
    '  -- Resolved the way `hr_directory_list` already resolves it (RECORDED DECISION 3b), so the' || chr(10) ||
    '  -- two surfaces cannot disagree about whether somebody is a contractor.' || chr(10) ||
    '  if v_worker_class is null then' || chr(10) ||
    '    select pa2.worker_class into v_worker_class' || chr(10) ||
    '      from hr.employment em2' || chr(10) ||
    '      join hr.position_assignment pa2 on pa2.employment_id = em2.id' || chr(10) ||
    '       and pa2.is_primary and pa2.deleted_at is null' || chr(10) ||
    '     where em2.employee_id = p_employee_id and em2.deleted_at is null' || chr(10) ||
    '     order by pa2.effective_from asc' || chr(10) ||
    '     limit 1;' || chr(10) ||
    '  end if;' || chr(10) ||
    '' || chr(10) ||
    '  -- An engagement is itself the answer when no position exists yet: §4.7''s branch is' || chr(10) ||
    '  -- ABOUT engagements, so somebody holding one is a contractor before their first' || chr(10) ||
    '  -- assignment is written.' || chr(10) ||
    '  if v_worker_class is null and exists (' || chr(10) ||
    '       select 1 from hr.engagement en' || chr(10) ||
    '        join hr.employment em3 on em3.id = en.employment_id' || chr(10) ||
    '       where em3.employee_id = p_employee_id' || chr(10) ||
    '         and em3.deleted_at is null and en.deleted_at is null) then' || chr(10) ||
    '    v_worker_class := ''contractor'';' || chr(10) ||
    '  end if;');

  if v_new = v_def then
    raise exception 'hr_l1_25: the worker-class assignment was not found';
  end if;
  execute v_new;
end $$;

-- ============================================================ assertions

do $$
declare v_src text;
begin
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_employee_profile';

  if v_src !~ 'A DEFAULT THAT DECIDES A RULE' then
    raise exception 'hr_l1_25: the rewrite did not land';
  end if;

  -- the §4.7 branch itself must survive, unchanged in meaning
  if v_src !~ 'coalesce\(v_worker_class,''employee''\) <> ''contractor''' then
    raise exception 'hr_l1_25: the contractor branch has gone missing';
  end if;

  -- and §1.3's peer rule from hr_l1_17 stays where it was
  if v_src !~ 'v_kind <> ''peer''' then
    raise exception 'hr_l1_25: the peer tab rule has gone missing';
  end if;

  -- F1's class stays closed
  if (select count(*) from hr.stable_doors_that_write()) > 0 then
    raise exception 'hr_l1_25: a non-volatile door can reach a writer';
  end if;
end $$;
