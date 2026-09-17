-- target: branch
-- based-on: custom.rule_node_kinds() a7a54aee69d2662e02e1e8aae5292151e7eba823aff9706e87b38ccac9012348
-- based-on: custom.rule_eval(uuid,jsonb,jsonb,jsonb) 2c80cbc00656d560ebf1fb53d4c6ad44a1e959940b8745903c35d1789055ee5b
--
-- THE INVERSE of `migrations/campaign/w1_rule_apply_the_other_two_uses.sql` and of the file
-- that superseded it (§4.13, rule 27). It restores the prior state exactly: none of this
-- lane's functions exist, the topology trigger is gone, the four rows it seeded are gone,
-- and the TWO bodies it replaced — `custom.rule_node_kinds()` and
-- `custom.rule_eval(uuid,jsonb,jsonb,jsonb)` — are back to `W1-RULE`'s, byte for byte, so
-- that `encode(sha256(convert_to(pg_get_functiondef(oid),'utf8')),'hex')` reads
-- `ce646289e178b4b56a8c1664c95b8069ca66d08ec7968a3ff02d89a42fabdf4c` and
-- `d2e11d617e0b170f4cf1472659ffc98c5b64228c308080babc7fb57121101977` again — the two hashes
-- the up-file's own `-- based-on:` lines name. That is what makes "the inverse restores the
-- prior state" a measurement rather than a claim.
--
-- IT IS `-- target: branch` ON PURPOSE, like every other inverse in this directory: an
-- inverse is a DROP, which rule 9 forbids on production in any lane.
--
-- ORDER MATTERS: the trigger goes before the function it executes, the guard's helpers go
-- after the guard, and the two replaced bodies are restored BEFORE this lane's functions are
-- dropped, because W1-RULE's `custom.rule_eval` does not call any of them.

set lock_timeout = '5s';
set statement_timeout = '600s';

drop trigger if exists custom_record_rule_topology_guard on custom.record;

-- W1-RULE's two bodies, restored first.
create or replace function custom.rule_node_kinds() returns table (node text, evaluated_by text, note text)
  language sql immutable parallel safe
  set search_path to 'pg_catalog'
as $fn_rule_nodes$
  select * from (values
    ('const',        'W1-RULE',       'a literal JSON value'),
    ('field',        'W1-RULE',       'REC-17: the record''s own Value for the Field with this ID'),
    ('parent_field', 'W1-RULE-APPLY', 'REC-16: the PARENT''s Value, one level up and no further — storable today, refused by name at evaluation until W1-RULE-APPLY lands it'),
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

  -- REC-16 IS NOT THIS LANE'S, AND THE REFUSAL SAYS SO RATHER THAN ANSWERING WRONG.
  if p_expr ? 'parent_field' then
    raise exception 'this rule reads the parent''s answer, and that is not switched on yet'
      using errcode = '0A000',
            hint = 'REC-16: an applicability Rule reads the record''s own Values and its parent''s, one level up and no further. W1-RULE-APPLY builds that evaluator; W1-RULE stores the node and refuses to guess at it.';
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

drop function if exists custom._rule_topology_guard();
drop function if exists custom.dependency_cycle(uuid, custom.record);
drop function if exists custom.rule_dependency_edges(uuid, custom.record);
drop function if exists custom.dependency_label(uuid, text);
drop function if exists custom.resolve_first_match(uuid, uuid);
drop function if exists custom.rule_members(uuid, uuid);
drop function if exists custom.rule_membership(uuid, uuid, uuid);
drop function if exists custom.record_applicability(uuid, uuid);
drop function if exists custom.rule_applies(uuid, uuid, uuid);
drop function if exists custom.rule_context(uuid, uuid);

delete from custom.record
 where organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'::uuid
   and id in ('11111111-0004-4000-8000-000000000102'::uuid,
              '11111111-0004-4000-8000-000000000103'::uuid,
              '11111111-0004-4000-8000-000000000104'::uuid,
              '11111111-0004-4000-8000-000000000120'::uuid);
