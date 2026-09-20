-- chair-step: this DROPS W2-EPOCH's three tables, seven functions and the one trigger it added to platform.associations. That trigger returns immediately while the `custom/system_enabled` knob resolves false, which it does on both databases, so dropping it changes no live write path; the stored form it maintained is a cache the system does not need (VIS-7). It is the rollback BUILD-BOOK rule 27 requires. A person reads the whole body below before it runs.
--
-- INVERSE of
-- migrations/campaign/w2_epoch_one_version_per_organization_and_an_epoch_on_every_container.sql.
--
-- Drops exactly what that file created. The one object outside schema `custom` is the trigger
-- `zz_w2_epoch_bump` on platform.associations, which that file also created and which no live
-- code reads: dropping it returns platform.associations to the exact set of triggers it carried
-- before, and the stored form it maintained is a cache the system does not need (VIS-7).

set lock_timeout = '5s';

drop trigger  if exists zz_w2_epoch_bump on platform.associations;
drop function if exists custom.has_visibility_at(uuid, text, uuid, public.permission_level, uuid, bigint);
drop function if exists custom.visibility_cache_rebuild();
drop function if exists custom.visibility_warm(text, uuid);
drop function if exists custom.cache_lookup(text, uuid, text, uuid);
drop function if exists custom.required_epoch(text, uuid, text, uuid);
drop function if exists custom.trg_associations_bump_visibility();
drop function if exists custom.bump_epoch(text, uuid, uuid);
drop table    if exists custom.visibility_cache;
drop table    if exists custom.visibility_epoch;
drop table    if exists custom.organization_visibility_version;
drop sequence if exists custom.visibility_clock;

-- A DOOR FOLLOWS ITS FUNCTION: the seven door rows that file declared go with the bodies.
delete from platform.client_callable_door
 where declared_by = 'w2_epoch_one_version_per_organization_and_an_epoch_on_every_container.sql';
