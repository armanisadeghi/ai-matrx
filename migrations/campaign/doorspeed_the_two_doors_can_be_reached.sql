-- chair-step: this GRANTs EXECUTE on the TWO new functions of doorspeed_a_page_is_sorted_searched_and_counted_and_a_batch_is_one_transaction.sql - custom.read_records_page(uuid, uuid, jsonb, text, jsonb, uuid, boolean, integer, integer) and custom.record_change_many(uuid, uuid, jsonb) - to `authenticated`, and nothing else. A GRANT is refused by the additive allow-list by name, so it comes through this route. No REVOKE, no DROP, no data movement, no existing grant changed. Both doors are declared in platform.client_callable_door by that file, which runs before this one.
-- lane: data-tables-grid-overhaul
--
--   custom.read_records_page(uuid, uuid, jsonb, text, jsonb, uuid, boolean, integer, integer) -> authenticated, EXECUTE
--   custom.record_change_many(uuid, uuid, jsonb)                                             -> authenticated, EXECUTE
--
-- WHY A SIGNED-IN PERSON CALLS THEM. The Sheet (the /data grid over the record store) reads one
-- page sorted, searched and counted by the store, and writes a paste / fill / bulk edit as one
-- transaction. WHO MAY CALL them is decided inside: the page door asks
-- custom.assert_client_may_reach, custom.assert_may_know_table and the one ladder exactly as
-- custom.read_records_matching does; the batch door asks custom.assert_store_door and the editor
-- rung on the Table, then every change passes its own one-record door.
--
-- Idempotent: an already-held GRANT is a no-op.

grant execute on function custom.read_records_page(uuid, uuid, jsonb, text, jsonb, uuid, boolean, integer, integer) to authenticated;
grant execute on function custom.record_change_many(uuid, uuid, jsonb) to authenticated;
