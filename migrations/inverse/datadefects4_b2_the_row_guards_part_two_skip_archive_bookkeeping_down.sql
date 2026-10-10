-- chair-step: puts the 7 guard triggers back as the single BEFORE INSERT OR UPDATE triggers they were before datadefects4_b2_the_row_guards_part_two_skip_archive_bookkeeping.sql.
-- lane: DATA-DEFECTS-4
-- lock: custom,platform

DROP TRIGGER IF EXISTS "custom_record_merge_field_shape_guard!i" ON custom.record;
CREATE OR REPLACE TRIGGER custom_record_merge_field_shape_guard BEFORE INSERT OR UPDATE ON custom.record FOR EACH ROW EXECUTE FUNCTION custom._merge_field_shape_guard();

DROP TRIGGER IF EXISTS "custom_record_merge_field_temporal_guard!i" ON custom.record;
CREATE OR REPLACE TRIGGER custom_record_merge_field_temporal_guard BEFORE INSERT OR UPDATE ON custom.record FOR EACH ROW EXECUTE FUNCTION custom._merge_field_temporal_guard();

DROP TRIGGER IF EXISTS "custom_record_organization_wall!i" ON custom.record;
CREATE OR REPLACE TRIGGER custom_record_organization_wall BEFORE INSERT OR UPDATE ON custom.record FOR EACH ROW EXECUTE FUNCTION custom._organization_wall_guard();

DROP TRIGGER IF EXISTS "custom_record_rule_shape_guard!i" ON custom.record;
CREATE OR REPLACE TRIGGER custom_record_rule_shape_guard BEFORE INSERT OR UPDATE ON custom.record FOR EACH ROW EXECUTE FUNCTION custom._rule_shape_guard();

DROP TRIGGER IF EXISTS "custom_record_rule_topology_guard!i" ON custom.record;
CREATE OR REPLACE TRIGGER custom_record_rule_topology_guard BEFORE INSERT OR UPDATE ON custom.record FOR EACH ROW EXECUTE FUNCTION custom._rule_topology_guard();

DROP TRIGGER IF EXISTS "custom_record_rule_uses!i" ON custom.record;
CREATE OR REPLACE TRIGGER custom_record_rule_uses BEFORE INSERT OR UPDATE ON custom.record FOR EACH ROW EXECUTE FUNCTION custom._record_rule_uses();

DROP TRIGGER IF EXISTS "custom_record_table_shape_guard!i" ON custom.record;
CREATE OR REPLACE TRIGGER custom_record_table_shape_guard BEFORE INSERT OR UPDATE ON custom.record FOR EACH ROW EXECUTE FUNCTION custom._table_shape_guard();

