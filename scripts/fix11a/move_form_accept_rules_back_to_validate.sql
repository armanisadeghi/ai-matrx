-- FIX-11A / V11-C — the INVERSE of move_form_accept_rules_to_membership.sql.
--
-- 🚨 RUNNING THIS RE-OPENS V11-C for every table that has a published form: the form's
-- questions become compulsory for every record anybody writes by any route, and the grid's
-- "New record" is refused with SQLSTATE 23514. It exists so the change can be undone, not
-- because anybody should.

do $fix11a_down$
declare
  r       record;
  v_moved integer := 0;
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
       and coalesce(rl.data -> 'uses', '[]'::jsonb) @> '["membership"]'::jsonb
  loop
    perform custom.rule_declare(
      r.organization_id,
      r.rule_data - 'id' - 'version' - 'created_at' - 'updated_at' - 'created_by' - 'updated_by'
        || jsonb_build_object('uses', jsonb_build_array('validate')),
      r.rule_id);
    v_moved := v_moved + 1;
  end loop;
  raise notice 'V11-C inverse: % form accept Rule(s) put back on the table''s write-time checks.', v_moved;
end
$fix11a_down$;

