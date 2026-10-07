-- inverse of notifications_inbox_clear_by_kind.sql
-- chair-step: removes the clear-by-kind doors; notices already cleared stay Done (recoverable from the Done view), and the bell loses Clear all / clear by kind.

drop function if exists communication.clear_inbox(text, text[], timestamptz);
drop function if exists communication.my_inbox_kinds();

delete from platform.client_callable_door
 where schema_name = 'communication'
   and function_name in ('clear_inbox', 'my_inbox_kinds')
   and declared_by = 'notifications_inbox_clear_by_kind.sql';

notify pgrst, 'reload schema';
