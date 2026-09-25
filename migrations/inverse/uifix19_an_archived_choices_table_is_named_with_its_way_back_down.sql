-- inverse of migrations/campaign/uifix19_an_archived_choices_table_is_named_with_its_way_back.sql
-- lane: UI-FIX-19
-- based-on: custom._field_shape_guard() 02257472c65c5ac07344e6e7638099e245e017b93659256fb57c2d84f6e3c4a9
-- Restores custom._field_shape_guard() to the body it replaced (sha 688b4c2b…).
CREATE OR REPLACE FUNCTION custom._field_shape_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_names_bad text;   -- SC-R: the kinds an entity reference names that no record may point at
  d           jsonb := new.data;
  v_type      text;
  v_key       text;
  v_label     text;
  v_edef      uuid;
  v_token     text;
  v_opts      uuid;
  v_display   text;
  v_source    text;
  v_names     text[];
  v_rule      jsonb;
  v_kind      text;
  v_example   text;
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

  -- Only field definitions. A `kernel` row is the kernel Table `Field` itself (REC-27:
  -- defined in code, not data) and is exempt, exactly as W1-TABLE exempts the kernel Tables.
  if new.table_id is distinct from custom.field_kernel_id() or new.data_class = 'kernel' then
    return new;
  end if;

  v_label := nullif(d ->> 'label', '');
  v_key   := d ->> 'key';
  if v_key is null or v_key !~ '^[a-z][a-z0-9_]*$' then
    raise exception 'a field needs a key made of lower-case letters, digits and underscores, and this one says %',
                    custom.said(v_key, 'nothing')
      using errcode = '23514', hint = 'FLD-13: key.';
  end if;
  if v_label is null then
    raise exception 'the field % needs a label - it is what a person reads', v_key
      using errcode = '23514', hint = 'FLD-13: label.';
  end if;

  -- FLD-8 / FLD-13: ONE definitions surface for standard and custom tables alike. Exactly
  -- one of the two identifiers, never both and never neither — which is what makes it one
  -- surface rather than two tables sharing a name.
  v_edef  := nullif(d ->> 'entity_definition_id', '')::uuid;
  v_token := nullif(d ->> 'table_token', '');
  if (v_edef is null) = (v_token is null) then
    raise exception 'the field % has to say what it is a field OF - a custom table or a standard one, and exactly one of them',
                    v_label
      using errcode = '23514',
            hint = 'FLD-8 / FLD-13: entity_definition_id names a custom Table record; table_token names a standard table''s registry token. One definitions table holds both, so exactly one of the two is set.';
  end if;
  if v_token is not null
     and not exists (select 1 from platform.entity_types e
                      where e.token = v_token and e.is_active) then
    raise exception 'the field % says it belongs to a standard table called %, and no such table is registered',
                    v_label, v_token
      using errcode = '23514', hint = 'FLD-8: table_token names a live platform.entity_types token.';
  end if;

  -- FLD-1: exactly ONE behavior, from a CLOSED set. An array is refused by name, so
  -- "exactly one" is unrepresentable rather than merely unwritten.
  if jsonb_typeof(d -> 'type') = 'array' then
    raise exception 'the field % has more than one behavior, and a field has exactly one', v_label
      using errcode = '23514',
            hint = 'FLD-1: one of list, range, text, relation, formula, boolean. What looks like a second behavior is a modifier (FLD-2) or a Rule (FLD-3).';
  end if;
  v_type := d ->> 'type';
  -- LIMITS-FIX 2026-09-21: `boolean` joins the closed set. It is a BEHAVIOUR and not a
  -- format on something else, because a tick box has THREE answers — ticked, unticked, and
  -- nobody has said — and only a behaviour of its own can hold a real boolean while an
  -- absent key keeps meaning "never asked" (VAL-2).
  if v_type is null or v_type not in ('list', 'range', 'text', 'relation', 'formula', 'boolean') then
    raise exception 'the field % says its behavior is %, and a field behaves as a list, a range, text, a relation, a formula or a tick box',
                    v_label, custom.said(v_type, 'nothing')
      using errcode = '23514', hint = 'FLD-1: the set is closed.';
  end if;

  -- FLD-2: modifiers are SEPARATE from behavior. Three distinct stored keys.
  if jsonb_typeof(d -> 'multi') is distinct from 'boolean' then
    raise exception 'the field % has to say whether it holds one value or many', v_label
      using errcode = '23514', hint = 'FLD-2: multi is a modifier, never a behavior of its own.';
  end if;
  if jsonb_typeof(d -> 'dated') is distinct from 'boolean' then
    raise exception 'the field % has to say whether its values are dated', v_label
      using errcode = '23514', hint = 'FLD-2: dated is a modifier, never a behavior of its own.';
  end if;
  if jsonb_typeof(d -> 'rules') is distinct from 'array' then
    raise exception 'the field % has to carry its rules as a list, even an empty one', v_label
      using errcode = '23514', hint = 'FLD-2 / FLD-3: any number of attached validation Rules.';
  end if;

  -- FLD-3: a constraint is a Rule, not a behavior — and not a config key either. This is
  -- the only shape in which the law can actually be broken, so it is the shape refused.
  for v_rule in select r from jsonb_array_elements(d -> 'rules') r loop
    v_kind := v_rule ->> 'kind';
    -- STORE-T / B1: `unique` joins the set. It is not judged here — a shape guard sees one
    -- row and uniqueness is a statement about the OTHERS — it is carried out by
    -- custom._unique_rule_holds, which is a trigger and can take the lock that makes it true
    -- under concurrency. A kind this store cannot execute is still refused by name.
    if v_kind is null or v_kind not in ('min', 'max', 'pattern', 'length', 'equals_field', 'differs_from_field', 'unique') then
      raise exception 'the field % carries a rule of kind %, which this validator cannot execute',
                      v_label, custom.said(v_kind, 'nothing')
        using errcode = '23514',
              hint = 'FLD-3: an attached validation Rule declares its kind. The general Rule object, its versions and its four uses are W1-RULE''s (REC-15, REC-17, REC-19).';
    end if;

    -- ── STORE-RULE-GAPS (1), 2026-09-23: A PATTERN SAYS HOW TO WRITE IT. ─────────────────
    -- The older grid's `patternHint`: "949-555-0142" beside a phone pattern, so a person who is
    -- refused is shown the shape rather than told only that theirs is wrong. It belongs to the
    -- pattern Rule (it is an example OF that pattern), it is judged here once, and an example
    -- that its own pattern would refuse is refused - a hint that is wrong is worse than none.
    if v_rule ? 'example' and jsonb_typeof(v_rule -> 'example') <> 'null' then
      if v_kind <> 'pattern' then
        raise exception 'the field % shows an example on its % rule, and only a pattern rule has an example to show',
                        v_label, v_kind
          using errcode = '23514',
                hint = 'FLD-3: example belongs to a pattern Rule - {"kind":"pattern","value":"<pattern>","example":"<how a person writes it>"}.';
      end if;
      v_example := case when jsonb_typeof(v_rule -> 'example') = 'string' then btrim(v_rule ->> 'example') end;
      if v_example is null or v_example = '' then
        raise exception 'the field % gives an example of how to write it, and an example is the words a person would type',
                        v_label
          using errcode = '23514', hint = 'FLD-3: example is a short piece of text, like 949-555-0142.';
      end if;
      if length(v_example) > 120 then
        raise exception 'the field % gives an example that is % characters long, and an example is at most 120',
                        v_label, length(v_example)
          using errcode = '23514', hint = 'FLD-3: an example shows the shape of one value, not a paragraph about it.';
      end if;
      if v_example !~ (v_rule ->> 'value') then
        raise exception 'the field % shows "%" as the way to write it, and its own pattern would refuse that',
                        v_label, v_example
          using errcode = '23514',
                hint = 'FLD-3: the example has to pass the pattern it illustrates. Change the example, or the pattern.';
      end if;
    end if;

    -- ── STORE-RULE-GAPS (3), 2026-09-23: A LENGTH HAS A SHORTEST AS WELL AS A LONGEST. ──
    -- The older grid's `minLength`. `value` stays the longest (every stored rule already means
    -- that), `min` is the shortest, and a length rule says at least one of the two. Both are
    -- whole numbers of characters; a shortest past the longest could never be met.
    if v_rule ? 'min' and jsonb_typeof(v_rule -> 'min') <> 'null' and v_kind <> 'length' then
      raise exception 'the field % gives its % rule a shortest length, and only a length rule has one',
                      v_label, v_kind
        using errcode = '23514',
              hint = 'FLD-3: {"kind":"length","min":<shortest>,"value":<longest>} - min is the fewest characters, value the most.';
    end if;
    if v_kind = 'length' then
      if coalesce(v_rule ->> 'value', '') = '' and coalesce(v_rule ->> 'min', '') = '' then
        raise exception 'the field % has a length rule that says neither how short nor how long a value may be',
                        v_label
          using errcode = '23514',
                hint = 'FLD-3: a length rule carries min (the fewest characters), value (the most), or both.';
      end if;
      if coalesce(v_rule ->> 'value', '') <> '' and (v_rule ->> 'value') !~ '^[0-9]+$' then
        raise exception 'the field % says a value may be at most % characters long, and that is not a whole number',
                        v_label, v_rule ->> 'value'
          using errcode = '23514', hint = 'FLD-3: value is the most characters, as a whole number.';
      end if;
      if coalesce(v_rule ->> 'min', '') <> '' and (v_rule ->> 'min') !~ '^[0-9]+$' then
        raise exception 'the field % says a value has to be at least % characters long, and that is not a whole number',
                        v_label, v_rule ->> 'min'
          using errcode = '23514', hint = 'FLD-3: min is the fewest characters, as a whole number.';
      end if;
      if coalesce(v_rule ->> 'value', '') <> '' and coalesce(v_rule ->> 'min', '') <> ''
         and (v_rule ->> 'min')::bigint > (v_rule ->> 'value')::bigint then
        raise exception 'the field % has to be at least % characters and at most %, and nothing is both',
                        v_label, v_rule ->> 'min', v_rule ->> 'value'
          using errcode = '23514', hint = 'FLD-3: the shortest length cannot be more than the longest.';
      end if;
    end if;
  end loop;
  if d -> 'config' ?| array['min', 'max', 'pattern', 'length', 'required_if', 'validation', 'constraint'] then
    raise exception 'the field % writes a constraint into its behavior, and a constraint is a Rule', v_label
      using errcode = '23514',
            hint = 'FLD-3: move it into rules, where it is an attached validation Rule with a kind.';
  end if;

  -- FLD-N-1: unit and format change what a value MEANS, so they live on the Field and reach
  -- the agent''s context. Only layout, colour and conditional formatting are presentation —
  -- and a presentation blob carrying either is the one way this law actually fails.
  if d -> 'presentation' ?| array['unit', 'format'] then
    raise exception 'the field % puts its unit or its format in presentation, and those change what the value MEANS',
                    v_label
      using errcode = '23514',
            hint = 'FLD-N-1: unit and format are the Field''s own columns and reach the agent''s context; presentation carries layout, colour and conditional formatting.';
  end if;
  if d ? 'unit' and jsonb_typeof(d -> 'unit') not in ('string', 'null') then
    raise exception 'the field % has to say its unit as a word', v_label
      using errcode = '23514', hint = 'FLD-N-1: unit.';
  end if;
  if d ? 'format' and jsonb_typeof(d -> 'format') not in ('string', 'null') then
    raise exception 'the field % has to say its format as a word', v_label
      using errcode = '23514', hint = 'FLD-N-1: format.';
  end if;

  -- FLD-7: where the value comes from.
  v_source := d ->> 'source';
  if v_source is null or v_source not in ('manual', 'formula', 'agent', 'synced') then
    raise exception 'the field % says its values come from %, and a field is filled in by hand, computed, written by an agent, or synced from somewhere else',
                    v_label, custom.said(v_source, 'nothing')
      using errcode = '23514', hint = 'FLD-7: manual, formula, agent, synced.';
  end if;

  -- FLD-9: a Formula declares whether it computes on read or on write — and only a formula
  -- may declare it, or the choice stops meaning anything.
  if v_type = 'formula' or v_source = 'formula' then
    if coalesce(d ->> 'compute_on', '') not in ('read', 'write') then
      raise exception 'the formula % has to say whether it works out its answer when somebody reads it or when somebody saves',
                      v_label
        using errcode = '23514', hint = 'FLD-9: compute_on is read or write.';
    end if;
  elsif d ? 'compute_on' and jsonb_typeof(d -> 'compute_on') <> 'null' then
    raise exception 'the field % is not a formula, so it has nothing to work out', v_label
      using errcode = '23514', hint = 'FLD-9: compute_on belongs to a formula and to nothing else.';
  end if;

  -- FLD-5 / FLD-6: a list field''s options are the records of a Table with display: list.
  if v_type = 'list' then
    v_opts := nullif(d -> 'config' ->> 'options_table_id', '')::uuid;
    if v_opts is null then
      raise exception 'the list field % has to say which table its choices come from', v_label
        using errcode = '23514',
              hint = 'FLD-5 / FLD-6: every pick-list is already a Table, so a list field names one rather than carrying an enum.';
    end if;
    select t.data ->> 'display' into v_display
      from custom.record t
     where t.organization_id = new.organization_id
       and t.id = v_opts
       and t.table_id = custom.table_kernel_id()
       and t.deleted_at is null;
    if v_display is null then
      raise exception 'the list field % points at something that is not a table of this organization', v_label
        using errcode = '23514', hint = 'FLD-5: options_table_id names a Table record.';
    end if;
    if v_display <> 'list' then
      raise exception 'the list field % takes its choices from a table that shows its records as a page, not as a list',
                      v_label
        using errcode = '23514',
              hint = 'FLD-5: a category is a Record of a Table with display: list. A table that grew up (T4) keeps serving the fields that already point at it — this refusal is about DECLARING a new one.';
    end if;
  elsif d -> 'config' ? 'options_table_id' then
    raise exception 'the field % is not a list, so it has no choices to take from a table', v_label
      using errcode = '23514', hint = 'FLD-1 / FLD-5.';
  end if;

  -- ── STORE-RULE-GAPS (2), 2026-09-23: A CHOICE LIST MAY TAKE OTHER VALUES. ───────────────
  -- The older grid's `allowOther`, as the column's own setting: when it is on, a value that is
  -- none of the choices is ADDED to the list as it was typed (custom._resolve_choice_words)
  -- instead of refused. Absent means off, which is what every column declared before today
  -- means. It is a list's setting and nothing else's.
  if d -> 'config' ? 'allow_other' and jsonb_typeof(d -> 'config' -> 'allow_other') <> 'null' then
    if jsonb_typeof(d -> 'config' -> 'allow_other') <> 'boolean' then
      raise exception 'the field % has to say whether it takes values that are not one of its choices as yes or no, and it says %',
                      v_label, d -> 'config' ->> 'allow_other'
        using errcode = '23514', hint = 'FLD-5: allow_other is true or false.';
    end if;
    if v_type <> 'list' then
      raise exception 'the field % is not a choice list, so there is no list for other values to join', v_label
        using errcode = '23514', hint = 'FLD-5: allow_other belongs to a list field.';
    end if;
  end if;

  -- FLD-12 / FLD-13: the relation properties, and they belong to a relation.
  if v_type = 'relation' then
    -- SC-R / P12: an ENTITY REFERENCE says what it points at with config.allowed_types — the
    -- platform kinds it may name — and target mode `any` (REL-8), instead of one Table. Every
    -- kind it names is one custom.entity_reference_kinds() lists, and it names no Table too.
    if jsonb_typeof(d -> 'config' -> 'allowed_types') = 'array' then
      if jsonb_array_length(d -> 'config' -> 'allowed_types') = 0 then
        raise exception 'the field % points at things on the platform and names no kind of thing', v_label
          using errcode = '23514', hint = 'SC-R / P12: config.allowed_types lists the kinds, from custom.entity_reference_kinds().';
      end if;
      if coalesce(d -> 'config' ->> 'target_mode', '') <> 'any' then
        raise exception 'the field % points at things on the platform, so its target mode is any', v_label
          using errcode = '23514', hint = 'SC-R / P12 / REL-8: an entity reference is polymorphic; config.allowed_types is what restricts it.';
      end if;
      if nullif(d ->> 'relation_target', '') is not null then
        raise exception 'the field % points at things on the platform, so it names no Table as well', v_label
          using errcode = '23514', hint = 'SC-R / P12: a column points at the records of a Table (relation_target) or at platform things (config.allowed_types), never both.';
      end if;
      select string_agg(x #>> '{}', ', ' order by x #>> '{}') into v_names_bad
        from jsonb_array_elements(d -> 'config' -> 'allowed_types') x
       where jsonb_typeof(x) <> 'string'
          or not exists (select 1 from custom.entity_reference_kinds() k where k.token = x #>> '{}');
      if v_names_bad is not null then
        raise exception 'the field % points at %, and a record cannot point at that kind of thing', v_label, v_names_bad
          using errcode = '23514',
                hint = case when v_names_bad ~ '(^|, )(file)(,|$)'
                            then 'SC-R / P12: a file is a File column (an attachment — a relation to the kernel File Table), not an entity reference. The kinds are custom.entity_reference_kinds().'
                            when v_names_bad ~ '(^|, )(user|person|user_profile)(,|$)'
                            then 'SC-R / P12: a person is a Person column (a relation to the kernel Person Table), not an entity reference. The kinds are custom.entity_reference_kinds().'
                            else 'SC-R / P12: the kinds a record may point at are custom.entity_reference_kinds(). Nothing was written.' end;
      end if;
    elsif nullif(d ->> 'relation_target', '') is null then
      raise exception 'the relation field % has to say what it points at', v_label
        using errcode = '23514', hint = 'FLD-13: relation_target.';
    end if;
    if coalesce((d ->> 'relation_max')::integer, 0) < 1 then
      raise exception 'the relation field % has to say how many things it can point at, and it is at least one',
                      v_label
        using errcode = '23514', hint = 'FLD-13: relation_max, where 1 is a foreign key.';
    end if;
    if coalesce(d ->> 'on_target_delete', '') not in ('cascade', 'set_null', 'restrict') then
      raise exception 'the relation field % has to say what happens to it when the thing it points at is deleted',
                      v_label
        using errcode = '23514', hint = 'FLD-13: on_target_delete is cascade, set_null or restrict.';
    end if;
  elsif d ?| array['relation_target', 'relation_max', 'on_target_delete', 'inverse_key']
        and (nullif(d ->> 'relation_target', '') is not null
             or nullif(d ->> 'relation_max', '') is not null
             or nullif(d ->> 'on_target_delete', '') is not null
             or nullif(d ->> 'inverse_key', '') is not null) then
    raise exception 'the field % is not a relation, so it has no relation properties', v_label
      using errcode = '23514', hint = 'FLD-13: relation_target, relation_max, on_target_delete and inverse_key belong to a relation.';
  end if;

  -- FLD-12: the four properties the live system declares and enforces nowhere.
  if coalesce(d ->> 'sensitivity', '') not in ('public', 'internal', 'confidential', 'restricted') then
    raise exception 'the field % has to say how sensitive its values are, and it says %',
                    v_label, custom.said(d ->> 'sensitivity', 'nothing')
      using errcode = '23514', hint = 'FLD-12: sensitivity is public, internal, confidential or restricted.';
  end if;
  if coalesce(d ->> 'context_policy', '') not in ('include', 'summarize', 'exclude', 'on_request') then
    raise exception 'the field % has to say whether an agent may see its values, and it says %',
                    v_label, custom.said(d ->> 'context_policy', 'nothing')
      using errcode = '23514', hint = 'FLD-12: context_policy is include, summarize, exclude or on_request.';
  end if;
  if d ? 'review_interval_days' and jsonb_typeof(d -> 'review_interval_days') = 'number'
     and (d ->> 'review_interval_days')::numeric <= 0 then
    raise exception 'the field % says it is reviewed every % days, and a review interval is at least one day',
                    v_label, d ->> 'review_interval_days'
      using errcode = '23514', hint = 'FLD-12: review_interval_days.';
  end if;
  if jsonb_typeof(d -> 'depends_on') is distinct from 'array' then
    raise exception 'the field % has to list what it depends on, even when the list is empty', v_label
      using errcode = '23514', hint = 'FLD-12: depends_on.';
  end if;

  -- FLD-10: which record types this field applies to.
  if jsonb_typeof(d -> 'applies_to_types') is distinct from 'array' then
    raise exception 'the field % has to say which kinds of record it applies to, even when that is all of them',
                    v_label
      using errcode = '23514', hint = 'FLD-10: applies_to_types, empty meaning every kind.';
  end if;

  -- ONE SOURCE OF TRUTH, both ways. A custom Table declares WHICH fields it has (REC-1,
  -- W1-TABLE''s guard); this record declares WHAT one of them is. They can never disagree,
  -- because a definition for a field the Table never declared is refused here by name.
  if v_edef is not null then
    select array_agg(f ->> 'name') into v_names
      from custom.record t, jsonb_array_elements(coalesce(t.data -> 'fields', '[]'::jsonb)) f
     where t.organization_id = new.organization_id
       and t.id = v_edef
       and t.table_id = custom.table_kernel_id()
       and t.deleted_at is null;
    if v_names is null then
      raise exception 'the field % says it belongs to a table this organization does not have', v_label
        using errcode = '23514', hint = 'FLD-8: entity_definition_id names a Table record of the same organization.';
    end if;
    if not (v_key = any (v_names)) then
      raise exception 'the table does not declare a field called % - declare it there first', v_key
        using errcode = '23514',
              hint = 'REC-1 / FLD-8: a Table declares its fields and custom.field defines them. A definition for a field the table never declared would be a second source of truth.';
    end if;
  end if;

  return new;
end;
$function$
;
