-- chair-step: splits each listed per-row guard trigger of custom.record into a BEFORE INSERT trigger (unchanged, named "<name>!i" so it fires in the same place in the order) and a BEFORE UPDATE trigger that keeps its original name and gains a WHEN clause; CREATE TRIGGER + CREATE OR REPLACE TRIGGER on custom.record (no DROP TRIGGER: a DROP freezes the auth/storage/realtime set until commit) (briefly ShareRowExclusive on it and its partitions, the whole file is 7 triggers). A trigger on INSERT OR UPDATE cannot reference OLD in WHEN, hence the split.
-- window-class: CREATE/CREATE OR REPLACE TRIGGER on the partitioned custom.record (SHARE ROW EXCLUSIVE on it and its 16 partitions until COMMIT, writers wait ~1 s, readers and sign-in untouched); 7 triggers per file, no DROP TRIGGER
-- lane: DATA-DEFECTS-4
-- lock: custom,platform
--
-- The inverse is `migrations/inverse/datadefects4_b2_the_row_guards_part_two_skip_archive_bookkeeping_down.sql`.
--
-- THE ROW GUARDS SKIP ARCHIVE BOOKKEEPING (DATA-DEFECTS-4, 2026-10-10, part 2 of 3).
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

-- custom_record_merge_field_shape_guard
CREATE OR REPLACE TRIGGER "custom_record_merge_field_shape_guard!i" BEFORE INSERT ON custom.record FOR EACH ROW EXECUTE FUNCTION custom._merge_field_shape_guard();
CREATE OR REPLACE TRIGGER "custom_record_merge_field_shape_guard" BEFORE UPDATE ON custom.record FOR EACH ROW WHEN (new.data_class IS DISTINCT FROM 'record'::text OR old.data_class IS DISTINCT FROM new.data_class OR old.data IS DISTINCT FROM new.data OR old.table_id IS DISTINCT FROM new.table_id OR old.organization_id IS DISTINCT FROM new.organization_id OR old.metadata IS DISTINCT FROM new.metadata OR old.custom_fields IS DISTINCT FROM new.custom_fields OR old.visibility IS DISTINCT FROM new.visibility) EXECUTE FUNCTION custom._merge_field_shape_guard();

-- custom_record_merge_field_temporal_guard
CREATE OR REPLACE TRIGGER "custom_record_merge_field_temporal_guard!i" BEFORE INSERT ON custom.record FOR EACH ROW EXECUTE FUNCTION custom._merge_field_temporal_guard();
CREATE OR REPLACE TRIGGER "custom_record_merge_field_temporal_guard" BEFORE UPDATE ON custom.record FOR EACH ROW WHEN (new.data_class IS DISTINCT FROM 'record'::text OR old.data_class IS DISTINCT FROM new.data_class OR old.data IS DISTINCT FROM new.data OR old.table_id IS DISTINCT FROM new.table_id OR old.organization_id IS DISTINCT FROM new.organization_id OR old.metadata IS DISTINCT FROM new.metadata OR old.custom_fields IS DISTINCT FROM new.custom_fields OR old.visibility IS DISTINCT FROM new.visibility) EXECUTE FUNCTION custom._merge_field_temporal_guard();

-- custom_record_organization_wall
CREATE OR REPLACE TRIGGER "custom_record_organization_wall!i" BEFORE INSERT ON custom.record FOR EACH ROW EXECUTE FUNCTION custom._organization_wall_guard();
CREATE OR REPLACE TRIGGER "custom_record_organization_wall" BEFORE UPDATE ON custom.record FOR EACH ROW WHEN (new.data_class IS DISTINCT FROM 'record'::text OR old.data_class IS DISTINCT FROM new.data_class OR old.data IS DISTINCT FROM new.data OR old.table_id IS DISTINCT FROM new.table_id OR old.organization_id IS DISTINCT FROM new.organization_id OR old.metadata IS DISTINCT FROM new.metadata OR old.custom_fields IS DISTINCT FROM new.custom_fields OR old.visibility IS DISTINCT FROM new.visibility) EXECUTE FUNCTION custom._organization_wall_guard();

-- custom_record_rule_shape_guard
CREATE OR REPLACE TRIGGER "custom_record_rule_shape_guard!i" BEFORE INSERT ON custom.record FOR EACH ROW EXECUTE FUNCTION custom._rule_shape_guard();
CREATE OR REPLACE TRIGGER "custom_record_rule_shape_guard" BEFORE UPDATE ON custom.record FOR EACH ROW WHEN (new.data_class IS DISTINCT FROM 'record'::text OR old.data_class IS DISTINCT FROM new.data_class OR old.data IS DISTINCT FROM new.data OR old.table_id IS DISTINCT FROM new.table_id OR old.organization_id IS DISTINCT FROM new.organization_id OR old.metadata IS DISTINCT FROM new.metadata OR old.custom_fields IS DISTINCT FROM new.custom_fields OR old.visibility IS DISTINCT FROM new.visibility) EXECUTE FUNCTION custom._rule_shape_guard();

-- custom_record_rule_topology_guard
CREATE OR REPLACE TRIGGER "custom_record_rule_topology_guard!i" BEFORE INSERT ON custom.record FOR EACH ROW EXECUTE FUNCTION custom._rule_topology_guard();
CREATE OR REPLACE TRIGGER "custom_record_rule_topology_guard" BEFORE UPDATE ON custom.record FOR EACH ROW WHEN (new.data_class IS DISTINCT FROM 'record'::text OR old.data_class IS DISTINCT FROM new.data_class OR old.data IS DISTINCT FROM new.data OR old.table_id IS DISTINCT FROM new.table_id OR old.organization_id IS DISTINCT FROM new.organization_id OR old.metadata IS DISTINCT FROM new.metadata OR old.custom_fields IS DISTINCT FROM new.custom_fields OR old.visibility IS DISTINCT FROM new.visibility) EXECUTE FUNCTION custom._rule_topology_guard();

-- custom_record_rule_uses
CREATE OR REPLACE TRIGGER "custom_record_rule_uses!i" BEFORE INSERT ON custom.record FOR EACH ROW EXECUTE FUNCTION custom._record_rule_uses();
CREATE OR REPLACE TRIGGER "custom_record_rule_uses" BEFORE UPDATE ON custom.record FOR EACH ROW WHEN (new.data_class IS DISTINCT FROM 'record'::text OR old.data_class IS DISTINCT FROM new.data_class OR old.data IS DISTINCT FROM new.data OR old.table_id IS DISTINCT FROM new.table_id OR old.organization_id IS DISTINCT FROM new.organization_id OR old.metadata IS DISTINCT FROM new.metadata OR old.custom_fields IS DISTINCT FROM new.custom_fields OR old.visibility IS DISTINCT FROM new.visibility) EXECUTE FUNCTION custom._record_rule_uses();

-- custom_record_table_shape_guard
CREATE OR REPLACE TRIGGER "custom_record_table_shape_guard!i" BEFORE INSERT ON custom.record FOR EACH ROW EXECUTE FUNCTION custom._table_shape_guard();
CREATE OR REPLACE TRIGGER "custom_record_table_shape_guard" BEFORE UPDATE ON custom.record FOR EACH ROW WHEN (new.data_class IS DISTINCT FROM 'record'::text OR old.data_class IS DISTINCT FROM new.data_class OR old.data IS DISTINCT FROM new.data OR old.table_id IS DISTINCT FROM new.table_id OR old.organization_id IS DISTINCT FROM new.organization_id OR old.metadata IS DISTINCT FROM new.metadata OR old.custom_fields IS DISTINCT FROM new.custom_fields OR old.visibility IS DISTINCT FROM new.visibility) EXECUTE FUNCTION custom._table_shape_guard();

