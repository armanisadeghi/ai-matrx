-- W1-RULE — THE RED TWIN of `w1_rule_t8.sql` (rules 2 and 3).
--
-- RUN IT:
--   PSQL="$(pnpm -s exec tsx scripts/lib/psql-path.ts --print)"
--   "$PSQL" "$SUPABASE_BRANCH_DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -f scripts/campaign-tests/w1_rule_red.sql
--
-- A guard that cannot be demonstrated FAILING is not a guard. This file turns each of
-- W1-RULE's guards off INSIDE ONE TRANSACTION, performs the write the green suite proves is
-- refused, and asserts it LANDS — then rolls the whole thing back, guards included, because
-- `ALTER TABLE … DISABLE TRIGGER` is itself transactional.
--
-- IT IS NOT A MIGRATION, it lives outside `migrations/`, it runs on the REHEARSAL BRANCH
-- only, and it never runs against production: the first statement refuses on any server
-- whose control-file identifier is not the branch's.
--
-- WHAT EACH RED SAYS. If an assertion below fails, the guard it names was doing NOTHING and
-- the green suite's matching refusal was passing for some other reason — a typo in the
-- write, a constraint somewhere else, an exception handler catching the wrong thing.
--   RED 1  custom_record_rule_shape_guard — REC-15 and REC-17 at SAVE time: without it, a
--          Rule that names a field, points at another table's field, asks for a node nobody
--          implements, serves a fifth use, and computes a hand-filled field all land in one
--          row, and READ BACK THROUGH custom.rule, which is how it would reach a consumer.
--   RED 2  custom_record_rule_uses — the two uses: without it, a square with unequal sides
--          is STORED and no worked-out answer is produced at all.
--   RED 3  REC-17's id-not-name mechanism, shown from the OTHER side: with the guard ON and
--          the Field renamed, a NAME-KEYED reading of the same Rule answers UNDECIDED, so the
--          bad square would be stored. This is the RED for the green suite's rename clause —
--          the one clause a disabled trigger cannot demonstrate, because the guard being
--          tested is the resolver, not the trigger.
--   RED 4  the forged worked-out answer: without the trigger, `_computed` is whatever the
--          writer says it is, and a value nothing produced sits in the document looking
--          authoritative.

\set ON_ERROR_STOP on
\timing off

begin;

do $r$
declare
  v_org     constant uuid := '39c38960-d30c-4840-b0c1-c9960de95582';
  v_tbl     constant uuid := '11111111-0004-4000-8000-000000000001';
  v_f_title constant uuid := '11111111-0004-4000-8000-000000000010';
  v_f_width constant uuid := '11111111-0004-4000-8000-000000000012';
  v_f_hgt   constant uuid := '11111111-0004-4000-8000-000000000013';
  v_rule    constant uuid := '11111111-0004-4000-8000-000000000101';
  v_landed  uuid;
  v_n       integer;
  v_j       jsonb;
begin
  if (pg_control_system()).system_identifier <> 7678069749886157684 then
    raise exception 'w1_rule_red.sql refuses to run here: system_identifier is %, and this file may only run on the rehearsal branch (7678069749886157684)',
                    (pg_control_system()).system_identifier;
  end if;

  -- ── RED 1: THE RULE SHAPE GUARD (REC-15 and REC-17 at save time) ─────────
  alter table custom.record disable trigger custom_record_rule_shape_guard;
  insert into custom.record (organization_id, table_id, data_class, data)
  values (v_org, custom.rule_kernel_id(), 'rule', jsonb_build_object(
    'name','zz red rule','kind','predicate','scope_table_id', v_tbl::text,
    'uses', jsonb_build_array('validate','summarise'),
    'applies_to_types','[]'::jsonb,
    'use_types', jsonb_build_object('compute', jsonb_build_array('square')),
    'target_field_id', v_f_title::text,
    'expr', jsonb_build_object('op','frobnicate','args', jsonb_build_array(
              jsonb_build_object('field_name','width'),
              jsonb_build_object('field','11111111-9999-4000-8000-000000000099')))))
  returning id into v_landed;
  if v_landed is null then
    raise exception 'RED 1: the write did not land with custom_record_rule_shape_guard disabled';
  end if;
  select data into v_j from custom.record where organization_id = v_org and id = v_landed;
  if not ((v_j -> 'expr' -> 'args' -> 0) ? 'field_name') then
    raise exception 'RED 1: the field NAME reference did not survive - REC-17''s save-time refusal is doing nothing else';
  end if;
  if (v_j -> 'expr' ->> 'op') <> 'frobnicate' then
    raise exception 'RED 1: the node nobody implements did not survive';
  end if;
  if not ((v_j -> 'uses') ? 'summarise') then
    raise exception 'RED 1: the fifth use did not survive';
  end if;
  if (v_j ->> 'target_field_id')::uuid <> v_f_title then
    raise exception 'RED 1: the hand-filled target field did not survive';
  end if;
  -- And it READS BACK THROUGH THE SURFACE, which is how a broken Rule would reach a
  -- consumer: the view re-checks nothing, and it was never supposed to.
  select count(*) into v_n from custom.rule where id = v_landed;
  if v_n <> 1 then raise exception 'RED 1: the broken Rule is not visible on custom.rule'; end if;
  -- AND THE EVALUATOR IS THE SECOND LINE OF DEFENCE, not the first: run it and the refusal
  -- comes from custom.rule_eval instead. That is why the save-time walk exists at all — the
  -- Rule is refused when the person writing it is still looking at it.
  begin
    perform custom.rule_run(v_org, v_landed, '{"width":4,"height":5}'::jsonb);
    raise exception 'RED 1: the broken Rule ANSWERED - neither the guard nor the evaluator refused it';
  exception when sqlstate '22023' then
    null;  -- expected: the evaluator refuses what the disabled guard let through
  end;
  alter table custom.record enable trigger custom_record_rule_shape_guard;
  raise notice 'RED 1 - with custom_record_rule_shape_guard disabled, a Rule naming a field, pointing at an absent field, asking for an unknown node, serving a fifth use, narrowing a use it does not have and computing a hand-filled field LANDS and reads back through custom.rule';

  -- ── RED 2: THE TWO USES (REC-15 on the store) ────────────────────────────
  alter table custom.record disable trigger custom_record_rule_uses;
  insert into custom.record (organization_id, table_id, data)
  values (v_org, v_tbl, '{"title":"ZZ RED","kind":"square","width":4,"height":5}')
  returning id into v_landed;
  if v_landed is null then
    raise exception 'RED 2: the write did not land with custom_record_rule_uses disabled';
  end if;
  select data into v_j from custom.record where organization_id = v_org and id = v_landed;
  if (v_j ->> 'width') <> '4' or (v_j ->> 'height') <> '5' then
    raise exception 'RED 2: the square with unequal sides did not survive';
  end if;
  if v_j ? '_computed' then
    raise exception 'RED 2: a worked-out answer appeared with the compute use disabled';
  end if;
  select count(*) into v_n from custom.computed_provenance(v_org, v_landed);
  if v_n <> 0 then
    raise exception 'RED 2: custom.computed_provenance returned % rows for a record nothing computed', v_n;
  end if;
  alter table custom.record enable trigger custom_record_rule_uses;
  raise notice 'RED 2 - with custom_record_rule_uses disabled, a square whose sides differ IS STORED and no worked-out answer is produced: both of this lane''s uses are that trigger and nothing else';

  -- ── RED 3: REC-17'S MECHANISM, FROM THE OTHER SIDE ───────────────────────
  -- Rename the Width field with every guard ON. The green suite proves the Rule still fires.
  -- Here the SAME Rule is read the way a name-keyed implementation would read it — the name
  -- the Rule was written against, rather than the id — and it answers UNDECIDED, which the
  -- validate use does not refuse. That is the write the green suite refuses, and it is what
  -- REC-17 is worth.
  update custom.record
     set data = jsonb_set(data, '{fields}',
                  '[{"name":"title"},{"name":"kind"},{"name":"breadth"},{"name":"height"},{"name":"sides_equal"}]'::jsonb)
   where organization_id = v_org and id = v_tbl;
  update custom.record
     set data = data || '{"key":"breadth","label":"Breadth"}'::jsonb
   where organization_id = v_org and id = v_f_width;

  -- THE ID-KEYED READING (what is built): decided, and false.
  v_j := custom.rule_eval(v_org,
           (select data -> 'expr' from custom.record where organization_id = v_org and id = v_rule),
           '{"breadth":4,"height":5}'::jsonb);
  if custom.rule_truth(v_j) is not false then
    raise exception 'RED 3: the id-keyed reading answered %, and 4 is not 5', v_j;
  end if;
  -- THE NAME-KEYED READING (what REC-17 forbids), written out here as the literal key the
  -- Rule was authored against: undecided, so nothing is refused and the bad square is saved.
  v_j := custom.rule_eval(v_org, jsonb_build_object('op','eq','args', jsonb_build_array(
           jsonb_build_object('const', ('{"breadth":4,"height":5}'::jsonb -> 'width')),
           jsonb_build_object('const', ('{"breadth":4,"height":5}'::jsonb -> 'height')))),
           '{}'::jsonb);
  if custom.rule_truth(v_j) is not null then
    raise exception 'RED 3: the name-keyed reading answered %, and it was supposed to find nothing at all', v_j;
  end if;
  update custom.record
     set data = jsonb_set(data, '{fields}',
                  '[{"name":"title"},{"name":"kind"},{"name":"width"},{"name":"height"},{"name":"sides_equal"}]'::jsonb)
   where organization_id = v_org and id = v_tbl;
  update custom.record
     set data = data || '{"key":"width","label":"Width"}'::jsonb
   where organization_id = v_org and id = v_f_width;
  raise notice 'RED 3 - after the Width field is renamed, the ID-keyed Rule answers FALSE and refuses, and the NAME-keyed reading of the same test answers UNDECIDED and refuses nothing: REC-17 is the difference between the bad square being caught and being stored';

  -- ── RED 4: THE FORGED WORKED-OUT ANSWER ──────────────────────────────────
  alter table custom.record disable trigger custom_record_rule_uses;
  insert into custom.record (organization_id, table_id, data)
  values (v_org, v_tbl, '{"title":"ZZ FORGED","kind":"square","width":2,"height":2,"_computed":{"title":{"value":"forged","rule_id":"11111111-0004-4000-8000-000000000101","rule_version":99}}}')
  returning id into v_landed;
  if v_landed is null then raise exception 'RED 4: the write did not land'; end if;
  select data -> '_computed' -> 'title' into v_j from custom.record where organization_id = v_org and id = v_landed;
  if (v_j ->> 'value') <> 'forged' then
    raise exception 'RED 4: the forged answer did not survive';
  end if;
  -- And it reads back through the merged reader as if a Rule had produced it, wearing a
  -- version that never existed.
  v_j := custom.record_values(v_org, v_landed);
  if (v_j ->> 'title') <> 'forged' then
    raise exception 'RED 4: the forged answer did not reach custom.record_values - it reads %', v_j ->> 'title';
  end if;
  select p.rule_version into v_n from custom.computed_provenance(v_org, v_landed) p where p.field_key = 'title';
  if v_n <> 99 then
    raise exception 'RED 4: the forged provenance did not survive - it says version %', v_n;
  end if;
  alter table custom.record enable trigger custom_record_rule_uses;
  raise notice 'RED 4 - with custom_record_rule_uses disabled, a worked-out answer no Rule works out is stored, overrides the typed Title through custom.record_values, and reports a Rule version (99) that never existed';

  raise notice 'W1-RULE RED TWIN COMPLETE - every guard this lane ships has been shown doing the work its green assertion credits it with';
end;
$r$;

rollback;
