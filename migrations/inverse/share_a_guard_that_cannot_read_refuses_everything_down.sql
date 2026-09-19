-- chair-step: the inverse of share_a_guard_that_cannot_read_refuses_everything.sql. It puts four trigger guards back to SECURITY INVOKER, resets the one search_path that file locked, and drops the census. Running it RE-BREAKS every record share by a real person, so it exists to satisfy rule 27 (up -> inverse -> up) and for nothing else.
--
-- SHARE — the inverse. Restores the exact catalogue state of 2026-09-19 18:xx UTC.

alter function iam._per_table_grant_guard() security invoker;
alter function custom._store_relation_edge_names_its_field() security invoker;
alter function platform.enforce_relation_edge() security invoker;
alter function files.guard_tombstone_retention() security invoker;
alter function files.guard_tombstone_retention() reset search_path;

delete from platform.client_callable_door d
 where d.schema_name = 'iam' and d.function_name = 'grant_path_blanket_refusals';
drop function if exists iam.grant_path_blanket_refusals();
