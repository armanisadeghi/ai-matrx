-- INVERSE of migrations/campaign/stagerules_a_gate_says_what_it_does_when_it_says_no.sql.
--
-- Every replaced body goes back to the exact bytes the forward file's `-- based-on:` lines
-- pin, and the four things the forward file ADDED are removed: the two new doors and the
-- gate helper, their client_callable_door rows, and the knob. A Rule that carries `on_fail`
-- or a `sibling_count` node survives this file as data; with the vocabulary back to
-- twenty-four nodes it is refused at evaluation by name, which is the store being honest
-- about a rule it can no longer work out rather than quietly answering false.

-- ── the vocabulary, back to twenty-four nodes ──
create or replace function custom.rule_node_kinds() returns table (node text, evaluated_by text, note text)
  language sql immutable set search_path = pg_catalog as $fn$
  select * from (values
    ('const',         'W1-RULE',        'a literal JSON value'),
    ('field',         'W1-RULE',        'REC-17: the record''s own Value for the Field with this ID'),
    ('parent_field',  'W1-RULE-APPLY',  'REC-16: the PARENT''s Value for the Field with this ID, ONE level up and no further — a second level is refused by name, at save time and at evaluation'),
    ('merge_field',   'W5-MERGE-B',     'DYN-4: the answer a merge field resolves to, by ID — storable today so a Rule and a merge field can be seen to depend on each other, and refused by name at evaluation until W5-MERGE-B lands it'),
    ('previous',      'PIPELINES',      'the Value this record HELD for the Field with this ID before this write — absent on an insert, which leaves the leaf undecided rather than false'),
    ('actor_at_least','PIPELINES',      'whether the person making this write holds at least the named level on this record — a rung of the one ladder, asked as a question rather than compared as a word'),
    ('stage_count',   'PIPELINES',      'how many live records of this Table are already in the named stage, not counting the one being written — what a work-in-progress limit counts'),
    ('eq',            'W1-RULE',        'two answers are the same'),
    ('ne',            'W1-RULE',        'two answers differ'),
    ('lt',            'W1-RULE',        'less than, numbers only'),
    ('lte',           'W1-RULE',        'at most, numbers only'),
    ('gt',            'W1-RULE',        'greater than, numbers only'),
    ('gte',           'W1-RULE',        'at least, numbers only'),
    ('and',           'W1-RULE',        'every argument is true'),
    ('or',            'W1-RULE',        'some argument is true'),
    ('not',           'W1-RULE',        'the opposite'),
    ('add',           'W1-RULE',        'a sum'),
    ('sub',           'W1-RULE',        'a difference'),
    ('mul',           'W1-RULE',        'a product'),
    ('div',           'W1-RULE',        'a quotient; dividing by nothing is refused by name'),
    ('concat',        'W1-RULE',        'words joined'),
    ('length',        'W1-RULE',        'how long the words are'),
    ('present',       'W1-RULE',        'there is an answer at all'),
    ('matches',       'W1-RULE',        'the words are written the expected way')
  ) as t(node, evaluated_by, note);
$fn$;

-- ── the evaluator ──
create or replace function custom.rule_eval(p_organization_id uuid, p_expr jsonb, p_values jsonb, p_context jsonb DEFAULT '{}'::jsonb)
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
  v_want   public.permission_level;
  v_held   public.permission_level;
  v_count  bigint;
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

  -- ── PIPELINES: THE VALUE THIS RECORD HELD BEFORE THIS WRITE. ─────────────────────────
  -- First, because it carries a `field` key and would otherwise be read as the CURRENT
  -- value by the leaf below — which is the one wrong answer this node could give, and it
  -- would be silent.
  if p_expr ->> 'op' = 'previous' then
    if jsonb_typeof(p_expr -> 'field') <> 'string'
       or (p_expr ->> 'field') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'this rule asks what a field used to say and points at it with % instead of with its id',
                      coalesce(p_expr ->> 'field', 'nothing')
        using errcode = '22023',
              hint = 'REC-17 applies to `previous` too: {"op":"previous","field":"<the field''s id>"}.';
    end if;
    -- A record being CREATED held nothing before, and "held nothing" is undecided, not
    -- false: a brand-new deal did not break the rule about moving out of Lead.
    if jsonb_typeof(coalesce(p_context -> 'previous_values', 'null'::jsonb)) <> 'object' then
      return 'null'::jsonb;
    end if;
    v_key := custom.rule_field_key(p_organization_id, (p_expr ->> 'field')::uuid);
    if v_key is null then
      raise exception 'this rule asks what a field used to say, and that field is not there any more'
        using errcode = '23503',
              hint = 'REC-17 / REC-18: the Rule holds the field''s id. Deleting a Field a Rule depends on is refused naming the Rule (REC-18, W3-MIG); this is what a Rule says when it happens anyway.';
    end if;
    return p_context -> 'previous_values' -> v_key;
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

  -- ── W1-RULE-APPLY: REC-16. ──────────────────────────────────────────────────────────
  if p_expr ?| array['grandparent_field', 'ancestor_field'] then
    raise exception 'this rule reads an answer two steps up, and a rule reads its own record and the one it is inside'
      using errcode = '0A000',
            hint = 'REC-16: an applicability Rule reads the record''s own Values and its parent''s, one level up and no further. To reach further, give the record a relation to the thing it needs and read that.';
  end if;

  if p_expr ? 'parent_field' then
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

  -- ── PIPELINES: WHO IS MAKING THIS WRITE. ────────────────────────────────────────────
  -- A rung, asked as a rung. `owner` is not the word `admin`, and an organization owner may
  -- obviously do what an admin may — comparing the words would have said otherwise.
  if v_op = 'actor_at_least' then
    if p_context ->> 'actor_level' is null then
      -- Nobody asked, or nobody could be resolved. Undecided, never false: a rule about who
      -- may move must not refuse a move it could not judge, silently.
      return 'null'::jsonb;
    end if;
    begin
      v_want := (custom.rule_eval(p_organization_id, v_args -> 0, p_values, p_context) #>> '{}')::public.permission_level;
    exception when invalid_text_representation then
      raise exception 'this rule asks whether somebody is at least %, and that is not one of the levels',
                      custom.rule_eval(p_organization_id, v_args -> 0, p_values, p_context) #>> '{}'
        using errcode = '22023',
              hint = 'The levels are viewer, commenter, editor and admin, in that order.';
    end;
    v_held := (p_context ->> 'actor_level')::public.permission_level;
    return to_jsonb(v_held >= v_want);
  end if;

  -- and / or / not — short-circuited.
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

  -- ── PIPELINES: HOW FULL A COLUMN ALREADY IS. ────────────────────────────────────────
  -- The record being written is EXCLUDED. A limit of three that counted the mover would
  -- refuse the third card, and the person would be told the column is full while looking at
  -- two cards in it.
  if v_op = 'stage_count' then
    if (p_context ->> 'table_id') is null then
      return 'null'::jsonb;
    end if;
    if v_a is null or jsonb_typeof(v_a) = 'null' then
      return 'null'::jsonb;
    end if;
    v_key := custom._stage_field_key(p_organization_id, (p_context ->> 'table_id')::uuid);
    if v_key is null then
      raise exception 'this rule counts how many records are in a stage, and this table has no stage field'
        using errcode = '22023',
              hint = 'custom.pipeline_declare names the Choice field a table''s stage field. Until it does, there are no stages to count.';
    end if;
    select count(*) into v_count
      from custom.record r
     where r.organization_id = p_organization_id
       and r.table_id = (p_context ->> 'table_id')::uuid
       and r.deleted_at is null
       and r.data_class = 'record'
       and r.id is distinct from nullif(p_context ->> 'record_id', '')::uuid
       and r.data ->> v_key = (v_a #>> '{}');
    return to_jsonb(v_count);
  end if;

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

  raise exception 'this rule asks the system to %, and it knows the word but not the work', v_op
    using errcode = '22023',
          hint = 'custom.rule_node_kinds() lists this node and custom.rule_eval does not implement it. That is a defect in this migration, not in the rule.';
end;
$function$;

-- ── the rule shape guard ──
create or replace function custom._rule_shape_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  d        jsonb := new.data;
  v_name   text;
  v_kind   text;
  v_uses   jsonb;
  v_scope  uuid;
  v_use    text;
  v_leaf   jsonb;
  v_fid    uuid;
  v_fkey   text;
  v_tgt    uuid;
  v_names  text[];
begin
  -- THE DOOR. One call to the ONE predicate (`custom.assert_store_door`), which
  -- judges `custom.caller_role()` - the identity the caller actually held - and not
  -- `current_user`, which a SECURITY DEFINER door has already rewritten to itself.
  -- The switch never removes a check: everything below runs exactly as before.
  perform custom.assert_store_door(new.organization_id, 'custom.record');

  -- A RETIREMENT IS NOT A CHANGE OF SHAPE (the shared rule DOOR-FIX and TABLE-DELETE built,
  -- now asked as ONE question). The only change in this update is `deleted_at` going from
  -- nothing to a time: the document is byte-for-byte what it was, so there is no new shape
  -- to judge. This is what lets a dependent field retire in the SAME operation as the
  -- relation it reads through - the sweep, the cascade and the door all arrive here.
  if tg_op = 'UPDATE'
     and custom.is_a_retirement(old.deleted_at, new.deleted_at,
                                old.data, new.data,
                                old.table_id, new.table_id,
                                old.organization_id, new.organization_id,
                                old.data_class, new.data_class) then
    return new;
  end if;

  -- Only Rules an organization DECLARED. The kernel `Rule` row is the kernel Table itself
  -- (REC-27: defined in code, not data) and is exempt, exactly as W1-TABLE and W1-FIELD
  -- exempt theirs.
  if new.table_id is distinct from custom.rule_kernel_id() or new.data_class = 'kernel' then
    return new;
  end if;

  v_name := nullif(d ->> 'name', '');
  if v_name is null then
    raise exception 'a rule needs a name - it is what a person reads when it stops them'
      using errcode = '23514', hint = 'REC-15: name.';
  end if;

  -- A Rule''s KIND is what its test ANSWERS, and it is a closed set of two. A predicate can
  -- serve all four uses; an expression can only be computed, because there is nothing for
  -- validate, membership or applicability to be true about.
  v_kind := d ->> 'kind';
  if v_kind is null or v_kind not in ('predicate', 'expression') then
    raise exception 'the rule % has to say whether it answers yes-or-no or works out a value, and it says %',
                    v_name, custom.said(v_kind, 'nothing')
      using errcode = '23514',
            hint = 'REC-15: kind is `predicate` (a truth, usable by all four uses) or `expression` (a value, usable by compute alone).';
  end if;

  -- REC-15: the four uses, as a non-empty subset of the closed set.
  v_uses := d -> 'uses';
  if jsonb_typeof(v_uses) is distinct from 'array' or jsonb_array_length(v_uses) = 0 then
    raise exception 'the rule % has to say what it is for', v_name
      using errcode = '23514',
            hint = 'REC-15: uses is a non-empty list drawn from validate, compute, membership and applicability. One Rule object, four uses.';
  end if;
  for v_use in select u #>> '{}' from jsonb_array_elements(v_uses) u loop
    if v_use is null or not (v_use = any (custom.rule_uses())) then
      raise exception 'the rule % says it is used to %, and there is no such use',
                      v_name, custom.said(v_use, 'do nothing')
        using errcode = '23514',
              hint = 'REC-15: select unnest(custom.rule_uses()) is the whole list, and it is closed.';
    end if;
    if v_kind = 'expression' and v_use <> 'compute' then
      raise exception 'the rule % works out a value, so it cannot also decide %', v_name, v_use
        using errcode = '23514',
              hint = 'REC-15: only a `predicate` can be true or false. To use this test for validate, membership or applicability, write it as a yes-or-no question.';
    end if;
  end loop;

  -- The Table it speaks about. A Rule is scoped to a Table and names that Table''s Fields by
  -- id, which is what lets ONE object serve four uses (a use that speaks about a RECORD
  -- cannot hang off a single column).
  v_scope := nullif(d ->> 'scope_table_id', '')::uuid;
  if v_scope is null then
    raise exception 'the rule % has to say what it is a rule about', v_name
      using errcode = '23514',
            hint = 'REC-15: scope_table_id names the Table record whose records this Rule speaks about.';
  end if;
  select array_agg(f ->> 'name') into v_names
    from custom.record t, jsonb_array_elements(coalesce(t.data -> 'fields', '[]'::jsonb)) f
   where t.organization_id = new.organization_id
     and t.id = v_scope
     and t.table_id = custom.table_kernel_id()
     and t.deleted_at is null;
  if v_names is null then
    raise exception 'the rule % says it is about a table this organization does not have', v_name
      using errcode = '23514', hint = 'REC-15: scope_table_id names a Table record of the same organization.';
  end if;

  if jsonb_typeof(d -> 'applies_to_types') is distinct from 'array' then
    raise exception 'the rule % has to say which kinds of record it applies to, even when that is all of them',
                    v_name
      using errcode = '23514',
            hint = 'FLD-10 / T8: a type field selects which Fields AND RULES apply. An empty list means every kind.';
  end if;

  -- REC-15's per-use narrowing, checked rather than trusted: a key that is not one of this
  -- Rule's own uses, or a kind the Rule does not apply to at all, is refused by name.
  if d ? 'use_types' then
    if jsonb_typeof(d -> 'use_types') <> 'object' then
      raise exception 'the rule % has to say its narrower uses as a set of lists, one per use', v_name
        using errcode = '23514',
              hint = 'REC-15: use_types is {"<use>": ["<kind>", …]} and narrows ONE use of this Rule.';
    end if;
    for v_use in select k from jsonb_object_keys(d -> 'use_types') k loop
      if not (v_uses ? v_use) then
        raise exception 'the rule % narrows its % use, and it is not used to % at all', v_name, v_use, v_use
          using errcode = '23514',
                hint = 'REC-15: a narrowing belongs to a use the Rule declares. Add the use, or drop the narrowing.';
      end if;
      if jsonb_typeof(d -> 'use_types' -> v_use) <> 'array'
         or jsonb_array_length(d -> 'use_types' -> v_use) = 0 then
        raise exception 'the rule % narrows its % use to nothing at all', v_name, v_use
          using errcode = '23514',
                hint = 'REC-15: a narrowing lists the kinds of record that use applies to. To switch the use off, remove it from uses.';
      end if;
      if jsonb_array_length(coalesce(d -> 'applies_to_types', '[]'::jsonb)) > 0
         and exists (select 1 from jsonb_array_elements_text(d -> 'use_types' -> v_use) t
                      where not (d -> 'applies_to_types') ? t) then
        raise exception 'the rule % narrows its % use to a kind of record the rule does not apply to', v_name, v_use
          using errcode = '23514',
                hint = 'REC-15: a narrowing can only ever be smaller than the Rule itself. Widen applies_to_types first.';
      end if;
    end loop;
  end if;

  if jsonb_typeof(d -> 'expr') is distinct from 'object' then
    raise exception 'the rule % has to carry the test it makes', v_name
      using errcode = '23514',
            hint = 'REC-15: expr is one expression node — select * from custom.rule_node_kinds().';
  end if;

  -- REC-17, AT SAVE TIME. Every Field a Rule reaches for is checked to be a live Field OF
  -- THE SCOPE TABLE, by id. A name-shaped reference anywhere in the expression is refused
  -- here as well as at evaluation, so a Rule that breaks REC-17 cannot be STORED.
  for v_leaf in
    select jsonb_path_query(d -> 'expr',
             '$.**{0 to 12} ? (exists(@.field) || exists(@.parent_field) || exists(@.field_name) || exists(@.field_key) || exists(@.field_label))')
  loop
    if v_leaf ?| array['field_name', 'field_key', 'field_label'] then
      raise exception 'the rule % names a field instead of pointing at it', v_name
        using errcode = '23514',
              hint = 'REC-17: a Rule references Fields by id, never by name — {"field": "<the field''s id>"}. A name changes and the rule would stop resolving; an id does not.';
    end if;
    v_fid := null;
    if jsonb_typeof(v_leaf -> 'field') = 'string' then
      if (v_leaf ->> 'field') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        raise exception 'the rule % points at a field with % instead of with its id', v_name, v_leaf ->> 'field'
          using errcode = '23514',
                hint = 'REC-17: {"field": "<the field''s id>"}. What is written here is not an id at all, so it is a name by another route.';
      end if;
      v_fid := (v_leaf ->> 'field')::uuid;
    elsif jsonb_typeof(v_leaf -> 'parent_field') = 'string' then
      -- REC-16 is W1-RULE-APPLY's: the node is STORABLE today (so an applicability Rule can
      -- be written before its evaluator lands) and refused by name when evaluated.
      continue;
    end if;
    if v_fid is null then
      continue;
    end if;
    select f.data ->> 'key' into v_fkey
      from custom.record f
     where f.organization_id = new.organization_id
       and f.id = v_fid
       and f.table_id = custom.field_kernel_id()
       and f.deleted_at is null
       and (f.data ->> 'entity_definition_id')::uuid = v_scope;
    if v_fkey is null then
      raise exception 'the rule % points at a field that is not one of that table''s fields', v_name
        using errcode = '23514',
              hint = 'REC-17 / FLD-8: a Rule reaches a Field by its id, and the Field has to be a live field OF the table the Rule is about. One source of truth, checked at save time rather than discovered at evaluation.';
    end if;
  end loop;

  -- THE VOCABULARY IS CHECKED AT SAVE TIME TOO, not only at evaluation. A Rule nobody can
  -- work out is refused when it is written, in the words of the person writing it, rather
  -- than at three in the morning on somebody else's record. `parent_field` IS in the
  -- vocabulary, so REC-16's Rules stay storable tonight (W1-RULE-APPLY evaluates them).
  for v_leaf in
    select jsonb_path_query(d -> 'expr', '$.**{0 to 12} ? (exists(@.op))')
  loop
    if not (v_leaf ->> 'op' = any (select n.node from custom.rule_node_kinds() n)) then
      raise exception 'the rule % asks the system to %, and it does not know how',
                      v_name, v_leaf ->> 'op'
        using errcode = '23514',
              hint = 'REC-15: select * from custom.rule_node_kinds() is the closed list of what a Rule can do. A node outside it is refused when the Rule is SAVED, not discovered when it runs.';
    end if;
  end loop;

  -- The compute use has to say WHICH Field receives the Value, by id, and that Field has to
  -- be a formula - a computed Value landing on a hand-filled field is how two writers end up
  -- fighting over one column.
  v_tgt := nullif(d ->> 'target_field_id', '')::uuid;
  if v_uses ? 'compute' then
    if v_tgt is null then
      raise exception 'the rule % works something out, so it has to say which field holds the answer', v_name
        using errcode = '23514',
              hint = 'REC-15 / FLD-9: target_field_id names the Field, by id, that this Rule computes.';
    end if;
    select f.data ->> 'type' into v_fkey
      from custom.record f
     where f.organization_id = new.organization_id
       and f.id = v_tgt
       and f.table_id = custom.field_kernel_id()
       and f.deleted_at is null
       and (f.data ->> 'entity_definition_id')::uuid = v_scope;
    if v_fkey is null then
      raise exception 'the rule % puts its answer in a field that is not one of that table''s fields', v_name
        using errcode = '23514', hint = 'REC-17: target_field_id is a Field id of the scope table.';
    end if;
    if v_fkey <> 'formula' then
      raise exception 'the rule % puts its answer in %, and that field is filled in by hand',
                      v_name, custom.rule_field_label(new.organization_id, v_tgt)
        using errcode = '23514',
              hint = 'FLD-9: a Rule computes a formula field. A field somebody types into cannot also be worked out by the system, or the two would overwrite each other with nobody told.';
    end if;
  elsif v_tgt is not null then
    raise exception 'the rule % is not used to work anything out, so it has nothing to put anywhere', v_name
      using errcode = '23514', hint = 'REC-15: target_field_id belongs to the compute use and to nothing else.';
  end if;

  return new;
end;
$function$;

-- ── the write path ──
create or replace function custom._record_rule_uses()
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
  v_ctx        jsonb;
  v_me         uuid;
  v_level      public.permission_level;
  v_validate   custom.record[];
  v_compute    custom.record[];
begin
  perform custom.assert_store_door(new.organization_id, 'custom.record');

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

  -- ── THE RULES THIS TABLE HAS, READ ONCE, BEFORE ANYTHING IS WORKED OUT FOR THEM. ──
  -- WRITE-PERF-2: exactly the two `custom.table_rules` calls this function always made, taken
  -- here so the answer can be looked at before the context below is built.
  select coalesce(array_agg(t), '{}'::custom.record[]) into v_validate
    from custom.table_rules(new.organization_id, new.table_id, 'validate', v_rtype) t;
  select coalesce(array_agg(t), '{}'::custom.record[]) into v_compute
    from custom.table_rules(new.organization_id, new.table_id, 'compute', v_rtype) t;

  -- ── PIPELINES: THE CONTEXT. ─────────────────────────────────────────────────────────
  -- What this write is replacing, what it is about, and who is making it. A Rule asks for
  -- these by name (`previous`, `stage_count`, `actor_at_least`) or never sees them.
  --
  -- 🚨 WRITE-PERF-2 (2026-09-20), MEASURED: `custom.effective_level` costs 16.77 ms A CALL on
  -- the main database — it halves the rung ladder with `custom.has_visibility`, which walks
  -- `platform.associations` — and this trigger called it ONCE PER ROW WRITTEN, on every table
  -- in the platform, whether or not any Rule existed to read the answer. On a 200-row insert
  -- that was 3,827 ms of the 7,313 ms the whole write cost: 19.1 ms of 36.6 ms PER ROW, more
  -- than every other trigger on `custom.record` put together, spent working out a number that
  -- `v_ctx` then handed to nobody. `v_ctx` is read in exactly one place — the `custom.rule_run`
  -- calls in the two loops below — so when this Table has no validate and no compute Rule it
  -- is never read at all. It is now built only when there is a Rule that can ask for it. A
  -- Table WITH rules pays exactly what it paid before, to the microsecond.
  if coalesce(array_length(v_validate, 1), 0) > 0 or coalesce(array_length(v_compute, 1), 0) > 0 then
    v_me := custom.query_principal();
    if v_me is not null then
      v_level := custom.effective_level(v_me, new.organization_id,
                                        case when tg_op = 'UPDATE' then new.id else new.table_id end,
                                        case when tg_op = 'UPDATE' then 'record' else 'table' end);
    end if;
    v_ctx := jsonb_build_object(
               'previous_values', case when tg_op = 'UPDATE' then old.data else 'null'::jsonb end,
               'record_id',       to_jsonb(new.id),
               'table_id',        to_jsonb(new.table_id),
               'actor_level',     to_jsonb(v_level));
  end if;

  -- ── USE 1: VALIDATE. A `false` answer refuses the write, naming the Rule. ──────────
  foreach r in array v_validate loop
    v_run   := custom.rule_run(new.organization_id, r.id, new.data, v_ctx);
    v_truth := custom.rule_truth(v_run -> 'answer');
    if v_truth is false then
      raise exception '%', coalesce(nullif(r.data ->> 'message', ''), r.data ->> 'name')
        using errcode = '23514',
              hint = format('REC-15: the rule "%s" (version %s) is not satisfied by this record.',
                            r.data ->> 'name', v_run ->> 'rule_version');
    end if;
  end loop;

  -- ── USE 2: COMPUTE. ────────────────────────────────────────────────────────────────
  foreach r in array v_compute loop
    v_key := custom.rule_field_key(new.organization_id, (r.data ->> 'target_field_id')::uuid);
    if v_key is null then
      raise exception 'the rule % works out a field that is not there any more', r.data ->> 'name'
        using errcode = '23503',
              hint = 'REC-18: deleting a Field a Rule depends on is refused naming the Rule (W3-MIG). This is what the compute use says when it happens anyway.';
    end if;
    v_run := custom.rule_run(new.organization_id, r.id, new.data, v_ctx);
    v_computed := v_computed || jsonb_build_object(v_key, jsonb_build_object(
      'value',        v_run -> 'answer',
      'field_id',     r.data ->> 'target_field_id',
      'rule_id',      v_run ->> 'rule_id',
      'rule_version', (v_run -> 'rule_version'),
      'at',           to_jsonb(now())));
  end loop;

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
$function$;

-- ── the board's three doors ──
create or replace function custom.pipeline_transition_refusal(p_organization_id uuid, p_record_id uuid, p_to text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_row    custom.record;
  v_key    text;
  v_fid    uuid;
  v_skey   text;
  v_doc    jsonb;
  v_ctx    jsonb;
  v_me     uuid;
  v_level  public.permission_level;
  v_type   text;
  v_rtype  text;
  r        custom.record;
  v_run    jsonb;
  v_missing jsonb := '[]'::jsonb;
  v_one    jsonb;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.pipeline_transition_refusal');
  perform custom.assert_client_may_open(p_organization_id, p_record_id,
                                        'custom.pipeline_transition_refusal',
                                        'viewer'::public.permission_level, 'record');
  select * into v_row from custom.record
   where organization_id = p_organization_id and id = p_record_id and deleted_at is null;
  if v_row.id is null then
    raise exception 'there is no such record here' using errcode = '23503';
  end if;
  v_key := custom._stage_field_key(p_organization_id, v_row.table_id);
  if v_key is null then
    return jsonb_build_object('allowed', false, 'is_pipeline', false,
             'why', 'This table has no stage column, so there is nowhere for this to move to.');
  end if;
  select f.id into v_fid from custom.record f
   where f.organization_id = p_organization_id and f.table_id = custom.field_kernel_id()
     and f.deleted_at is null and (f.data ->> 'entity_definition_id')::uuid = v_row.table_id
     and f.data ->> 'key' = v_key;
  v_skey := custom._pipeline_stage_key(p_organization_id, v_fid, p_to);

  v_doc := jsonb_set(v_row.data, array[v_key], to_jsonb(v_skey));
  v_me  := custom.query_principal();
  if v_me is not null then
    v_level := custom.effective_level(v_me, p_organization_id, p_record_id, 'record');
  end if;
  v_ctx := jsonb_build_object('previous_values', v_row.data,
                              'record_id', to_jsonb(p_record_id),
                              'table_id',  to_jsonb(v_row.table_id),
                              'actor_level', to_jsonb(v_level));
  v_type := custom.table_type_field(p_organization_id, v_row.table_id);
  if v_type is not null then v_rtype := v_doc ->> v_type; end if;

  for r in select * from custom.table_rules(p_organization_id, v_row.table_id, 'validate', v_rtype) loop
    v_run := custom.rule_run(p_organization_id, r.id, v_doc, v_ctx);
    if custom.rule_truth(v_run -> 'answer') is false then
      -- WHICH COLUMNS ARE EMPTY, said as columns and not as a regular expression. A screen
      -- that can name them can OFFER them, which is what "a stage's required fields prompt
      -- on entry" means.
      if r.data #>> '{pipeline,kind}' = 'requires' then
        -- DISTINCT: `$.**` matches the same leaf at several depths, and a person shown
        -- "Signed proposal, Signed proposal" would reasonably think there were two.
        for v_one in select distinct q from jsonb_path_query(r.data -> 'expr',
                              '$.**{0 to 8} ? (@.op == "present").args[0].field') q loop
          if v_doc -> custom.rule_field_key(p_organization_id, (v_one #>> '{}')::uuid) is null
             or jsonb_typeof(v_doc -> custom.rule_field_key(p_organization_id, (v_one #>> '{}')::uuid)) = 'null' then
            v_missing := v_missing || jsonb_build_object(
              'field_id', v_one #>> '{}',
              'key',   custom.rule_field_key(p_organization_id, (v_one #>> '{}')::uuid),
              'label', custom.rule_field_label(p_organization_id, (v_one #>> '{}')::uuid));
          end if;
        end loop;
      end if;
      return jsonb_build_object(
        'allowed',      false,
        'is_pipeline',  true,
        'to',           v_skey,
        'why',          coalesce(nullif(r.data ->> 'message', ''), r.data ->> 'name'),
        'rule',         r.data ->> 'name',
        'rule_id',      r.id,
        'rule_version', r.version,
        'kind',         r.data #>> '{pipeline,kind}',
        'missing',      v_missing);
    end if;
  end loop;
  return jsonb_build_object('allowed', true, 'is_pipeline', true, 'to', v_skey,
                            'why', 'Nothing stands in the way of this move.');
end;
$function$;

create or replace function custom.pipeline_move(p_organization_id uuid, p_record_id uuid, p_to text, p_also jsonb DEFAULT '{}'::jsonb, p_expected_version integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_row  custom.record;
  v_key  text;
  v_fid  uuid;
  v_skey text;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.pipeline_move');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.pipeline_move');
  select * into v_row from custom.record
   where organization_id = p_organization_id and id = p_record_id and deleted_at is null;
  if v_row.id is null then
    raise exception 'there is no such record here' using errcode = '23503';
  end if;
  v_key := custom._stage_field_key(p_organization_id, v_row.table_id);
  if v_key is null then
    raise exception 'this table has no stage column, so there is nowhere for this to move to'
      using errcode = '22023',
            hint = 'custom.pipeline_declare names the Choice column that holds the stage.';
  end if;
  select f.id into v_fid from custom.record f
   where f.organization_id = p_organization_id and f.table_id = custom.field_kernel_id()
     and f.deleted_at is null and (f.data ->> 'entity_definition_id')::uuid = v_row.table_id
     and f.data ->> 'key' = v_key;
  v_skey := custom._pipeline_stage_key(p_organization_id, v_fid, p_to);
  return custom.record_update(p_organization_id, p_record_id,
                              coalesce(p_also, '{}'::jsonb) || jsonb_build_object(v_key, v_skey),
                              p_expected_version);
end;
$function$;

create or replace function custom.pipeline_declare(p_organization_id uuid, p_table_id uuid, p_spec jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_field_spec jsonb := coalesce(p_spec -> 'stage_field', '{}'::jsonb);
  v_key        text  := nullif(v_field_spec ->> 'key', '');
  v_label      text  := coalesce(nullif(v_field_spec ->> 'label', ''), 'Stage');
  v_options    jsonb := coalesce(v_field_spec -> 'options', '[]'::jsonb);
  v_field_id   uuid;
  v_stage      text;
  v_skey       text;
  v_rule_ids   jsonb := '{}'::jsonb;
  v_made       jsonb := '[]'::jsonb;
  v_expr       jsonb;
  v_arms       jsonb;
  v_one        jsonb;
  v_req        jsonb;
  v_reqid      uuid;
  v_who        text;
  v_limit      integer;
  v_stages     text[];
  v_noun       text;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.pipeline_declare');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.pipeline_declare');
  -- A pipeline decides what a Table will accept, so declaring one is an admin act on that
  -- Table — the same rung custom.field_declare and custom.rule_declare ask for.
  perform custom.assert_client_may_change(p_organization_id, p_table_id, 'custom.pipeline_declare',
                                          'admin'::public.permission_level, 'table');

  -- THE WORD A PERSON USES FOR ONE OF THESE. The Table already carries it
  -- (`label_singular`), and a refusal that said "this stage" instead of "this deal"
  -- would be talking about the column rather than about the thing on the card.
  select lower(coalesce(nullif(t.data ->> 'label_singular', ''), nullif(t.data ->> 'name', ''), 'record'))
    into v_noun
    from custom.record t
   where t.organization_id = p_organization_id and t.id = p_table_id
     and t.table_id = custom.table_kernel_id() and t.deleted_at is null;

  if v_key is null then
    raise exception 'a pipeline has to say which column holds the stage'
      using errcode = '22004',
            hint = 'stage_field: {"key":"stage","label":"Stage","options":["Lead","Qualified","Won"]}. The options become the board''s columns, in the order they are written.';
  end if;

  select f.id into v_field_id
    from custom.record f
   where f.organization_id = p_organization_id
     and f.table_id = custom.field_kernel_id()
     and f.deleted_at is null
     and (f.data ->> 'entity_definition_id')::uuid = p_table_id
     and f.data ->> 'key' = v_key;

  if v_field_id is null then
    if jsonb_typeof(v_options) <> 'array' or jsonb_array_length(v_options) < 2 then
      raise exception 'a pipeline needs at least two stages — one column is not a board'
        using errcode = '22004',
              hint = 'stage_field.options lists the stages in the order they should appear on the board.';
    end if;
    v_field_id := custom.field_declare(p_organization_id, p_table_id, jsonb_build_object(
      'key', v_key, 'label', v_label, 'type', 'list', 'options', v_options,
      'sort', coalesce((v_field_spec ->> 'sort')::integer, 25)));
    v_made := v_made || to_jsonb(format('a %s column with %s stages', v_noun,
                                        jsonb_array_length(v_options)));
  end if;

  -- The stages, in the order the board draws them, as the WORDS a person wrote.
  select array_agg(o #>> '{}' order by ord) into v_stages
    from jsonb_array_elements(v_options) with ordinality as t(o, ord);
  if v_stages is null then
    select array_agg(v_opt.label order by v_opt.ord) into v_stages
      from (select v ->> 'label' as label, ord
              from jsonb_each(custom.choice_options(p_organization_id,
                     (select (f.data -> 'config' ->> 'options_table_id')::uuid from custom.record f
                       where f.organization_id = p_organization_id and f.id = v_field_id)))
                   with ordinality as t(k, v, ord)) v_opt;
  end if;

  -- THE TABLE NAMES IT. Written the same way `type_field` is written.
  update custom.record
     set data = jsonb_set(data, '{stage_field}', to_jsonb(v_key)), updated_at = now(), version = version + 1
   where organization_id = p_organization_id
     and id = p_table_id
     and table_id = custom.table_kernel_id()
     and deleted_at is null
     and coalesce(data ->> 'stage_field', '') is distinct from v_key;

  -- ── THE MOVES RULE. ────────────────────────────────────────────────────────────────
  -- "Staying where you are" is always allowed, because most writes to a deal are not moves
  -- at all and a rule that refused them would refuse editing the price.
  if jsonb_typeof(p_spec -> 'transitions') = 'array' and jsonb_array_length(p_spec -> 'transitions') > 0 then
    v_arms := jsonb_build_array(
      jsonb_build_object('op', 'eq', 'args', jsonb_build_array(
        jsonb_build_object('field', v_field_id),
        jsonb_build_object('op', 'previous', 'field', v_field_id))),
      -- A record that held no stage at all is arriving, not moving.
      jsonb_build_object('op', 'not', 'args', jsonb_build_array(
        jsonb_build_object('op', 'present', 'args', jsonb_build_array(
          jsonb_build_object('op', 'previous', 'field', v_field_id))))));
    for v_one in select t from jsonb_array_elements(p_spec -> 'transitions') t loop
      v_arms := v_arms || jsonb_build_object('op', 'and', 'args', jsonb_build_array(
        jsonb_build_object('op', 'eq', 'args', jsonb_build_array(
          jsonb_build_object('op', 'previous', 'field', v_field_id),
          jsonb_build_object('const', to_jsonb(custom._pipeline_stage_key(
            p_organization_id, v_field_id, v_one ->> 'from'))))),
        jsonb_build_object('op', 'eq', 'args', jsonb_build_array(
          jsonb_build_object('field', v_field_id),
          jsonb_build_object('const', to_jsonb(custom._pipeline_stage_key(
            p_organization_id, v_field_id, v_one ->> 'to')))))));
    end loop;
    v_rule_ids := v_rule_ids || jsonb_build_object('moves',
      custom._pipeline_rule(p_organization_id, p_table_id, 'moves', null,
        format('Where a %s can go next', v_noun),
        coalesce(nullif(p_spec ->> 'moves_message', ''),
                 format('That is not a move this %s can make from where it is.', v_noun)),
        jsonb_build_array('validate'),
        jsonb_build_object('op', 'or', 'args', v_arms), null, 10));
    v_made := v_made || to_jsonb(format('%s allowed moves', jsonb_array_length(p_spec -> 'transitions')));
  end if;

  -- ── ONE RULE PER STAGE THAT DEMANDS SOMETHING, so the refusal is that stage's own ──
  -- sentence rather than a catalogue of every stage's demands.
  foreach v_stage in array v_stages loop
    v_skey := custom._pipeline_stage_key(p_organization_id, v_field_id, v_stage);

    v_req := coalesce(p_spec -> 'requires' -> v_stage, p_spec -> 'requires' -> v_skey);
    if jsonb_typeof(v_req) = 'array' and jsonb_array_length(v_req) > 0 then
      v_arms := jsonb_build_array();
      for v_one in select t from jsonb_array_elements(v_req) t loop
        select f.id into v_reqid
          from custom.record f
         where f.organization_id = p_organization_id
           and f.table_id = custom.field_kernel_id()
           and f.deleted_at is null
           and (f.data ->> 'entity_definition_id')::uuid = p_table_id
           and f.data ->> 'key' = (v_one #>> '{}');
        if v_reqid is null then
          raise exception 'this pipeline says a % needs % filled in, and there is no such column on this table',
                          v_noun, v_one #>> '{}'
            using errcode = '23503',
                  hint = 'requires names columns by their key. Add the column first, or correct the key.';
        end if;
        v_arms := v_arms || jsonb_build_object('op', 'present', 'args',
                              jsonb_build_array(jsonb_build_object('field', v_reqid)));
      end loop;
      -- "If it is arriving in this stage, then everything this stage needs is there."
      v_expr := jsonb_build_object('op', 'or', 'args', jsonb_build_array(
        jsonb_build_object('op', 'ne', 'args', jsonb_build_array(
          jsonb_build_object('field', v_field_id), jsonb_build_object('const', to_jsonb(v_skey)))),
        jsonb_build_object('op', 'and', 'args', v_arms)));
      v_rule_ids := v_rule_ids || jsonb_build_object('requires:' || v_skey,
        custom._pipeline_rule(p_organization_id, p_table_id, 'requires', v_skey,
          format('What a %s needs before it reaches %s', v_noun, v_stage),
          coalesce(nullif(p_spec #>> array['requires_messages', v_stage], ''),
                   format('Nothing moves to %s until %s is filled in.', v_stage,
                          (select string_agg(coalesce(custom.rule_field_label(p_organization_id,
                                    (select f.id from custom.record f
                                      where f.organization_id = p_organization_id
                                        and f.table_id = custom.field_kernel_id()
                                        and f.deleted_at is null
                                        and (f.data ->> 'entity_definition_id')::uuid = p_table_id
                                        and f.data ->> 'key' = x #>> '{}')), x #>> '{}'), ' and ')
                             from jsonb_array_elements(v_req) x))),
          jsonb_build_array('validate'), v_expr, null, 40));
      v_made := v_made || to_jsonb(format('%s needs %s', v_stage,
                            (select string_agg(x #>> '{}', ' and ') from jsonb_array_elements(v_req) x)));
    end if;

    -- ── WHO MAY MOVE IT THERE. A rung, asked as a rung. ──────────────────────────────
    v_who := coalesce(nullif(p_spec #>> array['who', v_stage], ''), nullif(p_spec #>> array['who', v_skey], ''));
    if v_who is not null then
      v_expr := jsonb_build_object('op', 'or', 'args', jsonb_build_array(
        jsonb_build_object('op', 'eq', 'args', jsonb_build_array(
          jsonb_build_object('field', v_field_id),
          jsonb_build_object('op', 'previous', 'field', v_field_id))),
        jsonb_build_object('op', 'ne', 'args', jsonb_build_array(
          jsonb_build_object('field', v_field_id), jsonb_build_object('const', to_jsonb(v_skey)))),
        jsonb_build_object('op', 'actor_at_least', 'args', jsonb_build_array(
          jsonb_build_object('const', to_jsonb(v_who))))));
      v_rule_ids := v_rule_ids || jsonb_build_object('who:' || v_skey,
        custom._pipeline_rule(p_organization_id, p_table_id, 'who', v_skey,
          format('Who moves a %s to %s', v_noun, v_stage),
          format('Only somebody with %s rights on this %s can move it to %s.',
                 v_who, v_noun, v_stage),
          jsonb_build_array('validate'), v_expr, null, 20));
      v_made := v_made || to_jsonb(format('only %s moves to %s', v_who, v_stage));
    end if;

    -- ── HOW MANY MAY SIT THERE AT ONCE (a work-in-progress limit). ───────────────────
    v_limit := nullif(coalesce(p_spec #>> array['limits', v_stage], p_spec #>> array['limits', v_skey]), '')::integer;
    if v_limit is not null then
      v_expr := jsonb_build_object('op', 'or', 'args', jsonb_build_array(
        jsonb_build_object('op', 'eq', 'args', jsonb_build_array(
          jsonb_build_object('field', v_field_id),
          jsonb_build_object('op', 'previous', 'field', v_field_id))),
        jsonb_build_object('op', 'ne', 'args', jsonb_build_array(
          jsonb_build_object('field', v_field_id), jsonb_build_object('const', to_jsonb(v_skey)))),
        jsonb_build_object('op', 'lt', 'args', jsonb_build_array(
          jsonb_build_object('op', 'stage_count', 'args', jsonb_build_array(
            jsonb_build_object('const', to_jsonb(v_skey)))),
          jsonb_build_object('const', to_jsonb(v_limit))))));
      v_rule_ids := v_rule_ids || jsonb_build_object('limit:' || v_skey,
        custom._pipeline_rule(p_organization_id, p_table_id, 'limit', v_skey,
          format('How many at once in %s', v_stage),
          format('%s already holds %s, which is as many as it takes at once. Finish one before starting another.',
                 v_stage, v_limit),
          jsonb_build_array('validate'), v_expr, null, 30));
      v_made := v_made || to_jsonb(format('%s holds at most %s', v_stage, v_limit));
    end if;

    -- ── WHAT HAPPENS WHEN A CARD ARRIVES. THE APPLICABILITY USE. ────────────────────
    if jsonb_typeof(coalesce(p_spec -> 'on_entry' -> v_stage, p_spec -> 'on_entry' -> v_skey)) = 'object' then
      v_expr := jsonb_build_object('op', 'and', 'args', jsonb_build_array(
        jsonb_build_object('op', 'eq', 'args', jsonb_build_array(
          jsonb_build_object('field', v_field_id), jsonb_build_object('const', to_jsonb(v_skey)))),
        jsonb_build_object('op', 'ne', 'args', jsonb_build_array(
          jsonb_build_object('field', v_field_id),
          jsonb_build_object('op', 'previous', 'field', v_field_id)))));
      v_rule_ids := v_rule_ids || jsonb_build_object('entry:' || v_skey,
        custom._pipeline_rule(p_organization_id, p_table_id, 'entry', v_skey,
          format('When a %s reaches %s', v_noun, v_stage),
          format('This is what happens when a %s reaches %s.', v_noun, v_stage),
          jsonb_build_array('applicability'), v_expr,
          coalesce(p_spec -> 'on_entry' -> v_stage, p_spec -> 'on_entry' -> v_skey), 50));
      v_made := v_made || to_jsonb(format('arriving in %s starts something', v_stage));
    end if;
  end loop;

  return jsonb_build_object(
    'table_id',    p_table_id,
    'stage_field', v_key,
    'field_id',    v_field_id,
    'stages',      to_jsonb(v_stages),
    'rules',       v_rule_ids,
    'said',        v_made);
end;
$function$;

-- ── applying an approved change ──
create or replace function custom.work_approval_decide(p_organization_id uuid, p_approval_id uuid, p_approve boolean, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me      uuid := custom.query_principal();
  v_row     custom.record;
  v_change  jsonb;
  v_kind    text;
  v_subject uuid;
  v_outcome text;
  v_key     text;
  v_fields  jsonb;
  v_spec    jsonb;
  v_field   uuid;
  v_version integer;
  v_written uuid[] := '{}';
  v_one     uuid;
  v_doc     jsonb;
  v_table   uuid;
  v_conv    uuid;
  v_at      timestamptz;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.work_approval_decide');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.work_approval_decide');

  select r.* into v_row from custom.record r
   where r.organization_id = p_organization_id and r.id = p_approval_id
     and r.data_class = 'work_approval' and r.deleted_at is null;
  if v_row.id is null then
    raise exception 'There is no such approval in this organization.' using errcode = '02000';
  end if;
  if coalesce(v_row.data ->> 'state', 'pending') <> 'pending' then
    raise exception 'That was already %, on %.', v_row.data ->> 'state',
                    coalesce(v_row.data ->> 'decided_at', 'an earlier day')
      using errcode = '23505',
            hint = 'An approval is decided once. Ask for the change again if it still needs making.';
  end if;

  if not custom.work_approval_may_decide(p_organization_id, p_approval_id) then
    raise exception 'You are not one of the people who can approve this.'
      using errcode = '42501',
            hint = 'AGT-4: an approval is decided by the person it was addressed to, by anybody with admin on the thing being changed, or by an owner or admin of this organization. Ask one of them.';
  end if;
  -- THE SECOND PAIR OF EYES IS FOR A PERSON'S REQUEST. An agent's call runs as the person it
  -- is working for, so `requested_by` on an agent request names THAT person — the very one
  -- `ask` exists to consult. Holding the bar there would have made every agent wait
  -- undecidable by the only person looking at it. It still holds for `origin = 'person'`.
  if v_me is not null and nullif(v_row.data ->> 'requested_by', '')::uuid = v_me
     and coalesce(v_row.data ->> 'origin', 'person') <> 'agent'
     and not custom.query_is_store_owner() then
    raise exception 'You asked for this change, so somebody else approves it.'
      using errcode = '42501',
            hint = 'The point of asking is that a second person says yes. If nobody else needs to, make the change directly instead.';
  end if;

  v_subject := nullif(v_row.data ->> 'subject_id', '')::uuid;
  v_change  := v_row.data -> 'change';
  v_kind    := lower(coalesce(v_change ->> 'kind', ''));
  v_conv    := nullif(v_row.data ->> 'conversation_id', '')::uuid;

  if p_approve then
    if v_kind = 'record_patch' then
      v_version := custom.record_update(p_organization_id, v_subject, v_change -> 'patch', null);
      v_outcome := format('Applied. %s is now at version %s.',
                          coalesce(v_row.data ->> 'subject_title', 'That record'), v_version);
    elsif v_kind = 'record_add' then
      -- THE SAME DOOR THE UNATTENDED PATH USES, once per row, in THIS transaction. Every
      -- guard, every validator and the value envelope run per row exactly as they would for
      -- an agent that was never asked; the difference is whose name is on the history row.
      -- One refused row rolls the whole decision back, which is what a person means by
      -- saying yes to a batch.
      for v_doc in select value from jsonb_array_elements(v_change -> 'rows')
      loop
        v_one := custom.record_write(p_organization_id, v_subject, v_doc);
        v_written := v_written || v_one;
      end loop;
      v_outcome := format('Applied. %s %s now in %s.',
                          cardinality(v_written),
                          case when cardinality(v_written) = 1 then 'record is' else 'records are' end,
                          coalesce(v_row.data ->> 'subject_title', 'that table'));
    elsif v_kind = 'record_delete' then
      -- THE STORE'S OWN DELETE, AS THE APPROVER, IN THIS TRANSACTION. custom.record_delete
      -- runs custom.delete_rule first, so a record something still reads is refused here in
      -- the store's own words and the decision rolls back — an approver is never told yes
      -- over a delete the store would have refused.
      v_at := custom.record_delete(p_organization_id, v_subject);
      v_outcome := format('Removed. %s was deleted on %s and can be put back.',
                          coalesce(v_row.data ->> 'subject_title', 'That record'),
                          to_char(v_at at time zone 'utc', 'YYYY-MM-DD HH24:MI'));
    elsif v_kind = 'record_restore' then
      perform custom.record_restore(p_organization_id, v_subject);
      v_outcome := format('Put back. %s is here again.',
                          coalesce(v_row.data ->> 'subject_title', 'That record'));
    elsif v_kind = 'table_add' then
      -- EXACTLY WHAT THE DIRECT PATH RUNS, IN EXACTLY THAT ORDER: custom.table_declare with
      -- the spec that was shown, then custom.field_declare once per column. Not a re-derived
      -- spec and not a second way of making a table — the same two doors, so an approved
      -- table and an unasked one are the same bytes.
      v_table := custom.table_declare(p_organization_id, v_change -> 'table');
      for v_doc in select value from jsonb_array_elements(coalesce(v_change -> 'fields', '[]'::jsonb))
      loop
        v_field := custom.field_declare(p_organization_id, v_table, v_doc);
      end loop;
      -- THE CONVERSATION'S CLAIM TRAVELS WITH THE APPROVAL. A table a person said yes to is
      -- still the table this conversation made, so the agent's next change to it is not a
      -- change to somebody's pre-existing table.
      if v_conv is not null then
        perform custom.agent_table_claim(p_organization_id, v_table, v_conv);
      end if;
      v_field := null;
      v_outcome := format('Created. %s is now a table in %s, with %s column%s.',
                          coalesce(nullif(v_change #>> '{table,name}', ''), 'That table'),
                          coalesce(v_row.data ->> 'subject_title', 'this organization'),
                          jsonb_array_length(coalesce(v_change -> 'fields', '[]'::jsonb)),
                          case when jsonb_array_length(coalesce(v_change -> 'fields', '[]'::jsonb)) = 1
                               then '' else 's' end);
    elsif v_kind = 'doc_template_add' then
      -- THE SAME DOOR THE UNASKED PATH USES, with the bytes that were shown on the card.
      -- `custom.doc_template_save` re-runs every one of its own refusals here, as the
      -- approver — including the one that names a token pointing at no column — so an
      -- approved template and one written directly are the same template.
      v_written := array[custom.doc_template_save(
                           p_organization_id, v_subject,
                           v_change #>> '{template,name}',
                           coalesce(v_change #>> '{template,body}', ''),
                           nullif(v_change #>> '{template,template_id}', '')::uuid)];
      v_outcome := format('Saved. %s is now a document template on %s.',
                          coalesce(nullif(v_change #>> '{template,name}', ''), 'That template'),
                          coalesce(v_row.data ->> 'subject_title', 'that table'));
    else
      v_spec := v_change -> 'field';
      v_key  := coalesce(nullif(v_spec ->> 'key', ''), nullif(v_spec ->> 'name', ''));
      if v_key is null then
        raise exception 'That column has no name, so it cannot be added.' using errcode = '22004';
      end if;
      select coalesce(r.data -> 'fields', '[]'::jsonb) into v_fields from custom.record r
       where r.organization_id = p_organization_id and r.id = v_subject;
      if not exists (select 1 from jsonb_array_elements(v_fields) f where f ->> 'name' = v_key) then
        perform custom.record_update(p_organization_id, v_subject,
                 jsonb_build_object('fields', v_fields || jsonb_build_array(jsonb_build_object('name', v_key))),
                 null);
      end if;
      v_field := custom.field_declare(p_organization_id, v_subject,
                   v_spec || jsonb_build_object('key', v_key));
      v_outcome := format('%s is now a column on %s.',
                          coalesce(nullif(v_spec ->> 'label', ''), v_key),
                          coalesce(v_row.data ->> 'subject_title', 'that table'));
    end if;
  else
    v_outcome := case
                   when v_kind = 'field_add'
                     then format('The column %s was not added.',
                                 coalesce(nullif(v_change #>> '{field,label}', ''),
                                          nullif(v_change #>> '{field,key}', ''), 'asked for'))
                   when v_kind = 'record_add'
                     then format('%s %s not written to %s.',
                                 jsonb_array_length(coalesce(v_change -> 'rows', '[]'::jsonb)),
                                 case when jsonb_array_length(coalesce(v_change -> 'rows', '[]'::jsonb)) = 1
                                      then 'record was' else 'records were' end,
                                 coalesce(v_row.data ->> 'subject_title', 'that table'))
                   when v_kind = 'record_delete'
                     then format('%s was not deleted, and is still here.',
                                 coalesce(v_row.data ->> 'subject_title', 'That record'))
                   when v_kind = 'record_restore'
                     then format('%s was not put back, and is still deleted.',
                                 coalesce(v_row.data ->> 'subject_title', 'That record'))
                   when v_kind = 'table_add'
                     then format('The table %s was not created.',
                                 coalesce(nullif(v_change #>> '{table,name}', ''), 'asked for'))
                   when v_kind = 'doc_template_add'
                     then format('The document template %s was not saved.',
                                 coalesce(nullif(v_change #>> '{template,name}', ''), 'asked for'))
                   else format('%s was left as it was.',
                               coalesce(v_row.data ->> 'subject_title', 'That record')) end;
  end if;

  update custom.record r
     set data = r.data || jsonb_strip_nulls(jsonb_build_object(
           'state',         case when p_approve then 'approved' else 'declined' end,
           'decided_by',    v_me::text,
           'decided_at',    to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
           'decision_note', nullif(btrim(coalesce(p_note, '')), ''),
           'applied_field_id', v_field::text,
           'applied_table_id', v_table::text,
           'applied_record_ids', case when cardinality(v_written) > 0
                                      then to_jsonb(v_written) end,
           'outcome',       v_outcome))
   where r.organization_id = p_organization_id and r.id = p_approval_id;

  return jsonb_build_object(
    'approval_id', p_approval_id,
    'state',       case when p_approve then 'approved' else 'declined' end,
    'subject_id',  v_subject,
    'applied',     coalesce(p_approve, false),
    'field_id',    v_field,
    'table_id',    v_table,
    'record_ids',  case when cardinality(v_written) > 0 then to_jsonb(v_written) end,
    'version',     v_version,
    'message',     v_outcome);
end
$function$;

-- ── what this file added, removed ──
delete from platform.client_callable_door
 where schema_name = 'custom'
   and function_name in ('stage_rule_on_fail_kinds', 'stage_rule_enforcement', 'record_stage_pending');

drop function if exists custom.record_stage_pending(uuid, uuid);
drop function if exists custom.stage_rule_enforcement(uuid);
drop function if exists custom.stage_rule_on_fail_kinds();
drop function if exists custom._pipeline_gate(uuid, uuid, text, text, text, text, jsonb, integer, text);

delete from platform.knob_override where feature = 'custom' and key = 'stage_rule_enforcement';
delete from platform.feature_knob  where feature = 'custom' and key = 'stage_rule_enforcement';
