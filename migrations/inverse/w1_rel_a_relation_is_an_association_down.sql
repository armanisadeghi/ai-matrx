-- 🚨 TEN BODIES ARE LEFT STANDING, ON PURPOSE (lane INVERSE-GUARD, 2026-09-21).
-- Five of this lane's functions were ADOPTED after this inverse was written, and all five are
-- reached by triggers standing on `platform.associations` RIGHT NOW —
-- `trg_associations_reachability` (platform.trg_reachability_on_association),
-- `zzzz_store_relation_edge_names_its_field` (custom._store_relation_edge_names_its_field) and
-- `trg_associations_zzz_relation_contract` (platform.enforce_relation_edge):
--   platform.relations_are_on      <- platform.enforce_relation_edge (reldecl_unmaking_a_relation_is_not_a_claim.sql)
--   platform.relation_set          <- custom._store_relation_edge_names_its_field (fieldguards_a_refusal_is_a_whole_sentence.sql)
--   platform.relation_label        <- platform.relation_delete_effects (reldecl_the_relation_doors_take_a_person.sql)
--   platform.relation_declaration  <- custom.query_relation_edges (reach_the_client_doors_of_the_store.sql)
--   platform.assert_relations_door <- platform.relation_history (argsruled_the_far_end_of_a_relation_is_decided_too.sql)
-- `platform.relation_field`, `platform.relation_snapshot_of`, `platform.relation_target_modes`,
-- `platform.relation_on_delete_actions` and `platform.relation_bindings` stay with them because
-- those five call them. Dropping any of them left a trigger on `platform.associations` over a
-- function that was gone: the next association write on the platform dies.
--   THE DEFECT IS STILL RESTORED: the two readers `platform.relations_to` / `relations_from`, the
-- writer `platform.relation_unset`, the vocabulary functions nothing adopted, the
-- `relation_snapshot` payload-kind row and this lane's record->record `association_types` row all
-- still go — so a relation stops being expressible as an association, which is the finding.
--
-- chair-step: the inverse of W1-REL file 2 - it DROPS the fourteen relation functions this lane
-- created in schema `platform` and DELETES the two registry rows it inserted
-- (`platform.association_types` record->record and `platform.edge_payload_kind`
-- `relation_snapshot`). Drops and deletes are never an unattended production step (rule 9), so
-- this file is header-less on purpose (§4.9): a file naming production in a `-- target:` header
-- PLUS `-- chair-step:` is refused by both runners as `chair-step-names-production`, and these
-- same bytes rehearse on the branch with `--target branch`, which is how rule 27's "the inverse
-- was RUN on the branch" is satisfied.
--
-- THE ORDER IS THE CHECK. The two readers and the two writers go first because they call the
-- declaration, the label and the door; the vocabulary functions go last because the declaration
-- calls them. A dependency the order gets wrong raises by name rather than cascading silently,
-- and nothing here says CASCADE.
--
-- THE REGISTRY DELETES ARE SCOPED BY THE EXACT KEY THIS LANE WROTE and by nothing wider: the
-- edge table holds 34,216 rows of other people's associations and 256 other association types,
-- and an inverse that reached one row past its own is the failure mode this campaign exists to
-- avoid. `platform.association_types` record->record is deleted only when no live association
-- still uses it, so an abort cannot orphan an edge somebody else wrote.

set lock_timeout = '2s';
set statement_timeout = '300s';

drop function if exists platform.relations_to(uuid, uuid);
drop function if exists platform.relations_from(uuid, uuid);
drop function if exists platform.relation_unset(uuid, uuid, text, uuid);
-- LEFT STANDING (lane INVERSE-GUARD, 2026-09-21): drop function if exists platform.relation_set(uuid, uuid, text, jsonb);
-- LEFT STANDING (lane INVERSE-GUARD, 2026-09-21): drop function if exists platform.relation_snapshot_of(uuid, text, uuid);
-- LEFT STANDING (lane INVERSE-GUARD, 2026-09-21): drop function if exists platform.relation_label(uuid, text, uuid);
-- LEFT STANDING (lane INVERSE-GUARD, 2026-09-21): drop function if exists platform.relation_field(uuid, uuid, text);
-- LEFT STANDING (lane INVERSE-GUARD, 2026-09-21): drop function if exists platform.relation_declaration(uuid, uuid);

delete from platform.edge_payload_kind where kind = 'relation_snapshot';

delete from platform.association_types t
 where t.source_type = 'record' and t.target_type = 'record'
   and not exists (select 1 from platform.associations a
                    where a.source_type = 'record' and a.target_type = 'record');

-- LEFT STANDING (lane INVERSE-GUARD, 2026-09-21): drop function if exists platform.relation_target_modes();
drop function if exists platform.relation_cardinalities();
-- LEFT STANDING (lane INVERSE-GUARD, 2026-09-21): drop function if exists platform.relation_bindings();
-- LEFT STANDING (lane INVERSE-GUARD, 2026-09-21): drop function if exists platform.relation_on_delete_actions();
drop function if exists platform.relation_flavors();

-- LEFT STANDING (lane INVERSE-GUARD, 2026-09-21): drop function if exists platform.assert_relations_door(uuid);
-- LEFT STANDING (lane INVERSE-GUARD, 2026-09-21): drop function if exists platform.relations_are_on(uuid);
