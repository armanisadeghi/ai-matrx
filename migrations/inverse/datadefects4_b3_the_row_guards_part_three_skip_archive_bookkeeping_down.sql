-- chair-step: puts the 7 guard triggers back as the single BEFORE INSERT OR UPDATE triggers they were before datadefects4_b3_the_row_guards_part_three_skip_archive_bookkeeping.sql.
-- lane: DATA-DEFECTS-4
-- window-class: CREATE OR REPLACE TRIGGER / DROP TRIGGER on the partitioned custom.record (writers wait until COMMIT); the inverse of a brief-lock file, run by the owning session only
-- lock: custom,platform

DROP TRIGGER IF EXISTS "custom_record_zz_derived_fields!i" ON custom.record;
CREATE OR REPLACE TRIGGER custom_record_zz_derived_fields BEFORE INSERT OR UPDATE ON custom.record FOR EACH ROW EXECUTE FUNCTION custom._derived_fields();

DROP TRIGGER IF EXISTS "zz_promoted_field_cap!i" ON custom.record;
CREATE OR REPLACE TRIGGER zz_promoted_field_cap BEFORE INSERT OR UPDATE ON custom.record FOR EACH ROW EXECUTE FUNCTION custom._promoted_field_cap_guard();

DROP TRIGGER IF EXISTS "zz_w3_work_shape_guard!i" ON custom.record;
CREATE OR REPLACE TRIGGER zz_w3_work_shape_guard BEFORE INSERT OR UPDATE ON custom.record FOR EACH ROW EXECUTE FUNCTION custom._work_shape_guard();

DROP TRIGGER IF EXISTS "zzzz_a_undeclared_key_guard!i" ON custom.record;
CREATE OR REPLACE TRIGGER zzzz_a_undeclared_key_guard BEFORE INSERT OR UPDATE ON custom.record FOR EACH ROW EXECUTE FUNCTION custom._undeclared_key_guard();

DROP TRIGGER IF EXISTS "zzzz_unique_rule_holds!i" ON custom.record;
CREATE OR REPLACE TRIGGER zzzz_unique_rule_holds BEFORE INSERT OR UPDATE ON custom.record FOR EACH ROW EXECUTE FUNCTION custom._unique_rule_holds();

DROP TRIGGER IF EXISTS "_value_envelope!i" ON custom.record;
CREATE OR REPLACE TRIGGER _value_envelope BEFORE INSERT OR UPDATE ON custom.record FOR EACH ROW EXECUTE FUNCTION custom._value_envelope();

DROP TRIGGER IF EXISTS "custom_record_field_type_converts_values!i" ON custom.record;
CREATE OR REPLACE TRIGGER custom_record_field_type_converts_values AFTER UPDATE ON custom.record FOR EACH ROW EXECUTE FUNCTION custom._field_type_converts_values();

