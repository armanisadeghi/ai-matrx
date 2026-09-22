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
-- ground-standing-ok: c  — `custom._relation_associations()` is the ROW-level body no trigger runs
-- any more, and it is KEPT in the drop list ON PURPOSE: `writeperf2_the_after_triggers_fire_once_per_statement.sql`
-- replaced it with the statement-level pair, and a database that has not yet taken that migration
-- still carries the row-level shape and must invert the same way. Every drop here is `if exists`,
-- so on a database carrying today's shape the line is a no-op, and the defect this file exists to
-- restore is put back by the statement-level bodies named directly above it — which ARE what the
-- live triggers run. The file is pointed at the live body; the old name is kept beside it.

-- THE TRIGGERS COME OFF BEFORE THEIR FUNCTIONS. A dropped function under an attached trigger
-- is not the defect this file exists to restore — it is a broken table.

drop trigger if exists zz_w2a_relation_association     on custom.record;
drop trigger if exists zz_w2a_relation_association_s_i on custom.record;
drop trigger if exists zz_w2a_relation_association_s_u on custom.record;
drop trigger if exists zzzz_store_relation_edge_names_its_field on platform.associations;

-- depends-on: custom.record_relation_edges(uuid,uuid,uuid,text,jsonb,timestamptz) — AND THAT IS
--   WHY THIS FILE NO LONGER DROPS IT (lane CI-FIX-3, 2026-09-22).
--   `oldtables_w0_the_two_halves_of_a_relation_can_never_disagree.sql` attached
--   `zzzz_relation_halves_agree` to BOTH custom.record and platform.associations, and the body it
--   runs — `custom._relation_halves_agree()` — reaches `custom.record_relation_edges`. So the
--   helper stopped being STORE-REL's private object the moment W0 adopted it: taking it away here
--   left two live triggers over a missing body, and the record store would have exploded on the
--   next write with `function custom.record_relation_edges(...) does not exist` — the exact shape
--   RED-SUITES-3 had to repair once already for the statement-level pair above.
--   Detaching W0's triggers instead would have been worse: this inverse would silently carry off
--   another lane's guard. So the object STANDS and the BEHAVIOUR is neutered, which is what this
--   inverse was always for — the three bodies that CALL the helper go (the two statement-level
--   writers, whose triggers came off four lines up, and the edge stamper), and the column goes
--   back to NULL at the foot of the file. Nothing names the field any more;
--   `platform.relation_delete_effects` sees exactly what it saw before STORE-REL 1, and W0's
--   halves-agree guard keeps the body it calls. W0's own inverse removes the helper, in the file
--   that owns it.
drop function if exists custom._relation_associations();
drop function if exists custom._relation_associations_stmt_insert();
drop function if exists custom._relation_associations_stmt_update();
drop function if exists custom._store_relation_edge_names_its_field();

-- The column back to what it was on 2026-09-19: NULL on every row of the record store.
-- An automated write names the system doing it (platform._stamp_actor_tier), and taking the
-- column back is exactly as automated as filling it in was.
select set_config('app.actor_system', 'custom.relations', true);

update platform.associations a
   set relation_field_id = null
 where a.source_type = 'record'
   and a.relation_field_id is not null;
