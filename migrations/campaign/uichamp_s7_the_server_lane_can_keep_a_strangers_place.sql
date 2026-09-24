-- chair-step: this GRANTs EXECUTE on TWO functions, `custom.form_draft_save(uuid, jsonb, text, text, text)` and `custom.form_draft_read(uuid, text)`, to `service_role`, the role the app's server holds. A GRANT is refused by the additive allow-list by name, so it comes through this route and a person reads exactly what is opened and to whom. No REVOKE, no DROP, no data movement, no existing grant changed, and `anon` and `authenticated` gain nothing. Apply AFTER uichamp_s7_a_stranger_can_stop_and_come_back.sql.
-- lane: S7-PRIME (a public form keeps a stranger's place)
-- lock: custom,platform
--
-- WHAT THIS OPENS, EXACTLY
-- ------------------------
--   custom.form_draft_save(uuid, jsonb, text, text, text)   → service_role, EXECUTE
--   custom.form_draft_read(uuid, text)                       → service_role, EXECUTE
--
-- and nothing else. Schema USAGE on `custom` for service_role was already granted by
-- `forms_the_server_lane_can_open_the_public_doors.sql`. The caller is the app's server
-- (`app/api/forms/[formId]/draft/route.ts`), exactly as for `custom.form_public`,
-- `custom.form_submit` and `custom.form_public_asks`: the public page is server-rendered and
-- schema `custom` stays revoked from `anon`, W4-ANON's posture, unchanged.
--
-- ORDER, AND WHY IT IS LOAD-BEARING. The door rows are written by the up file, which runs first.
-- A GRANT issued before its declaration is silently revoked by
-- platform.enforce_definer_client_grants' sweep (lane FORTY-FIVE). Declaration first, grant after.
--
-- Idempotent: an already-held GRANT is a no-op. Inverse:
-- `migrations/inverse/uichamp_s7_the_server_lane_can_keep_a_strangers_place_down.sql`.

grant execute on function custom.form_draft_save(uuid, jsonb, text, text, text) to service_role;
grant execute on function custom.form_draft_read(uuid, text) to service_role;
