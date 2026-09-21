-- additive: yes
-- guard: custom/system_enabled
-- based-on: custom.rule_node_kinds() bc0ff42aafba8d07fc0406dd96aaba4d33053da0c18b52ef8db6b071694dc397
-- based-on: custom.rule_eval(uuid, jsonb, jsonb, jsonb) e447eee433ed7c2320eab7c68c2dec071e911587ce9e339e8a83e67f2cc48ab0
-- based-on: custom._rule_shape_guard() 76208789b50baec5288d1df14776eac718d9f2545fcf070b494e544deb5e78c6
-- based-on: custom._record_rule_uses() 9faabafde8b306a2a7014efc733a307ad553db0f3fd06c4ebbd0912231f92753
-- based-on: custom.pipeline_transition_refusal(uuid, uuid, text) af7bf793a9dbad456fb802ab61192b318327ae46f7811ad2f01daa7547cdd94f
-- based-on: custom.pipeline_move(uuid, uuid, text, jsonb, integer) 6e980e092aeca795d57028b7d70aa46c177955ad620d7f69105e89aecb2d4cc2
-- based-on: custom.pipeline_declare(uuid, uuid, jsonb) c95eb34a41deecaf3d6f5f31fb1728fd71c7e35fb53ef5d8ee1c5f4752f14a98
-- based-on: custom.work_approval_decide(uuid, uuid, boolean, text) c788068c81bbadfcd7d88521358b6c94c337f99447d2488389ff153bc5546ced
--
-- STAGE-RULES — "nothing moves to Approved over $5,000 without a second quote from a
-- different contractor."
--
-- WHAT WAS MISSING, MEASURED ON THE MAIN DATABASE 2026-09-21. Lane PIPELINES built stage
-- gates: a move is an ordinary record write, the validate use judges it, and the refusal
-- carries the Rule's own sentence. Three things a real business needs were still
-- unsayable, and this file is exactly those three and nothing else.
--
-- 1. A GATE COULD ONLY EVER REFUSE. Salesforce's validation rules refuse. Pipedrive's
--    required-fields-per-stage refuse. Linear's workflow gates refuse. The answer none of
--    them has is the one a homeowner, a sales manager and a finance team all actually give:
--    "not without somebody senior saying yes." A Rule now carries `on_fail`, which is
--    `refuse` (today's behaviour, and the default) or `require_approval` — and
--    `require_approval` does not invent a queue, it files into the ONE approvals product
--    WORK-DOORS built, with the rule's sentence as the reason.
--
-- 2. A GATE COULD ONLY SEE ONE RECORD. Every one of the twenty-four nodes spoke about the
--    record being written, its parent, or a count of a stage. "A second quote from a
--    DIFFERENT contractor" is a question about the record's SIBLINGS, and there was no way
--    to ask it. `sibling_count` closes that with the smallest honest primitive: how many
--    other live records of this Table match this one on the Fields named in `same` and
--    answer differently on the Fields named in `differs`. It returns a number, so the gate
--    that uses it is an ordinary `gte` and no new comparison was invented.
--
-- 3. AN ORGANIZATION HAD NO SAY. Enforcement was hard-coded. `custom/stage_rule_enforcement`
--    is the one knob — `refuse` by default, `warn` for an organization that would rather be
--    told than stopped — and it never softens `require_approval`, because "ask somebody" and
--    "carry on with a note" are different answers.
--
-- A GATE IS NOT A NEW KIND OF THING. It is the ONE Rule object (REC-15) with the two keys
-- above, judged by the ONE evaluator, in the write's own transaction, through the doors that
-- already exist. There is no second policy engine, no second condition language, no second
-- queue and no second store of "which stage is this in".
--
-- ───────────────────────────────────────────────────────────────────────────────────────
-- THE CLOSED LIST OF WHAT A GATE DOES WHEN IT SAYS NO.
-- Two answers, named, so a screen can offer them and a Rule cannot carry a third.
create or replace function custom.stage_rule_on_fail_kinds()
  returns table (behaviour text, note text)
  language sql immutable set search_path = pg_catalog as $fn$
  select * from (values
    ('refuse',
     'Say no, in this rule''s own words, and write nothing. The default, and what every gate did before this file.'),
    ('require_approval',
     'File the change in the approvals queue with this rule as the reason, and leave the record where it is. The person who can say yes decides it; approving applies the very same write through the very same doors.')
  ) as t(behaviour, note);
$fn$;

-- ───────────────────────────────────────────────────────────────────────────────────────
-- THE ONE KNOB. Rule enforcement is ON by default; an organization may ask to be warned.
insert into platform.feature_knob
  (feature, key, value, default_value, value_type, allowed_values, label, description,
   set_by, basis, overridable_by, override_direction, propagation, taxonomy_node_id, ui)
values
  ('custom', 'stage_rule_enforcement',
   '"refuse"'::jsonb, '"refuse"'::jsonb, 'enum',
   '["refuse", "warn"]'::jsonb,
   'Stage rules',
   'What happens when a record is moved to a stage whose rules it does not satisfy. '
   '"Refuse" stops the move and shows the rule''s own sentence — this is the default, and it is what a gate is for. '
   '"Warn instead" lets the move through and hands the same sentence back as a warning, for an organization that '
   'would rather be told than stopped. It never changes a rule that asks for approval: "ask somebody" and '
   '"carry on with a note" are different answers, and turning one into the other quietly would make an approval '
   'queue decoration.',
   'agent',
   'STAGE-RULES lane, 2026-09-21: enforcement was hard-coded into custom._record_rule_uses, so no organization '
   'could say otherwise. The default here is that exact behaviour.',
   array['organization']::text[], 'any', 'instant',
   (select id from platform.taxonomy_node where slug = 'custom-data' and level = 'feature'),
   '{}'::jsonb)
on conflict (feature, key) do update
   set allowed_values = excluded.allowed_values,
       label          = excluded.label,
       description    = excluded.description,
       overridable_by = excluded.overridable_by;

-- THE ONE READER OF THAT KNOB, written the way custom.store_is_open reads its own.
create or replace function custom.stage_rule_enforcement(p_organization_id uuid)
  returns text language plpgsql stable set search_path = pg_catalog as $fn$
declare
  v_answer text;
begin
  begin
    v_answer := lower(nullif(platform.knob_resolve('custom', 'stage_rule_enforcement',
                                                   p_organization_id) #>> '{}', ''));
  exception when others then
    -- §6b.4b's trap, and it matters more here than anywhere: platform.knob_resolve is
    -- SECURITY INVOKER and RAISES for a role that merely cannot SEE the row. A softening
    -- this writer cannot read is NOT APPLIED. The safe answer to "may I let this through"
    -- is always no.
    v_answer := null;
  end;
  if v_answer is null or not (v_answer = any (array['refuse', 'warn'])) then
    return 'refuse';
  end if;
  return v_answer;
end;
$fn$;



-- ───────────────────────────────────────────────────────────────────────────────────────
-- THE VOCABULARY GROWS BY ONE, AND THE LIST STAYS CLOSED.
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
    ('sibling_count', 'STAGE-RULES',    'how many OTHER live records of this record''s own Table match it on every Field named in `same` and answer differently on every Field named in `differs` — the cross-record question "is there a second quote from a different contractor", asked about records rather than about quotes'),
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


-- ───────────────────────────────────────────────────────────────────────────────────────
-- THE ONE EVALUATOR LEARNS THE CROSS-RECORD COUNT. Everything outside the one new block
-- is W1-RULE's and PIPELINES' body unchanged, byte for byte, which is what the
-- `-- based-on:` line pins.
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


-- ───────────────────────────────────────────────────────────────────────────────────────
-- THE SHAPE GUARD LEARNS `on_fail` AND THE COUNT'S FIELDS. A Rule nobody can work out,
-- or one that names a field the sweep cannot see, is refused WHEN IT IS SAVED.
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
  v_sib    text;
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

  -- ── STAGE-RULES: WHAT THIS RULE DOES WHEN IT SAYS NO. ──────────────────────────────
  -- A gate that can only refuse is half a policy. Salesforce's validation rules refuse;
  -- Pipedrive's required-fields-per-stage refuse; the thing neither of them has is the
  -- third answer a real business gives — "not without somebody senior saying yes". That is
  -- `require_approval`, and it is the Rule's own property rather than a second engine.
  if d ? 'on_fail' then
    if not (lower(coalesce(d ->> 'on_fail', '')) = any (select k.behaviour from custom.stage_rule_on_fail_kinds() k)) then
      raise exception 'the rule % says that when it stops something it should %, and there is no such answer',
                      v_name, custom.said(d ->> 'on_fail', 'do nothing')
        using errcode = '23514',
              hint = 'STAGE-RULES: on_fail is `refuse` (say no, in this rule''s own words) or `require_approval` (hand the change to the approvals queue with this rule as the reason). select * from custom.stage_rule_on_fail_kinds() is the whole list.';
    end if;
    if not (v_uses ? 'validate') then
      raise exception 'the rule % says what to do when it stops something, and it never stops anything', v_name
        using errcode = '23514',
              hint = 'STAGE-RULES: on_fail belongs to the validate use, which is the only use that can stop a write. Add validate to uses, or drop on_fail.';
    end if;
  end if;

  -- ── STAGE-RULES: REC-17 FOR THE CROSS-RECORD COUNT. ────────────────────────────────
  -- `sibling_count` names its Fields in `same` and `differs` rather than in a `field` leaf,
  -- so the REC-17 sweep above never sees them. They are checked HERE, at save time, exactly
  -- as hard: live Fields OF THE SCOPE TABLE, by id. Without this a new leaf key would have
  -- slipped past a check that already exists, which is the one thing REC-17 is for.
  for v_leaf in select jsonb_path_query(d -> 'expr', '$.**{0 to 12} ? (@.op == "sibling_count")')
  loop
    if jsonb_typeof(coalesce(v_leaf -> 'same', '[]'::jsonb)) <> 'array'
       or jsonb_typeof(coalesce(v_leaf -> 'differs', '[]'::jsonb)) <> 'array'
       or jsonb_array_length(coalesce(v_leaf -> 'same', '[]'::jsonb))
        + jsonb_array_length(coalesce(v_leaf -> 'differs', '[]'::jsonb)) = 0 then
      raise exception 'the rule % counts records like this one, and never says what "like this one" means', v_name
        using errcode = '23514',
              hint = 'STAGE-RULES: {"op":"sibling_count","same":["<field id>"],"differs":["<field id>"]}. `same` are the Fields a sibling has to match, `differs` the Fields it has to answer differently.';
    end if;
    for v_sib in select e #>> '{}'
                   from jsonb_array_elements(coalesce(v_leaf -> 'same', '[]'::jsonb)
                                          || coalesce(v_leaf -> 'differs', '[]'::jsonb)) e
    loop
      if v_sib is null
         or v_sib !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        raise exception 'the rule % counts records like this one and points at a field with % instead of with its id',
                        v_name, custom.said(v_sib, 'nothing')
          using errcode = '23514',
                hint = 'REC-17 applies to sibling_count too: Fields by id, never by name.';
      end if;
      select f.data ->> 'key' into v_fkey
        from custom.record f
       where f.organization_id = new.organization_id
         and f.id = v_sib::uuid
         and f.table_id = custom.field_kernel_id()
         and f.deleted_at is null
         and (f.data ->> 'entity_definition_id')::uuid = v_scope;
      if v_fkey is null then
        raise exception 'the rule % counts records like this one by a field that is not one of that table''s fields', v_name
          using errcode = '23514',
                hint = 'REC-17 / FLD-8: a sibling is a record of the SAME Table, so the Fields it is compared on are that Table''s own live Fields.';
      end if;
    end loop;
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


-- ───────────────────────────────────────────────────────────────────────────────────────
-- THE WRITE PATH LEARNS THE THREE OUTCOMES.
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
  v_fail       text;
  v_enforce    text;
  v_warned     jsonb := '[]'::jsonb;
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
      -- ── STAGE-RULES: WHAT A GATE DOES WHEN IT SAYS NO. ──────────────────────────────
      -- A Rule carries its own answer (`on_fail`); the organization carries the one knob
      -- that can soften a plain refusal into a warning. BOTH ARE READ ONLY AFTER A RULE HAS
      -- ACTUALLY FAILED, so a table whose rules all pass pays nothing for either — the same
      -- discipline WRITE-PERF-2 measured the context under.
      v_fail := lower(coalesce(nullif(r.data ->> 'on_fail', ''), 'refuse'));

      -- AN APPROVED EXCEPTION IS NOT A SECOND REFUSAL. `custom.work_approval_decide` names
      -- the record it is applying an approved change to, for the length of that one write;
      -- the gate that ASKED for the approval steps aside for exactly that write and for
      -- nothing else. Every plain refusal, every other validator and the whole value
      -- envelope still run, so an approver is never told yes over a write the store refuses.
      if v_fail = 'require_approval'
         and nullif(current_setting('custom.applying_approval_for', true), '') = new.id::text then
        continue;
      end if;

      if v_fail = 'require_approval' then
        raise exception '%', coalesce(nullif(r.data ->> 'message', ''), r.data ->> 'name')
          using errcode = 'PT428',
                detail = jsonb_build_object(
                           'rule_id',      r.id,
                           'rule',         r.data ->> 'name',
                           'rule_version', v_run -> 'rule_version',
                           'on_fail',      'require_approval',
                           'why',          coalesce(nullif(r.data ->> 'message', ''), r.data ->> 'name'))::text,
                hint = 'STAGE-RULES: this gate hands the change to the approvals queue instead of refusing it. custom.pipeline_move files the request and leaves the record where it is, and the card says it is waiting. A write that reaches this rule by another route is refused here rather than being let through unasked.';
      end if;

      -- THE ONE KNOB. Default `refuse`; an organization that would rather be told than
      -- stopped sets `warn`. It never softens `require_approval` — "ask somebody" and
      -- "carry on with a note" are different answers, and quietly turning one into the
      -- other is how an approval queue becomes decoration.
      v_enforce := custom.stage_rule_enforcement(new.organization_id);
      if v_enforce = 'warn' then
        v_warned := v_warned || jsonb_build_object(
          'rule_id',     r.id,
          'rule',        r.data ->> 'name',
          'why',         coalesce(nullif(r.data ->> 'message', ''), r.data ->> 'name'),
          'what_to_do',  'This organization asks to be warned instead of stopped. Set its "Stage rules" setting back to Refuse to have a write like this one refused.');
        continue;
      end if;

      raise exception '%', coalesce(nullif(r.data ->> 'message', ''), r.data ->> 'name')
        using errcode = '23514',
              hint = format('REC-15: the rule "%s" (version %s) is not satisfied by this record.',
                            r.data ->> 'name', v_run ->> 'rule_version');
    end if;
  end loop;

  -- NOTHING FAILS SILENTLY. A gate the organization's own knob overruled is carried OUT of
  -- the write in a transaction-local setting, so the door that made the write hands the
  -- sentence back to the person who made it. A write with nothing to say clears the setting
  -- rather than leaving the last write's warning lying about for the next one to find.
  perform set_config('custom.stage_rule_warnings',
                     case when v_warned = '[]'::jsonb then '' else v_warned::text end, true);

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


-- ───────────────────────────────────────────────────────────────────────────────────────
-- A GATE, DECLARED. The twin of custom._pipeline_rule, carrying the one thing that one
-- cannot carry: `on_fail`. It is a separate name rather than a defaulted argument on
-- purpose — an eleventh argument with a default would have made the existing ten-argument
-- call ambiguous, and an ambiguous call is resolved at run time on somebody else's board.
create or replace function custom._pipeline_gate(p_organization_id uuid, p_table_id uuid,
                                                 p_kind text, p_stage text, p_name text,
                                                 p_message text, p_expr jsonb, p_sort integer,
                                                 p_on_fail text)
  returns uuid language plpgsql set search_path = pg_catalog as $fn$
declare
  v_spec jsonb;
  v_id   uuid;
begin
  v_spec := jsonb_build_object(
    'name', p_name, 'message', p_message, 'kind', 'predicate',
    'uses', jsonb_build_array('validate'), 'scope_table_id', p_table_id,
    'applies_to_types', '[]'::jsonb,
    'expr', p_expr, 'sort', p_sort,
    'on_fail', coalesce(nullif(lower(btrim(p_on_fail)), ''), 'refuse'),
    'pipeline', jsonb_build_object('kind', p_kind, 'stage', p_stage, 'stage_field_of', p_table_id));
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

-- ───────────────────────────────────────────────────────────────────────────────────────
-- WHAT IS WAITING ON THIS CARD. The Kanban and the record page both need to say "this move
-- is waiting for somebody", and neither can ask the approvals queue a question shaped like
-- "about this record's stage" without this. It answers the pending approvals whose change
-- would write this table's OWN stage column, and nothing else in the queue.
create or replace function custom.record_stage_pending(p_organization_id uuid, p_record_id uuid)
  returns jsonb language plpgsql stable security definer set search_path = pg_catalog as $fn$
declare
  v_row custom.record;
  v_key text;
  v_out jsonb;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.record_stage_pending');
  perform custom.assert_client_may_open(p_organization_id, p_record_id,
                                        'custom.record_stage_pending',
                                        'viewer'::public.permission_level, 'record');
  select * into v_row from custom.record
   where organization_id = p_organization_id and id = p_record_id and deleted_at is null;
  if v_row.id is null then
    return '[]'::jsonb;
  end if;
  v_key := custom._stage_field_key(p_organization_id, v_row.table_id);
  if v_key is null then
    return '[]'::jsonb;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'approval_id',  a.id,
           'to',           a.data #>> array['change', 'patch', v_key],
           'why',          a.data ->> 'note',
           'requested_at', a.data ->> 'requested_at',
           'state',        coalesce(a.data ->> 'state', 'pending')) order by a.created_at), '[]'::jsonb)
    into v_out
    from custom.record a
   where a.organization_id = p_organization_id
     and a.data_class = 'work_approval'
     and a.deleted_at is null
     and coalesce(a.data ->> 'state', 'pending') = 'pending'
     and nullif(a.data ->> 'subject_id', '')::uuid = p_record_id
     and a.data #> array['change', 'patch', v_key] is not null;
  return v_out;
end;
$fn$;

-- ───────────────────────────────────────────────────────────────────────────────────────
-- WHETHER THIS CARD MAY GO TO THAT COLUMN — and, when it may not, WHAT HAPPENS INSTEAD.
-- The same Rules, through the same evaluator, BEFORE the finger lets go. What is new is
-- that the answer distinguishes the three outcomes a gate can produce, and that a gate the
-- organization's knob would overrule no longer masquerades as a refusal.
--
-- A HARD REFUSAL WINS. The loop no longer returns on the first failure: a stage can carry a
-- gate that asks for approval AND a gate that plainly refuses, and telling somebody "this
-- is going for approval" when a second gate would refuse it anyway is a lie with a delay in
-- it. Refusals are collected, the hardest answer is the one given, and the refusal order
-- PIPELINES established (where it can go, who may move it, how many fit, what the stage
-- needs, then the gates) is preserved by the Rules' own sort.
create or replace function custom.pipeline_transition_refusal(p_organization_id uuid,
                                                              p_record_id uuid, p_to text)
  returns jsonb language plpgsql stable security definer set search_path = pg_catalog as $fn$
declare
  v_row      custom.record;
  v_key      text;
  v_fid      uuid;
  v_skey     text;
  v_doc      jsonb;
  v_ctx      jsonb;
  v_me       uuid;
  v_level    public.permission_level;
  v_type     text;
  v_rtype    text;
  r          custom.record;
  v_run      jsonb;
  v_missing  jsonb := '[]'::jsonb;
  v_one      jsonb;
  v_fail     text;
  v_enforce  text;
  v_refusal  jsonb;
  v_approval jsonb;
  v_warned   jsonb := '[]'::jsonb;
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
    return jsonb_build_object('allowed', false, 'is_pipeline', false, 'outcome', 'refused',
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
  v_enforce := custom.stage_rule_enforcement(p_organization_id);

  for r in select * from custom.table_rules(p_organization_id, v_row.table_id, 'validate', v_rtype) loop
    v_run := custom.rule_run(p_organization_id, r.id, v_doc, v_ctx);
    if custom.rule_truth(v_run -> 'answer') is false then
      v_fail := lower(coalesce(nullif(r.data ->> 'on_fail', ''), 'refuse'));
      v_missing := '[]'::jsonb;
      -- WHICH COLUMNS ARE EMPTY, said as columns and not as a regular expression. A screen
      -- that can name them can OFFER them, which is what "a stage's required fields prompt
      -- on entry" means.
      if r.data #>> '{pipeline,kind}' = 'requires' or r.data #>> '{pipeline,kind}' like 'gate:%' then
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

      v_refusal := jsonb_build_object(
        'to',           v_skey,
        'why',          coalesce(nullif(r.data ->> 'message', ''), r.data ->> 'name'),
        'rule',         r.data ->> 'name',
        'rule_id',      r.id,
        'rule_version', r.version,
        'kind',         r.data #>> '{pipeline,kind}',
        'on_fail',      v_fail,
        'missing',      v_missing);

      if v_fail = 'require_approval' then
        -- Remembered, not returned yet: a plain refusal further down the list outranks it.
        if v_approval is null then v_approval := v_refusal; end if;
      elsif v_enforce = 'warn' then
        v_warned := v_warned || v_refusal;
      else
        return v_refusal || jsonb_build_object(
          'allowed', false, 'is_pipeline', true, 'outcome', 'refused',
          'enforcement', v_enforce,
          'pending', custom.record_stage_pending(p_organization_id, p_record_id));
      end if;
    end if;
  end loop;

  if v_approval is not null then
    return v_approval || jsonb_build_object(
      'allowed', false, 'is_pipeline', true, 'outcome', 'needs_approval',
      'enforcement', v_enforce,
      'what_happens', 'Moving it will ask the people who can approve this, and leave it where it is until one of them answers.',
      'pending', custom.record_stage_pending(p_organization_id, p_record_id));
  end if;

  return jsonb_build_object(
    'allowed',     true,
    'is_pipeline', true,
    'to',          v_skey,
    'outcome',     case when v_warned = '[]'::jsonb then 'allowed' else 'warned' end,
    'enforcement', v_enforce,
    'warnings',    v_warned,
    'why',         case when v_warned = '[]'::jsonb
                        then 'Nothing stands in the way of this move.'
                        else v_warned -> 0 ->> 'why' end,
    'pending',     custom.record_stage_pending(p_organization_id, p_record_id));
end;
$fn$;

-- ───────────────────────────────────────────────────────────────────────────────────────
-- THE MOVE ITSELF. Still an ORDINARY record write — the validators, the choice normaliser,
-- the history capture and the entry effects all run, and this is convenience rather than a
-- second write path. What is new is the two answers a write can now come back with.
--
-- THE ANSWER IS AN OBJECT, ALWAYS. It used to be the new version number. A door that
-- answers a number on one path and an object on another makes every caller guess, and the
-- caller that guesses wrong reports a successful move that never happened.
create or replace function custom.pipeline_move(p_organization_id uuid, p_record_id uuid,
                                                p_to text, p_also jsonb default '{}'::jsonb,
                                                p_expected_version integer default null)
  returns jsonb language plpgsql security definer set search_path = pg_catalog as $fn$
declare
  v_row      custom.record;
  v_key      text;
  v_fid      uuid;
  v_skey     text;
  v_patch    jsonb;
  v_version  integer;
  v_msg      text;
  v_detail   text;
  v_filed    jsonb;
  v_warn     text;
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
  v_patch := coalesce(p_also, '{}'::jsonb) || jsonb_build_object(v_key, v_skey);

  perform set_config('custom.stage_rule_warnings', '', true);
  begin
    v_version := custom.record_update(p_organization_id, p_record_id, v_patch, p_expected_version);
  exception when sqlstate 'PT428' then
    -- A GATE THAT ASKS FOR APPROVAL RATHER THAN REFUSING. Nothing was written — the failed
    -- write rolled back to this block — so the record is still exactly where it was, which
    -- is what "leaves the record in place" has to mean for it to be worth saying.
    get stacked diagnostics v_msg = message_text, v_detail = pg_exception_detail;
    v_filed := custom.work_approval_request(
                 p_organization_id, p_record_id,
                 jsonb_build_object('kind', 'record_patch', 'patch', v_patch),
                 v_msg, null, 'person', null);
    return jsonb_build_object(
      'applied',          false,
      'moved',            false,
      'outcome',          'needs_approval',
      'to',               v_skey,
      'why',              v_msg,
      'rule',             (v_detail::jsonb) ->> 'rule',
      'rule_id',          (v_detail::jsonb) ->> 'rule_id',
      'approval_id',      v_filed ->> 'approval_id',
      'approvers',        v_filed -> 'approvers',
      'what_happens',     format('%s It is still where it was, and %s',
                                 v_msg, lower(v_filed ->> 'message')),
      'version',          v_row.version);
  end;

  v_warn := nullif(current_setting('custom.stage_rule_warnings', true), '');
  return jsonb_build_object(
    'applied',  true,
    'moved',    true,
    'outcome',  case when v_warn is null then 'moved' else 'moved_with_warnings' end,
    'to',       v_skey,
    'version',  v_version,
    'warnings', coalesce(v_warn::jsonb, '[]'::jsonb));
end;
$fn$;

-- ───────────────────────────────────────────────────────────────────────────────────────
-- THE DOORS. Declared BEFORE the grants — a function in a closed schema with no
-- `platform.client_callable_door` row has its client EXECUTE taken straight back inside the
-- same transaction, with the run still reporting success (the trap WORK-DOORS paid for).
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes,
   signed_in_callers, anonymous_callers, declared_by, reason)
select 'custom', v.fn, iam.door_identity_args(p.oid), platform.door_argtypes(p.proargtypes),
       true, false,
       'migrations/campaign/stagerules_a_gate_says_what_it_does_when_it_says_no.sql (lane STAGE-RULES)',
       v.why
  from (values
    ('stage_rule_on_fail_kinds',
     'The closed list of what a stage gate does when it stops something — refuse, or hand it to the approvals queue. A screen offering a third answer would be offering something no Rule can carry.'),
    ('stage_rule_enforcement',
     'Whether this organization''s stage gates refuse or warn. The screen that explains a refusal and the store that made it have to give a person the same answer, and two implementations of one opinion drift.'),
    ('record_stage_pending',
     'What is waiting on this card: the approvals filed against this record''s own stage column that nobody has decided yet, so a board can say "waiting for somebody" instead of showing a card that silently did not move.')
  ) as v(fn, why)
  join pg_proc p on p.proname = v.fn and p.pronamespace = 'custom'::regnamespace
 where not exists (select 1 from platform.client_callable_door d
                    where d.schema_name = 'custom' and d.function_name = v.fn
                      and d.identity_argtypes = platform.door_argtypes(p.proargtypes));

grant execute on function custom.stage_rule_on_fail_kinds() to authenticated;
grant execute on function custom.stage_rule_enforcement(uuid) to authenticated;
grant execute on function custom.record_stage_pending(uuid, uuid) to authenticated;


-- ───────────────────────────────────────────────────────────────────────────────────────
-- DECLARING A PIPELINE LEARNS GATES.
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
  v_gates      jsonb;
  v_gate_n     integer;
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

    -- ── STAGE-RULES: THE GATES ON THIS STAGE, WRITTEN AS CONDITIONS. ────────────────
    -- `requires`, `who` and `limits` above are the three policies common enough to deserve
    -- sugar. A GATE is the general form underneath them, and it is what the condition
    -- builder on the stage settings screen writes: a sentence a person reads, a condition
    -- that says WHEN the gate is about this record at all, a condition that says what it
    -- DEMANDS, and what happens when the demand is not met.
    --
    --   {"name": "A second quote before a big one is approved",
    --    "message": "Nothing over $5,000 moves to Approved without a second quote from a different contractor.",
    --    "when":    <a condition, or nothing at all for "always">,
    --    "demands": <a condition that has to hold>,
    --    "on_fail": "refuse" | "require_approval"}
    --
    -- The Rule it becomes says: it is not arriving here, OR it is not moving at all, OR the
    -- gate is not about this record, OR the gate's demand holds. That shape is why editing
    -- the price of a deal already sitting in Approved is not a move and is never judged.
    v_gates := coalesce(p_spec -> 'gates' -> v_stage, p_spec -> 'gates' -> v_skey);
    if jsonb_typeof(v_gates) = 'array' and jsonb_array_length(v_gates) > 0 then
      v_gate_n := 0;
      for v_one in select t from jsonb_array_elements(v_gates) t loop
        v_gate_n := v_gate_n + 1;
        if jsonb_typeof(v_one -> 'demands') <> 'object' then
          raise exception 'a gate on % has to say what it demands before a % may get there',
                          v_stage, v_noun
            using errcode = '22004',
                  hint = 'gates: {"<stage>": [{"name":…,"message":…,"when":<condition or nothing>,"demands":<condition>,"on_fail":"refuse"|"require_approval"}]}.';
        end if;
        if nullif(v_one ->> 'message', '') is null then
          raise exception 'a gate on % has to carry the sentence a person reads when it stops them', v_stage
            using errcode = '22004',
                  hint = 'A refusal with no words is a dead end. Write the sentence the way you would say it out loud.';
        end if;
        v_arms := jsonb_build_array(
          -- It is not arriving in this stage at all.
          jsonb_build_object('op', 'ne', 'args', jsonb_build_array(
            jsonb_build_object('field', v_field_id), jsonb_build_object('const', to_jsonb(v_skey)))),
          -- It is already here and this write is not a move.
          jsonb_build_object('op', 'eq', 'args', jsonb_build_array(
            jsonb_build_object('field', v_field_id),
            jsonb_build_object('op', 'previous', 'field', v_field_id))));
        if jsonb_typeof(v_one -> 'when') = 'object' then
          v_arms := v_arms || jsonb_build_object('op', 'not', 'args',
                                jsonb_build_array(v_one -> 'when'));
        end if;
        v_arms := v_arms || (v_one -> 'demands');
        v_rule_ids := v_rule_ids || jsonb_build_object(
          'gate:' || v_skey || ':' || v_gate_n,
          custom._pipeline_gate(p_organization_id, p_table_id, 'gate:' || v_gate_n, v_skey,
            coalesce(nullif(v_one ->> 'name', ''),
                     format('What a %s needs before it reaches %s', v_noun, v_stage)),
            v_one ->> 'message',
            jsonb_build_object('op', 'or', 'args', v_arms),
            45 + v_gate_n,
            coalesce(nullif(lower(v_one ->> 'on_fail'), ''), 'refuse')));
        v_made := v_made || to_jsonb(format('%s: %s', v_stage, v_one ->> 'message'));
      end loop;
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


-- ───────────────────────────────────────────────────────────────────────────────────────
-- APPLYING AN APPROVED CHANGE NAMES THE RECORD IT IS APPLYING IT TO.
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
      -- STAGE-RULES: THE GATE THAT ASKED FOR THIS APPROVAL STEPS ASIDE FOR THIS ONE WRITE.
      -- A stage gate whose on_fail is `require_approval` refuses the write by raising, which
      -- is HOW this change got into the queue at all. Applying the yes has to get past the
      -- same gate, and it gets past it by NAMING THE RECORD it is applying an approved
      -- change to, for the length of that one statement and no longer. Every plain refusal,
      -- every other validator and the whole value envelope still run, so an approver is
      -- never told yes over a write the store itself would refuse.
      perform set_config('custom.applying_approval_for', v_subject::text, true);
      v_version := custom.record_update(p_organization_id, v_subject, v_change -> 'patch', null);
      perform set_config('custom.applying_approval_for', '', true);
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
