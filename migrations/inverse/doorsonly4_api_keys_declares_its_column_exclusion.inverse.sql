-- lane: DOORS-ONLY-4
-- INVERSE of migrations/campaign/doorsonly4_api_keys_declares_its_column_exclusion.sql
-- Clears the declaration, returning iam.api_keys to running its column-exclusion design
-- undeclared — which is the state in which iam.apply_table_grants refuses to regenerate it.
update platform.entity_types
   set client_excluded_columns = null
 where schema_name = 'iam' and table_name = 'api_keys'
   and client_excluded_columns = array['secret_hash'];
