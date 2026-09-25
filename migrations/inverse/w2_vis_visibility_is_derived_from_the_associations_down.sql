-- chair-step: this DROPS the seven objects W2-VIS created in schema `custom` — the role-keyed carrying declaration, the carrying-edges view and the five derivation functions. No live code reads any of them, so this removes a capability and breaks nothing; it is the rollback BUILD-BOOK rule 27 requires. A person reads the whole body below before it runs.
--
-- INVERSE of migrations/campaign/w2_vis_visibility_is_derived_from_the_associations.sql.
--
-- Drops exactly the seven objects that file creates, in dependency order, and nothing else.
-- Every one of them is new in schema `custom` and no live code reads any of them, so this
-- direction removes a capability and breaks nothing.

set lock_timeout = '2s';

-- 🚨 THE HEADER ABOVE IS NO LONGER TRUE, AND THIS IS WHAT REPLACES IT (lane INVERSE-GUARD,
-- 2026-09-21). "No live code reads any of them" was measured on the day this file was written.
-- Five lanes have adopted these objects since, and EIGHT LIVE TRIGGERS now reach them:
--   · `custom.has_visibility` — `trg_associations_zzz_relation_contract` and
--     `custom_record_rule_uses` and `custom_record_field_write_door` reach it; and
--     `custom.may_invite_outside` (`access_lane_null_uid_gate_and_org_not_null.sql`) calls it.
--   · `custom.carrying_rule` (and the `custom.carrying_edges` view over it) —
--     `zzzz_store_relation_edge_names_its_field`, `zz_w2_containment_association` and its
--     statement-level pair `_s_i` / `_s_u`, and `zz_w2_epoch_bump` all read it, through
--     `custom._store_relation_edge_names_its_field`
--     (`fieldguards_a_refusal_is_a_whole_sentence.sql`).
--   · `custom.visible_record_ids` — `custom.mirror_asks_the_whole_database`
--     (`mirror2_the_mirror_asks_one_organization_once_a_statement.sql`).
--   · `custom.visibility_ancestors` — `custom.reaches_directly`
--     (`laddercap_a_ceiling_cannot_refuse_at_the_floor.sql`), which is the access kernel.
-- Dropping them would not restore W2-VIS's defect; it would stop every write to
-- `custom.record` and `platform.associations` and every access question on the platform.
--
-- So they are LEFT WHERE THEY ARE and the behaviour is NEUTERED instead: the carrying
-- DECLARATIONS are deleted. `custom.carrying_rule` is the whole of what W2-VIS added — with no
-- active rows, `custom.carrying_edges` is empty, `custom.derive_visibility` and
-- `custom.visibility_ancestors` walk nothing, and visibility is once again NOT derived from
-- the associations, which is the defect this file exists to restore. `custom.visibility_parity`
-- is the lane's own parity checker, nothing outside reads it, and it goes.
drop function if exists custom.visibility_parity();

delete from custom.carrying_rule;
--   deliberately NOT dropped — adopted on the live path, see above:
--   custom.visible_record_ids(uuid, public.permission_level)
--   custom.has_visibility(uuid, text, uuid, public.permission_level)
--   custom.visibility_ancestors(text, uuid)
--   custom.derive_visibility(text, uuid)
--   view custom.carrying_edges
--   table custom.carrying_rule

-- A DOOR FOLLOWS ITS FUNCTION: the five door rows that file declared go with the bodies.
delete from platform.client_callable_door
 where declared_by = 'w2_vis_visibility_is_derived_from_the_associations.sql';
