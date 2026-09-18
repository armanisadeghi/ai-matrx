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
drop function if exists custom.query_is_store_owner();
drop function if exists custom.query_principal();
