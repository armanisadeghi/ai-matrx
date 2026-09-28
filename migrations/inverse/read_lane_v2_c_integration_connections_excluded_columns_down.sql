-- retired: inverse of read_lane_v2_c, which never ran (superseded by access_ladder_t8b_confidential_tables_arman_approved.sql); running this would clear nothing today and must never be used.
-- chair-step: inverse of read_lane_v2_c_integration_connections_excluded_columns — clears the client_excluded_columns declaration it wrote on users.integration_connections (only if it is still exactly that declaration).
update platform.entity_types set client_excluded_columns = null
 where token = 'integration_connection' and client_excluded_columns = array['vault_secret_key', 'credential_item_id', 'created_by'];
