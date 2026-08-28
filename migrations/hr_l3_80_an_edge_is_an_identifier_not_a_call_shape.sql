-- HR domain L3 — register item HRB-015, lane l3-punch-kiosk (BUILDER SQL-1).
--
-- 🚨 hr_l1_38 FIXED A REAL FALSE POSITIVE AND BOUGHT A FALSE NEGATIVE. MEASURED, NOT ARGUED.
--
-- The prefix bug L1 found was real: a bare substring edge matched the writer FUNCTION
-- `hr.leave_enroll` inside a plain read of the TABLE `hr.leave_enrollment`, and F1 reported a reach
-- that cannot exist because a table is not callable. Their fix required the name to be followed by
-- `[[:space:]]*\(` — call-shaped. Run against the live post-hr_l1_38 detector, the four shapes give:
--
--   1 comment-only mention      -> 0 edges   PASS (hr_l3_78's strip)
--   2 real call                 -> 1 edge    PASS
--   3 DYNAMIC call via format() -> 0 edges   *** FAIL — a real writer reach, now invisible ***
--   4 prefix of a table name    -> 0 edges   PASS (their fix)
--
-- Shape 3 is `execute format('select %s($1)', 'hr.wf_request')`, which is how this codebase builds
-- a large share of its calls. There the callee's name sits inside a STRING LITERAL and is followed
-- by a quote, never a paren — so a call-shaped matcher cannot see it. That is the exact trade
-- hr_l3_78's falsification rejected with proof, and it is the worse half of the trade: an
-- over-firing detector is an annoyance somebody investigates, while a detector that cannot see a
-- writer reach is the defect F1 exists to prevent, and it fails silently.
--
-- THE MATCHER THAT SATISFIES ALL FOUR: identifier-boundary. The writer's name must not be followed
-- by another identifier character. `hr.leave_enroll` inside `hr.leave_enrollment` is followed by
-- `m` and does not match (kills the prefix bug); `hr.wf_request(` is followed by `(` and matches;
-- `'hr.wf_request'` is followed by `'` and matches (keeps literal reach into format strings).
--
-- Authority: coordinator ruling (review of hr_l1_38 at the changer's request); hr_l3_78's
-- no-false-negative bar; hr_l3_15's F1 invariant.
--
-- Applied live as `hr_l3_80_an_edge_is_an_identifier_not_a_call_shape`. Idempotent.
--
-- ── RECORDED TECHNICAL DECISIONS ────────────────────────────────────────────────────────────
-- 1. THE MATCHER BECOMES A NAMED FUNCTION, WHICH IS WHAT MAKES IT TESTABLE WITHOUT DDL.
--    `hr._names_a_call(code, qname)` holds the one regex. The conformance gate is STABLE and
--    therefore cannot create fixture functions to test a matcher — but it CAN apply a named
--    predicate to literal sample text. Factoring it out is what turns a migration-time proof into
--    a standing assertion (check 32), which is the ruling's point 3.
-- 2. LEADING BOUNDARY KEEPS `.` EXCLUDED, TRAILING BOUNDARY DOES NOT. Leading `[^a-zA-Z0-9_.]`
--    stops `other.hr.foo` from matching `hr.foo`. Trailing is `[^a-zA-Z0-9_]` WITHOUT the dot,
--    because a legitimate qualified call can be followed by a dot in composite access, and because
--    excluding it would re-break shape 3 for any format string ending the name at a period.
-- 3. 🚨 THE KNOWN RESIDUAL, STATED RATHER THAN LEFT TO BE REDISCOVERED. Identifier-boundary still
--    cannot distinguish a FUNCTION `hr.x` from a TABLE `hr.x` of the same name, nor a writer named
--    only in a string that is data rather than SQL. Both are false POSITIVES — the safe direction,
--    and the direction hr_l3_78 chose deliberately. No live pair collides today; if one ever does,
--    the answer is a real lexer, not a narrower regex that trades the bite away again.
-- 4. THE QUADRUPLE BECOMES A STANDING CHECK, NOT A MIGRATION-TIME PROOF. A proof that runs once
--    protects the matcher that existed that day. hr_l1_38 shipped exactly such a proof — a
--    synthetic door really calling a writer still edged — and it was true, and it still missed
--    shape 3 because shape 3 was not among the shapes it asserted. Check 32 asserts all four on
--    every gate run, so the NEXT matcher edit re-faces them automatically instead of re-deriving
--    which shapes matter.

begin;

-- ── decision 1: the matcher, named and applied to text ──────────────────────────────────────
create or replace function hr._names_a_call(p_code text, p_qname text)
returns boolean
language sql
immutable
as $fn$
  -- decision 2: leading boundary excludes '.', trailing boundary does not
  select coalesce(p_code, '') ~ ('(^|[^a-zA-Z0-9_.])' || replace(p_qname, '.', '\.')
                                 || '($|[^a-zA-Z0-9_])');
$fn$;

revoke all on function hr._names_a_call(text, text) from public;
revoke all on function hr._names_a_call(text, text) from anon;

do $mig$
declare v_def text := pg_get_functiondef('hr.stable_doors_that_write()'::regprocedure);
begin
  if position('_names_a_call' in v_def) > 0 then
    return;                                     -- already on the boundary matcher
  end if;
  if v_def !~ 'and f\.code ~ \(' then
    raise exception 'hr_l3_80: the edge predicate is not in the expected shape — refusing to guess';
  end if;
  -- replace the whole predicate line: the escaping inside it is too fragile to match exactly
  v_def := regexp_replace(v_def, 'and f\.code ~ \([^\n]*',
                          'and hr._names_a_call(f.code, w.qname)', '');
  execute v_def;
end
$mig$;

-- ── decision 4: check 32, the four shapes, asserted on every run ─────────────────────────────
do $mig$
declare
  v_def text := pg_get_functiondef('hr.punch_write_path_conformance()'::regprocedure);
  v_new text;
begin
  v_def := regexp_replace(v_def, E'\\n  -{10,} 32\\. .*(?=\\nend\\n)', '', '');

  v_new := E'\n'
  || E'  ---------------------------------------------------------------- 32. the edge matcher still sees all four shapes\n'
  || E'  check_key := ''edge_matcher_sees_every_call_shape'';\n'
  || E'  select coalesce(jsonb_agg(jsonb_build_object(\n'
  || E'           ''shape'', s.shape, ''expected'', s.expected, ''actual'', s.actual,\n'
  || E'           ''direction'', case when s.expected then ''FALSE NEGATIVE: a real writer reach is invisible''\n'
  || E'                              else ''false positive: a non-call invents an edge'' end)\n'
  || E'           order by s.shape), ''[]''::jsonb)\n'
  || E'    into v_bad\n'
  || E'    from (\n'
  || E'      select ''1 comment-only mention''::text as shape, false as expected,\n'
  || E'             hr._names_a_call(hr._strip_sql_comments(''  -- reaches hr.wf_request here''), ''hr.wf_request'') as actual\n'
  || E'      union all\n'
  || E'      select ''2 direct call'', true,\n'
  || E'             hr._names_a_call(''perform hr.wf_request(a, b);'', ''hr.wf_request'')\n'
  || E'      union all\n'
  || E'      select ''3 dynamic call built by format()'', true,\n'
  || E'             hr._names_a_call(''execute format(''''select %s($1)'''', ''''hr.wf_request'''');'', ''hr.wf_request'')\n'
  || E'      union all\n'
  || E'      select ''4 writer name is a prefix of a table name'', false,\n'
  || E'             hr._names_a_call(''select count(*) from hr.leave_enrollment'', ''hr.leave_enroll'')\n'
  || E'    ) s\n'
  || E'   where s.expected <> s.actual;\n'
  || E'  ok       := (v_bad = ''[]''::jsonb);\n'
  || E'  severity := ''blocking'';\n'
  || E'  detail   := jsonb_build_object(\n'
  || E'    ''violations'', v_bad,\n'
  || E'    ''why'', ''F1''''s edge matcher has now been changed twice, and each change fixed one shape ''\n'
  || E'      || ''while breaking another. A bare substring matched a writer name inside a TABLE name ''\n'
  || E'      || ''(hr.leave_enroll in hr.leave_enrollment) and invented edges; requiring a following ''\n'
  || E'      || ''paren fixed that and went BLIND to dynamic calls, where the callee sits in a string ''\n'
  || E'      || ''literal built by format() and is followed by a quote. Identifier-boundary matching ''\n'
  || E'      || ''satisfies all four. These four shapes are asserted on EVERY run rather than proven ''\n'
  || E'      || ''once at migration time, because a one-time proof protects only the matcher that ''\n'
  || E'      || ''existed that day -- which is precisely how shape 3 was lost. A failure with ''\n'
  || E'      || ''expected=true is a FALSE NEGATIVE and is the serious direction: an over-firing ''\n'
  || E'      || ''detector gets investigated, a blind one lets a STABLE door write in silence.'');\n'
  || E'  return next;\n';

  v_def := regexp_replace(v_def, E'(?=\\nend\\n)', v_new, '');
  execute v_def;
end
$mig$;

-- ── the contract rows follow the machinery (ruling point 4) ─────────────────────────────────
insert into hr.function_contract
  (schema_name, function_name, home_migration, must_contain, must_not_contain, reason)
values
  ('hr','stable_doors_that_write','hr_l3_80',
   array['_strip_sql_comments','_names_a_call'],
   '{}',
   'F1''s detector needs BOTH halves: comments stripped (hr_l3_78, or prose invents edges) and the '
   || 'identifier-boundary matcher (hr_l3_80, or it either matches table-name prefixes or goes blind '
   || 'to format()-built calls). Losing either half fails silently in one direction or the other.'),
  ('hr','_names_a_call','hr_l3_80',
   array['[^a-zA-Z0-9_]'],
   array['[[:space:]]*'],
   'The edge matcher must be IDENTIFIER-BOUNDARY, never call-shaped. Requiring a following paren '
   || 'makes it blind to execute format(...) calls, where the callee is inside a string literal — '
   || 'measured live as shape 3 of check 32.')
on conflict (schema_name, function_name, home_migration) do update
  set must_contain = excluded.must_contain,
      must_not_contain = excluded.must_not_contain,
      reason = excluded.reason,
      is_active = true;

-- supersede the older contract row that named only the strip
update hr.function_contract
   set is_active = false
 where schema_name = 'hr' and function_name = 'stable_doors_that_write'
   and home_migration = 'hr_l3_78';

do $chk$
declare v_n integer; v_32 boolean;
begin
  select count(*) into v_n from hr.punch_write_path_conformance();
  select ok into v_32 from hr.punch_write_path_conformance()
   where check_key = 'edge_matcher_sees_every_call_shape';
  if v_n <> 32 then
    raise exception 'hr_l3_80: expected 32 checks, found %', v_n;
  end if;
  if v_32 is null or not v_32 then
    raise exception 'hr_l3_80: check 32 missing or failing';
  end if;
  -- the prefix bug L1 found must STAY fixed, and the dynamic shape must be back
  if hr._names_a_call('select count(*) from hr.leave_enrollment', 'hr.leave_enroll') then
    raise exception 'hr_l3_80: the table-prefix false positive returned';
  end if;
  if not hr._names_a_call($$execute format('select %s($1)', 'hr.wf_request');$$, 'hr.wf_request') then
    raise exception 'hr_l3_80: still blind to the dynamic call';
  end if;
  if (select count(*) from hr.punch_write_path_conformance() where not ok) <> 0 then
    raise exception 'hr_l3_80: another conformance check is failing';
  end if;
end
$chk$;

commit;
