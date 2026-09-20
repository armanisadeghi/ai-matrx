-- chair-step: this GRANTs EXECUTE on FIVE functions to `authenticated`. A GRANT is refused by the additive allow-list by name, so it comes through this route and a person reads exactly which functions and why. No REVOKE, no DROP, no data movement, no existing declared grant changed. All five are already declared in platform.client_callable_door by histscreens_a_record_can_say_who_changed_it.sql, which runs before this file.
-- lane: HISTORY-SCREENS (PRODUCTS row 4, "Who changed this price, and can I put it back?")
--
--   custom.record_history(uuid, uuid, integer, integer)                    → authenticated, EXECUTE
--   custom.field_history(uuid, uuid, text, integer, integer, uuid)         → authenticated, EXECUTE
--   custom.record_restore_preview(uuid, uuid, integer, text)               → authenticated, EXECUTE
--   custom.record_restore_version(uuid, uuid, integer)                     → authenticated, EXECUTE
--   custom.value_restore(uuid, uuid, text, integer)                        → authenticated, EXECUTE
--
-- and nothing else. `anon` is not named here and gains nothing; neither is `service_role`.
-- `custom.history_people`, `custom.history_changes`, `custom.history_actor` and
-- `custom.history_restore_body` are deliberately NOT granted: they are the reading and
-- diffing halves the five doors call under SECURITY DEFINER, each declared `server_only`
-- with the reason, and a door a client does not need is a door a client does not get.
--
-- WHY IT IS A SEPARATE FILE. `platform.door_identity_is_the_catalogs()` refuses a
-- platform.client_callable_door row naming a function that does not exist yet (23514), so the
-- declaration cannot precede the CREATE FUNCTION; the §6d-4 law says the GRANT must not
-- precede the declaration. The only order that satisfies both puts the grants in a file of
-- their own, after the one that creates and declares the doors. Same shape as
-- dash_the_dashboard_doors_can_be_reached.sql.
--
-- WHO MAY CALL THEM is not decided by these grants. All five ask
-- custom.assert_client_may_reach first. `record_history` then asks VIEWER on the record —
-- reading how something got to be the way it is is reading, which is what Notion and
-- Airtable give a read-only collaborator. `field_history` asks custom.assert_may_know_table
-- and then narrows every row by custom.visible_predicate_sql for the CALLER'S OWN principal.
-- The three restore doors ask EDITOR through custom.assert_client_may_change, and the write
-- itself goes through custom.record_update, which asks again.
--
-- Idempotent: an already-held GRANT is a no-op.

grant execute on function custom.record_history(uuid, uuid, integer, integer) to authenticated;
grant execute on function custom.field_history(uuid, uuid, text, integer, integer, uuid) to authenticated;
grant execute on function custom.record_restore_preview(uuid, uuid, integer, text) to authenticated;
grant execute on function custom.record_restore_version(uuid, uuid, integer) to authenticated;
grant execute on function custom.value_restore(uuid, uuid, text, integer) to authenticated;
