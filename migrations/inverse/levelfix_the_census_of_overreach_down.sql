-- LEVEL-FIX (3 of 4) — THE INVERSE. The census and its two helpers, and their door rows.
-- Nothing else read them, so the order does not matter here.

set lock_timeout = '3s';
set statement_timeout = '60s';

drop function if exists iam.member_level_overreach();
drop function if exists iam.member_level_justified(uuid, uuid, uuid);
drop function if exists iam.access_arms_from_sources(uuid, uuid, text, uuid, uuid);

delete from platform.client_callable_door
 where schema_name = 'iam'
   and function_name in ('member_level_overreach', 'member_level_justified', 'access_arms_from_sources');
