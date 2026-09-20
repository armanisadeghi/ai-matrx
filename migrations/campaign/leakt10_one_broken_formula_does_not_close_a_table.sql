-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- based-on: custom.derived_value(uuid, uuid, jsonb, jsonb) c1d67244b40c394175431591f375e3e095e12007f1c88a879e721558c7eeddcc
--
-- LEAK-T10 — ONE BROKEN WORKED-OUT COLUMN DOES NOT CLOSE A WHOLE TABLE.
--
-- FOUND BY CENSUS 13, on the MAIN database, 2026-09-20. The census asks `custom.read_record`
-- for the truth about every row, and on two live organizations it raised instead of answering:
--
--     22023  this rule points at a field with title instead of with its id
--     22023  this rule points at a field with serial instead of with its id
--
-- The refusal itself is right — REC-17 says a Rule points at a Field by id and never by name,
-- and `custom.rule_eval` enforces it. What was wrong is WHO PAYS. A single Field whose formula
-- was written with a name instead of an id (`Shouty`, in Fairview Shared Services) made
-- `custom.record_values` raise, and every door standing on it — `custom.read_record`,
-- `custom.read_records`, `custom.io_export`, the record card, the export, every screen — died
-- for EVERY ROW of that Table, for EVERY MEMBER. One bad column closed the table.
--
-- That is the shape law 4 forbids: nothing fails silently, and a screen is absent or honest,
-- never dead. A column that cannot be worked out is ABSENT and says why; the other forty
-- columns and the record itself are none of its business.
--
-- THE CLASS, NOT THE INSTANCE. The arm goes in `custom.derived_value`, which is the one place
-- all three worked-out kinds pass through — lookup, rollup and formula — so a broken lookup
-- target and a rollup over a retired field are covered by the same line, not just the formula
-- that happened to be found. The value comes back NULL and the failure is announced with the
-- field's own label, its key, the record it was being worked out for, and the sqlstate and
-- message verbatim, so it is one grep from the person who has to fix the Field.
--
-- IT DOES NOT SWALLOW A PERMISSION REFUSAL. `insufficient_privilege` is re-raised untouched:
-- a lookup that reaches a record the reader may not see must keep refusing, and turning that
-- into "the column is empty" would be this campaign inventing a silent leak in the other
-- direction. Same for `query_canceled` and `statement_timeout` — a read that ran out of time
-- has not established that a column is empty, and pretending otherwise would hand a person a
-- blank where a value exists.
--
-- WHAT THE GUARD SAYS. `custom.list_door_disagreements()` named four `unmeasured:
-- custom.read_record raised 22023 …` rows before this file and names none after; the leak rows
-- were already zero. The two malformed Fields are still malformed — fixing the DATA is the
-- Rules lane's, and this file deliberately changes no row — but they no longer take a Table
-- with them.
--
-- THE INVERSE is migrations/inverse/leakt10_one_broken_formula_does_not_close_a_table_down.sql.

CREATE OR REPLACE FUNCTION custom.derived_value(p_organization_id uuid, p_record_id uuid, p_field_data jsonb, p_values jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_parity text := custom.parity_type(p_field_data);
begin
  return case v_parity
    when 'lookup'  then custom.lookup_value(p_organization_id, p_record_id, p_field_data)
    when 'rollup'  then custom.rollup_value(p_organization_id, p_record_id, p_field_data)
    when 'formula' then custom.formula_value(p_organization_id, p_record_id, p_field_data, p_values)
    else null
  end;
exception
  -- 🚨 NEVER SWALLOWED: a refusal is an answer about ACCESS and belongs to the caller, and a
  -- cancelled or timed-out read has established nothing about this column at all. Both
  -- re-raise exactly as they arrived.
  when insufficient_privilege or query_canceled then
    raise;
  when others then
    raise warning 'custom.derived_value: the % column "%" (key %) could not be worked out for record %: % (%). The column is empty on this read; every other column and the record itself are unaffected. REMEDY: fix the Field''s own definition - REC-17 says a formula, a lookup and a rollup point at a Field by ID and never by name.',
      coalesce(v_parity, 'worked-out'),
      coalesce(p_field_data ->> 'label', p_field_data ->> 'key', '(unnamed)'),
      coalesce(p_field_data ->> 'key', '(no key)'),
      p_record_id, sqlerrm, sqlstate;
    return null;
end;
$function$;
