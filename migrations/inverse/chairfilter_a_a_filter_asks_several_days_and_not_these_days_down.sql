-- chair-step: inverse of chairfilter_a_a_filter_asks_several_days_and_not_these_days.sql — custom.rule_node_kinds() and custom.rule_filter_node_sql(uuid, uuid, jsonb, jsonb, text[]) go back to their exact production bodies (no `within` node).
-- lane: CHAIR-FILTER-DOORS
-- based-on: custom.rule_filter_node_sql(uuid, uuid, jsonb, jsonb, text[]) b4d8903805e5245ea7b1cc7a7eef1947503e8a0dbb4113e95dd7dcb46d366522
-- based-on: custom.rule_node_kinds() f65eb3465d320339da3225fe9fc54eff9f7f0687b8576e99dc19e47c6e335b7d

CREATE OR REPLACE FUNCTION custom.rule_node_kinds()
 RETURNS TABLE(node text, evaluated_by text, note text)
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
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
  ) as t(node, evaluated_by, note)
  -- GRID-PRIMITIVES G6: the formula language's nodes, worked out by custom.formula_eval, which
  -- custom.rule_eval hands them to. One list, read from where it is kept.
  union all
  select k.node, 'GRID-PRIMITIVES G3 (custom.formula_eval)', k.signature || ' — ' || k.says
    from custom.formula_node_kinds() k;
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
$function$
;
