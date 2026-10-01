-- WINDOW FILE — window-class: lock-taking (CREATE TRIGGER + ENABLE ALWAYS take SHARE ROW EXCLUSIVE on each of the four scope
-- tables; on the clone each statement took < 0.5 s with no waiter). Apply ONLY in a watched 01:00–04:00 PT window with Arman told
-- first; NOT applied to production by lane READINESS-PARITY (2026-10-01). Listed in v5/SWITCH-HOUR-RUNBOOK.md § Window files.
-- lane: READINESS-PARITY
-- INVERSE: migrations/inverse/readinessparity_b_scope_tables_refuse_writes_outside_the_doors_down.sql
-- TEST: scripts/campaign-tests/readinessparity_b_scope_tables_refuse_writes_outside_the_doors_red_green.sql
--
-- WHY (SAFETY-NET W1/W24). On 2026-10-01 a junk cleanup hard-DELETEd "Biology 101 — Live Test" from context.scopes and a repair
-- re-inserted it under session_replication_role = replica, which switches off every ordinary trigger — including the write-through
-- (context._follow_to_the_copy) that keeps the store and the old scope tables the same. The scope row came back live, its store
-- Record stayed archived, and the final switch read Ready over the difference. The doors never hard-delete (they archive), and
-- nothing in the product writes these tables with triggers off.
--
-- WHAT. One BEFORE row trigger on context.scope_types / scopes / context_items / context_item_values, ENABLE ALWAYS (so it fires
-- in replica mode too), refusing (42501, nothing written):
--   (a) any write while session_replication_role = replica — the write-through would not run;
--   (b) a DELETE issued directly on a scope table (pg_trigger_depth() = 1). A delete cascaded by a foreign key (an organization's
--       own removal, a scope type's children) runs inside the referential trigger (depth > 1) and is not this rule's.
-- Break glass, named and announced: set custom.context_outside_the_doors = '<why>' in the transaction; the write goes through
-- with a WARNING naming the table, the operation and the reason.
-- No row is written. No function is replaced.

CREATE OR REPLACE FUNCTION context._refuse_writes_outside_the_doors()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_why text := nullif(btrim(coalesce(current_setting('custom.context_outside_the_doors', true), '')), '');
  v_replica boolean := current_setting('session_replication_role') = 'replica';
  v_direct_delete boolean := tg_op = 'DELETE' and pg_trigger_depth() = 1;
begin
  if v_replica or v_direct_delete then
    if v_why is not null then
      raise warning 'context.%: % outside the scope doors (%), allowed by custom.context_outside_the_doors: %',
        tg_table_name, tg_op, case when v_replica then 'triggers off' else 'a direct delete' end, v_why;
    elsif v_replica then
      raise exception 'context.% is not written with triggers off: the write-through to the record store would not run, and the two sides would differ.', tg_table_name
        using errcode = '42501',
              hint = 'READINESS-PARITY: write scope rows through the scope doors (custom.context_scope_write / _archive / _restore and their type, item and value twins), with triggers on. Nothing was written.';
    else
      raise exception 'A row of context.% is archived through the scope doors, never deleted.', tg_table_name
        using errcode = '42501',
              hint = 'READINESS-PARITY: custom.context_scope_archive / context_type_archive / context_item_archive archive it and keep the record store the same. Nothing was deleted.';
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$function$;

REVOKE ALL ON FUNCTION context._refuse_writes_outside_the_doors() FROM PUBLIC;
REVOKE ALL ON FUNCTION context._refuse_writes_outside_the_doors() FROM anon, authenticated;

CREATE TRIGGER aaa_refuse_writes_outside_the_doors BEFORE INSERT OR UPDATE OR DELETE ON context.scope_types
  FOR EACH ROW EXECUTE FUNCTION context._refuse_writes_outside_the_doors();
ALTER TABLE context.scope_types ENABLE ALWAYS TRIGGER aaa_refuse_writes_outside_the_doors;
CREATE TRIGGER aaa_refuse_writes_outside_the_doors BEFORE INSERT OR UPDATE OR DELETE ON context.scopes
  FOR EACH ROW EXECUTE FUNCTION context._refuse_writes_outside_the_doors();
ALTER TABLE context.scopes ENABLE ALWAYS TRIGGER aaa_refuse_writes_outside_the_doors;
CREATE TRIGGER aaa_refuse_writes_outside_the_doors BEFORE INSERT OR UPDATE OR DELETE ON context.context_items
  FOR EACH ROW EXECUTE FUNCTION context._refuse_writes_outside_the_doors();
ALTER TABLE context.context_items ENABLE ALWAYS TRIGGER aaa_refuse_writes_outside_the_doors;
CREATE TRIGGER aaa_refuse_writes_outside_the_doors BEFORE INSERT OR UPDATE OR DELETE ON context.context_item_values
  FOR EACH ROW EXECUTE FUNCTION context._refuse_writes_outside_the_doors();
ALTER TABLE context.context_item_values ENABLE ALWAYS TRIGGER aaa_refuse_writes_outside_the_doors;
