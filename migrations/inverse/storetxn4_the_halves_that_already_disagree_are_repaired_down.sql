-- STORE-TXN-4's inverse. The two functions this lane ADDED go away; nothing else moves.
--
-- WHAT THIS DOES NOT UNDO, AND CANNOT. The repairs themselves are rows, not schema: each one is
-- a `history.migration_log` entry with a real `patch` inverse, and the way to put ONE record
-- back is `history.migration_undo(organization, log_id)` — the platform's own undo, run per
-- record, by somebody who has decided that record should go back to disagreeing with itself.
-- Dropping the door does not un-write a document, and a file that pretended otherwise would be
-- lying about what an inverse is.
--
-- ground-standing-ok: c — both names are this lane's own, created by
--   migrations/campaign/storetxn4_the_halves_that_already_disagree_are_repaired.sql, and no
--   trigger, view, policy or other function on this database calls either of them.

drop function if exists custom.relation_halves_repair(uuid, uuid);
drop function if exists custom.relation_halves_disagreements(uuid, uuid);

delete from platform.client_callable_door
 where schema_name = 'custom'
   and function_name in ('relation_halves_disagreements', 'relation_halves_repair')
   and declared_by like '%storetxn4_the_halves_that_already_disagree_are_repaired.sql%';
