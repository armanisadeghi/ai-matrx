-- chair-step: puts the 7 guard triggers back as the single BEFORE INSERT OR UPDATE triggers they were before datadefects4_b1_the_row_guards_part_one_skip_archive_bookkeeping.sql.
-- lane: DATA-DEFECTS-4
-- window-class: CREATE OR REPLACE TRIGGER / DROP TRIGGER on the partitioned custom.record (writers wait until COMMIT); the inverse of a brief-lock file, run by the owning session only
-- lock: custom,platform

DROP TRIGGER IF EXISTS "custom_record_choice_words!i" ON custom.record;
CREATE OR REPLACE TRIGGER custom_record_choice_words BEFORE INSERT OR UPDATE ON custom.record FOR EACH ROW EXECUTE FUNCTION custom._resolve_choice_words();

DROP TRIGGER IF EXISTS "custom_record_containment_guard!i" ON custom.record;
CREATE OR REPLACE TRIGGER custom_record_containment_guard BEFORE INSERT OR UPDATE ON custom.record FOR EACH ROW EXECUTE FUNCTION custom._containment_guard();

DROP TRIGGER IF EXISTS "custom_record_dated_values_guard!i" ON custom.record;
CREATE OR REPLACE TRIGGER custom_record_dated_values_guard BEFORE INSERT OR UPDATE ON custom.record FOR EACH ROW EXECUTE FUNCTION custom._dated_values_guard();

DROP TRIGGER IF EXISTS "custom_record_field_shape_guard!i" ON custom.record;
CREATE OR REPLACE TRIGGER custom_record_field_shape_guard BEFORE INSERT OR UPDATE ON custom.record FOR EACH ROW EXECUTE FUNCTION custom._field_shape_guard();

DROP TRIGGER IF EXISTS "custom_record_field_shape_guard_class!i" ON custom.record;
CREATE OR REPLACE TRIGGER custom_record_field_shape_guard_class BEFORE INSERT OR UPDATE ON custom.record FOR EACH ROW EXECUTE FUNCTION custom._field_class_guard();

DROP TRIGGER IF EXISTS "custom_record_field_type_parity_guard!i" ON custom.record;
CREATE OR REPLACE TRIGGER custom_record_field_type_parity_guard BEFORE INSERT OR UPDATE ON custom.record FOR EACH ROW EXECUTE FUNCTION custom._field_type_parity_guard();

DROP TRIGGER IF EXISTS "custom_record_field_validation!i" ON custom.record;
CREATE OR REPLACE TRIGGER custom_record_field_validation BEFORE INSERT OR UPDATE ON custom.record FOR EACH ROW EXECUTE FUNCTION custom._record_field_validation();

