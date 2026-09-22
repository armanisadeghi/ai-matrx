-- chair-step: it issues the EXECUTE grant on custom.read_records_archived to `authenticated`, and a GRANT is refused by the additive allow-list by name. Nothing else runs.
--
-- FIX-10A-ARCHIVE, 2026-09-22. THE GRANT, IN ITS OWN FILE, AND THE ORDER IS THE REASON.
--
-- `ddl_guard[definer_client_grant_revoked]` fires ON the grant and reads
-- `platform.client_callable_door` AT THAT MOMENT — not at COMMIT. In
-- `fix10a_the_archive_has_a_read_door.sql` the declaration and the function are created in
-- one transaction, so at the instant a grant inside that same transaction would run, the
-- row the guard is looking for is not yet visible to it and the grant is taken straight
-- back. That is exactly what FIX-10A-ASSISTS learned the hard way three hours earlier
-- (`migrations/assists_door_grant_after_declaration.sql`), and this is the same shape of
-- fix: the door is declared and committed by the previous file, and the grant stands here.
--
-- WITHOUT THIS FILE the door exists, is declared, is correct — and
-- `has_function_privilege('authenticated', …, 'EXECUTE')` is false, so every browser gets
-- PostgREST's own 404 and the Archived screen shows its honest "that door is not there"
-- sentence forever. Measured, not predicted: that is what the main database answered the
-- moment the first file finished.
--
-- `custom.record_archiver` is deliberately NOT granted. It is declared `non_client_lane`
-- and is read only from inside the door below, which has already decided the caller may be
-- there; a browser that could call it directly could learn who last touched any record id
-- it could guess.

grant execute on function custom.read_records_archived(
  uuid, uuid, text, boolean, integer, integer
) to authenticated;
