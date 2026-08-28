-- HR domain L5 — migration 17 (register item HRB-017, lane L5 Leave & PTO).
--
-- 🚨 I READ THE WRONG TABLE FOR "WHO MANAGES THIS PERSON", AND NEARLY FILED A FINDING ABOUT IT.
--
-- `hr_l5_16` derived the team scope from `hr.reporting_line`, because SPEC-LEAVE §11 says the
-- manager's scope is *"derived from `hr.reporting_line` at the configured depth"*. The table is
-- **empty platform-wide — zero rows in the entire database** — and I was one commit away from
-- filing that emptiness as an L1 seeding defect.
--
-- It is not a defect. `hr.reporting_line.line_kind` is CHECKed to
-- **`dotted | functional | project | interim`** — there is no `primary` and no `solid`. The table
-- exists for the SECONDARY lines a person also reports along, and it is empty because almost
-- nobody has one. **The primary manager lives on `hr.position_assignment.manager_employment_id`**,
-- and that column is populated.
--
-- So §11's sentence names the narrower of the two sources, and a build that follows it literally
-- gives every ordinary manager — the ones with a plain solid line to their reports — an empty
-- team scope. The predicate now reads BOTH: the primary assignment's manager, and any live
-- reporting line. **[amendment owed: SPEC-LEAVE §11 should say the primary assignment's manager
-- plus `hr.reporting_line`, not `hr.reporting_line` alone.]**
--
-- The lesson, recorded because it is the one that keeps repeating in this lane: I found the
-- emptiness with a control, formed a confident story about whose fault it was, and the story was
-- wrong. Reading the CHECK constraint before writing the finding cost one query.
--
-- Authority: SPEC-LEAVE §11, §16; SPEC-DATA-MODEL (position_assignment / reporting_line).
-- Applied live as `hr_l5_17_a_manager_is_the_primary_line_too`. Idempotent.

create or replace function hr._leave_has_reports(p_employment_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'hr', 'public'
as $function$
  -- §11: DERIVED, never a hand-maintained role list — but derived from BOTH lines, because the
  -- primary one does not live in hr.reporting_line at all.
  select exists (
    select 1 from hr.position_assignment pa
     where pa.manager_employment_id = p_employment_id and pa.is_primary and pa.deleted_at is null
       and pa.effective_from <= current_date
       and (pa.effective_to is null or pa.effective_to > current_date))
      or exists (
    select 1 from hr.reporting_line rl
     where rl.manager_employment_id = p_employment_id and rl.deleted_at is null
       and rl.effective_from <= current_date
       and (rl.effective_to is null or rl.effective_to >= current_date));
$function$;

comment on function hr._leave_has_reports(uuid) is
  'Does this employment manage anybody? The PRIMARY line is '
  'hr.position_assignment.manager_employment_id; hr.reporting_line carries only the secondary '
  'kinds (dotted / functional / project / interim, by its own CHECK) and is empty platform-wide. '
  'SPEC-LEAVE §11 names only the second table — reading it literally gives every ordinary manager '
  'an empty team scope.';

create or replace function hr._leave_manages(p_manager_employment_id uuid, p_employment_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'hr', 'public'
as $function$
  select exists (
    select 1 from hr.position_assignment pa
     where pa.employment_id = p_employment_id and pa.is_primary and pa.deleted_at is null
       and pa.manager_employment_id = p_manager_employment_id
       and pa.effective_from <= current_date
       and (pa.effective_to is null or pa.effective_to > current_date))
      or exists (
    select 1 from hr.reporting_line rl
     where rl.employment_id = p_employment_id and rl.deleted_at is null
       and rl.manager_employment_id = p_manager_employment_id
       and rl.effective_from <= current_date
       and (rl.effective_to is null or rl.effective_to >= current_date));
$function$;

comment on function hr._leave_manages(uuid, uuid) is
  'Does A manage B, along either line? One predicate so the balances scope, the calendar rung and '
  'anything later cannot disagree about who somebody''s manager is.';

-- -----------------------------------------------------------------------------------
-- Both consumers now ask the predicate instead of joining one table themselves
-- -----------------------------------------------------------------------------------

do $$
declare v_def text; v_new text;
begin
  -- balances: the team-scope branch
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'leave_balances';
  v_new := replace(v_def,
    E'or (v_scope = ''team'' and (en.employment_id = v_me or exists (\n               select 1 from hr.reporting_line rl\n                where rl.employment_id = en.employment_id\n                  and rl.manager_employment_id = v_me and rl.deleted_at is null)))',
    E'or (v_scope = ''team'' and (en.employment_id = v_me\n                                     or hr._leave_manages(v_me, en.employment_id)))');
  if v_new = v_def then
    raise exception 'hr_l5_17: the balances team-scope branch did not match — read it and re-derive';
  end if;
  execute v_new;

  -- calendar: the manager rung
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'leave_calendar';
  v_new := replace(v_def,
    E'when exists (select 1 from hr.reporting_line rl\n                    where rl.employment_id = v_r.employment_id\n                      and rl.manager_employment_id = v_me and rl.deleted_at is null) then ''manager''',
    E'when hr._leave_manages(v_me, v_r.employment_id) then ''manager''');
  if v_new = v_def then
    raise exception 'hr_l5_17: the calendar manager rung did not match — read it and re-derive';
  end if;
  execute v_new;

  -- calendar: the "team" filter axis
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'leave_calendar';
  v_new := replace(v_def,
    E'or exists (select 1 from hr.reporting_line rl\n                        where rl.employment_id = r.employment_id\n                          and rl.manager_employment_id = v_me and rl.deleted_at is null))',
    E'or hr._leave_manages(v_me, r.employment_id))');
  if v_new = v_def then
    raise exception 'hr_l5_17: the calendar team axis did not match — read it and re-derive';
  end if;
  execute v_new;
end $$;

do $$
declare v_def text;
begin
  foreach v_def in array array['leave_balances','leave_calendar'] loop
    if (select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'hr' and p.proname = v_def) not like '%_leave_manages%' then
      raise exception 'hr_l5_17: hr.% still derives a manager by joining one table itself', v_def;
    end if;
  end loop;
  if (select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'hr' and p.proname = '_leave_has_reports') not like '%position_assignment%' then
    raise exception 'hr_l5_17: the has-reports predicate still ignores the primary line';
  end if;
end $$;
