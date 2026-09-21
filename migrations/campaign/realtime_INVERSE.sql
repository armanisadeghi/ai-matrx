-- target: branch
-- additive: no
--
-- REALTIME — THE INVERSE, run on the rehearsal copy between the two ups (rule 27).
-- Everything lane REALTIME adds, removed in dependency order, so the re-apply proves the
-- three files are genuinely re-runnable from nothing and not merely idempotent over their
-- own leftovers. It is `-- target: branch` on purpose: there is no reason to run it on the
-- main database, and a file that CAN drop a live policy should not be able to name it.

drop trigger  if exists zzz_io_outbox_broadcast_s on custom.io_outbox;
drop function if exists custom.io_outbox_broadcast_stmt();
drop function if exists custom._realtime_notice(uuid, uuid, text, text, jsonb, boolean);

delete from platform.realtime_topic_prefix where prefix = 'custom:table';

drop policy   if exists platform_topics_admit_their_own on realtime.messages;
drop function if exists custom.realtime_topic_admits(text);
drop function if exists platform.realtime_topic_admits(text);
drop table    if exists platform.realtime_topic_prefix;

delete from platform.client_callable_door
 where (schema_name, function_name) in (('custom', 'realtime_topic_admits'),
                                        ('platform', 'realtime_topic_admits'));
