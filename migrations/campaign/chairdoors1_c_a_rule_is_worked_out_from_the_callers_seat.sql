-- chair-step: this replaces the body of custom.rule_eval (same signature, still SECURITY INVOKER), CREATES one helper custom._rule_eval_seated (SECURITY DEFINER), declares both and history.capture_is_open in platform.client_callable_door, and GRANTs EXECUTE on the three to `authenticated`. rule_eval's store-internal path (called by the store's own doors as the owner) is unchanged; a signed-in caller is sent through the helper, which decides the organization, Table and record as the read doors do and counts only records she may see. history.capture_is_open's body is unchanged (it reads one organization setting). No table, policy, index or data row is touched.
-- lane: CHAIR-DOORS-1 (asked by v6 lane 11 AUTOMATIONS-AND-PAGES, need 5)
-- based-on: custom.rule_eval(uuid, jsonb, jsonb, jsonb) fdff75976ad3b1e61c1276581f25f11c260d8d997b99939d055b5e9f07729640
--
-- A RULE IS WORKED OUT FROM THE CALLER'S SEAT. Before this file custom.rule_eval could not be executed by a
-- signed-in caller, and granting it alone would not have been enough: it is SECURITY INVOKER and every
-- Field reference goes through helpers (custom.rule_field_key, custom.formula_eval, ...) and reads of
-- custom.record that `authenticated` cannot reach, so a workflow's condition step would have been refused
-- on its first Field. So the client path is decided and seated:
--   custom._rule_eval_seated: custom.assert_store_door + custom.assert_client_may_reach on the organization,
--     custom.assert_may_know_table on p_context.table_id when given, the viewer rung on p_context.record_id
--     and p_context.fx_self_id when given; then the one evaluator, with sibling_count and stage_count
--     counting only the records the one ladder lets her see (mx.rule_eval_seat, transaction-local,
--     set and restored by this helper alone, exception path included).

CREATE FUNCTION custom._rule_eval_seated(p_organization_id uuid, p_expr jsonb, p_values jsonb, p_context jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me   uuid := custom.query_principal();
  v_held text;
  v_out  jsonb;
  v_id   uuid;
  v_ctx  jsonb := coalesce(p_context, '{}'::jsonb);
begin
  -- THE DECISION FIRST, in custom.rule_eval's name, the walls every read door asks.
  perform custom.assert_store_door(p_organization_id, 'custom.rule_eval');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.rule_eval');
  if jsonb_typeof(v_ctx) <> 'object' then
    raise exception 'The context a rule is worked out in is a set of named values, and this one is a %.', jsonb_typeof(v_ctx)
      using errcode = '22023';
  end if;
  if nullif(v_ctx ->> 'table_id', '') is not null then
    perform custom.assert_may_know_table(p_organization_id, (v_ctx ->> 'table_id')::uuid, 'custom.rule_eval');
  end if;
  -- THE RECORD A RULE IS ABOUT is one she may see, or the rule says nothing about it (fx.created_time
  -- and the counts read it by id).
  foreach v_id in array array_remove(array[nullif(v_ctx ->> 'record_id', '')::uuid,
                                           nullif(v_ctx ->> 'fx_self_id', '')::uuid], null) loop
    perform custom.assert_client_may_open(p_organization_id, v_id, 'custom.rule_eval',
                                          'viewer'::public.permission_level, 'record');
  end loop;

  -- THE SEAT, for the length of this one call. sibling_count and stage_count count only what she may see.
  v_held := current_setting('mx.rule_eval_seat', true);
  perform set_config('mx.rule_eval_seat', coalesce(v_me::text, '00000000-0000-0000-0000-000000000000'), true);
  begin
    v_out := custom.rule_eval(p_organization_id, p_expr, p_values, v_ctx);
  exception when others then
    perform set_config('mx.rule_eval_seat', coalesce(v_held, ''), true);
    raise;
  end;
  perform set_config('mx.rule_eval_seat', coalesce(v_held, ''), true);
  return v_out;
end;
$function$;

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
  -- CHAIR-DOORS-1 (2026-10-02): the person a client call is worked out for, set only by
  -- custom._rule_eval_seated for the length of one call; null on every store-internal path.
  v_seat   uuid := nullif(current_setting('mx.rule_eval_seat', true), '')::uuid;
begin
  -- A CLIENT ASKS FROM ITS OWN SEAT (lane AUTOMATIONS-AND-PAGES need 5). A signed-in caller reaches
  -- this function directly (EXECUTE to authenticated); the store's own doors reach it as the store's
  -- owner. The first is sent through custom._rule_eval_seated, which decides the organization, the
  -- Table and the record the way every read door does and counts only the records she may see; the
  -- second is untouched, so no write gate answers differently.
  if not pg_has_role(current_user, (select c.relowner from pg_class c where c.oid = 'custom.record'::regclass), 'member') then
    return custom._rule_eval_seated(p_organization_id, p_expr, p_values, p_context);
  end if;

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
       and (v_seat is null or custom.has_visibility(v_seat, 'record', r.id, 'viewer'::public.permission_level))
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
       and (v_seat is null or custom.has_visibility(v_seat, 'record', r.id, 'viewer'::public.permission_level))
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

-- The door rows FIRST, then the grants (the ddl guard fires on the grant).
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values
  ('custom', 'rule_eval', 'p_organization_id uuid, p_expr jsonb, p_values jsonb, p_context jsonb',
   array['uuid'::regtype::oid, 'jsonb'::regtype::oid, 'jsonb'::regtype::oid, 'jsonb'::regtype::oid],
   'Works out one Rule expression over the values given — what a workflow''s condition step asks as its owner. A signed-in caller is sent through custom._rule_eval_seated, which decides the organization, the Table and the record first and counts only records the caller may see; the store''s own doors reach the same evaluator as the owner, unchanged. It writes nothing.',
   'chairdoors1_c_a_rule_is_worked_out_from_the_callers_seat.sql', null, true, false),
  ('custom', '_rule_eval_seated', 'p_organization_id uuid, p_expr jsonb, p_values jsonb, p_context jsonb',
   array['uuid'::regtype::oid, 'jsonb'::regtype::oid, 'jsonb'::regtype::oid, 'jsonb'::regtype::oid],
   'custom.rule_eval for a signed-in caller: custom.assert_store_door and custom.assert_client_may_reach on the organization, custom.assert_may_know_table on p_context.table_id, the viewer rung on p_context.record_id and fx_self_id, then the one evaluator with its counts limited to the records custom.has_visibility gives the caller. It writes nothing.',
   'chairdoors1_c_a_rule_is_worked_out_from_the_callers_seat.sql', null, true, false),
  ('history', 'capture_is_open', 'p_organization_id uuid', array['uuid'::regtype::oid],
   'Whether history capture is open for an organization (its store switch) — read by a workflow''s change step before it describes a change, so "before" can say History off. It reads one organization setting through custom.store_is_open and custom.assert_store_door and writes nothing.',
   'chairdoors1_c_a_rule_is_worked_out_from_the_callers_seat.sql', null, true, false);

grant execute on function custom._rule_eval_seated(uuid, jsonb, jsonb, jsonb) to authenticated;
grant execute on function custom.rule_eval(uuid, jsonb, jsonb, jsonb) to authenticated;
grant execute on function history.capture_is_open(uuid) to authenticated;
