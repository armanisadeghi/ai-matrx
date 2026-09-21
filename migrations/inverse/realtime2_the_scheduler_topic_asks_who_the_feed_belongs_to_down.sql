-- chair-step: INVERSE of realtime2_the_scheduler_topic_asks_who_the_feed_belongs_to.sql and
-- realtime2_the_switch_that_makes_the_scheduler_live.sql. It takes the `scheduler:user` prefix
-- back out of the registry, drops scheduler.realtime_topic_admits and removes its door row.
-- Running it returns the scheduler's private channel to the state it was in before this lane:
-- joining nothing, forever, behind a screen that looks healthy. Nothing else on the platform
-- changes — the one policy on realtime.messages and the `custom:table` prefix are untouched.

delete from platform.realtime_topic_prefix where prefix = 'scheduler:user';

drop function if exists scheduler.realtime_topic_admits(text);

delete from platform.client_callable_door
 where schema_name = 'scheduler' and function_name = 'realtime_topic_admits';
