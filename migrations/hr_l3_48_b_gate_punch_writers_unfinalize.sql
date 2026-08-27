-- HR domain L3 — register item HRB-015, lane l3-punch-kiosk (BUILDER SQL-1).
--
-- The standing gate check for hr_l3_48a, so the class cannot return quietly.
--
-- A punch writer that changes the facts of a finalised week without dropping `is_final` produces a
-- payroll file built from punches that no longer count. That is not a bug anyone reports — the
-- export succeeds, the numbers look like numbers, and the money is wrong. The only defence that
-- survives the next writer being added is a structural one.
--
-- Authority: coordinator ruling (finality/export batch); the lane's standing practice of pairing
-- every fix with a blocking assertion.
--
-- Applied live as `hr_l3_48_b_gate_punch_writers_unfinalize`. Idempotent.
--
-- ── RECORDED TECHNICAL DECISIONS ────────────────────────────────────────────────────────────
-- 1. STRUCTURAL, NOT BEHAVIOURAL. It asserts that every function writing `hr.punch` also calls
--    `hr._punch_unfinalize_week` — which catches a NEW writer on the day it ships, before any row
--    has gone through it. A data check ("no final week has punches newer than its computed_at")
--    would pass for as long as nobody had used the new door yet, which is exactly the window in
--    which this defect does its damage.
-- 2. 🚨 THE PATTERNS ARE CONCATENATED, AND THAT IS LOAD-BEARING. A check whose own body contains
--    the literal `insert into hr.punch` is matched by `hr.stable_doors_that_write()`, which scans
--    `prosrc` — the conformance function is STABLE, so it would report ITSELF as a stable door that
--    writes. Check 17 did exactly that when it shipped, and check 15/16's migration records the
--    same trap on `arm_write`. Third time; the rule is now: never spell a write statement out
--    inside a gate.
-- 3. IT ALSO GUARDS THE ONE-WAY PROPERTY. Nothing outside `hr.recompute_apply` may set `is_final`
--    back to TRUE. Clearing the flag is safe in every direction — the worst case is an export that
--    waits. Setting it is the dangerous direction, because it tells the export gate that hours
--    nobody re-derived are ready to be paid.

do $mig$
declare
  v_def text;
  v_anchor text :=
    '''must refresh it too. One rollup function; every writer calls it.'');'
    || E'\n  return next;\nend';
  v_block text;
begin
  v_def := pg_get_functiondef('hr.punch_write_path_conformance()'::regprocedure);

  if position('punch_writers_unfinalize_their_week' in v_def) > 0 then
    raise notice 'hr_l3_48b: the check is already present';
    return;
  end if;
  if position(v_anchor in v_def) = 0 then
    raise exception 'hr_l3_48b: could not find the end of the conformance function; refusing to guess';
  end if;

  v_block :=
'''must refresh it too. One rollup function; every writer calls it.'');
  return next;

  ---------------------------------------------------------------- 18. a punch edit un-finalizes its week
  check_key := ''punch_writers_unfinalize_their_week'';
  -- decision 2: the write patterns are BUILT, never written out, or this check matches itself.
  select coalesce(jsonb_agg(jsonb_build_object(''fn'', n.nspname || ''.'' || p.proname)), ''[]''::jsonb)
    into v_bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = ''hr'' and p.prokind = ''f''
     and (p.prosrc ~ (''insert '' || ''into hr\.punch\y'')
          or p.prosrc ~ (''update '' || ''hr\.punch\y''))
     and p.prosrc !~ ''_punch_unfinalize_week'';
  ok       := (v_bad = ''[]''::jsonb);
  severity := ''blocking'';
  detail   := jsonb_build_object(''violations'', v_bad,
    ''why'', ''A function that changes hr.punch without dropping hr.workweek.is_final for that week ''
      || ''lets a finalised week keep its pre-edit hours. hr.punch_void did this permanently: it ''
      || ''enqueued no recompute and left the flag true, so a void between finality and export ''
      || ''shipped pre-void numbers in the payroll file, silently. There are four such writers ''
      || ''today; a fifth must un-finalize too.'');
  return next;

  ---------------------------------------------------------------- 19. only recompute may re-finalize
  check_key := ''only_recompute_marks_a_week_final'';
  select coalesce(jsonb_agg(jsonb_build_object(''fn'', n.nspname || ''.'' || p.proname)), ''[]''::jsonb)
    into v_bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = ''hr'' and p.prokind = ''f''
     and p.proname <> ''recompute_apply''
     and p.prosrc ~ (''set '' || ''is_final\s*=\s*true'');
  ok       := (v_bad = ''[]''::jsonb);
  severity := ''blocking'';
  detail   := jsonb_build_object(''violations'', v_bad,
    ''why'', ''Clearing is_final is safe in every direction -- the worst case is an export that ''
      || ''waits. SETTING it is the dangerous direction: it tells the export gate that hours ''
      || ''nobody re-derived are ready to be paid. Only hr.recompute_apply, which derives them, ''
      || ''may do it.'');
  return next;
end';

  v_def := replace(v_def, v_anchor, v_block);
  execute v_def;
end
$mig$;

-- ── self-assertions ─────────────────────────────────────────────────────────────────────────
do $chk$
declare v_n int; v_fail jsonb;
begin
  select count(*) into v_n from hr.punch_write_path_conformance();
  if v_n < 19 then
    raise exception 'hr_l3_48b: expected at least 19 checks, found %', v_n;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('check', check_key, 'detail', detail)), '[]'::jsonb)
    into v_fail from hr.punch_write_path_conformance() where not ok;
  if v_fail <> '[]'::jsonb then
    raise exception 'hr_l3_48b: the gate is red on arrival: %', v_fail::text;
  end if;

  if (select count(*) from hr.punch_write_path_conformance()
       where check_key in ('punch_writers_unfinalize_their_week','only_recompute_marks_a_week_final')
         and severity = 'blocking') <> 2 then
    raise exception 'hr_l3_48b: the new checks are missing or not blocking';
  end if;

  -- decision 2: the gate must not report itself
  if exists (select 1 from hr.stable_doors_that_write() d
              where d.door = 'hr.punch_write_path_conformance') then
    raise exception 'hr_l3_48b: the conformance function matches itself as a stable door that writes';
  end if;
end
$chk$;
