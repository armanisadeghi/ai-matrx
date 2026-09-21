-- additive: yes
--
-- chair-step: it CREATES one BEFORE-ROW trigger on `custom.record` and the function behind it.
--   Nothing is replaced, dropped or revoked and no row of anybody's data is touched. The
--   inverse is
--   `migrations/inverse/writeperf3_a_structure_row_empties_the_memo_before_it_lands_down.sql`.
--
-- WRITE-PERF-3 — A DEFECT OF MINE THAT A PEER'S SUITE FOUND, AND THE CLASS BEHIND IT.
--
-- `scripts/campaign-tests/doorfix_green.sql` went red against this lane:
--
--     ERROR:  Phone takes words, and it was given a number
--     CONTEXT: custom.validate_values  <- custom._record_field_validation
--              update custom.record x set data = v_data
--              custom._field_type_converts_values        (AFTER ROW on custom.record)
--              custom.record_update(...)  <- the suite changing a Field from text to number
--
-- WHAT HAPPENED. The suite changes a Field's behaviour. That is an UPDATE of a Field row, and
-- `custom._field_type_converts_values` — an AFTER-ROW trigger — then rewrites the values of
-- every record that Field describes, IN A NESTED UPDATE. Postgres fires every AFTER-ROW trigger
-- of a statement BEFORE any AFTER-STATEMENT trigger of that statement, so this lane's
-- `zz_memo_clear_u` had not run yet: the nested update's own guards asked
-- `custom.applicable_fields` and were handed the shape the Table had BEFORE the Field changed.
-- The value had already been converted to a number; the memo still said the column takes words.
--
-- THE CLASS, not the instance: A STATEMENT-LEVEL INVALIDATION CANNOT PROTECT A READ THAT
-- HAPPENS INSIDE THE SAME STATEMENT. Anything that writes structure and then reads structure
-- again before the statement ends is exposed, and `custom._field_type_converts_values` is
-- merely the one that had a suite pointing at it. A multi-row INSERT of Field rows would have
-- done the same, and the header of writeperf3_the_write_path_asks_the_ladder_once.sql noted
-- that residual and then under-rated it.
--
-- THE FIX. A BEFORE-ROW trigger on `custom.record` that empties the memo when the row being
-- written IS structure — a Table, a Field or a Rule. Before-row is the only place that is
-- guaranteed to run before anything else can read the shape, including a nested statement of
-- the same trigger cascade.
--
-- WHY THIS DOES NOT PUT THE PER-ROW COST BACK. It compares `table_id` against three IMMUTABLE
-- kernel ids and returns; for every ordinary record — which is every row of every import and
-- every batch — that is all it does. Measured on the same 2,000-row fixture the rest of this
-- lane was measured on: no change outside the noise of a shared database. The
-- AFTER-STATEMENT triggers stay: they also catch a direct write that never went through a door,
-- and emptying an already-empty memo costs nothing.
--
-- THE TRIGGER'S NAME STARTS `_aa_` ON PURPOSE. Postgres fires BEFORE-ROW triggers in NAME
-- order, and this one has to run before `_metadata_guard`, `_value_envelope`,
-- `custom_record_field_validation` and every other guard that asks what the Table looks like.

CREATE OR REPLACE FUNCTION platform.memo_clear_on_structure_row()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if coalesce(new.table_id, old.table_id) in (custom.table_kernel_id(),
                                              custom.field_kernel_id(),
                                              custom.rule_kernel_id()) then
    perform platform.memo_clear();
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$function$;

drop trigger if exists _aa_memo_clear on custom.record;
create trigger _aa_memo_clear
  before insert or update or delete on custom.record
  for each row execute function platform.memo_clear_on_structure_row();
