-- additive: yes
-- guard: custom/system_enabled
-- based-on: custom.io_infer_column(uuid, uuid, text, jsonb) b33c54cd5c1525f9f030b277e4e4d30550eac204532c52026a5b70d08c1ebda5
-- based-on: custom.io_import_plan(uuid, uuid, jsonb) 0f1e5ac466b28b695c778cd9fd3f9030440bdd80838724a82ace7a16e2549f6d
--
-- LANE IMPORT — THE FIRST QUESTION ANYBODY ASKS IS ABOUT A TABLE THAT DOES NOT EXIST YET.
--
-- "Pull my spreadsheet in" is almost never "into this table I already built". The table is
-- what the file is FOR, and it has to be worked out from the file before anything can be
-- created. Both planning doors required a `p_table_id`, so the one case the product is named
-- after could not be asked at all — and an agent that wanted a new table from a file would
-- have had to infer the columns in Python, which is a SECOND type vocabulary and the exact
-- thing every other part of this lane exists to prevent.
--
-- `p_table_id` may now be NULL, and it means exactly one thing: this table does not exist
-- yet, so judge every column on its own values. Every arm of `custom.io_infer_column` already
-- worked that way — money, dates, percentages, links, phone numbers, choices, plain numbers
-- and the relation candidate all read the file, not the table. Only the FIRST arm needs a
-- table ("this table already has a column called …") and it is SKIPPED, not reproduced
-- elsewhere. `custom.io_import_plan` answers an empty `fields` list for the same reason: a
-- table that does not exist has no columns, and saying so is not the same as saying nothing.
--
-- THE WALL IS NOT WEAKENED. `custom.assert_client_may_reach` still runs first and always; it
-- is `assert_may_know_table` that is asked only when there IS a table to ask about, which is
-- the honest reading of a question about a file. The relation arm inside still asks that
-- question of every candidate Table it considers, so a column can never be pointed at
-- somebody's Table by somebody who may not see it.

CREATE OR REPLACE FUNCTION custom.io_import_plan(p_organization_id uuid, p_table_id uuid, p_columns jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_col   jsonb;
  v_out   jsonb := '[]'::jsonb;
  v_one   jsonb;
  v_seen  text[] := array[]::text[];
  v_key   text;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.io_import_plan');
  -- Null means "this table does not exist yet" — see custom.io_infer_column. There is no
  -- table to ask about, and nothing is read that belongs to one.
  if p_table_id is not null then
    perform custom.assert_may_know_table(p_organization_id, p_table_id, 'custom.io_import_plan');
  end if;
  if jsonb_typeof(p_columns) is distinct from 'array' then
    raise exception 'A file''s columns are a list, and this is a %.', coalesce(jsonb_typeof(p_columns), 'nothing')
      using errcode = '22023',
            hint = 'Send [{"header":"Crew name","samples":["North","South"]}, …].';
  end if;

  for v_col in select value from jsonb_array_elements(p_columns) loop
    v_one := custom.io_infer_column(p_organization_id, p_table_id,
                                    v_col ->> 'header', coalesce(v_col -> 'samples', '[]'::jsonb));
    -- TWO COLUMNS THAT WOULD MAKE THE SAME KEY IS A THING THE FILE DID, AND IT IS SAID HERE
    -- RATHER THAN DISCOVERED AT DECLARATION TIME AS "this table already has a field called …".
    v_key := v_one ->> 'field_key';
    if v_key = any (v_seen) and not (v_one ->> 'matched')::boolean then
      v_one := v_one || jsonb_build_object(
        'collides_with', v_key,
        'why', format('%s Another column in this file would make the same column name — rename one of them in the file, or map this one by hand.',
                      v_one ->> 'why'));
    end if;
    v_seen := v_seen || v_key;
    v_out := v_out || jsonb_build_array(v_one || jsonb_build_object('samples', coalesce(v_col -> 'samples', '[]'::jsonb)));
  end loop;

  return jsonb_build_object(
    'table_id', p_table_id,
    'columns',  v_out,
    'matched',   (select count(*) from jsonb_array_elements(v_out) c where (c ->> 'matched')::boolean),
    'unmatched', (select count(*) from jsonb_array_elements(v_out) c where not (c ->> 'matched')::boolean),
    'fields',   case when p_table_id is null then '[]'::jsonb else coalesce((select jsonb_agg(jsonb_build_object(
                            'field_id', f.id, 'key', f.data ->> 'key',
                            'label', f.data ->> 'label',
                            'type', coalesce(custom.parity_type(f.data), f.data ->> 'type'))
                            order by f.data ->> 'key')
                            from custom.applicable_fields(p_organization_id, p_table_id, null) f), '[]'::jsonb) end);
end;
$function$;

CREATE OR REPLACE FUNCTION custom.io_infer_column(p_organization_id uuid, p_table_id uuid, p_header text, p_samples jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_head    text := btrim(coalesce(p_header, ''));
  v_norm    text;
  v_field   record;
  v_words   text[];
  v_n       integer;
  v_distinct text[];
  v_d       integer;
  v_unit    text;
  v_target  uuid;
  v_avg     numeric;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.io_infer_column');
  -- A TABLE THAT DOES NOT EXIST YET IS A REAL QUESTION, AND IT IS THE FIRST ONE ANYBODY
  -- ASKS. "Pull my spreadsheet in" has no table to match against — the table is what the
  -- file is FOR. `p_table_id` null means exactly that: judge every column on its own
  -- values. Every arm below already works that way; only the first one needs a table, and
  -- it is skipped rather than reproduced somewhere else.
  if p_table_id is not null then
    perform custom.assert_may_know_table(p_organization_id, p_table_id, 'custom.io_infer_column');
  end if;
  if v_head = '' then
    raise exception 'A column with no heading cannot be matched to anything.'
      using errcode = '22004',
            hint = 'Give the column a heading in the file, or map it by hand.';
  end if;

  v_norm := btrim(regexp_replace(lower(v_head), '[^a-z0-9]+', '_', 'g'), '_');

  -- ── 1. A COLUMN THIS TABLE ALREADY HAS. Asked first, always: a file whose header says
  --       what the Table already calls something is not a new column, however its values
  --       happen to look.
  if p_table_id is not null then
  select f.id,
         f.data ->> 'key'   as key,
         f.data ->> 'label' as label,
         coalesce(custom.parity_type(f.data), f.data ->> 'type') as parity
    into v_field
    from custom.applicable_fields(p_organization_id, p_table_id, null) f
   where lower(coalesce(f.data ->> 'key', ''))   = lower(v_head)
      or lower(coalesce(f.data ->> 'label', '')) = lower(v_head)
      or coalesce(f.data ->> 'key', '')          = v_norm
   order by case when lower(coalesce(f.data ->> 'key', '')) = lower(v_head) then 0
                 when lower(coalesce(f.data ->> 'label', '')) = lower(v_head) then 1
                 else 2 end
   limit 1;
  if found then
    return jsonb_build_object(
      'header',   v_head,
      'field_id', v_field.id,
      'field_key',v_field.key,
      'label',    v_field.label,
      'type',     v_field.parity,
      'matched',  true,
      'why',      format('This table already has a column called "%s".', coalesce(v_field.label, v_field.key)));
  end if;
  end if;

  select array_agg(word) into v_words from custom.io_sample_words(p_samples);
  v_words := coalesce(v_words, array[]::text[]);
  v_n := cardinality(v_words);

  if v_n = 0 then
    return jsonb_build_object('header', v_head, 'field_id', null, 'field_key', v_norm,
                              'label', v_head, 'type', 'text', 'matched', false,
                              'why', 'Every row in this column is empty, so there is nothing to go on. Text holds anything.');
  end if;

  -- ── 2. AN EMAIL — AND THE STORE KNOWS WHETHER IT IS ONE OF YOURS.
  if not exists (select 1 from unnest(v_words) w where w !~ '^[^@\s]+@[^@\s]+[.][^@\s]+$') then
    if not exists (
      select 1 from unnest(v_words) w
       where not exists (select 1 from iam.organization_member m
                           join auth.users u on u.id = m.user_id
                          where m.organization_id = p_organization_id
                            and lower(u.email::text) = lower(w)))
    then
      return jsonb_build_object('header', v_head, 'field_id', null, 'field_key', v_norm,
                                'label', v_head, 'type', 'member', 'matched', false,
                                'why', 'Every address in this column belongs to somebody in this organization, so it is a person.');
    end if;
    return jsonb_build_object('header', v_head, 'field_id', null, 'field_key', v_norm,
                              'label', v_head, 'type', 'email', 'matched', false,
                              'why', 'Every value is an email address.');
  end if;

  -- ── 3. MONEY. The unit is the currency and it is read off the values themselves.
  if not exists (select 1 from unnest(v_words) w
                  where w !~ '^[-(]?\s*[$€£¥]\s*[0-9][0-9, ]*([.][0-9]{1,2})?\s*[)]?$'
                    and upper(w) !~ '^[-]?[0-9][0-9, ]*([.][0-9]{1,2})?\s*(USD|EUR|GBP|CAD|AUD)$') then
    select custom.io_money_unit(w) into v_unit from unnest(v_words) w
     where custom.io_money_unit(w) is not null limit 1;
    return jsonb_build_object('header', v_head, 'field_id', null, 'field_key', v_norm,
                              'label', v_head, 'type', 'currency', 'unit', coalesce(v_unit, 'USD'),
                              'matched', false,
                              'why', format('Every value is an amount of money in %s.', coalesce(v_unit, 'USD')));
  end if;

  -- ── 4. A PERCENTAGE.
  if not exists (select 1 from unnest(v_words) w where w !~ '^-?[0-9]+([.][0-9]+)?\s*%$') then
    return jsonb_build_object('header', v_head, 'field_id', null, 'field_key', v_norm,
                              'label', v_head, 'type', 'percent', 'matched', false,
                              'why', 'Every value is a percentage.');
  end if;

  -- ── 5. A DATE. ISO first because it is unambiguous; the slashed forms are accepted and
  --       the ambiguity between day-first and month-first is said out loud rather than
  --       silently resolved, because getting it wrong is invisible until March.
  if not exists (select 1 from unnest(v_words) w
                  where w !~ '^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2})?([.]\d+)?(Z|[+-]\d{2}:?\d{2})?)?$') then
    return jsonb_build_object('header', v_head, 'field_id', null, 'field_key', v_norm,
                              'label', v_head, 'type', 'datetime', 'matched', false,
                              'why', 'Every value is a date written year-month-day.');
  end if;
  if not exists (select 1 from unnest(v_words) w where w !~ '^\d{1,2}/\d{1,2}/\d{2,4}$') then
    return jsonb_build_object('header', v_head, 'field_id', null, 'field_key', v_norm,
                              'label', v_head, 'type', 'datetime', 'matched', false,
                              'ambiguous', true,
                              'why', 'Every value is a date with slashes. Which number is the day cannot be read off the file — check a row you know before you run this.');
  end if;

  -- ── 6. A LINK.
  if not exists (select 1 from unnest(v_words) w where w !~ '^https?://[^\s]+$') then
    return jsonb_build_object('header', v_head, 'field_id', null, 'field_key', v_norm,
                              'label', v_head, 'type', 'url', 'matched', false,
                              'why', 'Every value is a web address.');
  end if;

  -- ── 7. A PHONE NUMBER. Deliberately narrow: enough punctuation and enough digits.
  if not exists (select 1 from unnest(v_words) w
                  where w !~ '^[+]?[0-9][0-9 ()./-]{6,19}$'
                     or length(regexp_replace(w, '[^0-9]', '', 'g')) not between 7 and 15) then
    return jsonb_build_object('header', v_head, 'field_id', null, 'field_key', v_norm,
                              'label', v_head, 'type', 'phone', 'matched', false,
                              'why', 'Every value is a phone number.');
  end if;

  -- ── 8. A CHOICE. A column of a few repeating words is a dropdown, and this is the arm
  --       that turns a spreadsheet into something a dashboard can group by. It is asked
  --       BEFORE the plain-number arm on purpose only for non-numeric words: a column of
  --       twelve repeating numbers is a number, not a dropdown of numbers.
  select array_agg(distinct w order by w) into v_distinct from unnest(v_words) w;
  v_d := cardinality(v_distinct);
  if v_n >= 5 and v_d between 2 and 12 and v_d::numeric <= v_n::numeric * 0.4
     and exists (select 1 from unnest(v_words) w where w !~ '^[+-]?[0-9]+([.][0-9]+)?$')
     and not exists (select 1 from unnest(v_words) w where length(w) > 60) then
    return jsonb_build_object('header', v_head, 'field_id', null, 'field_key', v_norm,
                              'label', v_head, 'type', 'select',
                              'options', to_jsonb(v_distinct), 'matched', false,
                              'why', format('This column holds only %s different words over %s rows, so it is a list of choices.', v_d, v_n));
  end if;

  -- ── 9. A PLAIN NUMBER.
  if not exists (select 1 from unnest(v_words) w where w !~ '^[+-]?[0-9]{1,15}([.][0-9]+)?$') then
    return jsonb_build_object('header', v_head, 'field_id', null, 'field_key', v_norm,
                              'label', v_head, 'type', 'number', 'matched', false,
                              'why', 'Every value is a number.');
  end if;

  -- ── 10. A POINTER AT ANOTHER OF YOUR TABLES.
  v_target := custom.io_relation_candidate(p_organization_id, p_table_id,
                (select array_agg(distinct w) from unnest(v_words[1:12]) w));
  if v_target is not null then
    return jsonb_build_object('header', v_head, 'field_id', null, 'field_key', v_norm,
                              'label', v_head, 'type', 'relation',
                              'relation_target', v_target, 'matched', false,
                              'why', format('Every value in this column is the name of a record in "%s", so this column points at it.',
                                            coalesce((select r.data ->> 'name' from custom.record r
                                                       where r.organization_id = p_organization_id and r.id = v_target),
                                                     'another table')));
  end if;

  -- ── 11. WORDS. Long ones get the long editor, because a paragraph in a one-line box is
  --        the small, constant annoyance nobody files a bug about.
  select avg(length(w)) into v_avg from unnest(v_words) w;
  return jsonb_build_object('header', v_head, 'field_id', null, 'field_key', v_norm,
                            'label', v_head,
                            'type', case when coalesce(v_avg, 0) > 120 then 'long_text' else 'text' end,
                            'matched', false,
                            'why', case when coalesce(v_avg, 0) > 120
                                        then 'These values are long, so this is a paragraph of text.'
                                        else 'Nothing about these values says they are anything more particular than text.' end);
end;
$function$

;
