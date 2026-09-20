-- ENTITY-FIELDS 3 — INVERSE. Drops exactly the eight new functions and the ten declaration
-- rows this lane added, and nothing else. No column, no value and no Field record is touched:
-- a Field a person declared on a standard table stays in `custom.record` and the values stay
-- in each row's `custom_fields`. What goes away is the only way to reach them.
DROP FUNCTION IF EXISTS custom.entity_records_find(uuid, text, text, jsonb, integer, integer);
DROP FUNCTION IF EXISTS custom.entity_value_write(uuid, text, uuid, jsonb);
DROP FUNCTION IF EXISTS custom.entity_record_read(uuid, text, uuid);
DROP FUNCTION IF EXISTS custom.entity_field_retire(uuid, uuid);
DROP FUNCTION IF EXISTS custom.entity_field_update(uuid, uuid, jsonb);
DROP FUNCTION IF EXISTS custom.entity_field_declare(uuid, text, jsonb);
DROP FUNCTION IF EXISTS custom.entity_fields(uuid, text);
DROP FUNCTION IF EXISTS custom.assert_entity_is_organization_scoped(text, text, boolean);
DROP FUNCTION IF EXISTS custom.entity_table(text);
DELETE FROM platform.client_callable_door
 WHERE declared_by = 'migrations/campaign/entityfields_the_doors_a_person_reaches.sql';
