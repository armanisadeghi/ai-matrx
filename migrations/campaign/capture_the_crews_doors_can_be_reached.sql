-- chair-step: this GRANTs EXECUTE on FIVE new functions to `authenticated`, the role PostgREST gives a signed-in person. A GRANT is refused by the additive allow-list by name, so it comes through this route and a person reads exactly what is opened and to whom. No REVOKE, no DROP, no data movement, no existing grant changed, and neither `anon` nor `service_role` is named anywhere in this file.
-- lane: CAPTURE (mobile field capture, PRODUCTS row 15)
--
-- WHAT THIS OPENS, EXACTLY
-- ------------------------
--   custom.capture_sheet_declare(uuid, uuid, text, jsonb, jsonb, uuid, uuid)          → authenticated, EXECUTE
--   custom.capture_publish(uuid, uuid, boolean)                                        → authenticated, EXECUTE
--   custom.capture_sheets(uuid, uuid)                                                  → authenticated, EXECUTE
--   custom.capture_open(uuid, uuid)                                                    → authenticated, EXECUTE
--   custom.capture_submit(uuid, uuid, text, jsonb, jsonb, text, timestamptz, jsonb)    → authenticated, EXECUTE
--
-- and NOTHING else.
--
-- WHY authenticated AND NOT service_role. This is the opposite case to the public form.
-- A crew member HAS an account and is a member of the organization — the sheet is private,
-- the link is not the capability, and the person's own level on the subject Table is the
-- whole access decision. Routing it through the server as `service_role` would replace a
-- real principal with a secret key and turn five doors that ask `custom.has_visibility`
-- into five doors that ask nothing. The phone calls them as itself.
--
-- EXECUTE IS NOT PERMISSION. Every one of the five makes its own decision inside:
-- capture_sheet_declare and capture_publish ask custom.assert_client_may_change for `admin`
-- on the subject Table, capture_sheets filters every row by custom.has_visibility at
-- `viewer`, capture_open returns no row below `viewer`, and capture_submit asks
-- custom.has_visibility for `editor` BEFORE it admits the sheet exists. All five stand
-- behind custom.assert_store_door / custom.assert_client_may_reach, so the OFF switch still
-- closes them for an organization that has not turned the store on.
--
-- THE INVERSE: `migrations/inverse/capture_down.sql` drops all five functions, which takes
-- these grants with them.

set lock_timeout = '5s';
set statement_timeout = '600s';

grant execute on function custom.capture_sheet_declare(uuid, uuid, text, jsonb, jsonb, uuid, uuid) to authenticated;
grant execute on function custom.capture_publish(uuid, uuid, boolean) to authenticated;
grant execute on function custom.capture_sheets(uuid, uuid) to authenticated;
grant execute on function custom.capture_open(uuid, uuid) to authenticated;
grant execute on function custom.capture_submit(uuid, uuid, text, jsonb, jsonb, text, timestamptz, jsonb) to authenticated;
