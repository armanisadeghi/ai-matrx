-- INVERSE of migrations/campaign/pipelines_a_stage_is_a_field_and_its_moves_are_rules.sql
-- (lane PIPELINES). It puts the three replaced bodies back BYTE FOR BYTE as they were read
-- off the main database on 2026-09-20 before the up ran, drops the six new doors, their
-- declaration rows and the entry trigger, and leaves every Rule and every stage value an
-- organization declared exactly where it is — a pipeline is made of ordinary Rules and
-- ordinary Values, and deleting somebody's data is not what an inverse is for.

drop trigger if exists zzz_pipelines_on_entry on custom.record;
drop function if exists custom._pipeline_on_entry();
drop function if exists custom.pipeline_move(uuid, uuid, text, jsonb, integer);
drop function if exists custom.pipeline_transition_refusal(uuid, uuid, text);
drop function if exists custom.pipeline_board(uuid, uuid, text);
drop function if exists custom.pipeline_read(uuid, uuid);
drop function if exists custom.pipeline_declare(uuid, uuid, jsonb);
drop function if exists custom._pipeline_rule(uuid, uuid, text, text, text, text, jsonb, jsonb, jsonb);
drop function if exists custom._pipeline_stage_key(uuid, uuid, text);
drop function if exists custom.table_stage_field(uuid, uuid);
drop function if exists custom._stage_field_key(uuid, uuid);

delete from platform.client_callable_door
 where schema_name = 'custom'
   and function_name in ('table_stage_field', 'pipeline_declare', 'pipeline_read',
                         'pipeline_board', 'pipeline_transition_refusal', 'pipeline_move');

-- The three bodies, back as they were.
CREATE OR REPLACE FUNCTION custom.rule_node_kinds()
 RETURNS TABLE(node text, evaluated_by text, note text)
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'pg_catalog'
AS $function$
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
$function$

;

CREATE OR REPLACE FUNCTION custom.rule_eval(p_organization_id uuid, p_expr jsonb, p_values jsonb, p_context jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
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
$function$

;

CREATE OR REPLACE FUNCTION custom._record_rule_uses()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_type_field text;
  v_rtype      text;
  r            custom.record;
  v_run        jsonb;
  v_truth      boolean;
  v_key        text;
  v_computed   jsonb := '{}'::jsonb;
  v_prior      jsonb;
  v_retired    jsonb;
  v_stale      text;
begin
  -- THE DOOR. One call to the ONE predicate (`custom.assert_store_door`), which
  -- judges `custom.caller_role()` - the identity the caller actually held - and not
  -- `current_user`, which a SECURITY DEFINER door has already rewritten to itself.
  -- The switch never removes a check: everything below runs exactly as before.
  perform custom.assert_store_door(new.organization_id, 'custom.record');

  -- The kernel is defined in code; the Tables, the Fields, the merge fields and the Rules
  -- themselves have their own shape guards; and a relation row carries an edge rather than a
  -- document. (A Rule about Rules is a wave nobody has asked for.)
  if new.data_class in ('kernel', 'relation')
     or new.table_id is null
     or new.table_id = custom.table_kernel_id()
     or new.table_id = custom.field_kernel_id()
     or new.table_id = custom.rule_kernel_id()
     or new.table_id = custom.merge_field_kernel_id() then
    return new;
  end if;

  v_type_field := custom.table_type_field(new.organization_id, new.table_id);
  if v_type_field is not null then
    v_rtype := new.data ->> v_type_field;
  end if;

  -- ── USE 1: VALIDATE. A `false` answer refuses the write, naming the Rule. ──────────
  for r in select * from custom.table_rules(new.organization_id, new.table_id, 'validate', v_rtype) loop
    v_run   := custom.rule_run(new.organization_id, r.id, new.data, '{}'::jsonb);
    v_truth := custom.rule_truth(v_run -> 'answer');
    if v_truth is false then
      raise exception '%', coalesce(nullif(r.data ->> 'message', ''), r.data ->> 'name')
        using errcode = '23514',
              hint = format('REC-15: the rule "%s" (version %s) is not satisfied by this record.',
                            r.data ->> 'name', v_run ->> 'rule_version');
    end if;
  end loop;

  -- ── USE 2: COMPUTE. The answer IS the Value, and the version that produced it is ───
  -- RECORDED beside it. W3-HIST stamps its History row from exactly these keys.
  for r in select * from custom.table_rules(new.organization_id, new.table_id, 'compute', v_rtype) loop
    v_key := custom.rule_field_key(new.organization_id, (r.data ->> 'target_field_id')::uuid);
    if v_key is null then
      raise exception 'the rule % works out a field that is not there any more', r.data ->> 'name'
        using errcode = '23503',
              hint = 'REC-18: deleting a Field a Rule depends on is refused naming the Rule (W3-MIG). This is what the compute use says when it happens anyway.';
    end if;
    v_run := custom.rule_run(new.organization_id, r.id, new.data, '{}'::jsonb);
    v_computed := v_computed || jsonb_build_object(v_key, jsonb_build_object(
      'value',        v_run -> 'answer',
      'field_id',     r.data ->> 'target_field_id',
      'rule_id',      v_run ->> 'rule_id',
      'rule_version', (v_run -> 'rule_version'),
      'at',           to_jsonb(now())));
  end loop;

  -- A WORKED-OUT ANSWER THAT NO RULE WORKS OUT IS NEVER QUIETLY KEPT AND NEVER QUIETLY
  -- DROPPED, and the two ways one can appear are told apart rather than lumped together.
  --
  --   IT WAS ALREADY THERE, and its Rule has stopped applying — T8's retype, exactly: a
  --   square becomes a circle and `sides_equal` stops being a thing about this record. That
  --   is not an error and refusing it would make the retype impossible. The answer is
  --   RETIRED into `data -> '_retired'` with its reason, the same place and the same shape
  --   W1-FIELD moves a Value that stopped applying — a STAND-IN for History, announced with
  --   W3-HIST as the remedy.
  --
  --   IT ARRIVED IN THIS WRITE — a hand-written `_computed` block. That is a forged
  --   provenance: a value wearing a Rule's name and a version, which `custom.record_values`
  --   would then serve as if the system had worked it out. REFUSED by name.
  if jsonb_typeof(new.data -> '_computed') = 'object' then
    v_prior := case when tg_op = 'UPDATE' then coalesce(old.data -> '_computed', '{}'::jsonb)
                    else '{}'::jsonb end;
    for v_stale in
      select k from jsonb_object_keys(new.data -> '_computed') k where not (v_computed ? k)
    loop
      if (v_prior -> v_stale) is distinct from (new.data -> '_computed' -> v_stale) then
        raise exception 'this record carries a worked-out answer for % that no rule works out', v_stale
          using errcode = '23514',
                hint = 'REC-15 / FLD-9: a worked-out answer belongs to the Rule that works it out, and it carries that Rule''s id and version. A value written here by hand would be served as if the system had worked it out.';
      end if;
      v_retired := coalesce(new.data -> '_retired', '[]'::jsonb) || jsonb_build_object(
        'key',    v_stale,
        'label',  coalesce(custom.rule_field_label(new.organization_id,
                             (v_prior -> v_stale ->> 'field_id')::uuid), v_stale),
        'value',  v_prior -> v_stale -> 'value',
        'reason', format('this record changed, and nothing works out %s for it any more',
                         coalesce(custom.rule_field_label(new.organization_id,
                                    (v_prior -> v_stale ->> 'field_id')::uuid), v_stale)),
        'rule_id',      v_prior -> v_stale -> 'rule_id',
        'rule_version', v_prior -> v_stale -> 'rule_version',
        'at',     to_jsonb(now()));
      new.data := jsonb_set(new.data, '{_retired}', v_retired);
    end loop;
  end if;

  if v_computed = '{}'::jsonb then
    new.data := new.data - '_computed';
  else
    new.data := jsonb_set(new.data, '{_computed}', v_computed);
  end if;

  return new;
end;
$function$

;

