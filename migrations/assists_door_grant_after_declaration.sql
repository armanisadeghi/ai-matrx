-- chair-step: it re-issues the EXECUTE grant on platform.act_on_my_assists to `authenticated`, and a GRANT is refused by the additive allow-list by name. Nothing else runs.
--
-- FIX-10A-ASSISTS, 2026-09-22. The ORDER matters and the previous file had it backwards.
-- `ddl_guard[definer_client_grant_revoked]` fires ON the grant and reads
-- `platform.client_callable_door` AT THAT MOMENT: in
-- `migrations/assists_writes_go_through_a_door.sql` the door row was inserted AFTER the
-- grant, so the guard took the grant straight back and `has_function_privilege` for
-- `authenticated` came back false. The door row is now declared, so this grant stands.
-- Anyone writing the next door: declare the row FIRST, grant SECOND, in one file.

grant execute on function platform.act_on_my_assists(
  text, uuid[], text[], text, timestamptz, text, boolean, jsonb, jsonb
) to authenticated;
