-- chair-step: this GRANTs EXECUTE on FIVE functions to `service_role`, the role the app's server holds. A GRANT is refused by the additive allow-list by name, so it comes through this route and a person reads exactly what is opened and to whom. No REVOKE, no DROP, no data movement, no existing grant changed, and `anon` gains nothing.
-- lane: BOOKING (the public booking page, PRODUCTS row 14)
--
-- WHAT THIS OPENS, EXACTLY
-- ------------------------
--   custom.booking_public(uuid, integer)                               → service_role
--   custom.booking_hold(uuid, text, text, text, text)                  → service_role
--   custom.booking_confirm(uuid, uuid, text, jsonb, text, text, text)  → service_role
--   custom.booking_manage(text, integer)                               → service_role
--   custom.booking_reschedule(text, text, text, text)                  → service_role
--   custom.booking_cancel(text, text)                                  → service_role
--
-- and NOTHING else. `anon` is not named anywhere in this file: schema `custom` stays
-- revoked from it, which is the posture W4-ANON chose and lane FORMS agreed with. USAGE
-- on schema `custom` was already granted to `service_role` by
-- `forms_the_server_lane_can_open_the_public_doors.sql`; this file does not repeat it.
--
-- WHY service_role AND NOT authenticated. The person booking a consult has no account.
-- `authenticated` would mean a signed-in caller, which is the case these doors exist to
-- avoid; `anon` would mean the browser itself, and the browser cannot be trusted with the
-- request's real origin or its own rate-limit bucket — a browser choosing its own bucket
-- is a browser counting itself. `service_role` is reachable only with the secret key the
-- server holds and never leaves it.
--
-- THE ORDER IS LOAD-BEARING and it is right: `booking_a_booking_is_a_record_with_a_held_slot.sql`
-- writes every `platform.client_callable_door` row, and this file runs after it. A GRANT
-- issued BEFORE its declaration is silently revoked by
-- `platform.enforce_definer_client_grants`' database-wide sweep while the runner still
-- reports success.
--
-- Idempotent: an already-holds GRANT is a no-op.

grant execute on function custom.booking_public(uuid, integer) to service_role;

grant execute on function custom.booking_hold(uuid, text, text, text, text) to service_role;

grant execute on function custom.booking_confirm(uuid, uuid, text, jsonb, text, text, text) to service_role;

grant execute on function custom.booking_manage(text, integer) to service_role;

grant execute on function custom.booking_reschedule(text, text, text, text) to service_role;

grant execute on function custom.booking_cancel(text, text) to service_role;
