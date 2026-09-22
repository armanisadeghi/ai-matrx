-- chair-step: it REVOKES the `authenticated` EXECUTE grant that
--   `storetxn3_a_link_writes_both_halves.sql` put on `custom.migrate_purge_hard` twenty minutes
--   earlier in the same session, and puts that door's `platform.client_callable_door` row back to
--   `signed_in_callers = false` with its original lane sentence. A revoke is outside the additive
--   allow-list by design. NOTHING ELSE MOVES: the relation half of that file — the whole reason
--   it exists — stays exactly as applied.
-- lock: custom,platform
-- lane: STORE-TXN-3
--
-- STORE-TXN-3b — THE PURGE DOOR STAYS CHAIR-ONLY, AND THE NIT IS NOT FIXED BY OPENING IT.
--
-- WHAT WAS TRIED, AND WHY IT IS BEING TAKEN BACK IN THE SAME SESSION. VERIFIER-13 item 2 recorded
-- a real law-4 defect: a signed-in caller reaching `custom.migrate_purge_hard` hears PostgreSQL's
-- `permission denied for function migrate_purge_hard` and never the door's own written refusal,
-- which names the remedy (archive through `custom.migrate_purge`; this is a compliance erasure run
-- by a person at a terminal). The obvious fix — grant EXECUTE so the body's own chair-only check,
-- which is its FIRST statement, is what the person hears — was applied at 17:13:11Z and MEASURED
-- from the seat: the seat does hear the door and the hard delete stays shut
-- (`storetxn3_green.sql` clause 7).
--
-- AND TWO OF THE PLATFORM'S OWN GUARDS SAY IT IS THE WRONG SHAPE, both correctly:
--   · `ddl_guard[client_grant_on_a_non_client_door]` (§6d-4 / DD-223) refuses a client EXECUTE
--     grant on a door whose register row says no browser session reaches it. That one was
--     satisfied by correcting the row first — which is what the guard asks for.
--   · `pnpm check:store-doors-decide` then failed, twice, on the corrected row: *"client doors
--     taking an organization id that never decide the caller — 1"* and *"declared client doors
--     whose body never goes through the one ladder — 1"*. That guard is right too: this body
--     decides with `pg_has_role` against the owner of `custom.record`, never with
--     `custom.assert_client_may_reach` / `_may_change` / `has_visibility`, so by the register's
--     own words it is a client door that does not decide the caller.
--
-- THERE IS NO HONEST WAY TO SATISFY BOTH WITH THIS DOOR. Adding a ladder call to the body would
-- either sit unreachable behind the chair check — a line written to quiet a census, which is the
-- thing this campaign keeps calling out — or run for the chair and make a compliance erasure
-- depend on the erasing operator being a member of the organization, which is a weakening of a
-- destructive door to improve a sentence. Deleting or narrowing either guard to clear the error is
-- forbidden outright. So the grant goes back.
--
-- WHAT THE REAL FIX IS, FOR WHOEVER OWNS THAT DOOR NEXT. The register has two words —
-- "a client may open this" and "no client may open this" — and this door needs a third: *a client
-- may CALL it and the only thing it will ever answer is its written refusal*. Either that word is
-- added to `platform.client_callable_door` (with `check:store-doors-decide` reading it and
-- exempting exactly those doors, because a door that always refuses decides nothing else), or the
-- client-facing surface gets its own small door — `custom.migrate_purge_hard_request(organization)`
-- — that decides the caller through the ladder and then raises the same sentence. Both are
-- decisions about the purge door's surface, not about the link writer this lane was sent to fix.
-- Until one is made, a client calling the hard purge still hears PostgreSQL, and that is written
-- down here rather than left to be rediscovered.
--
-- THE INVERSE: `migrations/inverse/storetxn3b_the_purge_door_stays_chair_only_down.sql`.

set lock_timeout = '5s';
set statement_timeout = '300s';

revoke execute on function custom.migrate_purge_hard(uuid, uuid, text, integer, boolean)
  from authenticated;

update platform.client_callable_door
   set signed_in_callers = false,
       non_client_lane   = 'chair_only: a compliance erasure is run by a person at a terminal who owns custom.record, never by a signed-in seat. Browser roles hold no EXECUTE privilege on this function and this migration grants none; the body refuses any caller that is not a member of custom.record''s owner role as well, so a grant issued by mistake later still would not open a hard delete. STORE-TXN-3b 2026-09-22: opening it so the person could hear the door''s own sentence instead of PostgreSQL''s was tried, measured and taken back — check:store-doors-decide is right that a body deciding with pg_has_role rather than the one ladder is not a client door. The refusal-with-no-remedy VERIFIER-13 recorded is therefore still open; the remedy is a register word for "callable only to be refused", or a separate request door that decides through the ladder.',
       reason = 'The hard delete, moved off the path every screen reaches. Under the owner''s law of 2026-09-20 nothing important is deleted and nothing is purged by default: custom.migrate_purge archives, and this door destroys only after every record in scope has been archived for at least thirty days and a written reason of at least forty characters has been given, in chunks, under its own lock_timeout, never touching an id custom.record_alias still resolves to.'
 where schema_name = 'custom'
   and function_name = 'migrate_purge_hard';
