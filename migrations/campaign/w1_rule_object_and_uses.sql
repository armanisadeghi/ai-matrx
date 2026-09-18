-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
--
-- W1-RULE — the ONE Rule object, its versions, and two of its four uses: validate and
-- compute. (REC-15, REC-17, REC-19.)
--
-- THE RULING THIS FILE EXECUTES (build log, 2026-09-17, by the same reading `W1-TABLE`
-- recorded at 12:06 UTC and `W1-FIELD` at 16:12 UTC)
-- ----------------------------------------------------------------------------------------
-- (a) A RULE IS A RECORD. `custom.rule` is a `security_invoker = true` PROJECTION over
--     `custom.record` — the records whose `table_id` is the kernel `Rule` record
--     (`11111111-0000-4000-8000-000000000003`, written by `W1-STORE`) — and this lane
--     creates NO relation, adds NO column to `custom.record` and touches NO index. REC-25
--     is law and is already built, so a second physical `custom.rule` would make every Rule
--     exist twice with nothing keeping the two equal.
--
-- (b) A RULE IS SCOPED TO A TABLE AND NAMES ITS FIELDS BY ID — never attached to one Field
--     by that Field's `rules` array. Two reasons, both measurable on this branch. First,
--     REC-17: the inline stand-in `W1-FIELD` shipped writes a cross-field constraint as
--     `{"kind":"equals_field","value":"height"}` — the OTHER FIELD BY NAME, which is the
--     exact shape REC-17 forbids; a Rule row stores `{"field":"<uuid>"}` and resolves the
--     key at evaluation time. Second, REC-15: one object serving four uses cannot hang off
--     one Field, because membership and applicability speak about a RECORD, not about a
--     column. `custom._field_shape_guard` refuses any inline rule whose `kind` is outside
--     its six literal kinds, naming W1-RULE — so the two representations cannot be confused
--     for one another and neither can silently swallow the other's work.
--
-- (c) THE FOUR USES ARE ONE EVALUATION. `custom.rule_run()` is the ONE body all four uses
--     call: it resolves the Rule row, evaluates its `expr` once through `custom.rule_eval()`
--     and returns the answer WITH the Rule's id and the version that produced it. The uses
--     differ only in what they do with that answer:
--       validate       — a `false` answer refuses the write, naming the Rule and the Fields
--       compute        — the answer IS the Value, written with its Rule id and version
--       membership     — the answer's truth selects the record into the set   (W1-RULE-APPLY)
--       applicability  — the answer's truth decides whether the thing applies (W1-RULE-APPLY)
--     A USE MAY SPEAK ABOUT FEWER KINDS OF RECORD THAN THE RULE DOES, and `use_types` is
--     where it says so. T8 is why the key exists rather than being an idea: the same truth
--     about width and height is WORKED OUT for every quadrilateral and ENFORCED on a square
--     alone. Without it one expression could serve only one of the two jobs and the answer
--     would have been a second Rule with nothing keeping it equal to the first — which is
--     the very thing REC-15 exists to prevent.
--
--     THIS LANE WIRES validate AND compute. The membership and applicability uses, the
--     ordered/first-match Resolver, the `parent_field` node and the save-time cycle refusal
--     are `W1-RULE-APPLY`'s (REC-16, DYN-6) and are NOT claimed here — `parent_field` is
--     admitted by the shape guard as a declared node and REFUSED BY NAME by the evaluator
--     with W1-RULE-APPLY as the remedy, so an applicability Rule can be stored tonight and
--     nothing about it fails silently.
--
-- (d) REC-19 — THE VERSION IS THE STORE'S OWN. `custom.record.version` is a certified column
--     of the store and `platform._touch_row` — the platform's own standard trigger, already
--     on `custom.record` — increments it on every UPDATE. So a Rule has versions with no
--     second mechanism and no column of this lane's, `custom.rule.version` projects it, and
--     `custom.rule_version()` reads it for a caller that holds only the id. The version that
--     produced a Value is RECORDED: the compute use writes
--       data -> '_computed' -> <field key> = {value, field_id, rule_id, rule_version, at}
--     which is what `W3-HIST` stamps its History row from. That block is a STAND-IN for
--     History and says so — the same stand-in `W1-FIELD` made for `_retired`, announced with
--     its remedy rather than left to be discovered.
--
-- WHY THE COMPUTED VALUE IS NOT WRITTEN AT THE FIELD'S OWN KEY, said plainly. `W1-FIELD`'s
-- validator refuses a `formula` value that arrives in the document — FLD-9, "it is worked
-- out by the system, so it cannot be typed in". A computed value written at the key would be
-- indistinguishable from a typed one on the next UPDATE, so either the refusal has to be
-- weakened (silently admitting hand-typed formula values) or every update of a record that
-- already carries a computed value fails. Both are the silent direction. The `_computed`
-- block keeps the two apart, and `custom.record_values()` is the ONE reader that merges them,
-- so no consumer has to know.
--
-- AND A WORKED-OUT ANSWER THAT NO RULE WORKS OUT IS NEITHER KEPT NOR DROPPED IN SILENCE.
-- The two ways one can appear are told apart, because treating them alike breaks T8: an
-- answer that was ALREADY there and whose Rule has stopped applying — a square retyped to a
-- circle — is RETIRED into `data -> '_retired'` with its reason, its Rule and the version
-- that produced it, which is where `W1-FIELD` already moves a Value that stopped applying;
-- an answer that ARRIVED IN THIS WRITE is a forged provenance, a value wearing a Rule's name
-- and version that `custom.record_values()` would then serve as the system's own, and it is
-- REFUSED BY NAME. Refusing both would make the retype impossible; accepting both would let
-- anybody sign a value with a Rule's name.
--
-- WHAT EACH LAW BECOMES
-- ---------------------
--   REC-15  one object, four uses — `custom.rule.uses` is a non-empty subset of the closed
--           four, `custom.rule_run()` is the one evaluation, and the seeded Rule
--           `11111111-0004-4000-8000-000000000101` declares ALL FOUR against ONE expression.
--   REC-17  a Rule references Fields by id, never by name — `{"field":"<uuid>"}` is the only
--           way to reach a Field, every id is checked against a live Field of the scope Table
--           at save time, and `{"field_name":…}` / `{"field_key":…}` / `{"field":"width"}`
--           are REFUSED BY NAME citing REC-17. Referencing by name is unrepresentable here,
--           not merely discouraged.
--   REC-19  Rules have versions and the version that produced a Value is recorded — see (d).
--
-- WHERE THE EXIT'S PRODUCTION QUERY LANDS, said plainly so nobody has to guess:
--   select id, version, kind from custom.rule
--    where id = '11111111-0004-4000-8000-000000000101'
--   returns the Rule THIS FILE stored, with its version. It cannot answer before this file
--   runs, which is rule 14: a positive, not an absence.
--
-- WHY NOTHING HERE IS A GRANT. Schema `custom` is revoked from PUBLIC, anon, authenticated
-- and service_role (default privileges included), is absent from `pgrst.db_schemas`, and
-- `custom/system_enabled` resolves false on both databases. Every function below is SECURITY
-- INVOKER and carries no GRANT, so `custom.record_write` (DOOR-N-1) remains the one door.
-- Every trigger this file creates is on a table IN schema `custom` — it puts no trigger on
-- any live table anywhere else.
--
-- IDEMPOTENCE, STATED HONESTLY. §6b.2's allow-list admits `CREATE VIEW`, `CREATE TRIGGER`
-- and `CREATE FUNCTION` and refuses `CREATE OR REPLACE` of a view or a trigger, and
-- PostgreSQL has no `IF NOT EXISTS` for any of the three. So a second consecutive apply of
-- these bytes is refused BY THE DATABASE (42P07 / 42710 / 42723) and changes nothing,
-- exactly as `W1-STORE`'s, `W1-PROV`'s, `W1-TABLE`'s and `W1-FIELD`'s files do. Rule 27's
-- loop is up → inverse → `--reapply`. Every seeded ROW is `on conflict do nothing`, so the
-- data half is idempotent on its own.
--
-- THE INVERSE: `migrations/inverse/w1_rule_object_and_uses_down.sql` (§4.13).

set lock_timeout = '5s';
set statement_timeout = '300s';

-- ══════════════════════════════════════════════════════════════════════════════
-- 1. The kernel id and the two closed vocabularies, in code
-- ══════════════════════════════════════════════════════════════════════════════

create function custom.rule_kernel_id() returns uuid
  language sql immutable parallel safe
  set search_path to 'pg_catalog'
as $fn_rule_kernel_id$
  select '11111111-0000-4000-8000-000000000003'::uuid;
$fn_rule_kernel_id$;

comment on function custom.rule_kernel_id() is
  'REC-25 / REC-27 / REC-15: the id of the kernel `Rule` record in custom.record, written by W1-STORE''s w1_store_kernel_tables.sql. A record whose table_id is this id IS a Rule.';

create function custom.rule_uses() returns text[]
  language sql immutable parallel safe
  set search_path to 'pg_catalog'
as $fn_rule_uses$
  select array['validate', 'compute', 'membership', 'applicability']::text[];
$fn_rule_uses$;

comment on function custom.rule_uses() is
  'REC-15: the FOUR uses of the one Rule object, as a closed set in code rather than a convention in prose. A Rule declares a non-empty subset; W1-RULE wires validate and compute, W1-RULE-APPLY wires membership and applicability, and a fifth use is a contract change, not a data value.';

create function custom.rule_node_kinds() returns table (node text, evaluated_by text, note text)
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

comment on function custom.rule_node_kinds() is
  'The CLOSED vocabulary of Rule expression nodes and, for each, the lane that evaluates it. It is a function rather than a sentence so that "which nodes work" is a query: a node outside this list is refused by name at save time, and a node inside it that this lane does not evaluate is refused by name at evaluation WITH the lane that owns it. Nothing about a Rule fails silently.';

-- ══════════════════════════════════════════════════════════════════════════════
-- 2. REC-17 — a Field is reached by ID, and the key is resolved at evaluation
-- ══════════════════════════════════════════════════════════════════════════════

create function custom.rule_field_key(p_organization_id uuid, p_field_id uuid)
  returns text
  language sql stable
  set search_path to 'pg_catalog'
as $fn_rule_field_key$
  select f.data ->> 'key'
    from custom.record f
   where f.organization_id = p_organization_id
     and f.id = p_field_id
     and f.table_id = custom.field_kernel_id()
     and f.deleted_at is null;
$fn_rule_field_key$;

comment on function custom.rule_field_key(uuid, uuid) is
  'REC-17: THE mechanism. A Rule stores a Field''s ID; this body resolves the CURRENT key every time the Rule is evaluated, so renaming the Field leaves the Rule resolving. A Rule that had stored the name would be resolving a string nothing points at.';

create function custom.rule_field_label(p_organization_id uuid, p_field_id uuid)
  returns text
  language sql stable
  set search_path to 'pg_catalog'
as $fn_rule_field_label$
  select coalesce(nullif(f.data ->> 'label', ''), f.data ->> 'key', p_field_id::text)
    from custom.record f
   where f.organization_id = p_organization_id
     and f.id = p_field_id
     and f.table_id = custom.field_kernel_id()
     and f.deleted_at is null;
$fn_rule_field_label$;

comment on function custom.rule_field_label(uuid, uuid) is
  'REC-17: what a person reads when a Rule refuses their write. Resolved from the Field ROW at refusal time, so the message carries the field''s CURRENT name — the visible half of "by id, never by name".';

create function custom.rule_version(p_organization_id uuid, p_rule_id uuid)
  returns integer
  language sql stable
  set search_path to 'pg_catalog'
as $fn_rule_version$
  select r.version
    from custom.record r
   where r.organization_id = p_organization_id
     and r.id = p_rule_id
     and r.table_id = custom.rule_kernel_id()
     and r.deleted_at is null;
$fn_rule_version$;

comment on function custom.rule_version(uuid, uuid) is
  'REC-19: the version of a Rule, for a caller holding only its id. It is custom.record.version — the store''s own certified column, incremented by platform._touch_row on every UPDATE — never a second counter this lane invented.';

-- ══════════════════════════════════════════════════════════════════════════════
-- 3. REC-15 (c) — the ONE evaluator
-- ══════════════════════════════════════════════════════════════════════════════

create function custom.rule_eval(p_organization_id uuid, p_expr jsonb,
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

comment on function custom.rule_eval(uuid, jsonb, jsonb, jsonb) is
  'REC-15 / REC-17: the ONE body that works out what a Rule says, over a record''s Values. Field leaves are FIELD IDS resolved to their current key at evaluation time (REC-17); a name leaf is refused by name; a node the vocabulary does not carry is refused rather than ignored; an absent Value makes the answer UNDECIDED rather than false. The four uses differ in what they do with the answer, never in how the answer is reached.';

create function custom.rule_truth(p_answer jsonb) returns boolean
  language sql immutable parallel safe
  set search_path to 'pg_catalog'
as $fn_rule_truth$
  select case
           when p_answer is null then null
           when jsonb_typeof(p_answer) = 'null' then null
           when jsonb_typeof(p_answer) = 'boolean' then (p_answer #>> '{}')::boolean
           else null
         end;
$fn_rule_truth$;

comment on function custom.rule_truth(jsonb) is
  'REC-15: the ONE reading of a Rule answer as a truth, shared by all four uses. THREE outcomes, not two: true, false, and UNDECIDED (null) when the answer is absent or is not a truth at all. A use that treated undecided as false would refuse writes nobody got wrong, and one that treated it as true would let them all through.';

-- ══════════════════════════════════════════════════════════════════════════════
-- 4. REC-15 / REC-19 — one row, one evaluation, WITH the version that produced it
-- ══════════════════════════════════════════════════════════════════════════════

create function custom.rule_run(p_organization_id uuid, p_rule_id uuid,
                                p_values jsonb, p_context jsonb default '{}'::jsonb)
  returns jsonb
  language plpgsql stable
  set search_path to 'pg_catalog'
as $fn_rule_run$
declare
  r custom.record;
begin
  select * into r
    from custom.record
   where organization_id = p_organization_id
     and id = p_rule_id
     and table_id = custom.rule_kernel_id()
     and deleted_at is null;
  if r.id is null then
    raise exception 'that rule is not there'
      using errcode = '23503',
            hint = 'REC-15: a Rule is a Record of the kernel Table `Rule`. custom.rule is the surface that lists them.';
  end if;
  return jsonb_build_object(
    'rule_id',      r.id,
    'rule_version', r.version,
    'rule_name',    r.data ->> 'name',
    'kind',         r.data ->> 'kind',
    'answer',       custom.rule_eval(p_organization_id, r.data -> 'expr', p_values, p_context));
end;
$fn_rule_run$;

comment on function custom.rule_run(uuid, uuid, jsonb, jsonb) is
  'REC-15 and REC-19 in ONE body: the four uses all reach a Rule through here, and what comes back carries the Rule''s id and THE VERSION THAT PRODUCED THE ANSWER. That is what makes REC-19 recordable rather than merely available — the version travels with the answer instead of being fetched again later, when the Rule may already have moved.';

create function custom.table_rules(p_organization_id uuid, p_table_id uuid,
                                   p_use text, p_record_type text default null)
  returns setof custom.record
  language plpgsql stable
  set search_path to 'pg_catalog'
as $fn_table_rules$
begin
  if p_use is null or not (p_use = any (custom.rule_uses())) then
    raise exception 'there is no % use of a rule', coalesce(p_use, 'nameless')
      using errcode = '22023',
            hint = 'REC-15: the four uses are validate, compute, define membership and decide applicability — select unnest(custom.rule_uses()).';
  end if;
  return query
    select r.*
      from custom.record r
     where r.organization_id = p_organization_id
       and r.table_id = custom.rule_kernel_id()
       and r.deleted_at is null
       and (r.data ->> 'scope_table_id')::uuid = p_table_id
       and coalesce(r.data -> 'uses', '[]'::jsonb) ? p_use
       and (jsonb_array_length(coalesce(r.data -> 'applies_to_types', '[]'::jsonb)) = 0
            or (p_record_type is not null
                and coalesce(r.data -> 'applies_to_types', '[]'::jsonb) ? p_record_type))
       -- REC-15's per-use narrowing. T8 is why it exists: the SAME truth about width and
       -- height is WORKED OUT for every quadrilateral and ENFORCED on a square alone. One
       -- Rule, one expression, four uses — and a use that speaks about fewer kinds of record
       -- than the Rule does says so here rather than being split into a second Rule that
       -- nothing keeps equal to the first.
       and (not (coalesce(r.data -> 'use_types', '{}'::jsonb) ? p_use)
            or (p_record_type is not null
                and (r.data -> 'use_types' -> p_use) ? p_record_type))
     order by coalesce((r.data ->> 'sort')::integer, 0), r.created_at, r.id;
end;
$fn_table_rules$;

comment on function custom.table_rules(uuid, uuid, text, text) is
  'REC-15: the ONE body that answers "which Rules of this Table serve this use for a record of this kind", in DECLARED ORDER. It is the seam every use reads: validate and compute (W1-RULE) call it here, and the ordered first-match Resolver (DYN-6, W1-RULE-APPLY) is this same query taking the first row rather than all of them. FLD-10''s type field selects Rules exactly as it selects Fields, and use_types narrows ONE use of a Rule without splitting the Rule in two.';

-- ══════════════════════════════════════════════════════════════════════════════
-- 5. What a Rule must declare — refused in the user's own words
-- ══════════════════════════════════════════════════════════════════════════════

create function custom._rule_shape_guard() returns trigger
  language plpgsql
  set search_path to 'pg_catalog'
as $fn_rguard$
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
                    v_name, coalesce(v_kind, 'nothing')
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
                      v_name, coalesce(v_use, 'do nothing')
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
$fn_rguard$;

comment on function custom._rule_shape_guard() is
  'REC-15, REC-17 and FLD-9: everything a Rule must declare, refused in the user''s own words. The REC-17 half is the load-bearing one: every Field reference in the expression is walked at SAVE time and has to be an id of a live Field of the scope Table, and a name-shaped reference is refused — so a Rule that breaks REC-17 cannot be stored at all, never mind evaluated. The kernel `Rule` row is exempt (REC-27: the kernel is defined in code, not data).';

create trigger custom_record_rule_shape_guard
  before insert or update on custom.record
  for each row execute function custom._rule_shape_guard();

-- ══════════════════════════════════════════════════════════════════════════════
-- 6. REC-15 — the ONE Rule surface
-- ══════════════════════════════════════════════════════════════════════════════

create view custom.rule with (security_invoker = true) as
  select r.id,
         r.organization_id,
         r.data ->> 'name'                                         as name,
         r.data ->> 'kind'                                         as kind,
         (r.data ->> 'scope_table_id')::uuid                       as scope_table_id,
         coalesce(r.data -> 'uses', '[]'::jsonb)                   as uses,
         coalesce(r.data -> 'uses', '[]'::jsonb) ? 'validate'      as validates,
         coalesce(r.data -> 'uses', '[]'::jsonb) ? 'compute'       as computes,
         coalesce(r.data -> 'uses', '[]'::jsonb) ? 'membership'    as defines_membership,
         coalesce(r.data -> 'uses', '[]'::jsonb) ? 'applicability' as decides_applicability,
         coalesce(r.data -> 'applies_to_types', '[]'::jsonb)       as applies_to_types,
         coalesce(r.data -> 'use_types', '{}'::jsonb)              as use_types,
         r.data -> 'expr'                                          as expr,
         (r.data ->> 'target_field_id')::uuid                      as target_field_id,
         r.data ->> 'message'                                      as message,
         coalesce((r.data ->> 'sort')::integer, 0)                 as sort,
         r.created_by, r.updated_by, r.created_at, r.updated_at,
         r.version, r.metadata, r.visibility, r.data
    from custom.record r
   where r.table_id = custom.rule_kernel_id()
     and r.data_class <> 'kernel'
     and r.deleted_at is null;

comment on view custom.rule is
  'REC-15: ONE Rule object with four uses, organization-scoped. A PROJECTION over custom.record, never a second relation: a Rule IS a Record (REC-25), so its id is its record id, its version is the store''s own certified version column (REC-19), and History, Visibility and Migration cover it with no second mechanism. The four boolean columns are the four uses read out of one stored list, so "which uses does this Rule serve" is a query rather than a convention. security_invoker: every caller reads it under their own row-level security.';

create function custom._rule_definition_write() returns trigger
  language plpgsql
  set search_path to 'pg_catalog'
as $fn_rdw$
declare
  v_data jsonb;
  v_id   uuid;
begin
  if tg_op = 'DELETE' then
    update custom.record
       set deleted_at = now()
     where organization_id = old.organization_id and id = old.id
       and table_id = custom.rule_kernel_id();
    return old;
  end if;

  -- The view's columns are assembled back into the ONE stored document, so a write through
  -- the projection and a write into the store produce the same row and the SAME guard fires.
  v_data := coalesce(new.data, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
    'name',            new.name,
    'kind',            new.kind,
    'scope_table_id',  new.scope_table_id,
    'target_field_id', new.target_field_id,
    'message',         new.message))
    || jsonb_build_object(
    'uses',             coalesce(new.uses, '[]'::jsonb),
    'applies_to_types', coalesce(new.applies_to_types, '[]'::jsonb),
    'use_types',        coalesce(new.use_types, '{}'::jsonb),
    'sort',             coalesce(new.sort, 0));
  if new.expr is not null then
    v_data := jsonb_set(v_data, '{expr}', new.expr);
  end if;

  if tg_op = 'INSERT' then
    insert into custom.record (id, organization_id, table_id, data_class, data)
    values (coalesce(new.id, gen_random_uuid()), new.organization_id,
            custom.rule_kernel_id(), 'rule', v_data)
    returning id into v_id;
    new.id := v_id;
    return new;
  end if;

  -- REC-19: the version is NOT touched here. platform._touch_row - the platform's own
  -- standard trigger, already on custom.record - increments it on every UPDATE, whichever
  -- way the write arrives. A second `version = version + 1` in this body would make a write
  -- through the projection count as two changes, which is exactly how a version number stops
  -- meaning anything.
  update custom.record
     set data = v_data
   where organization_id = new.organization_id and id = new.id
     and table_id = custom.rule_kernel_id();
  return new;
end;
$fn_rdw$;

comment on function custom._rule_definition_write() is
  'REC-15: writing a Rule through custom.rule. It assembles the view''s columns back into the one stored document and writes custom.record, so custom._rule_shape_guard fires on exactly the same bytes whichever way the Rule arrives — the projection is a surface, never a second store with its own rules. It deliberately does NOT set version: REC-19''s counter is platform._touch_row''s, and one writer is the whole point.';

create trigger custom_rule_definition_validation
  instead of insert or update or delete on custom.rule
  for each row execute function custom._rule_definition_write();

-- ══════════════════════════════════════════════════════════════════════════════
-- 7. THE TWO USES THIS LANE EXECUTES — validate, then compute
-- ══════════════════════════════════════════════════════════════════════════════
-- The trigger is named so it fires AFTER custom_record_field_validation (Postgres fires
-- BEFORE ROW triggers in name order, and `custom_record_rule_uses` sorts after
-- `custom_record_field_validation`). That order is load-bearing and is asserted by this
-- lane's suite rather than assumed: the field definitions decide the TYPES, and a Rule is
-- then asked about values that are already the right shape.

create function custom._record_rule_uses() returns trigger
  language plpgsql
  set search_path to 'pg_catalog'
as $fn_rru$
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
$fn_rru$;

comment on function custom._record_rule_uses() is
  'REC-15 and REC-19 on the store: every write of a record asks the Rules of its Table, in declared order, for the two uses this lane wires. VALIDATE refuses the write in the Rule''s own words. COMPUTE writes the answer into data -> _computed -> <field key> WITH the rule id and THE VERSION THAT PRODUCED IT — a STAND-IN for History, announced here with W3-HIST as the remedy, which stamps its row from these keys. FLD-10''s type field selects which Rules apply exactly as it selects which Fields do.';

create trigger custom_record_rule_uses
  before insert or update on custom.record
  for each row execute function custom._record_rule_uses();

-- ══════════════════════════════════════════════════════════════════════════════
-- 8. REC-19 — what W3-HIST reads, and what a reader sees
-- ══════════════════════════════════════════════════════════════════════════════

create function custom.computed_provenance(p_organization_id uuid, p_record_id uuid)
  returns table (field_key text, field_id uuid, value jsonb,
                 rule_id uuid, rule_version integer, computed_at timestamptz)
  language sql stable
  set search_path to 'pg_catalog'
as $fn_prov$
  select e.key,
         (e.value ->> 'field_id')::uuid,
         e.value -> 'value',
         (e.value ->> 'rule_id')::uuid,
         (e.value ->> 'rule_version')::integer,
         (e.value ->> 'at')::timestamptz
    from custom.record r,
         jsonb_each(coalesce(r.data -> '_computed', '{}'::jsonb)) e
   where r.organization_id = p_organization_id
     and r.id = p_record_id;
$fn_prov$;

comment on function custom.computed_provenance(uuid, uuid) is
  'REC-19: "History knows which version produced a Value", as a QUERY. One row per computed Value, carrying the Field it belongs to, the Rule that produced it and THE RULE VERSION AT THE MOMENT IT WAS PRODUCED. W3-HIST stamps its History rows from this and needs nothing else from this lane; until it lands, this is where the answer lives and it says so.';

create function custom.record_values(p_organization_id uuid, p_record_id uuid)
  returns jsonb
  language sql stable
  set search_path to 'pg_catalog'
as $fn_record_values$
  select (r.data - '_computed' - '_retired')
         || coalesce((select jsonb_object_agg(e.key, e.value -> 'value')
                        from jsonb_each(coalesce(r.data -> '_computed', '{}'::jsonb)) e),
                     '{}'::jsonb)
    from custom.record r
   where r.organization_id = p_organization_id
     and r.id = p_record_id;
$fn_record_values$;

comment on function custom.record_values(uuid, uuid) is
  'The ONE reader that merges what somebody typed with what a Rule worked out, so no consumer has to know that a computed Value is stored apart from a typed one (FLD-9''s refusal of a hand-written formula value is what makes them separate). _retired is W1-FIELD''s History stand-in and is deliberately not merged: a Value that stopped applying is not a Value of this record any more.';

-- ══════════════════════════════════════════════════════════════════════════════
-- 9. THE SEED — ONE Rule row, declared for all FOUR uses, over T8's own shape
-- ══════════════════════════════════════════════════════════════════════════════
-- This is the row every exit clause and every verifier clause reads, on both databases:
-- REC-15's "one object, four uses" as a ROW rather than as a sentence, and the id that
-- C-10a (compute) and C-10b (membership) are executed against. T8 is the contract's own
-- test for it — "a Square rejects Width <> Height" — so the fixture is the acceptance test
-- rather than a shape invented to be easy.
--
-- It is named `Rule conformance shape` and slugged `rule_conformance_shape` so that nobody
-- reading the system organization's Tables can mistake it for a tenant's own work.
-- Everything is a constant, so the seed is idempotent on its own.

insert into custom.record (id, organization_id, table_id, data_class, data)
values
  -- The Table the Rule is about. Its Home is the kernel `Table` record, as W1-FIELD's
  -- fixtures are; its type field is `kind`, which is what makes a Rule apply to squares
  -- alone (FLD-10, T8).
  ('11111111-0004-4000-8000-000000000001'::uuid,
   '39c38960-d30c-4840-b0c1-c9960de95582'::uuid,
   '11111111-0000-4000-8000-000000000001'::uuid,
   'table',
   '{"name":"Rule conformance shape","slug":"rule_conformance_shape","label_singular":"Shape","label_plural":"Shapes","type":"entity","display":"page","ordered":false,"weight":"light","retention_days":365,"default_sort":[],"row_order":"sorted","agent_writable":true,"type_field":"kind","title_field":"title","fields":[{"name":"title"},{"name":"kind"},{"name":"width"},{"name":"height"},{"name":"sides_equal"}],"parent_id":"11111111-0000-4000-8000-000000000001","row":"REC-15"}'::jsonb)
on conflict do nothing;

insert into custom.record (id, organization_id, table_id, data_class, data)
values
  ('11111111-0004-4000-8000-000000000010'::uuid,
   '39c38960-d30c-4840-b0c1-c9960de95582'::uuid,
   '11111111-0000-4000-8000-000000000002'::uuid,
   'field',
   '{"entity_definition_id":"11111111-0004-4000-8000-000000000001","key":"title","label":"Title","type":"text","multi":false,"dated":false,"rules":[],"config":{},"required":true,"sort":10,"source":"manual","source_config":{},"sensitivity":"internal","context_policy":"include","depends_on":[],"applies_to_types":[]}'::jsonb),
  ('11111111-0004-4000-8000-000000000011'::uuid,
   '39c38960-d30c-4840-b0c1-c9960de95582'::uuid,
   '11111111-0000-4000-8000-000000000002'::uuid,
   'field',
   '{"entity_definition_id":"11111111-0004-4000-8000-000000000001","key":"kind","label":"Kind","type":"text","multi":false,"dated":false,"rules":[],"config":{},"required":true,"sort":20,"source":"manual","source_config":{},"sensitivity":"internal","context_policy":"include","depends_on":[],"applies_to_types":[]}'::jsonb),
  ('11111111-0004-4000-8000-000000000012'::uuid,
   '39c38960-d30c-4840-b0c1-c9960de95582'::uuid,
   '11111111-0000-4000-8000-000000000002'::uuid,
   'field',
   '{"entity_definition_id":"11111111-0004-4000-8000-000000000001","key":"width","label":"Width","type":"range","multi":false,"dated":false,"rules":[],"config":{"kind":"number"},"required":true,"sort":30,"unit":"mm","source":"manual","source_config":{},"sensitivity":"internal","context_policy":"include","depends_on":[],"applies_to_types":["rectangle","square"]}'::jsonb),
  ('11111111-0004-4000-8000-000000000013'::uuid,
   '39c38960-d30c-4840-b0c1-c9960de95582'::uuid,
   '11111111-0000-4000-8000-000000000002'::uuid,
   'field',
   '{"entity_definition_id":"11111111-0004-4000-8000-000000000001","key":"height","label":"Height","type":"range","multi":false,"dated":false,"rules":[],"config":{"kind":"number"},"required":true,"sort":40,"unit":"mm","source":"manual","source_config":{},"sensitivity":"internal","context_policy":"include","depends_on":[],"applies_to_types":["rectangle","square"]}'::jsonb),
  -- The Field the compute use writes. A formula, because a Rule never computes a field
  -- somebody types into (FLD-9).
  ('11111111-0004-4000-8000-000000000014'::uuid,
   '39c38960-d30c-4840-b0c1-c9960de95582'::uuid,
   '11111111-0000-4000-8000-000000000002'::uuid,
   'field',
   '{"entity_definition_id":"11111111-0004-4000-8000-000000000001","key":"sides_equal","label":"Sides are equal","type":"formula","multi":false,"dated":false,"rules":[],"config":{},"required":false,"sort":50,"source":"formula","compute_on":"write","source_config":{},"sensitivity":"internal","context_policy":"include","depends_on":[],"applies_to_types":["rectangle","square"]}'::jsonb)
on conflict do nothing;

-- ONE ROW. FOUR USES. ONE EXPRESSION, whose two leaves are FIELD IDS (REC-17): the Width
-- field `…0012` and the Height field `…0013`. Nothing here is a field NAME.
--   validate       — a square whose sides differ is refused, in the Rule's own words
--   compute        — `sides_equal` gets the answer, with this Rule's id and version beside it
--   membership     — the squares are the records this Rule is true of        (W1-RULE-APPLY)
--   applicability  — what applies to a square is what this Rule is true of   (W1-RULE-APPLY)
--
-- THE NARROWING IS WHAT MAKES THE COMPUTE USE FALSIFIABLE, and it is also exactly what T8
-- describes. The Rule applies to every quadrilateral, so `sides_equal` is WORKED OUT for a
-- rectangle as well as for a square — `true` for one input and `false` for another, from the
-- same row (rule 3: a single forcing input never survives the `return expected` gut check).
-- `use_types` narrows the VALIDATE use to squares, because a rectangle with unequal sides is
-- a perfectly good rectangle. Without the narrowing this one expression could only do one of
-- the two jobs, and the answer would have been a second Rule nothing keeps equal to this one.
insert into custom.record (id, organization_id, table_id, data_class, data)
values
  ('11111111-0004-4000-8000-000000000101'::uuid,
   '39c38960-d30c-4840-b0c1-c9960de95582'::uuid,
   '11111111-0000-4000-8000-000000000003'::uuid,
   'rule',
   '{"name":"A square has equal sides","kind":"predicate","scope_table_id":"11111111-0004-4000-8000-000000000001","uses":["validate","compute","membership","applicability"],"applies_to_types":["rectangle","square"],"use_types":{"validate":["square"]},"target_field_id":"11111111-0004-4000-8000-000000000014","message":"the sides of a square have to be the same length","sort":10,"row":"REC-15","expr":{"op":"eq","args":[{"field":"11111111-0004-4000-8000-000000000012"},{"field":"11111111-0004-4000-8000-000000000013"}]}}'::jsonb)
on conflict do nothing;

comment on function custom.rule_kernel_id() is
  'REC-25 / REC-27 / REC-15: the id of the kernel `Rule` record in custom.record, written by W1-STORE. A record whose table_id is this id IS a Rule, so a Rule''s History, Visibility and Migration are the store''s and this lane invents none of them. The one Rule this file seeds is 11111111-0004-4000-8000-000000000101, declared for all four uses.';
