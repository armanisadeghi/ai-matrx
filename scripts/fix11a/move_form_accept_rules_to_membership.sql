-- FIX-11A / V11-C — the repair that goes with
-- migrations/campaign/fix11a_a_forms_questions_are_the_forms_not_every_records.sql.
--
-- The migration changes the door so no NEW form's accept Rule is a table-wide write-time
-- validation. This moves the Rules the old door already made. It is a data repair through
-- custom.rule_declare — the same door a person uses — so every move is a Rule version with
-- its own history, not a patch underneath the object. It lives here rather than in the
-- migration because the production runner judges migrations by an allow-list of additive
-- DDL shapes, and a DO block that writes rows is not one of them, correctly.
--
--   $(brew --prefix libpq)/bin/psql "<the main database>" -f scripts/fix11a/move_form_accept_rules_to_membership.sql
--
-- It is idempotent: a Rule already on `membership` is not selected.

-- ── THE ROWS THE OLD LINE ALREADY MADE WRONG. ────────────────────────────────────────
-- Re-declared through custom.rule_declare so the change is a Rule version, not a patch
-- under the object. Anything that is not a live form's accept Rule is left alone.
do $fix11a$
declare
  r        record;
  v_moved  integer := 0;
begin
  for r in
    select f.organization_id, f.quarantine_rule_id as rule_id, rl.data as rule_data
      from custom.anon_form f
      join custom.record rl
        on rl.organization_id = f.organization_id
       and rl.id = f.quarantine_rule_id
       and rl.table_id = custom.rule_kernel_id()
       and rl.deleted_at is null
     where f.deleted_at is null
       and f.quarantine_rule_id is not null
       and coalesce(rl.data -> 'uses', '[]'::jsonb) @> '["validate"]'::jsonb
  loop
    perform custom.rule_declare(
      r.organization_id,
      r.rule_data - 'id' - 'version' - 'created_at' - 'updated_at' - 'created_by' - 'updated_by'
        || jsonb_build_object('uses', jsonb_build_array('membership')),
      r.rule_id);
    v_moved := v_moved + 1;
  end loop;
  raise notice 'V11-C: % form accept Rule(s) moved off the table''s write-time checks and onto the form they belong to.', v_moved;
end
$fix11a$;

