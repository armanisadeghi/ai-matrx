-- W1-RULE — REC-15, REC-17 and REC-19 EXECUTED against the rehearsal branch: one Rule row,
-- four declared uses, two of them run, a Field renamed underneath it, and a version that
-- travels with the answer.
--
-- RUN IT:
--   PSQL="$(pnpm -s exec tsx scripts/lib/psql-path.ts --print)"
--   "$PSQL" "$SUPABASE_BRANCH_DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -f scripts/campaign-tests/w1_rule_t8.sql
--
-- IT IS NOT A MIGRATION and never becomes one: it lives outside `migrations/`, is discovered
-- by no sweep, and its single transaction ends in ROLLBACK, so it leaves the branch exactly
-- as it found it. It is also the one place this lane's laws are EXECUTED rather than
-- asserted in prose.
--
-- WHAT MAKES IT FAIL. Every assertion is a POSITIVE query with a stated expected value, and
-- every refusal assertion compares the GUARD'S OWN MESSAGE — never the mere presence of an
-- error, which a typo would also produce. Every refusal is PAIRED with a positive control
-- that performs the same write successfully (rule 14), and every value assertion carries a
-- SECOND input with a DIFFERENT expected value (rule 3) — the compute use is asked for `true`
-- and for `false` from the same Rule row, so `return expected` cannot pass it. Its RED twin
-- is `w1_rule_red.sql`, which turns each of this lane's two guards off inside a rolled-back
-- transaction and proves the same writes then LAND.
--
-- THE ONE ROW EVERYTHING IS ABOUT: `11111111-0004-4000-8000-000000000101`, seeded by
-- `migrations/campaign/w1_rule_object_and_uses.sql`. Not a fixture this file writes — the
-- row that is on the branch and that the production file would put on production, which is
-- what makes `V1-MODEL`'s C-10a and C-10b executable against the same id this lane claims.
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
  v_f_title constant uuid := '11111111-0004-4000-8000-000000000010';
  v_f_kind  constant uuid := '11111111-0004-4000-8000-000000000011';
  v_f_width constant uuid := '11111111-0004-4000-8000-000000000012';
  v_f_hgt   constant uuid := '11111111-0004-4000-8000-000000000013';
  v_f_sides constant uuid := '11111111-0004-4000-8000-000000000014';
  v_rule    constant uuid := '11111111-0004-4000-8000-000000000101';
  v_mf_kern constant uuid := '11111111-0000-4000-8000-000000000009';
  v_sq      uuid;
  v_rect    uuid;
  v_r2      uuid;
  v_n       integer;
  v_v       integer;
  v_v2      integer;
  v_j       jsonb;
  v_msg     text;
  v_txt     text;
  v_tables_before integer;
  v_tables_after  integer;
begin
  if (pg_control_system()).system_identifier <> 7678069749886157684 then
    raise exception 'w1_rule_t8.sql refuses to run here: system_identifier is %, and this file may only run on the rehearsal branch (7678069749886157684)',
                    (pg_control_system()).system_identifier;
  end if;

  -- THIS LANE CREATED NO RELATION. Counted here as a query rather than claimed in prose: a
  -- Rule is a Record, so schema `custom` gained exactly ONE view and no table at all, and
  -- nothing this suite does adds one either.
  select count(*) into v_tables_before
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'custom' and c.relkind in ('r', 'p');

  -- ══════════════════════════════════════════════════════════════════════════
  -- A. REC-15 — ONE ROW, FOUR USES, declared rather than described
  -- ══════════════════════════════════════════════════════════════════════════
  select count(*) into v_n from custom.rule where id = v_rule;
  if v_n <> 1 then raise exception 'REC-15: the seeded Rule is not on custom.rule (% rows)', v_n; end if;

  select uses, kind, version into v_j, v_txt, v_v from custom.rule where id = v_rule;
  if jsonb_array_length(v_j) <> 4 then
    raise exception 'REC-15: the Rule declares % uses, and the law is four', jsonb_array_length(v_j);
  end if;
  if not (v_j ? 'validate' and v_j ? 'compute' and v_j ? 'membership' and v_j ? 'applicability') then
    raise exception 'REC-15: the Rule declares %, and the four uses are validate, compute, membership and applicability', v_j;
  end if;
  if v_txt <> 'predicate' then
    raise exception 'REC-15: the Rule''s kind is %, and only a predicate can serve all four uses', v_txt;
  end if;
  -- The four booleans on the surface are the same four uses read out of one stored list, so
  -- "which uses" is a query. All four true, from ONE row.
  select count(*) into v_n from custom.rule
   where id = v_rule and validates and computes and defines_membership and decides_applicability;
  if v_n <> 1 then raise exception 'REC-15: the four use columns do not all read true for the one Rule row'; end if;

  -- THE SAME ROW IS RETURNED FOR ALL FOUR USES by the one enumerator every use reads. The
  -- membership and applicability uses are W1-RULE-APPLY's to EXECUTE; that the one row serves
  -- them is this lane's to declare, and it is declared as a query.
  select count(*) into v_n from (
    select 1 from custom.table_rules(v_org, v_tbl, 'validate',      'square')  where id = v_rule
    union all
    select 1 from custom.table_rules(v_org, v_tbl, 'compute',       'square')  where id = v_rule
    union all
    select 1 from custom.table_rules(v_org, v_tbl, 'membership',    'square')  where id = v_rule
    union all
    select 1 from custom.table_rules(v_org, v_tbl, 'applicability', 'square')  where id = v_rule) s;
  if v_n <> 4 then
    raise exception 'REC-15: the one Rule row is reachable for % of its four uses', v_n;
  end if;

  -- A use nobody declared is refused BY NAME, so the closed set is closed in fact.
  begin
    perform 1 from custom.table_rules(v_org, v_tbl, 'frobnicate', 'square');
    raise exception 'REC-15: an invented use was accepted';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    if v_msg <> 'there is no frobnicate use of a rule' then
      raise exception 'REC-15 uses: the refusal said "%"', v_msg;
    end if;
  end;

  -- ══════════════════════════════════════════════════════════════════════════
  -- B. USE 1 — VALIDATE, executed against that row
  -- ══════════════════════════════════════════════════════════════════════════
  -- POSITIVE CONTROL FIRST: a square whose sides agree LANDS. Without it, the refusal below
  -- would prove only that something in this table refuses writes.
  insert into custom.record (organization_id, table_id, data)
  values (v_org, v_tbl, '{"title":"S1","kind":"square","width":4,"height":4}')
  returning id into v_sq;
  if v_sq is null then raise exception 'REC-15 validate: a square with equal sides did not land'; end if;

  -- AND THE REFUSAL, in the Rule's own words, naming the Rule and the version that judged it.
  begin
    insert into custom.record (organization_id, table_id, data)
    values (v_org, v_tbl, '{"title":"S2","kind":"square","width":4,"height":5}');
    raise exception 'REC-15 validate: a square with unequal sides was stored';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg <> 'the sides of a square have to be the same length' then
      raise exception 'REC-15 validate: the refusal said "%"', v_msg;
    end if;
  end;

  -- THE NARROWING IS REAL, NOT DECORATIVE: the same Rule does NOT validate a rectangle, so a
  -- rectangle whose sides differ is a perfectly good rectangle. This is the second input
  -- (rule 3) for the validate use — same row, opposite outcome.
  insert into custom.record (organization_id, table_id, data)
  values (v_org, v_tbl, '{"title":"R1","kind":"rectangle","width":3,"height":4}')
  returning id into v_rect;
  if v_rect is null then raise exception 'REC-15 use_types: a rectangle with unequal sides was refused, and the validate use is narrowed to squares'; end if;
  select count(*) into v_n from custom.table_rules(v_org, v_tbl, 'validate', 'rectangle');
  if v_n <> 0 then raise exception 'REC-15 use_types: % Rules validate a rectangle, and the narrowing says none', v_n; end if;
  select count(*) into v_n from custom.table_rules(v_org, v_tbl, 'compute', 'rectangle');
  if v_n <> 1 then raise exception 'REC-15 use_types: % Rules compute for a rectangle, and the Rule applies to one', v_n; end if;

  -- ══════════════════════════════════════════════════════════════════════════
  -- C. USE 2 — COMPUTE, executed against THE SAME row id, twice, two answers
  -- ══════════════════════════════════════════════════════════════════════════
  select data -> '_computed' -> 'sides_equal' into v_j from custom.record where organization_id = v_org and id = v_sq;
  if v_j is null then raise exception 'REC-15 compute: the square carries no worked-out answer'; end if;
  if (v_j -> 'value') <> to_jsonb(true) then
    raise exception 'REC-15 compute: the square''s sides_equal reads %, and 4 by 4 is equal', v_j -> 'value';
  end if;
  if (v_j ->> 'rule_id')::uuid <> v_rule then
    raise exception 'REC-15 compute: the answer says it came from %, and the Rule is %', v_j ->> 'rule_id', v_rule;
  end if;
  if (v_j ->> 'field_id')::uuid <> v_f_sides then
    raise exception 'REC-17 compute: the answer says it belongs to field %, and the target is %', v_j ->> 'field_id', v_f_sides;
  end if;

  -- THE SECOND INPUT, from the SAME ROW: a rectangle's answer is FALSE. A compute use that
  -- always returned true would pass every assertion above and fail here.
  select data -> '_computed' -> 'sides_equal' into v_j from custom.record where organization_id = v_org and id = v_rect;
  if v_j is null then raise exception 'REC-15 compute: the rectangle carries no worked-out answer'; end if;
  if (v_j -> 'value') <> to_jsonb(false) then
    raise exception 'REC-15 compute second input: the rectangle''s sides_equal reads %, and 3 by 4 is not equal', v_j -> 'value';
  end if;
  if (v_j ->> 'rule_id')::uuid <> v_rule then
    raise exception 'REC-15 compute: the two answers do not come from the same Rule row';
  end if;

  -- AND THE MERGED READER: a consumer asks for the record's Values and gets the worked-out
  -- one beside the typed ones, without knowing they are stored apart.
  v_j := custom.record_values(v_org, v_rect);
  if (v_j -> 'sides_equal') <> to_jsonb(false) or (v_j -> 'width') <> to_jsonb(3) then
    raise exception 'REC-15: custom.record_values returned %, and it should carry both the typed and the worked-out values', v_j;
  end if;
  if v_j ? '_computed' then
    raise exception 'REC-15: custom.record_values leaked the storage shape into the answer';
  end if;

  -- A WORKED-OUT ANSWER NOBODY WORKS OUT IS REFUSED, never quietly kept and never quietly
  -- dropped. The positive control is the write above, which landed with its own `_computed`.
  begin
    insert into custom.record (organization_id, table_id, data)
    values (v_org, v_tbl, '{"title":"F1","kind":"square","width":2,"height":2,"_computed":{"title":{"value":"forged"}}}');
    raise exception 'REC-15: a forged worked-out answer was stored';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg <> 'this record carries a worked-out answer for title that no rule works out' then
      raise exception 'REC-15 forgery: the refusal said "%"', v_msg;
    end if;
  end;

  -- T8's RETYPE, which is the one thing a refusal here would make impossible. A square
  -- becomes a circle: `sides_equal` stops being a thing about this record, and its worked-out
  -- answer is RETIRED with its reason, its Rule and the version that produced it — not
  -- refused, and not silently dropped. (`_retired` is a stand-in for History: W3-HIST.)
  insert into custom.record (organization_id, table_id, data)
  values (v_org, v_tbl, '{"title":"S8","kind":"square","width":5,"height":5}')
  returning id into v_r2;
  update custom.record set data = data || '{"kind":"circle"}'::jsonb
   where organization_id = v_org and id = v_r2;
  select data into v_j from custom.record where organization_id = v_org and id = v_r2;
  if v_j ? '_computed' then
    raise exception 'T8 retype: the retyped record still carries a worked-out answer - %', v_j -> '_computed';
  end if;
  select count(*) into v_n from jsonb_array_elements(coalesce(v_j -> '_retired', '[]'::jsonb) ) e
   where e ->> 'key' = 'sides_equal'
     and (e -> 'value') = to_jsonb(true)
     and (e ->> 'rule_id')::uuid = v_rule
     and (e ->> 'rule_version')::integer = 1
     and e ->> 'reason' is not null;
  if v_n <> 1 then
    raise exception 'T8 retype: the worked-out answer was not retired with its reason, its Rule and its version - %',
                    v_j -> '_retired';
  end if;

  -- ══════════════════════════════════════════════════════════════════════════
  -- D. REC-17 — BY ID, NEVER BY NAME, proven by RENAMING the field underneath
  -- ══════════════════════════════════════════════════════════════════════════
  -- The Rule is NOT touched in this section. Only the Field moves.
  update custom.record
     set data = jsonb_set(data, '{fields}',
                  '[{"name":"title"},{"name":"kind"},{"name":"breadth"},{"name":"height"},{"name":"sides_equal"}]'::jsonb)
   where organization_id = v_org and id = v_tbl;
  update custom.record
     set data = data || '{"key":"breadth","label":"Breadth"}'::jsonb
   where organization_id = v_org and id = v_f_width;

  -- The resolver follows the ID to the NEW key. A Rule that had stored the name "width"
  -- would now be reading a key nothing writes.
  if custom.rule_field_key(v_org, v_f_width) <> 'breadth' then
    raise exception 'REC-17: the field id resolves to %, and the field was renamed to breadth',
                    custom.rule_field_key(v_org, v_f_width);
  end if;
  if custom.rule_field_label(v_org, v_f_width) <> 'Breadth' then
    raise exception 'REC-17: the refusal would still say %, and the field is now called Breadth',
                    custom.rule_field_label(v_org, v_f_width);
  end if;

  -- AND THE RULE STILL FIRES, on the renamed key, with nothing about the Rule changed. THIS
  -- is the clause: a name-keyed Rule reads `width`, finds nothing, answers UNDECIDED, and
  -- stores the bad square silently.
  begin
    insert into custom.record (organization_id, table_id, data)
    values (v_org, v_tbl, '{"title":"S3","kind":"square","breadth":4,"height":5}');
    raise exception 'REC-17: after the rename the Rule stopped resolving - a square with unequal sides was stored';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg <> 'the sides of a square have to be the same length' then
      raise exception 'REC-17 after rename: the refusal said "%"', v_msg;
    end if;
  end;
  -- The positive control on the renamed key, and the SECOND input: it lands, and its
  -- worked-out answer is true.
  insert into custom.record (organization_id, table_id, data)
  values (v_org, v_tbl, '{"title":"S4","kind":"square","breadth":7,"height":7}')
  returning id into v_r2;
  select data -> '_computed' -> 'sides_equal' -> 'value' into v_j
    from custom.record where organization_id = v_org and id = v_r2;
  if v_j <> to_jsonb(true) then
    raise exception 'REC-17 after rename: the worked-out answer reads %, and 7 by 7 is equal', v_j;
  end if;

  -- THE COMPLEMENT, which is what makes the clause above mean something: writing the OLD key
  -- now fails on the FIELD's own name, because the value moved with the rename and the Rule
  -- reads where the Field says it is.
  begin
    insert into custom.record (organization_id, table_id, data)
    values (v_org, v_tbl, '{"title":"S5","kind":"square","width":4,"height":5}');
    raise exception 'REC-17: the old key was still accepted after the rename';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg <> 'Breadth is required' then
      raise exception 'REC-17 old key: the refusal said "%"', v_msg;
    end if;
  end;

  -- Put the field back, so the rest of the suite reads the seeded names. The Table is
  -- declared FIRST and the definition second, for the same reason the rename above went in
  -- that order: FLD-8 refuses a definition for a field its Table does not declare.
  update custom.record
     set data = jsonb_set(data, '{fields}',
                  '[{"name":"title"},{"name":"kind"},{"name":"width"},{"name":"height"},{"name":"sides_equal"}]'::jsonb)
   where organization_id = v_org and id = v_tbl;
  update custom.record
     set data = data || '{"key":"width","label":"Width"}'::jsonb
   where organization_id = v_org and id = v_f_width;

  -- REC-17 AS A REFUSAL: a Rule that reaches for a Field BY NAME cannot be STORED. Four
  -- shapes, because these are the four ways the law actually gets broken in practice. The
  -- positive control is the seeded Rule itself, and the one written at the end of this block.
  begin
    insert into custom.record (organization_id, table_id, data_class, data)
    values (v_org, custom.rule_kernel_id(), 'rule', jsonb_build_object(
      'name','by name','kind','predicate','scope_table_id',v_tbl::text,'uses',jsonb_build_array('validate'),
      'applies_to_types','[]'::jsonb,
      'expr', jsonb_build_object('op','eq','args', jsonb_build_array(
                jsonb_build_object('field_name','width'), jsonb_build_object('field', v_f_hgt::text)))));
    raise exception 'REC-17: a Rule naming a field was stored';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg <> 'the rule by name names a field instead of pointing at it' then
      raise exception 'REC-17 field_name: the refusal said "%"', v_msg;
    end if;
  end;
  begin
    insert into custom.record (organization_id, table_id, data_class, data)
    values (v_org, custom.rule_kernel_id(), 'rule', jsonb_build_object(
      'name','name in the id slot','kind','predicate','scope_table_id',v_tbl::text,
      'uses',jsonb_build_array('validate'),'applies_to_types','[]'::jsonb,
      'expr', jsonb_build_object('op','eq','args', jsonb_build_array(
                jsonb_build_object('field','width'), jsonb_build_object('field', v_f_hgt::text)))));
    raise exception 'REC-17: a Rule with a field NAME in the id slot was stored';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg <> 'the rule name in the id slot points at a field with width instead of with its id' then
      raise exception 'REC-17 name-in-id-slot: the refusal said "%"', v_msg;
    end if;
  end;
  begin
    insert into custom.record (organization_id, table_id, data_class, data)
    values (v_org, custom.rule_kernel_id(), 'rule', jsonb_build_object(
      'name','someone else''s field','kind','predicate','scope_table_id',v_tbl::text,
      'uses',jsonb_build_array('validate'),'applies_to_types','[]'::jsonb,
      'expr', jsonb_build_object('op','present','args', jsonb_build_array(
                jsonb_build_object('field','11111111-0003-4000-8000-000000000001')))));
    raise exception 'REC-17: a Rule pointing at another table''s field was stored';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg <> 'the rule someone else''s field points at a field that is not one of that table''s fields' then
      raise exception 'REC-17 foreign field: the refusal said "%"', v_msg;
    end if;
  end;
  begin
    insert into custom.record (organization_id, table_id, data_class, data)
    values (v_org, custom.rule_kernel_id(), 'rule', jsonb_build_object(
      'name','a field that is not there','kind','predicate','scope_table_id',v_tbl::text,
      'uses',jsonb_build_array('validate'),'applies_to_types','[]'::jsonb,
      'expr', jsonb_build_object('op','present','args', jsonb_build_array(
                jsonb_build_object('field','11111111-9999-4000-8000-000000000099')))));
    raise exception 'REC-17: a Rule pointing at no field at all was stored';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg <> 'the rule a field that is not there points at a field that is not one of that table''s fields' then
      raise exception 'REC-17 absent field: the refusal said "%"', v_msg;
    end if;
  end;

  -- ══════════════════════════════════════════════════════════════════════════
  -- E. REC-19 — VERSIONS, and the version that PRODUCED a Value
  -- ══════════════════════════════════════════════════════════════════════════
  select version into v_v from custom.rule where id = v_rule;
  if v_v <> 1 then raise exception 'REC-19: the seeded Rule is at version %, and a seeded row is version 1', v_v; end if;
  if custom.rule_version(v_org, v_rule) <> v_v then
    raise exception 'REC-19: custom.rule_version says % and the surface says %', custom.rule_version(v_org, v_rule), v_v;
  end if;

  -- THE VERSION INCREMENTS ON CHANGE. Through the STORE first.
  update custom.record
     set data = jsonb_set(data, '{message}', '"a square is as wide as it is tall"'::jsonb)
   where organization_id = v_org and id = v_rule;
  select version into v_v2 from custom.rule where id = v_rule;
  if v_v2 <> v_v + 1 then
    raise exception 'REC-19: the Rule changed and its version went from % to %', v_v, v_v2;
  end if;

  -- AND THROUGH THE PROJECTION, by exactly ONE — not two. A second `version = version + 1`
  -- in the view's write trigger would make a write through the surface count twice, which is
  -- how a version number stops meaning anything.
  update custom.rule set message = 'the sides of a square have to be the same length' where id = v_rule;
  select version into v_v from custom.rule where id = v_rule;
  if v_v <> v_v2 + 1 then
    raise exception 'REC-19: a write through custom.rule moved the version from % to %, and one change is one version',
                    v_v2, v_v;
  end if;

  -- AND THE VERSION TRAVELS WITH THE ANSWER: a record written now carries THREE, where the
  -- one written at the top of this suite carries ONE. Same Rule, same expression, different
  -- version — which is what History stamps.
  insert into custom.record (organization_id, table_id, data)
  values (v_org, v_tbl, '{"title":"S6","kind":"square","width":9,"height":9}')
  returning id into v_r2;
  select (data -> '_computed' -> 'sides_equal' ->> 'rule_version')::integer into v_n
    from custom.record where organization_id = v_org and id = v_r2;
  if v_n <> v_v then
    raise exception 'REC-19: the new answer says version % and the Rule is at version %', v_n, v_v;
  end if;
  select (data -> '_computed' -> 'sides_equal' ->> 'rule_version')::integer into v_n
    from custom.record where organization_id = v_org and id = v_sq;
  if v_n <> 1 then
    raise exception 'REC-19 second input: the answer written before the Rule changed says version %, and it was produced by version 1', v_n;
  end if;

  -- WHAT W3-HIST READS, as a query rather than as a promise.
  select count(*) into v_n from custom.computed_provenance(v_org, v_r2);
  if v_n <> 1 then raise exception 'REC-19: custom.computed_provenance returned % rows for one worked-out value', v_n; end if;
  select p.rule_version into v_n from custom.computed_provenance(v_org, v_r2) p where p.field_key = 'sides_equal';
  if v_n <> v_v then
    raise exception 'REC-19: the provenance says version % and the Rule is at version %', v_n, v_v;
  end if;
  select count(*) into v_n from custom.computed_provenance(v_org, v_r2) p
   where p.rule_id = v_rule and p.field_id = v_f_sides and p.computed_at is not null;
  if v_n <> 1 then raise exception 'REC-19: the provenance row does not name the Rule, the Field and the moment'; end if;

  -- ══════════════════════════════════════════════════════════════════════════
  -- F. THE EVALUATOR REFUSES RATHER THAN GUESSES
  -- ══════════════════════════════════════════════════════════════════════════
  -- REC-16 is W1-RULE-APPLY's. The node is STORABLE tonight — an applicability Rule can be
  -- written before its evaluator lands — and refused BY NAME when it is run, with the lane
  -- that owns it in the hint. Nothing about it answers wrongly in the meantime.
  insert into custom.record (organization_id, table_id, data_class, data)
  values (v_org, custom.rule_kernel_id(), 'rule', jsonb_build_object(
    'name','reads the parent','kind','predicate','scope_table_id',v_tbl::text,
    'uses',jsonb_build_array('applicability'),'applies_to_types','[]'::jsonb,
    'expr', jsonb_build_object('op','eq','args', jsonb_build_array(
              jsonb_build_object('field', v_f_kind::text),
              jsonb_build_object('parent_field', v_f_kind::text)))))
  returning id into v_r2;
  if v_r2 is null then raise exception 'REC-16: an applicability Rule reading the parent could not be stored at all'; end if;
  begin
    perform custom.rule_run(v_org, v_r2, '{"kind":"square"}'::jsonb);
    raise exception 'REC-16: the parent_field node answered, and W1-RULE evaluates no parent';
  exception when feature_not_supported then
    get stacked diagnostics v_msg = message_text;
    if v_msg <> 'this rule reads the parent''s answer, and that is not switched on yet' then
      raise exception 'REC-16: the refusal said "%"', v_msg;
    end if;
  end;

  -- A comparison of a word with a number is refused by name rather than coerced: a coerced
  -- comparison answers about a different value, which is a rule that lies.
  insert into custom.record (organization_id, table_id, data_class, data)
  values (v_org, custom.rule_kernel_id(), 'rule', jsonb_build_object(
    'name','words against numbers','kind','predicate','scope_table_id',v_tbl::text,
    'uses',jsonb_build_array('validate'),'applies_to_types','[]'::jsonb,
    'expr', jsonb_build_object('op','gt','args', jsonb_build_array(
              jsonb_build_object('field', v_f_title::text), jsonb_build_object('const', 1)))))
  returning id into v_r2;
  begin
    perform custom.rule_run(v_org, v_r2, '{"title":"S1"}'::jsonb);
    raise exception 'REC-15: a word was compared with a number';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    if v_msg <> 'this rule compares numbers, and it was given a string and a number' then
      raise exception 'REC-15 coercion: the refusal said "%"', v_msg;
    end if;
  end;
  -- POSITIVE CONTROL for the same node: two numbers compare.
  v_j := custom.rule_eval(v_org, jsonb_build_object('op','gt','args', jsonb_build_array(
           jsonb_build_object('field', v_f_width::text), jsonb_build_object('const', 1))),
           '{"width":4}'::jsonb);
  if v_j <> to_jsonb(true) then raise exception 'REC-15: 4 > 1 answered %', v_j; end if;
  v_j := custom.rule_eval(v_org, jsonb_build_object('op','gt','args', jsonb_build_array(
           jsonb_build_object('field', v_f_width::text), jsonb_build_object('const', 9))),
           '{"width":4}'::jsonb);
  if v_j <> to_jsonb(false) then raise exception 'REC-15 second input: 4 > 9 answered %', v_j; end if;

  -- AN ABSENT VALUE MAKES THE ANSWER UNDECIDED, and undecided is not false. Whether an
  -- absence is allowed is the FIELD's `required`, and a Rule that refused here would be
  -- answering a question nobody asked.
  v_j := custom.rule_eval(v_org, jsonb_build_object('op','eq','args', jsonb_build_array(
           jsonb_build_object('field', v_f_width::text), jsonb_build_object('field', v_f_hgt::text))),
           '{"width":4}'::jsonb);
  if jsonb_typeof(v_j) <> 'null' then
    raise exception 'REC-15: a comparison against an absent value answered %, and it is undecided', v_j;
  end if;
  if custom.rule_truth(v_j) is not null then
    raise exception 'REC-15: custom.rule_truth read an undecided answer as %', custom.rule_truth(v_j);
  end if;
  if custom.rule_truth(to_jsonb(false)) is not false or custom.rule_truth(to_jsonb(true)) is not true then
    raise exception 'REC-15: custom.rule_truth does not read true and false as themselves';
  end if;

  -- Dividing by nothing is refused by name, and the positive control divides.
  begin
    perform custom.rule_eval(v_org, jsonb_build_object('op','div','args', jsonb_build_array(
              jsonb_build_object('const', 6), jsonb_build_object('const', 0))), '{}'::jsonb);
    raise exception 'REC-15: a division by zero answered';
  exception when division_by_zero then
    get stacked diagnostics v_msg = message_text;
    if v_msg <> 'this rule divides by nothing' then
      raise exception 'REC-15 div: the refusal said "%"', v_msg;
    end if;
  end;
  v_j := custom.rule_eval(v_org, jsonb_build_object('op','div','args', jsonb_build_array(
           jsonb_build_object('const', 6), jsonb_build_object('const', 3))), '{}'::jsonb);
  if v_j <> to_jsonb(2) then raise exception 'REC-15: 6 / 3 answered %', v_j; end if;

  -- ══════════════════════════════════════════════════════════════════════════
  -- G. WHAT A RULE MUST DECLARE — every refusal paired with a control
  -- ══════════════════════════════════════════════════════════════════════════
  -- An expression cannot validate, because there is nothing for it to be true about.
  begin
    insert into custom.record (organization_id, table_id, data_class, data)
    values (v_org, custom.rule_kernel_id(), 'rule', jsonb_build_object(
      'name','an expression that judges','kind','expression','scope_table_id',v_tbl::text,
      'uses',jsonb_build_array('compute','validate'),'applies_to_types','[]'::jsonb,
      'target_field_id', v_f_sides::text,
      'expr', jsonb_build_object('op','add','args', jsonb_build_array(
                jsonb_build_object('field', v_f_width::text), jsonb_build_object('field', v_f_hgt::text)))));
    raise exception 'REC-15: an expression Rule was allowed to validate';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg <> 'the rule an expression that judges works out a value, so it cannot also decide validate' then
      raise exception 'REC-15 kind: the refusal said "%"', v_msg;
    end if;
  end;
  -- THE CONTROL: the same expression Rule, computing only, LANDS — and a second compute Rule
  -- on the same Table is enumerated in declared order beside the first.
  insert into custom.record (organization_id, table_id, data_class, data)
  values (v_org, custom.rule_kernel_id(), 'rule', jsonb_build_object(
    'name','an expression that computes','kind','expression','scope_table_id',v_tbl::text,
    'uses',jsonb_build_array('compute'),'applies_to_types','[]'::jsonb,'sort',20,
    'target_field_id', v_f_sides::text,
    'expr', jsonb_build_object('op','add','args', jsonb_build_array(
              jsonb_build_object('field', v_f_width::text), jsonb_build_object('field', v_f_hgt::text)))))
  returning id into v_r2;
  if v_r2 is null then raise exception 'REC-15: an expression Rule that only computes was refused'; end if;
  select count(*) into v_n from custom.table_rules(v_org, v_tbl, 'compute', 'square');
  if v_n <> 2 then raise exception 'REC-15: % compute Rules for a square, and two were declared', v_n; end if;
  -- Declared ORDER, which is what DYN-6's first-match Resolver will read: sort 10 then 20.
  select (array_agg(t.data ->> 'name'))[1] into v_txt
    from custom.table_rules(v_org, v_tbl, 'compute', 'square') t;
  if v_txt <> 'A square has equal sides' then
    raise exception 'REC-15: the first Rule in declared order is %, and sort 10 comes before sort 20', v_txt;
  end if;

  -- A compute Rule with nowhere to put its answer is refused; a compute Rule pointing at a
  -- hand-filled field is refused by that field's own name.
  begin
    insert into custom.record (organization_id, table_id, data_class, data)
    values (v_org, custom.rule_kernel_id(), 'rule', jsonb_build_object(
      'name','nowhere to put it','kind','predicate','scope_table_id',v_tbl::text,
      'uses',jsonb_build_array('compute'),'applies_to_types','[]'::jsonb,
      'expr', jsonb_build_object('op','present','args', jsonb_build_array(
                jsonb_build_object('field', v_f_width::text)))));
    raise exception 'REC-15: a compute Rule with no target field was stored';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg <> 'the rule nowhere to put it works something out, so it has to say which field holds the answer' then
      raise exception 'REC-15 target: the refusal said "%"', v_msg;
    end if;
  end;
  begin
    insert into custom.record (organization_id, table_id, data_class, data)
    values (v_org, custom.rule_kernel_id(), 'rule', jsonb_build_object(
      'name','over the typing','kind','predicate','scope_table_id',v_tbl::text,
      'uses',jsonb_build_array('compute'),'applies_to_types','[]'::jsonb,
      'target_field_id', v_f_title::text,
      'expr', jsonb_build_object('op','present','args', jsonb_build_array(
                jsonb_build_object('field', v_f_width::text)))));
    raise exception 'REC-15: a Rule computing a hand-filled field was stored';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg <> 'the rule over the typing puts its answer in Title, and that field is filled in by hand' then
      raise exception 'FLD-9 target: the refusal said "%"', v_msg;
    end if;
  end;
  -- A Rule with no uses at all, a Rule with an invented use, a Rule about no Table, and a
  -- narrowing of a use the Rule does not have.
  begin
    insert into custom.record (organization_id, table_id, data_class, data)
    values (v_org, custom.rule_kernel_id(), 'rule', jsonb_build_object(
      'name','for nothing','kind','predicate','scope_table_id',v_tbl::text,
      'uses','[]'::jsonb,'applies_to_types','[]'::jsonb,
      'expr', jsonb_build_object('op','present','args', jsonb_build_array(jsonb_build_object('field', v_f_width::text)))));
    raise exception 'REC-15: a Rule for no use at all was stored';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg <> 'the rule for nothing has to say what it is for' then
      raise exception 'REC-15 uses empty: the refusal said "%"', v_msg;
    end if;
  end;
  begin
    insert into custom.record (organization_id, table_id, data_class, data)
    values (v_org, custom.rule_kernel_id(), 'rule', jsonb_build_object(
      'name','a fifth use','kind','predicate','scope_table_id',v_tbl::text,
      'uses',jsonb_build_array('validate','summarise'),'applies_to_types','[]'::jsonb,
      'expr', jsonb_build_object('op','present','args', jsonb_build_array(jsonb_build_object('field', v_f_width::text)))));
    raise exception 'REC-15: a fifth use was stored';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg <> 'the rule a fifth use says it is used to summarise, and there is no such use' then
      raise exception 'REC-15 fifth use: the refusal said "%"', v_msg;
    end if;
  end;
  begin
    insert into custom.record (organization_id, table_id, data_class, data)
    values (v_org, custom.rule_kernel_id(), 'rule', jsonb_build_object(
      'name','narrowed for nothing','kind','predicate','scope_table_id',v_tbl::text,
      'uses',jsonb_build_array('validate'),'applies_to_types','[]'::jsonb,
      'use_types', jsonb_build_object('compute', jsonb_build_array('square')),
      'expr', jsonb_build_object('op','present','args', jsonb_build_array(jsonb_build_object('field', v_f_width::text)))));
    raise exception 'REC-15: a narrowing of a use the Rule does not have was stored';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg <> 'the rule narrowed for nothing narrows its compute use, and it is not used to compute at all' then
      raise exception 'REC-15 narrowing: the refusal said "%"', v_msg;
    end if;
  end;
  begin
    insert into custom.record (organization_id, table_id, data_class, data)
    values (v_org, custom.rule_kernel_id(), 'rule', jsonb_build_object(
      'name','about nothing','kind','predicate','scope_table_id', v_mf_kern::text,
      'uses',jsonb_build_array('validate'),'applies_to_types','[]'::jsonb,
      'expr', jsonb_build_object('op','present','args', jsonb_build_array(jsonb_build_object('field', v_f_width::text)))));
    raise exception 'REC-15: a Rule about a table that is not a table was stored';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg <> 'the rule about nothing says it is about a table this organization does not have' then
      raise exception 'REC-15 scope: the refusal said "%"', v_msg;
    end if;
  end;

  -- ══════════════════════════════════════════════════════════════════════════
  -- H. THE PROJECTION IS A SURFACE, NEVER A SECOND STORE
  -- ══════════════════════════════════════════════════════════════════════════
  -- A Rule written THROUGH custom.rule lands in custom.record and the SAME guard fires on it.
  insert into custom.rule (organization_id, name, kind, scope_table_id, uses, applies_to_types, expr)
  values (v_org, 'written through the surface', 'predicate', v_tbl,
          jsonb_build_array('validate'), '[]'::jsonb,
          jsonb_build_object('op','present','args', jsonb_build_array(jsonb_build_object('field', v_f_width::text))))
  returning id into v_r2;
  select count(*) into v_n from custom.record
   where organization_id = v_org and id = v_r2 and table_id = custom.rule_kernel_id() and data_class = 'rule';
  if v_n <> 1 then raise exception 'REC-15: a Rule written through the surface is not in the store'; end if;
  begin
    insert into custom.rule (organization_id, name, kind, scope_table_id, uses, applies_to_types, expr)
    values (v_org, 'named through the surface', 'predicate', v_tbl,
            jsonb_build_array('validate'), '[]'::jsonb,
            jsonb_build_object('op','present','args', jsonb_build_array(jsonb_build_object('field_name','width'))));
    raise exception 'REC-17: the surface let a name-referencing Rule through';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg <> 'the rule named through the surface names a field instead of pointing at it' then
      raise exception 'REC-17 through the surface: the refusal said "%"', v_msg;
    end if;
  end;
  -- And a DELETE through the surface soft-deletes rather than erasing, so History has
  -- something to read (W3-HIST).
  delete from custom.rule where id = v_r2;
  select count(*) into v_n from custom.rule where id = v_r2;
  if v_n <> 0 then raise exception 'REC-15: a Rule deleted through the surface is still on it'; end if;
  select count(*) into v_n from custom.record where organization_id = v_org and id = v_r2 and deleted_at is not null;
  if v_n <> 1 then raise exception 'REC-15: a Rule deleted through the surface was erased rather than retired'; end if;

  -- ══════════════════════════════════════════════════════════════════════════
  -- I. THE TRIGGER ORDER IS LOAD-BEARING, so it is asserted rather than assumed
  -- ══════════════════════════════════════════════════════════════════════════
  -- W1-FIELD's validator decides the TYPES and this lane's Rules are then asked about values
  -- already the right shape. Postgres fires BEFORE ROW triggers in name order, so the proof
  -- is that a square whose width is WORDS is refused by the FIELD, not by the Rule.
  select count(*) into v_n from pg_trigger
   where tgrelid = 'custom.record'::regclass and not tgisinternal
     and tgname = 'custom_record_rule_uses';
  if v_n <> 1 then raise exception 'REC-15: this lane''s trigger is not on the store'; end if;
  if (select min(tgname) from pg_trigger
       where tgrelid = 'custom.record'::regclass and not tgisinternal
         and tgname in ('custom_record_field_validation','custom_record_rule_uses'))
     <> 'custom_record_field_validation' then
    raise exception 'REC-15: the rule trigger no longer sorts after the field validation trigger';
  end if;
  begin
    insert into custom.record (organization_id, table_id, data)
    values (v_org, v_tbl, '{"title":"S7","kind":"square","width":"four","height":4}');
    raise exception 'REC-51: a width of "four" was stored';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg <> 'Width takes a number, and it was given a string' then
      raise exception 'trigger order: the refusal said "%", and the FIELD should have spoken first', v_msg;
    end if;
  end;

  -- ══════════════════════════════════════════════════════════════════════════
  -- J. THIS LANE CREATED NO RELATION
  -- ══════════════════════════════════════════════════════════════════════════
  select count(*) into v_tables_after
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'custom' and c.relkind in ('r', 'p');
  if v_tables_after <> v_tables_before then
    raise exception 'REC-25: schema custom held % tables and now holds % - a Rule is a Record and this lane creates no relation',
                    v_tables_before, v_tables_after;
  end if;
  select count(*) into v_n from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'custom' and c.relkind = 'v' and c.relname = 'rule';
  if v_n <> 1 then raise exception 'REC-15: custom.rule is not a view'; end if;
  select count(*) into v_n from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'custom' and c.relname = 'rule' and c.relkind = 'v'
     and 'security_invoker=true' = any (c.reloptions);
  if v_n <> 1 then raise exception 'REC-15: custom.rule is not security_invoker'; end if;

  raise notice 'W1-RULE SUITE GREEN - one Rule row (%) declared for four uses, validate and compute EXECUTED against it, the Width field renamed underneath it and the Rule still firing, and the version at % travelling with every answer it produced',
               v_rule, v_v;
end;
$t$;

rollback;
