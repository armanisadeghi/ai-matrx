-- chair-step: the inverse of a lane REACH file. It DELETEs declaration rows from platform.client_callable_door, which the additive allow-list refuses by name, and deleting them is what CLOSES the doors this campaign opened - the app loses those verbs again. Nothing here restores a function body; the campaign file's own `-- based-on:` hashes are the identity of the bodies it replaced, and the note below says so.
-- The inverse of migrations/campaign/reach_the_purge_verb_is_reachable.sql (lane REACH, 2026-09-19).
--
-- TWO HALVES, and only the second is a statement.
--
-- 1. THE BODIES. That file replaced the function bodies below. `CREATE OR REPLACE` has
--    no undo of its own, so the inverse of a body change is THE BODY IT WAS BASED ON,
--    and the campaign file names each of those by sha256 in its own `-- based-on:`
--    header. To revert one, take the definition whose body hashes to the value beside
--    its signature here and re-apply it through the runner:
--
--   custom.migrate_purge(uuid, uuid, boolean)
--     was sha256 5bddf7d9260e5c0cbb234d318a4d6fabe3a499269f8a4352a528f28b8e63e7db
--
--    There is no second copy of those bodies in this repository. The hash is the
--    identity; the git history of the campaign directory is where the text is.
--
-- 2. THE DOORS. This is the half that runs, and it is what actually closes the reach:
--    the declaration comes out, and the DDL guard takes the EXECUTE grant with it on
--    the next DDL that touches each function. A door with no row is a door with no
--    grant, which is the whole point of the mechanism.

set lock_timeout = '5s';

delete from platform.client_callable_door
 where schema_name = 'custom'
   and declared_by like 'migrations/campaign/reach_the_purge_verb_is_reachable.sql%'
   and function_name in ('migrate_purge');
