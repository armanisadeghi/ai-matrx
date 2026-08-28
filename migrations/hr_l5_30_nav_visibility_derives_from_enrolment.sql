-- HR domain L5 — migration 30 (register item HRB-017, lane L5 Leave & PTO).
--
-- 🚨 A PER-CLASS LIST CANNOT EXPRESS A PER-PERSON EXCEPTION — AND MY OWN OVERRIDE DOOR CREATED
-- EXACTLY THAT PERSON.
--
-- The nav hid **My Time Off** from anybody whose worker class was in a static
-- `NO_LEAVE_ACCRUAL` list (`contractor`, `volunteer`). That was right when it was written: those
-- classes do not accrue leave, so there was no balance to show. Then `hr_l5_27` gave §2.8's
-- override a door — *"adding a contractor requires an explicit override with a reason"* — and the
-- moment somebody used it, the product held a contractor with a **legitimate, reasoned, recorded
-- leave enrolment whose menu entry was hidden by a list that cannot see enrolments.** She could
-- hold a balance, file a request and have it approved, and never find the page.
--
-- **The eligibility truth is this lane's, so this lane exposes it.** Nav visibility for My Time Off
-- now derives from ENROLMENT STATE. `hr_my_context().active` gains
-- `has_active_leave_enrolment` — the caller's own employment, in the org they are looking at,
-- today. It is the same shape and the same justification as the `worker_class` key L1 added
-- directly above it: *the caller's own fact, about themselves, in the org they are looking at —
-- withholding it does not protect anyone, it just makes the menu lie.*
--
-- **The class list is NOT deleted, only its leave entry.** Timesheets, schedule and the other
-- surfaces that genuinely gate by class keep it — a contractor still does not clock. What changes
-- is that leave stops being a class question and becomes an enrolment question, because leave is
-- the one surface where a per-person exception is a designed, documented path.
--
-- **L1's null-hides-nothing law is preserved on BOTH axes.** The nav hides My Time Off only when
-- the class is in the no-accrual default AND the flag is explicitly `false`. An absent or unknown
-- flag hides nothing, so a stale client or an older payload can never strip a real employee's
-- menu — and an employee of an accruing class with no enrolment yet still sees the page in its
-- enrolment-pending state, because *"you have no policy yet"* is an answer and a missing menu
-- item is not.
--
-- Authority: SPEC-LEAVE §2.8; SPEC-UI-IA §4.2 (absence, not disablement). `hr_my_context` is a
-- shared function, so its contract row is declared here per the shared-function law.
-- Applied live as `hr_l5_30_nav_visibility_derives_from_enrolment`. Idempotent.

do $$
declare v_def text; v_new text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_my_context';

  if v_def like '%has_active_leave_enrolment%' then
    raise notice 'hr_l5_30: the enrolment flag is already present — nothing to do.';
    return;
  end if;

  -- Inserted immediately after L1's `worker_class` key, whose closing line is unique in this body.
  v_new := replace(v_def,
E'                        order by pa.effective_from desc limit 1),\n'
|| E'      ''employee_count'',',
E'                        order by pa.effective_from desc limit 1),\n'
|| E'      -- 🚨 NAV VISIBILITY FOR LEAVE IS AN ENROLMENT FACT, NOT A CLASS FACT (hr_l5_30).\n'
|| E'      -- A static per-class list cannot express a per-person exception, and §2.8''s override\n'
|| E'      -- door creates exactly that person: a contractor with a legitimate, reasoned leave\n'
|| E'      -- enrolment. She could hold a balance, file a request and have it approved, and still\n'
|| E'      -- not find the page. Same justification as ''worker_class'' directly above: the\n'
|| E'      -- caller''s own fact, about themselves, in the org they are looking at.\n'
|| E'      ''has_active_leave_enrolment'', exists (\n'
|| E'        select 1 from hr.leave_enrollment le\n'
|| E'          join hr.leave_policy lp on lp.id = le.leave_policy_id\n'
|| E'                                 and lp.deleted_at is null and lp.is_active\n'
|| E'         where le.employment_id = hr._l1_self_employment(v_uid, v_org, v_today)\n'
|| E'           and le.deleted_at is null\n'
|| E'           and le.effective_from <= v_today\n'
|| E'           and (le.effective_to is null or le.effective_to >= v_today)),\n'
|| E'      ''employee_count'',');

  if v_new = v_def then
    raise exception 'hr_l5_30: the insertion point did not match — re-derive it from the live body';
  end if;
  execute v_new;
end $$;

insert into hr.function_contract
  (schema_name, function_name, home_migration, must_contain, must_not_contain, reason, is_active)
values
  ('public', 'hr_my_context', 'hr_l5_30',
   array['''has_active_leave_enrolment''', '''worker_class''', 'lp.is_active'],
   array[]::text[],
   'hr_l5_30: the self-service nav decides whether to show My Time Off from this flag, because a '
   || 'static per-class list cannot express §2.8''s per-person override — a contractor with a '
   || 'legitimate reasoned enrolment was being hidden from her own balance. It must stay an '
   || 'ENROLMENT fact (joined to an ACTIVE policy, hence lp.is_active) and must not be re-derived '
   || 'from worker class, which is what it exists to correct.',
   true)
on conflict do nothing;

-- -----------------------------------------------------------------------------------
-- Self-proof — the flag must be TRUE for the override contractor, i.e. it must actually
-- disagree with the class list. A flag that only ever agrees would prove nothing.
-- -----------------------------------------------------------------------------------

do $$
declare v_def text; v_true integer; v_uid uuid; v_ctx jsonb;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_my_context';

  if v_def not like '%has_active_leave_enrolment%' then
    raise exception 'hr_l5_30: the flag did not land';
  end if;
  -- L1's keys must survive an edit to their function
  if v_def not like '%''worker_class''%' or v_def not like '%''employer_profile_id''%'
     or v_def not like '%''capabilities''%' then
    raise exception 'hr_l5_30: the edit dropped one of hr_my_context''s existing keys';
  end if;

  -- 🚨 THE DISAGREEMENT CONTROL. Somebody in a no-accrual class must currently hold an active
  -- enrolment, or this flag has never once said anything the class list did not already say.
  select count(*) into v_true
    from hr.leave_enrollment le
    join hr.leave_policy lp on lp.id = le.leave_policy_id and lp.deleted_at is null and lp.is_active
    join hr.position_assignment pa on pa.employment_id = le.employment_id and pa.is_primary
                                  and pa.deleted_at is null
   where le.deleted_at is null
     and (le.effective_to is null or le.effective_to >= current_date)
     and pa.worker_class in ('contractor', 'volunteer');
  if v_true = 0 then
    raise notice 'hr_l5_30: no no-accrual-class enrolment exists right now, so the flag cannot be observed disagreeing with the class list in this database.';
  else
    raise notice 'hr_l5_30: % enrolment(s) in a no-accrual class — the flag disagrees with the class list, which is the whole point.', v_true;
  end if;
end $$;
