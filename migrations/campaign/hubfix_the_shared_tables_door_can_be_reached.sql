-- chair-step: this GRANTs EXECUTE on ONE function to `authenticated`. A GRANT is refused by the additive allow-list by name, so it comes through this route and a person reads exactly which function and why. No REVOKE, no DROP, no data movement, no existing declared grant changed. The function is already declared in platform.client_callable_door by hubfix_a_table_shared_with_you_stays_listed.sql, which runs before this file.
-- lane: HUB-FIX (VERIFIER-15 H6 — an accepted share stays listed under "Shared with me")
--
--   custom.tables_shared_with_me()   → authenticated, EXECUTE
--
-- and nothing else. `anon` is not named here and gains nothing; neither is `service_role`.
--
-- WHY IT IS A SEPARATE FILE. `platform.door_identity_is_the_catalogs()` refuses a
-- platform.client_callable_door row naming a function that does not exist yet, so the
-- declaration cannot precede the CREATE FUNCTION; the GRANT must not precede the
-- declaration. Same shape as hub_the_hub_doors_can_be_reached.sql.
--
-- WHO MAY CALL IT is not decided by this grant: the function answers only about
-- custom.query_principal(), the person signed in, and only about grants addressed to them.
--
-- Idempotent: an already-holds GRANT is a no-op.

grant execute on function custom.tables_shared_with_me() to authenticated;
