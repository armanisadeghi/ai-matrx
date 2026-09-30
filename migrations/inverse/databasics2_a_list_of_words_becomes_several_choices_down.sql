-- INVERSE of databasics2_a_list_of_words_becomes_several_choices.sql: the body it replaced, byte for byte.
-- based-on: custom._field_value_carry(uuid, jsonb, jsonb, jsonb) 77ed55ac156d3f496b5b8be6ce6d9ea8b946946693e071f4092a3152c9723a56

CREATE OR REPLACE FUNCTION custom._field_value_carry(p_organization_id uuid, p_from jsonb, p_to jsonb, p_value jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
-- ONE VALUE, CARRIED FROM WHAT A COLUMN WAS TO WHAT IT IS NOW (DATA-V2-BASICS-2, 2026-09-28).
-- custom.field_value_convert judges a value by the new behaviour alone, and a choice column's cell
-- holds the choice's KEY — so a choice column changed to Text read "in_stock" in every cell, and a
-- Text column changed to a choice column set every word aside, even the ones naming a choice.
-- Here a held choice goes by its own words, and words (or a key, or an option's id) find their
-- choice. Returns SQL null when the value does not fit, and the caller keeps it in `_retired`.
-- Neither side a choice column: exactly custom.field_value_convert.
declare
  v_from_list boolean := coalesce(p_from ->> 'type', '') = 'list';
  v_to_list   boolean := coalesce(p_to ->> 'type', '') = 'list';
  v_from_tbl  uuid    := case when v_from_list then nullif(p_from -> 'config' ->> 'options_table_id', '')::uuid end;
  v_to_tbl    uuid    := case when v_to_list then nullif(p_to -> 'config' ->> 'options_table_id', '')::uuid end;
  v_from      jsonb;
  v_to        jsonb;
  v_items     jsonb;
  v_words     jsonb := '[]'::jsonb;
  v_out       jsonb := '[]'::jsonb;
  v_one       jsonb;
  v_tok       text;
  v_word      text;
  v_k         text;
  v_hit       text;
  v_allow     boolean := coalesce((p_to -> 'config' ->> 'allow_other')::boolean, false);
  v_many_to   boolean := coalesce((p_to ->> 'multi')::boolean, false);
begin
  if p_value is null or jsonb_typeof(p_value) = 'null' then
    return p_value;
  end if;
  if not v_from_list and not v_to_list then
    return custom.field_value_convert(p_to, p_value);
  end if;
  if jsonb_typeof(p_value) = 'object' then
    return null;
  end if;

  v_from := jsonb_build_object('options', case when v_from_tbl is null then '{}'::jsonb
                                               else custom.choice_options(p_organization_id, v_from_tbl) end);
  v_to   := jsonb_build_object('options', case when v_to_tbl is null then '{}'::jsonb
                                               else custom.choice_options(p_organization_id, v_to_tbl) end);
  v_items := case when jsonb_typeof(p_value) = 'array' then p_value else jsonb_build_array(p_value) end;

  -- ── INTO A CHOICE COLUMN ─────────────────────────────────────────────────────────────
  if v_to_list then
    for v_one in select e from jsonb_array_elements(v_items) e loop
      if jsonb_typeof(v_one) in ('object', 'array') then
        return null;
      end if;
      v_tok  := btrim(v_one #>> '{}');
      v_word := v_tok;
      v_hit  := null;
      if v_from_list then
        v_k := custom.choice_key_of(v_from, v_tok);
        if v_k is not null then
          v_word := coalesce(v_from -> 'options' -> v_k ->> 'label', v_tok);
        end if;
      end if;
      if v_from_list and v_from_tbl is not distinct from v_to_tbl then
        -- The same list: the key it held is still the key, a retired one included.
        v_hit := custom.choice_key_of(v_to, v_tok);
      else
        v_hit := coalesce(custom.choice_key_of(v_to, v_word), custom.choice_key_of(v_to, v_tok));
        -- Nothing retired is picked anew.
        if v_hit is not null and coalesce((v_to -> 'options' -> v_hit ->> 'retired')::boolean, false) then
          v_hit := null;
        end if;
      end if;
      if v_hit is not null then
        v_out := v_out || jsonb_build_array(to_jsonb(v_hit));
      elsif v_allow and v_word <> '' then
        v_out := v_out || jsonb_build_array(to_jsonb(v_word));   -- an other value, kept as its words
      else
        return null;
      end if;
    end loop;
    if v_many_to then
      return v_out;
    end if;
    if jsonb_array_length(v_out) = 0 then
      return 'null'::jsonb;
    end if;
    if jsonb_array_length(v_out) = 1 then
      return v_out -> 0;
    end if;
    return null;                            -- several choices do not fit one; kept, never dropped
  end if;

  -- ── OUT OF A CHOICE COLUMN: each held choice becomes its words ────────────────────────
  for v_one in select e from jsonb_array_elements(v_items) e loop
    if jsonb_typeof(v_one) = 'string' then
      v_k := custom.choice_key_of(v_from, v_one #>> '{}');
      v_words := v_words || jsonb_build_array(
        case when v_k is not null then coalesce(v_from -> 'options' -> v_k -> 'label', v_one) else v_one end);
    else
      v_words := v_words || jsonb_build_array(v_one);
    end if;
  end loop;
  if jsonb_array_length(v_words) = 0 then
    return 'null'::jsonb;
  end if;
  if jsonb_array_length(v_words) = 1 then
    return custom.field_value_convert(p_to, v_words -> 0);
  end if;
  if coalesce(p_to ->> 'type', '') = 'text' then
    -- Several choices read as one line of words: "Gloves, Masks".
    return to_jsonb((select string_agg(e #>> '{}', ', ' order by ord)
                       from jsonb_array_elements(v_words) with ordinality t(e, ord)));
  end if;
  return null;                              -- several choices are not one number, date or tick
end;
$function$

;
