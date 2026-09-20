-- The inverse of `digests_a_saved_view_has_a_door.sql`. It drops the two doors and
-- removes their declarations. No saved view is deleted: the rows those doors wrote
-- are ordinary platform.saved_view rows and they stay exactly where they are.

drop function if exists custom.views(uuid, uuid);
drop function if exists custom.view_declare(uuid, uuid, jsonb);
delete from platform.client_callable_door where declared_by = 'digests_a_saved_view_has_a_door.sql';
