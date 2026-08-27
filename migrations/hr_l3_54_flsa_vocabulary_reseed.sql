-- HR domain L3 — register item HRB-015, lane l3-punch-kiosk (BUILDER SQL-1).
--
-- 🚨 OVERTIME WAS DEAD PLATFORM-WIDE: THE SEEDED RULES TESTED A TOKEN THE DATABASE CANNOT STORE.
--
-- Three seeded jurisdiction rules gate on `flsa_status eq "non_exempt"`. The live vocabulary is
-- `nonexempt` — `position_assignment_flsa_status_check` permits exactly `exempt` and `nonexempt`.
-- SPEC-DATA-MODEL wins (ruled). Measured before touching anything:
--
--     position assignments stored as 'nonexempt' ....... 12
--     position assignments stored as 'non_exempt' ......  0   (the CHECK forbids it)
--     verdict of the seeded predicate against a real one:
--       {"verdict":"not_applicable","reason":"applicability flsa_status eq \"non_exempt\" not met"}
--
-- So the federal weekly-40 rule, the California daily rule and the California double-time rule
-- have never applied to anybody. aidream currently bridges it with a temporary alias map, which
-- dies once this lands.
--
-- 🚨 AND THE FIXTURES AGREED WITH THE RULES, WHICH IS WHY NOTHING CAUGHT IT. Nine of the 67
-- executable fixtures carry `flsa_status: "non_exempt"` in their FACTS. Rule and fixture used the
-- same unstorable token, so the suite went green proving a rule against a vocabulary no employment
-- record can ever hold. That is the whole lesson, and hr_l3_55 turns it into a standing check.
--
-- Authority: coordinator ruling (vocabulary fix, SQL half); SPEC-DATA-MODEL (vocabulary);
-- SPEC-JURISDICTION §2.2/§7.5 (effective dating), §4.x (calc-snapshot immutability).
--
-- Applied live as `hr_l3_54_flsa_vocabulary_reseed`. Idempotent.
--
-- ── RECORDED TECHNICAL DECISIONS ────────────────────────────────────────────────────────────
-- 1. 🚨 NEW VERSIONS, NOT AN IN-PLACE EDIT — BECAUSE SNAPSHOTS POINT AT THESE ROWS. Measured:
--    SEVEN `hr.workweek` rows carry these three rule ids in `rule_version_ids`, and those seven are
--    every snapshot in the database that cites any rule at all. Mutating the applicability in place
--    would silently change what those snapshots say was applied. So each rule is SUPERSEDED and a
--    corrected row is inserted, exactly as the coordinator's ruling anticipated.
-- 2. THE CORRECTION CARRIES THE SAME EFFECTIVE WINDOW, NOT A NEW ONE. Both rows are
--    `1900-01-01 → null`. Dating the correction from today would leave every historical work date
--    resolving the broken row — overtime would stay dead for all of history, which is the opposite
--    of the fix. `correction_of_id` exists for precisely this: the old row was never right, so the
--    replacement covers its whole window rather than succeeding it in time.
-- 3. THE SCHEMA'S OWN DISCIPLINE SAYS SUPERSEDED IS THE RIGHT LIFECYCLE — and it ENFORCES it.
--    `jurisdiction_rule_one_per_window_per_record_class` is an EXCLUSION constraint (not merely an
--    index, which is how it first read in `pg_indexes` — the first attempt at this migration was
--    rejected by it) defined `WHERE status <> 'superseded' AND deleted_at IS NULL`, and
--    `hr.resolve_rules` selects
--    `status in ('active','advisory')`. So a superseded row leaves the one-per-window universe and
--    the resolver both, while staying fully readable for snapshot provenance. Nothing is deleted
--    and nothing is rewritten.
-- 4. BOTH POINTERS ARE SET, BECAUSE THEY ANSWER DIFFERENT QUESTIONS. `supersedes_id` records which
--    row this one replaces in the timeline; `correction_of_id` records that the replacement happened
--    because the earlier row was WRONG rather than because the law changed. Reading only
--    `supersedes_id` later would misreport this as an amendment to the FLSA.
-- 5. INSERTED DIRECTLY AS `active`, WHICH IS NOT A PROMOTION. `_jurisdiction_rule_promotion_gate`
--    fires only on `draft|advisory → active` and would block promotion while OT-CA-04 / OT-CA-05
--    remain `pending_verification`. Those two were already pending while the ORIGINAL row was
--    active; this correction does not change any fixture's verification status, and inserting at
--    the same status the corrected row already held preserves the status quo exactly. Routing a
--    correction of a live rule through draft would make live rules uncorrectable.
-- 6. ONLY THE TOKEN MOVES. `parameters`, `citation`, `source_scope`, `verification_due` and the
--    effective window are copied verbatim; the thresholds are untouched. `basis` gains a dated
--    correction sentence, because a rule whose text cannot say why it was reissued is a rule
--    somebody will re-derive from scratch.
-- 7. THE FIXTURES' FACTS MOVE TOO, AND ONLY THEIR FACTS. Nine fixtures' `facts.flsa_status` become
--    `nonexempt` so the suite tests the STORED vocabulary. Titles keep the English "non-exempt" —
--    that is correct prose describing the concept, not a token the engine reads. None of the nine
--    is pinned (`pinned_rule_id is null` on all), so they resolve against whatever is active and
--    need no re-pointing.

do $mig$
declare v_ids uuid[]; v_id uuid; r hr.jurisdiction_rule%rowtype; v_new uuid; v_n int := 0;
begin
  -- materialise first: the loop inserts rows, and a lazy cursor over the same predicate is a trap
  select coalesce(array_agg(id), '{}'::uuid[]) into v_ids
    from hr.jurisdiction_rule
   where applicability::text like '%non_exempt%'
     and status <> 'superseded' and deleted_at is null;

  if cardinality(v_ids) = 0 then
    raise notice 'hr_l3_54: no rule carries the unstorable token; already re-seeded';
    return;
  end if;

  foreach v_id in array v_ids loop
    select * into r from hr.jurisdiction_rule where id = v_id;

    -- decision 3: out of the resolver and out of the one-per-window universe, still readable.
    -- 🚨 THIS MUST PRECEDE THE INSERT. jurisdiction_rule_one_per_window_per_record_class is an
    -- EXCLUSION constraint over (org, class, jurisdiction, record_class, effective range) WHERE
    -- status <> 'superseded'. The correction deliberately occupies the SAME window (decision 2),
    -- so the original has to leave that universe before the replacement can enter it.
    perform hr.arm_write();
    update hr.jurisdiction_rule set status = 'superseded' where id = r.id;

    perform hr.arm_write();
    insert into hr.jurisdiction_rule (
      rule_class_id, jurisdiction_key, effective_from, effective_to,
      applicability, parameters, status, basis, citation, verification_due,
      supersedes_id, correction_of_id, source_scope, organization_id, metadata)
    values (
      r.rule_class_id, r.jurisdiction_key,
      r.effective_from, r.effective_to,                       -- decision 2: the SAME window
      -- decision 6: the only substantive change in the whole row
      replace(r.applicability::text, '"non_exempt"', '"nonexempt"')::jsonb,
      r.parameters, r.status,
      r.basis || ' — CORRECTED 2026-08-27 (hr_l3_54): the applicability tested flsa_status '
             || 'eq "non_exempt", a token hr.position_assignment''s CHECK constraint cannot store '
             || '(it permits exempt / nonexempt), so this rule had never applied to any employment. '
             || 'Only the token changed; every threshold, citation and date is carried verbatim '
             || 'from the corrected row.',
      r.citation, r.verification_due,
      r.id, r.id,                                             -- decision 4: both pointers
      r.source_scope, r.organization_id,
      coalesce(r.metadata, '{}'::jsonb) || jsonb_build_object(
        'corrected_from_rule_id', r.id,
        'correction_reason', 'flsa_status vocabulary: non_exempt is not storable; the live CHECK permits exempt / nonexempt',
        'corrected_on', '2026-08-27'))
    returning id into v_new;

    v_n := v_n + 1;
    raise notice 'hr_l3_54: % % corrected % -> %', r.jurisdiction_key, r.rule_class_id, r.id, v_new;
  end loop;

  raise notice 'hr_l3_54: % rule(s) corrected', v_n;
end
$mig$;

-- ── the fixtures test the stored vocabulary (decision 7) ────────────────────────────────────
do $mig$
declare v_n int;
begin
  perform hr.arm_write();
  update hr.jurisdiction_rule_test
     set facts = replace(facts::text, '"non_exempt"', '"nonexempt"')::jsonb
   where facts::text like '%non_exempt%' and deleted_at is null;
  get diagnostics v_n = row_count;
  raise notice 'hr_l3_54: % fixture(s) re-pointed at the stored vocabulary', v_n;
end
$mig$;

-- ── self-assertions ─────────────────────────────────────────────────────────────────────────
do $chk$
declare v_n int; v_bad text;
begin
  -- nothing live still names the unstorable token
  select count(*) into v_n from hr.jurisdiction_rule
   where applicability::text like '%non_exempt%' and status <> 'superseded' and deleted_at is null;
  if v_n <> 0 then
    raise exception 'hr_l3_54: % live rule(s) still test non_exempt', v_n;
  end if;
  select count(*) into v_n from hr.jurisdiction_rule_test
   where facts::text like '%non_exempt%' and deleted_at is null;
  if v_n <> 0 then
    raise exception 'hr_l3_54: % fixture(s) still assert non_exempt', v_n;
  end if;

  -- decision 1: the superseded originals are RETAINED, so snapshots still resolve
  select count(*) into v_n from hr.jurisdiction_rule
   where applicability::text like '%non_exempt%' and status = 'superseded' and deleted_at is null;
  if v_n <> 3 then
    raise exception 'hr_l3_54: expected 3 retained superseded originals, found %', v_n;
  end if;
  if exists (
    select 1 from hr.workweek w
     where w.rule_version_ids && (select array_agg(id) from hr.jurisdiction_rule
                                   where status = 'superseded' and applicability::text like '%non_exempt%')
       and not exists (select 1 from hr.jurisdiction_rule x
                        where x.id = any(w.rule_version_ids) and x.deleted_at is null)) then
    raise exception 'hr_l3_54: a snapshot now points at a rule that cannot be read';
  end if;

  -- decisions 2 and 4: every correction covers its original's whole window and names it twice
  select string_agg(c.id::text, ', ') into v_bad
    from hr.jurisdiction_rule c join hr.jurisdiction_rule o on o.id = c.correction_of_id
   where c.correction_of_id is not null
     and (c.effective_from is distinct from o.effective_from
          or c.effective_to is distinct from o.effective_to
          or c.supersedes_id is distinct from o.id
          or c.parameters is distinct from o.parameters);
  if v_bad is not null then
    raise exception 'hr_l3_54: a correction changed more than the token, or moved its window: %', v_bad;
  end if;

  -- the resolver must still find exactly one live rule per class+jurisdiction it had before
  if exists (
    select 1 from hr.jurisdiction_rule
     where status in ('active','advisory') and deleted_at is null
     group by organization_id, rule_class_id, jurisdiction_key,
              coalesce(parameters ->> 'record_class',''), effective_from
    having count(*) > 1) then
    raise exception 'hr_l3_54: two live rules now occupy one window; the resolver would apply both';
  end if;

  -- and the whole point: the predicate now matches what the database can store
  if (hr._applicability_verdict(
        (select applicability from hr.jurisdiction_rule
          where correction_of_id is not null limit 1),
        '{"flsa_status":"nonexempt","worker_class":"employee"}'::jsonb) ->> 'verdict') <> 'applies' then
    raise exception 'hr_l3_54: the corrected predicate still does not apply to a real nonexempt employment';
  end if;
end
$chk$;
