-- chair-step: inverse of read_lane_v2_e_users_client_declarations — clears the two declarations it wrote (only where they are still exactly those declarations).
update platform.entity_types set client_read_only_columns = null
 where token = 'integration_connection' and client_read_only_columns = array['credential_present', 'credential_stable', 'capability_health'];
update platform.entity_types set client_deletes_refused = false
 where token = 'credential_attachment' and client_deletes_refused;
