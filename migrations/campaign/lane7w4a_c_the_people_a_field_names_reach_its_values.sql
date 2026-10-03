-- chair-step: NEEDS ARMAN WATCHING — GRANT CHANGE: EXECUTE to authenticated (and service_role) on three
-- SECURITY DEFINER read doors (custom.protected_value, custom.protected_values, custom.protected_matches)
-- and four invoker helpers (field_is_protected, protected_field_rule, protected_readers_problem,
-- field_protection_refusal), declared in platform.client_callable_door. Each answers only what custom.field_access's rule admits the
-- signed-in person to. Requires file b. Its inverse revokes the three grants and removes the rows.
-- ORDER (production): lane7sec_r2_an_archived_field_never_blocks_a_row.sql, then
-- lane7w2_a_a_choice_on_a_standard_row_holds_its_key.sql (re-based on r2), then
-- lane7w4a_a_a_protected_value_has_its_own_place.sql, then lane7w4a_b_a_protected_field_is_read_by_the_people_it_names.sql, then
-- lane7w4a_c_the_people_a_field_names_reach_its_values.sql. Based on production's bodies (custom._entity_custom_fields_guard e29bf768…) plus SEC r2
-- plus W2's Choice-key lines; onehome_d2 (pending, fragment-based) applies before or after this
-- unchanged. Body edits in file b are FRAGMENT edits on the live body (each anchor asserted present
-- exactly once, refused by name otherwise), so they land on r2+W2 with or without onehome_d2 and
-- with or without W3a/W5 — the clone proof ran on prod+r2+W2+onehome_d2+W3a+W5.
--
-- LANE 7 · STANDARD-TABLES · W4a (c) — THE PEOPLE A FIELD NAMES REACH ITS VALUES.

-- The three read doors above are reached from the signed-in seat (custom.entity_record_read and
-- custom.entity_records_find run as the person; the drill doors' compiled SQL runs as the person).
-- GRANT CHANGE (announce): EXECUTE to authenticated, declared as client-callable doors.
INSERT INTO platform.client_callable_door
  (schema_name, function_name, identity_args, declared_by, reason, signed_in_callers, identity_argtypes)
SELECT d.s, d.f, d.a,
       'migrations/campaign/lane7w4a_c_the_people_a_field_names_reach_its_values.sql (lane 7 STANDARD-TABLES W4a)',
       d.r, true, d.t
  FROM (VALUES
    ('custom', 'protected_value', 'p_token text, p_row_id uuid, p_field_id uuid',
     'SECURITY DEFINER read of one protected custom value on a standard row: returns it only when custom.field_access''s rule admits the signed-in person, else null. The drill doors call it per row as the seat.',
     array['text'::regtype, 'uuid'::regtype, 'uuid'::regtype]::oid[]),
    ('custom', 'protected_values', 'p_organization_id uuid, p_token text, p_row_id uuid',
     'SECURITY DEFINER read of a row''s protected custom values: the ones the field''s rule admits the signed-in person to, a withheld notice for the rest; each granted read audited. custom.entity_record_read calls it as the seat.',
     array['uuid'::regtype, 'text'::regtype, 'uuid'::regtype]::oid[]),
    ('custom', 'protected_matches', 'p_field_id uuid, p_value jsonb',
     'SECURITY DEFINER find over one protected custom field: refused in a sentence unless the rule admits the signed-in person to use the field across rows; then only the rows whose value she may read. custom.entity_records_find calls it as the seat.',
     array['uuid'::regtype, 'jsonb'::regtype]::oid[])
  ) d(s, f, a, r, t)
 WHERE NOT EXISTS (SELECT 1 FROM platform.client_callable_door c WHERE c.schema_name = d.s AND c.function_name = d.f);

REVOKE ALL ON FUNCTION custom.protected_value(text, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION custom.protected_values(uuid, text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION custom.protected_matches(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION custom.protected_value(text, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION custom.protected_values(uuid, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION custom.protected_matches(uuid, jsonb) TO authenticated, service_role;

-- The invoker helpers a signed-in writer's path asks when (and only when) a protected field is
-- involved: the shape guard's rule for a protected field document. Pure predicates and sentences.
INSERT INTO platform.client_callable_door
  (schema_name, function_name, identity_args, declared_by, reason, signed_in_callers, identity_argtypes)
SELECT d.s, d.f, d.a,
       'migrations/campaign/lane7w4a_c_the_people_a_field_names_reach_its_values.sql (lane 7 STANDARD-TABLES W4a)',
       d.r, true, d.t
  FROM (VALUES
    ('custom', 'field_is_protected', 'p_data jsonb', 'Pure predicate over a field document: a standard table''s field above internal is protected.', array['jsonb'::regtype]::oid[]),
    ('custom', 'protected_field_rule', 'p_token text', 'The platform''s locked protected-field entry for a registry token (rule, arm, default readers), or null.', array['text'::regtype]::oid[]),
    ('custom', 'protected_readers_problem', 'p_token text, p_readers jsonb', 'The sentence saying what is wrong with a protected field''s readers, or null.', array['text'::regtype, 'jsonb'::regtype]::oid[]),
    ('custom', 'field_protection_refusal', 'p_op text, p_old jsonb, p_new jsonb, p_field_id uuid', 'The shape guard''s refusal for a protected field document (readers, the protect door, no un-protecting), or null.', array['text'::regtype, 'jsonb'::regtype, 'jsonb'::regtype, 'uuid'::regtype]::oid[])
  ) d(s, f, a, r, t)
 WHERE NOT EXISTS (SELECT 1 FROM platform.client_callable_door c WHERE c.schema_name = d.s AND c.function_name = d.f);
GRANT EXECUTE ON FUNCTION custom.field_is_protected(jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION custom.protected_field_rule(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION custom.protected_readers_problem(text, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION custom.field_protection_refusal(text, jsonb, jsonb, uuid) TO authenticated, service_role;
