-- HR domain L3 — register item HRB-015, lane l3-punch-kiosk (BUILDER SQL-1).
--
-- Round-10 nit Y2: the time queues told a pending hire she holds no employment anywhere.
--
-- `hr.attendance_exception_list` refused Dana Ruiz with "You hold no employment in any
-- organization" while she holds employment b4337db7 in that very organization — `status = 'pending'`,
-- `hire_date = 2026-09-09`, thirteen days out. Non-leaking, and untrue.
--
-- WHAT THE PREDICATE ACTUALLY TESTS. `hr.employments_of(user, at)` filters on a DATE WINDOW —
-- `hire_date <= at` and `termination_date is null or >= at` — and never reads `status` at all. So
-- the miss is never "no employment"; it is "no employment whose hire date has arrived and which has
-- not ended, as of today". Verified against Dana's live row: `hire_date_arrived = false`,
-- `not_yet_ended = true`, predicate result 0.
--
-- THE VOCABULARY. `hr.employment.status` is one of pending / active / on_leave / suspended /
-- terminated, so **pending** is the spec's word for an employment that exists and has not begun
-- (`hr.employee.directory_status` calls the same person **prehire** on the directory surface). The
-- refusal therefore says "has not started yet", not "is not active" — a pending employment is not
-- an inactive one, and telling someone their employment is inactive on the day before they start
-- would be its own small untruth.
--
-- Authority: coordinator ruling (round-10 Y2); SPEC-TIME §2.1 (a refusal names what was missing).
--
-- Applied live as `hr_l3_50_not_employed_refusal_says_what_it_checked`. Idempotent.
--
-- ── RECORDED TECHNICAL DECISIONS ────────────────────────────────────────────────────────────
-- 1. FOUR DOORS CARRY THE SENTENCE, NOT ONE. Measured, not assumed: `attendance_exception_list`
--    (reported), `overtime_preapproval_list`, `pay_period_list` and `time_adjustment_list` all run
--    the identical predicate and open with the identical untrue clause, differing only in the
--    trailing noun. Fixing the reported one alone would have left the same lie in three queues.
-- 2. ONE HELPER, EACH DOOR KEEPS ITS OWN SECOND SENTENCE. `hr._time_not_employed_refusal` owns the
--    accurate leading clause; the door passes the sentence naming what it has none of. Four copies
--    of a four-armed date analysis is how they drift into saying different things about one state.
-- 3. FOUR ARMS, BECAUSE THE PREDICATE HAS FOUR WAYS TO MISS. Not started / ended / one of each /
--    genuinely no record. The original sentence was only ever true of the fourth, and it is kept
--    verbatim for that case — it was not wrong, it was over-applied.
-- 4. IT STAYS NON-LEAKING. Everything said comes from the caller's OWN employment rows: their hire
--    date, their termination date. No organization is named, no other person's record is touched,
--    and nothing distinguishes "no employment here" from "no employment anywhere" for an outsider,
--    because the arms turn on the caller's own dates rather than on any org's population.
-- 5. THE CODE IS UNCHANGED. `hr_actor_not_employed` is what clients branch on; only the sentence
--    and the detail move. The detail now carries `checked`, `as_of`, `employment_starts_on` and
--    `employment_ended_on`, so a surface can render "starts on the 9th" without re-deriving it.
-- 6. ⚠️ THE FOUR *WRITE* DOORS ARE THE SAME CLASS AND ARE NOT TOUCHED HERE.
--    `attendance_exception_resolve`, `overtime_preapproval_create`, `time_adjustment_create` and
--    `pay_period_transition` raise the same code with a different, org-scoped sentence ("You hold
--    no employment in this organization, so this X cannot be attributed to anybody"), which is
--    untrue for a pending hire in exactly the same way. Their predicate is org-scoped rather than
--    global, so the accurate wording differs, and rewriting a write door's refusal is more visible
--    than a queue's. Reported for a ruling rather than folded in silently.

-- ── 1. the accurate leading clause, in one place (decision 2) ────────────────────────────────
create or replace function hr._time_not_employed_refusal(p_uid uuid, p_tail text)
returns jsonb
language plpgsql stable security definer set search_path to 'hr','public'
as $fn$
declare
  v_any    boolean;
  v_starts date;
  v_ended  date;
  v_lead   text;
begin
  -- decision 4: the caller's OWN rows and nothing else
  select count(*) > 0,
         min(em.hire_date) filter (where em.hire_date > current_date),
         max(em.termination_date) filter (where em.termination_date is not null
                                            and em.termination_date < current_date)
    into v_any, v_starts, v_ended
    from hr.employee e
    join hr.employment em on em.employee_id = e.id and em.deleted_at is null
   where e.login_user_id = p_uid and e.deleted_at is null;

  -- decision 3: four arms, because hr.employments_of() has four ways to return nothing
  if not coalesce(v_any, false) then
    v_lead := 'You hold no employment record in any organization.';
  elsif v_starts is not null and v_ended is null then
    v_lead := 'Your employment has not started yet. It begins on ' || v_starts::text || '.';
  elsif v_ended is not null and v_starts is null then
    v_lead := 'Your employment ended on ' || v_ended::text || '.';
  else
    v_lead := 'You hold no employment that has started and not yet ended. '
              || 'One ended on ' || v_ended::text || ' and another begins on ' || v_starts::text || '.';
  end if;

  return hr._time_refusal('hr_actor_not_employed',
    v_lead || ' ' || p_tail,
    jsonb_build_object(
      'checked', 'an employment whose hire date has arrived and which has not ended',
      'as_of', current_date,
      'employment_starts_on', v_starts,
      'employment_ended_on', v_ended));
end
$fn$;

revoke execute on function hr._time_not_employed_refusal(uuid,text) from public, anon;

-- ── 2. point the four queues at it (decision 1) ──────────────────────────────────────────────
do $mig$
declare
  r record; v_def text; v_n int; v_done int := 0;
begin
  for r in
    select * from (values
      ('hr.attendance_exception_list(jsonb,jsonb)',
       'so there are no exceptions to show you\.',      'There are no exceptions to show you.'),
      ('hr.overtime_preapproval_list(jsonb,jsonb)',
       'so there are no overtime requests to show you\.','There are no overtime requests to show you.'),
      ('hr.pay_period_list(jsonb,jsonb)',
       'so there is no pay group to show you\.',        'There is no pay group to show you.'),
      ('hr.time_adjustment_list(jsonb,jsonb)',
       'so there are no corrections to show you\.',     'There are no corrections to show you.')
    ) as t(fn, tail_pat, tail)
  loop
    v_def := pg_get_functiondef(r.fn::regprocedure);

    if position('_time_not_employed_refusal' in v_def) > 0 then
      continue;                                        -- already migrated
    end if;

    -- the whole refusal call, however it happens to be wrapped across lines
    v_n := (select count(*) from regexp_matches(v_def,
      'hr\._time_refusal\(''hr_actor_not_employed'',\s*''You hold no employment in any organization, '
      || r.tail_pat || '''\)', 'g'));
    if v_n <> 1 then
      raise exception 'hr_l3_50: % — expected exactly 1 refusal site, found %', r.fn, v_n;
    end if;

    v_def := regexp_replace(v_def,
      'hr\._time_refusal\(''hr_actor_not_employed'',\s*''You hold no employment in any organization, '
      || r.tail_pat || '''\)',
      'hr._time_not_employed_refusal(v_uid, ''' || r.tail || ''')');

    execute v_def;
    v_done := v_done + 1;
  end loop;

  raise notice 'hr_l3_50: % queue(s) repointed', v_done;
end
$mig$;

-- ── 3. self-assertions ──────────────────────────────────────────────────────────────────────
do $chk$
declare v_bad text;
begin
  -- no time door may still open with the absolute-absence claim
  select string_agg(p.oid::regprocedure::text, ', ') into v_bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.prokind = 'f'
     and p.prosrc ~ 'You hold no employment in any organization';
  if v_bad is not null then
    raise exception 'hr_l3_50: a door still claims absolute absence: %', v_bad;
  end if;

  -- all four queues now route through the one helper (decision 2)
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'hr'
         and p.proname in ('attendance_exception_list','overtime_preapproval_list',
                           'pay_period_list','time_adjustment_list')
         and p.prosrc ~ '_time_not_employed_refusal') <> 4 then
    raise exception 'hr_l3_50: not every queue routes through the shared refusal';
  end if;

  -- decision 5: the code clients branch on is unchanged. The four queues no longer contain the
  -- literal because the helper now emits it on their behalf, so the invariant is: the helper
  -- emits it, and the four write doors (decision 6, untouched) still emit it themselves.
  if (select prosrc from pg_proc where oid = 'hr._time_not_employed_refusal(uuid,text)'::regprocedure)
     !~ 'hr_actor_not_employed' then
    raise exception 'hr_l3_50: the shared refusal no longer emits hr_actor_not_employed';
  end if;
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'hr' and p.prokind = 'f'
         and p.proname in ('attendance_exception_resolve','overtime_preapproval_create',
                           'time_adjustment_create','pay_period_transition')
         and p.prosrc ~ 'hr_actor_not_employed') <> 4 then
    raise exception 'hr_l3_50: a write door lost the hr_actor_not_employed code';
  end if;

  -- decision 4: the helper reads only the caller's own rows -- it must not join any org population
  if (select prosrc from pg_proc where oid = 'hr._time_not_employed_refusal(uuid,text)'::regprocedure)
     ~ 'organization_id' then
    raise exception 'hr_l3_50: the refusal reads organization state; it must stay non-leaking';
  end if;
end
$chk$;
