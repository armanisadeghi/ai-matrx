-- chair-step: this DROPS the seven objects W2-VIS created in schema `custom` — the role-keyed carrying declaration, the carrying-edges view and the five derivation functions. No live code reads any of them, so this removes a capability and breaks nothing; it is the rollback BUILD-BOOK rule 27 requires. A person reads the whole body below before it runs.
--
-- INVERSE of migrations/campaign/w2_vis_visibility_is_derived_from_the_associations.sql.
--
-- Drops exactly the seven objects that file creates, in dependency order, and nothing else.
-- Every one of them is new in schema `custom` and no live code reads any of them, so this
-- direction removes a capability and breaks nothing.

set lock_timeout = '5s';

drop function if exists custom.visibility_parity();
drop function if exists custom.visible_record_ids(uuid, public.permission_level);
drop function if exists custom.has_visibility(uuid, text, uuid, public.permission_level);
drop function if exists custom.visibility_ancestors(text, uuid);
drop function if exists custom.derive_visibility(text, uuid);
drop view     if exists custom.carrying_edges;
drop table    if exists custom.carrying_rule;

-- A DOOR FOLLOWS ITS FUNCTION: the five door rows that file declared go with the bodies.
delete from platform.client_callable_door
 where declared_by = 'w2_vis_visibility_is_derived_from_the_associations.sql';
