-- hr_l1_75a — THE REPORTER SUBTRACTION HAD TO ASK WHETHER THE SUBJECT IS EXCLUDED.
--
-- RECORD of a live change applied on 2026-08-30 to db.matrxserver.com.
-- Ledger: public._schema_migrations (source 'matrx-frontend'). Sub-step of slot hr_l1 #0075.
--
-- 🚨 FOUND BY THE FALSIFICATION WALK hr_l1_75 WAS WRITTEN TO PASS, WHICH IS THE ONLY REASON IT
-- WAS FOUND AT ALL. hr_l1_75 made `hr._incident_excluded_actors_refresh` honour
-- `subject_excluded = false`, its own asserts passed, and the safety subject STILL could not read
-- their own record. The trigger was not the last place that decision is made.
--
-- ── WHAT WAS ACTUALLY WRONG ───────────────────────────────────────────────────────────────────
--
-- `hr.incident_excluded` materialises one exception, documented in its own header: the trigger
-- puts the REPORTER in `excluded_actor_ids` (so that the reporter's MANAGER lands there too — the
-- "I reported my own manager" leak), and this function then SUBTRACTS the reporter, because §5
-- gives the identified reporter `hr_incident_status` by name. The subtraction carried a guard:
--
--     and ( x is distinct from i.reporter_employment_id
--           or x = i.subject_employment_id                      -- ← this line
--           or exists (… an `accused` party row …) )
--
-- "…unless they are also the subject" was WRITTEN WHEN EVERY SUBJECT WAS AN EXCLUDED SUBJECT. It
-- means "a person who reports a case about themselves does not get to read it by being the
-- reporter", which is exactly right for a complaint — and exactly wrong for the case §4.9b C3
-- names, where a person reports a near miss they were involved in and `subject_excluded` is
-- FALSE. Walked live on 2026-08-30: Tomo, an employee with zero capabilities, filed a `safety`
-- incident about himself; the door refused him with the full §5 sentence — subject-excluded veto,
-- audited as a denial, on a record whose `subject_excluded` column says false and whose exclusion
-- array (post-hr_l1_75) does not contain him as a SUBJECT at all. He was vetoed for being the
-- REPORTER of his own report.
--
-- The guard now asks the flag, which is what it always meant:
--
--     or (i.subject_excluded and x = i.subject_employment_id)
--
-- ── WHY THIS CANNOT WEAKEN THE CORE ───────────────────────────────────────────────────────────
--
-- The clause is reached ONLY for a caller who is the reporter. For every kind where the exclusion
-- matters, `i.subject_excluded` is TRUE and the expression is byte-for-byte what it was:
-- `hr_incident_create` platform-locks it true for harassment, discrimination and ethics (the
-- payload key is not even consulted on that branch — the walk proves it, filing one with
-- `subject_excluded: false` and getting `subject_excluded: true, exclusion_locked: true` back),
-- and defaults it true for `complaint` under an org knob scoped to "other kinds only".
--
-- The other two arms are untouched and they are the ones that carry the weight:
--   · an `accused` party is vetoed unconditionally, reporter or not, on every incident;
--   · every non-reporter in the array — the subject of an excluded case, and every party's
--     manager — never reaches this clause at all.
--
-- PART 3 falsifies both directions per row over the live table, and the walk re-runs after.
--
-- Idempotent: CREATE OR REPLACE only. Re-running is a no-op.
-- ══════════════════════════════════════════════════════════════════════════════════════════════

create or replace function hr.incident_excluded(p_user uuid, p_incident uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to 'hr', 'public'
as $function$
  -- 🚨 THE MATERIALISED ARRAY IS WIDER THAN §5's VETO, AND THE DIFFERENCE IS THE REPORTER.
  -- hr._incident_excluded_actors_refresh materialises the subject (when `subject_excluded`),
  -- the REPORTER, every `accused` party, and each of their managers. §5's veto is "the
  -- subject_employment_id or a respondent party" — the reporter is NOT in it, and must not be:
  -- §5 gives the identified reporter hr_incident_status by name, and a probe caught this
  -- function refusing the reporter their own case status. So the fast array-membership test is
  -- kept (§5 requires it: "an array membership test, not a join") and the reporter is
  -- subtracted UNLESS they are an accused party, or they are the subject OF A CASE WHOSE
  -- SUBJECT IS EXCLUDED. Everyone else the trigger adds — the parties' managers — stays vetoed,
  -- which is correct and wider than the spec text: a party's own manager is the classic leak in
  -- a complaint about a manager.
  --
  -- 🚨 `i.subject_excluded and` IS LOAD-BEARING AND WAS ADDED BY hr_l1_75a. Without it, a person
  -- who reports a near miss THEY WERE INVOLVED IN is vetoed from their own record — the exact
  -- forklift case §4.9b C3 defaults `subject_excluded` FALSE for, and the one where the person
  -- involved is the only one who can explain what happened. Dropping the flag from this line
  -- does not "tighten" anything: on every kind where the exclusion matters the flag is true (and
  -- platform-locked true for harassment / discrimination / ethics), so removing it changes
  -- nothing except re-breaking safety reporting.
  select exists (
    select 1
      from hr.incident i,
           lateral unnest(i.excluded_actor_ids) x
     where i.id = p_incident
       and i.deleted_at is null
       and x = any(hr.employments_of(p_user, coalesce(i.occurred_at::date, current_date)))
       and ( x is distinct from i.reporter_employment_id
             or (i.subject_excluded and x = i.subject_employment_id)
             or exists (select 1 from hr.incident_party ip
                         where ip.incident_id = i.id and ip.employment_id = x
                           and ip.party_role = 'accused' and ip.deleted_at is null) ));
$function$;

-- ──────────────────────────────────────────────────────────────────────────────────────────────
-- PART 2 — CONTRACT PIN. This is the core; the clause is pinned by its exact text.
-- ──────────────────────────────────────────────────────────────────────────────────────────────
insert into hr.function_contract
  (schema_name, function_name, home_migration, must_contain, must_not_contain, reason, is_active)
values
  ('hr', 'incident_excluded', 'hr_l1_75a',
   array['(i.subject_excluded and x = i.subject_employment_id)',
         'ip.party_role = ''accused''',
         'x is distinct from i.reporter_employment_id'],
   array['or x = i.subject_employment_id
             or exists'],
   'hr_l1_75a: §5''s absolute veto, and the ONE exception it carries. The accused arm and the '
   || 'reporter-subtraction arm are pinned by text because between them they are the whole '
   || 'function. The banned string is the pre-hr_l1_75a clause: an unconditional '
   || '"unless they are also the subject" vetoes the reporter of a NON-excluded safety incident '
   || 'from their own record, which is what shipped and what a live walk caught. Anyone widening '
   || 'this must re-run that walk in both directions: the harassment subject stays out '
   || 'absolutely, the safety subject reads their own record.',
   true)
on conflict (schema_name, function_name, home_migration) do update
   set must_contain     = excluded.must_contain,
       must_not_contain = excluded.must_not_contain,
       reason           = excluded.reason,
       is_active        = true;

-- ──────────────────────────────────────────────────────────────────────────────────────────────
-- PART 3 — FALSIFICATION, BOTH DIRECTIONS, PER ROW, OVER THE LIVE TABLE.
-- ──────────────────────────────────────────────────────────────────────────────────────────────
do $$
declare v_bad int; v_broken int; v_checked int;
begin
  -- 1. EVERY EXCLUDED SUBJECT IS STILL VETOED — including one who is also the reporter, which is
  --    the only shape this migration touches. Evaluated through the real function, per row.
  select count(*) into v_bad
    from hr.incident i
    join hr.employee e on e.id = (select em.employee_id from hr.employment em
                                   where em.id = i.subject_employment_id)
   where i.subject_excluded
     and i.deleted_at is null
     and e.login_user_id is not null
     and not hr.incident_excluded(e.login_user_id, i.id);
  if v_bad > 0 then
    raise exception 'hr_l1_75a: % excluded subject(s) can now reach their own case. REFUSING.', v_bad;
  end if;

  -- 2. EVERY ACCUSED PARTY IS STILL VETOED, on excluded and non-excluded incidents alike.
  select count(*) into v_bad
    from hr.incident_party ip
    join hr.incident i on i.id = ip.incident_id and i.deleted_at is null
    join hr.employment em on em.id = ip.employment_id
    join hr.employee e on e.id = em.employee_id
   where ip.party_role = 'accused' and ip.deleted_at is null
     and e.login_user_id is not null
     and not hr.incident_excluded(e.login_user_id, i.id);
  if v_bad > 0 then
    raise exception 'hr_l1_75a: % accused part(ies) can now reach their case. REFUSING.', v_bad;
  end if;

  -- 3. THE FIX FIRED. A reporter who is the subject of a NON-excluded incident, and is not an
  --    accused party, must NOT be vetoed.
  select count(*) into v_bad
    from hr.incident i
    join hr.employment em on em.id = i.reporter_employment_id
    join hr.employee e on e.id = em.employee_id
   where not i.subject_excluded
     and i.deleted_at is null
     and i.reporter_employment_id = i.subject_employment_id
     and e.login_user_id is not null
     and not exists (select 1 from hr.incident_party ip
                      where ip.incident_id = i.id and ip.employment_id = em.id
                        and ip.party_role = 'accused' and ip.deleted_at is null)
     and hr.incident_excluded(e.login_user_id, i.id);
  if v_bad > 0 then
    raise exception 'hr_l1_75a: % safety subject(s) are STILL vetoed from their own record.', v_bad;
  end if;

  select count(*) into v_checked from hr.incident where deleted_at is null;
  raise notice 'hr_l1_75a: veto re-falsified over % live incident(s), both directions.', v_checked;

  select count(*) into v_broken from hr.function_contracts_broken();
  if v_broken > 0 then
    raise exception 'hr_l1_75a: % contract(s) broken', v_broken;
  end if;
end $$;
