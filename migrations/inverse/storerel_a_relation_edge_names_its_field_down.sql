-- STORE-REL 1's inverse — the relation edge stops naming its field, so REL-2's three actions
-- go dark again and platform.relation_delete_effects sees nothing. That is the defect T7
-- found, put back exactly.

drop trigger if exists zz_w2a_relation_association on custom.record;
drop trigger if exists zzzz_store_relation_edge_names_its_field on platform.associations;
drop function if exists custom._relation_associations();
drop function if exists custom._store_relation_edge_names_its_field();
drop function if exists custom.record_relation_edges(uuid, uuid, uuid, text, jsonb, timestamptz);

-- The column back to what it was on 2026-09-19: NULL on every row of the record store.
-- An automated write names the system doing it (platform._stamp_actor_tier), and taking the
-- column back is exactly as automated as filling it in was.
select set_config('app.actor_system', 'custom.relations', true);

update platform.associations a
   set relation_field_id = null
 where a.source_type = 'record'
   and a.relation_field_id is not null;
