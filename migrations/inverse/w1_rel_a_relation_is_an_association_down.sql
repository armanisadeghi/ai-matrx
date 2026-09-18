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

set lock_timeout = '5s';
set statement_timeout = '300s';

drop function if exists platform.relations_to(uuid, uuid);
drop function if exists platform.relations_from(uuid, uuid);
drop function if exists platform.relation_unset(uuid, uuid, text, uuid);
drop function if exists platform.relation_set(uuid, uuid, text, jsonb);
drop function if exists platform.relation_snapshot_of(uuid, text, uuid);
drop function if exists platform.relation_label(uuid, text, uuid);
drop function if exists platform.relation_field(uuid, uuid, text);
drop function if exists platform.relation_declaration(uuid, uuid);

delete from platform.edge_payload_kind where kind = 'relation_snapshot';

delete from platform.association_types t
 where t.source_type = 'record' and t.target_type = 'record'
   and not exists (select 1 from platform.associations a
                    where a.source_type = 'record' and a.target_type = 'record');

drop function if exists platform.relation_target_modes();
drop function if exists platform.relation_cardinalities();
drop function if exists platform.relation_bindings();
drop function if exists platform.relation_on_delete_actions();
drop function if exists platform.relation_flavors();

drop function if exists platform.assert_relations_door(uuid);
drop function if exists platform.relations_are_on(uuid);
