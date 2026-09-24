-- lock: custom,platform
-- lane: GRID-PRIMITIVES
-- chair-step: the inverse of gridprim_a_signed_in_person_may_share_with_a_known_outsider.sql. It CLOSES the signed-in lane on
-- custom.table_share_outside_grant's door row (with its reason — a bare revoke is re-granted by the
-- declared-doors sweep in the same statement), REVOKES EXECUTE from authenticated, and deletes the
-- share.table_granted notification kind (as invitedelivery_the_invitation_reaches_the_person_down.sql
-- does for share.table_invited). A grant already made stays; a notification already sent stays.

set local lock_timeout = '5s';
set local statement_timeout = '60s';

update platform.client_callable_door
   set signed_in_callers = false,
       non_client_lane = 'closed by gridprim_a_signed_in_person_may_share_with_a_known_outsider_down.sql: the signed-in grant was taken back'
 where schema_name = 'custom' and function_name = 'table_share_outside_grant'
   and declared_by = 'gridprim_a_known_outsider_is_granted_at_once.sql';

revoke execute on function custom.table_share_outside_grant(uuid, uuid, text, public.permission_level) from authenticated;

delete from communication.notification_event_type
 where event_key = 'share.table_granted';
