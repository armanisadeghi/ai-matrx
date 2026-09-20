-- ENTITY-FIELDS 4 — INVERSE. Removes the wrapper and its declaration. The three value doors
-- are left pointing at it, so running this alone makes them refuse rather than silently
-- change who they let through; the doors' own inverse
-- (entityfields_the_doors_a_person_reaches_down.sql) removes them.
DELETE FROM platform.client_callable_door
 WHERE declared_by = 'migrations/campaign/entityfields_the_invoker_doors_are_cold_start_honest.sql';
DROP FUNCTION IF EXISTS custom.assert_entity_door(uuid, text);
