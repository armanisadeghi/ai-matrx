-- chair-step: this GRANTs EXECUTE on two new functions to `authenticated` and nothing else. A GRANT is refused by the additive allow-list by name, so it comes through this route and a person reads exactly which functions and why. No REVOKE, no DROP, no data movement, no existing grant changed. Both are declared in platform.client_callable_door by digests_a_saved_view_has_a_door.sql, which runs before this file.
-- lane: DIGESTS (subscriptions and digests, PRODUCTS row 8; DOOR-18)
--
--   custom.view_declare(uuid, uuid, jsonb) → authenticated, EXECUTE
--   custom.views(uuid, uuid)               → authenticated, EXECUTE
--
-- WHO MAY CALL THEM is not decided by these grants. Both ask
-- `custom.assert_client_may_reach` for the organization wall; `view_declare` then
-- asks `custom.assert_client_may_open` at the VIEWER rung on the Table, and `views`
-- narrows its rows in SQL, as the definer, to Tables the caller can already open.
-- Neither opens `platform.saved_view` itself to anybody.

grant execute on function custom.view_declare(uuid, uuid, jsonb) to authenticated;
grant execute on function custom.views(uuid, uuid) to authenticated;
