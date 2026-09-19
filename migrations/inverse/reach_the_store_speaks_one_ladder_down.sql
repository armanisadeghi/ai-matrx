-- chair-step: the inverse of a lane REACH file. It DELETEs declaration rows from platform.client_callable_door, which the additive allow-list refuses by name, and deleting them is what CLOSES the doors this campaign opened - the app loses those verbs again. Nothing here restores a function body; the campaign file's own `-- based-on:` hashes are the identity of the bodies it replaced, and the note below says so.
-- The inverse of migrations/campaign/reach_the_store_speaks_one_ladder.sql (lane REACH, 2026-09-19).
--
-- TWO HALVES, and only the second is a statement.
--
-- 1. THE BODIES. That file replaced the function bodies below. `CREATE OR REPLACE` has
--    no undo of its own, so the inverse of a body change is THE BODY IT WAS BASED ON,
--    and the campaign file names each of those by sha256 in its own `-- based-on:`
--    header. To revert one, take the definition whose body hashes to the value beside
--    its signature here and re-apply it through the runner:
--
--   custom.query_visible_ids(uuid, uuid, text)
--     was sha256 c387de47af0dde6adaf555fed0383bebc01b77cc1eca11dbb79f633d0bbeac44
--   custom._field_write_door()
--     was sha256 0e8bdf36c76466f8598e9eaa7c4d8ade7abb01dbf95100a9214bd39d56f802bd
--   custom.doors_not_on_one_ladder()
--     was sha256 b7c59354b139677996aa61c824b059b3b69fd3715e9a25f6fcc69c9d4815b416
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
   and declared_by like 'migrations/campaign/reach_the_store_speaks_one_ladder.sql%'
   and function_name in ('query_visible_ids');
