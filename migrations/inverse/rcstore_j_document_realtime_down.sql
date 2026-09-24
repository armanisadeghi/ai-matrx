-- chair-step: RC-A1 inverse of rcstore_j — takes content.document out of the supabase_realtime publication and unregisters the private `document` broadcast topic and its admission function.
-- window-class: trigger DDL on the new, empty rich-content tables freezes the 23-relation supautils set (auth/storage/realtime) for this short transaction; applied in the 1-4 AM PT window.
-- ground-standing-ok: a — this file takes nothing any trigger runs: it removes content.document from a
-- publication and drops content.realtime_topic_admits, which no trigger calls (platform.realtime_topic_admits
-- reaches it only through the platform.realtime_topic_prefix row this file deletes first). The checker's
-- clause (a) matched `content.document` as a prefix of `content.document_version`.

delete from platform.realtime_topic_prefix where prefix = 'document';
drop function content.realtime_topic_admits(text);
alter publication supabase_realtime drop table content.document;
