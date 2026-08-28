-- hr_l1_35_nav_needs_the_worker_class.sql
--
-- T-13: the contractor is offered a Time nav entry whose target requires her ABSENCE.
--
-- The nav is built from `hr_my_context().active`, and that payload carried no worker
-- class — so `resolveHrNav` had no way to know what she is. The result was two parts of
-- the same screen describing the same person differently: the profile tab bar had
-- correctly dropped Time off for a contractor (T-L1-4, round 24), while the left-hand nav
-- still offered "My Timesheet", whose destination `hr.clock_state` blocks outright with
-- "Contractors do not clock in. Your time is invoiced through your engagement."
--
-- 🚨 THIS IS THE CALLER'S OWN CLASS, ON THEIR OWN EMPLOYMENT, IN THE ORG THEY ARE LOOKING
-- AT. It is not somebody else's sensitive field, and withholding it protected nobody — it
-- just made the menu lie. The client stays UX-only: every one of these destinations is
-- still refused server-side for a class that may not have it. Nav absence is §4.2 manners,
-- never the boundary.
--
-- Read off the primary, effective-dated assignment, so a class change lands the same day
-- the assignment does. `null` where there is no assignment — and the client hides NOTHING
-- on null rather than guessing, because an unknown class must not silently strip a menu.
--
-- Applied live 2026-08-28 and ledgered.

do $mig$
declare v_def text; v_new text;
begin
  v_def := pg_get_functiondef('public.hr_my_context(uuid)'::regprocedure);
  if position('NAV CANNOT BE HONEST ABOUT A WORKER CLASS IT CANNOT SEE' in v_def) > 0 then
    raise notice 'hr_l1_35: already applied'; return;
  end if;

  v_new := replace(v_def,
$a1$      'employment_id', hr._l1_self_employment(v_uid, v_org, v_today),$a1$,
$r1$      'employment_id', hr._l1_self_employment(v_uid, v_org, v_today),
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
                        order by pa.effective_from desc limit 1),$r1$);

  if v_new = v_def then raise exception 'hr_l1_35: employment_id anchor not found'; end if;
  execute v_new;
end $mig$;

do $verify$
declare v_src text;
begin
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_my_context';
  if v_src !~ 'NAV CANNOT BE HONEST' then raise exception 'hr_l1_35: did not land'; end if;
  if v_src !~ 'employer_profile_id' then raise exception 'hr_l1_35: decision-28 key lost'; end if;
end $verify$;

-- STANDING LAW: a fix to a shared hr function declares its contract in the same migration.
insert into hr.function_contract
  (schema_name, function_name, home_migration, must_contain, must_not_contain, reason)
values ('public', 'hr_my_context', 'hr_l1_35_nav_needs_the_worker_class.sql',
        array['''worker_class''', '''employer_profile_id''', '''capabilities'''],
        array[]::text[],
        'The HR shell builds self-service nav from active.*. worker_class must stay on this '
        || 'payload or the nav silently goes back to offering a contractor a Time entry whose '
        || 'destination the server refuses, disagreeing with the profile tab bar for the same '
        || 'person. employer_profile_id and capabilities are load-bearing for settings and gating.')
on conflict do nothing;

insert into public._schema_migrations (source, filename, checksum, applied_at, duration_ms)
values ('matrx-frontend', 'hr_l1_35_nav_needs_the_worker_class.sql',
        md5('hr_l1_35_nav_needs_the_worker_class'), now(), 0)
on conflict do nothing;
