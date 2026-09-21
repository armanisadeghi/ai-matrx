-- 🚨 WHICH CHOICEVAL INVERSE IS MEANT TO RUN, AND IN WHAT ORDER (lane INVERSE-GUARD, 2026-09-21).
-- The validator body this file restores CALLS `custom.choice_field_map`, `custom.choice_synonyms`
-- and `custom.choice_words` — the three word helpers that the SIBLING inverse
-- `choiceval_a_choice_is_its_own_word_down.sql` takes away. The two are ALTERNATIVES, not a
-- sequence: each CHOICE-VAL red twin opens its own transaction, applies exactly ONE of the two
-- inverses, asks its questions and ends in ROLLBACK. Run this one ALONE. If a rehearsal ever
-- needs both defects in the same transaction, `choiceval_a_choice_is_its_own_word_down.sql` must
-- run LAST and must take this validator with it — the word helpers are what it exists to remove,
-- and a validator that calls them cannot outlive them.
-- ground-standing-ok: b  — the sibling is named above, the order is stated, and this file is run alone.
--
-- chair-step: the inverse of migrations/campaign/choiceval_the_validator_reads_the_fields_it_was_given.sql.
--   It puts back the validator that asked `custom.choice_field_map` for the Table named in the
--   first field's `entity_definition_id` — which a standard entity's custom field does not carry,
--   so every valid choice on `crm.party.custom_fields` was refused — and drops
--   custom.choice_synonyms_in. Running this restores that refusal.

set lock_timeout = '45s';
set statement_timeout = '600s';

CREATE OR REPLACE FUNCTION custom.validate_values(p_organization_id uuid, p_fields custom.record[], p_values jsonb, p_record_type text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  f        custom.record;
  d        jsonb;
  v_label  text;
  v_key    text;
  v_type   text;
  v_multi  boolean;
  v_val    jsonb;
  v_one    jsonb;
  v_items  jsonb;
  v_n      integer;
  v_rule   jsonb;
  v_kind   text;
  v_other  jsonb;
  v_table  uuid;
  v_map    jsonb;
  v_field  jsonb;
  v_types  text[];
begin
  if p_fields is null or array_length(p_fields, 1) is null then
    return;
  end if;

  -- CHOICE-VALUE. The type field's value is the option's KEY now, and `applies_to_types` was
  -- written by whoever declared the Field or the Rule - in words, in keys, or (before this
  -- lane) in option ids. All three name the same choice, so all three are asked. This is what
  -- keeps T8's Square rule attached to the square.
  v_table := (p_fields[1].data ->> 'entity_definition_id')::uuid;
  v_map   := case when v_table is null then '{}'::jsonb
                  else custom.choice_field_map(p_organization_id, v_table) end;
  v_types := case when p_record_type is null or v_table is null then '{}'::text[]
                  else custom.choice_synonyms(p_organization_id, v_table, p_record_type) end;

  foreach f in array p_fields loop
    d       := f.data;
    v_key   := d ->> 'key';
    v_label := coalesce(nullif(d ->> 'label', ''), v_key);
    v_type  := d ->> 'type';
    v_multi := coalesce((d ->> 'multi')::boolean, false);
    v_val   := p_values -> v_key;

    -- REQUIRED. An absent key and a null value are the same absence and are said the same way.
    if v_val is null or jsonb_typeof(v_val) = 'null'
       or (v_multi and jsonb_typeof(v_val) = 'array' and jsonb_array_length(v_val) = 0) then
      if coalesce((d ->> 'required')::boolean, false) then
        raise exception '% is required', v_label
          using errcode = '23514', hint = format('REC-51: the field %s of this table.', v_key);
      end if;
      continue;
    end if;

    -- A FORMULA IS NEVER WRITTEN BY HAND (FLD-9): the declaration says who computes it.
    if v_type = 'formula' then
      raise exception '% is worked out by the system, so it cannot be typed in', v_label
        using errcode = '23514',
              hint = format('FLD-9: this formula computes on %s.', coalesce(d ->> 'compute_on', 'write'));
    end if;

    -- MULTI (FLD-2) is about the SHAPE of the value, never about the behavior.
    if v_multi then
      if jsonb_typeof(v_val) <> 'array' then
        raise exception '% holds many values, so it takes a list', v_label
          using errcode = '23514', hint = 'FLD-2: the multi modifier.';
      end if;
      v_items := v_val;
    else
      if jsonb_typeof(v_val) = 'array' then
        raise exception '% holds one value, and it was given a list', v_label
          using errcode = '23514', hint = 'FLD-2: multi is off for this field.';
      end if;
      v_items := jsonb_build_array(v_val);
    end if;

    for v_one in select e from jsonb_array_elements(v_items) e loop
      -- TYPE.
      if v_type = 'text' then
        if jsonb_typeof(v_one) <> 'string' then
          raise exception '% takes words, and it was given a %', v_label, jsonb_typeof(v_one)
            using errcode = '23514', hint = 'FLD-1: text.';
        end if;
      elsif v_type = 'range' then
        if jsonb_typeof(v_one) = 'number' then
          null;
        elsif jsonb_typeof(v_one) = 'string'
              and coalesce(d -> 'config' ->> 'kind', 'number') in ('date', 'datetime') then
          begin
            perform (v_one #>> '{}')::timestamptz;
          exception when others then
            raise exception '% takes a date, and % is not one', v_label, v_one #>> '{}'
              using errcode = '23514', hint = 'FLD-1: range, of kind date.';
          end;
        else
          raise exception '% takes a number, and it was given a %', v_label, jsonb_typeof(v_one)
            using errcode = '23514', hint = 'FLD-1: range.';
        end if;
      elsif v_type = 'list' then
        if jsonb_typeof(v_one) <> 'string' then
          raise exception '% takes one of its choices, and it was given a %', v_label, jsonb_typeof(v_one)
            using errcode = '23514',
                  hint = 'FLD-5 / FLD-6: a list field stores the option''s own KEY - a short stable word - because every pick-list is already a Table.';
        end if;
        -- OPTION MEMBERSHIP. The value is the KEY of an option of this Field's own Table.
        -- A RETIRED option's key passes here ON PURPOSE: a record that already holds one has
        -- to stay editable when somebody changes a different column. Picking a retired choice
        -- ANEW is refused by custom._resolve_choice_words, which is the only place that can
        -- tell a new pick from a value that was already there.
        v_field := v_map -> v_key;
        if v_field is null
           or not (coalesce(v_field -> 'options', '{}'::jsonb) ? (v_one #>> '{}')) then
          raise exception '% was given a choice that is not one of its choices', v_label
            using errcode = '23514',
                  hint = format('REC-51: option membership. The choices for %s are %s.', v_label,
                                coalesce(custom.choice_words(coalesce(v_field, '{}'::jsonb)),
                                         'the records of its own table, and it has none yet'));
        end if;
      elsif v_type = 'relation' then
        if jsonb_typeof(v_one) <> 'string' then
          raise exception '% points at a record, and it was given a %', v_label, jsonb_typeof(v_one)
            using errcode = '23514', hint = 'FLD-1: relation.';
        end if;
        -- RELATION RULES. The target exists, in this organization, in the declared table.
        -- The id SHAPE first, for the same reason as the list branch above.
        if (v_one #>> '{}') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
          raise exception '% points at something that is not there', v_label
            using errcode = '23514',
                  hint = format('REC-51: %s stores the id of a record, and what it was given is not an id at all.', v_label);
        end if;
        if not exists (
          select 1 from custom.record t
           where t.organization_id = p_organization_id
             and t.id = (v_one #>> '{}')::uuid
             and t.table_id = (d ->> 'relation_target')::uuid
             and t.deleted_at is null) then
          raise exception '% points at something that is not there', v_label
            using errcode = '23514',
                  hint = 'REC-51: a relation field points at a live record of the table it declared.';
        end if;
      end if;

      -- FLD-3: the attached validation Rules, read through the ONE seam.
      -- FLD-10 says the type field selects which Fields AND RULES apply, so a Rule carries
      -- its own applies_to_types: T8's Width applies to a rectangle and to a square, and the
      -- "the sides are equal" Rule attached to it applies to the SQUARE alone. A Rule with an
      -- empty list applies wherever its Field does.
      for v_rule in select r from jsonb_array_elements(coalesce(d -> 'rules', '[]'::jsonb)) r loop
        if jsonb_array_length(coalesce(v_rule -> 'applies_to_types', '[]'::jsonb)) > 0
           and not (p_record_type is not null and (v_rule -> 'applies_to_types') ?| v_types) then
          continue;
        end if;
        v_kind := v_rule ->> 'kind';
        if v_kind = 'min' and jsonb_typeof(v_one) = 'number'
           and (v_one #>> '{}')::numeric < (v_rule ->> 'value')::numeric then
          raise exception '% has to be at least %', v_label, v_rule ->> 'value'
            using errcode = '23514', hint = 'FLD-3: an attached validation Rule, not a behavior.';
        elsif v_kind = 'max' and jsonb_typeof(v_one) = 'number'
              and (v_one #>> '{}')::numeric > (v_rule ->> 'value')::numeric then
          raise exception '% cannot be more than %', v_label, v_rule ->> 'value'
            using errcode = '23514', hint = 'FLD-3: an attached validation Rule, not a behavior.';
        elsif v_kind = 'length' and jsonb_typeof(v_one) = 'string'
              and length(v_one #>> '{}') > (v_rule ->> 'value')::integer then
          raise exception '% is longer than % characters', v_label, v_rule ->> 'value'
            using errcode = '23514', hint = 'FLD-3.';
        elsif v_kind = 'pattern' and jsonb_typeof(v_one) = 'string'
              and (v_one #>> '{}') !~ (v_rule ->> 'value') then
          raise exception '% is not written the way this field expects', v_label
            using errcode = '23514', hint = 'FLD-3.';
        elsif v_kind = 'equals_field' then
          v_other := p_values -> (v_rule ->> 'value');
          if v_other is not null and jsonb_typeof(v_other) <> 'null' and v_other <> v_one then
            raise exception '% and % have to be the same', v_label, v_rule ->> 'value'
              using errcode = '23514',
                    hint = 'FLD-3 / T8: a constraint across two fields is a Rule attached to one of them, never a behavior.';
          end if;
        elsif v_kind = 'differs_from_field' then
          v_other := p_values -> (v_rule ->> 'value');
          if v_other is not null and v_other = v_one then
            raise exception '% and % have to be different', v_label, v_rule ->> 'value'
              using errcode = '23514', hint = 'FLD-3.';
          end if;
        end if;
      end loop;
    end loop;

    -- RELATION MAX, once per field rather than once per item.
    if v_type = 'relation' and v_multi then
      v_n := jsonb_array_length(v_items);
      if v_n > coalesce((d ->> 'relation_max')::integer, v_n) then
        raise exception '% points at % things, and it can point at % at most',
                        v_label, v_n, d ->> 'relation_max'
          using errcode = '23514', hint = 'REC-51: relation_max.';
      end if;
    end if;
  end loop;
end;
$function$

;

drop function if exists custom.choice_synonyms_in(jsonb, text);
