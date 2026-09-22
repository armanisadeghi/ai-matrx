-- additive: yes
-- guard: custom/system_enabled
--
-- chair-step: it REPLACES one live function, `custom.rule_eval`, the store's one expression
--   evaluator. Nothing is dropped, renamed or revoked; the signature is identical; one new
--   function (`custom.field_words`) is added beside it and is granted to nobody. Exactly one
--   arm of the evaluator changes — `concat` — and every comparison arm is byte-for-byte the
--   one that is live now. The inverse is
--   migrations/inverse/storetails2_a_joined_column_prints_the_words_a_person_reads_down.sql.
--
-- LANE STORE-TAILS-2 — VERIFIER-11 finding F5 (MEDIUM).
--
-- WHAT A PERSON SAW. Greenline Landscaping Crew's Jobs table, "Job label" added as a
-- worked-out column joining Job Number and Service Type. Every one of the 35 rows computed,
-- followed a write and survived a reload — and read:
--
--   GL-2034mow_edge   ·   GL-2033irrigation_repair   ·   GL-2032install
--
-- `GL-2034` is words somebody typed. `mow_edge` is the OPTION KEY the store keeps for the
-- choice whose label, in the cell immediately to the right, reads `Mow & Edge`. And there is
-- no separator, because nothing ever asked for one.
--
-- THE CLASS, NOT THE INSTANCE (law 3). This is F8's class — the machine's word on a screen a
-- person reads — in the one place F8's fix did not reach, and it is not a formula bug. Every
-- leaf of `custom.rule_eval` answers a STORED value, which is right: a choice is stored as its
-- option key so that renaming "Mow & Edge" never changes what a rule decided, and a relation
-- is stored as a row id so that renaming the record it points at never breaks the link. What
-- is wrong is that ONE node — `concat` — takes those stored values and hands them to a person
-- to read. So the fix is at that node and nowhere else:
--
--   * `concat` resolves a `field` / `parent_field` argument to its DISPLAY WORDS.
--   * every comparison — eq, ne, lt, lte, gt, gte, matches, and the arithmetic — keeps the
--     stored value, untouched. A gate that compared labels would start deciding differently
--     the day somebody renamed an option, silently, which is the defect this store exists to
--     not have.
--
-- ONE RESOLVER, NOT A SECOND LOOKUP (law 5 — primitives first). `custom.field_words` is the
-- single place that turns a stored value into words, and it does not know how to do it itself:
--
--   * a choice (`type = 'list'`) goes through `custom.choice_options`, the one reader of an
--     options Table — so a RETIRED option still reads as its label rather than vanishing,
--     because that reader already keeps retired rows for exactly this reason;
--   * a relation goes through `custom._words_for` carrying the Field's own `display` block —
--     the SAME primitive `custom.relation_words_many` and `custom.record_words` call, so the
--     columns and separator a person chose in the reference builder are honoured here, and the
--     visibility ladder inside it answers `platform.relation_withheld_label()` for a record
--     this caller may not see. A formula is not a way around the ladder.
--   * anything else answers exactly what it answered before.
--
-- THE SEPARATOR. `{"op":"concat","args":[…],"separator":" — "}`. Absent means the empty string,
-- which is what every formula written before today does, so nothing already saved changes its
-- answer. An argument that resolves to nothing brings no separator with it — otherwise a blank
-- middle column, which used to be invisible, would start printing a dangling ` — `.
--
-- WHAT MAKES IT FAIL (law 3): the RED twin `scripts/campaign-tests/storetails2_red.sql` asserts
-- the OLD behaviour — that a joined choice prints its key and that `separator` is ignored — and
-- goes green only when this file is reversed.
--
-- ITS PROOF is `scripts/campaign-tests/storetails2_green.sql`.

-- based-on: custom.rule_eval(uuid, jsonb, jsonb, jsonb) a3a8971b1a6152b8902a29750c74de0d72e97ce82c35146db07fbf7f174049a7

set lock_timeout = '5s';
set statement_timeout = '300s';

-- ═════════════════════════════════════════════════════════════════════════════
-- 1. THE ONE RESOLVER: a stored value, in the words a person reads.
-- ═════════════════════════════════════════════════════════════════════════════
create or replace function custom.field_words(p_organization_id uuid, p_field_id uuid, p_value jsonb)
returns text
language plpgsql
stable
set search_path to 'pg_catalog'
as $fn$
declare
  v_f     jsonb;
  v_type  text;
  v_opts  jsonb;
  v_one   jsonb;
  v_tok   text;
  v_word  text;
  v_parts text[] := '{}'::text[];
  k_uuid  constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
begin
  if p_value is null or jsonb_typeof(p_value) = 'null' then
    return null;
  end if;
  if p_field_id is null then
    return p_value #>> '{}';
  end if;

  select f.data into v_f
    from custom.record f
   where f.organization_id = p_organization_id
     and f.id = p_field_id
     and f.table_id = custom.field_kernel_id()
     and f.deleted_at is null;
  -- A Field that is not there any more is REC-18's business, and custom.rule_eval has already
  -- refused by name before this function is ever reached. Answering the stored value here is
  -- the honest fallback for every other caller, not a way of hiding that.
  if v_f is null then
    return p_value #>> '{}';
  end if;

  v_type := v_f ->> 'type';

  if v_type = 'list' then
    v_opts := custom.choice_options(p_organization_id,
                nullif(v_f -> 'config' ->> 'options_table_id', '')::uuid);
  elsif v_type <> 'relation' then
    -- Words somebody typed, a number, a date, a yes/no: already the thing to print.
    if jsonb_typeof(p_value) <> 'array' then
      return p_value #>> '{}';
    end if;
  end if;

  -- ONE VALUE OR MANY, THE SAME WAY. A column that can hold more than one stores an array, and
  -- a person reads them joined by a comma — never a JSON array printed as text.
  for v_one in
    select e from jsonb_array_elements(
      case when jsonb_typeof(p_value) = 'array' then p_value else jsonb_build_array(p_value) end) e
  loop
    if v_one is null or jsonb_typeof(v_one) = 'null' then
      continue;
    end if;
    v_tok  := v_one #>> '{}';
    v_word := null;

    if v_type = 'list' then
      -- The option key first, because that is what the store keeps. An id is accepted too:
      -- some older documents hold the option RECORD's id, and printing that would be the
      -- very defect this file exists to end.
      v_word := coalesce(v_opts -> v_tok ->> 'label',
                         (select o.value ->> 'label'
                            from jsonb_each(coalesce(v_opts, '{}'::jsonb)) o
                           where o.value ->> 'id' = v_tok
                           limit 1));
    elsif v_type = 'relation' and v_tok ~ k_uuid then
      -- THE RELATION DISPLAY PRIMITIVE, called the way every other relation surface calls it.
      v_word := custom._words_for(p_organization_id, v_tok::uuid,
                                  v_f -> 'display', null, 0);
    end if;

    v_word := coalesce(nullif(btrim(coalesce(v_word, '')), ''), v_tok);
    if nullif(btrim(coalesce(v_word, '')), '') is not null then
      v_parts := v_parts || v_word;
    end if;
  end loop;

  if array_length(v_parts, 1) is null then
    return null;
  end if;
  return array_to_string(v_parts, ', ');
end;
$fn$;

comment on function custom.field_words(uuid, uuid, jsonb) is
  'F5 (VERIFIER-11): ONE resolver from a stored value to the words a person reads. A choice '
  'resolves through custom.choice_options (so a retired option still reads as its label); a '
  'relation through custom._words_for carrying the Field''s own display block — the same '
  'primitive custom.relation_words_many and custom.record_words call, with the same visibility '
  'ladder inside it. Everything else answers what it already held. A column holding many values '
  'answers them joined by a comma. This NEVER decides anything: comparisons keep stored values, '
  'because a gate that compared labels would start deciding differently the day somebody renamed '
  'an option.';

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
$function$

;

comment on function custom.rule_eval(uuid, jsonb, jsonb, jsonb) is
  'REC-15''s one expression evaluator. Every leaf answers the STORED value — that is what a '
  'rule must compare, because a comparison against a label changes its mind when somebody '
  'renames an option. The single exception is `concat`, whose answer is read by a person and '
  'never compared: it resolves a field / parent_field argument through custom.field_words and '
  'takes an optional `separator` (absent means the empty string, so nothing saved before today '
  'changes its answer). VERIFIER-11 F5: a worked-out column read GL-2034mow_edge beside a cell '
  'reading "Mow & Edge".';
