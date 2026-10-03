-- inverse of lane7w4a_c_the_people_a_field_names_reach_its_values.sql — close each door's row first, then revoke (the register's law).
UPDATE platform.client_callable_door
   SET signed_in_callers = false,
       non_client_lane = 'server_only until file c (lane7w4a_c) opens it: a signed-in read door over protected values; closed so file b grants nothing.'
 WHERE schema_name = 'custom' AND function_name IN ('protected_value', 'protected_values', 'protected_matches');
DELETE FROM platform.client_callable_door WHERE schema_name = 'custom' AND function_name IN ('field_is_protected', 'protected_field_rule', 'protected_readers_problem', 'field_protection_refusal');
REVOKE ALL ON FUNCTION custom.protected_value(text, uuid, uuid) FROM authenticated, service_role;
REVOKE ALL ON FUNCTION custom.protected_values(uuid, text, uuid) FROM authenticated, service_role;
REVOKE ALL ON FUNCTION custom.protected_matches(uuid, jsonb) FROM authenticated, service_role;
REVOKE ALL ON FUNCTION custom.field_is_protected(jsonb) FROM authenticated, service_role;
REVOKE ALL ON FUNCTION custom.protected_field_rule(text) FROM authenticated, service_role;
REVOKE ALL ON FUNCTION custom.protected_readers_problem(text, jsonb) FROM authenticated, service_role;
REVOKE ALL ON FUNCTION custom.field_protection_refusal(text, jsonb, jsonb, uuid) FROM authenticated, service_role;
lane7w4a_c_the_people_a_field_names_reach_its_values.sql
REVOKE ALL ON FUNCTION custom.protected_value(text, uuid, uuid) FROM authenticated, service_role;
REVOKE ALL ON FUNCTION custom.protected_values(uuid, text, uuid) FROM authenticated, service_role;
REVOKE ALL ON FUNCTION custom.protected_matches(uuid, jsonb) FROM authenticated, service_role;
REVOKE ALL ON FUNCTION custom.field_is_protected(jsonb) FROM authenticated, service_role;
REVOKE ALL ON FUNCTION custom.protected_field_rule(text) FROM authenticated, service_role;
REVOKE ALL ON FUNCTION custom.protected_readers_problem(text, jsonb) FROM authenticated, service_role;
REVOKE ALL ON FUNCTION custom.field_protection_refusal(text, jsonb, jsonb, uuid) FROM authenticated, service_role;
DELETE FROM platform.client_callable_door WHERE schema_name = 'custom' AND function_name IN ('field_is_protected', 'protected_field_rule', 'protected_readers_problem', 'field_protection_refusal');
