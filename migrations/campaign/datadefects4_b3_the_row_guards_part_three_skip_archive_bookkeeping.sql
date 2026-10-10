-- chair-step: splits each listed per-row guard trigger of custom.record into a BEFORE INSERT trigger (unchanged, named "<name>!i" so it fires in the same place in the order) and a BEFORE UPDATE trigger that keeps its original name and gains a WHEN clause; CREATE TRIGGER + CREATE OR REPLACE TRIGGER on custom.record (no DROP TRIGGER: a DROP freezes the auth/storage/realtime set until commit) (briefly ShareRowExclusive on it and its partitions, the whole file is 7 triggers). A trigger on INSERT OR UPDATE cannot reference OLD in WHEN, hence the split.
-- window-class: CREATE/CREATE OR REPLACE TRIGGER on the partitioned custom.record (SHARE ROW EXCLUSIVE on it and its 16 partitions until COMMIT, writers wait ~1 s, readers and sign-in untouched); 7 triggers per file, no DROP TRIGGER
-- lane: DATA-DEFECTS-4
-- lock: custom,platform
--
-- The inverse is `migrations/inverse/datadefects4_b3_the_row_guards_part_three_skip_archive_bookkeeping_down.sql`.
--
-- THE ROW GUARDS SKIP ARCHIVE BOOKKEEPING (DATA-DEFECTS-4, 2026-10-10, part 3 of 3).
-- A deleted_at-only update (archive; restore) cost ~5.6 ms a row, almost all of it ~30 per-row guard triggers that
-- each re-judge a row nothing about which changed. Each guard below now fires on UPDATE only when the row is not an
-- ordinary record (data_class other than 'record' - structure rows, rules, fields, tables keep every guard, and a
-- structure row's restore still depends on them) OR something the guards read changed: data, table_id,
-- organization_id, data_class, metadata, custom_fields or visibility. INSERT is untouched. Everything archive
-- bookkeeping touches (deleted_at, updated_at, updated_by, version) is left out on purpose.
-- Kept firing on every update, on purpose: the stampers (actor, tier, updated_at/version), the governance guard, the
-- store door, the memo clears, the changes feed (custom.io_record_changed_*) and History capture (statement
-- triggers: they ARE the record of an archive and a restore), the soft-delete cascade, the approvals withdrawal, the
-- relation-halves check, the checklist/pipeline/approval-door guards.
-- A RESTORE IS NOT SKIPPED BLIND: datadefects4_a made custom.record_restore / custom.table_restore judge the rows
-- they bring back (custom._restore_check) against the rules as they are now - held back for a unique clash, flagged
-- for anything else - before the update that these guards no longer see.

-- custom_record_zz_derived_fields
CREATE OR REPLACE TRIGGER "custom_record_zz_derived_fields!i" BEFORE INSERT ON custom.record FOR EACH ROW EXECUTE FUNCTION custom._derived_fields();
CREATE OR REPLACE TRIGGER "custom_record_zz_derived_fields" BEFORE UPDATE ON custom.record FOR EACH ROW WHEN (new.data_class IS DISTINCT FROM 'record'::text OR old.data_class IS DISTINCT FROM new.data_class OR old.data IS DISTINCT FROM new.data OR old.table_id IS DISTINCT FROM new.table_id OR old.organization_id IS DISTINCT FROM new.organization_id OR old.metadata IS DISTINCT FROM new.metadata OR old.custom_fields IS DISTINCT FROM new.custom_fields OR old.visibility IS DISTINCT FROM new.visibility) EXECUTE FUNCTION custom._derived_fields();

-- zz_promoted_field_cap
CREATE OR REPLACE TRIGGER "zz_promoted_field_cap!i" BEFORE INSERT ON custom.record FOR EACH ROW EXECUTE FUNCTION custom._promoted_field_cap_guard();
CREATE OR REPLACE TRIGGER "zz_promoted_field_cap" BEFORE UPDATE ON custom.record FOR EACH ROW WHEN (new.data_class IS DISTINCT FROM 'record'::text OR old.data_class IS DISTINCT FROM new.data_class OR old.data IS DISTINCT FROM new.data OR old.table_id IS DISTINCT FROM new.table_id OR old.organization_id IS DISTINCT FROM new.organization_id OR old.metadata IS DISTINCT FROM new.metadata OR old.custom_fields IS DISTINCT FROM new.custom_fields OR old.visibility IS DISTINCT FROM new.visibility) EXECUTE FUNCTION custom._promoted_field_cap_guard();

-- zz_w3_work_shape_guard
CREATE OR REPLACE TRIGGER "zz_w3_work_shape_guard!i" BEFORE INSERT ON custom.record FOR EACH ROW EXECUTE FUNCTION custom._work_shape_guard();
CREATE OR REPLACE TRIGGER "zz_w3_work_shape_guard" BEFORE UPDATE ON custom.record FOR EACH ROW WHEN (new.data_class IS DISTINCT FROM 'record'::text OR old.data_class IS DISTINCT FROM new.data_class OR old.data IS DISTINCT FROM new.data OR old.table_id IS DISTINCT FROM new.table_id OR old.organization_id IS DISTINCT FROM new.organization_id OR old.metadata IS DISTINCT FROM new.metadata OR old.custom_fields IS DISTINCT FROM new.custom_fields OR old.visibility IS DISTINCT FROM new.visibility) EXECUTE FUNCTION custom._work_shape_guard();

-- zzzz_a_undeclared_key_guard
CREATE OR REPLACE TRIGGER "zzzz_a_undeclared_key_guard!i" BEFORE INSERT ON custom.record FOR EACH ROW EXECUTE FUNCTION custom._undeclared_key_guard();
CREATE OR REPLACE TRIGGER "zzzz_a_undeclared_key_guard" BEFORE UPDATE ON custom.record FOR EACH ROW WHEN (new.data_class IS DISTINCT FROM 'record'::text OR old.data_class IS DISTINCT FROM new.data_class OR old.data IS DISTINCT FROM new.data OR old.table_id IS DISTINCT FROM new.table_id OR old.organization_id IS DISTINCT FROM new.organization_id OR old.metadata IS DISTINCT FROM new.metadata OR old.custom_fields IS DISTINCT FROM new.custom_fields OR old.visibility IS DISTINCT FROM new.visibility) EXECUTE FUNCTION custom._undeclared_key_guard();

-- zzzz_unique_rule_holds
CREATE OR REPLACE TRIGGER "zzzz_unique_rule_holds!i" BEFORE INSERT ON custom.record FOR EACH ROW EXECUTE FUNCTION custom._unique_rule_holds();
CREATE OR REPLACE TRIGGER "zzzz_unique_rule_holds" BEFORE UPDATE ON custom.record FOR EACH ROW WHEN (new.data_class IS DISTINCT FROM 'record'::text OR old.data_class IS DISTINCT FROM new.data_class OR old.data IS DISTINCT FROM new.data OR old.table_id IS DISTINCT FROM new.table_id OR old.organization_id IS DISTINCT FROM new.organization_id OR old.metadata IS DISTINCT FROM new.metadata OR old.custom_fields IS DISTINCT FROM new.custom_fields OR old.visibility IS DISTINCT FROM new.visibility) EXECUTE FUNCTION custom._unique_rule_holds();

-- _value_envelope
CREATE OR REPLACE TRIGGER "_value_envelope!i" BEFORE INSERT ON custom.record FOR EACH ROW EXECUTE FUNCTION custom._value_envelope();
CREATE OR REPLACE TRIGGER "_value_envelope" BEFORE UPDATE ON custom.record FOR EACH ROW WHEN (new.data_class IS DISTINCT FROM 'record'::text OR old.data_class IS DISTINCT FROM new.data_class OR old.data IS DISTINCT FROM new.data OR old.table_id IS DISTINCT FROM new.table_id OR old.organization_id IS DISTINCT FROM new.organization_id OR old.metadata IS DISTINCT FROM new.metadata OR old.custom_fields IS DISTINCT FROM new.custom_fields OR old.visibility IS DISTINCT FROM new.visibility) EXECUTE FUNCTION custom._value_envelope();

-- custom_record_field_type_converts_values
CREATE OR REPLACE TRIGGER "custom_record_field_type_converts_values" AFTER UPDATE ON custom.record FOR EACH ROW WHEN (new.data_class IS DISTINCT FROM 'record'::text OR old.data_class IS DISTINCT FROM new.data_class OR old.data IS DISTINCT FROM new.data OR old.table_id IS DISTINCT FROM new.table_id OR old.organization_id IS DISTINCT FROM new.organization_id OR old.metadata IS DISTINCT FROM new.metadata OR old.custom_fields IS DISTINCT FROM new.custom_fields OR old.visibility IS DISTINCT FROM new.visibility) EXECUTE FUNCTION custom._field_type_converts_values();

