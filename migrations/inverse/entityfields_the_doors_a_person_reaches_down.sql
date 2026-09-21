-- ENTITY-FIELDS 3 — INVERSE. Drops exactly the eight new functions and the ten declaration
-- rows this lane added, and nothing else. No column, no value and no Field record is touched:
-- a Field a person declared on a standard table stays in `custom.record` and the values stay
-- in each row's `custom_fields`. What goes away is the only way to reach them.
DROP FUNCTION IF EXISTS custom.entity_records_find(uuid, text, text, jsonb, integer, integer);
DROP FUNCTION IF EXISTS custom.entity_value_write(uuid, text, uuid, jsonb);
DROP FUNCTION IF EXISTS custom.entity_record_read(uuid, text, uuid);
DROP FUNCTION IF EXISTS custom.entity_field_retire(uuid, uuid);
DROP FUNCTION IF EXISTS custom.entity_field_update(uuid, uuid, jsonb);
-- 🚨 `custom.entity_field_declare` STAYS STANDING (lane INVERSE-GUARD, 2026-09-21). The
-- class guard `custom_record_field_shape_guard_class` on `custom.record` — created by
-- `apprvtail_a_field_row_is_a_field.sql`, well after this lane — reaches it through
-- `custom._field_class_guard`, so dropping it left a live trigger over a function that was
-- gone and every write to the record store died before the red twin asked anything. The
-- DOOR is what this lane added and the door is what goes: the DELETE below takes every
-- `platform.client_callable_door` row this lane declared, `entity_field_declare` among them,
-- so no client can reach it any more. That is the defect — the only way IN is gone — with the
-- ground under `apprvtail`'s guard left standing.
DROP FUNCTION IF EXISTS custom.entity_fields(uuid, text);
DROP FUNCTION IF EXISTS custom.assert_entity_is_organization_scoped(text, text, boolean);
-- 🚨 `custom.entity_table` STAYS STANDING for the same reason: the same class guard reaches it
-- through `custom._field_class_guard` to answer "which table does this token mean". It is a
-- pure resolver over `platform.entity_types` and resolves nothing this lane added once the
-- door rows below are gone.
DELETE FROM platform.client_callable_door
 WHERE declared_by = 'migrations/campaign/entityfields_the_doors_a_person_reaches.sql';
