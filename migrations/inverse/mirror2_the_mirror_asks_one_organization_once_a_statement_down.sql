-- MIRROR-2, the inverse of file 1: the memo, its fence and its census removed, and the door row
-- that opened the memo to a signed-in caller withdrawn. Run the policy inverse FIRST — a policy
-- that still names iam.record_visible_in_org and cannot find it makes custom.record unreadable.
drop function if exists custom.mirror_asks_the_whole_database();
drop function if exists iam.record_visible_in_org(uuid, uuid, uuid, platform.visibility, uuid, public.permission_level);
drop function if exists iam.statement_memo_epoch();
delete from platform.client_callable_door
 where schema_name = 'iam' and function_name = 'record_visible_in_org';
