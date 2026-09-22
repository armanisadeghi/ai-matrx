-- chair-step: this GRANTs EXECUTE on THREE functions to `authenticated`. A GRANT is refused by the additive allow-list by name, so it comes through this route and a person reads exactly which functions and why. No REVOKE, no DROP, no data movement, no existing declared grant changed. All three are already declared in platform.client_callable_door by hub_the_organization_has_one_front_door.sql, which runs before this file.
-- lane: DATA-HUB (the organization's front door for the record store — /data-v2's hub)
--
--   custom.pipelines(uuid)                        → authenticated, EXECUTE
--   custom.shares_outside(uuid)                   → authenticated, EXECUTE
--   custom.hub_changed_by(uuid, text, uuid[])     → authenticated, EXECUTE
--
-- and nothing else. `anon` is not named here and gains nothing; neither is `service_role`.
-- The hub reads nine more capabilities and asks for NO new grant for any of them: Tables,
-- Forms, Bookings, Portals, Dashboards, Digests, Checklists, Archived items and what is
-- shared with me already have a door `authenticated` may call.
--
-- WHY IT IS A SEPARATE FILE. `platform.door_identity_is_the_catalogs()` refuses a
-- platform.client_callable_door row naming a function that does not exist yet (23514), so the
-- declaration cannot precede the CREATE FUNCTION; lane FORTY-FIVE's law says the GRANT must
-- not precede the declaration. The only order that satisfies both puts the grants in a file
-- of their own, after the one that creates and declares the doors. Same shape as
-- dash_the_dashboard_doors_can_be_reached.sql.
--
-- WHO MAY CALL THEM is not decided by these grants. All three ask
-- custom.assert_client_may_reach first, so an organization the caller is not in is refused by
-- name before a row is read; all three then narrow to
-- custom.query_visible_ids(org, custom.table_kernel_id()) — the Tables this caller can
-- already open — and custom.hub_changed_by additionally refuses to answer for a business
-- record at all.
--
-- Idempotent: an already-holds GRANT is a no-op.

grant execute on function custom.pipelines(uuid) to authenticated;
grant execute on function custom.shares_outside(uuid) to authenticated;
grant execute on function custom.hub_changed_by(uuid, text, uuid[]) to authenticated;
