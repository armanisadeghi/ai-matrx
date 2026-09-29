-- chair-step: this GRANTs EXECUTE on TWO new functions, custom.table_dimensions(uuid, uuid) and custom.table_dimensions_set(uuid, uuid, jsonb), to `authenticated`, and nothing else. A GRANT is refused by the additive allow-list by name, so it comes through this route. No REVOKE, no DROP, no data movement, no existing grant changed. Both doors are declared in platform.client_callable_door by drillcustom_a_table_says_its_own_dimensions_and_measures.sql, which runs before this file.
-- lane: DRILL-CUSTOM-PARITY
--
--   custom.table_dimensions(uuid, uuid)            → authenticated, EXECUTE
--   custom.table_dimensions_set(uuid, uuid, jsonb) → authenticated, EXECUTE
--
-- WHO MAY CALL THEM is not decided by this grant. custom.table_dimensions asks
-- custom.assert_client_may_reach (the organization wall) and custom.assert_may_know_table (the
-- Table's own ladder) before anything is read, and offers only the columns the reader's own read
-- mask shows. custom.table_dimensions_set asks custom.assert_store_door, the organization wall,
-- and EDITOR on the Table (custom.assert_client_may_change) before the Table row is read.
--
-- WHY BY NAME: both are SECURITY DEFINER functions created in a schema declared closed, so the DDL
-- guard takes a client grant back inside the creating transaction (measured on the clone
-- 2026-09-29: both came out {postgres=X/postgres}).
--
-- Idempotent: an already-held GRANT is a no-op.

grant execute on function custom.table_dimensions(uuid, uuid) to authenticated;
grant execute on function custom.table_dimensions_set(uuid, uuid, jsonb) to authenticated;
