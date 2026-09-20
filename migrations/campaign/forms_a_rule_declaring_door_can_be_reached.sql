-- chair-step: this GRANTs EXECUTE on ONE function to `authenticated`. A GRANT is refused by the additive allow-list by name, so it comes through this route and a person reads exactly which function and why. No REVOKE, no DROP, no data movement, no existing declared grant changed. The function is already declared in platform.client_callable_door by forms_a_rule_can_be_declared_by_the_people_who_need_one.sql, which runs before this file.
-- lane: FORMS (the public form, PRODUCTS row 1)
--
--   custom.rule_declare(uuid, jsonb, uuid)  → authenticated, EXECUTE
--
-- and nothing else. `anon` is not named here and gains nothing.
--
-- WHY IT IS A SEPARATE FILE. `platform.door_identity_is_the_catalogs()` refuses a
-- platform.client_callable_door row naming a function that does not exist yet (23514), so
-- the declaration cannot precede the CREATE FUNCTION. Lane FORTY-FIVE's law says the
-- GRANT must not precede the declaration. The only order that satisfies both puts the
-- grant in a file of its own, after the one that creates and declares the door.
--
-- WHO MAY CALL IT is not decided by this grant: `custom.rule_declare` asks
-- custom.assert_store_door, custom.assert_client_may_reach and then ADMIN on the Table
-- the Rule is about, and custom._rule_shape_guard judges every byte of the spec.
--
-- Idempotent: an already-holds GRANT is a no-op.

grant execute on function custom.rule_declare(uuid, jsonb, uuid) to authenticated;
