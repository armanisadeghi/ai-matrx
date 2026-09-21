-- STORE-REL 1's inverse — the relation edge stops naming its field, so REL-2's three actions
-- go dark again and platform.relation_delete_effects sees nothing. That is the defect T7
-- found, put back exactly.
--
-- 🚨 RE-POINTED TO THE LIVE TRIGGER (lane RED-SUITES-3, 2026-09-21). This file used to drop
-- the ROW-level trigger `zz_w2a_relation_association` and its function
-- `custom._relation_associations()` — and `writeperf2_the_after_triggers_fire_once_per_statement.sql`
-- replaced that pair with a STATEMENT-level pair,
-- `zz_w2a_relation_association_s_i` / `_s_u` over `custom._relation_associations_stmt_insert` /
-- `_stmt_update`. So the inverse took away `custom.record_relation_edges`, which those two
-- live bodies call, and left the triggers themselves attached: every subsequent insert into
-- `custom.record` inside the transaction died with
--     function custom.record_relation_edges(uuid, uuid, uuid, text, jsonb, timestamp with
--     time zone) does not exist
-- before `storerel_red.sql` had asked a single one of its six questions. The fix is the
-- inverse, not the trigger: this file now detaches the bodies the live triggers actually
-- call. The row-level names stay in the drop list because they are `if exists` and a
-- database that still carries the older shape must invert the same way.
--
-- THE TRIGGERS COME OFF BEFORE THEIR FUNCTIONS. A dropped function under an attached trigger
-- is not the defect this file exists to restore — it is a broken table.

drop trigger if exists zz_w2a_relation_association     on custom.record;
drop trigger if exists zz_w2a_relation_association_s_i on custom.record;
drop trigger if exists zz_w2a_relation_association_s_u on custom.record;
drop trigger if exists zzzz_store_relation_edge_names_its_field on platform.associations;

drop function if exists custom._relation_associations();
drop function if exists custom._relation_associations_stmt_insert();
drop function if exists custom._relation_associations_stmt_update();
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
