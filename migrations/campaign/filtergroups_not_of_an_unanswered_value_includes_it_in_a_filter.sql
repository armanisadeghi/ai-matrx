-- target: branch,production
-- additive: yes
--   It REPLACES three bodies, each declared below with the body it was written against:
--   custom.rule_eval's NOT arm answers TRUE for an undecided operand when the question is a
--   FILTER (`p_context.purpose = 'filter'`) and stays undecided otherwise; custom.rule_membership
--   asks with that purpose; custom.rule_filter_node_sql (the compiled WHERE clause every list, board
--   and aggregate uses) answers the same. Nothing is added, dropped or revoked; no table, trigger,
--   policy or grant is touched. ORDER: after filtergroups_a_views_nested_question_is_one_where_clause.sql
--   (and after GRID-PRIMITIVES G6, whose custom.rule_eval body this is based on). The inverse is
--   `migrations/inverse/filtergroups_not_of_an_unanswered_value_includes_it_in_a_filter_down.sql`.
-- guard: custom/system_enabled
-- lock: custom
-- based-on: custom.rule_eval(uuid, jsonb, jsonb, jsonb) 96c3da3e11971f96d5c41934807e5ad5612f3004b651a6fffdabb28934f02084
-- based-on: custom.rule_membership(uuid, uuid, uuid) f753fae2339c1316a6ea11e9d0f1e2efc7ff24d40467302708cf2406405e6a59
-- based-on: custom.rule_filter_node_sql(uuid, uuid, jsonb, jsonb, text[]) 3cb9262bc9ffe76c6960eac517e59fdfabec184bd3fb544b1a76966cdc42ee82
--
-- LANE S2-PRIME FILTER-GROUPS — CHAIR RULING 2026-09-24: MATCH THE CHAMPION ON NOT.
-- Rosa's view ends "AND NOT priority is Low". TT-4111 (Ojai, Scheduled, no priority yet) was OUT
-- of it: `eq` of a missing value is undecided, and the evaluator's `not` kept it undecided. A
-- dispatcher reading "not Low" means "everything that is not Low", blanks included — Airtable's
-- "is not" answers exactly that. So for a FILTER (a view, a membership, a list) NOT of undecided is
-- true. Three-valued logic stays where it protects somebody: a validate Rule or a stage gate that
-- refuses a write is asked with no purpose, so an unanswered value still never fires a refusal.
--
-- LOCKS. create or replace function only. Not window-class.

set local lock_timeout = '5s';
set local statement_timeout = '60s';

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
  v_want   public.permission_level;
  v_held   public.permission_level;
  v_count  bigint;
  -- F5, 2026-09-22. The words a person reads, and what joins them.
  v_sep    text;
  v_part   text;
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

  -- ── GRID-PRIMITIVES G6 (chair ruling 2026-09-22): THE FORMULA LANGUAGE IN A RULE. ──────────
  -- A Rule may now ask anything a formula can: IF, ROUND, DATEDIFF, CONTAINS, the whole list of
  -- custom.formula_node_kinds(). Those nodes are worked out by custom.formula_eval, the ONE
  -- formula evaluator, which hands every node that is not its own back here — so the two never
  -- evaluate the same node, and a Rule and a formula column answer one question one way.
  if left(coalesce(p_expr ->> 'op', ''), 3) = 'fx.' then
    return custom.formula_eval(p_organization_id, p_expr, p_values, p_context);
  end if;

  -- ── PIPELINES: THE VALUE THIS RECORD HELD BEFORE THIS WRITE. ─────────────────────────
  -- First, because it carries a `field` key and would otherwise be read as the CURRENT
  -- value by the leaf below — which is the one wrong answer this node could give, and it
  -- would be silent.
  if p_expr ->> 'op' = 'previous' then
    -- coalesce, AND THE MESSAGE BELOW ALREADY EXPECTED IT. `jsonb_typeof(NULL)` is NULL and
    -- `NULL <> 'string'` is NULL, which is not true — so a `previous` node with NO `field`
    -- key at all walked past this check, past the uuid test (also NULL), and returned NULL
    -- from `p_context -> 'previous_values' -> NULL`. `custom.rule_truth(NULL)` is NULL, not
    -- false, so a GATE written with a bare `previous` node PASSED: it stopped nobody and
    -- said nothing. The sentence two lines down says "points at it with nothing", which is
    -- the case that could never reach it.
    if coalesce(jsonb_typeof(p_expr -> 'field'), 'absent') <> 'string'
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

  -- ── STAGE-RULES: A SECOND RECORD LIKE THIS ONE, AND HOW IT DIFFERS. ─────────────────
  -- The smallest honest cross-record primitive. How many OTHER live records of this record's
  -- own Table agree with it on every Field named in `same`, and answer differently on every
  -- Field named in `differs`. "A second quote for the same room from a different contractor"
  -- IS that question; so is "another signed contract on the same account", "a second reviewer
  -- on the same submission", "another donation against the same pledge". It answers a COUNT,
  -- so the gate that uses it is an ordinary `gte` node and no new comparison was invented.
  --
  -- WHY NOT A BESPOKE "second quote" CHECK: a gate that could only count quotes would be a
  -- renovation feature living in the platform. This counts records, by Field id, on the one
  -- store, and every organization's pipeline can ask it.
  --
  -- THE RECORD BEING WRITTEN IS EXCLUDED, for the same reason `stage_count` excludes it: a
  -- demand for "one other" that counted the mover would be satisfied by the mover alone.
  if v_op = 'sibling_count' then
    if (p_context ->> 'table_id') is null then
      -- Nobody said which Table this write is about, so there is no family to count. Undecided,
      -- never zero: a gate must not be satisfied, or refused, by a question it could not ask.
      return 'null'::jsonb;
    end if;
    if jsonb_typeof(coalesce(p_expr -> 'same', '[]'::jsonb)) <> 'array'
       or jsonb_typeof(coalesce(p_expr -> 'differs', '[]'::jsonb)) <> 'array'
       or jsonb_array_length(coalesce(p_expr -> 'same', '[]'::jsonb))
        + jsonb_array_length(coalesce(p_expr -> 'differs', '[]'::jsonb)) = 0 then
      raise exception 'this rule counts records like this one, and never says what "like this one" means'
        using errcode = '22023',
              hint = 'STAGE-RULES: {"op":"sibling_count","same":["<field id>"],"differs":["<field id>"]} — `same` are the Fields a sibling has to match, `differs` the Fields it has to answer differently. At least one of the two carries a Field.';
    end if;
    -- REC-17 AT EVALUATION, asked the way every other leaf asks it. A count taken over a
    -- Field that is no longer there would quietly be zero, and a gate would quietly open.
    for v_one in select e from jsonb_array_elements(
                   coalesce(p_expr -> 'same', '[]'::jsonb) || coalesce(p_expr -> 'differs', '[]'::jsonb)) e
    loop
      if jsonb_typeof(v_one) <> 'string'
         or (v_one #>> '{}') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        raise exception 'this rule counts records like this one and points at a field with % instead of with its id',
                        custom.said(v_one #>> '{}', 'nothing')
          using errcode = '22023',
                hint = 'REC-17 applies to sibling_count too: Fields by id, never by name.';
      end if;
      if custom.rule_field_key(p_organization_id, (v_one #>> '{}')::uuid) is null then
        raise exception 'this rule counts records like this one by a field that is not there any more'
          using errcode = '23503',
                hint = 'REC-18: deleting a Field a Rule depends on is refused naming the Rule (W3-MIG). This is what the count says when it happens anyway.';
      end if;
    end loop;
    select count(*) into v_count
      from custom.record r
     where r.organization_id = p_organization_id
       and r.table_id = (p_context ->> 'table_id')::uuid
       and r.deleted_at is null
       and r.data_class = 'record'
       and r.id is distinct from nullif(p_context ->> 'record_id', '')::uuid
       and not exists (
             select 1
               from jsonb_array_elements_text(coalesce(p_expr -> 'same', '[]'::jsonb)) s(fid)
              where r.data -> custom.rule_field_key(p_organization_id, s.fid::uuid)
                is distinct from p_values -> custom.rule_field_key(p_organization_id, s.fid::uuid))
       -- A SIBLING THAT ANSWERS NOTHING DOES NOT COUNT AS ANSWERING DIFFERENTLY. An empty
       -- contractor is not a different contractor, and a rule that accepted it would let a
       -- blank second quote satisfy a second-quote demand.
       and not exists (
             select 1
               from jsonb_array_elements_text(coalesce(p_expr -> 'differs', '[]'::jsonb)) d(fid)
              where coalesce(r.data -> custom.rule_field_key(p_organization_id, d.fid::uuid),
                             'null'::jsonb) = 'null'::jsonb
                 or r.data -> custom.rule_field_key(p_organization_id, d.fid::uuid)
                    is not distinct from p_values -> custom.rule_field_key(p_organization_id, d.fid::uuid));
    return to_jsonb(v_count);
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
    -- S2-PRIME (chair ruling 2026-09-24): NOT OF AN UNDECIDED ANSWER. Asked to FILTER — who is in
    -- a set, which rows a view holds (`p_context.purpose = 'filter'`, set by
    -- custom.rule_membership) — "not priority is Low" includes a job with no priority yet, which
    -- is what a person means and what Airtable answers. Everywhere else it stays undecided:
    -- a Rule that REFUSES A WRITE must never fire on a value nobody has given.
    if v_truth is null then
      return case when p_context ->> 'purpose' = 'filter' then 'true'::jsonb else 'null'::jsonb end;
    end if;
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
    -- ── F5 (VERIFIER-11), 2026-09-22: A JOIN IS READ BY A PERSON, SO IT CARRIES WORDS. ──
    --
    -- What a worked-out column printed on Greenline's Jobs: `GL-2034mow_edge`. The job number
    -- is words somebody typed; `mow_edge` is the OPTION KEY the store stores for the choice
    -- whose label, in the very next cell, reads `Mow & Edge`. A relation argument was worse
    -- still — a bare row id. Concatenation is THE node whose answer is shown to a person and
    -- never compared, so it is the one node that resolves a stored value to its display words.
    -- Every comparison arm below this one keeps the STORED value, unchanged: `eq` on a choice
    -- still asks about the key, because a comparison against a label would start answering
    -- differently the day somebody renames the option.
    --
    -- ONE RESOLVER, NOT A SECOND LOOKUP. `custom.field_words` is the whole of it: a choice
    -- goes through `custom.choice_options`, a relation through `custom._words_for` carrying
    -- the Field's own `display` — the same primitive `custom.relation_words_many` and
    -- `custom.record_words` call, with the same visibility ladder inside it, so a person who
    -- may not see the record a relation points at reads the withheld label here too.
    v_acc  := null;
    v_sep  := coalesce(p_expr ->> 'separator', '');
    for v_one in select e from jsonb_array_elements(v_args) e loop
      v_b := custom.rule_eval(p_organization_id, v_one, p_values, p_context);
      if v_b is null or jsonb_typeof(v_b) = 'null' then continue; end if;
      v_part := null;
      if jsonb_typeof(v_one) = 'object' and (v_one ? 'field' or v_one ? 'parent_field') then
        v_part := custom.field_words(p_organization_id,
                    nullif(coalesce(v_one ->> 'field', v_one ->> 'parent_field'), '')::uuid, v_b);
      end if;
      v_part := coalesce(v_part, v_b #>> '{}');
      -- AN ARGUMENT THAT SAYS NOTHING BRINGS NO SEPARATOR WITH IT. A blank second column
      -- used to be invisible; with a separator it would print a dangling ` — ` instead.
      if nullif(btrim(v_part), '') is null then continue; end if;
      v_acc := case when v_acc is null then v_part else v_acc || v_sep || v_part end;
    end loop;
    return to_jsonb(coalesce(v_acc, ''));
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

CREATE OR REPLACE FUNCTION custom.rule_membership(p_organization_id uuid, p_rule_id uuid, p_record_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_run jsonb;
begin
  v_run := custom.rule_run(p_organization_id, p_rule_id,
                           custom.record_values(p_organization_id, p_record_id),
                           -- S2-PRIME: membership is a FILTER question (custom.rule_eval's NOT).
                           custom.rule_context(p_organization_id, p_record_id)
                             || jsonb_build_object('purpose', 'filter'));
  return v_run || jsonb_build_object('use', 'membership',
                                     'member', to_jsonb(custom.rule_truth(v_run -> 'answer')),
                                     'record_id', p_record_id);
end;
$function$;

CREATE OR REPLACE FUNCTION custom.rule_filter_node_sql(p_organization_id uuid, p_table_id uuid, p_node jsonb, p_map jsonb, p_visible text[])
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_op    text;
  v_args  jsonb;
  v_key   text;
  v_parts text[] := '{}';
  v_sql   text;
  v_one   jsonb;
  v_a     jsonb;
  v_b     jsonb;
  v_fkey  text;
  v_const jsonb;
  v_i     integer;
begin
  if p_node is null or jsonb_typeof(p_node) <> 'object' then
    raise exception 'this rule''s test is not written in a shape the system can work out'
      using errcode = '22023',
            hint = 'REC-15: a Rule expression is an object — one of the nodes custom.rule_node_kinds() lists.';
  end if;
  if p_node ?| array['field_name', 'field_key', 'field_label'] then
    raise exception 'this rule names a field instead of pointing at it'
      using errcode = '22023',
            hint = 'REC-17: a Rule references Fields by id, never by name — {"field": "<the field''s id>"}. A name changes and the rule would stop resolving; an id does not.';
  end if;

  v_op := p_node ->> 'op';
  if left(coalesce(v_op, ''), 3) = 'fx.'
     or v_op in ('previous', 'actor_at_least', 'stage_count', 'sibling_count', 'concat')
     or p_node ?| array['parent_field', 'merge_field', 'grandparent_field', 'ancestor_field'] then
    raise exception 'a filter cannot ask "%" of every record at once',
                    coalesce(v_op, (select k from jsonb_object_keys(p_node) k
                                     where k in ('parent_field', 'merge_field', 'grandparent_field', 'ancestor_field') limit 1))
      using errcode = '0A000',
            hint = 'A view''s filter compares a record''s own columns: is, is not, more / less than, at least / at most, matches, has been answered, how long, + − × ÷, and ALL / ANY / NOT groups of those, nested as deep as you like. What a write is doing (previous, who is moving it, how full a column is, a sibling like it), a parent''s or a merge field''s answer, a joined sentence and the formula functions are for Rules that judge one record, not for a list. Nothing was read.';
  end if;

  if p_node ? 'const' then
    return format('%L::jsonb', (p_node -> 'const')::text);
  end if;

  if p_node ? 'field' then
    if jsonb_typeof(p_node -> 'field') <> 'string'
       or (p_node ->> 'field') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'this rule points at a field with % instead of with its id', p_node ->> 'field'
        using errcode = '22023',
              hint = 'REC-17: {"field": "<the field''s id>"}. What is written here is not an id at all.';
    end if;
    select f.data ->> 'key' into v_key
      from custom.record f
     where f.organization_id = p_organization_id
       and f.id = (p_node ->> 'field')::uuid
       and f.table_id = custom.field_kernel_id()
       and f.deleted_at is null
       and (f.data ->> 'entity_definition_id')::uuid = p_table_id;
    if v_key is null then
      raise exception 'this filter points at a field that is not one of this table''s fields'
        using errcode = '23503',
              hint = 'REC-17 / FLD-8: a filter reaches a Field by its id, and the Field has to be a live field OF the table being read. A field that was deleted, or one of another table, answers nothing rather than something wrong.';
    end if;
    perform custom.agg_assert_key(v_key);
    if p_visible is not null and not (v_key = any (p_visible)) then
      -- HIDDEN FROM THIS READER, SO UNKNOWN TO THIS READER. The read door masks this column in
      -- every document it hands them; the filter answers about it the same way.
      return '''null''::jsonb';
    end if;
    return format('(custom.record_values_of(r) -> %L)', v_key);
  end if;

  v_args := coalesce(p_node -> 'args', '[]'::jsonb);
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
  if jsonb_typeof(v_args) <> 'array' then
    raise exception 'this rule''s % carries its arguments as a %, not as a list', v_op, jsonb_typeof(v_args)
      using errcode = '22023', hint = 'REC-15: {"op": "…", "args": [ … ]}.';
  end if;

  if v_op = 'and' then
    -- Innermost first: `case <truth of arg n> when false … when undecided … else true end`,
    -- wrapped outward, so arg 1 is asked first and each is asked once.
    v_sql := '''true''::jsonb';
    for v_i in reverse (jsonb_array_length(v_args) - 1)..0 loop
      v_sql := format(
        'case coalesce(custom.rule_truth(%s)::text, ''undecided'') when ''false'' then ''false''::jsonb when ''undecided'' then ''null''::jsonb else %s end',
        custom.rule_filter_node_sql(p_organization_id, p_table_id, v_args -> v_i, p_map, p_visible), v_sql);
    end loop;
    return '(' || v_sql || ')';
  elsif v_op = 'or' then
    for v_one in select e from jsonb_array_elements(v_args) e loop
      v_parts := array_append(v_parts, format('when custom.rule_truth(%s) is true then ''true''::jsonb',
                   custom.rule_filter_node_sql(p_organization_id, p_table_id, v_one, p_map, p_visible)));
    end loop;
    if cardinality(v_parts) = 0 then
      return '''false''::jsonb';
    end if;
    return '(case ' || array_to_string(v_parts, ' ') || ' else ''false''::jsonb end)';
  elsif v_op = 'not' then
    -- S2-PRIME (chair ruling 2026-09-24): a list is always a FILTER question, so NOT of an
    -- undecided answer is true here — exactly custom.rule_eval with purpose = 'filter'.
    return format(
      '(case coalesce(custom.rule_truth(%s)::text, ''undecided'') when ''undecided'' then ''true''::jsonb when ''true'' then ''false''::jsonb else ''true''::jsonb end)',
      custom.rule_filter_node_sql(p_organization_id, p_table_id, v_args -> 0, p_map, p_visible));
  elsif v_op in ('present', 'length') then
    return format('custom.rule_sql_op(%L, %s)', v_op,
                  custom.rule_filter_node_sql(p_organization_id, p_table_id, v_args -> 0, p_map, p_visible));
  end if;

  -- The two-sided nodes. A choice compared with the words a person typed is compared against
  -- the stored key, exactly as the flat filter normalises it (CHOICE-VALUE).
  v_a := v_args -> 0;
  v_b := v_args -> 1;
  if v_op in ('eq', 'ne') and p_map is not null and p_map <> '{}'::jsonb then
    for v_i in 0..1 loop
      v_one   := case when v_i = 0 then v_a else v_b end;
      v_const := case when v_i = 0 then v_b else v_a end;
      continue when v_one is null or jsonb_typeof(v_one) <> 'object' or not (v_one ? 'field') or v_one ? 'op'
                 or v_const is null or jsonb_typeof(v_const) <> 'object' or not (v_const ? 'const')
                 or jsonb_typeof(v_const -> 'const') <> 'string';
      select f.data ->> 'key' into v_fkey
        from custom.record f
       where f.organization_id = p_organization_id
         and f.id = nullif(v_one ->> 'field', '')::uuid
         and f.table_id = custom.field_kernel_id()
         and f.deleted_at is null;
      if v_fkey is not null and p_map ? v_fkey
         and custom.choice_key_of(p_map -> v_fkey, v_const ->> 'const') is not null then
        v_const := jsonb_build_object('const', custom.choice_key_of(p_map -> v_fkey, v_const ->> 'const'));
        if v_i = 0 then v_b := v_const; else v_a := v_const; end if;
      end if;
    end loop;
  end if;
  return format('custom.rule_sql_op(%L, %s, %s)', v_op,
                custom.rule_filter_node_sql(p_organization_id, p_table_id, v_a, p_map, p_visible),
                custom.rule_filter_node_sql(p_organization_id, p_table_id, v_b, p_map, p_visible));
end;
$function$;
