-- ENTITY-FIELDS 6 — INVERSE. The declaration goes FIRST, because in schema custom the
-- declaration is what hands the grant back (the lesson of file 5).
DELETE FROM platform.client_callable_door
 WHERE declared_by = 'migrations/campaign/entityfields_the_add_control_is_absent_or_honest.sql';
DROP FUNCTION IF EXISTS custom.entity_field_rights(uuid, text);
