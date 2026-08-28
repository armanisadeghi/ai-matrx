-- hr_l1_48_a_typo_is_not_a_protected_field.sql
--
-- 🚨 THE DOOR ASSERTED THAT HR HOLDS FIELDS THAT DO NOT EXIST.
-- `hr_l1_30` — mine — answered a forbidden target by stamping `policy: 'hr_only'` on
-- EVERY key it was handed, without ever asking whether the key was a column. So
-- `base_pay` and `zzz_not_a_field_at_all` came back as protected fields. That is worse
-- than unhelpful: it tells somebody a protected field is there when nothing is, and it
-- makes a misspelling indistinguishable from a real refusal — nobody can tell whether to
-- fix their spelling or go and ask HR.
--
-- The main split had the same fault in the other direction: a REAL column with no policy
-- row was called `unknown`, which renders as "is not a field on your record" — false
-- about `display_name`, which plainly is one.
--
-- TWO QUESTIONS, TWO SOURCES, NEITHER OF THEM A NEW LIST:
--   · EXISTENCE — the catalog, reached through `hr._wf_target_table`, the same
--     token→table map the digest lane already uses.
--   · POLICY — `hr.field_policy`, the same source the split itself reads.
-- A hand-maintained third list is the thing that would drift out of agreement with both.
--
-- Applied live 2026-08-28 and ledgered. Falsified BOTH ways:
--   hr_compensation {amount, base_pay, zzz_not_a_field_at_all}
--     → rejected [amount/hr_only], unknown [base_pay, zzz_not_a_field_at_all]
--   hr_employee    {employee_number, display_name, zzz_nope}
--     → rejected [display_name/hr_only, employee_number/hr_only], unknown [zzz_nope]
--   and the free path still applies immediately (pronouns → applied).
--
-- The live definition is carried by this migration's do-block; see the deployed function
-- for the full body.

do $verify$
declare v_src text;
begin
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_self_update';
  if v_src !~ 'A TYPO AND A PROTECTED FIELD ARE NOT THE SAME ANSWER' then
    raise exception 'hr_l1_48: forbidden-target existence check missing';
  end if;
  if v_src !~ 'SAY WHICH KIND OF CLOSED IT IS' then
    raise exception 'hr_l1_48: main-split existence check missing';
  end if;
  if v_src !~ 'information_schema\.columns' then
    raise exception 'hr_l1_48: existence is not being asked of the catalog';
  end if;
  if v_src !~ 'A REQUEST NOBODY OPENED' then
    raise exception 'hr_l1_48: hr_l1_29 guard lost';
  end if;
end $verify$;

update hr.function_contract set is_active = false
 where function_name = 'hr_self_update'
   and home_migration = 'hr_l1_30_forbidden_target_names_the_fields.sql';

insert into hr.function_contract
  (schema_name, function_name, home_migration, must_contain, must_not_contain, reason)
values ('public', 'hr_self_update', 'hr_l1_48_a_typo_is_not_a_protected_field.sql',
        array['A TYPO AND A PROTECTED FIELD ARE NOT THE SAME ANSWER',
              'SAY WHICH KIND OF CLOSED IT IS',
              'hr._wf_target_table', 'information_schema.columns',
              'A REQUEST NOBODY OPENED'],
        array[]::text[],
        'Every refused field name is checked for EXISTENCE against the catalog before it is '
        || 'labelled. Without it the door asserts HR holds fields that are on no table, and a '
        || 'misspelling is indistinguishable from a real refusal.')
on conflict do nothing;
