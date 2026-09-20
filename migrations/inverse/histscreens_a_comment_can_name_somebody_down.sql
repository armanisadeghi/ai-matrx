-- chair-step: the inverse of histscreens_a_comment_can_name_somebody.sql. It DROPS the three
-- functions that file created and deletes their platform.client_callable_door rows. It does
-- NOT delete a comment anybody wrote, and it does not delete a notification anybody was
-- sent: comments are rows of custom.io_comment and reach a person through
-- custom.io_comments, which this file never touched, and a sent message belongs to the
-- person it was sent to. What goes away is the NAMES on a thread and the ability to mention
-- somebody; the mention ids already stored on a comment's anchor stay exactly where they
-- are and read again as mentions the moment the file is applied once more.
-- lane: HISTORY-SCREENS

drop function if exists custom.comment_thread(uuid, uuid, boolean);
drop function if exists custom.comment_write(uuid, uuid, text, jsonb, uuid, uuid[]);
drop function if exists custom.comment_mention_deliver(uuid, uuid, uuid, uuid, uuid, text, text, text);

delete from platform.client_callable_door
 where schema_name = 'custom'
   and function_name in ('comment_thread', 'comment_write', 'comment_mention_deliver');
