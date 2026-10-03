-- Inverse of migrations/campaign/lane7w5_a_record_names_its_own_organization.sql:
-- drops the one function it created and its client_callable_door row. Nothing else existed before.
-- lock: custom

set local lock_timeout = '3s';

DELETE FROM platform.client_callable_door
 WHERE schema_name = 'custom' AND function_name = 'entity_record_home';

DROP FUNCTION IF EXISTS custom.entity_record_home(text, uuid);
