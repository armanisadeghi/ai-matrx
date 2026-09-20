-- chair-step: this GRANTs EXECUTE on FIVE functions to `authenticated`. A GRANT is refused by the additive allow-list by name, so it comes through this route and a person reads exactly which functions and why. No REVOKE, no DROP, no data movement, no existing declared grant changed. All five are already declared in platform.client_callable_door by dash_a_dashboard_is_a_record_with_doors.sql, which runs before this file.
-- lane: DASHBOARDS (PRODUCTS row 3, "Show me jobs by stage this month and what's stuck")
--
--   custom.dashboard_declare(uuid, uuid, text, jsonb, jsonb, uuid)                     → authenticated, EXECUTE
--   custom.dashboards(uuid, uuid)                                                      → authenticated, EXECUTE
--   custom.dashboard_run(uuid, uuid, jsonb)                                            → authenticated, EXECUTE
--   custom.dashboard_stuck(uuid, uuid, text, integer, jsonb, integer, text)            → authenticated, EXECUTE
--   custom.dashboard_delete(uuid, uuid)                                                → authenticated, EXECUTE
--
-- and nothing else. `anon` is not named here and gains nothing; neither is `service_role`.
-- `custom.dashboard_block_normalize`, `custom.dashboard_field_keys`,
-- `custom.dashboard_window_sql`, `custom.dashboard_moment_sql`, `custom.dashboard_kinds`
-- and `custom.dashboard_class` are deliberately NOT granted: they are the judging halves the
-- five doors call under SECURITY DEFINER, and a door a client does not need is a door a
-- client does not get.
--
-- WHY IT IS A SEPARATE FILE. `platform.door_identity_is_the_catalogs()` refuses a
-- platform.client_callable_door row naming a function that does not exist yet (23514), so the
-- declaration cannot precede the CREATE FUNCTION; lane FORTY-FIVE's law says the GRANT must
-- not precede the declaration. The only order that satisfies both puts the grants in a file
-- of their own, after the one that creates and declares the doors. Same shape as
-- forms_a_rule_declaring_door_can_be_reached.sql.
--
-- WHO MAY CALL THEM is not decided by these grants. Every one of the five asks
-- custom.assert_client_may_reach first; declare and delete then ask ADMIN (on the subject
-- Table and on the dashboard record respectively), run asks VIEWER on the dashboard record,
-- and every number it returns is computed under the CALLER'S OWN principal through
-- custom.record_aggregate's visibility predicate.
--
-- Idempotent: an already-holds GRANT is a no-op.

grant execute on function custom.dashboard_declare(uuid, uuid, text, jsonb, jsonb, uuid) to authenticated;
grant execute on function custom.dashboards(uuid, uuid) to authenticated;
grant execute on function custom.dashboard_run(uuid, uuid, jsonb) to authenticated;
grant execute on function custom.dashboard_stuck(uuid, uuid, text, integer, jsonb, integer, text) to authenticated;
grant execute on function custom.dashboard_delete(uuid, uuid) to authenticated;
