-- chair-step: the inverse of hub_the_organization_has_one_front_door.sql. It DROPS the three
-- functions that file created and deletes their platform.client_callable_door rows. It
-- destroys NOTHING of anybody's: every board, every outside invitation and every author
-- stamp it read is stored elsewhere and is untouched — the organization simply loses the
-- one call that reads them across tables, and /data-v2's hub goes back to naming what it
-- cannot list, which is the honest state.
-- lane: DATA-HUB

drop function if exists custom.hub_changed_by(uuid, text, uuid[]);
drop function if exists custom.shares_outside(uuid);
drop function if exists custom.pipelines(uuid);

delete from platform.client_callable_door
 where schema_name = 'custom'
   and declared_by = 'hub_the_organization_has_one_front_door.sql';
