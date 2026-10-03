-- chair-step: this GRANTs EXECUTE on THREE new functions to `authenticated`, the same single grant every sibling store door holds (custom.table_declare, custom.record_write, custom.record_update: postgres + authenticated, nothing else), and re-opens their three platform.client_callable_door rows to the signed-in lane (a no-op on first apply). A GRANT is refused by the additive allow-list by name, so it comes through this route. PUBLIC's implicit EXECUTE was already cleared at each function's birth by ddl_guard (§6d-4). No REVOKE, no DROP, no data movement, no other grant changed. The functions are declared by lane12_one_table_is_found_by_its_slug.sql, lane12_two_first_saves_make_one_table.sql and lane12_a_record_is_written_or_updated_by_its_key.sql, which run before this file.
-- lane: PLATFORM-APP-DATA (v6 lane 12)
--
--   custom.table_find(uuid, text, text, text)                   → authenticated, EXECUTE
--   custom.table_ensure(uuid, jsonb)                       → authenticated, EXECUTE
--   custom.record_upsert(uuid, uuid, text[], jsonb, int)   → authenticated, EXECUTE
--
-- `anon` gains nothing. WHAT A CALLER SEES OR CHANGES is not decided by this grant: each body asks
-- the store's own walls (assert_client_may_reach, the read door, record_write / record_update /
-- table_declare / field_declare) as the caller.
--
-- Idempotent: an already-holds GRANT is a no-op.

update platform.client_callable_door
   set signed_in_callers = true, non_client_lane = null
 where (schema_name, function_name) in (('custom', 'table_find'), ('custom', 'table_ensure'), ('custom', 'record_upsert'))
   and not signed_in_callers;

grant execute on function custom.table_find(uuid, text, text, text) to authenticated;
grant execute on function custom.table_ensure(uuid, jsonb) to authenticated;
grant execute on function custom.record_upsert(uuid, uuid, text[], jsonb, integer) to authenticated;
