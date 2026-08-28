-- HR domain L3 — register item HRB-015, lane l3-punch-kiosk (BUILDER SQL-1).
--
-- 🚨 hr_l3_69 WAS REVERTED IN THE DATABASE WHILE ITS FILE SAT COMMITTED ON `origin/main`.
--
-- Measured on re-establishing state (2026-08-28), exactly as the amendment queue suspected but for
-- a reason nobody had recorded: the retirement HAD landed — file on `origin/main`, row in
-- `public._schema_migrations`, survivor seeded — and the DATABASE had gone back:
--
--     platform.feature_knob  hr.leave / case_existence_visible_to_manager   1 row, value TRUE
--     hr.leave_calendar      still reading the struck key                   yes
--     hr.leave_calendar      reading the survivor (v_case_stmt)             no
--
-- Another lane re-created `hr.leave_calendar` from its own source and re-seeded the knob, which
-- silently discarded steps 2 and 3 of the retirement. The two-switch state was live again, and
-- nothing anywhere would have said so: the ledger row still claimed the migration was applied, and
-- the file still described the end state. A migration is not a guarantee in a database many lanes
-- write to — only an assertion that runs on every gate is.
--
-- This is why the check exists rather than a third re-application. Re-applying hr_l3_69 (done)
-- fixes today; check 30 is what makes the next revert fail a release instead of a manager quietly
-- scheduling over an approved leave.
--
-- Authority: SPEC-LEAVE §9.6 ("one switch and only one", the struck knob named); SPEC-UI-IA §10's
-- declared `leave cases: on`; hr_l3_69's retirement.
--
-- Applied live as `hr_l3_77_gate_one_switch_for_the_existence_disclosure`. Idempotent.
--
-- ── RECORDED TECHNICAL DECISIONS ────────────────────────────────────────────────────────────
-- 1. THE CHECK ASSERTS THE WHOLE END STATE, NOT JUST THE DROP. A revert can arrive in four
--    distinguishable shapes and only one of them is "the row came back": the calendar can start
--    reading the struck key again, it can stop reading the survivor, the sentence can be re-inlined
--    as a literal, or the survivor's own entry can be cleared — which would retire the switch and
--    turn the disclosure OFF, the precise failure the ordered pair exists to prevent. All four are
--    asserted, because a partial revert is what actually happened.
-- 2. THE SURVIVOR'S SEED IS ASSERTED AS PRESENT, NOT AS EQUAL TO A STRING. An org overrides the
--    wording at rung 1 and SHOULD; the platform floor must merely exist and be non-empty. Asserting
--    the exact sentence would turn a lawful org override into a red gate.
-- 3. TOKENS ARE CONCATENATED. A literal `case_existence_visible_to_manager` in this check's own
--    body would make the conformance function match its own grep — the self-matching-assertion trap
--    this lane has now hit five times.

begin;

do $mig$
declare
  v_def text := pg_get_functiondef('hr.punch_write_path_conformance()'::regprocedure);
  v_new text;
begin
  v_def := regexp_replace(v_def, E'\\n  -{10,} 30\\. .*(?=\\nend\\n)', '', '');

  v_new := E'\n'
  || E'  ---------------------------------------------------------------- 30. one switch for the existence disclosure\n'
  || E'  check_key := ''existence_disclosure_has_one_switch'';\n'
  || E'  select coalesce(jsonb_agg(jsonb_build_object(''what'', d.what) order by d.what), ''[]''::jsonb)\n'
  || E'    into v_bad\n'
  || E'    from (\n'
  || E'      select ''the struck knob row is back in platform.feature_knob''::text as what\n'
  || E'       where exists (select 1 from platform.feature_knob\n'
  || E'                      where feature = ''hr.leave''\n'
  || E'                        and key = (''case_existence_visible'' || ''_to_manager''))\n'
  || E'      union all\n'
  || E'      select ''hr.leave_calendar reads the struck knob again''\n'
  || E'       where exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace\n'
  || E'                      where n.nspname = ''hr'' and p.proname = ''leave_calendar''\n'
  || E'                        and p.prosrc ~ (''case_existence_visible'' || ''_to_manager''))\n'
  || E'      union all\n'
  || E'      select ''hr.leave_calendar no longer resolves the statement through the survivor''\n'
  || E'       where not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace\n'
  || E'                          where n.nspname = ''hr'' and p.proname = ''leave_calendar''\n'
  || E'                            and p.prosrc ~ ''v_case_stmt'')\n'
  || E'      union all\n'
  || E'      select ''the section 9.6 sentence is hardcoded in hr.leave_calendar again''\n'
  || E'       where exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace\n'
  || E'                      where n.nspname = ''hr'' and p.proname = ''leave_calendar''\n'
  || E'                        and p.prosrc ~ ''This person has an approved leave'')\n'
  || E'      union all\n'
  || E'      select ''the survivor carries no leave_case statement, so the disclosure is OFF''\n'
  || E'       where coalesce((select nullif(coalesce(value, default_value) -> ''leave_case'' ->> ''statement'', '''')\n'
  || E'                         from platform.feature_knob\n'
  || E'                        where feature = ''hr.employees''\n'
  || E'                          and key = ''disclosure_existence_statements''), '''') = ''''\n'
  || E'    ) d;\n'
  || E'  ok       := (v_bad = ''[]''::jsonb);\n'
  || E'  severity := ''blocking'';\n'
  || E'  detail   := jsonb_build_object(\n'
  || E'    ''violations'', v_bad,\n'
  || E'    ''why'', ''SPEC-LEAVE 9.6 governs the existence disclosure with ONE switch and strikes ''\n'
  || E'      || ''hr.leave.case_existence_visible_to_manager. hr_l3_69 retired it in the required ''\n'
  || E'      || ''order -- seed the survivor first, then drop -- because the struck knob defaulted ''\n'
  || E'      || ''TRUE and was the switch turning the statement ON, while the survivor was empty. ''\n'
  || E'      || ''That retirement was then REVERTED in the database while its file sat committed on ''\n'
  || E'      || ''main and its ledger row still claimed success: another lane re-created ''\n'
  || E'      || ''hr.leave_calendar from its own source and re-seeded the knob. Nothing said so. ''\n'
  || E'      || ''All four revert shapes are asserted here, including the survivor being cleared, ''\n'
  || E'      || ''which would retire the switch and turn the disclosure OFF -- the exact failure the ''\n'
  || E'      || ''ordered pair exists to prevent, and the one a manager experiences as scheduling ''\n'
  || E'      || ''over an approved leave they were never told about.'');\n'
  || E'  return next;\n';

  v_def := regexp_replace(v_def, E'(?=\\nend\\n)', v_new, '');
  execute v_def;
end
$mig$;

do $chk$
declare v_n integer; v_30 boolean;
begin
  select count(*) into v_n from hr.punch_write_path_conformance();
  select ok into v_30 from hr.punch_write_path_conformance()
   where check_key = 'existence_disclosure_has_one_switch';
  if v_n <> 30 then
    raise exception 'hr_l3_77: expected 30 checks, found %', v_n;
  end if;
  if v_30 is null then
    raise exception 'hr_l3_77: check 30 did not install';
  end if;
  if not v_30 then
    raise exception 'hr_l3_77: check 30 is failing — the retirement is not in its end state';
  end if;
  if (select count(*) from hr.punch_write_path_conformance() where not ok) <> 0 then
    raise exception 'hr_l3_77: another conformance check is failing';
  end if;
end
$chk$;

commit;
