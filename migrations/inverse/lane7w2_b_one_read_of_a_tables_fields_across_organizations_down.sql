-- chair-step: the inverse of lane7w2_b_one_read_of_a_tables_fields_across_organizations.sql. It
-- revokes the grant, deletes the one platform.client_callable_door row and drops the function.

REVOKE EXECUTE ON FUNCTION custom.entity_fields_across(text, uuid[]) FROM authenticated;
DELETE FROM platform.client_callable_door
 WHERE schema_name = 'custom' AND function_name = 'entity_fields_across';
DROP FUNCTION IF EXISTS custom.entity_fields_across(text, uuid[]);
