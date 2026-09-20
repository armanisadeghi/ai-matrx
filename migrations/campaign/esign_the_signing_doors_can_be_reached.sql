-- chair-step: this GRANTs EXECUTE on seven functions — four to `authenticated`, three to `service_role` — and USAGE on schema `custom` to `service_role`. A GRANT is refused by the additive allow-list by name, so it comes through this route and a reader sees exactly what is opened and to whom. No REVOKE, no DROP, no data movement, no existing grant changed, and `anon` gains nothing.
-- lane: ESIGN (PRODUCTS row 16, "Have the client sign this before we start.")
--
-- WHAT THIS OPENS, EXACTLY
-- ------------------------
--   custom.sign_request_create(uuid, uuid, text, text, text, interval)   → authenticated
--   custom.sign_requests(uuid, uuid)                                     → authenticated
--   custom.sign_request_cancel(uuid, uuid, text)                         → authenticated
--   custom.sign_request_remind(uuid, uuid)                               → authenticated
--   custom.sign_request_public(text, text)                               → service_role
--   custom.sign_request_sign(text, text, text, text, text, text, text)   → service_role
--   custom.sign_request_decline(text, text, text, text)                  → service_role
--   schema custom                                                        → service_role, USAGE
--
-- and NOTHING else. `anon` is not named anywhere in this file, and schema `custom` stays
-- revoked from it.
--
-- THE FOUR AND THE THREE, AND WHY THE LINE IS WHERE IT IS.
-- --------------------------------------------------------
-- The first four are acts of a person WITH an account, standing inside their own
-- organization: asking for a signature, watching for it, withdrawing the ask, nudging the
-- signer. Each one asks the ladder in its own body — reach on the organization, then
-- `editor` (or `viewer`, for the list) on the record the document is about — so the grant
-- decides only who may knock.
--
-- The last three are acts of somebody with NO account at all, and that is exactly why they
-- are NOT granted to `anon`. The signing page is SERVER-RENDERED and its two writes are
-- route handlers, so the caller is the app's own server — the only party that knows the
-- request's real origin, the signer's address and the browser they used, all three of
-- which are part of what a signature certificate MEANS. A browser asserting its own
-- address on a certificate is a certificate that lies. `service_role` is reachable only
-- with the secret key that server holds (`utils/supabase/adminClient.ts`,
-- `SUPABASE_SECRET_KEY`) and never leaves the process.
--
-- service_role BYPASSES RLS, AND THAT CHANGES NOTHING HERE. All seven are SECURITY DEFINER
-- owned by the store's owner, so they already run with the definer's authority whoever
-- calls them; the grant decides who may knock, never what the door does. Schema USAGE
-- alone reaches no table: every table in `custom` is revoked from `service_role` and this
-- file does not change that.
--
-- THE HELPERS ARE GRANTED TO NOBODY, on purpose. `custom.sign_token_encode`,
-- `custom.sign_token_decode`, `custom.sign_request_state`, `custom.sign_request_sentence`
-- and `custom._sign_request_resolve` are called only from inside the seven above, in the
-- same transaction. `_sign_request_resolve` in particular would hand its caller the whole
-- request row.
--
-- THE ORDER OF THE TWO KINDS OF STATEMENT IS LOAD-BEARING and it is already right:
-- `esign_asking_somebody_to_sign_is_a_door.sql` writes all twelve
-- `platform.client_callable_door` rows, and this file runs after it. A GRANT issued BEFORE
-- its declaration is silently revoked by `platform.enforce_definer_client_grants`'
-- database-wide sweep while the runner still reports success.
--
-- WHY THE FINAL SWEEP LINE IS HERE. The door rows landed in the SAME file as the functions
-- and AFTER them, so `platform.enforce_definer_client_grants` fired on each CREATE FUNCTION
-- before the declaration existed and took PostgreSQL's default PUBLIC EXECUTE back from all
-- twelve — printing eight WARNINGs that say so. That is the guard working. The declarations
-- exist now, so `platform.reopen_declared_doors('custom')` is run once at the end, which is
-- the remedy that guard's own HINT names.
--
-- Idempotent: an already-held GRANT is a no-op, and the sweep is a no-op when nothing moved.

grant usage on schema custom to service_role;

grant execute on function custom.sign_request_create(uuid, uuid, text, text, text, interval) to authenticated;

grant execute on function custom.sign_requests(uuid, uuid) to authenticated;

grant execute on function custom.sign_request_cancel(uuid, uuid, text) to authenticated;

grant execute on function custom.sign_request_remind(uuid, uuid) to authenticated;

grant execute on function custom.sign_request_public(text, text) to service_role;

grant execute on function custom.sign_request_sign(text, text, text, text, text, text, text) to service_role;

grant execute on function custom.sign_request_decline(text, text, text, text) to service_role;

select platform.reopen_declared_doors('custom');
