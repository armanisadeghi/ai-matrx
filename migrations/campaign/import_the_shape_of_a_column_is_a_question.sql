-- additive: yes
-- guard: custom/system_enabled
--
-- chair-step: it GRANTS EXECUTE to `authenticated` on TWO new functions of schema `custom`
--   (`custom.io_infer_column`, `custom.io_import_plan`). Both are SECURITY DEFINER, both ask
--   the organization wall and the switch by name before they read anything, and NEITHER
--   WRITES: they answer a question about a file a person is holding. Three further functions
--   are created without any grant at all (`custom.io_sample_words`, `custom.io_money_unit`,
--   `custom.io_relation_candidate`) because they are the internals of the two doors. Nothing
--   is dropped, nothing is revoked, nothing existing is replaced. The inverse is
--   `migrations/inverse/import_the_shape_of_a_column_is_a_question_down.sql`.
--
-- LANE IMPORT — WHAT KIND OF COLUMN IS THIS, ASKED OF THE STORE AND NOT OF THE PERSON.
--
-- SCR-10 says the wizard "maps a file's columns onto Fields". W4-IO's `custom.io_infer_type`
-- did the honest minimum with no context at all: number, checkbox, date, email, text, decided
-- from the sample strings alone. It knew nothing about the Table, so it could never answer the
-- four questions that actually decide whether an import is work or magic:
--
--   * `$1,250.00` is MONEY, and money in this store is a range whose unit is the currency and
--     whose format is currency (FLD-N-1). Read as text it sorts as a string, never sums, and
--     never renders with a symbol. Read as a number it loses the currency.
--   * A column holding `Booked / Held / Cancelled` over 5,000 rows is a CHOICE with three
--     options, not five thousand free-text strings. This is the difference between a column
--     you can group a dashboard by and one you cannot.
--   * `dana@example.com` in a column is an EMAIL — unless that address belongs to somebody in
--     this organization, in which case it is a PERSON, and the store already knows which
--     because it knows the roster.
--   * `Northwind Trading` in a column, when every other value in that column is the title of a
--     record in the `Accounts` table, is a RELATION. Airtable's importer offers exactly this
--     and it is the single largest thing that turns a flat spreadsheet into a database.
--
-- THE MAP IS THE STORE'S OWN. Every answer is a word `custom.parity_field_types()` knows, or
-- one of the three plain ones (`text`, `long_text`, `number`) that `custom._field_document_for`
-- takes — so the answer this door gives can be handed straight to `custom.field_declare` with
-- nothing in between to reinterpret it. There is no second type vocabulary anywhere in the
-- import path, and a word this file invented would be refused by name at declaration time.
--
-- CONSERVATIVE, AND IT SAYS WHY. Every arm requires EVERY non-empty sample to agree. One
-- ragged value and the column falls through to the next arm and finally to `text`, because a
-- guess that is wrong makes a person repair data later while a guess that is `text` makes them
-- change a dropdown now. Each answer carries `why` — one sentence, in words a person reads —
-- so the wizard never shows a type badge nobody can argue with.


-- ── the non-empty samples, as words. Every arm reads this and only this. ─────────────
create or replace function custom.io_sample_words(p_samples jsonb)
returns table(word text)
language sql
immutable
set search_path to 'pg_catalog'
as $function$
  select btrim(v #>> '{}')
    from jsonb_array_elements(case when jsonb_typeof(p_samples) = 'array' then p_samples else '[]'::jsonb end) v
   where v #>> '{}' is not null and btrim(v #>> '{}') <> '';
$function$;

-- ── the currency a money column is written in. The SYMBOL and the CODE are both read,
--    because a spreadsheet exported from anywhere writes one or the other. ────────────
create or replace function custom.io_money_unit(p_word text)
returns text
language sql
immutable
set search_path to 'pg_catalog'
as $function$
  select case
           when p_word ~ '[$]'  then 'USD'
           when p_word ~ '€'    then 'EUR'
           when p_word ~ '£'    then 'GBP'
           when p_word ~ '¥'    then 'JPY'
           when upper(p_word) ~ '\mUSD\M' then 'USD'
           when upper(p_word) ~ '\mEUR\M' then 'EUR'
           when upper(p_word) ~ '\mGBP\M' then 'GBP'
           when upper(p_word) ~ '\mCAD\M' then 'CAD'
           when upper(p_word) ~ '\mAUD\M' then 'AUD'
           else null
         end;
$function$;

-- ── IS EVERY ONE OF THESE WORDS THE TITLE OF A RECORD IN ONE OTHER TABLE?
--
-- The expensive arm, and it is bounded on purpose: at most 40 of this organization's Tables,
-- at most 12 distinct words, and it answers only when EVERY word is found in the SAME Table
-- and at least two different records were matched. One accidental agreement is not a relation.
-- It never looks at a Table the caller may not know about (T10) — a column's suggested target
-- is a fact about somebody else's data and it is asked the same question every other reader of
-- a Table is asked.
create or replace function custom.io_relation_candidate(
  p_organization_id uuid, p_table_id uuid, p_words text[])
returns uuid
language plpgsql
stable
set search_path to 'pg_catalog'
as $function$
declare
  v_t      record;
  v_title  text;
  v_hits   integer;
  v_words  integer := cardinality(coalesce(p_words, array[]::text[]));
begin
  if v_words < 2 then
    return null;
  end if;
  for v_t in
    select r.id, r.data ->> 'title_field' as title_field
      from custom.record r
     where r.organization_id = p_organization_id
       and r.table_id = custom.table_kernel_id()
       and r.data_class = 'table'
       and r.deleted_at is null
       and r.id <> p_table_id
       and nullif(r.data ->> 'title_field', '') is not null
     order by r.created_at desc
     limit 40
  loop
    -- THE WALL, PER CANDIDATE. A Table this person cannot open is not a suggestion this
    -- person gets, and the refusal is swallowed here rather than ending the inference:
    -- "you may not see that one" is not an error in an answer about a file.
    begin
      perform custom.assert_may_know_table(p_organization_id, v_t.id, 'custom.io_relation_candidate');
    exception when others then
      continue;
    end;
    v_title := v_t.title_field;
    select count(distinct r.data ->> v_title) into v_hits
      from custom.record r
     where r.organization_id = p_organization_id
       and r.table_id = v_t.id
       and r.data_class = 'record'
       and r.deleted_at is null
       and r.data ->> v_title = any (p_words);
    if v_hits = v_words then
      return v_t.id;
    end if;
  end loop;
  return null;
end;
$function$;

-- ── THE DOOR: WHAT KIND OF COLUMN IS THIS ────────────────────────────────────────────
create or replace function custom.io_infer_column(
  p_organization_id uuid,
  p_table_id        uuid,
  p_header          text,
  p_samples         jsonb default '[]'::jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $function$
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
  if v_head = '' then
    raise exception 'A column with no heading cannot be matched to anything.'
      using errcode = '22004',
            hint = 'Give the column a heading in the file, or map it by hand.';
  end if;

  v_norm := btrim(regexp_replace(lower(v_head), '[^a-z0-9]+', '_', 'g'), '_');

  -- ── 1. A COLUMN THIS TABLE ALREADY HAS. Asked first, always: a file whose header says
  --       what the Table already calls something is not a new column, however its values
  --       happen to look.
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
$function$;

-- ── THE WHOLE FILE'S MAPPING, IN ONE CALL ────────────────────────────────────────────
-- `p_columns` is `[{"header": "...", "samples": ["...", ...]}, ...]` — exactly what a parser
-- has after reading the first page of a file. One call rather than one per column, because a
-- forty-column spreadsheet is a normal spreadsheet and forty round trips is a hang.
create or replace function custom.io_import_plan(
  p_organization_id uuid,
  p_table_id        uuid,
  p_columns         jsonb default '[]'::jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $function$
declare
  v_col   jsonb;
  v_out   jsonb := '[]'::jsonb;
  v_one   jsonb;
  v_seen  text[] := array[]::text[];
  v_key   text;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.io_import_plan');
  perform custom.assert_may_know_table(p_organization_id, p_table_id, 'custom.io_import_plan');
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
    'fields',   coalesce((select jsonb_agg(jsonb_build_object(
                            'field_id', f.id, 'key', f.data ->> 'key',
                            'label', f.data ->> 'label',
                            'type', coalesce(custom.parity_type(f.data), f.data ->> 'type'))
                            order by f.data ->> 'key')
                            from custom.applicable_fields(p_organization_id, p_table_id, null) f), '[]'::jsonb));
end;
$function$;

-- ── DECLARE, THEN GRANT. `platform.enforce_definer_client_grants` fires ON THE GRANT, so a
--    grant issued before its declaration is taken straight back inside the same transaction
--    and the run still reports success (lane WORK-DOORS measured exactly that).
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes,
   signed_in_callers, anonymous_callers, declared_by, reason)
select 'custom', v.fn, iam.door_identity_args(p.oid), platform.door_argtypes(p.proargtypes),
       true, false,
       'migrations/campaign/import_the_shape_of_a_column_is_a_question.sql (lane IMPORT)',
       v.why
  from (values
    ('io_infer_column',
     'What kind of column is this, answered from the file''s own values AND from what this organization already has: an address that belongs to a member is a person, a few repeating words are a dropdown, a column of names that are all records of another table points at it. Reads only; answers a word custom.field_declare takes.'),
    ('io_import_plan',
     'The whole file''s mapping in one call — every column matched to a Field it already has, or given a suggested kind with the sentence that explains it, plus the columns whose names would collide. Reads only.')
  ) as v(fn, why)
  join pg_proc p on p.proname = v.fn and p.pronamespace = 'custom'::regnamespace
 where not exists (select 1 from platform.client_callable_door d
                    where d.schema_name = 'custom' and d.function_name = v.fn
                      and d.identity_argtypes = platform.door_argtypes(p.proargtypes));

grant execute on function custom.io_infer_column(uuid, uuid, text, jsonb) to authenticated;
grant execute on function custom.io_import_plan(uuid, uuid, jsonb) to authenticated;

