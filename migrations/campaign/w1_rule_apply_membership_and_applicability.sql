-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- based-on: custom.rule_node_kinds() ce646289e178b4b56a8c1664c95b8069ca66d08ec7968a3ff02d89a42fabdf4c
-- based-on: custom.rule_eval(uuid,jsonb,jsonb,jsonb) d2e11d617e0b170f4cf1472659ffc98c5b64228c308080babc7fb57121101977
--
-- 🚨 WHY THIS FILE IS NOT `w1_rule_apply_the_other_two_uses.sql`, WHICH THE BRANCH LEDGER
-- NAMES. The first rehearsal of these bytes (sha256 `8005de19ca63…`, applied 19:00:50Z)
-- carried a real defect, and this lane's own suite caught it on the branch: the cycle
-- refusal read the saved row's NAME out of `custom.record`, where an INSERTed row is not yet
-- - so a Rule <-> Rule circle was correctly refused and the refusal read `saving "<NULL>"`,
-- naming one side and a null. §4.13's answer to a wrong branch migration is its own inverse,
-- so the inverse was RUN: both replaced bodies came back byte for byte to W1-RULE's hashes,
-- this lane's ten functions, its trigger and its four seeded rows were gone. The corrected
-- bytes cannot re-use the old NAME - the runner refuses a file already ledgered with a
-- different SHA-256, and it is right to, because a ledger row records what actually ran and
-- those bytes did run and were reversed. So the corrected file is a new name and the old row
-- stands as the history it is.
--
-- W1-RULE-APPLY — the Rule's OTHER TWO USES, made real: membership (DYN-6) and
--                 applicability (REC-16), plus the save-time cycle refusal across Rules and
--                 merge fields.
--
-- `W1-RULE` stored one Rule row, `11111111-0004-4000-8000-000000000101`, declaring ALL FOUR
-- uses against ONE expression, and wired two of them. The other two were STORABLE and
-- REFUSED BY NAME at evaluation, with this lane printed as the remedy: `parent_field` raised
-- `0A000 "this rule reads the parent's answer, and that is not switched on yet"`, and
-- `custom.table_rules(…, 'membership' | 'applicability', …)` answered with rows nothing read.
-- This file is that remedy. It adds NO seventh core object: a Resolver is the same Rule row
-- in its membership use (DYN-6), an applicability answer is the same `custom.rule_run()` over
-- the same expression (REC-16), and every function below reads `custom.record` through the
-- projections `W1-TABLE`, `W1-FIELD` and `W1-RULE` already built.
--
-- THE RULING THIS FILE EXECUTES (build log 2026-09-17 18:55 UTC, rules 23 and 28)
-- ------------------------------------------------------------------------------
-- REC-16 — ONE ancestor level and no further, and it is STRUCTURAL rather than a limit
-- anybody has to remember. `custom.rule_context()` builds `{parent_id, parent_values}` from
-- `custom.containment_parent(data)` (W1-TABLE's, REC-7) and nothing recursive, and the
-- evaluator reads a `parent_field` leaf out of that ONE map. There is no shape in which the
-- context can carry a second ancestor, so a two-level Rule is not "discouraged" — the thing
-- it would read does not exist. It is ALSO refused in words, at save time and at evaluation,
-- naming the Rule: a nested `{"parent_field": {"parent_field": …}}`, a `levels`/`up` above
-- one, and the nodes `grandparent_field` and `ancestor_field`. Cost if the ruling is wrong:
-- one entry in `custom.rule_context()` and one guard branch, both in this file.
--
-- THE SECOND DECISION, recorded in the same log row rather than smuggled in here.
-- `custom.rule_node_kinds()` gains ONE node, `merge_field`, evaluated by `W5-MERGE-B` —
-- storable today and REFUSED BY NAME at evaluation with that lane as the remedy, which is
-- exactly the shape `W1-RULE` gave `parent_field` for this lane. It exists because this
-- lane's exit owes a cycle refusal ACROSS RULES AND MERGE FIELDS, and a Rule with no way to
-- name a merge field can only ever cycle with another Rule: the refusal would have been
-- theatre. Cost if wrong: one row of a vocabulary function and one guard branch.
--
-- WHAT EACH LAW BECOMES
-- ---------------------
--   DYN-6   A Resolver is a Rule in its membership use, ORDERED, taking the FIRST match, and
--           adds no seventh core object. `custom.resolve_first_match()` walks
--           `custom.table_rules(…, 'membership', …)` — the SAME enumerator validate and
--           compute read, in the SAME declared order — and stops at the first true answer.
--           🚨 IT RETURNS A TRACE, and that is the point rather than a convenience: the trace
--           records every Rule CONSIDERED, in the order it was considered, with the answer it
--           gave and whether it matched, so "first match, in declared order" is read out of
--           what the run DID and never out of the rule list a reader could re-sort in their
--           head. A run that evaluated them in the wrong order, or kept going after a match,
--           writes a trace that says so.
--   REC-16  An applicability Rule reads the record's own Values and its parent's, one level
--           up, and no further. `custom.rule_applies()` is `custom.rule_run()` with
--           `custom.rule_context()` as its context; `custom.record_applicability()` answers
--           for every applicability Rule of a record's Table at once.
--   the exit's third clause — a save that would create a CYCLE across Rules and merge fields
--           is refused naming BOTH SIDES. `custom.rule_dependency_edges()` is the one graph
--           (a compute Rule's target Field needs that Rule; a Rule needs every Field and
--           merge field its expression names; a merge field needs the Rule it resolves
--           through, the Field it reads and the merge fields it declares), and
--           `custom._rule_topology_guard()` refuses the write that would close a loop,
--           printing the whole path in the user's own words.
--
-- WHY A PARENT'S VALUE IS NOT IN THE CYCLE GRAPH, said plainly so nobody reads it as an
-- omission. A `parent_field` leaf reads ANOTHER RECORD's value, and the graph this guard
-- protects is the one inside a single record: Rules and merge fields that work each other's
-- answers out. Two records that read each other's values are a containment question, and
-- containment is already a tree with its own refusal ("this would put it inside itself",
-- REC-8, `custom._containment_guard`). A parent edge here would refuse Rules that are
-- perfectly well founded.
--
-- WHY NOTHING HERE IS A GRANT, and why the two replaced bodies are safe. Schema `custom` is
-- revoked from PUBLIC, anon, authenticated and service_role, is absent from
-- `pgrst.db_schemas` and from the ORM, and `custom/system_enabled` resolves false on both
-- databases. Every function below is SECURITY INVOKER and carries no GRANT, so
-- `custom.record_write` (DOOR-N-1) remains the one door. The two `CREATE OR REPLACE`
-- statements — `custom.rule_node_kinds()` and `custom.rule_eval()` — return a table and
-- jsonb, not `trigger`, so JUDGMENT.md §4a's schema-`custom` exemption covers them; each
-- declares the exact body it was written against in a `-- based-on:` line above, and
-- `custom.rule_eval`'s body below is `W1-RULE`'s, byte for byte, with ONE block changed and
-- marked. The one trigger this file creates is on a table IN schema `custom`.
--
-- IDEMPOTENCE, STATED HONESTLY, exactly as `W1-RULE` states it: §6b.2's allow-list refuses
-- `CREATE OR REPLACE TRIGGER` and PostgreSQL has no `IF NOT EXISTS` for `CREATE TRIGGER` or
-- `CREATE FUNCTION`, so a second consecutive apply of these bytes is refused BY THE DATABASE
-- (42723 / 42710) and changes nothing. Rule 27's loop is up -> inverse -> `--reapply`. Every
-- seeded ROW is `on conflict do nothing`.
--
-- THE INVERSE: `migrations/inverse/w1_rule_apply_the_other_two_uses_down.sql` (its name is the first rehearsal's, kept so the two halves of that history read together).

set lock_timeout = '5s';
set statement_timeout = '300s';

-- ══════════════════════════════════════════════════════════════════════════════
-- 1. THE VOCABULARY — the two nodes this lane evaluates, and the one it adds
-- ══════════════════════════════════════════════════════════════════════════════
-- `W1-RULE` wrote this function so that "which nodes work, and who evaluates them" is a
-- QUERY rather than a sentence. Two rows move: `parent_field` is this lane's and is now
-- evaluated, and `merge_field` is added storable-but-refused with `W5-MERGE-B` as its
-- remedy — the same shape `parent_field` had here overnight.

create or replace function custom.rule_node_kinds() returns table (node text, evaluated_by text, note text)
  language sql immutable parallel safe
  set search_path to 'pg_catalog'
as $fn_rule_nodes$
  select * from (values
    ('const',        'W1-RULE',       'a literal JSON value'),
    ('field',        'W1-RULE',       'REC-17: the record''s own Value for the Field with this ID'),
    ('parent_field', 'W1-RULE-APPLY', 'REC-16: the PARENT''s Value for the Field with this ID, ONE level up and no further — a second level is refused by name, at save time and at evaluation'),
    ('merge_field',  'W5-MERGE-B',    'DYN-4: the answer a merge field resolves to, by ID — storable today so a Rule and a merge field can be seen to depend on each other, and refused by name at evaluation until W5-MERGE-B lands it'),
    ('eq',           'W1-RULE',       'two answers are the same'),
    ('ne',           'W1-RULE',       'two answers differ'),
    ('lt',           'W1-RULE',       'less than, numbers only'),
    ('lte',          'W1-RULE',       'at most, numbers only'),
    ('gt',           'W1-RULE',       'greater than, numbers only'),
    ('gte',          'W1-RULE',       'at least, numbers only'),
    ('and',          'W1-RULE',       'every argument is true'),
    ('or',           'W1-RULE',       'some argument is true'),
    ('not',          'W1-RULE',       'the opposite'),
    ('add',          'W1-RULE',       'a sum'),
    ('sub',          'W1-RULE',       'a difference'),
    ('mul',          'W1-RULE',       'a product'),
    ('div',          'W1-RULE',       'a quotient; dividing by nothing is refused by name'),
    ('concat',       'W1-RULE',       'words joined'),
    ('length',       'W1-RULE',       'how long the words are'),
    ('present',      'W1-RULE',       'there is an answer at all'),
    ('matches',      'W1-RULE',       'the words are written the expected way')
  ) as t(node, evaluated_by, note);
$fn_rule_nodes$;

-- ══════════════════════════════════════════════════════════════════════════════
-- 2. REC-16 — THE CONTEXT, one level up and no further, by construction
-- ══════════════════════════════════════════════════════════════════════════════

create or replace function custom.rule_context(p_organization_id uuid, p_record_id uuid)
  returns jsonb
  language sql stable
  set search_path to 'pg_catalog'
as $fn_rule_context$
  -- ONE parent, read through W1-TABLE's own REC-7 reader, and NOTHING RECURSIVE. This body
  -- is the whole of REC-16's ceiling: an evaluator cannot reach a grandparent because the
  -- map it reads has one parent in it and no way to ask for another.
  select jsonb_build_object(
           'record_id',     r.id,
           'parent_id',     to_jsonb(custom.containment_parent(r.data)),
           'parent_values', coalesce(custom.record_values(p_organization_id,
                                       custom.containment_parent(r.data)), 'null'::jsonb))
    from custom.record r
   where r.organization_id = p_organization_id
     and r.id = p_record_id
     and r.deleted_at is null;
$fn_rule_context$;

comment on function custom.rule_context(uuid, uuid) is
  'REC-16 as a shape rather than as a rule anybody has to remember: the context an applicability Rule is evaluated against carries the record''s ONE parent (custom.containment_parent, REC-7) and that parent''s Values, and there is no key in which a second ancestor could arrive. A record with no parent gets a null parent_values, which makes every parent_field leaf UNDECIDED rather than false.';

-- ═══ 3. THE ONE EVALUATOR, WITH REC-16'S LEAF ═══
-- W1-RULE's body, byte for byte, with ONE block changed and marked.

create or replace function custom.rule_eval(p_organization_id uuid, p_expr jsonb,
                                 p_values jsonb, p_context jsonb default '{}'::jsonb)
  returns jsonb
  language plpgsql stable
  set search_path to 'pg_catalog'
as $fn_rule_eval$
declare
  v_op     text;
  v_args   jsonb;
  v_a      jsonb;
  v_b      jsonb;
  v_one    jsonb;
  v_key    text;
  v_acc    text;
  v_truth  boolean;
begin
  if p_expr is null or jsonb_typeof(p_expr) <> 'object' then
    raise exception 'this rule''s test is not written in a shape the system can work out'
      using errcode = '22023',
            hint = 'REC-15: a Rule expression is an object — one of the nodes custom.rule_node_kinds() lists.';
  end if;

  -- REC-17, AS A REFUSAL RATHER THAN AS ADVICE. A Rule that reaches for a Field by name is
  -- refused here, so "by id, never by name" is unrepresentable instead of discouraged.
  if p_expr ?| array['field_name', 'field_key', 'field_label'] then
    raise exception 'this rule names a field instead of pointing at it'
      using errcode = '22023',
            hint = 'REC-17: a Rule references Fields by id, never by name — {"field": "<the field''s id>"}. A name changes and the rule would stop resolving; an id does not.';
  end if;

  if p_expr ? 'const' then
    return p_expr -> 'const';
  end if;

  if p_expr ? 'field' then
    if jsonb_typeof(p_expr -> 'field') <> 'string'
       or (p_expr ->> 'field') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'this rule points at a field with % instead of with its id', p_expr ->> 'field'
        using errcode = '22023',
              hint = 'REC-17: {"field": "<the field''s id>"}. What is written here is not an id at all.';
    end if;
    v_key := custom.rule_field_key(p_organization_id, (p_expr ->> 'field')::uuid);
    if v_key is null then
      raise exception 'this rule points at a field that is not there any more'
        using errcode = '23503',
              hint = 'REC-17 / REC-18: the Rule holds the field''s id. Deleting a Field a Rule depends on is refused naming the Rule (REC-18, W3-MIG); this is what a Rule says when it happens anyway.';
    end if;
    return p_values -> v_key;
  end if;

  -- ── W1-RULE-APPLY: REC-16, THE ONLY BLOCK OF THIS BODY THAT MOVED. ────────────────
  -- W1-RULE raised 0A000 here with this lane as the remedy. This is the remedy: the
  -- PARENT's answer, read out of the ONE parent the context carries, one level up.
  if p_expr ?| array['grandparent_field', 'ancestor_field'] then
    raise exception 'this rule reads an answer two steps up, and a rule reads its own record and the one it is inside'
      using errcode = '0A000',
            hint = 'REC-16: an applicability Rule reads the record''s own Values and its parent''s, one level up and no further. To reach further, give the record a relation to the thing it needs and read that.';
  end if;

  if p_expr ? 'parent_field' then
    -- TWO LEVELS, REFUSED BY NAME rather than answered wrong. A nested parent_field is the
    -- shape somebody writes when they want a grandparent; a `levels`/`up` above one is the
    -- shape somebody writes when they have read the node's name and guessed at a knob.
    if jsonb_typeof(p_expr -> 'parent_field') = 'object' then
      raise exception 'this rule reads the answer of the thing its parent is inside, and a rule reads its own record and the one it is inside'
        using errcode = '0A000',
              hint = 'REC-16: one level up and no further. {"parent_field": "<a field id>"} reads the parent; it cannot be wrapped around another parent_field.';
    end if;
    if coalesce((p_expr ->> 'levels')::integer, (p_expr ->> 'up')::integer, 1) <> 1 then
      raise exception 'this rule asks to go % steps up, and a rule reads its own record and the one it is inside',
                      coalesce(p_expr ->> 'levels', p_expr ->> 'up')
        using errcode = '0A000',
              hint = 'REC-16: one level up and no further. There is no number to raise here.';
    end if;
    if jsonb_typeof(p_expr -> 'parent_field') <> 'string'
       or (p_expr ->> 'parent_field') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'this rule points at the parent''s field with % instead of with its id', p_expr ->> 'parent_field'
        using errcode = '22023',
              hint = 'REC-17 applies to the parent''s Fields too: {"parent_field": "<the field''s id>"}.';
    end if;
    -- An absent parent makes the leaf UNDECIDED, never false — the same reading W1-RULE
    -- gave an absent Value, and for the same reason: a record at the top of a tree got
    -- nothing wrong.
    if jsonb_typeof(coalesce(p_context -> 'parent_values', 'null'::jsonb)) <> 'object' then
      return 'null'::jsonb;
    end if;
    v_key := custom.rule_field_key(p_organization_id, (p_expr ->> 'parent_field')::uuid);
    if v_key is null then
      raise exception 'this rule points at a field of the parent that is not there any more'
        using errcode = '23503',
              hint = 'REC-16 / REC-17: the Rule holds the field''s id. Deleting a Field a Rule depends on is refused naming the Rule (REC-18, W3-MIG); this is what a Rule says when it happens anyway.';
    end if;
    return p_context -> 'parent_values' -> v_key;
  end if;

  -- DYN-4 IS NOT THIS LANE'S, AND THE REFUSAL SAYS SO RATHER THAN ANSWERING WRONG — the
  -- same shape W1-RULE gave parent_field, for the same reason: the node is storable, so a
  -- Rule and a merge field can be seen to depend on each other by this lane's cycle guard.
  if p_expr ? 'merge_field' then
    raise exception 'this rule reads what a merge field works out, and that is not switched on yet'
      using errcode = '0A000',
            hint = 'DYN-4: a merge field resolves as a Value, a Reference, a Resolver, something Computed or a Collection. W5-MERGE-B builds that resolution; a Rule may name one today so the two cannot be saved depending on each other, and refuses to guess at its answer.';
  end if;

  v_op   := p_expr ->> 'op';
  v_args := coalesce(p_expr -> 'args', '[]'::jsonb);
  if v_op is null then
    raise exception 'this rule''s test does not say what it does'
      using errcode = '22023',
            hint = 'REC-15: every expression node is a const, a field, a parent_field, or an op with its args. custom.rule_node_kinds() is the whole list.';
  end if;
  if not (v_op = any (select n.node from custom.rule_node_kinds() n)) then
    raise exception 'this rule asks the system to %, and it does not know how', v_op
      using errcode = '22023',
            hint = 'REC-15: select * from custom.rule_node_kinds() is the closed list of what a Rule can do. A node outside it is refused rather than ignored.';
  end if;

  -- and / or / not — short-circuited, so an argument that cannot be worked out is never
  -- reached once the answer is already decided.
  if v_op = 'and' then
    for v_one in select e from jsonb_array_elements(v_args) e loop
      v_truth := custom.rule_truth(custom.rule_eval(p_organization_id, v_one, p_values, p_context));
      if v_truth is false then return to_jsonb(false); end if;
      if v_truth is null then return 'null'::jsonb; end if;
    end loop;
    return to_jsonb(true);
  elsif v_op = 'or' then
    for v_one in select e from jsonb_array_elements(v_args) e loop
      v_truth := custom.rule_truth(custom.rule_eval(p_organization_id, v_one, p_values, p_context));
      if v_truth is true then return to_jsonb(true); end if;
    end loop;
    return to_jsonb(false);
  elsif v_op = 'not' then
    v_truth := custom.rule_truth(custom.rule_eval(p_organization_id, v_args -> 0, p_values, p_context));
    if v_truth is null then return 'null'::jsonb; end if;
    return to_jsonb(not v_truth);
  end if;

  v_a := custom.rule_eval(p_organization_id, v_args -> 0, p_values, p_context);

  if v_op = 'present' then
    return to_jsonb(v_a is not null and jsonb_typeof(v_a) <> 'null');
  elsif v_op = 'length' then
    if v_a is null or jsonb_typeof(v_a) = 'null' then return 'null'::jsonb; end if;
    if jsonb_typeof(v_a) <> 'string' then
      raise exception 'this rule measures how long something is, and it was given a %', jsonb_typeof(v_a)
        using errcode = '22023', hint = 'REC-15: length takes words.';
    end if;
    return to_jsonb(length(v_a #>> '{}'));
  elsif v_op = 'concat' then
    v_acc := '';
    for v_one in select e from jsonb_array_elements(v_args) e loop
      v_b := custom.rule_eval(p_organization_id, v_one, p_values, p_context);
      if v_b is null or jsonb_typeof(v_b) = 'null' then continue; end if;
      v_acc := v_acc || (v_b #>> '{}');
    end loop;
    return to_jsonb(v_acc);
  end if;

  v_b := custom.rule_eval(p_organization_id, v_args -> 1, p_values, p_context);

  -- AN ABSENT ANSWER MAKES THE WHOLE TEST UNDECIDED, and undecided is NOT false. Whether an
  -- absence is allowed at all is the FIELD's `required`, which W1-FIELD's validator already
  -- answers by name; a Rule that turned an absence into a refusal would say the wrong thing.
  if v_a is null or jsonb_typeof(v_a) = 'null' or v_b is null or jsonb_typeof(v_b) = 'null' then
    return 'null'::jsonb;
  end if;

  if v_op = 'eq' then
    return to_jsonb(v_a = v_b);
  elsif v_op = 'ne' then
    return to_jsonb(v_a <> v_b);
  elsif v_op = 'matches' then
    if jsonb_typeof(v_a) <> 'string' or jsonb_typeof(v_b) <> 'string' then
      raise exception 'this rule checks how words are written, and it was given a % and a %',
                      jsonb_typeof(v_a), jsonb_typeof(v_b)
        using errcode = '22023', hint = 'REC-15: matches takes words and a pattern.';
    end if;
    return to_jsonb((v_a #>> '{}') ~ (v_b #>> '{}'));
  end if;

  -- The arithmetic and the ordering are about NUMBERS, and a non-number is refused by name
  -- rather than coerced — coercion is how a rule quietly answers about something else.
  if jsonb_typeof(v_a) <> 'number' or jsonb_typeof(v_b) <> 'number' then
    raise exception 'this rule compares numbers, and it was given a % and a %',
                    jsonb_typeof(v_a), jsonb_typeof(v_b)
      using errcode = '22023',
            hint = format('REC-15: %s works on numbers. Nothing is converted for you, because a converted comparison answers about a different value.', v_op);
  end if;

  if v_op = 'lt'  then return to_jsonb((v_a #>> '{}')::numeric <  (v_b #>> '{}')::numeric);
  elsif v_op = 'lte' then return to_jsonb((v_a #>> '{}')::numeric <= (v_b #>> '{}')::numeric);
  elsif v_op = 'gt'  then return to_jsonb((v_a #>> '{}')::numeric >  (v_b #>> '{}')::numeric);
  elsif v_op = 'gte' then return to_jsonb((v_a #>> '{}')::numeric >= (v_b #>> '{}')::numeric);
  elsif v_op = 'add' then return to_jsonb((v_a #>> '{}')::numeric +  (v_b #>> '{}')::numeric);
  elsif v_op = 'sub' then return to_jsonb((v_a #>> '{}')::numeric -  (v_b #>> '{}')::numeric);
  elsif v_op = 'mul' then return to_jsonb((v_a #>> '{}')::numeric *  (v_b #>> '{}')::numeric);
  elsif v_op = 'div' then
    if (v_b #>> '{}')::numeric = 0 then
      raise exception 'this rule divides by nothing'
        using errcode = '22012', hint = 'REC-15: div. The rule needs a different test, not a different number.';
    end if;
    return to_jsonb((v_a #>> '{}')::numeric / (v_b #>> '{}')::numeric);
  end if;

  -- Unreachable while custom.rule_node_kinds() and this body agree. It is here because the
  -- day they stop agreeing is the day a Rule would otherwise return NULL and mean nothing.
  raise exception 'this rule asks the system to %, and it knows the word but not the work', v_op
    using errcode = '22023',
          hint = 'custom.rule_node_kinds() lists this node and custom.rule_eval does not implement it. That is a defect in this migration, not in the rule.';
end;
$fn_rule_eval$;

comment on function custom.rule_eval(uuid, jsonb, jsonb, jsonb) is
  'REC-15 / REC-16 / REC-17: the ONE body that works out what a Rule says, over a record''s Values and - for an applicability Rule - the ONE parent custom.rule_context() carries. Field leaves are FIELD IDS resolved to their current key at evaluation time (REC-17), on the record and on its parent alike; a name leaf is refused by name; two ancestor levels are refused by name in three shapes; a node the vocabulary carries but no lane evaluates yet is refused WITH the lane that owns it; an absent Value, and an absent parent, make the answer UNDECIDED rather than false. The four uses differ in what they do with the answer, never in how the answer is reached.';

-- ══════════════════════════════════════════════════════════════════════════════
-- 4. REC-16 — THE APPLICABILITY USE
-- ══════════════════════════════════════════════════════════════════════════════

create or replace function custom.rule_applies(p_organization_id uuid, p_rule_id uuid, p_record_id uuid)
  returns jsonb
  language plpgsql stable
  set search_path to 'pg_catalog'
as $fn_rule_applies$
declare
  r      custom.record;
  v_run  jsonb;
begin
  select * into r
    from custom.record
   where organization_id = p_organization_id and id = p_record_id and deleted_at is null;
  if r.id is null then
    raise exception 'that record is not there'
      using errcode = '23503', hint = 'REC-16: applicability is decided about a record.';
  end if;
  -- THE SAME custom.rule_run(), the same expression, the same version stamp. What makes this
  -- the APPLICABILITY use is the context it is given and what the caller does with the
  -- answer - never a second evaluator, which is what REC-15 exists to prevent.
  v_run := custom.rule_run(p_organization_id, p_rule_id,
                           custom.record_values(p_organization_id, p_record_id),
                           custom.rule_context(p_organization_id, p_record_id));
  return v_run || jsonb_build_object('use', 'applicability',
                                     'applies', to_jsonb(custom.rule_truth(v_run -> 'answer')),
                                     'record_id', p_record_id);
end;
$fn_rule_applies$;

comment on function custom.rule_applies(uuid, uuid, uuid) is
  'REC-16 / REC-15: does this Rule apply to this record. It is custom.rule_run() - the one evaluation - given custom.rule_context(), so the Rule reads the record''s own Values and its parent''s, one level up. THREE answers, never two: true, false, and UNDECIDED (null), which is what an absent Value or an absent parent gives and is not the same as "does not apply".';

create or replace function custom.record_applicability(p_organization_id uuid, p_record_id uuid)
  returns table (rule_id uuid, rule_name text, rule_version integer, applies boolean, answer jsonb)
  language plpgsql stable
  set search_path to 'pg_catalog'
as $fn_record_applicability$
declare
  r      custom.record;
  rec    custom.record;
  v_run  jsonb;
  v_type text;
begin
  select * into rec
    from custom.record
   where organization_id = p_organization_id and id = p_record_id and deleted_at is null;
  if rec.id is null then
    raise exception 'that record is not there'
      using errcode = '23503', hint = 'REC-16: applicability is decided about a record.';
  end if;
  v_type := rec.data ->> custom.table_type_field(p_organization_id, rec.table_id);
  -- The SAME enumerator, in the SAME declared order, that validate and compute read.
  for r in select * from custom.table_rules(p_organization_id, rec.table_id, 'applicability', v_type) loop
    v_run := custom.rule_applies(p_organization_id, r.id, p_record_id);
    rule_id      := r.id;
    rule_name    := r.data ->> 'name';
    rule_version := (v_run ->> 'rule_version')::integer;
    applies      := custom.rule_truth(v_run -> 'answer');
    answer       := v_run -> 'answer';
    return next;
  end loop;
end;
$fn_record_applicability$;

comment on function custom.record_applicability(uuid, uuid) is
  'REC-16: every applicability Rule of this record''s Table, in DECLARED ORDER, with what each one answers about this record. FLD-10''s type field selects which Rules are asked exactly as it selects which Fields apply.';

-- ══════════════════════════════════════════════════════════════════════════════
-- 5. DYN-6 — THE MEMBERSHIP USE, AND THE RESOLVER THAT IS THE SAME RULE
-- ══════════════════════════════════════════════════════════════════════════════

create or replace function custom.rule_membership(p_organization_id uuid, p_rule_id uuid, p_record_id uuid)
  returns jsonb
  language plpgsql stable
  set search_path to 'pg_catalog'
as $fn_rule_membership$
declare
  v_run jsonb;
begin
  v_run := custom.rule_run(p_organization_id, p_rule_id,
                           custom.record_values(p_organization_id, p_record_id),
                           custom.rule_context(p_organization_id, p_record_id));
  return v_run || jsonb_build_object('use', 'membership',
                                     'member', to_jsonb(custom.rule_truth(v_run -> 'answer')),
                                     'record_id', p_record_id);
end;
$fn_rule_membership$;

comment on function custom.rule_membership(uuid, uuid, uuid) is
  'DYN-6 / REC-15: is this record in the set this Rule defines. The same custom.rule_run(), the same expression, the same version stamp as validate, compute and applicability - the use is what the caller does with the truth.';

create or replace function custom.rule_members(p_organization_id uuid, p_rule_id uuid)
  returns setof custom.record
  language plpgsql stable
  set search_path to 'pg_catalog'
as $fn_rule_members$
declare
  r      custom.record;
  rec    custom.record;
begin
  select * into r
    from custom.record
   where organization_id = p_organization_id and id = p_rule_id
     and table_id = custom.rule_kernel_id() and deleted_at is null;
  if r.id is null then
    raise exception 'that rule is not there'
      using errcode = '23503', hint = 'REC-15: a Rule is a Record of the kernel Table `Rule`.';
  end if;
  if not (coalesce(r.data -> 'uses', '[]'::jsonb) ? 'membership') then
    raise exception 'the rule % is not used to say what is in a set', r.data ->> 'name'
      using errcode = '22023',
            hint = 'REC-15: add `membership` to this Rule''s uses. One Rule object, four uses - it is one word in the row, not a second Rule.';
  end if;
  for rec in
    select * from custom.record c
     where c.organization_id = p_organization_id
       and c.table_id = (r.data ->> 'scope_table_id')::uuid
       and c.deleted_at is null
     order by c.created_at, c.id
  loop
    if custom.rule_truth(custom.rule_membership(p_organization_id, p_rule_id, rec.id) -> 'answer') is true then
      return next rec;
    end if;
  end loop;
end;
$fn_rule_members$;

comment on function custom.rule_members(uuid, uuid) is
  'DYN-6: the records a membership Rule is true of - the set, as a query. UNDECIDED is not membership: a record whose Values leave the answer open is out of the set and is not refused, because a set is not a validator.';

create or replace function custom.resolve_first_match(p_organization_id uuid, p_record_id uuid)
  returns jsonb
  language plpgsql stable
  set search_path to 'pg_catalog'
as $fn_resolve_first_match$
declare
  rec       custom.record;
  r         custom.record;
  v_type    text;
  v_run     jsonb;
  v_truth   boolean;
  v_trace   jsonb := '[]'::jsonb;
  v_order   integer := 0;
  v_matched jsonb := 'null'::jsonb;
begin
  select * into rec
    from custom.record
   where organization_id = p_organization_id and id = p_record_id and deleted_at is null;
  if rec.id is null then
    raise exception 'that record is not there'
      using errcode = '23503', hint = 'DYN-6: a Resolver resolves for a record.';
  end if;
  v_type := rec.data ->> custom.table_type_field(p_organization_id, rec.table_id);

  -- DYN-6, THE WHOLE LAW IN ONE LOOP. The SAME enumerator validate and compute read, in the
  -- SAME declared order (sort, then created_at, then id - custom.table_rules()), and it
  -- STOPS at the first true answer.
  --
  -- 🚨 THE TRACE IS WRITTEN AS IT GOES, and it is what anybody reads to check this. A run
  -- that asked the Rules in a different order, or that kept asking after one matched, writes
  -- a different trace - so "first match, in declared order" is a fact about what happened
  -- and never a re-reading of the rule list.
  for r in select * from custom.table_rules(p_organization_id, rec.table_id, 'membership', v_type) loop
    v_order := v_order + 1;
    v_run   := custom.rule_membership(p_organization_id, r.id, p_record_id);
    v_truth := custom.rule_truth(v_run -> 'answer');
    v_trace := v_trace || jsonb_build_array(jsonb_build_object(
      'considered_at', v_order,
      'rule_id',       r.id,
      'rule_name',     r.data ->> 'name',
      'rule_version',  v_run -> 'rule_version',
      'declared_sort', coalesce((r.data ->> 'sort')::integer, 0),
      'answer',        v_run -> 'answer',
      'matched',       to_jsonb(v_truth is true)));
    if v_truth is true then
      v_matched := jsonb_build_object(
        'rule_id',      r.id,
        'rule_name',    r.data ->> 'name',
        'rule_version', v_run -> 'rule_version',
        'matched_at',   v_order);
      exit;                         -- FIRST match. Everything after it is not asked at all.
    end if;
  end loop;

  return jsonb_build_object(
    'record_id',  p_record_id,
    'table_id',   rec.table_id,
    'use',        'membership',
    'resolved',   v_matched,
    'considered', v_trace,
    'stopped_after', v_order);
end;
$fn_resolve_first_match$;

comment on function custom.resolve_first_match(uuid, uuid) is
  'DYN-6: a Resolver IS a Rule in its membership use - ordered, first match, and no seventh core object. It walks custom.table_rules(..., ''membership'', ...) in declared order, stops at the first Rule whose answer is true, and returns the winner TOGETHER WITH THE TRACE of every Rule it considered and in what order. The trace is the evidence: a reader checks first-match order against what the run did rather than against a list they could re-sort in their head, and `stopped_after` says how many Rules were asked at all.';

-- ══════════════════════════════════════════════════════════════════════════════
-- 6. THE SAVE-TIME CYCLE REFUSAL, ACROSS RULES AND MERGE FIELDS
-- ══════════════════════════════════════════════════════════════════════════════
-- ONE graph, built from what is stored, so there is no second description of "what depends
-- on what" to drift from the first. A node is `rule:<id>`, `merge:<id>` or `field:<id>`, and
-- an edge points from the thing that NEEDS to the thing it needs.

create or replace function custom.dependency_label(p_organization_id uuid, p_node text)
  returns text
  language sql stable
  set search_path to 'pg_catalog'
as $fn_dep_label$
  select case split_part(p_node, ':', 1)
           when 'rule'  then coalesce(r.data ->> 'name', 'a rule')
           when 'merge' then coalesce(r.data ->> 'key', 'a merge field')
           when 'field' then coalesce(nullif(r.data ->> 'label', ''), r.data ->> 'key', 'a field')
           else p_node
         end
    from custom.record r
   where r.organization_id = p_organization_id
     and r.id = nullif(split_part(p_node, ':', 2), '')::uuid;
$fn_dep_label$;

comment on function custom.dependency_label(uuid, text) is
  'What a person calls the thing a dependency node stands for. A refusal that named `rule:6f3c…` would be a refusal nobody can act on.';

create or replace function custom.rule_dependency_edges(p_organization_id uuid, p_row custom.record default null)
  returns table (needs text, needed text)
  language plpgsql stable
  set search_path to 'pg_catalog'
as $fn_dep_edges$
declare
  r     custom.record;
  v_leaf jsonb;
begin
  for r in
    select * from custom.record c
     where c.organization_id = p_organization_id
       and c.deleted_at is null
       and c.data_class <> 'kernel'
       and c.table_id in (custom.rule_kernel_id(), custom.merge_field_kernel_id())
       and (p_row.id is null or c.id <> p_row.id)     -- the pending row replaces its stored self
    union all
    select (p_row).*
     where p_row.id is not null
       and p_row.table_id in (custom.rule_kernel_id(), custom.merge_field_kernel_id())
       and p_row.data_class <> 'kernel'
  loop
    if r.table_id = custom.rule_kernel_id() then
      -- A Rule NEEDS every Field and every merge field its expression names. `parent_field`
      -- is deliberately absent: it reads ANOTHER record, and two records that read each
      -- other are a containment question REC-8 already refuses.
      for v_leaf in
        select jsonb_path_query(coalesce(r.data -> 'expr', '{}'::jsonb),
                 '$.**{0 to 12} ? (exists(@.field) || exists(@.merge_field))')
      loop
        if jsonb_typeof(v_leaf -> 'field') = 'string' then
          needs := 'rule:' || r.id; needed := 'field:' || (v_leaf ->> 'field'); return next;
        end if;
        if jsonb_typeof(v_leaf -> 'merge_field') = 'string' then
          needs := 'rule:' || r.id; needed := 'merge:' || (v_leaf ->> 'merge_field'); return next;
        end if;
      end loop;
      -- And the Field a compute Rule writes NEEDS that Rule: its value does not exist until
      -- the Rule has worked it out.
      if coalesce(r.data -> 'uses', '[]'::jsonb) ? 'compute'
         and nullif(r.data ->> 'target_field_id', '') is not null then
        needs := 'field:' || (r.data ->> 'target_field_id'); needed := 'rule:' || r.id; return next;
      end if;
    else
      -- A merge field NEEDS the Rule it resolves through (DYN-6: a Resolver is a Rule), the
      -- Field it reads, and every merge field it says it depends on.
      if nullif(r.data ->> 'rule_id', '') is not null then
        needs := 'merge:' || r.id; needed := 'rule:' || (r.data ->> 'rule_id'); return next;
      end if;
      if nullif(r.data ->> 'field_id', '') is not null then
        needs := 'merge:' || r.id; needed := 'field:' || (r.data ->> 'field_id'); return next;
      end if;
      for v_leaf in select e from jsonb_array_elements(coalesce(r.data -> 'depends_on', '[]'::jsonb)) e loop
        if jsonb_typeof(v_leaf) = 'string'
           and (v_leaf #>> '{}') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
          needs := 'merge:' || r.id; needed := 'merge:' || (v_leaf #>> '{}'); return next;
        end if;
      end loop;
    end if;
  end loop;
end;
$fn_dep_edges$;

comment on function custom.rule_dependency_edges(uuid, custom.record) is
  'THE ONE dependency graph over Rules and merge fields, derived from what is stored rather than declared a second time. Pass the row being saved and it REPLACES its stored self, so the graph answered is the one the save would create and not the one that exists.';

create or replace function custom.dependency_cycle(p_organization_id uuid, p_row custom.record)
  returns text[]
  language sql stable
  set search_path to 'pg_catalog'
as $fn_dep_cycle$
  with recursive e as (
    select needs, needed from custom.rule_dependency_edges(p_organization_id, p_row)
  ),
  seed as (
    select case when p_row.table_id = custom.rule_kernel_id() then 'rule:' else 'merge:' end
           || p_row.id as node
  ),
  walk (node, path) as (
    select s.node, array[s.node] from seed s
    union all
    select e.needed, w.path || e.needed
      from walk w
      join e on e.needs = w.node
     where array_length(w.path, 1) <= 64
       and (e.needed = w.path[1] or not (e.needed = any (w.path)))
  )
  select w.path from walk w
   where array_length(w.path, 1) > 1 and w.path[array_length(w.path, 1)] = w.path[1]
   order by array_length(w.path, 1)
   limit 1;
$fn_dep_cycle$;

comment on function custom.dependency_cycle(uuid, custom.record) is
  'The SHORTEST loop the row being saved would close, as the path it runs round, or nothing. It walks only from the saved row, so the cost is the row''s own reachable set and never the whole graph, and it stops revisiting a node unless that node is the one it started from - which is the loop it is looking for.';

create or replace function custom._rule_topology_guard() returns trigger
  language plpgsql
  set search_path to 'pg_catalog'
as $fn_topo$
declare
  v_path   text[];
  v_self   text;
  v_back   text;
  v_leaf   jsonb;
  v_name   text;
  v_steps  text;
begin
  if new.data_class = 'kernel'
     or new.table_id is null
     or new.table_id not in (custom.rule_kernel_id(), custom.merge_field_kernel_id()) then
    return new;
  end if;

  -- ── REC-16 AT SAVE TIME, NAMING THE RULE. A Rule that asks for two ancestor levels is
  -- refused when it is WRITTEN, in the words of the person writing it, rather than at three
  -- in the morning on somebody else's record - the same standard W1-RULE set for the rest of
  -- the vocabulary. The three shapes are the three a person actually writes.
  if new.table_id = custom.rule_kernel_id() then
    v_name := coalesce(nullif(new.data ->> 'name', ''), 'this rule');
    for v_leaf in
      select jsonb_path_query(coalesce(new.data -> 'expr', '{}'::jsonb),
               '$.**{0 to 12} ? (exists(@.parent_field) || exists(@.grandparent_field) || exists(@.ancestor_field))')
    loop
      if v_leaf ?| array['grandparent_field', 'ancestor_field'] then
        raise exception 'the rule % reads an answer two steps up, and a rule reads its own record and the one it is inside', v_name
          using errcode = '23514',
                hint = 'REC-16: one level up and no further. To reach further, give the record a relation to the thing it needs and read that.';
      end if;
      if jsonb_typeof(v_leaf -> 'parent_field') = 'object' then
        raise exception 'the rule % reads the answer of the thing its parent is inside, and a rule reads its own record and the one it is inside', v_name
          using errcode = '23514',
                hint = 'REC-16: one level up and no further. {"parent_field": "<a field id>"} reads the parent; it cannot be wrapped around another parent_field.';
      end if;
      v_steps := coalesce(v_leaf ->> 'levels', v_leaf ->> 'up');
      if v_steps is not null and v_steps <> '1' then
        raise exception 'the rule % asks to go % steps up, and a rule reads its own record and the one it is inside', v_name, v_steps
          using errcode = '23514',
                hint = 'REC-16: one level up and no further. There is no number to raise here.';
      end if;
      if jsonb_typeof(v_leaf -> 'parent_field') <> 'string'
         or (v_leaf ->> 'parent_field') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        raise exception 'the rule % points at the parent''s field with % instead of with its id',
                        v_name, coalesce(v_leaf ->> 'parent_field', 'something that is not there')
          using errcode = '23514',
                hint = 'REC-17 applies to the parent''s Fields too: {"parent_field": "<the field''s id>"}.';
      end if;
      -- The parent may be a record of ANY Table (containment is a tree over records, not
      -- over tables), so the id is checked to be a live Field OF THIS ORGANIZATION - which
      -- is everything that can be known at save time, and it is checked rather than assumed.
      if custom.rule_field_key(new.organization_id, (v_leaf ->> 'parent_field')::uuid) is null then
        raise exception 'the rule % points at a field of the parent that this organization does not have', v_name
          using errcode = '23514',
                hint = 'REC-16 / REC-17: parent_field holds the id of a live Field. Which Table the parent belongs to is known only when the rule runs, so the id is what is checked here.';
      end if;
    end loop;
  end if;

  v_path := custom.dependency_cycle(new.organization_id, new);
  if v_path is null then
    return new;
  end if;

  -- BOTH SIDES, BY NAME. The thing being saved, and the nearest Rule or merge field in the
  -- circle that is already waiting for it - a refusal that named only one of them leaves the
  -- reader hunting for the other half, and one that named the FIELD between two Rules names
  -- the rope rather than either end of it.
  --
  -- 🚨 THE SAVED ROW'S NAME COMES OUT OF THE ROW, NOT OUT OF THE CATALOGUE. On an INSERT it
  -- is not in `custom.record` yet, so a lookup answers NULL and the refusal reads `saving
  -- "<NULL>"` - which is how this was caught, by its own suite, before it left the branch.
  v_self := coalesce(nullif(new.data ->> 'name', ''), nullif(new.data ->> 'key', ''),
                     custom.dependency_label(new.organization_id, v_path[1]), 'this rule');
  select custom.dependency_label(new.organization_id, u.n) into v_back
    from unnest(v_path) with ordinality as u(n, o)
   where u.o between 2 and array_length(v_path, 1) - 1
     and split_part(u.n, ':', 1) in ('rule', 'merge')
   order by u.o desc
   limit 1;
  v_back := coalesce(v_back,
                     custom.dependency_label(new.organization_id, v_path[array_length(v_path, 1) - 1]),
                     'something in the same circle');
  raise exception 'saving "%" would make it wait for "%", and "%" is already waiting for "%"',
                  v_self, v_back, v_back, v_self
    using errcode = '23514',
          hint = format('DYN-9 / REC-15: rules and merge fields work each other''s answers out, so they cannot wait on each other in a circle. The circle is: %s.',
                        (select string_agg(case when u.n = v_path[1] then v_self
                                                else custom.dependency_label(new.organization_id, u.n) end,
                                           ' -> ' order by u.o)
                           from unnest(v_path) with ordinality as u(n, o)));
end;
$fn_topo$;

comment on function custom._rule_topology_guard() is
  'REC-16 and the save-time cycle refusal, in one guard because both are questions about the SHAPE OF THE GRAPH a save would leave behind: how far up a Rule reaches, and whether anything ends up waiting on itself. The cycle refusal names BOTH SIDES and printing the whole circle in the words a person uses for those objects. It runs on the row being saved only, so a graph that was already sound stays sound for the price of one row''s reachable set.';

-- Named to fire AFTER custom_record_rule_shape_guard and BEFORE custom_record_rule_uses:
-- Postgres fires BEFORE ROW triggers in name order, `_t` sorts between `_s` and `_u`, and
-- the order is load-bearing - a Rule whose shape is wrong is refused in the shape guard's
-- own words before this guard tries to read an expression it cannot trust.
create or replace trigger custom_record_rule_topology_guard
  before insert or update on custom.record
  for each row execute function custom._rule_topology_guard();

-- ══════════════════════════════════════════════════════════════════════════════
-- 7. THE SEED — the ordered membership set, the applicability Rule, and a Resolver
-- ══════════════════════════════════════════════════════════════════════════════
-- Every row here is about `W1-RULE`'s own fixture Table, `Rule conformance shape`
-- (`11111111-0004-4000-8000-000000000001`), and its Fields: `kind` …0011, `width` …0012,
-- `height` …0013, `sides_equal` …0014. Nothing new is invented to be easy.
--
-- 🚨 THE ROW THAT SERVES ALL FOUR USES IS STILL `11111111-0004-4000-8000-000000000101`,
-- W1-RULE's, and this lane executes its membership and applicability uses against THAT id -
-- which is what `V1-MODEL`'s `C-10a` (compute) and `C-10b` (membership) re-execute. The rows
-- below are what DYN-6 needs and one row cannot be: an ORDER, with more than one Rule in it,
-- so that "the first match" is a fact about a list rather than about a singleton.
--
-- THE ORDER IS `sort`, then `created_at`, then `id` (custom.table_rules()), and these three
-- Rules are sorted 10 / 20 / 30 so that ONE ordered list gives THREE DIFFERENT WINNERS:
--   a square (4x4)            -> …0101 "A square has equal sides" matches first
--   a wide rectangle (5x3)    -> …0101 is false, …0102 "Wider than tall" matches
--   a tall rectangle (3x5)    -> …0101 and …0102 are false, …0103 "Has a width at all" matches
-- Rule 3's second input, three times over: a resolver that returned a constant, or that
-- ignored the order, survives none of the three.

insert into custom.record (id, organization_id, table_id, data_class, data)
values
  ('11111111-0004-4000-8000-000000000102'::uuid,
   '39c38960-d30c-4840-b0c1-c9960de95582'::uuid,
   '11111111-0000-4000-8000-000000000003'::uuid,
   'rule',
   '{"name":"Wider than tall","kind":"predicate","scope_table_id":"11111111-0004-4000-8000-000000000001","uses":["membership"],"applies_to_types":[],"sort":20,"row":"DYN-6","message":"this shape is wider than it is tall","expr":{"op":"gt","args":[{"field":"11111111-0004-4000-8000-000000000012"},{"field":"11111111-0004-4000-8000-000000000013"}]}}'::jsonb),
  ('11111111-0004-4000-8000-000000000103'::uuid,
   '39c38960-d30c-4840-b0c1-c9960de95582'::uuid,
   '11111111-0000-4000-8000-000000000003'::uuid,
   'rule',
   '{"name":"Has a width at all","kind":"predicate","scope_table_id":"11111111-0004-4000-8000-000000000001","uses":["membership"],"applies_to_types":[],"sort":30,"row":"DYN-6","message":"this shape has a width","expr":{"op":"present","args":[{"field":"11111111-0004-4000-8000-000000000012"}]}}'::jsonb),
  -- REC-16: the PARENT's answer, one level up. A shape inside a square.
  ('11111111-0004-4000-8000-000000000104'::uuid,
   '39c38960-d30c-4840-b0c1-c9960de95582'::uuid,
   '11111111-0000-4000-8000-000000000003'::uuid,
   'rule',
   '{"name":"Inside a square","kind":"predicate","scope_table_id":"11111111-0004-4000-8000-000000000001","uses":["applicability"],"applies_to_types":[],"sort":40,"row":"REC-16","message":"the thing this is inside is a square","expr":{"op":"eq","args":[{"parent_field":"11111111-0004-4000-8000-000000000011"},{"const":"square"}]}}'::jsonb)
on conflict do nothing;

-- DYN-6's other half, as a ROW rather than as a sentence: a merge field whose semantic type
-- is `resolver` and which resolves THROUGH a Rule - no seventh core object, and the edge
-- `merge -> rule` that makes a cycle across the two REPRESENTABLE and therefore refusable.
-- It is the POSITIVE CONTROL of the cycle guard: this one saves, because it closes nothing.
insert into custom.record (id, organization_id, table_id, data_class, data)
values
  ('11111111-0004-4000-8000-000000000120'::uuid,
   '39c38960-d30c-4840-b0c1-c9960de95582'::uuid,
   '11111111-0000-4000-8000-000000000009'::uuid,
   'merge_field',
   '{"key":"square_rule","label":"Is it a square","source":"derived","semantic_type":"resolver","modifiers":[],"override_policy":"derived","rule_id":"11111111-0004-4000-8000-000000000101","row":"DYN-6"}'::jsonb)
on conflict do nothing;

comment on function custom.resolve_first_match(uuid, uuid) is
  'DYN-6: a Resolver IS a Rule in its membership use - ordered, first match, and no seventh core object. It walks custom.table_rules(..., ''membership'', ...) in declared order, stops at the first Rule whose answer is true, and returns the winner TOGETHER WITH THE TRACE of every Rule it considered and in what order. The trace is the evidence: a reader checks first-match order against what the run did rather than against a list they could re-sort in their head, and `stopped_after` says how many Rules were asked at all. The seeded order over W1-RULE''s fixture Table is 11111111-0004-4000-8000-000000000101 (sort 10, all four uses), …0102 (20) and …0103 (30).';
