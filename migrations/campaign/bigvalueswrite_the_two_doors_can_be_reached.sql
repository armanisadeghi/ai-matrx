-- chair-step: this GRANTs EXECUTE on the TWO new functions of bigvalueswrite_a_text_of_any_size_simply_saves.sql - custom.whole_value_complete(uuid, uuid, text, uuid) and custom.whole_values_waiting(uuid, uuid[]) - to `authenticated`, and nothing else. A GRANT is refused by the additive allow-list by name, so it comes through this route. No REVOKE, no DROP, no data movement, no existing grant changed. Both doors are declared in platform.client_callable_door by that file, which runs before this one.
-- lane: BIG-VALUES-WRITE
--
--   custom.whole_value_complete(uuid, uuid, text, uuid) -> authenticated, EXECUTE
--   custom.whole_values_waiting(uuid, uuid[])            -> authenticated, EXECUTE
--
-- WHY A SIGNED-IN PERSON CALLS THEM. matrx_records' RecordStore writes as the person (an RLS
-- session as `authenticated`), and a text over the ceiling must get its file INSIDE that same
-- transaction so a failed upload refuses the whole write: the store asks what is waiting on the
-- records it just wrote (whole_values_waiting), writes each file, and completes each pointer
-- (whole_value_complete). WHO MAY CALL them is decided inside: custom.assert_store_door,
-- custom.assert_client_may_reach, then custom.assert_client_may_change (the EDITOR rung
-- custom.record_update asks) on every record named.
--
-- Idempotent: an already-held GRANT is a no-op.

grant execute on function custom.whole_value_complete(uuid, uuid, text, uuid) to authenticated;
grant execute on function custom.whole_values_waiting(uuid, uuid[]) to authenticated;
