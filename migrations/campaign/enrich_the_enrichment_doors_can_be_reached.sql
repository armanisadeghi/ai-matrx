-- chair-step: this GRANTs EXECUTE on SEVEN functions to `authenticated`. A GRANT is refused by the additive allow-list by name, so it comes through this route and a person reads exactly which functions and why. No REVOKE, no DROP, no data movement, no existing declared grant changed. All seven are already declared in platform.client_callable_door by enrich_a_field_a_model_owns.sql, which runs before this file.
-- lane: ENRICH (PRODUCTS row 10, "Fill in each company's industry and headcount, and keep it fresh")
--
--   custom.enrich_declare(uuid, uuid, jsonb)                 → authenticated, EXECUTE
--   custom.enrichments(uuid, uuid)                           → authenticated, EXECUTE
--   custom.enrich_due(uuid, uuid, integer, boolean)          → authenticated, EXECUTE
--   custom.enrich_cells(uuid, uuid, text[], uuid[])          → authenticated, EXECUTE
--   custom.enrich_land(uuid, uuid, jsonb, jsonb)             → authenticated, EXECUTE
--   custom.enrich_pin(uuid, uuid, text, boolean)             → authenticated, EXECUTE
--   custom.enrich_runs(uuid, uuid, integer)                  → authenticated, EXECUTE
--
-- and nothing else. `anon` is not named here and gains nothing; neither is `service_role`.
-- `custom.enrich_normalize` is deliberately NOT granted: it is the judging half of
-- enrich_declare and of custom.field_update's source arm, both of which have already taken
-- the ADMIN decision, and a client reaches every one of its refusals by name through
-- custom.enrich_declare. `custom.enrich_run_class`, `custom.enrich_sensitivity_rank` and
-- `custom.enrich_triggers` are pure and carry no access decision, so they need no row and
-- no grant of their own.
--
-- WHY IT IS A SEPARATE FILE. `platform.door_identity_is_the_catalogs()` refuses a
-- platform.client_callable_door row naming a function that does not exist yet (23514), so
-- the declaration cannot precede the CREATE FUNCTION; lane FORTY-FIVE's law says the GRANT
-- must not precede the declaration. The only order that satisfies both puts the grants in a
-- file of their own. Same shape as dash_the_dashboard_doors_can_be_reached.sql.
--
-- WHO MAY CALL THEM is not decided by these grants. Every one asks
-- custom.assert_client_may_reach first. `enrich_declare` then asks ADMIN on the subject
-- Table — the rung a dashboard, a form and a Rule already ask, because it publishes
-- something about a Table that then writes into everybody's cells. `enrich_pin` and
-- `enrich_land` ask EDITOR on the record, per record, under the CALLER'S OWN principal.
-- `enrichments`, `enrich_due`, `enrich_cells` and `enrich_runs` read, and every row and
-- every column they return is narrowed by custom.query_visible_ids and
-- iam.visible_field_ids for that caller.
--
-- Idempotent: an already-holds GRANT is a no-op.

grant execute on function custom.enrich_declare(uuid, uuid, jsonb) to authenticated;
grant execute on function custom.enrichments(uuid, uuid) to authenticated;
grant execute on function custom.enrich_due(uuid, uuid, integer, boolean) to authenticated;
grant execute on function custom.enrich_cells(uuid, uuid, text[], uuid[]) to authenticated;
grant execute on function custom.enrich_land(uuid, uuid, jsonb, jsonb) to authenticated;
grant execute on function custom.enrich_pin(uuid, uuid, text, boolean) to authenticated;
grant execute on function custom.enrich_runs(uuid, uuid, integer) to authenticated;
