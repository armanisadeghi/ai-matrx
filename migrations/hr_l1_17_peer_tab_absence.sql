-- HR domain L1 — migration 17 (register item HRB-013, lane l1-employees).
--
-- 🚨 §1.3 — A PEER WAS OFFERED A TAB WHOSE OWN DOOR REFUSES THEM.
--
-- Applied live as `hr_l1_17_peer_tab_absence`. Idempotent.
-- Authority: SPEC-EMPLOYEES §1.3, §2.3.1; SPEC-UI-IA §4.2.
--
-- ===================================================================================
-- FOUND IN THE FIRST FIVE MINUTES OF HAVING A REAL EMPLOYEE LOGIN, WHICH IS THE POINT.
--
-- `hr_l1_16` made it possible to sign in as somebody who is not an administrator. The first thing
-- that identity did was open a colleague's profile, and the answer was wrong:
--
--     as Marisol (persona `employee`, no HR capability), opening Dana's record
--     → granted: true, viewer: "peer", tabs: ["personal", "job"]
--
-- `hr_employee_profile` adds `personal` and `job` to **every** viewer unconditionally. But
-- `hr_employment_history` — the door the Job tab reads — refuses `peer` outright
-- (`if v_kind = 'peer' then return not_reachable`). So the tab bar offered a tab that renders
-- nothing.
--
-- §1.3 is explicit and this is the exact case it names: *"A tab whose every field is inaccessible
-- is not in the tab bar."* SPEC-UI-IA §4.2 says the same in more words — no empty tab, no
-- "you don't have permission" panel, the tab is simply not there. An empty Job tab also **leaks**:
-- it tells a colleague that a job record exists and that somebody else can read it, which is the
-- disclosure §1.3's absent-not-masked rule exists to prevent.
--
-- **The Personal tab stays for a peer**, and that is deliberate rather than an oversight. What it
-- returns to a `peer` is already only the directory fields — preferred name, pronouns, work email,
-- work phone, photo — the same tier route 10 shows every org member through the DIR pattern's
-- org-audience grant. The legal-name block and the whole `hr.employee_private` read are gated to
-- `self` / `hr_admin` and were never in a peer's payload. A tab with accessible fields belongs in
-- the bar; that is the same rule, applied honestly in the other direction.
--
-- **`peer` is not a new access class and is not being given one.** §2.3.1's matrix has four viewer
-- columns — self, manager, HR admin, org owner/admin — and an ordinary colleague is none of them.
-- This change makes the profile agree with the doors that already existed rather than inventing a
-- fifth column.
-- ===================================================================================

set local statement_timeout = '600s';
set local lock_timeout = '20s';

do $$
declare v_def text; v_new text;
begin
  v_def := pg_get_functiondef('public.hr_employee_profile(uuid, date)'::regprocedure);

  if v_def !~ 'v_tabs := array_append\(v_tabs, ''job''\);' then
    raise exception 'hr_l1_17: could not find the job-tab append in hr_employee_profile';
  end if;

  -- already conditional? then this file has run before.
  if v_def ~ 'THE JOB TAB IS NOT A PEER''S' then
    raise notice 'hr_l1_17: already applied';
    return;
  end if;

  v_new := replace(
    v_def,
    '  v_tabs := array_append(v_tabs, ''job'');',
    '  -- 🚨 THE JOB TAB IS NOT A PEER''S. `hr_employment_history` refuses `peer` outright, so'  || chr(10) ||
    '  -- offering the tab would render an empty panel — the exact thing §1.3 forbids ("a tab'    || chr(10) ||
    '  -- whose every field is inaccessible is not in the tab bar"), and a disclosure besides:'   || chr(10) ||
    '  -- an empty Job tab tells a colleague a job record exists and that somebody else can'      || chr(10) ||
    '  -- read it. Personal stays, because what a peer gets there is the directory tier they'     || chr(10) ||
    '  -- can already read on route 10.'                                                          || chr(10) ||
    '  if v_kind <> ''peer'' then' || chr(10) ||
    '    v_tabs := array_append(v_tabs, ''job'');' || chr(10) ||
    '  end if;');

  if v_new = v_def then
    raise exception 'hr_l1_17: the rewrite changed nothing';
  end if;

  execute v_new;
end $$;

-- ============================================================ assertions

do $$
declare v_src text; v_bad int;
begin
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_employee_profile';

  if v_src !~ 'if v_kind <> ''peer'' then' then
    raise exception 'hr_l1_17: the job tab is still unconditional';
  end if;

  -- the profile must stay VOLATILE (F1's class) and non-anon
  if (select p.provolatile from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname='public' and p.proname='hr_employee_profile') <> 'v' then
    raise exception 'hr_l1_17: hr_employee_profile is no longer VOLATILE — F1 would return';
  end if;
  if has_function_privilege('anon', 'public.hr_employee_profile(uuid, date)', 'execute') then
    raise exception 'hr_l1_17: hr_employee_profile is executable by anon';
  end if;

  -- 🚨 THE STANDING INVARIANT THIS FILE EXISTS TO PROTECT: no viewer may be offered a tab whose
  -- own door refuses them. Today `job` is the only tab whose door has a `peer` refusal; if another
  -- door grows one, this assertion is where the mismatch should be caught.
  select count(*) into v_bad from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_employment_history'
     and p.prosrc not like '%peer%';
  if v_bad > 0 then
    raise exception 'hr_l1_17: hr_employment_history no longer refuses peer — the job tab''s '
                    'absence for a peer is now wrong in the other direction';
  end if;

  select count(*) into v_bad from hr.stable_doors_that_write();
  if v_bad > 0 then
    raise exception 'hr_l1_17: % non-volatile door(s) can reach a writer', v_bad;
  end if;
end $$;
