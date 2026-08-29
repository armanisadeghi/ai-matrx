-- hr_l1_69 — A TERMINATED SPELL CLOSES ITS POSITION ASSIGNMENTS.
--
-- RECORD of a live change applied on 2026-08-29.
--
-- 🚨 THE DEFECT. Nothing ever end-dated a position assignment when the spell that held it ended.
-- `hr_separation_record` writes `hr.employment.status/termination_date/last_day_worked` and hands
-- the membership to `hr.sync_membership_to_employment` (continued_access_06) — and leaves
-- `hr.position_assignment.effective_to` NULL. Every one of the nine terminated spells in this
-- database carried exactly one still-open assignment, so the Job tab's position history read
-- "Mar 2, 2026 — present" for a person who left in August, and `effective_range @> current_date`
-- kept answering TRUE for a job nobody holds.
--
-- 🚨 THE DATE IS `termination_date + 1`, AND THAT IS READ OFF THE SYSTEM, NOT PICKED.
--   · `position_assignment.effective_range` is `daterange(effective_from, effective_to, '[)')` —
--     `effective_to` is EXCLUSIVE. §4.2 closes a superseded row at the successor's
--     `effective_from`, which is the same half-open convention.
--   · `hr.employment_as_of` holds a spell in force while `termination_date >= p_on`, so the
--     employment window INCLUDES the termination date; `hr.employee_directory_status` only says
--     `terminated` once `termination_date < p_on`. The person is employed through that day.
--   · SPEC-EMPLOYEES §3 (final pay) uses "the last compensation row in force on the last day
--     worked", and compensation hangs off the position assignment. Closing at `last_day_worked`
--     or at `termination_date` (exclusive) would put the assignment OUT of force on the last day
--     worked whenever the two dates are equal — which is every terminated spell in this database.
-- So the assignment is in force for every day of the spell, up to and including the termination
-- date, and not after: `effective_to = termination_date + 1`.
--
-- 🚨 ONE LIFECYCLE OWNER, NOT A FOURTH WRITER. `hr.sync_positions_to_employment` is to the
-- position window exactly what `hr.sync_membership_to_employment` is to the membership: one
-- function that asks one question — where does this spell end? — and makes the rows agree,
-- in BOTH directions, so a rescinded termination has an inverse instead of a second writer.
-- It is bound to a trigger on `hr.employment` so ANY writer of `termination_date` is covered,
-- not just the separation door; the door additionally CALLS it so the result is in the ack, the
-- same shape continued_access_06 gave `access_shutoff` (a verified result, never event-fired-
-- equals-done). The rehire path is untouched and cannot resurrect a closed assignment: a rehire
-- INSERTS a new spell with its own new assignment, and this function only ever reads the spell it
-- is given.
--
-- 🚨 THE MUST-NOT-BREAK, MEASURED BEFORE IT WAS FIXED. Closing the assignments makes
-- `hr._refresh_current_position` correctly NULL `hr.employee.current_position_assignment_id`,
-- `current_job_title_id` and `current_department_id` for a terminated person — and
-- `hr_directory_list`'s fallback demanded a still-OPEN window, so with the assignments closed
-- every terminated row in the HR-admin status filter came back with `job_title: null,
-- department: null`. Reproduced live in a rolled-back transaction on all five terminated people
-- before Part 4 below was written. Part 4 is strictly additive: the two existing winners keep
-- their exact precedence and order, and the new arm answers only where there was no answer.

-- ──────────────────────────────────────────────────────────────────────────────────────────
-- PART 1 — the one owner of a position's valid time against its spell.
-- ──────────────────────────────────────────────────────────────────────────────────────────
create or replace function hr.sync_positions_to_employment(p_employment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'hr', 'public', 'pg_temp'
as $function$
declare
  v_term date; v_deleted timestamptz; v_end date;
  v_closed int := 0; v_reopened int := 0; v_beyond int := 0;
begin
  select em.termination_date, em.deleted_at into v_term, v_deleted
    from hr.employment em where em.id = p_employment_id;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_reachable');
  end if;
  if v_deleted is not null then
    return jsonb_build_object('ok', true, 'action', 'none', 'detail', 'the spell is archived');
  end if;

  perform hr.arm_write();
  v_end := case when v_term is null then null else v_term + 1 end;

  if v_end is not null then
    -- A future-dated assignment that starts AFTER the spell ends cannot be closed at the spell's
    -- end without violating position_window_ordered (effective_to > effective_from). It is a real
    -- state — a promotion recorded for next month, then a termination — and this function does not
    -- get to guess what it means. Counted out loud in the answer instead of silently skipped.
    select count(*) into v_beyond from hr.position_assignment pa
     where pa.employment_id = p_employment_id and pa.deleted_at is null
       and pa.effective_from >= v_end;

    update hr.position_assignment pa
       set effective_to = v_end
     where pa.employment_id = p_employment_id and pa.deleted_at is null
       and pa.effective_from < v_end
       and (pa.effective_to is null or pa.effective_to > v_end);
    get diagnostics v_closed = row_count;
  else
    -- THE INVERSE (§4.5 P, a rescinded termination). Narrow on purpose: only the LATEST PRIMARY
    -- assignment, and only when nothing starts at or after it — so a secondary that genuinely
    -- ended, and a row superseded by a position change, are never reopened.
    update hr.position_assignment pa
       set effective_to = null
     where pa.id = (select p2.id from hr.position_assignment p2
                     where p2.employment_id = p_employment_id and p2.deleted_at is null
                       and p2.is_primary
                     order by p2.effective_from desc, p2.recorded_at desc
                     limit 1)
       and pa.effective_to is not null
       and not exists (select 1 from hr.position_assignment p3
                        where p3.employment_id = p_employment_id and p3.deleted_at is null
                          and p3.id <> pa.id and p3.effective_from >= pa.effective_from);
    get diagnostics v_reopened = row_count;
  end if;

  return jsonb_build_object('ok', true,
    'spell_ends_exclusive', v_end,
    'assignments_closed', v_closed,
    'assignments_reopened', v_reopened,
    'assignments_starting_after_the_spell_ends', v_beyond);
end
$function$;

create or replace function hr._employment_position_sync_tg()
returns trigger
language plpgsql
security definer
set search_path to 'hr', 'public', 'pg_temp'
as $function$
begin
  perform hr.sync_positions_to_employment(new.id);
  return null;
end
$function$;

drop trigger if exists employment_position_sync on hr.employment;
create trigger employment_position_sync
  after insert or update of termination_date on hr.employment
  for each row execute function hr._employment_position_sync_tg();

-- ──────────────────────────────────────────────────────────────────────────────────────────
-- PART 2 — the separation door reports the result, the way it reports the access shutoff.
-- ──────────────────────────────────────────────────────────────────────────────────────────
do $patch$
declare
  v_def text;
  v_old text := '  v_shutoff := hr.sync_membership_to_employment(v_employee, v_uid, v_sep);';
  v_new text :=
    '  v_shutoff := hr.sync_membership_to_employment(v_employee, v_uid, v_sep);' || E'\n' ||
    E'\n' ||
    '  -- 🚨 THE JOB ENDS WHEN THE SPELL ENDS (hr_l1_69). Nothing used to end-date the position,' || E'\n' ||
    '  -- so a terminated spell''s history read "— present" forever and effective_range @> today' || E'\n' ||
    '  -- stayed true for a job nobody holds. hr.sync_positions_to_employment is the ONE owner of' || E'\n' ||
    '  -- that window (it is also bound to a trigger on hr.employment, so a termination written by' || E'\n' ||
    '  -- any other path is covered too); this call is here so the RESULT is in the ack rather than' || E'\n' ||
    '  -- assumed, exactly as continued_access_06 did for the access shutoff.' || E'\n' ||
    '  v_positions := hr.sync_positions_to_employment(v_employment);';
  v_old_decl text := '  v_shutoff jsonb;';
  v_new_decl text := '  v_shutoff jsonb; v_positions jsonb;';
  v_old_ret text := '    ''access_shutoff'', v_shutoff,';
  v_new_ret text := '    ''access_shutoff'', v_shutoff,' || E'\n' || '    ''position_close'', v_positions,';
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_separation_record';
  if v_def is null then
    raise exception 'hr_l1_69: public.hr_separation_record is missing';
  end if;

  if position('sync_positions_to_employment' in v_def) > 0 then
    raise notice 'hr_l1_69: separation door already reports the position close';
  else
    if position(v_old in v_def) = 0 or position(v_old_decl in v_def) = 0
       or position(v_old_ret in v_def) = 0 then
      raise exception 'hr_l1_69: hr_separation_record has changed shape; refusing to patch blind';
    end if;
    v_def := replace(v_def, v_old,      v_new);
    v_def := replace(v_def, v_old_decl, v_new_decl);
    v_def := replace(v_def, v_old_ret,  v_new_ret);
    execute v_def;

    select pg_get_functiondef(p.oid) into v_def
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'hr_separation_record';
    if position('v_positions := hr.sync_positions_to_employment(v_employment);' in v_def) = 0
       or position('''position_close'', v_positions,' in v_def) = 0 then
      raise exception 'hr_l1_69: the separation-door replacement did not land';
    end if;
    if position('sync_membership_to_employment' in v_def) = 0
       or position('access_shutoff' in v_def) = 0 then
      raise exception 'hr_l1_69: the patched separation door lost machinery it must keep';
    end if;
  end if;
end
$patch$;

-- ──────────────────────────────────────────────────────────────────────────────────────────
-- PART 3 — the directory keeps showing the job a terminated person HELD.
-- ──────────────────────────────────────────────────────────────────────────────────────────
do $patch$
declare
  v_def text;
  v_old text :=
    '      left join lateral (' || E'\n' ||
    '        select pa2.* from hr.position_assignment pa2' || E'\n' ||
    '         where pa2.deleted_at is null' || E'\n' ||
    '           and (pa2.id = e.current_position_assignment_id' || E'\n' ||
    '                or (e.current_position_assignment_id is null and pa2.employment_id = em.id' || E'\n' ||
    '                    and pa2.is_primary' || E'\n' ||
    '                    and (pa2.effective_to is null or pa2.effective_to >= v_today)))' || E'\n' ||
    '         order by (pa2.id = e.current_position_assignment_id) desc, pa2.effective_from asc' || E'\n' ||
    '         limit 1) pa on true';
  v_new text :=
    '      -- 🚨 A CLOSED ASSIGNMENT IS STILL THE JOB THEY HELD (hr_l1_69). Once a terminated' || E'\n' ||
    '      -- spell end-dates its positions, current_position_assignment_id is correctly NULL and' || E'\n' ||
    '      -- this fallback -- which demanded a still-OPEN window -- found nothing, so every' || E'\n' ||
    '      -- terminated row in the HR status filter came back with a null title, department and' || E'\n' ||
    '      -- location. STRICTLY ADDITIVE: the two original winners keep their exact precedence' || E'\n' ||
    '      -- and their original order (open rows, earliest first); the last key answers only' || E'\n' ||
    '      -- where there was NO answer at all -- the last primary assignment this person held.' || E'\n' ||
    '      left join lateral (' || E'\n' ||
    '        select pa2.* from hr.position_assignment pa2' || E'\n' ||
    '         where pa2.deleted_at is null' || E'\n' ||
    '           and (pa2.id = e.current_position_assignment_id' || E'\n' ||
    '                or (e.current_position_assignment_id is null and pa2.employment_id = em.id' || E'\n' ||
    '                    and pa2.is_primary))' || E'\n' ||
    '         order by (pa2.id = e.current_position_assignment_id) desc,' || E'\n' ||
    '                  (pa2.effective_to is null or pa2.effective_to >= v_today) desc,' || E'\n' ||
    '                  case when (pa2.effective_to is null or pa2.effective_to >= v_today)' || E'\n' ||
    '                       then pa2.effective_from end asc,' || E'\n' ||
    '                  pa2.effective_from desc' || E'\n' ||
    '         limit 1) pa on true';
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_directory_list';
  if v_def is null then
    raise exception 'hr_l1_69: public.hr_directory_list is missing';
  end if;

  if position('A CLOSED ASSIGNMENT IS STILL THE JOB THEY HELD' in v_def) > 0 then
    raise notice 'hr_l1_69: the directory already falls back to the last held assignment';
  else
    if position(v_old in v_def) = 0 then
      raise exception 'hr_l1_69: the directory position lateral has changed shape; refusing to patch blind';
    end if;
    execute replace(v_def, v_old, v_new);

    select pg_get_functiondef(p.oid) into v_def
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'hr_directory_list';
    if position('A CLOSED ASSIGNMENT IS STILL THE JOB THEY HELD' in v_def) = 0 then
      raise exception 'hr_l1_69: the directory replacement did not land';
    end if;
    if position('iam.organization_member om' in v_def) = 0
       or position('hr.employee_directory_status(e.id, v_today)' in v_def) = 0
       or position('_employee_display_name' in v_def) = 0
       or position(') - v_strip order by r.rn' in v_def) = 0 then
      raise exception 'hr_l1_69: the patched directory lost machinery it must keep';
    end if;
  end if;
end
$patch$;

-- ──────────────────────────────────────────────────────────────────────────────────────────
-- PART 4 — the backfill. Every already-terminated spell gets its true end date.
-- ──────────────────────────────────────────────────────────────────────────────────────────
do $backfill$
declare
  r record; v_res jsonb;
  v_spells int := 0; v_closed int := 0; v_beyond int := 0;
  v_before int; v_after int;
begin
  select count(*) into v_before from hr.position_assignment
   where deleted_at is null and effective_to is not null;

  for r in select em.id from hr.employment em
            where em.deleted_at is null and em.termination_date is not null
            order by em.termination_date
  loop
    v_res := hr.sync_positions_to_employment(r.id);
    v_spells := v_spells + 1;
    v_closed := v_closed + coalesce((v_res ->> 'assignments_closed')::int, 0);
    v_beyond := v_beyond + coalesce((v_res ->> 'assignments_starting_after_the_spell_ends')::int, 0);
  end loop;

  select count(*) into v_after from hr.position_assignment
   where deleted_at is null and effective_to is not null;

  -- NOTHING ELSE MOVED: the only rows that changed are the ones this loop closed.
  if v_after - v_before <> v_closed then
    raise exception 'hr_l1_69 backfill: closed % assignments but the end-dated count moved by %',
      v_closed, v_after - v_before;
  end if;
  if exists (select 1 from hr.position_assignment pa
              join hr.employment em on em.id = pa.employment_id
             where pa.deleted_at is null and em.deleted_at is null
               and em.termination_date is not null
               and pa.effective_from < em.termination_date + 1
               and (pa.effective_to is null or pa.effective_to > em.termination_date + 1)) then
    raise exception 'hr_l1_69 backfill: a terminated spell still holds an assignment past its end';
  end if;
  raise notice 'hr_l1_69 backfill: % terminated spells, % assignments closed, % starting after the spell ends',
    v_spells, v_closed, v_beyond;
end
$backfill$;

-- ──────────────────────────────────────────────────────────────────────────────────────────
-- PART 5 — the pins.
-- ──────────────────────────────────────────────────────────────────────────────────────────
insert into hr.function_contract
  (schema_name, function_name, home_migration, must_contain, must_not_contain, reason, must_be_definer)
select 'public','hr_separation_record','hr_l1_69_a_terminated_spell_closes_its_positions.sql',
       array['hr.sync_positions_to_employment(v_employment)', '''position_close'', v_positions'],
       array[]::text[],
       'A spell that has ended cannot still hold a job. Nothing end-dated hr.position_assignment '
       || 'when a separation was recorded, so every terminated spell in the database carried an '
       || 'open assignment: the Job tab read "— present" for people who left in August, and '
       || 'effective_range @> current_date answered true for a job nobody holds. The window is '
       || 'owned by hr.sync_positions_to_employment (also trigger-bound to hr.employment); this '
       || 'door must keep REPORTING its result, never assume it — the same law continued_access_06 '
       || 'wrote for the access shutoff.', true
where not exists (select 1 from hr.function_contract c
                   where c.schema_name = 'public' and c.function_name = 'hr_separation_record'
                     and c.home_migration = 'hr_l1_69_a_terminated_spell_closes_its_positions.sql');

insert into hr.function_contract
  (schema_name, function_name, home_migration, must_contain, must_not_contain, reason, must_be_definer)
select 'hr','sync_positions_to_employment','hr_l1_69_a_terminated_spell_closes_its_positions.sql',
       array['v_end := case when v_term is null then null else v_term + 1 end;',
             'assignments_starting_after_the_spell_ends'],
       array[]::text[],
       'The close date is termination_date + 1 and that is read off the system, not chosen: '
       || 'effective_range is daterange(from, to, ''[)'') so effective_to is EXCLUSIVE, while '
       || 'hr.employment_as_of holds a spell in force through termination_date INCLUSIVE. Closing '
       || 'at last_day_worked or at termination_date would put the assignment out of force ON the '
       || 'last day worked whenever the two dates are equal — which is every terminated spell in '
       || 'this database — and SPEC-EMPLOYEES §3 keys final pay on the compensation in force that '
       || 'day. An assignment that STARTS after the spell ends is reported, never silently skipped.',
       true
where not exists (select 1 from hr.function_contract c
                   where c.schema_name = 'hr' and c.function_name = 'sync_positions_to_employment');

insert into hr.function_contract
  (schema_name, function_name, home_migration, must_contain, must_not_contain, reason, must_be_definer)
select 'public','hr_directory_list','hr_l1_69_a_terminated_spell_closes_its_positions.sql',
       array['A CLOSED ASSIGNMENT IS STILL THE JOB THEY HELD'],
       array[]::text[],
       'hr_l1_69 end-dates a terminated spell''s assignments, which correctly NULLs the employee''s '
       || 'current_* denormalizations. This fallback''s old arm demanded a still-OPEN window, so '
       || 'with the assignments closed every terminated row in the HR status filter returned a '
       || 'null job title, department and location — measured live on all five. The last-held arm '
       || 'is what keeps the directory correct, and removing it silently blanks the terminated '
       || 'view again.', true
where not exists (select 1 from hr.function_contract c
                   where c.schema_name = 'public' and c.function_name = 'hr_directory_list'
                     and c.home_migration = 'hr_l1_69_a_terminated_spell_closes_its_positions.sql');

do $chk$
declare v_broken int; v_open int;
begin
  select count(*) into v_broken from hr.function_contracts_broken()
   where qname in ('public.hr_separation_record','public.hr_directory_list',
                   'hr.sync_positions_to_employment');
  if v_broken > 0 then
    raise exception 'hr_l1_69: % contract clause(s) broken', v_broken;
  end if;
  select count(*) into v_open from hr.position_assignment pa
    join hr.employment em on em.id = pa.employment_id
   where pa.deleted_at is null and em.deleted_at is null
     and em.termination_date is not null and pa.effective_to is null;
  if v_open > 0 then
    raise exception 'hr_l1_69: % terminated spell(s) still hold an open position assignment', v_open;
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'hr.employment'::regclass
                  and tgname = 'employment_position_sync' and not tgisinternal) then
    raise exception 'hr_l1_69: the position-sync trigger is not bound';
  end if;
end
$chk$;
