-- hr_l1_56_the_letters_stated_as_of_date.sql
--
-- 🚨 THE FORM COLLECTED AN "As of" DATE AND THERE WAS NOWHERE TO PUT IT.
-- SPEC-EMPLOYEES §4.9 and route 17 both say the letter's facts are "resolved **as of the
-- letter's stated as-of date**", and `NewVerificationRequestDialog` has had an As-of field
-- since the route shipped. `hr.verification_letter_request` has no such column, so
-- `hr_verification_request_create` ignored the value — the THIRD silently-dropped field on
-- this one form, after the deny "Note for the record" and the deliver "To" address (both
-- removed in hr_l1_53's wave because their doors had nowhere to keep them).
--
-- This one is different: the field is right and the STORAGE was missing, so the column is
-- added rather than the field removed.
--
-- NULL means "the request date", which is exactly what every row written before this
-- migration meant implicitly and what aidream's `_as_of_date` already computed. Nothing is
-- backfilled and no existing letter changes meaning.
--
-- The consumer is aidream's `_build_snapshot` / `_as_of_date`
-- (`aidream/services/hr/employees/verification_letters.py`), updated in the same wave to
-- SELECT the column and prefer it over `requested_at`. A column written and never read would
-- be the same defect one level down.
--
-- Applied live 2026-08-28 and ledgered.

alter table hr.verification_letter_request
  add column if not exists as_of_date date;

comment on column hr.verification_letter_request.as_of_date is
  'The letter''s stated as-of date (SPEC-EMPLOYEES §4.9). Everything the letter asserts is '
  'resolved on this date and frozen into `snapshot` at generation. NULL means the request '
  'date, which is what every row written before hr_l1_56 meant implicitly.';

do $mig$
declare v_def text; v_new text;
begin
  v_def := pg_get_functiondef('public.hr_verification_request_create(jsonb)'::regprocedure);
  if position('AS-OF IS THE LETTER''S OWN DATE' in v_def) > 0 then
    raise notice 'hr_l1_56: create door already reads as_of_date'; return;
  end if;

  v_new := replace(v_def,
    E'    requested_at, state, organization_id)',
    E'    requested_at, state, organization_id, as_of_date)');
  if v_new = v_def then raise exception 'hr_l1_56: insert column-list anchor not found'; end if;

  v_new := replace(v_new,
    E'    now(), v_state, v_org)',
    E'    now(), v_state, v_org,\n'
    || E'    -- 🚨 AS-OF IS THE LETTER''S OWN DATE, not today. The form has always collected it\n'
    || E'    -- and it was dropped on the floor; §4.9 resolves every asserted fact on it.\n'
    || E'    nullif(p_payload ->> ''as_of_date'','''')::date)');
  if v_new like '%now(), v_state, v_org)%' then
    raise exception 'hr_l1_56: values anchor not replaced';
  end if;
  execute v_new;
end $mig$;

update hr.function_contract
   set must_contain = must_contain || array['AS-OF IS THE LETTER''S OWN DATE'],
       reason = reason || ' ALSO: it persists the form''s stated as-of date into '
         || 'hr.verification_letter_request.as_of_date — §4.9 resolves every asserted fact on '
         || 'that date, and before hr_l1_56 the collected value was dropped (there was no column).'
 where schema_name = 'public' and function_name = 'hr_verification_request_create';

do $verify$
declare v_src text;
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema='hr' and table_name='verification_letter_request'
                    and column_name='as_of_date') then
    raise exception 'hr_l1_56: as_of_date column missing';
  end if;
  select prosrc into v_src from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='hr_verification_request_create';
  if v_src !~ 'as_of_date' then
    raise exception 'hr_l1_56: create door does not persist as_of_date';
  end if;
end $verify$;
