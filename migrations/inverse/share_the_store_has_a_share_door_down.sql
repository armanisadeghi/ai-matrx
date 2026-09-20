-- chair-step: the inverse of share_the_store_has_a_share_door.sql. Drops the seven share doors and their door rows. Running it leaves the record store with no way for a person to let anybody in, which is exactly the state this lane found; it exists to satisfy rule 27 (up -> inverse -> up) and for nothing else.
drop function if exists custom.share_lane_set(uuid, uuid, text, public.permission_level);
drop function if exists custom.share_revoke(uuid, uuid, text, uuid);
drop function if exists custom.share_grant(uuid, uuid, text, uuid, public.permission_level);
drop function if exists custom.share_access(uuid, uuid);
drop function if exists custom.share_people(uuid, text, integer);
drop function if exists custom.share_lanes();
drop function if exists custom.share_levels();
delete from platform.client_callable_door d
 where d.schema_name = 'custom'
   and d.function_name in ('share_levels','share_lanes','share_people','share_access',
                           'share_grant','share_revoke','share_lane_set');
