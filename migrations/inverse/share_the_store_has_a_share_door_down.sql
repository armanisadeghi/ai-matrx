-- chair-step: the inverse of share_the_store_has_a_share_door.sql. Drops the seven share doors and their door rows. Running it leaves the record store with no way for a person to let anybody in, which is exactly the state this lane found; it exists to satisfy rule 27 (up -> inverse -> up) and for nothing else.
drop function if exists custom.share_lane_set(uuid, uuid, text, public.permission_level);
drop function if exists custom.share_revoke(uuid, uuid, text, uuid);
-- 🚨 `custom.share_grant` STAYS STANDING (lane INVERSE-GUARD, 2026-09-21). `zzz_pipelines_on_entry`
-- on `custom.record` runs `custom._pipeline_on_entry`
-- (`pipelines_a_stage_is_a_field_and_its_moves_are_rules.sql`, a later lane), and that body
-- CALLS `custom.share_grant` to carry out a stage's on-entry share. Dropping it left the
-- pipeline trigger attached over a function that was gone, so the next write to the record
-- store exploded before the red twin asked its first question. The door ROW goes with the
-- other six in the DELETE below, so no client can call it: a person still has no way to let
-- anybody in, which is the state this lane found, and the pipeline's ground is left standing.
drop function if exists custom.share_access(uuid, uuid);
drop function if exists custom.share_people(uuid, text, integer);
drop function if exists custom.share_lanes();
drop function if exists custom.share_levels();
delete from platform.client_callable_door d
 where d.schema_name = 'custom'
   and d.function_name in ('share_levels','share_lanes','share_people','share_access',
                           'share_grant','share_revoke','share_lane_set');
