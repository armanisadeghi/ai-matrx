-- 🚨 TWO BODIES ARE LEFT STANDING, ON PURPOSE (lane INVERSE-GUARD, 2026-09-21).
-- The header below says the `custom.query_` prefix is reserved to this lane, "so this drop cannot
-- reach another lane's work even by accident". The prefix held; the CALLERS did not. Two of these
-- functions were adopted by later lanes and are reached by EIGHT triggers standing on
-- `custom.record` and `platform.associations` right now — `custom_record_field_shape_guard_class`,
-- `zz_ckl_watch`, `custom_record_rule_uses`, `io_record_changed` and its three statement-level
-- twins, and `trg_associations_zzz_relation_contract`:
--   custom.query_is_store_owner <- custom.work_approval_request (apprvfix_the_queue_holds_a_record_write_too.sql)
--   custom.query_principal      <- custom.may_invite_outside (access_lane_null_uid_gate_and_org_not_null.sql)
-- Dropping the two principal helpers took the ground out from under every write to the record
-- store. They stay standing.
--   THE DEFECT IS STILL RESTORED: all fourteen W4-QUERY doors — the as-of readers, the rollups,
-- the relation-edge reader, the coordinate and home queries, the visibility readers and the hot-path
-- machinery — still go, so the W4-QUERY surface is gone. What stays is two private helpers with
-- no door of their own that two other lanes now call.
--
-- chair-step: drops the W4-QUERY surface (custom.query_*), which is this lane's own reserved prefix and nothing else — it exists so rule 27's up → inverse → up can be run on the lane's final bytes
--
-- THE INVERSE of the four `w4_query_*` files. Every object named here was created by this lane
-- and by nothing else: the prefix `custom.query_` is reserved to it (rule 7), so this drop
-- cannot reach another lane's work even by accident.
--
-- It is DROP IF EXISTS throughout, so it is safe to run against a partially applied lane —
-- which is exactly the state rule 27's middle step leaves behind when a file fails halfway.

set lock_timeout = '5s';

drop function if exists custom.query_hot_paths_prepared();
drop function if exists custom.query_prepare_hot();
drop function if exists custom.query_hot_paths();

drop function if exists custom.query_table_as_of(uuid, uuid, timestamptz, date, integer, integer, text);
drop function if exists custom.query_record_as_of(uuid, uuid, timestamptz, date, text);
drop function if exists custom.query_rollup_sum(uuid, uuid[], text, text, text, integer, text);
drop function if exists custom.query_rollup(uuid, uuid[], text, text, integer, text);
drop function if exists custom.query_relation_edges(uuid, text, text);

drop function if exists custom.query_across_homes(uuid, uuid, integer, integer, text);
drop function if exists custom.query_table_homes(uuid, uuid);
drop function if exists custom.query_by_coordinates(uuid, uuid, jsonb, integer, integer, text);

drop function if exists custom.query_can_see(uuid, uuid, text);
drop function if exists custom.query_visible_ids(uuid, uuid, text);
drop function if exists custom.query_access_ids(uuid, text);
-- LEFT STANDING (lane INVERSE-GUARD, 2026-09-21): drop function if exists custom.query_is_store_owner();
-- LEFT STANDING (lane INVERSE-GUARD, 2026-09-21): drop function if exists custom.query_principal();
