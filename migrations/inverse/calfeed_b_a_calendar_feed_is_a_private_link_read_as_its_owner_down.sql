-- chair-step: withdraw the calendar subscription feature (CAL-FEED-CHART): drops the six users.calendar_feed* functions, their four client-door rows and the users.calendar_feed table (every link ends).
-- lock: platform
set local lock_timeout = '4s';
delete from platform.client_callable_door where schema_name = 'users' and function_name in ('calendar_feed_create','calendar_feed_rotate','calendar_feed_revoke','calendar_feed_list');
drop function if exists users.calendar_feed_read(text);
drop function if exists users.calendar_feed_list();
drop function if exists users.calendar_feed_revoke(uuid);
drop function if exists users.calendar_feed_rotate(uuid, integer);
drop function if exists users.calendar_feed_create(uuid, uuid, uuid, text, text, text, integer);
drop function if exists users._calendar_feed_hash(text);
drop function if exists users._calendar_feed_token();
drop function if exists users.calendar_feed_default_days();
drop table if exists users.calendar_feed;
