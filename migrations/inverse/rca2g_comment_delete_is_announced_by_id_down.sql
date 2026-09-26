-- chair-step: rule-27 rehearsal inverse of rca2g_comment_delete_is_announced_by_id.sql — removes the delete/restore announcement trigger, the comments topic prefix and its two functions; open screens stop hearing that a comment was deleted or restored.

set local lock_timeout = '2s';

drop trigger if exists _announce_delete on platform.comments;
delete from platform.realtime_topic_prefix where prefix = 'comments';
drop function if exists platform._comments_announce_delete();
drop function if exists platform.comments_topic_admits(text);
