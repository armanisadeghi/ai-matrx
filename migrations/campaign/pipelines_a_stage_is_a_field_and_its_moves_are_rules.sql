-- additive: yes
-- chair-step: it GRANTS EXECUTE to `authenticated` on six NEW functions of schema `custom`,
--   attaches ONE new AFTER trigger to `custom.record`, and REPLACES three existing bodies
--   (`custom.rule_node_kinds`, `custom.rule_eval`, `custom._record_rule_uses`) whose prior
--   bytes are pinned by the `-- based-on:` lines below. The three replacements are strictly
--   additive in behaviour: three new expression nodes are ADDED to a closed list, and the
--   validate/compute uses are handed a CONTEXT they were previously handed `{}` for. Every
--   Rule that exists today uses none of the three nodes, so every existing answer is the
--   same answer. Nothing is dropped, nothing is revoked, no row of any feature is deleted
--   or rewritten. The inverse is
--   `migrations/inverse/pipelines_a_stage_is_a_field_and_its_moves_are_rules_down.sql`.
-- guard: custom/system_enabled
-- based-on: custom.rule_node_kinds() a7a54aee69d2662e02e1e8aae5292151e7eba823aff9706e87b38ccac9012348
-- based-on: custom.rule_eval(uuid, jsonb, jsonb, jsonb) 2c80cbc00656d560ebf1fb53d4c6ad44a1e959940b8745903c35d1789055ee5b
-- based-on: custom._record_rule_uses() 2f50c4ea9a4d33fe6a10bdc7bd4493c3c377437a0772ab7ec0038e6de0e6bf8f
--
-- PIPELINES — "Give me a board of deals by stage." (PRODUCTS.md row 7.)
--
-- A PIPELINE IS NOT A NEW FEATURE AND THIS FILE ADDS NO NEW KIND OF THING. A pipeline is
-- (a) a Choice Field that the Table names as its STAGE field, and (b) transition Rules of
-- the ONE Rule object (REC-15) about that Table. A move is an ORDINARY record write: the
-- validate use judges it, the refusal carries the Rule's own sentence, `zzz_history_capture`
-- records it because it is a write like any other, and the entry effects are the Rule's own
-- declared consequence, applied in the same transaction.
--
-- WHY THIS AND NOT A `pipeline` TABLE. A board that kept its own copy of "which stage is
-- this deal in" would be a second store of a fact `custom.record` already holds, with
-- nothing keeping the two equal — the class REC-25 exists to prevent. The stage is a Value.
-- The board is a way of LOOKING at Values (SCR-6's kanban layout, already built). The only
-- thing that did not exist was the POLICY about moving between them, and a policy about what
-- a table will accept is exactly what a Rule is.
--
-- WHAT THE RULE LANGUAGE COULD NOT SAY, AND NOW CAN. Measured on the main database
-- 2026-09-20: `custom.rule_node_kinds()` had twenty-one nodes and every one of them speaks
-- about the record AS IT WILL BE. A transition is about the difference between two states
-- and about who is making it, so none of "a deal cannot jump from Lead to Won", "nothing
-- moves to Won without a signed proposal", "only an admin closes a deal" and "no more than
-- three deals in Proposal at once" could be WRITTEN, let alone enforced. Three nodes close
-- that, and they are nodes of the one language rather than a second policy engine:
--
--   previous      {"op":"previous","field":"<id>"}   the Value this record HELD before this
--                                                    write. Absent on an insert, which makes
--                                                    the leaf undecided, never false.
--   actor_at_least{"op":"actor_at_least","args":[{"const":"admin"}]}
--                                                    whether the person making THIS write
--                                                    holds at least that level here. A ladder
--                                                    question, not a string comparison, because
--                                                    `owner` is not the word `admin` and an
--                                                    owner may obviously do what an admin may.
--   stage_count   {"op":"stage_count","args":[{"const":"Proposal"}]}
--                                                    how many live records of this Table are
--                                                    already in that stage, NOT counting the
--                                                    one being written. That is what a WIP
--                                                    limit is, and counting the mover would
--                                                    make a limit of three refuse the third.
--
-- REC-17 IS NOT WEAKENED. `previous` carries `{"field": "<id>"}`, which is the same key the
-- shape guard's save-time REC-17 sweep already reads — so a `previous` node that names a
-- field by name, or points at a field of another table, is refused WHEN THE RULE IS SAVED,
-- with no change to the guard at all. That is why the node is spelled this way and not
-- `{"previous_field": …}`: a new leaf key would have slipped past a check that exists.
--
-- THE CONTEXT. `custom._record_rule_uses` handed `'{}'` to every validate and compute run.
-- It now hands the writer's own context — the previous document, the record and table ids,
-- and the level the writer holds. Nothing reads it that did not ask for it, and the three
-- nodes above are the only things that ask.

-- ══ 1. THE VOCABULARY GROWS BY THREE, AND THE LIST STAYS CLOSED ═══════════════════════
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

-- ══ 2. THE TABLE NAMES ITS STAGE FIELD, exactly the way it already names its type field ══
-- `custom.table_type_field` has read `data ->> 'type_field'` off the Table record since
-- W1-TABLE. A stage is the same kind of fact about a Table — one named column with a special
-- job — so it is written the same way and read by a twin, rather than by a new mechanism.
create or replace function custom.table_stage_field(p_organization_id uuid, p_table_id uuid)
  returns text language plpgsql stable security definer set search_path = pg_catalog as $fn$
declare
  v_answer text;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.table_stage_field');
  perform custom.assert_may_know_table(p_organization_id, p_table_id, 'custom.table_stage_field');
  select t.data ->> 'stage_field' into v_answer
    from custom.record t
   where t.organization_id = p_organization_id
     and t.id = p_table_id
     and t.table_id = custom.table_kernel_id()
     and t.deleted_at is null;
  return v_answer;
end;
$fn$;

-- The same answer with no wall, for the evaluator and the triggers, which are already
-- inside the write and must not ask a door a second time.
create or replace function custom._stage_field_key(p_organization_id uuid, p_table_id uuid)
  returns text language sql stable set search_path = pg_catalog as $fn$
  select t.data ->> 'stage_field'
    from custom.record t
   where t.organization_id = p_organization_id
     and t.id = p_table_id
     and t.table_id = custom.table_kernel_id()
     and t.deleted_at is null;
$fn$;

-- ══ 3. THE ONE EVALUATOR LEARNS THE THREE NODES ══════════════════════════════════════
-- Everything below the three new blocks is W1-RULE's body unchanged, byte for byte, which
-- is what the `-- based-on:` line above pins. The three blocks sit where they have to sit:
-- `previous` BEFORE the `field` leaf (it carries a `field` key, on purpose, so REC-17's
-- save-time sweep already reads it), `actor_at_least` before the first argument is
-- evaluated (it has none), `stage_count` after (it has one).
create or replace function custom.rule_eval(p_organization_id uuid, p_expr jsonb, p_values jsonb,
                                            p_context jsonb default '{}'::jsonb)
  returns jsonb language plpgsql stable set search_path = pg_catalog as $fn$
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
$fn$;

-- ══ 4. THE VALIDATE AND COMPUTE USES ARE HANDED THE WRITER'S OWN CONTEXT ═════════════
-- The only change: `v_ctx` is built and passed where `'{}'::jsonb` was passed. Every Rule
-- that exists today reads none of its keys, so every existing answer is the same answer.
create or replace function custom._record_rule_uses() returns trigger
  language plpgsql set search_path = pg_catalog as $fn$
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

  -- ── PIPELINES: THE CONTEXT. ─────────────────────────────────────────────────────────
  -- What this write is replacing, what it is about, and who is making it. A Rule asks for
  -- these by name (`previous`, `stage_count`, `actor_at_least`) or never sees them.
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

  -- ── USE 1: VALIDATE. A `false` answer refuses the write, naming the Rule. ──────────
  for r in select * from custom.table_rules(new.organization_id, new.table_id, 'validate', v_rtype) loop
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
  for r in select * from custom.table_rules(new.organization_id, new.table_id, 'compute', v_rtype) loop
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
$fn$;

-- ══ 5. THE STAGE'S WORD AND THE STAGE'S KEY ══════════════════════════════════════════
-- A person writes "Won". CHOICE-VALUE settled what the store KEEPS: the option's stable key
-- (`won`), never its id and never its label, so renaming a stage does not rewrite a single
-- deal. Every `const` in every Rule this file compiles is therefore the KEY, resolved from
-- the word once, at declaration time — a Rule comparing the label would have been quietly
-- false on every record for ever.
create or replace function custom._pipeline_stage_key(p_organization_id uuid, p_field_id uuid, p_word text)
  returns text language plpgsql stable set search_path = pg_catalog as $fn$
declare
  v_opts jsonb;
  v_k    text;
begin
  select custom.choice_options(p_organization_id, (f.data -> 'config' ->> 'options_table_id')::uuid)
    into v_opts
    from custom.record f
   where f.organization_id = p_organization_id and f.id = p_field_id
     and f.table_id = custom.field_kernel_id() and f.deleted_at is null;
  select k into v_k from jsonb_object_keys(coalesce(v_opts, '{}'::jsonb)) k
   where k = custom.choice_slug(p_word)
      or lower(v_opts -> k ->> 'label') = lower(btrim(p_word))
   limit 1;
  if v_k is null then
    raise exception 'this pipeline names a stage called %, and that column has no such choice', p_word
      using errcode = '23503',
            hint = 'The stages are the choices on the stage column. Add the choice first, or correct the word.';
  end if;
  return v_k;
end;
$fn$;

-- ══ 6. DECLARING A PIPELINE — one sentence in, a stage field and its Rules out ════════
-- WHAT THIS WRITES, AND WHY EACH PIECE IS WHERE IT IS:
--   * the Choice Field                — through `custom.field_declare`, so the options, their
--                                       stable keys and the choice validator are the ones the
--                                       whole store already uses (CHOICE-VALUE's work).
--   * `stage_field` on the Table      — the twin of `type_field`, read by `table_stage_field`.
--   * one MOVES Rule                  — validate: where a card may go from where it is.
--   * one REQUIRES Rule per stage     — validate: what must be filled in to land there. One
--                                       per stage so the refusal is that stage's own sentence
--                                       ("Nothing moves to Won without a signed proposal")
--                                       and not a catalogue of every stage's demands.
--   * one WHO Rule per restricted stage — validate, asked as a rung of the one ladder.
--   * one LIMIT Rule per limited stage  — validate, counting the column.
--   * one ENTRY Rule per stage with effects — THE APPLICABILITY USE, which is the fourth use
--                                       of the one Rule object (REC-15) and is exactly the
--                                       right question: "does this effect apply to this
--                                       record now?" The effects ride on the Rule's
--                                       `on_entry` block and are applied by
--                                       `custom._pipeline_on_entry` once the move has landed.
-- Re-declaring REPLACES this door's own Rules rather than stacking a second set beside them:
-- every Rule it writes carries `data -> 'pipeline'` naming its kind and its stage. A Rule an
-- organization wrote by hand carries no such block and is never touched.
create or replace function custom.pipeline_declare(p_organization_id uuid, p_table_id uuid, p_spec jsonb)
  returns jsonb language plpgsql security definer set search_path = pg_catalog as $fn$
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
begin
  perform custom.assert_store_door(p_organization_id, 'custom.pipeline_declare');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.pipeline_declare');
  -- A pipeline decides what a Table will accept, so declaring one is an admin act on that
  -- Table — the same rung custom.field_declare and custom.rule_declare ask for.
  perform custom.assert_client_may_change(p_organization_id, p_table_id, 'custom.pipeline_declare',
                                          'admin'::public.permission_level, 'table');

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
    v_made := v_made || to_jsonb(format('a %s column with %s stages', lower(v_label),
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
        format('Where a %s can go next', lower(v_label)),
        coalesce(nullif(p_spec ->> 'moves_message', ''),
                 format('That is not a move this %s can make from where it is.', lower(v_label))),
        jsonb_build_array('validate'),
        jsonb_build_object('op', 'or', 'args', v_arms), null));
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
                          lower(v_label), v_one #>> '{}'
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
          format('What a %s needs before it reaches %s', lower(v_label), v_stage),
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
          jsonb_build_array('validate'), v_expr, null));
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
          format('Who moves a %s to %s', lower(v_label), v_stage),
          format('Only somebody with %s rights on this %s can move it to %s.',
                 v_who, lower(v_label), v_stage),
          jsonb_build_array('validate'), v_expr, null));
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
          jsonb_build_array('validate'), v_expr, null));
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
          format('When a %s reaches %s', lower(v_label), v_stage),
          format('This is what happens when a %s reaches %s.', lower(v_label), v_stage),
          jsonb_build_array('applicability'), v_expr,
          coalesce(p_spec -> 'on_entry' -> v_stage, p_spec -> 'on_entry' -> v_skey)));
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
$fn$;

-- One Rule, written or rewritten in place.
create or replace function custom._pipeline_rule(p_organization_id uuid, p_table_id uuid,
                                                 p_kind text, p_stage text, p_name text,
                                                 p_message text, p_uses jsonb, p_expr jsonb,
                                                 p_on_entry jsonb)
  returns uuid language plpgsql set search_path = pg_catalog as $fn$
declare
  v_spec jsonb;
  v_id   uuid;
begin
  v_spec := jsonb_build_object(
    'name', p_name, 'message', p_message, 'kind', 'predicate',
    'uses', p_uses, 'scope_table_id', p_table_id, 'applies_to_types', '[]'::jsonb,
    'expr', p_expr,
    'pipeline', jsonb_build_object('kind', p_kind, 'stage', p_stage, 'stage_field_of', p_table_id));
  if p_on_entry is not null then
    v_spec := jsonb_set(v_spec, '{on_entry}', p_on_entry);
  end if;
  select r.id into v_id
    from custom.record r
   where r.organization_id = p_organization_id
     and r.table_id = custom.rule_kernel_id()
     and r.deleted_at is null
     and (r.data #>> '{pipeline,stage_field_of}')::uuid = p_table_id
     and r.data #>> '{pipeline,kind}' = p_kind
     and coalesce(r.data #>> '{pipeline,stage}', '') is not distinct from coalesce(p_stage, '');
  return custom.rule_declare(p_organization_id, v_spec, v_id);
end;
$fn$;

-- ══ 7. READING A PIPELINE — what the board draws itself from ═════════════════════════
create or replace function custom.pipeline_read(p_organization_id uuid, p_table_id uuid)
  returns jsonb language plpgsql stable security definer set search_path = pg_catalog as $fn$
declare
  v_key   text;
  v_fid   uuid;
  v_flab  text;
  v_opts  uuid;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.pipeline_read');
  perform custom.assert_may_know_table(p_organization_id, p_table_id, 'custom.pipeline_read');
  v_key := custom._stage_field_key(p_organization_id, p_table_id);
  if v_key is null then
    -- Absent, not empty, and it says what would make it exist.
    return jsonb_build_object('is_pipeline', false,
             'why', 'This table has no stage column yet, so there is no board to draw.');
  end if;
  select f.id, coalesce(nullif(f.data ->> 'label', ''), 'Stage'),
         (f.data -> 'config' ->> 'options_table_id')::uuid
    into v_fid, v_flab, v_opts
    from custom.record f
   where f.organization_id = p_organization_id
     and f.table_id = custom.field_kernel_id()
     and f.deleted_at is null
     and (f.data ->> 'entity_definition_id')::uuid = p_table_id
     and f.data ->> 'key' = v_key;
  if v_fid is null then
    raise exception 'this table says its stage is kept in %, and that column is gone', v_key
      using errcode = '23503',
            hint = 'Declare the pipeline again with custom.pipeline_declare, or point stage_field at a column that is there.';
  end if;

  return jsonb_build_object(
    'is_pipeline', true,
    'table_id',    p_table_id,
    'stage_field', v_key,
    'field_id',    v_fid,
    'stage_label', v_flab,
    -- key AND label, both, every time. A board that carried only labels could not write a
    -- move; one that carried only keys could not draw a heading.
    'stages',      coalesce((select jsonb_agg(jsonb_build_object(
                               'key', k, 'label', v ->> 'label', 'retired', v -> 'retired')
                               order by ord)
                               from jsonb_each(custom.choice_options(p_organization_id, v_opts))
                                    with ordinality as t(k, v, ord)), '[]'::jsonb),
    'rules',       coalesce((select jsonb_agg(jsonb_build_object(
                               'id', r.id, 'name', r.data ->> 'name',
                               'message', r.data ->> 'message',
                               'kind', r.data #>> '{pipeline,kind}',
                               'stage', r.data #>> '{pipeline,stage}',
                               'uses', r.data -> 'uses',
                               'on_entry', r.data -> 'on_entry',
                               'version', r.version)
                               order by r.data #>> '{pipeline,kind}', r.data #>> '{pipeline,stage}')
                              from custom.record r
                             where r.organization_id = p_organization_id
                               and r.table_id = custom.rule_kernel_id()
                               and r.deleted_at is null
                               and (r.data #>> '{pipeline,stage_field_of}')::uuid = p_table_id),
                            '[]'::jsonb));
end;
$fn$;

-- ══ 8. THE BOARD'S OWN NUMBERS — a count and a total per column, in the stage order ═══
-- A board that counted its cards in the browser would count the page it happened to have
-- loaded. These are the store's numbers over every record this person may see.
create or replace function custom.pipeline_board(p_organization_id uuid, p_table_id uuid,
                                                 p_measure text default null)
  returns table (stage_key text, stage_label text, stage_position integer,
                 cards bigint, total numeric, wip_limit integer, over_limit boolean)
  language plpgsql stable security definer set search_path = pg_catalog as $fn$
declare
  v_read jsonb;
  v_key  text;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.pipeline_board');
  v_read := custom.pipeline_read(p_organization_id, p_table_id);
  if not coalesce((v_read ->> 'is_pipeline')::boolean, false) then
    return;
  end if;
  v_key := v_read ->> 'stage_field';
  if p_measure is not null and not exists (
       select 1 from custom.record f
        where f.organization_id = p_organization_id
          and f.table_id = custom.field_kernel_id()
          and f.deleted_at is null
          and (f.data ->> 'entity_definition_id')::uuid = p_table_id
          and f.data ->> 'key' = p_measure) then
    raise exception 'this board was asked to total %, and there is no such column on this table', p_measure
      using errcode = '23503',
            hint = 'The measure is a column key of the same table — a number, a money or a percentage one.';
  end if;
  return query
    with stages as (
      select s ->> 'key' as k, s ->> 'label' as lab, ord::integer as pos
        from jsonb_array_elements(v_read -> 'stages') with ordinality as t(s, ord)),
    lim as (
      -- The limit is written into the Rule's own test, which is the only copy of it. Reading
      -- it back from there is why a board cannot show a limit the store does not enforce.
      select r.data #>> '{pipeline,stage}' as k,
             (jsonb_path_query_first(r.data -> 'expr',
                '$.**{0 to 8} ? (@.op == "lt").args[1].const') #>> '{}')::integer as n
        from custom.record r
       where r.organization_id = p_organization_id
         and r.table_id = custom.rule_kernel_id()
         and r.deleted_at is null
         and (r.data #>> '{pipeline,stage_field_of}')::uuid = p_table_id
         and r.data #>> '{pipeline,kind}' = 'limit'),
    live as (
      select r.data ->> v_key as k,
             count(*) as n,
             sum(case when p_measure is null then null
                      when jsonb_typeof(r.data -> p_measure) = 'number'
                        then (r.data ->> p_measure)::numeric end) as total
        from custom.record r
       where r.organization_id = p_organization_id
         and r.table_id = p_table_id
         and r.deleted_at is null
         and r.data_class = 'record'
         and r.id in (select custom.query_visible_ids(p_organization_id, p_table_id, 'viewer'))
       group by 1)
    select s.k, s.lab, s.pos, coalesce(l.n, 0), l.total, lm.n,
           lm.n is not null and coalesce(l.n, 0) > lm.n
      from stages s
      left join live l on l.k = s.k
      left join lim  lm on lm.k = s.k
     order by s.pos;
end;
$fn$;

-- ══ 9. ASKING BEFORE MOVING — the same judgement, in advance ═════════════════════════
-- A board needs to know, before the finger lets go, whether a drop will land: to grey a
-- column, to snap a card back, and to say WHY in the store's own words rather than in a
-- sentence a screen invented. This runs the very same Rules, through the very same
-- evaluator, on the document the move WOULD produce — so a preview that disagreed with the
-- enforcement would be a defect in one shared body, not a drift between two.
create or replace function custom.pipeline_transition_refusal(p_organization_id uuid,
                                                              p_record_id uuid, p_to text)
  returns jsonb language plpgsql stable security definer set search_path = pg_catalog as $fn$
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
        for v_one in select jsonb_path_query(r.data -> 'expr',
                              '$.**{0 to 8} ? (@.op == "present").args[0].field') loop
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
$fn$;

-- ══ 10. MAKING THE MOVE — an ordinary record write, and nothing else ═════════════════
-- This door exists to be CONVENIENT, not to be a second write path: it merges the stage into
-- a patch and hands it to `custom.record_update`. Every validator, the choice normaliser, the
-- history capture and the entry effects all run because the move IS a write. A board that
-- wrote the stage some other way would have a history that did not know about it.
create or replace function custom.pipeline_move(p_organization_id uuid, p_record_id uuid,
                                                p_to text, p_also jsonb default '{}'::jsonb,
                                                p_expected_version integer default null)
  returns jsonb language plpgsql security definer set search_path = pg_catalog as $fn$
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
$fn$;

-- ══ 11. WHAT HAPPENS WHEN A CARD ARRIVES ════════════════════════════════════════════
-- AFTER the write, in the SAME transaction: if the move is refused, none of this happened.
-- Each effect goes through the door that already owns it — `custom.work_assign` for the
-- person, `custom.checklist_start` for the checklist, `custom.agg_deliver` for the notice —
-- so an entry effect is the same act as doing it by hand, with the same history and the same
-- refusals. NOTHING HERE FAILS SILENTLY: an effect that cannot run says so on the record's
-- own `_pipeline_entry` note, with the reason, rather than disappearing.
create or replace function custom._pipeline_on_entry() returns trigger
  language plpgsql set search_path = pg_catalog as $fn$
declare
  v_key   text;
  v_ctx   jsonb;
  v_rtype text;
  v_type  text;
  r       custom.record;
  v_eff   jsonb;
  v_note  jsonb := '[]'::jsonb;
  v_user  uuid;
begin
  if new.data_class is distinct from 'record' or new.table_id is null then
    return new;
  end if;
  v_key := custom._stage_field_key(new.organization_id, new.table_id);
  if v_key is null then
    return new;                                  -- not a pipeline; nothing to do, on any write
  end if;
  if tg_op = 'UPDATE' and (old.data -> v_key) is not distinct from (new.data -> v_key) then
    return new;                                  -- the stage did not move
  end if;

  v_ctx := jsonb_build_object(
             'previous_values', case when tg_op = 'UPDATE' then old.data else 'null'::jsonb end,
             'record_id', to_jsonb(new.id), 'table_id', to_jsonb(new.table_id));
  v_type := custom._stage_field_key(new.organization_id, new.table_id);
  select t.data ->> 'type_field' into v_type from custom.record t
   where t.organization_id = new.organization_id and t.id = new.table_id
     and t.table_id = custom.table_kernel_id() and t.deleted_at is null;
  if v_type is not null then v_rtype := new.data ->> v_type; end if;

  for r in select * from custom.table_rules(new.organization_id, new.table_id, 'applicability', v_rtype) loop
    if jsonb_typeof(r.data -> 'on_entry') <> 'object' then
      continue;
    end if;
    if custom.rule_truth(custom.rule_run(new.organization_id, r.id, new.data, v_ctx) -> 'answer') is not true then
      continue;
    end if;
    v_eff := r.data -> 'on_entry';

    if nullif(v_eff ->> 'assign', '') is not null then
      begin
        perform custom.work_assign(new.organization_id, new.id, (v_eff ->> 'assign')::uuid, null, false);
        v_note := v_note || jsonb_build_object('did', 'assigned', 'rule_id', r.id);
      exception when others then
        v_note := v_note || jsonb_build_object('could_not', 'assign this to anybody',
                    'because', sqlerrm, 'rule_id', r.id);
      end;
    end if;

    if nullif(v_eff ->> 'checklist', '') is not null then
      begin
        perform custom.checklist_start(new.organization_id, (v_eff ->> 'checklist')::uuid,
                                       new.id, null, null);
        v_note := v_note || jsonb_build_object('did', 'started the checklist', 'rule_id', r.id);
      exception when others then
        v_note := v_note || jsonb_build_object('could_not', 'start the checklist',
                    'because', sqlerrm, 'rule_id', r.id);
      end;
    end if;

    v_user := nullif(v_eff #>> '{notify,user}', '')::uuid;
    if v_user is not null then
      begin
        perform custom.agg_deliver(new.organization_id, r.id, new.id,
                  coalesce(nullif(v_eff #>> '{notify,channel}', ''), 'in_app'), v_user,
                  'pipeline.stage_entered',
                  coalesce(nullif(v_eff #>> '{notify,subject}', ''), r.data ->> 'name'),
                  coalesce(nullif(v_eff #>> '{notify,body}', ''), r.data ->> 'message'),
                  jsonb_build_object('table_id', new.table_id, 'record_id', new.id,
                                     'stage', new.data ->> v_key, 'source', 'pipeline'));
        v_note := v_note || jsonb_build_object('did', 'told somebody', 'rule_id', r.id);
      exception when others then
        v_note := v_note || jsonb_build_object('could_not', 'tell anybody',
                    'because', sqlerrm, 'rule_id', r.id);
      end;
    end if;
  end loop;

  if jsonb_array_length(v_note) > 0 then
    update custom.record
       set data = jsonb_set(data, '{_pipeline_entry}',
                    jsonb_build_object('stage', new.data ->> v_key, 'at', to_jsonb(now()),
                                       'what', v_note))
     where organization_id = new.organization_id and id = new.id;
  end if;
  return new;
end;
$fn$;

create trigger zzz_pipelines_on_entry
  after insert or update on custom.record
  for each row execute function custom._pipeline_on_entry();

-- ══ 12. THE DOORS, DECLARED BEFORE THEY ARE GRANTED ═════════════════════════════════
-- THE ORDER IS LOAD-BEARING, and WORK-DOORS paid for learning it on 2026-09-20:
-- `platform.enforce_definer_client_grants` fires ON THE GRANT, and a SECURITY DEFINER
-- function in a closed schema with no `platform.client_callable_door` row has its client
-- EXECUTE taken straight back inside the same transaction, with the run still reporting
-- success. Declare, then grant.
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes,
   signed_in_callers, anonymous_callers, declared_by, reason)
select 'custom', v.fn, iam.door_identity_args(p.oid), platform.door_argtypes(p.proargtypes),
       true, false,
       'migrations/campaign/pipelines_a_stage_is_a_field_and_its_moves_are_rules.sql (lane PIPELINES)',
       v.why
  from (values
    ('table_stage_field',
     'Which column of this table holds the stage, so a screen knows it is looking at a pipeline at all. The twin of custom.table_type_field, and read the same way.'),
    ('pipeline_declare',
     'Turns "give me a board of deals by stage" into a Choice column, its options, and the transition Rules that judge every move — admin on the Table, the same rung declaring a column or a rule already asks for.'),
    ('pipeline_read',
     'The whole pipeline in one read: the stage column, its stages with both their key and their label, and every Rule that governs a move, with the sentence each one says when it refuses.'),
    ('pipeline_board',
     'The count and the total per column, over every record this person may see rather than over the page a screen happened to load, in the declared stage order, with each column''s limit and whether it is over it.'),
    ('pipeline_transition_refusal',
     'Whether this card may go to that column, answered by the very same Rules through the very same evaluator BEFORE the finger lets go — with the store''s own sentence and, when a stage demands columns that are empty, exactly which ones.'),
    ('pipeline_move',
     'Moves a record to a stage as an ORDINARY record write, so the validators, the choice normaliser, the history capture and the entry effects all run. It is convenience, never a second write path.')
  ) as v(fn, why)
  join pg_proc p on p.proname = v.fn and p.pronamespace = 'custom'::regnamespace
 where not exists (select 1 from platform.client_callable_door d
                    where d.schema_name = 'custom' and d.function_name = v.fn
                      and d.identity_argtypes = platform.door_argtypes(p.proargtypes));

grant execute on function custom.table_stage_field(uuid, uuid) to authenticated;
grant execute on function custom.pipeline_declare(uuid, uuid, jsonb) to authenticated;
grant execute on function custom.pipeline_read(uuid, uuid) to authenticated;
grant execute on function custom.pipeline_board(uuid, uuid, text) to authenticated;
grant execute on function custom.pipeline_transition_refusal(uuid, uuid, text) to authenticated;
grant execute on function custom.pipeline_move(uuid, uuid, text, jsonb, integer) to authenticated;
