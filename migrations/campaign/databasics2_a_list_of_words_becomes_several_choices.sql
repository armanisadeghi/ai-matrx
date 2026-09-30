-- additive: yes
-- based-on: custom._field_value_carry(uuid, jsonb, jsonb, jsonb) 62e381eed7f3d9d63b1ece48d258d697af3f725c86759cc402197098239d8484
--
-- DATA-V2-BASICS-2 (2026-09-30) — A LINE OF WORDS BECOMES SEVERAL CHOICES (BREAKER-3 B3-02, S2).
-- Measured on production: a Text column "Body Areas" holding "Lower back, Hip", "Knee, Hip" and
-- "Neck, Shoulder", changed to Multi-choice, kept each line as ONE value, and the Sheet printed
-- ["Lower back, Hip"] in orange. Into a column that holds several choices, text that is not itself one
-- of the column's choices is now read as the list it is — split on commas, semicolons and line breaks,
-- trimmed, blanks and repeats dropped — and each word finds its choice (or is kept as its words where
-- the column takes other values), exactly as a typed cell is read. One function body replaced; the
-- values already stored are not rewritten (a column changed again reads through this door).
-- Guard: scripts/campaign-tests/databasics2_a_list_of_words_becomes_several_choices.sql
-- Inverse: migrations/inverse/databasics2_a_list_of_words_becomes_several_choices_down.sql

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
-- DATA-V2-BASICS-2 (2026-09-30): a line of words carried into a several-choice column is split into its words.
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

  -- ── A LINE OF WORDS INTO SEVERAL CHOICES (DATA-V2-BASICS-2, 2026-09-30; BREAKER-3 B3-02) ──────
  -- A Text column holding "Lower back, Hip" changed to Multi-choice kept "Lower back, Hip" as ONE
  -- value, and the Sheet drew it as a JSON list. Into a column that holds several choices, text that
  -- is not itself one of its choices is read as the list it is: split on commas, semicolons and line
  -- breaks (the Sheet's own reading of typed words, cell-word.ts), trimmed, blanks and repeats dropped.
  if v_to_list and v_many_to and not v_from_list then
    v_words := '[]'::jsonb;
    for v_one in select e from jsonb_array_elements(v_items) e loop
      if jsonb_typeof(v_one) = 'string'
         and (v_one #>> '{}') ~ '[,;\n]'
         and custom.choice_key_of(v_to, btrim(v_one #>> '{}')) is null then
        v_words := v_words || coalesce((
          select jsonb_agg(to_jsonb(d.w) order by d.ord)
            from (select distinct on (lower(p.w)) p.w, p.ord
                    from (select regexp_replace(btrim(part), '\s+', ' ', 'g') as w, ord
                            from regexp_split_to_table(v_one #>> '{}', '[,;\n]') with ordinality s(part, ord)) p
                   where p.w <> ''
                   order by lower(p.w), p.ord) d), '[]'::jsonb);
      else
        v_words := v_words || jsonb_build_array(v_one);
      end if;
    end loop;
    v_items := v_words;
    v_words := '[]'::jsonb;
  end if;

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
