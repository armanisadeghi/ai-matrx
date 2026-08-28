-- hr_l1_49_the_sentence_names_the_fields.sql
--
-- 🚨 §7.1 SAYS `hr_only` KEYS ARE "REJECTED NAMING EACH OFFENDING FIELD".
-- They were — in `rejected[]` and `unknown[]`, machine arrays. The one string a person
-- actually reads said "These fields are held by HR and cannot be changed here", which
-- names nothing. That is the exact "some fields could not be saved" defect the per-field
-- shape exists to replace, surviving in the human half of the same envelope.
--
-- The arrays stay (renderers that can key off them still should). The sentence stops
-- being the least informative thing in the payload:
--   Amount can only be changed by HR.
--   Amount can only be changed by HR. Base pay and Zzz nope are not fields on your record.
--   Zzz nope is not a field on your record.
--
-- Two small helpers rather than three inline copies of the same string-joining:
--   · hr._sentence_list  — "a", "a and b", "a, b and c", matching the client's own
--     `listFields`. A comma-only join reads as a machine dump.
--   · hr._field_phrase   — sentence case, not Title Case. `initcap` gave "Base Pay";
--     a column name is not a title.
-- Both are revoked from public/anon/authenticated per hr_l1_47's rule.
--
-- Applied live 2026-08-28 and ledgered. The live definition is carried by the deployed
-- function; this file pins the properties.

create or replace function hr._sentence_list(p_items text[])
returns text language sql immutable as $$
  select case
    when p_items is null or cardinality(p_items) = 0 then null
    when cardinality(p_items) = 1 then p_items[1]
    when cardinality(p_items) = 2 then p_items[1] || ' and ' || p_items[2]
    else array_to_string(p_items[1:cardinality(p_items)-1], ', ')
         || ' and ' || p_items[cardinality(p_items)]
  end;
$$;

create or replace function hr._field_phrase(p_field text)
returns text language sql immutable as $$
  select upper(left(replace(p_field, '_', ' '), 1))
      || substr(replace(p_field, '_', ' '), 2);
$$;

revoke all on function hr._sentence_list(text[]) from public, anon, authenticated;
revoke all on function hr._field_phrase(text) from public, anon, authenticated;

do $verify$
declare v_src text;
begin
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_self_update';
  if v_src !~ 'THE SENTENCE NAMES THE FIELDS TOO' then
    raise exception 'hr_l1_49: the naming sentence is missing';
  end if;
  if v_src ~ 'These fields are held by HR and cannot be changed here' then
    raise exception 'hr_l1_49: the generic sentence came back';
  end if;
  if v_src !~ '_sentence_list' or v_src !~ '_field_phrase' then
    raise exception 'hr_l1_49: the shared phrasing helpers are not being used';
  end if;
  if v_src !~ 'A TYPO AND A PROTECTED FIELD ARE NOT THE SAME ANSWER' then
    raise exception 'hr_l1_49: hr_l1_48 lost';
  end if;
end $verify$;

insert into public._schema_migrations (source, filename, checksum, applied_at, duration_ms)
values ('matrx-frontend', 'hr_l1_49_the_sentence_names_the_fields.sql',
        md5('hr_l1_49_the_sentence_names_the_fields'), now(), 0)
on conflict do nothing;
