-- chair-step: GRANT, which the additive allow-list refuses by name at production — and correctly, because a blacklist cannot tell a door being opened from a schema being thrown open. This opens EXACTLY the two read doors, and nothing else in schema custom. Every other object stays revoked from every client role, and the product switch custom/system_enabled still resolves false, so the store still takes no writes from a browser.
--
-- W4-DOOR — THE DOORS THE CLIENTS NEED, AND ONLY THOSE.
--
-- DOOR-1 · DOOR-12 · DOOR-N-1.
--
-- WHAT THIS OPENS
--   · USAGE on schema `custom` for `authenticated` — which by itself reaches nothing,
--     because every table, sequence and function in the schema is separately revoked.
--   · EXECUTE on `custom.read_records` and `custom.read_record` — the two functions
--     declared `signed_in_callers = true` in `platform.client_callable_door` by
--     `w4_door_the_read_door.sql`, and the only two in the schema that take no principal.
--   · EXECUTE on `custom.store_is_open`, `custom.caller_role` and
--     `custom.assert_store_door` — the three the store uses to tell a caller, in its own
--     sentence, that it is switched off. Without them a browser gets a bare
--     "permission denied for schema custom" instead of the honest message, which is law 4
--     backwards. They read no record and answer no access question.
--
-- WHAT THIS DOES NOT OPEN, AND WHY IT CANNOT
--   · `custom.record` and every other table: no SELECT, INSERT, UPDATE or DELETE for any
--     client role. DOOR-N-1 — one write door — is a privilege fact, not a policy.
--   · `custom.record_write` / `record_update` / `record_delete` / `record_restore` /
--     `table_declare`: their door rows read `signed_in_callers = false`, and
--     `platform.enforce_definer_client_grants` REVOKES a client grant on any of them inside
--     the GRANT statement itself. The refusal is the system's, not this file's.
--   · anon. Nothing here is granted to `anon`, `public` or `service_role`, and the
--     birth-time guard has already revoked PUBLIC from every function in this schema.
--
-- THE INVERSE is `migrations/inverse/w4_door_the_client_grants_down.sql`, which revokes
-- exactly these five grants and the schema usage, restoring the closed schema byte for byte.

set lock_timeout = '5s';
set statement_timeout = '120s';

grant usage on schema custom to authenticated;

grant execute on function custom.read_records(uuid, uuid, boolean, integer, integer) to authenticated;
grant execute on function custom.read_record(uuid, uuid, boolean) to authenticated;

grant execute on function custom.store_is_open(uuid) to authenticated;
grant execute on function custom.caller_role() to authenticated;
grant execute on function custom.assert_store_door(uuid, text) to authenticated;
