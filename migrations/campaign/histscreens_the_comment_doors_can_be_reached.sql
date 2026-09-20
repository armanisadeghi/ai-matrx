-- chair-step: this GRANTs EXECUTE on TWO functions to `authenticated`. A GRANT is refused by the additive allow-list by name, so it comes through this route and a person reads exactly which functions and why. No REVOKE, no DROP, no data movement, no existing declared grant changed. Both are already declared in platform.client_callable_door by histscreens_a_comment_can_name_somebody.sql, which runs before this file.
-- lane: HISTORY-SCREENS (PRODUCTS row 4, SCR-18 CommentThread)
--
--   custom.comment_thread(uuid, uuid, boolean)                        → authenticated, EXECUTE
--   custom.comment_write(uuid, uuid, text, jsonb, uuid, uuid[])       → authenticated, EXECUTE
--
-- and nothing else. `anon` is not named here and gains nothing; neither is `service_role`.
-- `custom.comment_mention_deliver` is deliberately NOT granted: it is the sender, and a
-- client-callable sender would let any signed-in person put any sentence in anybody's inbox.
-- A person reaches it by writing a comment that names somebody.
--
-- WHY IT IS A SEPARATE FILE. platform.door_identity_is_the_catalogs() refuses a
-- platform.client_callable_door row naming a function that does not exist yet (23514), so
-- the declaration cannot precede the CREATE FUNCTION; the §6d-4 law says the GRANT must not
-- precede the declaration. The only order that satisfies both puts the grants in their own
-- file, after the one that creates and declares the doors.
--
-- WHO MAY CALL THEM is not decided by these grants. custom.comment_thread returns nothing at
-- all unless the caller holds viewer on the record, because custom.io_comments decides that;
-- custom.comment_write is refused unless the caller holds COMMENTER, because
-- custom.io_comment_write decides that — and every person it would notify must already hold
-- viewer on the same record, refused by name before anything is written.
--
-- Idempotent: an already-held GRANT is a no-op.

grant execute on function custom.comment_thread(uuid, uuid, boolean) to authenticated;
grant execute on function custom.comment_write(uuid, uuid, text, jsonb, uuid, uuid[]) to authenticated;
