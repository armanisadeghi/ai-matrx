-- hr_l1_34_no_painted_on_doors.sql
--
-- T-L1-9 / T-13: the contractor's blocked clock state is CORRECT — she does not clock in,
-- her time is invoiced through her engagement — but the door it offered was painted on.
-- `hr.clock_state` emitted a self-service engagement path that was NEVER BUILT and 404d.
-- A second door on the no-employment branch was dead the same way.
--
-- Where the right destination comes from, rather than a guess:
--   · SPEC-UI-IA §3.1 enumerates the self-service routes (1–9b). Neither dead path is
--     among them. "Engagement" in that spec is the ORG-WIDE announcements/pulse/
--     recognition area at /hr/engagement (routes 64a–64d) — a different feature entirely.
--   · SPEC-EMPLOYEES §2.3.3 puts `hr.engagement` — the marketplace of record and the
--     platform id — on the Job & reporting tab, which is also where employment truth
--     renders. In the product that is `JobTab.tsx`'s `Engagements` block, reachable for
--     the subject at `/hr/me?tab=job` (the route reads `?tab=`).
--
-- So this re-points the emitter at a surface that exists and already owns the truth the
-- message refers to. No new route is invented: SPEC-UI-IA does not name one, and adding
-- an unspecified self-service route to satisfy a link would be the tail wagging the spec.
--
-- 🚨 THE DEAD PATHS ARE NAMED ONLY IN THE CONTRACT ROW, DELIBERATELY. Writing them into
-- the function's comments would re-create them as matchable strings in `prosrc` — the
-- same way a schema-qualified name in a comment turned F1 red in hr_l1_32. The contract's
-- `must_not_contain` is the right home for a string we want to keep OUT.
--
-- Applied live 2026-08-28 and ledgered.

do $mig$
declare v_def text; v_new text;
begin
  v_def := pg_get_functiondef('hr.clock_state(uuid)'::regprocedure);
  if position('A DOOR IS A PROMISE THAT A PLACE EXISTS' in v_def) > 0 then
    raise notice 'hr_l1_34: already applied'; return;
  end if;

  v_new := replace(v_def,
$a1$        'door', '/hr/me/engagement'));$a1$,
$r1$        -- 🚨 A DOOR IS A PROMISE THAT A PLACE EXISTS, AND THIS ONE WAS PAINTED ON.
        -- The blocked state is right — a contractor does not clock in — but the door it
        -- offered pointed at a self-service engagement route that was NEVER BUILT, and
        -- 404d. SPEC-UI-IA §3.1 enumerates the self-service routes (1-9b) and no such
        -- route is among them; "Engagement" in that spec is the org-wide announcements
        -- and pulse area, a different thing entirely. Per SPEC-EMPLOYEES §2.3.3 the
        -- contractor's engagement — the marketplace of record and the platform id —
        -- renders on the Job & reporting tab, so that is where somebody told "your time
        -- is invoiced through your engagement" should land. Sending them to a 404
        -- instead makes the explanation unverifiable by the person it is aimed at.
        -- (The dead paths are named only in this function's contract row, deliberately:
        -- writing them here would re-create them as matchable strings in the source.)
        'door', '/hr/me?tab=job'));$r1$);
  if v_new = v_def then raise exception 'hr_l1_34: engagement door anchor not found'; end if;

  -- The sibling door on the no-employment branch is dead the same way.
  v_new := replace(v_new,
$a2$       'door', '/hr/me/employment'));$a2$,
$r2$       -- Same class as the door above: that route was never built either.
       'door', '/hr/me?tab=job'));$r2$);

  execute v_new;
end $mig$;

do $verify$
declare v_src text;
begin
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'clock_state';
  if v_src ~ '/hr/me/engagement' then raise exception 'hr_l1_34: dead engagement door survived'; end if;
  if v_src ~ '/hr/me/employment' then raise exception 'hr_l1_34: dead employment door survived'; end if;
  if v_src !~ 'Contractors do not clock in' then raise exception 'hr_l1_34: blocked message lost'; end if;
  if v_src !~ '/hr/me\?tab=job' then raise exception 'hr_l1_34: live door missing'; end if;
end $verify$;

-- STANDING LAW: a fix to a shared hr function declares its contract in the same migration.
insert into hr.function_contract
  (schema_name, function_name, home_migration, must_contain, must_not_contain, reason)
values ('hr', 'clock_state', 'hr_l1_34_no_painted_on_doors.sql',
        array['/hr/me?tab=job', 'Contractors do not clock in'],
        array['/hr/me/engagement', '/hr/me/employment'],
        'Every door this function emits must be a route that exists. The two paths in '
        || 'must_not_contain were never built and 404d; SPEC-UI-IA 3.1 lists no self-service '
        || 'engagement route, and per SPEC-EMPLOYEES 2.3.3 engagement and employment truth '
        || 'render on the Job & reporting tab. Re-pointing a door needs a route that exists.')
on conflict do nothing;
