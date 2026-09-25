-- lock: custom,platform
-- lane: GRID-PRIMITIVES
-- chair-step: the inverse of gridprim_a_known_outsider_is_granted_at_once.sql. It DROPS custom.table_share_outside_grant(uuid, uuid, text, permission_level), deletes its platform.client_callable_door row. Nothing it created replaced a live body.
-- WHAT IT DOES NOT UNDO: a grant it made stays — it is the same permission row an accepted invitation writes, and it is taken back the way any share is (custom.share_revoke / the Share panel).

set local lock_timeout = '2s';
set local statement_timeout = '60s';

drop function if exists custom.table_share_outside_grant(uuid, uuid, text, public.permission_level);
delete from platform.client_callable_door
 where declared_by = 'gridprim_a_known_outsider_is_granted_at_once.sql';
