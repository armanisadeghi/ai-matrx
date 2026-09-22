-- chair-step: it REVOKES `authenticated`'s EXECUTE on `custom.migrate_purge_hard`. A revoke is
--   outside the additive allow-list. Nothing else moves.
-- lock: custom,platform
-- lane: STORE-TXN-3
--
-- STORE-TXN-3c — THE REVOKE ONLY LANDS AFTER THE REGISTER ALREADY SAYS THE DOOR IS SHUT.
--
-- `storetxn3b_the_purge_door_stays_chair_only.sql` revoked the grant and THEN corrected the
-- register row, in that order, in one transaction — and the grant survived. The database said so
-- at the time and the sentence was read past:
--
--   NOTICE: platform.reopen_declared_doors(custom): a revoke sweep took EXECUTE back from
--   declared client doors and they were re-granted in the same transaction.
--
-- That is §6d's own repair trigger doing exactly its job: a revoke that strips EXECUTE from a
-- function whose `platform.client_callable_door` row still says a signed-in caller may open it is
-- treated as a sweep that broke a live door, and the grant is put straight back. The row was only
-- corrected two statements later, so the repair had already run. Measured afterwards on the MAIN
-- database: `has_function_privilege('authenticated', …) = true` with `signed_in_callers = false`
-- — the grant and the register disagreeing, which is the state both of them exist to prevent.
--
-- THE ORDER IS THE FIX, and it is the mirror of the one §6d-4 enforces in the other direction
-- (declare the door BEFORE granting): **close the register row BEFORE revoking.** 3b already left
-- the row closed, so this file is the revoke alone, and it is now the truth the repair trigger
-- reads rather than a contradiction of it.
--
-- THE INVERSE: `migrations/inverse/storetxn3c_the_revoke_lands_after_the_register_says_so_down.sql`.

set lock_timeout = '5s';
set statement_timeout = '300s';

revoke execute on function custom.migrate_purge_hard(uuid, uuid, text, integer, boolean)
  from authenticated;
