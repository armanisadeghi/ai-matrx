-- 🚨 THREE BODIES ARE LEFT STANDING, ON PURPOSE (lane INVERSE-GUARD, 2026-09-21).
-- `custom.field_declare`, `custom._field_document_for` and `custom._options_table_for` were
-- ADOPTED after this inverse was written — `custom.work_approval_decide`
-- (apprvfix_the_queue_holds_a_record_write_too.sql) and `custom.entity_field_declare`
-- (entityfields_the_doors_a_person_reaches.sql) call them — and they are reached from three LIVE
-- triggers on `custom.record`: `custom_record_field_shape_guard_class`,
-- `zzzz_a_undeclared_key_guard` and `zzzz_b_claimed_column`. Dropping them left those guards over
-- functions that were gone, which is a broken record store, not the 19 September verdict put back.
--   THE DEFECT IS STILL RESTORED the way the verdict measured it: the
-- `platform.client_callable_door` rows for `field_declare`, `field_update` and `field_retire` are
-- deleted, so the panel has no door to write through — which is the whole finding. The two verbs
-- that nothing else adopted, `custom.field_update` and `custom.field_retire`, still go.
--
-- INVERSE of migrations/campaign/fieldadd_a_person_can_add_a_field.sql.
--
-- It removes the three field doors and the two private helpers they call, and
-- takes their declaration rows with them. It does NOT touch a single Field a
-- person added through them: the rows those doors wrote are ordinary records in
-- `custom.record`, correct in every respect the store's own guards enforce, and
-- they stay exactly as they are. What comes back is the state the 19 September
-- verdict measured — a panel with no door to write through — which is why this
-- file exists to be RUN ONCE on a rehearsal copy and never on the database the
-- app is pointed at.
--
-- The one thing it deliberately leaves behind: options Tables the choice-list
-- door declared. They are a person's data, they hold the words a person typed,
-- and Fields still point at them. Dropping them would delete somebody's
-- dropdown to undo a code change.

set lock_timeout = '2s';
set statement_timeout = '600s';

-- LEFT STANDING (lane INVERSE-GUARD, 2026-09-21): drop function if exists custom.field_declare(uuid, uuid, jsonb);
drop function if exists custom.field_update(uuid, uuid, jsonb);
drop function if exists custom.field_retire(uuid, uuid);
-- LEFT STANDING (lane INVERSE-GUARD, 2026-09-21): drop function if exists custom._field_document_for(uuid, uuid, jsonb);
-- LEFT STANDING (lane INVERSE-GUARD, 2026-09-21): drop function if exists custom._options_table_for(uuid, text, jsonb);

delete from platform.client_callable_door
 where schema_name = 'custom'
   and function_name in ('field_declare', 'field_update', 'field_retire');
