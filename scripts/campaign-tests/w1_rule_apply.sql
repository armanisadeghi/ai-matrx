-- W1-RULE-APPLY — DYN-6 and REC-16 EXECUTED against the rehearsal branch, plus the
-- save-time cycle refusal across Rules and merge fields.
--
-- RUN IT:
--   PSQL="$(pnpm -s exec tsx scripts/lib/psql-path.ts --print)"
--   "$PSQL" "$SUPABASE_BRANCH_DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -f scripts/campaign-tests/w1_rule_apply.sql
--
-- IT IS NOT A MIGRATION and never becomes one: it lives outside `migrations/`, is discovered
-- by no sweep, and its single transaction ends in ROLLBACK, so it leaves the branch exactly
-- as it found it.
--
-- 🚨 THE ROW ALL FOUR USES RUN AGAINST IS `11111111-0004-4000-8000-000000000101`, the one
-- `W1-RULE` stored. `V1-MODEL`'s `C-10a` (compute) and `C-10b` (membership) re-execute
-- against THAT id, and clause F below shows both uses reaching it in one transaction.
--
-- WHAT MAKES IT FAIL — THE PRODUCTION CHANGES, NAMED (rule 3).
--   · Replace `exit;` in `custom.resolve_first_match` with `continue` (keep asking after a
--     match) → A fails: the trace's `matched` count stops being one and the winner moves.
--   · Drop the `order by` from `custom.table_rules` → A fails: the wide rectangle stops
--     matching "Wider than tall" first, and `considered_at` no longer follows `declared_sort`.
--   · Make `custom.rule_context` walk the chain instead of reading one parent → D2's
--     grandparent test stops being UNDECIDED and starts answering.
--   · Delete the `parent_field` branch from `custom.rule_eval` → C fails: an applicability
--     Rule goes back to raising 0A000.
--   · Drop the `custom_record_rule_topology_guard` trigger → E fails (that is exactly what
--     the RED twin `w1_rule_apply_red.sql` does, and it shows the same writes LANDING).
--
-- A SECOND INPUT WITH A DIFFERENT EXPECTED VALUE, everywhere it could matter (rule 3): the
-- resolver is asked about THREE records and returns THREE DIFFERENT winners from ONE ordered
-- list; applicability is asked about a child of a square, a child of a rectangle and a record
-- with no parent at all, and answers true, false and UNDECIDED; the cycle guard is shown
-- refusing TWO different circles and ACCEPTING a third graph that closes none. `return
-- expected` survives none of them.
--
-- EVERY REFUSAL IS PAIRED WITH A POSITIVE CONTROL that performs the same write successfully
-- (rule 14).
--
-- THE IDENTITIES. It writes as the connected owner into ONE organization, the Matrx System
-- organization, with freshly generated ids, and rolls back. It signs nobody in and reads no
-- credential.

\set ON_ERROR_STOP on
\timing off

begin;

do $t$
declare
  v_org     constant uuid := '39c38960-d30c-4840-b0c1-c9960de95582';  -- Matrx System
  v_tbl     constant uuid := '11111111-0004-4000-8000-000000000001';  -- Rule conformance shape
  v_f_kind  constant uuid := '11111111-0004-4000-8000-000000000011';
  v_f_width constant uuid := '11111111-0004-4000-8000-000000000012';
  v_r_all   constant uuid := '11111111-0004-4000-8000-000000000101';  -- ALL FOUR USES
  v_r_wide  constant uuid := '11111111-0004-4000-8000-000000000102';
  v_r_has   constant uuid := '11111111-0004-4000-8000-000000000103';
  v_r_in    constant uuid := '11111111-0004-4000-8000-000000000104';
  v_mf      constant uuid := '11111111-0004-4000-8000-000000000120';
  v_sq       uuid;
  v_wide     uuid;
  v_tall     uuid;
  v_kid_sq   uuid;
  v_kid_rect uuid;
  v_t2       uuid;
  v_f1       uuid;
  v_f2       uuid;
  v_ra       uuid;
  v_res      jsonb;
  v_msg      text;
  v_hint     text;
  v_state    text;
  v_n        integer;
  v_answer   boolean;
begin
  -- ── THE RECORDS. One square, one wide rectangle, one tall rectangle, and two children. ──
  insert into custom.record (organization_id, table_id, data_class, data)
  values (v_org, v_tbl, 'record', '{"title":"Square","kind":"square","width":4,"height":4}'::jsonb)
  returning id into v_sq;
  insert into custom.record (organization_id, table_id, data_class, data)
  values (v_org, v_tbl, 'record', '{"title":"Wide","kind":"rectangle","width":5,"height":3}'::jsonb)
  returning id into v_wide;
  insert into custom.record (organization_id, table_id, data_class, data)
  values (v_org, v_tbl, 'record', '{"title":"Tall","kind":"rectangle","width":3,"height":5}'::jsonb)
  returning id into v_tall;
  insert into custom.record (organization_id, table_id, data_class, data)
  values (v_org, v_tbl, 'record',
          jsonb_build_object('title','In the square','kind','rectangle','width',1,'height',2,
                             'parent_id', v_sq))
  returning id into v_kid_sq;
  insert into custom.record (organization_id, table_id, data_class, data)
  values (v_org, v_tbl, 'record',
          jsonb_build_object('title','In the rectangle','kind','rectangle','width',1,'height',2,
                             'parent_id', v_wide))
  returning id into v_kid_rect;

  -- ══════════════════════════════════════════════════════════════════════════
  -- A. DYN-6 — ONE ORDERED LIST, THREE RECORDS, THREE DIFFERENT WINNERS, and
  --    the order is read out of the TRACE THE RUN WROTE, never out of the list.
  -- ══════════════════════════════════════════════════════════════════════════
  v_res := custom.resolve_first_match(v_org, v_sq);
  if (v_res -> 'resolved' ->> 'rule_id')::uuid is distinct from v_r_all then
    raise exception 'A FAILED: the square resolved to % and the first Rule in the order is the one that matches it', v_res -> 'resolved';
  end if;
  if (v_res ->> 'stopped_after')::integer <> 1 then
    raise exception 'A FAILED: the square matched the first Rule and the run asked % of them', v_res ->> 'stopped_after';
  end if;

  v_res := custom.resolve_first_match(v_org, v_wide);
  if (v_res -> 'resolved' ->> 'rule_id')::uuid is distinct from v_r_wide then
    raise exception 'A FAILED: the wide rectangle resolved to %', v_res -> 'resolved';
  end if;

  v_res := custom.resolve_first_match(v_org, v_tall);
  if (v_res -> 'resolved' ->> 'rule_id')::uuid is distinct from v_r_has then
    raise exception 'A FAILED: the tall rectangle resolved to %', v_res -> 'resolved';
  end if;

  -- THE TRACE IS THE EVIDENCE. Three Rules considered, in declared-sort order, exactly one
  -- of them matched, and it is the LAST one considered — which is what "it stopped at the
  -- first match" means when the first two answered false.
  if jsonb_array_length(v_res -> 'considered') <> 3
     or (v_res -> 'considered' -> 0 ->> 'declared_sort')::integer <> 10
     or (v_res -> 'considered' -> 1 ->> 'declared_sort')::integer <> 20
     or (v_res -> 'considered' -> 2 ->> 'declared_sort')::integer <> 30 then
    raise exception 'A FAILED: the trace is not in declared order: %', v_res -> 'considered';
  end if;
  select count(*) into v_n from jsonb_array_elements(v_res -> 'considered') c
   where (c ->> 'matched')::boolean;
  if v_n <> 1 then
    raise exception 'A FAILED: % of the considered Rules matched, and a first-match resolver stops at one', v_n;
  end if;

  -- AND THE ORDER IS REALLY THE ORDER: move "Has a width at all" to the front and the wide
  -- rectangle's winner CHANGES, out of the same three Rules, read out of the new trace.
  update custom.record set data = jsonb_set(data, '{sort}', '5'::jsonb)
   where organization_id = v_org and id = v_r_has;
  v_res := custom.resolve_first_match(v_org, v_wide);
  if (v_res -> 'resolved' ->> 'rule_id')::uuid is distinct from v_r_has
     or (v_res ->> 'stopped_after')::integer <> 1 then
    raise exception 'A FAILED: re-ordering the Rules did not move the first match: %', v_res;
  end if;
  update custom.record set data = jsonb_set(data, '{sort}', '30'::jsonb)
   where organization_id = v_org and id = v_r_has;

  raise notice 'A. DYN-6 — one ordered list of 3 Rules gives 3 winners (square -> "A square has equal sides", wide -> "Wider than tall", tall -> "Has a width at all"); re-sorting moves the winner; the trace carries declared_sort 10/20/30 in that order and exactly one match.';

  -- ══════════════════════════════════════════════════════════════════════════
  -- B. DYN-6 — MEMBERSHIP IS A SET, and it is the SAME Rule row that validates
  --    and computes. No seventh core object: this is custom.record, projected.
  -- ══════════════════════════════════════════════════════════════════════════
  select count(*) into v_n from custom.rule_members(v_org, v_r_all) m
   where m.id in (v_sq, v_wide, v_tall, v_kid_sq, v_kid_rect);
  if v_n <> 1 then
    raise exception 'B FAILED: % of this suite''s five records are in the square set', v_n;
  end if;
  if not exists (select 1 from custom.rule_members(v_org, v_r_all) m where m.id = v_sq) then
    raise exception 'B FAILED: the square is not in the set its own Rule defines.';
  end if;
  -- A Rule that does not declare the membership use is refused BY NAME rather than answering
  -- an empty set, which would read as "nothing is in it".
  begin
    perform custom.rule_members(v_org, v_r_in);
    raise exception 'B FAILED: a Rule that is not used for membership answered a membership question.';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    if v_msg like 'B FAILED%' then raise; end if;
    if v_msg not like '%Inside a square%' then
      raise exception 'B FAILED: the refusal does not name the Rule: %', v_msg;
    end if;
  end;
  raise notice 'B. DYN-6 — the set is a query over the same store (1 of this suite''s 5 records), and a Rule that is not used for membership is refused naming it: "%"', v_msg;

  -- ══════════════════════════════════════════════════════════════════════════
  -- C. REC-16 — the record's own Values AND ITS PARENT'S, one level up.
  --    Three inputs, three different answers: true, false, UNDECIDED.
  -- ══════════════════════════════════════════════════════════════════════════
  select a.applies into v_answer from custom.record_applicability(v_org, v_kid_sq) a where a.rule_id = v_r_in;
  if v_answer is not true then
    raise exception 'C FAILED: a record inside a SQUARE answered % to "Inside a square".', coalesce(v_answer::text, 'undecided');
  end if;
  select a.applies into v_answer from custom.record_applicability(v_org, v_kid_rect) a where a.rule_id = v_r_in;
  if v_answer is not false then
    raise exception 'C FAILED: a record inside a RECTANGLE answered % to "Inside a square".', coalesce(v_answer::text, 'undecided');
  end if;
  select a.applies into v_answer from custom.record_applicability(v_org, v_sq) a where a.rule_id = v_r_in;
  if v_answer is not null then
    raise exception 'C FAILED: a record with NO parent answered % instead of leaving it undecided.', v_answer;
  end if;
  -- The parent's Value really is the parent's: change the parent and the child's answer moves.
  update custom.record set data = jsonb_set(data, '{kind}', '"rectangle"'::jsonb)
   where organization_id = v_org and id = v_sq;
  select a.applies into v_answer from custom.record_applicability(v_org, v_kid_sq) a where a.rule_id = v_r_in;
  if v_answer is not false then
    raise exception 'C FAILED: the parent stopped being a square and the child still answers %.', v_answer;
  end if;
  update custom.record set data = jsonb_set(data, '{kind}', '"square"'::jsonb)
   where organization_id = v_org and id = v_sq;
  raise notice 'C. REC-16 — a child of a square applies (true), a child of a rectangle does not (false), a record with no parent is UNDECIDED, and retyping the PARENT moves the child''s answer.';

  -- ══════════════════════════════════════════════════════════════════════════
  -- D. REC-16's CEILING — one level and no further, refused BY NAME in the three
  --    shapes a person actually writes, at SAVE time and at evaluation.
  -- ══════════════════════════════════════════════════════════════════════════
  begin
    insert into custom.record (organization_id, table_id, data_class, data) values (v_org,
      '11111111-0000-4000-8000-000000000003'::uuid, 'rule',
      jsonb_build_object('name','Two up','kind','predicate','scope_table_id',v_tbl,
                         'uses', jsonb_build_array('applicability'), 'applies_to_types','[]'::jsonb,
                         'expr', jsonb_build_object('op','eq','args', jsonb_build_array(
                           jsonb_build_object('parent_field', jsonb_build_object('parent_field', v_f_kind)),
                           jsonb_build_object('const','square')))));
    raise exception 'D FAILED: a Rule reading two ancestor levels was stored.';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    if v_msg like 'D FAILED%' then raise; end if;
    if v_msg not like '%Two up%' then raise exception 'D FAILED: the refusal does not name the Rule: %', v_msg; end if;
    raise notice 'D1. nested parent_field REFUSED naming the Rule — "%"', v_msg;
  end;
  begin
    insert into custom.record (organization_id, table_id, data_class, data) values (v_org,
      '11111111-0000-4000-8000-000000000003'::uuid, 'rule',
      jsonb_build_object('name','Two up by number','kind','predicate','scope_table_id',v_tbl,
                         'uses', jsonb_build_array('applicability'), 'applies_to_types','[]'::jsonb,
                         'expr', jsonb_build_object('op','eq','args', jsonb_build_array(
                           jsonb_build_object('parent_field', v_f_kind, 'levels', 2),
                           jsonb_build_object('const','square')))));
    raise exception 'D FAILED: a Rule asking for two levels by number was stored.';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    if v_msg like 'D FAILED%' then raise; end if;
    if v_msg not like '%Two up by number%' then raise exception 'D FAILED: the refusal does not name the Rule: %', v_msg; end if;
    raise notice 'D2. levels: 2 REFUSED naming the Rule — "%"', v_msg;
  end;
  begin
    insert into custom.record (organization_id, table_id, data_class, data) values (v_org,
      '11111111-0000-4000-8000-000000000003'::uuid, 'rule',
      jsonb_build_object('name','Grandparent','kind','predicate','scope_table_id',v_tbl,
                         'uses', jsonb_build_array('applicability'), 'applies_to_types','[]'::jsonb,
                         'expr', jsonb_build_object('op','eq','args', jsonb_build_array(
                           jsonb_build_object('grandparent_field', v_f_kind),
                           jsonb_build_object('const','square')))));
    raise exception 'D FAILED: a grandparent_field Rule was stored.';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    if v_msg like 'D FAILED%' then raise; end if;
    if v_msg not like '%Grandparent%' then raise exception 'D FAILED: the refusal does not name the Rule: %', v_msg; end if;
    raise notice 'D3. grandparent_field REFUSED naming the Rule — "%"', v_msg;
  end;
  -- AT EVALUATION TOO, for anything already stored, and the POSITIVE CONTROL at one level in
  -- the same breath: the same call shape, one level, answers instead of raising.
  begin
    perform custom.rule_eval(v_org,
      jsonb_build_object('parent_field', jsonb_build_object('parent_field', v_f_kind)),
      '{}'::jsonb, custom.rule_context(v_org, v_kid_sq));
    raise exception 'D FAILED: two levels were evaluated instead of refused.';
  exception when others then
    get stacked diagnostics v_msg = message_text, v_state = returned_sqlstate;
    if v_msg like 'D FAILED%' then raise; end if;
    raise notice 'D4. two levels REFUSED at evaluation too — % "%"', v_state, v_msg;
  end;
  if custom.rule_eval(v_org, jsonb_build_object('parent_field', v_f_kind),
                      '{}'::jsonb, custom.rule_context(v_org, v_kid_sq)) #>> '{}' <> 'square' then
    raise exception 'D FAILED: the POSITIVE CONTROL at one level did not read the parent''s value.';
  end if;
  raise notice 'D5. the positive control at ONE level reads the parent''s answer: "square".';

  -- ══════════════════════════════════════════════════════════════════════════
  -- E. THE SAVE-TIME CYCLE REFUSAL, ACROSS RULES AND MERGE FIELDS, NAMING BOTH
  --    SIDES. Two different circles, and a positive control that closes none.
  -- ══════════════════════════════════════════════════════════════════════════
  -- E1. Rule <-> merge field. The seeded merge field `square_rule` already resolves THROUGH
  --     Rule …0101; making …0101 read that merge field closes the loop.
  begin
    update custom.record set data = jsonb_set(data, '{expr}', jsonb_build_object(
      'op','and','args', jsonb_build_array(
        jsonb_build_object('op','eq','args', jsonb_build_array(
          jsonb_build_object('field', v_f_width),
          jsonb_build_object('field', '11111111-0004-4000-8000-000000000013'::uuid))),
        jsonb_build_object('merge_field', v_mf))))
     where organization_id = v_org and id = v_r_all;
    raise exception 'E FAILED: a Rule and a merge field were saved waiting on each other.';
  exception when others then
    get stacked diagnostics v_msg = message_text, v_hint = pg_exception_hint;
    if v_msg like 'E FAILED%' then raise; end if;
    if v_msg not like '%A square has equal sides%' or v_msg not like '%square_rule%' then
      raise exception 'E FAILED: the refusal does not name BOTH sides: %', v_msg;
    end if;
    raise notice 'E1. rule <-> merge field REFUSED naming both sides — "%"', v_msg;
    raise notice 'E1. the circle — "%"', v_hint;
  end;

  -- E2. Rule <-> Rule, over two formula Fields of a Table this suite declares itself, so the
  --     second circle is a different shape and a longer path than the first.
  v_t2 := custom.table_declare(v_org, jsonb_build_object(
    'name','W1-RULE-APPLY cycle','slug','zz_w1_rule_apply_cycle','type','entity',
    'label_singular','Cycle','label_plural','Cycles','title_field','a','display','page',
    'weight','light','ordered',false,'row_order','sorted','default_sort','[]'::jsonb,
    'agent_writable',true,'retention_days',365,
    'fields', jsonb_build_array(jsonb_build_object('name','a'), jsonb_build_object('name','b')),
    'parent_id','11111111-0000-4000-8000-000000000001'));
  insert into custom.record (organization_id, table_id, data_class, data)
  values (v_org, custom.field_kernel_id(), 'field', jsonb_build_object(
    'entity_definition_id', v_t2, 'key','a','label','A','type','formula','sort',10,
    'required',false,'multi',false,'dated',false,'source','formula','compute_on','write',
    'config','{}'::jsonb,'rules','[]'::jsonb,'depends_on','[]'::jsonb,'sensitivity','internal',
    'source_config','{}'::jsonb,'context_policy','include','applies_to_types','[]'::jsonb))
  returning id into v_f1;
  insert into custom.record (organization_id, table_id, data_class, data)
  values (v_org, custom.field_kernel_id(), 'field', jsonb_build_object(
    'entity_definition_id', v_t2, 'key','b','label','B','type','formula','sort',20,
    'required',false,'multi',false,'dated',false,'source','formula','compute_on','write',
    'config','{}'::jsonb,'rules','[]'::jsonb,'depends_on','[]'::jsonb,'sensitivity','internal',
    'source_config','{}'::jsonb,'context_policy','include','applies_to_types','[]'::jsonb))
  returning id into v_f2;
  -- A computes from B. This one SAVES — the positive control of the pair.
  insert into custom.record (organization_id, table_id, data_class, data) values (v_org,
    '11111111-0000-4000-8000-000000000003'::uuid, 'rule',
    jsonb_build_object('name','A from B','kind','expression','scope_table_id', v_t2,
      'uses', jsonb_build_array('compute'), 'applies_to_types','[]'::jsonb,
      'target_field_id', v_f1,
      'expr', jsonb_build_object('op','concat','args', jsonb_build_array(jsonb_build_object('field', v_f2)))))
  returning id into v_ra;
  -- B computes from A. This one closes the circle.
  begin
    insert into custom.record (organization_id, table_id, data_class, data) values (v_org,
      '11111111-0000-4000-8000-000000000003'::uuid, 'rule',
      jsonb_build_object('name','B from A','kind','expression','scope_table_id', v_t2,
        'uses', jsonb_build_array('compute'), 'applies_to_types','[]'::jsonb,
        'target_field_id', v_f2,
        'expr', jsonb_build_object('op','concat','args', jsonb_build_array(jsonb_build_object('field', v_f1)))));
    raise exception 'E FAILED: two Rules were saved working each other''s answers out.';
  exception when others then
    get stacked diagnostics v_msg = message_text, v_hint = pg_exception_hint;
    if v_msg like 'E FAILED%' then raise; end if;
    if v_msg not like '%B from A%' or v_msg not like '%A from B%' then
      raise exception 'E FAILED: the refusal does not name BOTH Rules: %', v_msg;
    end if;
    raise notice 'E2. rule <-> rule REFUSED naming both sides — "%"', v_msg;
    raise notice 'E2. the circle — "%"', v_hint;
  end;
  raise notice 'E3. POSITIVE CONTROL — "A from B" (%) saved, and the seeded resolver merge field saved with the migration: a graph that closes nothing is not refused.', v_ra;

  -- ══════════════════════════════════════════════════════════════════════════
  -- F. REC-15 — ONE ROW, FOUR USES, and this lane's two reach the SAME id the
  --    other two do. This is what V1-MODEL's C-10a and C-10b re-execute.
  -- ══════════════════════════════════════════════════════════════════════════
  if (custom.rule_membership(v_org, v_r_all, v_sq) ->> 'rule_id')::uuid is distinct from v_r_all
     or (custom.rule_applies(v_org, v_r_all, v_sq) ->> 'rule_id')::uuid is distinct from v_r_all then
    raise exception 'F FAILED: the membership and applicability uses did not run against the row that validates and computes.';
  end if;
  if (custom.record_values(v_org, v_sq) ->> 'sides_equal') <> 'true'
     or (custom.record_values(v_org, v_wide) ->> 'sides_equal') <> 'false' then
    raise exception 'F FAILED: the compute use of the same row no longer answers true for a square and false for a rectangle.';
  end if;
  select count(distinct u) into v_n
    from custom.record r, jsonb_array_elements_text(r.data -> 'uses') u
   where r.organization_id = v_org and r.id = v_r_all;
  if v_n <> 4 then
    raise exception 'F FAILED: the row declares % uses.', v_n;
  end if;
  raise notice 'F. REC-15 — 11111111-0004-4000-8000-000000000101 declares all FOUR uses and answers as all four: validate and compute (W1-RULE), membership and applicability (this lane), against that ONE row id.';

  raise notice '=== W1-RULE-APPLY — DYN-6, REC-16 and the cycle refusal all executed on the branch, and this transaction rolls back. ===';
end;
$t$;

rollback;
