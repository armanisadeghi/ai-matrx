-- chair-step: the inverse of migrations/campaign/choiceval_a_choice_is_its_own_word.sql. It puts
--   back the four bodies that file replaced — custom._options_table_for,
--   custom._resolve_choice_words, custom.validate_values and custom.applicable_fields, exactly as
--   the live catalogue rendered them at 2026-09-20 06:35Z — and DROPS the seven helper functions
--   that file created. After this runs a choice value is an option record's uuid again, which is
--   the defect T8 names; it exists so the red twin can execute these bytes and prove the fix was
--   real.

set lock_timeout = '5s';
set statement_timeout = '600s';

CREATE OR REPLACE FUNCTION custom._options_table_for(p_organization_id uuid, p_label text, p_options jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_home  uuid;
  v_table uuid;
  v_slug  text;
  v_word  text;
begin
  v_slug := regexp_replace(lower(btrim(coalesce(p_label, 'choices'))), '[^a-z0-9]+', '_', 'g');
  v_slug := regexp_replace(v_slug, '^_+|_+$', '', 'g');
  if v_slug !~ '^[a-z]' then v_slug := 'c_' || v_slug; end if;
  v_slug := left(v_slug || '_choices_' || replace(gen_random_uuid()::text, '-', ''), 48);

  insert into custom.record (organization_id, table_id, data)
  values (p_organization_id, custom.person_kernel_id(),
          jsonb_build_object('name', coalesce(p_label, 'Choices') || ' choices Home'))
  returning id into v_home;

  insert into custom.record (organization_id, table_id, data_class, data)
  values (p_organization_id, custom.table_kernel_id(), 'table', jsonb_build_object(
    'name',           coalesce(p_label, 'Choices') || ' choices',
    'slug',           v_slug,
    'type',           'entity',
    'label_singular', 'Choice',
    'label_plural',   'Choices',
    'display',        'list',
    'weight',         'light',
    'ordered',        true,
    'row_order',      'manual',
    'title_field',    'title',
    'retention_days', 365,
    'agent_writable', true,
    'default_sort',   jsonb_build_array(jsonb_build_object('field', 'title', 'direction', 'asc')),
    'fields',         jsonb_build_array(jsonb_build_object('name', 'title')),
    'kept_by_the_app', true,
    'parent_id',      v_home))
  returning id into v_table;

  insert into custom.record (organization_id, table_id, data)
  values (p_organization_id, custom.field_kernel_id(), jsonb_build_object(
    'key', 'title', 'label', 'Choice', 'type', 'text',
    'multi', false, 'dated', false, 'required', false, 'sort', 10,
    'rules', '[]'::jsonb, 'config', '{}'::jsonb, 'source', 'manual',
    'source_config', '{}'::jsonb, 'sensitivity', 'internal',
    'context_policy', 'include', 'applies_to_types', '[]'::jsonb,
    'depends_on', '[]'::jsonb, 'entity_definition_id', v_table));

  for v_word in select value #>> '{}' from jsonb_array_elements(coalesce(p_options, '[]'::jsonb)) loop
    if btrim(coalesce(v_word, '')) <> '' then
      insert into custom.record (organization_id, table_id, data)
      values (p_organization_id, v_table, jsonb_build_object('title', btrim(v_word)));
    end if;
  end loop;

  return v_table;
end
$function$;

CREATE OR REPLACE FUNCTION custom._resolve_choice_words()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  f        record;
  v_key    text;
  v_label  text;
  v_opts   uuid;
  v_val    jsonb;
  v_one    jsonb;
  v_word   text;
  v_id     uuid;
  v_out    jsonb;
  v_items  jsonb;
  v_new    jsonb;
  v_choices text;
begin
  if new.table_id is null or new.data_class = 'kernel'
     or new.table_id in (custom.field_kernel_id(), custom.table_kernel_id(),
                         custom.rule_kernel_id(), custom.merge_field_kernel_id()) then
    return new;
  end if;
  if new.data is null or jsonb_typeof(new.data) <> 'object' then
    return new;
  end if;

  for f in
    select r.data as d from custom.record r
     where r.organization_id = new.organization_id
       and r.table_id = custom.field_kernel_id()
       and r.deleted_at is null
       and r.data_class <> 'kernel'
       and (r.data ->> 'entity_definition_id')::uuid = new.table_id
       and r.data ->> 'type' = 'list'
  loop
    v_key  := f.d ->> 'key';
    v_label := coalesce(nullif(f.d ->> 'label', ''), v_key);
    v_opts := nullif(f.d -> 'config' ->> 'options_table_id', '')::uuid;
    v_val  := new.data -> v_key;
    if v_opts is null or v_val is null or jsonb_typeof(v_val) = 'null' then
      continue;
    end if;

    v_items := case when jsonb_typeof(v_val) = 'array' then v_val else jsonb_build_array(v_val) end;
    v_out   := '[]'::jsonb;

    for v_one in select e from jsonb_array_elements(v_items) e loop
      if jsonb_typeof(v_one) <> 'string' then
        v_out := v_out || jsonb_build_array(v_one);
        continue;
      end if;
      v_word := btrim(v_one #>> '{}');
      if v_word ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        v_out := v_out || jsonb_build_array(v_one);
        continue;
      end if;
      select o.id into v_id
        from custom.record o
       where o.organization_id = new.organization_id
         and o.table_id = v_opts
         and o.deleted_at is null
         and lower(btrim(o.data ->> 'title')) = lower(v_word)
       order by o.created_at
       limit 1;
      if v_id is null then
        select string_agg('"' || (o.data ->> 'title') || '"', ', ' order by o.created_at)
          into v_choices
          from custom.record o
         where o.organization_id = new.organization_id
           and o.table_id = v_opts
           and o.deleted_at is null;
        raise exception '% does not have a choice called "%".', v_label, v_word
          using errcode = '23514',
                hint = format('The choices for %s are %s. Pick one of those, or add "%s" to the column''s list of choices first.',
                              v_label, coalesce(v_choices, 'not set up yet'), v_word);
      end if;
      v_out := v_out || jsonb_build_array(to_jsonb(v_id::text));
    end loop;

    v_new := case when jsonb_typeof(v_val) = 'array' then v_out else v_out -> 0 end;
    if v_new is distinct from v_val then
      new.data := new.data || jsonb_build_object(v_key, v_new);
    end if;
  end loop;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION custom.applicable_fields(p_organization_id uuid, p_table_id uuid, p_record_type text DEFAULT NULL::text)
 RETURNS SETOF custom.record
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
begin
  perform custom.assert_store_door(p_organization_id, 'custom.applicable_fields');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.applicable_fields');
  perform custom.assert_may_know_table(p_organization_id, p_table_id, 'custom.applicable_fields');

  return query
    select f.*
      from custom.record f
     where f.organization_id = p_organization_id
       and f.table_id = custom.field_kernel_id()
       and f.deleted_at is null
       and (f.data ->> 'entity_definition_id')::uuid = p_table_id
       and (jsonb_array_length(coalesce(f.data -> 'applies_to_types', '[]'::jsonb)) = 0
            or (p_record_type is not null
                and coalesce(f.data -> 'applies_to_types', '[]'::jsonb) ? p_record_type));
end $function$;

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
begin
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
                  hint = 'FLD-5 / FLD-6: a list field stores the id of the option RECORD, because every pick-list is already a Table.';
        end if;
        -- OPTION MEMBERSHIP. The value is an option RECORD of the options Table. The id
        -- SHAPE is checked first: a cast failure would refuse the write with Postgres's own
        -- 22P02 and never name the field, which is a refusal nobody can act on.
        if (v_one #>> '{}') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
          raise exception '% was given a choice that is not one of its choices', v_label
            using errcode = '23514',
                  hint = format('REC-51: option membership. %s stores the id of an option record, and what it was given is not an id at all.', v_label);
        end if;
        if not exists (
          select 1 from custom.record o
           where o.organization_id = p_organization_id
             and o.id = (v_one #>> '{}')::uuid
             and o.table_id = (d -> 'config' ->> 'options_table_id')::uuid
             and o.deleted_at is null) then
          raise exception '% was given a choice that is not one of its choices', v_label
            using errcode = '23514',
                  hint = format('REC-51: option membership. The choices for %s are the records of its own table.', v_label);
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
           and not (p_record_type is not null and (v_rule -> 'applies_to_types') ? p_record_type) then
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

-- 🚨 THREE OF THE SEVEN HELPERS ARE SHARED INFRASTRUCTURE NOW, AND THIS INVERSE STOPS
-- DEMOLISHING THEM (lane INVERSE-GUARD, 2026-09-21).
--
-- This file used to drop all seven, because CHOICE-VAL's up-file created all seven. Three of
-- them have since been adopted by bodies that live on the write path of OTHER lanes, and the
-- catalogue says so out loud:
--   · `custom.choice_field_map` and `custom.choice_key_of` are reached by `zz_ckl_step_guard`
--     and `zz_ckl_watch` on `custom.record` (CHECKLISTS, through
--     `custom._checklist_step_guard` / `custom._checklist_watch`) and by `zz_w3_work_shape_guard`
--     on `custom.record` (W3-WORK, through `custom._work_shape_guard`);
--   · `custom.choice_options` is called by `custom._pipeline_stage_key`
--     (`pipelines_a_stage_is_a_field_and_its_moves_are_rules.sql`).
-- Dropping them left those triggers attached over functions that were gone, so the next write
-- to `custom.record` inside the red twin's transaction would have died on
-- `function custom.choice_field_map(uuid, uuid) does not exist` before the twin asked its first
-- question. That is not the defect this file exists to restore; it is a broken table.
--
-- WHAT THE DEFECT ACTUALLY IS: a choice value is an option record's uuid again, and the
-- renderer, the validator and the applicability reader know nothing about choice WORDS. That is
-- restored IN FULL by the four bodies above — the live catalogue's own bytes from 2026-09-20
-- 06:35Z, none of which calls a choice helper. The three helpers stay standing and nothing on
-- the choice path reads them any more, which is precisely the defect.
drop function if exists custom.choice_synonyms(uuid, uuid, text);
drop function if exists custom.choice_words(jsonb);
drop function if exists custom.choice_key_for(uuid, uuid, text, uuid);
drop function if exists custom.choice_slug(text);
