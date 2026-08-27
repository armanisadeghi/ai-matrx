-- HR domain L3 — register item HRB-015, lane l3-punch-kiosk (BUILDER SQL-1).
--
-- The standing check for hr_l3_54's lesson: a rule may not test a value the database cannot store.
--
-- Three seeded rules gated on `flsa_status eq "non_exempt"` while the live CHECK permits only
-- `exempt` / `nonexempt`, so overtime had never applied to anybody — and the executable fixture
-- suite went GREEN throughout, because nine fixtures asserted the same unstorable token in their
-- facts. Rule and test agreed with each other and neither agreed with the database.
--
-- That is the failure this check exists for, and it is not specific to `flsa_status`: any
-- applicability predicate naming a value outside its column's CHECK is a rule that silently never
-- fires. The allowed sets are read FROM the live constraints at check time, so the check cannot
-- drift from the schema it is policing.
--
-- Authority: coordinator ruling (vocabulary fix); SPEC-DATA-MODEL (vocabulary);
-- SPEC-JURISDICTION §6.1 (fixtures gate rule promotion).
--
-- Applied live as `hr_l3_55_gate_rule_vocabulary_is_storable`. Idempotent.
--
-- ── RECORDED TECHNICAL DECISIONS ────────────────────────────────────────────────────────────
-- 1. THE ALLOWED SET IS PARSED FROM THE LIVE CHECK, NEVER LISTED HERE. Hardcoding
--    `{'exempt','nonexempt'}` would make this check a second place to forget — the exact disease it
--    is treating. It reads `pg_get_constraintdef` and extracts the quoted literals, so the day
--    somebody adds a third worker class the check follows without being edited.
-- 2. IT COVERS BOTH SIDES, BECAUSE ONE SIDE ALONE PROVES NOTHING. Rules AND fixture facts are
--    scanned. Checking only the rules would have passed happily while the fixtures went on
--    asserting a token no record can hold; checking only the fixtures would have missed the rules.
--    The whole defect was the two agreeing with each other.
-- 3. SUPERSEDED ROWS ARE EXEMPT, DELIBERATELY. The three corrected originals still carry
--    `non_exempt` and always will — that is what makes a snapshot citing them readable. They are
--    out of the resolver and out of the exclusion constraint, so they are out of this check too.
--    Scanning them would force a choice between a red gate forever and rewriting history.
-- 4. `in` AND `eq` ARE BOTH UNPACKED. An applicability clause carries either a scalar value or an
--    array of them; a check that only understood `eq` would have caught the flsa_status defect and
--    missed the identical mistake in the `worker_class in [...]` clause sitting beside it.
-- 5. TWO FACTS TODAY, EXTENSIBLE BY ONE ROW. `flsa_status` and `worker_class` are the two
--    applicability facts that map onto a CHECK-constrained column. The map is a VALUES list; a
--    third fact is one line, and the check reports which facts it covered so the gap is visible
--    rather than assumed.

-- ── 1. the drift finder (decisions 1–4) ─────────────────────────────────────────────────────
create or replace function hr.rule_vocabulary_drift()
returns table(source text, row_id uuid, label text, fact text, bad_value text, allowed text[])
language sql stable security definer set search_path to 'hr','public'
as $fn$
  with covered(fact, conname) as (values
    -- decision 5: one row per applicability fact that maps onto a CHECK-constrained column
    ('flsa_status',  'position_assignment_flsa_status_check'),
    ('worker_class', 'position_assignment_worker_class_check')
  ), allowed as (
    -- decision 1: read from the live constraint, never listed here
    select c.fact,
           array_agg(m[1] order by m[1]) vals
      from covered c
      join pg_constraint pc on pc.conname = c.conname
                           and pc.conrelid = 'hr.position_assignment'::regclass
      cross join lateral regexp_matches(pg_get_constraintdef(pc.oid), '''([a-z_]+)''::text', 'g') m
     group by c.fact
  ), rule_vals as (
    -- decision 4: unpack scalar `eq` and array `in` alike; decision 3: live rules only
    select 'jurisdiction_rule'::text src, r.id, rc.slug || ' / ' || r.jurisdiction_key lbl,
           cl ->> 'fact' fact,
           coalesce(av #>> '{}', cl ->> 'value') val
      from hr.jurisdiction_rule r
      join hr.jurisdiction_rule_class rc on rc.id = r.rule_class_id
      cross join lateral jsonb_array_elements(r.applicability) cl
      left join lateral jsonb_array_elements(
        case when jsonb_typeof(cl -> 'value') = 'array' then cl -> 'value' else '[]'::jsonb end) av on true
     where r.deleted_at is null and r.status <> 'superseded'
  ), fixture_vals as (
    select 'jurisdiction_rule_test'::text, t.id, t.code,
           c.fact, t.facts ->> c.fact
      from hr.jurisdiction_rule_test t
      cross join covered c
     where t.deleted_at is null and t.facts ? c.fact
  ), all_vals as (
    select * from rule_vals union all select * from fixture_vals
  )
  select v.src, v.id, v.lbl, v.fact, v.val, a.vals
    from all_vals v
    join allowed a on a.fact = v.fact
   where v.val is not null
     and not (v.val = any(a.vals))
   order by v.src, v.lbl, v.fact;
$fn$;

revoke execute on function hr.rule_vocabulary_drift() from public, anon;

-- ── 2. wire it into the standing gate ───────────────────────────────────────────────────────
do $mig$
declare
  v_def text;
  v_anchor text := 'never as "can role X do Y".'');' || E'\n  return next;\nend';
  v_block text;
begin
  v_def := pg_get_functiondef('hr.punch_write_path_conformance()'::regprocedure);

  if position('rule_vocabulary_is_storable' in v_def) > 0 then
    raise notice 'hr_l3_55: the check is already wired';
    return;
  end if;
  if position(v_anchor in v_def) = 0 then
    raise exception 'hr_l3_55: could not find the end of the conformance function; refusing to guess';
  end if;

  v_block :=
'never as "can role X do Y".'');
  return next;

  ---------------------------------------------------------------- 22. a rule may not test an unstorable value
  check_key := ''rule_vocabulary_is_storable'';
  select coalesce(jsonb_agg(jsonb_build_object(
           ''source'', d.source, ''row_id'', d.row_id, ''label'', d.label,
           ''fact'', d.fact, ''bad_value'', d.bad_value, ''allowed'', to_jsonb(d.allowed))
         order by d.source, d.label), ''[]''::jsonb)
    into v_bad
    from hr.rule_vocabulary_drift() d;
  ok       := (v_bad = ''[]''::jsonb);
  severity := ''blocking'';
  detail   := jsonb_build_object(
    ''violations'', v_bad,
    ''facts_covered'', jsonb_build_array(''flsa_status'', ''worker_class''),
    ''why'', ''Three seeded rules gated on flsa_status eq "non_exempt" while the live CHECK permits ''
      || ''only exempt / nonexempt, so overtime had never applied to anybody in any organization -- ''
      || ''and the fixture suite stayed GREEN the whole time, because nine fixtures asserted the ''
      || ''same unstorable token. Rule and test agreed with each other and neither agreed with the ''
      || ''database. Superseded rows are exempt: they keep the old token so snapshots citing them ''
      || ''stay readable.'');
  return next;
end';

  v_def := replace(v_def, v_anchor, v_block);
  execute v_def;
end
$mig$;

-- ── 3. self-assertions ──────────────────────────────────────────────────────────────────────
do $chk$
declare v_n int; v_fail jsonb; v_allowed text[];
begin
  -- green on arrival, now that hr_l3_54 has landed
  select count(*) into v_n from hr.rule_vocabulary_drift();
  if v_n <> 0 then
    raise exception 'hr_l3_55: % vocabulary drift(s) remain: %', v_n,
      (select jsonb_agg(to_jsonb(d)) from hr.rule_vocabulary_drift() d)::text;
  end if;

  select count(*) into v_n from hr.punch_write_path_conformance();
  if v_n < 22 then
    raise exception 'hr_l3_55: expected at least 22 checks, found %', v_n;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('check', check_key, 'detail', detail)), '[]'::jsonb)
    into v_fail from hr.punch_write_path_conformance() where not ok;
  if v_fail <> '[]'::jsonb then
    raise exception 'hr_l3_55: the gate is red on arrival: %', v_fail::text;
  end if;

  -- decision 1: the allowed set really is being read from the live constraint
  select array_agg(m[1] order by m[1]) into v_allowed
    from pg_constraint pc
    cross join lateral regexp_matches(pg_get_constraintdef(pc.oid), '''([a-z_]+)''::text', 'g') m
   where pc.conname = 'position_assignment_flsa_status_check'
     and pc.conrelid = 'hr.position_assignment'::regclass;
  if v_allowed is distinct from array['exempt','nonexempt'] then
    raise exception 'hr_l3_55: the constraint parser read % from the live CHECK', v_allowed;
  end if;

  -- decision 3: the superseded originals still carry the old token and are NOT reported
  if (select count(*) from hr.jurisdiction_rule
       where status = 'superseded' and applicability::text like '%non_exempt%') <> 3 then
    raise exception 'hr_l3_55: the retained originals were altered; snapshot provenance is broken';
  end if;
end
$chk$;
